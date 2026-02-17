import MarketingShell from "../../components/layout/MarketingShell";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/Card";
import Button from "../../components/ui/Button";
import { useMarketingMeta } from "../../lib/marketingMeta";

export default function ContactPage() {
  useMarketingMeta({
    title: "Contact",
    description: "Get in touch with Eventwow support and partnership team.",
    path: "/contact",
  });

  return (
    <MarketingShell>
      <section>
        <Card>
          <CardHeader><CardTitle>Contact Eventwow</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-700">
            <p>Questions about requests, supplier onboarding, or support? We can help.</p>
            <p>Email us at <a className="text-teal-700 underline" href="mailto:hello@eventwow.co.uk">hello@eventwow.co.uk</a></p>
            <div>
              <Button as="a" href="mailto:hello@eventwow.co.uk?subject=Eventwow%20Enquiry">Email support</Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </MarketingShell>
  );
}
