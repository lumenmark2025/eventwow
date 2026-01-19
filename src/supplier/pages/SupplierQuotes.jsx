import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

function fmtDateTime(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleString();
  } catch {
    return d;
  }
}

export default function SupplierQuotes({ supplierId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  async function load() {
    if (!supplierId) return;
    setLoading(true);
    setErr("");

    const { data, error } = await supabase
      .from("quotes")
      .select(
        "id,status,total_amount,currency_code,enquiry_id,created_at,sent_at,accepted_at,declined_at,enquiries(event_date,event_postcode,venues(name))"
      )
      .eq("supplier_id", supplierId)
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

  if (loading) return <div className="text-sm text-gray-600">Loading quotes…</div>;
  if (err) return <div className="text-sm text-red-600">{err}</div>;

  return (
    <div className="rounded-2xl border bg-white p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Quotes</h2>
        <button onClick={load} className="border rounded-lg px-3 py-2 bg-white text-sm">
          Refresh
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="text-sm text-gray-600">No quotes yet.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((q) => (
            <div key={q.id} className="rounded-xl border p-3 bg-gray-50">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="font-medium">
                  {q.enquiries?.venues?.name || "No venue"} · {q.enquiries?.event_date || "—"}
                </div>
                <div className="text-sm">status: {q.status}</div>
              </div>

              <div className="text-sm text-gray-600">
                {q.enquiries?.event_postcode || ""}
                {q.total_amount !== null && q.total_amount !== undefined
                  ? ` · total: £${Number(q.total_amount || 0).toFixed(2)}`
                  : ""}
              </div>

              <div className="text-xs text-gray-500 mt-1">
                Created: {fmtDateTime(q.created_at)}
                {q.sent_at ? ` · Sent: ${fmtDateTime(q.sent_at)}` : ""}
                {q.accepted_at ? ` · Accepted: ${fmtDateTime(q.accepted_at)}` : ""}
                {q.declined_at ? ` · Declined: ${fmtDateTime(q.declined_at)}` : ""}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-xs text-gray-500">
        Read-only v1. Quote editing/sending will move supplier-side after RLS tightening.
      </div>
    </div>
  );
}
