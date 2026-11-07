/**
 * The set-up guide (designs: Setup1 to Setup5). No bank login: each account's name and today's balance with a job,
 * the home loan and what offsets it, the bills (which size the bills buffer), pay and the payday rules, and how often
 * to check in. Each step saves as it goes, through the same routes the rest of the app uses.
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState, type CSSProperties } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { CoverageRing } from "~/features/common/charts";
import { EVERY_LABEL, colour, editable, money, parseMoney, pct, ROLE_LABEL, todayIso } from "~/features/common/format";
import { Loading, Logo } from "~/features/common/brand";
import { accountsQuery, billsQuery, refresh } from "~/features/common/queries";
import type { Account, Every, Role } from "~/features/common/types";
import { JobArt, JobPicker, StepFlow, useStep } from "~/features/common/steps";
import { Button, Choice, Dot, ErrorText, Input, Label, Option, Select, Tile, cn } from "~/features/common/ui";

const STEPS = ["Accounts", "Loan", "Bills", "Pay and spending", "Keeping it current"];
const COMMON_BILLS: [string, Every][] = [
  ["Council rates", "quarterly"],
  ["Water", "quarterly"],
  ["Electricity", "quarterly"],
  ["Gas", "quarterly"],
  ["Internet", "monthly"],
  ["Phones", "monthly"],
  ["Health insurance", "monthly"],
  ["Car insurance", "monthly"],
  ["Home insurance", "yearly"],
  ["Car rego", "yearly"],
  ["Car loan", "monthly"],
  ["School fees", "term"],
  ["Childcare", "fortnightly"],
  ["Kids activities", "monthly"],
  ["Streaming", "monthly"],
  ["Gym", "monthly"],
  ["Strata", "quarterly"],
];

export function SetupPage() {
  const flow = useStep(STEPS.length);
  const step = flow.step;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const accounts = useQuery(accountsQuery);
  const next = async (save?: () => Promise<void>) => {
    setError(null);
    setBusy(true);
    try {
      if (save) await save();
      await refresh(qc);
      if (step === STEPS.length - 1) navigate({ to: "/" });
      else flow.next();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const props = {
    accounts: accounts.data?.accounts ?? [],
    loan: accounts.data?.loan ?? null,
    next,
    back: flow.back,
    busy,
  };
  return (
    <div className="mx-auto flex min-h-screen max-w-[1100px] flex-col gap-6 px-4 py-8 sm:px-7">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <span className="flex items-center gap-2.5">
          <Logo />
        </span>
        <ol className="relative m-0 flex list-none flex-wrap gap-4 p-0 text-[13px]" aria-label="Set-up steps">
          {STEPS.map((s, i) => (
            <li
              key={s}
              aria-current={i === step ? "step" : undefined}
              className={cn(
                "flex items-center gap-2 transition-colors duration-[240ms]",
                i === step ? "text-ink" : i < step ? "text-ink-2" : "text-ink-3",
              )}
            >
              <span
                className={cn(
                  "mono flex size-6 items-center justify-center rounded-full border text-xs transition-[background-color,border-color,color,transform] duration-[240ms]",
                  i === step && "scale-110",
                  i < step ? "border-teal bg-teal text-page" : i === step ? "border-teal text-teal" : "border-line",
                )}
              >
                {i < step ? (
                  <svg
                    viewBox="0 0 24 24"
                    width="13"
                    height="13"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    aria-hidden
                  >
                    <path
                      d="M5 12.5l4.5 4.5L19 7.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="draw"
                      style={{ strokeDasharray: 22, ["--len" as string]: 22, animationDuration: "320ms" }}
                    />
                  </svg>
                ) : (
                  i + 1
                )}
              </span>
              {s}
            </li>
          ))}
        </ol>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-line" aria-hidden>
        <div
          className="h-full rounded-full bg-teal transition-[width] duration-[480ms] ease-[var(--ease-move)]"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
        />
      </div>
      {error && <ErrorText>{error}</ErrorText>}
      {/* Each step starts from what's already saved, so wait for it: otherwise the first step would offer the four
          starter accounts again on a reload and add them twice. */}
      {accounts.data ? (
        <StepFlow step={step} dir={flow.dir}>
          {step === 0 && <StepAccounts {...props} />}
          {step === 1 && <StepLoan {...props} />}
          {step === 2 && <StepBills {...props} />}
          {step === 3 && <StepPay {...props} />}
          {step === 4 && <StepCurrent {...props} />}
        </StepFlow>
      ) : accounts.isError ? (
        <ErrorText>{errorMessage(accounts.error)}</ErrorText>
      ) : (
        <Loading label="Loading your accounts" />
      )}
    </div>
  );
}

