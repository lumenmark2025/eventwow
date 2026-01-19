import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

function fmtDate(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

export default function SupplierBookings({ supplierId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    if (!supplierId) return;
    setLoading(true);
    setErr("");

    const { data, error } = await supabase
      .from("off_platform_bookings")
      .select("id,event_date,event_postcode,source,status,value_gbp,customer_name,created_at,notes")
      .eq("supplier_id", supplierId)
      .order("event_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) setErr(error.message);
    setRows(data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplierId]);

  if (loading) return <div className="text-sm text-gray-600">Loading bookings…</div>;
  if (err) return <div className="text-sm text-red-600">{err}</div>;

  return (
    <div className="rounded-2xl border bg-white p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Bookings (off-platform)</h2>
        <button onClick={load} className="border rounded-lg px-3 py-2 bg-white text-sm">
          Refresh
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="text-sm text-gray-600">No bookings logged yet.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((b) => (
            <div key={b.id} className="rounded-xl border p-3 bg-gray-50">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="font-medium">{fmtDate(b.event_date)}</div>
                <div className="text-sm">{b.status}</div>
              </div>
              <div className="text-sm text-gray-600">
                {b.event_postcode || ""}
                {b.value_gbp !== null && b.value_gbp !== undefined ? ` · £${Number(b.value_gbp || 0).toFixed(0)}` : ""}
                {b.source ? ` · ${b.source}` : ""}
              </div>
              {b.customer_name ? <div className="text-sm">Customer: {b.customer_name}</div> : null}
              {b.notes ? <div className="text-sm text-gray-700 mt-1">Notes: {b.notes}</div> : null}
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-gray-500">
        Read-only v1. Supplier-side booking logging can be enabled once insert RLS is defined.
      </div>
    </div>
  );
}
