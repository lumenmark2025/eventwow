import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Button from "./Button";

export default function Modal({ open, onClose, title, children, footer }) {
  const panelRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const previousActiveElementRef = useRef(null);
  const previousBodyOverflowRef = useRef("");

  onCloseRef.current = onClose;

  function getFocusableElements() {
    const panel = panelRef.current;
    if (!panel) return [];
    return [...panel.querySelectorAll(
      'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter((el) => !el.hasAttribute("disabled") && el.getAttribute("aria-hidden") !== "true");
  }

  useEffect(() => {
    if (!open) return;
    previousActiveElementRef.current = document.activeElement;
    previousBodyOverflowRef.current = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const raf = window.requestAnimationFrame(() => {
      const focusables = getFocusableElements();
      if (focusables.length > 0) focusables[0].focus();
      else panelRef.current?.focus();
    });

    function onKeyDown(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== "Tab") return;
      const focusables = getFocusableElements();
      if (!focusables.length) {
        e.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
        return;
      }
      if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousBodyOverflowRef.current || "";
      const prev = previousActiveElementRef.current;
      if (prev && typeof prev.focus === "function") prev.focus();
    };
  }, [open]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close modal overlay"
        className="absolute inset-0 bg-slate-900/30"
        onClick={() => onCloseRef.current?.()}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 max-h-[calc(100vh-2rem)] w-full max-w-lg overflow-y-auto overscroll-contain rounded-xl border border-slate-200 bg-white p-5 shadow-xl focus:outline-none"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold">{title}</h3>
          <Button type="button" variant="ghost" size="sm" onClick={() => onCloseRef.current?.()} aria-label="Close modal">
            Close
          </Button>
        </div>
        <div className="text-sm text-slate-700">{children}</div>
        {footer ? <div className="mt-4">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}
