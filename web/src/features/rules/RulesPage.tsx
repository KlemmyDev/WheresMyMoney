/**
 * Rules (design: CkRules): the household's plan for moving money, set up once as scheduled transfers in their banking
 * app. The next payday step by step with each account before and after; the monthly top-up and sweep; and every rule
 * with how it went at the last check-in or import. The app never moves money itself.
 */
import { Loading } from "~/features/common/brand";
import { Banner, Card, EmptyState, Details } from "~/features/common/ds";
import { Chip as IconChip, I, type Glyph, type Tone } from "~/features/common/icons";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { EVERY_LABEL, amount, dayDate, editable, money, parseMoney, shortDate } from "~/features/common/format";
import { Dialog, useToast } from "~/features/common/overlay";
import { accountsQuery, refresh, rulesQuery } from "~/features/common/queries";
import type { Account, Every, Rule } from "~/features/common/types";
import {
  Button,
  Choice,
  Dot,
  ErrorText,
  Input,
  Label,
  PageHead,
  Pill,
  Select,
  Switch,
  Tile,
  TileTitle,
  cn,
} from "~/features/common/ui";

const STATUS: Record<string, [string, "good" | "warn" | "mute" | "bad"]> = {
  ok: ["Added up", "good"],
  missing: ["Didn't show up", "warn"],
  differed: ["Amount differed", "warn"],
  nothing: ["Nothing over", "mute"],
  skipped: ["Skipped", "mute"],
};

const KIND: Record<Rule["kind"], { g: Glyph; tone: Tone }> = {
  pay: { g: I.pay, tone: "savings" },
  transfer: { g: I.transfer, tone: "offset" },
  top_up: { g: I.spending, tone: "spending" },
  sweep: { g: I.bills, tone: "bills" },
};

export function ruleWhat(r: Rule, names: Record<number, string>): string {
  const from = names[r.from_account ?? 0] ?? "?";
  const to = names[r.to_account ?? 0] ?? "?";
  if (r.kind === "pay") return `Pay lands in ${to}`;
  if (r.kind === "top_up") return `Top ${to} back up to ${money(r.amount)} from ${from}`;
  if (r.kind === "sweep") return `Anything over ${r.amount / 100} months of bills in ${from} goes back to ${to}`;
  return `${from} to ${to}`;
}

/** The household's rules as a few plain sentences. */
function plan(rules: Rule[], names: Record<number, string>, surplus: number): string {
  const on = rules.filter((r) => r.enabled);
  const pay = on.find((r) => r.kind === "pay");
  const moves = on.filter((r) => r.kind === "transfer");
  const top = on.find((r) => r.kind === "top_up");
  const sweep = on.find((r) => r.kind === "sweep");
  const out: string[] = [];
  if (pay)
    out.push(
      `Pay lands in ${names[pay.to_account ?? 0] ?? "an account"} every ${EVERY_LABEL[pay.every].toLowerCase()}.`,
    );
  if (moves.length) {
    const list = moves.map((r) => `${money(r.amount)} goes to ${names[r.to_account ?? 0] ?? "another account"}`);
    out.push(
      `${pay ? "Then " : "Each time, "}${list.length > 1 ? `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}` : list[0]}.`,
    );
  }
  if (top)
    out.push(
      `${names[top.to_account ?? 0] ?? "Spending"} is topped back up to ${money(top.amount)} each month, on ${shortDate(top.next_run)} next.`,
    );
  if (sweep)
    out.push(
      `Anything over ${sweep.amount / 100} months of bills goes back to ${names[sweep.to_account ?? 0] ?? "the offset"}.`,
    );
  if (surplus)
    out.push(
      surplus > 0
        ? `In a usual month that leaves about ${money(surplus)} more in the offset.`
        : `In a usual month more goes out than comes in, by about ${money(-surplus)}.`,
    );
  return out.join(" ") || "No rules yet. Add the transfers you've set up in uBank, starting with pay.";
}

