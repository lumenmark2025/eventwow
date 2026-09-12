import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import AuthShell from "../components/auth/AuthShell";
import Input from "../components/ui/Input";
import Button from "../components/ui/Button";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [loadingSession, setLoadingSession] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function bootstrapRecoverySession() {
      setLoadingSession(true);
      setError("");
      try {
        const url = new URL(window.location.href);
        const tokenHash = url.searchParams.get("token_hash");
        const type = url.searchParams.get("type");

        if (tokenHash && type === "recovery") {
          const { error: verifyErr } = await supabase.auth.verifyOtp({
            type: "recovery",
            token_hash: tokenHash,
          });
          if (verifyErr) throw verifyErr;
        }

        await new Promise((r) => setTimeout(r, 150));
        const { data, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr) throw sessionErr;
        if (!data?.session) {
          throw new Error(
            "Reset link is invalid or expired. Request a new reset email.",
          );
        }

        if (!cancelled) setReady(true);
      } catch (err) {
        if (!cancelled) {
          setReady(false);
          setError(err?.message || "Failed to verify reset link.");
        }
      } finally {
        if (!cancelled) setLoadingSession(false);
      }
    }

    bootstrapRecoverySession();
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setReady(true);
        setError("");
      }
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password });
      if (updateErr) throw updateErr;

      setSuccess("Password updated successfully. Redirecting to login...");
      setTimeout(() => navigate("/login", { replace: true }), 1400);
    } catch (err) {
      setError(err?.message || "Failed to update password.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AuthShell
      title="Set your new password"
      subtitle="Use a strong password with at least 8 characters."
    >
      {loadingSession ? (
        <p role="status" className="auth-body auth-muted">
          Verifying reset link...
        </p>
      ) : !ready ? (
        <div className="space-y-3">
          <p role="alert" className="auth-body auth-error">
            {error || "Reset link is invalid or expired."}
          </p>
          <Link
            to="/forgot-password"
            className="auth-body auth-link underline underline-offset-2"
          >
            Request a new reset link
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              className="auth-body font-medium auth-ink"
              htmlFor="new-password"
            >
              New password
            </label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={saving}
              minLength={8}
            />
          </div>

          <div className="space-y-1.5">
            <label
              className="auth-body font-medium auth-ink"
              htmlFor="confirm-password"
            >
              Confirm password
            </label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={saving}
              minLength={8}
            />
          </div>

          <p className="auth-small auth-muted">Minimum 8 characters.</p>

          {error ? (
            <p role="alert" className="auth-body auth-error">
              {error}
            </p>
          ) : null}
          {success ? (
            <p role="status" className="auth-body auth-success">
              {success}
            </p>
          ) : null}

          <Button type="submit" className="w-full" disabled={saving}>
            {saving ? "Updating..." : "Update password"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
