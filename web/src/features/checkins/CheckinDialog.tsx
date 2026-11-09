/**
 * The balance check-in, from the uplift canvas (SfCheckIn): one screen. Each account is filled in with what the app
 * expects; change any that differ and the difference shows as you type. Underneath, the moves the rules should have
 * made since the last check-in: say whether each happened or was skipped (a skipped one changes what's expected), or
 * leave it for next time. Then one Save, which closes the sheet with an Undo toast.
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { apiGet, apiSend, errorMessage } from "~/features/common/api";
import { Sheet } from "~/features/common/ds";
import { dayDate, editable, money, parseMoney, pct } from "~/features/common/format";
import { Chip, I, type Glyph, type Tone } from "~/features/common/icons";
import { useToast } from "~/features/common/overlay";
import { refresh } from "~/features/common/queries";
import { Button, ErrorText, Input, Pill, Switch, cn } from "~/features/common/ui";

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

type Move = {
  key: string;
  rule_id: number;
  label: string;
  amount: number;
  from: number;
  to: number;
  from_name: string;
  to_name: string;
  date: string;
};

type Form = {
  date: string;
  since: string;
  last: { id: number; date: string; exact: boolean } | null;
  accounts: Row[];
  tolerance: number;
  next_reminder: string;
  moves: Move[];
};

type Checked = {
  id: number;
  name: string;
  status: "ok" | "short" | "over" | "spent" | "loan" | "skipped";
  entered?: number;
  expected?: number;
  difference?: number;
  spent?: number;
  explanation?: string | null;
  adjustment?: number;
};

type CheckResult = {
  accounts: Checked[];
  effects: { offsetting_after: number; coverage_after: number | null };
};

type Saved = CheckResult & { id: number };

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
};

/** Waits until `value` has stopped changing for `ms`, so the check isn't asked on every keystroke. */
function useSettled<T>(value: T, ms = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

export function CheckinDialog({ open, onClose }: { open: boolean; onClose: () => void; onImport?: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title="Check in">
      {open && <CheckinLoader onClose={onClose} />}
    </Sheet>
  );
}

/** Mounted each time the check-in opens: it fetches the form afresh, then starts from what the app expects. */
function CheckinLoader({ onClose }: { onClose: () => void }) {
  const form = useQuery({ ...checkinFormQuery, staleTime: 0 });
  if (form.isError)
    return (
      <div className="pb-2">
        <ErrorText>{errorMessage(form.error)}</ErrorText>
      </div>
    );
  if (!form.data || !form.isFetchedAfterMount) return <div className="h-[420px]" aria-busy />;
  return <CheckinBody form={form.data} onClose={onClose} />;
}

function CheckinBody({ form, onClose }: { form: Form; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  // The loan is updated when its statement comes, so only the bank accounts are asked for.
  const accounts = form.accounts.filter((a) => a.kind === "bank");
  const [text, setText] = useState<Record<number, string>>(() =>
    Object.fromEntries(accounts.map((a) => [a.id, editable(a.expected ?? a.last)])),
  );
  const [exact, setExact] = useState(false);
  const [answers, setAnswers] = useState<Record<string, "yes" | "skip">>({});
  const balances = useMemo(() => {
    const out: Record<number, number> = {};
    for (const a of accounts) {
      const c = parseMoney(text[a.id] ?? "");
      if (c != null) out[a.id] = c;
    }
    return out;
  }, [accounts, text]);
  const skipped = Object.entries(answers)
    .filter(([, v]) => v === "skip")
    .map(([k]) => k)
    .sort();
  const ask = useSettled({ balances, exact, skipped });
  const check = useQuery({
    queryKey: ["checkin-check", ask],
    queryFn: () => apiSend<CheckResult>("POST", "checkins/check", ask),
    placeholderData: keepPreviousData,
    enabled: Object.keys(ask.balances).length > 0,
  });
  const byId = new Map((check.data?.accounts ?? []).map((c) => [c.id, c]));
  const differ = (check.data?.accounts ?? []).filter((c) => c.status === "short" || c.status === "over").length;
  const undo = useMutation({
    mutationFn: (id: number) => apiSend("DELETE", `checkins/${id}`),
    onSuccess: () => refresh(qc),
  });
  const save = useMutation({
    mutationFn: () => apiSend<Saved>("POST", "checkins", { balances, exact, skipped }),
    onSuccess: (saved) => {
      refresh(qc);
      qc.invalidateQueries({ queryKey: checkinFormQuery.queryKey });
      onClose();
      const off = saved.accounts.filter((c) => c.status === "short" || c.status === "over").length;
      toast(
        `Checked in${exact ? ", to the cent" : ""}.${off ? ` ${off} ${off === 1 ? "account doesn't" : "accounts don't"} add up yet.` : " Everything adds up."}`,
        () => undo.mutate(saved.id),
      );
    },
  });
  const nothing = Object.keys(balances).length === 0;
  const effects = check.data?.effects;
  return (
    <div className="flex flex-col gap-5 pb-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="m-0 text-[14px] text-ink-2">
          What does uBank show right now? Each one is filled in with what the app expects; change any that differ.
          {form.last ? ` Last check-in ${dayDate(form.last.date)}.` : ""}
        </p>
        {check.data && <Pill tone={differ ? "warn" : "good"}>{differ ? `${differ} differ` : "All match"}</Pill>}
      </div>

      <div className="flex flex-col gap-2.5">
        {accounts.map((a) => {
          const c = byId.get(a.id);
          const lookOf = LOOK[a.role] ?? LOOK.track;
          return (
            <div key={a.id} className="flex items-center gap-3 rounded-2xl border border-line bg-tile-2 px-3 py-2.5">
              <Chip g={lookOf.g} tone={lookOf.tone} size="lg" />
              <div className="min-w-0 flex-1">
                <label htmlFor={`ci-${a.id}`} className="block font-semibold">
                  {a.name}
                </label>
                <div className="text-[13px] text-ink-3">
                  {a.expected != null ? `Expected ${money(a.expected, { cents: true })}` : `Last ${money(a.last)}`}
                </div>
                <Note c={c} exact={exact} />
              </div>
              <div className="flex w-[150px] flex-none items-center gap-1">
                <span aria-hidden className="text-ink-3">
                  $
                </span>
                <Input
                  id={`ci-${a.id}`}
                  inputMode="decimal"
                  className="num text-right"
                  value={text[a.id] ?? ""}
                  onChange={(e) => setText((t) => ({ ...t, [a.id]: e.target.value }))}
                  onFocus={(e) => e.target.select()}
                />
              </div>
            </div>
          );
        })}
      </div>

      {form.moves.length > 0 && (
        <section aria-labelledby="ci-moves" className="flex flex-col gap-2.5">
          <h3 id="ci-moves" className="m-0 text-[15px] font-semibold">
            Did these moves happen?
          </h3>
          {form.moves.map((m) => {
            const a = answers[m.key];
            const answer = (v: "yes" | "skip") =>
              setAnswers((x) => {
                const next = { ...x };
                if (x[m.key] === v) delete next[m.key];
                else next[m.key] = v;
                return next;
              });
            return (
              <div
                key={m.key}
                className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-tile-2 px-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">
                    {money(m.amount)} {m.from_name} to {m.to_name}
                  </div>
                  <div className="text-[13px] text-ink-3">
                    {m.label}, {dayDate(m.date)}
                  </div>
                </div>
                <div role="group" aria-label={`Did ${m.label} happen?`} className="flex gap-1.5">
                  <AnswerButton pressed={a === "yes"} onClick={() => answer("yes")}>
                    It happened
                  </AnswerButton>
                  <AnswerButton pressed={a === "skip"} onClick={() => answer("skip")}>
                    Skipped
                  </AnswerButton>
                </div>
              </div>
            );
          })}
          <p className="m-0 text-[13px] text-ink-3">
            Leave one unanswered and it waits for the next check-in. Skipped moves change what's expected above.
          </p>
        </section>
      )}

      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div id="ci-exact" className="font-semibold">
            These are to the cent
          </div>
          <div className="text-[13px] text-ink-3">Adds a balance adjustment wherever the transactions don't add up</div>
        </div>
        <Switch checked={exact} onChange={setExact} labelledBy="ci-exact" />
      </div>

      {save.isError && <ErrorText>{errorMessage(save.error)}</ErrorText>}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
        <div className="text-[13px] text-ink-3">
          {effects && (
            <>
              <span className="num text-ink">{money(effects.offsetting_after)}</span> across the accounts
              {effects.coverage_after != null && ` · offsets ${pct(effects.coverage_after)} of the loan`}
            </>
          )}
        </div>
        <div className="flex gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button primary disabled={nothing || save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save check-in"}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Under each account: whether what's typed matches, and if not, what it would do or what probably explains it. */
function Note({ c, exact }: { c: Checked | undefined; exact: boolean }) {
  if (!c) return null;
  if (c.status === "ok") return <div className="text-[13px] text-good">Matches</div>;
  if (c.status === "spent" && c.spent != null)
    return (
      <div className="text-[13px] text-ink-3">
        {c.spent >= 0 ? `${money(c.spent)} spent since last time` : `${money(-c.spent)} more than last time`}
      </div>
    );
  if ((c.status === "short" || c.status === "over") && c.difference != null)
    return (
      <div className="text-[13px] text-warn">
        {c.difference > 0 ? "+" : "−"}
        {money(Math.abs(c.difference))} ·{" "}
        {exact ? "Adds an adjustment, dated today" : (c.explanation ?? "Not what was expected")}
      </div>
    );
  return null;
}

function AnswerButton({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "press min-h-11 cursor-pointer rounded-xl border px-3 text-[13px] font-semibold",
        pressed ? "border-teal/60 bg-teal/15 text-teal" : "border-line bg-transparent text-ink-2",
      )}
    >
      {children}
    </button>
  );
}
