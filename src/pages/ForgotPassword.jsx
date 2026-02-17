import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getResetPasswordUrl } from "../lib/siteUrl";
import AuthShell from "../components/auth/AuthShell";
import Input from "../components/ui/Input";
import Button from "../components/ui/Button";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!String(email || "").trim()) {
      setError("Enter your email.");
      return;
    }

    setLoading(true);
    try {
      // Supabase Dashboard -> Authentication -> URL Configuration must include /reset-password for prod + localhost.
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: getResetPasswordUrl(),
      });
      if (resetErr) throw resetErr;
      setSuccess("Check your email for a password reset link.");
    } catch (err) {
      setError(err?.message || "Failed to send reset email.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your account email and we’ll send a secure link to set a new password."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700" htmlFor="reset-email">
            Email
          </label>
          <Input
            id="reset-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            disabled={loading}
          />
        </div>

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}
        {success ? <p className="text-sm text-emerald-700">{success}</p> : null}

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Sending..." : "Send reset link"}
        </Button>

        <p className="text-sm text-slate-600">
          Back to{" "}
          <Link to="/login" className="text-teal-700 underline underline-offset-2">
            login
          </Link>
          .
        </p>
      </form>
    </AuthShell>
  );
}
