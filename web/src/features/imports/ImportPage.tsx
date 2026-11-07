/**
 * Importing a statement (designs: Import1 "upload and match", Import2 "review and categorise").
 *
 * 1. Drop the CSV. uBank's are recognised by name (account and month) and header; another bank's columns are matched
 *    once. The aside says what it'll do before anything's written: rows, duplicates skipped, hand entries merged, new
 *    ones, the closing balance, and a rough check-in it'll replace.
 * 2. Check the categories: what was sorted automatically, what needs you, transfers between accounts and merges.
 *    Choosing a category can be remembered for the merchant.
 * 3. Done: the success tick, and whether the ledger now matches the statement (an opening balance fixes it if not).
 *
 * Several files can be chosen or dropped at once. They queue up oldest month first (read from uBank's file names, so
 * each account's history builds in order) and go through the same three steps one at a time, each to its own account.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useRef, useState, type CSSProperties } from "react";
import { apiSend, apiUpload, errorMessage } from "~/features/common/api";
import { amount, capsDate, longDate, money, monthYear } from "~/features/common/format";
import { accountsQuery, categoriesQuery, refresh } from "~/features/common/queries";
import type { Account, Category } from "~/features/common/types";
import {
  Button,
  Choice,
  Dot,
  ErrorText,
  PageHead,
  Pill,
  Select,
  SuccessTick,
  Switch,
  Tile,
  cn,
} from "~/features/common/ui";

type FileInfo = {
  token: string;
  account_id: number | null;
  filename: string;
  bank: string;
  columns: Record<string, number | null | string>;
  header: string[];
  last4: string | null;
  month: string | null;
  rows: number;
  first_date: string | null;
  last_date: string | null;
  opening: number | null;
  closing: number | null;
  balance_ok: boolean | null;
  balance_problems: number[];
  reversed: boolean;
  date_format: string | null;
  sample: { index: number; date: string; description: string; amount: number; balance: number | null }[];
};

type NeedsColumns = { needs_columns: true; header: string[]; sample: string[][]; filename: string };

type ImportRow = {
  index: number;
  date: string;
  description: string;
  amount: number;
  balance: number | null;
  status: "duplicate" | "new" | "merge";
  merchant?: string;
  merge_id?: number;
  note?: string;
  hand_description?: string;
  hand_date?: string;
  category_id?: number | null;
  category?: string | null;
  why?: "merged" | "transfer" | "pay" | "interest" | "bill" | "rule" | "suggest" | "unknown";
  sure?: boolean;
  suggest?: string;
  suggest_id?: number;
  rule_kind?: string;
  called_for?: number;
  differed?: boolean;
  bill?: string;
};

type Analysis = {
  token: string;
  account_id: number;
  file: FileInfo;
  rows: ImportRow[];
  counts: {
    rows: number;
    duplicates: number;
    new: number;
    merge: number;
    sorted: number;
    need: number;
    transfers: number;
    bills: number;
  };
  replaced: { id: number; date: string; rough: number; exact: number }[];
  kept_cash: { id: number; date: string; amount: number; description: string }[];
  by_category: [string, number][];
  earliest: boolean;
};

type Done = {
  added: number;
  merged: number;
  skipped: number;
  kept_cash: number;
  replaced: number;
  learned: number;
  opening: { amount: number; date: string } | null;
  account: Account;
  ledger_at_close: number;
  closing: number | null;
  gap: number | null;
};

const FIELDS = [
  ["date", "Date"],
  ["description", "Description"],
  ["debit", "Money out"],
  ["credit", "Money in"],
  ["amount", "Amount (signed)"],
  ["balance", "Balance"],
] as const;

/** uBank names files `<nickname>-<last4>_<YYYY-MM>.csv`: oldest month first, then by name. */
function byMonth(a: File, b: File): number {
  const month = (f: File) => /_(\d{4}-\d{2})\.csv$/i.exec(f.name)?.[1] ?? "";
  return month(a).localeCompare(month(b)) || a.name.localeCompare(b.name);
}

type Outcome = { added: number } | "skipped";

