import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

import Login from "./components/Login";
import AdminLayout from "./admin/layout/AdminLayout";
import SupplierLayout from "./supplier/layout/SupplierLayout";
import { warnIfAuthOriginLooksWrong } from "./lib/siteUrl";

import AdminVenuesPage from "./pages/admin/VenuesPage";
import AdminSuppliersPage from "./pages/admin/SuppliersPage";
import AdminEnquiriesPage from "./pages/admin/EnquiriesPage";
import AdminDashboardPage from "./pages/admin/DashboardPage";
import CreditsLedgerPage from "./pages/admin/CreditsLedgerPage";
import SupplierPerformancePage from "./pages/admin/SupplierPerformancePage";

import DashboardPage from "./pages/supplier/DashboardPage";
import SupplierEnquiriesPage from "./pages/supplier/EnquiriesPage";
import QuotesPage from "./pages/supplier/QuotesPage";
import BookingsPage from "./pages/supplier/BookingsPage";
import MessagesPage from "./pages/supplier/MessagesPage";
import NotificationsPage from "./pages/supplier/NotificationsPage";
import ListingPage from "./pages/supplier/ListingPage";

import PublicQuotePage from "./pages/PublicQuotePage";
import AuthCallbackPage from "./pages/AuthCallbackPage";
import AuthResetPage from "./pages/AuthResetPage";
import ResetPassword from "./pages/ResetPassword";
import UpdatePassword from "./pages/UpdatePassword";

import HomePage from "./pages/marketing/HomePage";
import BrowsePage from "./pages/marketing/BrowsePage";
import HowItWorksPage from "./pages/marketing/HowItWorksPage";
import PricingPage from "./pages/marketing/PricingPage";
import ContactPage from "./pages/marketing/ContactPage";
import SuppliersPage from "./pages/marketing/SuppliersPage";
import SupplierProfilePage from "./pages/marketing/SupplierProfilePage";
import VenuesPage from "./pages/marketing/VenuesPage";
import RequestPage from "./pages/marketing/RequestPage";
import RequestStatusPage from "./pages/marketing/RequestStatusPage";
import SupplierRequestQuotePage from "./pages/marketing/SupplierRequestQuotePage";

function AccessDenied({ error, onSignOut }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 space-y-2">
        <h1 className="text-xl font-semibold">Access denied</h1>
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : (
          <p className="text-sm text-gray-600">
            Your user is not recognised as an admin (public.user_roles) or a supplier (public.suppliers.auth_user_id).
          </p>
        )}
        <button onClick={onSignOut} className="border rounded-lg px-3 py-2 bg-white">
          Sign out
        </button>
      </div>
    </div>
  );
}

