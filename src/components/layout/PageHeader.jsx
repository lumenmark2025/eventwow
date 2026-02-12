import Button from "../ui/Button";

export default function PageHeader({ title, subtitle, actions = [] }) {
  return (
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
      </div>
      {actions.length > 0 ? (
        <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">
          {actions.map((a) => {
            const { className, label, ...rest } = a;
            return (
              <Button key={a.key || a.label} className={`w-full sm:w-auto ${className || ""}`} {...rest}>
                {label}
              </Button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
