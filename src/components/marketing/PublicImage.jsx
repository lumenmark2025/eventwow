import WorkspaceImage from "../workspace/WorkspaceImage";
import { publicImageSources } from "./publicImageSources";

export default function PublicImage({ src, sizes = "100vw", ...props }) {
  return (
    <WorkspaceImage
      {...props}
      {...publicImageSources(src, import.meta.env.VITE_SUPABASE_URL)}
      sizes={sizes}
    />
  );
}
