import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function SupplierDashboard({ supplier }) {
  const supplierId = supplier?.id;
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [stats, setStats] = useState({
    invitedCount: 0,
    activeEnquiriesCount: 0,
    quotesSentCount: 0,
    acceptedCount: 0,
    upcomingBookingsCount: 0,
  });

  useEffect(() => {
    if (!supplierId) return;

    (async () => {
      setLoading(true);
      setErr("");

      try {
        const today = new Date().toISOString().slice(0, 10);

        // Enquiries attached to supplier (via invite link)
        const { count: linkCount, error: linkErr } = await supabase
          .from("enquiry_suppliers")
          .select("id", { count: "exact", head: true })
          .eq("supplier_id", supplierId);
        if (linkErr) throw linkErr;

        // Active (not declined) invites
        const { count: activeCount, error: activeErr } = await supabase
          .from("enquiry_suppliers")
          .select("id", { count: "exact", head: true })
          .eq("supplier_id", supplierId)
          .not("supplier_status", "in", "(declined)");
        if (activeErr) throw activeErr;

        const { count: quotesSent, error: qErr } = await supabase
          .from("quotes")
          .select("id", { count: "exact", head: true })
          .eq("supplier_id", supplierId)
          .in("status", ["sent", "accepted", "declined"]);
        if (qErr) throw qErr;

        const { count: accepted, error: aErr } = await supabase
          .from("quotes")
          .select("id", { count: "exact", head: true })
          .eq("supplier_id", supplierId)
          .eq("status", "accepted");
        if (aErr) throw aErr;

        const { count: upcomingBookings, error: bErr } = await supabase
          .from("off_platform_bookings")
          .select("id", { count: "exact", head: true })
          .eq("supplier_id", supplierId)
          .gte("event_date", today)
          .in("status", ["tentative", "confirmed"]);
        if (bErr) throw bErr;

        setStats({
          invitedCount: linkCount || 0,
          activeEnquiriesCount: activeCount || 0,
          quotesSentCount: quotesSent || 0,
          acceptedCount: accepted || 0,
          upcomingBookingsCount: upcomingBookings || 0,
        });
      } catch (ex) {
        setErr(ex?.message || "Failed to load dashboard.");
      } finally {
        setLoading(false);
      }
    })();
  }, [supplierId]);

  if (loading) return <div className="text-sm text-gray-600">Loading dashboard…</div>;
  if (err) return <div className="text-sm text-red-600">{err}</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div className="rounded-2xl border bg-white p-5">
        <div className="text-sm text-gray-600">Enquiries</div>
        <div className="text-2xl font-semibold">{stats.activeEnquiriesCount}</div>
        <div className="text-xs text-gray-500">Linked enquiries: {stats.invitedCount}</div>
      </div>

      <div className="rounded-2xl border bg-white p-5">
        <div className="text-sm text-gray-600">Quotes sent</div>
        <div className="text-2xl font-semibold">{stats.quotesSentCount}</div>
        <div className="text-xs text-gray-500">Accepted: {stats.acceptedCount}</div>
      </div>

      <div className="rounded-2xl border bg-white p-5">
        <div className="text-sm text-gray-600">Upcoming bookings</div>
        <div className="text-2xl font-semibold">{stats.upcomingBookingsCount}</div>
        <div className="text-xs text-gray-500">Tentative + Confirmed (off-platform)</div>
      </div>

      <div className="md:col-span-3 rounded-2xl border bg-gray-50 p-5">
        <div className="font-medium">Next steps</div>
        <ul className="text-sm text-gray-700 list-disc pl-5 mt-2 space-y-1">
          <li>This is the minimal supplier dashboard (read-only).</li>
          <li>Next upgrade is supplier quote drafting/sending from here (after RLS tightening).</li>
          <li>Bookings logging can also move supplier-side once insert RLS is ready.</li>
        </ul>
      </div>
    </div>
  );
}
