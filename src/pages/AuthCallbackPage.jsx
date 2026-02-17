import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AuthShell from "../components/auth/AuthShell";
import Button from "../components/ui/Button";
import { resolvePostAuthRoute } from "../lib/authRedirect";

function normalizeRequestedPath(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const parsed = new URL(value);
    if (typeof window !== "undefined" && parsed.origin === window.location.origin) {
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
  } catch {
    return "";
  }
  return "";
}

export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function finishAuth() {
      try {
        const url = new URL(window.location.href);
        const requestedReturnTo =
          normalizeRequestedPath(url.searchParams.get("returnTo")) ||
          normalizeRequestedPath(url.searchParams.get("redirect_to"));
        const code = url.searchParams.get("code");
        if (code) {
          const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeErr) throw exchangeErr;
        }

        const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr) throw sessionErr;

        const user = sessionData?.session?.user || null;
        if (!user) {
          throw new Error("This sign-in link is invalid or expired. Request a new link.");
        }

        const destination = await resolvePostAuthRoute(supabase, user, requestedReturnTo);
        if (!cancelled) navigate(destination, { replace: true });
      } catch (err) {
        if (!cancelled) {
          setError(err?.message || "Failed to complete sign in.");
          setLoading(false);
        }
      }
    }

    finishAuth();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <AuthShell title="Signing you in" subtitle="We’re securely completing your Eventwow sign-in.">
      {error ? (
        <div className="space-y-4">
          <p className="text-sm text-rose-600">{error}</p>
          <div className="flex flex-wrap gap-2">
            <Button as={Link} to="/login">
              Go to login
            </Button>
            <Button as={Link} to="/" variant="ghost">
              Back to homepage
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-600">{loading ? "Please wait..." : "Redirecting..."}</p>
      )}
    </AuthShell>
  );
}

