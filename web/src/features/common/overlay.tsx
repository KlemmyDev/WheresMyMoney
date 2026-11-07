/**
 * Dialogs and toasts, as the motion spec has them.
 *
 * A dialog scales in from 96% on a desktop and slides up as a sheet on a phone (360ms, on the enter curve), over a
 * backdrop that fades; it leaves at 70% of that (250ms, on the exit curve). Escape and the backdrop close it, and
 * focus moves into it and back.
 *
 * A toast rises 16px, waits 2.5s (hovering pauses it) and sinks out. It can offer Undo. Money that's permanent gets a
 * dialog, not a toast.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePresence } from "~/features/common/motion";
import { cn } from "~/features/common/ui";

export function Dialog({
  open,
  onClose,
  labelledBy,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const { mounted, leaving } = usePresence(open);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => panel.current?.querySelector<HTMLElement>("input, button, [tabindex]")?.focus(), 30);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      clearTimeout(t);
      before?.focus?.();
    };
  }, [open, onClose]);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-40">
      <div className={cn("absolute inset-0 bg-black/55", leaving ? "scrim-out" : "scrim-in")} onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={cn(
          // A sheet from the bottom on a phone; a dialog in the middle from 640px.
          "absolute inset-x-0 bottom-0 flex max-h-[92vh] flex-col overflow-hidden rounded-t-2xl border border-line bg-tile shadow-[0_30px_80px_rgba(0,0,0,.6)]",
          "sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:max-h-[88vh] sm:w-[min(92vw,var(--w))] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl",
          "dialog-panel",
          leaving ? "leaving" : "entering",
        )}
        style={{ ["--w" as string]: wide ? "1040px" : "620px" }}
      >
        <div className="mx-auto mt-2 h-1 w-8 flex-none rounded-full bg-ink-3 sm:hidden" aria-hidden />
        {children}
      </div>
    </div>,
    document.body,
  );
}

type Toast = { id: number; text: string; undo?: () => void; leaving?: boolean };
const ToastContext = createContext<(text: string, undo?: () => void) => void>(() => {});

/** const toast = useToast(); toast("Saved $64.80", undoIt). */
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hovering = useRef(false);
  const leave = useCallback(() => {
    setToast((t) => (t ? { ...t, leaving: true } : t));
    timer.current = setTimeout(() => setToast(null), 250);
  }, []);
  const arm = useCallback(() => {
    clearTimeout(timer.current);
    const wait = () => {
      timer.current = setTimeout(() => (hovering.current ? wait() : leave()), 2500);
    };
    wait();
  }, [leave]);
  const show = useCallback(
    (text: string, undo?: () => void) => {
      setToast({ id: Date.now(), text, undo });
      arm();
    },
    [arm],
  );
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        aria-live="polite"
        role="status"
        className="pointer-events-none fixed inset-x-0 bottom-[84px] z-50 flex justify-center px-4 sm:bottom-6"
      >
        {toast && (
          <div
            key={toast.id}
            onMouseEnter={() => (hovering.current = true)}
            onMouseLeave={() => (hovering.current = false)}
            className={cn(
              "pointer-events-auto flex items-center gap-3 rounded-[10px] border border-line bg-raised px-3.5 py-2.5 text-[13px] shadow-[0_12px_30px_rgba(0,0,0,.5)]",
              toast.leaving ? "toast-out" : "toast-in",
            )}
          >
            <span className="text-good">✓</span>
            <span>{toast.text}</span>
            {toast.undo && (
              <button
                type="button"
                className="press cursor-pointer border-0 bg-transparent font-semibold text-teal"
                onClick={() => {
                  toast.undo?.();
                  leave();
                }}
              >
                Undo
              </button>
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}
