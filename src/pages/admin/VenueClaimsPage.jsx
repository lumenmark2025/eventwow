import { FormField, Select, Feedback, Section, Badge, Button, Card, CardContent, EmptyState, Skeleton, Table, TBody, TD, TH, THead, TR } from "../../components/workspace/AdminPrimitives";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import PageHeader from "../../components/layout/PageHeader";

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

function fmtDate(value) {
  if (!value) return "-";
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

function statusBadgeVariant(status) {
  const s = String(status || "").toLowerCase();
  if (s === "approved") return "success";
  if (s === "rejected" || s === "expired") return "danger";
  return "warning";
}

export default function VenueClaimsPage() {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [statusFilter, setStatusFilter] = useState("pending");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const json = await apiFetch(`/api/admin/venue-claims?status=${encodeURIComponent(statusFilter)}`);
      setRows(Array.isArray(json?.rows) ? json.rows : []);
    } catch (err) {
      setRows([]);
      setError(err?.message || "Failed to load claim requests");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function act(claimId, action) {
    if (!claimId) return;
    setBusy(`${action}:${claimId}`);
    setError("");
    try {
      await apiFetch(`/api/admin/venue-claims/${encodeURIComponent(claimId)}/${action}`, {
        method: "POST",
      });
      await load();
    } catch (err) {
      setError(err?.message || `Failed to ${action} claim`);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="ew-page-stack">
      <PageHeader title="Venue claims" subtitle="Review and approve venue ownership requests." />

      {error ? <Feedback tone="danger" onRetry={load}>{error}</Feedback> : null}

      <Section
        title="Claim requests"
        right={(
          <div className="flex flex-wrap items-center gap-2">
            <FormField label="Filter claim status"><Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-sm"
              aria-label="Filter claim status"
            >
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="expired">Expired</option>
              <option value="all">All</option>
            </Select></FormField>
            <span className="ew-result-count">{loading || error ? "—" : rows.length} records</span>
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
            ) : error ? null : rows.length === 0 ? (
              <div className="p-5">
                <EmptyState title="No claims found" description="New venue claim requests will appear here." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <TR>
                      <TH>Venue</TH>
                      <TH>Requester</TH>
                      <TH>Role</TH>
                      <TH>Message</TH>
                      <TH>Status</TH>
                      <TH>Created</TH>
                      <TH>Actions</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {rows.map((row) => (
                      <TR key={row.id}>
                        <TD>
                          <div className="gap-1">
                            <p className="font-medium text-slate-900">{row.venue_name || "Venue"}</p>
                            {row.venue_slug ? <p className="text-xs ew-muted">/{row.venue_slug}</p> : null}
                          </div>
                        </TD>
                        <TD>
                          <div className="gap-1">
                            <p className="font-medium text-slate-900">{row.requester_name || "-"}</p>
                            <p className="text-xs ew-muted">{row.requester_email || "-"}</p>
                          </div>
                        </TD>
                        <TD>{row.role_at_venue || "-"}</TD>
                        <TD className="min-w-0">{row.message || "-"}</TD>
                        <TD>
                          <Badge variant={statusBadgeVariant(row.status)}>{row.status}</Badge>
                        </TD>
                        <TD>{fmtDate(row.created_at)}</TD>
                        <TD>
                          {row.status === "pending" ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                size="sm"
                                disabled={busy === `approve:${row.id}` || busy === `reject:${row.id}`}
                                onClick={() => act(row.id, "approve")}
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="danger"
                                disabled={busy === `approve:${row.id}` || busy === `reject:${row.id}`}
                                onClick={() => act(row.id, "reject")}
                              >
                                Reject
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs ew-muted">-</span>
                          )}
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