export function ImportPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const accounts = useQuery(accountsQuery);
  const cats = useQuery(categoriesQuery);
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<FileInfo | null>(null);
  const [needs, setNeeds] = useState<NeedsColumns | null>(null);
  const [cols, setCols] = useState<Record<string, number | null>>({});
  const [account, setAccount] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [choices, setChoices] = useState<Record<number, number | null>>({});
  const [always, setAlways] = useState<Set<number>>(new Set());
  const [lastChosen, setLastChosen] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "need" | "transfers" | "bills">("need");
  const [done, setDone] = useState<Done | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<File[]>([]);
  const [pos, setPos] = useState(0);
  const [outcomes, setOutcomes] = useState<Record<number, Outcome>>({});
  const input = useRef<HTMLInputElement>(null);

  // Everything about the file in hand, cleared before the next one.
  const resetFile = () => {
    setInfo(null);
    setNeeds(null);
    setCols({});
    setAccount(null);
    setAnalysis(null);
    setChoices({});
    setAlways(new Set());
    setLastChosen(null);
    setFilter("need");
    setDone(null);
    setError(null);
    setStep(1);
  };

  const start = (list: FileList | File[] | null | undefined) => {
    const files = [...(list ?? [])].filter((f) => /\.csv$/i.test(f.name) || f.type === "text/csv").sort(byMonth);
    if (!files.length) return setError("Choose CSV files: statements export as .csv.");
    resetFile();
    setQueue(files);
    setPos(0);
    setOutcomes({});
    open(files[0]);
  };

  const goTo = (i: number) => {
    resetFile();
    setPos(i);
    open(queue[i]);
  };
  const skip = () => {
    setOutcomes((o) => ({ ...o, [pos]: "skipped" }));
    if (pos + 1 < queue.length) goTo(pos + 1);
  };

  const open = async (f: File, columns?: Record<string, number | null>) => {
    setError(null);
    setBusy(true);
    setFile(f);
    try {
      const params = columns ? { columns: JSON.stringify(columns) } : undefined;
      const r = await apiUpload<FileInfo | NeedsColumns>("imports", f, params);
      if ("needs_columns" in r) {
        setNeeds(r);
        setInfo(null);
        setCols({ date: 0, description: 1, debit: null, credit: null, amount: 2, balance: null });
      } else {
        setNeeds(null);
        setInfo(r);
        const acct = r.account_id;
        setAccount(acct);
        if (acct) await analyse(r.token, acct);
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const analyse = async (token: string, acct: number) => {
    setError(null);
    try {
      setAnalysis(await apiSend<Analysis>("POST", `imports/${token}/analyse`, { account_id: acct }));
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const commit = useMutation({
    mutationFn: () =>
      apiSend<Done>("POST", `imports/${analysis!.token}/commit`, {
        account_id: analysis!.account_id,
        categories: choices,
        always: [...always],
      }),
    onSuccess: (d) => {
      setDone(d);
      setOutcomes((o) => ({ ...o, [pos]: { added: d.added + d.merged } }));
      setStep(3);
      refresh(qc);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const banks = (accounts.data?.accounts ?? []).filter((a) => a.kind === "bank");
  const acct = banks.find((a) => a.id === account);
  const categories = cats.data?.categories ?? [];

  return (
    <div className="screen flex flex-col gap-4">
      <PageHead
        over={
          <>
            <Link to="/accounts" className="text-ink-3 no-underline hover:text-ink">
              ACCOUNTS
            </Link>{" "}
            › IMPORT A STATEMENT
            {queue.length > 1 ? ` · FILE ${pos + 1} OF ${queue.length}` : ""}
            {step === 2 && acct && analysis ? ` · ${acct.name.toUpperCase()} · ${analysis.counts.new} NEW` : ""}
          </>
        }
        title={step === 1 ? "Import a statement" : step === 2 ? "Check the categories" : "Imported"}
        actions={<Steps step={step} />}
      />
      {error && <ErrorText>{error}</ErrorText>}
      {queue.length > 1 && <Queue files={queue} pos={pos} outcomes={outcomes} />}
      {step === 1 && (
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex min-w-0 flex-[1.6_1_560px] flex-col gap-4">
            <Tile i={0} aria-label="File">
              {!info && !needs ? (
                <button
                  type="button"
                  onClick={() => input.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    start(e.dataTransfer.files);
                  }}
                  className="press flex min-h-[180px] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-page text-ink"
                >
                  <b>{busy ? "Reading…" : "Drop statement CSVs, or click to choose"}</b>
                  <span className="text-ink-3">
                    One or several at once. uBank files are recognised by name: account and month
                  </span>
                </button>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{file?.name}</div>
                    {info && (
                      <div className="mono text-xs text-ink-3">
                        {info.rows} ROWS
                        {info.first_date && info.last_date
                          ? ` · ${longDate(info.first_date).toUpperCase()} – ${longDate(info.last_date).toUpperCase()}`
                          : ""}
                        {info.last4 && info.month
                          ? ` · ACCOUNT ••${info.last4} AND MONTH (${monthYear(info.month).toUpperCase()}) READ FROM THE NAME`
                          : ""}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {queue.length > 1 && pos + 1 < queue.length && <Button onClick={skip}>Skip this file</Button>}
                    <Button onClick={() => input.current?.click()}>
                      {queue.length > 1 ? "Choose different files" : "Choose a different file"}
                    </Button>
                  </div>
                </div>
              )}
              <input
                ref={input}
                type="file"
                accept=".csv,text/csv"
                multiple
                className="hidden"
                onChange={(e) => {
                  start(e.target.files);
                  e.target.value = "";
                }}
              />
              {info && (
                <>
                  <div className="tt mt-2">Which account is this statement from?</div>
                  <Choice
                    label="Account"
                    value={account}
                    tone={acct?.colour ?? "teal"}
                    onChange={(id) => {
                      setAccount(id);
                      analyse(info.token, id);
                    }}
                    options={banks.map((a) => ({
                      value: a.id,
                      label: (
                        <span className="flex items-center gap-2">
                          <Dot c={a.colour} />
                          {a.name}
                        </span>
                      ),
                    }))}
                  />
                </>
              )}
            </Tile>
            {needs && (
              <Tile i={1} aria-labelledby="im-map">
                <div className="tt">
                  <span id="im-map">Columns</span>
                  <Pill tone="warn">NEW FORMAT</Pill>
                </div>
                <div className="text-ink-2">
                  This bank's file is new here. Say which column is which, once: it's remembered for files with the same
                  header.
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {FIELDS.map(([key, label]) => (
                    <label key={key} className="text-xs text-ink-3">
                      {label}
                      <Select
                        value={cols[key] ?? ""}
                        onChange={(e) =>
                          setCols((c) => ({ ...c, [key]: e.target.value === "" ? null : Number(e.target.value) }))
                        }
                      >
                        <option value="">—</option>
                        {needs.header.map((h, i) => (
                          <option key={i} value={i}>
                            {h}
                          </option>
                        ))}
                      </Select>
                    </label>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <table className="mono w-full border-collapse text-xs">
                    <thead>
                      <tr>
                        {needs.header.map((h) => (
                          <th key={h} className="border-b border-line px-2 py-1.5 text-left text-ink-3">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {needs.sample.map((r, i) => (
                        <tr key={i}>
                          {r.map((c, j) => (
                            <td key={j} className="border-b border-line px-2 py-1.5 whitespace-nowrap">
                              {c}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <Button
                    primary
                    onClick={() => file && open(file, cols)}
                    disabled={cols.date == null || cols.description == null}
                  >
                    Use these columns
                  </Button>
                </div>
              </Tile>
            )}
            {info && (
              <Tile i={1} aria-labelledby="im-cols">
                <div className="tt">
                  <span id="im-cols">Columns</span>
                  <span className="mono tracking-normal">
                    {info.bank === "ubank" ? "UBANK FORMAT · RECOGNISED" : "YOUR SAVED FORMAT · RECOGNISED"}
                  </span>
                </div>
                <div className="text-ink-2">
                  {info.bank === "ubank"
                    ? "Matched from a saved bank format. Another bank's file asks you to match the columns once, then it's remembered."
                    : "Matched from the columns you chose for this bank's files."}
                </div>
                <div className="overflow-x-auto">
                  <table className="mono w-full min-w-[560px] border-collapse text-[13px]">
                    <thead>
                      <tr className="text-left text-xs text-ink-3">
                        <th className="border-b border-line px-2.5 py-2">Date</th>
                        <th className="border-b border-line px-2.5 py-2">Description</th>
                        <th className="border-b border-line px-2.5 py-2 text-right">Money out</th>
                        <th className="border-b border-line px-2.5 py-2 text-right">Money in</th>
                        <th className="border-b border-line px-2.5 py-2 text-right">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {info.sample.map((r) => (
                        <tr key={r.index}>
                          <td className="border-b border-line px-2.5 py-2 whitespace-nowrap">{longDate(r.date)}</td>
                          <td className="border-b border-line px-2.5 py-2">{r.description}</td>
                          <td className="border-b border-line px-2.5 py-2 text-right">
                            {r.amount < 0 ? money(-r.amount, { cents: true }) : <span className="text-ink-3">—</span>}
                          </td>
                          <td className="border-b border-line px-2.5 py-2 text-right">
                            {r.amount > 0 ? money(r.amount, { cents: true }) : <span className="text-ink-3">—</span>}
                          </td>
                          <td className="border-b border-line px-2.5 py-2 text-right">
                            {r.balance != null ? money(r.balance, { cents: true, sign: true }) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-wrap gap-2 text-[13px]">
                  <Check label="Dates">
                    {info.date_format === "%d %b %Y" ? "02 Oct 2026 style" : info.date_format}
                  </Check>
                  <Check label="Amounts">
                    {info.columns.amount != null
                      ? "One signed column"
                      : "Separate out and in columns, $ and commas stripped"}
                  </Check>
                  <Check label="Balance" warn={info.balance_ok === false}>
                    {info.balance_ok == null
                      ? "No balance column"
                      : info.balance_ok
                        ? "Signed, checked row by row"
                        : `${info.balance_problems.length} rows don't follow on`}
                  </Check>
                </div>
                {info.bank === "ubank" && (
                  <div className="text-ink-2">
                    uBank labels every transfer just "Transfer", so transfers are matched to your rules by amount and
                    date instead.
                  </div>
                )}
              </Tile>
            )}
          </div>
          <Tile as="aside" i={2} className="min-w-0 flex-[1_1_320px]" aria-labelledby="im-check">
            <div className="tt">
              <span id="im-check">Before you continue</span>
            </div>
            {analysis ? (
              <>
                <div>
                  <Stat label="Rows in the file" value={analysis.counts.rows} />
                  <Stat label="Already imported" value={`${analysis.counts.duplicates} · skipped`} muted />
                  <Stat label="You added by hand" value={`${analysis.counts.merge} · will merge`} />
                  <Stat label="New transactions" value={analysis.counts.new - analysis.counts.merge} />
                  <Stat label="Closing balance in file" value={money(info?.closing, { cents: true })} />
                </div>
                {analysis.replaced.slice(0, 1).map((r) => (
                  <div key={r.id} className="rounded-lg bg-raised px-3 py-2.5 text-[13px]">
                    Your rough check-in on {capsDate(r.date).replace(/^0/, "")} said{" "}
                    <b className="mono">~{money(r.rough)}</b>. The statement says{" "}
                    <b className="mono">{money(r.exact, { cents: true })}</b> that day, so the history will use the
                    exact figure.
                  </div>
                ))}
              </>
            ) : (
              <div className="text-ink-2">{info ? "Choose the account it's from." : "Choose a statement first."}</div>
            )}
            <div className="text-[13px] text-ink-3">
              The file is read on your home server and never leaves it. Duplicates are spotted by date, amount and
              description, so overlapping exports are fine.
            </div>
            <div className="flex gap-2">
              <Button onClick={() => navigate({ to: "/accounts" })}>Cancel</Button>
              <Button primary disabled={!analysis} onClick={() => setStep(2)}>
                Review {analysis ? analysis.counts.new : ""}
              </Button>
            </div>
          </Tile>
        </div>
      )}
      {step === 2 && analysis && (
        <Review
          analysis={analysis}
          categories={categories}
          choices={choices}
          setChoice={(i, c) => {
            setChoices((s) => ({ ...s, [i]: c }));
            setLastChosen(i);
          }}
          always={always}
          setAlways={setAlways}
          lastChosen={lastChosen}
          filter={filter}
          setFilter={setFilter}
          onBack={() => setStep(1)}
          onImport={() => commit.mutate()}
          busy={commit.isPending}
        />
      )}
      {step === 3 && done && analysis && (
        <DoneView
          done={done}
          analysis={analysis}
          account={acct}
          next={pos + 1 < queue.length ? { name: queue[pos + 1].name, n: pos + 2, of: queue.length } : null}
          onNext={() => goTo(pos + 1)}
          total={
            queue.length > 1 && pos + 1 >= queue.length
              ? {
                  files: Object.values(outcomes).filter((o) => o !== "skipped").length,
                  added: Object.values(outcomes).reduce((s, o) => s + (o === "skipped" ? 0 : o.added), 0),
                  skipped: Object.values(outcomes).filter((o) => o === "skipped").length,
                }
              : null
          }
          onOpening={async () => {
            try {
              const r = await apiSend<{ amount: number; date: string }>(
                "POST",
                `accounts/${analysis.account_id}/opening`,
                {
                  amount: done.gap,
                },
              );
              setDone({ ...done, opening: r, gap: 0 });
              refresh(qc);
            } catch (e) {
              setError(errorMessage(e));
            }
          }}
        />
      )}
    </div>
  );
}

function Steps({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2 text-[13px]" aria-label="Import progress">
      {["Upload and match", "Review", "Done"].map((s, i) => (
        <span key={s} className="flex items-center gap-2" aria-current={step === i + 1 ? "step" : undefined}>
          {i > 0 && <span className="h-px w-6 bg-line" />}
          <span
            className={cn(
              "mono flex size-6 items-center justify-center rounded-full border text-xs",
              step > i ? "border-teal bg-teal text-page" : "border-line text-ink-3",
            )}
          >
            {step > i + 1 ? "✓" : i + 1}
          </span>
          <span className={step === i + 1 ? "text-ink" : "text-ink-3"}>{s}</span>
        </span>
      ))}
    </div>
  );
}

function Check({ label, children, warn }: { label: string; children: React.ReactNode; warn?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-md border px-2.5 py-1.5",
        warn ? "border-warn/50 bg-warn/10" : "border-line bg-raised",
      )}
    >
      <span className="mono text-xs text-ink-3">{label.toUpperCase()}</span>
      {children}
    </span>
  );
}

function Stat({ label, value, muted }: { label: string; value: React.ReactNode; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between border-t border-line py-2.5 first:border-t-0">
      <span className="text-ink-2">{label}</span>
      <span className={cn("mono", muted && "text-ink-3")}>{value}</span>
    </div>
  );
}

const WHY: Record<string, string> = {
  merged: "MERGED WITH YOUR ENTRY",
  transfer: "BETWEEN YOUR ACCOUNTS",
  pay: "MATCHED BY AMOUNT · PAY",
  interest: "INTEREST",
  bill: "MATCHED BILL",
  rule: "YOUR RULE",
  unknown: "COULD BE ANYTHING",
};

function Review({
  analysis,
  categories,
  choices,
  setChoice,
  always,
  setAlways,
  lastChosen,
  filter,
  setFilter,
  onBack,
  onImport,
  busy,
}: {
  analysis: Analysis;
  categories: Category[];
  choices: Record<number, number | null>;
  setChoice: (index: number, c: number | null) => void;
  always: Set<number>;
  setAlways: (s: Set<number>) => void;
  lastChosen: number | null;
  filter: string;
  setFilter: (f: "all" | "need" | "transfers" | "bills") => void;
  onBack: () => void;
  onImport: () => void;
  busy: boolean;
}) {
  const rows = analysis.rows.filter((r) => r.status !== "duplicate");
  const need = rows.filter((r) => !r.sure);
  const shown = useMemo(() => {
    if (filter === "need") return need;
    if (filter === "transfers") return rows.filter((r) => r.why === "transfer");
    if (filter === "bills") return rows.filter((r) => r.why === "bill");
    return rows;
  }, [filter, rows, need]);
  const name = (id: number | null | undefined) => categories.find((c) => c.id === id)?.name;
  const chosenRow = lastChosen != null ? rows.find((r) => r.index === lastChosen) : null;
  const left = need.filter((r) => choices[r.index] == null && r.suggest_id == null).length;
  return (
    <>
      <div className="flex justify-end gap-2">
        <Button onClick={onBack}>Back</Button>
        <Button primary onClick={onImport} disabled={busy}>
          {busy ? "Importing…" : `Import ${analysis.counts.new} transactions`}
        </Button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        <Tile i={0}>
          <div className="tt">Sorted automatically</div>
          <div className="mono text-[26px] font-semibold">{analysis.counts.sorted}</div>
        </Tile>
        <Tile i={1}>
          <div className="tt">Need you</div>
          <div className="mono text-[26px] font-semibold text-warn">{analysis.counts.need}</div>
        </Tile>
        <Tile i={2}>
          <div className="tt">Between your accounts</div>
          <div className="mono text-[26px] font-semibold">{analysis.counts.transfers}</div>
          <div className="text-xs text-ink-3">not counted as spending</div>
        </Tile>
        <Tile i={3}>
          <div className="tt">Merged with yours</div>
          <div className="mono text-[26px] font-semibold">{analysis.counts.merge}</div>
          <div className="text-xs text-ink-3">added by hand, now matched</div>
        </Tile>
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <Tile i={4} className="min-w-0 flex-[1.6_1_560px]" aria-labelledby="rv-list">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span id="rv-list" className="tt">
              Transactions
            </span>
            <div role="group" aria-label="Show" className="inline-flex rounded-lg border border-line bg-tile p-[3px]">
              {(
                [
                  ["all", `All ${rows.length}`],
                  ["need", `Need you ${need.length}`],
                  ["transfers", `Transfers ${analysis.counts.transfers}`],
                  ["bills", `Bills ${analysis.counts.bills}`],
                ] as const
              ).map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={filter === v}
                  onClick={() => setFilter(v)}
                  className={cn(
                    "press min-h-8 cursor-pointer rounded-md border-0 px-3 text-[13px]",
                    filter === v ? "bg-raised text-ink" : "bg-transparent text-ink-3",
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          {filter === "need" && (
            <div className="text-[13px] text-ink-2">
              <b className="mono">{left}</b> left to sort. A suggestion is taken unless you choose another.
            </div>
          )}
          <div>
            <div className="grid grid-cols-[64px_minmax(0,1fr)_90px_150px] gap-3 py-2 text-xs text-ink-3">
              <span>Date</span>
              <span>Description</span>
              <span className="text-right">Amount</span>
              <span>Category</span>
            </div>
            {shown.map((r, i) => {
              const chosen = choices[r.index];
              const current = chosen !== undefined ? chosen : (r.category_id ?? null);
              const why =
                r.why === "suggest"
                  ? `NEW · SUGGEST ${r.suggest?.toUpperCase()}`
                  : r.why === "transfer"
                    ? r.rule_kind
                      ? `MATCHED BY AMOUNT · ${r.rule_kind === "top_up" ? "MONTHLY TOP-UP" : r.rule_kind === "sweep" ? "SWEEP" : "PAYDAY"} RULE${r.differed ? ` · RULE SAID ${money(r.called_for)}` : ""}`
                      : "BETWEEN YOUR ACCOUNTS"
                    : r.why === "bill"
                      ? `MATCHED BILL · ${r.bill?.toUpperCase()}`
                      : r.status === "merge"
                        ? `${r.why === "merged" ? "" : WHY[r.why ?? "unknown"] + " · "}MERGED WITH YOUR ENTRY`
                        : WHY[r.why ?? "unknown"];
              return (
                <div
                  key={r.index}
                  className="rise grid grid-cols-[64px_minmax(0,1fr)_90px_150px] items-center gap-3 border-t border-line py-2.5 text-[13px]"
                  style={{ "--i": i } as CSSProperties}
                >
                  <span className="mono text-ink-3">{capsDate(r.date)}</span>
                  <span className="min-w-0">
                    <span className="mono block truncate">{r.description}</span>
                    <span className={cn("mono block text-[11px]", r.differed ? "text-warn" : "text-ink-3")}>{why}</span>
                  </span>
                  <span className="mono text-right" style={{ color: r.amount > 0 ? "var(--color-good)" : undefined }}>
                    {amount(r.amount, { cents: true, sign: true })}
                  </span>
                  {r.why === "transfer" ? (
                    <span className="inline-flex min-h-8 items-center rounded-md border border-offset/40 bg-offset/10 px-2.5 text-xs">
                      Transfer
                    </span>
                  ) : (
                    <select
                      aria-label={`Category for ${r.description}`}
                      value={current ?? (r.suggest_id != null ? `s${r.suggest_id}` : "")}
                      onChange={(e) =>
                        setChoice(r.index, e.target.value === "" ? null : Number(e.target.value.replace(/^s/, "")))
                      }
                      className={cn(
                        "min-h-8 w-full cursor-pointer rounded-md border bg-raised px-2 text-xs text-ink",
                        current == null && r.suggest_id == null
                          ? "border-warn bg-warn/10"
                          : current == null
                            ? "border-line"
                            : "border-good/40 bg-good/8",
                      )}
                    >
                      <option value="">Choose</option>
                      {r.suggest_id != null && current == null && (
                        <option value={`s${r.suggest_id}`}>Suggest: {r.suggest}</option>
                      )}
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
            {!shown.length && <div className="border-t border-line py-4 text-ink-3">Nothing here.</div>}
          </div>
        </Tile>
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <Tile as="aside" i={5} aria-labelledby="rv-rec">
            <div className="tt">
              <span id="rv-rec">Reconcile with what you entered</span>
            </div>
            {analysis.replaced.slice(0, 1).map((r) => (
              <Rec
                key={r.id}
                title={`Check-in ${capsDate(r.date).replace(/^0/, "")}`}
                value={
                  <>
                    <span className="text-ink-3">~{amount(r.rough)}</span> → {amount(r.exact, { cents: true })}
                  </>
                }
              >
                Rough figure replaced with the statement's
              </Rec>
            ))}
            {rows
              .filter((r) => r.status === "merge")
              .map((r) => (
                <Rec
                  key={r.index}
                  title={`${r.hand_description}, added ${capsDate(r.hand_date ?? r.date).replace(/^0/, "")}`}
                  value={amount(-r.amount, { cents: true })}
                >
                  Same amount as a statement row · merged{r.note ? ", your note kept" : ""}
                </Rec>
              ))}
            {analysis.kept_cash.map((c) => (
              <Rec
                key={c.id}
                title={`${c.description}, ${capsDate(c.date).replace(/^0/, "")}`}
                value={amount(-c.amount, { cents: true })}
              >
                No match in the statement · kept as cash
              </Rec>
            ))}
            {!analysis.replaced.length && !analysis.counts.merge && !analysis.kept_cash.length && (
              <div className="text-ink-3">Nothing you entered by hand overlaps this statement.</div>
            )}
          </Tile>
          {chosenRow && choices[chosenRow.index] != null && (
            <Tile as="aside" i={6} aria-labelledby="rv-learn" className="reveal">
              <div className="tt">
                <span id="rv-learn">Remember this?</span>
              </div>
              <div>
                You put <b className="mono">{chosenRow.description}</b> in <b>{name(choices[chosenRow.index])}</b>.
              </div>
              <div className="flex items-center justify-between gap-3">
                <span id="rv-always">Always use {name(choices[chosenRow.index])} for this</span>
                <Switch
                  labelledBy="rv-always"
                  checked={always.has(chosenRow.index)}
                  onChange={(on) => {
                    const s = new Set(always);
                    if (on) s.add(chosenRow.index);
                    else s.delete(chosenRow.index);
                    setAlways(s);
                  }}
                />
              </div>
              <div className="text-xs text-ink-3">
                Also applies to earlier transactions from it with no category. Rules live in Spending › Categories.
              </div>
            </Tile>
          )}
          <Tile as="aside" i={7} aria-labelledby="rv-sum">
            <div className="tt">
              <span id="rv-sum">This import, by category</span>
              <span className="mono tracking-normal">{money(analysis.by_category.reduce((s, [, v]) => s + v, 0))}</span>
            </div>
            {analysis.by_category.map(([n, v]) => (
              <div key={n} className="flex justify-between border-t border-line py-2 first:border-t-0">
                <span>{n}</span>
                <span className="mono">{money(v)}</span>
              </div>
            ))}
            <div className="text-xs text-ink-3">Transfers between your accounts aren't counted as spending.</div>
          </Tile>
        </div>
      </div>
    </>
  );
}

function Rec({ title, value, children }: { title: string; value: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border-t border-line py-2 first:border-t-0">
      <div className="flex justify-between gap-2 text-[13px]">
        <b className="font-medium">{title}</b>
        <span className="mono">{value}</span>
      </div>
      <div className="text-xs text-ink-3">{children}</div>
    </div>
  );
}

/** The files chosen together: done (with how many came in), skipped, the one in hand, and those still to come. */
function Queue({ files, pos, outcomes }: { files: File[]; pos: number; outcomes: Record<number, Outcome> }) {
  return (
    <ol aria-label="Files" className="m-0 flex list-none flex-wrap gap-2 p-0">
      {files.map((f, i) => {
        const o = outcomes[i];
        const now = i === pos;
        return (
          <li
            key={`${f.name}-${i}`}
            aria-current={now ? "step" : undefined}
            className={cn(
              "rise flex min-h-9 items-center gap-2 rounded-full border px-3 text-[13px] transition-colors duration-200",
              now ? "border-teal bg-teal/10 text-ink" : "border-line bg-tile",
              o === "skipped" ? "text-ink-3 line-through" : o ? "text-ink-2" : !now && "text-ink-3",
            )}
            style={{ "--i": i } as CSSProperties}
          >
            <span
              className={cn(
                "mono flex size-5 items-center justify-center rounded-full text-[11px]",
                o && o !== "skipped"
                  ? "bg-teal text-page"
                  : now
                    ? "border border-teal text-teal"
                    : "border border-line",
              )}
              aria-hidden
            >
              {o && o !== "skipped" ? "✓" : i + 1}
            </span>
            <span className="max-w-[240px] truncate">{f.name}</span>
            {o && o !== "skipped" && <span className="mono text-xs text-ink-3">+{o.added}</span>}
            {o === "skipped" && <span className="sr-only">skipped</span>}
          </li>
        );
      })}
    </ol>
  );
}

function DoneView({
  done,
  analysis,
  onOpening,
  account,
  next,
  onNext,
  total,
}: {
  done: Done;
  analysis: Analysis;
  onOpening: () => void;
  account?: Account;
  next: { name: string; n: number; of: number } | null;
  onNext: () => void;
  total: { files: number; added: number; skipped: number } | null;
}) {
  return (
    <Tile i={0} className="max-w-[640px] items-start gap-3">
      <SuccessTick />
      <div className="rise text-xl font-semibold" style={{ "--i": 1 } as CSSProperties}>
        {done.added + done.merged} {done.added + done.merged === 1 ? "transaction" : "transactions"} imported
      </div>
      <div className="rise text-ink-2" style={{ "--i": 2 } as CSSProperties}>
        {done.skipped ? `${done.skipped} already here were skipped. ` : ""}
        {done.merged ? `${done.merged} you'd added by hand were merged. ` : ""}
        {done.kept_cash ? `${done.kept_cash} with no match were kept as cash. ` : ""}
        {done.learned ? `${done.learned} earlier transactions were sorted by what you chose to remember.` : ""}
      </div>
      {done.gap ? (
        <div className="reveal rounded-lg bg-raised px-3.5 py-3 text-[13px]">
          {account?.name ?? "The account"} now has history from{" "}
          {analysis.file.first_date ? longDate(analysis.file.first_date) : "the statement"}. Its transactions add up to{" "}
          <b className="mono">{money(done.ledger_at_close, { cents: true })}</b> at the statement's end,{" "}
          {money(Math.abs(done.gap), { cents: true })} {done.gap > 0 ? "less" : "more"} than its closing balance.{" "}
          {analysis.earliest
            ? "An opening balance, dated the day before the history starts, makes them match."
            : "Set the exact balance in Accounts to add an adjustment."}
          {analysis.earliest && (
            <div className="mt-2">
              <Button primary small onClick={onOpening}>
                Add an opening balance of {money(done.gap, { cents: true })}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="text-[13px] text-good">The transactions add up to the statement's closing balance.</div>
      )}
      {done.opening && (
        <div className="text-[13px] text-ink-2">
          Opening balance of {money(done.opening.amount, { cents: true })} added, dated {longDate(done.opening.date)}.
        </div>
      )}
      {total && (
        <div className="reveal rounded-lg border border-teal/40 bg-teal/5 px-3.5 py-3 text-[13px]">
          All done: <b>{total.added}</b> transactions from {total.files} {total.files === 1 ? "file" : "files"}
          {total.skipped ? `, ${total.skipped} skipped` : ""}.
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Link
          to="/accounts"
          className="press inline-flex min-h-10 items-center rounded-lg border border-line px-3.5 text-[13px] text-ink no-underline hover:bg-raised"
        >
          See the account
        </Link>
        {next ? (
          <Button primary onClick={onNext}>
            Next: {next.name} ({next.n} of {next.of})
          </Button>
        ) : (
          <a
            href="/import"
            className="press inline-flex min-h-10 items-center rounded-lg border border-teal bg-teal px-3.5 text-[13px] font-semibold text-page no-underline"
          >
            Import more
          </a>
        )}
      </div>
    </Tile>
  );
}
