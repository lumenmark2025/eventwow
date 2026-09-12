import MarketingShell from "../../components/layout/MarketingShell";
import {
  PublicPageHeader,
  PublicCallout,
} from "../../components/marketing/PublicComponents";
import {
  PublicInfoSection,
  PublicFAQ,
} from "../../components/marketing/PublicInfoComponents";
import { useMarketingMeta } from "../../lib/marketingMeta";
const faqs = [
  {
    q: "How many suppliers receive my request?",
    a: "We match your request to relevant suppliers so you get quality options instead of noise.",
  },
  {
    q: "Do I pay to request quotes?",
    a: "Customers can request and compare quotes for free.",
  },
  {
    q: "How do suppliers get paid?",
    a: "You and your supplier agree final terms, and deposit/payment tools support the flow.",
  },
];

export default function HowItWorksPage() {
  useMarketingMeta({
    title: "How it works",
    description:
      "See the customer and supplier journey from request to booking confirmation.",
    path: "/how-it-works",
  });

  return (
    <MarketingShell>
      <div className="public-info">
        <PublicPageHeader
          title="How Eventwow works"
          subtitle="A cleaner path from request to confirmed booking."
        />
        <div className="public-info-grid">
          <PublicInfoSection title="For customers">
            <p>1. Submit one request with your event details.</p>
            <p>2. Receive clear supplier quotes with totals and timing.</p>
            <p>3. Accept the best fit and confirm your booking.</p>
          </PublicInfoSection>
          <PublicInfoSection title="For suppliers">
            <p>1. Get matched to relevant customer requests.</p>
            <p>2. Send structured quotes quickly with line items.</p>
            <p>3. Track accepted quotes and convert to bookings.</p>
          </PublicInfoSection>
        </div>
        <PublicFAQ items={faqs} />
        <PublicCallout
          title="Ready to get quotes?"
          description="Start your request and compare suppliers quickly."
          to="/categories"
          label="Get quotes"
        />
      </div>
    </MarketingShell>
  );
}
