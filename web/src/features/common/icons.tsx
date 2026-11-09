/**
 * The duotone icon set and the icon chip, the app's art style (Nightfall). Each glyph has three layers: `a` is filled
 * at 20%, `b` is stroke only, `c` is solid. A chip tints the glyph with a role or category colour; inside an element
 * with the `chip-host` class it turns solid on hover, press, or when that element is current or pressed.
 */
import type { CSSProperties } from "react";
import { cn } from "~/features/common/ui";

export type Glyph = { a?: string; b?: string; c?: string };

export const I = {
  accounts: {
    a: "M6 6h12a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3z",
    b: "M3 10h18",
    c: "M15.1 14.5a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0-2.8 0",
  },
  loan: {
    a: "M4 11l8-6.5 8 6.5v8.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5z",
    b: "M9.4 14a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0",
  },
  bills: { a: "M5.5 3h13v18l-2.75-1.8L12 21l-2.75-1.8L6.5 21z", b: "M9 9h6M9 13h4" },
  spending: { a: "M12 3a9 9 0 1 0 9 9h-9z", c: "M15 3.4A9 9 0 0 1 20.6 9H15z" },
  savings: { a: "M7 8h10l1 4v6a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-6z", b: "M9 8V6h6v2" },
  offset: { a: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z", b: "M12 8v8M9 13l3 3 3-3" },
  invest: { a: "M3 20v-3l6-6 4 4 8-8v13z", b: "M3 17l6-6 4 4 8-8M15 7h6v6" },
  retire: {
    a: "M8 12a4 4 0 1 0 8 0a4 4 0 1 0-8 0",
    b: "M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4",
  },
  rules: {
    a: "M14 7a2 2 0 1 0 4 0a2 2 0 1 0-4 0M8 17a2 2 0 1 0 4 0a2 2 0 1 0-4 0",
    b: "M4 7h10M18 7h2M4 17h4M12 17h8",
  },
  import: { a: "M4 14h16v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z", b: "M12 4v10M8 10l4 4 4-4" },
  settings: {
    a: "M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0",
    b: "M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8",
  },
  pay: {
    a: "M4 7h16a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z",
    b: "M9.5 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0",
  },
  shield: { a: "M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z", b: "M9 12l2 2 4-4" },
  transfer: { b: "M4 8h14l-3-3M20 16H6l3 3" },
  overview: {
    a: "M4 11l8-6.5 8 6.5v8.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 19.5z",
    b: "M9.4 14a2.6 2.6 0 1 0 5.2 0a2.6 2.6 0 1 0-5.2 0",
  },
  networth: { a: "M3 20v-3l6-6 4 4 8-8v13z", b: "M3 17l6-6 4 4 8-8M15 7h6v6" },
  list: { a: "M5 5h14v14H5z", b: "M8 9h8M8 12h8M8 15h5" },
  sort: { b: "M4 6h16M7 12h10M10 18h4" },
  plus: { b: "M12 5v14M5 12h14" },
  plane: { a: "M2.5 12.5L21 5l-4.5 15-4.5-6.5z", b: "M12 13.5L21 5" },
  car: {
    a: "M4 14l2-5.5A2 2 0 0 1 7.9 7h8.2a2 2 0 0 1 1.9 1.5L20 14v4.5h-2V17H6v1.5H4z",
    b: "M6.3 14.5a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0M15.3 14.5a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0-2.4 0",
  },
  shop: {
    a: "M4 9.5h16V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z",
    b: "M3 9.5L5 4h14l2 5.5c0 1.4-1.2 2.5-2.6 2.5s-2.4-1.1-2.4-2.5c0 1.4-1.1 2.5-2.5 2.5S11 10.9 11 9.5c0 1.4-1.1 2.5-2.5 2.5S6 10.9 6 9.5C6 10.9 4.4 12 3 9.5zM10 20v-4.5h4V20",
  },
  kids: { a: "M3 9l9-4.5L21 9l-9 4.5z", b: "M7 11v4.5c0 1.5 2.2 3 5 3s5-1.5 5-3V11M21 9v5" },
  property: { a: "M5 21V6.5L12 3l7 3.5V21z", b: "M9 9h1.5M13.5 9H15M9 13h1.5M13.5 13H15M10.5 21v-4h3v4" },
  land: { a: "M2.5 19.5l5.5-7 4 4.5 3-3 6.5 5.5z", b: "M15 13.5V4.5l4.5 2.2L15 9" },
  boat: { a: "M3 15h18l-2.6 4.5H5.6z", b: "M12 3.5V15M12 4.5l6 8.5h-6" },
  gem: { a: "M6.5 4h11L21 9l-9 11L3 9z", b: "M3 9h18M12 20L8.5 9 10.5 4M12 20l3.5-11-2-5" },
  play: { a: "M6 5h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3z", c: "M10 9.5v5l4.5-2.5z" },
} satisfies Record<string, Glyph>;

export type Tone = "" | "offset" | "loan" | "bills" | "spending" | "savings" | "invest" | "neutral" | "bad" | "grad";

export function Duo({ g, strokeWidth = 1.6 }: { g: Glyph; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {g.a && <path d={g.a} fill="currentColor" fillOpacity={0.2} />}
      {g.b && <path d={g.b} />}
      {g.c && <path d={g.c} fill="currentColor" stroke="none" />}
    </svg>
  );
}

/** An icon chip. Decorative: give the surrounding control its accessible name. */
export function Chip({
  g,
  tone = "",
  size,
  solid,
  round,
  className,
  style,
}: {
  g: Glyph;
  tone?: Tone;
  size?: "sm" | "md" | "lg" | "xl" | "xxl";
  solid?: boolean;
  round?: boolean;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <span aria-hidden className={cn("ic", size, tone, solid && "solid", round && "round", className)} style={style}>
      <Duo g={g} />
    </span>
  );
}
