import { Link } from "react-router-dom";
import eventwowLogo from "../../assets/brand/eventwow-logo.svg";

export default function AuthShell({ title, subtitle, children, footerLinkTo = "/", footerLinkLabel = "eventwow.co.uk" }) {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-10 sm:px-6">
      <div className="mx-auto w-full max-w-lg space-y-4">
        <div className="flex justify-center">
          <img
            src={eventwowLogo}
            alt="Eventwow"
            width="190"
            height="36"
            className="h-9 w-auto"
            loading="eager"
            decoding="async"
          />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="mb-5 space-y-1">
            <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
            {subtitle ? <p className="text-sm text-slate-600">{subtitle}</p> : null}
          </div>
          {children}
        </div>

        <p className="text-center text-xs text-slate-500">
          Need help?{" "}
          <a href="mailto:hello@eventwow.co.uk" className="underline underline-offset-2">
            hello@eventwow.co.uk
          </a>{" "}
          |{" "}
          <Link to={footerLinkTo} className="underline underline-offset-2">
            {footerLinkLabel}
          </Link>
        </p>
      </div>
    </div>
  );
}
