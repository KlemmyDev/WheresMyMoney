/**
 * A transaction's icon: a stylised mark for the merchant (drawn in merchantMarks.ts), with the category as a small
 * badge in the corner. A merchant without a mark shows what kind of place it is (a dumbbell for a gym, a shield for
 * insurance), else its category's glyph, else its first letter. Money in, transfers and adjustments keep their plain
 * glyph.
 */
import type { ReactNode } from "react";
import type { Transaction } from "~/features/common/types";
import { Chip, I } from "~/features/common/icons";
import { markFor, placeFor, type Shape } from "~/features/spending/merchantMarks";

export { markFor };

/** The category badge's glyph (stroke paths, 24 × 24) and colour, by the category's name and kind. */
const BADGES: [RegExp, string][] = [
  [/grocer/i, "M3 4h2l2.2 10.5h10.6L20 7H6.2M9 19.5h.01M17 19.5h.01"],
  [/takeaway|eating|restaurant|food/i, "M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M16 3c-2 0-3 3-3 6s1 3 3 3v9"],
  [/coffee|cafe/i, "M5 8h11v5a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5zM16 10h2a2 2 0 0 1 0 4h-2"],
  [/alcohol|drink/i, "M7 3h10l-1 7a4 4 0 0 1-8 0zM12 14v7M8 21h8"],
  [/fuel|petrol/i, "M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M4 21h12M5 10h10M15 8l3 3v6a1.5 1.5 0 0 0 3 0V9l-3-3"],
  [
    /car|transport|parking|toll/i,
    "M4 15l2-5.5A2 2 0 0 1 7.9 8h8.2a2 2 0 0 1 1.9 1.5L20 15v3H4zM7.5 15h.01M16.5 15h.01",
  ],
  [/sport|fitness|gym/i, "M6 8v8M3 10v4M18 8v8M21 10v4M6 12h12"],
  [/kid|child|school|education/i, "M3 9l9-4.5L21 9l-9 4.5zM7 11v4.5c0 1.5 2.2 3 5 3s5-1.5 5-3V11"],
  [/pet/i, "M12 20c-3 0-5-1.5-5-3.5S9 12 12 12s5 2.5 5 4.5-2 3.5-5 3.5zM6 10h.01M10 6h.01M14 6h.01M18 10h.01"],
  [/home|garden|furniture|maint/i, "M4 11l8-7 8 7v9H4zM10 20v-5h4v5"],
  [/health|pharm|medical|doctor|dental/i, "M12 6v12M6 12h12"],
  [/gift/i, "M4 10h16v10H4zM4 10V7h16v3M12 7v13M12 7c-2-4-6-2-4 0M12 7c2-4 6-2 4 0"],
  [
    /fun|hobb|holiday|entertain|stream|subscri/i,
    "M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5l-5.3 2.9 1.2-6-4.5-4.1 6-.7z",
  ],
  [/shop|cloth|electron/i, "M5 8h14l-1 12H6zM9 8a3 3 0 0 1 6 0"],
  [/phone|internet|bill|insur|utilit|rates|electric|water|loan/i, "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6"],
];
const TAG = "M3 12V4h8l10 10-8 8zM7.5 7.5h.01";
const UNSORTED = "M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01";

function badge(tx: Transaction): { d: string; colour: string; label: string } | null {
  if (tx.splits?.length) return { d: TAG, colour: "var(--grad)", label: "Split" };
  if (!tx.category) return { d: UNSORTED, colour: "var(--color-ink-3)", label: "Not sorted" };
  if (tx.category_kind === "income" || tx.amount > 0)
    return { d: "M12 4v11M7 10.5l5 5 5-5M5 20h14", colour: "var(--color-savings-fill)", label: tx.category };
  const d = BADGES.find(([re]) => re.test(tx.category ?? ""))?.[1] ?? TAG;
  const colour = tx.category_kind === "bills" ? "var(--color-bills-fill)" : "var(--color-spending-fill)";
  return { d, colour, label: tx.category };
}

/** Tile colours for a merchant nobody's described: a calm one picked by its name, so it's the same every time. */
const PLAIN = ["#5b6ee1", "#2f9e8f", "#c2683b", "#8d5bd6", "#3a8fd1", "#b4507a", "#6f8f2f", "#a7802a"];

const SIZES = { md: 32, lg: 40, xl: 56 } as const;

function Art({ shapes }: { shapes: Shape[] }) {
  return (
    <svg
      viewBox="0 0 32 32"
      className="absolute inset-0 size-full"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {shapes.map((sh, i) =>
        "d" in sh ? (
          <path key={i} d={sh.d} fill={sh.fill ?? "none"} fillRule="evenodd" stroke={sh.stroke} strokeWidth={sh.w} />
        ) : (
          <text
            key={i}
            x={sh.x ?? 16}
            y={sh.y ?? 19.2}
            fontSize={sh.s ?? 9}
            fill={sh.fill}
            fontWeight={sh.weight ?? 800}
            fontStyle={sh.italic ? "italic" : undefined}
            textAnchor="middle"
            fontFamily="var(--font-sans), system-ui, sans-serif"
            letterSpacing="-0.02em"
          >
            {sh.t}
          </text>
        ),
      )}
    </svg>
  );
}

