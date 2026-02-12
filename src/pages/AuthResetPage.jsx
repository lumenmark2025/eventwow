import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function AuthResetPage() {
  const navigate = useNavigate();
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function resolveRecoverySession() {
      try {
        await supabase.auth.getSession();
        if (!cancelled) navigate("/", { replace: true });
      } catch (err) {
        if (!cancelled) setError(err?.message || "Failed to verify reset link.");
      }
    }

    resolveRecoverySession();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 space-y-2">
        <h1 className="text-xl font-semibold">Verifying reset link</h1>
        {error ? <p className="text-sm text-red-600">{error}</p> : <p className="text-sm text-gray-600">Please wait...</p>}
      </div>
    </div>
  );
}

