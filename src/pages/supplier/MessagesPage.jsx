import { useSearchParams } from "react-router-dom";
import SupplierMessages from "../../supplier/pages/SupplierMessages";

export default function MessagesPage({ supplier }) {
  const [searchParams] = useSearchParams();
  const supplierId = supplier?.id;
  const initialThreadId = String(searchParams.get("thread") || "").trim();

  return <SupplierMessages supplierId={supplierId} initialThreadId={initialThreadId} />;
}
