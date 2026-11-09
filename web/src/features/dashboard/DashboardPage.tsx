/**
 * The Overview (from the uplift canvas SfOverview): a greeting and anything waiting to be sorted, the total balance
 * with Check in as its one action and the bills coming up beside it, then Spending worked out for the month, and the
 * savings goals.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { sessionQuery } from "~/features/auth/LoginPage";
import { errorMessage } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { Banner } from "~/features/common/ds";
import { I } from "~/features/common/icons";
import { dashboardQuery } from "~/features/common/queries";
import { Empty, ErrorText } from "~/features/common/ui";
import { ComingUp, SpendingCard } from "~/features/dashboard/OverviewMonth";
import { BalanceHero, GoalsCard } from "~/features/dashboard/OverviewParts";

function greeting(hour: number): string {
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export function DashboardPage() {
  const q = useQuery(dashboardQuery("30d"));
  const session = useQuery(sessionQuery);
  if (q.isError) return <ErrorText>{errorMessage(q.error)}</ErrorText>;
  const d = q.data;
  if (!d) return <Loading />;
  if (!d.accounts.length)
    return (
      <Empty
        title="No accounts yet"
        action={
          <Link to="/setup" className="text-teal">
            Set up your accounts
          </Link>
        }
      >
        Add your accounts and the home loan, and the Overview fills in.
      </Empty>
    );
  const s = d.spending;
  const name = session.data?.name?.split(" ")[0];
  const date = new Date(`${d.today}T12:00:00`).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const unsorted = s?.unsorted_count ?? 0;
  return (
    <>
      <div>
        <div className="text-[14px] text-ink-3">{date}</div>
        <h1 className="m-0 text-[28px] leading-9 font-semibold tracking-tight">
          {greeting(new Date().getHours())}
          {name ? `, ${name}` : ""}
        </h1>
      </div>
      {unsorted > 0 && (
        <Banner
          g={I.spending}
          tone="spending"
          title={`${unsorted} ${unsorted === 1 ? "spend needs" : "spends need"} a category`}
          action={
            <Link
              to="/sort"
              className="press inline-flex min-h-11 items-center justify-center rounded-xl px-2 text-[14px] font-semibold text-teal no-underline"
            >
              Sort them
            </Link>
          }
        />
      )}
      <div className="grid gap-4 md:grid-cols-12 [&>*]:min-w-0">
        <BalanceHero d={d} />
        <ComingUp d={d} compact className="md:col-span-4" />
      </div>
      {s && <SpendingCard s={s} />}
      <GoalsCard d={d} />
    </>
  );
}
