import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getAuthCallbackUrl } from "../lib/siteUrl";
import AuthShell from "./auth/AuthShell";
import Input from "./ui/Input";
import Button from "./ui/Button";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [sendingLink, setSendingLink] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [verificationMsg, setVerificationMsg] = useState("");
  const [verificationErr, setVerificationErr] = useState("");

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setOk("");
    setVerificationMsg("");
    setVerificationErr("");
    setNeedsVerification(false);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      if (String(error.message || "").toLowerCase().includes("email not confirmed")) {
        setNeedsVerification(true);
        return;
      }
      setErr(error.message);
    }
  }

  async function resendVerificationEmail() {
    setVerificationMsg("");
    setVerificationErr("");
    if (!email.trim()) {
      setVerificationErr("Enter your email first.");
      return;
    }
    setResendingVerification(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
    });
    if (error) {
      if (import.meta.env.DEV) {
        console.debug("[login] resend verification failed", {
          email: email.trim(),
          message: error.message,
          status: error.status || null,
        });
      }
      setVerificationErr(error.message || "Failed to resend verification email.");
    } else {
      if (import.meta.env.DEV) {
        console.debug("[login] resend verification success", {
          email: email.trim(),
        });
      }
      setVerificationMsg("Verification email sent. Please check your inbox.");
    }
    setResendingVerification(false);
  }

  async function sendMagicLink() {
    setErr("");
    setOk("");
    setNeedsVerification(false);
    setVerificationMsg("");
    setVerificationErr("");
    if (!email.trim()) {
      setErr("Enter your email first.");
      return;
    }

    setSendingLink(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: getAuthCallbackUrl(),
      },
    });

    if (error) setErr(error.message);
    else setOk("Magic link sent. Check your email.");
    setSendingLink(false);
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Admins can use password login. Suppliers, venue owners and customers can use a magic link."
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700" htmlFor="login-email">
            Email
          </label>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700" htmlFor="login-password">
            Password
          </label>
          <Input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="text-right">
          <Link to="/forgot-password" className="text-xs text-teal-700 underline underline-offset-2">
            Forgot password?
          </Link>
        </div>
        {err && <div className="text-sm text-rose-600">{err}</div>}
        {ok && <div className="text-sm text-emerald-700">{ok}</div>}
        {needsVerification ? (
          <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-amber-900">Please verify your email</p>
              <p className="mt-1 text-sm text-amber-800">
                We&apos;ve sent a verification email to {email || "your email address"}.
                Please check your inbox and spam folder before logging in.
              </p>
            </div>
            {verificationMsg ? <p className="text-sm text-emerald-700">{verificationMsg}</p> : null}
            {verificationErr ? <p className="text-sm text-rose-600">{verificationErr}</p> : null}
            <Button
              type="button"
              variant="secondary"
              onClick={resendVerificationEmail}
              disabled={resendingVerification}
            >
              {resendingVerification ? "Sending..." : "Resend verification email"}
            </Button>
          </div>
        ) : null}

        <Button type="submit" className="w-full">
          Sign in (password)
        </Button>

        <Button
          type="button"
          onClick={sendMagicLink}
          disabled={sendingLink}
          variant="ghost"
          className="w-full disabled:opacity-50"
        >
          {sendingLink ? "Sending magic link..." : "Send magic link"}
        </Button>
      </form>
    </AuthShell>
  );
}
