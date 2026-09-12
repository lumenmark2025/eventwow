import { Suspense, useEffect, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import * as Menu from "@radix-ui/react-dropdown-menu";
import {
  Search,
  Menu as MenuIcon,
  X,
  LogOut,
  ExternalLink,
  Bell,
  ChevronDown,
  LayoutDashboard,
  Inbox,
  FileText,
  Building2,
  CalendarDays,
  MessageSquare,
  Store,
} from "lucide-react";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";
import "./workspace.css";

const icons = {
  dashboard: LayoutDashboard,
  enquiries: Inbox,
  quotes: FileText,
  listing: Store,
  messages: MessageSquare,
  notifications: Bell,
  bookings: CalendarDays,
  venues: Building2,
};

function Navigation({ nav, activeKey, onNavigate, onClose }) {
  const { pathname } = useLocation();
  const matched = nav
    .filter(
      (item) =>
        item.to && (pathname === item.to || pathname.startsWith(`${item.to}/`)),
    )
    .sort((a, b) => b.to.length - a.to.length)[0];
  return (
    <nav aria-label="Workspace navigation">
      {nav.map((item, index) => {
        const Icon = item.icon || icons[item.key] || FileText;
        const content = (
          <>
            <Icon size={18} aria-hidden="true" />
            <span>{item.label}</span>
          </>
        );
        return (
          <div key={item.key}>
            {(index === 0 || item.group !== nav[index - 1].group) && (
              <p className="ew-nav-group">{item.group || "Workspace"}</p>
            )}
            {item.to ? (
              <NavLink
                to={item.to}
                end={item.end ?? matched?.key !== item.key}
                onClick={onClose}
                className={({ isActive }) =>
                  `ew-nav-item ${isActive ? "is-active" : ""}`
                }
              >
                {content}
              </NavLink>
            ) : (
              <button
                type="button"
                className={`ew-nav-item ${activeKey === item.key ? "is-active" : ""}`}
                aria-current={activeKey === item.key ? "page" : undefined}
                onClick={() => {
                  onNavigate?.(item.key);
                  onClose?.();
                }}
              >
                {content}
              </button>
            )}
          </div>
        );
      })}
    </nav>
  );
}

export function WorkspaceSidebar({ title, user, ...navProps }) {
  return (
    <div className="ew-sidebar-content">
      <Link to="/" className="ew-logo" aria-label="EventWow home">
        <span>
          event<strong>wow</strong>
          <small>{title}</small>
        </span>
      </Link>
      <Navigation {...navProps} />
      {user?.email && (
        <div className="ew-sidebar-profile">
          <span className="ew-avatar">
            {user.email.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <strong>{user.user_metadata?.full_name || "Your account"}</strong>
            <small>{user.email}</small>
          </div>
        </div>
      )}
    </div>
  );
}

export function SearchCommand({ nav, onNavigate }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const handler = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const matches = nav.filter((item) =>
    item.label.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) setQuery("");
      }}
    >
      <Dialog.Trigger className="ew-search-trigger">
        <Search size={18} aria-hidden="true" />
        <span>Search workspace…</span>
        <kbd>Ctrl K</kbd>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="workspace-v2 ew-overlay" />
        <Dialog.Content className="workspace-v2 ew-dialog ew-command">
          <Dialog.Title>Search workspace</Dialog.Title>
          <Dialog.Description>
            Find a page in your workspace.
          </Dialog.Description>
          <label className="ew-search-input">
            <Search size={18} aria-hidden="true" />
            <input
              autoComplete="off"
              aria-label="Search workspace pages"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Suppliers, venues, enquiries…"
            />
          </label>
          <div className="ew-command-results">
            {matches.map((item) =>
              item.to ? (
                <Link
                  key={item.key}
                  to={item.to}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              ) : (
                <button
                  key={item.key}
                  onClick={() => {
                    onNavigate?.(item.key);
                    setOpen(false);
                  }}
                >
                  {item.label}
                </button>
              ),
            )}
            {!matches.length && <p>No matching pages.</p>}
          </div>
          <Dialog.Close
            className="ew-dialog-close ew-icon-button"
            aria-label="Close search"
          >
            <X size={20} />
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function UserMenu({ user, onSignOut }) {
  return (
    <Menu.Root>
      <Menu.Trigger className="ew-user-trigger" aria-label="Open account menu">
        <span className="ew-avatar">
          {(user?.email || "EW").slice(0, 2).toUpperCase()}
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          className="workspace-v2 ew-dropdown"
          sideOffset={8}
          align="end"
        >
          <Menu.Label className="ew-menu-label">
            {user?.email || "Workspace preview"}
          </Menu.Label>
          <Menu.Item asChild>
            <Link to="/">
              <ExternalLink size={16} aria-hidden="true" />
              View marketplace
            </Link>
          </Menu.Item>
          {onSignOut && (
            <Menu.Item onSelect={onSignOut}>
              <LogOut size={16} aria-hidden="true" />
              Sign out
            </Menu.Item>
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function NotificationMenu({ unreadCount = 0, onClick }) {
  if (!onClick) return null;
  return (
    <button
      className="ew-icon-button"
      onClick={onClick}
      aria-label={`Open notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
    >
      <Bell size={20} aria-hidden="true" />
      {unreadCount > 0 && <span className="ew-unread" />}
    </button>
  );
}

export function WorkspaceTopbar({
  nav,
  onNavigate,
  user,
  onSignOut,
  supplier,
  notificationUnreadCount,
  onNotificationsClick,
  children,
}) {
  return (
    <header className="ew-topbar">
      {children}
      <SearchCommand nav={nav} onNavigate={onNavigate} />
      <div className="ew-topbar-tools">
        {supplier && (
          <span className="ew-credits">
            Credits: {supplier.credits_balance ?? 0}
          </span>
        )}
        <NotificationMenu
          unreadCount={notificationUnreadCount}
          onClick={onNotificationsClick}
        />
        <UserMenu user={user} onSignOut={onSignOut} />
      </div>
    </header>
  );
}

export default function WorkspaceShell({
  title = "Workspace",
  user,
  onSignOut,
  nav = [],
  activeKey,
  onNavigate,
  children,
  presentation = false,
  ...topbarProps
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const location = useLocation();
  useEffect(() => {
    // Close an open mobile drawer if the viewport becomes desktop sized.
    const media = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (media.matches) setDrawerOpen(false);
    };
    media.addEventListener("change", closeOnDesktop);
    return () => media.removeEventListener("change", closeOnDesktop);
  }, []);
  const sidebarProps = { title, user, nav, activeKey, onNavigate };
  return (
    <div className="workspace-v2 ew-shell">
      <a className="ew-skip-link" href="#workspace-content">
        Skip to content
      </a>
      <aside className="ew-sidebar">
        <WorkspaceSidebar {...sidebarProps} />
      </aside>
      <WorkspaceTopbar
        nav={nav}
        onNavigate={onNavigate}
        user={user}
        onSignOut={onSignOut}
        {...topbarProps}
      >
        <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
          <Dialog.Trigger
            className="ew-icon-button ew-mobile-trigger"
            aria-label="Open workspace navigation"
          >
            <MenuIcon size={22} />
          </Dialog.Trigger>
          <Dialog.Portal>
            <Dialog.Overlay className="workspace-v2 ew-overlay" />
            <Dialog.Content
              className="workspace-v2 ew-drawer"
              aria-describedby={undefined}
            >
              <Dialog.Title className="sr-only">
                Workspace navigation
              </Dialog.Title>
              <WorkspaceSidebar
                {...sidebarProps}
                onClose={() => setDrawerOpen(false)}
              />
              <Dialog.Close
                className="ew-dialog-close ew-icon-button"
                aria-label="Close navigation"
              >
                <X size={20} />
              </Dialog.Close>
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      </WorkspaceTopbar>
      <main
        id="workspace-content"
        tabIndex={-1}
        className={`ew-main ${presentation ? "workspace-ui" : ""}`}
      >
        <Suspense
          key={location.pathname}
          fallback={
            <div role="status" className="ew-loading">
              Loading page…
            </div>
          }
        >
          {children}
        </Suspense>
      </main>
    </div>
  );
}
