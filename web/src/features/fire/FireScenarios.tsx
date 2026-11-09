/**
 * Early retirement: Scenarios (the uplift canvas's FiScenarios). Move the levers and see when the money lasts to,
 * keep the what-ifs worth keeping, put any two side by side, and ask what it would take to stop at an age. Every
 * figure comes from the same engine as Freedom (POST /api/fire/whatif).
 */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { FireNav } from "~/features/fire/FireNav";
import { fireQuery, type FireRow } from "~/features/fire/api";
import { apiGet, apiSend, errorMessage } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { Card, CardHead, ChoiceChip, ROLE } from "~/features/common/ds";
import { money } from "~/features/common/format";
import { useToast } from "~/features/common/overlay";
import { ScrubChart } from "~/features/common/ScrubChart";
import { Button, Input, Label, PageHead, Pill, Switch, cn } from "~/features/common/ui";

type Levers = {
  retire_age: number;
  spend: number;
  spare: number;
  where: "off" | "etf" | "sup" | "mix";
  keep: boolean;
  part_time: boolean;
  one_off: "none" | "car" | "inheritance";
  pension: boolean;
};
type Summary = { retire_age: number; retire_year: number; ok: boolean; lasts: number; gap: number | null };
type WhatIf = {
  levers: Levers;
  result: Summary;
  soonest: number | null;
  rows: FireRow[];
  seek?: { target: number; ideas: Idea[] };
};
type Idea = {
  kind: "already" | "save" | "spend" | "mix";
  levers: Levers | null;
  lasts?: number;
  spare?: number | null;
  more?: number | null;
  spend?: number | null;
  less?: number | null;
  realistic?: boolean;
  where?: string;
};
type Saved = { id: number; name: string; levers: Levers; result?: Summary; rows?: FireRow[] };

const WHERE: { value: Levers["where"]; label: string }[] = [
  { value: "off", label: "The offset" },
  { value: "etf", label: "ETFs" },
  { value: "sup", label: "Super" },
  { value: "mix", label: "ETFs and super" },
];
const total = (r: FireRow) => r.super + r.etfs + r.offset;