function LoadingAccess() {
  return <div className="min-h-screen flex items-center justify-center">Checking access...</div>;
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [authState, setAuthState] = useState({
    loading: true,
    role: null,
    supplier: null,
    error: null,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    warnIfAuthOriginLooksWrong();
  }, []);

  const user = session?.user;

  useEffect(() => {
    let cancelled = false;

    async function resolveRole() {
      try {
        if (!user) {
          if (!cancelled) setAuthState({ loading: false, role: null, supplier: null, error: null });
          return;
        }

        if (!cancelled) {
          setAuthState((s) => ({ ...s, loading: true, error: null }));
        }

        const { data: roleRow, error: roleErr } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!roleErr && roleRow?.role === "admin") {
          if (!cancelled) setAuthState({ loading: false, role: "admin", supplier: null, error: null });
          return;
        }

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
          setAuthState({ loading: false, role: "none", supplier: null, error: "Role check failed (see console)." });
        }
      }
    }

    resolveRole();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  async function signOut() {
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch (err) {
      console.error("signOut failed:", err);
    } finally {
      setSession(null);
      setAuthState({ loading: false, role: null, supplier: null, error: null });
      navigate("/", { replace: true });
    }
  }

  function adminGuard(element) {
    if (!user) return <Navigate to="/login" replace />;
    if (authState.loading) return <LoadingAccess />;
    if (authState.role === "admin") return element;
    if (authState.role === "supplier") return <Navigate to="/supplier/dashboard" replace />;
    return <AccessDenied error={authState.error} onSignOut={signOut} />;
  }

  function supplierGuard(element) {
    if (!user) return <Navigate to="/login" replace />;
    if (authState.loading) return <LoadingAccess />;
    if (authState.role === "supplier") return element;
    if (authState.role === "admin") return <Navigate to="/admin/dashboard" replace />;
    return <AccessDenied error={authState.error} onSignOut={signOut} />;
  }

  const isPublicQuoteRoute = /^\/quote\/[^/]+$/.test(location.pathname);
  if (isPublicQuoteRoute) {
    return (
      <Routes>
        <Route path="/quote/:token" element={<PublicQuotePage />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/browse" element={<BrowsePage />} />
      <Route path="/how-it-works" element={<HowItWorksPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/request" element={<RequestPage />} />
      <Route path="/request/:token" element={<RequestStatusPage />} />
      <Route path="/suppliers" element={<SuppliersPage />} />
      <Route path="/suppliers/:slug" element={<SupplierProfilePage />} />
      <Route path="/suppliers/:slug/request-quote" element={<SupplierRequestQuotePage />} />
      <Route path="/venues" element={<VenuesPage />} />

      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/auth/reset" element={<AuthResetPage />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/update-password" element={<UpdatePassword />} />

      <Route
        path="/login"
        element={
          user ? (
            authState.loading ? (
              <LoadingAccess />
            ) : authState.role === "admin" ? (
              <Navigate to="/admin/dashboard" replace />
            ) : authState.role === "supplier" ? (
              <Navigate to="/supplier/dashboard" replace />
            ) : (
              <AccessDenied error={authState.error} onSignOut={signOut} />
            )
          ) : (
            <Login />
          )
        }
      />
      <Route path="/supplier/login" element={<Navigate to="/login" replace />} />

      <Route
        path="/admin/dashboard"
        element={adminGuard(
          <AdminLayout user={user} onSignOut={signOut}>
            <AdminDashboardPage user={user} />
          </AdminLayout>
        )}
      />
      <Route
        path="/admin/credits-ledger"
        element={adminGuard(
          <AdminLayout user={user} onSignOut={signOut}>
            <CreditsLedgerPage user={user} />
          </AdminLayout>
        )}
      />
      <Route
        path="/admin/performance"
        element={adminGuard(
          <AdminLayout user={user} onSignOut={signOut}>
            <SupplierPerformancePage user={user} />
          </AdminLayout>
        )}
      />
      <Route
        path="/admin/venues"
        element={adminGuard(
          <AdminLayout user={user} onSignOut={signOut}>
            <AdminVenuesPage user={user} />
          </AdminLayout>
        )}
      />
      <Route
        path="/admin/suppliers"
        element={adminGuard(
          <AdminLayout user={user} onSignOut={signOut}>
            <AdminSuppliersPage user={user} />
          </AdminLayout>
        )}
      />
      <Route
        path="/admin/enquiries"
        element={adminGuard(
          <AdminLayout user={user} onSignOut={signOut}>
            <AdminEnquiriesPage user={user} />
          </AdminLayout>
        )}
      />

      <Route
        path="/supplier/dashboard"
        element={supplierGuard(
          <SupplierLayout user={user} supplier={authState.supplier} onSignOut={signOut}>
            <DashboardPage supplier={authState.supplier} />
          </SupplierLayout>
        )}
      />
      <Route
        path="/supplier/enquiries"
        element={supplierGuard(
          <SupplierLayout user={user} supplier={authState.supplier} onSignOut={signOut}>
            <SupplierEnquiriesPage supplier={authState.supplier} />
          </SupplierLayout>
        )}
      />
      <Route
        path="/supplier/quotes"
        element={supplierGuard(
          <SupplierLayout user={user} supplier={authState.supplier} onSignOut={signOut}>
            <QuotesPage supplier={authState.supplier} />
          </SupplierLayout>
        )}
      />
      <Route
        path="/supplier/messages"
        element={supplierGuard(
          <SupplierLayout user={user} supplier={authState.supplier} onSignOut={signOut}>
            <MessagesPage supplier={authState.supplier} />
          </SupplierLayout>
        )}
      />
      <Route
        path="/supplier/listing"
        element={supplierGuard(
          <SupplierLayout user={user} supplier={authState.supplier} onSignOut={signOut}>
            <ListingPage supplier={authState.supplier} />
          </SupplierLayout>
        )}
      />
      <Route
        path="/supplier/notifications"
        element={supplierGuard(
          <SupplierLayout user={user} supplier={authState.supplier} onSignOut={signOut}>
            <NotificationsPage />
          </SupplierLayout>
        )}
      />
      <Route
        path="/supplier/bookings"
        element={supplierGuard(
          <SupplierLayout user={user} supplier={authState.supplier} onSignOut={signOut}>
            <BookingsPage supplier={authState.supplier} />
          </SupplierLayout>
        )}
      />

      <Route path="/admin/*" element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="/supplier/*" element={<Navigate to="/supplier/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
