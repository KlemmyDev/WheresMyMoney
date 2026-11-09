/**
 * One bill, opened from the Bills page or a bill in the Overview's "Coming up": what it costs and when it's next due
 * in a sentence, then each payment as a bar against what it is now, what's ahead, and every payment to open.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BillFields, type BillDraft } from "~/features/bills/BillsPage";
import { MarkPaid } from "~/features/bills/MarkPaid";
import { Loading } from "~/features/common/brand";
import { PaymentBars } from "~/features/common/charts";
import { Card, CardHead, Details } from "~/features/common/ds";
import { EditPanel, EntityHeader, EntityHero } from "~/features/common/entity";
import {
  EVERY_LABEL,
  dayDate,
  editable,
  longDate,
  money,
  monthYear,
  parseMoney,
  pct,
  todayIso,
} from "~/features/common/format";
import { Chip, I } from "~/features/common/icons";
import { accountsQuery, billCandidatesQuery, billQuery, refresh } from "~/features/common/queries";
import { apiSend, errorMessage } from "~/features/common/api";
import { useToast } from "~/features/common/overlay";
import type { Bill, BillDetail } from "~/features/common/types";
import { Button, Empty, ErrorText } from "~/features/common/ui";
import { TransactionSheet, TxRow } from "~/features/spending/TransactionSheet";

const HOW = {
  auto: ["Comes out automatically", "info"],
  manual: ["Paid by hand", "warn"],
  estimate: ["Amount varies", "good"],
} as const;

/** How many payments show before "Show all". */
const FIRST = 12;
/** How many payments the chart shows. */
const BARS = 24;

export function BillPage({ id }: { id: number }) {
  const q = useQuery(billQuery(id));
  const accounts = useQuery(accountsQuery);
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [all, setAll] = useState(false);
  const name = q.data?.bill.name;
  useEffect(() => {
    if (name) document.title = `${name} · WheresMyMoney`;
  }, [name]);

  if (q.isError)
    return (
      <Empty
        title="That bill isn't here any more"
        action={
          <Link to="/bills" className="text-teal">
            See all bills
          </Link>
        }
      >
        It may have been removed.
      </Empty>
    );
  if (!q.data) return <Loading />;
  const d = q.data;
  const b = d.bill;
  const names = Object.fromEntries((accounts.data?.accounts ?? []).map((a) => [a.id, a.name]));
  const from = b.account_id != null ? names[b.account_id] : undefined;
  const every = EVERY_LABEL[b.every].toLowerCase();
  const txs = all ? d.transactions : d.transactions.slice(0, FIRST);
  const openTx = d.transactions.find((t) => t.id === open) ?? null;
  const thisYear = new Date().getFullYear();
  const when = (iso: string) => (Number(iso.slice(0, 4)) === thisYear ? dayDate(iso) : longDate(iso));

  return (
    <>
      <EntityHeader
        back={{ to: "/bills", label: "Bills" }}
        mark={<Chip g={I.bills} tone="bills" size="xl" />}
        title={b.name}
        sub={`${HOW[b.how][0]} · every ${every}${from ? ` · from ${from}` : ""}`}
        actions={
          <>
            <Button onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
              Change
            </Button>
            {d.due && (d.due.paid || b.how !== "auto") && <MarkPaid due={d.due} primary />}
          </>
        }
      />
      <EditBill key={String(editing)} bill={b} open={editing} onClose={() => setEditing(false)} />

      <EntityHero
        tint="bills"
        label={`${b.name} in a sentence`}
        numbers={
          d.count > 0
            ? [
                { label: "Paid in total", value: money(d.total), note: `${d.count} payments` },
                { label: "Last 12 months", value: money(d.last_year), note: "What actually came out" },
                {
                  label: "Average payment",
                  value: money(d.average, { cents: true }),
                  note: `Now ${money(b.amount, { cents: true })}`,
                },
                { label: "Next 12 months", value: money(d.next_year), note: "At today's amount" },
              ]
            : undefined
        }
      >
        <p className="m-0 text-[17px] leading-relaxed text-ink">
          {b.name} is <b>{money(b.amount, { cents: true })}</b> every {every}
          {b.how === "estimate" ? ", give or take" : ""}, about <b>{money(b.per_year)} a year</b>. That's{" "}
          {pct(d.share, 0)} of all our bills.
        </p>
        <p className="m-0 text-[15px] text-ink-2">
          {dueSentence(d, from)}{" "}
          {d.count && d.first
            ? `We've paid ${money(d.total)} for it since ${monthYear(d.first.slice(0, 7))}, over ${d.count} ${d.count === 1 ? "payment" : "payments"}.`
            : "No payments are linked to it yet. They're matched when a statement with it is imported."}
          {changeSentence(d)}
        </p>
      </EntityHero>

      <div className="grid gap-4 md:grid-cols-12 [&>*]:min-w-0">
        <Card aria-labelledby="bp-paid" className="flex flex-col gap-3 md:col-span-8">
          <CardHead
            id="bp-paid"
            title="What we've paid"
            right={
              <span className="inline-flex items-center gap-1.5 text-[13px] text-ink-3">
                <i className="w-3.5 border-t-2 border-dashed border-ink-2" />
                Now {money(b.amount, { cents: true })}
              </span>
            }
          />
          {d.payments.length >= 2 ? (
            <PaymentBars
              payments={d.payments.slice(-BARS)}
              now={b.amount}
              label={`Each of the last ${Math.min(BARS, d.payments.length)} payments, oldest first`}
              describe={(p) => (
                <>
                  <b className="text-ink">{money(p.amount, { cents: true })}</b> on {longDate(p.date)}
                </>
              )}
            />
          ) : (
            <p className="m-0 text-[14px] text-ink-3">
              The chart fills in once there are a couple of payments to show.
            </p>
          )}
          {d.changes.length > 0 && (
            <Details label={`Price changes (${d.changes.length})`}>
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[14px]">
                {[...d.changes].reverse().map((c) => (
                  <li key={c.date} className="flex justify-between gap-3">
                    <span className="text-ink-2">{longDate(c.date)}</span>
                    <span className="num">
                      {money(c.was, { cents: true })} → {money(c.now, { cents: true })}
                    </span>
                  </li>
                ))}
              </ul>
            </Details>
          )}
        </Card>

        <Card aria-labelledby="bp-next" className="flex flex-col gap-2 md:col-span-4">
          <CardHead id="bp-next" title="Coming up" />
          <ul className="m-0 flex list-none flex-col p-0">
            {d.upcoming.map((u) => (
              <li
                key={u.date}
                className="flex min-h-11 items-center justify-between gap-3 border-b border-line text-[14px] last:border-b-0"
              >
                <span>{when(u.date)}</span>
                <span className="num">{money(u.amount, { cents: true })}</span>
              </li>
            ))}
          </ul>
          <p className="m-0 text-[13px] text-ink-3">{money(d.next_year)} over the next 12 months.</p>
        </Card>
      </div>

      <Candidates billId={b.id} name={b.name} />

      {d.transactions.length > 0 && (
        <Card aria-labelledby="bp-list" className="flex flex-col gap-1">
          <CardHead
            id="bp-list"
            title="Payments"
            right={<span className="text-[13px] text-ink-3">{d.transactions.length}</span>}
          />
          <div className="-mx-1.5 mt-1 flex flex-col">
            {txs.map((t) => (
              <TxRow key={t.id} tx={t} onOpen={(x) => setOpen(x.id)} sub={when(t.date)} />
            ))}
          </div>
          {d.transactions.length > FIRST && (
            <div className="mt-2 flex justify-center">
              <Button onClick={() => setAll((a) => !a)}>
                {all ? "Show fewer" : `Show all ${d.transactions.length}`}
              </Button>
            </div>
          )}
        </Card>
      )}

      <TransactionSheet tx={openTx} onClose={() => setOpen(null)} />
    </>
  );
}

