import { useState } from "react";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import AdminSidebar from "./AdminSidebar";
import AdminMobileDrawer from "./AdminMobileDrawer";

export default function AdminLayout({ user, onSignOut, children }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-blue-700/40 bg-[radial-gradient(circle_at_top_left,#2563eb_0%,#1d4ed8_48%,#60a5fa_100%)] text-white shadow-sm backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="md:hidden"
              aria-label="Open admin navigation"
              onClick={() => setMobileMenuOpen(true)}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </Button>

            <div className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 ring-1 ring-white/20">
              <span className="text-lg font-semibold tracking-tight sm:text-xl">eventwow</span>
              <span className="rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">Admin</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {user?.email ? <Badge variant="neutral" className="hidden border-white/25 bg-white/10 text-white sm:inline-flex">{user.email}</Badge> : null}
            {onSignOut ? (
              <Button type="button" variant="secondary" size="sm" className="border-white/40 bg-white/10 text-white hover:bg-white/20" onClick={onSignOut}>
                Sign out
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-5 sm:px-6 sm:py-6 lg:px-8">
        <AdminSidebar />

        <main className="min-w-0 flex-1 space-y-6">
          <Card className="border-blue-100">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div>
                <p className="text-sm font-medium text-slate-900">Admin Control Panel</p>
                <p className="text-sm text-slate-600">Signed in as {user?.email}</p>
              </div>
              <Badge variant="brand">Admin</Badge>
            </CardContent>
          </Card>
          <div>{children}</div>
        </main>
      </div>

      <AdminMobileDrawer open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
    </div>
  );
}
