import { Routes, Route, Navigate, useLocation } from "react-router-dom";
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
import VenueClaimsPage from "./pages/admin/VenueClaimsPage";
import CategoriesPage from "./pages/admin/CategoriesPage";
import SupplierApplicationsPage from "./pages/admin/SupplierApplicationsPage";

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
import VenueLayout from "./venue/layout/VenueLayout";
import VenueDashboardPage from "./pages/venue/DashboardPage";
import VenueEditPage from "./pages/venue/VenueEditPage";

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
import VenueClaimRequestPage from "./pages/marketing/VenueClaimRequestPage";
import VenueClaimVerifyPage from "./pages/marketing/VenueClaimVerifyPage";
import RequestPage from "./pages/marketing/RequestPage";
import SupplierRequestQuotePage from "./pages/marketing/SupplierRequestQuotePage";
import EnquiryQuotesPage from "./pages/marketing/EnquiryQuotesPage";
import CategoryLocationLandingPage from "./pages/marketing/CategoryLocationLandingPage";
import SupplierSeoLandingPage from "./pages/marketing/SupplierSeoLandingPage";
import CategoryLandingPage from "./pages/marketing/CategoryLandingPage";
import SupplierJoinPage from "./pages/marketing/SupplierJoinPage";
import SupplierVerifyPage from "./pages/marketing/SupplierVerifyPage";
import SupplierOnboardingPage from "./pages/marketing/SupplierOnboardingPage";

