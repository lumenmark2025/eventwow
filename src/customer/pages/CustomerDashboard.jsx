import { Link } from "react-router-dom";
import { Inbox, MessageSquare, FileText } from "lucide-react";
import PageHeader from "../../components/layout/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
} from "../../components/workspace/AdminPrimitives";

export default function CustomerDashboard() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Welcome back"
        subtitle="Your event requests and supplier conversations, in one place."
      />
      <Card>
        <CardHeader>
          <CardTitle>Plan your next event</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <p>
            Open an enquiry to see your event details, compare the quotes you
            have received and contact invited suppliers.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button as={Link} to="/customer/enquiries">
              <Inbox size={16} aria-hidden="true" />
              View my enquiries
            </Button>
            <Button as={Link} to="/request" variant="secondary">
              Create new enquiry
            </Button>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="space-y-2">
              <FileText size={20} aria-hidden="true" />
              <h3 className="font-semibold">Review supplier quotes</h3>
              <p className="ew-form-help">
                Compare prices, included items and supplier messages within each
                enquiry.
              </p>
            </div>
            <div className="space-y-2">
              <MessageSquare size={20} aria-hidden="true" />
              <h3 className="font-semibold">Discuss the details</h3>
              <p className="ew-form-help">
                Once a supplier has sent a quote, use their Message supplier
                button to start a conversation.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
