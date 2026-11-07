/**
 * Dark (the default), light, or match the device. Stored per browser; applied as data-theme on <html> before the
 * first paint (see THEME_SCRIPT in routes/__root.tsx) so there's no flash of the wrong theme.
 */
import { useEffect, useSyncExternalStore } from "react";

export type ThemeChoice = "dark" | "light" | "auto";
const KEY = "wmm:theme";
const EVENT = "wmm:theme-change";

function subscribe(on: () => void) {
  window.addEventListener(EVENT, on);
  window.addEventListener("storage", on);
  return () => {
    window.removeEventListener(EVENT, on);
    window.removeEventListener("storage", on);
  };
}

export function readTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "auto" ? v : "dark";
  } catch {
    return "dark";
  }
}

function apply(choice: ThemeChoice) {
  const light = choice === "light" || (choice === "auto" && window.matchMedia("(prefers-color-scheme: light)").matches);
  document.documentElement.dataset.theme = light ? "light" : "dark";
}

/** The theme choice and a setter that stores and applies it. Follows the device while on "auto". */
export function useTheme(): [ThemeChoice, (c: ThemeChoice) => void] {
  const choice = useSyncExternalStore(subscribe, readTheme, () => "dark" as ThemeChoice);
  useEffect(() => {
    if (choice !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const on = () => apply("auto");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [choice]);
  return [
    choice,
    (c) => {
      try {
        localStorage.setItem(KEY, c);
      } catch {
        // Private mode: the choice lasts until the page reloads.
      }
      apply(c);
      window.dispatchEvent(new Event(EVENT));
    },
  ];
}

/** Runs in <head> before paint. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${KEY}");var l=t==="light"||(t==="auto"&&matchMedia("(prefers-color-scheme: light)").matches);document.documentElement.dataset.theme=l?"light":"dark"}catch(e){document.documentElement.dataset.theme="dark"}`;

/** A per-browser on/off setting (like "hide balances"), shared live across components. */
export function useStoredFlag(key: string): [boolean, (v: boolean) => void] {
  const read = () => {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  };
  const value = useSyncExternalStore(subscribe, read, () => false);
  return [
    value,
    (v) => {
      try {
        localStorage.setItem(key, v ? "1" : "0");
      } catch {
        // Private mode: lasts until reload.
      }
      window.dispatchEvent(new Event(EVENT));
    },
  ];
}
