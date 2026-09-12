import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import PageHeader from "../../components/layout/PageHeader";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  CardTitle,
} from "../../components/workspace/AdminPrimitives";
import {
  DataTable,
  FilterBar,
} from "../../components/workspace/WorkspaceComponents";

async function authFetch(path, options = {}) {
  const { data: sessionData, error: sessionErr } =
    await supabase.auth.getSession();
  if (sessionErr) throw sessionErr;
  const token = sessionData?.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  const headers = {
    ...(options.headers || {}),
    Authorization: `Bearer ${token}`,
  };
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
  const [retry, setRetry] = useState(0);
  const [search, setSearch] = useState("");
  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter((row) =>
      `${row.venueName || ""} ${row.eventDate || ""} ${row.status || ""}`
        .toLowerCase()
        .includes(query),
    );
  }, [rows, search]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const resp = await authFetch("/api/customer/enquiries");
        const json = await resp.json().catch(() => ({}));
        if (!resp.ok)
          throw new Error(
            json?.details || json?.error || "Failed to load enquiries",
          );
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
  }, [retry]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="My enquiries"
        subtitle="Track your event requests and review supplier responses."
        actions={[
          { key: "new", label: "New enquiry", as: Link, to: "/request" },
        ]}
      />
      <Card>
        <CardHeader>
          <CardTitle>Your requests</CardTitle>
        </CardHeader>
        {!loading && !error && rows.length > 0 && (
          <FilterBar
            search={search}
            onSearchChange={setSearch}
            placeholder="Search venue, date or status"
            count={visibleRows.length}
          />
        )}
        <DataTable
          className="ew-admin-table"
          caption="Your latest enquiries (up to 200)"
          loading={loading}
          error={error}
          onRetry={() => setRetry((value) => value + 1)}
          rows={visibleRows}
          emptyTitle={
            rows.length ? "No matching enquiries" : "No enquiries yet"
          }
          emptyDescription={
            rows.length
              ? "Try another venue, date or status."
              : "Create your first enquiry to start receiving supplier quotes."
          }
          columns={[
            {
              key: "eventDate",
              label: "Event date",
              render: (row) => row.eventDate || "Not provided",
            },
            {
              key: "venueName",
              label: "Venue / location",
              render: (row) => row.venueName || "Not provided",
            },
            {
              key: "guestCount",
              label: "Guests",
              render: (row) => row.guestCount ?? "Not provided",
            },
            {
              key: "status",
              label: "Status",
              render: (row) => (
                <Badge variant={statusVariant(row.status)}>
                  {row.status || "new"}
                </Badge>
              ),
            },
            {
              key: "action",
              label: "Details",
              render: (row) => (
                <Button
                  as={Link}
                  to={`/customer/enquiries/${row.id}`}
                  variant="secondary"
                  size="sm"
                >
                  View
                  <span className="sr-only">
                    {" "}
                    enquiry for {row.venueName || row.eventDate || "your event"}
                  </span>
                </Button>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
