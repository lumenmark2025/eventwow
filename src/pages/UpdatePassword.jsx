import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import Input from "../components/ui/Input";
import Button from "../components/ui/Button";

export default function UpdatePassword() {
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

        // Allow client to process implicit/hash-based auth tokens if present.
        await new Promise((r) => setTimeout(r, 150));
        const { data, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr) throw sessionErr;

        if (!data?.session) {
          throw new Error("Reset link is invalid or expired. Request a new reset email.");
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
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-md">
        <Card>
          <CardHeader>
            <CardTitle>Update password</CardTitle>
            <CardDescription>Set a new password for your account.</CardDescription>
          </CardHeader>
          <CardContent>
            {loadingSession ? (
              <p className="text-sm text-slate-600">Verifying reset link...</p>
            ) : !ready ? (
              <div className="space-y-3">
                <p className="text-sm text-rose-600">{error || "Reset link is invalid or expired."}</p>
                <Link to="/reset-password" className="text-sm text-teal-700 underline underline-offset-2">
                  Request a new reset link
                </Link>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700" htmlFor="new-password">New password</label>
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
                  <label className="text-sm font-medium text-slate-700" htmlFor="confirm-password">Confirm password</label>
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

                <p className="text-xs text-slate-500">Minimum 8 characters.</p>

                {error ? <p className="text-sm text-rose-600">{error}</p> : null}
                {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

                <Button type="submit" className="w-full" disabled={saving}>
                  {saving ? "Updating..." : "Update password"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

