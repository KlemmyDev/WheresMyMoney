/**
 * The goal flows from the canvas: making a new goal (name, icon, how much, by when, where the money comes from, and
 * a rule for each payday), and topping one up (how much and from where, then making the transfer in uBank, since
 * the app can't move money). Money is in cents.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { ChoiceChip, EmptyState, Ring, Sheet, useSheetTop, type Role } from "~/features/common/ds";
import { dayDate, money, monthYear, parseMoney } from "~/features/common/format";
import { Chip, I, type Glyph, type Tone } from "~/features/common/icons";
import { accountsQuery, loanQuery, refresh, rulesQuery } from "~/features/common/queries";
import type { Account, Every, Goal, Rule } from "~/features/common/types";
import { Button, ErrorText, Input, Switch } from "~/features/common/ui";

export type GoalIcon = "plane" | "car" | "shield" | "home" | "kids" | "play";

export const GOAL_ICON: Record<GoalIcon, { g: Glyph; tone: Tone; role: Role }> = {
  plane: { g: I.plane, tone: "spending", role: "spending" },
  car: { g: I.car, tone: "savings", role: "savings" },
  shield: { g: I.shield, tone: "offset", role: "offset" },
  home: { g: I.loan, tone: "bills", role: "bills" },
  kids: { g: I.kids, tone: "grad", role: "accent" },
  play: { g: I.play, tone: "invest", role: "invest" },
};

const FALLBACK: GoalIcon[] = ["shield", "plane", "car", "home", "play"];

/** A goal's icon, chip tone and ring colour (goals made before icons cycle through them). */
export function goalLook(g: Goal, i = 0) {
  return GOAL_ICON[(g.icon as GoalIcon | null) ?? FALLBACK[i % FALLBACK.length]] ?? GOAL_ICON.shield;
}

const PER_YEAR: Record<Every, number> = {
  weekly: 52,
  fortnightly: 26,
  monthly: 12,
  quarterly: 4,
  term: 4,
  "half-yearly": 2,
  yearly: 1,
};

/** The household's payday: the pay rule's schedule, or fortnightly from today. */
function payday(rules: Rule[] | undefined): { every: Every; next: string } {
  const pay = rules?.find((r) => r.kind === "pay" && r.enabled);
  return pay
    ? { every: pay.every, next: pay.next_run }
    : { every: "fortnightly", next: new Date().toISOString().slice(0, 10) };
}

const firstOfMonthIn = (m: number) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + m);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};

const monthsUntil = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  return Math.max(1, (d.getFullYear() - now.getFullYear()) * 12 + d.getMonth() - now.getMonth());
};

/** The description to give the uBank transfer, so the import can match it to the goal. */
const goalRef = (name: string) =>
  `GOAL ${
    name
      .toUpperCase()
      .replace(/[^A-Z0-9 ]/g, "")
      .slice(0, 10)
      .trim() || "NEW"
  }`;

/** Where goal money comes from: the offset account(s) and the spending account. */
function sources(accounts: Account[]): Account[] {
  return accounts.filter((a) => a.kind === "bank" && (a.role === "offset" || a.role === "spending"));
}

function SourceNote({ from, perMonth, growth }: { from: Account | undefined; perMonth: number; growth: number }) {
  if (!from) return null;
  if (from.role === "spending") return <>You can spend about {money(perMonth / 30)} less each day.</>;
  if (growth > 0 && perMonth > growth)
    return (
      <span className="text-bills">
        That's more than {from.name} grows in a month (about {money(growth)}), so it would shrink. Try a later date.
      </span>
    );
  return (
    <>
      {growth > 0 ? `${from.name} grows about ${money(growth)} a month, so this fits. ` : ""}Moving it out of the offset
      costs a little loan interest.
    </>
  );
}

/* ------------------------------------------------------------------------------------------------------------ */

export function NewGoalSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="New goal">
      {open && <NewGoal onClose={onClose} />}
    </Sheet>
  );
}

