import { useState } from "react";
import { ImageIcon } from "lucide-react";

// Preserve space for real listing imagery, with a readable missing/failed state.
export default function WorkspaceImage({ src, alt, className = "" }) {
  return (
    <ImageContent
      key={src || "empty"}
      src={src}
      alt={alt}
      className={className}
    />
  );
}

function ImageContent({ src, alt, className }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`ew-workspace-image ${className}`}>
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          loading="lazy"
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
