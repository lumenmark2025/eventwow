import { cn } from "./cn";

export default function Badge({ variant = "neutral", className = "", children }) {
  const map = {
    neutral: "bg-slate-100 text-slate-700 border-slate-200",
    brand: "bg-teal-50 text-teal-700 border-teal-200",
    success: "bg-emerald-50 text-emerald-700 border-emerald-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    danger: "bg-rose-50 text-rose-700 border-rose-200",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        map[variant] || map.neutral,
        className
      )}
    >
      {children}
    </span>
  );
}
