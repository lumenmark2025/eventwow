import { useId, useRef } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import MarketingShell from "../layout/MarketingShell";
import Input from "../ui/Input";
import { PublicButton, PublicPageHeader } from "./PublicComponents";
import "./journey.css";

export function JourneyShell({ children }) {
  return (
    <MarketingShell landing>
      <div className="public-journey">{children}</div>
    </MarketingShell>
  );
}
export function JourneyCard({ className = "", ...props }) {
  return <section className={`journey-card ${className}`} {...props} />;
}
export function JourneyCardHeader({ className = "", ...props }) {
  return <header className={`journey-card-header ${className}`} {...props} />;
}
export function JourneyCardTitle({ className = "", ...props }) {
  return <h2 className={`journey-card-title ${className}`} {...props} />;
}
export function JourneyCardContent({ className = "", ...props }) {
  return <div className={`journey-card-content ${className}`} {...props} />;
}
export function JourneyInput({ label, ...props }) {
  const id = useId();
  // Date/time/budget inputs already sit inside explicit labels.
  if (props["aria-label"]) return <Input {...props} />;
  return (
    <label className="journey-field" htmlFor={id}>
      <span>{label || props.placeholder}</span>
      <Input id={id} {...props} />
    </label>
  );
}
export function JourneySection({ title, children }) {
  return (
    <fieldset className="journey-form-section">
      <legend>{title}</legend>
      {children}
    </fieldset>
  );
}
export function JourneyState({ title, description, action, page = false }) {
  return (
    <div className={`journey-state ${page ? "journey-page-state" : ""}`}>
      {page ? (
        <PublicPageHeader title={title} subtitle={description} />
      ) : (
        <>
          <h2 className="journey-card-title">{title}</h2>
          <p>{description}</p>
        </>
      )}
      {action}
    </div>
  );
}
export function JourneyModal({ open, onClose, title, children, footer }) {
  const opener = useRef(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <Dialog.Portal>
        <div className="public-v2 public-journey journey-modal-root">
          <Dialog.Overlay className="journey-modal-overlay" />
          <Dialog.Content
            className="journey-modal"
            onOpenAutoFocus={() => {
              opener.current = document.activeElement;
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              opener.current?.focus();
            }}
            aria-describedby={undefined}
          >
            <header>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Close asChild>
                <PublicButton variant="ghost" aria-label="Close modal">
                  <X size={20} aria-hidden="true" />
                </PublicButton>
              </Dialog.Close>
            </header>
            {children}
            {footer && <footer>{footer}</footer>}
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
