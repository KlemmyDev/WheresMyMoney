/**
 * The retirement estimate's assumptions and each super fund's details, for Settings → Retirement: returns before
 * fees, inflation, the tax on contributions and the age to plan to; and for each fund, its fees (admin fees, fees on
 * the balance, insurance) and how its balance is invested (options with their own returns and fees), as the fund's
 * statement shows them. Percentages are typed as percentages and kept as fractions.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { ChoiceChip } from "~/features/common/ds";
import { money } from "~/features/common/format";
import {
  investmentsQuery,
  refresh,
  retirementQuery,
  type RetirementSettings,
  type SuperAccount,
} from "~/features/common/queries";
import { Button, ErrorText, Input, Tile, TileTitle } from "~/features/common/ui";
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
        <FundTile key={`${p.id}:${JSON.stringify([p.fees, p.options])}`} p={p} s={q.data.settings} />
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

type FeeRow = { name: string; kind: "pct" | "fixed"; text: string };
type OptionRow = { name: string; share: string; ret: string; fee: string };

function FundTile({ p, s }: { p: SuperAccount; s: RetirementSettings }) {
  const qc = useQueryClient();
  const [fees, setFees] = useState<FeeRow[]>(() =>
    p.fees.map((f) => ({
      name: f.name,
      kind: f.kind,
      text: f.kind === "pct" ? toPct(f.amount) : (f.amount / 100).toFixed(2).replace(/\.00$/, ""),
    })),
  );
  const [options, setOptions] = useState<OptionRow[]>(() =>
    p.options.map((o) => ({ name: o.name, share: toPct(o.share), ret: toPct(o.return_pct), fee: toPct(o.fee_pct) })),
  );
  const parsedFees: Fee[] = fees.map((f) => ({
    name: f.name,
    kind: f.kind,
    amount: f.kind === "pct" ? (fromPct(f.text) ?? 0) : Math.round(Number(f.text || 0) * 100),
  }));
  const parsedOptions: Option[] = options.map((o) => ({
    name: o.name,
    share: fromPct(o.share) ?? 0,
    return_pct: fromPct(o.ret),
    fee_pct: fromPct(o.fee) ?? 0,
  }));
  const shares = parsedOptions.reduce((a, o) => a + o.share, 0);
  const sharesOk = !options.length || Math.abs(shares - 1) < 0.005;
  const t = fundTerms({ fees: parsedFees, options: parsedOptions }, assumptionsOf(s));
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

      <div className="flex flex-col gap-2">
        <div className="eyebrow">Fees</div>
        {fees.map((f, i) => (
          <div
            key={i}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_120px_auto]"
          >
            <Input
              aria-label={`Fee ${i + 1} name`}
              value={f.name}
              onChange={(e) => setFees((r) => r.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
            />
            <div
              className="flex gap-1.5 max-sm:order-3 max-sm:col-span-2"
              role="group"
              aria-label={`Fee ${i + 1} kind`}
            >
              <ChoiceChip
                pressed={f.kind === "fixed"}
                onClick={() => setFees((r) => r.map((x, j) => (j === i ? { ...x, kind: "fixed", text: "" } : x)))}
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
            <span className="relative max-sm:order-2">
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
              className="flex size-9 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-ink-3 hover:text-bad max-sm:hidden"
            >
              ✕
            </button>
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
                onClick={() => setFees((r) => [...r, { name: n, kind: k as "pct" | "fixed", text: "" }])}
              >
                + {n}
              </Button>
            ))}
          <Button small type="button" onClick={() => setFees((r) => [...r, { name: "", kind: "fixed", text: "" }])}>
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
