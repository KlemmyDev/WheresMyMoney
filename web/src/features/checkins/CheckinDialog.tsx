/**
 * The balance check-in (designs: CheckinDesk on a desktop, Checkin1 and Checkin2 on a phone).
 *
 * Each account's balance, pre-filled with what the rules expected; as figures are typed, each row says whether it adds
 * up, and the side says what the check-in changes (coverage, interest avoided, the bills buffer, safe to spend). A
 * transfer that didn't add up is flagged with what to do about it. Saving shows the success tick and the results.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiSend, errorMessage } from "~/features/common/api";
import { CoverageRing } from "~/features/common/charts";
import { amount, dayDate, editable, money, parseMoney } from "~/features/common/format";
import { Dialog } from "~/features/common/overlay";
import { refresh } from "~/features/common/queries";
import type { Flag } from "~/features/common/types";
import { Button, Dot, ErrorText, Input, Option, SuccessTick, Tile, cn } from "~/features/common/ui";

type Row = {
  id: number;
  name: string;
  kind: "bank" | "loan";
  role: string;
  colour: string;
  last: number;
  expected: number | null;
  approximate: boolean;
  because: string[];
};

type Form = {
  date: string;
  since: string;
  accounts: Row[];
  loan_due: string | null;
  tolerance: number;
  next_reminder: string;
  flags: Flag[];
};

type Checked = {
  id: number;
  name: string;
  role: string;
  kind: string;
  status: "ok" | "short" | "over" | "spent" | "loan" | "skipped";
  entered?: number;
  previous?: number;
  change?: number;
  expected?: number;
  difference?: number;
  spent?: number;
  explanation?: string | null;
  adjustment?: number;
};

type CheckResult = {
  since: string;
  accounts: Checked[];
  effects: {
    offsetting_before: number;
    offsetting_after: number;
    loan: number;
    coverage_before: number | null;
    coverage_after: number | null;
    interest_per_day: number;
    bills_months: number | null;
    spending_left: number | null;
  };
};

type Saved = CheckResult & { id: number; flags: Flag[]; next_reminder: string };

export const checkinFormQuery = {
  queryKey: ["checkin-form"],
  queryFn: ({ signal }: { signal: AbortSignal }) => apiGet<Form>("checkins", undefined, { signal }),
};

export function CheckinDialog({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onImport?: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} labelledBy="ci-h" wide>
      <CheckinLoader onClose={onClose} onImport={onImport} />
    </Dialog>
  );
}

/** Mounted each time the check-in opens: it fetches the form afresh, then starts from what the rules expected. */
function CheckinLoader({ onClose, onImport }: { onClose: () => void; onImport?: () => void }) {
  const form = useQuery({ ...checkinFormQuery, staleTime: 0 });
  if (form.isError)
    return (
      <div className="p-6">
        <ErrorText>{errorMessage(form.error)}</ErrorText>
      </div>
    );
  if (!form.data || !form.isFetchedAfterMount) return <div className="h-[420px]" aria-busy />;
  return <CheckinBody form={form.data} onClose={onClose} onImport={onImport} />;
}

