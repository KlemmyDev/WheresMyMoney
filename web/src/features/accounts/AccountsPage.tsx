/**
 * Accounts (design: CkAccounts, with the desktop prototype's "set exact balance"): everything offsetting the loan as
 * one strip, each account with its job and how it's tracking, and the one chosen in detail: its balance over time
 * against its target, its job and settings, and its transactions.
 *
 * When the transactions don't add up to the balance (only about two years are imported), it says so, and setting the
 * exact balance adds a "Balance adjustment" for the difference: as an opening balance before the history starts, so
 * the charts stay right, or today, for a one-off that can't be found.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type CSSProperties } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { AreaLine, Count } from "~/features/common/charts";
import {
  amount,
  capsDate,
  colour,
  dayDate,
  editable,
  longDate,
  money,
  parseMoney,
  pct,
  ROLE_LABEL,
} from "~/features/common/format";
import { useActions } from "~/features/common/layout";
import { Dialog, useToast } from "~/features/common/overlay";
import { accountQuery, accountsQuery, refresh, transactionsQuery } from "~/features/common/queries";
import type { Account, Goal, Role } from "~/features/common/types";
import {
  Button,
  Choice,
  Dot,
  ErrorText,
  Field,
  Input,
  Label,
  Option,
  PageHead,
  Pill,
  Switch,
  Tile,
  TileTitle,
  cn,
} from "~/features/common/ui";

const ROLES: Role[] = ["offset", "bills", "spending", "savings", "track"];

export function roleBadge(a: Account, goals: Goal[]): string {
  if (a.kind === "loan") return "LOAN";
  if (a.role === "offset") return "GOAL · 100% OF LOAN";
  if (a.role === "bills") return `BUFFER · ${a.target_months ?? 3} MONTHS`;
  if (a.role === "spending") return "ALLOWANCE · 1 MONTH";
  if (a.role === "savings") return `GOALS · ${goals.filter((g) => g.account_id === a.id).length}`;
  return "JUST TRACK IT";
}

function status(a: Account): { text: string; colour: string } {
  const t = a.target;
  if (!t) return { text: amount(a.change_30d, { sign: true }) + " / 30d", colour: "var(--color-ink-2)" };
  if (t.kind === "months") {
    const held = t.held ?? 0;
    return {
      text: `${held.toFixed(1)} mo ${held >= t.months ? "✓" : "⚑"}`,
      colour: held >= t.months ? "var(--color-good)" : "var(--color-warn)",
    };
  }
  if (t.kind === "allowance") return { text: `${pct(t.progress, 0)} left`, colour: "var(--color-ink-2)" };
  return {
    text: `${amount(a.change_30d, { sign: true })} / 30d`,
    colour: a.change_30d >= 0 ? "var(--color-good)" : "var(--color-warn)",
  };
}

export function AccountsPage({ selected }: { selected?: number }) {
  const q = useQuery(accountsQuery);
  const navigate = useNavigate();
  const actions = useActions();
  const [adding, setAdding] = useState(false);
  const data = q.data;
  const all = data ? [...data.accounts, ...(data.loan ? [data.loan] : [])] : [];
  const sel = all.find((a) => a.id === selected) ?? data?.accounts[0];
  if (q.isError) return <ErrorText>{errorMessage(q.error)}</ErrorText>;
  if (!data) return <div className="h-[60vh]" aria-busy />;
  const offsetting = data.accounts.filter((a) => a.offsets_loan);
  const last = data.accounts
    .map((a) => a.known?.date)
    .filter(Boolean)
    .sort()
    .pop();
  return (
    <>
      <PageHead
        over={`${data.accounts.length} ACCOUNTS · ${data.loan ? "1 LOAN" : "NO LOAN"}${last ? ` · BALANCES CHECKED IN ${dayDate(last).toUpperCase()}` : ""}`}
        title="Accounts"
        actions={
          <>
            <Button onClick={() => setAdding(true)}>Add account</Button>
            <Button onClick={() => navigate({ to: "/import" })}>Import CSV</Button>
            <Button primary onClick={actions.checkin}>
              Check in balances
            </Button>
          </>
        }
      />
      {offsetting.length > 0 && (
        <Tile i={0} aria-labelledby="ac-total">
          <TileTitle id="ac-total" right={<span className="mono text-ink">{money(data.offsetting)}</span>}>
            Everything offsetting the loan
          </TileTitle>
          <div
            className="flex h-3.5 gap-0.5 overflow-hidden rounded-[3px]"
            role="img"
            aria-label={offsetting.map((a) => `${a.name} ${money(a.balance)}`).join(", ")}
          >
            {offsetting.map((a, i) => (
              <i
                key={a.id}
                className="grow-x block"
                style={
                  { flex: `${Math.max(a.balance, 0)} 1 0`, background: colour(a.colour), "--i": i } as CSSProperties
                }
              />
            ))}
          </div>
          <div className="mono flex flex-wrap gap-[18px] text-xs text-ink-3">
            {offsetting.map((a) => (
              <span key={a.id}>
                {a.name.toUpperCase()} {pct(data.offsetting ? a.balance / data.offsetting : 0, 0)}
              </span>
            ))}
          </div>
        </Tile>
      )}
      <div className="flex flex-wrap items-start gap-4">
        <section aria-label="Accounts" className="flex min-w-0 flex-[1_1_380px] flex-col gap-2.5">
          {all.map((a, i) => {
            const s = status(a);
            const on = sel?.id === a.id;
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={on}
                onClick={() => navigate({ to: "/accounts", search: { id: a.id }, replace: true })}
                className={cn(
                  "press rise grid w-full cursor-pointer grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 rounded-tile border bg-tile px-[18px] py-4 text-left text-ink",
                  a.kind === "loan" && "border-dashed",
                  on ? "border-[var(--c)] shadow-[inset_3px_0_0_var(--c)]" : "border-line",
                )}
                style={{ "--i": i + 1, "--c": colour(a.colour) } as CSSProperties}
              >
                <span className="flex flex-wrap items-center gap-2.5">
                  {a.kind === "loan" ? <span className="text-ink-2">⌂</span> : <Dot c={a.colour} />}
                  <b className="font-semibold">{a.name}</b>
                  <Pill tone="role">
                    {a.kind === "loan"
                      ? `LOAN · ${data.accounts.filter((x) => x.offsets_loan).length} OFFSETS LINKED`
                      : roleBadge(a, data.goals)}
                  </Pill>
                </span>
                <span className="mono text-lg font-semibold">
                  {a.kind === "loan" ? money(-a.balance) : money(a.balance)}
                </span>
                <span className="mono text-xs text-ink-3">
                  {a.last4 ? `Acct ••${a.last4}` : "No account number"}
                  {a.kind === "loan" && a.rate_bp != null ? ` · ${(a.rate_bp / 100).toFixed(2)}%` : ""}
                  {a.known && a.kind === "bank"
                    ? ` · ${a.known.exact ? "exact" : "rough"} ${capsDate(a.known.date).replace(/^0/, "")}`
                    : ""}
                </span>
                <span
                  className="mono text-right text-xs"
                  style={{ color: a.kind === "loan" ? "var(--color-ink-2)" : s.colour }}
                >
                  {a.kind === "loan" ? `net ${money(data.offsetting - a.balance)}` : s.text}
                </span>
              </button>
            );
          })}
        </section>
        {sel &&
          (sel.kind === "loan" ? (
            <LoanDetail key={`${sel.id}-${sel.balance}`} account={sel} accounts={data.accounts} />
          ) : (
            <Detail key={sel.id} account={sel} goals={data.goals} />
          ))}
      </div>
      <AddAccount open={adding} onClose={() => setAdding(false)} hasLoan={!!data.loan} accounts={data.accounts} />
    </>
  );
}

function Detail({ account, goals }: { account: Account; goals: Goal[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const detail = useQuery(accountQuery(account.id));
  const txs = useQuery(transactionsQuery({ account_id: account.id, limit: 8 }));
  const [upd, setUpd] = useState(false);
  const [value, setValue] = useState(editable(account.balance));
  const [when, setWhen] = useState<"opening" | "today">("opening");
  const [flashId, setFlashId] = useState<number | null>(null);
  const a = detail.data ?? account;
  const real = parseMoney(value);
  const adj = real == null ? 0 : real - a.ledger;

  const save = useMutation({
    mutationFn: (body: Partial<Account>) => apiSend<Account>("PUT", `accounts/${account.id}`, body),
    onSuccess: () => refresh(qc),
  });
  const setBalance = useMutation({
    mutationFn: () =>
      apiSend<{ adjustment: { id: number; amount: number } | null }>("PUT", `accounts/${account.id}/balance`, {
        balance: real,
        exact: true,
        when,
      }),
    onSuccess: (r) => {
      setUpd(false);
      if (r.adjustment) setFlashId(r.adjustment.id);
      refresh(qc);
      toast(
        r.adjustment
          ? `Balance adjustment ${amount(r.adjustment.amount, { cents: true, sign: true })} added`
          : "Balance set",
      );
    },
  });
  const t = a.target;
  const history = detail.data?.history.map(([, v]) => v) ?? [];
  const gapShown = !upd && a.transactions > 0 && Math.abs(a.balance - a.ledger) >= 1;
  return (
    <Tile i={2} aria-labelledby="ac-detail" className="flex-[1.4_1_520px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="tt justify-start">
            <Dot c={a.colour} />
            <span>{a.last4 ? `Acct ••${a.last4}` : ROLE_LABEL[a.role]}</span>
          </div>
          <h2 id="ac-detail" className="mt-1 mb-0 text-[22px] font-semibold">
            {a.name}
          </h2>
        </div>
        <div className="text-right">
          <div className="mono text-[28px] font-semibold">
            <Count k={`acct:${a.id}`} value={a.balance} format={(v) => money(v, { cents: true })} />
          </div>
          {a.transactions > 0 && (
            <div className="mono text-xs text-ink-3">LEDGER {money(a.ledger, { cents: true })}</div>
          )}
          {t?.kind === "months" && (
            <Pill tone={(t.held ?? 0) >= t.months ? "good" : "warn"}>
              {(t.held ?? 0).toFixed(1)} MONTHS · {(t.held ?? 0) >= t.months ? "ON TARGET" : "UNDER TARGET"}
            </Pill>
          )}
          {t?.kind === "loan" && <Pill tone="info">{pct(t.progress)} OF THE LOAN</Pill>}
          {t?.kind === "allowance" && <Pill tone="mute">{pct(t.progress, 0)} OF THE MONTH LEFT</Pill>}
        </div>
      </div>
      <AreaLine
        values={history}
        colour={colour(a.colour)}
        target={t && t.kind !== "allowance" && t.kind !== "loan" ? t.amount : null}
        label={`${a.name}'s balance over 6 months`}
      />
      {gapShown && (
        <div className="reveal flex flex-wrap items-center gap-3 rounded-lg border border-line bg-raised px-3.5 py-3 text-[13px]">
          <span className="min-w-0 flex-1">
            Your transactions add up to <b className="mono">{money(a.ledger, { cents: true })}</b>, but the last{" "}
            {a.known?.source === "statement" ? "statement" : "check-in"} said {a.known?.exact ? "" : "about "}
            <b className="mono">{money(a.balance, { cents: true })}</b>. History before your first import isn't here.
          </span>
          <Button onClick={() => (setValue(editable(a.balance)), setUpd(true))}>Set exact balance</Button>
        </div>
      )}
      {!gapShown && !upd && (
        <div>
          <Button small onClick={() => (setValue(editable(a.balance)), setUpd(true))}>
            Set exact balance
          </Button>
        </div>
      )}
      {upd && (
        <div className="reveal flex flex-col gap-3 rounded-lg border border-teal/50 bg-page px-4 py-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="text-xs text-ink-3">Transactions say</div>
              <div className="mono mt-2 text-lg">{money(a.ledger, { cents: true })}</div>
            </div>
            <div>
              <Label htmlFor="upd-v">Real balance, from your banking app</Label>
              <Input id="upd-v" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} />
            </div>
          </div>
          {adj !== 0 && (
            <div className="flex items-center justify-between gap-2 text-[13px]">
              <span>
                We'll add a <b>{adj > 0 ? "credit" : "debit"}</b> called "Balance adjustment"
              </span>
              <span
                className="mono font-semibold"
                style={{ color: adj > 0 ? "var(--color-good)" : "var(--color-warn)" }}
              >
                {money(adj, { cents: true, sign: true })}
              </span>
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <Option on={when === "opening"} onClick={() => setWhen("opening")} title="Opening balance">
              Dated {a.history_from ? longDate(dayBefore(a.history_from)) : "today"}, before your history starts. Charts
              stay right.
            </Option>
            <Option on={when === "today"} onClick={() => setWhen("today")} title="Today">
              Use it for a one-off you can't find.
            </Option>
          </div>
          {setBalance.isError && <ErrorText>{errorMessage(setBalance.error)}</ErrorText>}
          <div className="flex justify-end gap-2">
            <Button onClick={() => setUpd(false)}>Cancel</Button>
            <Button primary disabled={real == null || setBalance.isPending} onClick={() => setBalance.mutate()}>
              Set balance
            </Button>
          </div>
        </div>
      )}
      <div className="tt mt-1">What is this account for?</div>
      <Choice
        label="Account role"
        value={a.role}
        tone={a.colour}
        onChange={(role) => save.mutate({ role, colour: role })}
        options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
      />
      <div className="text-xs text-ink-3">The role sets which target, chart and alerts this account gets.</div>
      <div className="mt-1 rounded-lg border border-line">
        {a.role === "bills" && t?.kind === "months" && (
          <>
            <Field label="Target">
              <span className="mono flex items-center gap-2">
                <Input
                  aria-label="Months of bills"
                  className="w-16 text-center"
                  defaultValue={a.target_months ?? 3}
                  onBlur={(e) =>
                    Number(e.target.value) !== a.target_months && save.mutate({ target_months: Number(e.target.value) })
                  }
                />
                months of bills <span className="text-ink-3">= {money(t.amount)}</span>
              </span>
            </Field>
            <Field label="Worked out from">
              <span className="mono text-ink-2">{money(t.per_month * 12)} a year of bills</span>
            </Field>
          </>
        )}
        {a.role === "spending" && (
          <Field label="Topped up to">
            <Input
              aria-label="Monthly allowance"
              inputMode="decimal"
              className="w-32 text-right"
              defaultValue={editable(a.allowance)}
              onBlur={(e) => {
                const c = parseMoney(e.target.value);
                if (c != null && c !== a.allowance) save.mutate({ allowance: c });
              }}
            />
          </Field>
        )}
        {a.role === "offset" && t?.kind === "loan" && (
          <Field label="Target">
            <span className="mono">
              100% of the loan <span className="text-ink-3">= {money(t.amount)}</span>
            </span>
          </Field>
        )}
        <Field label={<span id={`off-${a.id}`}>Offsets the home loan</span>}>
          <Switch
            labelledBy={`off-${a.id}`}
            checked={a.offsets_loan}
            onChange={(v) => save.mutate({ offsets_loan: v })}
          />
        </Field>
        {(a.role === "bills" || a.role === "spending") && (
          <Field
            label={
              <span id={`al-${a.id}`}>Alert me if it {a.role === "bills" ? "drops below target" : "runs low"}</span>
            }
          >
            <Switch
              labelledBy={`al-${a.id}`}
              checked={a.alert_below}
              onChange={(v) => save.mutate({ alert_below: v })}
            />
          </Field>
        )}
      </div>
      {a.role === "savings" && <Goals account={a} goals={goals.filter((g) => g.account_id === a.id)} />}
      <div className="tt mt-1.5">
        <span>Recent activity</span>
        <Link
          to="/transactions"
          search={{ account: a.id }}
          className="font-medium tracking-normal text-teal normal-case no-underline"
        >
          All
        </Link>
      </div>
      <div>
        {(txs.data ?? []).map((tx) => (
          <div
            key={tx.id}
            className={cn(
              "grid grid-cols-[60px_1fr_auto_90px] items-center gap-2.5 border-t border-line py-[9px] text-[13px] first:border-t-0",
              tx.id === flashId && "flash",
            )}
          >
            <span className="mono text-ink-3">{capsDate(tx.date)}</span>
            <span className="min-w-0 truncate">
              {tx.description}
              {tx.category && <span className="text-ink-3"> · {tx.category}</span>}
            </span>
            <span>
              {tx.kind === "adjustment" ? (
                <Pill tone="teal">ADJUSTMENT</Pill>
              ) : tx.kind === "cash" ? (
                <Pill>CASH</Pill>
              ) : null}
            </span>
            <span className="mono text-right" style={{ color: tx.amount > 0 ? "var(--color-good)" : undefined }}>
              {amount(tx.amount, { cents: true, sign: true })}
            </span>
          </div>
        ))}
        {txs.data && !txs.data.length && (
          <div className="text-ink-3">No transactions yet. Import a statement to fill in the history.</div>
        )}
      </div>
    </Tile>
  );
}

function dayBefore(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Goals({ account, goals }: { account: Account; goals: Goal[] }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const add = useMutation({
    mutationFn: () => apiSend("POST", "goals", { account_id: account.id, name, target: parseMoney(target), saved: 0 }),
    onSuccess: () => (setName(""), setTarget(""), refresh(qc)),
  });
  const update = useMutation({
    mutationFn: (g: Goal) => apiSend("PUT", `goals/${g.id}`, g),
    onSuccess: () => refresh(qc),
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiSend("DELETE", `goals/${id}`),
    onSuccess: () => refresh(qc),
  });
  const allocated = goals.reduce((s, g) => s + g.saved, 0);
  return (
    <div className="flex flex-col gap-2">
      <div className="tt">
        <span>Goals</span>
        <span className="mono tracking-normal">{money(account.balance - allocated)} not put towards one</span>
      </div>
      {goals.map((g) => (
        <div key={g.id} className="grid grid-cols-[1fr_110px_110px_auto] items-center gap-2 text-[13px]">
          <span>{g.name}</span>
          <Input
            aria-label={`${g.name} saved`}
            className="text-right"
            defaultValue={editable(g.saved)}
            onBlur={(e) =>
              parseMoney(e.target.value) != null && update.mutate({ ...g, saved: parseMoney(e.target.value)! })
            }
          />
          <Input
            aria-label={`${g.name} target`}
            className="text-right"
            defaultValue={editable(g.target)}
            onBlur={(e) =>
              parseMoney(e.target.value) != null && update.mutate({ ...g, target: parseMoney(e.target.value)! })
            }
          />
          <Button small aria-label={`Remove ${g.name}`} onClick={() => remove.mutate(g.id)}>
            ✕
          </Button>
        </div>
      ))}
      <div className="grid grid-cols-[1fr_110px_auto] gap-2">
        <Input
          className="font-sans"
          placeholder="New goal, like Japan trip"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input placeholder="Target" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
        <Button disabled={!name || parseMoney(target) == null} onClick={() => add.mutate()}>
          Add
        </Button>
      </div>
      {add.isError && <ErrorText>{errorMessage(add.error)}</ErrorText>}
    </div>
  );
}

function LoanDetail({ account, accounts }: { account: Account; accounts: Account[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState({
    rate: ((account.rate_bp ?? 0) / 100).toFixed(2),
    repayment: editable(account.repayment),
    repay_from: account.repay_from ?? "",
    goal: account.goal_date ?? "",
    balance: editable(account.balance),
  });
  const save = useMutation({
    mutationFn: async () => {
      await apiSend("PUT", `accounts/${account.id}`, {
        rate_bp: Math.round(Number(form.rate) * 100),
        repayment: parseMoney(form.repayment),
        repay_from: form.repay_from || null,
        goal_date: form.goal || null,
      });
      const bal = parseMoney(form.balance);
      if (bal != null && bal !== account.balance)
        await apiSend("PUT", `accounts/${account.id}/balance`, { balance: bal, exact: false });
    },
    onSuccess: () => (refresh(qc), toast("Loan saved")),
  });
  return (
    <Tile i={2} className="flex-[1.4_1_520px]" aria-labelledby="loan-h">
      <div className="tt justify-start">{account.last4 ? `Acct ••${account.last4}` : "Home loan"}</div>
      <h2 id="loan-h" className="m-0 text-[22px] font-semibold">
        {account.name}
      </h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="l-bal">Loan balance</Label>
          <Input
            id="l-bal"
            inputMode="decimal"
            value={form.balance}
            onChange={(e) => setForm({ ...form, balance: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="l-rate">Interest rate (%)</Label>
          <Input
            id="l-rate"
            inputMode="decimal"
            value={form.rate}
            onChange={(e) => setForm({ ...form, rate: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="l-rep">Repayment (monthly)</Label>
          <Input
            id="l-rep"
            inputMode="decimal"
            value={form.repayment}
            onChange={(e) => setForm({ ...form, repayment: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="l-from">Paid from</Label>
          <select
            id="l-from"
            className="min-h-[42px] w-full rounded-lg border border-line bg-page px-3 text-ink"
            value={form.repay_from}
            onChange={(e) => setForm({ ...form, repay_from: e.target.value })}
          >
            <option value="">—</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="l-goal">Fully offset by (month)</Label>
          <Input
            id="l-goal"
            type="month"
            value={form.goal}
            onChange={(e) => setForm({ ...form, goal: e.target.value })}
          />
        </div>
      </div>
      {save.isError && <ErrorText>{errorMessage(save.error)}</ErrorText>}
      <div className="flex justify-between gap-2">
        <Link to="/loan" className="self-center text-teal no-underline">
          See the loan and offset
        </Link>
        <Button primary onClick={() => save.mutate()} disabled={save.isPending}>
          Save
        </Button>
      </div>
    </Tile>
  );
}

export function AddAccount({
  open,
  onClose,
  hasLoan,
  accounts,
}: {
  open: boolean;
  onClose: () => void;
  hasLoan: boolean;
  accounts: Account[];
}) {
  return (
    <Dialog open={open} onClose={onClose} labelledBy="add-acct-h">
      <AddAccountForm onClose={onClose} hasLoan={hasLoan} accounts={accounts} />
    </Dialog>
  );
}

function AddAccountForm({
  onClose,
  hasLoan,
  accounts,
}: {
  onClose: () => void;
  hasLoan: boolean;
  accounts: Account[];
}) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<"bank" | "loan">("bank");
  const [name, setName] = useState("");
  const [last4, setLast4] = useState("");
  const [balance, setBalance] = useState("");
  const [role, setRole] = useState<Role>("track");
  const [rate, setRate] = useState("");
  const add = useMutation({
    mutationFn: () =>
      apiSend("POST", "accounts", {
        kind,
        name,
        last4,
        role,
        balance: parseMoney(balance),
        rate_bp: kind === "loan" ? Math.round(Number(rate || 0) * 100) : undefined,
        repay_from: kind === "loan" ? accounts.find((a) => a.role === "offset")?.id : undefined,
      }),
    onSuccess: () => (refresh(qc), onClose()),
  });
  return (
    <div className="flex flex-col gap-3 overflow-y-auto p-6">
      <h2 id="add-acct-h" className="m-0 text-xl font-semibold">
        Add an account
      </h2>
      {!hasLoan && (
        <Choice
          label="Kind"
          value={kind}
          onChange={setKind}
          options={[
            { value: "bank", label: "A bank account" },
            { value: "loan", label: "The home loan" },
          ]}
        />
      )}
      <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
        <div>
          <Label htmlFor="aa-name">Name, as in your banking app</Label>
          <Input
            id="aa-name"
            className="font-sans"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === "loan" ? "Home loan" : "Offset"}
          />
        </div>
        <div>
          <Label htmlFor="aa-last4">Last four digits</Label>
          <Input
            id="aa-last4"
            inputMode="numeric"
            maxLength={4}
            value={last4}
            onChange={(e) => setLast4(e.target.value)}
            placeholder="2210"
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="aa-bal">{kind === "loan" ? "Loan balance" : "Balance today"}</Label>
          <Input
            id="aa-bal"
            inputMode="decimal"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            placeholder="0.00"
          />
        </div>
        {kind === "loan" && (
          <div>
            <Label htmlFor="aa-rate">Interest rate (%)</Label>
            <Input
              id="aa-rate"
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
              placeholder="5.84"
            />
          </div>
        )}
      </div>
      {kind === "bank" && (
        <>
          <div className="tt">Its job</div>
          <Choice
            label="Role"
            value={role}
            tone={role}
            onChange={setRole}
            options={ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))}
          />
        </>
      )}
      {add.isError && <ErrorText>{errorMessage(add.error)}</ErrorText>}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button primary disabled={!name || add.isPending} onClick={() => add.mutate()}>
          Add
        </Button>
      </div>
    </div>
  );
}
