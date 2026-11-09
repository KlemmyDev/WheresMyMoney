/**
 * Things owned, shared by Net worth and each thing's own page: how each kind looks, adding one (what it is, what it's
 * worth and since when, and anything owed on it), and the small form for one value or one amount owed. Money in
 * cents; dates ISO.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { apiSend, errorMessage } from "~/features/common/api";
import { ChoiceChip, Sheet, type Role } from "~/features/common/ds";
import { editable, money, parseMoney, todayIso } from "~/features/common/format";
import { I, type Glyph, type Tone } from "~/features/common/icons";
import { refresh, type Asset, type AssetGroup, type AssetKind } from "~/features/common/queries";
import { Button, ErrorText, Input, Switch } from "~/features/common/ui";

export const ASSET_LOOK: Record<AssetKind, { g: Glyph; tone: Tone; role: Role }> = {
  home: { g: I.loan, tone: "offset", role: "offset" },
  property: { g: I.property, tone: "invest", role: "invest" },
  land: { g: I.land, tone: "savings", role: "savings" },
  car: { g: I.car, tone: "spending", role: "spending" },
  vehicle: { g: I.boat, tone: "bills", role: "bills" },
  valuables: { g: I.gem, tone: "grad", role: "accent" },
  cash: { g: I.pay, tone: "savings", role: "savings" },
  other: { g: I.savings, tone: "neutral", role: "ink" },
};

/** The groups on Net worth, each with its colour. */
export const GROUP_LOOK: Record<Exclude<AssetGroup, "home">, { name: string; color: string; g: Glyph; tone: Tone }> = {
  property: { name: "Property", color: "var(--color-sky)", g: I.property, tone: "invest" },
  vehicles: { name: "Vehicles", color: "var(--color-spending-fill)", g: I.car, tone: "spending" },
  things: { name: "Other things", color: "var(--color-rose)", g: I.gem, tone: "grad" },
};

export const KIND_ORDER: AssetKind[] = ["home", "property", "land", "car", "vehicle", "valuables", "cash", "other"];

/** What a loan against a kind is likely called, for a placeholder. */
export const loanName = (k: AssetKind) =>
  k === "car" || k === "vehicle" ? "Car loan" : k === "property" || k === "land" ? "Investment loan" : "Loan";

/** "5.99%" from basis points, or nothing. */
export const rate = (bp: number | null) => (bp == null ? "" : `${(bp / 100).toFixed(2)}%`);

/** What a rate typed in ("5.99", "5.99%") is in basis points: null for blank, NaN when it isn't a number. */
export function parseRate(text: string): number | null {
  const t = text.replace(/[%\s]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export function KindChips({
  kinds,
  value,
  onChange,
}: {
  kinds: Record<AssetKind, string>;
  value: AssetKind;
  onChange: (k: AssetKind) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="What it is">
      {KIND_ORDER.filter((k) => kinds[k]).map((k) => (
        <ChoiceChip
          key={k}
          pressed={value === k}
          onClick={() => onChange(k)}
          g={ASSET_LOOK[k].g}
          tone={ASSET_LOOK[k].tone}
          role={ASSET_LOOK[k].role}
        >
          {kinds[k]}
        </ChoiceChip>
      ))}
    </div>
  );
}

export function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="eyebrow">{label}</span>
      {children}
    </label>
  );
}

/** Add something owned: what it is, its name, what it's worth (and since when, so what was paid can go in), and
 * anything owed on it. Opens its page once added. */
export function AddAssetSheet({
  open,
  kinds,
  hasLoan,
  onClose,
}: {
  open: boolean;
  kinds: Record<AssetKind, string>;
  /** The household has a home loan account, which already counts against the home. */
  hasLoan: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Add something you own">
      {open && <AddAssetForm kinds={kinds} hasLoan={hasLoan} onClose={onClose} />}
    </Sheet>
  );
}

