/**
 * Add a super statement (the uplift canvas's InSuper), in three steps: choose whose it is and drop the PDF the fund
 * sent (or, for a scan or a paper copy, type the figures in); check what was read (the balance, with a word if it's
 * older than the balance we have, the fees, each once, and how it's invested); then it's saved, with what changed.
 * Read on the home server, and nothing is saved until it's checked.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { apiSend, apiUpload, errorMessage } from "~/features/common/api";
import { Loading } from "~/features/common/brand";
import { Card, CardHead, ChoiceChip } from "~/features/common/ds";
import { EntityHeader } from "~/features/common/entity";
import { longDate, money, parseMoney, todayIso } from "~/features/common/format";
import { useToast } from "~/features/common/overlay";
import { refresh, retirementQuery, type SuperAccount } from "~/features/common/queries";
import { Button, Empty, ErrorText, Input, Label, Switch } from "~/features/common/ui";
import type { Fee, Option } from "~/features/retirement/model";

type Found = {
  balance: number | null;
  as_of: string | null;
  period: [string, string] | null;
  fees: Fee[];
  options: Option[];
  notes: string[];
  fund: string | null;
};

const STEPS = ["Choose the statement", "Check what we read", "Saved"];
const pct = (f: number, dp = 2) => `${(f * 100).toFixed(dp).replace(/\.?0+$/, "")}%`;
const feeText = (f: Fee) =>
  f.kind === "pct"
    ? `${pct(f.amount)} of the balance${f.cap ? `, on the first ${money(f.cap)}` : ""}`
    : `${money(f.amount)} a year`;

export function StatementPage({ personId }: { personId?: number }) {
  const q = useQuery(retirementQuery);
  const navigate = useNavigate();
  const people = q.data?.people ?? [];
  const [pick, setPick] = useState<number | null>(personId ?? null);
  const p = people.find((x) => x.id === (pick ?? people[0]?.id));
  const [found, setFound] = useState<Found | null>(null);
  const [typing, setTyping] = useState(false);
  const [saved, setSaved] = useState<{ balance: number | null; as_of: string | null; fees: number } | null>(null);
  if (!q.data) return <Loading />;
  if (!p)
    return (
      <Empty
        title="No one's super yet"
        action={
          <Link to="/retirement" className="text-teal">
            Add it on Retirement
          </Link>
        }
      >
        Add each person&apos;s super first, then their statements.
      </Empty>
    );
  const step = saved ? 2 : found ? 1 : 0;
  const other = people.find((x) => x.id !== p.id);
  const reset = () => {
    setFound(null);
    setSaved(null);
    setTyping(false);
  };

  return (
    <>
      <EntityHeader
        back={{ to: "/retirement", label: `${p.person}'s super` }}
        title="Add a super statement"
        sub="Read on your home server. The statement never leaves the house, and nothing is saved until you've checked it."
      />
      <ol className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li
            key={s}
            aria-current={i === step ? "step" : undefined}
            className={
              "rounded-full border px-3 py-1.5 text-[13px] " +
              (i === step ? "border-teal text-ink" : i < step ? "border-line text-ink-2" : "border-line text-ink-3")
            }
          >
            {i + 1}. {s}
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Choose
          people={people}
          p={p}
          onPick={(id) => {
            setPick(id);
            reset();
          }}
          typing={typing}
          onType={setTyping}
          onFound={setFound}
        />
      )}
      {step === 1 && found && (
        <Check
          p={p}
          found={found}
          onBack={reset}
          onSaved={(s) => {
            setSaved(s);
          }}
        />
      )}
      {step === 2 && saved && (
        <Card lit tint="savings" aria-labelledby="st-saved" className="flex flex-col gap-3">
          <CardHead id="st-saved" title={`Saved to ${p.person}'s super`} />
          <p className="m-0 text-[15px] text-ink-2">Retirement and the plan use it from now on.</p>
          <ul className="m-0 flex list-none flex-col p-0 text-[14px]">
            {saved.balance != null && (
              <li className="flex justify-between border-b border-line py-2">
                <span className="text-ink-2">Balance</span>
                <span className="num">
                  {money(saved.balance)}
                  {saved.as_of ? ` on ${longDate(saved.as_of)}` : ""}
                </span>
              </li>
            )}
            <li className="flex justify-between py-2">
              <span className="text-ink-2">Fees</span>
              <span>{saved.fees ? `${saved.fees} kept` : "As they were"}</span>
            </li>
          </ul>
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={() => navigate({ to: "/retirement" })}>See {p.person}&apos;s super</Button>
            {other && (
              <Button
                primary
                onClick={() => {
                  setPick(other.id);
                  reset();
                }}
              >
                Add {other.person}&apos;s statement
              </Button>
            )}
          </div>
        </Card>
      )}
    </>
  );
}

function Choose({
  people,
  p,
  onPick,
  typing,
  onType,
  onFound,
}: {
  people: SuperAccount[];
  p: SuperAccount;
  onPick: (id: number) => void;
  typing: boolean;
  onType: (v: boolean) => void;
  onFound: (f: Found) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [balance, setBalance] = useState("");
  const [asOf, setAsOf] = useState(`${new Date().getFullYear() - (new Date().getMonth() < 6 ? 1 : 0)}-06-30`);
  const [fees, setFees] = useState("");
  const read = useMutation({
    mutationFn: (f: File) => apiUpload<Found>(`retirement/people/${p.id}/statement`, f),
    onSuccess: (r) => onFound(r),
  });
  const nothing = read.data && read.data.balance == null && !read.data.fees.length && !read.data.options.length;
  return (
    <Card aria-labelledby="st-choose" className="flex flex-col gap-4">
      <CardHead id="st-choose" title="Choose the statement" />
      {people.length > 1 && (
        <div className="flex flex-col gap-2">
          <Label>Whose is it?</Label>
          <div className="flex flex-wrap gap-2">
            {people.map((x) => (
              <ChoiceChip key={x.id} pressed={x.id === p.id} onClick={() => onPick(x.id)}>
                {x.person}
              </ChoiceChip>
            ))}
          </div>
        </div>
      )}
      {!typing ? (
        <>
          <label
            className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-line-2 p-8 text-center"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) setFile(f);
            }}
          >
            <span className="text-[16px] font-semibold">Drop the PDF your fund sent</span>
            <span className="text-[13px] text-ink-3">
              The yearly statement from {p.fund || "the fund"}&apos;s app or website. 10 MB at most.
            </span>
            <span className="mt-1 rounded-xl border border-line-2 px-3 py-1.5 text-[14px] font-semibold">
              Choose a file
            </span>
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                e.target.value = "";
              }}
            />
          </label>
          {file && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-sunken px-3 py-2 text-[14px]">
              <span className="min-w-0 truncate">
                {file.name} · {Math.round(file.size / 1024)} KB
              </span>
              <button
                type="button"
                className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-teal"
                onClick={() => setFile(null)}
              >
                Remove
              </button>
            </div>
          )}
          {(read.isError || nothing) && (
            <div className="flex flex-col gap-1 rounded-xl border border-bills/40 p-3 text-[14px]">
              <b className="text-ink">We couldn&apos;t read that statement</b>
              <span className="text-ink-2">
                {read.isError
                  ? errorMessage(read.error)
                  : "It may be pictures of pages with no text to read. Type the figures in instead; they're on the first two pages."}
              </span>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent p-0 text-[13px] font-semibold text-teal"
              onClick={() => onType(true)}
            >
              It&apos;s a scan or a paper copy: type the figures in
            </button>
            <Button primary disabled={!file || read.isPending} onClick={() => file && read.mutate(file)}>
              {read.isPending ? "Reading…" : "Read it"}
            </Button>
          </div>
          <p className="m-0 text-right text-[12px] text-ink-3">
            Takes a few seconds. You check everything before it&apos;s saved.
          </p>
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="st-bal">Closing balance</Label>
              <Input id="st-bal" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="st-on">On</Label>
              <Input id="st-on" type="date" value={asOf} max={todayIso()} onChange={(e) => setAsOf(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="st-fees">Total fees and costs you paid</Label>
              <Input id="st-fees" inputMode="decimal" value={fees} onChange={(e) => setFees(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap justify-between gap-2">
            <Button onClick={() => onType(false)}>Use a PDF instead</Button>
            <Button
              primary
              disabled={parseMoney(balance) == null}
              onClick={() =>
                onFound({
                  balance: parseMoney(balance),
                  as_of: asOf || null,
                  period: null,
                  fees: parseMoney(fees)
                    ? [{ name: "Total fees and costs", kind: "fixed", amount: parseMoney(fees)! }]
                    : [],
                  options: [],
                  notes: ["Typed in from the statement."],
                  fund: null,
                })
              }
            >
              Check these
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Check({
  p,
  found,
  onBack,
  onSaved,
}: {
  p: SuperAccount;
  found: Found;
  onBack: () => void;
  onSaved: (s: { balance: number | null; as_of: string | null; fees: number }) => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  // A statement older than the balance we have: which is today's?
  const older = !!(found.as_of && p.as_of && found.as_of < p.as_of && found.balance != null);
  const [useBalance, setUseBalance] = useState(found.balance != null && !older);
  // A typed-in total is rougher than a known fund's published fees (which grow with the balance), so it starts off.
  const typed = found.notes.includes("Typed in from the statement.");
  const [useFees, setUseFees] = useState(found.fees.length > 0 && !(typed && p.known_fund));
  const [useOptions, setUseOptions] = useState(found.options.length > 0);
  const feeTotal = found.fees.filter((f) => f.kind === "fixed").reduce((t, f) => t + f.amount, 0);
  const save = useMutation({
    mutationFn: () =>
      apiSend("PUT", `retirement/people/${p.id}`, {
        ...(useBalance && found.balance != null ? { balance: found.balance, as_of: found.as_of ?? todayIso() } : {}),
        ...(useFees ? { fees: found.fees } : {}),
        ...(useOptions ? { options: found.options } : {}),
      }),
    onSuccess: () => {
      refresh(qc);
      const was = { balance: p.balance, as_of: p.as_of, fees: p.fees, options: p.options };
      onSaved({
        balance: useBalance ? found.balance : null,
        as_of: useBalance ? found.as_of : null,
        fees: useFees ? found.fees.length : 0,
      });
      toast(`Saved to ${p.person}'s super`, () =>
        apiSend("PUT", `retirement/people/${p.id}`, was)
          .then(() => refresh(qc))
          .catch((e) => toast(errorMessage(e))),
      );
    },
  });
  return (
    <Card aria-labelledby="st-check" className="flex flex-col gap-4">
      <CardHead
        id="st-check"
        title="Check what we read"
        right={
          found.period ? (
            <span className="text-[13px] text-ink-3">
              {p.person}, {longDate(found.period[0])} to {longDate(found.period[1])}
            </span>
          ) : undefined
        }
      />
      {found.balance != null && (
        <section className="flex flex-col gap-2" aria-label="Balance">
          <div className="flex items-center justify-between gap-3 rounded-xl bg-sunken p-3">
            <span className="text-[14px]">
              Closing balance{found.as_of ? ` on ${longDate(found.as_of)}` : ""}
              <b className="num block text-[18px]">{money(found.balance, { cents: true })}</b>
            </span>
            <Switch checked={useBalance} onChange={setUseBalance} label="Use this balance" />
          </div>
          {older && (
            <p className="m-0 rounded-xl border border-bills/40 p-3 text-[13px] text-ink-2">
              <b className="text-ink">Older than today&apos;s balance.</b> We have {money(p.balance)} for {p.person}{" "}
              from {longDate(p.as_of!)}. Leave the switch off to keep that as today&apos;s, and still take the fees and
              how it&apos;s invested from the statement.
            </p>
          )}
        </section>
      )}
      {found.fees.length > 0 && (
        <section className="flex flex-col gap-1.5" aria-label="Fees">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[14px] font-semibold">Fees, each once</span>
            <Switch checked={useFees} onChange={setUseFees} label="Use these fees" />
          </div>
          <ul className="m-0 flex list-none flex-col p-0 text-[14px]">
            {found.fees.map((f) => (
              <li key={f.name} className="flex justify-between gap-3 border-b border-line py-1.5 last:border-b-0">
                <span className="text-ink-2">{f.name}</span>
                <span className="num">{feeText(f)}</span>
              </li>
            ))}
          </ul>
          {feeTotal > 0 && (
            <div className="text-right text-[13px] text-ink-3">
              {money(feeTotal, { cents: true })} in dollar fees a year
            </div>
          )}
          {found.fund && (
            <div className="text-[12px] text-ink-3">The fund&apos;s published fees, which grow with the balance.</div>
          )}
        </section>
      )}
      {found.options.length > 0 && (
        <section className="flex flex-col gap-1.5" aria-label="How it's invested">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[14px] font-semibold">How it&apos;s invested</span>
            <Switch checked={useOptions} onChange={setUseOptions} label="Use these options" />
          </div>
          <ul className="m-0 flex list-none flex-col p-0 text-[14px]">
            {found.options.map((o) => (
              <li key={o.name} className="flex justify-between gap-3 border-b border-line py-1.5 last:border-b-0">
                <span className="text-ink-2">{o.name}</span>
                <span className="num">{pct(o.share, 1)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {found.notes.map((n) => (
        <p key={n} className="m-0 text-[12px] text-ink-3">
          {n}
        </p>
      ))}
      {save.isError && <ErrorText>{errorMessage(save.error)}</ErrorText>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button onClick={onBack}>Start again</Button>
        <span className="flex items-center gap-3">
          <span className="text-[12px] text-ink-3">Nothing is saved until you do.</span>
          <Button
            primary
            disabled={!(useBalance || useFees || useOptions) || save.isPending}
            onClick={() => save.mutate()}
          >
            Save to {p.person}&apos;s super
          </Button>
        </span>
      </div>
    </Card>
  );
}
