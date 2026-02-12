import { useNavigate } from "react-router-dom";
import SupplierEnquiries from "../../supplier/pages/SupplierEnquiries";

export default function EnquiriesPage({ supplier }) {
  const navigate = useNavigate();
  const supplierId = supplier?.id;

  const onCreateQuote = (quoteId) => {
  // backwards compatible with existing SupplierQuotes logic
  window.__OPEN_QUOTE_ID__ = quoteId;

  // still nice for deep-linking (optional)
  navigate(`/supplier/quotes?open=${encodeURIComponent(quoteId)}`);
};


  return <SupplierEnquiries supplierId={supplierId} onCreateQuote={onCreateQuote} />;
}
