import { useId } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  Search,
  SlidersHorizontal,
  MapPin,
  Users,
  Check,
  Sparkles,
} from "lucide-react";
import Button from "../ui/Button";
import Input from "../ui/Input";
import EmptyState from "../ui/EmptyState";
import PageHeader from "../layout/PageHeader";
import WorkspaceImage from "../workspace/WorkspaceImage";
import { toPublicImageUrl } from "../../lib/publicImageUrl";
import {
  formatVenueGuestCapacity,
  getVenueConfidenceLabels,
} from "../../lib/venueDisplay";
import "./public.css";

export function PublicButton({ className = "", ...props }) {
  return <Button className={`public-button ${className}`} {...props} />;
}
export function PublicPageHeader({ title, subtitle, actions, breadcrumb }) {
  return (
    <div className="public-page-header">
      {breadcrumb && (
        <nav className="public-breadcrumbs" aria-label="Breadcrumb">
          <Link to="/">Home</Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{breadcrumb}</span>
        </nav>
      )}
      <PageHeader title={title} subtitle={subtitle} actions={actions} />
    </div>
  );
}
export function PublicSectionHeader({ title, description, to, linkLabel }) {
  return (
    <div className="public-section-head">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {to && (
        <Link to={to}>
          {linkLabel}
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
export function PublicSearch({ label, ...props }) {
  return (
    <div className="public-search">
      <Search size={20} aria-hidden="true" />
      <Input type="search" aria-label={label} {...props} />
    </div>
  );
}
export function PublicSelect({ label, children, ...props }) {
  const id = useId();
  return (
    <div className="public-field">
      <label htmlFor={id}>{label}</label>
      <select id={id} {...props}>
        {children}
      </select>
    </div>
  );
}
export function PublicFilterPanel({ children, onClear, active }) {
  return (
    <aside className="public-filter-panel" aria-label="Search filters">
      <details open>
        <summary>
          <SlidersHorizontal size={18} aria-hidden="true" />
          Refine your search
        </summary>
        <div className="public-filter-fields">
          {children}
          <PublicButton
            variant="secondary"
            onClick={onClear}
            disabled={!active}
          >
            Clear filters
          </PublicButton>
        </div>
      </details>
    </aside>
  );
}
export function MarketplaceResults({ kind, filters, help, children }) {
  return (
    <div
      className={`public-market-layout ${kind === "suppliers" ? "public-market-suppliers" : ""}`}
    >
      {filters}
      <section
        className="public-results"
        aria-label={`${kind === "suppliers" ? "Supplier" : "Venue"} results`}
      >
        {children}
      </section>
      {help && <aside className="public-market-aside">{help}</aside>}
    </div>
  );
}
export function PublicCallout({
  title = "Looking for something specific?",
  description = "Tell suppliers about your event and compare personalised quotes.",
  to = "/request",
  label = "Get Quotes",
  compact = false,
}) {
  return (
    <div
      className={`public-callout ${compact ? "public-callout-compact" : ""}`}
    >
      <div>
        <Sparkles size={24} aria-hidden="true" />
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      <PublicButton as={Link} to={to}>
        {label}
        <ArrowRight size={16} aria-hidden="true" />
      </PublicButton>
    </div>
  );
}
export function PublicResultsState({
  loading,
  error,
  empty,
  kind,
  onRetry,
  onClear,
  children,
}) {
  if (loading)
    return (
      <div role="status" className="public-loading">
        <span>Loading {kind}…</span>
        <div aria-hidden="true" className="public-skeleton" />
        <div aria-hidden="true" className="public-skeleton" />
        <div aria-hidden="true" className="public-skeleton" />
      </div>
    );
  if (error)
    return (
      <div role="alert" className="public-error">
        <h2>Could not load {kind}</h2>
        <p>Please try again in a moment.</p>
        <PublicButton variant="secondary" onClick={onRetry}>
          Try again
        </PublicButton>
      </div>
    );
  if (empty)
    return (
      <div className="public-empty">
        <EmptyState
          title={`No ${kind} found`}
          description="Try a different search or check back soon."
          actionLabel={onClear ? "Clear filters" : undefined}
          onAction={onClear}
        />
      </div>
    );
  return children;
}
export function ListingImage({ src, name, className = "" }) {
  return (
    <WorkspaceImage
      src={toPublicImageUrl(src)}
      alt={name}
      className={`public-listing-image ${className}`}
    />
  );
}
export function VenueCard({ venue, compact = false }) {
  const capacity = formatVenueGuestCapacity(venue.guestMin, venue.guestMax);
  const label = getVenueConfidenceLabels(venue, 1)[0];
  return (
    <article
      className={`public-card public-venue-card ${compact ? "public-feature-card" : ""}`}
    >
      <ListingImage src={venue.heroImageUrl} name={venue.name} />
      <div className="public-card-body">
        <h3>
          <Link to={`/venues/${venue.slug}`}>{venue.name}</Link>
        </h3>
        {venue.locationLabel && (
          <p className="public-meta">
            <MapPin size={16} aria-hidden="true" />
            {venue.locationLabel}
          </p>
        )}
        {capacity && (
          <p className="public-meta">
            <Users size={16} aria-hidden="true" />
            {capacity}
          </p>
        )}
        {label && <p className="public-confidence">{label}</p>}
        {!compact && venue.shortDescription && (
          <p className="public-card-copy">{venue.shortDescription}</p>
        )}
        <Link className="public-text-link" to={`/venues/${venue.slug}`}>
          View venue
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
export function CategoryCard({ category, index = 0 }) {
  return (
    <Link
      className={`public-category public-tone-${index % 4}`}
      to={category.href}
    >
      <ListingImage src={category.image} name={category.name} />
      <span>
        {category.name}
        <ArrowRight size={18} aria-hidden="true" />
      </span>
    </Link>
  );
}
export function EventSearchPanel({
  searchPlan,
  onPlanChange,
  searchLocation,
  onLocationChange,
  onSubmit,
}) {
  return (
    <form
      onSubmit={onSubmit}
      className="public-event-search"
      aria-label="Find event suppliers"
    >
      <label className="public-field">
        <span>What are you planning?</span>
        <input
          value={searchPlan}
          onChange={onPlanChange}
          placeholder="Event or service"
        />
      </label>
      <label className="public-field">
        <span>Where?</span>
        <input
          value={searchLocation}
          onChange={onLocationChange}
          placeholder="Town or postcode"
        />
      </label>
      <PublicButton type="submit">
        <Search size={18} aria-hidden="true" />
        Search
      </PublicButton>
    </form>
  );
}
export function PublicTrust({ items }) {
  return (
    <ul className="public-trust">
      {items.map((item) => (
        <li key={item}>
          <Check size={18} aria-hidden="true" />
          {item}
        </li>
      ))}
    </ul>
  );
}
