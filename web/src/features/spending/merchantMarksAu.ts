/**
 * A hundred more Australian merchants households pay: banks, shops, takeaway, fuel, phone and power, insurers and
 * health funds, gyms, cinemas, transport and parking. Same style as merchantMarks.ts: each drawn small and simple in
 * its colours, an impression rather than the company's logo, on a 32 × 32 circle.
 */
import type { Mark, Shape } from "~/features/spending/merchantMarks";

const W = "#fff";
const K = "#111";
const o = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0z`;
const star = (cx: number, cy: number, r: number, points = 5) => {
  const pts = Array.from({ length: points * 2 }, (_, i) => {
    const a = (Math.PI / points) * i - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    return `${(cx + rr * Math.cos(a)).toFixed(2)} ${(cy + rr * Math.sin(a)).toFixed(2)}`;
  });
  return `M${pts.join("L")}z`;
};
/** Words on the mark, sized to fit. */
const word = (t: string, fill: string, s?: number, y?: number, weight = 800): Shape => {
  const size = s ?? (t.length <= 1 ? 13 : t.length === 2 ? 10.5 : t.length === 3 ? 8.8 : t.length === 4 ? 7.2 : 6);
  return { t, fill, s: size, y: y ?? 16 + size * 0.36, weight };
};
const text = (bg: string, t: string, fill = W, extra: Shape[] = []): Mark => ({ bg, art: [...extra, word(t, fill)] });

// Shapes used by a few.
const DUMBBELL = "M10 13v6M7.5 14.5v3M22 13v6M24.5 14.5v3M10 16h12";
const PAW = `M16 23c-3 0-5-1.4-5-3.4s2.2-4.6 5-4.6 5 2.6 5 4.6-2 3.4-5 3.4z${o(10.5, 13.5, 1.8)}${o(14, 10, 1.8)}${o(18, 10, 1.8)}${o(21.5, 13.5, 1.8)}`;
const BOLT = "M17.5 7l-7 10h5l-1.5 8 7-10h-5z";
const TICKET = "M8 11h16v3a2 2 0 0 0 0 4v3H8v-3a2 2 0 0 0 0-4z";
const FILM = "M8 10h16v12H8zM8 14h16M12 10v4M16 10v4M20 10v4";
const CUP = "M10 12h10v4.5a5 5 0 0 1-5 5 5 5 0 0 1-5-5zM20 13.5h1.5a2 2 0 0 1 0 4H20";
const SHIELD = "M16 7.5l7 2.8v4.9c0 4.6-3 7.9-7 9.3-4-1.4-7-4.7-7-9.3v-4.9z";

export const MORE_MARKS: Record<string, Mark> = {
  // -- Banks
  "COMMONWEALTH BANK": {
    bg: "#ffcc00",
    art: [
      { d: "M16 7.5l8.5 8.5-8.5 8.5-8.5-8.5z", stroke: K, w: 1.4 },
      { d: "M16 16h8.5L16 24.5z", fill: K },
    ],
  },
  COMMBANK: {
    bg: "#ffcc00",
    art: [
      { d: "M16 7.5l8.5 8.5-8.5 8.5-8.5-8.5z", stroke: K, w: 1.4 },
      { d: "M16 16h8.5L16 24.5z", fill: K },
    ],
  },
  CBA: {
    bg: "#ffcc00",
    art: [
      { d: "M16 7.5l8.5 8.5-8.5 8.5-8.5-8.5z", stroke: K, w: 1.4 },
      { d: "M16 16h8.5L16 24.5z", fill: K },
    ],
  },
  WESTPAC: {
    bg: "#d5002b",
    art: [{ d: "M7.5 11l3.2 10h2.4l2.9-7 2.9 7h2.4l3.2-10h-2.9l-2 6.6-2.7-6.6h-1.8l-2.7 6.6-2-6.6z", fill: W }],
  },
  NAB: { bg: K, art: [{ d: star(16, 13, 5.5), fill: "#e60000" }, word("nab", W, 6.5, 24.2)] },
  "NATIONAL AUSTRALIA BANK": { bg: K, art: [{ d: star(16, 13, 5.5), fill: "#e60000" }, word("nab", W, 6.5, 24.2)] },
  ANZ: { bg: "#004165", art: [{ d: "M8 21c4-2 12-2 16 0", stroke: "#5bc2e7", w: 1.6 }, word("ANZ", W, 9, 17.5)] },
  ING: { bg: W, ring: "#f2c9a8", art: [word("ING", "#ff6200", 9.5, 19.6, 900)] },
  MACQUARIE: { bg: K, art: [{ d: `${o(16, 16, 7)}${o(16, 16, 3.2)}`, fill: W }] },
  "BENDIGO BANK": { bg: "#8a1538", art: [word("B", W, 13)] },
  BENDIGO: { bg: "#8a1538", art: [word("B", W, 13)] },
  BANKWEST: { bg: "#ffd200", art: [{ d: "M8 20.5h16", stroke: K, w: 2 }, word("BW", K, 9, 17.5, 900)] },
  "ST GEORGE": {
    bg: "#78be20",
    art: [{ d: "M10 22c2-7 10-10 12-12-1 4-2 8-6 10", fill: "#ffd200" }, word("St.G", "#004b23", 6.5, 26)],
  },
  BOQ: { bg: "#3a1a6b", art: [word("BOQ", W)] },
  UBANK: { bg: "#1d1d1b", art: [word("u", "#f5ff5f", 16, 20.2, 900)] },
  "UP BANK": { bg: "#ff7a64", art: [word("Up", "#1b1b2f", 11)] },
  // -- Supermarkets, hardware and home
  DRAKES: { bg: "#e30613", art: [word("D", W)] },
  FOODLAND: { bg: "#e30613", art: [{ d: "M8 19h16v4H8z", fill: "#ffd100" }, word("F", W, 11, 17)] },
  MITRE: { bg: "#e30613", art: [word("10", W, 12, 20.4, 900)] },
  "MITRE 10": { bg: "#e30613", art: [word("10", W, 12, 20.4, 900)] },
  "TOTAL TOOLS": { bg: "#e30613", art: [{ d: "M8 10h16v12H8z", fill: K }, word("TT", W, 9.5, 19.4)] },
  AUTOBARN: { bg: "#e30613", art: [{ d: "M8 18l2-4.5h12l2 4.5v3H8zM11 21v1.5M21 21v1.5", fill: W }] },
  "BING LEE": { bg: "#ffd200", art: [{ d: "M8 10h16v12H8z", fill: "#e30613" }, word("BL", W, 9.5, 19.4)] },
  FREEDOM: { bg: K, art: [word("F", W, 13, 20.6, 500)] },
  "FANTASTIC FURNITURE": { bg: "#ffd200", art: [{ d: "M9 13h14v6H9zM10 19v3M22 19v3", fill: K }] },
  AMART: { bg: "#f26522", art: [word("A", W)] },
  ADAIRS: { bg: "#1a1a1a", art: [word("adairs", W, 5.8, 18.2, 600)] },
  "BED BATH N TABLE": { bg: W, ring: "#ddd", art: [word("BBT", K, 8.5, 19.2, 600)] },
  BEAUMONT: { bg: "#003da5", art: [{ d: "M9 9h6v6H9zM17 9h6v6h-6zM9 17h6v6H9zM17 17h6v6h-6z", fill: W }] },
  SPOTLESS: { bg: "#0072ce", art: [word("S", W)] },
  // -- Clothes, beauty and toys
  KATHMANDU: { bg: K, art: [{ d: "M8 21l5-9 3 4 3-6 5 11z", fill: "#e30613" }] },
  MACPAC: { bg: "#d22630", art: [{ d: "M8 21l5-9 3 4 3-6 5 11z", fill: W }] },
  "COUNTRY ROAD": { bg: "#1f2a44", art: [word("CR", W, 10, 19.6, 500)] },
  SPORTSGIRL: { bg: K, art: [word("S", "#ff5fa2", 13, 20.6, 900)] },
  "PETER ALEXANDER": { bg: "#f7c6d9", art: [word("PA", K, 10, 19.6, 600)] },
  "LORNA JANE": { bg: K, art: [word("LJ", W, 10, 19.6, 600)] },
  TYPO: { bg: K, art: [word("typo", W, 7.8, 18.8, 900)] },
  MECCA: { bg: K, art: [word("MECCA", W, 5.8, 18.2, 700)] },
  SEPHORA: { bg: K, art: [{ d: "M15 8c-3 4 3 6 0 10s3 6 0 8", stroke: W, w: 1.6 }] },
  PETBARN: { bg: "#00843d", art: [{ d: PAW, fill: W }] },
  "BABY BUNTING": { bg: "#0075c9", art: [{ d: o(16, 15, 6.5), fill: "#ffb81c" }, word("bb", "#0075c9", 8, 18)] },
  "EB GAMES": { bg: K, art: [{ d: "M8 10h16v12H8z", fill: "#e30613" }, word("EB", W, 9.5, 19.4, 900)] },
  JAYCAR: { bg: K, art: [{ d: "M8 20h16", stroke: "#e30613", w: 2.4 }, word("J", W, 12, 18)] },
  LINCRAFT: { bg: "#6a1b9a", art: [{ d: "M10 22c4-10 8-10 12 0M16 9v3", stroke: W, w: 1.8 }] },
  // -- Takeaway, bakeries and cafes
  "BAKERS DELIGHT": {
    bg: "#5a2d82",
    art: [
      {
        d: "M16 23V10M16 13c-2-1-3-3-2.5-4.5 2 .2 3 2 2.5 4.5zM16 13c2-1 3-3 2.5-4.5-2 .2-3 2-2.5 4.5zM16 17c-2-1-3-3-2.5-4.5 2 .2 3 2 2.5 4.5zM16 17c2-1 3-3 2.5-4.5-2 .2-3 2-2.5 4.5z",
        stroke: "#f3c74e",
        w: 1.4,
      },
    ],
  },
  BRUMBYS: { bg: "#7a1d1d", art: [word("B", "#f5d48f")] },
  "MICHELS PATISSERIE": { bg: K, art: [{ d: "M8 22h16", stroke: "#c8102e", w: 2 }, word("M", W, 12, 18.6, 500)] },
  "KRISPY KREME": { bg: "#00704a", art: [{ d: `${o(16, 16, 7.5)}${o(16, 16, 2.6)}`, fill: "#e4002b" }] },
  ZARRAFFAS: { bg: "#c8102e", art: [{ d: CUP, stroke: W, w: 1.6 }] },
  "COFFEE CLUB": { bg: K, art: [{ d: CUP, stroke: "#d5a253", w: 1.6 }] },
  "THE COFFEE CLUB": { bg: K, art: [{ d: CUP, stroke: "#d5a253", w: 1.6 }] },
  "JAMAICA BLUE": { bg: "#005eb8", art: [{ d: CUP, stroke: W, w: 1.6 }] },
  "HOGS BREATH": { bg: "#1a1a1a", art: [word("HB", "#f39200")] },
  ROLLD: { bg: "#7ab800", art: [word("roll'd", W, 6, 18.2)] },
  "SUSHI HUB": {
    bg: "#e4002b",
    art: [
      { d: `${o(16, 16, 6.5)}`, fill: W },
      { d: o(16, 16, 3.2), fill: "#ff7f50" },
    ],
  },
  "SUSHI TRAIN": {
    bg: "#e4002b",
    art: [
      { d: `${o(16, 16, 6.5)}`, fill: W },
      { d: o(16, 16, 3.2), fill: "#ff7f50" },
    ],
  },
  SCHNITZ: { bg: "#ffd100", art: [word("S", K)] },
  CRUST: { bg: K, art: [{ d: "M8 10c5-3 11-3 16 0L16 24z", fill: "#f2a541" }] },
  "PIZZA CAPERS": { bg: "#007a33", art: [{ d: "M8 10c5-3 11-3 16 0L16 24z", fill: "#e4002b" }] },
  "BETTYS BURGERS": {
    bg: "#e4002b",
    art: [
      { d: "M9 15a7 5 0 0 1 14 0zM9 17h14v1.4H9zM9 19.6h14a2.6 2.6 0 0 1-2.6 2.6h-8.8A2.6 2.6 0 0 1 9 19.6z", fill: W },
    ],
  },
  FISHBOWL: {
    bg: "#2e7d32",
    art: [
      { d: "M8 15h16a8 8 0 0 1-16 0z", fill: W },
      { d: "M12 14l2-4M18 14l2-5", stroke: "#a5d6a7", w: 1.6 },
    ],
  },
  "SAN CHURRO": { bg: "#4a2c1d", art: [{ d: "M11 22l10-12", stroke: "#e8b04b", w: 3 }] },
  WENDYS: { bg: "#e2203d", art: [word("W", W, 12, 20.2, 900)] },
  "CARLS JR": { bg: "#ffc72c", art: [{ d: star(16, 16, 8), fill: "#e4002b" }] },
  "MUZZ BUZZ": { bg: "#ff6600", art: [{ d: CUP, stroke: W, w: 1.6 }] },
  BANJOS: { bg: "#7b3f00", art: [word("B", "#f8d38b")] },
  DELIVEROO: { bg: "#00ccbc", art: [{ d: "M10 23l2-8-2-6 5 3 4-3-1 5 4 3-5 1-1 5z", fill: W }] },
  // -- Fuel
  "METRO PETROLEUM": { bg: "#003da5", art: [word("M", "#ffd100")] },
  OTR: { bg: "#e4002b", art: [word("OTR", W)] },
  "COLES EXPRESS": { bg: "#e01a22", art: [{ d: "M21.6 11.6a7 7 0 1 0 0 8.8", stroke: W, w: 3.6 }] },
  // -- Phone, internet and TV
  IINET: { bg: "#0071ce", art: [word("ii", W, 13, 20.6, 900)] },
  DODO: { bg: "#ffd200", art: [{ d: "M11 22c0-6 3-10 7-10 2 0 3 1 3 3l2 1-2 1c0 3-3 5-6 5z", fill: "#003da5" }] },
  SUPERLOOP: { bg: "#1b1464", art: [{ d: "M9 16c0-4 4-4 7 0s7 4 7 0-4-4-7 0-7 4-7 0z", stroke: "#6ee7f9", w: 2 }] },
  "BOOST MOBILE": { bg: K, art: [{ d: BOLT, fill: "#ff6900" }] },
  LEBARA: { bg: "#0e2b5c", art: [word("L", "#00a1de")] },
  FOXTEL: { bg: "#ff5a00", art: [word("F", W, 13, 20.6, 900)] },
  // -- Power
  ALINTA: { bg: "#00539f", art: [{ d: "M16 7c3 4 5 7 5 10a5 5 0 0 1-10 0c0-3 2-6 5-10z", fill: "#f7941d" }] },
  POWERSHOP: { bg: "#3c8f2f", art: [{ d: BOLT, fill: W }] },
  "MOMENTUM ENERGY": { bg: "#e4002b", art: [{ d: BOLT, fill: W }] },
  "SIMPLY ENERGY": { bg: "#ff7f00", art: [{ d: BOLT, fill: W }] },
  "LUMO ENERGY": { bg: "#e5007e", art: [{ d: BOLT, fill: W }] },
  ERGON: { bg: "#e4002b", art: [{ d: BOLT, fill: "#ffd100" }] },
  // -- Insurers and health funds
  HOLLARD: { bg: "#4a1f6b", art: [{ d: SHIELD, fill: "#7e57c2" }, word("H", W, 9.5, 19.2)] },
  "AUSTRALIAN UNITY": { bg: "#004b87", art: [word("AU", W)] },
  HBF: { bg: "#3a3a8c", art: [word("HBF", W)] },
  GMHBA: { bg: "#00a3e0", art: [word("GMHBA", W, 5.6, 18)] },
  AHM: { bg: "#ff6c0e", art: [word("ahm", W)] },
  "REAL INSURANCE": { bg: "#e4002b", art: [{ d: SHIELD, fill: W }, word("R", "#e4002b", 9.5, 19.2)] },
  QBE: { bg: "#003087", art: [word("QBE", W)] },
  CGU: { bg: "#ffd200", art: [word("CGU", "#003da5")] },
  GIO: { bg: "#002e6d", art: [word("GIO", "#ffd200")] },
  APIA: { bg: "#00a19a", art: [word("apia", W)] },
  BINGLE: { bg: "#ff4f9a", art: [word("b", W, 15, 20.5)] },
  RACV: { bg: "#004b8d", art: [word("RACV", "#ffd100")] },
  RAC: { bg: "#005ba6", art: [word("RAC", "#ffd100")] },
  // -- Gyms
  "ANYTIME FITNESS": {
    bg: "#5f259f",
    art: [
      {
        d: "M17.5 8.5a1.8 1.8 0 1 1 0 .01M15 13l3-1.5 2 3 3 1M18 11.5l-2 6-4 2.5M16 17.5l3 2.5-1 4",
        stroke: W,
        w: 1.8,
      },
    ],
  },
  "FITNESS FIRST": { bg: "#c8102e", art: [word("FF", W)] },
  GOODLIFE: { bg: "#00b5e2", art: [{ d: DUMBBELL, stroke: W, w: 2 }] },
  JETTS: { bg: "#e4002b", art: [word("J", W)] },
  "SNAP FITNESS": { bg: "#6d2077", art: [{ d: DUMBBELL, stroke: W, w: 2 }] },
  "PLUS FITNESS": { bg: "#ff6900", art: [{ d: "M16 9v14M9 16h14", stroke: W, w: 3.4 }] },
  F45: { bg: "#002d72", art: [word("F45", "#e4002b")] },
  CRUNCH: { bg: "#6a1b9a", art: [word("C", W)] },
  // -- Going out
  "VILLAGE CINEMAS": { bg: "#e4002b", art: [{ d: FILM, stroke: W, w: 1.6 }] },
  "READING CINEMAS": { bg: "#c8102e", art: [{ d: FILM, stroke: W, w: 1.6 }] },
  DENDY: { bg: K, art: [{ d: FILM, stroke: "#c9a227", w: 1.6 }] },
  TIMEZONE: { bg: "#003da5", art: [{ d: star(16, 16, 8), fill: "#ffd100" }] },
  TICKETEK: { bg: "#00a3e0", art: [{ d: TICKET, fill: W }] },
  TICKETMASTER: { bg: "#026cdf", art: [{ d: TICKET, fill: W }] },
  DREAMWORLD: {
    bg: "#00a3e0",
    art: [
      { d: "M8 21a8 8 0 0 1 16 0", stroke: "#ffd100", w: 2.4 },
      { d: star(16, 13, 3.5), fill: W },
    ],
  },
  "MOVIE WORLD": { bg: "#1a1a6b", art: [{ d: star(16, 16, 8), fill: "#ffd100" }] },
  AUDIBLE: { bg: "#ff9900", art: [{ d: "M8 15c4-4 12-4 16 0M11 18c3-2.6 7-2.6 10 0", stroke: K, w: 2 }] },
  // -- Transport and parking
  OPAL: { bg: K, art: [word("opal", W, 7.4, 18.8, 900)] },
  MYKI: { bg: "#6cb33f", art: [word("myki", K, 7.4, 18.8, 900)] },
  "WILSON PARKING": { bg: "#003da5", art: [word("P", W)] },
  WILSON: { bg: "#003da5", art: [word("P", W)] },
  "SECURE PARKING": { bg: "#e4002b", art: [word("P", W)] },
  "CARE PARK": { bg: "#ffd100", art: [word("P", K)] },
  REX: { bg: "#e4002b", art: [{ d: "M8 20l16-7-3 6z", fill: W }] },
  // -- Health and eyes
  SPECSAVERS: {
    bg: "#00843d",
    art: [{ d: "M6.5 16a5 4 0 1 0 10 0a5 4 0 1 0-10 0zM15.5 16a5 4 0 1 0 10 0a5 4 0 1 0-10 0z", fill: "#a6ce39" }],
  },
  OPSM: { bg: "#001e60", art: [word("OPSM", W)] },
  "LASER CLINICS": { bg: K, art: [word("LC", "#f2b9c9")] },
  BLOOMS: {
    bg: "#e5007e",
    art: [
      { d: `${o(16, 16, 2.5)}${o(16, 11.5, 2.5)}${o(16, 20.5, 2.5)}${o(11.5, 16, 2.5)}${o(20.5, 16, 2.5)}`, fill: W },
    ],
  },
  // -- Pay later and selling
  HUMM: { bg: "#ff6600", art: [word("humm", W, 6.6, 18.4)] },
  LATITUDE: { bg: "#0046aa", art: [word("L", W)] },
  GUMTREE: {
    bg: "#72ef36",
    art: [{ d: "M16 23v-6M16 17c-4 0-6-3-5-6 2 0 3 1 5 3 2-2 3-3 5-3 1 3-1 6-5 6z", fill: "#2e7d32" }],
  },
  AIRTASKER: { bg: "#0067ff", art: [word("A", W)] },
  // -- One shop's party supplies, one more grocer
  PARTYLAND: text("#e5007e", "P"),
  ROMEOS: text("#c8102e", "R"),
};
