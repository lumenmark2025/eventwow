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

  async function onSubmit(e) {
    e.preventDefault();
    setErr("");
    setOk("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setErr(error.message);
  }

  async function sendMagicLink() {
    setErr("");
    setOk("");
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
