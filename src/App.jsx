import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

import Login from "./components/Login";
import AdminLayout from "./admin/layout/AdminLayout";
import SupplierLayout from "./supplier/layout/SupplierLayout";
import CustomerLayout from "./customer/layout/CustomerLayout";
import { warnIfAuthOriginLooksWrong } from "./lib/siteUrl";

import AdminVenuesPage from "./pages/admin/VenuesPage";
import AdminSuppliersPage from "./pages/admin/SuppliersPage";
import AdminEnquiriesPage from "./pages/admin/EnquiriesPage";
import AdminDashboardPage from "./pages/admin/DashboardPage";
import CreditsLedgerPage from "./pages/admin/CreditsLedgerPage";
import SupplierPerformancePage from "./pages/admin/SupplierPerformancePage";
import ReviewsPage from "./pages/admin/ReviewsPage";

import DashboardPage from "./pages/supplier/DashboardPage";
import SupplierEnquiriesPage from "./pages/supplier/EnquiriesPage";
import QuotesPage from "./pages/supplier/QuotesPage";
import BookingsPage from "./pages/supplier/BookingsPage";
import MessagesPage from "./pages/supplier/MessagesPage";
import NotificationsPage from "./pages/supplier/NotificationsPage";
import ListingPage from "./pages/supplier/ListingPage";
import CustomerDashboardPage from "./pages/customer/DashboardPage";
import CustomerEnquiriesPage from "./pages/customer/EnquiriesPage";
import CustomerEnquiryDetailPage from "./pages/customer/EnquiryDetailPage";

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
import VenueProfilePage from "./pages/marketing/VenueProfilePage";
import RequestPage from "./pages/marketing/RequestPage";
import SupplierRequestQuotePage from "./pages/marketing/SupplierRequestQuotePage";
import EnquiryQuotesPage from "./pages/marketing/EnquiryQuotesPage";
import CategoryLocationLandingPage from "./pages/marketing/CategoryLocationLandingPage";
import SupplierSeoLandingPage from "./pages/marketing/SupplierSeoLandingPage";

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

