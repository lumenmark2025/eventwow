export const adminNavItems = [
  { key: "dashboard", label: "Dashboard", to: "/admin/dashboard" },
  { key: "credits-ledger", label: "Credits Ledger", to: "/admin/credits-ledger" },
  { key: "performance", label: "Performance", to: "/admin/performance" },
  { key: "venues", label: "Venues", to: "/admin/venues" },
  { key: "categories", label: "Categories", to: "/admin/categories" },
  { key: "venue-claims", label: "Venue claims", to: "/admin/venue-claims" },
  { key: "reviews", label: "Reviews", to: "/admin/reviews" },
  { key: "supplier-applications", label: "Supplier Applications", to: "/admin/supplier-applications" },
  { key: "suppliers", label: "Suppliers", to: "/admin/suppliers" },
  { key: "enquiries", label: "Enquiries", to: "/admin/enquiries" },
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