/** When it's next due and whether this one is paid: "Paid $89.00 on 3 Nov. Next due 3 Dec, coming out automatically." */
function dueSentence(d: BillDetail, from?: string): string {
  const b = d.bill;
  const paid = d.due?.paid;
  const way = b.how === "manual" ? ", to pay by hand" : ", coming out automatically";
  const head = paid ? `Paid ${money(paid.amount, { cents: true })} on ${dayDate(paid.date)}. ` : "";
  const after = d.due && paid ? d.upcoming.find((u) => u.date > d.due!.date)?.date : undefined;
  const next = paid ? (after ?? b.next_due) : d.due ? d.due.date : b.next_due;
  const late = !paid && d.due && d.due.date < todayIso();
  return `${head}${late ? "Was due" : "Next due"} ${dayDate(next)}${late ? ", not paid yet" : way}${from && !late ? ` from ${from}` : ""}.`;
}

/**
 * Change the bill: its fields in the entity edit panel (inline on a desktop, a sheet on a phone). Remove takes it off
 * the list straight away and goes back to Bills, with Undo in the toast. Keyed on open, so it starts from the bill.
 */
function EditBill({ bill, open, onClose }: { bill: Bill; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const start = (): BillDraft => ({
    name: bill.name,
    amount: editable(bill.amount),
    every: bill.every,
    next_due: bill.next_due,
    account_id: String(bill.account_id ?? ""),
    how: bill.how,
    category_id: String(bill.category_id ?? ""),
    match: bill.match,
  });
  const [f, setF] = useState(start);
  const changed = JSON.stringify(f) !== JSON.stringify(start());
  const save = useMutation({
    mutationFn: () =>
      apiSend("PUT", `bills/${bill.id}`, {
        ...f,
        amount: parseMoney(f.amount),
        account_id: f.account_id || null,
        category_id: f.category_id || null,
      }),
    onSuccess: () => {
      refresh(qc);
      onClose();
      toast(`${f.name} saved`);
    },
  });
  const remove = useMutation({
    mutationFn: () => apiSend("DELETE", `bills/${bill.id}`),
    onSuccess: () => {
      refresh(qc);
      navigate({ to: "/bills" });
      // Undo outlives this panel (gone once the page goes back to Bills), so it's a plain call, not a mutation here.
      toast(`${bill.name} removed`, () =>
        apiSend("POST", `bills/${bill.id}/restore`)
          .then(() => {
            refresh(qc);
            return navigate({ to: "/bills/$billId", params: { billId: String(bill.id) } });
          })
          .catch((e) => toast(errorMessage(e))),
      );
    },
  });
  return (
    <EditPanel
      open={open}
      onClose={onClose}
      title={`Change ${bill.name}`}
      onSave={() => save.mutate()}
      canSave={changed && !!f.name && parseMoney(f.amount) != null}
      saving={save.isPending || remove.isPending}
      remove={{ label: "Remove bill", onClick: () => remove.mutate() }}
      error={save.isError || remove.isError ? errorMessage(save.error ?? remove.error) : undefined}
    >
      <BillFields f={f} onChange={setF} />
    </EditPanel>
  );
}

/** The latest price change, in words: " It went up from $79.00 to $89.00 in Mar 2026." */
function changeSentence(d: BillDetail): string {
  const c = d.changes[d.changes.length - 1];
  if (!c) return "";
  return ` It went ${c.now > c.was ? "up" : "down"} from ${money(c.was, { cents: true })} to ${money(c.now, { cents: true })} in ${monthYear(c.date.slice(0, 7))}.`;
}

/**
 * Payments that look like this bill but aren't part of any bill yet (how it shows up, about its amount): tick the
 * ones that are and link them, or link them all. Linking teaches the bill how it shows up, so later statements are
 * matched to it by themselves.
 */
function Candidates({ billId, name }: { billId: number; name: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery(billCandidatesQuery(billId));
  const [picked, setPicked] = useState<number[] | null>(null);
  const link = useMutation({
    mutationFn: (ids: number[]) =>
      apiSend<{ linked: number }>("POST", `bills/${billId}/link`, { transaction_ids: ids }),
    onSuccess: (r) => {
      setPicked(null);
      refresh(qc);
      toast(`Added ${r.linked} ${r.linked === 1 ? "payment" : "payments"} to ${name}`);
    },
  });
  const list = q.data ?? [];
  if (!list.length) return null;
  const chosen = picked ?? list.map((c) => c.id);
  const thisYear = String(new Date().getFullYear());
  return (
    <Card aria-labelledby="bp-cand" className="flex flex-col gap-2">
      <CardHead
        id="bp-cand"
        title="Looks like this bill"
        right={<span className="text-[13px] text-ink-3">{list.length}</span>}
      />
      <p className="m-0 text-[13px] text-ink-3">
        Payments that aren't part of a bill yet but look like {name}. Untick any that aren't.
      </p>
      <ul className="m-0 flex list-none flex-col p-0">
        {list.map((c) => {
          const on = chosen.includes(c.id);
          return (
            <li key={c.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => setPicked(on ? chosen.filter((i) => i !== c.id) : [...chosen, c.id])}
                className="press flex min-h-12 w-full min-w-0 cursor-pointer items-center gap-3 rounded-xl border-0 bg-transparent px-1.5 text-left text-ink hover:bg-tile-2"
              >
                <span
                  aria-hidden
                  className={
                    "flex size-5 flex-none items-center justify-center rounded-md border-2 " +
                    (on ? "border-teal bg-teal text-page" : "border-line-2")
                  }
                >
                  {on && (
                    <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth={3.4}>
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="mono block truncate text-[13px]">{c.description}</span>
                  <span className="block truncate text-[12px] text-ink-3">
                    {c.date.startsWith(thisYear) ? dayDate(c.date) : longDate(c.date)} · {c.why}
                  </span>
                </span>
                <span className="num flex-none">{money(c.amount, { cents: true })}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Button primary small disabled={!chosen.length || link.isPending} onClick={() => link.mutate(chosen)}>
          {chosen.length === list.length ? `Add all ${list.length}` : `Add ${chosen.length}`}
        </Button>
        <span className="text-[12px] text-ink-3">Later statements with it are matched by themselves.</span>
      </div>
      {link.isError && <ErrorText>{errorMessage(link.error)}</ErrorText>}
    </Card>
  );
}
