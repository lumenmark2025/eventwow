import SupplierQuotes from "../../supplier/pages/SupplierQuotes";

export default function QuotesPage({ supplier }) {
  const supplierId = supplier?.id;
  return <SupplierQuotes supplierId={supplierId} />;
}
