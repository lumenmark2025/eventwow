import { cn } from "./cn";

export default function Input({ className = "", ...props }) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/25",
        className
      )}
      {...props}
    />
  );
}
