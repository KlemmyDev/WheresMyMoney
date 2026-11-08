/**
 * The balance check-in, as the canvas has it: one account at a time ("What does uBank show right now?") on a number
 * pad, pre-filled with what the app expects, then a review (tap an account to change it) with what the check-in
 * changes, then done. A transfer that didn't add up is flagged with what to do about it. On a desktop the number keys
 * type too.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiSend, errorMessage } from "~/features/common/api";
import { Keypad, Row as DsRow, Sheet, Stat, useSheetTop } from "~/features/common/ds";
import { amount, dayDate, money } from "~/features/common/format";
import { Chip, I, type Glyph, type Tone } from "~/features/common/icons";
import { refresh } from "~/features/common/queries";
import type { Flag } from "~/features/common/types";
import { Button, ErrorText, Pill, Switch, cn } from "~/features/common/ui";

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

const LOOK: Record<string, { g: Glyph; tone: Tone }> = {
  offset: { g: I.offset, tone: "offset" },
  bills: { g: I.bills, tone: "bills" },
  spending: { g: I.spending, tone: "spending" },
  savings: { g: I.savings, tone: "savings" },
  track: { g: I.accounts, tone: "neutral" },
  loan: { g: I.loan, tone: "loan" },
};
const look = (r: { kind: string; role: string }) => LOOK[r.kind === "loan" ? "loan" : r.role] ?? LOOK.track;

/** Cents as the number pad's text: 1059000 → "10590", 1059050 → "10590.5". */
const padText = (c: number) => String(Math.abs(c) / 100);
const padCents = (t: string) => (t === "" ? null : Math.round(Number(t) * 100));
const shown = (t: string) => {
  const [w, d] = t.split(".");
  return `${Number(w || 0).toLocaleString("en-AU")}${d != null ? `.${d}` : ""}`;
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
    <Sheet open={open} onClose={onClose} title="Check in">
      {open && <CheckinLoader onClose={onClose} onImport={onImport} />}
    </Sheet>
  );
}

/** Mounted each time the check-in opens: it fetches the form afresh, then starts from what the app expects. */
function CheckinLoader({ onClose, onImport }: { onClose: () => void; onImport?: () => void }) {
  const form = useQuery({ ...checkinFormQuery, staleTime: 0 });
  if (form.isError)
    return (
      <div className="pb-2">
        <ErrorText>{errorMessage(form.error)}</ErrorText>
      </div>
    );
  if (!form.data || !form.isFetchedAfterMount) return <div className="h-[420px]" aria-busy />;
  return <CheckinBody form={form.data} onClose={onClose} onImport={onImport} />;
}

