/**
 * Accounts (design: direction E on the accounts canvas, in the dashboard's look): three figures across the top (what's
 * offsetting the loan, the last 30 days, the interest saved), a card for each account and the loan, and the one chosen
 * in detail: its balance with what moved it, a month to a year (Activity.tsx); its transactions, to sort them; and its
 * job and settings.
 *
 * When the transactions don't add up to the balance (only about two years are imported), it says so, and setting the
 * exact balance adds a "Balance adjustment" for the difference: as an opening balance before the history starts, so
 * the charts stay right, or today, for a one-off that can't be found.
 */
import { Loading } from "~/features/common/brand";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState, type CSSProperties } from "react";
import { AccountTransactions, ActivityChart, type Bucket, type Range } from "~/features/accounts/Activity";
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
import { accountQuery, accountsQuery, archivedAccountsQuery, refresh } from "~/features/common/queries";
import type { Account, AccountsOverview, Goal, Role } from "~/features/common/types";
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
  TileTitle,
  cn,
} from "~/features/common/ui";

/** An account's job in a word or two, for its card. */
export function roleBadge(a: Account, goals: Goal[]): string {
  if (a.kind === "loan") return `LOAN · ${((a.rate_bp ?? 0) / 100).toFixed(2)}%`;
  if (a.role === "offset") return "OFFSET";
  if (a.role === "bills") return `${a.target_months ?? 3} MONTHS`;
  if (a.role === "spending") return "ALLOWANCE";
  if (a.role === "savings") {
    const n = goals.filter((g) => g.account_id === a.id).length;
    return `${n} ${n === 1 ? "GOAL" : "GOALS"}`;
  }
  return "TRACKED";
}

export function AccountsPage({ selected }: { selected?: number }) {
  const q = useQuery(accountsQuery);
  const navigate = useNavigate();
  const actions = useActions();
  const [adding, setAdding] = useState(false);
  const [range, setRange] = useState<Range>("1m");
  const [picked, setPicked] = useState<Bucket | null>(null);
  const data = q.data;
  const all = data ? [...data.accounts, ...(data.loan ? [data.loan] : [])] : [];
  const sel = all.find((a) => a.id === selected) ?? data?.accounts[0];
  if (q.isError) return <ErrorText>{errorMessage(q.error)}</ErrorText>;
  if (!data) return <Loading />;
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
      <Readouts data={data} />
      <section aria-label="Accounts" className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-3">
        {all.map((a, i) => (
          <AccountCard
            key={a.id}
            a={a}
            i={i}
            on={sel?.id === a.id}
            offsetting={data.offsetting}
            goals={data.goals}
            onPick={() => {
              setPicked(null);
              navigate({ to: "/accounts", search: { id: a.id }, replace: true });
            }}
          />
        ))}
      </section>
      <RemovedAccounts />
      {sel && (
        <ActivityChart key={sel.id} account={sel} range={range} onRange={setRange} picked={picked} onPick={setPicked} />
      )}
      {sel && (
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex min-w-0 flex-[1.4_1_560px] flex-col">
            <AccountTransactions
              key={sel.id}
              account={sel}
              range={range}
              picked={picked}
              onClearPick={() => setPicked(null)}
            />
          </div>
          <div className="flex min-w-0 flex-[1_1_380px] flex-col">
            {sel.kind === "loan" ? (
              <LoanDetail key={`${sel.id}-${sel.balance}`} account={sel} accounts={data.accounts} />
            ) : (
              <Detail key={sel.id} account={sel} goals={data.goals} />
            )}
          </div>
        </div>
      )}
      <AddAccount
        open={adding}
        onClose={() => setAdding(false)}
        hasLoan={!!data.loan}
        accounts={data.accounts}
        onAdded={(id) => navigate({ to: "/accounts", search: { id }, replace: true })}
      />
    </>
  );
}

/**
 * The three figures across the top: what's offsetting the loan (and how much of it that covers), how the accounts
 * moved in 30 days and who moved them, and the interest the offsets save a day.
 */