/** A glyph (24 × 24 strokes) on a soft tile in its colour. */
function GlyphTile({ d, colour }: { d: string; colour: string }) {
  return (
    <span
      className="flex size-full items-center justify-center rounded-full"
      style={{
        background: `color-mix(in srgb, ${colour} 24%, var(--color-tile-2))`,
        color: `color-mix(in srgb, ${colour} 75%, white)`,
      }}
    >
      <svg
        viewBox="0 0 24 24"
        className="size-[54%]"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={d} />
      </svg>
    </span>
  );
}

/**
 * A merchant's mark on its own (the Merchants pages, the sheet): its drawn mark, or what kind of place it is, or
 * `fallback` (a category's glyph), or its first letter.
 */
export function MerchantMark({
  name,
  size = "lg",
  fallback,
  children,
}: {
  name: string;
  size?: keyof typeof SIZES;
  fallback?: { d: string; colour: string } | null;
  children?: ReactNode;
}) {
  const px = SIZES[size];
  const mark = markFor(name);
  const place = mark ? null : (placeFor(name) ?? fallback ?? null);
  let face: ReactNode;
  if (mark) {
    const text = mark.text ?? (name.match(/[A-Za-z0-9]/)?.[0] ?? "?").toUpperCase();
    const fontPx = Math.round(px * (text.length >= 3 ? 0.3 : text.length === 2 ? 0.38 : 0.48));
    face = (
      <span
        className="relative flex size-full items-center justify-center overflow-hidden rounded-full leading-none font-extrabold tracking-[-0.02em]"
        style={{
          background: mark.bg,
          color: mark.fg ?? "#fff",
          fontSize: fontPx,
          boxShadow: mark.ring ? `inset 0 0 0 1.5px ${mark.ring}` : "inset 0 0 0 1px rgb(255 255 255 / 0.08)",
        }}
      >
        {mark.art ? <Art shapes={mark.art} /> : text}
      </span>
    );
  } else if (place) {
    face = <GlyphTile d={place.d} colour={place.colour} />;
  } else {
    const plain = PLAIN[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % PLAIN.length];
    face = (
      <span
        className="flex size-full items-center justify-center rounded-full leading-none font-extrabold"
        style={{
          background: `color-mix(in srgb, ${plain} 22%, var(--color-tile-2))`,
          color: `color-mix(in srgb, ${plain} 70%, white)`,
          fontSize: Math.round(px * 0.44),
        }}
      >
        {(name.match(/[A-Za-z0-9]/)?.[0] ?? "?").toUpperCase()}
      </span>
    );
  }
  return (
    <span aria-hidden className="relative inline-flex flex-none" style={{ width: px, height: px }}>
      {face}
      {children}
    </span>
  );
}

export function MerchantIcon({ tx, size = "lg" }: { tx: Transaction; size?: "md" | "lg" }) {
  const name = (tx.merchant_name || tx.merchant || tx.description || "").trim();
  const moneyIn = tx.amount > 0;
  // Transfers between accounts and balance fixes aren't a merchant, nor is money in from someone without a mark
  // (pay, interest): their plain glyph says it best. The ATO or Medicare paying us shows its mark.
  const payer = moneyIn && !!(markFor(tx.merchant_key || "") || markFor(name));
  if (
    !payer &&
    (moneyIn || tx.kind === "adjustment" || tx.category_kind === "transfer" || tx.category_kind === "income")
  ) {
    return (
      <Chip
        g={tx.category_kind === "transfer" ? I.transfer : moneyIn ? I.pay : I.spending}
        tone={moneyIn ? "savings" : tx.category_kind === "transfer" ? "offset" : "neutral"}
        size={size}
        round
      />
    );
  }
  const px = SIZES[size];
  const b = badge(tx);
  const shown = markFor(tx.merchant_key ?? "") ? (tx.merchant_key ?? name) : name;
  // With no mark and no kind of place, the category's glyph is the face, so it needs no badge as well.
  const plainFace = !markFor(shown) && !placeFor(shown) && !!tx.category && !tx.splits?.length;
  const fallback = plainFace && b ? { d: b.d, colour: tx.category_kind === "bills" ? "#e0a21a" : "#e5508a" } : null;
  return (
    <MerchantMark name={shown} size={size} fallback={fallback}>
      {b && !plainFace && (
        <span
          className="absolute -right-1 -bottom-1 flex items-center justify-center rounded-full text-white ring-2 ring-tile"
          style={{ width: px * 0.45, height: px * 0.45, background: b.colour }}
          title={b.label}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-[64%]"
          >
            <path d={b.d} />
          </svg>
        </span>
      )}
    </MerchantMark>
  );
}
