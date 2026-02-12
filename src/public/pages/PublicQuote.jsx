import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n.toFixed(2) : "0.00";
}

function fmtDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export default function PublicQuote() {
  const { token } = useParams();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [data, setData] = useState(null);

  async function loadQuote() {
    setLoading(true);
    setErr("");
    setOk("");

    try {
      const resp = await fetch(`/api/public-quote?token=${encodeURIComponent(token || "")}`);
      const json = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        if (resp.status === 404) throw new Error("Quote not found");
        throw new Error(json?.details || json?.error || "Failed to load quote");
      }

      setData(json);
    } catch (e) {
      setData(null);
      setErr(e?.message || "Failed to load quote");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadQuote();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const canDecide = useMemo(() => {
    const status = String(data?.quote?.status || "").toLowerCase();
    return status === "sent";
  }, [data?.quote?.status]);

  async function submitAction(action) {
    if (!token || !canDecide || saving) return;

    setSaving(true);
    setErr("");
    setOk("");

    try {
      const resp = await fetch("/api/public-quote-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action }),
      });

      const json = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        if (resp.status === 404) throw new Error("Quote not found");
        if (resp.status === 409) throw new Error(json?.details || json?.error || "Quote action blocked");
        throw new Error(json?.details || json?.error || "Failed to update quote");
      }

      setData((prev) => ({ ...(prev || {}), quote: json.quote || prev?.quote }));
      setOk(action === "accept" ? "Quote accepted." : "Quote declined.");
    } catch (e) {
      setErr(e?.message || "Failed to update quote");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-sm text-gray-600">Loading quote...</div>;
  }

  if (err && !data) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-2xl mx-auto rounded-2xl border bg-white p-6">
          <h1 className="text-xl font-semibold">Customer Quote</h1>
          <p className="mt-3 text-red-600 text-sm">{err}</p>
        </div>
      </div>
    );
  }

  const quote = data?.quote;
  const items = data?.items || [];

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-3xl mx-auto rounded-2xl border bg-white p-6 space-y-4">
        <div>
          <h1 className="text-xl font-semibold">Customer Quote</h1>
          <div className="text-sm text-gray-600 mt-1">Supplier: {data?.supplier?.display_name || "Supplier"}</div>
          <div className="text-sm text-gray-600">Venue: {data?.event?.venue_name || "-"}</div>
          <div className="text-sm text-gray-600">Event date: {data?.event?.event_date || "-"}</div>
          <div className="text-sm text-gray-600">Postcode: {data?.event?.event_postcode || "-"}</div>
        </div>

        <div className="rounded-xl border p-4 bg-gray-50">
          <div className="text-sm">Status: <span className="font-medium">{quote?.status || "-"}</span></div>
          <div className="text-sm text-gray-600">Sent: {fmtDate(quote?.sent_at)}</div>
          {quote?.accepted_at ? <div className="text-sm text-green-700">Accepted: {fmtDate(quote.accepted_at)}</div> : null}
          {quote?.declined_at ? <div className="text-sm text-red-700">Declined: {fmtDate(quote.declined_at)}</div> : null}
        </div>

        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-3">Item</th>
                <th className="text-right p-3">Qty</th>
                <th className="text-right p-3">Unit</th>
                <th className="text-right p-3">Line total</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td className="p-3 text-gray-600" colSpan={4}>No quote items found.</td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr key={it.id} className="border-t">
                    <td className="p-3">{it.title || "Item"}</td>
                    <td className="p-3 text-right">{Number(it.qty ?? 0)}</td>
                    <td className="p-3 text-right">GBP {money(it.unit_price)}</td>
                    <td className="p-3 text-right">GBP {money(Number(it.qty || 0) * Number(it.unit_price || 0))}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="text-right text-lg font-semibold">Total: GBP {money(quote?.total_amount)}</div>

        {ok ? <div className="text-sm text-green-700">{ok}</div> : null}
        {err ? <div className="text-sm text-red-600">{err}</div> : null}

        <div className="flex gap-2">
          <button
            type="button"
            className="px-4 py-2 rounded-lg bg-green-700 text-white disabled:opacity-50"
            onClick={() => submitAction("accept")}
            disabled={!canDecide || saving}
          >
            {saving ? "Working..." : "Accept"}
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-lg border bg-white disabled:opacity-50"
            onClick={() => submitAction("decline")}
            disabled={!canDecide || saving}
          >
            {saving ? "Working..." : "Decline"}
          </button>
        </div>
      </div>
    </div>
  );
}
