import WorkspaceImage from "../components/workspace/WorkspaceImage";
import {
  ConversationThread,
  MessageComposer,
} from "../components/workspace/ConversationThread";
import {
  FormSection,
  FormSectionBody,
  FormField,
  Input as FormInput,
  Select as FormSelect,
  Textarea as FormTextarea,
  Feedback,
} from "../components/workspace/AdminPrimitives";
import { lazy, Suspense, useState } from "react";
const CalendarExample = lazy(
  () => import("../components/supplier/BookingsCalendar"),
);
import { Store, Inbox, CreditCard, Building2 } from "lucide-react";
import WorkspaceShell from "../components/workspace/WorkspaceShell";
import {
  WorkspacePageHeader,
  MetricCard,
  StatusBadge,
  DataTable,
  FilterBar,
  DashboardCard,
  ActivityList,
  EmptyState,
  QuickActions,
  ApprovalAlert,
  WorkspaceDialog,
  ErrorState,
} from "../components/workspace/WorkspaceComponents";
import Button from "../components/ui/Button";
import { adminNavItems } from "../admin/layout/adminNavItems";

const demoRows = [
  {
    id: "demo-1",
    name: "Example events business",
    location: "Manchester",
    status: "Published",
  },
  {
    id: "demo-2",
    name: "Example venue",
    location: "Lancaster",
    status: "Pending",
  },
];
export default function DesignSystemPage() {
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [calendarView, setCalendarView] = useState("month");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const rows = demoRows.filter((row) =>
    row.name.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <WorkspaceShell title="Design system" nav={adminNavItems} presentation>
      <div className="ew-page-stack">
        <WorkspacePageHeader
          title="Workspace design system"
          subtitle="EventWow v2 · Synthetic examples for design review only."
          actions={[{ label: "Open dialog", onClick: () => setOpen(true) }]}
        />
        <FormSection
          title="Admin form pattern"
          description="Shared labels, help, errors and actions. Synthetic form for review."
        >
          <FormSectionBody className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField
              label="Business name"
              help="Use the public business name."
            >
              <FormInput defaultValue="Example events" />
            </FormField>
            <FormField label="Visibility">
              <FormSelect defaultValue="draft">
                <option value="draft">Draft</option>
                <option value="published">Published</option>
              </FormSelect>
            </FormField>
            <FormField label="Description">
              <FormTextarea placeholder="Describe the listing" />
            </FormField>
            <FormField
              label="Example validation"
              error="Enter a valid email address."
            >
              <FormInput defaultValue="invalid" />
            </FormField>
            <FormField
              label="Disabled field"
              help="Example of an unavailable control."
            >
              <FormInput disabled value="Read only" />
            </FormField>
          </FormSectionBody>
          <div className="ew-form-actions">
            <Button variant="secondary">Cancel</Button>
            <Button disabled>Save example</Button>
          </div>
        </FormSection>
        <FormSection
          title="Listing imagery"
          description="Real listing images use a stable landscape frame; missing images have an explicit state."
        >
          <FormSectionBody>
            <div className="max-w-md">
              <WorkspaceImage alt="Listing image example" />
            </div>
          </FormSectionBody>
        </FormSection>
        <FormSection
          title="Calendar pattern"
          description="Existing booking calendar with workspace controls; synthetic empty example."
        >
          <FormSectionBody>
            <Button
              variant="secondary"
              onClick={() => setShowCalendar((value) => !value)}
            >
              {showCalendar ? "Hide calendar example" : "Show calendar example"}
            </Button>
            {showCalendar && (
              <Suspense fallback={<p role="status">Loading calendar…</p>}>
                <CalendarExample
                  rows={[]}
                  currentDate={calendarDate}
                  currentView={calendarView}
                  onNavigate={setCalendarDate}
                  onView={setCalendarView}
                />
              </Suspense>
            )}
          </FormSectionBody>
        </FormSection>
        <FormSection
          title="Conversation pattern"
          description="Synthetic conversation; no messages are sent."
        >
          <FormSectionBody>
            <ConversationThread
              title="Example customer"
              subtitle="Example event · Manchester"
              messages={[
                {
                  id: "example-message",
                  sender: "Customer",
                  body: "Could you confirm the setup time?",
                  createdAt: "2026-09-12T10:00:00Z",
                  when: "12 September, 10:00",
                },
              ]}
            />
            <MessageComposer
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              disabled={!message.trim()}
              onSend={() => setMessage("")}
            />
          </FormSectionBody>
        </FormSection>
        <Feedback tone="success">Example saved-state message.</Feedback>
        <div className="ew-metrics">
          <MetricCard
            label="Example enquiries"
            value="24"
            hint="Synthetic sample"
            icon={Inbox}
          />
          <MetricCard
            label="Example suppliers"
            value="12"
            tone="purple"
            icon={Store}
          />
          <MetricCard
            label="Example credits"
            value="80"
            tone="green"
            icon={CreditCard}
          />
          <MetricCard
            label="Example venues"
            value="8"
            tone="orange"
            icon={Building2}
          />
        </div>
        <div className="ew-dashboard-grid">
          <DashboardCard title="List pattern">
            <FilterBar
              search={search}
              onSearchChange={setSearch}
              count={rows.length}
            />
            <DataTable
              caption="Synthetic records"
              columns={[
                { key: "name", label: "Name" },
                { key: "location", label: "Location" },
                {
                  key: "status",
                  label: "Status",
                  render: (row) => <StatusBadge status={row.status} />,
                },
              ]}
              rows={rows}
              emptyTitle="No matching examples"
            />
          </DashboardCard>
          <DashboardCard title="Activity pattern">
            <ActivityList
              items={[
                {
                  id: "sample",
                  title: "Example credit adjustment",
                  description: "Synthetic design-system activity",
                  when: "Example timestamp",
                  value: "+10",
                },
              ]}
            />
            <ApprovalAlert
              count={2}
              label="example applications pending"
              to="/design-system"
            />
          </DashboardCard>
          <DashboardCard title="Quick actions">
            <QuickActions
              actions={[
                { label: "Suppliers", to: "/admin/suppliers", icon: Store },
                { label: "Venues", to: "/admin/venues", icon: Building2 },
              ]}
            />
          </DashboardCard>
        </div>
        <DashboardCard title="Controls and status">
          <div className="flex flex-wrap gap-4 p-5">
            <Button>Primary action</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button disabled>Disabled</Button>
          </div>
          <div className="flex flex-wrap gap-4 p-5">
            {[
              "New",
              "In progress",
              "Quoted",
              "Published",
              "Rejected",
              "Hidden",
            ].map((status) => (
              <StatusBadge key={status} status={status} />
            ))}
          </div>
        </DashboardCard>
        <div className="ew-dashboard-grid">
          <DashboardCard title="Empty state">
            <EmptyState
              title="No records yet"
              description="Content appears when records are available."
            />
          </DashboardCard>
          <DashboardCard title="Loading state">
            <DataTable loading rows={[]} columns={[]} />
          </DashboardCard>
          <DashboardCard title="Error state">
            <ErrorState message="Example service unavailable. Retry when the connection returns." />
          </DashboardCard>
        </div>
        <DashboardCard title="Workspace tokens and typography">
          <div className="grid grid-cols-2 gap-4 p-5 md:grid-cols-4">
            {["blue", "green", "purple", "orange"].map((tone) => (
              <div
                key={tone}
                className={`ew-tone-${tone} ew-token-swatch rounded-lg p-4`}
              >
                {tone}
              </div>
            ))}
          </div>
          <p className="ew-inline-note">
            Inter 400–700 · Page title 28/36 · Body 14/21 · 240px sidebar · 64px
            topbar · 16/24/32px responsive gutters · 10px controls · 14px panels
          </p>
        </DashboardCard>
        <WorkspaceDialog
          open={open}
          onClose={() => setOpen(false)}
          title="Example dialog"
          footer={<Button onClick={() => setOpen(false)}>Done</Button>}
        >
          <label htmlFor="example-name">Example name</label>
          <input
            id="example-name"
            className="mt-2 w-full border p-3"
            placeholder="Enter a name"
          />
          <p className="mt-4">
            Tab stays inside the dialog. Escape closes it and returns focus.
          </p>
        </WorkspaceDialog>
      </div>
    </WorkspaceShell>
  );
}