function CheckinBody({ form, onClose, onImport }: { form: Form; onClose: () => void; onImport?: () => void }) {
  const qc = useQueryClient();
  // Pre-filled with what the rules expected (spending and the loan start empty).
  const [values, setValues] = useState<Record<number, string>>(() =>
    Object.fromEntries(form.accounts.map((a) => [a.id, a.expected != null ? editable(a.expected) : ""])),
  );
  const [exact, setExact] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);

  const balances = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(values)) {
      const c = parseMoney(v);
      if (c != null) out[k] = c;
    }
    return out;
  }, [values]);

  // Each row's verdict, as it's typed (a moment after the last key).
  const seq = useRef(0);
  useEffect(() => {
    const n = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const r = await apiSend<CheckResult>("POST", "checkins/check", { balances, exact });
        if (n === seq.current) setResult(r);
      } catch {
        /* the save will say what's wrong */
      }
    }, 250);
    return () => clearTimeout(t);
  }, [balances, exact]);

  const save = useMutation({
    mutationFn: () => apiSend<Saved>("POST", "checkins", { balances, exact }),
    onSuccess: (s) => {
      setSaved(s);
      refresh(qc);
    },
  });

  const byId = new Map((result?.accounts ?? []).map((a) => [a.id, a]));
  const flagged = (result?.accounts ?? []).filter((a) => a.status === "short" || a.status === "over");
  const e = result?.effects;

  return (
    <>
      {saved ? (
        <Results saved={saved} onClose={onClose} />
      ) : (
        <>
          <div className="flex-none px-6 pt-4 pb-2 sm:pt-6">
            <div className="mono text-xs text-ink-3">CHECK-IN · {dayDate(form.date).toUpperCase()}</div>
            <h2 id="ci-h" className="mt-1 mb-0 text-[22px] font-semibold">
              Copy your balances in
            </h2>
            <p className="mt-1 mb-0 text-[13px] text-ink-2">
              Rough is fine, to the nearest $10. A statement import later fills in the exact figures and every
              transaction.
            </p>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 pb-4 md:flex-row">
            <div className="min-w-0 flex-[1.5]">
              <div className="grid grid-cols-[10px_minmax(0,1fr)_minmax(0,140px)] items-center gap-x-3 gap-y-0 sm:grid-cols-[10px_minmax(90px,1fr)_100px_150px_120px]">
                <span />
                <span className="tt py-2">Account</span>
                <span className="tt hidden py-2 sm:block">Expected</span>
                <span className="tt py-2">Balance now</span>
                <span className="tt hidden py-2 sm:block">Check</span>
                {form.accounts.map((a, i) => {
                  const c = byId.get(a.id);
                  return (
                    <CheckinRow
                      key={a.id}
                      i={i}
                      row={a}
                      value={values[a.id] ?? ""}
                      onChange={(v) => setValues((s) => ({ ...s, [a.id]: v }))}
                      check={c}
                      loanDue={form.loan_due}
                      exact={exact}
                    />
                  );
                })}
              </div>
              {flagged.map((f) => (
                <div
                  key={f.id}
                  className="reveal mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3.5 py-2.5 text-[13px]"
                >
                  <span className="min-w-0 flex-1">
                    <b>
                      {f.name} is {money(Math.abs(f.difference ?? 0))} {f.status === "short" ? "short" : "over"}.
                    </b>{" "}
                    <span className="text-ink-2">
                      {f.explanation ?? "Not what the rules expected: check it in your banking app."}
                    </span>
                  </span>
                </div>
              ))}
              <div className="mt-3">
                <Option on={exact} role="checkbox" onClick={() => setExact((x) => !x)} title="These are exact">
                  Add a balance adjustment for any account whose transactions don't add up to it. Leave off for a rough
                  check-in.
                </Option>
              </div>
            </div>
            <aside
              aria-label="What this check-in changes"
              className="flex min-w-0 flex-1 flex-col gap-3 rounded-xl border border-line bg-page/60 p-4"
            >
              <div className="tt">What this changes</div>
              {e && (
                <>
                  <div className="flex items-center gap-4">
                    <CoverageRing k="checkin" all={e.coverage_after ?? 0} offset={0} size={110}>
                      <div className="mono text-[22px] leading-none font-semibold">
                        {((e.coverage_after ?? 0) * 100).toFixed(1)}
                        <span className="text-xs">%</span>
                      </div>
                    </CoverageRing>
                    <div className="min-w-0 text-[13px]">
                      <div>
                        <span className="text-ink-3">Loan covered</span>{" "}
                        {e.coverage_before != null && e.coverage_after != null && (
                          <span
                            className="mono"
                            style={{
                              color: e.coverage_after >= e.coverage_before ? "var(--color-good)" : "var(--color-warn)",
                            }}
                          >
                            {e.coverage_after >= e.coverage_before ? "▲" : "▼"}{" "}
                            {Math.abs((e.coverage_after - e.coverage_before) * 100).toFixed(1)} pts
                          </span>
                        )}
                      </div>
                      <div className="mono mt-1">
                        {money(e.offsetting_before)} → {money(e.offsetting_after)}
                      </div>
                      <div className="mt-1 text-ink-2">
                        Interest avoided <b className="mono text-ink">{money(e.interest_per_day, { cents: true })}</b>
                        /day
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-raised px-3 py-2.5">
                      <div className="tt">Bills buffer</div>
                      <div className="mono text-lg font-semibold">
                        {e.bills_months != null ? `${e.bills_months.toFixed(1)} mo` : "—"}
                      </div>
                    </div>
                    <div className="rounded-lg bg-raised px-3 py-2.5">
                      <div className="tt">Spending left</div>
                      <div className="mono text-lg font-semibold">{money(e.spending_left)}</div>
                    </div>
                  </div>
                </>
              )}
              <div className="mt-auto text-[13px] text-ink-2">
                Takes about 30 seconds. Next reminder {dayDate(form.next_reminder)}.
              </div>
            </aside>
          </div>
          {save.isError && (
            <div className="px-6">
              <ErrorText>{errorMessage(save.error)}</ErrorText>
            </div>
          )}
          <footer className="flex flex-none flex-wrap items-center justify-between gap-2 border-t border-line px-6 py-4">
            {onImport ? <Button onClick={onImport}>Import a CSV instead</Button> : <span />}
            <div className="flex gap-2">
              <Button onClick={onClose}>Cancel</Button>
              <Button primary disabled={save.isPending || !Object.keys(balances).length} onClick={() => save.mutate()}>
                {save.isPending ? "Saving…" : "Save check-in"}
              </Button>
            </div>
          </footer>
        </>
      )}
    </>
  );
}

