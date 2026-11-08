/**
 * A transaction's icon: a stylised mark for the merchant (its brand colours and a monogram, so Woolworths reads as
 * Woolworths at a glance without copying anyone's logo), with the category as a small badge in the corner. A merchant
 * that isn't known gets its first letter on a tile; money in, transfers and adjustments keep their plain glyph.
 */
import type { CSSProperties } from "react";
import type { Transaction } from "~/features/common/types";
import { Chip, I } from "~/features/common/icons";
import { cn } from "~/features/common/ui";

type Mark = { bg: string; fg: string; text: string; bar?: string; ring?: string };

/** Known merchants by how their statement line starts (longest match wins), each with a stylised mark. */
const MARKS: Record<string, Mark> = {
  // Groceries
  WOOLWORTHS: { bg: "#1f8a3c", fg: "#fff", text: "W" },
  WOOLIES: { bg: "#1f8a3c", fg: "#fff", text: "W" },
  COLES: { bg: "#e01a22", fg: "#fff", text: "C" },
  ALDI: { bg: "#0b2a6f", fg: "#fff", text: "A", bar: "#f39200" },
  IGA: { bg: "#e2231a", fg: "#fff", text: "IGA" },
  HARRIS: { bg: "#2d6a2e", fg: "#fff", text: "HF" },
  COSTCO: { bg: "#0a5aa6", fg: "#fff", text: "C", bar: "#e31837" },
  // Takeaway and eating out
  MCDONALDS: { bg: "#da291c", fg: "#ffc72c", text: "M" },
  "GUZMAN Y GOMEZ": { bg: "#111111", fg: "#ffd200", text: "GYG" },
  KFC: { bg: "#c8102e", fg: "#fff", text: "KFC" },
  "HUNGRY JACKS": { bg: "#f5821f", fg: "#7a1e10", text: "HJ" },
  DOMINOS: { bg: "#006491", fg: "#fff", text: "D", bar: "#e31837" },
  "PIZZA HUT": { bg: "#c8102e", fg: "#fff", text: "PH" },
  SUBWAY: { bg: "#008938", fg: "#ffc20e", text: "S" },
  "GRILL D": { bg: "#1a1a1a", fg: "#f2b705", text: "G" },
  NANDOS: { bg: "#d7282f", fg: "#fff", text: "N" },
  OPORTO: { bg: "#e4002b", fg: "#ffd100", text: "O" },
  "RED ROOSTER": { bg: "#e4002b", fg: "#fff", text: "RR" },
  STARBUCKS: { bg: "#00704a", fg: "#fff", text: "S" },
  "GLORIA JEANS": { bg: "#4b2a1a", fg: "#fff", text: "GJ" },
  "BOOST JUICE": { bg: "#e5006d", fg: "#fff", text: "B" },
  "UBER EATS": { bg: "#06c167", fg: "#000", text: "UE" },
  DOORDASH: { bg: "#ff3008", fg: "#fff", text: "DD" },
  MENULOG: { bg: "#ff8000", fg: "#fff", text: "M" },
  // Fuel
  BP: { bg: "#009b3a", fg: "#ffe600", text: "bp" },
  AMPOL: { bg: "#1b2a6b", fg: "#fff", text: "A", bar: "#e4002b" },
  CALTEX: { bg: "#1b2a6b", fg: "#fff", text: "C", bar: "#e4002b" },
  SHELL: { bg: "#ffd500", fg: "#dd1d21", text: "S" },
  "7-ELEVEN": { bg: "#008163", fg: "#fff", text: "7", bar: "#f47b20" },
  "7 ELEVEN": { bg: "#008163", fg: "#fff", text: "7", bar: "#f47b20" },
  "UNITED PETROLEUM": { bg: "#0057a8", fg: "#fff", text: "U" },
  PUMA: { bg: "#d2232a", fg: "#fff", text: "P" },
  // Shops
  BUNNINGS: { bg: "#0d5c3b", fg: "#fff", text: "B", bar: "#d42c2c" },
  KMART: { bg: "#e4002b", fg: "#fff", text: "K" },
  TARGET: { bg: "#fff", fg: "#cc0000", text: "◎", ring: "#cc0000" },
  "BIG W": { bg: "#0055a5", fg: "#fff", text: "W" },
  "JB HI": { bg: "#ffe100", fg: "#111", text: "JB" },
  OFFICEWORKS: { bg: "#0057b8", fg: "#fff", text: "O", bar: "#e4002b" },
  "HARVEY NORMAN": { bg: "#003b71", fg: "#fff", text: "HN" },
  "THE GOOD GUYS": { bg: "#ffd200", fg: "#111", text: "GG" },
  MYER: { bg: "#111111", fg: "#fff", text: "M" },
  "DAVID JONES": { bg: "#111111", fg: "#fff", text: "DJ" },
  IKEA: { bg: "#0058a3", fg: "#ffdb00", text: "IK" },
  SMIGGLE: { bg: "#e6007e", fg: "#fff", text: "S", bar: "#00b5e2" },
  "CHEMIST WAREHOUSE": { bg: "#e30613", fg: "#ffe500", text: "CW" },
  PRICELINE: { bg: "#e5007e", fg: "#fff", text: "P" },
  SPOTLIGHT: { bg: "#e4002b", fg: "#fff", text: "S" },
  REBEL: { bg: "#e4002b", fg: "#fff", text: "r" },
  AMAZON: { bg: "#131921", fg: "#fff", text: "a", bar: "#ff9900" },
  EBAY: { bg: "#fff", fg: "#0064d2", text: "e", ring: "#e53238" },
  // Drinks
  "DAN MURPHYS": { bg: "#0f4c2e", fg: "#fff", text: "DM" },
  BWS: { bg: "#e4002b", fg: "#fff", text: "BWS" },
  LIQUORLAND: { bg: "#c8102e", fg: "#fff", text: "L" },
  // Subscriptions and online
  NETFLIX: { bg: "#000", fg: "#e50914", text: "N" },
  SPOTIFY: { bg: "#1db954", fg: "#000", text: "S" },
  "DISNEY PLUS": { bg: "#0b1a4a", fg: "#fff", text: "D+" },
  DISNEY: { bg: "#0b1a4a", fg: "#fff", text: "D+" },
  STAN: { bg: "#0071eb", fg: "#fff", text: "S" },
  BINGE: { bg: "#111", fg: "#ff4d6d", text: "B" },
  KAYO: { bg: "#111", fg: "#00e676", text: "K" },
  YOUTUBE: { bg: "#ff0000", fg: "#fff", text: "▶" },
  "APPLE.COM": { bg: "#1d1d1f", fg: "#fff", text: "A" },
  APPLE: { bg: "#1d1d1f", fg: "#fff", text: "A" },
  GOOGLE: { bg: "#fff", fg: "#4285f4", text: "G", ring: "#34a853" },
  STEAMGAMES: { bg: "#1b2838", fg: "#66c0f4", text: "S" },
  STEAM: { bg: "#1b2838", fg: "#66c0f4", text: "S" },
  PLAYSTATION: { bg: "#003791", fg: "#fff", text: "PS" },
  XBOX: { bg: "#107c10", fg: "#fff", text: "X" },
  NINTENDO: { bg: "#e60012", fg: "#fff", text: "N" },
  PAYPAL: { bg: "#003087", fg: "#fff", text: "P", bar: "#009cde" },
  AFTERPAY: { bg: "#b2fce4", fg: "#000", text: "A" },
  UBER: { bg: "#000", fg: "#fff", text: "U" },
  // Going out and travel
  "EVENT CINEMAS": { bg: "#d50032", fg: "#fff", text: "E" },
  HOYTS: { bg: "#e4002b", fg: "#fff", text: "H" },
  QANTAS: { bg: "#e40000", fg: "#fff", text: "Q" },
  VIRGIN: { bg: "#e10a0a", fg: "#fff", text: "V" },
  JETSTAR: { bg: "#ff5115", fg: "#fff", text: "J" },
  AIRBNB: { bg: "#ff5a5f", fg: "#fff", text: "A" },
  TRANSLINK: { bg: "#0072ce", fg: "#fff", text: "go" },
  LINKT: { bg: "#5b2d90", fg: "#fff", text: "L" },
  // Phone and internet
  TELSTRA: { bg: "#0d54ff", fg: "#fff", text: "T" },
  OPTUS: { bg: "#00b2a9", fg: "#ffd100", text: "O" },
  VODAFONE: { bg: "#e60000", fg: "#fff", text: "V" },
};
const KEYS = Object.keys(MARKS).sort((a, b) => b.length - a.length);

