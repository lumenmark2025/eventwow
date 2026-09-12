import MarketingHeader from "../marketing/MarketingHeader";
import MarketingFooter from "../marketing/MarketingFooter";
import "../marketing/public.css";
export default function MarketingShell({ children }) {
  return (
    <div className="public-v2 public-shell">
      <MarketingHeader />
      <main
        id="public-main"
        tabIndex={-1}
        className="public-container public-main"
      >
        {children}
      </main>
      <MarketingFooter />
    </div>
  );
}
