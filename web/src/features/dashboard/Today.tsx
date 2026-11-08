/**
 * Beside the account total on the Overview, in plain words: how much is left to spend this month, whether the bills
 * are covered until pay day, and whether anything needs you. It answers the everyday questions before any of the
 * detail below it.
 */
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Card, ChoiceChip, Eyebrow, Term } from "~/features/common/ds";
import { dayDate, money, parseDate } from "~/features/common/format";
import { Chip, I, type Glyph, type Tone } from "~/features/common/icons";
import { useActions } from "~/features/common/layout";
import type { Dashboard } from "~/features/common/types";
import { Button } from "~/features/common/ui";
import type { Month } from "~/features/dashboard/DashboardPage";

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

/** Within this of the plan counts as about right. */
const NEAR = 5000;

/** Whether spending is on track: near the plan, and every category within its budget (and none racing ahead). */
function onTrack(s: NonNullable<Dashboard["spending"]>): { ok: boolean; title: string; budgets: string } {
  const budgeted = s.categories.filter((c) => c.budget);
  const over = budgeted.filter((c) => c.spent > (c.budget ?? 0));
  const close = budgeted.filter(
    (c) => c.spent <= (c.budget ?? 0) && c.spent > (c.budget ?? 0) * Math.min(1, s.pace + 0.2),
  );
  const list = (cs: typeof budgeted) =>
    cs.length > 2
      ? `${cs
          .slice(0, 2)
          .map((c) => c.name)
          .join(", ")} and ${cs.length - 2} more`
      : cs.map((c) => c.name).join(" and ");
  const budgets = over.length
    ? `Over budget: ${list(over)}.`
    : close.length
      ? `${list(close)} ${close.length === 1 ? "is" : "are"} close to ${close.length === 1 ? "its budget" : "their budgets"}.`
      : budgeted.length
        ? "Every category is within its budget."
        : "";
  if (s.left < 0) return { ok: false, title: `Spending is ${money(-s.left)} over for the month`, budgets };
  if (over.length)
    return { ok: false, title: `${list(over)} ${over.length === 1 ? "is" : "are"} over budget`, budgets };
  if (s.vs_pace > NEAR) return { ok: false, title: "Spending is a bit faster than planned", budgets };
  return { ok: true, title: "Spending is on track", budgets };
}

function Line({
  g,
  tone,
  title,
  sub,
  action,
  children,
}: {
  g: Glyph;
  tone: Tone;
  title: string;
  sub?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2.5 border-t border-line pt-3.5 first:border-t-0 first:pt-0">
      <div className="flex items-start gap-3">
        <Chip g={g} tone={tone} size="lg" />
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] leading-snug font-semibold text-ink">{title}</span>
          {sub && <span className="mt-0.5 block text-[14px] text-ink-3">{sub}</span>}
        </span>
      </div>
      {action && <span className="ml-[52px]">{action}</span>}
      {children}
    </div>
  );
}

