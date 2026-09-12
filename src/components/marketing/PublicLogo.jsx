import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";
export function PublicLogo() {
  return (
    <Link className="public-logo" to="/" aria-label="EventWow home">
      <Sparkles aria-hidden="true" />
      EventWow
    </Link>
  );
}
