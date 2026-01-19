import { useMemo, useState } from "react";

import SupplierDashboard from "../pages/SupplierDashboard";
import SupplierEnquiries from "../pages/SupplierEnquiries";
import SupplierQuotes from "../pages/SupplierQuotes";
import SupplierBookings from "../pages/SupplierBookings";

function TabButton({ active, children, className = "", ...props }) {
  const base = "px-4 py-2 rounded-lg border bg-white";
  const activeCls = active ? " border-black" : "";
  return (
    <button className={`${base}${activeCls} ${className}`} {...props}>
      {children}
    </button>
  );
}

export default function SupplierLayout({ user, supplier, onSignOut }) {
  const [tab, setTab] = useState("dashboard");

  const header = useMemo(() => {
    const name = supplier?.business_name || "Supplier";
    const credits = supplier?.credits_balance ?? 0;
    return { name, credits };
  }, [supplier?.business_name, supplier?.credits_balance]);

  return (
    <div className="min-h-screen p-6 bg-gray-50">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Eventwow Supplier</h1>
            <p className="text-sm text-gray-600">
              {header.name} · signed in as {user.email} · credits: {header.credits}
            </p>
          </div>
          <button onClick={onSignOut} className="border rounded-lg px-3 py-2 bg-white">
            Sign out
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <TabButton active={tab === "dashboard"} onClick={() => setTab("dashboard")}>
            Dashboard
          </TabButton>
          <TabButton active={tab === "enquiries"} onClick={() => setTab("enquiries")}>
            Enquiries
          </TabButton>
          <TabButton active={tab === "quotes"} onClick={() => setTab("quotes")}>
            Quotes
          </TabButton>
          <TabButton active={tab === "bookings"} onClick={() => setTab("bookings")}>
            Bookings
          </TabButton>
        </div>

        {tab === "dashboard" ? (
          <SupplierDashboard supplier={supplier} />
        ) : tab === "enquiries" ? (
          <SupplierEnquiries supplierId={supplier.id} />
        ) : tab === "quotes" ? (
          <SupplierQuotes supplierId={supplier.id} />
        ) : (
          <SupplierBookings supplierId={supplier.id} />
        )}
      </div>
    </div>
  );
}
