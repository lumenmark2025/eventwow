import { Link } from "react-router-dom";
import { Card, CardContent, CardFooter } from "../ui/Card";
import Badge from "../ui/Badge";
import Button from "../ui/Button";

export default function SupplierCard({ supplier }) {
  return (
    <Card className="overflow-hidden rounded-2xl">
      {supplier.heroImageUrl ? (
        <img
          src={supplier.heroImageUrl}
          alt={`${supplier.name} cover`}
          className="h-32 w-full object-cover"
          loading="lazy"
        />
      ) : (
        <div className="h-32 bg-gradient-to-br from-slate-100 via-slate-50 to-teal-50" />
      )}
      <CardContent className="space-y-3">
        <div>
          <h3 className="line-clamp-1 text-lg font-semibold tracking-tight text-slate-900">{supplier.name}</h3>
          {supplier.locationLabel ? <p className="mt-1 text-xs text-slate-500">{supplier.locationLabel}</p> : null}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(supplier.categoryBadges || []).map((badge) => (
            <Badge key={`${supplier.id}-${badge}`} variant="neutral">{badge}</Badge>
          ))}
        </div>
        <p className="line-clamp-3 text-sm text-slate-600">{supplier.shortDescription}</p>
      </CardContent>
      <CardFooter>
        <Button as={Link} to={`/suppliers/${supplier.slug}`} className="w-full">
          View profile
        </Button>
      </CardFooter>
    </Card>
  );
}
