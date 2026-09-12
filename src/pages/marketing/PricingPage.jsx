import MarketingShell from "../../components/layout/MarketingShell";
import { PublicPageHeader } from "../../components/marketing/PublicComponents";
import { PublicInfoSection } from "../../components/marketing/PublicInfoComponents";
import { useMarketingMeta } from "../../lib/marketingMeta";
const tiers = [
  {
    name: "Customers",
    price: "Free",
    note: "Post requests and compare quotes",
    bullets: [
      "Request quotes",
      "Compare structured offers",
      "Accept the best fit",
    ],
  },
  {
    name: "Suppliers",
    price: "Credits-based",
    note: "Pay only when you send quotes",
    bullets: [
      "Receive matched enquiries",
      "Send line-item quotes",
      "Track response outcomes",
    ],
  },
  {
    name: "Pro supplier",
    price: "Coming soon",
    note: "Growth features in roadmap",
    bullets: ["Advanced analytics", "Priority placements", "Team workflows"],
  },
];

export default function PricingPage() {
  useMarketingMeta({
    title: "Pricing",
    description:
      "Simple, transparent pricing for customers and event suppliers.",
    path: "/pricing",
  });

  return (
    <MarketingShell>
      <div className="public-info">
        <PublicPageHeader
          title="Simple pricing"
          subtitle="Eventwow is free for customers and fair for suppliers - no inflated fees, no high percentage commissions."
        />
        <div className="public-info-grid public-info-pricing">
          {tiers.map((tier) => (
            <PublicInfoSection key={tier.name} title={tier.name}>
              <div className="public-info-price">{tier.price}</div>
              <p>{tier.note}</p>
              <ul>
                {tier.bullets.map((bullet) => (
                  <li key={bullet}>{bullet}</li>
                ))}
              </ul>
            </PublicInfoSection>
          ))}
        </div>
        <PublicInfoSection title="FAQ">
          <p>
            <strong>Do customers pay?</strong> No, customers can request and
            compare quotes for free.
          </p>
          <p>
            <strong>How do supplier credits work?</strong> Suppliers spend
            credits when sending quotes.
          </p>
          <p>
            <strong>Are there contracts?</strong> Not for MVP plans shown here.
          </p>
        </PublicInfoSection>
      </div>
    </MarketingShell>
  );
}
