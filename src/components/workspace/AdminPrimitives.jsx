import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useId,
} from "react";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import Button from "../ui/Button";
import { MetricCard, EmptyState, WorkspaceDialog } from "./WorkspaceComponents";

export { Button, EmptyState, WorkspaceDialog as Modal, MetricCard as StatCard };

export function FormSection({
  title,
  description,
  children,
  className = "",
  ...props
}) {
  return (
    <section className={`ew-panel ew-form-section ${className}`} {...props}>
      {title && (
        <FormSectionHeader>
          <FormSectionTitle>{title}</FormSectionTitle>
          {description && (
            <FormSectionDescription>{description}</FormSectionDescription>
          )}
        </FormSectionHeader>
      )}
      {children}
    </section>
  );
}
export function FormSectionHeader({ className = "", ...props }) {
  return <div className={`ew-form-section-header ${className}`} {...props} />;
}
export function FormSectionTitle({ className = "", ...props }) {
  return <h2 className={`ew-form-section-title ${className}`} {...props} />;
}
export function FormSectionDescription({ className = "", ...props }) {
  return <p className={`ew-form-help ${className}`} {...props} />;
}
export function FormSectionBody({ className = "", ...props }) {
  return <div className={`ew-form-section-body ${className}`} {...props} />;
}
export {
  FormSection as Card,
  FormSectionHeader as CardHeader,
  FormSectionTitle as CardTitle,
  FormSectionDescription as CardDescription,
  FormSectionBody as CardContent,
};

export function Section({ title, right, children }) {
  return (
    <section className="ew-admin-section">
      {(title || right) && (
        <div className="ew-admin-section-heading">
          {title && <h2>{title}</h2>}
          {right && <div className="ew-admin-toolbar">{right}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function FormField({ label, help, error, children, className = "" }) {
  const id = useId();
  const child = Children.only(children);
  const controlId = child.props.id || id;
  const description =
    [
      child.props["aria-describedby"],
      help && `${id}-help`,
      error && `${id}-error`,
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className={`ew-field ${className}`}>
      <label className="ew-field-label" htmlFor={controlId}>
        {label}
      </label>
      {cloneElement(child, {
        id: controlId,
        "aria-describedby": description,
        "aria-invalid": error ? true : child.props["aria-invalid"],
      })}
      {help && (
        <p id={`${id}-help`} className="ew-form-help">
          {help}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="ew-field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className = "", ...props }) {
  return <input className={`ew-control ${className}`} {...props} />;
}
export function Textarea({ className = "", ...props }) {
  return (
    <textarea className={`ew-control ew-textarea ${className}`} {...props} />
  );
}
// Native selects retain each caller's real change event and option semantics, including empty values.
export function Select({ className = "", ...props }) {
  return <select className={`ew-control ew-select ${className}`} {...props} />;
}

export function Feedback({ tone = "danger", children, onRetry }) {
  const Icon =
    tone === "success" ? CheckCircle2 : tone === "warning" ? Info : AlertCircle;
  return (
    <div
      className={`ew-feedback ew-feedback-${tone}`}
      role={tone === "danger" ? "alert" : "status"}
    >
      <Icon size={18} aria-hidden="true" />
      <div>{children}</div>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
export function Skeleton({ className = "" }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`ew-skeleton ew-admin-skeleton ${className}`}
    />
  );
}

export function Badge({ variant = "neutral", className = "", children }) {
  const tone = variant === "brand" ? "blue" : variant;
  return (
    <span className={`ew-status ew-status-${tone} ${className}`}>
      {children}
    </span>
  );
}

// Preserve the compound table API and each cell's controls while using DataTable's
// approved styling and mobile labels. No sorting, fetching or row data is changed.
const TableLabels = createContext([]);
function textOf(node) {
  return Children.toArray(node)
    .map((child) =>
      typeof child === "string" || typeof child === "number"
        ? String(child)
        : isValidElement(child)
          ? textOf(child.props.children)
          : "",
    )
    .join(" ")
    .trim();
}
export function Table({ children, className = "", ...props }) {
  const head = Children.toArray(children).find(
    (child) => isValidElement(child) && child.type === THead,
  );
  const row =
    head && Children.toArray(head.props.children).find(isValidElement);
  const labels = row
    ? Children.toArray(row.props.children).map((cell) =>
        textOf(cell.props?.children),
      )
    : [];
  return (
    <TableLabels.Provider value={labels}>
      <table className={`ew-data-table ew-admin-table ${className}`} {...props}>
        {children}
      </table>
    </TableLabels.Provider>
  );
}
export function THead(props) {
  return <thead {...props} />;
}
export function TBody(props) {
  return <tbody {...props} />;
}
export function TH(props) {
  return <th scope="col" {...props} />;
}
export function TD(props) {
  return <td {...props} />;
}
export function TR({ children, interactive, onClick, ...props }) {
  const labels = useContext(TableLabels);
  return (
    <tr
      {...props}
      data-interactive={interactive || undefined}
      onClick={onClick}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (event) => {
              if (
                event.target === event.currentTarget &&
                (event.key === "Enter" || event.key === " ")
              ) {
                event.preventDefault();
                onClick(event);
              }
            }
          : undefined
      }
    >
      {Children.map(children, (child, index) =>
        isValidElement(child) && child.type === TD
          ? cloneElement(child, {
              "data-label": child.props.colSpan ? undefined : labels[index],
            })
          : child,
      )}
    </tr>
  );
}

export function FormActions({ children }) {
  return <div className="ew-form-actions">{children}</div>;
}
