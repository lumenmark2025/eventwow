import { useId } from "react";
import { ChevronDown } from "lucide-react";
import { PublicSectionHeader } from "./PublicComponents";
import "./info.css";

// Plain content sections for existing informational copy; no product data.
export function PublicInfoSection({ title, children }) {
  return (
    <section className="public-info-section">
      <PublicSectionHeader title={title} />
      {children}
    </section>
  );
}
export function PublicFAQ({ items }) {
  const id = useId();
  return (
    <section className="public-info-section" aria-labelledby={id}>
      <h2 id={id}>FAQ</h2>
      <div className="public-info-faq">
        {items.map(({ q, a }) => (
          <details key={q}>
            <summary>
              {q}
              <ChevronDown size={20} aria-hidden="true" />
            </summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
