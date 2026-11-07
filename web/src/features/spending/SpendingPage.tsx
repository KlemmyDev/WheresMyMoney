/**
 * Spending (design: CkSpend): the spending month from top-up to top-up. What's left of the allowance, safe to spend a
 * day, the pace against an even month, where it'll be at the next top-up (what's left rolls into the offset), each day's
 * spending, each category against its budget (the tick is the pace to date), who spent it, and the latest spending.
 */
import { Loading } from "~/features/common/brand";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState, type CSSProperties } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { Count, DayBars } from "~/features/common/charts";
import { amount, capsDate, editable, longDate, money, parseMoney, shortDate } from "~/features/common/format";
import { useActions } from "~/features/common/layout";
import { Dialog } from "~/features/common/overlay";
import { categoriesQuery, refresh, spendingQuery } from "~/features/common/queries";
import { Button, Dot, Empty, ErrorText, Input, PageHead, Pill, Tile, TileTitle } from "~/features/common/ui";

export function SpendingPage() {
  const q = useQuery(spendingQuery);
  const actions = useActions();
  const [budgets, setBudgets] = useState(false);
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
  const spentTotal = m.categories.reduce((s, c) => s + c.spent, 0) + m.unsorted;
  return (
    <>
      <PageHead
        over={`SPENDING ACCOUNT · ${shortDate(m.start).toUpperCase()} – ${shortDate(m.end).toUpperCase()} · DAY ${m.day} OF ${m.days}`}
        title="Spending"
        actions={
          <>
            <Button onClick={() => setBudgets(true)}>Budgets</Button>
            <Button primary onClick={actions.addSpending}>
              Add spending
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-[repeat(auto-fit,minmax(210px,1fr))] gap-4">
        <Tile i={0}>
          <TileTitle right={<Dot c="spending" />}>Left this month</TileTitle>
          <div className="mono text-[26px] font-semibold">
            <Count k="sp:left" value={m.left} format={(v) => money(v)} />
          </div>
          <div className="mono text-xs text-ink-3">of {money(m.allowance)} · 1 month</div>
        </Tile>
        <Tile i={1}>
          <div className="tt">Safe to spend</div>
          <div className="mono text-[26px] font-semibold text-teal">
            <Count k="sp:safe" value={m.safe_per_day} format={(v) => money(v)} />
            <span className="text-[15px] text-ink-3"> /day</span>
          </div>
          <div className="mono text-xs text-ink-3">for the next {m.remaining} days</div>
        </Tile>
        <Tile i={2}>
          <TileTitle right={<Pill tone={under ? "good" : "warn"}>{under ? "UNDER" : "OVER"}</Pill>}>
            Vs even pace
          </TileTitle>
          <div className="mono text-[26px] font-semibold">{money(m.vs_pace, { sign: true })}</div>
          <div className="mono text-xs text-ink-3">
            {m.allowance ? Math.round((m.spent / m.allowance) * 100) : 0}% spent at {Math.round(m.pace * 100)}% of month
          </div>
        </Tile>
        <Tile i={3}>
          <div className="tt">Projected at top-up</div>
          <div
            className="mono text-[26px] font-semibold"
            style={{ color: m.projected < 0 ? "var(--color-warn)" : undefined }}
          >
            {money(m.projected, { sign: true })}
          </div>
          <div className="mono text-xs text-ink-3">
            {m.projected >= 0
              ? `rolls into Offset on ${shortDate(nextDay(m.end))}`
              : `short before ${shortDate(nextDay(m.end))}`}
          </div>
        </Tile>
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
                Even pace {money(m.even_per_day)}/day
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
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,440px),1fr))] gap-4">
        <Tile i={5} aria-labelledby="s-cat">
          <TileTitle id="s-cat" right={<span className="mono">{money(spentTotal)}</span>}>
            By category · tick is pace to date
          </TileTitle>
          <div className="flex flex-col gap-3">
            {m.categories.map((c, i) => {
              const ratio = c.budget ? c.spent / c.budget : 0;
              const over = c.budget != null && ratio > m.pace * 1.25 && ratio > 0.5;
              return (
                <div key={c.id} className="grid grid-cols-[110px_1fr_120px] items-center gap-3 text-[13px]">
                  <span>{c.name}</span>
                  <span className="relative h-2.5 rounded-[3px] bg-raised">
                    <i
                      className="grow-x absolute inset-y-0 left-0 rounded-[3px]"
                      style={
                        {
                          width: `${Math.min(ratio, 1) * 100}%`,
                          background: over ? "var(--color-warn)" : "var(--color-spending)",
                          "--i": i,
                        } as CSSProperties
                      }
                    />
                    {c.budget != null && (
                      <b
                        className="absolute -top-[3px] -bottom-[3px] w-0.5 bg-ink-2"
                        style={{ left: `${m.pace * 100}%` }}
                      />
                    )}
                  </span>
                  <span className="mono text-right" style={{ color: over ? "var(--color-warn)" : undefined }}>
                    {money(c.spent)}
                    {c.budget != null ? ` / ${amount(c.budget)}` : ""}
                  </span>
                </div>
              );
            })}
            {m.unsorted > 0 && (
              <div className="grid grid-cols-[110px_1fr_120px] items-center gap-3 text-[13px] text-ink-2">
                <span>Not sorted yet</span>
                <span />
                <span className="mono text-right">{money(m.unsorted)}</span>
              </div>
            )}
          </div>
          {m.unbudgeted > 0 && (
            <div className="text-xs text-ink-3">
              {money(m.unbudgeted)} of the {money(m.allowance)} isn't budgeted. It's the buffer.
            </div>
          )}
        </Tile>
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
              <Link
                to="/transactions"
                search={{ account: m.account_id }}
                className="font-medium text-teal no-underline"
              >
                All transactions
              </Link>
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
      <Budgets open={budgets} onClose={() => setBudgets(false)} since={longDate(m.start)} />
    </>
  );
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function Budgets({ open, onClose, since }: { open: boolean; onClose: () => void; since: string }) {
  const qc = useQueryClient();
  const cats = useQuery({ ...categoriesQuery, enabled: open });
  const [name, setName] = useState("");
  const save = useMutation({
    mutationFn: ({ id, ...body }: { id?: number; name: string; kind: string; budget: number | null }) =>
      id ? apiSend("PUT", `categories/${id}`, body) : apiSend("POST", "categories", body),
    onSuccess: () => (refresh(qc), setName("")),
  });
  const removeRule = useMutation({
    mutationFn: (id: number) => apiSend("DELETE", `merchant-rules/${id}`),
    onSuccess: () => refresh(qc),
  });
  return (
    <Dialog open={open} onClose={onClose} labelledBy="bud-h">
      <div className="flex flex-col gap-3 overflow-y-auto p-6">
        <h2 id="bud-h" className="m-0 text-xl font-semibold">
          Budgets and categories
        </h2>
        <div className="text-[13px] text-ink-2">
          A month's budget for each spending category. This month started {since}.
        </div>
        {(cats.data?.categories ?? [])
          .filter((c) => c.kind === "spending")
          .map((c) => (
            <div key={c.id} className="grid grid-cols-[1fr_130px] items-center gap-3 text-[13px]">
              <span>{c.name}</span>
              <Input
                aria-label={`${c.name} budget`}
                inputMode="decimal"
                className="text-right"
                placeholder="No budget"
                defaultValue={editable(c.budget)}
                onBlur={(e) => {
                  const v = e.target.value.trim() ? parseMoney(e.target.value) : null;
                  if (v !== c.budget) save.mutate({ id: c.id, name: c.name, kind: c.kind, budget: v });
                }}
              />
            </div>
          ))}
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Input
            className="font-sans"
            placeholder="A new category"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button disabled={!name} onClick={() => save.mutate({ name, kind: "spending", budget: null })}>
            Add
          </Button>
        </div>
        {save.isError && <ErrorText>{errorMessage(save.error)}</ErrorText>}
        <div className="tt mt-2">Merchants remembered</div>
        {(cats.data?.merchant_rules ?? []).map((r) => (
          <div key={r.id} className="flex items-center justify-between gap-2 border-t border-line py-1.5 text-[13px]">
            <span className="mono">{r.pattern}</span>
            <span className="flex items-center gap-2 text-ink-2">
              {r.category}
              <Button small aria-label={`Forget ${r.pattern}`} onClick={() => removeRule.mutate(r.id)}>
                ✕
              </Button>
            </span>
          </div>
        ))}
        {!cats.data?.merchant_rules.length && (
          <div className="text-ink-3">None yet: choose "Always use" when sorting an import.</div>
        )}
        <div className="flex justify-end">
          <Button primary onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
