import { useId, useRef } from "react";
import { Link } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, AlertCircle, Search, X, Inbox } from "lucide-react";
import PageHeader from "../layout/PageHeader";
import Button from "../ui/Button";

export const WorkspacePageHeader = PageHeader;

export function MetricCard({
  label,
  value,
  hint,
  icon = Inbox,
  tone = "blue",
  loading = false,
}) {
  const Icon = icon;
  return (
    <article className="ew-panel ew-metric" aria-busy={loading}>
      <div>
        <p>{label}</p>
        <strong>
          {loading ? (
            <span className="ew-skeleton" aria-label="Loading metric" />
          ) : (
            (value ?? "—")
          )}
        </strong>
        {hint && <small>{hint}</small>}
      </div>
      <span className={`ew-metric-icon ew-tone-${tone}`}>
        <Icon size={21} aria-hidden="true" />
      </span>
    </article>
  );
}

export function StatusBadge({ status, children }) {
  const value = String(status || "unknown").toLowerCase();
  const tone =
    /^(accepted|approved|published|quoted|verified|success|booked|sent)$/.test(
      value,
    )
      ? "success"
      : /^(rejected|declined|failed)$/.test(value)
        ? "danger"
        : /^(new|pending|draft|needs attention|updated_awaiting_acceptance)$/.test(value)
          ? "warning"
          : /^(in progress|invited|viewed)$/.test(value)
            ? "blue"
            : "neutral";
  return (
    <span className={`ew-status ew-status-${tone}`}>
      {children || status || "Unknown"}
    </span>
  );
}

export function EmptyState({
  title = "No records yet",
  description,
  actionLabel,
  onAction,
}) {
  return (
    <div className="ew-empty">
      <Inbox size={24} aria-hidden="true" />
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {actionLabel && (
        <Button variant="secondary" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div role="alert" className="ew-error">
      <AlertCircle size={20} aria-hidden="true" />
      <div>
        <strong>Unable to load data</strong>
        <p>{message}</p>
      </div>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function FilterBar({
  search,
  onSearchChange,
  placeholder = "Search records…",
  status,
  onStatusChange,
  statuses = [],
  children,
  count,
}) {
  const id = useId();
  return (
    <div className="ew-filterbar">
      <label className="ew-search-input">
        <Search size={18} aria-hidden="true" />
        <input
          aria-label={placeholder}
          placeholder={placeholder}
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>
      {onStatusChange && (
        <>
          <label htmlFor={id} className="sr-only">
            Filter by status
          </label>
          <select
            id={id}
            value={status}
            onChange={(event) => onStatusChange(event.target.value)}
          >
            <option value="all">All statuses</option>
            {statuses.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </>
      )}
      {count != null && (
        <span className="ew-result-count" aria-live="polite">
          {count} results
        </span>
      )}
      {children}
    </div>
  );
}

// A labelled stacked row on narrow screens keeps every value and action available.
export function DataTable({
  className = "",
  columns,
  rows,
  rowKey = "id",
  caption,
  loading,
  error,
  onRetry,
  emptyTitle,
  emptyDescription,
}) {
  if (loading)
    return (
      <div className="ew-loading" role="status">
        <span className="ew-skeleton" />
        <span className="ew-skeleton" />
        <span className="ew-skeleton" />
        Loading records…
      </div>
    );
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!rows.length)
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  return (
    <div className="ew-table-wrap">
      <table className={`ew-data-table ${className}`}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[rowKey]}>
              {columns.map((column) => (
                <td key={column.key} data-label={column.label}>
                  {column.render
                    ? column.render(row)
                    : (row[column.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DashboardCard({ title, to, children, className = "" }) {
  return (
    <section className={`ew-panel ew-dashboard-card ${className}`}>
      <div className="ew-panel-heading">
        <h2>{title}</h2>
        {to && (
          <Link to={to}>
            View all <ArrowRight size={14} aria-hidden="true" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

export function ActivityList({ items = [], loading, error, onRetry }) {
  if (loading || error || !items.length)
    return (
      <DataTable
        columns={[]}
        rows={[]}
        loading={loading}
        error={error}
        onRetry={onRetry}
        emptyTitle="No recent activity"
        emptyDescription="Credit adjustments will appear here."
      />
    );
  return (
    <ul className="ew-activity">
      {items.map((item) => (
        <li key={item.id}>
          <span className="ew-activity-dot" />
          <div>
            <strong>{item.title}</strong>
            <p>{item.description}</p>
            <small>{item.when}</small>
          </div>
          <span className="ew-activity-value">{item.value}</span>
        </li>
      ))}
    </ul>
  );
}

export function QuickActions({ actions }) {
  return (
    <div className="ew-quick-actions">
      {actions.map(({ label, to, icon }) => {
        const Icon = icon;
        return (
          <Link key={to} to={to}>
            <Icon size={20} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        );
      })}
    </div>
  );
}

export function ApprovalAlert({ count, label, to }) {
  if (!Number.isFinite(count) || count <= 0) return null;
  return (
    <div className="ew-approval">
      <AlertCircle size={18} aria-hidden="true" />
      <div>
        <strong>
          {count} {label}
        </strong>
        <Link to={to}>
          Review now <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

export function WorkspaceDialog({ open, onClose, title, children, footer }) {
  const opener = useRef(null);
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose?.();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="workspace-v2 ew-overlay" />
        <Dialog.Content
          className="workspace-v2 workspace-ui ew-dialog"
          aria-describedby={undefined}
          onOpenAutoFocus={() => {
            opener.current = document.activeElement;
          }}
          onCloseAutoFocus={(event) => {
            if (opener.current?.isConnected) {
              event.preventDefault();
              opener.current.focus();
            }
          }}
        >
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Close
            className="ew-icon-button ew-dialog-close"
            aria-label="Close dialog"
          >
            <X size={20} />
          </Dialog.Close>
          <div className="ew-dialog-body">{children}</div>
          {footer && <div className="ew-dialog-footer">{footer}</div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
