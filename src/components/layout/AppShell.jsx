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
  navTheme = "default",
  children,
}) {
  const isBlueTheme = navTheme === "blue";

  return (
    <div className="min-h-screen bg-slate-50">
      <header
        className={
          isBlueTheme
            ? "border-b border-blue-700/40 bg-[radial-gradient(circle_at_top_left,#2563eb_0%,#1d4ed8_48%,#60a5fa_100%)] text-white shadow-sm backdrop-blur"
            : "border-b border-blue-100 bg-white/95 backdrop-blur"
        }
      >
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3">
            <img
              src={eventwowLogo}
              alt="Eventwow"
              width="170"
              height="32"
              className={isBlueTheme ? "h-7 w-auto brightness-0 invert sm:h-8" : "h-7 w-auto sm:h-8"}
              loading="eager"
              decoding="async"
            />
            {showBrandMeta ? (
              <div>
                <div className={`text-sm font-semibold ${isBlueTheme ? "text-white" : "text-slate-900"}`}>{title}</div>
                {supplier?.business_name ? <div className={`text-xs ${isBlueTheme ? "text-white/80" : "text-slate-500"}`}>{supplier.business_name}</div> : null}
              </div>
            ) : null}
          </div>

          <div className="hidden items-center gap-2 md:flex">
            {nav.map((item) => (
              <Button
                key={item.key}
                type="button"
                size="sm"
                variant={activeKey === item.key ? "primary" : "ghost"}
                onClick={() => onNavigate?.(item.key)}
                className={
                  isBlueTheme
                    ? activeKey === item.key
                      ? "bg-white/20 text-white hover:bg-white/30"
                      : "text-white hover:bg-white/15 hover:text-white"
                    : ""
                }
              >
                {item.label}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {supplier ? <Badge variant="neutral" className={isBlueTheme ? "hidden border-white/25 bg-white/10 text-white sm:inline-flex" : "hidden sm:inline-flex"}>Credits: {supplier.credits_balance ?? 0}</Badge> : null}
            {user?.email ? <Badge variant="neutral" className={isBlueTheme ? "hidden border-white/25 bg-white/10 text-white sm:inline-flex" : "hidden sm:inline-flex"}>{user.email}</Badge> : null}
            {onNotificationsClick ? (
              <button
                type="button"
                aria-label="Open notifications"
                onClick={onNotificationsClick}
                className={
                  isBlueTheme
                    ? "relative inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/30 bg-white/10 text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/45"
                    : "relative inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35"
                }
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <path d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5" />
                  <path d="M9.5 17a2.5 2.5 0 0 0 5 0" />
                </svg>
                {Number(notificationUnreadCount || 0) > 0 ? (
                  <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-rose-500" />
                ) : null}
              </button>
            ) : null}
            {onSignOut ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onSignOut}
                className={isBlueTheme ? "border-white/40 bg-white/10 text-white hover:bg-white/20" : ""}
              >
                Sign out
              </Button>
            ) : null}
          </div>
        </div>
        {nav.length > 0 ? (
          <div className={isBlueTheme ? "border-t border-white/20 md:hidden" : "border-t border-blue-100 md:hidden"}>
            <div className="mx-auto w-full max-w-7xl overflow-x-auto px-4 py-2 sm:px-6 lg:px-8">
              <div className="flex min-w-max items-center gap-2">
                {nav.map((item) => (
                  <Button
                    key={item.key}
                    type="button"
                    size="sm"
                    variant={activeKey === item.key ? "primary" : "secondary"}
                    onClick={() => onNavigate?.(item.key)}
                    className={isBlueTheme && activeKey !== item.key ? "shrink-0 border-white/35 bg-white/10 text-white hover:bg-white/20" : "shrink-0"}
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
