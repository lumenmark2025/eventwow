import SupplierBookings from "../../supplier/pages/SupplierBookings";

export default function BookingsPage({ supplier }) {
  const supplierId = supplier?.id;
  return <SupplierBookings supplierId={supplierId} />;
}