function CheckinRow({
  row,
  value,
  onChange,
  check,
  loanDue,
  exact,
  i,
}: {
  row: Row;
  value: string;
  onChange: (v: string) => void;
  check: Checked | undefined;
  loanDue: string | null;
  exact: boolean;
  i: number;
}) {
  const id = `ci-${row.id}`;
  const status = statusOf(row, check, loanDue, exact);
  return (
    <>
      <span className="rise flex border-t border-line py-3" style={{ ["--i" as string]: i }}>
        {row.kind === "loan" ? <span className="size-2" /> : <Dot c={row.colour} />}
      </span>
      <label htmlFor={id} className="rise border-t border-line py-2.5 text-[13px]" style={{ ["--i" as string]: i }}>
        <span className={row.kind === "loan" ? "text-ink-2" : "font-medium"}>{row.name}</span>
        {row.kind === "loan" && <span className="text-ink-3"> optional</span>}
        <span className="mono block text-xs text-ink-3 sm:hidden">
          {row.expected != null
            ? `expected ${amount(row.expected, { cents: true })}`
            : `last ${amount(row.last, { cents: true })}`}
        </span>
        <span className="mono block text-xs sm:hidden" style={{ color: status.colour }}>
          {status.text}
        </span>
      </label>
      <span
        className="rise mono hidden border-t border-line py-3 text-[13px] text-ink-3 sm:block"
        style={{ ["--i" as string]: i }}
      >
        {row.expected != null
          ? `${row.approximate ? "≈" : ""}${amount(row.expected, { cents: true })}`
          : row.kind === "loan"
            ? amount(row.last, { cents: true })
            : "varies"}
      </span>
      <span className="rise border-t border-line py-1.5" style={{ ["--i" as string]: i }}>
        <Input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          value={value}
          placeholder={row.kind === "loan" ? "monthly" : amount(row.last, { cents: true })}
          onChange={(e) => onChange(e.target.value)}
          className={cn(status.tone === "warn" && "border-warn")}
        />
      </span>
      <span
        className="rise mono hidden border-t border-line py-3 text-xs font-semibold sm:block"
        style={{ color: status.colour, ["--i" as string]: i }}
      >
        {status.text}
      </span>
    </>
  );
}

function statusOf(row: Row, c: Checked | undefined, loanDue: string | null, exact: boolean) {
  const muted = { text: "", colour: "var(--color-ink-3)", tone: "mute" };
  if (!c) return muted;
  if (exact && c.adjustment) {
    return { text: `ADJ ${amount(c.adjustment, { sign: true })}`, colour: "var(--color-teal)", tone: "teal" };
  }
  switch (c.status) {
    case "ok":
      return { text: "✓ ADDS UP", colour: "var(--color-good)", tone: "good" };
    case "short":
    case "over":
      return {
        text: `⚑ ${money(Math.abs(c.difference ?? 0))} ${c.status.toUpperCase()}`,
        colour: "var(--color-warn)",
        tone: "warn",
      };
    case "spent":
      return {
        text: `${amount(-(c.spent ?? 0), { sign: true })} ${(c.spent ?? 0) >= 0 ? "SPENT" : "IN"}`,
        colour: "var(--color-ink-2)",
        tone: "mute",
      };
    case "loan":
      return { text: "UPDATED", colour: "var(--color-ink-2)", tone: "mute" };
    default:
      return row.kind === "loan" && loanDue
        ? { ...muted, text: `DUE ${dayDate(loanDue).slice(4).toUpperCase()}` }
        : muted;
  }
}

