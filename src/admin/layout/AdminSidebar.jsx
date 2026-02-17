import { NavLink } from "react-router-dom";
import eventwowLogoMark from "../../assets/brand/eventwow-logo-mark.svg";
import { adminNavItems } from "./adminNavItems";

export default function AdminSidebar() {
  return (
    <aside className="hidden w-60 shrink-0 md:block">
      <div className="sticky top-24 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-3">
          <img
            src={eventwowLogoMark}
            alt="Eventwow"
            width="24"
            height="24"
            className="h-6 w-6 rounded-md"
            loading="eager"
            decoding="async"
          />
          <p className="text-sm font-semibold text-slate-900">Admin</p>
        </div>

        <nav aria-label="Admin navigation" className="space-y-1">
          {adminNavItems.map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              className={({ isActive }) =>
                [
                  "flex items-center rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-teal-50 text-teal-700"
                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                ].join(" ")
              }
              end={item.to === "/admin/dashboard"}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  );
}
