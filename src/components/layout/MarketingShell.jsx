import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import Button from "../ui/Button";
import eventwowLogo from "../../assets/brand/eventwow-logo.svg";

const navItems = [
  { to: "/venues", label: "Venues" },
  { to: "/suppliers", label: "Suppliers" },
  { to: "/how-it-works", label: "How it works" },
  { to: "/supplier/signup", label: "For suppliers" },
];

function homeNavClass(isActive) {
  return [
    "rounded-xl px-3 py-2 text-sm font-medium transition-colors",
    isActive ? "bg-white/20 text-white" : "text-white/90 hover:bg-white/15",
  ].join(" ");
}

export default function MarketingShell({ children }) {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const isHome = location.pathname === "/";

  return (
    <div
      className="min-h-screen bg-slate-100 text-slate-900"
      style={{ "--brand": "#1d4ed8", "--brand-foreground": "#ffffff" }}
    >
      <header
        className="sticky top-0 z-30 border-b border-white/20 bg-[#0f4fd6] text-white backdrop-blur"
      >
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
          <NavLink to="/" className="inline-flex items-center transition-opacity duration-200 hover:opacity-80">
            <img
              src={eventwowLogo}
              alt="Eventwow"
              width="180"
              height="34"
              className="h-7 w-auto brightness-0 invert sm:h-8"
              loading="eager"
              decoding="async"
            />
          </NavLink>

          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => homeNavClass(isActive)}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button
              as={NavLink}
              to="/login"
              variant="secondary"
              size="sm"
              className="border-white/45 bg-white/10 text-white hover:bg-white/20"
            >
              Login
            </Button>
            <button
              type="button"
              className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white md:hidden"
              aria-label="Toggle navigation menu"
              onClick={() => setMobileOpen((prev) => !prev)}
            >
              <span className="text-lg leading-none">{mobileOpen ? "x" : "="}</span>
            </button>
          </div>
        </div>

        {mobileOpen ? (
          <div className="border-t border-white/20 bg-[#0f4fd6] md:hidden">
            <nav className="mx-auto w-full max-w-7xl space-y-1 px-4 py-3 sm:px-6 lg:px-8">
              {navItems.map((item) => (
                <NavLink
                  key={`mobile-${item.to}`}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className="block rounded-xl px-3 py-2 text-sm text-white/95 hover:bg-white/15"
                >
                  {item.label}
                </NavLink>
              ))}
              <NavLink
                to="/login"
                onClick={() => setMobileOpen(false)}
                className="mt-2 block rounded-xl border border-white/35 px-3 py-2 text-sm font-medium text-white"
              >
                Login
              </NavLink>
            </nav>
          </div>
        ) : null}
      </header>

      <main className={`mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 ${isHome ? "lg:py-0" : "lg:py-10"}`}>
        {children}
      </main>

      <footer className="mt-14 border-t border-slate-200 bg-white">
        <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
          <div>
            <NavLink to="/" className="inline-flex items-center transition-opacity duration-200 hover:opacity-80">
              <img
                src={eventwowLogo}
                alt="Eventwow"
                width="144"
                height="28"
                className="h-6 w-auto"
                loading="lazy"
                decoding="async"
              />
            </NavLink>
            <p className="mt-3 text-sm text-slate-600">Find It. Book It. Wow Them.</p>
          </div>
          <div className="text-sm">
            <p className="font-medium text-slate-900">Explore</p>
            <div className="mt-2 space-y-2">
              <NavLink to="/categories" className="block text-slate-600 hover:text-slate-900">Browse</NavLink>
              <NavLink to="/request" className="block text-slate-600 hover:text-slate-900">Request quotes</NavLink>
              <NavLink to="/suppliers" className="block text-slate-600 hover:text-slate-900">Suppliers</NavLink>
              <NavLink to="/supplier/signup" className="block text-slate-600 hover:text-slate-900">List your business</NavLink>
              <NavLink to="/venues" className="block text-slate-600 hover:text-slate-900">Venues</NavLink>
            </div>
          </div>
          <div className="text-sm">
            <p className="font-medium text-slate-900">Company</p>
            <div className="mt-2 space-y-2">
              <NavLink to="/how-it-works" className="block text-slate-600 hover:text-slate-900">How it works</NavLink>
              <NavLink to="/pricing" className="block text-slate-600 hover:text-slate-900">Pricing</NavLink>
              <NavLink to="/contact" className="block text-slate-600 hover:text-slate-900">Contact</NavLink>
            </div>
          </div>
          <div className="text-sm text-slate-600">
            <p className="font-medium text-slate-900">Legal</p>
            <p className="mt-2">(c) {new Date().getFullYear()} Eventwow</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
