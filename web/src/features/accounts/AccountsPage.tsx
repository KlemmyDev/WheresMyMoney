/**
 * Accounts (from the uplift canvas, MnAccounts): the accounts in a sentence with the totals behind it, and a card for
 * each account and the loan that opens its own page (AccountPage.tsx): its balance with what moved it, its
 * transactions, and its job and settings.
 *
 * When the transactions don't add up to the balance (only about two years are imported), it says so, and setting the
 * exact balance adds a "Balance adjustment" for the difference: as an opening balance before the history starts, so
 * the charts stay right, or today, for a one-off that can't be found.
 */
import { AccountsHero } from "~/features/accounts/AccountsHero";
import { Loading } from "~/features/common/brand";
import { Chip, I, type Glyph, type Tone } from "~/features/common/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type CSSProperties, type PointerEvent } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { Count } from "~/features/common/charts";
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
import { JOB, JobArt, JobPicker, StepDots, StepFlow, useStep } from "~/features/common/steps";
import {
  accountActivityQuery,
  accountQuery,
  accountsQuery,
  archivedAccountsQuery,
  refresh,
} from "~/features/common/queries";
import type { Account, Goal, Role } from "~/features/common/types";
import {
  Button,
  Dot,
  ErrorText,
  Field,
  Input,
  Label,
  Option,
  PageHead,
  Pill,
  SuccessTick,
  Switch,
  Tile,
  cn,
} from "~/features/common/ui";

/** An account's job in a word or two, for its card. */
export function roleBadge(a: Account, goals: Goal[]): string {
  if (a.kind === "loan") return `Loan · ${((a.rate_bp ?? 0) / 100).toFixed(2)}%`;
  if (a.role === "offset") return "Cuts interest";
  if (a.role === "bills") return "For bills";
  if (a.role === "spending") return "Spending money";
  if (a.role === "savings") {
    const n = goals.filter((g) => g.account_id === a.id).length;
    return n ? `${n} ${n === 1 ? "goal" : "goals"}` : "Savings";
  }
  return "Just tracked";
}

export function AccountsPage() {
  const q = useQuery(accountsQuery);
  const navigate = useNavigate();
  const actions = useActions();
  const [adding, setAdding] = useState(false);
  const data = q.data;
  const all = data ? [...data.accounts, ...(data.loan ? [data.loan] : [])] : [];
  if (q.isError) return <ErrorText>{errorMessage(q.error)}</ErrorText>;
  if (!data) return <Loading />;
  const last = data.accounts
    .map((a) => a.known?.date)
    .filter(Boolean)
    .sort()
    .pop();
  const open = (id: number) => navigate({ to: "/accounts/$accountId", params: { accountId: String(id) } });
  return (
    <>
      <PageHead
        over={`Money · ${data.accounts.length} accounts${last ? ` · balances checked ${dayDate(last)}` : ""}`}
        title="Accounts"
        actions={
          <>
            <Button onClick={() => setAdding(true)}>Add account</Button>
            <Button primary onClick={actions.checkin}>
              Check in balances
            </Button>
          </>
        }
      />
      <AccountsHero data={data} />
      <section aria-label="Accounts" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-3">
        {all.map((a, i) => (
          <AccountCard
            key={a.id}
            a={a}
            i={i}
            on={false}
            offsetting={data.offsetting}
            goals={data.goals}
            onPick={() => open(a.id)}
          />
        ))}
      </section>
      <RemovedAccounts />
      <AddAccount
        open={adding}
        onClose={() => setAdding(false)}
        hasLoan={!!data.loan}
        accounts={data.accounts}
        onAdded={open}
      />
    </>
  );
}

