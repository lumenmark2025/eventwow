import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import MarketingShell from "../../components/layout/MarketingShell";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import { supabase } from "../../lib/supabase";

const STORAGE_KEY = "supplier_join_basics_v1";

async function createDraftFromStorageIfNeeded() {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return;

  let payload = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return;
  }

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const token = data?.session?.access_token;
  if (!token) return;

  const resp = await fetch("/api/suppliers/create-draft", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (resp.ok) {
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

async function resolveSupplierStartRouteForVerify() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const token = data?.session?.access_token;
    if (!token) return null;
    const resp = await fetch("/api/suppliers/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.status === 404) return "/supplier/signup";
    const json = await resp.json().catch(() => ({}));
    if (!resp.ok) return null;
    const supplier = json?.supplier || null;
    if (!supplier?.id) return "/supplier/signup";
    if (supplier.is_published) return "/supplier/dashboard";
    const onboarding = String(supplier.onboarding_status || "").trim().toLowerCase();
    if (!onboarding || onboarding === "approved") return "/supplier/dashboard";
    if (onboarding === "pending_review") return "/supplier/dashboard";
    if (onboarding === "awaiting_email_verification") return "/supplier/dashboard";
    return "/suppliers/onboarding";
  } catch {
    return null;
  }
}

export default function SupplierVerifyPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const user = data?.session?.user;
      if (user?.email) setEmail(user.email);
      const isVerified = !!user?.email_confirmed_at;
      setVerified(isVerified);
      if (isVerified) {
        try {
          await createDraftFromStorageIfNeeded();
        } catch {
          // ignore; onboarding endpoint will show clear error if needed
        }
        const startRoute = await resolveSupplierStartRouteForVerify();
        navigate(startRoute || "/suppliers/onboarding", { replace: true });
      }
    });
  }, [navigate]);

  async function checkVerified() {
    setBusy(true);
    setError("");
    try {
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed?.error) throw refreshed.error;
      const user = refreshed?.data?.session?.user || null;
      const isVerified = !!user?.email_confirmed_at;
      setVerified(isVerified);
      if (user?.email) setEmail(user.email);
      if (!isVerified) {
        setError("Email is still unverified. Please click the verification link in your inbox.");
        return;
      }
      await createDraftFromStorageIfNeeded();
      const startRoute = await resolveSupplierStartRouteForVerify();
      navigate(startRoute || "/suppliers/onboarding", { replace: true });
    } catch (err) {
      setError(err?.message || "Could not verify session");
    } finally {
      setBusy(false);
    }
  }

  async function resendVerification() {
    setBusy(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      const resendEmail = data?.session?.user?.email || email;
      if (!resendEmail) throw new Error("No email found for resend");
      const resp = await supabase.auth.resend({
        type: "signup",
        email: resendEmail,
        options: { emailRedirectTo: `${window.location.origin}/supplier/dashboard` },
      });
      if (resp.error) throw resp.error;
    } catch (err) {
      setError(err?.message || "Failed to resend verification email");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await supabase.auth.signOut();
    navigate("/login", { replace: true });
  }

  return (
    <MarketingShell>
      <section className="mx-auto max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Verify your email</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-slate-700">
              Check your inbox{email ? ` at ${email}` : ""} and click the verification link before continuing onboarding.
            </p>

            {verified ? <p className="text-sm text-emerald-700">Email verified. Redirecting to onboarding...</p> : null}
            {error ? <p className="text-sm text-rose-600">{error}</p> : null}

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={checkVerified} disabled={busy}>I've verified my email</Button>
              <Button type="button" variant="secondary" onClick={resendVerification} disabled={busy}>Resend verification email</Button>
              <Button type="button" variant="ghost" onClick={logout} disabled={busy}>Logout</Button>
            </div>

            <p className="text-xs text-slate-500">
              Already verified and signed out? <Link to="/login?returnTo=%2Fsuppliers%2Fverify" className="underline">Sign in again</Link>.
            </p>
          </CardContent>
        </Card>
      </section>
    </MarketingShell>
  );
}
