/**
 * "The rate changed" (the canvas flow): the new rate, when it started and what the repayment does, then what that
 * changes (interest, repayment, when the loan's gone, how long Bills lasts) and an offer to raise the payday transfer
 * into Bills to match. Saving updates the loan and records the change in its history. Money is in cents; rates in
 * basis points (637 is 6.37%).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { simulate } from "~/features/accounts/LoanSimulator";
import { apiSend, errorMessage } from "~/features/common/api";
import { ChoiceChip, IconButton, Sheet, Stat, useSheetTop } from "~/features/common/ds";
import { longDate, money, monthYear } from "~/features/common/format";
import { Chip, I } from "~/features/common/icons";
import { accountsQuery, refresh, rulesQuery, type LoanView } from "~/features/common/queries";
import type { Every } from "~/features/common/types";
import { Button, ErrorText, Pill, Switch } from "~/features/common/ui";

const PER_YEAR: Record<Every, number> = {
  weekly: 52,
  fortnightly: 26,
  monthly: 12,
  quarterly: 4,
  term: 4,
  "half-yearly": 2,
  yearly: 1,
};

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const pctText = (bp: number) => `${(bp / 100).toFixed(2)}%`;

/** The repayment a bank asks for at a new rate, keeping the loan's end date where the current repayment puts it. */
export function bankRepayment(balance: number, oldBp: number, repayment: number, newBp: number): number {
  const r0 = oldBp / 10000 / 12;
  const r1 = newBp / 10000 / 12;
  const n0 = r0 > 0 ? Math.log(1 - (balance * r0) / repayment) / -Math.log(1 + r0) : balance / repayment;
  const n = Number.isFinite(n0) && n0 > 0 ? n0 : 360;
  return Math.round(r1 > 0 ? (balance * r1) / (1 - Math.pow(1 + r1, -n)) : balance / n);
}

export type Spotted = { date: string; value: number; was: number | null } | null;

export function RateChangeSheet({
  open,
  onClose,
  v,
  spotted,
}: {
  open: boolean;
  onClose: () => void;
  v: LoanView;
  spotted: Spotted;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="The rate changed">
      {open && <RateChange v={v} spotted={spotted} onClose={onClose} />}
    </Sheet>
  );
}

