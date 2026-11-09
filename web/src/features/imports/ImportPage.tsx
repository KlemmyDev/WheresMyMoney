/**
 * Importing statements (designs: Import1 "upload and match", Import2 "review and categorise").
 *
 * 1. Drop one CSV or several. uBank's are recognised by name (account and month) and header, and so is uBank's longer
 *    export of a date range (its rows name the account, which is remembered once it's imported); another bank's
 *    columns are matched once. The aside says what it'll do before anything's written: rows, duplicates skipped, hand entries
 *    merged, new ones, the closing balance, and a rough check-in it'll replace.
 * 2. Check the categories, for every file at once: what was sorted automatically, what needs you, transfers between
 *    accounts and merges. Choosing a category can be remembered for the merchant.
 * 3. Done: the success tick, and for each account whether the ledger now matches the statement (an opening balance
 *    fixes it if not).
 *
 * Several files are read together and reviewed as one list, then imported with one button: one after another, oldest
 * month first (read from uBank's file names, so each account's history builds in order), each to its own account.
 * Rows two files share are shown once, and the server checks each file again as it's imported so they aren't doubled.
 */
import { Chip, I } from "~/features/common/icons";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { useRef, useState, type CSSProperties, type ReactNode } from "react";
import { apiSend, apiUpload, errorMessage } from "~/features/common/api";
import { amount, capsDate, longDate, money, monthYear } from "~/features/common/format";
import { accountsQuery, categoriesQuery, refresh } from "~/features/common/queries";
import type { Account, Category } from "~/features/common/types";
import { CategoryPicker } from "~/features/common/CategoryPicker";
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
  account_names?: string[];
  zero_rows?: number;
  sample: { index: number; date: string; description: string; amount: number; balance: number | null }[];
};

type NeedsColumns = { needs_columns: true; header: string[]; sample: string[][]; filename: string };

type ImportRow = {
  index: number;
  date: string;
  description: string;
  amount: number;
  balance: number | null;
  status: "duplicate" | "new" | "merge" | "note";
  /** A row of the home loan's statement: what's owed went up (interest, a drawdown) or down (a repayment). */
  loan?: boolean;
  merchant?: string;
  merge_id?: number;
  note?: string;
  hand_description?: string;
  hand_date?: string;
  category_id?: number | null;
  category?: string | null;
  why?:
    | "merged"
    | "transfer"
    | "pay"
    | "interest"
    | "bill"
    | "rule"
    | "suggest"
    | "unknown"
    | "note"
    | "drawdown"
    | "repayment"
    | "fee"
    | "loan";
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
  loan: LoanFound | null;
};

/** The rate and repayment changes a loan's statement shows, and what the loan's will be once it's in. */
type LoanChange = { date: string; field: "rate" | "repayment"; value: number; was: number | null; new: boolean };
type LoanFound = {
  changes: LoanChange[];
  rate_bp: number | null;
  repayment: number | null;
  was_rate_bp: number | null;
  was_repayment: number | null;
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
  loan: { rate_bp: number | null; repayment: number | null; changes: number } | null;
  /** Bills the ledger now suggests, and bills whose price moved, after this import. */
  spotted?: { suggestions: number; updates: number };
};

/** One chosen file, from reading it to importing it. */
type Item = {
  id: number;
  file: File;
  info: FileInfo | null;
  needs: NeedsColumns | null;
  account: number | null;
  analysis: Analysis | null;
  error: string | null;
  busy: boolean;
  done: Done | null;
};

/** A statement row in the one review: `key` is the file's id and the row's index in it. */
type BatchRow = ImportRow & { key: string; item: number; account: number };

const keyOf = (item: number, index: number) => `${item}:${index}`;

const FIELDS = [
  ["date", "Date"],
  ["description", "Description"],
  ["debit", "Money out"],
  ["credit", "Money in"],
  ["amount", "Amount (signed)"],
  ["balance", "Balance"],
] as const;

const FIRST_GUESS = { date: 0, description: 1, debit: null, credit: null, amount: 2, balance: null };

/** uBank names files `<nickname>-<last4>_<YYYY-MM>.csv`: oldest month first, then by name. */
function byMonth(a: File, b: File): number {
  const month = (f: File) => /_(\d{4}-\d{2})\.csv$/i.exec(f.name)?.[1] ?? "";
  return month(a).localeCompare(month(b)) || a.name.localeCompare(b.name);
}

