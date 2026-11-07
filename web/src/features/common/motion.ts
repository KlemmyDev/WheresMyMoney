/**
 * The motion spec in code: numbers count up from the last value seen (600ms), never from zero after the first visit;
 * reduced motion makes them jump to their value. Durations and curves are the CSS tokens in styles/app.css.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

export const DURATION = { press: 90, hover: 150, content: 240, sheet: 360, exit: 250, number: 600, chart: 700 };

const query = "(prefers-reduced-motion: reduce)";

function subscribe(cb: () => void) {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(query);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false),
    () => false,
  );
}

// The last value each number was seen at, for this visit (a reload starts again from zero).
const seen = new Map<string, number>();

/** A number that counts from where it was last seen to `value`, easing out (cubic) over 600ms. */
export function useCountUp(key: string, value: number, duration = DURATION.number): number {
  const reduced = useReducedMotion();
  const from = seen.get(key) ?? 0;
  const [shown, setShown] = useState(from);
  const raf = useRef(0);
  useEffect(() => {
    seen.set(key, value);
    if (reduced || from === value) return;
    const start = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - p, 3);
      setShown(from + (value - from) * e);
      if (p < 1) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, value, reduced]);
  return reduced || from === value ? value : shown;
}

/** A fraction (0–1) that sweeps from its last seen value to `value` over 700ms: gauges and arcs. */
export function useSweep(key: string, value: number): number {
  return useCountUp(`sweep:${key}`, value, DURATION.chart);
}

/** Whether something is leaving: keeps it mounted for the exit animation (250ms), then unmounts it. */
export function usePresence(open: boolean, exit = DURATION.exit): { mounted: boolean; leaving: boolean } {
  const [was, setWas] = useState(open);
  const [leaving, setLeaving] = useState(false);
  // Closing starts the exit (adjusted while rendering, as React suggests, rather than in an effect).
  if (open !== was) {
    setWas(open);
    setLeaving(!open);
  }
  useEffect(() => {
    if (!leaving) return;
    const t = setTimeout(() => setLeaving(false), exit);
    return () => clearTimeout(t);
  }, [leaving, exit]);
  return { mounted: open || leaving, leaving };
}
