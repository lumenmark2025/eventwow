import { useState } from "react";
import { supabase } from "../lib/supabase";
import { getAuthCallbackUrl } from "../lib/siteUrl";

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
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl border bg-white p-6 space-y-4">
        <h1 className="text-xl font-semibold">Eventwow</h1>
        <p className="text-sm text-gray-600">Admins can use password login. Suppliers can use a magic link.</p>
        <div className="space-y-2">
          <label className="text-sm">Email</label>
          <input className="w-full border rounded-lg px-3 py-2" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <label className="text-sm">Password</label>
          <input type="password" className="w-full border rounded-lg px-3 py-2" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {err && <div className="text-sm text-red-600">{err}</div>}
        {ok && <div className="text-sm text-green-700">{ok}</div>}

        <button className="w-full rounded-lg bg-black text-white py-2">Sign in (password)</button>

        <button
          type="button"
          onClick={sendMagicLink}
          disabled={sendingLink}
          className="w-full rounded-lg border bg-white py-2 disabled:opacity-50"
        >
          {sendingLink ? "Sending magic link..." : "Send magic link"}
        </button>
      </form>
    </div>
  );
}
