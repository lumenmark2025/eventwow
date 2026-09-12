import MarketingShell from "../../components/layout/MarketingShell";
import {
  PublicPageHeader,
  PublicButton,
} from "../../components/marketing/PublicComponents";
import { PublicInfoSection } from "../../components/marketing/PublicInfoComponents";
import { useMarketingMeta } from "../../lib/marketingMeta";
export default function ContactPage() {
  useMarketingMeta({
    title: "Contact",
    description: "Get in touch with Eventwow support and partnership team.",
    path: "/contact",
  });

  return (
    <MarketingShell>
      <div className="public-info">
        <PublicPageHeader
          title="Contact Eventwow"
          subtitle="Questions about requests, supplier onboarding, or support? We can help."
        />
        <PublicInfoSection title="Contact details">
          <p>
            Email us at{" "}
            <a href="mailto:hello@eventwow.co.uk">hello@eventwow.co.uk</a>
          </p>
          <PublicButton
            as="a"
            href="mailto:hello@eventwow.co.uk?subject=Eventwow%20Enquiry"
          >
            Email support
          </PublicButton>
        </PublicInfoSection>
      </div>
    </MarketingShell>
  );
}
