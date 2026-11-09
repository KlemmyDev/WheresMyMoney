/**
 * We spotted some bills (the uplift canvas's InSpotted): repeating payments from the imports that look like bills,
 * one at a time to add as they are, change first, wave away ("Not a bill" stops asking about that place) or put off
 * until the next import. Each choice has Undo. Beside them, what adding them would do to the bills account's aim.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BillDialog } from "~/features/bills/BillsPage";
import { apiSend, errorMessage } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { Spark } from "~/features/common/charts";
import { Card, CardHead, EmptyState } from "~/features/common/ds";
import { EntityHeader, EntityHero } from "~/features/common/entity";
import { EVERY_LABEL, dayDate, money, monthYear } from "~/features/common/format";
import { I } from "~/features/common/icons";
import { useToast } from "~/features/common/overlay";
import { accountsQuery, billsQuery, refresh, spottedBillsQuery } from "~/features/common/queries";
import type { SpottedBill } from "~/features/common/types";
import { Button, ErrorText, Pill } from "~/features/common/ui";

const PER_YEAR: Record<string, number> = {
  weekly: 52,
  fortnightly: 26,
  monthly: 12,
  quarterly: 4,
  term: 4,
  "half-yearly": 2,
  yearly: 1,
};
const perMonth = (s: SpottedBill) => (s.amount * (PER_YEAR[s.every] ?? 12)) / 12;

type Added = { name: string; id: number; text: string };

export function SpottedPage() {
  const q = useQuery(spottedBillsQuery);
  const bills = useQuery(billsQuery);
  const accounts = useQuery(accountsQuery);
  const [editing, setEditing] = useState<SpottedBill | null>(null);
  const [added, setAdded] = useState<Added[]>([]);
  useEffect(() => {
    document.title = "We spotted some bills · WheresMyMoney";
  }, []);
  if (q.isError) return <ErrorText>{errorMessage(q.error)}</ErrorText>;
  if (!q.data || !bills.data) return <Loading />;
  const list = q.data.suggestions;
  const byId = Object.fromEntries((accounts.data?.accounts ?? []).map((a) => [a.id, a]));
  const together = list.reduce((t, s) => t + perMonth(s), 0);
  const imp = q.data.from_import;
  const b = bills.data;
  const acct = b.account;
  const months = acct?.target?.kind === "months" ? acct.target.months : 3;
  const afterMonth = b.per_month + together;

  return (
    <>
      <EntityHeader
        back={{ to: "/bills", label: "Bills" }}
        title="We spotted some bills"
        sub={
          imp
            ? `From the latest import · ${imp.files} ${imp.files === 1 ? "file" : "files"}, ${imp.rows} rows`
            : "From your statements"
        }
      />
      {list.length > 0 ? (
        <EntityHero tint="bills" label="What we spotted, in a sentence">
          <p className="m-0 text-[17px] leading-relaxed text-ink">
            <b>
              {list.length} repeating {list.length === 1 ? "payment looks" : "payments look"} like{" "}
              {list.length === 1 ? "a bill" : "bills"}
            </b>
            , about {money(together)} a month together.
          </p>
          <p className="m-0 text-[15px] text-ink-2">
            Add the ones that are bills and they&apos;re matched on every import from then on; a change in price shows
            up on the Bills page. Nothing is added until you say.
          </p>
        </EntityHero>
      ) : (
        <EmptyState
          g={I.bills}
          tone="bills"
          title="All sorted"
          action={
            <Link to="/bills" className="text-teal">
              Back to Bills
            </Link>
          }
        >
          Nothing left to look at. The next import looks again.
        </EmptyState>
      )}

      {added.length > 0 && (
        <Card aria-label="Added just now" className="flex flex-col gap-1">
          {added.map((a) => (
            <div key={a.id} className="flex min-h-11 flex-wrap items-center justify-between gap-2 text-[14px]">
              <span>
                <b className="text-ink">{a.name} is a bill now</b> <span className="text-ink-3">· {a.text}</span>
              </span>
              <Link to="/bills/$billId" params={{ billId: String(a.id) }} className="font-semibold text-teal">
                Open the bill
              </Link>
            </div>
          ))}
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-12 [&>*]:min-w-0">
        <div className="flex flex-col gap-3 md:col-span-8">
          {list.map((s) => (
            <Suggestion
              key={s.key}
              s={s}
              from={byId[s.account_id]?.name}
              onChange={() => setEditing(s)}
              onAdded={(a) => setAdded((x) => [...x, a])}
              onUndoAdded={(id) => setAdded((x) => x.filter((a) => a.id !== id))}
            />
          ))}
          {q.data.later.length > 0 && (
            <p className="m-0 text-[13px] text-ink-3">Asked again after the next import: {q.data.later.join(", ")}.</p>
          )}
        </div>
        <div className="flex flex-col gap-4 md:col-span-4">
          {list.length > 0 && acct && (
            <Card aria-labelledby="sp-effect" className="flex flex-col gap-2">
              <CardHead id="sp-effect" title="What adding them changes" />
              <Row label="Bills a month" was={money(b.per_month)} now={money(afterMonth)} />
              <Row
                label={`Bills aim, ${months} months`}
                was={money(b.per_month * months)}
                now={money(afterMonth * months)}
              />
              <Row
                label={`${acct.name} holds ${money(acct.balance)}`}
                was={`${(acct.balance / Math.max(b.per_month, 1)).toFixed(1)} months`}
                now={`${(acct.balance / Math.max(afterMonth, 1)).toFixed(1)} months`}
              />
              <p className="m-0 text-[12px] text-ink-3">If you add all of them, as they are.</p>
            </Card>
          )}
          <Card aria-labelledby="sp-how" className="flex flex-col gap-1.5">
            <CardHead id="sp-how" title="How we spot them" />
            <p className="m-0 text-[13px] text-ink-2">
              Three or more payments to the same place, about the same amount, at a steady gap. &ldquo;Not a bill&rdquo;
              stops us asking about that place; &ldquo;Remind me later&rdquo; asks again after the next import.
            </p>
          </Card>
        </div>
      </div>

      <BillDialog
        bill={editing ? "new" : null}
        spotted={editing}
        onClose={() => {
          setEditing(null);
        }}
      />
    </>
  );
}

function Row({ label, was, now }: { label: string; was: string; now: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line pb-1.5 text-[14px] last:border-b-0">
      <span className="text-ink-2">{label}</span>
      <span className="num whitespace-nowrap">
        <span className="text-ink-3">{was}</span> → <b className="text-ink">{now}</b>
      </span>
    </div>
  );
}

function Suggestion({
  s,
  from,
  onChange,
  onAdded,
  onUndoAdded,
}: {
  s: SpottedBill;
  from?: string;
  onChange: () => void;
  onAdded: (a: Added) => void;
  onUndoAdded: (id: number) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const undoChoice = (body: Record<string, unknown>, then?: () => void) => () =>
    apiSend("POST", "bills/spotted/undo", body)
      .then(() => {
        then?.();
        refresh(qc);
      })
      .catch((e) => toast(errorMessage(e)));
  const add = useMutation({
    mutationFn: () =>
      apiSend<{ added: { id: number }; transaction_ids: number[] }>("POST", "bills/spotted/accept", { key: s.key }),
    onSuccess: (r) => {
      refresh(qc);
      const text = `${s.variable ? "about " : ""}${money(s.amount, { cents: true })} every ${EVERY_LABEL[s.every].toLowerCase()} · next ${dayDate(s.next_due)}${from ? ` · from ${from}` : ""}`;
      onAdded({ name: s.name, id: r.added.id, text });
      toast(
        `${s.name} added`,
        undoChoice({ bill_id: r.added.id, transaction_ids: r.transaction_ids }, () => onUndoAdded(r.added.id)),
      );
    },
    onError: (e) => toast(errorMessage(e)),
  });
  const no = useMutation({
    mutationFn: () => apiSend("POST", "bills/spotted/dismiss", { key: s.key }),
    onSuccess: () => {
      refresh(qc);
      toast(`We won't ask about ${s.name} again`, undoChoice({ key: s.key }));
    },
  });
  const later = useMutation({
    mutationFn: () => apiSend("POST", "bills/spotted/later", { key: s.key }),
    onSuccess: () => {
      refresh(qc);
      toast(`${s.name}: asked again after the next import`, undoChoice({ key: s.key }));
    },
  });
  const busy = add.isPending || no.isPending || later.isPending;
  return (
    <Card aria-label={s.name} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[16px] font-semibold">
            {s.name}
            {s.rise && (
              <Pill tone={s.rise.now > s.rise.was ? "warn" : "good"}>
                {s.rise.now > s.rise.was ? "Up" : "Down"} {Math.abs(s.rise.pct).toFixed(1)}%
              </Pill>
            )}
          </div>
          <div className="text-[13px] text-ink-3">
            {EVERY_LABEL[s.every]} · {s.seen} payments since {monthYear(s.first.slice(0, 7))}
            {from ? ` · from ${from}` : ""} · <span className="mono">{s.example}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="num text-[18px] font-semibold">
            {s.variable ? "about " : ""}
            {money(s.amount, { cents: true })}
          </div>
          <div className="text-[12px] text-ink-3">next {dayDate(s.next_due)}</div>
        </div>
      </div>
      {s.history.length > 2 && (
        <Spark
          values={s.history.map((h) => h.amount)}
          colour="var(--color-bills)"
          floor={Math.max(...s.history.map((h) => h.amount)) * 0.85}
        />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button small disabled={busy} onClick={() => add.mutate()}>
          Add as a bill
        </Button>
        <Button small disabled={busy} onClick={onChange}>
          Change first
        </Button>
        <Button small disabled={busy} onClick={() => no.mutate()}>
          Not a bill
        </Button>
        <Button small disabled={busy} onClick={() => later.mutate()}>
          Remind me later
        </Button>
        <span className="ml-auto text-[13px] text-ink-3">{money(perMonth(s))} a month</span>
      </div>
    </Card>
  );
}