function Readouts({ data }: { data: AccountsOverview }) {
  const loan = data.loan;
  const banks = data.accounts;
  const moved = banks.reduce((s, a) => s + a.change_30d, 0);
  const share = banks.filter((a) => a.change_30d !== 0).sort((a, b) => b.change_30d - a.change_30d);
  const perDay = loan
    ? (Math.min(Math.max(data.offsetting, 0), Math.max(loan.balance, 0)) * (loan.rate_bp ?? 0)) / 10000 / 365
    : 0;
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,300px),1fr))] gap-4">
      <Tile
        i={0}
        aria-labelledby="ac-off"
        className="border-teal/35 bg-[linear-gradient(160deg,color-mix(in_srgb,var(--color-accent-fill)_14%,transparent),color-mix(in_srgb,var(--color-accent-fill)_3%,transparent)_60%),var(--color-tile)]"
      >
        <div className="flex items-center gap-2 text-[13px] text-ink-2">
          <span aria-hidden className="pulse-ring size-2 rounded-full bg-teal" />
          <span id="ac-off">{loan ? "Offsetting the loan" : "In your accounts"}</span>
        </div>
        <div className="mono text-[40px] leading-tight font-semibold">
          <Count k="acct:off" value={loan ? data.offsetting : data.total} format={(v) => money(v)} />
        </div>
        <div className="text-[12.5px] text-ink-3">
          {loan
            ? `Covers ${pct(loan.balance ? data.offsetting / loan.balance : 0)} of the ${money(loan.balance)} ${loan.name.toLowerCase()}`
            : `${banks.length} ${banks.length === 1 ? "account" : "accounts"}`}
        </div>
      </Tile>
      <Tile i={1} aria-labelledby="ac-30">
        <TileTitle
          id="ac-30"
          right={<Pill tone={moved >= 0 ? "good" : "warn"}>{moved >= 0 ? "GROWING" : "DOWN"}</Pill>}
        >
          Last 30 days
        </TileTitle>
        <div className="mono text-[30px] font-semibold">{money(moved, { sign: true })}</div>
        <div
          className="flex h-2 gap-0.5 overflow-hidden rounded-full"
          role="img"
          aria-label={share.map((a) => `${a.name} ${money(a.change_30d, { sign: true })}`).join(", ")}
        >
          {share.map((a, i) => (
            <i
              key={a.id}
              className="grow-x block"
              style={
                {
                  flex: `${Math.abs(a.change_30d)} 1 0`,
                  background: a.change_30d >= 0 ? colour(a.colour) : "var(--color-out)",
                  "--i": i,
                } as CSSProperties
              }
            />
          ))}
        </div>
        <div className="mono flex flex-wrap gap-x-3.5 gap-y-1 text-[11px] text-ink-3">
          {share.map((a) => (
            <span key={a.id}>
              {a.name.toUpperCase()} {money(a.change_30d, { sign: true })}
            </span>
          ))}
        </div>
      </Tile>
      {loan && (
        <Tile i={2} aria-labelledby="ac-int">
          <TileTitle
            id="ac-int"
            right={<span className="mono text-teal">{((loan.rate_bp ?? 0) / 100).toFixed(2)}%</span>}
          >
            Interest it saves
          </TileTitle>
          <div className="flex items-baseline gap-2">
            <span className="mono text-[30px] font-semibold">
              <Count k="acct:int" value={perDay} format={(v) => money(v, { cents: true })} />
            </span>
            <span className="text-[13px] text-ink-3">a day</span>
          </div>
          <div className="text-[12.5px] text-ink-3">
            About <span className="mono text-ink">{money(perDay * 365)}</span> a year, while staying yours to spend
          </div>
        </Tile>
      )}
    </div>
  );
}

/** What an account's job comes to now, as a line and a share for its bar. */
function job(a: Account, offsetting: number): { text: string; share: number } {
  if (a.kind === "loan")
    return {
      text: `Offsets cover ${pct(a.balance ? offsetting / a.balance : 0)}`,
      share: a.balance ? offsetting / a.balance : 0,
    };
  const t = a.target;
  if (!t) return { text: "Just tracking it", share: 0 };
  if (t.kind === "loan") return { text: `Covers ${pct(t.progress)} of the loan`, share: t.progress };
  if (t.kind === "months") {
    const held = t.held ?? 0;
    return { text: `${held.toFixed(1)} months held · target ${t.months}`, share: t.months ? held / t.months : 0 };
  }
  if (t.kind === "allowance") return { text: `${money(a.balance)} of ${money(t.amount)} left`, share: t.progress };
  return t.amount
    ? { text: `${pct(t.progress, 0)} of ${money(t.amount)} in goals`, share: t.progress }
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
  const c = colour(a.colour);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onPick}
      className={cn(
        "press rise flex w-full cursor-pointer flex-col gap-2.5 rounded-tile border bg-tile p-4 text-left text-ink transition-[border-color,box-shadow,transform,background-color] duration-200 hover:-translate-y-0.5",
        loan && "border-dashed",
        on
          ? "border-[var(--c)] bg-tile-2 shadow-[0_0_0_3px_color-mix(in_srgb,var(--c)_16%,transparent)]"
          : loan
            ? "border-line-2"
            : "border-line",
      )}
      style={{ "--i": i + 3, "--c": c } as CSSProperties}
    >
      <span className="flex w-full items-center gap-2">
        <i className="size-2.5 flex-none rounded-[3px]" style={{ background: c }} />
        <b className="min-w-0 truncate text-sm font-semibold">{a.name}</b>
        <span className="mono ml-auto rounded-full bg-raised px-2 py-0.5 text-[10.5px] font-semibold tracking-[0.05em] whitespace-nowrap text-ink-2">
          {roleBadge(a, goals)}
        </span>
      </span>
      <span className="flex w-full items-baseline gap-2">
        <span className="mono text-[22px] font-semibold">{loan ? money(-a.balance) : money(a.balance)}</span>
        <span className={cn("mono ml-auto text-xs whitespace-nowrap", better ? "text-good" : "text-ink-3")}>
          {money(a.change_30d, { sign: true })} 30D
        </span>
      </span>
      <span className="block h-1.5 w-full overflow-hidden rounded-full bg-raised">
        <i
          className="grow-x block h-full rounded-full"
          style={{ width: `${Math.min(Math.max(j.share, 0), 1) * 100}%`, background: c }}
        />
      </span>
      <span className="w-full truncate text-xs text-ink-3">{j.text}</span>
    </button>
  );
}

