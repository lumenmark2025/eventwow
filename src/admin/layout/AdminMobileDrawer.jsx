import { useEffect, useRef } from "react";
import { NavLink } from "react-router-dom";
import { createPortal } from "react-dom";
import eventwowLogoMark from "../../assets/brand/eventwow-logo-mark.svg";
import Button from "../../components/ui/Button";
import { adminNavItems } from "./adminNavItems";

export default function AdminMobileDrawer({ open, onClose }) {
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
      } else if (!e.shiftKey && active === last) {
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
    <div className="fixed inset-0 z-50 md:hidden">
      <button
        type="button"
        aria-label="Close navigation menu"
        className="absolute inset-0 bg-slate-900/40"
        onClick={() => onCloseRef.current?.()}
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label="Admin navigation menu"
        className="absolute inset-y-0 left-0 flex w-[86vw] max-w-xs flex-col border-r border-slate-200 bg-white p-4 shadow-xl focus:outline-none"
      >
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <img
              src={eventwowLogoMark}
              alt="Eventwow"
              width="24"
              height="24"
              className="h-6 w-6 rounded-md"
              loading="eager"
              decoding="async"
            />
            <p className="text-sm font-semibold text-slate-900">Menu</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => onCloseRef.current?.()}>
            Close
          </Button>
        </div>

        <nav aria-label="Admin navigation" className="space-y-1">
          {adminNavItems.map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              onClick={() => onCloseRef.current?.()}
              className={({ isActive }) =>
                [
                  "flex items-center rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-teal-50 text-teal-700"
                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                ].join(" ")
              }
              end={item.to === "/admin/dashboard"}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>,
    document.body
  );
}
