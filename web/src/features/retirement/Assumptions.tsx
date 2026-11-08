/**
 * The retirement estimate's assumptions and each super fund's details, for Settings → Retirement: returns before
 * fees, inflation, the tax on contributions and the age to plan to; and for each fund, its fees (admin fees, fees on
 * the balance, insurance) and how its balance is invested (options with their own returns and fees), as the fund's
 * statement shows them. Percentages are typed as percentages and kept as fractions.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiSend, apiUpload, errorMessage } from "~/features/common/api";
import { ChoiceChip } from "~/features/common/ds";
import { longDate, money } from "~/features/common/format";
import {
  investmentsQuery,
  type KnownFund,
  refresh,
  retirementQuery,
  type RetirementSettings,
  type SuperAccount,
} from "~/features/common/queries";
import { Button, ErrorText, Input, Switch, Tile, TileTitle } from "~/features/common/ui";
import { fundTerms, type Assumptions, type Fee, type Option } from "~/features/retirement/model";

/** 0.0725 → "7.25"; and back. */
const toPct = (f: number | null | undefined) => (f == null ? "" : String(Math.round(f * 100000) / 1000));
const fromPct = (t: string) => (t.trim() === "" ? null : Number(t) / 100);
const pctText = (f: number, dp = 2) => `${(f * 100).toFixed(dp).replace(/\.?0+$/, "")}%`;

export function assumptionsOf(s: RetirementSettings, etfFee = s.etf_fee): Assumptions {
  return {
    superReturn: s.super_return,
    etfReturn: s.etf_return,
    etfFee,
    inflation: s.inflation,
    contribTax: s.contrib_tax,
  };
}

/** The ETFs' management fee: each fund's own, weighted by what's held, where given; the assumption otherwise. */
export function etfFeeOf(funds: { value: number; fee_pct: number | null }[] | undefined, fallback: number) {
  const known = (funds ?? []).filter((f) => f.fee_pct != null && f.value > 0);
  const total = known.reduce((s, f) => s + f.value, 0);
  return total ? known.reduce((s, f) => s + f.value * (f.fee_pct as number), 0) / total : fallback;
}

function PctField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="eyebrow">{label}</span>
      <span className="relative">
        <Input
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^0-9.-]/g, ""))}
          className="pr-8"
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-ink-3">%</span>
      </span>
      {hint && <span className="text-[12px] text-ink-3">{hint}</span>}
    </label>
  );
}

export function RetirementSettingsPanel() {
  const q = useQuery(retirementQuery);
  const inv = useQuery(investmentsQuery);
  if (q.isError) return <ErrorText>{errorMessage(q.error)}</ErrorText>;
  if (!q.data) return <div className="h-40" aria-busy />;
  return (
    <>
      <AssumptionsTile key={JSON.stringify(q.data.settings)} s={q.data.settings} funds={inv.data?.funds} />
      {q.data.people.map((p) => (
        <FundTile
          key={`${p.id}:${JSON.stringify([p.fees, p.options])}`}
          p={p}
          s={q.data.settings}
          fund={q.data.funds.find((f) => f.key === p.known_fund)}
        />
      ))}
      {q.data.people.length === 0 && (
        <Tile>
          <p className="m-0 text-[14px] text-ink-3">
            Add each person's super on the Retirement page, then their fund's fees and investment options go here.
          </p>
        </Tile>
      )}
    </>
  );
}

