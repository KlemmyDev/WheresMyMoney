/**
 * Early retirement: Checkpoint check-in (the FIRE on track canvas's flow). Bring super up to date (from a statement or
 * the fund's app); outside super and the loan come from the app already. Then each part against where it needs to be
 * today, what changed since the last check-in, and the date then and now. Saving records the checkpoint for next time
 * (POST /api/fire/checkpoint); super balances are saved to each person's super as of today.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { FlowHead, StepNav } from "~/features/fire/flow";
import type { TrackReady } from "~/features/fire/api";
import { COLOUR, Status, TONE, k, verdictOf, type Tone } from "~/features/fire/track";
import { apiGet, apiSend, errorMessage } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { Card } from "~/features/common/ds";
import { editable, money, parseMoney, shortDate } from "~/features/common/format";
import { refresh, retirementQuery } from "~/features/common/queries";
import { Empty, ErrorText } from "~/features/common/ui";

type Snap = {
  date: string;
  super: number;
  etfs: number;
  owed: number;
  super_need: number;
  outside_need: number;
  owe_max: number | null;
  goal: number;
  pace: number | null;
};
type Check = { now: Snap; last: Snap | null; track: TrackReady };

export function FireCheckin() {
  const qc = useQueryClient();
  const ret = useQuery(retirementQuery);
  const before = useQuery({
    queryKey: ["fire", "checkpoint"],
    queryFn: ({ signal }) => apiGet<Check>("fire/checkpoint", undefined, { signal }),
  });
  const [values, setValues] = useState<Record<number, string>>({});
  const [result, setResult] = useState<Check | null>(null);
  const save = useMutation({
    mutationFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      for (const p of ret.data?.people ?? []) {
        const v = values[p.id];
        const c = v == null ? null : parseMoney(v);
        if (c != null && c !== p.balance)
          await apiSend("PUT", `retirement/people/${p.id}`, { balance: c, as_of: today });
      }
      return apiSend<Check>("POST", "fire/checkpoint", { save: true });
    },
    onSuccess: (r) => {
      refresh(qc);
      setResult(r);
    },
  });
  if (before.isError) return <ErrorText>{errorMessage(before.error)}</ErrorText>;
  if (!ret.data || !before.data) return <Loading />;
  const people = ret.data.people;
  if (!people.length)
    return (
      <>
        <FlowHead over="Early retirement" title="Checkpoint check-in" steps={[]} step={0} />
        <Empty
          title="Add your super first"
          action={
            <Link to="/retirement" className="text-teal">
              Go to Retirement
            </Link>
          }
        />
      </>
    );
  const b = before.data;
  const bad = people.some((p) => values[p.id] != null && parseMoney(values[p.id]) == null);
  return (
    <>
      <FlowHead
        over="Early retirement · checkpoint"
        title={`Check the plan · ${shortDate(b.now.date)}`}
        steps={["Update", "How we went"]}
        step={result ? 1 : 0}
      />
      {!result ? (
        <>
          <div>
            <h2 className="m-0 text-[26px] leading-8 font-semibold tracking-[-0.02em]">Where are the balances now?</h2>
            <p className="mt-1.5 mb-0 max-w-[720px] text-ink-2">
              Super is the one the app can&apos;t see for itself: bring it up to date from the latest statement or your
              fund&apos;s app. The rest is already here.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {people.map((p) => (
              <Card key={p.id} className="gap-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="h-8 w-2.5 rounded-md" style={{ background: COLOUR.super }} />
                  <label htmlFor={`ci-${p.id}`} className="flex-1 font-semibold">
                    {p.person} · super
                  </label>
                </div>
                <div className="flex h-12 items-center gap-1.5 rounded-xl border border-line-2 bg-sunken px-3.5 focus-within:outline-2 focus-within:outline-teal">
                  <span className="num text-[20px] text-ink-3">$</span>
                  <input
                    id={`ci-${p.id}`}
                    inputMode="decimal"
                    value={values[p.id] ?? editable(p.balance).replace(/\.00$/, "")}
                    onChange={(e) => setValues({ ...values, [p.id]: e.target.value })}
                    className="num min-w-0 flex-1 border-0 bg-transparent text-[20px] text-ink outline-none"
                  />
                </div>
                <div className="text-[13px] text-ink-3">
                  Last updated {p.as_of ? shortDate(p.as_of) : "when it was added"}
                </div>
              </Card>
            ))}
            <Card className="gap-2.5">
              <div className="flex items-center gap-2.5">
                <span className="h-8 w-2.5 rounded-md" style={{ background: COLOUR.outside }} />
                <span className="flex-1 font-semibold">Outside super</span>
              </div>
              <div className="num text-[24px] leading-[30px]">{money(b.now.etfs)}</div>
              <Link to="/investments" className="text-[13px] font-semibold text-teal no-underline">
                From your holdings and today&apos;s prices →
              </Link>
            </Card>
            {b.now.owed > 0 && (
              <Card className="gap-2.5">
                <div className="flex items-center gap-2.5">
                  <span className="h-8 w-2.5 rounded-md" style={{ background: COLOUR.loan }} />
                  <span className="flex-1 font-semibold">Loan owing past the offset</span>
                </div>
                <div className="num text-[24px] leading-[30px]">{money(b.now.owed)}</div>
                <Link to="/loan" className="text-[13px] font-semibold text-teal no-underline">
                  From the loan and your balances →
                </Link>
              </Card>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-dashed border-line-2 px-4 py-3.5 text-[14px] text-ink-2">
            <span className="flex-1">
              Got a newer super statement? Upload the PDF and we&apos;ll read the balance from it.
            </span>
            <Link to="/retirement/statement" className="font-semibold text-teal no-underline">
              Upload statement
            </Link>
          </div>
          {bad && <ErrorText>Enter each super balance as an amount, like 184,500.</ErrorText>}
          {save.isError && <ErrorText>{errorMessage(save.error)}</ErrorText>}
          <StepNav next={bad ? undefined : () => save.mutate()} nextLabel="See how we went" busy={save.isPending} />
        </>
      ) : (
        <Result r={result} />
      )}
    </>
  );
}

function Result({ r }: { r: Check }) {
  const t = r.track;
  const v = verdictOf(t);
  const last = r.last;
  const lead = t.people[0];
  const wasTitle = last
    ? last.pace == null
      ? "Not before 70"
      : last.pace > last.goal
        ? `${last.pace - last.goal} years behind`
        : last.pace === last.goal
          ? "On track"
          : `${last.goal - last.pace} years to spare`
    : null;
  const same = wasTitle === v.title;
  const pots: {
    name: string;
    colour: string;
    need: number;
    have: number;
    was: number | null;
    lower?: boolean;
    show: boolean;
    note: (d: number) => string;
  }[] = [
    {
      name: "Super, together",
      colour: COLOUR.super,
      need: r.now.super_need,
      have: r.now.super,
      was: last?.super ?? null,
      show: true,
      note: (d) =>
        d >= 0
          ? "On or past where it needs to be today."
          : `${k(-d)} under where it needs to be today${last && last.super < last.super_need ? ", as it was last time: the gap is real, not one bad year" : ""}.`,
    },
    {
      name: "Outside super",
      colour: COLOUR.outside,
      need: r.now.outside_need,
      have: r.now.etfs,
      was: last?.etfs ?? null,
      show: true,
      note: (d) =>
        d >= 0
          ? "Enough building up for the years before super opens."
          : `${k(-d)} behind what the bridge needs today. Check the payday rule is still moving money across.`,
    },
    {
      name: "Home loan",
      colour: COLOUR.loan,
      need: r.now.owe_max ?? 0,
      have: r.now.owed,
      was: last?.owed ?? null,
      lower: true,
      show: r.now.owed > 0 || (last?.owed ?? 0) > 0,
      note: (d) =>
        d >= 0
          ? `Owing ${k(d)} less than the most you can${t.loan?.gone_year ? `; gone in ${t.loan.gone_year}` : ""}.`
          : `Owing ${k(-d)} more than the most you can. Has the offset dropped?`,
    },
  ];
  return (
    <>
      <Card lit className="flex-row flex-wrap items-center gap-7">
        <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-2">
          <div className="text-[12px] text-ink-3">
            {last ? `Since ${shortDate(last.date)}` : "Your first checkpoint"}
          </div>
          <div
            className="font-brand text-[36px] leading-[42px] font-semibold tracking-[-0.02em] sm:text-[40px] sm:leading-[46px]"
            style={{ color: TONE[v.tone] }}
          >
            {last && same ? `Still ${v.title.toLowerCase()}` : v.title}
          </div>
          <p className="m-0 text-ink-2">{v.sentence}</p>
        </div>
        <div className="grid min-w-0 flex-[0_1_380px] grid-cols-2 gap-3">
          <div className="rounded-2xl border border-line bg-sunken p-3.5">
            <div className="text-[12px] text-ink-3">{last ? `Last time · ${shortDate(last.date)}` : "Last time"}</div>
            <div className="mt-1 font-semibold">{wasTitle ?? "—"}</div>
            <div className="text-[12px] text-ink-3">{last?.pace ? `earliest ${last.pace}` : ""}</div>
          </div>
          <div className="rounded-2xl border border-line bg-sunken p-3.5">
            <div className="text-[12px] text-ink-3">Now</div>
            <div className="mt-1 font-semibold" style={{ color: TONE[v.tone] }}>
              {v.title}
            </div>
            <div className="text-[12px] text-ink-3">
              {t.pace ? `earliest ${t.pace.retire_age} · ${t.pace.retire_year}` : "after 70"}
            </div>
          </div>
        </div>
      </Card>
      <h2 className="m-0 mt-2 text-[20px] leading-7 font-semibold">Today&apos;s checkpoint, part by part</h2>
      <div className="grid gap-4 lg:grid-cols-3">
        {pots
          .filter((p) => p.show)
          .map((p) => {
            const d = p.lower ? p.need - p.have : p.have - p.need;
            const tone: Tone = d >= 0 ? "good" : "warn";
            const lo = Math.min(p.need, p.have) * 0.85;
            const hi = Math.max(p.need, p.have, 1) * 1.12;
            const X = (x: number) => ((x - lo) / (hi - lo || 1)) * 100;
            return (
              <Card as="article" key={p.name} className="gap-3.5">
                <div className="flex items-center gap-2.5">
                  <span className="h-8 w-2.5 rounded-md" style={{ background: p.colour }} />
                  <div className="flex-1 font-semibold">{p.name}</div>
                  <Status tone={tone}>{d >= 0 ? `Hit by ${k(d)}` : `Missed by ${k(-d)}`}</Status>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[12px] text-ink-3">{p.lower ? "Owe at most" : "Needs to be"}</div>
                    <div className="num text-[18px]">{k(p.need)}</div>
                  </div>
                  <div>
                    <div className="text-[12px] text-ink-3">Actual</div>
                    <div className="num text-[18px]" style={{ color: p.colour }}>
                      {k(p.have)}
                    </div>
                  </div>
                </div>
                <div className="relative h-9" aria-hidden>
                  <div className="absolute inset-x-0 top-3.5 h-2 rounded-full border border-line bg-sunken" />
                  <div
                    className="absolute top-2 h-5 w-[3px] -translate-x-1/2 rounded-sm bg-ink"
                    style={{ left: `${X(p.need)}%` }}
                  />
                  <div
                    className="absolute top-2.5 size-4 -translate-x-1/2 rounded-full"
                    style={{ left: `${X(p.have)}%`, background: p.colour }}
                  />
                </div>
                {p.was != null && (
                  <div className="flex justify-between text-[13px]">
                    <span className="text-ink-2">Change since {shortDate(last!.date)}</span>
                    <span className="num">{money(p.have - p.was, { sign: true })}</span>
                  </div>
                )}
                <p className="m-0 text-[14px] leading-5 text-ink-2">{p.note(d)}</p>
              </Card>
            );
          })}
      </div>
      <Card className="flex-row flex-wrap items-center gap-4">
        <div className="min-w-0 flex-[1_1_400px]">
          <div className="font-semibold">Next checkpoint: a year from now</div>
          <div className="text-[14px] text-ink-2">
            By then super needs {k(t.years[1]?.super_need ?? 0)}
            {t.goal.age > lead.age + 1 && t.years[1]?.outside_need
              ? `, outside super ${k(t.years[1].outside_need)}`
              : ""}
            {t.years[1]?.owe_max ? `, and the loan at most ${k(t.years[1].owe_max)}` : ""}.
          </div>
        </div>
        {!t.at_goal.ok && (
          <Link
            to="/early-retirement/close"
            className="btn-primary inline-flex min-h-11 items-center rounded-xl px-5 font-semibold no-underline"
          >
            Close the gap
          </Link>
        )}
        <Link
          to="/early-retirement"
          className="press inline-flex min-h-11 items-center rounded-xl border border-line-2 px-5 font-semibold text-ink no-underline"
        >
          Done
        </Link>
      </Card>
    </>
  );
}