const TARGETS = [200000, 500000, 1200000, 2500000];
const WHENS: [number, string][] = [
  [6, "6 months"],
  [12, "1 year"],
  [18, "18 months"],
  [36, "3 years"],
];

function NewGoal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const accounts = useQuery(accountsQuery);
  const rules = useQuery(rulesQuery);
  const loan = useQuery(loanQuery);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<GoalIcon>("home");
  const [target, setTarget] = useState(1200000);
  const [targetText, setTargetText] = useState("");
  const [months, setMonths] = useState(18);
  const [fromId, setFromId] = useState<number | null>(null);
  const [rule, setRule] = useState(true);
  const [made, setMade] = useState<{ name: string; perPay: number; rule: boolean } | null>(null);
  const top = useSheetTop<HTMLElement>(!!made);

  const all = accounts.data?.accounts ?? [];
  const savings = all.find((a) => a.role === "savings");
  const from = sources(all).find((a) => a.id === fromId) ?? sources(all)[0];
  const pay = payday(rules.data?.rules);
  const perMonth = target / months;
  const perPay = Math.round((perMonth * 12) / PER_YEAR[pay.every]);
  const growth = loan.data?.monthly_growth ?? 0;
  const byDate = firstOfMonthIn(months);

  const make = useMutation({
    mutationFn: async () => {
      if (!savings) throw new Error("Add a savings account first.");
      await apiSend("POST", "goals", {
        account_id: savings.id,
        name,
        target,
        icon,
        by_date: byDate,
        saved: 0,
      });
      if (rule && from)
        await apiSend("POST", "rules", {
          kind: "transfer",
          from_account: from.id,
          to_account: savings.id,
          amount: perPay,
          every: pay.every,
          anchor: pay.next,
          label: `Goal: ${name.trim()}`,
        });
    },
    onSuccess: () => {
      setMade({ name: name.trim(), perPay, rule: rule && !!from });
      refresh(qc);
    },
  });

  if (accounts.data && !savings)
    return (
      <div className="pb-2">
        <EmptyState g={I.savings} tone="savings" title="Goals live in a savings account">
          Add a savings account on the Accounts page first, then split it into goals here.
        </EmptyState>
      </div>
    );

  if (made)
    return (
      <div
        ref={top as React.RefObject<HTMLDivElement>}
        className="flex flex-col items-center gap-3 pt-2 pb-2 text-center"
      >
        <Chip g={GOAL_ICON[icon].g} tone={GOAL_ICON[icon].tone} size="xxl" solid />
        <h3 className="m-0 text-[22px] font-semibold">{made.name} goal made</h3>
        <p className="m-0 max-w-[400px] text-[14px] text-ink-2">
          {made.rule ? (
            <>
              A rule for {money(made.perPay)} each payday is in Rules. Set the same scheduled transfer up in uBank with
              the description <span className="mono selectable text-ink">{goalRef(made.name)}</span> so imports match
              it.
            </>
          ) : (
            "Top it up any time from Overview."
          )}
        </p>
        <div className="mt-2 flex gap-2">
          {made.rule && (
            <Link
              to="/rules"
              onClick={onClose}
              className="btn inline-flex min-h-[42px] items-center rounded-xl px-4 text-ink no-underline shadow-[inset_0_0_0_1px_var(--color-line-2)]"
            >
              See rule
            </Link>
          )}
          <Button primary onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    );

  return (
    <form
      ref={top as React.RefObject<HTMLFormElement>}
      className="flex flex-col gap-5 pb-2"
      onSubmit={(e) => {
        e.preventDefault();
        make.mutate();
      }}
    >
      <div className="flex items-center gap-3">
        <Chip g={GOAL_ICON[icon].g} tone={GOAL_ICON[icon].tone} size="xl" solid />
        <Input
          aria-label="Goal name"
          placeholder="Name it, like Kitchen"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          className="flex-1 text-[17px]"
        />
      </div>
      <div className="grid grid-cols-6 gap-1.5" role="group" aria-label="Icon">
        {(Object.keys(GOAL_ICON) as GoalIcon[]).map((k) => (
          <button
            key={k}
            type="button"
            aria-label={`Icon: ${k}`}
            aria-pressed={icon === k}
            onClick={() => setIcon(k)}
            className="chip-host press flex cursor-pointer justify-center rounded-2xl border border-line bg-tile-2 p-1 aria-pressed:border-line-2"
          >
            <Chip g={GOAL_ICON[k].g} tone={GOAL_ICON[k].tone} size="md" />
          </button>
        ))}
      </div>

      <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
        <legend className="eyebrow mb-2">How much</legend>
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
          {TARGETS.map((v) => (
            <ChoiceChip
              key={v}
              pressed={target === v && !targetText}
              onClick={() => {
                setTarget(v);
                setTargetText("");
              }}
            >
              {money(v)}
            </ChoiceChip>
          ))}
          <Input
            aria-label="Another amount"
            inputMode="decimal"
            placeholder="Other"
            value={targetText}
            onChange={(e) => {
              setTargetText(e.target.value);
              const v = parseMoney(e.target.value);
              if (v && v > 0) setTarget(v);
            }}
            className="w-28 flex-none"
          />
        </div>
      </fieldset>

      <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
        <legend className="eyebrow mb-2">By when</legend>
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
          {WHENS.map(([v, l]) => (
            <ChoiceChip key={v} pressed={months === v} onClick={() => setMonths(v)}>
              {l}
            </ChoiceChip>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl bg-sunken p-3.5">
          <div className="eyebrow">Each payday</div>
          <div className="num text-[22px]">{money(perPay)}</div>
          <div className="text-[13px] text-ink-3">{pay.every}</div>
        </div>
        <div className="rounded-2xl bg-sunken p-3.5">
          <div className="eyebrow">Ready</div>
          <div className="num text-[22px]">{monthYear(byDate)}</div>
          <div className="text-[13px] text-ink-3">{money(perMonth)} a month</div>
        </div>
      </div>

      {sources(all).length > 0 && (
        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="eyebrow mb-2">From</legend>
          <div className="flex flex-wrap gap-2">
            {sources(all).map((a) => (
              <ChoiceChip
                key={a.id}
                pressed={from?.id === a.id}
                onClick={() => setFromId(a.id)}
                g={a.role === "offset" ? I.offset : I.spending}
                tone={a.role === "offset" ? "offset" : "spending"}
                role={a.role === "offset" ? "offset" : "spending"}
              >
                {a.name}
              </ChoiceChip>
            ))}
          </div>
          <p className="m-0 text-[13px] text-ink-3">
            <SourceNote from={from} perMonth={perMonth} growth={growth} />
          </p>
        </fieldset>
      )}

      <label className="flex items-center gap-3 rounded-2xl border border-line p-3.5">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Add a rule for it</span>
          <span className="block text-[13px] text-ink-3">
            {rule && from
              ? `${money(perPay)} from ${from.name} to ${savings?.name ?? "Savings"} each payday`
              : "You'll top it up when you like"}
          </span>
        </span>
        <Switch checked={rule} onChange={setRule} label="Add a rule for it" />
      </label>

      {make.isError && <ErrorText>{errorMessage(make.error)}</ErrorText>}
      <Button primary type="submit" disabled={!name.trim() || make.isPending}>
        {make.isPending ? "Making it…" : `Make the goal · ${money(target)}`}
      </Button>
    </form>
  );
}

/* ------------------------------------------------------------------------------------------------------------ */

export function TopUpSheet({ goal, index = 0, onClose }: { goal: Goal | null; index?: number; onClose: () => void }) {
  return (
    <Sheet open={!!goal} onClose={onClose} title={goal ? `Top up ${goal.name}` : ""}>
      {goal && <TopUp key={goal.id} goal={goal} index={index} onClose={onClose} />}
    </Sheet>
  );
}

const AMOUNTS = [5000, 10000, 25000, 50000, 100000];

function TopUp({ goal, index, onClose }: { goal: Goal; index: number; onClose: () => void }) {
  const qc = useQueryClient();
  const accounts = useQuery(accountsQuery);
  const rules = useQuery(rulesQuery);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const top = useSheetTop(step);
  const [amt, setAmt] = useState(10000);
  const [amtText, setAmtText] = useState("");
  const [fromId, setFromId] = useState<number | null>(null);
  const [every, setEvery] = useState(false);
  const [later, setLater] = useState(false);
  // Where the ring ended up, fixed when it's saved (the goal refetches with the top-up already in it).
  const [result, setResult] = useState(0);
  const [resultAfter, setResultAfter] = useState<number | null>(null);

  const look = goalLook(goal, index);
  const all = accounts.data?.accounts ?? [];
  const savings = all.find((a) => a.id === goal.account_id);
  const from = sources(all).find((a) => a.id === fromId) ?? sources(all)[0];
  const pay = payday(rules.data?.rules);
  const pct = (v: number) => (goal.target ? Math.min(100, (v / goal.target) * 100) : 0);
  const nowP = pct(goal.saved);
  const newP = pct(goal.saved + amt);
  const ref = goal.ref || goalRef(goal.name);
  // How soon it's reached: at the pace its date asks for, plus this every payday if it repeats.
  const left = Math.max(0, goal.target - goal.saved);
  const due = goal.by_date ? monthsUntil(goal.by_date) : null;
  const pace = due ? left / due : 0;
  const after = due
    ? Math.ceil(Math.max(0, left - amt) / (pace + (every ? (amt * PER_YEAR[pay.every]) / 12 : 0) || 1))
    : null;
  const sooner = due != null && after != null ? due - after : 0;

  const save = useMutation({
    mutationFn: async (moved: boolean) => {
      await apiSend("POST", `goals/${goal.id}/top_up`, { amount: amt, moved });
      if (every && from && savings)
        await apiSend("POST", "rules", {
          kind: "transfer",
          from_account: from.id,
          to_account: savings.id,
          amount: amt,
          every: pay.every,
          anchor: pay.next,
          label: `Goal: ${goal.name}`,
        });
    },
    onSuccess: (_, moved) => {
      setLater(!moved);
      setResult(moved ? newP : nowP);
      setResultAfter(after);
      setStep(3);
      refresh(qc);
    },
  });

  const steps = (
    <ol className="m-0 flex list-none gap-1.5 p-0 text-[12px] font-semibold" aria-label="Steps">
      {["How much", "Move it in uBank", "Done"].map((l, i) => {
        const state = step === i + 1 ? "now" : step > i + 1 ? "done" : "todo";
        return (
          <li
            key={l}
            aria-current={state === "now" ? "step" : undefined}
            className={
              state === "now"
                ? "rounded-full bg-accent-fill px-3 py-1 text-on-solid"
                : state === "done"
                  ? "rounded-full bg-raised px-3 py-1 text-ink-2"
                  : "rounded-full px-3 py-1 text-ink-3 shadow-[inset_0_0_0_1px_var(--color-line)]"
            }
          >
            {i + 1} {l}
          </li>
        );
      })}
    </ol>
  );

  if (step === 3)
    return (
      <div ref={top} className="flex flex-col items-center gap-3 pt-2 pb-2 text-center">
        <Ring value={result} role={look.role} size={96} label={`${goal.name} ${Math.round(result)}%`}>
          <span className="num text-[18px]">{Math.round(result)}%</span>
        </Ring>
        <h3 className="m-0 text-[22px] font-semibold">
          {later ? `Planned: ${money(amt)} to ${goal.name}` : `${money(amt)} added to ${goal.name}`}
        </h3>
        <p className="m-0 max-w-[400px] text-[14px] text-ink-2">
          {later
            ? `It waits as planned, not counted yet. When the transfer shows in an imported statement as ${ref}, it's counted; or tap the goal and choose I've moved it.`
            : `${goal.name} is now ${Math.round(result)}% of the way${resultAfter != null ? `, reached about ${monthYear(firstOfMonthIn(resultAfter))}` : ""}.`}
          {every && " A rule for it each payday is in Rules."}
        </p>
        <div className="mt-2 flex gap-2">
          <Button onClick={() => setStep(1)}>Top up again</Button>
          <Button primary onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    );

  if (step === 2)
    return (
      <div ref={top} className="flex flex-col gap-4 pb-2">
        {steps}
        <p className="m-0 text-[14px] text-ink-2">
          WheresMyMoney can't move money for you. Make this transfer in the uBank app, then come back.
        </p>
        <div className="flex items-center justify-between gap-3 rounded-[20px] bg-sunken p-4">
          <span className="flex min-w-0 flex-col items-center gap-1.5 text-[13px]">
            <Chip
              g={from?.role === "spending" ? I.spending : I.offset}
              tone={from?.role === "spending" ? "spending" : "offset"}
              size="lg"
            />
            {from?.name}
          </span>
          <span className="flex flex-1 flex-col items-center">
            <span className="num text-[20px]">{money(amt)}</span>
            <span aria-hidden className="h-px w-full bg-line-2" />
          </span>
          <span className="flex min-w-0 flex-col items-center gap-1.5 text-[13px]">
            <Chip g={I.savings} tone="savings" size="lg" />
            {savings?.name ?? "Savings"}
          </span>
        </div>
        <ol className="m-0 flex list-none flex-col p-0">
          {[
            <>
              Open uBank and choose <b>Transfer between my accounts</b>
            </>,
            <>
              From {from?.name} to {savings?.name ?? "Savings"}, {money(amt)}
              <span className="block text-[13px] text-ink-3">
                {every ? `Make it a scheduled transfer, ${pay.every} from ${pay.next}.` : "A one-off transfer."}
              </span>
            </>,
            <>
              Description: <span className="mono selectable">{ref}</span>
              <span className="block text-[13px] text-ink-3">So the statement import matches it to this goal.</span>
            </>,
          ].map((t, i) => (
            <li key={i} className="flex items-start gap-3 border-t border-line py-3">
              <b className="mono flex size-[26px] flex-none items-center justify-center rounded-full bg-accent-fill/15 text-[12px] text-teal">
                {i + 1}
              </b>
              <span className="text-[14px]">{t}</span>
            </li>
          ))}
        </ol>
        {save.isError && <ErrorText>{errorMessage(save.error)}</ErrorText>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={() => setStep(1)}>Back</Button>
          <Button onClick={() => save.mutate(false)} disabled={save.isPending}>
            I'll do it later
          </Button>
          <Button primary onClick={() => save.mutate(true)} disabled={save.isPending}>
            I've moved it
          </Button>
        </div>
      </div>
    );

  return (
    <div ref={top} className="flex flex-col gap-5 pb-2">
      {steps}
      {goal.planned.length > 0 && <Planned goal={goal} />}
      <div className="flex items-center gap-4">
        <Ring
          value={nowP}
          extra={newP - nowP}
          role={look.role}
          size={96}
          label={`${goal.name}: ${Math.round(nowP)}% now, ${Math.round(newP)}% after this top-up`}
        >
          <span className="flex flex-col items-center leading-tight">
            <span className="num text-[18px]">{Math.round(newP)}%</span>
            <span className="text-[11px] text-ink-3">was {Math.round(nowP)}%</span>
          </span>
        </Ring>
        <div className="min-w-0 text-[14px]">
          <div className="text-ink-3">Saved after</div>
          <div className="num text-[20px]">
            {money(goal.saved + amt)} <span className="text-[14px] text-ink-3">of {money(goal.target)}</span>
          </div>
          {after != null && (
            <div className="mt-1 text-ink-2">
              Reached {monthYear(firstOfMonthIn(after))}
              <span className="text-savings">
                {" "}
                · {sooner > 0 ? `${sooner} ${sooner === 1 ? "month" : "months"} sooner` : "same month as before"}
              </span>
            </div>
          )}
        </div>
      </div>

      <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
        <legend className="eyebrow mb-2">How much?</legend>
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
          {AMOUNTS.map((v) => (
            <ChoiceChip
              key={v}
              pressed={amt === v && !amtText}
              onClick={() => {
                setAmt(v);
                setAmtText("");
              }}
            >
              +{money(v)}
            </ChoiceChip>
          ))}
          <Input
            aria-label="Another amount"
            inputMode="decimal"
            placeholder="Other"
            value={amtText}
            onChange={(e) => {
              setAmtText(e.target.value);
              const v = parseMoney(e.target.value);
              if (v && v > 0) setAmt(v);
            }}
            className="w-28 flex-none"
          />
        </div>
      </fieldset>

      {sources(all).length > 0 && (
        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="eyebrow mb-2">From</legend>
          <div className="flex flex-col gap-1">
            {sources(all).map((a) => (
              <button
                key={a.id}
                type="button"
                aria-pressed={from?.id === a.id}
                onClick={() => setFromId(a.id)}
                className="chip-host press flex cursor-pointer items-center gap-3 rounded-2xl border border-line bg-transparent p-3 text-left text-ink aria-pressed:border-line-2 aria-pressed:bg-tile-2"
              >
                <Chip
                  g={a.role === "offset" ? I.offset : I.spending}
                  tone={a.role === "offset" ? "offset" : "spending"}
                  size="lg"
                />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{a.name}</span>
                  <span className="block text-[13px] text-ink-3">
                    {money(a.balance)} ·{" "}
                    {a.role === "offset"
                      ? "costs a little loan interest"
                      : `you can spend ${money(amt / 24)} less each day`}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </fieldset>
      )}

      <label className="flex items-center gap-3 rounded-2xl border border-line p-3.5">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Do this every payday</span>
          <span className="block text-[13px] text-ink-3">
            Adds a rule. Set the same scheduled transfer up in uBank, and the app checks it lands.
          </span>
        </span>
        <Switch checked={every} onChange={setEvery} label="Do this every payday" />
      </label>

      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button primary onClick={() => setStep(2)} disabled={!from}>
          Next: move it in uBank
        </Button>
      </div>
    </div>
  );
}

/** Top-ups planned for a goal but not moved yet: mark one moved, or drop it. */
function Planned({ goal }: { goal: Goal }) {
  const qc = useQueryClient();
  const settle = useMutation({
    mutationFn: ({ id, moved }: { id: number; moved: boolean }) => apiSend("POST", `goals/moves/${id}`, { moved }),
    onSuccess: () => refresh(qc),
  });
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-tile-2 p-3">
      <div className="text-[13px] font-semibold">Planned, not moved yet</div>
      {goal.planned.map((m) => (
        <div key={m.id} className="flex flex-wrap items-center gap-2">
          <span className="min-w-0 flex-1 text-[14px]">
            <span className="num">{money(m.amount)}</span>{" "}
            <span className="text-[12px] text-ink-3">since {dayDate(m.date)}</span>
          </span>
          <Button small onClick={() => settle.mutate({ id: m.id, moved: false })} disabled={settle.isPending}>
            Not happening
          </Button>
          <Button small primary onClick={() => settle.mutate({ id: m.id, moved: true })} disabled={settle.isPending}>
            I've moved it
          </Button>
        </div>
      ))}
      <p className="m-0 text-[12px] text-ink-3">An imported transfer described as {goal.ref} counts it too.</p>
      {settle.isError && <ErrorText>{errorMessage(settle.error)}</ErrorText>}
    </div>
  );
}