function AccessDenied({ error, onSignOut }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 space-y-2">
        <h1 className="text-xl font-semibold">Access denied</h1>
        {error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : (
          <p className="text-sm text-gray-600">
            Your user is not recognised as an admin, supplier, customer, or venue owner.
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

function isSupplierEmailVerified(user) {
  return !!user?.email_confirmed_at;
}

function normalizeSupplierOnboardingStatus(supplier) {
  if (!supplier) return "";
  if (supplier.is_published === true) return "approved";
  const onboarding = String(supplier.onboarding_status || "").trim().toLowerCase();
  if (onboarding) return onboarding;
  const legacy = String(supplier.status || "").trim().toLowerCase();
  if (legacy === "approved") return "approved";
  if (legacy === "pending_review") return "pending_review";
  if (legacy === "rejected") return "rejected";
  // Legacy suppliers created before onboarding_status existed should still access supplier dashboard.
  return "approved";
}

function getSupplierStartRoute(user, supplier) {
  if (!supplier?.id) return "/suppliers/join";
  const verified = isSupplierEmailVerified(user);
  const onboardingStatus = normalizeSupplierOnboardingStatus(supplier);
  if (supplier?.is_published === true) return "/supplier/dashboard";
  if (onboardingStatus === "approved") return "/supplier/dashboard";
  if (onboardingStatus === "awaiting_email_verification" && !verified) return "/suppliers/verify";
  if (["draft", "profile_incomplete", "rejected"].includes(onboardingStatus)) return "/suppliers/onboarding";
  return "/supplier/dashboard";
}

export default function App() {
  const location = useLocation();
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
  const isDev = import.meta.env.DEV;

  useEffect(() => {
    if (!isDev) return;
    const supplierSummary = authState?.supplier
      ? {
          id: authState.supplier.id || null,
          is_published: !!authState.supplier.is_published,
          onboarding_status: authState.supplier.onboarding_status || null,
        }
      : null;
    console.debug("[auth-debug]", {
      route: location.pathname,
      sessionLoading,
      hasSession: !!session,
      userId: user?.id || null,
      role: authState.role,
      authLoading: authState.loading,
      supplier: supplierSummary,
    });
  }, [isDev, location.pathname, sessionLoading, session, user?.id, authState.role, authState.loading, authState.supplier]);

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
            .select("id,business_name,credits_balance,is_published,status,onboarding_status,admin_notes")
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
        if (profileRole === "venue_owner" || profileRole === "venue") {
          if (!cancelled) setAuthState({ loading: false, role: "venue_owner", supplier: null, customer: null, error: null });
          return;
        }

        const { data: roleRow, error: roleErr } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "admin")
          .maybeSingle();

        if (!roleErr && roleRow?.role === "admin") {
          if (!cancelled) setAuthState({ loading: false, role: "admin", supplier: null, customer: null, error: null });
          return;
        }

        const { data: supplierRow, error: supplierErr } = await supabase
          .from("suppliers")
          .select("id,business_name,credits_balance,is_published,status,onboarding_status,admin_notes")
          .eq("auth_user_id", user.id)
          .maybeSingle();

        if (!supplierErr && supplierRow?.id) {
          if (!cancelled) setAuthState({ loading: false, role: "supplier", supplier: supplierRow, customer: null, error: null });
          return;
        }

        const { data: venueOwnerRoleRow, error: venueOwnerRoleErr } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id)
          .eq("role", "venue_owner")
          .maybeSingle();
        if (!venueOwnerRoleErr && venueOwnerRoleRow?.role) {
          if (!cancelled) setAuthState({ loading: false, role: "venue_owner", supplier: null, customer: null, error: null });
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
      window.location.assign("/");
    }
  }

  function adminGuard(element) {
    if (sessionLoading || (user && authState.loading)) return <LoadingAccess />;
    if (!user) {
      const returnTo = encodeURIComponent(`${location.pathname}${location.search || ""}${location.hash || ""}`);
      return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
    }
    if (authState.role === "admin") return element;
    if (authState.role === "venue_owner" || authState.role === "venue") return <Navigate to="/venue" replace />;
    if (authState.role === "supplier") return <Navigate to={getSupplierStartRoute(user, authState.supplier)} replace />;
    return <AccessDenied error={authState.error} onSignOut={signOut} />;
  }

  function supplierGuard(element) {
    if (sessionLoading || (user && authState.loading)) return <LoadingAccess />;
    if (!user) {
      const returnTo = encodeURIComponent(`${location.pathname}${location.search || ""}${location.hash || ""}`);
      return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
    }
    if (authState.role === "supplier") {
      const startRoute = getSupplierStartRoute(user, authState.supplier);
      if (startRoute !== "/supplier/dashboard" && location.pathname.startsWith("/supplier")) {
        return <Navigate to={startRoute} replace />;
      }
      return element;
    }
    if (authState.role === "admin") return <Navigate to="/admin/dashboard" replace />;
    if (authState.role === "venue_owner" || authState.role === "venue") return <Navigate to="/venue" replace />;
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
    if (authState.role === "venue_owner" || authState.role === "venue") return <Navigate to="/venue" replace />;
    if (authState.role === "supplier") return <Navigate to={getSupplierStartRoute(user, authState.supplier)} replace />;
    return <AccessDenied error={authState.error} onSignOut={signOut} />;
  }

  function venueGuard(element) {
    if (sessionLoading || (user && authState.loading)) return <LoadingAccess />;
    if (!user) {
      const returnTo = encodeURIComponent(`${location.pathname}${location.search || ""}${location.hash || ""}`);
      return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
    }
    if (authState.role === "venue_owner" || authState.role === "venue") return element;
    if (authState.role === "admin") return <Navigate to="/admin/dashboard" replace />;
    if (authState.role === "supplier") return <Navigate to={getSupplierStartRoute(user, authState.supplier)} replace />;
    if (authState.role === "customer") return <Navigate to="/customer" replace />;
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
      <Route path="/how-it-works" element={<HowItWorksPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/request" element={<RequestPage />} />
      <Route path="/request/:token" element={<EnquiryQuotesPage />} />
      <Route path="/enquiry/:token" element={<EnquiryQuotesPage />} />
      <Route path="/suppliers" element={<SuppliersPage />} />
      <Route path="/suppliers/join" element={<SupplierJoinPage />} />
      <Route path="/suppliers/verify" element={<SupplierVerifyPage />} />
      <Route path="/suppliers/onboarding" element={<SupplierOnboardingPage />} />
      <Route path="/suppliers/:slug" element={<SupplierProfilePage />} />
      <Route path="/suppliers/:slug/request-quote" element={<SupplierRequestQuotePage />} />
      <Route path="/browse" element={<Navigate to="/categories" replace />} />
      <Route path="/categories" element={<BrowsePage />} />
      <Route path="/categories/:slug" element={<CategoryLandingPage />} />
      <Route path="/list-your-business" element={<Navigate to="/suppliers/join" replace />} />
      <Route path="/category/:categorySlug/:locationSlug" element={<CategoryLocationLandingPage />} />
      <Route path="/category/:categorySlug" element={<CategoryLocationLandingPage />} />
      <Route path="/location/:locationSlug" element={<CategoryLocationLandingPage />} />
      <Route path="/:slug" element={<SupplierSeoLandingPage />} />
      <Route path="/venues" element={<VenuesPage />} />
      <Route path="/venues/:slug" element={<VenueProfilePage />} />
      <Route path="/venues/:slug/claim" element={<VenueClaimRequestPage />} />
      <Route path="/claim/venue" element={<VenueClaimVerifyPage />} />

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
                    const startRoute = getSupplierStartRoute(user, authState.supplier);
                    if (requested && requested.startsWith("/supplier")) return requested;
                    if (requested && requested.startsWith("/suppliers/") && startRoute.startsWith("/suppliers/")) return requested;
                    return startRoute;
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
            ) : authState.role === "venue_owner" || authState.role === "venue" ? (
              <Navigate
                to={
                  (() => {
                    const requested = normalizeReturnTo(new URLSearchParams(location.search || "").get("returnTo"));
                    if (requested && requested.startsWith("/venue")) return requested;
                    return "/venue";
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
        path="/admin/categories"
        element={adminGuard(
          <AdminLayout user={user} onSignOut={signOut}>
            <CategoriesPage user={user} />
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
        path="/admin/venue-claims"
        element={adminGuard(
          <AdminLayout user={user} onSignOut={signOut}>
            <VenueClaimsPage user={user} />
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
        path="/admin/supplier-applications"
        element={adminGuard(
          <AdminLayout user={user} onSignOut={signOut}>
            <SupplierApplicationsPage user={user} />
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

      <Route
        path="/venue"
        element={venueGuard(
          <VenueLayout user={user} onSignOut={signOut}>
            <VenueDashboardPage />
          </VenueLayout>
        )}
      />
      <Route
        path="/venue/:venueId/edit"
        element={venueGuard(
          <VenueLayout user={user} onSignOut={signOut}>
            <VenueEditPage />
          </VenueLayout>
        )}
      />

      <Route path="/admin/*" element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="/customer/*" element={<Navigate to="/customer" replace />} />
      <Route path="/supplier/*" element={<Navigate to="/supplier/dashboard" replace />} />
      <Route path="/venue/*" element={<Navigate to="/venue" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