export function FireScenarios() {
  const qc = useQueryClient();
  const toast = useToast();
  const fire = useQuery(fireQuery);
  const [lv, setLv] = useState<Partial<Levers> | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [pick, setPick] = useState<number[]>([]);
  useEffect(() => {
    document.title = "Scenarios · Early retirement · WheresMyMoney";
  }, []);
  const start = fire.data && fire.data.ready ? ((fire.data.plan ?? fire.data.today)?.retire_age ?? 60) : 60;
  const levers = lv ?? { retire_age: start, keep: true };
  const goal = target ?? Math.max(45, (levers.retire_age ?? start) - 3);
  const q = useQuery({
    queryKey: ["fire", "whatif", levers, goal],
    queryFn: () => apiSend<WhatIf>("POST", "fire/whatif", { levers, target: goal }),
    placeholderData: keepPreviousData,
    enabled: !!fire.data,
  });
  const saved = useQuery({
    queryKey: ["fire", "scenarios"],
    queryFn: ({ signal }) => apiGet<Saved[]>("fire/scenarios", undefined, { signal }),
  });
  const save = useMutation({
    mutationFn: () => apiSend<Saved[]>("POST", "fire/scenarios", { name, levers: q.data?.levers }),
    onSuccess: (list) => {
      qc.setQueryData(["fire", "scenarios"], list);
      setName("");
      toast("Saved. It's in the strip and on the chart.");
    },
    onError: (e) => toast(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (s: Saved) => apiSend<Saved[]>("DELETE", `fire/scenarios/${s.id}`),
    onSuccess: (list, s) => {
      qc.setQueryData(["fire", "scenarios"], list);
      setPick((p) => p.filter((id) => id !== s.id));
      toast(`${s.name} removed`, () =>
        apiSend<Saved[]>("POST", "fire/scenarios", { name: s.name, levers: s.levers })
          .then((back) => qc.setQueryData(["fire", "scenarios"], back))
          .catch((e) => toast(errorMessage(e))),
      );
    },
  });
  if (!fire.data) return <Loading />;
  const d = q.data;
  const cur = d?.levers;
  const set = (patch: Partial<Levers>) => setLv({ ...(cur ?? levers), ...patch });
  const list = saved.data ?? [];
  const [a, b] = pick.map((id) => list.find((s) => s.id === id)).filter(Boolean) as Saved[];

  return (
    <>
      <PageHead over="Future · Early retirement" title="Scenarios" />
      <p className="-mt-2 mb-0 text-[14px] text-ink-3">
        Try a what-if, keep the ones worth keeping, and put any two side by side.
      </p>
      <FireNav />

      <div className="grid gap-4 md:grid-cols-12 [&>*]:min-w-0">
        <Card aria-labelledby="sc-levers" className="flex flex-col gap-4 md:col-span-7">
          <CardHead id="sc-levers" title="What if…" />
          {cur && (
            <>
              <Slider
                id="sc-age"
                label="Stop at"
                value={cur.retire_age}
                min={45}
                max={70}
                step={1}
                text={String(cur.retire_age)}
                onChange={(v) => set({ retire_age: v })}
                extra={
                  d?.soonest != null && d.soonest !== cur.retire_age ? (
                    <button
                      type="button"
                      className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-teal"
                      onClick={() => set({ retire_age: d.soonest! })}
                    >
                      Soonest that works: {d.soonest}
                    </button>
                  ) : null
                }
              />
              <Slider
                id="sc-spend"
                label="Spending a year, once stopped"
                value={cur.spend / 100}
                min={40000}
                max={120000}
                step={1000}
                text={money(cur.spend)}
                onChange={(v) => set({ spend: v * 100 })}
              />
              <Slider
                id="sc-spare"
                label="Spare money a month"
                value={cur.spare / 100}
                min={0}
                max={8000}
                step={250}
                text={money(cur.spare)}
                onChange={(v) => set({ spare: v * 100 })}
              />
              <div className="flex flex-col gap-1.5">
                <Label>While the loan&apos;s on, it goes to</Label>
                <div className="flex flex-wrap gap-2">
                  {WHERE.map((w) => (
                    <ChoiceChip key={w.value} pressed={cur.where === w.value} onClick={() => set({ where: w.value })}>
                      {w.label}
                    </ChoiceChip>
                  ))}
                </div>
              </div>
              <Toggle
                label="Once the loan's gone, keep investing"
                note="What it frees goes half to ETFs, half to super"
                checked={cur.keep}
                onChange={(v) => set({ keep: v })}
              />
              <Toggle
                label="Part-time until super opens"
                note="$40,000 a year between you"
                checked={cur.part_time}
                onChange={(v) => set({ part_time: v })}
              />
              <div className="flex flex-col gap-1.5">
                <Label>A one-off</Label>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["none", "None"],
                      ["car", "A $30,000 car"],
                      ["inheritance", "A $100,000 inheritance"],
                    ] as const
                  ).map(([v, l]) => (
                    <ChoiceChip key={v} pressed={cur.one_off === v} onClick={() => set({ one_off: v })}>
                      {l}
                    </ChoiceChip>
                  ))}
                </div>
              </div>
              <Toggle
                label="Count the age pension from 67"
                note="Off by default, so the plan errs low"
                checked={cur.pension}
                onChange={(v) => set({ pension: v })}
              />
            </>
          )}
        </Card>

        <div className="flex flex-col gap-4 md:col-span-5">
          <Card lit tint="bills" aria-labelledby="sc-result" className="flex flex-col gap-2">
            <CardHead
              id="sc-result"
              title="On these levers"
              right={d && <Pill tone={d.result.ok ? "good" : "warn"}>{d.result.ok ? "Works" : "Runs short"}</Pill>}
            />
            {d && (
              <>
                <div className="num text-[44px] leading-none font-semibold">{d.result.retire_age}</div>
                <p className="m-0 text-[15px] text-ink-2">
                  Stop in {d.result.retire_year}.{" "}
                  {d.result.gap != null
                    ? `The money outside super runs out at ${d.result.gap}, before super opens.`
                    : d.result.ok
                      ? `It lasts to ${Math.min(d.result.lasts, 100)}.`
                      : `It lasts to ${d.result.lasts}, short of the aim.`}
                </p>
              </>
            )}
            <div className="flex flex-wrap items-end gap-2 border-t border-line pt-3">
              <div className="min-w-0 flex-1">
                <Label htmlFor="sc-name">Name it</Label>
                <Input
                  id="sc-name"
                  className="font-sans"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Retire at 52"
                />
              </div>
              <Button primary disabled={!name.trim() || save.isPending || !d} onClick={() => save.mutate()}>
                Save as a scenario
              </Button>
            </div>
            <Button className="self-start" onClick={() => setLv(null)}>
              Reset
            </Button>
          </Card>

          <Card aria-labelledby="sc-seek" className="flex flex-col gap-2">
            <CardHead id="sc-seek" title={`What would it take to stop at ${goal}?`} />
            <div className="flex flex-wrap gap-2">
              {[goal - 2, goal - 1, goal, goal + 1]
                .filter((t) => t >= 45 && t <= 70)
                .map((t) => (
                  <ChoiceChip key={t} pressed={t === goal} onClick={() => setTarget(t)}>
                    {t}
                  </ChoiceChip>
                ))}
            </div>
            <p className="m-0 text-[13px] text-ink-3">
              The smallest single change that gets there, from the levers above.
            </p>
            {(d?.seek?.ideas ?? []).map((i) => (
              <div
                key={i.kind}
                className="flex items-center justify-between gap-3 border-b border-line py-2 text-[14px] last:border-b-0"
              >
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">{ideaHead(i, goal)}</span>
                  <span className="block text-[12px] text-ink-3">{ideaSub(i)}</span>
                </span>
                {i.levers && i.kind !== "already" && (i.kind !== "spend" || i.realistic) && (
                  <Button small onClick={() => setLv(i.levers!)}>
                    Try it
                  </Button>
                )}
              </div>
            ))}
          </Card>
        </div>

        <Card aria-labelledby="sc-saved" className="flex flex-col gap-3 md:col-span-12">
          <CardHead
            id="sc-saved"
            title="Saved scenarios"
            right={<span className="text-[13px] text-ink-3">pick any two to compare</span>}
          />
          {list.length ? (
            <div className="grid gap-2 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))]">
              {list.map((s) => {
                const on = pick.includes(s.id);
                return (
                  <div
                    key={s.id}
                    className={cn(
                      "flex flex-col gap-1 rounded-2xl border p-3",
                      on ? "border-bills bg-bills/10" : "border-line",
                    )}
                  >
                    <button
                      type="button"
                      aria-pressed={on}
                      className="cursor-pointer border-0 bg-transparent p-0 text-left text-ink"
                      onClick={() => {
                        setPick((p) => (on ? p.filter((x) => x !== s.id) : [...p, s.id].slice(-2)));
                        setLv(s.levers);
                      }}
                    >
                      <span className="block text-[14px] font-semibold">{s.name}</span>
                      <span className="num block text-[22px]">{s.result?.retire_age ?? "—"}</span>
                      <span className="block text-[12px] text-ink-3">
                        {s.result
                          ? s.result.ok
                            ? `Lasts to ${Math.min(s.result.lasts, 100)}`
                            : `Runs short · lasts to ${s.result.lasts}`
                          : ""}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="cursor-pointer self-start border-0 bg-transparent p-0 text-[12px] font-semibold text-bad"
                      onClick={() => remove.mutate(s)}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="m-0 text-[14px] text-ink-3">None yet. Name a what-if above and save it.</p>
          )}
          {a && b && a.rows && b.rows && (
            <div className="flex flex-col gap-2 border-t border-line pt-3">
              <div className="text-[14px] font-semibold">
                {a.name} against {b.name}
              </div>
              <ScrubChart
                label={`Put-away money by age: ${a.name} and ${b.name}`}
                lines={[
                  { name: a.name, values: a.rows.map(total), colour: ROLE.bills, fill: true },
                  { name: b.name, values: b.rows.map(total), colour: ROLE.accent },
                ]}
                at={(i) => (a.rows![i] ? `Age ${a.rows![i].age} · ${a.rows![i].year}` : "")}
                axisAt={(i) => (a.rows![i] ? String(a.rows![i].age) : "")}
                format={(v) => money(v)}
                floor={0}
                height={200}
                axis={[0, Math.round((a.rows.length - 1) / 2), a.rows.length - 1]}
              />
              <table className="w-full border-collapse text-[13px]">
                <tbody>
                  {(
                    [
                      ["Stop at", (s: Saved) => String(s.levers.retire_age)],
                      ["Lasts to", (s: Saved) => (s.result ? String(Math.min(s.result.lasts, 100)) : "—")],
                      ["Spending a year", (s: Saved) => money(s.levers.spend)],
                      ["Spare a month", (s: Saved) => money(s.levers.spare)],
                      ["While the loan's on", (s: Saved) => WHERE.find((w) => w.value === s.levers.where)?.label ?? ""],
                      ["Keep investing after", (s: Saved) => (s.levers.keep ? "Yes" : "No")],
                    ] as const
                  ).map(([label, fn]) => (
                    <tr key={label}>
                      <td className="border-b border-line py-1.5 text-ink-3">{label}</td>
                      <td className="border-b border-line py-1.5 text-right">{fn(a)}</td>
                      <td className="border-b border-line py-1.5 text-right">{fn(b)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
      <p className="m-0 text-[12px] text-ink-3">
        Estimates to plan with, not advice. Every card uses the same model as Freedom: today&apos;s dollars, growth
        after fees and inflation, money lasting to 92.
      </p>
    </>
  );
}

function ideaHead(i: Idea, goal: number): string {
  if (i.kind === "already") return `Stopping at ${goal} already works`;
  if (i.kind === "save")
    return i.spare ? `Put away ${money(i.more ?? 0)} more a month` : "Saving alone won't get there";
  if (i.kind === "spend")
    return i.spend
      ? i.realistic
        ? `Spend ${money(i.spend)} a year`
        : "Not realistic on its own"
      : "Spending cuts alone won't get there";
  return `Spend ${money(i.spend ?? 0)} and put away ${money(i.spare ?? 0)} a month`;
}

function ideaSub(i: Idea): string {
  if (i.kind === "already") return `With these levers the money lasts to ${i.lasts}.`;
  if (i.kind === "save")
    return i.spare
      ? `${money(i.spare)} a month in all, to ${i.where} while the loan's on.`
      : "Even $8,000 a month runs short.";
  if (i.kind === "spend")
    return i.spend
      ? i.realistic
        ? `${money(i.less ?? 0)} a year less once you stop.`
        : `It would need ${money(i.spend)} a year, under essentials ($55,000).`
      : "Even $20,000 a year runs short.";
  return "Two smaller changes instead of one big one.";
}

function Slider({
  id,
  label,
  value,
  min,
  max,
  step,
  text,
  onChange,
  extra,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  text: string;
  onChange: (v: number) => void;
  extra?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <span className="num text-[16px] font-semibold">{text}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-[var(--color-bills-fill)]"
      />
      {extra}
    </div>
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
    <div className="flex items-start justify-between gap-3">
      <span>
        <span className="block text-[14px] text-ink">{label}</span>
        <span className="block text-[12px] text-ink-3">{note}</span>
      </span>
      <Switch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}
