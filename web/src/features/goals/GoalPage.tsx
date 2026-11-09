/**
 * One savings goal (the uplift canvas's EdGoal, on the entity template): how far along it is and when it's likely
 * reached in a sentence, Top up, and Change: its name, target, the month it's wanted by and what goes in each pay,
 * with the likely finish moving as you type. Remove keeps the money in the account (and stops its pay-day move),
 * with Undo. Once it's fully saved, it asks what happens to the money now.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { apiGet, apiSend, errorMessage } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { Card, CardHead, ChoiceChip, ROLE } from "~/features/common/ds";
import { ScrubChart } from "~/features/common/ScrubChart";
import { EditPanel, EntityHeader, EntityHero, LikelyCard } from "~/features/common/entity";
import { dayDate, editable, money, monthYear, parseMoney, pct, todayIso } from "~/features/common/format";
import { Chip } from "~/features/common/icons";
import { useToast } from "~/features/common/overlay";
import { accountsQuery, refresh, rulesQuery } from "~/features/common/queries";
import type { Goal, Rule } from "~/features/common/types";
import { Button, Empty, Input, Label } from "~/features/common/ui";
import { PER_YEAR, TopUpSheet, goalLook, goalRef, payday, sources } from "~/features/goals/GoalFlows";

/** The goal's own pay-day transfer: an enabled transfer rule named for it. */
function goalRule(rules: Rule[] | undefined, goal: Goal): Rule | undefined {
  return rules?.find(
    (r) => r.kind === "transfer" && r.enabled && r.label.toLowerCase().includes(goal.name.toLowerCase()),
  );
}

