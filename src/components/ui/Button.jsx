import { cn } from "./cn";

export default function Button({
  as = "button",
  variant = "primary",
  size = "md",
  className = "",
  ...props
}) {
  const Component = as;
  const base =
    "inline-flex items-center justify-center rounded-2xl font-medium transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/35 disabled:cursor-not-allowed disabled:opacity-50";

  const variants = {
    primary: "bg-brand text-brand-foreground shadow-sm hover:bg-blue-700",
    secondary: "border border-slate-300 bg-white text-slate-800 hover:border-blue-200 hover:bg-blue-50",
    ghost: "bg-transparent text-slate-700 hover:bg-slate-100",
    danger: "border border-rose-300 bg-white text-rose-700 hover:bg-rose-50",
  };

  const sizes = {
    sm: "h-10 px-3 text-sm",
    md: "h-11 px-4 text-sm",
    lg: "h-12 px-5 text-base",
  };

  return (
    <Component className={cn(base, variants[variant], sizes[size], className)} {...props} />
  );
}
