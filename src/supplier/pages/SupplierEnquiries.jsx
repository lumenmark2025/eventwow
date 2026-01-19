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

export default function SupplierEnquiries({ supplierId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [selected, setSelected] = useState(null);

  async function load() {
    if (!supplierId) return;
    setLoading(true);
    setErr("");

    const { data, error } = await supabase
      .from("enquiry_suppliers")
      .select(
        "id,supplier_status,created_at,enquiry_id,enquiries(id,status,event_date,event_postcode,guest_count,budget_min_gbp,budget_max_gbp,notes,venues(name),customers(full_name,email,phone))"
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

  if (loading) return <div className="text-sm text-gray-600">Loading enquiries…</div>;
  if (err) return <div className="text-sm text-red-600">{err}</div>;

  const selectedRow = selected ? rows.find((r) => r.id === selected) : null;
  const e = selectedRow?.enquiries;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="rounded-2xl border bg-white p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Enquiries</h2>
          <button onClick={load} className="border rounded-lg px-3 py-2 bg-white text-sm">
            Refresh
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="text-sm text-gray-600">No enquiries linked to your account yet.</div>
        ) : (
          <div className="space-y-2 max-h-[560px] overflow-auto">
            {rows.map((r) => (
              <button
                key={r.id}
                onClick={() => setSelected(r.id)}
                className={
                  "w-full text-left rounded-xl border p-3 hover:bg-gray-50 " +
                  (selected === r.id ? "border-black" : "")
                }
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">
                    {r.enquiries?.venues?.name || "No venue"} · {fmtDate(r.enquiries?.event_date)}
                  </div>
                  <div className="text-xs text-gray-600">invite: {r.supplier_status}</div>
                </div>
                <div className="text-sm text-gray-600">
                  {r.enquiries?.event_postcode || ""}
                  {r.enquiries?.guest_count ? ` · ${r.enquiries.guest_count} guests` : ""}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border bg-white p-5">
        {!selectedRow ? (
          <div className="text-sm text-gray-600">Select an enquiry to view details.</div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="text-sm text-gray-600">Venue</div>
              <div className="text-lg font-semibold">{e?.venues?.name || "No venue"}</div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-xl bg-gray-50 border p-3">
                <div className="text-xs text-gray-600">Event date</div>
                <div className="font-medium">{fmtDate(e?.event_date)}</div>
              </div>
              <div className="rounded-xl bg-gray-50 border p-3">
                <div className="text-xs text-gray-600">Postcode</div>
                <div className="font-medium">{e?.event_postcode || "—"}</div>
              </div>
              <div className="rounded-xl bg-gray-50 border p-3">
                <div className="text-xs text-gray-600">Guests</div>
                <div className="font-medium">{e?.guest_count ?? "—"}</div>
              </div>
              <div className="rounded-xl bg-gray-50 border p-3">
                <div className="text-xs text-gray-600">Enquiry status</div>
                <div className="font-medium">{e?.status || "—"}</div>
              </div>
            </div>

            <div className="rounded-xl bg-gray-50 border p-3">
              <div className="text-xs text-gray-600">Budget</div>
              <div className="font-medium">
                £{Number(e?.budget_min_gbp || 0).toFixed(0)} – £{Number(e?.budget_max_gbp || 0).toFixed(0)}
              </div>
            </div>

            <div className="rounded-xl bg-gray-50 border p-3">
              <div className="text-xs text-gray-600">Customer</div>
              <div className="font-medium">{e?.customers?.full_name || "—"}</div>
              <div className="text-sm text-gray-600">{e?.customers?.email || ""}</div>
              <div className="text-sm text-gray-600">{e?.customers?.phone || ""}</div>
            </div>

            {e?.notes ? (
              <div className="rounded-xl bg-gray-50 border p-3">
                <div className="text-xs text-gray-600">Notes</div>
                <div className="text-sm">{e.notes}</div>
              </div>
            ) : null}

            <div className="text-xs text-gray-500">
              Supplier invite status: {selectedRow.supplier_status}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
