import { Card, CardContent } from "./Card";

export default function StatCard({ label, value, hint, valueClassName = "" }) {
  return (
    <Card>
      <CardContent className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className={`text-2xl font-semibold text-slate-900 ${valueClassName}`}>{value}</p>
        {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