function normalizeReturnTo(rawValue) {
  const raw = String(rawValue || "").trim();
  if (!raw || !raw.startsWith("/")) return "";
  if (raw.startsWith("//")) return "";
  return raw;
}

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [session, setSession] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [authState, setAuthState] = useState({
    loading: true,
    role: null,
    supplier: null,
    customer: null,
    error: null,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setSessionLoading(false);
    });
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
          if (!cancelled) setAuthState({ loading: false, role: null, supplier: null, customer: null, error: null });
          return;
        }

        if (!cancelled) {
          setAuthState((s) => ({ ...s, loading: true, error: null }));
        }

        const { data: profileRow, error: profileErr } = await supabase
          .from("user_profiles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();

        const profileRole = !profileErr && profileRow?.role ? String(profileRow.role).toLowerCase() : null;

        if (profileRole === "admin") {
          if (!cancelled) setAuthState({ loading: false, role: "admin", supplier: null, customer: null, error: null });
          return;
        }
        if (profileRole === "supplier") {
          const { data: supplierRow } = await supabase
            .from("suppliers")
            .select("id,business_name,credits_balance,is_published")
            .eq("auth_user_id", user.id)
            .maybeSingle();
          if (!cancelled) setAuthState({ loading: false, role: "supplier", supplier: supplierRow || null, customer: null, error: null });
          return;
        }
        if (profileRole === "customer") {
          const { data: customerRow } = await supabase
            .from("customers")
            .select("id,full_name,email,phone")
            .eq("user_id", user.id)
            .maybeSingle();
          if (!cancelled) setAuthState({ loading: false, role: "customer", supplier: null, customer: customerRow || null, error: null });
          return;
        }
        if (profileRole === "venue") {
          if (!cancelled) setAuthState({ loading: false, role: "venue", supplier: null, customer: null, error: null });
          return;
        }

        const { data: roleRow, error: roleErr } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!roleErr && roleRow?.role === "admin") {
          if (!cancelled) setAuthState({ loading: false, role: "admin", supplier: null, customer: null, error: null });
          return;
        }

        const { data: supplierRow, error: supplierErr } = await supabase
          .from("suppliers")
          .select("id,business_name,credits_balance,is_published")
          .eq("auth_user_id", user.id)
          .maybeSingle();

        if (!supplierErr && supplierRow?.id) {
          if (!cancelled) setAuthState({ loading: false, role: "supplier", supplier: supplierRow, customer: null, error: null });
          return;
        }

        const { data: customerRow, error: customerErr } = await supabase
          .from("customers")
          .select("id,full_name,email,phone")
          .eq("user_id", user.id)
          .maybeSingle();
        if (!customerErr && customerRow?.id) {
          if (!cancelled) setAuthState({ loading: false, role: "customer", supplier: null, customer: customerRow, error: null });
          return;
        }

        if (!cancelled) setAuthState({ loading: false, role: "none", supplier: null, customer: null, error: null });
      } catch (err) {
        console.error("resolveRole failed:", err);
        if (!cancelled) {
          setAuthState({ loading: false, role: "none", supplier: null, customer: null, error: "Role check failed (see console)." });
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
      setAuthState({ loading: false, role: null, supplier: null, customer: null, error: null });
      navigate("/", { replace: true });
    }
  }

  function adminGuard(element) {
    if (sessionLoading || (user && authState.loading)) return <LoadingAccess />;
    if (!user) {
      const returnTo = encodeURIComponent(`${location.pathname}${location.search || ""}${location.hash || ""}`);
      return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
    }
    if (authState.role === "admin") return element;
    if (authState.role === "venue") return <Navigate to="/admin/venues" replace />;
    if (authState.role === "supplier") return <Navigate to="/supplier/dashboard" replace />;
    return <AccessDenied error={authState.error} onSignOut={signOut} />;
  }

  function supplierGuard(element) {
    if (sessionLoading || (user && authState.loading)) return <LoadingAccess />;
    if (!user) {
      const returnTo = encodeURIComponent(`${location.pathname}${location.search || ""}${location.hash || ""}`);
      return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
    }
    if (authState.role === "supplier") return element;
    if (authState.role === "admin") return <Navigate to="/admin/dashboard" replace />;
    if (authState.role === "venue") return <Navigate to="/admin/venues" replace />;
    if (authState.role === "customer") return <Navigate to="/customer" replace />;
    return <AccessDenied error={authState.error} onSignOut={signOut} />;
  }

  function customerGuard(element) {
    if (sessionLoading || (user && authState.loading)) return <LoadingAccess />;
    if (!user) {
      const returnTo = encodeURIComponent(`${location.pathname}${location.search || ""}${location.hash || ""}`);
      return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
    }
    if (authState.role === "customer") return element;
    if (authState.role === "admin") return <Navigate to="/admin/dashboard" replace />;
    if (authState.role === "venue") return <Navigate to="/admin/venues" replace />;
    if (authState.role === "supplier") return <Navigate to="/supplier/dashboard" replace />;
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
      <Route path="/request/:token" element={<EnquiryQuotesPage />} />
      <Route path="/enquiry/:token" element={<EnquiryQuotesPage />} />
      <Route path="/suppliers" element={<SuppliersPage />} />
      <Route path="/suppliers/:slug" element={<SupplierProfilePage />} />
      <Route path="/suppliers/:slug/request-quote" element={<SupplierRequestQuotePage />} />
      <Route path="/category/:categorySlug/:locationSlug" element={<CategoryLocationLandingPage />} />
      <Route path="/category/:categorySlug" element={<CategoryLocationLandingPage />} />
      <Route path="/location/:locationSlug" element={<CategoryLocationLandingPage />} />
      <Route path="/:slug" element={<SupplierSeoLandingPage />} />
      <Route path="/venues" element={<VenuesPage />} />
      <Route path="/venues/:slug" element={<VenueProfilePage />} />

      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/auth/reset" element={<AuthResetPage />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/update-password" element={<UpdatePassword />} />

      <Route
        path="/login"
        element={
          sessionLoading ? (
            <LoadingAccess />
          ) : user ? (
            authState.loading ? (
              <LoadingAccess />
            ) : authState.role === "admin" ? (
              <Navigate
                to={
                  (() => {
                    const requested = normalizeReturnTo(new URLSearchParams(location.search || "").get("returnTo"));
                    if (requested && requested.startsWith("/admin")) return requested;
                    return "/admin/dashboard";
                  })()
                }
                replace
              />
            ) : authState.role === "supplier" ? (
              <Navigate
                to={
                  (() => {
                    const requested = normalizeReturnTo(new URLSearchParams(location.search || "").get("returnTo"));
                    if (requested && requested.startsWith("/supplier")) return requested;
                    return "/supplier/dashboard";
                  })()
                }
                replace
              />
            ) : authState.role === "customer" ? (
              <Navigate
                to={
                  (() => {
                    const requested = normalizeReturnTo(new URLSearchParams(location.search || "").get("returnTo"));
                    if (requested && requested.startsWith("/customer")) return requested;
                    return "/customer";
                  })()
                }
                replace
              />
            ) : authState.role === "venue" ? (
              <Navigate
                to={
                  (() => {
                    const requested = normalizeReturnTo(new URLSearchParams(location.search || "").get("returnTo"));
                    if (requested && requested.startsWith("/admin/venues")) return requested;
                    return "/admin/venues";
                  })()
                }
                replace
              />
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
        path="/admin/venues/:venueId"
        element={adminGuard(
          <AdminLayout user={user} onSignOut={signOut}>
            <AdminVenuesPage user={user} />
          </AdminLayout>
        )}
      />
      <Route
        path="/admin/venues/:id"
        element={adminGuard(
          <AdminLayout user={user} onSignOut={signOut}>
            <AdminVenuesPage user={user} />
          </AdminLayout>
        )}
      />
      <Route
        path="/admin/reviews"
        element={adminGuard(
          <AdminLayout user={user} onSignOut={signOut}>
            <ReviewsPage user={user} />
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
        path="/customer"
        element={customerGuard(
          <CustomerLayout user={user} onSignOut={signOut}>
            <CustomerDashboardPage />
          </CustomerLayout>
        )}
      />
      <Route
        path="/customer/enquiries"
        element={customerGuard(
          <CustomerLayout user={user} onSignOut={signOut}>
            <CustomerEnquiriesPage />
          </CustomerLayout>
        )}
      />
      <Route
        path="/customer/enquiries/:id"
        element={customerGuard(
          <CustomerLayout user={user} onSignOut={signOut}>
            <CustomerEnquiryDetailPage />
          </CustomerLayout>
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
      <Route path="/customer/*" element={<Navigate to="/customer" replace />} />
      <Route path="/supplier/*" element={<Navigate to="/supplier/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
