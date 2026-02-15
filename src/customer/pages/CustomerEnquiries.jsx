import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import EmptyState from "../../components/ui/EmptyState";
import Skeleton from "../../components/ui/Skeleton";
import { Table, TBody, TD, TH, THead, TR } from "../../components/ui/Table";

async function authFetch(path, options = {}) {
  const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
  if (sessionErr) throw sessionErr;
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  const headers = { ...(options.headers || {}), Authorization: `Bearer ${token}` };
  return fetch(path, { ...options, headers });
}

function statusVariant(status) {
  const s = String(status || "").toLowerCase();
  if (s === "closed" || s === "declined") return "danger";
  if (s === "quoted" || s === "responded") return "brand";
  if (s === "new") return "warning";
  return "neutral";
}

export default function CustomerEnquiries() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const resp = await authFetch("/api/customer/enquiries");
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(json?.details || json?.error || "Failed to load enquiries");
        if (!mounted) return;
        setRows(Array.isArray(json?.rows) ? json.rows : []);
      } catch (err) {
        if (mounted) setError(err?.message || "Failed to load enquiries");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>My enquiries</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-600">Track all requests submitted from your account.</p>
          <Button as={Link} to="/request" variant="secondary">New enquiry</Button>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <CardContent className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        ) : error ? (
          <CardContent>
            <p className="text-sm text-rose-700">{error}</p>
          </CardContent>
        ) : rows.length === 0 ? (
          <CardContent>
            <EmptyState title="No enquiries yet" description="Create your first enquiry to start receiving supplier quotes." />
          </CardContent>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Venue</TH>
                  <TH>Guests</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Action</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((row) => (
                  <TR key={row.id}>
                    <TD>{row.eventDate || "-"}</TD>
                    <TD>{row.venueName || "-"}</TD>
                    <TD>{row.guestCount ?? "-"}</TD>
                    <TD><Badge variant={statusVariant(row.status)}>{row.status || "new"}</Badge></TD>
                    <TD className="text-right">
                      <Button as={Link} to={`/customer/enquiries/${row.id}`} size="sm" variant="secondary">
                        View
                      </Button>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
