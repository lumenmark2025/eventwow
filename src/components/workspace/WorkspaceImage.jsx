import { useState } from "react";
import { ImageIcon } from "lucide-react";

// Preserve space for real listing imagery, with a readable missing/failed state.
export default function WorkspaceImage({
  src,
  alt,
  className = "",
  loading = "lazy",
  fetchPriority,
}) {
  return (
    <ImageContent
      key={src || "empty"}
      src={src}
      alt={alt}
      className={className}
      loading={loading}
      fetchPriority={fetchPriority}
    />
  );
}

function ImageContent({ src, alt, className, loading, fetchPriority }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`ew-workspace-image ${className}`}>
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          loading={loading}
          fetchPriority={fetchPriority}
          decoding="async"
          onError={() => setFailed(true)}
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
