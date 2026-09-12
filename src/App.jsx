import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { lazy, useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { getSupplierStartRoute } from "./lib/authRedirect";

import Login from "./components/Login";
const AdminLayout = lazy(() => import("./admin/layout/AdminLayout"));
const SupplierLayout = lazy(() => import("./supplier/layout/SupplierLayout"));
const CustomerLayout = lazy(() => import("./customer/layout/CustomerLayout"));
import { warnIfAuthOriginLooksWrong } from "./lib/siteUrl";

const AdminVenuesPage = lazy(() => import("./pages/admin/VenuesPage"));
const AdminSuppliersPage = lazy(() => import("./pages/admin/SuppliersPage"));
const AdminEnquiriesPage = lazy(() => import("./pages/admin/EnquiriesPage"));
const AdminDashboardPage = lazy(() => import("./pages/admin/DashboardPage"));
const CreditsLedgerPage = lazy(() => import("./pages/admin/CreditsLedgerPage"));
const SupplierPerformancePage = lazy(() => import("./pages/admin/SupplierPerformancePage"));
const ReviewsPage = lazy(() => import("./pages/admin/ReviewsPage"));
const VenueClaimsPage = lazy(() => import("./pages/admin/VenueClaimsPage"));
const CategoriesPage = lazy(() => import("./pages/admin/CategoriesPage"));
const SupplierApplicationsPage = lazy(() => import("./pages/admin/SupplierApplicationsPage"));
const VenueHeroImagesPage = lazy(() => import("./pages/admin/VenueHeroImagesPage"));

const DashboardPage = lazy(() => import("./pages/supplier/DashboardPage"));
const SupplierEnquiriesPage = lazy(() => import("./pages/supplier/EnquiriesPage"));
const QuotesPage = lazy(() => import("./pages/supplier/QuotesPage"));
const BookingsPage = lazy(() => import("./pages/supplier/BookingsPage"));
const MessagesPage = lazy(() => import("./pages/supplier/MessagesPage"));
const NotificationsPage = lazy(() => import("./pages/supplier/NotificationsPage"));
const ListingPage = lazy(() => import("./pages/supplier/ListingPage"));
const CustomerDashboardPage = lazy(() => import("./pages/customer/DashboardPage"));
const CustomerEnquiriesPage = lazy(() => import("./pages/customer/EnquiriesPage"));
const CustomerEnquiryDetailPage = lazy(() => import("./pages/customer/EnquiryDetailPage"));
const VenueLayout = lazy(() => import("./venue/layout/VenueLayout"));
const VenueDashboardPage = lazy(() => import("./pages/venue/DashboardPage"));
const VenueEditPage = lazy(() => import("./pages/venue/VenueEditPage"));

const PublicQuotePage = lazy(() => import("./pages/PublicQuotePage"));
const AuthCallbackPage = lazy(() => import("./pages/AuthCallbackPage"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const UpdatePassword = lazy(() => import("./pages/UpdatePassword"));

import HomePage from "./pages/marketing/HomePage";
const BrowsePage = lazy(() => import("./pages/marketing/BrowsePage"));
const HowItWorksPage = lazy(() => import("./pages/marketing/HowItWorksPage"));
const PricingPage = lazy(() => import("./pages/marketing/PricingPage"));
const ContactPage = lazy(() => import("./pages/marketing/ContactPage"));
const SuppliersPage = lazy(() => import("./pages/marketing/SuppliersPage"));
const SupplierProfilePage = lazy(() => import("./pages/marketing/SupplierProfilePage"));
const VenuesPage = lazy(() => import("./pages/marketing/VenuesPage"));
const VenueProfilePage = lazy(() => import("./pages/marketing/VenueProfilePage"));
const VenueClaimRequestPage = lazy(() => import("./pages/marketing/VenueClaimRequestPage"));
const VenueClaimVerifyPage = lazy(() => import("./pages/marketing/VenueClaimVerifyPage"));
const RequestPage = lazy(() => import("./pages/marketing/RequestPage"));
const SupplierRequestQuotePage = lazy(() => import("./pages/marketing/SupplierRequestQuotePage"));
const EnquiryQuotesPage = lazy(() => import("./pages/marketing/EnquiryQuotesPage"));
const BookingAccessPage = lazy(() => import("./pages/marketing/BookingAccessPage"));
const CategoryLocationLandingPage = lazy(() => import("./pages/marketing/CategoryLocationLandingPage"));
const SupplierSeoLandingPage = lazy(() => import("./pages/marketing/SupplierSeoLandingPage"));
const CategoryLandingPage = lazy(() => import("./pages/marketing/CategoryLandingPage"));
const SupplierJoinPage = lazy(() => import("./pages/marketing/SupplierJoinPage"));
const SupplierVerifyPage = lazy(() => import("./pages/marketing/SupplierVerifyPage"));
const SupplierOnboardingPage = lazy(() => import("./pages/marketing/SupplierOnboardingPage"));

const DesignSystemPage = lazy(() => import("./pages/DesignSystemPage"));

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
      <Route path="/design-system" element={<DesignSystemPage />} />
      <Route path="/how-it-works" element={<HowItWorksPage />} />
      <Route path="/pricing" element={<PricingPage />} />
      <Route path="/contact" element={<ContactPage />} />
      <Route path="/request" element={<RequestPage />} />
      <Route path="/request/:token" element={<EnquiryQuotesPage />} />
      <Route path="/enquiry/:token" element={<EnquiryQuotesPage />} />
      <Route path="/booking-access" element={<BookingAccessPage />} />
      <Route path="/suppliers" element={<SuppliersPage />} />
      <Route path="/supplier/signup" element={<SupplierJoinPage />} />
      <Route path="/suppliers/join" element={<Navigate to="/supplier/signup" replace />} />
      <Route path="/suppliers/verify" element={<SupplierVerifyPage />} />
      <Route path="/suppliers/onboarding" element={<SupplierOnboardingPage />} />
      <Route path="/supplier/onboarding" element={<Navigate to="/suppliers/onboarding" replace />} />
      <Route path="/suppliers/:slug" element={<SupplierProfilePage />} />
      <Route path="/suppliers/:slug/request-quote" element={<SupplierRequestQuotePage />} />
      <Route path="/browse" element={<Navigate to="/categories" replace />} />
      <Route path="/categories" element={<BrowsePage />} />
      <Route path="/categories/:slug" element={<CategoryLandingPage />} />
      <Route path="/list-your-business" element={<Navigate to="/supplier/signup" replace />} />
      <Route path="/category/:categorySlug/:locationSlug" element={<CategoryLocationLandingPage />} />
      <Route path="/category/:categorySlug" element={<CategoryLocationLandingPage />} />
      <Route path="/location/:locationSlug" element={<CategoryLocationLandingPage />} />
      <Route path="/:slug" element={<SupplierSeoLandingPage />} />
      <Route path="/venues" element={<VenuesPage />} />
      <Route path="/venues/:slug" element={<VenueProfilePage />} />
      <Route path="/venues/:slug/claim" element={<VenueClaimRequestPage />} />
      <Route path="/claim/venue" element={<VenueClaimVerifyPage />} />

      <Route path="/auth/callback" element={<AuthCallbackPage />} />
      <Route path="/auth/reset" element={<Navigate to="/reset-password" replace />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
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
        path="/admin/venues/hero-images"
        element={adminGuard(
          <AdminLayout user={user} onSignOut={signOut}>
            <VenueHeroImagesPage user={user} />
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
