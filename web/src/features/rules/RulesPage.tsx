/**
 * Rules (design: CkRules): the household's plan for moving money, set up once as scheduled transfers in their banking
 * app. The next payday step by step with each account before and after; the monthly top-up and sweep; and every rule
 * with how it went at the last check-in or import. The app never moves money itself.
 */
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
} from "~/features/common/ui";

const STATUS: Record<string, [string, "good" | "warn" | "mute" | "bad"]> = {
  ok: ["✓ ADDED UP", "good"],
  missing: ["⚑ DIDN'T SHOW UP", "warn"],
  differed: ["AMOUNT DIFFERED", "warn"],
  nothing: ["NOTHING TO SWEEP", "mute"],
  skipped: ["SKIPPED", "mute"],
};

export function ruleWhat(r: Rule, names: Record<number, string>): string {
  const from = names[r.from_account ?? 0] ?? "?";
  const to = names[r.to_account ?? 0] ?? "?";
  if (r.kind === "pay") return `Pay lands in ${to}`;
  if (r.kind === "top_up") return `Top ${to} up to ${money(r.amount)} from ${from}`;
  if (r.kind === "sweep") return `Sweep ${from} over ${r.amount / 100} months to ${to}`;
  return `${from} → ${to}`;
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
  if (!q.data || !accounts.data) return <div className="h-[60vh]" aria-busy />;
  const banks = accounts.data.accounts;
  const names = Object.fromEntries(banks.map((a) => [a.id, a.name]));
  const colours = Object.fromEntries(banks.map((a) => [a.id, a.colour]));
  const { rules, payday, month } = q.data;
  const transfers = rules.filter((r) => r.kind !== "pay").length;
  const monthly = rules.filter((r) => r.enabled && (r.kind === "top_up" || r.kind === "sweep"));
  const differed = rules.find((r) => r.last_status === "differed");
  return (
    <>
      <PageHead
        over={`${rules.length} RULES · ${transfers} TRANSFERS`}
        title="Rules"
        actions={
          <Button primary onClick={() => setEditing("new")}>
            New rule
          </Button>
        }
      />
      <Tile i={0} aria-label="How rules work" className="flex-row items-center">
        <span className="text-ink-2">
          Rules are your plan. Set each transfer up once as a scheduled transfer in your banking app. At every balance
          check-in, WheresMyMoney compares what you typed with what the rules expected and flags anything that doesn't
          add up.
        </span>
      </Tile>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,520px),1fr))] gap-4">
        {payday && (
          <Tile i={1} aria-labelledby="r-pay">
            <TileTitle id="r-pay" right={<Pill tone="good">{dayDate(payday.date).toUpperCase()}</Pill>}>
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
          <TileTitle id="r-month" right={<Pill tone="info">A USUAL MONTH</Pill>}>
            What a month looks like
          </TileTitle>
          {[
            ["Pay in", month.pay, true],
            ["To other accounts", -month.transfers, false],
            ["Spending top-up (about)", -month.spending, false],
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
            <span>Stays offsetting the loan</span>
            <span className="mono text-teal">{money(month.surplus, { sign: true })}</span>
          </div>
          {monthly.map((r) => (
            <div key={r.id} className="text-xs text-ink-3">
              {ruleWhat(r, names)}, next {shortDate(r.next_run)}.{" "}
              {r.kind === "top_up"
                ? "Only the difference moves, so whatever wasn't spent stays offsetting."
                : "What's over the buffer goes back to the offset."}
            </div>
          ))}
        </Tile>
      </div>
      <Tile i={3} aria-labelledby="r-all">
        <TileTitle id="r-all" right={<span className="mono text-ink-3">CHECKED AT EACH BALANCE CHECK-IN</span>}>
          All rules
        </TileTitle>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-xs text-ink-3">
                <th className="border-b border-line px-2.5 py-2 font-semibold">When</th>
                <th className="border-b border-line px-2.5 py-2 font-semibold">Do this</th>
                <th className="border-b border-line px-2.5 py-2 text-right font-semibold">Amount</th>
                <th className="border-b border-line px-2.5 py-2 font-semibold">Last run</th>
                <th className="border-b border-line px-2.5 py-2 font-semibold">At last check</th>
                <th className="border-b border-line px-2.5 py-2 font-semibold">On</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => {
                const st = STATUS[r.last_status ?? ""];
                return (
                  <tr key={r.id} className="hover:bg-raised/40">
                    <td className="border-b border-line px-2.5 py-2.5">
                      Every {EVERY_LABEL[r.every].toLowerCase()}{" "}
                      <span className="mono text-ink-3">· from {shortDate(r.anchor)}</span>
                    </td>
                    <td className="border-b border-line px-2.5 py-2.5">
                      <button
                        type="button"
                        className="cursor-pointer border-0 bg-transparent p-0 text-left text-ink hover:text-teal"
                        onClick={() => setEditing(r)}
                      >
                        {r.label ? <b className="font-medium">{r.label}</b> : null}
                        {r.label ? <span className="text-ink-3"> · </span> : null}
                        {ruleWhat(r, names)}
                      </button>
                    </td>
                    <td className="mono border-b border-line px-2.5 py-2.5 text-right">
                      {r.kind === "sweep" || r.kind === "top_up" ? "varies" : money(r.amount)}
                    </td>
                    <td className="mono border-b border-line px-2.5 py-2.5 text-ink-2">
                      {r.last_run ? shortDate(r.last_run) : "Never"}
                    </td>
                    <td className="border-b border-line px-2.5 py-2.5">
                      {st ? <Pill tone={st[1]}>{st[0]}</Pill> : <Pill>NOT CHECKED YET</Pill>}
                    </td>
                    <td className="border-b border-line px-2.5 py-2.5">
                      <Switch
                        label={`${r.label || ruleWhat(r, names)} on`}
                        checked={r.enabled}
                        onChange={() => toggle.mutate(r)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!rules.length && (
            <div className="py-4 text-ink-3">
              No rules yet. Add your pay and the transfers you've set up in your banking app.
            </div>
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
  { value: "top_up", label: "Top up to an amount" },
  { value: "sweep", label: "Sweep what's over" },
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
            {f.kind === "top_up" ? "Top up to" : f.kind === "sweep" ? "Keep this many months of bills" : "Amount"}
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
