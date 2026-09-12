import { Link } from "react-router-dom";
import { PublicLogo } from "./MarketingHeader";
const links = [
  { to: "/categories", label: "Browse" },
  { to: "/request", label: "Request quotes" },
  { to: "/suppliers", label: "Suppliers" },
  { to: "/venues", label: "Venues" },
  { to: "/supplier/signup", label: "List your business" },
  { to: "/how-it-works", label: "How it works" },
  { to: "/pricing", label: "Pricing" },
  { to: "/contact", label: "Contact" },
];
export default function MarketingFooter() {
  return (
    <footer className="public-footer">
      <div className="public-container">
        <div className="public-footer-top">
          <PublicLogo />
          <p>Find It. Book It. Wow Them.</p>
          <nav aria-label="Footer navigation">
            {links.map((item) => (
              <Link key={item.to} to={item.to}>
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="public-footer-bottom">
          <span>© {new Date().getFullYear()} EventWow</span>
          <span>Venues and suppliers for every kind of event.</span>
        </div>
      </div>
    </footer>
  );
}
