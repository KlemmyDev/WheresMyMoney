/** Money and dates, written the Australian way. Money arrives as whole cents. */

const whole = new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 });
const cents2 = new Intl.NumberFormat("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** $94,600 (or $94,600.00 with `cents`). Negative amounts with a true minus: −$604,820. */
export function money(c: number | null | undefined, opts: { cents?: boolean; sign?: boolean } = {}): string {
  if (c == null || Number.isNaN(c)) return "—";
  const fmt = opts.cents ? cents2 : whole;
  const abs = fmt.format(Math.abs(c) / 100);
  if (c < 0) return `−$${abs}`;
  return `${opts.sign && c > 0 ? "+" : ""}$${abs}`;
}

/** 94,600 or 1,200.00, without a $ sign; −218 or +5,450 with `sign`. */
export function amount(c: number | null | undefined, opts: { cents?: boolean; sign?: boolean } = {}): string {
  if (c == null || Number.isNaN(c)) return "—";
  const fmt = opts.cents ? cents2 : whole;
  const abs = fmt.format(Math.abs(c) / 100);
  if (c < 0) return `−${abs}`;
  return `${opts.sign && c > 0 ? "+" : ""}${abs}`;
}

/** "1,234.5" or "$1,234.50" typed in → cents (null if it isn't a number). */
export function parseMoney(text: string): number | null {
  const t = text.replace(/[$,\s]/g, "").replace(/^−/, "-");
  if (!t || !/^-?\d*(\.\d{0,2})?$/.test(t) || t === "-" || t === ".") return null;
  return Math.round(Number(t) * 100);
}

/** Cents as an editable figure: 1234567 → "12,345.67". */
export function editable(c: number | null | undefined): string {
  return c == null ? "" : cents2.format(c / 100);
}

export function pct(ratio: number | null | undefined, dp = 1): string {
  return ratio == null ? "—" : `${(ratio * 100).toFixed(dp)}%`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function parseDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** 12 Nov */
export function shortDate(iso: string): string {
  const d = parseDate(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** 07 NOV, for the mono date columns. */
export function capsDate(iso: string): string {
  const d = parseDate(iso);
  return `${String(d.getDate()).padStart(2, "0")} ${MONTHS[d.getMonth()].toUpperCase()}`;
}

/** Thu 12 Nov */
export function dayDate(iso: string): string {
  const d = parseDate(iso);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** 12 Nov 2026 */
export function longDate(iso: string): string {
  const d = parseDate(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "2032-07" → Jul 2032 */
export function monthYear(ym: string | null | undefined): string {
  if (!ym) return "—";
  const [y, m] = ym.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** "2026-07" → JUL */
export function monthCaps(ym: string): string {
  return MONTHS[Number(ym.slice(5, 7)) - 1].toUpperCase();
}

export const EVERY_LABEL: Record<string, string> = {
  weekly: "Week",
  fortnightly: "Fortnight",
  monthly: "Month",
  quarterly: "Quarter",
  term: "Term",
  "half-yearly": "Half year",
  yearly: "Year",
};

export const ROLE_LABEL: Record<string, string> = {
  offset: "Offset goal",
  bills: "Bills buffer",
  spending: "Spending allowance",
  savings: "Savings goals",
  track: "Just track it",
};

/** The colour token for an account's colour name. */
export function colour(name: string | null | undefined): string {
  const known = ["offset", "bills", "spending", "savings", "track", "teal", "rose", "sky"];
  return `var(--color-${known.includes(name || "") ? name : "track"})`;
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function daysBetween(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000);
}
