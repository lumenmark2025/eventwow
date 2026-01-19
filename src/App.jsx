import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";

import Login from "./components/Login";
import AdminLayout from "./admin/layout/AdminLayout";
import SupplierLayout from "./supplier/layout/SupplierLayout";

export default function App() {
  const [session, setSession] = useState(null);
  const [authState, setAuthState] = useState({ loading: true, role: null, supplier: null });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession));
    return () => listener.subscription.unsubscribe();
  }, []);

  const user = session?.user;

  useEffect(() => {
    async function resolveRole() {
      if (!user) {
        setAuthState({ loading: false, role: null, supplier: null });
        return;
      }

      setAuthState((s) => ({ ...s, loading: true }));

      // 1) Admin check (existing behaviour)
      const { data: roleRow, error: roleErr } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!roleErr && roleRow?.role === "admin") {
        setAuthState({ loading: false, role: "admin", supplier: null });
        return;
      }

      // 2) Supplier check (new): suppliers.auth_user_id -> auth.users.id
      const { data: supplierRow, error: supplierErr } = await supabase
        .from("suppliers")
        .select("id,business_name,credits_balance,is_published")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (!supplierErr && supplierRow?.id) {
        setAuthState({ loading: false, role: "supplier", supplier: supplierRow });
        return;
      }

      setAuthState({ loading: false, role: "none", supplier: null });
    }

    resolveRole();
  }, [user?.id]);

  async function signOut() {
    await supabase.auth.signOut();
  }

  if (!user) return <Login />;

  if (authState.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">Checking access…</div>
    );
  }

  if (authState.role === "admin") {
    return <AdminLayout user={user} onSignOut={signOut} />;
  }

  if (authState.role === "supplier") {
    return <SupplierLayout user={user} supplier={authState.supplier} onSignOut={signOut} />;
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 space-y-2">
        <h1 className="text-xl font-semibold">Access denied</h1>
        <p className="text-sm text-gray-600">
          Your user is not recognised as an admin (public.user_roles) or a supplier (public.suppliers.auth_user_id).
        </p>
        <button onClick={signOut} className="border rounded-lg px-3 py-2 bg-white">
          Sign out
        </button>
      </div>
    </div>
  );
}