/** What an account's job comes to now, as a line and a share for its bar. */
export function job(a: Account, offsetting: number): { text: string; share: number } {
  if (a.kind === "loan")
    return {
      text: `Our accounts cover ${pct(a.balance ? offsetting / a.balance : 0)} of it`,
      share: a.balance ? offsetting / a.balance : 0,
    };
  const t = a.target;
  if (!t) return { text: "Shown, not counted toward anything", share: 0 };
  if (t.kind === "loan") return { text: `Covers ${pct(t.progress)} of the loan`, share: t.progress };
  if (t.kind === "months") {
    const held = t.held ?? 0;
    return {
      text: `Enough for ${held.toFixed(1)} months of bills (we keep ${t.months})`,
      share: t.months ? held / t.months : 0,
    };
  }
  if (t.kind === "allowance") return { text: `${money(a.balance)} of ${money(t.amount)} left`, share: t.progress };
  return t.amount
    ? { text: `${pct(t.progress, 0)} of the way to its goals (${money(t.amount)})`, share: t.progress }
    : { text: "No goals yet", share: 0 };
}

/** An account as a card: its job and how it's doing. Choosing one shows it in the chart and lists below. */
function AccountCard({
  a,
  i,
  on,
  offsetting,
  goals,
  onPick,
}: {
  a: Account;
  i: number;
  on: boolean;
  offsetting: number;
  goals: Goal[];
  onPick: () => void;
}) {
  const loan = a.kind === "loan";
  const j = job(a, offsetting);
  const better = loan ? a.change_30d <= 0 : a.change_30d >= 0;
  const role = loan ? "loan" : a.role;
  const c = loan ? "var(--color-bad)" : ROLE_FILL[a.role];
  // The spending account is the one with cards, so it wears the card art.
  const art = !loan && a.role === "spending";
  const [read, setRead] = useState<{ date: string; balance: number } | null>(null);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onPick}
      className={cn(
        "chip-host press rise relative flex min-h-[176px] w-full cursor-pointer flex-col gap-2 overflow-hidden rounded-[22px] border p-[18px] text-left transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5",
        art ? "border-transparent text-white" : "text-ink",
        loan && "border-dashed",
      )}
      style={
        {
          "--i": i + 3,
          "--c": c,
          borderColor: art ? "transparent" : `color-mix(in srgb, ${c} 35%, var(--color-line))`,
          background: art
            ? "var(--card-art)"
            : `linear-gradient(160deg, color-mix(in srgb, ${c} 16%, var(--color-tile)) 0%, var(--color-tile) 72%)`,
          boxShadow: on
            ? `0 0 0 2px ${c}, 0 18px 40px -18px ${c}`
            : art
              ? "0 18px 40px -20px var(--color-spending-fill)"
              : undefined,
        } as CSSProperties
      }
    >
      <span className="flex w-full items-center gap-2.5">
        <Chip
          g={ROLE_GLYPH[role]}
          tone={art ? "" : ROLE_TONE[role]}
          size="md"
          className={art ? "!bg-white/20 !text-white" : ""}
        />
        <b className="min-w-0 flex-1 truncate text-[15px] font-semibold">{a.name}</b>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
            art ? "bg-white/20" : "bg-raised text-ink-2",
          )}
        >
          {roleBadge(a, goals)}
        </span>
      </span>
      <CardSpark id={a.id} colour={art ? "#fff" : c} loan={loan} onRead={setRead} />
      <span className="flex w-full flex-wrap items-baseline gap-x-2">
        <span className="mono text-[28px] leading-8 font-semibold tracking-[-0.035em]">
          {read ? money(loan ? -read.balance : read.balance) : loan ? money(-a.balance) : money(a.balance)}
        </span>
        <span
          className={cn(
            "mono ml-auto text-xs whitespace-nowrap",
            art ? "text-white/85" : read ? "text-ink-2" : better ? "text-good" : "text-ink-3",
          )}
        >
          {read ? dayDate(read.date) : `${money(a.change_30d, { sign: true })} in 30 days`}
        </span>
      </span>
      <span className={cn("block h-1.5 w-full overflow-hidden rounded-full", art ? "bg-white/25" : "bg-raised")}>
        <i
          className="striped grow-x block h-full rounded-full"
          style={{ width: `${Math.min(Math.max(j.share, 0), 1) * 100}%`, backgroundColor: art ? "#fff" : c }}
        />
      </span>
      <span className={cn("w-full truncate text-[12.5px]", art ? "text-white/85" : "text-ink-3")}>{j.text}</span>
    </button>
  );
}