function RateChange({ v, spotted, onClose }: { v: LoanView; spotted: Spotted; onClose: () => void }) {
  const qc = useQueryClient();
  const accounts = useQuery(accountsQuery);
  const rules = useQuery(rulesQuery);
  const lo = v.loan;
  const nowBp = lo.rate_bp ?? 0;
  const oldPay = lo.repayment ?? 0;
  // A rate spotted in a statement is already on the loan: compare it with the one before.
  const oldBp = spotted?.was ?? nowBp;
  const [rate, setRate] = useState(spotted ? spotted.value : nowBp + 25);
  const today = new Date();
  const nextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const sinces: [string, string][] = [
    ...(spotted ? ([[spotted.date, `From ${longDate(spotted.date)}`]] as [string, string][]) : []),
    [iso(today), "From today"],
    [iso(nextMonth), "From next repayment"],
  ];
  const [since, setSince] = useState(sinces[0][0]);
  const [payMode, setPayMode] = useState<"bank" | "keep">("bank");
  const [raise, setRaise] = useState(true);
  const [done, setDone] = useState<string | null>(null);
  const top = useSheetTop(!!done);

  const owed = lo.balance;
  const charged = Math.max(owed - v.offsetting, 0);
  const minPay = bankRepayment(owed, oldBp, oldPay, rate);
  const canKeep = oldPay >= minPay;
  const pay = payMode === "keep" && canKeep ? oldPay : minPay;
  const payDiff = pay - oldPay;
  const intDiff = (charged * (rate - oldBp)) / 10000 / 12;
  const grow = Math.max(0, v.monthly_growth);
  const mOld = simulate(owed, v.offsetting, oldBp, oldPay, grow).months;
  const mNew = simulate(owed, v.offsetting, rate, pay, grow).months;
  const goneDate = (() => {
    const d = new Date(today.getFullYear(), today.getMonth() + mNew, 1);
    return iso(d);
  })();
  const months = (n: number) => `${n} ${n === 1 ? "month" : "months"}`;
  const goneDiff =
    mNew === mOld ? "no change" : mNew > mOld ? `${months(mNew - mOld)} later` : `${months(mOld - mNew)} sooner`;

  // Bills: the account the loan is paid from, and the payday transfer that fills it.
  const bills = accounts.data?.accounts.find((a) => a.id === lo.repay_from);
  const held = bills?.target?.kind === "months" ? bills.target : null;
  const monthsHeld = held && held.per_month + payDiff > 0 ? bills!.balance / (held.per_month + payDiff) : null;
  const intoBills = (rules.data?.rules ?? [])
    .filter((r) => r.enabled && r.kind === "transfer" && r.to_account === lo.repay_from)
    .sort((a, b) => b.amount - a.amount)[0];
  const bump = intoBills ? Math.round((payDiff * 12) / PER_YEAR[intoBills.every] / 100) * 100 : 0;

  const save = useMutation({
    mutationFn: async () => {
      await apiSend("POST", "loan/rate", { rate_bp: rate, repayment: pay !== oldPay ? pay : null, since });
      if (raise && intoBills && bump > 0)
        await apiSend("PUT", `rules/${intoBills.id}`, { ...intoBills, amount: intoBills.amount + bump });
    },
    onSuccess: () => {
      setDone(
        `The loan is at ${pctText(rate)} with ${money(pay)} repayments` +
          (raise && intoBills && bump > 0
            ? `, and ${intoBills.label || "the payday transfer"} is now ${money(intoBills.amount + bump)}. Change that scheduled transfer in uBank too.`
            : ".") +
          " Forecasts and the loan plan have updated.",
      );
      refresh(qc);
    },
  });

  if (done)
    return (
      <div ref={top} className="flex flex-col items-center gap-3 pt-2 pb-2 text-center">
        <Chip g={I.loan} tone="loan" size="xxl" solid />
        <h3 className="m-0 text-[22px] font-semibold">Updated to {pctText(rate)}</h3>
        <p className="m-0 max-w-[420px] text-[14px] text-ink-2">{done}</p>
        <div className="mt-2 flex gap-2">
          <Link
            to="/rules"
            onClick={onClose}
            className="inline-flex min-h-[42px] items-center rounded-xl px-4 text-ink no-underline shadow-[inset_0_0_0_1px_var(--color-line-2)]"
          >
            Rules
          </Link>
          <Button primary onClick={onClose}>
            Back to the loan
          </Button>
        </div>
      </div>
    );

  const up = rate > oldBp;
  return (
    <div ref={top} className="flex flex-col gap-5 pb-2">
      {spotted && (
        <p className="m-0 rounded-2xl bg-sunken p-3.5 text-[14px] text-ink-2">
          <b className="text-ink">Spotted in your statement.</b> Interest was charged at {pctText(spotted.value)} from{" "}
          {longDate(spotted.date)}
          {spotted.was != null ? `, ${spotted.value > spotted.was ? "up" : "down"} from ${pctText(spotted.was)}` : ""}.
          Check the details, then the app updates everything that depends on it.
        </p>
      )}

      <div className="flex items-center justify-between gap-3 rounded-[22px] border border-line bg-tile-2 p-4">
        <IconButton label="Lower the rate by 0.05" onClick={() => setRate((r) => Math.max(100, r - 5))}>
          <span aria-hidden className="text-[22px]">
            −
          </span>
        </IconButton>
        <div className="text-center">
          <div className="eyebrow">New rate</div>
          <div className="num text-[40px] leading-[46px]" aria-live="polite">
            {pctText(rate)}
          </div>
          <div className="mt-1 flex items-center justify-center gap-2 text-[13px] text-ink-3">
            <Pill tone={rate === oldBp ? "mute" : up ? "warn" : "good"}>
              {rate >= oldBp ? "+" : "−"}
              {(Math.abs(rate - oldBp) / 100).toFixed(2)} points
            </Pill>
            was {pctText(oldBp)}
          </div>
        </div>
        <IconButton label="Raise the rate by 0.05" onClick={() => setRate((r) => Math.min(3000, r + 5))}>
          <span aria-hidden className="text-[22px]">
            +
          </span>
        </IconButton>
      </div>

      <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
        <legend className="eyebrow mb-2">Starting</legend>
        <div className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1">
          {sinces.map(([k, l]) => (
            <ChoiceChip key={k} pressed={since === k} onClick={() => setSince(k)}>
              {l}
            </ChoiceChip>
          ))}
        </div>
      </fieldset>

      <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
        <legend className="eyebrow mb-2">Repayment</legend>
        <div className="flex flex-wrap gap-2">
          <ChoiceChip pressed={payMode === "bank" || !canKeep} onClick={() => setPayMode("bank")}>
            The bank's new amount · {money(minPay)}
          </ChoiceChip>
          {minPay !== oldPay && (
            <ChoiceChip pressed={payMode === "keep" && canKeep} onClick={() => canKeep && setPayMode("keep")}>
              Keep paying {money(oldPay)}
            </ChoiceChip>
          )}
        </div>
        {minPay !== oldPay && (
          <p className="m-0 text-[13px] text-ink-3">
            {canKeep
              ? minPay < oldPay
                ? `Keeping ${money(oldPay)} pays the loan off sooner.`
                : `Keeping ${money(oldPay)} is allowed, but less comes off the loan each month.`
              : `At ${pctText(rate)} the bank needs at least ${money(minPay)} a month, so ${money(oldPay)} isn't an option.`}
          </p>
        )}
      </fieldset>

      <section aria-labelledby="rc-what" className="flex flex-col gap-2.5">
        <h3 id="rc-what" className="eyebrow m-0">
          What changes
        </h3>
        <div className="grid grid-cols-2 gap-2.5">
          <Stat
            label="Interest"
            value={`${intDiff >= 0 ? "+" : "−"}${money(Math.abs(intDiff))}`}
            note="a month, at today's balance"
            role={intDiff > 0 ? "bills" : "savings"}
          />
          <Stat
            label="Repayment"
            value={money(pay)}
            note={payDiff === 0 ? "no change" : `${payDiff > 0 ? "+" : "−"}${money(Math.abs(payDiff))} a month`}
            role="offset"
          />
          <Stat
            label="Loan gone"
            value={monthYear(goneDate)}
            note={goneDiff}
            role={mNew > mOld ? "bills" : "savings"}
          />
          {monthsHeld != null && held && (
            <Stat
              label={`${bills!.name} held`}
              value={`${monthsHeld.toFixed(1)} months`}
              note={
                bills!.target_months && monthsHeld < bills!.target_months
                  ? `Dips below ${bills!.target_months} months`
                  : "Still enough"
              }
              role="bills"
            />
          )}
        </div>
      </section>

      {intoBills && bump > 0 && (
        <label className="flex items-center gap-3 rounded-2xl border border-line p-3.5">
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">
              Raise {intoBills.label || "the payday transfer"} from {money(intoBills.amount)} to{" "}
              {money(intoBills.amount + bump)}
            </span>
            <span className="block text-[13px] text-ink-3">
              So {bills?.name ?? "Bills"} keeps up with the bigger repayment
            </span>
          </span>
          <Switch checked={raise} onChange={setRaise} label="Raise the payday transfer" />
        </label>
      )}
      <p className="m-0 text-[13px] text-ink-3">
        What you can spend each day doesn't change: the loan is paid from {bills?.name ?? "Bills"}.
      </p>

      {save.isError && <ErrorText>{errorMessage(save.error)}</ErrorText>}
      <div className="flex justify-end gap-2">
        <Button onClick={onClose}>Not now</Button>
        <Button primary onClick={() => save.mutate()} disabled={save.isPending || (rate === nowBp && pay === oldPay)}>
          Update the loan
        </Button>
      </div>
    </div>
  );
}
