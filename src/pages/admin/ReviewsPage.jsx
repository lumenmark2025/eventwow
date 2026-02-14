import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import PageHeader from "../../components/layout/PageHeader";
import Section from "../../components/layout/Section";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
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

function snippet(text, maxLen = 120) {
  const raw = String(text || "").trim();
  if (!raw) return "-";
  if (raw.length <= maxLen) return raw;
  return `${raw.slice(0, maxLen)}...`;
}

export default function ReviewsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [busyId, setBusyId] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const json = await apiFetch("/api/admin/reviews?status=pending&limit=250");
      setRows(Array.isArray(json?.rows) ? json.rows : []);
    } catch (err) {
      setRows([]);
      setError(err?.message || "Failed to load reviews");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function moderate(reviewId, action) {
    setBusyId(`${action}:${reviewId}`);
    setError("");
    try {
      await apiFetch(`/api/admin/reviews/${encodeURIComponent(reviewId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setRows((prev) => prev.filter((row) => row.id !== reviewId));
    } catch (err) {
      setError(err?.message || "Failed to update review");
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Reviews" subtitle="Moderate supplier reviews before public display." />

      {error ? <p className="text-sm text-rose-600">{error}</p> : null}

      <Section title="Pending reviews" right={<Badge variant="neutral">{rows.length} pending</Badge>}>
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
                <EmptyState title="No pending reviews" description="New submissions will appear here for moderation." />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <THead>
                    <TR>
                      <TH>Supplier</TH>
                      <TH>Rating</TH>
                      <TH>Reviewer</TH>
                      <TH>Review</TH>
                      <TH>Actions</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {rows.map((row) => (
                      <TR key={row.id}>
                        <TD>{row.supplierName || "Supplier"}</TD>
                        <TD>
                          <Badge variant="brand">{row.rating}/5</Badge>
                        </TD>
                        <TD>{row.reviewerName || "Anonymous"}</TD>
                        <TD className="max-w-[360px]">{snippet(row.reviewText)}</TD>
                        <TD>
                          <div className="flex items-center gap-2">
                            <Button
                              onClick={() => moderate(row.id, "approve")}
                              disabled={busyId === `approve:${row.id}` || busyId === `reject:${row.id}`}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="secondary"
                              onClick={() => moderate(row.id, "reject")}
                              disabled={busyId === `approve:${row.id}` || busyId === `reject:${row.id}`}
                            >
                              Reject
                            </Button>
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
