/**
 * Change an account (the uplift canvas's EdAccount), in the entity edit panel: its name and number, its job and what
 * goes with the job (months of bills held, what spending starts each month with), whether it offsets the loan, the
 * alert when it drops below its aim, and its colour and icon. Changes apply from today.
 *
 * Removing: an account that still holds money says so, and asks where it was moved; recording that sets both
 * balances and removes it in one step. The rules that feed it stop. Undo puts all of it back.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { ChoiceChip } from "~/features/common/ds";
import { EditPanel } from "~/features/common/entity";
import { colour, editable, money, parseMoney } from "~/features/common/format";
import { Chip, I, type Glyph } from "~/features/common/icons";
import { useToast } from "~/features/common/overlay";
import { accountsQuery, refresh, rulesQuery } from "~/features/common/queries";
import type { Account, Role, Rule } from "~/features/common/types";
import { Input, Label, Select, Switch, cn } from "~/features/common/ui";

export const SWATCHES = ["offset", "bills", "spending", "savings", "track", "teal", "rose", "sky"];

/** The marks an account can wear (as the server allows them). */
export const ACCOUNT_ICONS: Record<string, Glyph> = {
  accounts: I.accounts,
  offset: I.offset,
  bills: I.bills,
  spending: I.spending,
  savings: I.savings,
  shield: I.shield,
  plane: I.plane,
  car: I.car,
  shop: I.shop,
  kids: I.kids,
  play: I.play,
  invest: I.invest,
  pay: I.pay,
  list: I.list,
};

const JOBS: { value: Role; label: string; note: string }[] = [
  { value: "offset", label: "Offset", note: "Pay lands here and spare money stays, against the loan." },
  { value: "bills", label: "Bills", note: "Bills come out of it; it holds a few months of them." },
  { value: "spending", label: "Spending", note: "Day-to-day spending, topped up each month." },
  { value: "savings", label: "Savings", note: "Holds your goals." },
  { value: "track", label: "Just track it", note: "Counted in the total, with no job of its own." },
];

const MONTHS = [2, 3, 4, 6];

