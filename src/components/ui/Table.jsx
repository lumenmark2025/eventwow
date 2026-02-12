import { cn } from "./cn";

export function Table({ className = "", ...props }) {
  return <table className={cn("min-w-full text-sm", className)} {...props} />;
}

export function THead({ className = "", ...props }) {
  return <thead className={cn("bg-slate-50 text-slate-600", className)} {...props} />;
}

export function TBody({ className = "", ...props }) {
  return <tbody className={cn("divide-y divide-slate-200", className)} {...props} />;
}

export function TR({ className = "", interactive = false, ...props }) {
  return (
    <tr
      className={cn(interactive ? "transition-colors hover:bg-slate-50" : "", className)}
      {...props}
    />
  );
}

export function TH({ className = "", ...props }) {
  return (
    <th
      className={cn("px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide sm:px-5", className)}
      {...props}
    />
  );
}

export function TD({ className = "", ...props }) {
  return <td className={cn("px-3 py-3 align-top sm:px-5", className)} {...props} />;
}
