import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import PageHeader from "../../components/layout/PageHeader";
import Section from "../../components/layout/Section";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import { Card, CardContent } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Skeleton from "../../components/ui/Skeleton";
import { Table, TBody, TD, TH, THead, TR } from "../../components/ui/Table";

async function apiFetch(path, options = {}) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Not authenticated");

  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`,
  };

  const resp = await fetch(path, { ...options, headers });
  const json = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(json?.details || json?.error || "Request failed");
  return json;
}

function fmt(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

export default function SupplierApplicationsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [rows, setRows] = useState([]);
  const [notesById, setNotesById] = useState({});
  const [statusFilter, setStatusFilter] = useState("pending_review");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const json = await apiFetch(`/api/admin/suppliers/applications?status=${encodeURIComponent(statusFilter)}`);
      setRows(Array.isArray(json?.rows) ? json.rows : []);
    } catch (err) {
      setRows([]);
      setError(err?.message || "Failed to load supplier applications");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [statusFilter]);

  async function approve(supplierId) {
    if (!supplierId) return;
    setBusy(`approve:${supplierId}`);
    setError("");
    try {
      await apiFetch("/api/admin/suppliers/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId, adminNotes: notesById[supplierId] || null }),
      });
      await load();
    } catch (err) {
      setError(err?.message || "Failed to approve supplier");
    } finally {
      setBusy("");
    }
  }

  async function reject(supplierId) {
    if (!supplierId) return;
    setBusy(`reject:${supplierId}`);
    setError("");
    try {
      await apiFetch("/api/admin/suppliers/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId, adminNotes: notesById[supplierId] || null }),
      });
      await load();
    } catch (err) {
      setError(err?.message || "Failed to reject supplier");
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Supplier Applications" subtitle="Review pending supplier onboarding submissions." />

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <Section
        title="Applications"
        right={(
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm"
              aria-label="Filter applications by status"
            >
              <option value="pending_review">Pending review</option>
              <option value="profile_incomplete">Profile incomplete</option>
              <option value="awaiting_email_verification">Awaiting verification</option>
              <option value="rejected">Rejected</option>
              <option value="approved">Approved</option>
              <option value="all">All</option>
            </select>
            <Badge variant="neutral">{rows.length}</Badge>
          </div>
        )}
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
                <EmptyState title="No pending suppliers" description="New supplier applications will appear here." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <TR>
                      <TH>Business</TH>
                      <TH>Contact</TH>
                      <TH>Categories</TH>
                      <TH>Summary</TH>
                      <TH>Submitted</TH>
                      <TH>Admin notes</TH>
                      <TH>Actions</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {rows.map((row) => (
                      <TR key={row.id}>
                        <TD>
                          <div className="space-y-0.5">
                            <p className="font-medium text-slate-900">{row.business_name || "-"}</p>
                            <p className="text-xs text-slate-500">/{row.slug || "-"}</p>
                          </div>
                        </TD>
                        <TD>
                          <div className="space-y-0.5 text-xs text-slate-600">
                            <p>{row.public_email || "-"}</p>
                            <p>{row.public_phone || "-"}</p>
                            <p>{row.location_label || "-"}</p>
                          </div>
                        </TD>
                        <TD className="max-w-[220px]">
                          <div className="flex flex-wrap gap-1">
                            {(row.listing_categories || []).map((cat) => (
                              <Badge key={`${row.id}-${cat}`} variant="neutral">{cat}</Badge>
                            ))}
                          </div>
                        </TD>
                        <TD className="max-w-[260px] text-sm text-slate-700">{row.short_description || "-"}</TD>
                        <TD>{fmt(row.submitted_at)}</TD>
                        <TD className="min-w-[220px]">
                          <Input
                            value={notesById[row.id] ?? ""}
                            onChange={(e) => setNotesById((prev) => ({ ...prev, [row.id]: e.target.value }))}
                            placeholder="Optional internal note"
                          />
                        </TD>
                        <TD>
                          <div className="flex items-center gap-2">
                            {String(row.onboarding_status || "").toLowerCase() === "pending_review" ? (
                              <>
                                <Button
                                  size="sm"
                                  disabled={busy === `approve:${row.id}` || busy === `reject:${row.id}`}
                                  onClick={() => approve(row.id)}
                                >
                                  Publish
                                </Button>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  disabled={busy === `approve:${row.id}` || busy === `reject:${row.id}`}
                                  onClick={() => reject(row.id)}
                                >
                                  Reject
                                </Button>
                              </>
                            ) : (
                              <span className="text-xs text-slate-500">No action</span>
                            )}
                          </div>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </Section>
    </div>
  );
}
