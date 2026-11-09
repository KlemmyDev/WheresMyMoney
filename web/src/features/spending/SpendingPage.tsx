/**
 * Spending (design: CkSpend): the spending month from top-up to top-up. What's left of the allowance, safe to spend a
 * day, the pace against an even month, where it'll be at the next top-up (what's left rolls into the offset), each day's
 * spending, every category (budgeted or not, each opening its own page), who spent it, and the latest spending.
 */
import { Loading } from "~/features/common/brand";
import { Banner, Bar, BigNumber, Card, Eyebrow, Stat, Details } from "~/features/common/ds";
import { I } from "~/features/common/icons";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { SpendingCategories } from "~/features/spending/SpendingCategories";
import { errorMessage } from "~/features/common/api";
import { Count, DayBars } from "~/features/common/charts";
import { amount, capsDate, money, shortDate } from "~/features/common/format";
import { useActions } from "~/features/common/layout";
import { budgetSuggestionsQuery, spendingQuery } from "~/features/common/queries";
import { Button, Empty, ErrorText, PageHead, Pill, Tile, TileTitle } from "~/features/common/ui";

export function SpendingPage() {
  const q = useQuery(spendingQuery);
  const actions = useActions();
  const navigate = useNavigate();
  const sug = useQuery(budgetSuggestionsQuery);
  const offBudgets = (sug.data?.categories ?? []).filter((r) => r.note && r.suggested != null);
  if (q.isError) return <ErrorText>{errorMessage(q.error)}</ErrorText>;
  if (!q.data) return <Loading />;
  const m = q.data.month;
  if (!m)
    return (
      <Empty
        title="No spending account"
        action={
          <Link to="/accounts" className="text-teal">
            Give an account the spending job
          </Link>
        }
      >
        Spending tracks the account your cards are on: a month of everyday money, topped up to an amount.
      </Empty>
    );
  const under = m.vs_pace <= 0;
  return (
    <>
      <PageHead
        over={`Money · ${shortDate(m.start)} to ${shortDate(m.end)}, day ${m.day} of ${m.days}`}
        title="Spending"
        actions={
          <>
            <Link
              to="/budgets"
              className="press inline-flex min-h-[42px] items-center rounded-xl border border-line bg-tile-2 px-4 text-[14px] font-semibold text-ink no-underline hover:border-line-2"
            >
              Budgets
            </Link>
            <Button primary onClick={actions.addSpending}>
              Add spending
            </Button>
          </>
        }
      />
      {offBudgets.length > 0 && (
        <Banner
          g={I.spending}
          tone="spending"
          title={
            offBudgets.length === 1
              ? `The ${offBudgets[0].name} budget doesn't match what we usually spend`
              : `${offBudgets.length} budgets don't match what we usually spend`
          }
          action={
            <Link
              to="/budgets"
              className="press inline-flex min-h-11 items-center px-2 text-[14px] font-semibold text-teal no-underline"
            >
              Look at budgets
            </Link>
          }
        >
          {offBudgets
            .map((r) => `${r.name} ${r.note === "over" ? "usually goes over" : "is usually well under"}`)
            .join(", ")}
          . A budget that fits makes "on track" mean something.
        </Banner>
      )}
      <div className="grid gap-4 md:grid-cols-12 [&>*]:min-w-0">
        <Card lit tint="spending" aria-labelledby="sp-hero" className="md:col-span-8">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Eyebrow id="sp-hero">Spent this month</Eyebrow>
              <div className="mt-1 flex items-baseline gap-2.5">
                <BigNumber>{money(m.spent, { cents: true })}</BigNumber>
                <span className="text-[15px] text-ink-3">of {money(m.allowance)}</span>
              </div>
            </div>
            <Pill tone={under ? "good" : "warn"}>{under ? "On track" : "Over plan"}</Pill>
          </div>
          <p className="m-0 text-[16px] text-ink-2">
            {under
              ? `That's ${money(-m.vs_pace)} less than planned by now, day ${m.day} of ${m.days}.`
              : `That's ${money(m.vs_pace)} more than planned by now, day ${m.day} of ${m.days}.`}{" "}
            {m.projected >= 0
              ? `At this rate about ${money(m.projected)} will be left when it's topped up on ${shortDate(nextDay(m.end))}, and goes back to the offset.`
              : `At this rate it'll run ${money(-m.projected)} short before it's topped up on ${shortDate(nextDay(m.end))}.`}
          </p>
          <Bar
            label={`Spent ${money(m.spent)}, likely ${money(Math.max(0, m.left - m.projected))} more, of ${money(m.allowance)}`}
            max={Math.max(m.allowance, m.spent + Math.max(0, m.left - m.projected), 1)}
            height={16}
            segments={[
              { value: m.spent, role: "spending" },
              { value: Math.max(0, m.left - m.projected), role: "spending", likely: true },
            ]}
          />
          <div className="flex flex-wrap justify-between gap-2 text-[13px] text-ink-3">
            <span>Spent so far</span>
            <span>Shaded: likely another {money(Math.max(0, m.left - m.projected))}</span>
          </div>
          <Details label="See the numbers">
            <div className="grid grid-cols-3 gap-2.5">
              <Stat label="Left" value={money(m.left)} note={`of ${money(m.allowance)}`} role="spending" />
              <Stat
                label="Average a day"
                value={money(m.day ? Math.round(m.spent / m.day) : 0)}
                note={`the plan is ${money(m.even_per_day)}`}
                role="spending"
              />
              <Stat label="Days left" value={String(m.remaining)} note={`of ${m.days}`} role="spending" />
            </div>
          </Details>
        </Card>
        <Card lit aria-labelledby="sp-safe" className="justify-center md:col-span-4" tint="accent">
          <Eyebrow id="sp-safe">Left to spend</Eyebrow>
          <div className="flex items-baseline gap-2">
            <BigNumber>
              <Count k="sp:left" value={Math.max(m.left, 0)} format={(v) => money(v)} />
            </BigNumber>
          </div>
          <div className="text-[13px] text-ink-3">
            of {money(m.allowance)}, with {m.remaining} days to go. The plan has{" "}
            {money(Math.max(0, m.allowance - Math.round(m.allowance * m.pace)))} left by now.
          </div>
        </Card>
      </div>
      <Tile i={4} aria-labelledby="s-daily">
        <TileTitle
          id="s-daily"
          right={
            <span className="flex gap-3.5 text-[13px] font-medium">
              <span className="inline-flex items-center gap-1.5">
                <i className="size-2 rounded-sm bg-spending" />
                Spent
              </span>
              <span className="inline-flex items-center gap-1.5">
                <i className="w-3.5 border-t-2 border-dashed border-ink-2" />
                The plan, {money(m.even_per_day)} a day
              </span>
            </span>
          }
        >
          Daily spend · this month
        </TileTitle>
        <DayBars
          daily={m.daily}
          today={m.day}
          pace={m.even_per_day}
          label={`Spending on ${m.daily.filter((v) => v > 0).length} of ${m.day} days so far`}
        />
        <div className="mono flex justify-between pl-10 text-xs text-ink-3">
          <span>{shortDate(m.start).toUpperCase()}</span>
          <span className="text-teal">TODAY</span>
          <span>{shortDate(m.end).toUpperCase()}</span>
        </div>
      </Tile>
      <SpendingCategories m={m} onBudgets={() => navigate({ to: "/budgets" })} />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] gap-4">
        <Tile i={6} aria-labelledby="s-tx">
          {m.by_person.some((p) => p.user_id != null) && (
            <>
              <TileTitle id="s-who">Who added it</TileTitle>
              <div className="grid grid-cols-2 gap-2.5">
                {m.by_person.map((p, i) => {
                  const who =
                    q.data.recent.find((t) => t.user_id === p.user_id)?.who ??
                    (p.user_id == null ? "From statements" : "Someone");
                  return (
                    <div key={i} className="rounded-lg bg-raised px-3.5 py-3">
                      <div className="flex items-center gap-2 text-[13px]">
                        <span className="inline-flex size-[22px] items-center justify-center rounded-full bg-offset text-[11px] font-semibold text-page">
                          {who.slice(0, 1).toUpperCase()}
                        </span>
                        {who}
                      </div>
                      <div className="mono mt-1.5 text-xl font-semibold">{money(p.spent)}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
          <TileTitle
            id="s-tx"
            right={
              <span className="flex gap-4">
                <Link to="/sort" className="font-medium text-teal no-underline">
                  Sort what's new
                </Link>
                <Link
                  to="/transactions"
                  search={{ account: m.account_id }}
                  className="font-medium text-teal no-underline"
                >
                  All transactions
                </Link>
              </span>
            }
          >
            Recent
          </TileTitle>
          <div>
            {q.data.recent.slice(0, 8).map((t) => (
              <div
                key={t.id}
                className="grid grid-cols-[64px_1fr_auto_90px] items-center gap-3 border-t border-line py-2.5 text-[13px] first:border-t-0"
              >
                <span className="mono text-ink-3">{capsDate(t.date)}</span>
                <span className="min-w-0 truncate">
                  {t.description}
                  {t.category && <span className="text-ink-3"> · {t.category}</span>}
                </span>
                <span>
                  {t.kind === "cash" ? (
                    <Pill>CASH</Pill>
                  ) : t.kind === "manual" ? (
                    <Pill tone="info">BY HAND</Pill>
                  ) : null}
                </span>
                <span className="mono text-right" style={{ color: t.amount > 0 ? "var(--color-good)" : undefined }}>
                  {amount(t.amount, { cents: true, sign: true })}
                </span>
              </div>
            ))}
            {!q.data.recent.length && <div className="text-ink-3">Nothing spent yet this month.</div>}
          </div>
        </Tile>
      </div>
    </>
  );
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
