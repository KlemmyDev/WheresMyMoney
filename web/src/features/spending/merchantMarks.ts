/**
 * Stylised merchant marks: each known business drawn small and simple in its colours (arches for McDonald's, a shell for
 * Shell, a bullseye for Target), so a transaction reads at a glance. They're impressions, not the companies' logos.
 *
 * The businesses and their marks live in app/features/spending/businesses.json, which the server reads too (names,
 * spellings, categories), so adding a business is one edit. Art is drawn on a 32 × 32 circle: a shape is a path (`d`,
 * filled or stroked; `g` for a 24 × 24 glyph drawn in the middle) or a bit of text (`t`). For a merchant that isn't
 * known, `placeFor` picks a glyph from words in its name (GYM, SUSHI, WATER…) so it still says what kind of place it is.
 */

import catalogue from "../../../../app/features/spending/businesses.json";

export type Shape =
  | { d: string; fill?: string; stroke?: string; w?: number; g?: boolean }
  | { t: string; x?: number; y?: number; s?: number; fill: string; weight?: number; italic?: boolean };

export type Mark = { bg: string; fg?: string; text?: string; art?: Shape[]; ring?: string };

/** A business the app knows (businesses.json, shared with the server): its key, other spellings, name and mark. */
export type CatalogueBusiness = { key: string; name: string; category: string; aliases: string[]; mark: Mark };
export const CATALOGUE = catalogue.businesses as CatalogueBusiness[];

const W = "#fff";
/** BPAY isn't a business: it's how a payment to one shows up when the statement doesn't say who. */
const BPAY: Mark = {
  bg: "#1d2f6f",
  art: [
    { d: "M7 10h18v12H7z", fill: "#5a3bd6" },
    { t: "BPAY", fill: W, s: 6.4, y: 18.3, weight: 800 },
  ],
};