/** Rows a file shares with an earlier one in the same batch (for the same account): the earlier one brings them in. */
function overlaps(items: Item[]): Set<string> {
  const earlier = new Map<string, number>();
  const out = new Set<string>();
  for (const x of items) {
    if (!x.analysis) continue;
    const mine = new Map<string, number>();
    for (const r of x.analysis.rows) {
      if (r.status === "duplicate") continue;
      const k = `${x.analysis.account_id}|${r.date}|${r.amount}|${r.description.split(/\s+/).join(" ").toUpperCase()}`;
      const n = (mine.get(k) ?? 0) + 1;
      mine.set(k, n);
      if (n <= (earlier.get(k) ?? 0)) out.add(keyOf(x.id, r.index));
    }
    for (const [k, n] of mine) earlier.set(k, (earlier.get(k) ?? 0) + n);
  }
  return out;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function ImportPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const accounts = useQuery(accountsQuery);
  const cats = useQuery(categoriesQuery);
  const [items, setItems] = useState<Item[]>([]);
  const [cols, setCols] = useState<Record<string, number | null>>(FIRST_GUESS);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [choices, setChoices] = useState<Record<string, number | null>>({});
  const [always, setAlways] = useState<Set<string>>(new Set());
  const [lastChosen, setLastChosen] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "need" | "transfers" | "bills">("need");
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [openings, setOpenings] = useState<Record<number, { amount: number; date: string }>>({});
  const nextId = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  const patch = (id: number, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)));

  const analyse = async (id: number, token: string, acct: number) => {
    patch(id, { account: acct, analysis: null, error: null, busy: true });
    try {
      patch(id, { analysis: await apiSend<Analysis>("POST", `imports/${token}/analyse`, { account_id: acct }) });
    } catch (e) {
      patch(id, { error: errorMessage(e) });
    } finally {
      patch(id, { busy: false });
    }
  };

  const open = async (id: number, f: File, columns?: Record<string, number | null>) => {
    patch(id, { busy: true, error: null });
    try {
      const params = columns ? { columns: JSON.stringify(columns) } : undefined;
      const r = await apiUpload<FileInfo | NeedsColumns>("imports", f, params);
      if ("needs_columns" in r) {
        patch(id, { needs: r, info: null, busy: false });
      } else {
        patch(id, { needs: null, info: r, account: r.account_id, busy: false });
        if (r.account_id) await analyse(id, r.token, r.account_id);
      }
    } catch (e) {
      patch(id, { error: errorMessage(e), busy: false });
    }
  };

  const start = async (list: FileList | File[] | null | undefined) => {
    const files = [...(list ?? [])].filter((f) => /\.csv$/i.test(f.name) || f.type === "text/csv").sort(byMonth);
    if (!files.length) return setError("Choose CSV files: statements export as .csv.");
    const made = files.map((file): Item => ({
      id: nextId.current++,
      file,
      info: null,
      needs: null,
      account: null,
      analysis: null,
      error: null,
      busy: true,
      done: null,
    }));
    setItems(made);
    setCols(FIRST_GUESS);
    setChoices({});
    setAlways(new Set());
    setLastChosen(null);
    setFilter("need");
    setError(null);
    setOpenings({});
    setStep(1);
    for (const x of made) await open(x.id, x.file);
  };

  // The column match applies to every file with the same header.
  const mapping = items.find((x) => x.needs);
  const useColumns = async () => {
    if (!mapping?.needs) return;
    const header = JSON.stringify(mapping.needs.header);
    for (const x of items.filter((y) => y.needs && JSON.stringify(y.needs.header) === header))
      await open(x.id, x.file, cols);
  };

  const remove = (id: number) => setItems((xs) => xs.filter((x) => x.id !== id));

  // Every account a statement can be from, the home loan last.
  const banks = [...(accounts.data?.accounts ?? []), ...(accounts.data?.loan ? [accounts.data.loan] : [])];
  const bank = (id: number | null | undefined) => banks.find((a) => a.id === id);
  const categories = cats.data?.categories ?? [];
  const multi = items.length > 1;
  const one = items.length === 1 ? items[0] : null;

  const shared = overlaps(items);
  const toImport = items.filter((x) => !x.done);
  const ready = toImport.length > 0 && toImport.every((x) => x.analysis && !x.busy);
  const analysed = items.filter((x): x is Item & { analysis: Analysis } => !!x.analysis);
  const sum = (f: (a: Analysis) => number) => analysed.reduce((s, x) => s + f(x.analysis), 0);
  const batchNew = sum((a) => a.counts.new) - shared.size;
  const inAccounts = banks.filter((a) => analysed.some((x) => x.analysis.account_id === a.id));
  const replaced = analysed.flatMap((x) => x.analysis.replaced.map((r) => ({ ...r, account: x.analysis.account_id })));
  const keptCash = analysed.flatMap((x) => x.analysis.kept_cash.map((c) => ({ ...c, account: x.analysis.account_id })));
  const rows: BatchRow[] = toImport
    .flatMap((x) =>
      x.analysis
        ? x.analysis.rows
            .filter((r) => r.status !== "duplicate" && r.status !== "note" && !shared.has(keyOf(x.id, r.index)))
            .map((r) => ({ ...r, key: keyOf(x.id, r.index), item: x.id, account: x.analysis!.account_id }))
        : [],
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  const waiting = (() => {
    const reading = items.filter((x) => x.busy).length;
    const account = items.filter((x) => x.info && !x.account && !x.busy).length;
    const columns = items.filter((x) => x.needs && !x.busy).length;
    const failed = items.filter((x) => x.error && !x.busy).length;
    const say = [
      reading && `Reading ${multi ? plural(reading, "file") : "the file"}…`,
      account &&
        (multi
          ? `${plural(account, "file")} need${account === 1 ? "s" : ""} an account.`
          : "Choose the account it's from."),
      columns &&
        (multi
          ? `${plural(columns, "file")} need${columns === 1 ? "s" : ""} its columns matched.`
          : "Match its columns."),
      failed &&
        (multi
          ? `${plural(failed, "file")} couldn't be read: leave ${failed === 1 ? "it" : "them"} out or choose again.`
          : ""),
    ].filter(Boolean);
    return say.join(" ");
  })();

  const importAll = async () => {
    setImporting(true);
    setError(null);
    for (const x of toImport) {
      if (!x.analysis) continue;
      const prefix = `${x.id}:`;
      const mine = Object.entries(choices).filter(([k]) => k.startsWith(prefix));
      try {
        const d = await apiSend<Done>("POST", `imports/${x.analysis.token}/commit`, {
          account_id: x.analysis.account_id,
          categories: Object.fromEntries(mine.map(([k, v]) => [k.slice(prefix.length), v])),
          always: [...always].filter((k) => k.startsWith(prefix)).map((k) => Number(k.slice(prefix.length))),
        });
        patch(x.id, { done: d });
      } catch (e) {
        setError(multi ? `${x.file.name}: ${errorMessage(e)} The files before it are in.` : errorMessage(e));
        setImporting(false);
        refresh(qc);
        return;
      }
    }
    setImporting(false);
    refresh(qc);
    setStep(3);
  };

  return (
    <div className="screen flex flex-col gap-4">
      <PageHead
        over={
          <>
            <Link to="/accounts" className="text-ink-3 no-underline hover:text-ink">
              ACCOUNTS
            </Link>{" "}
            › {multi ? "IMPORT STATEMENTS" : "IMPORT A STATEMENT"}
            {multi ? ` · ${items.length} FILES` : ""}
            {step === 2
              ? ` · ${inAccounts.length === 1 ? `${inAccounts[0].name.toUpperCase()} · ` : ""}${rows.length} NEW`
              : ""}
          </>
        }
        title={
          step === 1
            ? multi
              ? "Import statements"
              : "Import a statement"
            : step === 2
              ? "Check the categories"
              : "Imported"
        }
        actions={<Steps step={step} />}
      />
      {error && <ErrorText>{error}</ErrorText>}
      {step === 1 && (
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex min-w-0 flex-[1.6_1_560px] flex-col gap-4">
            <Tile i={0} aria-label="Files">
              {!items.length ? (
                <button
                  type="button"
                  onClick={() => input.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    start(e.dataTransfer.files);
                  }}
                  className="hatched press flex min-h-[300px] w-full cursor-pointer flex-col items-center justify-center gap-3.5 rounded-[22px] border-2 border-dashed border-line-2 p-7 text-center text-ink transition-colors duration-150 hover:border-teal hover:bg-teal/8"
                  style={{ ["--c" as string]: "color-mix(in srgb, var(--color-accent-fill) 18%, transparent)" }}
                >
                  <span aria-hidden className="flex items-end gap-2.5">
                    <Chip g={I.list} tone="spending" size="xl" className="-rotate-8" />
                    <Chip g={I.import} tone="grad" size="xl" className="-translate-y-2" />
                    <Chip g={I.list} tone="offset" size="xl" className="rotate-8" />
                  </span>
                  <b className="text-[20px] leading-[26px] font-semibold">Drop statement CSVs here</b>
                  <span className="max-w-[460px] text-[14px] text-ink-3">
                    One or several at once. uBank files are recognised by their name: the account's last four digits and
                    the month.
                  </span>
                  <span className="btn-primary pointer-events-none inline-flex min-h-[42px] items-center rounded-xl px-4 text-[14px] font-semibold">
                    Choose files
                  </span>
                </button>
              ) : (
                <>
                  {multi && (
                    <div className="tt">
                      <span>{items.length} files</span>
                      <span className="mono tracking-normal">OLDEST MONTH FIRST</span>
                    </div>
                  )}
                  <ul className="m-0 list-none p-0">
                    {items.map((x, i) => (
                      <FileRow
                        key={x.id}
                        i={i}
                        item={x}
                        single={!multi}
                        shared={x.analysis ? x.analysis.rows.filter((r) => shared.has(keyOf(x.id, r.index))).length : 0}
                        banks={banks}
                        onAccount={(id) => x.info && analyse(x.id, x.info.token, id)}
                        onRemove={() => remove(x.id)}
                        action={
                          !multi && <Button onClick={() => input.current?.click()}>Choose a different file</Button>
                        }
                      />
                    ))}
                  </ul>
                  {multi && (
                    <div>
                      <Button onClick={() => input.current?.click()}>Choose different files</Button>
                    </div>
                  )}
                </>
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
            </Tile>
            {mapping?.needs && !mapping.busy && (
              <Tile i={1} aria-labelledby="im-map">
                <div className="tt">
                  <span id="im-map">Columns{multi ? ` · ${mapping.file.name}` : ""}</span>
                  <Pill tone="warn">NEW FORMAT</Pill>
                </div>
                <div className="text-ink-2">
                  This bank's file is new here. Say which column is which, once: it's remembered for files with the same
                  header{multi ? ", including the others chosen with it" : ""}.
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
                        {mapping.needs!.header.map((h, i) => (
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
                        {mapping.needs.header.map((h) => (
                          <th key={h} className="border-b border-line px-2 py-1.5 text-left text-ink-3">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {mapping.needs.sample.map((r, i) => (
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
                  <Button primary onClick={useColumns} disabled={cols.date == null || cols.description == null}>
                    Use these columns
                  </Button>
                </div>
              </Tile>
            )}
            {one?.info && <Columns info={one.info} />}
          </div>
          <Tile as="aside" i={2} className="min-w-0 flex-[1_1_320px]" aria-labelledby="im-check">
            <div className="tt">
              <span id="im-check">Before you continue</span>
            </div>
            {analysed.length > 0 && (
              <>
                <div>
                  <Stat label={multi ? "Rows in the files" : "Rows in the file"} value={sum((a) => a.counts.rows)} />
                  <Stat
                    label="Already imported"
                    value={`${sum((a) => a.counts.duplicates) + shared.size} · skipped`}
                    muted
                  />
                  <Stat label="You added by hand" value={`${sum((a) => a.counts.merge)} · will merge`} />
                  <Stat label="New transactions" value={batchNew - sum((a) => a.counts.merge)} />
                  {one?.info && (
                    <Stat label="Closing balance in file" value={money(one.info.closing, { cents: true })} />
                  )}
                </div>
                {multi && (
                  <div>
                    {inAccounts.map((a) => {
                      const mine = analysed.filter((x) => x.analysis.account_id === a.id);
                      const n = rows.filter((r) => r.account === a.id).length;
                      return (
                        <Stat
                          key={a.id}
                          label={
                            <span className="flex items-center gap-2">
                              <Dot c={a.colour} />
                              {a.name}
                            </span>
                          }
                          value={`${plural(mine.length, "file")} · ${n} new`}
                        />
                      );
                    })}
                  </div>
                )}
                {replaced.slice(0, multi ? 3 : 1).map((r) => (
                  <div key={r.id} className="rounded-lg bg-raised px-3 py-2.5 text-[13px]">
                    Your rough check-in{multi ? ` for ${bank(r.account)?.name ?? "the account"}` : ""} on{" "}
                    {capsDate(r.date).replace(/^0/, "")} said <b className="mono">~{money(r.rough)}</b>. The statement
                    says <b className="mono">{money(r.exact, { cents: true })}</b> that day, so the history will use the
                    exact figure.
                  </div>
                ))}
              </>
            )}
            {!items.length ? (
              <div className="text-ink-2">Choose a statement first.</div>
            ) : (
              waiting && <div className="text-ink-2">{waiting}</div>
            )}
            <div className="text-[13px] text-ink-3">
              {multi ? "The files are" : "The file is"} read on your home server and never leave
              {multi ? "" : "s"} it. Duplicates are spotted by date, amount and description, so overlapping exports are
              fine.
            </div>
            <div className="flex gap-2">
              <Button onClick={() => navigate({ to: "/accounts" })}>Cancel</Button>
              <Button primary disabled={!ready} onClick={() => setStep(2)}>
                Review {ready ? batchNew : ""}
              </Button>
            </div>
          </Tile>
        </div>
      )}
      {step === 2 && (
        <Review
          rows={rows}
          bank={inAccounts.length > 1 ? bank : null}
          replaced={replaced}
          keptCash={keptCash}
          loanFound={analysed.map((x) => x.analysis.loan).filter((l): l is LoanFound => !!l)}
          categories={categories}
          choices={choices}
          setChoice={(k, c) => {
            // The same merchant's other rows that still need sorting get the same category, and it's remembered
            // (the switch beside the list turns that off).
            const row = rows.find((r) => r.key === k);
            const same = row?.merchant
              ? rows.filter(
                  (r) => r.key !== k && !r.sure && r.merchant === row.merchant && choices[r.key] === undefined,
                )
              : [];
            setChoices((s) => ({ ...s, [k]: c, ...Object.fromEntries(same.map((r) => [r.key, c])) }));
            const a = new Set(always);
            if (c != null) a.add(k);
            else a.delete(k);
            setAlways(a);
            setLastChosen(k);
          }}
          always={always}
          setAlways={setAlways}
          lastChosen={lastChosen}
          filter={filter}
          setFilter={setFilter}
          files={toImport.length}
          onBack={() => setStep(1)}
          onImport={importAll}
          busy={importing}
        />
      )}
      {step === 3 && (
        <DoneView
          items={items.filter((x): x is Item & { analysis: Analysis; done: Done } => !!x.done && !!x.analysis)}
          bank={bank}
          openings={openings}
          onOpening={async (account, gap) => {
            try {
              const r = await apiSend<{ amount: number; date: string }>("POST", `accounts/${account}/opening`, {
                amount: gap,
              });
              setOpenings((o) => ({ ...o, [account]: r }));
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

/** A chosen file: what was read from it, the account it goes to, and how it stands. */
function FileRow({
  i,
  item,
  single,
  shared,
  banks,
  onAccount,
  onRemove,
  action,
}: {
  i: number;
  item: Item;
  single: boolean;
  shared: number;
  banks: Account[];
  onAccount: (id: number) => void;
  onRemove: () => void;
  action?: ReactNode;
}) {
  const [changing, setChanging] = useState(false);
  const { info, analysis } = item;
  const acct = banks.find((a) => a.id === item.account);
  const choose = (
    <Choice
      label={`Account for ${item.file.name}`}
      value={item.account}
      tone={acct?.colour ?? "teal"}
      onChange={(id) => {
        setChanging(false);
        onAccount(id);
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
  );
  return (
    <li
      className={cn("rise flex flex-col gap-2", !single && "border-t border-line py-3 first:border-t-0 first:pt-0")}
      style={{ "--i": i } as CSSProperties}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate font-semibold">{item.file.name}</div>
          <div className="mono text-xs text-ink-3">
            {item.busy && !info ? (
              "READING…"
            ) : item.error ? (
              <span className="text-bad">{item.error}</span>
            ) : item.needs ? (
              <span className="text-warn">NEW FORMAT · MATCH ITS COLUMNS BELOW</span>
            ) : info ? (
              <>
                {plural(info.rows, "ROW", "ROWS")}
                {info.first_date && info.last_date
                  ? ` · ${longDate(info.first_date).toUpperCase()} – ${longDate(info.last_date).toUpperCase()}`
                  : ""}
                {single && info.last4 && info.month
                  ? ` · ACCOUNT ••${info.last4} AND MONTH (${monthYear(info.month).toUpperCase()}) READ FROM THE NAME`
                  : ""}
                {single && info.bank === "ubank-export" && info.account_names?.length
                  ? ` · UBANK CALLS IT ${info.account_names.join(" / ").toUpperCase()}`
                  : ""}
                {!single && analysis
                  ? ` · ${analysis.counts.new - shared} NEW${analysis.counts.duplicates + shared ? ` · ${analysis.counts.duplicates + shared} ALREADY HERE` : ""}`
                  : ""}
              </>
            ) : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!single && info && acct && !changing && (
            <button
              type="button"
              onClick={() => setChanging(true)}
              aria-label={`${acct.name}: change the account for ${item.file.name}`}
              className="press inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-md border border-line bg-raised px-2.5 text-[13px] text-ink"
            >
              <Dot c={acct.colour} />
              {acct.name}
              <span className="text-ink-3">· {item.busy ? "checking…" : "change"}</span>
            </button>
          )}
          {action}
          {!single && (
            <Button small onClick={onRemove} aria-label={`Leave out ${item.file.name}`}>
              Leave out
            </Button>
          )}
        </div>
      </div>
      {info &&
        (single ? (
          <>
            <div className="tt mt-2">Which account is this statement from?</div>
            {choose}
          </>
        ) : (
          (!acct || changing) && choose
        ))}
    </li>
  );
}

/** How a single file's columns were read: a few rows and the checks. */
function Columns({ info }: { info: FileInfo }) {
  return (
    <Tile i={1} aria-labelledby="im-cols">
      <div className="tt">
        <span id="im-cols">Columns</span>
        <span className="mono tracking-normal">
          {info.bank === "ubank"
            ? "UBANK FORMAT · RECOGNISED"
            : info.bank === "ubank-export"
              ? "UBANK EXPORT · RECOGNISED"
              : "YOUR SAVED FORMAT · RECOGNISED"}
        </span>
      </div>
      <div className="text-ink-2">
        {info.bank === "ubank"
          ? "Matched from a saved bank format. Another bank's file asks you to match the columns once, then it's remembered."
          : info.bank === "ubank-export"
            ? "uBank's longer export: a date range of one account, newest first, without a balance. The account it's imported to is remembered for the next one."
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
          {info.date_format === "%d %b %Y"
            ? "02 Oct 2026 style"
            : info.date_format === "%H:%M %d-%m-%y"
              ? "13:04 07-11-26 style, time dropped"
              : info.date_format}
        </Check>
        <Check label="Amounts">
          {info.columns.amount != null ? "One signed column" : "Separate out and in columns, $ and commas stripped"}
        </Check>
        <Check label="Balance" warn={info.balance_ok === false}>
          {info.balance_ok == null
            ? "No balance column"
            : info.balance_ok
              ? "Signed, checked row by row"
              : `${info.balance_problems.length} rows don't follow on`}
        </Check>
        {info.zero_rows ? (
          <Check label="Left out">
            {info.zero_rows} $0.00 {info.zero_rows === 1 ? "row" : "rows"} (a card being checked)
          </Check>
        ) : null}
      </div>
      {info.bank === "ubank-export" && (
        <div className="text-ink-2">
          Its payment type marks transfers between your accounts, and uBank's own category is offered as a suggestion
          when a merchant is new here. With no balance in the file, add a check-in afterwards to see the ledger matches.
        </div>
      )}
      {info.bank === "ubank" && (
        <div className="text-ink-2">
          uBank labels every transfer just "Transfer", so transfers are matched to your rules by amount and date
          instead.
        </div>
      )}
    </Tile>
  );
}

function Steps({ step }: { step: number }) {
  return (
    <ol className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Import progress">
      {["Upload and match", "Review", "Done"].map((s, i) => {
        const state = step > i + 1 ? "done" : step === i + 1 ? "now" : "todo";
        return (
          <li
            key={s}
            aria-current={state === "now" ? "step" : undefined}
            className={cn(
              "flex h-9 items-center gap-2 rounded-full border pr-3.5 pl-1.5 text-[13px] font-semibold whitespace-nowrap",
              state === "now"
                ? "border-teal text-teal"
                : state === "done"
                  ? "border-line text-good"
                  : "border-line text-ink-3",
            )}
          >
            <span
              className={cn(
                "mono flex size-6 items-center justify-center rounded-full text-xs",
                state === "now" ? "btn-primary" : state === "done" ? "bg-good/15 text-good" : "bg-raised",
              )}
            >
              {state === "done" ? "✓" : i + 1}
            </span>
            {s}
          </li>
        );
      })}
    </ol>
  );
}

function Check({ label, children, warn }: { label: string; children: ReactNode; warn?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5",
        warn ? "border-warn/50 bg-warn/10" : "border-good/30 bg-good/10",
      )}
    >
      <span className="text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">{label}</span>
      {children}
    </span>
  );
}

function Stat({ label, value, muted }: { label: ReactNode; value: ReactNode; muted?: boolean }) {
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
  rows,
  bank,
  replaced,
  keptCash,
  loanFound,
  categories,
  choices,
  setChoice,
  always,
  setAlways,
  lastChosen,
  filter,
  setFilter,
  files,
  onBack,
  onImport,
  busy,
}: {
  rows: BatchRow[];
  /** Set when the rows come from more than one account, to label each with its own. */
  bank: ((id: number) => Account | undefined) | null;
  replaced: (Analysis["replaced"][number] & { account: number })[];
  keptCash: (Analysis["kept_cash"][number] & { account: number })[];
  loanFound: LoanFound[];
  categories: Category[];
  choices: Record<string, number | null>;
  setChoice: (key: string, c: number | null) => void;
  always: Set<string>;
  setAlways: (s: Set<string>) => void;
  lastChosen: string | null;
  filter: string;
  setFilter: (f: "all" | "need" | "transfers" | "bills") => void;
  files: number;
  onBack: () => void;
  onImport: () => void;
  busy: boolean;
}) {
  const need = rows.filter((r) => !r.sure);
  const transfers = rows.filter((r) => r.why === "transfer");
  const bills = rows.filter((r) => r.why === "bill");
  const merges = rows.filter((r) => r.status === "merge");
  const sorted = rows.filter((r) => r.sure && r.why !== "transfer").length;
  const shown = filter === "need" ? need : filter === "transfers" ? transfers : filter === "bills" ? bills : rows;
  const name = (id: number | null | undefined) => categories.find((c) => c.id === id)?.name;
  const chosenRow = lastChosen != null ? rows.find((r) => r.key === lastChosen) : null;
  const left = need.filter((r) => choices[r.key] == null && r.suggest_id == null).length;
  const of = (id: number) => (bank ? ` for ${bank(id)?.name ?? "the account"}` : "");
  const byCategory = (() => {
    const t = new Map<string, number>();
    for (const r of rows) {
      if (r.why === "transfer" || r.why === "pay" || r.loan || r.amount >= 0) continue;
      const c = choices[r.key] !== undefined ? choices[r.key] : (r.category_id ?? r.suggest_id ?? null);
      const n = name(c) ?? "Not sorted yet";
      t.set(n, (t.get(n) ?? 0) - r.amount);
    }
    return [...t].sort((a, b) => b[1] - a[1]);
  })();
  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {files > 1 && <span className="mr-auto text-[13px] text-ink-3">From {files} files, oldest first</span>}
        <Button onClick={onBack}>Back</Button>
        <Button primary onClick={onImport} disabled={busy}>
          {busy ? "Importing…" : `Import ${plural(rows.length, "transaction")}`}
        </Button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-4">
        <Tile i={0}>
          <div className="tt">Sorted automatically</div>
          <div className="mono text-[26px] font-semibold">{sorted}</div>
        </Tile>
        <Tile i={1}>
          <div className="tt">Need you</div>
          <div className="mono text-[26px] font-semibold text-warn">{need.length}</div>
        </Tile>
        <Tile i={2}>
          <div className="tt">Between your accounts</div>
          <div className="mono text-[26px] font-semibold">{transfers.length}</div>
          <div className="text-xs text-ink-3">not counted as spending</div>
        </Tile>
        <Tile i={3}>
          <div className="tt">Merged with yours</div>
          <div className="mono text-[26px] font-semibold">{merges.length}</div>
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
                  ["transfers", `Transfers ${transfers.length}`],
                  ["bills", `Bills ${bills.length}`],
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
              const chosen = choices[r.key];
              const current = chosen !== undefined ? chosen : (r.category_id ?? null);
              const acct = bank?.(r.account);
              const why =
                r.why === "suggest"
                  ? `NEW · SUGGEST ${r.suggest?.toUpperCase()}`
                  : r.why === "transfer"
                    ? r.rule_kind
                      ? `MATCHED BY AMOUNT · ${r.rule_kind === "top_up" ? "MONTHLY TOP BACK UP" : r.rule_kind === "sweep" ? "EXTRA BACK TO THE OFFSET" : "PAYDAY"} RULE${r.differed ? ` · RULE SAID ${money(r.called_for)}` : ""}`
                      : "BETWEEN YOUR ACCOUNTS"
                    : r.why === "bill"
                      ? `MATCHED BILL · ${r.bill?.toUpperCase()}`
                      : r.loan
                        ? `HOME LOAN · ${r.amount > 0 ? "OWED MORE" : "OWED LESS"}`
                        : r.status === "merge"
                          ? `${r.why === "merged" ? "" : WHY[r.why ?? "unknown"] + " · "}MERGED WITH YOUR ENTRY`
                          : WHY[r.why ?? "unknown"];
              return (
                <div
                  key={r.key}
                  className="rise grid grid-cols-[64px_minmax(0,1fr)_90px_150px] items-center gap-3 border-t border-line py-2.5 text-[13px]"
                  style={{ "--i": Math.min(i, 20) } as CSSProperties}
                >
                  <span className="mono text-ink-3">{capsDate(r.date)}</span>
                  <span className="min-w-0">
                    <span className="mono block truncate">{r.description}</span>
                    <span
                      className={cn(
                        "mono flex min-w-0 items-center gap-1.5 text-[11px]",
                        r.differed ? "text-warn" : "text-ink-3",
                      )}
                    >
                      {acct && (
                        <>
                          <Dot c={acct.colour} className="size-1.5" />
                          <span className="flex-none">{acct.name.toUpperCase()} ·</span>
                        </>
                      )}
                      <span className="truncate">{why}</span>
                    </span>
                  </span>
                  <span
                    className="mono text-right"
                    style={{ color: r.amount > 0 && !r.loan ? "var(--color-good)" : undefined }}
                  >
                    {amount(r.amount, { cents: true, sign: true })}
                  </span>
                  {r.why === "transfer" ? (
                    <span className="inline-flex min-h-8 items-center rounded-md border border-offset/40 bg-offset/10 px-2.5 text-xs">
                      Transfer
                    </span>
                  ) : r.loan ? (
                    <span className="inline-flex min-h-8 items-center rounded-md border border-track/40 bg-track/10 px-2.5 text-xs">
                      {LOAN_WHY[r.why ?? "loan"] ?? "Loan"}
                    </span>
                  ) : (
                    <CategoryPicker
                      label={`Category for ${r.description}`}
                      value={current}
                      suggested={r.suggest_id}
                      categories={categories}
                      onChange={(c) => setChoice(r.key, c)}
                    />
                  )}
                </div>
              );
            })}
            {!shown.length && <div className="border-t border-line py-4 text-ink-3">Nothing here.</div>}
          </div>
        </Tile>
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          {loanFound.length > 0 && <LoanChanges found={loanFound} />}
          <Tile as="aside" i={5} aria-labelledby="rv-rec">
            <div className="tt">
              <span id="rv-rec">Reconcile with what you entered</span>
            </div>
            {replaced.map((r) => (
              <Rec
                key={r.id}
                title={`Check-in${of(r.account)} ${capsDate(r.date).replace(/^0/, "")}`}
                value={
                  <>
                    <span className="text-ink-3">~{amount(r.rough)}</span> → {amount(r.exact, { cents: true })}
                  </>
                }
              >
                Rough figure replaced with the statement's
              </Rec>
            ))}
            {merges.map((r) => (
              <Rec
                key={r.key}
                title={`${r.hand_description}, added ${capsDate(r.hand_date ?? r.date).replace(/^0/, "")}`}
                value={amount(-r.amount, { cents: true })}
              >
                Same amount as a statement row{of(r.account)} · merged{r.note ? ", your note kept" : ""}
              </Rec>
            ))}
            {keptCash.map((c) => (
              <Rec
                key={c.id}
                title={`${c.description}, ${capsDate(c.date).replace(/^0/, "")}`}
                value={amount(-c.amount, { cents: true })}
              >
                No match in the statement{of(c.account)} · kept as cash
              </Rec>
            ))}
            {!replaced.length && !merges.length && !keptCash.length && (
              <div className="text-ink-3">
                Nothing you entered by hand overlaps {files > 1 ? "these statements" : "this statement"}.
              </div>
            )}
          </Tile>
          {chosenRow && choices[chosenRow.key] != null && (
            <Tile as="aside" i={6} aria-labelledby="rv-learn" className="reveal">
              <div className="tt">
                <span id="rv-learn">Remember this?</span>
              </div>
              <div>
                You put <b className="mono">{chosenRow.description}</b> in <b>{name(choices[chosenRow.key])}</b>.
              </div>
              <div className="flex items-center justify-between gap-3">
                <span id="rv-always">Always use {name(choices[chosenRow.key])} for this</span>
                <Switch
                  labelledBy="rv-always"
                  checked={always.has(chosenRow.key)}
                  onChange={(on) => {
                    const s = new Set(always);
                    if (on) s.add(chosenRow.key);
                    else s.delete(chosenRow.key);
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
              <span className="mono tracking-normal">{money(byCategory.reduce((s, [, v]) => s + v, 0))}</span>
            </div>
            {byCategory.map(([n, v]) => (
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

const LOAN_WHY: Record<string, string> = {
  interest: "Interest",
  drawdown: "Drawdown",
  repayment: "Repayment",
  fee: "Fee",
  loan: "Loan",
};

const ratePct = (bp: number | null | undefined) => (bp == null ? "—" : `${(bp / 100).toFixed(2)}%`);

/** The rate and repayment changes read from the loan's statements, and what the loan will say once they're in. */
function LoanChanges({ found }: { found: LoanFound[] }) {
  const changes = found.flatMap((f) => f.changes).sort((a, b) => a.date.localeCompare(b.date));
  const latest = found[found.length - 1];
  // The latest of each across the statements (an older one chosen last doesn't turn them back).
  const rate = found.map((f) => f.rate_bp).reduce((a, b) => b ?? a, null as number | null);
  const repayment = found.map((f) => f.repayment).reduce((a, b) => b ?? a, null as number | null);
  const value = (field: LoanChange["field"], v: number | null) =>
    field === "rate" ? ratePct(v) : money(v, { cents: true });
  return (
    <Tile as="aside" i={5} aria-labelledby="rv-loan">
      <div className="tt">
        <span id="rv-loan">Rate and repayment</span>
      </div>
      {changes.map((c) => (
        <Rec
          key={`${c.date}-${c.field}-${c.value}`}
          title={`${c.field === "rate" ? (c.was == null ? "Rate" : "Rate change") : c.was == null ? "Repayment" : "Repayment change"}, ${capsDate(c.date).replace(/^0/, "")}`}
          value={
            <>
              {c.was != null && <span className="text-ink-3">{value(c.field, c.was)} → </span>}
              {value(c.field, c.value)}
            </>
          }
        >
          {c.new ? "From the statement" : "Already noted from an earlier statement"}
        </Rec>
      ))}
      {!changes.length && <div className="text-ink-3">The statement doesn't show the rate or the repayment.</div>}
      {(rate !== latest.was_rate_bp || repayment !== latest.was_repayment) && (
        <div className="rounded-lg bg-raised px-3 py-2.5 text-[13px]">
          The loan will be set to <b className="mono">{ratePct(rate)}</b>
          {repayment != null && (
            <>
              {" "}
              with repayments of <b className="mono">{money(repayment, { cents: true })}</b>
            </>
          )}
          , so its projections use them.
        </div>
      )}
    </Tile>
  );
}

function Rec({ title, value, children }: { title: string; value: ReactNode; children: ReactNode }) {
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

/** What to do next: the bills the import spotted, and sorting what's left a merchant at a time. */
function Followups({ spotted }: { spotted?: { suggestions: number; updates: number } }) {
  const n = (spotted?.suggestions ?? 0) + (spotted?.updates ?? 0);
  return (
    <div className="reveal flex w-full flex-col gap-2" style={{ "--i": 2 } as CSSProperties}>
      {n > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-raised px-3.5 py-3 text-[13px]">
          <span>
            {spotted?.suggestions
              ? `${plural(spotted.suggestions, "regular payment")} look${spotted.suggestions === 1 ? "s" : ""} like ${spotted.suggestions === 1 ? "a bill" : "bills"}`
              : ""}
            {spotted?.suggestions && spotted?.updates ? ", and " : ""}
            {spotted?.updates ? `${plural(spotted.updates, "bill")} changed price` : ""}.
          </span>
          <Link to="/bills" className="font-medium text-teal no-underline">
            Review on Bills
          </Link>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-raised px-3.5 py-3 text-[13px]">
        <span>Sort what&apos;s left a merchant at a time, so it&apos;s remembered for next time.</span>
        <Link to="/sort" className="font-medium text-teal no-underline">
          Sort what's new
        </Link>
      </div>
    </div>
  );
}

/** What came in altogether, then each account against its latest statement's closing balance. */
function DoneView({
  items,
  bank,
  openings,
  onOpening,
}: {
  items: (Item & { analysis: Analysis; done: Done })[];
  bank: (id: number) => Account | undefined;
  openings: Record<number, { amount: number; date: string }>;
  onOpening: (account: number, gap: number) => void;
}) {
  const total = (f: (d: Done) => number) => items.reduce((s, x) => s + f(x.done), 0);
  const added = total((d) => d.added + d.merged);
  const skipped = total((d) => d.skipped);
  const merged = total((d) => d.merged);
  const kept = total((d) => d.kept_cash);
  const learned = total((d) => d.learned);
  const accounts = [...new Set(items.map((x) => x.analysis.account_id))];
  return (
    <Tile i={0} className="max-w-[640px] items-start gap-3">
      <SuccessTick />
      <div className="rise text-xl font-semibold" style={{ "--i": 1 } as CSSProperties}>
        {plural(added, "transaction")} imported{items.length > 1 ? ` from ${items.length} files` : ""}
      </div>
      <div className="rise text-ink-2" style={{ "--i": 2 } as CSSProperties}>
        {skipped ? `${skipped} already here were skipped. ` : ""}
        {merged ? `${merged} you'd added by hand were merged. ` : ""}
        {kept ? `${kept} with no match were kept as cash. ` : ""}
        {learned ? `${learned} earlier transactions were sorted by what you chose to remember.` : ""}
      </div>
      <Followups spotted={items[items.length - 1]?.done.spotted} />
      {accounts.map((id, i) => {
        const mine = items.filter((x) => x.analysis.account_id === id);
        const first = mine[0];
        const last = mine[mine.length - 1];
        const acct = bank(id) ?? last.done.account;
        const opening = openings[id];
        const gap = opening ? 0 : last.done.gap;
        const n = mine.reduce((s, x) => s + x.done.added + x.done.merged, 0);
        return (
          <div key={id} className="reveal w-full" style={{ "--i": i + 3 } as CSSProperties}>
            {accounts.length > 1 && (
              <div className="mb-1.5 flex items-center gap-2 text-[13px] font-semibold">
                <Dot c={acct.colour} />
                {acct.name}
                <span className="mono text-xs font-normal text-ink-3">
                  +{n} · {plural(mine.length, "file")}
                </span>
              </div>
            )}
            {gap ? (
              <div className="rounded-lg bg-raised px-3.5 py-3 text-[13px]">
                {acct.name} now has history from{" "}
                {first.analysis.file.first_date ? longDate(first.analysis.file.first_date) : "the statement"}. Its
                transactions add up to <b className="mono">{money(last.done.ledger_at_close, { cents: true })}</b> at
                the {mine.length > 1 ? "latest " : ""}statement's end, {money(Math.abs(gap), { cents: true })}{" "}
                {gap > 0 ? "less" : "more"} than its closing balance.{" "}
                {first.analysis.earliest
                  ? "An opening balance, dated the day before the history starts, makes them match."
                  : "Set the balance to the cent in Accounts to correct it."}
                {first.analysis.earliest && (
                  <div className="mt-2">
                    <Button primary small onClick={() => onOpening(id, gap)}>
                      Add an opening balance of {money(gap, { cents: true })}
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-[13px] text-good">
                {accounts.length > 1 ? "Adds" : "The transactions add"} up to the statement's closing balance.
              </div>
            )}
            {last.done.loan && (
              <div className="mt-1 text-[13px] text-ink-2">
                The loan's rate is now <b className="mono">{ratePct(last.done.loan.rate_bp)}</b>
                {last.done.loan.repayment != null && (
                  <>
                    {" "}
                    and its repayment <b className="mono">{money(last.done.loan.repayment, { cents: true })}</b>
                  </>
                )}
                {mine.reduce((s, x) => s + (x.done.loan?.changes ?? 0), 0)
                  ? ` (${plural(
                      mine.reduce((s, x) => s + (x.done.loan?.changes ?? 0), 0),
                      "change",
                    )} noted).`
                  : "."}
              </div>
            )}
            {opening && (
              <div className="mt-1 text-[13px] text-ink-2">
                Opening balance of {money(opening.amount, { cents: true })} added, dated {longDate(opening.date)}.
              </div>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <Link
          to="/accounts"
          className="press inline-flex min-h-10 items-center rounded-lg border border-line px-3.5 text-[13px] text-ink no-underline hover:bg-raised"
        >
          {accounts.length > 1 ? "See the accounts" : "See the account"}
        </Link>
        <a
          href="/import"
          className="press inline-flex min-h-10 items-center rounded-lg border border-teal bg-teal px-3.5 text-[13px] font-semibold text-page no-underline"
        >
          Import more
        </a>
      </div>
    </Tile>
  );
}
