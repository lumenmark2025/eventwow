// import admin pages
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import VenuesPage from "./pages/admin/VenuesPage";
import SuppliersPage from "./pages/admin/SuppliersPage";
import EnquiriesPage from "./pages/admin/EnquiriesPage";

//import supplier pages
import DashboardPage from "./pages/supplier/DashboardPage";
import SupplierEnquiriesPage from "./pages/supplier/EnquiriesPage";
import QuotesPage from "./pages/supplier/QuotesPage";
import BookingsPage from "./pages/supplier/BookingsPage";
import MessagesPage from "./pages/supplier/MessagesPage";
import NotificationsPage from "./pages/supplier/NotificationsPage";
import PublicQuotePage from "./pages/PublicQuotePage";


import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

import Login from "./components/Login";
import AdminLayout from "./admin/layout/AdminLayout";
import SupplierLayout from "./supplier/layout/SupplierLayout";

export default function App() {
  const location = useLocation();
  const [session, setSession] = useState(null);
  const [authState, setAuthState] = useState({
    loading: true,
    role: null,
    supplier: null,
    error: null,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) =>
      setSession(newSession)
    );
    return () => listener.subscription.unsubscribe();
  }, []);

  const user = session?.user;

  useEffect(() => {
    let cancelled = false;

    async function resolveRole() {
      try {
        if (!user) {
          if (!cancelled) {
            setAuthState({ loading: false, role: null, supplier: null, error: null });
          }
          return;
        }

        if (!cancelled) {
          setAuthState((s) => ({ ...s, loading: true, error: null }));
        }

        // 1) Admin check
        const { data: roleRow, error: roleErr } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!roleErr && roleRow?.role === "admin") {
          if (!cancelled) setAuthState({ loading: false, role: "admin", supplier: null, error: null });
          return;
        }

        // 2) Supplier check
        const { data: supplierRow, error: supplierErr } = await supabase
          .from("suppliers")
          .select("id,business_name,credits_balance,is_published")
          .eq("auth_user_id", user.id)
          .maybeSingle();

        if (!supplierErr && supplierRow?.id) {
          if (!cancelled) setAuthState({ loading: false, role: "supplier", supplier: supplierRow, error: null });
          return;
        }

        if (!cancelled) setAuthState({ loading: false, role: "none", supplier: null, error: null });
      } catch (err) {
        console.error("resolveRole failed:", err);
        if (!cancelled) {
          setAuthState({
            loading: false,
            role: "none",
            supplier: null,
            error: "Role check failed (see console).",
          });
        }
      }
    }

    resolveRole();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  async function signOut() {
    await supabase.auth.signOut();
  }

  const isPublicQuoteRoute = /^\/quote\/[^/]+$/.test(location.pathname);
  if (isPublicQuoteRoute) {
    return (
      <Routes>
        <Route path="/quote/:token" element={<PublicQuotePage />} />
      </Routes>
    );
  }

  if (!user) return <Login />;

  if (authState.loading) {
    return <div className="min-h-screen flex items-center justify-center">Checking access…</div>;
  }

if (authState.role === "admin") {
  return (
    <Routes>
      <Route
        path="/admin/venues"
        element={
          <AdminLayout user={user} onSignOut={signOut}>
            <VenuesPage user={user} />
          </AdminLayout>
        }
      />

      <Route
        path="/admin/suppliers"
        element={
          <AdminLayout user={user} onSignOut={signOut}>
            <SuppliersPage user={user} />
          </AdminLayout>
        }
      />

      <Route
        path="/admin/enquiries"
        element={
          <AdminLayout user={user} onSignOut={signOut}>
            <EnquiriesPage user={user} />
          </AdminLayout>
        }
      />

      {/* fallback – keep existing behaviour for now */}
      <Route path="*" element={<Navigate to="/admin/venues" replace />} />
    </Routes>
  );
}



if (authState.role === "supplier") {
  return (
    <Routes>
      <Route
        path="/supplier/dashboard"
        element={
          <SupplierLayout user={user} supplier={authState.supplier} onSignOut={signOut}>
            <DashboardPage supplier={authState.supplier} />
          </SupplierLayout>
        }
      />

      <Route
        path="/supplier/enquiries"
        element={
          <SupplierLayout user={user} supplier={authState.supplier} onSignOut={signOut}>
            <SupplierEnquiriesPage supplier={authState.supplier} />
          </SupplierLayout>
        }
      />

      <Route
        path="/supplier/quotes"
        element={
          <SupplierLayout user={user} supplier={authState.supplier} onSignOut={signOut}>
            <QuotesPage supplier={authState.supplier} />
          </SupplierLayout>
        }
      />

      <Route
        path="/supplier/messages"
        element={
          <SupplierLayout user={user} supplier={authState.supplier} onSignOut={signOut}>
            <MessagesPage supplier={authState.supplier} />
          </SupplierLayout>
        }
      />

      <Route
        path="/supplier/notifications"
        element={
          <SupplierLayout user={user} supplier={authState.supplier} onSignOut={signOut}>
            <NotificationsPage />
          </SupplierLayout>
        }
      />

      <Route
        path="/supplier/bookings"
        element={
          <SupplierLayout user={user} supplier={authState.supplier} onSignOut={signOut}>
            <BookingsPage supplier={authState.supplier} />
          </SupplierLayout>
        }
      />

      {/* fallback – keep existing behaviour for now */}
      <Route path="*" element={<Navigate to="/supplier/dashboard" replace />} />
    </Routes>
  );
}


  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 space-y-2">
        <h1 className="text-xl font-semibold">Access denied</h1>

        {authState.error ? (
          <p className="text-sm text-red-600">{authState.error}</p>
        ) : (
          <p className="text-sm text-gray-600">
            Your user is not recognised as an admin (public.user_roles) or a supplier (public.suppliers.auth_user_id).
          </p>
        )}

        <button onClick={signOut} className="border rounded-lg px-3 py-2 bg-white">
          Sign out
        </button>
      </div>
    </div>
  );
}