function CheckinBody({ form, onClose, onImport }: { form: Form; onClose: () => void; onImport?: () => void }) {
  const qc = useQueryClient();
  const banks = form.accounts.filter((a) => a.kind === "bank");
  const loan = form.accounts.find((a) => a.kind === "loan");
  const steps = [...banks, ...(loan ? [loan] : [])];
  // What's typed, as number-pad text; untouched accounts count as what the app expects.
  const [typed, setTyped] = useState<Record<number, string>>({});
  const [step, setStep] = useState(0);
  const [exact, setExact] = useState(false);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [result, setResult] = useState<CheckResult | null>(null);
  const reviewing = step >= steps.length;
  const top = useSheetTop(step);

  const valueOf = (a: Row): number | null =>
    typed[a.id] != null && typed[a.id] !== "" ? padCents(typed[a.id]) : a.kind === "loan" ? null : a.expected;

  const balances = useMemo(() => {
    const out: Record<string, number> = {};
    for (const a of form.accounts) {
      const v =
        typed[a.id] != null && typed[a.id] !== "" ? padCents(typed[a.id]) : a.kind === "loan" ? null : a.expected;
      if (v != null) out[a.id] = v;
    }
    return out;
  }, [typed, form.accounts]);

  // Each account's verdict, as it's typed (a moment after the last key).
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

  if (saved) return <Results saved={saved} onClose={onClose} />;

  const progress = (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 gap-1" aria-hidden>
        {[...steps, null].map((_, n) => (
          <span
            key={n}
            className={cn(
              "h-1 flex-1 rounded-full",
              n < step ? "bg-accent-fill" : n === step ? "bg-[image:var(--grad)]" : "bg-raised",
            )}
          />
        ))}
      </div>
      <span className="mono text-[12px] text-ink-3">{reviewing ? "Review" : `${step + 1} of ${steps.length}`}</span>
    </div>
  );

  if (!reviewing) {
    const a = steps[step];
    return (
      <AccountStep
        key={a.id}
        a={a}
        text={typed[a.id] ?? ""}
        onText={(t) => setTyped((s) => ({ ...s, [a.id]: t }))}
        check={result?.accounts.find((c) => c.id === a.id)}
        loanDue={form.loan_due}
        progress={progress}
        first={step === 0}
        onBack={() => setStep((s) => s - 1)}
        onNext={() => setStep((s) => s + 1)}
        onImport={step === 0 ? onImport : undefined}
      />
    );
  }

  const e = result?.effects;
  const byId = new Map((result?.accounts ?? []).map((c) => [c.id, c]));
  const flagged = (result?.accounts ?? []).filter((c) => c.status === "short" || c.status === "over");
  return (
    <div ref={top} className="flex flex-col gap-4 pb-2">
      {progress}
      <div>
        <h3 className="m-0 text-[20px] font-semibold">Look right?</h3>
        <p className="m-0 text-[13px] text-ink-3">Tap an account to change it.</p>
      </div>
      <div className="flex flex-col">
        {steps.map((a, n) => {
          const v = valueOf(a);
          const c = byId.get(a.id);
          return (
            <DsRow
              key={a.id}
              g={look(a).g}
              tone={look(a).tone}
              title={a.name}
              sub={a.kind === "loan" && v == null ? "Skipped · optional" : v != null ? money(v, { cents: true }) : "—"}
              right={<Verdict c={c} exact={exact} />}
              onClick={() => setStep(n)}
            />
          );
        })}
      </div>
      {flagged.map((f) => (
        <div key={f.id} className="rounded-2xl border border-bills/40 bg-bills/10 px-4 py-3 text-[13px]">
          <b>
            {f.name} is {money(Math.abs(f.difference ?? 0))} {f.status === "short" ? "short" : "over"}.
          </b>{" "}
          <span className="text-ink-2">
            {f.explanation ?? "Not what the rules expected: check it in your banking app."}
          </span>
        </div>
      ))}
      {e && (
        <div className="grid grid-cols-2 gap-2.5">
          <Stat
            label="Loan covered"
            value={e.coverage_after != null ? `${(e.coverage_after * 100).toFixed(1)}%` : "—"}
            note={
              e.coverage_before != null && e.coverage_after != null
                ? `${e.coverage_after >= e.coverage_before ? "+" : "−"}${Math.abs((e.coverage_after - e.coverage_before) * 100).toFixed(1)} points`
                : undefined
            }
            role="offset"
          />
          <Stat
            label="Interest avoided"
            value={money(e.interest_per_day, { cents: true })}
            note="a day"
            role="savings"
          />
          <Stat
            label="Bills set aside"
            value={e.bills_months != null ? `${e.bills_months.toFixed(1)} months` : "—"}
            role="bills"
          />
          <Stat label="Spending left" value={money(e.spending_left)} role="spending" />
        </div>
      )}
      <label className="flex items-center gap-3 rounded-2xl border border-line p-3.5">
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">These are to the cent</span>
          <span className="block text-[13px] text-ink-3">
            Corrects any account whose transactions don't add up to it. Leave off if they're just close.
          </span>
        </span>
        <Switch checked={exact} onChange={setExact} label="These are to the cent" />
      </label>
      {save.isError && <ErrorText>{errorMessage(save.error)}</ErrorText>}
      <div className="flex flex-wrap justify-end gap-2">
        <Button onClick={() => setStep(steps.length - 1)}>Back</Button>
        <Button primary disabled={save.isPending || !Object.keys(balances).length} onClick={() => save.mutate()}>
          {save.isPending ? "Saving…" : "Save check-in"}
        </Button>
      </div>
      <p className="m-0 text-center text-[13px] text-ink-3">Next reminder {dayDate(form.next_reminder)}.</p>
    </div>
  );
}

