import { useLocation } from "react-router-dom";
import MarketingHeader from "../marketing/MarketingHeader";
import MarketingFooter from "../marketing/MarketingFooter";
import "../marketing/public.css";
export default function MarketingShell({ children, profile = false }) {
  const { pathname } = useLocation();
  const migrated = profile || ["/", "/suppliers", "/venues"].includes(pathname);
  return (
    <div className="public-v2 public-shell">
      <MarketingHeader />
      <main
        id="public-main"
        tabIndex={-1}
        className={`public-container ${migrated ? "public-main" : "public-legacy-main"}`}
      >
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