function Results({ saved, onClose }: { saved: Saved; onClose: () => void }) {
  const qc = useQueryClient();
  const [flags, setFlags] = useState(saved.flags);
  const act = useMutation({
    mutationFn: ({ id, action }: { id: number; action: string }) =>
      apiSend<{ flags: Flag[] }>("POST", `checkins/flags/${id}`, { action }),
    onSuccess: (r) => {
      setFlags(r.flags);
      refresh(qc);
    },
  });
  const e = saved.effects;
  const rows = saved.accounts.filter((a) => a.entered != null && a.kind === "bank");
  return (
    <div className="flex min-h-0 flex-col gap-3 overflow-y-auto p-6">
      <div className="flex items-center gap-4">
        <SuccessTick size={56} />
        <div>
          <h2 id="ci-h" className="m-0 text-xl font-semibold">
            Check-in saved
          </h2>
          <div className="mono text-xs text-ink-3">NEXT CHECK-IN · {dayDate(saved.next_reminder).toUpperCase()}</div>
        </div>
      </div>
      <Tile i={0} className="flex-row items-center gap-4">
        <CoverageRing k="checkin-result" all={e.coverage_after ?? 0} offset={0} size={100}>
          <div className="mono text-lg leading-none font-semibold">{((e.coverage_after ?? 0) * 100).toFixed(1)}%</div>
        </CoverageRing>
        <div>
          <div className="tt">Loan covered</div>
          <div className="mono">
            {e.coverage_before != null && e.coverage_after != null && (
              <span className={e.coverage_after >= e.coverage_before ? "text-good" : "text-warn"}>
                {e.coverage_after >= e.coverage_before ? "▲" : "▼"}{" "}
                {Math.abs((e.coverage_after - e.coverage_before) * 100).toFixed(1)} pts
              </span>
            )}{" "}
            · {money(e.offsetting_after)}
          </div>
          <div className="text-[13px] text-ink-2">
            Now avoiding <b className="mono text-ink">{money(e.interest_per_day, { cents: true })}</b> a day in interest
          </div>
        </div>
      </Tile>
      {flags.map((f, i) => (
        <Tile key={f.id} i={i + 1} className="border-warn/40">
          <div className="font-semibold">
            {f.account} is {money(Math.abs(f.difference))} {f.difference < 0 ? "short" : "over"}
          </div>
          <div className="text-[13px] text-ink-2">
            {saved.accounts.find((a) => a.id === f.account_id)?.explanation ??
              "That's not what the rules expected. It may not have run yet."}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button small onClick={() => act.mutate({ id: f.id, action: "snooze" })}>
              Check again tomorrow
            </Button>
            <Button small onClick={() => act.mutate({ id: f.id, action: "skip" })}>
              Skipped it this time
            </Button>
            <a
              href="/rules"
              className="press inline-flex min-h-8 items-center rounded-lg border border-line px-2.5 text-xs font-medium text-ink no-underline hover:bg-raised"
            >
              Edit rule
            </a>
          </div>
        </Tile>
      ))}
      <Tile i={flags.length + 1} aria-label="Changes since last check-in">
        <div className="grid grid-cols-[10px_1fr_auto_auto] items-center gap-x-3 text-[13px]">
          <span />
          <span className="tt">Account</span>
          <span className="tt text-right">Now</span>
          <span className="tt text-right">Change</span>
          {rows.map((a) => (
            <RowChange key={a.id} a={a} />
          ))}
        </div>
      </Tile>
      <div className="flex justify-end">
        <Button primary onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

function RowChange({ a }: { a: Checked }) {
  const c = a.change ?? 0;
  const flag = a.status === "short" || a.status === "over";
  return (
    <>
      <span className="border-t border-line py-2">
        <Dot c={a.role} />
      </span>
      <span className="border-t border-line py-2">{a.name}</span>
      <span className="mono border-t border-line py-2 text-right">{amount(a.entered)}</span>
      <span
        className="mono border-t border-line py-2 text-right"
        style={{ color: flag ? "var(--color-warn)" : c >= 0 ? "var(--color-good)" : "var(--color-ink-2)" }}
      >
        {amount(c, { sign: true })}
        {flag ? " ⚑" : ""}
      </span>
    </>
  );
}