/**
 * An account's last 30 days as a small line on its card; hovering reads a day off it (shown in place of the balance).
 */
function CardSpark({
  id,
  colour: c,
  loan,
  onRead,
}: {
  id: number;
  colour: string;
  loan: boolean;
  onRead: (r: { date: string; balance: number } | null) => void;
}) {
  const q = useQuery(accountActivityQuery(id));
  const [pt, setPt] = useState<number | null>(null);
  const days = (q.data?.days ?? []).slice(-31);
  if (days.length < 2) return <span className="block h-11 w-full" aria-hidden />;
  const vals = days.map((d) => d.balance);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const W = 200;
  const H = 44;
  const x = (i: number) => (i / (days.length - 1)) * W;
  const y = (v: number) => H - 4 - ((v - lo) / (hi - lo || 1)) * (H - 10);
  const d = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join("");
  const read = (e: PointerEvent<HTMLSpanElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.min(days.length - 1, Math.max(0, Math.round(((e.clientX - r.left) / r.width) * (days.length - 1))));
    setPt(i);
    onRead(days[i]);
  };
  const end = pt ?? days.length - 1;
  return (
    <span
      className="relative block h-11 w-full"
      onPointerMove={read}
      onPointerLeave={() => {
        setPt(null);
        onRead(null);
      }}
      role="img"
      aria-label={`${loan ? "Owed" : "Balance"} over the last 30 days: from ${money(vals[0])} to ${money(vals[vals.length - 1])}`}
    >
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden>
        <path d={`${d}L${W} ${H}L0 ${H}Z`} fill={`color-mix(in srgb, ${c} 16%, transparent)`} className="fill-after" />
        <path
          d={d}
          fill="none"
          stroke={c}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          pathLength={1000}
          className="draw"
          style={{ strokeDasharray: 1000, ["--len" as string]: 1000 } as CSSProperties}
        />
      </svg>
      {pt != null && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-0 bottom-0 w-px"
          style={{ left: `${(pt / (days.length - 1)) * 100}%`, background: c, opacity: 0.5 }}
        />
      )}
      <span
        aria-hidden
        className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          left: `${(end / (days.length - 1)) * 100}%`,
          top: `${(y(vals[end]) / H) * 100}%`,
          background: c,
          boxShadow: `0 0 0 3px color-mix(in srgb, ${c} 30%, transparent)`,
        }}
      />
    </span>
  );
}

const ROLE_FILL: Record<string, string> = {
  offset: "var(--color-offset-fill)",
  bills: "var(--color-bills-fill)",
  spending: "var(--color-spending-fill)",
  savings: "var(--color-savings-fill)",
  track: "var(--color-ink-3)",
};
export const ROLE_TONE: Record<string, Tone> = {
  offset: "offset",
  bills: "bills",
  spending: "spending",
  savings: "savings",
  track: "neutral",
  loan: "loan",
};
export const ROLE_GLYPH: Record<string, Glyph> = {
  offset: I.offset,
  bills: I.bills,
  spending: I.accounts,
  savings: I.savings,
  track: I.list,
  loan: I.loan,
};