/** Every mark, under every way its business shows up on a statement. */
export const ALL_MARKS: Record<string, Mark> = {
  ...Object.fromEntries(CATALOGUE.flatMap((b) => [b.key, ...b.aliases].map((k) => [k, b.mark]))),
  BPAY,
  "INTERNET BPAY": BPAY,
};
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
  // Takeaway and eating out, most particular first.
  {
    re: /\b(FISH (AND|&|N) CHIPS|FISH N CHIPS|FISH&CHIPS|CHIPPERY|FISHERIES)\b/,
    d: "M3 12c3-4 7-5 11-3l4-3v12l-4-3c-4 2-8 1-11-3zM15 11h.01",
    colour: "#2a8fbd",
  },
  {
    re: /\b(SUSHI|SASHIMI|JAPANESE|IZAKAYA|TERIYAKI)\b/,
    d: "M5 9a7 4 0 0 1 14 0v6a7 4 0 0 1-14 0zM5 9a7 4 0 0 0 14 0M12 8.5h.01",
    colour: "#e4572e",
  },
  {
    re: /\b(RAMEN|PHO|NOODLE|NOODLES|UDON|LAKSA)\b/,
    d: "M3 11h18a9 9 0 0 1-18 0zM14 3l-2 8M18 3l-4 8",
    colour: "#c2683b",
  },
  {
    re: /\b(CHINESE|DUMPLING|DUMPLINGS|YUM CHA|DIM SUM|BAO)\b/,
    d: "M4 15c0-4 3.6-7 8-7s8 3 8 7c-2.5 1.5-5 2-8 2s-5.5-.5-8-2zM8 9.5l1 2M12 8v2.5M16 9.5l-1 2",
    colour: "#c8102e",
  },
  {
    re: /\b(THAI|INDIAN|CURRY|VIETNAMESE|MALAYSIAN|NEPALESE|SRI LANKAN|LEBANESE|MEXICAN|ITALIAN|GREEK|KOREAN|TURKISH|AFRICAN|PERUVIAN)\b/,
    d: "M3 12h18a9 9 0 0 1-18 0zM9 4c-1 1.5 1 2.5 0 4M15 4c-1 1.5 1 2.5 0 4",
    colour: "#d6604d",
  },
  {
    re: /\b(BURGER|BURGERS)\b/,
    d: "M4 11a8 6 0 0 1 16 0zM4 13h16v1.5H4zM4 16.5h16a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z",
    colour: "#d65a2c",
  },
  { re: /\b(KEBAB|KEBABS|GYROS|SOUVLAKI|SHAWARMA|HSP)\b/, d: "M7 21l3-17h4l3 17zM9 11h6M8.5 15h7", colour: "#b4602a" },
  {
    re: /\b(CHICKEN|CHARCOAL|ROTISSERIE|CHOOKS|WINGS)\b/,
    d: "M15 4a5 5 0 0 1 0 10c-1.2 0-2.3-.4-3.2-1.1L8 16.7a2 2 0 1 1-2.7 2.7 2 2 0 1 1 2.7-2.7l3.8-3.8A5 5 0 0 1 15 4z",
    colour: "#d68a2c",
  },
  {
    re: /\b(GELATO|GELATERIA|ICE CREAM|ICECREAM|FROZEN YOGURT|FROYO)\b/,
    d: "M8 10a4 4 0 0 1 8 0zM8 10l4 11 4-11",
    colour: "#e5508a",
  },
  {
    re: /\b(BUBBLE TEA|BOBA|MILK TEA|TEA HOUSE|TEAHOUSE)\b/,
    d: "M7 8h10l-1.5 13h-7zM13 3l-1 5M9 16h.01M12 17h.01M14.5 16h.01",
    colour: "#8d5bd6",
  },
  { re: /\b(JUICE|JUICERY|SMOOTHIE|SMOOTHIES|ACAI)\b/, d: "M7 8h10l-1.5 13h-7zM12 8l3-5", colour: "#6f8f2f" },
  {
    re: /\b(FRUIT|FRUITO|VEG|GREENGROCER|PRODUCE|FRUITERERS)\b/,
    d: "M12 7c-3-2-7 0-7 5s3 8 5 8c1 0 1.5-.5 2-.5s1 .5 2 .5c2 0 5-3 5-8s-4-7-7-5zM12 7c0-2 1-3.5 3-4",
    colour: "#6f8f2f",
  },
  {
    re: /\b(PUB|TAVERN|HOTEL|BAR|BREWHOUSE|ARMS|SPORTS CLUB|RSL|LEAGUES CLUB|BOWLS CLUB)\b/,
    d: "M6 6h10v14H6zM16 9h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M9 9v8M13 9v8",
    colour: "#c9932a",
  },
  { re: /\b(PIZZA|PIZZERIA)\b/, d: "M4 7c5-3 11-3 16 0L12 21zM9 10h.01M14 12h.01M12 15h.01", colour: "#d65a2c" },
  {
    re: /\b(RESTAURANT|KITCHEN|BISTRO|GRILL|DINER|TAKEAWAY|EATERY|CANTEEN|BRASSERIE|TRATTORIA)\b/,
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
  // Services and outings.
  {
    re: /\b(PHYSIO|PHYSIOTHERAPY|CHIRO|CHIROPRACTIC|OSTEO|OSTEOPATHY|MASSAGE|MYOTHERAPY|PODIATRY|PILATES STUDIO)\b/,
    d: "M7 11V6a1.5 1.5 0 0 1 3 0v4M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V12M16 11a1.5 1.5 0 0 1 3 0v3a7 7 0 0 1-7 7h-1a6 6 0 0 1-5-3l-2.5-4a1.5 1.5 0 0 1 2.5-1.5L7 14",
    colour: "#2f9e8f",
  },
  {
    re: /\b(OPTOMETRIST|OPTOMETRY|OPTICAL|OPTICIAN|EYEWEAR|EYECARE)\b/,
    d: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
    colour: "#3aa0b0",
  },
  {
    re: /\b(LAUNDROMAT|LAUNDRY|DRY CLEAN|DRYCLEAN|DRYCLEANERS|DRY CLEANERS)\b/,
    d: "M5 3h14v18H5zM5 7h14M12 10a4 4 0 1 0 0 8 4 4 0 0 0 0-8z",
    colour: "#5f7a8a",
  },
  {
    re: /\b(CAR WASH|CARWASH|HAND WASH|DETAILING)\b/,
    d: "M3 15l2-5.5A2 2 0 0 1 6.9 8h10.2a2 2 0 0 1 1.9 1.5L21 15v3H3zM8 3v2M12 3v2M16 3v2",
    colour: "#2aa3d6",
  },
  {
    re: /\b(POOL|POOLS|SPA|SPAS|POOL SHOP)\b/,
    d: "M2 15c3 0 3-3 6-3s3 3 6 3 3-3 6-3M2 19c3 0 3-3 6-3s3 3 6 3 3-3 6-3M8 12V5a2 2 0 0 1 4 0M16 12V5a2 2 0 0 0-4 0",
    colour: "#2aa3d6",
  },
  {
    re: /\b(PLUMBER|PLUMBERS|ELECTRICIAN|ELECTRICIANS|LOCKSMITH|HANDYMAN|PEST|ROOFING|PAINTING|PAINTERS|CLEANING|CLEANERS|MOWING|LAWN|GUTTER|AIRCON|AIR CONDITIONING|CARPET)\b/,
    d: "M15 4a4 4 0 0 0-4.6 5.4L4 15.8 6.2 18l6.4-6.4A4 4 0 0 0 18 7l-2.5 2.5-2-.5-.5-2z",
    colour: "#6f7d95",
  },
  {
    re: /\b(FLORIST|FLORISTS|FLOWERS|FLOWER)\b/,
    d: "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8",
    colour: "#d64579",
  },
  {
    re: /\b(CHILDCARE|CHILD CARE|DAYCARE|DAY CARE|EARLY LEARNING|ELC|OSHC|VACATION CARE)\b/,
    d: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4",
    colour: "#e08a1e",
  },
  {
    re: /\b(MUSEUM|GALLERY|AQUARIUM|ZOO|WILDLIFE|SANCTUARY|BOWLING|ARCADE|LASER TAG|ESCAPE ROOM|MINI GOLF|TRAMPOLINE|THEME PARK|WATER PARK)\b/,
    d: "M3 8h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z",
    colour: "#7a5bd6",
  },
  {
    re: /\b(STORAGE|SELF STORAGE|REMOVALS|REMOVALISTS|MOVERS|MOVING)\b/,
    d: "M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10",
    colour: "#c2683b",
  },
  {
    re: /\b(CAMPING|CAMPGROUND|CARAVAN|CARAVANS|HOLIDAY PARK|TOURIST PARK)\b/,
    d: "M3 20L12 4l9 16zM12 4v16M9 20l3-5 3 5",
    colour: "#2e7d32",
  },
  {
    re: /\b(SURF|SURFING|BOARDRIDERS|SURF SCHOOL)\b/,
    d: "M2 15c3 0 3-3 6-3s3 3 6 3 3-3 6-3M2 19c3 0 3-3 6-3s3 3 6 3 3-3 6-3M12 4l3 5H9z",
    colour: "#00a3e0",
  },
  {
    re: /\b(PRINT|PRINTING|PRINTERS|SIGNS|SIGNAGE|COPY CENTRE)\b/,
    d: "M7 9V3h10v6M5 9h14v8h-2v4H7v-4H5zM9 15h6",
    colour: "#5f7a8a",
  },
  {
    re: /\b(PHOTO|PHOTOS|PHOTOGRAPHY|CAMERA|CAMERAS)\b/,
    d: "M4 8h4l2-3h4l2 3h4v11H4zM12 11a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
    colour: "#7a5bd6",
  },
  {
    re: /\b(MUSIC|GUITAR|PIANO|DRUMS|VIOLIN|SINGING)\b/,
    d: "M9 18V5l11-2v13M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3zM20 16a3 3 0 1 1-3-3 3 3 0 0 1 3 3z",
    colour: "#8d5bd6",
  },
  {
    re: /\b(BIKE|BIKES|CYCLE|CYCLES|CYCLING|BICYCLE|BICYCLES)\b/,
    d: "M6 17a3 3 0 1 0 0 .01M18 17a3 3 0 1 0 0 .01M6 17l4-7h5l3 7M10 10L8 6h3",
    colour: "#2e7d32",
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
    re: /\b(MOTEL|RESORT|INN|LODGE|ACCOMMODATION|APARTMENTS|SERVICED)\b/,
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
