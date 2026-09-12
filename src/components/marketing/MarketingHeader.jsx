import { PublicLogo } from "./PublicLogo";
export { PublicLogo } from "./PublicLogo";
import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { PublicButton } from "./PublicComponents";

const links = [
  { to: "/suppliers", label: "Suppliers" },
  { to: "/venues", label: "Venues" },
  { to: "/how-it-works", label: "How it works" },
  { to: "/supplier/signup", label: "For suppliers" },
];
export default function MarketingHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="public-header">
      <a className="public-skip" href="#public-main">
        Skip to content
      </a>
      <div className="public-container public-header-inner">
        <PublicLogo />
        <nav className="public-desktop-nav" aria-label="Main navigation">
          {links.map((item) => (
            <NavLink key={item.to} to={item.to}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="public-header-actions">
          <Link className="public-sign-in" to="/login">
            Sign in
          </Link>
          <PublicButton as={Link} to="/request">
            Get Quotes
          </PublicButton>
          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger asChild>
              <button
                className="public-menu-button"
                aria-label="Open navigation"
              >
                <Menu aria-hidden="true" />
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <div className="public-v2">
                <Dialog.Overlay className="public-overlay" />
                <Dialog.Content
                  className="public-mobile-nav"
                  aria-describedby={undefined}
                >
                  <div className="public-mobile-title">
                    <Dialog.Title>Explore EventWow</Dialog.Title>
                    <Dialog.Close
                      className="public-menu-button"
                      aria-label="Close navigation"
                    >
                      <X aria-hidden="true" />
                    </Dialog.Close>
                  </div>
                  <nav aria-label="Mobile navigation">
                    {[
                      ...links,
                      { to: "/categories", label: "Browse categories" },
                      { to: "/login", label: "Sign in" },
                    ].map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setOpen(false)}
                      >
                        {item.label}
                      </NavLink>
                    ))}
                  </nav>
                  <PublicButton
                    as={Link}
                    to="/request"
                    onClick={() => setOpen(false)}
                  >
                    Get Quotes
                  </PublicButton>
                </Dialog.Content>
              </div>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </div>
    </header>
  );
}