export function Detail({ account, goals }: { account: Account; goals: Goal[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const detail = useQuery(accountQuery(account.id));
  const [upd, setUpd] = useState(false);
  const [value, setValue] = useState(editable(account.balance));
  const [when, setWhen] = useState<"opening" | "today">("opening");
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
      refresh(qc);
      toast(
        r.adjustment
          ? `Balance adjustment ${amount(r.adjustment.amount, { cents: true, sign: true })} added`
          : "Balance set",
      );
    },
  });
  const t = a.target;
  const gapShown = !upd && a.transactions > 0 && Math.abs(a.balance - a.ledger) >= 1;
  return (
    <Tile i={9} aria-labelledby="ac-detail">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="tt justify-start">
            <Dot c={a.colour} />
            <span>{a.last4 ? `Acct ••${a.last4}` : ROLE_LABEL[a.role]}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <h2 id="ac-detail" className="m-0 text-[22px] font-semibold">
              {a.name}
            </h2>
            <EditButton account={a} />
          </div>
        </div>
        <div className="text-right">
          <div className="mono text-[28px] font-semibold">
            <Count k={`acct:${a.id}`} value={a.balance} format={(v) => money(v, { cents: true })} />
          </div>
          {a.transactions > 0 && (
            <div className="mono text-xs text-ink-3">FROM TRANSACTIONS {money(a.ledger, { cents: true })}</div>
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
      {gapShown && (
        <div className="reveal flex flex-wrap items-center gap-3 rounded-lg border border-line bg-raised px-3.5 py-3 text-[13px]">
          <span className="min-w-0 flex-1">
            Your transactions add up to <b className="mono">{money(a.ledger, { cents: true })}</b>, but the last{" "}
            {a.known?.source === "statement" ? "statement" : "check-in"} said {a.known?.exact ? "" : "about "}
            <b className="mono">{money(a.balance, { cents: true })}</b>. History before your first import isn't here.
          </span>
          <Button onClick={() => (setValue(editable(a.balance)), setUpd(true))}>Set the balance to the cent</Button>
        </div>
      )}
      {!gapShown && !upd && (
        <div>
          <Button small onClick={() => (setValue(editable(a.balance)), setUpd(true))}>
            Set the balance to the cent
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
      <JobPicker compact label="Account role" value={a.role} onChange={(role) => save.mutate({ role, colour: role })} />
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
              aria-label="Spending money each month"
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
    </Tile>
  );
}

/** The pencil by an account's name: opens Edit account. */
export function EditButton({ account, onClick }: { account: Account; onClick?: () => void }) {
  const navigate = useNavigate();
  return (
    <Button
      small={!onClick}
      aria-label={onClick ? undefined : `Change ${account.name}`}
      onClick={
        onClick ??
        (() =>
          navigate(
            account.kind === "loan"
              ? { to: "/loan", search: { edit: 1 } }
              : { to: "/accounts/$accountId", params: { accountId: String(account.id) }, search: { edit: 1 } },
          ))
      }
    >
      Change
    </Button>
  );
}

/** Accounts that were removed, folded away under the list, each with Bring back. */
function RemovedAccounts() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const q = useQuery(archivedAccountsQuery);
  const [open, setOpen] = useState(false);
  const restore = useMutation({
    mutationFn: (id: number) => apiSend<Account>("POST", `accounts/${id}/restore`),
    onSuccess: (a) => {
      refresh(qc);
      toast(`${a.name} is back`);
      navigate({ to: "/accounts/$accountId", params: { accountId: String(a.id) } });
    },
    onError: (e) => toast(errorMessage(e)),
  });
  const removed = q.data ?? [];
  if (!removed.length) return null;
  return (
    <div className="mt-1">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="tt w-full cursor-pointer justify-start gap-2 border-0 bg-transparent p-1 text-left"
      >
        <span>
          <span aria-hidden className={cn("mr-2 inline-block transition-transform", open && "rotate-90")}>
            ›
          </span>
          Removed accounts · {removed.length}
        </span>
      </button>
      {open && (
        <div className="reveal mt-1.5 flex flex-col rounded-tile border border-dashed border-line">
          {removed.map((a) => (
            <div
              key={a.id}
              className="flex items-center gap-3 border-t border-line px-[18px] py-3 text-[13px] first:border-t-0"
            >
              <Dot c={a.colour} />
              <span className="min-w-0 flex-1">
                <b className="font-semibold">{a.name}</b>
                <span className="mono block text-xs text-ink-3">
                  {a.kind === "loan" ? "Home loan" : a.last4 ? `Acct ••${a.last4}` : ROLE_LABEL[a.role]} ·{" "}
                  {a.transactions} transactions kept
                </span>
              </span>
              <Button small disabled={restore.isPending} onClick={() => restore.mutate(a.id)}>
                Bring back
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
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
          <Link to="/goals/$goalId" params={{ goalId: String(g.id) }} className="text-ink hover:underline">
            {g.name}
          </Link>
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

export function LoanDetail({ account, accounts }: { account: Account; accounts: Account[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const detail = useQuery(accountQuery(account.id));
  const changes = detail.data?.changes ?? [];
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
    <Tile i={9} aria-labelledby="loan-h">
      <div className="tt justify-start">{account.last4 ? `Acct ••${account.last4}` : "Home loan"}</div>
      <div className="flex items-center gap-2">
        <h2 id="loan-h" className="m-0 text-[22px] font-semibold">
          {account.name}
        </h2>
        <EditButton account={account} />
      </div>
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
      {changes.length > 0 && (
        <div>
          <div className="tt mt-1">
            <span>Rate and repayment, from statements</span>
          </div>
          {changes.map((c) => (
            <div
              key={`${c.date}-${c.field}-${c.value}`}
              className="grid grid-cols-[64px_1fr_auto] items-center gap-2.5 border-t border-line py-[9px] text-[13px] first:border-t-0"
            >
              <span className="mono text-ink-3">{capsDate(c.date)}</span>
              <span>{c.field === "rate" ? "Interest rate" : "Repayment"}</span>
              <span className="mono">
                {c.was != null && (
                  <span className="text-ink-3">
                    {c.field === "rate" ? `${(c.was / 100).toFixed(2)}%` : money(c.was, { cents: true })} →{" "}
                  </span>
                )}
                {c.field === "rate" ? `${(c.value / 100).toFixed(2)}%` : money(c.value, { cents: true })}
              </span>
            </div>
          ))}
        </div>
      )}
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
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  hasLoan: boolean;
  accounts: Account[];
  onAdded?: (id: number) => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} labelledBy="add-acct-h">
      <AddAccountFlow onClose={onClose} hasLoan={hasLoan} accounts={accounts} onAdded={onAdded} />
    </Dialog>
  );
}

/**
 * Adding an account, a step at a time: what kind (only while there's no loan yet), its name and balance (with a card
 * that fills in as you type, as it'll look in the list), its job (cards that show what each one gets), then done.
 */
function AddAccountFlow({
  onClose,
  hasLoan,
  accounts,
  onAdded,
}: {
  onClose: () => void;
  hasLoan: boolean;
  accounts: Account[];
  onAdded?: (id: number) => void;
}) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<"bank" | "loan">("bank");
  const [name, setName] = useState("");
  const [last4, setLast4] = useState("");
  const [balance, setBalance] = useState("");
  const [role, setRole] = useState<Role>("offset");
  const [offsets, setOffsets] = useState(true);
  const [offsetsTouched, setOffsetsTouched] = useState(false);
  const [rate, setRate] = useState("");
  const [added, setAdded] = useState<Account | null>(null);
  const steps = [...(hasLoan ? [] : ["kind"]), "details", ...(kind === "bank" ? ["job"] : []), "done"] as const;
  const flow = useStep(steps.length);
  const at = steps[flow.step];
  const loan = kind === "loan";
  const cents = parseMoney(balance);

  const add = useMutation({
    mutationFn: () =>
      apiSend<Account>("POST", "accounts", {
        kind,
        name,
        last4,
        role: loan ? "track" : role,
        offsets_loan: loan ? false : offsets,
        balance: cents ?? 0,
        rate_bp: loan ? Math.round(Number(rate || 0) * 100) : undefined,
        repay_from: loan ? accounts.find((a) => a.role === "offset")?.id : undefined,
      }),
    onSuccess: (a) => {
      setAdded(a);
      refresh(qc);
      flow.next();
    },
  });

  const pickRole = (r: Role) => {
    setRole(r);
    if (!offsetsTouched) setOffsets(r !== "track");
  };
  const canNext = at === "details" ? !!name.trim() && (balance === "" || cents != null) : true;
  const submitStep = at === (loan ? "details" : "job");
  const onNext = () => {
    if (!canNext || add.isPending) return;
    if (submitStep) add.mutate();
    else flow.next();
  };
  const title =
    at === "kind"
      ? "What are you adding?"
      : at === "details"
        ? loan
          ? "Your home loan"
          : "Name and balance"
        : at === "job"
          ? "What's its job?"
          : `${added?.name ?? name} is in`;

  return (
    <form
      className="flex flex-col gap-5 overflow-y-auto p-6"
      onSubmit={(e) => {
        e.preventDefault();
        onNext();
      }}
    >
      <div className="flex items-center justify-between gap-4">
        <h2 id="add-acct-h" key={title} className="fade-in m-0 text-xl font-semibold">
          {title}
        </h2>
        {at !== "done" && (
          <StepDots steps={steps.slice(0, -1) as unknown as string[]} step={flow.step} className="w-24" />
        )}
      </div>
      <StepFlow step={at} dir={flow.dir}>
        {at === "kind" && (
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["bank", "A bank account", "Offset, bills, spending, savings: anything with a balance.", "offset"],
                ["loan", "The home loan", "What you owe. Your accounts offset it.", "track"],
              ] as const
            ).map(([k, t, d, c], i) => (
              <button
                key={k}
                type="button"
                aria-pressed={kind === k}
                onClick={() => (setKind(k), flow.next())}
                className="press rise group flex cursor-pointer flex-col items-start gap-3 rounded-xl border border-line bg-raised p-4 text-left hover:border-ink-3"
                style={{ "--i": i } as CSSProperties}
              >
                <span
                  className="flex size-10 items-center justify-center rounded-lg text-lg"
                  style={{ background: `color-mix(in srgb, ${colour(c)} 16%, transparent)`, color: colour(c) }}
                  aria-hidden
                >
                  {k === "bank" ? (
                    <svg
                      viewBox="0 0 24 24"
                      width="20"
                      height="20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 10l9-6 9 6M5 10v8M10 10v8M14 10v8M19 10v8M3 20h18" />
                    </svg>
                  ) : (
                    <svg
                      viewBox="0 0 24 24"
                      width="20"
                      height="20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M3 11l9-7 9 7M5 10v10h14V10M10 20v-5h4v5" />
                    </svg>
                  )}
                </span>
                <span className="text-[15px] font-semibold text-ink">{t}</span>
                <span className="text-[13px] text-ink-2">{d}</span>
              </button>
            ))}
          </div>
        )}
        {at === "details" && (
          <div className="flex flex-col gap-4">
            <PreviewCard
              name={name}
              last4={last4}
              balance={loan && cents != null ? -cents : cents}
              tone={loan ? "track" : "teal"}
              loan={loan}
              badge={loan ? "LOAN" : "NEW ACCOUNT"}
            />
            <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
              <div>
                <Label htmlFor="aa-name">Name, as in your banking app</Label>
                <Input
                  id="aa-name"
                  className="font-sans"
                  autoComplete="off"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={loan ? "Home loan" : "Offset"}
                />
              </div>
              <div>
                <Label htmlFor="aa-last4">Last four digits</Label>
                <Input
                  id="aa-last4"
                  inputMode="numeric"
                  maxLength={4}
                  value={last4}
                  onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))}
                  placeholder="2210"
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="aa-bal">{loan ? "Loan balance" : "Balance today"}</Label>
                <Input
                  id="aa-bal"
                  inputMode="decimal"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              {loan && (
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
          </div>
        )}
        {at === "job" && (
          <div className="flex flex-col gap-4">
            <JobPicker value={role} onChange={pickRole} />
            <div key={role} className="fade-in flex items-center gap-3 rounded-lg bg-page px-3.5 py-3 text-[13px]">
              <JobArt role={role} size={36} />
              <span className="min-w-0 flex-1">
                <b className="font-semibold">You'll see:</b> <span className="text-ink-2">{JOB[role].get}</span>
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-line px-3.5 py-2.5">
              <span id="aa-off" className="text-[13px]">
                Offsets the home loan
                <span className="block text-xs text-ink-3">Its balance counts against the loan's interest.</span>
              </span>
              <Switch
                labelledBy="aa-off"
                checked={offsets}
                onChange={(v) => (setOffsets(v), setOffsetsTouched(true))}
              />
            </div>
          </div>
        )}
        {at === "done" && added && (
          <div className="flex flex-col items-center gap-4 py-2 text-center">
            <SuccessTick size={64} />
            <p className="m-0 max-w-sm text-ink-2">
              {added.kind === "loan"
                ? "Your home loan is set up. Check its balance in now and then, like the others."
                : DONE_NOTE[added.role]}
            </p>
            <div className="w-full text-left">
              <PreviewCard
                name={added.name}
                last4={added.last4 ?? ""}
                balance={added.kind === "loan" ? -(cents ?? 0) : (cents ?? 0)}
                tone={added.colour ?? added.role}
                loan={added.kind === "loan"}
                badge={added.kind === "loan" ? "LOAN" : ROLE_LABEL[added.role].toUpperCase()}
                settled
              />
            </div>
          </div>
        )}
      </StepFlow>
      {add.isError && <ErrorText>{errorMessage(add.error)}</ErrorText>}
      <div className="flex justify-between gap-2">
        {at === "done" ? (
          <>
            <Button onClick={onClose}>Done</Button>
            <Button
              primary
              onClick={() => {
                if (added) onAdded?.(added.id);
                onClose();
              }}
            >
              Open {added?.name}
            </Button>
          </>
        ) : (
          <>
            {flow.step === 0 ? <Button onClick={onClose}>Cancel</Button> : <Button onClick={flow.back}>Back</Button>}
            {at !== "kind" && (
              <Button primary type="submit" disabled={!canNext || add.isPending}>
                {add.isPending ? "Adding…" : submitStep ? (loan ? "Add the loan" : "Add account") : "Continue"}
              </Button>
            )}
          </>
        )}
      </div>
    </form>
  );
}

const DONE_NOTE: Record<Role, string> = {
  offset: "It counts towards covering the loan, and its progress is on the dashboard.",
  bills: "Add your bills and it'll know how many months it should hold.",
  spending: "Set the monthly amount it's topped up to on its page.",
  savings: "Add the things it's saving for on its page, and watch them fill.",
  track: "Its balance and trend are on its page, with no target.",
};

/** The account as it'll look in the list, filling in as you type. */
function PreviewCard({
  name,
  last4,
  balance,
  tone,
  loan,
  badge,
  settled = false,
}: {
  name: string;
  last4: string;
  balance: number | null;
  tone: string;
  loan: boolean;
  badge: string;
  settled?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 rounded-tile border bg-page px-[18px] py-4 transition-[border-color,box-shadow] duration-300",
        loan && "border-dashed",
        settled ? "rise" : "",
      )}
      style={{ borderColor: colour(tone), boxShadow: `inset 3px 0 0 ${colour(tone)}` }}
      aria-hidden
    >
      <span className="flex min-w-0 items-center gap-2.5">
        {loan ? <span className="text-ink-2">⌂</span> : <Dot c={tone} />}
        <b className={cn("truncate font-semibold", !name && "text-ink-3")}>
          {name || (loan ? "Home loan" : "Account name")}
        </b>
        <Pill tone="role">{badge}</Pill>
      </span>
      <span className="mono text-lg font-semibold">
        <Count k={`preview:${settled}`} value={balance ?? 0} format={(v) => money(v)} />
      </span>
      <span className="mono text-xs text-ink-3">{last4 ? `Acct ••${last4}` : "No account number"}</span>
      <span className="mono text-xs text-ink-3">today</span>
    </div>
  );
}
