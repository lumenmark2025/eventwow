import { cn } from "./cn";

export function Card({ className = "", ...props }) {
  return <div className={cn("rounded-xl border border-slate-200 bg-white shadow-card", className)} {...props} />;
}

export function CardHeader({ className = "", ...props }) {
  return <div className={cn("px-5 pt-5", className)} {...props} />;
}

export function CardTitle({ className = "", ...props }) {
  return <h3 className={cn("text-base font-semibold text-slate-900", className)} {...props} />;
}

export function CardDescription({ className = "", ...props }) {
  return <p className={cn("mt-1 text-sm text-slate-500", className)} {...props} />;
}

export function CardContent({ className = "", ...props }) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

export function CardFooter({ className = "", ...props }) {
  return <div className={cn("px-5 pb-5 pt-1", className)} {...props} />;
}
