/**
 * The on-screen keyboard. On a phone, the keyboard covers the bottom of the page without resizing it (Safari on
 * iPhone always; Chrome on Android unless told otherwise), so anything pinned to the bottom, like a sheet, ends up
 * behind the keys. `useKeyboard` reports how much of the page the keyboard covers and how much is left showing,
 * from the visual viewport, so a sheet can sit above the keyboard and fit in what's left.
 */
import { useEffect, useState } from "react";

export type Keyboard = { inset: number; visible: number };

const read = (): Keyboard => {
  if (typeof window === "undefined" || !window.visualViewport) return { inset: 0, visible: 0 };
  const vv = window.visualViewport;
  const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
  // Less than this is browser chrome sliding about, not a keyboard.
  return { inset: inset > 80 ? inset : 0, visible: Math.round(vv.height) };
};

export function useKeyboard(active = true): Keyboard {
  const [kb, setKb] = useState<Keyboard>({ inset: 0, visible: 0 });
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!active || !vv) return;
    const update = () => setKb(read());
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, [active]);
  return active ? kb : { inset: 0, visible: 0 };
}

/** Style for a sheet pinned to the bottom: above the keyboard while it's up, and no taller than what's left. */
export function aboveKeyboard(kb: Keyboard, gap = 12): React.CSSProperties | undefined {
  if (!kb.inset) return undefined;
  return { bottom: kb.inset, maxHeight: Math.max(240, kb.visible - gap) };
}
