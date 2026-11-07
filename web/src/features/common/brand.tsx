/**
 * The WheresMyMoney logo, "Trail" (brand/README.md): one teal line draws a W and climbs to an ink dot, the path your
 * money took ending at "here it is". The dot sits behind a small masked gap so it works on any background.
 *
 * Inlined here (rather than as an image) so the loading mark can draw: the line left to right in 700ms on the enter
 * curve, then the dot pops in (420ms, spring). Once, never looping; static under reduced motion. Each copy gets its
 * own mask id, as the page can show more than one.
 */
import { useId, type CSSProperties } from "react";

const PATH = "M13 23L22.5 42L32 27L41.5 42L48 27";

/** The bare mark. At 32px and below it uses the heavier small-size line. `draw` animates it in (the loading mark). */
export function Mark({ size = 28, draw = false, light = false }: { size?: number; draw?: boolean; light?: boolean }) {
  const id = useId().replace(/:/g, "");
  const small = size <= 32;
  const stroke = small ? 8 : 6.5;
  const gap = small ? 10 : 9.5;
  const dot = small ? 7 : 6.5;
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} role="img" aria-label="WheresMyMoney" className="flex-none">
      <defs>
        <mask id={`wmm-${id}`} maskUnits="userSpaceOnUse" x="-20" y="-20" width="104" height="104">
          <rect x="-20" y="-20" width="104" height="104" fill="#fff" />
          <circle cx="50" cy="21" r={gap} fill="#000" />
        </mask>
      </defs>
      <g transform="translate(-2.75 2)">
        <path
          d={PATH}
          fill="none"
          stroke={light ? "#0d9488" : "#2dd4bf"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          mask={`url(#wmm-${id})`}
          pathLength={100}
          className={draw ? "draw" : undefined}
          style={draw ? ({ strokeDasharray: 100, "--len": 100 } as CSSProperties) : undefined}
        />
        <circle
          cx="50"
          cy="21"
          r={dot}
          fill={light ? "#0f1720" : "#e6edf3"}
          className={draw ? "pop" : undefined}
          style={draw ? { transformBox: "fill-box", transformOrigin: "center", animationDelay: "700ms" } : undefined}
        />
      </g>
    </svg>
  );
}

/** The mark with the wordmark, which is live text in Sora SemiBold (the interface itself stays in IBM Plex). */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="flex items-center gap-2">
      <Mark size={size} />
      <span className="font-brand text-base font-semibold tracking-[-0.02em] text-ink">WheresMyMoney</span>
    </span>
  );
}

/** While a page loads: the mark drawing itself in, once. */
export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex h-[50vh] items-center justify-center" aria-busy="true" aria-label={label}>
      <Mark size={56} draw />
    </div>
  );
}
