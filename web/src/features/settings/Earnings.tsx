/**
 * What you each earn (the uplift canvas's InIncome, in Settings › Household): each person's salary before tax, what
 * work pays into super, salary sacrifice and how often they're paid, with the room left in super this year. Used for
 * the early-retirement plan; it never moves money. What lands each pay comes with the plan's tax rules.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { Bar, Card, CardHead } from "~/features/common/ds";
import { editable, money, parseMoney } from "~/features/common/format";
import { useToast } from "~/features/common/overlay";
import { refresh, retirementQuery, type SuperAccount } from "~/features/common/queries";
import { Button, ErrorText, Input, Label, Segmented } from "~/features/common/ui";

const PAID = [
  { value: "weekly", label: "Weekly" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthly", label: "Monthly" },
] as const;

export function Earnings() {
  const q = useQuery(retirementQuery);
  const people = q.data?.people ?? [];
  if (!people.length) return null;
  const room = people.reduce((s, p) => s + p.room, 0);
  return (
    <Card aria-labelledby="hh-earn" className="flex flex-col gap-4">
      <CardHead id="hh-earn" title="What you each earn" />
      <p className="m-0 -mt-2 text-[14px] text-ink-2">
        Before tax, from a payslip. It sets the room each of you has left in super this year, and the early-retirement
        plan uses it. It never moves money, and it stays on your home server.
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        {people.map((p) => (
          <Person key={`${p.id}-${p.salary}-${p.rate}-${p.sacrifice}-${p.pay_every}`} p={p} />
        ))}
      </div>
      {people.length > 1 && (
        <p className="m-0 text-[13px] text-ink-2">
          Room left together this year: <b className="text-ink">{money(room)}</b>. You may have more from carry-forward:
          cap you didn&apos;t use in the last five years can be added while your super is under $500,000. Your
          fund&apos;s statements don&apos;t show it; myGov does, under Super.
        </p>
      )}
    </Card>
  );
}

function Person({ p }: { p: SuperAccount }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [salary, setSalary] = useState(editable(p.salary));
  const [rate, setRate] = useState(String(Math.round(p.rate * 1000) / 10));
  const [sacrifice, setSacrifice] = useState(editable(Math.round(p.sacrifice / 12)));
  const [paid, setPaid] = useState(p.pay_every);
  const salaryC = parseMoney(salary) ?? 0;
  const rateN = Number(rate) / 100;
  const sacrificeYear = (parseMoney(sacrifice) ?? 0) * 12;
  const work = Math.round(salaryC * (Number.isFinite(rateN) ? rateN : 0));
  const used = work + sacrificeYear;
  const room = Math.max(p.cap - used, 0);
  const changed =
    salaryC !== p.salary ||
    Math.abs(rateN - p.rate) > 1e-9 ||
    sacrificeYear !== Math.round(p.sacrifice / 12) * 12 ||
    paid !== p.pay_every;
  const save = useMutation({
    mutationFn: () =>
      apiSend("PUT", `retirement/people/${p.id}`, {
        salary: salaryC,
        rate: rateN,
        sacrifice: sacrificeYear,
        pay_every: paid,
      }),
    onSuccess: () => {
      refresh(qc);
      const was = { salary: p.salary, rate: p.rate, sacrifice: p.sacrifice, pay_every: p.pay_every };
      toast(`Saved for ${p.person}`, () =>
        apiSend("PUT", `retirement/people/${p.id}`, was)
          .then(() => refresh(qc))
          .catch((e) => toast(errorMessage(e))),
      );
    },
  });
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-line p-4">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[16px] font-semibold">
          {p.person}, {p.age}
        </span>
        <span className="text-[12px] text-ink-3">
          Super{p.fund ? ` with ${p.fund}` : ""} · opens {p.opens}
        </span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor={`e-sal-${p.id}`}>Salary before tax, a year</Label>
          <Input id={`e-sal-${p.id}`} inputMode="decimal" value={salary} onChange={(e) => setSalary(e.target.value)} />
        </div>
        <div>
          <Label htmlFor={`e-rate-${p.id}`}>Work pays into super, %</Label>
          <Input id={`e-rate-${p.id}`} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
        </div>
        <div>
          <Label htmlFor={`e-ss-${p.id}`}>Salary sacrifice, a month</Label>
          <Input
            id={`e-ss-${p.id}`}
            inputMode="decimal"
            value={sacrifice}
            onChange={(e) => setSacrifice(e.target.value)}
            placeholder="0.00"
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>Paid</Label>
        <Segmented label={`How often ${p.person} is paid`} options={[...PAID]} value={paid} onChange={setPaid} />
      </div>
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between text-[13px]">
          <span className="text-ink-2">Room in super this year</span>
          <span className="num">
            <b className="text-ink">{money(room)}</b> left of {money(p.cap)}
          </span>
        </div>
        <Bar
          label={`${money(work)} from work and ${money(sacrificeYear)} sacrificed, of the ${money(p.cap)} cap`}
          max={Math.max(p.cap, used)}
          height={10}
          marker={p.cap}
          segments={[
            { value: work, role: "invest" },
            { value: sacrificeYear, role: "savings" },
          ]}
        />
        <div className="text-[12px] text-ink-3">
          {money(work)} from work, {money(sacrificeYear)} sacrificed
          {used > p.cap ? `: ${money(used - p.cap)} over the cap, taxed at your marginal rate` : ""}.
        </div>
      </div>
      {save.isError && <ErrorText>{errorMessage(save.error)}</ErrorText>}
      <div className="flex justify-end gap-2">
        {changed && (
          <Button
            onClick={() => {
              setSalary(editable(p.salary));
              setRate(String(Math.round(p.rate * 1000) / 10));
              setSacrifice(editable(Math.round(p.sacrifice / 12)));
              setPaid(p.pay_every);
            }}
          >
            Put back
          </Button>
        )}
        <Button primary={changed} disabled={!changed || save.isPending} onClick={() => save.mutate()}>
          Save
        </Button>
      </div>
    </div>
  );
}