function AddAssetForm({
  kinds,
  hasLoan,
  onClose,
}: {
  kinds: Record<AssetKind, string>;
  hasLoan: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [kind, setKind] = useState<AssetKind>("property");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [date, setDate] = useState(todayIso());
  const [paid, setPaid] = useState(false);
  const [owes, setOwes] = useState(false);
  const [owedName, setOwedName] = useState("");
  const [owed, setOwed] = useState("");
  const [owedRate, setOwedRate] = useState("");
  const homeLoan = kind === "home" && hasLoan;
  const save = useMutation({
    mutationFn: () => {
      const r = parseRate(owedRate);
      if (owes && !homeLoan && Number.isNaN(r)) throw new Error("Enter the rate as a number, like 6.5.");
      return apiSend<Asset>("POST", "networth/assets", {
        kind,
        name: name || kinds[kind],
        value: parseMoney(value),
        date,
        note: paid ? "What we paid" : "",
        ...(owes && !homeLoan
          ? { owed: parseMoney(owed), owed_name: owedName || loanName(kind), owed_rate_bp: r }
          : {}),
      });
    },
    onSuccess: (a) => {
      refresh(qc);
      onClose();
      navigate({ to: "/net-worth/$assetId", params: { assetId: String(a.id) } });
    },
  });
  const ok = parseMoney(value) != null && (!owes || homeLoan || parseMoney(owed) != null);
  return (
    <form
      className="flex flex-col gap-4 pb-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (ok) save.mutate();
      }}
    >
      <KindChips kinds={kinds} value={kind} onChange={setKind} />
      <Labelled label="Name">
        <Input
          className="font-sans"
          value={name}
          placeholder={kinds[kind]}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
        />
      </Labelled>
      <div className="flex flex-wrap gap-3">
        <Labelled label="Worth about $">
          <Input inputMode="decimal" value={value} placeholder="650,000" onChange={(e) => setValue(e.target.value)} />
        </Labelled>
        <Labelled label="As of">
          <Input type="date" value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
        </Labelled>
      </div>
      <label className="flex items-center justify-between gap-3 text-[14px]">
        <span>
          That&apos;s what we paid
          <span className="block text-[12px] text-ink-3">
            Put the date you bought it, and add today&apos;s value after.
          </span>
        </span>
        <Switch checked={paid} onChange={setPaid} label="That's what we paid" />
      </label>
      <label className="flex items-center justify-between gap-3 text-[14px]">
        <span>
          We owe money on it
          <span className="block text-[12px] text-ink-3">
            A car loan, an investment loan: taken off what it&apos;s worth.
          </span>
        </span>
        <Switch checked={owes} onChange={setOwes} label="We owe money on it" />
      </label>
      {owes && homeLoan && (
        <p className="m-0 text-[13px] text-ink-3">
          The home loan already counts against the home, from Accounts. Add anything else owed on it from its page.
        </p>
      )}
      {owes && !homeLoan && (
        <div className="flex flex-col gap-3 rounded-2xl border border-line p-3">
          <Labelled label="What it's called">
            <Input
              className="font-sans"
              value={owedName}
              placeholder={loanName(kind)}
              maxLength={40}
              onChange={(e) => setOwedName(e.target.value)}
            />
          </Labelled>
          <div className="flex flex-wrap gap-3">
            <Labelled label="Owed now $">
              <Input inputMode="decimal" value={owed} placeholder="18,000" onChange={(e) => setOwed(e.target.value)} />
            </Labelled>
            <Labelled label="Rate % (optional)">
              <Input
                inputMode="decimal"
                value={owedRate}
                placeholder="7.49"
                onChange={(e) => setOwedRate(e.target.value)}
              />
            </Labelled>
          </div>
        </div>
      )}
      {save.isError && <ErrorText>{errorMessage(save.error)}</ErrorText>}
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button primary type="submit" disabled={!ok || save.isPending}>
          {save.isPending ? "Adding…" : "Add it"}
        </Button>
      </div>
    </form>
  );
}

