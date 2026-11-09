/**
 * One account, looked at closely (the uplift canvas's EnAccount), on the shared entity page: back to Accounts, its
 * mark and job, Change and Check in; the others a tap away; a sentence on how it's doing against its job with the
 * figures under See the numbers; its balance over a month to a year with what moved it (hover any point to read it);
 * its transactions; and its job and settings beside them.
 */
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { AccountTransactions, ActivityChart, type Bucket, type Range } from "~/features/accounts/Activity";
import { ACCOUNT_ICONS, EditAccountPanel } from "~/features/accounts/EditAccountPanel";
import {
  Detail,
  EditButton,
  LoanDetail,
  ROLE_GLYPH,
  ROLE_TONE,
  job,
  roleBadge,
} from "~/features/accounts/AccountsPage";
import { errorMessage } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { ChoiceChip } from "~/features/common/ds";
import { EntityHeader, EntityHero } from "~/features/common/entity";
import { dayDate, money } from "~/features/common/format";
import { Chip } from "~/features/common/icons";
import { useActions } from "~/features/common/layout";
import { accountsQuery } from "~/features/common/queries";
import type { Account, AccountsOverview } from "~/features/common/types";
import { Button, Empty, ErrorText } from "~/features/common/ui";

/** How the account is doing in a sentence, by its job. */
function sentence(a: Account, data: AccountsOverview): string {
  const moved =
    a.change_30d === 0
      ? "It hasn't moved in the last 30 days."
      : `It's ${a.change_30d > 0 ? "up" : "down"} ${money(Math.abs(a.change_30d))} in the last 30 days.`;
  if (a.kind === "loan")
    return `${a.name} is ${money(a.balance)} owing. Our accounts cover ${money(data.offsetting)} of it, so interest is only charged on the rest.`;
  const t = a.target;
  const holds = `${a.name} holds ${money(a.balance)}.`;
  if (!t) return `${holds} ${moved}`;
  if (t.kind === "months")
    return `${holds} That's ${(t.held ?? 0).toFixed(1)} months of bills, and the aim is ${t.months}. ${moved}`;
  if (t.kind === "allowance")
    return `${holds} ${money(a.balance)} of the ${money(t.amount)} for the month is left. ${moved}`;
  if (t.kind === "goals")
    return `${holds} Its goals add up to ${money(t.amount)}, so it's ${Math.round(t.progress * 100)}% of the way. ${moved}`;
  return `${holds} It covers ${Math.round(t.progress * 100)}% of the loan. ${moved}`;
}

export function AccountPage({ accountId }: { accountId: number }) {
  const q = useQuery(accountsQuery);
  const navigate = useNavigate();
  const { checkin } = useActions();
  const search = useSearch({ from: "/_app/accounts_/$accountId" });
  const editing = !!search.edit;
  const setEditing = (on: boolean) =>
    navigate({
      to: "/accounts/$accountId",
      params: { accountId: String(accountId) },
      search: on ? { edit: 1 } : {},
      replace: true,
    });
  const [range, setRange] = useState<Range>("1m");
  const [picked, setPicked] = useState<Bucket | null>(null);
  if (q.isError) return <ErrorText>{errorMessage(q.error)}</ErrorText>;
  const data = q.data;
  if (!data) return <Loading />;
  const all = [...data.accounts, ...(data.loan ? [data.loan] : [])];
  const a = all.find((x) => x.id === accountId);
  if (!a)
    return (
      <Empty
        title="No account by that number"
        action={
          <Link to="/accounts" className="text-teal">
            Back to Accounts
          </Link>
        }
      >
        It may have been removed. Removed accounts can be brought back from Accounts.
      </Empty>
    );
  const loan = a.kind === "loan";
  const role = loan ? "loan" : a.role;
  const j = job(a, data.offsetting);
  return (
    <>
      <EntityHeader
        back={{ to: "/accounts", label: "Accounts" }}
        mark={<Chip g={(a.icon && ACCOUNT_ICONS[a.icon]) || ROLE_GLYPH[role]} tone={ROLE_TONE[role]} size="xl" />}
        title={a.name}
        sub={`${roleBadge(a, data.goals)}${a.last4 ? ` · •• ${a.last4}` : ""}${a.offsets_loan && !loan ? " · offsets the loan" : ""}`}
        actions={
          <>
            <EditButton account={a} onClick={() => setEditing(!editing)} />
            {!loan && (
              <Button primary onClick={checkin}>
                Check in
              </Button>
            )}
          </>
        }
      />
      <EditAccountPanel
        key={`${a.id}-${String(editing)}`}
        account={a}
        open={editing}
        onClose={() => setEditing(false)}
      />
      <div role="group" aria-label="Other accounts" className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
        {all.map((x) => (
          <ChoiceChip
            key={x.id}
            pressed={x.id === a.id}
            onClick={() => {
              setPicked(null);
              navigate({ to: "/accounts/$accountId", params: { accountId: String(x.id) } });
            }}
          >
            {x.name}
          </ChoiceChip>
        ))}
      </div>
      <EntityHero
        tint={loan ? "bad" : a.role === "track" ? "accent" : (a.role as "offset" | "bills" | "spending" | "savings")}
        label={`${a.name} in a sentence`}
        numbers={[
          {
            label: loan ? "Owing" : "Balance",
            value: money(a.balance),
            note: a.known ? `as of ${dayDate(a.known.date)}` : undefined,
          },
          {
            label: "Last 30 days",
            value: money(a.change_30d, { sign: true }),
            note: a.change_30d >= 0 ? "up" : "down",
          },
          { label: "Its job", value: roleBadge(a, data.goals), note: j.text },
          {
            label: "Checked",
            value: a.known ? dayDate(a.known.date) : "Not yet",
            note: a.known ? (a.known.source === "checkin" ? "a check-in" : "a statement") : "check in to start",
          },
        ]}
      >
        <p className="m-0 text-[17px] leading-relaxed text-ink">{sentence(a, data)}</p>
      </EntityHero>
      <ActivityChart key={a.id} account={a} range={range} onRange={setRange} picked={picked} onPick={setPicked} />
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[1.4_1_560px] flex-col">
          <AccountTransactions
            key={a.id}
            account={a}
            range={range}
            picked={picked}
            onClearPick={() => setPicked(null)}
          />
        </div>
        <div className="flex min-w-0 flex-[1_1_380px] flex-col">
          {loan ? (
            <LoanDetail key={`${a.id}-${a.balance}`} account={a} accounts={data.accounts} />
          ) : (
            <Detail key={a.id} account={a} goals={data.goals} />
          )}
        </div>
      </div>
    </>
  );
}