function Detail({ account, goals }: { account: Account; goals: Goal[] }) {
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
    </Tile>
  );
}

/** The pencil by an account's name: opens Edit account. */
function EditButton({ account }: { account: Account }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button small aria-label={`Edit ${account.name}`} title="Rename or remove" onClick={() => setOpen(true)}>
        <svg
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />
        </svg>
        Edit
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} labelledBy="edit-acct-h">
        <EditAccount key={String(open)} account={account} onClose={() => setOpen(false)} />
      </Dialog>
    </>
  );
}

const SWATCHES = ["offset", "bills", "spending", "savings", "track", "teal", "rose", "sky"];

/** Rename an account, change its number or colour, or remove it (its history is kept, and it can come back). */
function EditAccount({ account, onClose }: { account: Account; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const loan = account.kind === "loan";
  const [name, setName] = useState(account.name);
  const [last4, setLast4] = useState(account.last4 ?? "");
  const [tone, setTone] = useState(account.colour);
  const [removing, setRemoving] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      apiSend<Account>("PUT", `accounts/${account.id}`, { name, last4, ...(loan ? {} : { colour: tone }) }),
    onSuccess: () => (refresh(qc), toast("Account saved"), onClose()),
  });
  const restore = useMutation({
    mutationFn: () => apiSend<Account>("POST", `accounts/${account.id}/restore`),
    onSuccess: () => (refresh(qc), navigate({ to: "/accounts", search: { id: account.id }, replace: true })),
    onError: (e) => toast(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: () => apiSend("DELETE", `accounts/${account.id}`),
    onSuccess: () => {
      onClose();
      navigate({ to: "/accounts", search: {}, replace: true });
      refresh(qc);
      toast(`${account.name} removed`, () => restore.mutate());
    },
  });
  const what = loan ? "the loan" : "this account";
  return (
    <form
      className="flex flex-col gap-5 overflow-y-auto p-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!removing && name.trim()) save.mutate();
      }}
    >
      <h2 id="edit-acct-h" key={String(removing)} className="fade-in m-0 text-xl font-semibold">
        {removing ? `Remove ${account.name}?` : loan ? "Edit the loan" : "Edit account"}
      </h2>
      {removing ? (
        <div className="fade-in flex flex-col gap-3 text-[14px] text-ink-2">
          <p className="m-0">
            It'll go from your accounts{loan ? ", and the dashboard won't show the loan" : " and totals"}
            {account.offsets_loan && !loan ? ", and stop counting against the loan" : ""}.
          </p>
          <p className="m-0">
            {account.transactions > 0
              ? `Its ${account.transactions} transactions are kept, so past spending still adds up.`
              : "Nothing's been imported into it."}{" "}
            You can bring it back under Removed accounts.
          </p>
          {remove.isError && <ErrorText>{errorMessage(remove.error)}</ErrorText>}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <div>
              <Label htmlFor="ea-name">Name, as in your banking app</Label>
              <Input
                id="ea-name"
                className="font-sans"
                autoComplete="off"
                maxLength={40}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ea-last4">Last four digits</Label>
              <Input
                id="ea-last4"
                inputMode="numeric"
                maxLength={4}
                value={last4}
                onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))}
                placeholder="2210"
              />
            </div>
          </div>
          {!loan && (
            <div>
              <Label>Colour</Label>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="radio"
                    aria-checked={tone === c}
                    aria-label={c}
                    onClick={() => setTone(c)}
                    className={cn(
                      "press size-8 cursor-pointer rounded-full border-2",
                      tone === c ? "border-ink" : "border-transparent",
                    )}
                    style={{ background: colour(c) }}
                  />
                ))}
              </div>
            </div>
          )}
          <p className="m-0 text-xs text-ink-3">Imports match statements to {what} by its last four digits.</p>
          {save.isError && <ErrorText>{errorMessage(save.error)}</ErrorText>}
        </div>
      )}
      <div className="flex flex-wrap justify-between gap-2">
        {removing ? (
          <>
            <Button onClick={() => setRemoving(false)}>Keep it</Button>
            <Button
              className="border-warn bg-warn font-semibold text-page enabled:hover:bg-warn/85"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              {remove.isPending ? "Removing…" : `Remove ${account.name}`}
            </Button>
          </>
        ) : (
          <>
            <Button className="text-warn" onClick={() => setRemoving(true)}>
              Remove {loan ? "the loan" : "account"}
            </Button>
            <span className="flex gap-2">
              <Button onClick={onClose}>Cancel</Button>
              <Button primary type="submit" disabled={!name.trim() || save.isPending}>
                {save.isPending ? "Saving…" : "Save"}
              </Button>
            </span>
          </>
        )}
      </div>
    </form>
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
      navigate({ to: "/accounts", search: { id: a.id }, replace: true });
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
