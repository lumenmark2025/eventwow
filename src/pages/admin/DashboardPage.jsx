import { useEffect, useState } from "react";
import {
  Store,
  Send,
  CreditCard,
  ChartNoAxesCombined,
  Inbox,
  Building2,
  Tags,
} from "lucide-react";
import { supabase } from "../../lib/supabase";
import {
  WorkspacePageHeader,
  MetricCard,
  DataTable,
  DashboardCard,
  ActivityList,
  QuickActions,
  ErrorState,
} from "../../components/workspace/WorkspaceComponents";

const endpoints = [
  "/api/admin-quote-funnel",
  "/api/admin-supplier-metrics",
  "/api/admin-credits-ledger?limit=8&offset=0",
];
const percent = (value) =>
  value == null ? "—" : `${(Number(value) * 100).toFixed(1)}%`;

export default function AdminDashboardPage() {
  const [state, setState] = useState({
    pending: endpoints.map(() => true),
    data: [],
    errors: [],
  });
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        // All requests in this refresh share one session lookup; no cross-user cache.
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        const token = data?.session?.access_token;
        if (!token) throw new Error("Not authenticated");
        await Promise.all(
          endpoints.map(async (url, index) => {
            let value = null;
            let message = "";
            try {
              const response = await fetch(url, {
                headers: { Authorization: `Bearer ${token}` },
                signal: controller.signal,
              });
              const json = await response.json();
              if (!response.ok)
                throw new Error(
                  json?.details || json?.error || "Request failed",
                );
              value = json;
            } catch (error) {
              message = error.message;
            }
            if (!controller.signal.aborted)
              setState((previous) => {
                const data = [...previous.data];
                const errors = [...previous.errors];
                const pending = [...previous.pending];
                data[index] = value;
                errors[index] = message;
                pending[index] = false;
                return { data, errors, pending };
              });
          }),
        );
      } catch (error) {
        if (!controller.signal.aborted)
          setState({
            pending: endpoints.map(() => false),
            data: [],
            errors: endpoints.map(() => error.message),
          });
      }
    }
    load();
    return () => controller.abort();
  }, [refresh]);
  const retry = () => {
    setState({ pending: endpoints.map(() => true), data: [], errors: [] });
    setRefresh((value) => value + 1);
  };
  const { pending, data, errors } = state;
  const loading = pending.some(Boolean);
  const funnel = data[0]?.totals;
  const suppliers = data[1]?.rows;
  const ledger = data[2]?.rows;
  const credits = ledger
    ?.filter((row) => Number(row.delta) > 0)
    .reduce((sum, row) => sum + Number(row.delta), 0);
  const leaderboard = [...(suppliers || [])]
    .sort(
      (a, b) =>
        b.acceptance_rate - a.acceptance_rate || b.quotes_sent - a.quotes_sent,
    )
    .slice(0, 8);
  return (
    <div className="ew-page-stack">
      <WorkspacePageHeader
        title="Dashboard"
        subtitle="Welcome back. Here's what's happening on EventWow."
        actions={[
          {
            label: "Refresh",
            variant: "secondary",
            onClick: retry,
            disabled: loading,
          },
        ]}
      />
      <div className="ew-metrics">
        <MetricCard
          label="Suppliers sending quotes"
          value={suppliers?.length}
          hint="Last 30 days"
          tone="purple"
          icon={Store}
          loading={pending[1]}
        />
        <MetricCard
          label="Credits issued"
          value={credits}
          hint="From the latest 8 ledger entries"
          tone="green"
          icon={CreditCard}
          loading={pending[2]}
        />
        <MetricCard
          label="Quotes sent"
          value={funnel?.sent}
          hint="Last 30 days"
          tone="blue"
          icon={Send}
          loading={pending[0]}
        />
        <MetricCard
          label="Acceptance rate"
          value={percent(funnel?.acceptance_rate)}
          hint="Last 30 days"
          tone="orange"
          icon={ChartNoAxesCombined}
          loading={pending[0]}
        />
      </div>
      <div className="ew-dashboard-grid">
        <DashboardCard title="Supplier performance" to="/admin/performance">
          <DataTable
            caption="Supplier acceptance leaderboard, last 30 days"
            loading={pending[1]}
            error={errors[1]}
            onRetry={retry}
            rows={leaderboard}
            rowKey="supplier_id"
            emptyTitle="No supplier metrics yet"
            emptyDescription="Supplier performance appears once quotes are sent."
            columns={[
              {
                key: "supplier",
                label: "Supplier",
                render: (row) => (
                  <strong>{row.supplier?.business_name || "Supplier"}</strong>
                ),
              },
              { key: "quotes_sent", label: "Sent" },
              { key: "quotes_accepted", label: "Accepted" },
              {
                key: "acceptance_rate",
                label: "Rate",
                render: (row) => percent(row.acceptance_rate),
              },
            ]}
          />
        </DashboardCard>
        <DashboardCard
          title="Recent credit activity"
          to="/admin/credits-ledger"
        >
          <ActivityList
            loading={pending[2]}
            error={errors[2]}
            onRetry={retry}
            items={(ledger || []).map((row) => ({
              id: row.id,
              title: row.supplier?.business_name || "Supplier",
              description: row.reason,
              when: row.created_at
                ? new Date(row.created_at).toLocaleString("en-GB")
                : "",
              value: `${Number(row.delta) > 0 ? "+" : ""}${row.delta}`,
            }))}
          />
        </DashboardCard>
        <div className="ew-dashboard-side">
          <DashboardCard title="Quick actions">
            <QuickActions
              actions={[
                { label: "Suppliers", to: "/admin/suppliers", icon: Store },
                { label: "Venues", to: "/admin/venues", icon: Building2 },
                { label: "Enquiries", to: "/admin/enquiries", icon: Inbox },
                { label: "Categories", to: "/admin/categories", icon: Tags },
              ]}
            />
          </DashboardCard>
          <DashboardCard title="Quote overview" to="/admin/performance">
            {errors[0] ? (
              <ErrorState message={errors[0]} onRetry={retry} />
            ) : (
              <DataTable
                caption="Quote outcomes in the last 30 days"
                loading={pending[0]}
                rows={
                  funnel
                    ? [
                        { id: "sent", label: "Sent", value: funnel.sent },
                        {
                          id: "accepted",
                          label: "Accepted",
                          value: funnel.accepted,
                        },
                        {
                          id: "declined",
                          label: "Declined",
                          value: funnel.declined,
                        },
                        { id: "closed", label: "Closed", value: funnel.closed },
                      ]
                    : []
                }
                columns={[
                  { key: "label", label: "Outcome" },
                  { key: "value", label: "Quotes" },
                ]}
                emptyTitle="No quote data available"
              />
            )}
            <p className="ew-inline-note">
              Last 30 days. Outcomes can overlap as quotes progress.
            </p>
          </DashboardCard>
        </div>
      </div>
    </div>
  );
}