export function markFor(merchant: string): Mark | null {
  const m = merchant.toUpperCase().replace(/'/g, "");
  const key = KEYS.find((k) => m === k || m.startsWith(k + " ") || (k.length >= 5 && m.startsWith(k)));
  return key ? MARKS[key] : null;
}

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
  const d = BADGES.find(([re]) => re.test(tx.category ?? ""))?.[1] ?? TAG;
  const colour = tx.category_kind === "bills" ? "var(--color-bills-fill)" : "var(--color-spending-fill)";
  return { d, colour, label: tx.category };
}

/** Tile colours for a merchant nobody's described: a calm one picked by its name, so it's the same every time. */
const PLAIN = ["#5b6ee1", "#2f9e8f", "#c2683b", "#8d5bd6", "#3a8fd1", "#b4507a", "#6f8f2f", "#a7802a"];

const SIZES = { md: 32, lg: 40 } as const;

export function MerchantIcon({ tx, size = "lg" }: { tx: Transaction; size?: keyof typeof SIZES }) {
  const name = (tx.merchant || tx.description || "").trim();
  const moneyIn = tx.amount > 0;
  // Money in, transfers between accounts and balance fixes aren't a merchant: their plain glyph says it best.
  if (moneyIn || tx.kind === "adjustment" || tx.category_kind === "transfer" || tx.category_kind === "income") {
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
  const mark = markFor(name);
  const letter = (name.match(/[A-Za-z0-9]/)?.[0] ?? "?").toUpperCase();
  const plain = PLAIN[[...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % PLAIN.length];
  const text = mark?.text ?? letter;
  const tile: CSSProperties = mark
    ? {
        background: mark.bg,
        color: mark.fg,
        boxShadow: mark.ring ? `inset 0 0 0 2px ${mark.ring}` : "inset 0 0 0 1px rgb(255 255 255 / 0.08)",
      }
    : {
        background: `color-mix(in srgb, ${plain} 22%, var(--color-tile-2))`,
        color: `color-mix(in srgb, ${plain} 70%, white)`,
      };
  const b = badge(tx);
  const fontPx = Math.round(px * (text.length >= 3 ? 0.3 : text.length === 2 ? 0.38 : 0.48));
  return (
    <span aria-hidden className="relative inline-flex flex-none" style={{ width: px, height: px }}>
      <span
        className="relative flex size-full items-center justify-center overflow-hidden rounded-full leading-none font-extrabold tracking-[-0.02em]"
        style={{ ...tile, fontSize: fontPx }}
      >
        {text}
        {mark?.bar && (
          <i className="absolute inset-x-0 bottom-0 block h-[18%] rounded-b-full" style={{ background: mark.bar }} />
        )}
      </span>
      {b && (
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
            className={cn("size-[64%]")}
          >
            <path d={b.d} />
          </svg>
        </span>
      )}
    </span>
  );
}
