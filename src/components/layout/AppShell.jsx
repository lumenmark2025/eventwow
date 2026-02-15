import Badge from "../ui/Badge";
import Button from "../ui/Button";
import eventwowLogo from "../../assets/brand/eventwow-logo.svg";

export default function AppShell({
  title = "Eventwow",
  user,
  supplier,
  showBrandMeta = true,
  onSignOut,
  nav = [],
  activeKey,
  onNavigate,
  notificationUnreadCount = 0,
  onNotificationsClick,
  children,
}) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <img
              src={eventwowLogo}
              alt="Eventwow"
              width="170"
              height="32"
              className="h-7 w-auto sm:h-8"
              loading="eager"
              decoding="async"
            />
            {showBrandMeta ? (
              <div>
                <div className="text-sm font-semibold text-slate-900">{title}</div>
                {supplier?.business_name ? (
                  <div className="text-xs text-slate-500">{supplier.business_name}</div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="hidden md:flex items-center gap-2">
            {nav.map((item) => (
              <Button
                key={item.key}
                type="button"
                size="sm"
                variant={activeKey === item.key ? "primary" : "ghost"}
                onClick={() => onNavigate?.(item.key)}
              >
                {item.label}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {supplier ? <Badge variant="neutral" className="hidden sm:inline-flex">Credits: {supplier.credits_balance ?? 0}</Badge> : null}
            {user?.email ? <Badge variant="neutral" className="hidden sm:inline-flex">{user.email}</Badge> : null}
            {onNotificationsClick ? (
              <button
                type="button"
                aria-label="Open notifications"
                onClick={onNotificationsClick}
                className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
              >
                <span aria-hidden="true">🔔</span>
                {Number(notificationUnreadCount || 0) > 0 ? (
                  <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-rose-500" />
                ) : null}
              </button>
            ) : null}
            {onSignOut ? (
              <Button type="button" variant="secondary" size="sm" onClick={onSignOut}>
                Sign out
              </Button>
            ) : null}
          </div>
        </div>
        {nav.length > 0 ? (
          <div className="border-t border-slate-200 md:hidden">
            <div className="mx-auto w-full max-w-7xl overflow-x-auto px-4 py-2 sm:px-6 lg:px-8">
              <div className="flex min-w-max items-center gap-2">
                {nav.map((item) => (
                  <Button
                    key={item.key}
                    type="button"
                    size="sm"
                    variant={activeKey === item.key ? "primary" : "secondary"}
                    onClick={() => onNavigate?.(item.key)}
                    className="shrink-0"
                  >
                    {item.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-6 lg:px-8">{children}</main>
    </div>
  );
}
