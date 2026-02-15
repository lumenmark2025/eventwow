import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import Button from "../../components/ui/Button";

export default function CustomerDashboard() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Welcome back</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-700">
          <p>Manage your event requests, compare supplier quotes, and message suppliers from one place.</p>
          <div className="flex flex-wrap gap-2">
            <Button as={Link} to="/customer/enquiries">View my enquiries</Button>
            <Button as={Link} to="/request" variant="secondary">Create new enquiry</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
