/**
 * The loan and offset as pictures: what's owed and how much of it our savings cover, where this month's repayment goes,
 * and the loan's schedule year by year until it's gone (LoanSchedule.tsx), with levers for savings growth, an extra
 * repayment and a rate change; then the interest the bank actually charged and the loan's changes.
 */
import { Loading } from "~/features/common/brand";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { errorMessage } from "~/features/common/api";
import { daysBetween, longDate, money, monthYear, todayIso } from "~/features/common/format";
import { loanQuery, type LoanView } from "~/features/common/queries";
import { Empty, ErrorText } from "~/features/common/ui";
import { EntityHeader, Legend, MonthBars } from "~/features/common/entity";
import { EditButton, ROLE_GLYPH, ROLE_TONE } from "~/features/accounts/AccountsPage";
import { LoanChangePanel } from "~/features/accounts/LoanChangePanel";
import { LoanNow, LoanSchedule, Repayment } from "~/features/accounts/LoanSchedule";
import { RateChangeSheet, type Spotted } from "~/features/accounts/RateChange";
import { Banner, Card, CardHead } from "~/features/common/ds";
import { Chip, I } from "~/features/common/icons";
import { useStoredFlag } from "~/features/common/theme";
import { Button } from "~/features/common/ui";

export function LoanPage() {
  const q = useQuery(loanQuery);
  const search = useSearch({ from: "/_app/loan" });
  const navigate = useNavigate();
  const [rateOpen, setRateOpen] = useState(false);
  // A new rate an imported statement showed in the last two months, until it's been looked at.
  const latest = q.data?.changes.find((c) => c.field === "rate");
  const fresh =
    latest && latest.description !== "Changed in the app" && daysBetween(latest.date, todayIso()) < 61 ? latest : null;
  const [seen, setSeen] = useStoredFlag(`wmm:rate-seen:${fresh?.date}:${fresh?.value}`);
  const spotted: Spotted = fresh && !seen ? { date: fresh.date, value: fresh.value, was: fresh.was } : null;
  if (q.isError) return <ErrorText>{errorMessage(q.error)}</ErrorText>;
  if (q.data === undefined) return <Loading />;
  const v = q.data;
  if (!v)
    return (
      <Empty
        title="No home loan yet"
        action={
          <Link to="/accounts" className="text-teal">
            Add the home loan
          </Link>
        }
      >
        Add the loan with its balance, rate and repayment, and choose which accounts offset it.
      </Empty>
    );
  const lo = v.loan;
  return (
    <>
      <EntityHeader
        back={{ to: "/accounts", label: "Accounts" }}
        mark={<Chip g={ROLE_GLYPH.loan} tone={ROLE_TONE.loan} size="xl" />}
        title={lo.name}
        sub={[
          lo.lender ?? null,
          lo.rate_bp != null ? `${(lo.rate_bp / 100).toFixed(2)}% ${lo.rate_type ?? "variable"}` : null,
          lo.repayment ? `${money(lo.repayment)} a month` : null,
          v.by_account.length
            ? `${v.by_account.length === 1 ? "one account offsets" : `${v.by_account.length} accounts offset`} it`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <EditButton
              account={lo}
              onClick={() => navigate({ to: "/loan", search: search.edit ? {} : { edit: 1 }, replace: true })}
            />
            {!spotted && <Button onClick={() => setRateOpen(true)}>Rate changed?</Button>}
          </>
        }
      />
      <LoanChangePanel
        key={String(!!search.edit)}
        v={v}
        open={!!search.edit}
        onClose={() => navigate({ to: "/loan", search: {}, replace: true })}
        onRateChanged={() => {
          navigate({ to: "/loan", search: {}, replace: true });
          setRateOpen(true);
        }}
      />
      {spotted && (
        <Banner
          g={I.loan}
          tone="loan"
          title={`The rate changed to ${(spotted.value / 100).toFixed(2)}%`}
          action={
            <>
              <Button onClick={() => setSeen(true)}>Dismiss</Button>
              <Button primary onClick={() => setRateOpen(true)}>
                Check what changes
              </Button>
            </>
          }
        >
          Spotted in a statement from {monthYear(spotted.date)}
          {spotted.was != null
            ? `, ${spotted.value > spotted.was ? "up" : "down"} from ${(spotted.was / 100).toFixed(2)}%`
            : ""}
          .
        </Banner>
      )}
      <RateChangeSheet
        open={rateOpen || !!search.rate}
        onClose={() => {
          setRateOpen(false);
          if (spotted) setSeen(true);
          if (search.rate) navigate({ to: "/loan", search: { ...search, rate: undefined }, replace: true });
        }}
        v={v}
        spotted={spotted}
      />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <LoanNow v={v} />
        <Repayment v={v} />
      </div>
      <LoanSchedule v={v} />
      {v.interest_charged && <InterestCharged c={v.interest_charged} estimate={v.charged_per_month} />}
      {v.changes.length > 0 && <Changes changes={v.changes} />}
    </>
  );
}

/** The loan's changes, newest first, kept with its history: rates, repayments, lump sums and refinances. */
function Changes({ changes }: { changes: LoanView["changes"] }) {
  const said = (c: LoanView["changes"][number]) =>
    c.field === "lump"
      ? `${money(c.value)} paid in`
      : c.field === "repayment"
        ? `Repayment ${c.was != null ? `${money(c.was)} → ` : ""}${money(c.value)}`
        : `Rate ${c.was != null ? `${(c.was / 100).toFixed(2)}% → ` : ""}${(c.value / 100).toFixed(2)}%`;
  return (
    <Card aria-labelledby="ln-changes" className="flex flex-col gap-1">
      <CardHead
        id="ln-changes"
        title="Changes to the loan"
        right={<span className="text-[13px] text-ink-3">kept with its history</span>}
      />
      <ul className="m-0 flex list-none flex-col p-0">
        {changes.map((c, i) => (
          <li
            key={`${c.date}-${c.field}-${i}`}
            className="flex min-h-11 items-center justify-between gap-3 border-b border-line text-[14px] last:border-b-0"
          >
            <span className="min-w-0">
              <span className="block text-ink">{said(c)}</span>
              <span className="block truncate text-[12px] text-ink-3">{c.description}</span>
            </span>
            <span className="flex-none text-[13px] text-ink-3">{longDate(c.date)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** The interest the bank actually charged, from the loan's statements: a cost of the loan, not money coming in. */
function InterestCharged({ c, estimate }: { c: NonNullable<LoanView["interest_charged"]>; estimate: number }) {
  return (
    <Card aria-labelledby="ln-int" className="flex flex-col gap-3">
      <CardHead
        id="ln-int"
        title="Interest charged"
        right={
          <span className="flex flex-wrap items-center gap-3.5">
            <Legend
              items={[
                { label: "Charged", kind: "solid", role: "bills" },
                { label: "At today's rate", kind: "line", role: "ink" },
              ]}
            />
            <span className="mono text-[13px] text-ink-3">{money(c.year)} over 12 months</span>
          </span>
        }
      />
      <p className="m-0 text-[15px] text-ink-2">
        {c.last ? (
          <>
            The bank charged <b className="text-ink">{money(c.last.amount, { cents: true })}</b> on{" "}
            {longDate(c.last.date)}
            {c.per_month ? `, and about ${money(c.per_month)} a month over the past year` : ""}. At today&apos;s rate
            and balances it&apos;s about {money(estimate)} a month.
          </>
        ) : (
          "The loan statements imported so far don't show any interest charged."
        )}
      </p>
      <MonthBars
        months={c.months.map((m) => ({ key: m.month, label: monthYear(m.month), value: Math.max(m.amount, 0) }))}
        line={{ value: estimate, label: "At today's rate" }}
        role="bills"
        name="Interest charged"
        height={140}
        format={(v) => money(v, { cents: true })}
        describe={(m) => (
          <>
            <b className="text-ink">{m.label}</b>: {money(m.value, { cents: true })} charged
            {m.value > estimate * 1.05
              ? `, ${money(m.value - estimate)} more than today's rate gives`
              : m.value < estimate * 0.95
                ? `, ${money(estimate - m.value)} less than today's rate gives`
                : ", about what today's rate gives"}
            .
          </>
        )}
      />
      <div className="text-xs text-ink-3">
        Interest is added to what we owe, so it&apos;s a cost of the loan. It isn&apos;t counted as money in or as a
        merchant.
      </div>
    </Card>
  );
}
