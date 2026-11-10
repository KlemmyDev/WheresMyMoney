/**
 * Change the home loan (the uplift canvas's EdLoan), in the entity edit panel: a new monthly repayment, a lump sum
 * paid into it, a refinance, or its name and number. Each shows what it does before saving (when the loan's gone,
 * the interest still to pay, and the saving against now) and is kept in the loan's history, with Undo.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { simulate } from "~/features/accounts/LoanSchedule";
import { apiSend, errorMessage } from "~/features/common/api";
import { ChoiceChip, Stat } from "~/features/common/ds";
import { EditPanel } from "~/features/common/entity";
import { editable, money, monthYear, parseMoney } from "~/features/common/format";
import { useToast } from "~/features/common/overlay";
import { accountsQuery, refresh, type LoanView } from "~/features/common/queries";
import { Input, Label, Segmented, Select } from "~/features/common/ui";

type Tab = "repayment" | "lump" | "refinance" | "details";

const TABS: { value: Tab; label: string }[] = [
  { value: "repayment", label: "Repayment" },
  { value: "lump", label: "Lump sum" },
  { value: "refinance", label: "Refinance" },
  { value: "details", label: "Name and number" },
];

/** "2026-11" plus some months. */
function monthOn(months: number): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function LoanChangePanel({
  v,
  open,
  onClose,
  onRateChanged,
}: {
  v: LoanView;
  open: boolean;
  onClose: () => void;
  /** Open "The rate changed" instead (the same loan at a new rate). */
  onRateChanged: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const accounts = useQuery(accountsQuery);
  const lo = v.loan;
  const banks = accounts.data?.accounts ?? [];
  const [tab, setTab] = useState<Tab>("repayment");
  const [pay, setPay] = useState(editable(lo.repayment));
  const [lump, setLump] = useState("");
  // Where a lump sum came from: the offset unless another is picked (the accounts may load after the panel opens).
  const [fromPick, setFrom] = useState<string | null>(null);
  const from = fromPick ?? String(banks.find((a) => a.role === "offset")?.id ?? "");
  const [lender, setLender] = useState(lo.lender ?? "");
  const [rate, setRate] = useState(((lo.rate_bp ?? 0) / 100).toFixed(2));
  const [rateType, setRateType] = useState<"variable" | "fixed">((lo.rate_type as "variable" | "fixed") ?? "variable");
  const [costs, setCosts] = useState("");
  const [name, setName] = useState(lo.name);
  const [last4, setLast4] = useState(lo.last4 ?? "");

  const rateBp = lo.rate_bp ?? 0;
  const repayment = lo.repayment ?? 0;
  const growth = Math.max(v.monthly_growth, 0);
  const now = simulate(lo.balance, v.offsetting, rateBp, repayment, growth);

  // What the change would make of it.
  const payC = parseMoney(pay) ?? repayment;
  const lumpC = parseMoney(lump) ?? 0;
  const source = banks.find((a) => String(a.id) === from);
  const newRate = Math.round(Number(rate) * 100);
  const costsC = parseMoney(costs) ?? 0;
  const after =
    tab === "repayment"
      ? simulate(lo.balance, v.offsetting, rateBp, payC, growth)
      : tab === "lump"
        ? simulate(lo.balance - lumpC, v.offsetting - (source?.offsets_loan ? lumpC : 0), rateBp, repayment, growth)
        : tab === "refinance" && newRate > 0
          ? simulate(lo.balance, v.offsetting, newRate, repayment, growth)
          : now;
  const saved = now.interest - after.interest - (tab === "refinance" ? costsC : 0);

  const valid =
    tab === "repayment"
      ? payC > 0 && payC !== repayment
      : tab === "lump"
        ? lumpC > 0 && lumpC <= lo.balance
        : tab === "refinance"
          ? newRate > 0 && newRate <= 3000
          : !!name.trim() && (name.trim() !== lo.name || last4 !== (lo.last4 ?? ""));

  const save = useMutation({
    mutationFn: async () => {
      if (tab === "details")
        return {
          undo: null,
          label: "The loan's details saved",
          r: await apiSend("PUT", `accounts/${lo.id}`, { name, last4 }),
        };
      const body =
        tab === "repayment"
          ? { kind: "repayment", repayment: payC }
          : tab === "lump"
            ? { kind: "lump", amount: lumpC, from_account: from || null }
            : { kind: "refinance", lender, rate_bp: newRate, rate_type: rateType, costs: costsC };
      const r = await apiSend<{ undo: unknown }>("POST", "loan/change", body);
      const label =
        tab === "repayment"
          ? `Repayment now ${money(payC)} a month`
          : tab === "lump"
            ? `${money(lumpC)} paid into the loan`
            : `Refinanced at ${(newRate / 100).toFixed(2)}%`;
      return { undo: r.undo, label, r };
    },
    onSuccess: ({ undo, label }) => {
      refresh(qc);
      onClose();
      toast(
        label,
        undo
          ? () =>
              apiSend("POST", "loan/change/undo", { undo })
                .then(() => refresh(qc))
                .catch((e) => toast(errorMessage(e)))
          : undefined,
      );
    },
  });

  const gone = (months: number) => monthYear(monthOn(months));

  return (
    <EditPanel
      open={open}
      onClose={onClose}
      title="Change the loan"
      onSave={() => save.mutate()}
      saveLabel={tab === "lump" ? "Record the lump sum" : tab === "refinance" ? "Save the new loan" : "Save changes"}
      canSave={valid}
      saving={save.isPending}
      error={save.isError ? errorMessage(save.error) : undefined}
    >
      <Segmented label="What changed" options={TABS} value={tab} onChange={setTab} />

      {tab === "repayment" && (
        <div className="flex flex-col gap-2">
          <div className="max-w-xs">
            <Label htmlFor="ln-pay">Monthly repayment{lo.repay_from ? ", from Bills" : ""}</Label>
            <Input id="ln-pay" inputMode="decimal" value={pay} onChange={(e) => setPay(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            {[10000, 25000, 50000].map((x) => (
              <ChoiceChip key={x} pressed={payC === repayment + x} onClick={() => setPay(editable(repayment + x))}>
                +{money(x)} a month
              </ChoiceChip>
            ))}
          </div>
          <p className="m-0 text-[13px] text-ink-3">
            Change it in uBank too. It can&apos;t go below the bank&apos;s minimum. Putting the extra into the offset
            instead saves the same interest and keeps the money one transfer away; a higher repayment locks it in the
            loan.
          </p>
        </div>
      )}

      {tab === "lump" && (
        <div className="flex flex-col gap-2">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="ln-lump">Lump sum paid into the loan</Label>
              <Input
                id="ln-lump"
                inputMode="decimal"
                value={lump}
                onChange={(e) => setLump(e.target.value)}
                placeholder="20000.00"
              />
            </div>
            <div>
              <Label htmlFor="ln-from">Where it came from</Label>
              <Select id="ln-from" value={from} onChange={(e) => setFrom(e.target.value)}>
                {banks.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({money(a.balance)})
                  </option>
                ))}
                <option value="">Somewhere else (a bonus, an inheritance)</option>
              </Select>
            </div>
          </div>
          {source?.offsets_loan && (
            <p className="m-0 text-[13px] text-ink-2">
              <b className="text-ink">This saves nothing on interest.</b> {source.name} already offsets the loan, so
              moving it in changes one thing: getting it back means a redraw request instead of a transfer.
            </p>
          )}
        </div>
      )}

      {tab === "refinance" && (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="ln-lender">Lender</Label>
              <Input
                id="ln-lender"
                className="font-sans"
                value={lender}
                onChange={(e) => setLender(e.target.value)}
                placeholder="uBank"
              />
            </div>
            <div>
              <Label htmlFor="ln-rate">New rate, % a year</Label>
              <Input id="ln-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="ln-costs">Costs to switch</Label>
              <Input
                id="ln-costs"
                inputMode="decimal"
                value={costs}
                onChange={(e) => setCosts(e.target.value)}
                placeholder="350.00"
              />
            </div>
          </div>
          <Segmented
            label="Rate type"
            options={[
              { value: "variable", label: "Variable" },
              { value: "fixed", label: "Fixed" },
            ]}
            value={rateType}
            onChange={setRateType}
          />
          <p className="m-0 text-[13px] text-ink-3">
            The accounts only offset a loan at the same bank, so a new lender means moving them too.{" "}
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-teal"
              onClick={onRateChanged}
            >
              Same loan, new rate?
            </button>
          </p>
        </div>
      )}

      {tab === "details" && (
        <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
          <div>
            <Label htmlFor="ln-name">Name</Label>
            <Input id="ln-name" className="font-sans" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="ln-last4">Last four digits</Label>
            <Input
              id="ln-last4"
              inputMode="numeric"
              maxLength={4}
              value={last4}
              onChange={(e) => setLast4(e.target.value.replace(/\D/g, ""))}
            />
          </div>
        </div>
      )}

      {tab !== "details" && (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3" aria-live="polite">
          <Stat
            label="Loan gone"
            value={after.months >= 600 ? "Not in 50 years" : gone(after.months)}
            note={valid ? `now ${now.months >= 600 ? "never" : gone(now.months)}` : "as it is"}
            role="bad"
          />
          <Stat label="Interest still to pay" value={money(after.interest)} note="likely, at this pace" role="bad" />
          <Stat
            label="Saved against now"
            value={valid ? money(Math.max(saved, 0)) : "$0"}
            note={saved < 0 && valid ? `costs ${money(-saved)} more` : "in interest"}
            role="savings"
          />
        </div>
      )}
    </EditPanel>
  );
}
