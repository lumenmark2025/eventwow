import { useState } from "react";
import { ImageIcon } from "lucide-react";

// Preserve space for real listing imagery, with a readable missing/failed state.
export default function WorkspaceImage({
  src,
  alt,
  className = "",
  loading = "lazy",
  fetchPriority,
  srcSet,
  sizes,
  fallbackSrc,
}) {
  return (
    <ImageContent
      key={fallbackSrc || src || "empty"}
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      fetchPriority={fetchPriority}
      srcSet={srcSet}
      sizes={sizes}
      fallbackSrc={fallbackSrc}
    />
  );
}

function ImageContent({
  src,
  alt,
  className,
  loading,
  fetchPriority,
  srcSet,
  sizes,
  fallbackSrc,
}) {
  const [failed, setFailed] = useState(false);
  const [useOriginal, setUseOriginal] = useState(false);
  return (
    <div className={`ew-workspace-image ${className}`}>
      {src && !failed ? (
        <img
          src={useOriginal ? fallbackSrc : src}
          srcSet={useOriginal ? undefined : srcSet}
          sizes={useOriginal ? undefined : sizes}
          alt={alt}
          loading={loading}
          fetchPriority={fetchPriority}
          decoding="async"
          onError={() => {
            if (!useOriginal && fallbackSrc && fallbackSrc !== src)
              setUseOriginal(true);
            else setFailed(true);
          }}
        />
      ) : (
        <div
          className="ew-workspace-image-empty"
          role="img"
          aria-label={`${alt}: ${failed ? "image unavailable" : "no image added"}`}
        >
          <ImageIcon size={24} aria-hidden="true" />
          <span>{failed ? "Image unavailable" : "No image added"}</span>
        </div>
      )}
    </div>
  );
}
