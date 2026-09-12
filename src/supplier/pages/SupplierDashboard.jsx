import { useEffect, useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import PageHeader from "../../components/layout/PageHeader";
import { Feedback, Button } from "../../components/workspace/AdminPrimitives";
import {
  MetricCard,
  DashboardCard,
  ActivityList,
  QuickActions,
} from "../../components/workspace/WorkspaceComponents";
import {
  Inbox,
  FileText,
  CalendarDays,
  CreditCard,
  Store,
  Bell,
} from "lucide-react";

function numeric(value) {
  return (
    value !== null &&
    value !== undefined &&
    value !== "" &&
    Number.isFinite(Number(value))
  );
}
function score(value) {
  return numeric(value) ? `${Math.round(Number(value) * 100)} / 100` : "—";
}

function normalizeSupplierLifecycleStatus(supplier) {
  if (!supplier) return "";
  if (supplier.is_published === true) return "approved";

  const onboarding = String(supplier.onboarding_status || "")
    .trim()
    .toLowerCase();
  if (onboarding) return onboarding;

  const legacy = String(supplier.status || "")
    .trim()
    .toLowerCase();
  if (legacy === "approved") return "approved";
  if (legacy === "pending_review") return "pending_review";
  if (legacy === "rejected") return "rejected";
  return "approved";
}

export default function SupplierDashboard({ supplier }) {
  const navigate = useNavigate();
  const supplierId = supplier?.id;
  const supplierCreditsBalance = supplier?.credits_balance;
  const [searchParams, setSearchParams] = useSearchParams();
  const supplierLifecycleStatus = normalizeSupplierLifecycleStatus(supplier);
  const [authEmail, setAuthEmail] = useState("");
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [verificationBusy, setVerificationBusy] = useState(false);
  const [verificationMsg, setVerificationMsg] = useState("");
  const [verificationErr, setVerificationErr] = useState("");

  const [loading, setLoading] = useState(true);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [err, setErr] = useState("");

  const [stats, setStats] = useState({
    invitedCount: null,
    activeEnquiriesCount: null,
    quotesSentCount: null,
    acceptedCount: null,
    upcomingBookingsCount: null,
  });

  const [creditsBalance, setCreditsBalance] = useState(null);
  const [creditHistory, setCreditHistory] = useState([]);
  const [bundleBusy, setBundleBusy] = useState("");
  const [bundleMsg, setBundleMsg] = useState("");
  const [performance, setPerformance] = useState(null);
  const [ranking, setRanking] = useState(null);
  const [rankingTips, setRankingTips] = useState([]);
  const [creditHistoryError, setCreditHistoryError] = useState("");
  const [performanceError, setPerformanceError] = useState("");
  const [rankingError, setRankingError] = useState("");

  async function refreshVerifiedState() {
    try {
      const userResp = await supabase.auth.getUser();
      const user = userResp?.data?.user || null;
      setAuthEmail(String(user?.email || ""));
      setIsEmailVerified(!!user?.email_confirmed_at);
      return !!user?.email_confirmed_at;
    } catch {
      return false;
    }
  }

  async function resendVerificationEmail() {
    setVerificationBusy(true);
    setVerificationErr("");
    setVerificationMsg("");
    try {
      const { data } = await supabase.auth.getSession();
      const resendEmail = data?.session?.user?.email || authEmail;
      if (!resendEmail) throw new Error("No email found for resend");
      const resp = await supabase.auth.resend({
        type: "signup",
        email: resendEmail,
        options: {
          emailRedirectTo: `${window.location.origin}/supplier/dashboard`,
        },
      });
      if (resp.error) throw resp.error;
      setVerificationMsg(
        "Verification email sent - check your inbox and spam.",
      );
    } catch (err) {
      setVerificationErr(err?.message || "Failed to resend verification email");
    } finally {
      setVerificationBusy(false);
    }
  }

  async function checkVerificationNow() {
    setVerificationBusy(true);
    setVerificationErr("");
    setVerificationMsg("");
    try {
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed?.error) throw refreshed.error;
      const verified = await refreshVerifiedState();
      if (verified) {
        setVerificationMsg(
          "Email verified. You're good to continue onboarding.",
        );
      } else {
        setVerificationErr(
          "Email is still unverified. Please click the verification link in your inbox.",
        );
      }
    } catch (err) {
      setVerificationErr(
        err?.message || "Could not refresh verification status",
      );
    } finally {
      setVerificationBusy(false);
    }
  }

  useEffect(() => {
    refreshVerifiedState();
  }, []);

  async function startBundleCheckout(bundle) {
    if (bundleBusy) return;
    setBundleBusy(bundle);
    setErr("");
    setBundleMsg("");
    try {
      const { data: sessionData, error: sessionErr } =
        await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error("Not authenticated");

      const resp = await fetch("/api/supplier-create-credit-checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ bundle }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok)
        throw new Error(
          [json?.error, json?.details].filter(Boolean).join(": ") ||
            "Failed to start checkout",
        );

      const checkoutUrl = String(json?.checkoutUrl || "").trim();
      if (!checkoutUrl) throw new Error("No checkout URL returned");
      window.location.assign(checkoutUrl);
    } catch (ex) {
      setErr(ex?.message || "Failed to start checkout");
    } finally {
      setBundleBusy("");
    }
  }

  useEffect(() => {
    if (!supplierId) return;
    let active = true;

    (async () => {
      setLoading(true);
      setErr("");

      try {
        const today = new Date().toISOString().slice(0, 10);
        setCreditsBalance(supplierCreditsBalance ?? null);

        const [
          creditsResult,
          linkResult,
          activeResult,
          sentResult,
          acceptedResult,
          bookingsResult,
        ] = await Promise.allSettled([
          supabase
            .from("credit_transactions")
            .select("id, change, reason, created_at")
            .eq("supplier_id", supplierId)
            .order("created_at", { ascending: false })
            .limit(20),
          supabase
            .from("enquiry_suppliers")
            .select("id", { count: "exact", head: true })
            .eq("supplier_id", supplierId),
          supabase
            .from("enquiry_suppliers")
            .select("id", { count: "exact", head: true })
            .eq("supplier_id", supplierId)
            .not("supplier_status", "in", "(declined)"),
          supabase
            .from("quotes")
            .select("id", { count: "exact", head: true })
            .eq("supplier_id", supplierId)
            .in("status", ["sent", "accepted", "declined", "closed"]),
          supabase
            .from("quotes")
            .select("id", { count: "exact", head: true })
            .eq("supplier_id", supplierId)
            .eq("status", "accepted"),
          supabase
            .from("supplier_bookings")
            .select("id", { count: "exact", head: true })
            .eq("supplier_id", supplierId)
            .gte("event_date", today)
            .in("status", ["draft", "confirmed"]),
        ]);

        if (!active) return;

        function extract(result, label) {
          if (result.status !== "fulfilled") {
            console.error(
              `supplier dashboard ${label} query failed:`,
              result.reason,
            );
            return null;
          }
          if (result.value?.error) {
            console.error(
              `supplier dashboard ${label} query failed:`,
              result.value.error,
            );
            return null;
          }
          return result.value;
        }

        const creditsResp = extract(creditsResult, "credit history");
        const linkResp = extract(linkResult, "invited count");
        const activeResp = extract(activeResult, "active count");
        const sentResp = extract(sentResult, "quotes sent count");
        const acceptedResp = extract(acceptedResult, "accepted count");
        const bookingsResp = extract(bookingsResult, "upcoming bookings count");

        setCreditHistory(
          Array.isArray(creditsResp?.data) ? creditsResp.data : [],
        );
        setCreditHistoryError(
          creditsResp ? "" : "Credit history is unavailable.",
        );
        setStats({
          invitedCount: linkResp ? Number(linkResp.count || 0) : null,
          activeEnquiriesCount: activeResp
            ? Number(activeResp.count || 0)
            : null,
          quotesSentCount: sentResp ? Number(sentResp.count || 0) : null,
          acceptedCount: acceptedResp ? Number(acceptedResp.count || 0) : null,
          upcomingBookingsCount: bookingsResp
            ? Number(bookingsResp.count || 0)
            : null,
        });
      } catch (ex) {
        if (active) setErr(ex?.message || "Failed to load dashboard.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [supplierId, supplierCreditsBalance]);

  useEffect(() => {
    if (!supplierId) return;
    let active = true;
    // Optional service panels can load alongside the dashboard counts.
    (async () => {
      setServicesLoading(true);
      try {
        const { data: sessionData, error: sessionErr } =
          await supabase.auth.getSession();
        if (!active) return;
        if (sessionErr) throw sessionErr;
        const accessToken = sessionData?.session?.access_token;
        if (accessToken) {
          // Independent services: preserve their contracts without a serial waterfall.
          const [perfResult, rankResult] = await Promise.allSettled([
            fetch("/api/supplier-performance", {
              headers: { Authorization: `Bearer ${accessToken}` },
            }).then(async (response) => {
              const json = await response.json().catch(() => ({}));
              if (!response.ok)
                throw new Error(json?.error || "Performance is unavailable.");
              return json;
            }),
            fetch("/api/supplier/ranking", {
              headers: { Authorization: `Bearer ${accessToken}` },
            }).then(async (response) => {
              const json = await response.json().catch(() => ({}));
              if (!response.ok)
                throw new Error(json?.error || "Ranking is unavailable.");
              return json;
            }),
          ]);
          if (!active) return;
          setPerformance(
            perfResult.status === "fulfilled"
              ? perfResult.value?.performance || null
              : null,
          );
          setPerformanceError(
            perfResult.status === "rejected"
              ? "Performance is unavailable."
              : "",
          );
          setRanking(
            rankResult.status === "fulfilled"
              ? rankResult.value?.ranking || null
              : null,
          );
          setRankingTips(
            rankResult.status === "fulfilled" &&
              Array.isArray(rankResult.value?.tips)
              ? rankResult.value.tips
              : [],
          );
          setRankingError(
            rankResult.status === "rejected" ? "Ranking is unavailable." : "",
          );
        }
      } catch (ex) {
        if (active) setErr(ex?.message || "Failed to load dashboard.");
      } finally {
        if (active) setServicesLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [supplierId, supplierCreditsBalance]);

  useEffect(() => {
    const status = String(searchParams.get("credits") || "").toLowerCase();
    if (!status) return;
    if (status === "success") {
      setBundleMsg("Payment completed. Credits are being applied.");
    }
    if (status === "cancel") {
      setBundleMsg("Credit purchase canceled.");
    }
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("credits");
        return next;
      },
      { replace: true },
    );
  }, [searchParams, setSearchParams]);

  return (
    <div className="ew-page-stack">
      <PageHeader
        title="Supplier overview"
        subtitle={
          supplier?.business_name ||
          "Your requests, listing and recent activity."
        }
        actions={[
          {
            key: "requests",
            label: "View requests",
            onClick: () => navigate("/supplier/enquiries"),
          },
          {
            key: "refresh",
            label: "Refresh",
            variant: "secondary",
            onClick: () => window.location.reload(),
            disabled: loading || servicesLoading,
          },
        ]}
      />
      {err && <Feedback>{err}</Feedback>}
      {supplierLifecycleStatus === "awaiting_email_verification" &&
        !isEmailVerified && (
          <Feedback tone="warning">
            <p>Please verify your email to continue onboarding.</p>
            {authEmail && <p>Current email: {authEmail}</p>}
            {verificationMsg && (
              <Feedback tone="success">{verificationMsg}</Feedback>
            )}
            {verificationErr && <Feedback>{verificationErr}</Feedback>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={resendVerificationEmail}
                disabled={verificationBusy}
              >
                {verificationBusy ? "Sending..." : "Resend verification email"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={checkVerificationNow}
                disabled={verificationBusy}
              >
                I've already verified
              </Button>
            </div>
          </Feedback>
        )}
      {(supplierLifecycleStatus === "profile_incomplete" ||
        supplierLifecycleStatus === "draft") && (
        <Feedback tone="warning">
          Complete your profile and submit it for review before going live.{" "}
          <Link className="ew-link" to="/supplier/listing">
            Edit listing
          </Link>
        </Feedback>
      )}
      {supplierLifecycleStatus === "pending_review" && (
        <Feedback tone="warning">
          Your listing is under review. You can keep editing, but it won't
          appear publicly yet.
        </Feedback>
      )}
      {supplierLifecycleStatus === "rejected" && (
        <Feedback>
          <p>
            Your listing was rejected. Update your details and resubmit for
            review.
          </p>
          {supplier?.admin_notes && <p>Admin note: {supplier.admin_notes}</p>}
          <Link className="ew-link" to="/supplier/listing">
            Edit listing
          </Link>{" "}
          ·{" "}
          <a className="ew-link" href="/contact">
            Contact support
          </a>
        </Feedback>
      )}
      {!loading && Object.values(stats).some((value) => value === null) && (
        <Feedback tone="warning">
          Some request, quote or booking counts are unavailable. Refresh to try
          again.
        </Feedback>
      )}
      <div className="ew-metrics">
        <Link to="/supplier/enquiries" aria-label="Open requests">
          <MetricCard
            label="Open requests"
            value={stats.activeEnquiriesCount}
            hint={loading ? null : `Linked total: ${stats.invitedCount ?? "—"}`}
            loading={loading}
            icon={Inbox}
          />
        </Link>
        <Link to="/supplier/quotes" aria-label="My quotes">
          <MetricCard
            label="My quotes"
            value={stats.quotesSentCount}
            hint={loading ? null : `Accepted: ${stats.acceptedCount ?? "—"}`}
            loading={loading}
            icon={FileText}
            tone="purple"
          />
        </Link>
        <Link to="/supplier/bookings" aria-label="My bookings">
          <MetricCard
            label="My bookings"
            value={stats.upcomingBookingsCount}
            hint="Upcoming draft + confirmed"
            loading={loading}
            icon={CalendarDays}
            tone="orange"
          />
        </Link>
        <a href="#credits" aria-label="Credits">
          <MetricCard
            label="Credits available"
            hint="Current balance"
            value={creditsBalance}
            icon={CreditCard}
            loading={loading}
            tone="green"
          />
        </a>
      </div>
      <div className="ew-dashboard-grid">
        <DashboardCard title="Recent credit activity">
          <ActivityList
            loading={loading}
            error={creditHistoryError}
            items={creditHistory.slice(0, 8).map((row) => ({
              id: row.id,
              title: row.reason,
              when: new Date(row.created_at).toLocaleDateString(),
              value: row.change > 0 ? `+${row.change}` : row.change,
            }))}
          />
        </DashboardCard>
        <DashboardCard title="Listing status">
          <div className="ew-form-section-body space-y-3">
            <p>
              {supplier?.is_published
                ? "Your listing is visible in the directory."
                : "Your listing is not currently published."}
            </p>
            <Link className="ew-link" to="/supplier/listing">
              Review your profile and images
            </Link>
          </div>
        </DashboardCard>
        <div className="ew-dashboard-side">
          <DashboardCard title="Quick actions">
            <QuickActions
              actions={[
                { to: "/supplier/enquiries", label: "Requests", icon: Inbox },
                { to: "/supplier/listing", label: "Edit listing", icon: Store },
                {
                  to: "/supplier/notifications",
                  label: "Notifications",
                  icon: Bell,
                },
                { to: "/supplier/quotes", label: "Quotes", icon: FileText },
              ]}
            />
          </DashboardCard>
        </div>
      </div>
      <section id="credits">
        <DashboardCard title="Credits">
          <div className="ew-form-section-body space-y-4">
            <p>
              Available balance:{" "}
              <strong>{loading ? "—" : (creditsBalance ?? "—")}</strong>
            </p>
            {bundleMsg && <Feedback tone="success">{bundleMsg}</Feedback>}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => startBundleCheckout("credits_25")}
                disabled={!!bundleBusy}
              >
                {bundleBusy === "credits_25"
                  ? "Opening..."
                  : "25 credits - GBP 12.50"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => startBundleCheckout("credits_50")}
                disabled={!!bundleBusy}
              >
                {bundleBusy === "credits_50"
                  ? "Opening..."
                  : "50 credits - GBP 25.00"}
              </Button>
            </div>
          </div>
        </DashboardCard>
      </section>
      <section id="performance">
        <DashboardCard title="Your marketplace performance">
          <div className="ew-form-section-body space-y-4">
            {performanceError && <Feedback>{performanceError}</Feedback>}
            {rankingError && <Feedback>{rankingError}</Feedback>}
            <dl className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <dt className="ew-muted">Smoothed acceptance</dt>
                <dd className="font-semibold">
                  {!servicesLoading && numeric(ranking?.smoothed_acceptance)
                    ? `${Math.round(Number(ranking.smoothed_acceptance) * 100)}%`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="ew-muted">Typical reply</dt>
                <dd className="font-semibold">
                  {!servicesLoading &&
                  numeric(performance?.typicalResponseHours)
                    ? `~${Number(performance.typicalResponseHours).toFixed(Number(performance.typicalResponseHours) < 10 ? 1 : 0)}h`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="ew-muted">Base quality</dt>
                <dd className="font-semibold">
                  {servicesLoading ? "—" : score(ranking?.base_quality)}
                </dd>
              </div>
              <div>
                <dt className="ew-muted">Activity</dt>
                <dd>
                  {servicesLoading
                    ? "—"
                    : ranking?.activity_label || "No recent activity data"}
                </dd>
              </div>
              <div>
                <dt className="ew-muted">Response score</dt>
                <dd className="font-semibold">
                  {servicesLoading ? "—" : score(ranking?.response_score)}
                </dd>
              </div>
            </dl>
            {rankingTips.length ? (
              <ul className="list-disc space-y-1 pl-5">
                {rankingTips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            ) : (
              !servicesLoading &&
              !rankingError && (
                <p className="ew-form-help">No performance tips available.</p>
              )
            )}
          </div>
        </DashboardCard>
      </section>
    </div>
  );
}