/** One value ("values") or one amount owed ("owed"): new, or changed or taken away. */
export type EntryEdit = {
  what: "values" | "owed";
  entry: { id: number; date: string; cents: number; note: string } | null;
};

export function EntrySheet({ asset, edit, onClose }: { asset: Asset; edit: EntryEdit | null; onClose: () => void }) {
  const title = !edit
    ? ""
    : edit.what === "values"
      ? edit.entry
        ? "Change this value"
        : "Update what it's worth"
      : edit.entry
        ? "Change this amount"
        : `What's owed${asset.owed.name ? ` on the ${asset.owed.name.toLowerCase()}` : ""}`;
  return (
    <Sheet open={edit != null} onClose={onClose} title={title}>
      {edit && (
        <EntryForm key={`${edit.what}-${edit.entry?.id ?? "new"}`} asset={asset} edit={edit} onClose={onClose} />
      )}
    </Sheet>
  );
}

function EntryForm({ asset, edit, onClose }: { asset: Asset; edit: EntryEdit; onClose: () => void }) {
  const qc = useQueryClient();
  const isValue = edit.what === "values";
  const e = edit.entry;
  const [cents, setCents] = useState(e ? editable(e.cents) : "");
  const [date, setDate] = useState(e?.date ?? todayIso());
  const [note, setNote] = useState(e?.note ?? "");
  const base = `networth/assets/${asset.id}/${edit.what}`;
  const done = () => {
    refresh(qc);
    onClose();
  };
  const save = useMutation({
    mutationFn: () =>
      apiSend(e ? "PUT" : "POST", e ? `${base}/${e.id}` : base, {
        [isValue ? "value" : "amount"]: parseMoney(cents),
        date,
        note,
      }),
    onSuccess: done,
  });
  const remove = useMutation({ mutationFn: () => apiSend("DELETE", `${base}/${e!.id}`), onSuccess: done });
  const lastValue = isValue && asset.values.length <= 1;
  const latest = isValue ? asset.value : asset.owed.amount;
  return (
    <form
      className="flex flex-col gap-4 pb-2"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (parseMoney(cents) != null) save.mutate();
      }}
    >
      <div className="flex flex-wrap gap-3">
        <Labelled label={isValue ? "Worth about $" : "Owed $"}>
          <Input
            inputMode="decimal"
            autoFocus
            value={cents}
            placeholder={latest ? editable(latest).replace(/\.00$/, "") : "0"}
            onChange={(ev) => setCents(ev.target.value)}
          />
        </Labelled>
        <Labelled label="As of">
          <Input type="date" value={date} max={todayIso()} onChange={(ev) => setDate(ev.target.value)} />
        </Labelled>
      </div>
      <Labelled label="Note (optional)">
        <Input
          className="font-sans"
          value={note}
          maxLength={60}
          placeholder={isValue ? "What we paid, bank valuation, RedBook…" : "From the statement"}
          onChange={(ev) => setNote(ev.target.value)}
        />
      </Labelled>
      <p className="m-0 text-[12px] text-ink-3">
        {isValue
          ? `Each value is kept, so the chart shows the change. Now ${money(asset.value)}.`
          : "Each amount is kept, so you can see it come down. Put 0 once it's paid off."}{" "}
        A second one on the same date replaces the first.
      </p>
      {(save.isError || remove.isError) && <ErrorText>{errorMessage(save.error ?? remove.error)}</ErrorText>}
      <div className="flex gap-2">
        {e && !lastValue && (
          <Button type="button" className="text-bad" onClick={() => remove.mutate()} disabled={remove.isPending}>
            Take it away
          </Button>
        )}
        <span className="flex-1" />
        <Button type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button primary type="submit" disabled={parseMoney(cents) == null || save.isPending}>
          Save
        </Button>
      </div>
    </form>
  );
}
