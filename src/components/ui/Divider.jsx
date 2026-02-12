import { cn } from "./cn";

export default function Divider({ className = "" }) {
  return <hr className={cn("border-slate-200", className)} />;
}
