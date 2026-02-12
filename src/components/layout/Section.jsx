export default function Section({ title, right, children }) {
  return (
    <section className="space-y-3">
      {(title || right) ? (
        <div className="flex items-center justify-between gap-3">
          {title ? <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">{title}</h2> : <span />}
          {right}
        </div>
      ) : null}
      {children}
    </section>
  );
}