export function EditAccountPanel({ account, open, onClose }: { account: Account; open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const accounts = useQuery(accountsQuery);
  const rules = useQuery(rulesQuery);
  const loan = account.kind === "loan";
  const [name, setName] = useState(account.name);
  const [last4, setLast4] = useState(account.last4 ?? "");
  const [role, setRole] = useState<Role>(account.role);
  const [months, setMonths] = useState(account.target_months ?? 3);
  const [allowance, setAllowance] = useState(editable(account.allowance));
  const [offsets, setOffsets] = useState(account.offsets_loan);
  const [alert, setAlert] = useState(account.alert_below);
  const [tone, setTone] = useState(account.colour);
  const [icon, setIcon] = useState<string | null>(account.icon ?? null);
  const [removing, setRemoving] = useState(false);
  const others = (accounts.data?.accounts ?? []).filter((a) => a.id !== account.id);
  const [movedTo, setMovedTo] = useState<number | "">(
    others.find((a) => a.role === "offset")?.id ?? others[0]?.id ?? "",
  );
  const feeding: Rule[] = (rules.data?.rules ?? []).filter((r) => r.enabled && r.to_account === account.id);
  const perMonth = account.target?.kind === "months" ? account.target.per_month : null;

  const body = loan
    ? { name: name.trim(), last4 }
    : {
        name: name.trim(),
        last4,
        role,
        target_months: role === "bills" ? months : null,
        allowance: role === "spending" ? parseMoney(allowance) : null,
        offsets_loan: offsets,
        alert_below: alert,
        colour: tone,
        icon,
      };
  const was = loan
    ? { name: account.name, last4: account.last4 ?? "" }
    : {
        name: account.name,
        last4: account.last4 ?? "",
        role: account.role,
        target_months: account.role === "bills" ? (account.target_months ?? 3) : null,
        allowance: account.role === "spending" ? account.allowance : null,
        offsets_loan: account.offsets_loan,
        alert_below: account.alert_below,
        colour: account.colour,
        icon: account.icon ?? null,
      };
  const changed = JSON.stringify(body) !== JSON.stringify(was);

  const save = useMutation({
    mutationFn: () => apiSend<Account>("PUT", `accounts/${account.id}`, body),
    onSuccess: () => {
      refresh(qc);
      onClose();
      toast(`${name.trim()} saved`);
    },
  });

  // Removing: move what it holds (both balances set as a check-in would), remove it, stop the rules that feed it.
  const target = others.find((a) => a.id === movedTo);
  const holds = !loan && account.balance !== 0;
  const remove = useMutation({
    mutationFn: async () => {
      if (holds && target) {
        await apiSend("PUT", `accounts/${account.id}/balance`, { balance: 0, exact: false });
        await apiSend("PUT", `accounts/${target.id}/balance`, {
          balance: target.balance + account.balance,
          exact: false,
        });
      }
      await apiSend("DELETE", `accounts/${account.id}`);
      for (const r of feeding) await apiSend("PUT", `rules/${r.id}`, { ...r, enabled: false });
    },
    onSuccess: () => {
      refresh(qc);
      navigate({ to: "/accounts", replace: true });
      const moved = holds && target ? ` and its ${money(account.balance)} recorded in ${target.name}` : "";
      // Undo outlives this panel (the page is gone), so it's a plain chain of calls.
      toast(`${account.name} removed${moved}`, () =>
        apiSend("POST", `accounts/${account.id}/restore`)
          .then(async () => {
            if (holds && target) {
              await apiSend("PUT", `accounts/${account.id}/balance`, { balance: account.balance, exact: false });
              await apiSend("PUT", `accounts/${target.id}/balance`, { balance: target.balance, exact: false });
            }
            for (const r of feeding) await apiSend("PUT", `rules/${r.id}`, { ...r, enabled: true });
          })
          .then(() => {
            refresh(qc);
            return navigate({ to: "/accounts/$accountId", params: { accountId: String(account.id) } });
          })
          .catch((e) => toast(errorMessage(e))),
      );
    },
  });

  return (
    <EditPanel
      open={open}
      onClose={onClose}
      title={removing ? `Remove ${account.name}` : `Change ${account.name}`}
      onSave={() => (removing ? remove.mutate() : save.mutate())}
      saveLabel={
        removing ? (holds ? `I've moved it, remove ${account.name}` : `Remove ${account.name}`) : "Save changes"
      }
      canSave={removing ? !holds || !!target : changed && !!name.trim()}
      saving={save.isPending || remove.isPending}
      remove={
        removing
          ? { label: "Not now", onClick: () => setRemoving(false) }
          : { label: loan ? "Remove the loan" : "Remove account", onClick: () => setRemoving(true) }
      }
      error={save.isError || remove.isError ? errorMessage(save.error ?? remove.error) : undefined}
    >
      {removing ? (
        <div className="flex flex-col gap-3 text-[14px] text-ink-2">
          {holds ? (
            <>
              <p className="m-0 text-ink">
                {account.name} still holds {money(account.balance)}. Move it to another account first.
              </p>
              <p className="m-0">
                A removed account must be at $0, so your total stays right and nothing goes missing. Make the transfer
                in uBank, then record it here and it&apos;s removed in the same step.
              </p>
              <div className="max-w-xs">
                <Label htmlFor="ea-moved">Moved it to</Label>
                <Select
                  id="ea-moved"
                  value={movedTo}
                  onChange={(e) => setMovedTo(e.target.value ? Number(e.target.value) : "")}
                >
                  {others.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({money(a.balance)})
                    </option>
                  ))}
                </Select>
              </div>
            </>
          ) : (
            <p className="m-0">
              It&apos;ll go from your accounts{loan ? ", and the dashboard won't show the loan" : " and totals"}.
            </p>
          )}
          <p className="m-0">
            {account.transactions > 0
              ? `Its ${account.transactions} transactions are kept in reports, check-ins and the merchant pages.`
              : "Nothing's been imported into it."}{" "}
            You can bring it back under Removed accounts.
          </p>
          {feeding.length > 0 && (
            <p className="m-0">
              When it&apos;s removed, the rules that feed it stop:{" "}
              {feeding.map((r) => `${r.label} (${money(r.amount)})`).join(", ")}.
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="m-0 text-[13px] text-ink-3">
            Changes apply from today. Past balances and transactions stay as they were.
          </p>
          <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
            <div>
              <Label htmlFor="ea-name">Name</Label>
              <Input
                id="ea-name"
                className="font-sans"
                autoComplete="off"
                maxLength={40}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <div className="mt-1 text-[12px] text-ink-3">
                What the app calls it. uBank&apos;s name stays in uBank.
              </div>
            </div>
            <div>
              <Label htmlFor="ea-last4">Last four digits</Label>
              <Input
                id="ea-last4"
                inputMode="numeric"
                maxLength={4}
                value={last4}
                onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))}
                placeholder="2210"
              />
              <div className="mt-1 text-[12px] text-ink-3">Statements with this number import here.</div>
            </div>
          </div>
          {!loan && (
            <>
              <div className="flex flex-col gap-2">
                <Label>Its job</Label>
                <div role="radiogroup" aria-label="Its job" className="flex flex-wrap gap-2">
                  {JOBS.map((j) => (
                    <ChoiceChip key={j.value} pressed={role === j.value} onClick={() => setRole(j.value)}>
                      {j.label}
                    </ChoiceChip>
                  ))}
                </div>
                <div className="text-[13px] text-ink-3">{JOBS.find((j) => j.value === role)?.note}</div>
              </div>
              {role === "bills" && (
                <div className="flex flex-col gap-2">
                  <Label>Hold this many months of bills</Label>
                  <div className="flex flex-wrap gap-2">
                    {MONTHS.map((m) => (
                      <ChoiceChip key={m} pressed={months === m} onClick={() => setMonths(m)}>
                        {m} months{perMonth ? ` · ${money(perMonth * m)}` : ""}
                      </ChoiceChip>
                    ))}
                  </div>
                  {perMonth != null && (
                    <div className="text-[13px] text-ink-3">Bills come to about {money(perMonth)} a month.</div>
                  )}
                </div>
              )}
              {role === "spending" && (
                <div className="max-w-xs">
                  <Label htmlFor="ea-allow">Each month it starts with</Label>
                  <Input
                    id="ea-allow"
                    inputMode="decimal"
                    value={allowance}
                    onChange={(e) => setAllowance(e.target.value)}
                    placeholder="3200.00"
                  />
                  <div className="mt-1 text-[12px] text-ink-3">The monthly top-up rule changes with it in Rules.</div>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Toggle
                  label="Offsets the home loan"
                  note="uBank counts it against the loan"
                  checked={offsets}
                  onChange={setOffsets}
                />
                <Toggle
                  label="Tell me when it drops below its aim"
                  note="A web push, once a month while it stays under"
                  checked={alert}
                  onChange={setAlert}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Colour</Label>
                  <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Colour">
                    {SWATCHES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={tone === c}
                        aria-label={c}
                        onClick={() => setTone(c)}
                        className={cn(
                          "press size-8 cursor-pointer rounded-full border-2",
                          tone === c ? "border-ink" : "border-transparent",
                        )}
                        style={{ background: colour(c) }}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Icon</Label>
                  <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Icon">
                    {Object.entries(ACCOUNT_ICONS).map(([k, g]) => (
                      <button
                        key={k}
                        type="button"
                        role="radio"
                        aria-checked={icon === k}
                        aria-label={k}
                        onClick={() => setIcon(icon === k ? null : k)}
                        className={cn(
                          "press cursor-pointer rounded-xl border-2 bg-transparent p-0.5",
                          icon === k ? "border-ink" : "border-transparent",
                        )}
                      >
                        <Chip g={g} tone="neutral" size="sm" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </EditPanel>
  );
}

function Toggle({
  label,
  note,
  checked,
  onChange,
}: {
  label: string;
  note: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border border-line px-3 py-2.5">
      <span>
        <span className="block text-[14px] text-ink">{label}</span>
        <span className="block text-[12px] text-ink-3">{note}</span>
      </span>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}
