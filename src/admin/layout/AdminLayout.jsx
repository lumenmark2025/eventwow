import { useState } from "react";

import VenueList from "../venues/VenueList";
import SupplierList from "../suppliers/SupplierList";
import EnquiryList from "../enquiries/EnquiryList";

export default function AdminLayout({ user, onSignOut }) {
  const [tab, setTab] = useState("venues");
  return (
    <div className="min-h-screen p-6 bg-gray-50">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Eventwow Admin</h1>
            <p className="text-sm text-gray-600">Signed in as {user.email}</p>
          </div>
          <button onClick={onSignOut} className="border rounded-lg px-3 py-2 bg-white">Sign out</button>
        </div>

        <div className="flex gap-2">
          <button
            className={`px-4 py-2 rounded-lg border bg-white ${tab === "venues" ? "border-black" : ""}`}
            onClick={() => setTab("venues")}
          >
            Venues
          </button>
          <button
            className={`px-4 py-2 rounded-lg border bg-white ${tab === "suppliers" ? "border-black" : ""}`}
            onClick={() => setTab("suppliers")}
          >
            Suppliers
          </button>
          <button
            className={`px-4 py-2 rounded-lg border bg-white ${tab === "enquiries" ? "border-black" : ""}`}
            onClick={() => setTab("enquiries")}
          >
            Enquiries
          </button>

          
        </div>

        {tab === "venues" ? (
          <VenueList user={user} />
        ) : tab === "suppliers" ? (
          <SupplierList user={user} />
        ) : (
          <EnquiryList user={user} />
        )}

      </div>
    </div>
  );
}
