import { useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Images,
  MapPin,
  Star,
  X,
} from "lucide-react";
import { PublicButton, PublicPageHeader } from "./PublicComponents";
import PublicImage from "./PublicImage";
import { toPublicImageUrl } from "../../lib/publicImageUrl";
import "./profiles.css";

export function ProfileSection({ title, children, id }) {
  const headingId = useId();
  return (
    <section
      className="public-profile-section"
      aria-labelledby={headingId}
      id={id}
    >
      <h2 id={headingId}>{title}</h2>
      {children}
    </section>
  );
}

export function PublicProfileHero({
  name,
  description,
  location,
  category,
  children,
  action,
}) {
  return (
    <header className="public-profile-heading">
      {category && <p className="public-profile-eyebrow">{category}</p>}
      <PublicPageHeader title={name} subtitle={description} />
      <div className="public-profile-summary">
        <div>
          {location && (
            <span>
              <MapPin size={18} aria-hidden="true" />
              {location}
            </span>
          )}
          {children}
        </div>
        {action}
      </div>
    </header>
  );
}

// Only a cover and two previews are mounted on the page. Additional gallery
// images are requested on selection, not eagerly loaded as hidden slides.
export function MediaGallery({ name, hero, gallery = [] }) {
  const photos = useMemo(() => {
    const items = [{ url: hero, alt: `${name} — cover photo` }, ...gallery];
    const seen = new Set();
    return items.flatMap((item) => {
      const url = toPublicImageUrl(item?.url);
      if (!url || seen.has(url)) return [];
      seen.add(url);
      return [
        {
          url,
          alt: item.alt || item.caption || `${name} — photo ${seen.size}`,
        },
      ];
    });
  }, [name, hero, gallery]);
  const opener = useRef(null);
  const [selected, setSelected] = useState(0);
  const [open, setOpen] = useState(false);
  const current = photos[selected] || photos[0];
  const move = (direction) =>
    setSelected((i) => (i + direction + photos.length) % photos.length);
  if (!photos.length)
    return (
      <div className="public-profile-no-photos">
        <PublicImage alt={name} />
        <p>Photos have not been added to this profile yet.</p>
      </div>
    );
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <div
        className={`public-profile-gallery ${photos.length > 1 ? "has-previews" : ""}`}
        aria-label={`${name} photos`}
      >
        {photos.slice(0, 3).map((photo, index) => (
          <Dialog.Trigger asChild key={photo.url}>
            <button
              type="button"
              className={`public-profile-photo photo-${index}`}
              onClick={(event) => {
                opener.current = event.currentTarget;
                setSelected(index);
              }}
              aria-label={`Open photo ${index + 1} of ${photos.length}: ${photo.alt}`}
            >
              <PublicImage
                src={photo.url}
                sizes={
                  index === 0
                    ? photos.length === 1
                      ? "(max-width: 1439px) 100vw, 1320px"
                      : "(max-width: 767px) 100vw, (max-width: 1023px) 70vw, 850px"
                    : "(max-width: 767px) 50vw, 400px"
                }
                alt={photo.alt}
                loading={index === 0 ? "eager" : "lazy"}
                fetchPriority={index === 0 ? "high" : undefined}
              />
              {index === 0 && (
                <span className="public-gallery-count">
                  <Images size={18} aria-hidden="true" />
                  View{" "}
                  {photos.length === 1
                    ? "photo"
                    : `all ${photos.length} photos`}
                </span>
              )}
            </button>
          </Dialog.Trigger>
        ))}
      </div>
      <Dialog.Portal>
        <div className="public-v2">
          <Dialog.Overlay className="public-overlay" />
          <Dialog.Content
            className="public-gallery-dialog"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              opener.current?.focus();
            }}
            aria-describedby={undefined}
            onKeyDown={(event) => {
              if (event.key === "ArrowLeft") {
                event.preventDefault();
                move(-1);
              }
              if (event.key === "ArrowRight") {
                event.preventDefault();
                move(1);
              }
            }}
          >
            <div className="public-gallery-toolbar">
              <Dialog.Title>{name} photos</Dialog.Title>
              <Dialog.Close asChild>
                <PublicButton variant="secondary" aria-label="Close gallery">
                  <X size={20} aria-hidden="true" />
                </PublicButton>
              </Dialog.Close>
            </div>
            <PublicImage
              src={current.url}
              sizes="(max-width: 1279px) 90vw, 1200px"
              alt={current.alt}
              loading="eager"
              className="public-gallery-full"
            />
            <p className="public-gallery-caption" aria-live="polite">
              {selected + 1} / {photos.length} · {current.alt}
            </p>
            <div className="public-gallery-controls">
              <PublicButton
                variant="secondary"
                onClick={() => move(-1)}
                disabled={photos.length === 1}
                aria-label="Previous photo"
              >
                <ArrowLeft size={20} aria-hidden="true" />
                Previous
              </PublicButton>
              <PublicButton
                variant="secondary"
                onClick={() => move(1)}
                disabled={photos.length === 1}
                aria-label="Next photo"
              >
                Next
                <ArrowRight size={20} aria-hidden="true" />
              </PublicButton>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ProfileLayout({ children, enquiry }) {
  return (
    <div className="public-profile-layout">
      <div className="public-profile-content">{children}</div>
      <aside
        className="public-profile-aside"
        aria-label="Enquiry and related links"
      >
        {enquiry}
      </aside>
    </div>
  );
}
export function StickyEnquiryCard({ title, description, to, label, children }) {
  return (
    <div className="public-profile-enquiry">
      <h2>{title}</h2>
      <p>{description}</p>
      <PublicButton as={Link} to={to}>
        {label}
        <ArrowRight size={18} aria-hidden="true" />
      </PublicButton>
      {children && <div className="public-profile-related">{children}</div>}
    </div>
  );
}
export function FeatureList({ items }) {
  return (
    <ul className="public-profile-features">
      {items
        .filter((item) => typeof item === "string" && item.trim())
        .map((item, i) => (
          <li key={`${item}-${i}`}>
            <Check size={18} aria-hidden="true" />
            <span>{item}</span>
          </li>
        ))}
    </ul>
  );
}
export function ReviewSummary({ rating, count }) {
  if (
    rating == null ||
    rating === "" ||
    !Number.isFinite(Number(rating)) ||
    !(Number(count) > 0)
  )
    return null;
  return (
    <span className="public-profile-rating">
      <Star size={18} aria-hidden="true" />
      <strong>
        {Number(rating).toFixed(1)}
        <span className="sr-only"> out of 5</span>
      </strong>
      <span>
        ({count} {Number(count) === 1 ? "review" : "reviews"})
      </span>
    </span>
  );
}
export function ReviewList({ reviews, totalCount }) {
  if (!reviews.length)
    return (
      <p className="public-profile-muted">
        No published reviews to display yet.
      </p>
    );
  return (
    <>
      <div className="public-profile-reviews">
        {reviews.map((review, i) => (
          <article key={`${review.createdAt}-${i}`}>
            <div className="public-review-heading">
              <h3>{review.reviewerName || "Anonymous"}</h3>
              {review.rating != null &&
                Number.isFinite(Number(review.rating)) && (
                  <span className="public-profile-rating">
                    <Star size={16} aria-hidden="true" />
                    {Number(review.rating).toFixed(1)} / 5
                  </span>
                )}
            </div>
            {review.reviewText && <p>{review.reviewText}</p>}
            {review.createdAt &&
              !Number.isNaN(Date.parse(review.createdAt)) && (
                <time dateTime={review.createdAt}>
                  {new Date(review.createdAt).toLocaleDateString()}
                </time>
              )}
          </article>
        ))}
      </div>
      {Number(totalCount) > reviews.length && (
        <p className="public-profile-muted">
          Showing the latest {reviews.length} published reviews.
        </p>
      )}
    </>
  );
}
export function LocationSection({ location, children }) {
  if (!location && !children) return null;
  return (
    <ProfileSection title="Location">
      {location && (
        <p className="public-profile-location">
          <MapPin size={20} aria-hidden="true" />
          {location}
        </p>
      )}
      {children}
    </ProfileSection>
  );
}
export function ProfileState({ kind, loading, notFound, onRetry }) {
  return (
    <div className="public-profile-state">
      <PublicPageHeader
        title={
          loading
            ? `Loading ${kind.toLowerCase()} profile`
            : notFound
              ? `${kind} not found`
              : `${kind} profile unavailable`
        }
      />
      {loading ? (
        <div role="status">
          <span className="sr-only">Loading profile…</span>
          <div className="public-skeleton" />
          <div className="public-skeleton" />
        </div>
      ) : (
        <div role={notFound ? "status" : "alert"}>
          <p>
            {notFound
              ? `This ${kind.toLowerCase()} profile is unavailable or not published.`
              : "We could not load this profile. Please try again in a moment."}
          </p>
          {!notFound && (
            <PublicButton variant="secondary" onClick={onRetry}>
              Try again
            </PublicButton>
          )}
        </div>
      )}
      {!loading && (
        <Link
          className="public-text-link"
          to={kind === "Supplier" ? "/suppliers" : "/venues"}
        >
          Back to {kind.toLowerCase()}s
          <ArrowRight size={16} aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
