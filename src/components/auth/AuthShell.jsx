import { Link } from "react-router-dom";
import { PublicLogo } from "../marketing/PublicLogo";
import PageHeader from "../layout/PageHeader";
import "./auth.css";

export default function AuthShell({
  title,
  subtitle,
  children,
  footerLinkTo = "/",
  footerLinkLabel = "eventwow.co.uk",
  wide = false,
  embedded = false,
}) {
  const Panel = embedded ? "section" : "main";
  return (
    <div
      className={`public-v2 public-auth ${wide ? "public-auth-wide" : ""} ${embedded ? "public-auth-example" : ""}`}
    >
      <div className="public-auth-container">
        <div className="public-auth-brand">
          <PublicLogo />
        </div>
        <Panel className="public-auth-panel">
          {embedded ? (
            <h2 className="public-auth-example-title">{title}</h2>
          ) : (
            <PageHeader title={title} subtitle={subtitle} />
          )}
          <div className="auth-content space-y-4">{children}</div>
        </Panel>
        <p className="public-auth-help">
          Need help?{" "}
          <a href="mailto:hello@eventwow.co.uk">hello@eventwow.co.uk</a>{" "}
          <span aria-hidden="true">·</span>{" "}
          <Link to={footerLinkTo}>{footerLinkLabel}</Link>
        </p>
      </div>
    </div>
  );
}
