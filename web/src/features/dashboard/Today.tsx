/**
 * The top of the Overview, in plain words: what you can spend today, whether the bills are covered until pay day,
 * and whether anything needs you. It answers the everyday questions before any of the detail below it.
 */
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Count } from "~/features/common/charts";
import { BigNumber, Card, ChoiceChip, Eyebrow } from "~/features/common/ds";
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

function Line({
  g,
  tone,
  title,
  sub,
  action,
}: {
  g: Glyph;
  tone: Tone;
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3.5 sm:flex-nowrap md:first:border-t-0 md:first:pt-0">
      <Chip g={g} tone={tone} size="lg" />
      <span className="min-w-0 flex-1 max-sm:basis-[calc(100%-60px)]">
        <span className="block text-[16px] font-semibold text-ink">{title}</span>
        {sub && <span className="block text-[14px] text-ink-3">{sub}</span>}
      </span>
      {action && <span className="flex-none max-sm:ml-[52px]">{action}</span>}
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
        sub="Type in what uBank shows for each account. About 30 seconds."
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

  const after = s && whatIf != null && s.remaining ? (s.left - whatIf) / s.remaining : null;

  return (
    <Card lit aria-labelledby="today-h" className="flex flex-col gap-3.5">
      <Eyebrow id="today-h">Today, {dayDate(d.today)}</Eyebrow>
      <div className="grid gap-3.5 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:items-center md:gap-10">
        {s ? (
          <div className="flex flex-col gap-2">
            <div className="text-[15px] text-ink-2">You can spend</div>
            <div className="flex flex-wrap items-baseline gap-x-2">
              <BigNumber size="xl">
                <Count k="today:safe" value={Math.max(0, s.safe_per_day)} format={(v) => money(v)} />
              </BigNumber>
              <span className="text-[18px] text-ink-2">today</span>
            </div>
            <p className="m-0 text-[15px] text-ink-3">
              {s.left < 0
                ? `The spending money has run out: ${money(-s.left)} more than there was.`
                : s.remaining
                  ? `${money(s.left)} left for the next ${s.remaining} days, until it's topped up on the ${restart ? ordinal(restart.getDate()) : "next month"}. `
                  : "It's the last day of the month: whatever's left is yours. "}
              {s.left >= 0 &&
                (s.vs_pace <= 0
                  ? `You're ${money(-s.vs_pace)} under plan.`
                  : `You're ${money(s.vs_pace)} over plan, so the daily amount is lower.`)}
            </p>
            {s.remaining > 0 && s.left > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] text-ink-2">What if I spend</span>
                {[50, 100, 250].map((v) => (
                  <ChoiceChip
                    key={v}
                    pressed={whatIf === v * 100}
                    onClick={() => setWhatIf(whatIf === v * 100 ? null : v * 100)}
                  >
                    ${v}
                  </ChoiceChip>
                ))}
                {after != null && (
                  <span className="text-[14px] text-ink-2" aria-live="polite">
                    Then <b className="text-ink">{money(Math.max(0, after))}</b> a day after that.
                  </span>
                )}
              </div>
            )}
          </div>
        ) : (
          <p className="m-0 text-[15px] text-ink-3">
            Give one account the spending job on the Accounts page, and this shows what you can spend each day.
          </p>
        )}
        <div className="flex flex-col gap-3.5">
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
        </div>
      </div>
    </Card>
  );
}