export function RulesPage() {
  const q = useQuery(rulesQuery);
  const accounts = useQuery(accountsQuery);
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Rule | "new" | null>(null);
  const toggle = useMutation({
    mutationFn: (r: Rule) => apiSend("PUT", `rules/${r.id}`, { enabled: !r.enabled }),
    onSuccess: () => refresh(qc),
  });
  if (q.isError) return <ErrorText>{errorMessage(q.error)}</ErrorText>;
  if (!q.data || !accounts.data) return <Loading />;
  const banks = accounts.data.accounts;
  const names = Object.fromEntries(banks.map((a) => [a.id, a.name]));
  const colours = Object.fromEntries(banks.map((a) => [a.id, a.colour]));
  const { rules, payday, month } = q.data;
  const monthly = rules.filter((r) => r.enabled && (r.kind === "top_up" || r.kind === "sweep"));
  const differed = rules.find((r) => r.last_status === "differed");
  const problem = rules.find((r) => r.enabled && (r.last_status === "missing" || r.last_status === "differed"));
  return (
    <>
      <PageHead
        over={`Setup · ${rules.length} rules`}
        title="Rules"
        actions={
          <Button primary onClick={() => setEditing("new")}>
            New rule
          </Button>
        }
      />
      {problem ? (
        <Banner
          g={I.rules}
          tone="bills"
          title={`${problem.label || ruleWhat(problem, names)} ${problem.last_status === "missing" ? "didn't show up" : "moved a different amount"}`}
          action={
            <Button primary onClick={() => setEditing(problem)}>
              Look at the rule
            </Button>
          }
        >
          At the last check-in{problem.last_run ? `, for ${shortDate(problem.last_run)}` : ""}. If it was skipped once,
          nothing to do; if the bank transfer changed, change the rule to match.
        </Banner>
      ) : (
        <Card lit tint="accent" aria-labelledby="r-plan">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="r-plan" className="m-0 text-[19px] font-semibold">
              What happens with our money
            </h2>
            {rules.some((r) => r.last_status) && <Pill tone="good">All added up at the last check-in</Pill>}
          </div>
          <p className="m-0 text-[16px] leading-relaxed text-ink-2">{plan(rules, names, month.surplus)}</p>
          <p className="m-0 text-[13px] text-ink-3">
            These are set up as scheduled transfers in uBank. The app never moves money itself: at each check-in it
            checks they happened, and says if one didn't.
          </p>
        </Card>
      )}
      <Details label="See the next payday and a usual month">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,520px),1fr))] gap-4">
          {payday && (
            <Tile i={1} aria-labelledby="r-pay">
              <TileTitle id="r-pay" right={<Pill tone="good">{dayDate(payday.date)}</Pill>}>
                Next payday
              </TileTitle>
              {payday.events.map((e, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[34px_1fr_auto] items-center gap-3 rounded-lg bg-raised px-3 py-2.5 text-[13px]"
                >
                  <span className="mono text-center text-xs text-ink-3">{e.kind === "pay" ? "IN" : i}</span>
                  <span>
                    {e.kind === "pay" ? (
                      <>
                        Pay lands in <Chip id={e.to ?? 0} names={names} colours={colours} />
                      </>
                    ) : (
                      <>
                        <Chip id={e.from ?? 0} names={names} colours={colours} /> →{" "}
                        <Chip id={e.to ?? 0} names={names} colours={colours} />
                      </>
                    )}
                  </span>
                  <span className="mono">
                    {e.kind === "pay" ? "+" : ""}
                    {money(e.amount)}
                  </span>
                </div>
              ))}
              <div className="overflow-x-auto">
                <table className="mono w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="text-left text-xs text-ink-3">
                      <th className="border-b border-line py-2">Account</th>
                      <th className="border-b border-line py-2 text-right">Now</th>
                      <th className="border-b border-line py-2 text-right">After payday</th>
                      <th className="border-b border-line py-2 text-right">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {banks.map((a) => {
                      const after = payday.after[String(a.id)] ?? a.balance;
                      const change = after - a.balance;
                      return (
                        <tr key={a.id}>
                          <td className="border-b border-line py-2">
                            <span className="flex items-center gap-2 font-sans">
                              <Dot c={a.colour} />
                              {a.name}
                            </span>
                          </td>
                          <td className="border-b border-line py-2 text-right">{money(a.balance)}</td>
                          <td className="border-b border-line py-2 text-right">{money(after)}</td>
                          <td
                            className="border-b border-line py-2 text-right"
                            style={{
                              color:
                                change > 0
                                  ? "var(--color-good)"
                                  : change < 0
                                    ? "var(--color-warn)"
                                    : "var(--color-ink-3)",
                            }}
                          >
                            {change ? amount(change, { sign: true }) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Tile>
          )}
          <Tile i={2} aria-labelledby="r-month">
            <TileTitle id="r-month" right={<Pill tone="info">A usual month</Pill>}>
              What a month looks like
            </TileTitle>
            {[
              ["Pay in", month.pay, true],
              ["Moved to other accounts", -month.transfers, false],
              ["Topping up spending (about)", -month.spending, false],
              ["Bills", -month.bills, false],
              ["Loan repayment", -month.repayment, false],
            ].map(([label, v, plus]) => (
              <div
                key={String(label)}
                className="flex justify-between border-t border-line py-2 text-[13px] first:border-t-0"
              >
                <span>{label}</span>
                <span className="mono" style={{ color: plus ? "var(--color-good)" : undefined }}>
                  {amount(v as number, { sign: true })}
                </span>
              </div>
            ))}
            <div className="flex justify-between border-t border-line py-2 font-semibold">
              <span>Left in the offset</span>
              <span className="mono text-teal">{money(month.surplus, { sign: true })}</span>
            </div>
            {monthly.map((r) => (
              <div key={r.id} className="text-xs text-ink-3">
                {ruleWhat(r, names)}, next {shortDate(r.next_run)}.{" "}
                {r.kind === "top_up"
                  ? "Only the difference moves, so whatever wasn't spent stays in the offset."
                  : "That keeps the offset as big as it can be."}
              </div>
            ))}
          </Tile>
        </div>
      </Details>
      <Tile i={3} aria-labelledby="r-all">
        <TileTitle
          id="r-all"
          right={
            <span className="text-[12px] tracking-normal text-ink-3 normal-case">
              Checked at each check-in · tap one to edit
            </span>
          }
        >
          All rules
        </TileTitle>
        <div className="flex flex-col gap-2.5">
          {rules.map((r) => {
            const st = STATUS[r.last_status ?? ""];
            const k = KIND[r.kind];
            return (
              <div key={r.id} className={cn("flex items-center gap-3", !r.enabled && "opacity-55")}>
                <button
                  type="button"
                  onClick={() => setEditing(r)}
                  className="chip-host press flex min-h-[72px] min-w-0 flex-1 cursor-pointer items-center gap-3.5 rounded-[20px] border border-line bg-tile-2 px-3.5 py-3 text-left text-ink hover:border-line-2 sm:px-4"
                >
                  <span className="hidden sm:inline-flex">
                    <IconChip g={k.g} tone={k.tone} size="lg" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 block font-semibold">{r.label || ruleWhat(r, names)}</span>
                    <span className="line-clamp-2 block text-[13px] text-ink-3">
                      {r.label ? `${ruleWhat(r, names)} · ` : ""}every {EVERY_LABEL[r.every].toLowerCase()} · next{" "}
                      {shortDate(r.next_run)}
                    </span>
                  </span>
                  <span className="flex flex-none flex-col items-end gap-1">
                    <span className="num">
                      {r.kind === "sweep"
                        ? `${r.amount / 100} months`
                        : r.kind === "top_up"
                          ? `to ${money(r.amount)}`
                          : money(r.amount)}
                    </span>
                    {st ? <Pill tone={st[1]}>{st[0]}</Pill> : <Pill>Not checked</Pill>}
                  </span>
                </button>
                <Switch
                  label={`${r.label || ruleWhat(r, names)} on`}
                  checked={r.enabled}
                  onChange={() => toggle.mutate(r)}
                />
              </div>
            );
          })}
          {!rules.length && (
            <EmptyState
              g={I.rules}
              tone="neutral"
              title="No rules yet"
              action={
                <Button primary onClick={() => setEditing("new")}>
                  New rule
                </Button>
              }
            >
              Add your pay and the transfers you've set up in your banking app.
            </EmptyState>
          )}
        </div>
        {differed && (
          <div className="text-xs text-ink-3">
            The last {ruleWhat(differed, names).toLowerCase()} moved a different amount from what the rule called for.
            You probably have a fixed transfer set in your bank; the top-up only works if it's for the difference.
          </div>
        )}
      </Tile>
      <RuleDialog rule={editing} accounts={banks} onClose={() => setEditing(null)} />
    </>
  );
}

function Chip({ id, names, colours }: { id: number; names: Record<number, string>; colours: Record<number, string> }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md bg-tile px-2 py-0.5">
      <Dot c={colours[id]} />
      {names[id] ?? "?"}
    </span>
  );
}

const KINDS = [
  { value: "pay", label: "Pay comes in" },
  { value: "transfer", label: "A transfer" },
  { value: "top_up", label: "Top back up to an amount" },
  { value: "sweep", label: "Move back what's over" },
] as const;

export function RuleDialog({
  rule,
  accounts,
  onClose,
}: {
  rule: Rule | "new" | null;
  accounts: Account[];
  onClose: () => void;
}) {
  return (
    <Dialog open={rule != null} onClose={onClose} labelledBy="rule-h">
      {rule != null && <RuleForm rule={rule} accounts={accounts} onClose={onClose} />}
    </Dialog>
  );
}

function RuleForm({ rule, accounts, onClose }: { rule: Rule | "new"; accounts: Account[]; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [f, setF] = useState(() =>
    rule === "new"
      ? {
          kind: "transfer" as Rule["kind"],
          from_account: "",
          to_account: "",
          amount: "",
          every: "fortnightly" as Every,
          anchor: "",
          label: "",
        }
      : {
          kind: rule.kind,
          from_account: String(rule.from_account ?? ""),
          to_account: String(rule.to_account ?? ""),
          amount: rule.kind === "sweep" ? String(rule.amount / 100) : editable(rule.amount),
          every: rule.every,
          anchor: rule.next_run,
          label: rule.label,
        },
  );
  const amountCents = f.kind === "sweep" ? Math.round(Number(f.amount) * 100) : parseMoney(f.amount);
  const body = () => ({
    ...f,
    amount: amountCents,
    from_account: f.from_account || null,
    to_account: f.to_account || null,
  });
  const save = useMutation({
    mutationFn: () =>
      rule === "new" ? apiSend("POST", "rules", body()) : apiSend("PUT", `rules/${(rule as Rule).id}`, body()),
    onSuccess: () => (refresh(qc), onClose(), toast("Rule saved")),
  });
  const remove = useMutation({
    mutationFn: () => apiSend("DELETE", `rules/${(rule as Rule).id}`),
    onSuccess: () => (refresh(qc), onClose()),
  });
  return (
    <div className="flex flex-col gap-3 overflow-y-auto p-6">
      <h2 id="rule-h" className="m-0 text-xl font-semibold">
        {rule === "new" ? "New rule" : "Edit rule"}
      </h2>
      <Choice
        label="What it does"
        value={f.kind}
        onChange={(kind) => setF({ ...f, kind, every: kind === "top_up" || kind === "sweep" ? "monthly" : f.every })}
        options={[...KINDS]}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {f.kind !== "pay" && (
          <div>
            <Label htmlFor="r-from">From</Label>
            <Select id="r-from" value={f.from_account} onChange={(e) => setF({ ...f, from_account: e.target.value })}>
              <option value="">—</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
        )}
        <div>
          <Label htmlFor="r-to">{f.kind === "pay" ? "Lands in" : "To"}</Label>
          <Select id="r-to" value={f.to_account} onChange={(e) => setF({ ...f, to_account: e.target.value })}>
            <option value="">—</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="r-amt">
            {f.kind === "top_up" ? "Top back up to" : f.kind === "sweep" ? "Keep this many months of bills" : "Amount"}
          </Label>
          <Input
            id="r-amt"
            inputMode="decimal"
            value={f.amount}
            onChange={(e) => setF({ ...f, amount: e.target.value })}
            placeholder={f.kind === "sweep" ? "3.5" : "1,200.00"}
          />
        </div>
        <div>
          <Label htmlFor="r-every">Every</Label>
          <Select id="r-every" value={f.every} onChange={(e) => setF({ ...f, every: e.target.value as Every })}>
            {(["weekly", "fortnightly", "monthly", "quarterly"] as Every[]).map((e) => (
              <option key={e} value={e}>
                {EVERY_LABEL[e]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="r-next">Next on</Label>
          <Input id="r-next" type="date" value={f.anchor} onChange={(e) => setF({ ...f, anchor: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="r-label">Name (optional)</Label>
          <Input
            id="r-label"
            className="font-sans"
            value={f.label}
            onChange={(e) => setF({ ...f, label: e.target.value })}
            placeholder="Payday to Bills"
          />
        </div>
      </div>
      {(save.isError || remove.isError) && <ErrorText>{errorMessage(save.error ?? remove.error)}</ErrorText>}
      <div className="flex justify-between gap-2">
        {rule !== "new" ? <Button onClick={() => remove.mutate()}>Remove</Button> : <span />}
        <div className="flex gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button primary disabled={!amountCents || !f.anchor || save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
