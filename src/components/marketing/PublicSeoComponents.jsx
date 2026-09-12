import { Link } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  ListingImage,
  PublicButton,
  PublicPageHeader,
} from "./PublicComponents";
import SupplierCard from "./SupplierCard";
import "./seo.css";

export function SeoLandingHeader({ title, subtitle, children }) {
  return (
    <section className="public-seo-header">
      <PublicPageHeader title={title} subtitle={subtitle} />
      {children}
    </section>
  );
}
export function SeoCategoryCard({ category }) {
  return (
    <article className="public-card public-seo-category">
      <ListingImage
        src={
          category.hero_image_url || "/assets/placeholders/category-default.svg"
        }
        name={`${category.display_name} suppliers`}
      />
      <div>
        <h3>{category.display_name}</h3>
        <p>
          {category.short_description ||
            "Find vetted suppliers and compare structured quotes."}
        </p>
        <PublicButton
          as={Link}
          to={`/categories/${encodeURIComponent(category.slug)}`}
          variant="secondary"
        >
          View category
          <ArrowRight size={16} aria-hidden="true" />
        </PublicButton>
      </div>
    </article>
  );
}
export function SeoResults({
  loading,
  error,
  notFound,
  onRetry,
  empty,
  emptyTitle,
  emptyDescription,
  emptyActions,
  children,
  kind = "suppliers",
}) {
  if (loading)
    return (
      <div className="public-loading" role="status">
        <span>Loading {kind}…</span>
        <div className="public-skeleton" />
        <div className="public-skeleton" />
        <div className="public-skeleton" />
      </div>
    );
  if (error)
    return (
      <div className="public-error" role="alert">
        <h2>{notFound ? "Page not found" : `Could not load ${kind}`}</h2>
        <p>
          {notFound
            ? "This page is unavailable. Please browse the directory for other options."
            : "Please try again in a moment."}
        </p>
        {!notFound && (
          <PublicButton variant="secondary" onClick={onRetry}>
            Try again
          </PublicButton>
        )}
        {notFound && (
          <PublicButton as={Link} to="/suppliers" variant="secondary">
            Browse all suppliers
          </PublicButton>
        )}
      </div>
    );
  if (empty)
    return (
      <div className="public-seo-empty">
        <h2>{emptyTitle}</h2>
        <p>{emptyDescription}</p>
        {emptyActions && (
          <div className="public-seo-actions">{emptyActions}</div>
        )}
      </div>
    );
  return children;
}
export function SeoSupplierResults({ rows }) {
  return (
    <div className="public-supplier-list public-seo-results">
      {rows.map((supplier) => (
        <SupplierCard key={supplier.id} supplier={supplier} layout="list" />
      ))}
    </div>
  );
}
export function SeoPagination({ page, safePage, totalPages, onPage }) {
  return (
    <nav className="public-seo-pagination" aria-label="Supplier result pages">
      <PublicButton
        variant="secondary"
        onClick={() => onPage(page - 1)}
        disabled={page <= 1}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Previous
      </PublicButton>
      <span>
        Page {safePage} of {totalPages}
      </span>
      <PublicButton
        variant="secondary"
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages}
      >
        Next
        <ArrowRight size={16} aria-hidden="true" />
      </PublicButton>
    </nav>
  );
}
