import { LayoutDashboard, Store, Building2, Inbox, CreditCard, ChartNoAxesCombined, Tags, Image, BadgeCheck, Star, ClipboardCheck } from "lucide-react";

export const adminNavItems = [
  { key: "dashboard", label: "Overview", to: "/admin/dashboard", icon: LayoutDashboard, group: "Workspace" },
  { key: "suppliers", label: "Suppliers", to: "/admin/suppliers", icon: Store, group: "Platform" },
  { key: "supplier-applications", label: "Supplier applications", to: "/admin/supplier-applications", icon: ClipboardCheck, group: "Platform" },
  { key: "venues", label: "Venues", to: "/admin/venues", icon: Building2, group: "Platform" },
  { key: "venue-claims", label: "Venue claims", to: "/admin/venue-claims", icon: BadgeCheck, group: "Platform" },
  { key: "enquiries", label: "Enquiries", to: "/admin/enquiries", icon: Inbox, group: "Platform" },
  { key: "reviews", label: "Reviews", to: "/admin/reviews", icon: Star, group: "Platform" },
  { key: "categories", label: "Categories", to: "/admin/categories", icon: Tags, group: "Content" },
  { key: "venue-hero-images", label: "Venue hero images", to: "/admin/venues/hero-images", icon: Image, group: "Content" },
  { key: "credits-ledger", label: "Credits ledger", to: "/admin/credits-ledger", icon: CreditCard, group: "Finance" },
  { key: "performance", label: "Performance", to: "/admin/performance", icon: ChartNoAxesCombined, group: "Finance" },
];

export function getAdminPageTitle(pathname) {
  const path = String(pathname || "").toLowerCase();
  const exact = adminNavItems.find((item) => path === item.to.toLowerCase());
  if (exact) return exact.label;
  const partial = adminNavItems.find((item) => path.startsWith(`${item.to.toLowerCase()}/`));
  if (partial) return partial.label;
  if (path === "/admin" || path === "/admin/") return "Dashboard";
  return "Admin";
}