export function TodayCard({ d, m }: { d: Dashboard; m: Month | null }) {
  const actions = useActions();
  const [whatIf, setWhatIf] = useState<number | null>(null);
  const s = d.spending;

  // When the spending money is next topped up: the day after the month ends.
  const restart = s ? parseDate(s.end) : null;
  if (restart) restart.setDate(restart.getDate() + 1);

  // On track: the spending balance near where the plan has it by now, and every category within its budget.
  const track = s ? onTrack(s) : { ok: true, title: "", budgets: "" };

  // Bills before the next pay.
  const held = d.bills?.balance ?? null;
  const due = m?.beforePay.total ?? 0;
  const payDay = m && m.nextPay != null ? dayDate(m.dates[m.nextPay]) : null;

  // The one thing that most needs someone, if anything.
  const flag = d.checkin.flags[0];
  const checkinDue = d.checkin.next <= d.today && d.checkin.last?.date !== d.today;
  const unsorted = s?.unsorted ?? 0;
  let needs: React.ReactNode;
  if (flag)
    needs = (
      <Line
        g={I.rules}
        tone="bills"
        title={`${flag.account} was ${money(Math.abs(flag.difference))} ${flag.difference < 0 ? "less" : "more"} than expected`}
        sub={
          flag.rule
            ? `At the last check-in. The "${flag.rule.label || "transfer"}" transfer may not have happened.`
            : "At the last check-in. Worth checking in your banking app."
        }
        action={
          <Button small primary onClick={actions.checkin}>
            Check in
          </Button>
        }
      />
    );
  else if (checkinDue)
    needs = (
      <Line
        g={I.shield}
        tone="offset"
        title="Time for a check-in"
        sub={
          <>
            Type in what uBank shows for each account. About 30 seconds. <Term k="checkin">What's this?</Term>
          </>
        }
        action={
          <Button small primary onClick={actions.checkin}>
            Check in
          </Button>
        }
      />
    );
  else if (unsorted > 0)
    needs = (
      <Line
        g={I.sort}
        tone="neutral"
        title={`${money(unsorted)} of spending isn't sorted yet`}
        sub="Give it a category so the totals are right."
        action={
          <Link
            to="/sort"
            className="inline-flex min-h-[34px] items-center rounded-[10px] px-3 text-[13px] font-medium text-ink no-underline shadow-[inset_0_0_0_1px_var(--color-line-2)]"
          >
            Sort it
          </Link>
        }
      />
    );
  else needs = <Line g={I.shield} tone="savings" title="Nothing needs you right now" sub="Everything adds up." />;

  return (
    <Card aria-labelledby="today-h" className="flex flex-col gap-3.5 md:col-span-4">
      <Eyebrow id="today-h">Today, {dayDate(d.today)}</Eyebrow>
      {s ? (
        <Line
          g={I.spending}
          tone={track.ok ? "savings" : "spending"}
          title={track.title}
          sub={
            <>
              {money(Math.max(s.left, 0))} left of {money(s.allowance)},{" "}
              {Math.abs(s.vs_pace) < NEAR ? (
                <>
                  about where the <Term k="plan">plan</Term> has it.
                </>
              ) : s.vs_pace < 0 ? (
                <>
                  {money(-s.vs_pace)} more than the <Term k="plan">plan</Term> has by now.
                </>
              ) : (
                <>
                  {money(s.vs_pace)} less than the <Term k="plan">plan</Term> has by now.
                </>
              )}{" "}
              {track.budgets}
              {s.remaining
                ? ` Topped up on the ${restart ? ordinal(restart.getDate()) : "1st"}.`
                : " Topped up tomorrow."}
            </>
          }
        >
          {s.left > 0 && (
            <div className="ml-[52px] flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-ink-3">If I spend</span>
              {[50, 100, 250].map((v) => (
                <ChoiceChip
                  key={v}
                  pressed={whatIf === v * 100}
                  onClick={() => setWhatIf(whatIf === v * 100 ? null : v * 100)}
                >
                  ${v}
                </ChoiceChip>
              ))}
              {whatIf != null && (
                <span className="basis-full text-[14px] text-ink-2" aria-live="polite">
                  Then <b className="text-ink">{money(s.left - whatIf)}</b> is left for the month.
                </span>
              )}
            </div>
          )}
        </Line>
      ) : (
        <Line
          g={I.spending}
          tone="spending"
          title="No spending account yet"
          sub="Give one account the spending job on the Accounts page, and this shows what's left each month."
        />
      )}
      {held != null && m && (
        <Line
          g={I.bills}
          tone="bills"
          title={
            held >= due
              ? `Bills are covered${payDay ? ` until pay on ${payDay}` : ""}`
              : `Bills are ${money(due - held)} short${payDay ? ` before pay on ${payDay}` : ""}`
          }
          sub={
            held >= due
              ? `${money(due)} due before then, and ${money(held)} is set aside.`
              : `${money(due)} is due and ${money(held)} is set aside. Move some money into Bills.`
          }
        />
      )}
      {needs}
    </Card>
  );
}
