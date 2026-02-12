import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import PageHeader from "../../components/layout/PageHeader";
import Section from "../../components/layout/Section";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardContent } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import Skeleton from "../../components/ui/Skeleton";
import { Table, TBody, TD, TH, THead, TR } from "../../components/ui/Table";

async function authGet(url) {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr) throw sessionErr;
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json?.details || json?.error || "Request failed");
  return json;
}

function toCsv(rows) {
  const header = ["created_at", "supplier_name", "delta", "balance_after", "reason", "note", "related_type", "related_id"];
  const lines = rows.map((r) =>
    [
      r.created_at,
      r?.supplier?.business_name || "",
      r.delta,
      r.balance_after,
      r.reason,
      r.note || "",
      r.related_type || "",
      r.related_id || "",
    ]
      .map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`)
      .join(",")
  );
  return [header.join(","), ...lines].join("\n");
}

export default function CreditsLedgerPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedRow, setSelectedRow] = useState(null);

  const [supplierId, setSupplierId] = useState("");
  const [reason, setReason] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const query = useMemo(() => {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    params.set("offset", String(offset));
    if (supplierId.trim()) params.set("supplierId", supplierId.trim());
    if (reason.trim()) params.set("reason", reason.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    return params.toString();
  }, [supplierId, reason, from, to, offset]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const json = await authGet(`/api/admin-credits-ledger?${query}`);
      setRows(json?.rows || []);
      setTotalCount(Number(json?.totalCount || 0));
    } catch (e) {
      setError(e?.message || "Failed to load ledger");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [query]);

  function exportCsv() {
    const csv = toCsv(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "credits-ledger.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  const hasPrev = offset > 0;
  const hasNext = offset + rows.length < totalCount;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Credits Ledger"
        subtitle="Append-only audit trail of credit balance changes."
        actions={[{ key: "export", label: "Export CSV", variant: "secondary", onClick: exportCsv, disabled: rows.length === 0 }]}
      />

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <Section title="Filters">
        <Card>
          <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Input value={supplierId} onChange={(e) => setSupplierId(e.target.value)} placeholder="Supplier ID (uuid)" />
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (e.g. quote_send)" />
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </CardContent>
        </Card>
      </Section>

      <Section
        title="Entries"
        right={<p className="text-xs text-slate-500">{totalCount} total</p>}
      >
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-3 p-5">
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
                <Skeleton className="h-6 w-full" />
              </div>
            ) : rows.length === 0 ? (
              <div className="p-5">
                <EmptyState title="No ledger entries found" description="Try widening your filter window." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <TR>
                      <TH>Timestamp</TH>
                      <TH>Supplier</TH>
                      <TH>Delta</TH>
                      <TH>Balance After</TH>
                      <TH>Reason</TH>
                      <TH>Related</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {rows.map((row) => (
                      <TR key={row.id} interactive onClick={() => setSelectedRow(row)} className="cursor-pointer">
                        <TD className="whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</TD>
                        <TD>{row?.supplier?.business_name || row.supplier_id}</TD>
                        <TD>
                          <Badge variant={Number(row.delta) >= 0 ? "success" : "danger"}>
                            {Number(row.delta) > 0 ? `+${row.delta}` : row.delta}
                          </Badge>
                        </TD>
                        <TD>{row.balance_after}</TD>
                        <TD>{row.reason}</TD>
                        <TD>{row.related_type && row.related_id ? `${row.related_type}:${String(row.related_id).slice(0, 8)}...` : "-"}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={() => setOffset((v) => Math.max(0, v - limit))} disabled={!hasPrev}>
            Previous
          </Button>
          <Button variant="secondary" onClick={() => setOffset((v) => v + limit)} disabled={!hasNext}>
            Next
          </Button>
        </div>
      </Section>

      <Modal open={!!selectedRow} onClose={() => setSelectedRow(null)} title="Ledger Entry">
        {selectedRow ? (
          <div className="space-y-2 text-sm">
            <p><span className="font-medium">ID:</span> {selectedRow.id}</p>
            <p><span className="font-medium">Supplier:</span> {selectedRow?.supplier?.business_name || selectedRow.supplier_id}</p>
            <p><span className="font-medium">Delta:</span> {selectedRow.delta}</p>
            <p><span className="font-medium">Balance after:</span> {selectedRow.balance_after}</p>
            <p><span className="font-medium">Reason:</span> {selectedRow.reason}</p>
            <p><span className="font-medium">Note:</span> {selectedRow.note || "-"}</p>
            <p><span className="font-medium">Related:</span> {selectedRow.related_type || "-"} {selectedRow.related_id || ""}</p>
            <p><span className="font-medium">Created by:</span> {selectedRow.created_by_user || "-"}</p>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
