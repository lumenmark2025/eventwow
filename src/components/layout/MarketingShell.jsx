import { NavLink } from "react-router-dom";
import Button from "../ui/Button";
import eventwowLogo from "../../assets/brand/eventwow-logo.svg";

const navItems = [
  { to: "/request", label: "Request quotes" },
  { to: "/categories", label: "Browse" },
  { to: "/how-it-works", label: "How it works" },
  { to: "/pricing", label: "Pricing" },
];

function navClass(isActive) {
  return [
    "rounded-xl px-3 py-2 text-sm transition-colors",
    isActive ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100",
  ].join(" ");
}

export default function MarketingShell({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
          <NavLink to="/" className="inline-flex items-center transition-opacity duration-200 hover:opacity-80">
            <img
              src={eventwowLogo}
              alt="Eventwow"
              width="180"
              height="34"
              className="h-7 w-auto sm:h-8"
              loading="eager"
              decoding="async"
            />
          </NavLink>

          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => navClass(isActive)}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Button as={NavLink} to="/login" variant="ghost" size="sm" className="hidden sm:inline-flex">
              Login
            </Button>
            <Button as={NavLink} to="/categories" size="sm">
              Get quotes
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">{children}</main>

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
            <p className="mt-2">© {new Date().getFullYear()} Eventwow</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