/** "2026-11" plus some months. */
function monthOn(months: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Months between this month and "2027-06" (at least one). */
function monthsTo(ym: string): number {
  const now = new Date();
  const [y, m] = ym.split("-").map(Number);
  return Math.max(1, (y - now.getFullYear()) * 12 + (m - (now.getMonth() + 1)));
}

/** When a goal is likely reached at so much a pay: the month, or null if nothing goes in. */
function finish(left: number, perPay: number, every: keyof typeof PER_YEAR): string | null {
  if (left <= 0) return monthOn(0);
  if (perPay <= 0) return null;
  const perMonth = (perPay * PER_YEAR[every]) / 12;
  return monthOn(Math.ceil(left / perMonth));
}

const OUTCOMES = [
  { value: "kept", title: "Keep it in Savings", note: "It stays put, ready for when you spend it." },
  { value: "spent", title: "We've spent it", note: "The trip's booked, the car's bought. The goal is done." },
  {
    value: "offset",
    title: "Move it to the offset",
    note: "Make the transfer in uBank; it saves interest until then.",
  },
] as const;

export function GoalPage({ id }: { id: number }) {
  const accounts = useQuery(accountsQuery);
  const rules = useQuery(rulesQuery);
  const [editing, setEditing] = useState(false);
  const [topUp, setTopUp] = useState(false);
  const goals = accounts.data?.goals ?? [];
  const index = goals.findIndex((g) => g.id === id);
  const goal = goals[index];
  const name = goal?.name;
  useEffect(() => {
    if (name) document.title = `${name} · WheresMyMoney`;
  }, [name]);
  if (!accounts.data) return <Loading />;
  if (!goal)
    return (
      <Empty
        title="That goal isn't here any more"
        action={
          <Link to="/accounts" className="text-teal">
            See the accounts
          </Link>
        }
      >
        It may have been removed.
      </Empty>
    );
  const look = goalLook(goal, index);
  const account = accounts.data.accounts.find((a) => a.id === goal.account_id);
  const pay = payday(rules.data?.rules);
  const rule = goalRule(rules.data?.rules, goal);
  const perPay = rule?.amount ?? 0;
  const left = Math.max(0, goal.target - goal.saved);
  const likely = finish(left, perPay, pay.every);
  const wanted = goal.by_date?.slice(0, 7) ?? null;
  const full = goal.saved >= goal.target;
  const others = goals.filter((g) => g.account_id === goal.account_id);
  const free = (account?.balance ?? 0) - others.reduce((s, g) => s + g.saved, 0);

  return (
    <>
      <EntityHeader
        back={account ? { to: `/accounts/${account.id}`, label: account.name } : { to: "/accounts", label: "Accounts" }}
        mark={<Chip g={look.g} tone={look.tone} size="xl" solid />}
        title={goal.name}
        sub={[
          goal.reached_at ? "Reached" : `${pct(goal.target ? goal.saved / goal.target : 0, 0)} saved`,
          wanted ? `wanted by the end of ${monthYear(wanted)}` : null,
          account ? `in ${account.name}` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <Button onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
              Change
            </Button>
            {!goal.reached_at && !full && (
              <Button primary onClick={() => setTopUp(true)}>
                Top up
              </Button>
            )}
          </>
        }
      />
      <EditGoal key={String(editing)} goal={goal} rule={rule} open={editing} onClose={() => setEditing(false)} />

      {full && !goal.reached_at && <Reached goal={goal} rule={rule} />}

      <EntityHero
        tint="savings"
        label={`${goal.name} in a sentence`}
        numbers={[
          { label: "Saved", value: money(goal.saved), note: `of ${money(goal.target)}` },
          {
            label: "Still to go",
            value: money(left),
            note: perPay ? `${money(perPay)} a pay` : "nothing each pay yet",
          },
          {
            label: "Likely reached",
            value: likely ? monthYear(likely) : "Not yet",
            note: perPay ? `at ${money(perPay)} a pay` : "add something each pay",
          },
          { label: "Wanted by", value: wanted ? monthYear(wanted) : "Any time", note: "end of the month" },
        ]}
      >
        <p className="m-0 text-[17px] leading-relaxed text-ink">
          {goal.reached_at ? (
            <>
              {goal.name} was reached: <b>{money(goal.saved)}</b> saved.{" "}
              {goal.outcome === "spent"
                ? "The money's been spent on it."
                : goal.outcome === "offset"
                  ? "The money went to the offset."
                  : `It's still in ${account?.name ?? "Savings"}.`}
            </>
          ) : (
            <>
              {goal.name} is <b>{pct(goal.target ? goal.saved / goal.target : 0, 0)} saved</b>: {money(goal.saved)} of{" "}
              {money(goal.target)}.
            </>
          )}
        </p>
        {!goal.reached_at && (
          <p className="m-0 text-[15px] text-ink-2">
            {full
              ? "It's fully saved."
              : likely
                ? `At ${money(perPay)} each pay it's likely reached in ${monthYear(likely)}${
                    wanted
                      ? likely === wanted
                        ? ", just in time"
                        : likely < wanted
                          ? `, in time for ${monthYear(wanted)}`
                          : `, after ${monthYear(wanted)}`
                      : ""
                  }.`
                : "Nothing goes in each pay yet. Change it to add an amount, or top it up now and then."}
          </p>
        )}
      </EntityHero>

      {!goal.reached_at && (
        <div className="grid gap-4 md:grid-cols-12 [&>*]:min-w-0">
          <SavedOverTime goal={goal} />
          <LikelyCard
            id="gp-likely"
            className="md:col-span-4"
            notReady={
              perPay || full
                ? undefined
                : "Nothing goes in each pay yet, so there's no finish to see. Change it to add an amount."
            }
            now={
              perPay || full
                ? {
                    label: "Reached",
                    total: likely ? monthYear(likely) : "Not yet",
                    bar: {
                      label: `${money(goal.saved)} saved of ${money(goal.target)}`,
                      max: goal.target || 1,
                      segments: [
                        { value: Math.min(goal.saved, goal.target), role: "savings" },
                        { value: Math.max(goal.target - goal.saved, 0), role: "savings", likely: true },
                      ],
                    },
                    text: full
                      ? "It's fully saved."
                      : `At ${money(perPay)} each pay, about ${Math.ceil(left / perPay)} more pays.`,
                  }
                : undefined
            }
            next={
              perPay && !full
                ? {
                    label: "Next top-up",
                    total: money(perPay),
                    text: `${dayDate(pay.next)}, from the offset by your pay-day rule.`,
                  }
                : undefined
            }
          />
          {!full && <BringForward left={left} perPay={perPay} every={pay.every} wanted={wanted} />}
          <TopUps goalId={goal.id} />
          <Card aria-labelledby="gp-plan" className="flex flex-col gap-1 md:col-span-6">
            <CardHead id="gp-plan" title="The plan" />
            <PlanRow label="Target" value={money(goal.target)} />
            <PlanRow label="By" value={wanted ? `End of ${monthYear(wanted)}` : "Any time"} />
            <PlanRow label="Pay-day move" value={perPay ? `${money(perPay)} each pay` : "None yet"} />
            <PlanRow
              label={`Held in ${account?.name ?? "Savings"}`}
              value={account?.offsets_loan ? "Still offsetting the loan" : "Not offsetting the loan"}
            />
          </Card>
        </div>
      )}

      <Card aria-labelledby="gp-others" className="flex flex-col gap-2">
        <CardHead
          id="gp-others"
          title={`Goals in ${account?.name ?? "Savings"}`}
          right={<span className="text-[13px] text-ink-3">{money(Math.max(free, 0))} not in a goal</span>}
        />
        <ul className="m-0 flex list-none flex-col p-0">
          {others.map((g) => (
            <li
              key={g.id}
              className="flex min-h-11 items-center justify-between gap-3 border-b border-line last:border-b-0"
            >
              <Link
                to="/goals/$goalId"
                params={{ goalId: String(g.id) }}
                className={
                  g.id === goal.id ? "font-semibold text-ink no-underline" : "text-ink no-underline hover:underline"
                }
              >
                {g.name}
              </Link>
              <span className="num text-[14px] text-ink-2">
                {money(g.saved)} of {money(g.target)}
              </span>
            </li>
          ))}
        </ul>
        <p className="m-0 text-[13px] text-ink-3">
          Pay-day moves come from the offset{rule ? ` (${money(rule.amount)} for ${goal.name})` : ""}. The app reminds
          you to make each move in uBank and matches it when a statement comes in, as{" "}
          <span className="mono">{goal.ref || goalRef(goal.name)}</span>.
        </p>
      </Card>

      <TopUpSheet goal={topUp ? goal : null} index={index} onClose={() => setTopUp(false)} />
    </>
  );
}

/** Saved over time: the top-ups added up, month by month, ending at what's saved now. */
function SavedOverTime({ goal }: { goal: Goal }) {
  const q = useQuery({
    queryKey: ["goals", goal.id],
    queryFn: ({ signal }) => apiGet<GoalDetail>(`goals/${goal.id}`, undefined, { signal }),
  });
  const moves = (q.data?.moves ?? []).filter((m) => m.status !== "planned");
  // Twelve months back from now: saved at the end of each, working back from today's total.
  const months = Array.from({ length: 12 }, (_, i) => monthOn(i - 11));
  const after = (m: string) => moves.filter((x) => x.date.slice(0, 7) > m).reduce((t, x) => t + x.amount, 0);
  const values = months.map((m) => Math.max(goal.saved - after(m), 0));
  return (
    <Card aria-labelledby="gp-saved" className="flex flex-col gap-3 md:col-span-8">
      <CardHead
        id="gp-saved"
        title="Saved over time"
        right={<span className="text-[13px] text-ink-3">target {money(goal.target)}</span>}
      />
      <ScrubChart
        label={`${goal.name} saved each month, now ${money(goal.saved)} of ${money(goal.target)}`}
        lines={[{ name: "Saved", values, colour: ROLE.savings, fill: true }]}
        at={(i) => (i === months.length - 1 ? "Now" : monthYear(months[i]))}
        format={(v) => money(v)}
        floor={0}
        height={180}
        axis={[0, 6, 11]}
      />
      <p className="m-0 text-[12px] text-ink-3">
        From the top-ups below; changes made by hand show as the starting amount.
      </p>
    </Card>
  );
}

/** What a little more each pay would do to the finish. */
function BringForward({
  left,
  perPay,
  every,
  wanted,
}: {
  left: number;
  perPay: number;
  every: keyof typeof PER_YEAR;
  wanted: string | null;
}) {
  const steps = [0, 2500, 5000, 10000].map((x) => perPay + x).filter((x) => x > 0);
  return (
    <Card aria-labelledby="gp-forward" className="flex flex-col gap-1 md:col-span-6">
      <CardHead id="gp-forward" title="What would bring it forward" />
      {steps.map((x) => {
        const when = finish(left, x, every);
        return (
          <div
            key={x}
            className="flex min-h-11 items-center justify-between gap-3 border-b border-line text-[14px] last:border-b-0"
          >
            <span className="text-ink-2">
              {money(x)} each pay{x === perPay ? " (now)" : ` (+${money(x - perPay)})`}
            </span>
            <span className={`num ${wanted && when && when <= wanted ? "text-savings" : ""}`}>
              {when ? `Reached ${monthYear(when)}` : "—"}
            </span>
          </div>
        );
      })}
      <p className="m-0 text-[12px] text-ink-3">Change it to pick a new amount; the pay-day rule follows.</p>
    </Card>
  );
}

function TopUps({ goalId }: { goalId: number }) {
  const q = useQuery({
    queryKey: ["goals", goalId],
    queryFn: ({ signal }) => apiGet<GoalDetail>(`goals/${goalId}`, undefined, { signal }),
  });
  const moves = q.data?.moves ?? [];
  return (
    <Card aria-labelledby="gp-tops" className="flex flex-col gap-1 md:col-span-6">
      <CardHead
        id="gp-tops"
        title="Top-ups"
        right={<span className="text-[13px] text-ink-3">matched on import</span>}
      />
      {moves.slice(0, 8).map((m) => (
        <div
          key={m.id}
          className="flex min-h-11 items-center justify-between gap-3 border-b border-line text-[14px] last:border-b-0"
        >
          <span>
            {dayDate(m.date)}
            <span className="block text-[12px] text-ink-3">
              {m.status === "matched"
                ? "From a statement"
                : m.status === "planned"
                  ? "Planned, not moved yet"
                  : "Moved"}
            </span>
          </span>
          <span className="num">+{money(m.amount)}</span>
        </div>
      ))}
      {!moves.length && <p className="m-0 text-[13px] text-ink-3">None yet.</p>}
    </Card>
  );
}

function PlanRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-h-10 items-center justify-between gap-3 border-b border-line text-[14px] last:border-b-0">
      <span className="text-ink-2">{label}</span>
      <span>{value}</span>
    </div>
  );
}