function AssumptionsTile({
  s,
  funds,
}: {
  s: RetirementSettings;
  funds: { ticker: string; value: number; fee_pct: number | null }[] | undefined;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    super_return: toPct(s.super_return),
    etf_return: toPct(s.etf_return),
    etf_fee: toPct(s.etf_fee),
    inflation: toPct(s.inflation),
    contrib_tax: toPct(s.contrib_tax),
    plan_to: String(s.plan_to),
  });
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const save = useMutation({
    mutationFn: () =>
      apiSend("PUT", "retirement/settings", {
        super_return: fromPct(form.super_return),
        etf_return: fromPct(form.etf_return),
        etf_fee: fromPct(form.etf_fee),
        inflation: fromPct(form.inflation),
        contrib_tax: fromPct(form.contrib_tax),
        plan_to: Number(form.plan_to),
      }),
    onSuccess: () => refresh(qc),
  });
  const own = (funds ?? []).filter((f) => f.fee_pct != null);
  const etfFee = etfFeeOf(funds, fromPct(form.etf_fee) ?? 0);
  const etfReal = (1 + (fromPct(form.etf_return) ?? 0) - etfFee) / (1 + (fromPct(form.inflation) ?? 0)) - 1;
  const dirty =
    JSON.stringify(form) !==
    JSON.stringify({
      super_return: toPct(s.super_return),
      etf_return: toPct(s.etf_return),
      etf_fee: toPct(s.etf_fee),
      inflation: toPct(s.inflation),
      contrib_tax: toPct(s.contrib_tax),
      plan_to: String(s.plan_to),
    });
  return (
    <Tile aria-labelledby="ra-h">
      <TileTitle id="ra-h">Retirement assumptions</TileTitle>
      <p className="m-0 text-[13px] text-ink-3">
        A year, before fees. Each fund's own fees and options below take the place of these where you give them. The
        estimate takes inflation out, so it's all in today's dollars.
      </p>
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <PctField
            label="Super returns"
            hint="Before fees, for a fund with no options given"
            value={form.super_return}
            onChange={set("super_return")}
          />
          <PctField label="ETF returns" hint="Before fees" value={form.etf_return} onChange={set("etf_return")} />
          <PctField
            label="ETF fees"
            hint={
              own.length
                ? `Each ETF's own fee is used: ${pctText(etfFee)} across what you hold`
                : "Management fees, if a fund has none of its own"
            }
            value={form.etf_fee}
            onChange={set("etf_fee")}
          />
          <PctField
            label="Inflation"
            hint="Prices, and salaries with them"
            value={form.inflation}
            onChange={set("inflation")}
          />
          <PctField
            label="Tax on contributions"
            hint="15% for most people"
            value={form.contrib_tax}
            onChange={set("contrib_tax")}
          />
          <label className="flex flex-col gap-1.5">
            <span className="eyebrow">Plan to age</span>
            <Input
              inputMode="numeric"
              value={form.plan_to}
              onChange={(e) => set("plan_to")(e.target.value.replace(/\D/g, ""))}
            />
            <span className="text-[12px] text-ink-3">How long the money should last</span>
          </label>
        </div>
        <p className="m-0 text-[13px] text-ink-2">
          ETFs grow about <b>{pctText(etfReal, 1)}</b> a year after fees and inflation.
        </p>
        {save.isError && <ErrorText>{errorMessage(save.error)}</ErrorText>}
        <div className="flex justify-end">
          <Button primary type="submit" disabled={!dirty || save.isPending}>
            {save.isPending ? "Saving…" : save.isSuccess && !dirty ? "Saved" : "Save"}
          </Button>
        </div>
      </form>
    </Tile>
  );
}

type FeeRow = { name: string; kind: "pct" | "fixed"; text: string; cap: string };

const dollarsText = (cents: number) => (cents / 100).toFixed(2).replace(/\.00$/, "");
const feeRow = (f: Fee): FeeRow => ({
  name: f.name,
  kind: f.kind,
  text: f.kind === "pct" ? toPct(f.amount) : dollarsText(f.amount),
  cap: f.kind === "pct" && f.cap ? dollarsText(f.cap) : "",
});
/** "0.1% on the first $500,000", "$57.20/yr". */
const feeText = (f: Fee) =>
  f.kind === "pct" ? `${pctText(f.amount)}${f.cap ? ` on the first ${money(f.cap)}` : ""}` : `${money(f.amount)}/yr`;