type StepProps = {
  accounts: Account[];
  loan: Account | null;
  next: (save?: () => Promise<void>) => void;
  back: () => void;
  busy: boolean;
};

function Footer({
  back,
  onNext,
  busy,
  first,
  label = "Continue",
  disabled,
}: {
  back: () => void;
  onNext: () => void;
  busy: boolean;
  first?: boolean;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex justify-between gap-2">
      {first ? <span /> : <Button onClick={back}>Back</Button>}
      <Button primary onClick={onNext} disabled={busy || disabled}>
        {busy ? "Saving…" : label}
      </Button>
    </div>
  );
}

let rowKey = 0;
const nextKey = () => ++rowKey;

function StepAccounts({ accounts, next, back, busy }: StepProps) {
  const [rows, setRows] = useState<{ key: number; name: string; balance: string; role: Role; last4: string }[]>(() =>
    accounts.length
      ? []
      : [
          { key: nextKey(), name: "Offset", balance: "", role: "offset", last4: "" },
          { key: nextKey(), name: "Bills", balance: "", role: "bills", last4: "" },
          { key: nextKey(), name: "Spending", balance: "", role: "spending", last4: "" },
          { key: nextKey(), name: "Savings", balance: "", role: "savings", last4: "" },
        ],
  );
  const total =
    accounts.reduce((s, a) => s + a.balance, 0) + rows.reduce((s, r) => s + (parseMoney(r.balance) ?? 0), 0);
  return (
    <Tile className="gap-4 p-7">
      <div>
        <h1 className="m-0 text-[26px] font-semibold">Add your accounts</h1>
        <p className="mt-1 mb-0 text-ink-2">
          No bank login needed. Type each account's name and today's balance, then pick its job: the job decides what
          target and chart it gets.
        </p>
      </div>
      {accounts.map((a) => (
        <div
          key={a.id}
          className="rise flex items-center gap-3 rounded-xl border border-line bg-page px-4 py-3"
          style={{ boxShadow: `inset 3px 0 0 ${colour(a.role)}` }}
        >
          <JobArt role={a.role} size={32} />
          <b className="min-w-0 flex-1 truncate font-semibold">{a.name}</b>
          <span className="hidden text-[13px] text-ink-3 sm:inline">{ROLE_LABEL[a.role]}</span>
          <span className="mono text-right sm:w-28">{money(a.balance)}</span>
        </div>
      ))}
      <div className="flex flex-col gap-3">
        {rows.map((r, i) => {
          const set = (patch: Partial<(typeof rows)[number]>) =>
            setRows(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));
          return (
            <div
              key={r.key}
              className="rise relative flex flex-col gap-3 rounded-xl border border-line bg-page p-4 transition-[border-color,box-shadow] duration-300"
              style={
                {
                  "--i": i,
                  borderColor: `color-mix(in srgb, ${colour(r.role)} 45%, var(--color-line))`,
                  boxShadow: `inset 3px 0 0 ${colour(r.role)}`,
                } as CSSProperties
              }
            >
              <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 sm:grid-cols-[auto_1fr_110px_170px_auto] sm:items-end">
                <span className="hidden pb-1.5 sm:block">
                  <JobArt key={r.role} role={r.role} draw size={40} />
                </span>
                <div className="col-span-2 sm:col-span-1">
                  <Label htmlFor={`sa-n-${r.key}`}>Name, as in your banking app</Label>
                  <Input
                    id={`sa-n-${r.key}`}
                    className="font-sans"
                    value={r.name}
                    onChange={(e) => set({ name: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor={`sa-l-${r.key}`}>Last four</Label>
                  <Input
                    id={`sa-l-${r.key}`}
                    inputMode="numeric"
                    placeholder="2210"
                    maxLength={4}
                    value={r.last4}
                    onChange={(e) => set({ last4: e.target.value.replace(/\D/g, "") })}
                  />
                </div>
                <div>
                  <Label htmlFor={`sa-b-${r.key}`}>Balance today</Label>
                  <Input
                    id={`sa-b-${r.key}`}
                    inputMode="decimal"
                    placeholder="0.00"
                    value={r.balance}
                    onChange={(e) => set({ balance: e.target.value })}
                  />
                </div>
                {rows.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Remove ${r.name || "this account"}`}
                    onClick={() => setRows(rows.filter((_, j) => j !== i))}
                    className="press absolute top-2 right-2 flex size-8 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-ink-3 hover:bg-raised hover:text-ink sm:static sm:size-[42px]"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      width="14"
                      height="14"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      aria-hidden
                    >
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                )}
              </div>
              <JobPicker
                compact
                label={`${r.name || "This account"}'s job`}
                value={r.role}
                onChange={(role) => set({ role })}
              />
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => setRows([...rows, { key: nextKey(), name: "", balance: "", role: "track", last4: "" }])}
          className="press flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-line bg-transparent text-[13px] font-medium text-ink-2 hover:border-teal hover:text-teal"
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Add another account
        </button>
      </div>
      <div className="flex justify-between text-[13px]">
        <span className="text-ink-3">Use the same names as your banking app so check-ins are quick.</span>
        <span className="mono">Total {money(total)}</span>
      </div>
      <Footer
        first
        back={back}
        busy={busy}
        disabled={!accounts.length && !rows.some((r) => r.name)}
        onNext={() =>
          next(async () => {
            for (const r of rows.filter((x) => x.name))
              await apiSend("POST", "accounts", {
                name: r.name,
                role: r.role,
                last4: r.last4,
                balance: parseMoney(r.balance) ?? 0,
              });
          })
        }
      />
    </Tile>
  );
}

function StepLoan({ accounts, loan, next, back, busy }: StepProps) {
  const [f, setF] = useState({
    balance: editable(loan?.balance),
    rate: loan?.rate_bp ? (loan.rate_bp / 100).toFixed(2) : "",
    repayment: editable(loan?.repayment),
    from: String(loan?.repay_from ?? accounts.find((a) => a.role === "offset")?.id ?? ""),
    goal: loan?.goal_date ?? "",
  });
  const [offsets, setOffsets] = useState<Set<number>>(new Set(accounts.filter((a) => a.offsets_loan).map((a) => a.id)));
  const owed = parseMoney(f.balance) ?? 0;
  const offsetting = accounts.filter((a) => offsets.has(a.id)).reduce((s, a) => s + a.balance, 0);
  const rate = Number(f.rate) || 0;
  return (
    <Tile className="gap-4 p-7">
      <div>
        <h1 className="m-0 text-[26px] font-semibold">Your home loan</h1>
        <p className="mt-1 mb-0 text-ink-2">
          Copy these from your banking app. You'll update the balance now and then, like the others. No loan? Skip this
          step.
        </p>
      </div>
      <div className="flex flex-wrap gap-6">
        <div className="grid min-w-0 flex-[1_1_420px] gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="s-lb">Loan balance</Label>
            <Input
              id="s-lb"
              inputMode="decimal"
              value={f.balance}
              onChange={(e) => setF({ ...f, balance: e.target.value })}
              placeholder="604,820"
            />
          </div>
          <div>
            <Label htmlFor="s-lr">Interest rate (%)</Label>
            <Input
              id="s-lr"
              inputMode="decimal"
              value={f.rate}
              onChange={(e) => setF({ ...f, rate: e.target.value })}
              placeholder="5.84"
            />
          </div>
          <div>
            <Label htmlFor="s-lp">Repayment (monthly)</Label>
            <Input
              id="s-lp"
              inputMode="decimal"
              value={f.repayment}
              onChange={(e) => setF({ ...f, repayment: e.target.value })}
              placeholder="3,770"
            />
          </div>
          <div>
            <Label htmlFor="s-lf">Paid from</Label>
            <Select id="s-lf" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="sm:col-span-2">
            <div className="tt mb-2">Which accounts offset this loan?</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {accounts.map((a) => (
                <Option
                  key={a.id}
                  role="checkbox"
                  on={offsets.has(a.id)}
                  onClick={() => setOffsets((s) => (s.has(a.id) ? (s.delete(a.id), new Set(s)) : new Set(s.add(a.id))))}
                  title={`${a.name} ${money(a.balance)}`}
                />
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="s-lg">Your goal: fully offset by</Label>
            <Input id="s-lg" type="month" value={f.goal} onChange={(e) => setF({ ...f, goal: e.target.value })} />
          </div>
        </div>
        <div className="flex flex-[0_1_280px] flex-col items-center gap-2 rounded-xl bg-page p-4">
          <div className="tt">Preview</div>
          <CoverageRing k="setup" all={owed ? offsetting / owed : 0} offset={0} size={180}>
            <div className="mono text-[30px] leading-none font-semibold">
              {owed ? ((offsetting / owed) * 100).toFixed(1) : "0.0"}
              <span className="text-base">%</span>
            </div>
          </CoverageRing>
          <div className="mono text-[13px]">
            {money(offsetting)} of {money(owed)}
          </div>
          <div className="text-[13px] text-ink-2">
            Saving about {money((Math.min(offsetting, owed) * rate) / 100 / 365, { cents: true })} a day in interest
          </div>
        </div>
      </div>
      <Footer
        back={back}
        busy={busy}
        label={owed ? "Continue" : "Skip: no loan"}
        onNext={() =>
          next(async () => {
            for (const a of accounts)
              if (a.offsets_loan !== offsets.has(a.id))
                await apiSend("PUT", `accounts/${a.id}`, { offsets_loan: offsets.has(a.id) });
            if (!owed) return;
            const body = {
              kind: "loan",
              name: loan?.name ?? "Home loan",
              rate_bp: Math.round(rate * 100),
              repayment: parseMoney(f.repayment),
              repay_from: f.from || null,
              goal_date: f.goal || null,
            };
            if (loan) {
              await apiSend("PUT", `accounts/${loan.id}`, body);
              if (owed !== loan.balance)
                await apiSend("PUT", `accounts/${loan.id}/balance`, { balance: owed, exact: false });
            } else await apiSend("POST", "accounts", { ...body, balance: owed });
          })
        }
      />
    </Tile>
  );
}

function StepBills({ accounts, next, back, busy }: StepProps) {
  const existing = useQuery(billsQuery);
  const billsAcct = accounts.find((a) => a.role === "bills");
  const [picked, setPicked] = useState<Record<string, { amount: string; every: Every; next: string }>>({});
  const [months, setMonths] = useState(billsAcct?.target_months ?? 3);
  const have = new Set((existing.data?.bills ?? []).map((b) => b.name));
  const perYear =
    (existing.data?.per_year ?? 0) +
    Object.values(picked).reduce(
      (s, b) =>
        s +
        (parseMoney(b.amount) ?? 0) *
          ({ weekly: 52, fortnightly: 26, monthly: 12, quarterly: 4, term: 4, "half-yearly": 2, yearly: 1 } as const)[
            b.every
          ],
      0,
    );
  const target = (perYear / 12) * months;
  return (
    <Tile className="gap-4 p-7">
      <div>
        <h1 className="m-0 text-[26px] font-semibold">What bills come out?</h1>
        <p className="mt-1 mb-0 text-ink-2">
          Tap the ones you have, then fill in the amount and how often. This works out how big the bills buffer should
          be.
        </p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {COMMON_BILLS.map(([name, every]) => {
          const on = name in picked || have.has(name);
          return (
            <button
              key={name}
              type="button"
              aria-pressed={on}
              disabled={have.has(name)}
              onClick={() =>
                setPicked((p) =>
                  name in p
                    ? Object.fromEntries(Object.entries(p).filter(([k]) => k !== name))
                    : { ...p, [name]: { amount: "", every, next: todayIso() } },
                )
              }
              className={cn(
                "press min-h-[38px] cursor-pointer rounded-full border px-3 text-[13px] font-medium",
                on ? "border-teal bg-teal/12 text-ink" : "border-line bg-raised text-ink-2",
              )}
            >
              {on ? "✓ " : "+ "}
              {name}
            </button>
          );
        })}
      </div>
      {Object.entries(picked).map(([name, b], i) => (
        <div
          key={name}
          className="rise grid items-center gap-2 sm:grid-cols-[1fr_140px_150px_170px]"
          style={{ "--i": i } as CSSProperties}
        >
          <span>{name}</span>
          <Input
            aria-label={`${name} amount`}
            inputMode="decimal"
            placeholder="Amount"
            value={b.amount}
            onChange={(e) => setPicked({ ...picked, [name]: { ...b, amount: e.target.value } })}
          />
          <Select
            aria-label={`${name} every`}
            value={b.every}
            onChange={(e) => setPicked({ ...picked, [name]: { ...b, every: e.target.value as Every } })}
          >
            {(["weekly", "fortnightly", "monthly", "quarterly", "term", "half-yearly", "yearly"] as Every[]).map(
              (e) => (
                <option key={e} value={e}>
                  {EVERY_LABEL[e]}
                </option>
              ),
            )}
          </Select>
          <Input
            aria-label={`${name} next due`}
            type="date"
            value={b.next}
            onChange={(e) => setPicked({ ...picked, [name]: { ...b, next: e.target.value } })}
          />
        </div>
      ))}
      <div className="mono text-[13px] text-ink-2">
        {have.size + Object.keys(picked).length} bills · {money(perYear)} a year ≈ {money(perYear / 12)} a month
      </div>
      {billsAcct && (
        <div className="flex flex-col gap-2">
          <div className="tt">How many months should the bills account hold?</div>
          <Choice
            label="Months"
            value={months}
            onChange={setMonths}
            tone="bills"
            options={[1, 2, 3, 4, 6].map((m) => ({ value: m, label: String(m) }))}
          />
          <div className="mono text-[13px]">
            Target {money(target)} · you have {money(billsAcct.balance)}{" "}
            {perYear ? (
              <span style={{ color: billsAcct.balance >= target ? "var(--color-good)" : "var(--color-warn)" }}>
                {(billsAcct.balance / (perYear / 12)).toFixed(1)} months {billsAcct.balance >= target ? "✓" : ""}
              </span>
            ) : null}
          </div>
        </div>
      )}
      <Footer
        back={back}
        busy={busy}
        onNext={() =>
          next(async () => {
            for (const [name, b] of Object.entries(picked)) {
              const amount = parseMoney(b.amount);
              if (amount)
                await apiSend("POST", "bills", {
                  name,
                  amount,
                  every: b.every,
                  next_due: b.next,
                  account_id: billsAcct?.id ?? null,
                  how: "auto",
                });
            }
            if (billsAcct && months !== billsAcct.target_months)
              await apiSend("PUT", `accounts/${billsAcct.id}`, { target_months: months });
          })
        }
      />
    </Tile>
  );
}

function StepPay({ accounts, loan, next, back, busy }: StepProps) {
  const offset = accounts.find((a) => a.role === "offset") ?? accounts[0];
  const bills = accounts.find((a) => a.role === "bills");
  const savings = accounts.find((a) => a.role === "savings");
  const spending = accounts.find((a) => a.role === "spending");
  const billsQ = useQuery(billsQuery);
  const [f, setF] = useState({
    pay: "",
    every: "fortnightly" as Every,
    next: todayIso(),
    lands: String(offset?.id ?? ""),
    toBills: "",
    toSavings: "",
    allowance: editable(spending?.allowance),
    day: "25",
  });
  const perPay =
    { weekly: 52 / 12, fortnightly: 26 / 12, monthly: 1 }[f.every as "weekly" | "fortnightly" | "monthly"] ?? 1;
  const pay = (parseMoney(f.pay) ?? 0) * perPay;
  const billsMonthEarly = (billsQ.data?.per_year ?? 0) / 12;
  const suggested = billsMonthEarly ? editable(Math.ceil(billsMonthEarly / perPay / 1000) * 1000) : "";
  const toBillsText = f.toBills || suggested;
  const toBills = (parseMoney(toBillsText) ?? 0) * perPay;
  const toSavings = (parseMoney(f.toSavings) ?? 0) * perPay;
  const allowance = parseMoney(f.allowance) ?? 0;
  const repayment = loan?.repayment ?? 0;
  const billsMonth = (billsQ.data?.per_year ?? 0) / 12;
  const stays = pay - toBills - toSavings - allowance - repayment;
  return (
    <Tile className="gap-4 p-7">
      <div>
        <h1 className="m-0 text-[26px] font-semibold">Pay and spending</h1>
        <p className="mt-1 mb-0 text-ink-2">
          When money comes in and where it should go. These become your payday rules: set the same transfers up in your
          banking app.
        </p>
      </div>
      <div className="flex flex-wrap gap-6">
        <div className="grid min-w-0 flex-[1_1_420px] gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="p-amt">Pay, after tax</Label>
            <Input
              id="p-amt"
              inputMode="decimal"
              value={f.pay}
              onChange={(e) => setF({ ...f, pay: e.target.value })}
              placeholder="6,950"
            />
          </div>
          <div>
            <Label htmlFor="p-every">How often</Label>
            <Select id="p-every" value={f.every} onChange={(e) => setF({ ...f, every: e.target.value as Every })}>
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
              <option value="monthly">Monthly</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="p-next">Next pay</Label>
            <Input id="p-next" type="date" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} />
          </div>
          <div>
            <Label htmlFor="p-lands">Lands in</Label>
            <Select id="p-lands" value={f.lands} onChange={(e) => setF({ ...f, lands: e.target.value })}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
          {bills && (
            <div>
              <Label htmlFor="p-bills">Each payday, move to {bills.name}</Label>
              <Input
                id="p-bills"
                inputMode="decimal"
                value={toBillsText}
                onChange={(e) => setF({ ...f, toBills: e.target.value })}
              />
            </div>
          )}
          {savings && (
            <div>
              <Label htmlFor="p-save">Each payday, move to {savings.name}</Label>
              <Input
                id="p-save"
                inputMode="decimal"
                value={f.toSavings}
                onChange={(e) => setF({ ...f, toSavings: e.target.value })}
              />
            </div>
          )}
          {bills && billsMonth > 0 && (
            <div className="text-xs text-ink-3 sm:col-span-2">
              Bills need about {money(billsMonth / perPay)} a{" "}
              {f.every === "weekly" ? "week" : f.every === "monthly" ? "month" : "fortnight"}.
            </div>
          )}
          {spending && (
            <>
              <div>
                <Label htmlFor="p-allow">{spending.name}: one month is</Label>
                <Input
                  id="p-allow"
                  inputMode="decimal"
                  value={f.allowance}
                  onChange={(e) => setF({ ...f, allowance: e.target.value })}
                  placeholder="3,200"
                />
              </div>
              <div>
                <Label htmlFor="p-day">Top up on the</Label>
                <Select id="p-day" value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })}>
                  {Array.from({ length: 28 }, (_, i) => String(i + 1)).map((d) => (
                    <option key={d} value={d}>
                      {d}
                      {d === "1" || d === "21"
                        ? "st"
                        : d === "2" || d === "22"
                          ? "nd"
                          : d === "3" || d === "23"
                            ? "rd"
                            : "th"}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="text-xs text-ink-3 sm:col-span-2">
                Topped up to this amount, so whatever's left stays offsetting.
              </div>
            </>
          )}
        </div>
        <div className="flex flex-[0_1_300px] flex-col gap-1 rounded-xl bg-page p-4 text-[13px]">
          <div className="tt mb-1">What a month looks like</div>
          {[
            ["Pay in", pay],
            [`To ${bills?.name ?? "Bills"}`, -toBills],
            [`To ${savings?.name ?? "Savings"}`, -toSavings],
            ["Spending top-up (about)", -allowance],
            ["Loan repayment", -repayment],
          ].map(([l, v]) => (
            <div key={String(l)} className="flex justify-between border-t border-line py-1.5 first:border-t-0">
              <span>{l}</span>
              <span className="mono">{money(v as number, { sign: true })}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-line py-1.5 font-semibold">
            <span>Stays in {offset?.name ?? "Offset"}</span>
            <span className="mono text-teal">{money(stays, { sign: true })}</span>
          </div>
          {loan && loan.balance > 0 && stays + toBills + toSavings > 0 && (
            <div className="mt-1 text-xs text-ink-2">
              Everything but spending and the repayment keeps offsetting:{" "}
              {pct((stays + toBills + toSavings) / loan.balance, 2)} of the loan more each month.
            </div>
          )}
        </div>
      </div>
      <Footer
        back={back}
        busy={busy}
        label={pay ? "Continue" : "Skip for now"}
        onNext={() =>
          next(async () => {
            if (!pay) return;
            const anchor = f.next;
            await apiSend("POST", "rules", {
              kind: "pay",
              to_account: f.lands,
              amount: parseMoney(f.pay),
              every: f.every,
              anchor,
              label: "Pay",
            });
            if (bills && parseMoney(toBillsText))
              await apiSend("POST", "rules", {
                kind: "transfer",
                from_account: f.lands,
                to_account: bills.id,
                amount: parseMoney(toBillsText),
                every: f.every,
                anchor,
                label: `Payday to ${bills.name}`,
              });
            if (savings && parseMoney(f.toSavings))
              await apiSend("POST", "rules", {
                kind: "transfer",
                from_account: f.lands,
                to_account: savings.id,
                amount: parseMoney(f.toSavings),
                every: f.every,
                anchor,
                label: `Payday to ${savings.name}`,
              });
            if (spending && allowance) {
              await apiSend("PUT", `accounts/${spending.id}`, { allowance });
              const d = new Date();
              const day = Number(f.day);
              const first = new Date(d.getFullYear(), d.getMonth() + (d.getDate() > day ? 1 : 0), day);
              const iso = `${first.getFullYear()}-${String(first.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
              await apiSend("POST", "rules", {
                kind: "top_up",
                from_account: f.lands,
                to_account: spending.id,
                amount: allowance,
                every: "monthly",
                anchor: iso,
                label: "Monthly top-up",
              });
            }
          })
        }
      />
    </Tile>
  );
}

function StepCurrent({ accounts, next, back, busy }: StepProps) {
  const [reminder, setReminder] = useState("payday");
  const [detail, setDetail] = useState("statements");
  return (
    <Tile className="gap-4 p-7">
      <div>
        <h1 className="m-0 text-[26px] font-semibold">Keeping it current</h1>
        <p className="mt-1 mb-0 text-ink-2">
          With no bank connection, a quick check-in keeps the numbers right. Open your banking app, copy{" "}
          {accounts.length} balances, done.
        </p>
      </div>
      <div className="flex flex-wrap gap-6">
        <div className="flex min-w-0 flex-[1_1_420px] flex-col gap-2">
          <div className="tt">How often should we remind you?</div>
          <Option on={reminder === "payday"} onClick={() => setReminder("payday")} title="Every payday">
            After the transfers go through. Recommended.
          </Option>
          <Option on={reminder === "weekly"} onClick={() => setReminder("weekly")} title="Every Sunday">
            Weekly, for closer spending tracking.
          </Option>
          <Option on={reminder === "monthly"} onClick={() => setReminder("monthly")} title="Monthly">
            Just the big picture.
          </Option>
          <div className="tt mt-2">Spending detail</div>
          <Option
            on={detail === "statements"}
            onClick={() => setDetail("statements")}
            title="Import a statement CSV now and then"
          >
            If your banking app exports one, we sort it into categories.
          </Option>
          <Option on={detail === "balances"} onClick={() => setDetail("balances")} title="Balances only">
            Skip categories. Still shows pace and safe-to-spend.
          </Option>
        </div>
        <div className="flex flex-[0_1_320px] flex-col gap-2 rounded-xl bg-page p-4 text-[13px]">
          <div className="tt">The check-in looks like this · ≈ 30 seconds</div>
          {accounts.map((a) => (
            <div key={a.id} className="flex items-center justify-between border-t border-line py-1.5 first:border-t-0">
              <span className="flex items-center gap-2">
                <Dot c={a.colour} />
                {a.name}
              </span>
              <span className="mono text-ink-3">{money(a.balance)}</span>
            </div>
          ))}
          <div className="text-xs text-ink-2">
            We pre-fill what the payday rules should have done. If a number doesn't match, that transfer probably didn't
            happen and we'll flag it.
          </div>
          <div className="text-xs text-ink-3">
            Notifications for each person are turned on in Settings, on their own phone.
          </div>
        </div>
      </div>
      <Footer
        back={back}
        busy={busy}
        label="Finish and open the dashboard"
        onNext={() => next(async () => void (await apiSend("POST", "setup/finish", { reminder, detail })))}
      />
    </Tile>
  );
}
