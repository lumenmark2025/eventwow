import SupplierListingEditor from "../../supplier/pages/SupplierListingEditor";

export default function ListingPage({ supplier }) {
  return <SupplierListingEditor supplierId={supplier?.id} />;
}