const words = (s: string) => [...new Set(s.toLowerCase().match(/[a-z]+/g) ?? [])].sort().join(" ");
/** An investment option's fee at a known fund, matched by its name's words in any order. */
const optionFee = (fund: KnownFund, name: string) =>
  Object.entries(fund.options).find(([n]) => words(n) === words(name))?.[1];
/** A known fund's fees, keeping any it doesn't publish (insurance). */
const publishedFees = (fund: KnownFund, keep: Fee[]): Fee[] => [
  ...fund.fees,
  ...keep.filter(
    (f) =>
      !fund.fees.some((k) => k.name === f.name) && !/admin|investment|reserves|transaction|^other fees$/i.test(f.name),
  ),
];
type OptionRow = { name: string; share: string; ret: string; fee: string };

function FundTile({ p, s, fund }: { p: SuperAccount; s: RetirementSettings; fund?: KnownFund }) {
  const qc = useQueryClient();
  const [fees, setFees] = useState<FeeRow[]>(() => p.fees.map(feeRow));
  const [options, setOptions] = useState<OptionRow[]>(() =>
    p.options.map((o) => ({ name: o.name, share: toPct(o.share), ret: toPct(o.return_pct), fee: toPct(o.fee_pct) })),
  );
  const parsedFees: Fee[] = fees.map((f) => ({
    name: f.name,
    kind: f.kind,
    amount: f.kind === "pct" ? (fromPct(f.text) ?? 0) : Math.round(Number(f.text || 0) * 100),
    ...(f.kind === "pct" && Number(f.cap) > 0 ? { cap: Math.round(Number(f.cap) * 100) } : {}),
  }));
  const parsedOptions: Option[] = options.map((o) => ({
    name: o.name,
    share: fromPct(o.share) ?? 0,
    return_pct: fromPct(o.ret),
    fee_pct: fromPct(o.fee) ?? 0,
  }));
  const shares = parsedOptions.reduce((a, o) => a + o.share, 0);
  const sharesOk = !options.length || Math.abs(shares - 1) < 0.005;
  const t = fundTerms({ fees: parsedFees, options: parsedOptions }, assumptionsOf(s), p.balance);
  const feeDollars = Math.round(t.pct * p.balance + t.fixed);
  const save = useMutation({
    mutationFn: () => apiSend("PUT", `retirement/people/${p.id}`, { fees: parsedFees, options: parsedOptions }),
    onSuccess: () => refresh(qc),
  });
  return (
    <Tile aria-labelledby={`rf-${p.id}`}>
      <TileTitle id={`rf-${p.id}`}>
        {p.person}'s super{p.fund ? ` · ${p.fund}` : ""}
      </TileTitle>
      <p className="m-0 text-[13px] text-ink-3">
        As the fund's statement or its fees page shows them. On {money(p.balance)} that's about{" "}
        <b className="text-ink">{money(feeDollars)}</b> a year in fees ({pctText(feeDollars / (p.balance || 1))} of the
        balance).
      </p>
      <StatementReader p={p} />
      {fund && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-sunken p-3.5">
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold">{fund.name}'s published fees</span>
            <span className="block text-[12px] text-ink-3">
              {fund.fees.map((f) => `${f.name} ${feeText(f)}`).join(" · ")}, and each option's own.{" "}
              <a href={fund.source} target="_blank" rel="noreferrer" className="text-teal no-underline">
                Fees page
              </a>
              , checked {longDate(fund.checked)}. Insurance is kept.
            </span>
          </span>
          <Button
            small
            type="button"
            onClick={() => {
              setFees(publishedFees(fund, parsedFees).map(feeRow));
              setOptions((r) =>
                r.map((o) => {
                  const fee = optionFee(fund, o.name);
                  return fee == null ? o : { ...o, fee: toPct(fee) };
                }),
              );
            }}
          >
            Use these
          </Button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <div className="eyebrow">Fees</div>
        {fees.map((f, i) => (
          <div
            key={i}
            className="flex flex-col gap-2 border-t border-line pt-2 first:border-t-0 first:pt-0 sm:border-0 sm:pt-0"
          >
            <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
              <Input
                aria-label={`Fee ${i + 1} name`}
                value={f.name}
                className="order-1 min-w-0 flex-[1_1_0]"
                onChange={(e) => setFees((r) => r.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              />
              {/* On a phone: the name and remove on one line, the kind and amount on the next. */}
              <span aria-hidden className="order-3 basis-full sm:hidden" />
              <div className="order-4 flex flex-none gap-1.5 sm:order-2" role="group" aria-label={`Fee ${i + 1} kind`}>
                <ChoiceChip
                  pressed={f.kind === "fixed"}
                  onClick={() =>
                    setFees((r) => r.map((x, j) => (j === i ? { ...x, kind: "fixed", text: "", cap: "" } : x)))
                  }
                >
                  $ a year
                </ChoiceChip>
                <ChoiceChip
                  pressed={f.kind === "pct"}
                  onClick={() => setFees((r) => r.map((x, j) => (j === i ? { ...x, kind: "pct", text: "" } : x)))}
                >
                  % of balance
                </ChoiceChip>
              </div>
              <span className="relative order-5 min-w-[90px] flex-1 sm:order-3 sm:w-[120px] sm:flex-none">
                <Input
                  aria-label={`Fee ${i + 1} amount`}
                  inputMode="decimal"
                  value={f.text}
                  className={f.kind === "pct" ? "pr-8" : "pl-6"}
                  onChange={(e) =>
                    setFees((r) =>
                      r.map((x, j) => (j === i ? { ...x, text: e.target.value.replace(/[^0-9.]/g, "") } : x)),
                    )
                  }
                />
                <span
                  className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-3 ${f.kind === "pct" ? "right-3" : "left-3"}`}
                >
                  {f.kind === "pct" ? "%" : "$"}
                </span>
              </span>
              <button
                type="button"
                aria-label={`Remove ${f.name || `fee ${i + 1}`}`}
                onClick={() => setFees((r) => r.filter((_, j) => j !== i))}
                className="order-2 flex size-9 flex-none cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-ink-3 hover:text-bad sm:order-4"
              >
                ✕
              </button>
            </div>
            {/* A fee on the balance can stop at a cap, like 0.10% on the first $500,000. */}
            {f.kind === "pct" && (
              <label className="flex items-center gap-2 text-[13px] text-ink-3 sm:justify-end sm:pr-11">
                Only on the first
                <span className="relative w-[140px]">
                  <Input
                    aria-label={`${f.name || `Fee ${i + 1}`}: only on the first dollars of the balance`}
                    inputMode="decimal"
                    value={f.cap}
                    placeholder="All of it"
                    className="pl-6"
                    onChange={(e) =>
                      setFees((r) =>
                        r.map((x, j) => (j === i ? { ...x, cap: e.target.value.replace(/[^0-9.]/g, "") } : x)),
                      )
                    }
                  />
                  <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3">$</span>
                </span>
              </label>
            )}
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          {[
            ["Admin fee", "fixed"],
            ["Admin fee (on the balance)", "pct"],
            ["Investment fee", "pct"],
            ["Insurance", "fixed"],
          ]
            .filter(([n]) => !fees.some((f) => f.name === n))
            .map(([n, k]) => (
              <Button
                key={n}
                small
                type="button"
                onClick={() => setFees((r) => [...r, { name: n, kind: k as "pct" | "fixed", text: "", cap: "" }])}
              >
                + {n}
              </Button>
            ))}
          <Button
            small
            type="button"
            onClick={() => setFees((r) => [...r, { name: "", kind: "fixed", text: "", cap: "" }])}
          >
            + Another fee
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="eyebrow">How it's invested</div>
        {options.length === 0 && (
          <p className="m-0 text-[13px] text-ink-3">
            Not given: it grows at your super returns assumption ({pctText(s.super_return)}). Add the investment options
            if the balance is split, like 70% High Growth and 30% Balanced.
          </p>
        )}
        {options.map((o, i) => (
          <div key={i} className="grid grid-cols-3 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_90px_110px_110px_auto]">
            <label className="col-span-3 flex flex-col gap-1 sm:col-span-1">
              <span className="text-[12px] text-ink-3">Option</span>
              <Input
                value={o.name}
                placeholder="High Growth"
                onChange={(e) => setOptions((r) => r.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              />
            </label>
            {(
              [
                ["share", "Share %"],
                ["ret", "Return %"],
                ["fee", "Inv. fee %"],
              ] as const
            ).map(([k, l]) => (
              <label key={k} className="flex flex-col gap-1">
                <span className="text-[12px] text-ink-3">{l}</span>
                <Input
                  inputMode="decimal"
                  value={o[k]}
                  placeholder={k === "ret" ? toPct(s.super_return) : k === "fee" ? "0" : ""}
                  onChange={(e) =>
                    setOptions((r) =>
                      r.map((x, j) => (j === i ? { ...x, [k]: e.target.value.replace(/[^0-9.-]/g, "") } : x)),
                    )
                  }
                />
              </label>
            ))}
            <button
              type="button"
              aria-label={`Remove ${o.name || `option ${i + 1}`}`}
              onClick={() => setOptions((r) => r.filter((_, j) => j !== i))}
              className="flex size-10 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-ink-3 hover:text-bad max-sm:col-span-3 max-sm:justify-self-end"
            >
              ✕
            </button>
          </div>
        ))}
        <div className="flex items-center justify-between gap-2">
          <Button
            small
            type="button"
            onClick={() =>
              setOptions((r) => [
                ...r,
                { name: "", share: r.length ? toPct(Math.max(0, 1 - shares)) : "100", ret: "", fee: "" },
              ])
            }
          >
            + Investment option
          </Button>
          {options.length > 0 && (
            <span className={`text-[13px] font-semibold ${sharesOk ? "text-savings" : "text-bills"}`}>
              {sharesOk ? "Adds up to 100%" : `${pctText(shares, 1)} of 100%`}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 rounded-2xl bg-sunken p-3.5 text-[13px] sm:grid-cols-4">
        <span>
          <span className="block text-ink-3">Return before fees</span>
          <span className="num block text-[16px]">{pctText(t.ret)}</span>
        </span>
        <span>
          <span className="block text-ink-3">Fees on the balance</span>
          <span className="num block text-[16px]">{pctText(t.pct)}</span>
        </span>
        <span>
          <span className="block text-ink-3">Dollar fees</span>
          <span className="num block text-[16px]">{money(t.fixed)}/yr</span>
        </span>
        <span>
          <span className="block text-ink-3">After fees and inflation</span>
          <span className="num block text-[16px]">{pctText(t.real, 1)}</span>
        </span>
      </div>
      {save.isError && <ErrorText>{errorMessage(save.error)}</ErrorText>}
      <div className="flex justify-end">
        <Button primary disabled={!sharesOk || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : `Save ${p.person}'s fund`}
        </Button>
      </div>
    </Tile>
  );
}

type Found = {
  balance: number | null;
  as_of: string | null;
  period: [string, string] | null;
  fees: Fee[];
  options: Option[];
  notes: string[];
  /** The known fund whose published fees these are, if any. */
  fund: string | null;
};

/** Read the fund's statement (a PDF, read on the server) and choose which of what it found to keep. */
function StatementReader({ p }: { p: SuperAccount }) {
  const qc = useQueryClient();
  const [found, setFound] = useState<Found | null>(null);
  const [use, setUse] = useState({ balance: true, fees: true, options: true });
  const read = useMutation({
    mutationFn: (f: File) => apiUpload<Found>(`retirement/people/${p.id}/statement`, f),
    onSuccess: (r) => {
      setFound(r);
      setUse({ balance: r.balance != null, fees: r.fees.length > 0, options: r.options.length > 0 });
    },
  });
  const save = useMutation({
    mutationFn: () =>
      apiSend("PUT", `retirement/people/${p.id}`, {
        ...(use.balance && found?.balance != null ? { balance: found.balance, as_of: found.as_of } : {}),
        ...(use.fees ? { fees: found!.fees } : {}),
        ...(use.options ? { options: found!.options } : {}),
      }),
    onSuccess: () => {
      setFound(null);
      refresh(qc);
    },
  });
  const nothing = found && found.balance == null && !found.fees.length && !found.options.length;
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-dashed border-line-2 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="min-w-0">
          <span className="block text-[14px] font-semibold">Read a statement</span>
          <span className="block text-[12px] text-ink-3">
            The PDF your fund sends. It's read here, on your server, and you check what's found first.
          </span>
        </span>
        <label className="press inline-flex min-h-[34px] cursor-pointer items-center rounded-[10px] px-3 text-[13px] font-medium text-ink shadow-[inset_0_0_0_1px_var(--color-line-2)]">
          {read.isPending ? "Reading…" : "Choose PDF"}
          <input
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) read.mutate(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {read.isError && <ErrorText>{errorMessage(read.error)}</ErrorText>}
      {nothing && (
        <p className="m-0 text-[13px] text-bills">
          Nothing could be picked out of that statement. Type the figures in below.
        </p>
      )}
      {found && !nothing && (
        <div className="flex flex-col gap-2">
          {found.period && (
            <p className="m-0 text-[12px] text-ink-3">
              Statement for {longDate(found.period[0])} to {longDate(found.period[1])}
            </p>
          )}
          {found.balance != null && (
            <label className="flex items-center gap-3 rounded-xl bg-sunken p-3">
              <span className="min-w-0 flex-1 text-[14px]">
                Balance <b className="num">{money(found.balance, { cents: true })}</b>
                {found.as_of ? ` at ${longDate(found.as_of)}` : ""}
                <span className="block text-[12px] text-ink-3">Now {money(p.balance)}</span>
              </span>
              <Switch
                checked={use.balance}
                onChange={(v) => setUse((u) => ({ ...u, balance: v }))}
                label="Use the balance"
              />
            </label>
          )}
          {found.fees.length > 0 && (
            <label className="flex items-center gap-3 rounded-xl bg-sunken p-3">
              <span className="min-w-0 flex-1 text-[14px]">
                Fees, in place of the ones below
                <span className="block text-[12px] text-ink-3">
                  {found.fees.map((f) => `${f.name} ${feeText(f)}`).join(" · ")}
                </span>
              </span>
              <Switch checked={use.fees} onChange={(v) => setUse((u) => ({ ...u, fees: v }))} label="Use the fees" />
            </label>
          )}
          {found.options.length > 0 && (
            <label className="flex items-center gap-3 rounded-xl bg-sunken p-3">
              <span className="min-w-0 flex-1 text-[14px]">
                How it's invested
                <span className="block text-[12px] text-ink-3">
                  {found.options.map((o) => `${o.name} ${pctText(o.share, 1)}`).join(" · ")} (
                  {found.fund ? "add each option's return after" : "add each option's return and fee after"})
                </span>
              </span>
              <Switch
                checked={use.options}
                onChange={(v) => setUse((u) => ({ ...u, options: v }))}
                label="Use the options"
              />
            </label>
          )}
          {found.notes.map((n) => (
            <p key={n} className="m-0 text-[12px] text-ink-3">
              {n}
            </p>
          ))}
          {save.isError && <ErrorText>{errorMessage(save.error)}</ErrorText>}
          <div className="flex justify-end gap-2">
            <Button small onClick={() => setFound(null)}>
              Not these
            </Button>
            <Button
              small
              primary
              disabled={!(use.balance || use.fees || use.options) || save.isPending}
              onClick={() => save.mutate()}
            >
              Use these
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
