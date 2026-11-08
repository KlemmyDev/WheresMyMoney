/**
 * Stylised merchant marks: each known merchant drawn small and simple in its colours (arches for McDonald's, a shell for
 * Shell, a bullseye for Target), so a transaction reads at a glance. They're impressions, not the companies' logos.
 *
 * Art is drawn on a 32 × 32 circle. A shape is a path (`d`, filled or stroked) or a bit of text (`t`). A merchant with
 * no art shows its `text` instead. For a merchant that isn't known, `placeFor` picks a glyph from words in its name
 * (GYM, INSURANCE, WATER…) so it still says what kind of place it is.
 */

import { MORE_MARKS } from "~/features/spending/merchantMarksAu";

export type Shape =
  | { d: string; fill?: string; stroke?: string; w?: number }
  | { t: string; x?: number; y?: number; s?: number; fill: string; weight?: number; italic?: boolean };

export type Mark = { bg: string; fg?: string; text?: string; art?: Shape[]; ring?: string };

/** A circle as a path. */
const o = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0z`;
/** A five-pointed star. */
const star = (cx: number, cy: number, r: number) => {
  const pts = Array.from({ length: 10 }, (_, i) => {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    return `${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`;
  });
  return `M${pts.join("L")}z`;
};
/** Petal lines from the middle, for a sunflower. */
const rays = (n: number, r0: number, r1: number) =>
  Array.from({ length: n }, (_, i) => {
    const a = ((Math.PI * 2) / n) * i;
    return `M${(16 + r0 * Math.cos(a)).toFixed(2)} ${(16 + r0 * Math.sin(a)).toFixed(2)}L${(16 + r1 * Math.cos(a)).toFixed(2)} ${(16 + r1 * Math.sin(a)).toFixed(2)}`;
  }).join("");
const W = "#fff";
const word = (t: string, fill: string, s = 9, y = 19.2, weight = 800): Shape => ({ t, fill, s, y, weight });

export const MARKS: Record<string, Mark> = {
  // -- Groceries
  WOOLWORTHS: {
    bg: "#178841",
    art: [
      {
        d: "M8.5 12.5c1.4 6.5 2.7 9.5 4 9.5 1.2 0 2-3 3.5-6.4 1.5 3.4 2.3 6.4 3.5 6.4 1.3 0 2.6-3 4-9.5",
        stroke: W,
        w: 2.6,
      },
      { d: "M16 10.6c.4-2.2 2.2-3.6 4.6-3.4-.4 2.2-2.2 3.5-4.6 3.4z", fill: "#8fd16a" },
    ],
  },
  COLES: { bg: "#e01a22", art: [{ d: "M21.6 11.6a7 7 0 1 0 0 8.8", stroke: W, w: 3.6 }] },
  ALDI: {
    bg: "#0b2a6f",
    art: [
      { d: "M9 8.5h14v15H9z", stroke: W, w: 1.4 },
      { d: "M11.5 21.5l3.5-11", stroke: "#00b5e2", w: 1.8 },
      { d: "M14.2 21.5l3.5-11", stroke: "#ffd100", w: 1.8 },
      { d: "M16.9 21.5l3.5-11", stroke: "#f39200", w: 1.8 },
      { d: "M19.6 21.5l2-6.3", stroke: "#e2001a", w: 1.8 },
    ],
  },
  IGA: { bg: "#e2231a", art: [word("IGA", W, 9.5)] },
  COSTCO: { bg: "#e31837", art: [{ d: "M7 13h18v6H7z", fill: "#0a5aa6" }, word("C", W, 8, 18.6)] },
  "HARRIS FARM": {
    bg: "#2d6a2e",
    art: [
      {
        d: "M16 23c-5 0-7-4-7-7.5 3.5 0 6 1.5 7 4 1-2.5 3.5-4 7-4 0 3.5-2 7.5-7 7.5zM16 19V9",
        stroke: "#cde77f",
        w: 1.8,
      },
    ],
  },
  FOODWORKS: { bg: "#d6001c", art: [word("FW", W, 9)] },
  SPAR: { bg: "#00843d", art: [{ d: "M7 10h18v12H7z", fill: "#e30613" }, word("SPAR", W, 6.5, 18.3)] },
  // -- Cakes and parties (The Cheesecake Shop: dark green on mint, after its 2023 look)
  "CHEESECAKE SHOP": {
    bg: "#d3f0df",
    ring: "#0f4d32",
    art: [
      { d: "M7.5 15.5L19.5 10l5 3.6-12 5.9z", fill: "#fff6e3", stroke: "#0f4d32", w: 1.2 },
      { d: "M7.5 15.5v5.2l5 3.7v-4.9z", fill: "#f1cf8f", stroke: "#0f4d32", w: 1.2 },
      { d: "M12.5 19.5v4.9l12-5.9v-4.9z", fill: "#f6dcaa", stroke: "#0f4d32", w: 1.2 },
      { d: "M7.5 20.7l5 3.7 12-5.9", stroke: "#0f4d32", w: 2 },
      { d: o(18.6, 12.4, 1.7), fill: "#e0405e" },
    ],
  },
  "THE CHEESECAKE SHOP": {
    bg: "#d3f0df",
    ring: "#0f4d32",
    art: [
      { d: "M7.5 15.5L19.5 10l5 3.6-12 5.9z", fill: "#fff6e3", stroke: "#0f4d32", w: 1.2 },
      { d: "M7.5 15.5v5.2l5 3.7v-4.9z", fill: "#f1cf8f", stroke: "#0f4d32", w: 1.2 },
      { d: "M12.5 19.5v4.9l12-5.9v-4.9z", fill: "#f6dcaa", stroke: "#0f4d32", w: 1.2 },
      { d: "M7.5 20.7l5 3.7 12-5.9", stroke: "#0f4d32", w: 2 },
      { d: o(18.6, 12.4, 1.7), fill: "#e0405e" },
    ],
  },
  "PARTY CITY": {
    bg: "#5b2c86",
    art: [
      {
        d: "M16 7a5 5 0 0 1 5 5c0 3.4-2.8 5.8-5 5.8S11 15.4 11 12a5 5 0 0 1 5-5zM16 17.8l-1 1.8h2zM16 19.6c0 2-2 2.6-1 4.4",
        stroke: "#ffd23f",
        w: 1.6,
      },
    ],
  },
  // -- Takeaway, cafes and eating out
  MCDONALDS: {
    bg: "#da291c",
    art: [
      {
        d: "M8 23v-8c0-4 1.6-6.5 3.2-6.5s3.2 2.5 4.8 7.5c1.6-5 3.2-7.5 4.8-7.5S24 11 24 15v8",
        stroke: "#ffc72c",
        w: 3,
      },
    ],
  },
  MACCAS: {
    bg: "#da291c",
    art: [
      {
        d: "M8 23v-8c0-4 1.6-6.5 3.2-6.5s3.2 2.5 4.8 7.5c1.6-5 3.2-7.5 4.8-7.5S24 11 24 15v8",
        stroke: "#ffc72c",
        w: 3,
      },
    ],
  },
  KFC: {
    bg: "#a6192e",
    art: [
      { d: "M10 8h2.6v6H10zM14.7 8h2.6v6h-2.6zM19.4 8H22v6h-2.6z", fill: W },
      { d: "M9 15.5h14l-1.6 8.5H10.6z", fill: W },
      word("KFC", "#a6192e", 5.6, 21.6),
    ],
  },
  "HUNGRY JACKS": {
    bg: "#273d8f",
    art: [
      { d: "M8 15a8 6.5 0 0 1 16 0z", fill: "#f5821f" },
      { d: "M8 16.2h16v1.6H8z", fill: "#d62300" },
      { d: "M8 19h16a3 3 0 0 1-3 3H11a3 3 0 0 1-3-3z", fill: "#f5821f" },
    ],
  },
  DOMINOS: {
    bg: "#ffffff",
    ring: "#dfe7ee",
    art: [
      { d: "M13 6.5l6.5 6.5-6.5 6.5L6.5 13z", fill: "#006491" },
      { d: "M19 12.5l6.5 6.5-6.5 6.5-6.5-6.5z", fill: "#e31837" },
      { d: `${o(11.6, 13, 1.3)}${o(14.4, 13, 1.3)}${o(19, 19, 1.3)}`, fill: W },
    ],
  },
  "PIZZA HUT": {
    bg: "#c8102e",
    art: [
      { d: "M6.5 18c3-6.5 6.2-9 9.5-9s6.5 2.5 9.5 9c-3-1.2-6.2-1.8-9.5-1.8S9.5 16.8 6.5 18z", fill: W },
      word("Hut", W, 6, 23.5, 700),
    ],
  },
  SUBWAY: {
    bg: "#008938",
    art: [
      { d: "M8 13h14.5l-3-3", stroke: "#ffc20e", w: 2.6 },
      { d: "M24 19H9.5l3 3", stroke: W, w: 2.6 },
    ],
  },
  "GUZMAN Y GOMEZ": { bg: "#111111", art: [word("GYG", "#ffd200", 9)] },
  "GRILL D": { bg: "#1a1a1a", art: [{ d: "M8 12h16M8 16h16M8 20h16", stroke: "#f2b705", w: 2 }] },
  NANDOS: {
    bg: "#d7282f",
    art: [{ d: "M11 22c0-5 2-9 5-11 0 2 1 3 2 3.5 1.5-1 2-3 1.5-5 3 2 4 6 3.5 9.5-.5 2-2 3-4 3h-8z", fill: W }],
  },
  OPORTO: { bg: "#e4002b", art: [{ d: o(16, 16, 7), fill: "#ffd100" }, word("O", "#e4002b", 9, 19.3)] },
  "RED ROOSTER": {
    bg: "#e4002b",
    art: [{ d: "M12 22c-1-4 0-8 4-10l-1-3 3 2 2-2v3c2 1 3 4 2 7-1 2-3 3-5 3z", fill: W }],
  },
  STARBUCKS: {
    bg: "#00704a",
    art: [
      { d: o(16, 16, 8.5), stroke: W, w: 1.8 },
      { d: star(16, 16, 4.6), fill: W },
    ],
  },
  "GLORIA JEANS": { bg: "#4b2a1a", art: [word("GJ", "#f4e3c1", 9)] },
  "BOOST JUICE": {
    bg: "#e5006d",
    art: [
      { d: "M11 9h10l-1.5 15h-7z", fill: W },
      { d: "M17 9l2-4", stroke: W, w: 1.6 },
    ],
  },
  "MUFFIN BREAK": { bg: "#e4002b", art: [{ d: "M10 16a6 5 0 0 1 12 0zM10.5 17h11l-1.5 6h-8z", fill: W }] },
  "DONUT KING": { bg: "#ff5fa2", art: [{ d: `${o(16, 16, 7.5)}${o(16, 16, 2.6)}`, fill: W }] },
  "TACO BELL": {
    bg: "#702082",
    art: [{ d: "M16 8c3.5 0 5.5 3 5.5 7v4l2 2.5h-15l2-2.5v-4c0-4 2-7 5.5-7zM14 23.5a2 2 0 0 0 4 0", fill: W }],
  },
  ZAMBRERO: { bg: "#e4572e", art: [word("Z", W, 12, 20.2)] },
  "MAD MEX": { bg: "#00a650", art: [word("MM", W, 8.5)] },
  CHATIME: { bg: "#5b2c86", art: [{ d: "M11 10h10l-1.6 13.5h-6.8zM15 10l1.5-4", stroke: W, w: 1.6 }] },
  "GONG CHA": { bg: "#b5121b", art: [word("貢", W, 10, 19.5, 700)] },
  "UBER EATS": { bg: "#000000", art: [word("Uber", W, 6.6, 15), word("Eats", "#06c167", 6.6, 22)] },
  DOORDASH: {
    bg: "#ff3008",
    art: [{ d: "M6 12h11.5a4 4 0 0 1 0 8H12l2-2.6h3.6a1.4 1.4 0 0 0 0-2.8H6.8z", fill: W }],
  },
  MENULOG: { bg: "#ff8000", art: [{ d: "M8 18a8 8 0 0 1 16 0zM7 19.5h18", stroke: W, w: 2 }] },
  // -- Fuel
  BP: {
    bg: "#009b3a",
    art: [
      { d: o(16, 16, 10), fill: "#7fc243" },
      { d: o(16, 16, 6.8), fill: "#ffe600" },
      { d: o(16, 16, 3.4), fill: W },
      { d: rays(12, 3.4, 10.5), stroke: "#009b3a", w: 1.2 },
    ],
  },
  SHELL: {
    bg: "#ffd500",
    art: [
      { d: "M16 24.5l-7.2-3.2C7.8 15 10.6 9.6 16 8.6c5.4 1 8.2 6.4 7.2 12.7z", fill: "#dd1d21" },
      { d: "M16 24.5L10.3 14M16 24.5L13 10.4M16 24.5V9M16 24.5l3-14.1M16 24.5L21.7 14", stroke: "#ffd500", w: 1.1 },
    ],
  },
  AMPOL: {
    bg: "#ffffff",
    ring: "#dfe3ef",
    art: [
      { d: "M8 22.5l8-14 8 14h-4.4L16 15.6l-3.6 6.9z", fill: "#e4002b" },
      { d: "M9 24.5h14", stroke: "#1b2a6b", w: 1.6 },
    ],
  },
  CALTEX: {
    bg: "#ffffff",
    ring: "#dfe3ef",
    art: [
      { d: o(16, 16, 9), stroke: "#e4002b", w: 2.4 },
      { d: star(16, 16.4, 5.4), fill: "#e4002b" },
    ],
  },
  "7-ELEVEN": {
    bg: "#ffffff",
    ring: "#dfe7e3",
    art: [
      { d: "M7 11h18v2.4H7z", fill: "#f47b20" },
      { d: "M7 14.8h18v2.4H7z", fill: "#008163" },
      { d: "M7 18.6h18V21H7z", fill: "#e4002b" },
      { d: "M11.5 8h9.5L15 24.5", stroke: "#008163", w: 3 },
    ],
  },
  "UNITED PETROLEUM": { bg: "#0057a8", art: [word("U", "#ffd100", 12, 20.4)] },
  PUMA: { bg: "#d2232a", art: [word("P", W, 12, 20.4)] },
  LIBERTY: { bg: "#ef3e42", art: [star(16, 16, 7)].map((d) => ({ d, fill: W })) },
  "REDDY EXPRESS": { bg: "#e4002b", art: [word("R", W, 12, 20.4)] },
  "EG ": { bg: "#003da5", art: [word("EG", W, 10)] },
  MOBIL: {
    bg: "#ffffff",
    ring: "#dfe3ef",
    art: [word("Mobil", "#0a3d91", 7, 18.6), { d: o(17.6, 16.4, 1.6), fill: "#e4002b" }],
  },
  // -- Shops
  BUNNINGS: {
    bg: "#0d5c3b",
    art: [
      { d: "M9 9h10.5v4.2H9z", fill: W },
      { d: "M19.5 9l3.6 2.1-3.6 2.1z", fill: W },
      { d: "M13 13.2h2.6v11H13z", fill: "#e03c31" },
    ],
  },
  KMART: { bg: "#e4002b", art: [{ d: "M11 8v16M11 16.5L20.5 8M13.6 14.2L21 24", stroke: W, w: 3.2 }] },
  TARGET: {
    bg: "#ffffff",
    ring: "#f2d4d4",
    art: [
      { d: o(16, 16, 8.6), stroke: "#cc0000", w: 3.4 },
      { d: o(16, 16, 3.2), fill: "#cc0000" },
    ],
  },
  "BIG W": { bg: "#0055a5", art: [{ d: "M7 10.5l3.5 11.5 5.5-8.6 5.5 8.6L25 10.5", stroke: W, w: 3 }] },
  "JB HI": { bg: "#ffe100", art: [word("JB", "#111", 11, 19.8, 900)] },
  OFFICEWORKS: {
    bg: "#0057b8",
    art: [
      { d: o(16, 16, 6.6), stroke: W, w: 3.2 },
      { d: "M7 24h18", stroke: "#e4002b", w: 2 },
    ],
  },
  "HARVEY NORMAN": { bg: "#003b71", art: [word("HN", W, 9.5)] },
  "THE GOOD GUYS": { bg: "#ffd200", art: [word("GG", "#111", 10, 19.5, 900)] },
  MYER: { bg: "#111111", art: [word("MYER", W, 7, 18.6, 600)] },
  "DAVID JONES": { bg: "#111111", art: [word("DJ", W, 10, 19.6, 500)] },
  IKEA: {
    bg: "#0058a3",
    art: [
      { d: "M5.5 16a10.5 6.6 0 1 0 21 0a10.5 6.6 0 1 0-21 0z", fill: "#ffdb00" },
      word("IKEA", "#0058a3", 6.4, 18.3, 900),
    ],
  },
  SMIGGLE: {
    bg: "#e6007e",
    art: [{ d: "M20.5 11c-1.5-2-7-2.4-7.5.6-.5 3.4 7.6 2.4 7 6.4-.5 3.4-6.6 3-8.2.6", stroke: W, w: 2.6 }],
  },
  "CHEMIST WAREHOUSE": {
    bg: "#ffe500",
    art: [
      { d: "M7 10h18v12H7z", fill: "#e30613" },
      word("CW", W, 8.5, 19),
      { d: "M7 22h18", stroke: "#0055a5", w: 1.6 },
    ],
  },
  PRICELINE: { bg: "#e5007e", art: [{ d: "M12 9h5a4 4 0 0 1 0 8h-5M12 9v14", stroke: W, w: 2.8 }] },
  "TERRY WHITE": { bg: "#e4002b", art: [word("TW", W, 9.5)] },
  SPOTLIGHT: { bg: "#e4002b", art: [{ d: star(16, 16, 7.5), fill: W }] },
  REBEL: { bg: "#e4002b", art: [word("r", W, 15, 20.5, 900)] },
  BCF: { bg: "#0f2d52", art: [word("BCF", "#f8b500", 8.5)] },
  "SUPERCHEAP AUTO": {
    bg: "#e4002b",
    art: [{ d: "M8 12h16v8H8z", fill: "#ffd100" }, word("SCA", "#e4002b", 6.8, 18.4)],
  },
  REPCO: { bg: "#0033a0", art: [word("Repco", W, 6.8, 18.5)] },
  ANACONDA: { bg: "#004b23", art: [{ d: "M8 21c3-8 6 4 8-4s5 4 8-4", stroke: "#a6ce39", w: 2.4 }] },
  "BEST & LESS": { bg: "#e5007e", art: [word("B&L", W, 8)] },
  "COTTON ON": { bg: "#111111", art: [word("CO", W, 10, 19.6, 600)] },
  UNIQLO: { bg: "#ff0000", art: [{ d: "M8 8h16v16H8z", fill: "#ff0000", stroke: W, w: 1 }, word("UQ", W, 8.5, 19)] },
  PETSTOCK: {
    bg: "#f26b21",
    art: [
      {
        d: `M16 23c-3 0-5-1.4-5-3.4s2.2-4.6 5-4.6 5 2.6 5 4.6-2 3.4-5 3.4z${o(10.5, 13.5, 1.8)}${o(14, 10, 1.8)}${o(18, 10, 1.8)}${o(21.5, 13.5, 1.8)}`,
        fill: W,
      },
    ],
  },
  AMAZON: {
    bg: "#131921",
    art: [word("a", W, 12, 17.5), { d: "M9.5 20.5c4 2.7 9 2.7 13 0M20.6 19.4l2 1.1-.8 2", stroke: "#ff9900", w: 1.8 }],
  },
  EBAY: {
    bg: "#ffffff",
    ring: "#e5e5e5",
    art: [
      { t: "e", x: 8.6, y: 19.5, s: 9, fill: "#e53238", weight: 700 },
      { t: "b", x: 13.4, y: 19.5, s: 9, fill: "#0064d2", weight: 700 },
      { t: "a", x: 18.2, y: 19.5, s: 9, fill: "#f5af02", weight: 700 },
      { t: "y", x: 23, y: 19.5, s: 9, fill: "#86b817", weight: 700 },
    ],
  },
  CATCH: { bg: "#e71d73", art: [word("catch", W, 6.6, 18.4)] },
  TEMU: { bg: "#fb7701", art: [word("TEMU", W, 6.6, 18.4)] },
  SHEIN: { bg: "#111111", art: [word("SHEIN", W, 5.8, 18.2)] },
  "AUSTRALIA POST": {
    bg: "#dc1928",
    art: [
      { d: o(16, 16, 8), stroke: W, w: 2 },
      { d: "M13.5 21V11h3.3a3 3 0 0 1 0 6h-3.3", stroke: W, w: 2.2 },
    ],
  },
  AUSPOST: {
    bg: "#dc1928",
    art: [
      { d: o(16, 16, 8), stroke: W, w: 2 },
      { d: "M13.5 21V11h3.3a3 3 0 0 1 0 6h-3.3", stroke: W, w: 2.2 },
    ],
  },
  // -- Drinks
  "DAN MURPHYS": { bg: "#0f4c2e", art: [word("DM", "#f2e6c9", 10, 19.6, 700)] },
  BWS: { bg: "#e4002b", art: [word("BWS", W, 9)] },
  LIQUORLAND: { bg: "#c8102e", art: [{ d: "M14 8h4v4l2 3v9h-8v-9l2-3z", fill: W }] },
  // -- Who pays us: tax refunds, rebates and benefits
  ATO: {
    bg: "#0b2c5f",
    art: [
      {
        d: "M8 20.5h16M9.5 20.5v-6.5M13 20.5v-6.5M16 20.5v-6.5M19 20.5v-6.5M22.5 20.5v-6.5M7.5 13L16 8l8.5 5z",
        stroke: "#e7c46b",
        w: 1.6,
      },
    ],
  },
  "AUSTRALIAN TAXATION": {
    bg: "#0b2c5f",
    art: [
      {
        d: "M8 20.5h16M9.5 20.5v-6.5M13 20.5v-6.5M16 20.5v-6.5M19 20.5v-6.5M22.5 20.5v-6.5M7.5 13L16 8l8.5 5z",
        stroke: "#e7c46b",
        w: 1.6,
      },
    ],
  },
  MEDICARE: {
    bg: "#00843d",
    art: [{ d: "M8 21c3-8 5-9 8-3s5 4 8-5", stroke: "#ffd100", w: 2.6 }, word("M", W, 7, 13.5)],
  },
  CENTRELINK: { bg: "#e4002b", art: [{ d: o(16, 16, 7.5), stroke: W, w: 2 }, word("C", W, 9, 19.2)] },
  "SERVICES AUSTRALIA": {
    bg: "#1b365d",
    art: [{ d: "M9 22c2-6 12-6 14 0M16 9.5a3.2 3.2 0 1 1 0 6.4 3.2 3.2 0 0 1 0-6.4z", stroke: W, w: 1.8 }],
  },
  MYGOV: { bg: "#1b365d", art: [word("my", W, 8, 15), word("Gov", "#9fd3ff", 7.5, 22)] },
  // -- Payments that don't say who to
  BPAY: { bg: "#1d2f6f", art: [{ d: "M7 10h18v12H7z", fill: "#5a3bd6" }, word("BPAY", W, 6.4, 18.3)] },
  "INTERNET BPAY": { bg: "#1d2f6f", art: [{ d: "M7 10h18v12H7z", fill: "#5a3bd6" }, word("BPAY", W, 6.4, 18.3)] },
  // -- Subscriptions, games and online
  NETFLIX: { bg: "#000000", art: [{ d: "M10.5 7h3.8l3.4 9.5V7h3.8v18h-3.8l-3.4-9.5V25h-3.8z", fill: "#e50914" }] },
  SPOTIFY: {
    bg: "#121212",
    art: [
      { d: o(16, 16, 10), fill: "#1ed760" },
      { d: "M10 13c4-1.4 8.8-1 12.6 1", stroke: "#121212", w: 2.1 },
      { d: "M10.8 16.6c3.4-1 7-.7 10 .9", stroke: "#121212", w: 1.8 },
      { d: "M11.6 20c2.6-.7 5.4-.5 7.6.7", stroke: "#121212", w: 1.5 },
    ],
  },
  "DISNEY PLUS": {
    bg: "#0b1a4a",
    art: [{ d: "M6.5 19.5C9 12 20 9.5 25.5 16", stroke: "#bfe3ff", w: 1.4 }, word("D+", W, 8.5, 21)],
  },
  DISNEY: {
    bg: "#0b1a4a",
    art: [{ d: "M6.5 19.5C9 12 20 9.5 25.5 16", stroke: "#bfe3ff", w: 1.4 }, word("D+", W, 8.5, 21)],
  },
  STAN: { bg: "#0071eb", art: [word("stan", W, 8, 18.8)] },
  BINGE: { bg: "#111111", art: [word("B", "#ff4d6d", 12, 20.2)] },
  KAYO: { bg: "#111111", art: [word("K", "#00e676", 12, 20.2)] },
  PARAMOUNT: { bg: "#0064ff", art: [{ d: "M7 21l5-7 3 3 4-6 6 10z", fill: W }] },
  YOUTUBE: {
    bg: "#ffffff",
    ring: "#f1d3d3",
    art: [
      { d: "M6.5 11.6a3 3 0 0 1 3-3h13a3 3 0 0 1 3 3v8.8a3 3 0 0 1-3 3h-13a3 3 0 0 1-3-3z", fill: "#ff0000" },
      { d: "M14 12.5v7l6-3.5z", fill: W },
    ],
  },
  APPLE: {
    bg: "#1d1d1f",
    art: [
      {
        d: "M16 11.6c-2.2-1.6-6.4-1-6.9 3.6-.5 4.2 2.1 9.1 4.6 9.1 1 0 1.5-.5 2.3-.5s1.3.5 2.3.5c2.5 0 5.1-4.9 4.6-9.1-.5-4.6-4.7-5.2-6.9-3.6z",
        fill: W,
      },
      { d: "M16.1 10.6c0-2 1.5-3.6 3.4-3.8 0 2-1.5 3.6-3.4 3.8z", fill: W },
      { d: o(23.2, 14.2, 2.2), fill: "#1d1d1f" },
    ],
  },
  "APPLE.COM": {
    bg: "#1d1d1f",
    art: [
      {
        d: "M16 11.6c-2.2-1.6-6.4-1-6.9 3.6-.5 4.2 2.1 9.1 4.6 9.1 1 0 1.5-.5 2.3-.5s1.3.5 2.3.5c2.5 0 5.1-4.9 4.6-9.1-.5-4.6-4.7-5.2-6.9-3.6z",
        fill: W,
      },
      { d: "M16.1 10.6c0-2 1.5-3.6 3.4-3.8 0 2-1.5 3.6-3.4 3.8z", fill: W },
      { d: o(23.2, 14.2, 2.2), fill: "#1d1d1f" },
    ],
  },
  GOOGLE: {
    bg: "#ffffff",
    ring: "#e5e5e5",
    art: [
      { d: "M10.6 12.4a7 7 0 0 1 10.6-1.9", stroke: "#ea4335", w: 3.2 },
      { d: "M10.4 19.6a7 7 0 0 1 0-7.2", stroke: "#fbbc05", w: 3.2 },
      { d: "M21.6 20.8a7 7 0 0 1-11.2-1.2", stroke: "#34a853", w: 3.2 },
      { d: "M23 16a7 7 0 0 1-1.4 4.8M16.4 16H23", stroke: "#4285f4", w: 3.2 },
    ],
  },
  MICROSOFT: {
    bg: "#ffffff",
    ring: "#e5e5e5",
    art: [
      { d: "M8.5 8.5h6.8v6.8H8.5z", fill: "#f25022" },
      { d: "M16.7 8.5h6.8v6.8h-6.8z", fill: "#7fba00" },
      { d: "M8.5 16.7h6.8v6.8H8.5z", fill: "#00a4ef" },
      { d: "M16.7 16.7h6.8v6.8h-6.8z", fill: "#ffb900" },
    ],
  },
  STEAMGAMES: {
    bg: "#1b2838",
    art: [
      { d: o(19.5, 13, 4), stroke: W, w: 2 },
      { d: o(11.5, 20, 2.6), fill: W },
      { d: "M13.6 18.6l3.4-2.6", stroke: W, w: 2.4 },
    ],
  },
  STEAM: {
    bg: "#1b2838",
    art: [
      { d: o(19.5, 13, 4), stroke: W, w: 2 },
      { d: o(11.5, 20, 2.6), fill: W },
      { d: "M13.6 18.6l3.4-2.6", stroke: W, w: 2.4 },
    ],
  },
  PLAYSTATION: { bg: "#003791", art: [word("PS", W, 10, 19.6, 900)] },
  XBOX: {
    bg: "#107c10",
    art: [
      { d: o(16, 16, 9), stroke: W, w: 1.8 },
      { d: "M11.2 10.6c3 2 7 7 9.6 11M20.8 10.6c-3 2-7 7-9.6 11", stroke: W, w: 2.4 },
    ],
  },
  NINTENDO: {
    bg: "#e60012",
    art: [
      { d: "M7 12a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H11a4 4 0 0 1-4-4z", stroke: W, w: 1.6 },
      word("N", W, 9, 19.3),
    ],
  },
  PAYPAL: {
    bg: "#ffffff",
    ring: "#dfe6f2",
    art: [
      { t: "P", x: 14.8, y: 21.5, s: 15, fill: "#009cde", weight: 900, italic: true },
      { t: "P", x: 16.8, y: 20, s: 15, fill: "#003087", weight: 900, italic: true },
    ],
  },
  AFTERPAY: {
    bg: "#b2fce4",
    art: [
      { d: "M8.5 16l4-4.5h7l4 4.5-4 4.5h-7z", stroke: "#000", w: 2.4 },
      { d: "M13.5 16h5", stroke: "#000", w: 2.4 },
    ],
  },
  ZIP: { bg: "#411361", art: [word("zip", "#aa8fff", 9, 18.5)] },
  UBER: { bg: "#000000", art: [word("Uber", W, 7.6, 18.6, 600)] },
  DIDI: { bg: "#ff7d41", art: [word("DiDi", W, 7.4, 18.6)] },
  // -- Going out and travel
  "EVENT CINEMAS": { bg: "#d50032", art: [{ d: "M8 10h16v12H8zM8 14h16M12 10v4M16 10v4M20 10v4", stroke: W, w: 1.6 }] },
  HOYTS: { bg: "#e4002b", art: [{ d: "M8 10h16v12H8zM8 14h16M12 10v4M16 10v4M20 10v4", stroke: W, w: 1.6 }] },
  QANTAS: {
    bg: "#e40000",
    art: [
      {
        d: "M9 23c2-1.4 3.6-3.6 4.5-6.4L11.8 13l3 1.2c1.8-1.2 4-1.2 5.4-.2l2.2-2.4-.4 3.2c1 1.2 1 3.2 0 4.4l3 3.6h-2.4l-2.8-2.4c-2 1-4.8 1-6.8 0z",
        fill: W,
      },
    ],
  },
  "VIRGIN AUSTRALIA": { bg: "#e10a0a", art: [{ t: "V", x: 16, y: 21, s: 15, fill: W, weight: 700, italic: true }] },
  VIRGIN: { bg: "#e10a0a", art: [{ t: "V", x: 16, y: 21, s: 15, fill: W, weight: 700, italic: true }] },
  JETSTAR: { bg: "#0a1e3c", art: [{ d: star(16, 16.5, 8), fill: "#ff5115" }] },
  AIRBNB: {
    bg: "#ff5a5f",
    art: [
      {
        d: "M16 7.5c-1 0-1.6.6-2.3 2L8.8 19.6c-1.2 2.7.6 5 2.9 5 1.6 0 2.9-.9 4.3-2.5 1.4 1.6 2.7 2.5 4.3 2.5 2.3 0 4.1-2.3 2.9-5L18.3 9.5c-.7-1.4-1.3-2-2.3-2zM16 21c-1.6-2-2.5-3.7-2.5-5a2.5 2.5 0 0 1 5 0c0 1.3-.9 3-2.5 5z",
        stroke: W,
        w: 1.6,
      },
    ],
  },
  "BOOKING.COM": { bg: "#003580", art: [word("B.", W, 11, 20)] },
  TRANSLINK: { bg: "#0072ce", art: [word("go", W, 11, 19.5)] },
  LINKT: { bg: "#5b2d90", art: [{ d: "M9 22l4-12h6l4 12M16 11v2M16 15.5v2M16 20v2", stroke: W, w: 1.8 }] },
  // -- Phone, internet, power, water and insurance
  TELSTRA: { bg: "#0d54ff", art: [{ d: "M8 9.5h16v4.2h-5.9V24h-4.2V13.7H8z", fill: W }] },
  OPTUS: { bg: "#00b2a9", art: [{ d: o(16, 16, 6.6), stroke: "#ffd100", w: 3.4 }] },
  VODAFONE: {
    bg: "#e60000",
    art: [
      { d: o(16, 16, 8.5), fill: W },
      {
        d: "M17.4 10.6c-3.4.2-5.6 2.6-5.6 5.6 0 3 2.1 5 4.6 5 2.1 0 3.6-1.5 3.6-3.6 0-2.2-1.6-3.4-3.4-3.4h-.6c.2-1.8 1.4-3 1.4-3.6z",
        fill: "#e60000",
      },
    ],
  },
  TPG: { bg: "#2b0a3d", art: [word("TPG", W, 8.5)] },
  "AUSSIE BROADBAND": {
    bg: "#00b373",
    art: [{ d: "M8 15a11 11 0 0 1 16 0M10.6 18a7 7 0 0 1 10.8 0M14 21a2.6 2.6 0 0 1 4 0", stroke: W, w: 2 }],
  },
  BELONG: { bg: "#ff6a39", art: [word("b", W, 14, 20.5)] },
  AMAYSIM: { bg: "#ff6900", art: [word("a", W, 13, 19.5)] },
  AGL: {
    bg: "#003da5",
    art: [
      { d: o(16, 16, 4.4), fill: "#ffcd00" },
      { d: rays(8, 6.4, 9.6), stroke: "#ffcd00", w: 1.8 },
    ],
  },
  ORIGIN: {
    bg: "#ec0000",
    art: [
      { d: o(16, 16, 7.5), fill: "#ff9e18" },
      { d: o(16, 16, 4), fill: "#ec0000" },
    ],
  },
  "RED ENERGY": { bg: "#e4002b", art: [{ d: "M17.5 7l-7 10h5l-1.5 8 7-10h-5z", fill: W }] },
  ENERGEX: { bg: "#009fdf", art: [{ d: "M17.5 7l-7 10h5l-1.5 8 7-10h-5z", fill: W }] },
  "ENERGY AUSTRALIA": { bg: "#0072bc", art: [{ d: "M17.5 7l-7 10h5l-1.5 8 7-10h-5z", fill: "#7ac143" }] },
  "URBAN UTILITIES": {
    bg: "#00aeef",
    art: [{ d: "M16 7c3 4.2 5.5 7.4 5.5 10.4a5.5 5.5 0 0 1-11 0C10.5 14.4 13 11.2 16 7z", fill: W }],
  },
  MEDIBANK: { bg: "#e30613", art: [word("M", W, 12, 20.2)] },
  BUPA: { bg: "#0079c8", art: [word("Bupa", W, 7.6, 18.6)] },
  HCF: { bg: "#00a0af", art: [word("HCF", W, 8.5)] },
  NIB: { bg: "#00a56a", art: [word("nib", W, 9, 18.6)] },
  RACQ: { bg: "#004b8d", art: [word("RACQ", "#ffd100", 6.8, 18.4)] },
  NRMA: { bg: "#0072bc", art: [word("NRMA", W, 6.6, 18.4)] },
  SUNCORP: { bg: "#00a19a", art: [word("S", W, 12, 20.2)] },
  AAMI: { bg: "#e4002b", art: [word("AAMI", W, 6.8, 18.4)] },
  ALLIANZ: {
    bg: "#003781",
    art: [
      { d: o(16, 16, 8), stroke: W, w: 1.6 },
      { d: "M12.5 21V12M16 21V10M19.5 21V12", stroke: W, w: 2.2 },
    ],
  },
  "BUDGET DIRECT": { bg: "#f37021", art: [word("BD", W, 10)] },
  YOUI: { bg: "#e4007c", art: [word("youi", W, 8, 18.6)] },
};
/** Every mark: the ones here and the hundred more Australian ones (merchantMarksAu.ts). */
export const ALL_MARKS: Record<string, Mark> = { ...MARKS, ...MORE_MARKS };
const KEYS = Object.keys(ALL_MARKS).sort((a, b) => b.length - a.length);

export function markFor(merchant: string): Mark | null {
  const m = merchant.toUpperCase().replace(/'/g, "");
  const key = KEYS.find(
    (k) =>
      m === k.trim() ||
      m.startsWith(k.endsWith(" ") ? k : k + " ") ||
      (k.length >= 5 && !k.includes(" ") && m.startsWith(k)),
  );
  return key ? ALL_MARKS[key] : null;
}

/** Glyphs for kinds of place (24 × 24 strokes), found by a word in a merchant's name nobody has described. */
export const PLACES: { re: RegExp; d: string; colour: string }[] = [
  { re: /\b(GYM|FITNESS|CROSSFIT|PILATES|YOGA|F45)\b/, d: "M6 8v8M3 10v4M18 8v8M21 10v4M6 12h12", colour: "#e5508a" },
  { re: /\bINSURANCE\b|\bINSURE/, d: "M12 3l7 3v5c0 5-3 8.5-7 10-4-1.5-7-5-7-10V6z", colour: "#3a8fd1" },
  {
    re: /\b(PHONE|PHONES|MOBILE|TELCO)\b/,
    d: "M8 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2",
    colour: "#5b6ee1",
  },
  {
    re: /\b(INTERNET|NBN|BROADBAND|WIFI)\b/,
    d: "M3 9.5a13 13 0 0 1 18 0M6 13a8.5 8.5 0 0 1 12 0M9 16.5a4 4 0 0 1 6 0M12 20h.01",
    colour: "#5b6ee1",
  },
  { re: /\b(ELECTRICITY|ELECTRIC|ENERGY|POWER)\b/, d: "M13 3L6 13h5l-1 8 7-10h-5z", colour: "#e0a21a" },
  { re: /\bWATER\b/, d: "M12 3c3 4.2 5.5 7.4 5.5 10.5a5.5 5.5 0 0 1-11 0C6.5 10.4 9 7.2 12 3z", colour: "#2aa3d6" },
  {
    re: /\bGAS\b/,
    d: "M12 3c1 3 4.5 5 4.5 9.5A4.5 4.5 0 0 1 7.5 13c0-2 1-3.5 2-4.5 0 2 1 3 2 3 0-3-.5-6 .5-8.5z",
    colour: "#e86a2c",
  },
  {
    re: /\b(COUNCIL|RATES|SHIRE)\b/,
    d: "M3 21h18M5 21V10M19 21V10M9 21v-6M15 21v-6M2 10l10-6 10 6z",
    colour: "#7a7f9a",
  },
  {
    re: /\b(SCHOOL|FEES|TUITION|COLLEGE|UNI|UNIVERSITY|KINDY|KINDERGARTEN)\b/,
    d: "M2 9l10-5 10 5-10 5zM6 11v5c0 1.5 2.7 3 6 3s6-1.5 6-3v-5M22 9v6",
    colour: "#8d5bd6",
  },
  {
    re: /\b(STREAMING|NETFLIX|TV|SUBSCRIPTION)\b/,
    d: "M4 5h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 21h8M10 9v5l4.5-2.5z",
    colour: "#d64545",
  },
  {
    re: /\b(CAR|AUTO|MOTORS|TYRES|MECHANIC|SERVICE CENTRE)\b/,
    d: "M3 15l2-5.5A2 2 0 0 1 6.9 8h10.2a2 2 0 0 1 1.9 1.5L21 15v3H3zM7 15h.01M17 15h.01",
    colour: "#6f7d95",
  },
  { re: /\b(LOAN|MORTGAGE|REPAYMENT)\b/, d: "M3 11l9-7 9 7M5 9.5V20h14V9.5M10 20v-5h4v5", colour: "#4e8fc9" },
  {
    re: /\b(CINEMA|CINEMAS|MOVIES|THEATRE)\b/,
    d: "M3 7h18v12H3zM3 11h18M7 7v4M11 7v4M15 7v4M19 7v4",
    colour: "#c94a5a",
  },
  {
    re: /\b(PHARMACY|CHEMIST|MEDICAL|CLINIC|DOCTOR|GP|HOSPITAL|PATHOLOGY)\b/,
    d: "M12 5v14M5 12h14",
    colour: "#2f9e8f",
  },
  {
    re: /\b(DENTAL|DENTIST|ORTHO)\b/,
    d: "M8 4c-3 0-4 2.5-4 5 0 3 1.5 4 2 7 .4 2.5 1 5 2.5 5 1.4 0 1.5-4 3.5-4s2.1 4 3.5 4c1.5 0 2.1-2.5 2.5-5 .5-3 2-4 2-7 0-2.5-1-5-4-5-1.6 0-2.5 1-4 1s-2.4-1-4-1z",
    colour: "#3aa0b0",
  },
  {
    re: /\b(VET|VETERINARY|PET|PETS)\b/,
    d: "M12 20c-3 0-5-1.4-5-3.4S9.2 12 12 12s5 2.6 5 4.6-2 3.4-5 3.4zM6 10h.01M9.5 6.5h.01M14.5 6.5h.01M18 10h.01",
    colour: "#c2683b",
  },
  {
    re: /\b(HAIR|BARBER|SALON|BEAUTY|NAILS)\b/,
    d: "M6 6a2.5 2.5 0 1 0 0 .01M6 18a2.5 2.5 0 1 0 0 .01M8 7.5L20 18M8 16.5L20 6",
    colour: "#b4507a",
  },
  {
    re: /\b(CAKE|CAKES|CHEESECAKE|CUPCAKE|CUPCAKES)\b/,
    d: "M4 20h16v-6H4zM4 14c0-2 3.6-3 8-3s8 1 8 3M12 11V8.5M12 5.5c.8.8.8 1.6 0 2.4-.8-.8-.8-1.6 0-2.4z",
    colour: "#e5508a",
  },
  {
    re: /\b(PARTY|PARTYLAND|BALLOONS|BALLOON)\b/,
    d: "M12 3a5 5 0 0 1 5 5c0 3.5-3 6-5 6s-5-2.5-5-6a5 5 0 0 1 5-5zM12 14l-1 2h2zM12 16c0 2-2 3-1 5",
    colour: "#8d5bd6",
  },
  {
    re: /\b(BAKERY|BAKEHOUSE|BAKER|PATISSERIE|DONUT|DONUTS)\b/,
    d: "M4 14c0-4 3.6-7 8-7s8 3 8 7c0 2-1 3-2.5 3h-11C5 17 4 16 4 14zM9 8.5l1 8M15 8.5l-1 8",
    colour: "#c48a3a",
  },
  {
    re: /\b(CAFE|COFFEE|ESPRESSO|ROASTERS|BARISTA)\b/,
    d: "M4 8h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5zM16 10h2a2 2 0 0 1 0 4h-2M8 3v2M12 3v2",
    colour: "#8a5a3c",
  },
  { re: /\b(PIZZA|PIZZERIA)\b/, d: "M4 7c5-3 11-3 16 0L12 21zM9 10h.01M14 12h.01M12 15h.01", colour: "#d65a2c" },
  {
    re: /\b(SUSHI|THAI|INDIAN|CHINESE|RESTAURANT|KITCHEN|BISTRO|GRILL|BURGER|BURGERS|KEBAB|DINER|TAKEAWAY|NOODLE)\b/,
    d: "M7 3v8M5 3v4a2 2 0 0 0 4 0V3M7 11v10M16 3c-2 0-3 3-3 6s1 3 3 3v9",
    colour: "#d6604d",
  },
  {
    re: /\b(PETROL|FUEL|SERVO|SERVICE STATION)\b/,
    d: "M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M4 21h12M5 10h10M15 8l3 3v6a1.5 1.5 0 0 0 3 0V9l-3-3",
    colour: "#3f8f5a",
  },
  {
    re: /\b(PARKING|CARPARK|SECURE PARKING|WILSON)\b/,
    d: "M5 3h14v18H5zM10 17V7h3a3 3 0 0 1 0 6h-3",
    colour: "#3a6fd1",
  },
  { re: /\b(TOLL|TOLLS|MOTORWAY)\b/, d: "M8 21L11 3M16 21L13 3M12 6v2M12 11v2M12 16v2", colour: "#5b2d90" },
  {
    re: /\b(MARKET|MARKETS|FARMERS)\b/,
    d: "M3 9l2-5h14l2 5M4 9h16v11H4zM4 9c0 1.5 1.3 2.5 2.7 2.5S9.3 10.5 9.3 9c0 1.5 1.3 2.5 2.7 2.5s2.7-1 2.7-2.5c0 1.5 1.3 2.5 2.6 2.5S20 10.5 20 9",
    colour: "#6f8f2f",
  },
  {
    re: /\b(KIDS|ACTIVITIES|SWIM|SWIMMING|DANCE|FOOTBALL|SOCCER|NETBALL|CRICKET|SPORT|SPORTS|CLUB)\b/,
    d: "M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5l-5.3 2.9 1.2-6-4.5-4.1 6-.7z",
    colour: "#e08a1e",
  },
  {
    re: /\b(HARDWARE|TIMBER|PLUMBING|ELECTRICAL)\b/,
    d: "M4 8h9v4H4zM13 8l4 2-4 2M7.5 12h2.5v9H7.5z",
    colour: "#6f7d95",
  },
  {
    re: /\b(LIQUOR|BOTTLE|BOTTLEO|CELLARS|WINE|BREWERY|BREWING)\b/,
    d: "M10 3h4v4l2 3v11H8V10l2-3z",
    colour: "#9b3b5a",
  },
  {
    re: /\b(TAXI|CABS|RIDESHARE|13CABS)\b/,
    d: "M3 15l2-5.5A2 2 0 0 1 6.9 8h10.2a2 2 0 0 1 1.9 1.5L21 15v3H3zM9 5h6v3H9z",
    colour: "#e0b51a",
  },
  {
    re: /\b(AIRLINES|AIRWAYS|AIRPORT|FLIGHT|FLIGHTS)\b/,
    d: "M10.5 12L3 9.5l1.5-1.5 9 1L18 4.5a1.5 1.5 0 0 1 2 2L15.5 11l1 9-1.5 1.5L12.5 14 8 18.5V21l-1.5 1-1-3-3-1L3.5 16.5H6z",
    colour: "#3a8fd1",
  },
  {
    re: /\b(HOTEL|MOTEL|RESORT|INN|LODGE|ACCOMMODATION)\b/,
    d: "M3 18V8M3 14h18v4M21 18v-4a3 3 0 0 0-3-3h-7v3M7 11a1.5 1.5 0 1 0 0 .01",
    colour: "#7a5bd6",
  },
  {
    re: /\b(NEWSAGENCY|NEWSAGENT|NEWS|BOOKS|BOOKSHOP)\b/,
    d: "M4 5h7a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4zM20 5h-7a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h7z",
    colour: "#5f7a8a",
  },
  {
    re: /\b(POST|POSTAGE|COURIER|DELIVERY|PARCEL)\b/,
    d: "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10",
    colour: "#c2683b",
  },
  {
    re: /\b(BUTCHER|BUTCHERY|MEATS|SEAFOOD|FISH|DELI)\b/,
    d: "M15 4a5 5 0 0 1 5 5c0 3-3 5-6 6l-5 5a2 2 0 0 1-3-3l5-5c1-3 3-8 4-8z",
    colour: "#c25050",
  },
  {
    re: /\b(GARDEN|NURSERY|LANDSCAPING|PLANTS)\b/,
    d: "M12 21v-9M12 12C12 7 8 4 4 4c0 5 3 8 8 8zM12 14c0-4 3-6.5 7-6.5 0 4-2.5 6.5-7 6.5z",
    colour: "#3f8f5a",
  },
  {
    re: /\b(DONATION|CHARITY|FOUNDATION|RED CROSS|WORLD VISION)\b/,
    d: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
    colour: "#d64579",
  },
];

export function placeFor(merchant: string): { d: string; colour: string } | null {
  const m = merchant.toUpperCase();
  return PLACES.find((p) => p.re.test(m)) ?? null;
}