function AccountStep({
  a,
  text,
  onText,
  check,
  loanDue,
  progress,
  first,
  onBack,
  onNext,
  onImport,
}: {
  a: Row;
  text: string;
  onText: (t: string) => void;
  check: Checked | undefined;
  loanDue: string | null;
  progress: React.ReactNode;
  first: boolean;
  onBack: () => void;
  onNext: () => void;
  onImport?: () => void;
}) {
  const has = text !== "";
  const base = a.expected ?? a.last;
  const v = has ? padCents(text)! : base;
  const diff = a.expected != null ? v - a.expected : null;
  const top = useSheetTop(a.id);
  const loanLike = a.kind === "loan";

  // A desktop keyboard types into the pad too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
      const cur = text;
      if (/^[0-9]$/.test(e.key)) {
        const dec = cur.split(".")[1];
        if (dec != null && dec.length >= 2) return;
        onText(cur === "0" ? e.key : cur + e.key);
      } else if (e.key === "." && !cur.includes(".")) onText((cur || "0") + ".");
      else if (e.key === "Backspace") onText(cur.slice(0, -1));
      else if (e.key === "Enter") onNext();
      else return;
      e.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [text, onText, onNext]);

  let pill: { text: string; tone: "mute" | "good" | "warn" };
  if (!has)
    pill = loanLike
      ? { text: loanDue ? `Optional · repayment due ${dayDate(loanDue)}` : "Optional", tone: "mute" }
      : a.expected != null
        ? { text: `The app expects ${money(a.expected, { cents: true })}`, tone: "mute" }
        : { text: `Last checked ${money(a.last, { cents: true })}`, tone: "mute" };
  else if (diff == null) pill = { text: loanLike ? "Updates the loan" : "Noted", tone: "mute" };
  else if (Math.abs(diff) < 1) pill = { text: "Matches what the app expects", tone: "good" };
  else pill = { text: `${diff > 0 ? "+" : "−"}${money(Math.abs(diff), { cents: true })} vs the app`, tone: "warn" };
  if (has && check && (check.status === "short" || check.status === "over") && check.explanation)
    pill = { ...pill, tone: "warn" };

  return (
    <div ref={top} className="flex flex-col gap-4 pb-2">
      {progress}
      <div className="flex items-center gap-3">
        <Chip g={look(a).g} tone={look(a).tone} size="lg" solid />
        <div className="min-w-0">
          <div className="font-semibold">{a.name}</div>
          <div className="text-[13px] text-ink-3">What does uBank show right now?</div>
        </div>
      </div>
      <div
        className="flex h-[84px] items-center justify-center gap-1 rounded-[20px] border bg-sunken"
        style={{ borderColor: "color-mix(in srgb, var(--color-accent) 35%, var(--color-line))" }}
        aria-live="polite"
        aria-label={has ? `Typed ${money(v, { cents: true })}` : `Not typed yet, ${pill.text}`}
      >
        <span className="text-[24px] text-ink-3">$</span>
        <span className={cn("num text-[40px] leading-none", !has && "text-ink-3")}>
          {has ? shown(text) : amount(base, { cents: true })}
        </span>
      </div>
      <div className="flex justify-center">
        <Pill tone={pill.tone}>{pill.text}</Pill>
      </div>
      <Keypad value={text} onChange={onText} />
      <div className="grid grid-cols-2 gap-2">
        {first ? (
          onImport ? (
            <Button onClick={onImport}>I have a statement file</Button>
          ) : (
            <span />
          )
        ) : (
          <Button onClick={onBack}>Back</Button>
        )}
        {has || loanLike ? (
          <Button primary onClick={onNext}>
            {loanLike && !has ? "Skip" : "Next"}
          </Button>
        ) : (
          <Button
            primary
            onClick={() => {
              onText(padText(base));
              onNext();
            }}
          >
            {a.expected != null ? "That's right" : "Same as last time"}
          </Button>
        )}
      </div>
    </div>
  );
}

function Verdict({ c, exact }: { c: Checked | undefined; exact: boolean }) {
  if (!c) return null;
  if (exact && c.adjustment) return <Pill tone="teal">Adjust {amount(c.adjustment, { sign: true })}</Pill>;
  switch (c.status) {
    case "ok":
      return <Pill tone="good">Adds up</Pill>;
    case "short":
    case "over":
      return (
        <Pill tone="warn">
          {money(Math.abs(c.difference ?? 0))} {c.status}
        </Pill>
      );
    case "spent":
      return (
        <Pill tone="mute">
          {money(Math.abs(c.spent ?? 0))} {(c.spent ?? 0) >= 0 ? "spent" : "in"}
        </Pill>
      );
    case "loan":
      return <Pill tone="mute">Updated</Pill>;
    default:
      return null;
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
  const total = rows.reduce((t, a) => t + (a.entered ?? 0), 0);
  const top = useSheetTop("done");
  return (
    <div ref={top} className="flex flex-col gap-4 pb-2">
      <div className="flex flex-col items-center gap-2 text-center">
        <Chip g={I.shield} tone="grad" size="xxl" solid />
        <h3 className="m-0 text-[22px] font-semibold">
          {flags.length ? "Saved, with something to look at" : `All ${rows.length} checked`}
        </h3>
        <p className="m-0 text-[13px] text-ink-3">Next check-in {dayDate(saved.next_reminder)}</p>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Stat
          label="Loan covered"
          value={e.coverage_after != null ? `${(e.coverage_after * 100).toFixed(1)}%` : "—"}
          note={`avoiding ${money(e.interest_per_day, { cents: true })} a day`}
          role="offset"
        />
        <Stat label="Total" value={money(total)} note={`across ${rows.length}`} role="accent" />
      </div>
      {flags.map((f) => (
        <div key={f.id} className="flex flex-col gap-2 rounded-2xl border border-bills/40 bg-bills/10 p-4">
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
              className="press inline-flex min-h-[34px] items-center rounded-[10px] px-3 text-[13px] font-medium text-ink no-underline shadow-[inset_0_0_0_1px_var(--color-line-2)]"
            >
              Edit rule
            </a>
          </div>
        </div>
      ))}
      <div className="flex flex-col" aria-label="Changes since last check-in">
        {rows.map((a) => {
          const c = a.change ?? 0;
          const flag = a.status === "short" || a.status === "over";
          return (
            <DsRow
              key={a.id}
              g={look(a).g}
              tone={look(a).tone}
              title={a.name}
              sub={money(a.entered, { cents: true })}
              right={
                <span
                  className="num text-[14px]"
                  style={{
                    color: flag ? "var(--color-bills)" : c >= 0 ? "var(--color-savings)" : "var(--color-ink-2)",
                  }}
                >
                  {c === 0 ? "No change" : `${c > 0 ? "+" : "−"}${money(Math.abs(c))}`}
                </span>
              }
            />
          );
        })}
      </div>
      <Button primary onClick={onClose}>
        Back to overview
      </Button>
    </div>
  );
}