type GoalDetail = Goal & {
  moves: { id: number; date: string; amount: number; status: "moved" | "matched" | "planned" }[];
};

/**
 * Change the goal in the entity edit panel: name, target, the month it's wanted by and what goes in each pay. The
 * likely finish moves as you type, and if the wanted month is missed it offers the amount a pay that gets there.
 * Remove keeps the money in the account and stops its pay-day move, with Undo for both.
 */
function EditGoal({ goal, rule, open, onClose }: { goal: Goal; rule?: Rule; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const accounts = useQuery(accountsQuery);
  const rules = useQuery(rulesQuery);
  const pay = payday(rules.data?.rules);
  const [name, setName] = useState(goal.name);
  const [target, setTarget] = useState(editable(goal.target));
  const [by, setBy] = useState(goal.by_date?.slice(0, 7) ?? "");
  const [perPay, setPerPay] = useState(editable(rule?.amount ?? 0));
  const cents = parseMoney(target);
  const each = parseMoney(perPay) ?? 0;
  const left = Math.max(0, (cents ?? goal.target) - goal.saved);
  const likely = finish(left, each, pay.every);
  const pays = by ? (monthsTo(by) * PER_YEAR[pay.every]) / 12 : 0;
  const need = by && left > 0 ? Math.ceil(left / Math.max(pays, 1) / 100) * 100 : null;
  const byDate = by ? `${by}-28` : null;
  const changed =
    name.trim() !== goal.name ||
    cents !== goal.target ||
    (by || null) !== (goal.by_date?.slice(0, 7) ?? null) ||
    each !== (rule?.amount ?? 0);
  const from =
    sources(accounts.data?.accounts ?? []).find((a) => a.role === "offset") ??
    sources(accounts.data?.accounts ?? [])[0];

  const save = useMutation({
    mutationFn: async () => {
      await apiSend("PUT", `goals/${goal.id}`, { name: name.trim(), target: cents, by_date: byDate });
      const label = `Goal: ${name.trim()}`;
      if (rule && each !== rule.amount)
        await apiSend("PUT", `rules/${rule.id}`, { ...rule, amount: each || rule.amount, enabled: each > 0, label });
      else if (rule && name.trim() !== goal.name) await apiSend("PUT", `rules/${rule.id}`, { ...rule, label });
      else if (!rule && each > 0 && from)
        await apiSend("POST", "rules", {
          kind: "transfer",
          from_account: from.id,
          to_account: goal.account_id,
          amount: each,
          every: pay.every,
          anchor: pay.next,
          label,
        });
    },
    onSuccess: () => {
      refresh(qc);
      onClose();
      toast(`${name.trim()} saved`);
    },
  });
  const remove = useMutation({
    mutationFn: async () => {
      await apiSend("DELETE", `goals/${goal.id}`);
      if (rule) await apiSend("PUT", `rules/${rule.id}`, { ...rule, enabled: false });
    },
    onSuccess: () => {
      refresh(qc);
      navigate({ to: "/accounts/$accountId", params: { accountId: String(goal.account_id) } });
      // Undo outlives this page, so it's a plain call.
      toast(`${goal.name} removed; its ${money(goal.saved)} is still in Savings`, () =>
        apiSend("POST", `goals/${goal.id}/restore`)
          .then(() => (rule ? apiSend("PUT", `rules/${rule.id}`, { ...rule, enabled: true }) : null))
          .then(() => {
            refresh(qc);
            return navigate({ to: "/goals/$goalId", params: { goalId: String(goal.id) } });
          })
          .catch((e) => toast(errorMessage(e))),
      );
    },
  });

  return (
    <EditPanel
      open={open}
      onClose={onClose}
      title={`Change ${goal.name}`}
      onSave={() => save.mutate()}
      canSave={changed && !!name.trim() && cents != null && cents > 0}
      saving={save.isPending || remove.isPending}
      remove={{ label: "Remove goal", onClick: () => remove.mutate() }}
      error={save.isError || remove.isError ? errorMessage(save.error ?? remove.error) : undefined}
    >
      <p className="m-0 text-[13px] text-ink-3">The finish date moves as you type. Money already saved stays put.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="g-name">Name</Label>
          <Input id="g-name" className="font-sans" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="g-target">Target</Label>
          <Input id="g-target" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} />
          <div className="mt-1 text-[12px] text-ink-3">{money(goal.saved)} saved so far</div>
        </div>
        <div>
          <Label htmlFor="g-by">Want it by the end of</Label>
          <Input id="g-by" type="month" min={monthOn(0)} value={by} onChange={(e) => setBy(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="g-pay">Each pay{from ? `, from ${from.name}` : ""}</Label>
          <Input id="g-pay" inputMode="decimal" value={perPay} onChange={(e) => setPerPay(e.target.value)} />
          <div className="mt-1 text-[12px] text-ink-3">About {money((each * PER_YEAR[pay.every]) / 12)} a month.</div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[14px]">
        <span className="text-ink-2">Likely finished:</span>
        <b className="text-ink">{likely ? monthYear(likely) : "never, at nothing a pay"}</b>
        {by && likely && likely > by && need != null && (
          <>
            <span className="text-ink-3">
              · About {money(need)} a pay gets there by the end of {monthYear(by)}.
            </span>
            <ChoiceChip pressed={false} onClick={() => setPerPay(editable(need))}>
              Use {money(need)}
            </ChoiceChip>
          </>
        )}
      </div>
      <p className="m-0 text-[13px] text-ink-3">
        Removing keeps the {money(goal.saved)} in Savings, just not in a goal
        {rule ? `, and the ${money(rule.amount)} pay-day move stops` : ""}.
      </p>
    </EditPanel>
  );
}

/**
 * The goal is fully saved: what happens to the money now (keep it, it's spent, or to the offset). Choosing one marks
 * it reached and stops its pay-day move, with Undo.
 */
function Reached({ goal, rule }: { goal: Goal; rule?: Rule }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [pick, setPick] = useState<(typeof OUTCOMES)[number]["value"]>("kept");
  const reach = useMutation({
    mutationFn: async () => {
      await apiSend("POST", `goals/${goal.id}/reached`, { outcome: pick });
      if (rule) await apiSend("PUT", `rules/${rule.id}`, { ...rule, enabled: false });
    },
    onSuccess: () => {
      refresh(qc);
      toast(`${goal.name} reached`, () =>
        apiSend("POST", `goals/${goal.id}/reached`, { outcome: null })
          .then(() => (rule ? apiSend("PUT", `rules/${rule.id}`, { ...rule, enabled: true }) : null))
          .then(() => refresh(qc))
          .catch((e) => toast(errorMessage(e))),
      );
    },
    onError: (e) => toast(errorMessage(e)),
  });
  return (
    <Card lit tint="savings" aria-labelledby="gp-reached" className="flex flex-col gap-3">
      <CardHead id="gp-reached" title="Goal reached" />
      <p className="m-0 text-[15px] text-ink">
        {goal.name} is fully saved: {money(goal.target)}
        {goal.by_date && todayIso() < goal.by_date ? `, before the end of ${monthYear(goal.by_date.slice(0, 7))}` : ""}.
        What should happen to the money now?
      </p>
      <div role="radiogroup" aria-label="What happens to the money" className="grid gap-2 sm:grid-cols-3">
        {OUTCOMES.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={pick === o.value}
            onClick={() => setPick(o.value)}
            className={
              "press flex cursor-pointer flex-col gap-1 rounded-2xl border p-3 text-left " +
              (pick === o.value ? "border-savings bg-savings/10 text-ink" : "border-line-2 bg-transparent text-ink-2")
            }
          >
            <span className="text-[14px] font-semibold text-ink">{o.title}</span>
            <span className="text-[13px]">{o.note}</span>
          </button>
        ))}
      </div>
      <div className="flex justify-end">
        <Button primary disabled={reach.isPending} onClick={() => reach.mutate()}>
          Mark it reached
        </Button>
      </div>
    </Card>
  );
}
