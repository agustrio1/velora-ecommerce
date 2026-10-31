import { type ProductSummary, ROUTES } from '@velora/shared';
import { Star } from 'lucide-react';
import { Link } from 'react-router';
import { rupiah } from '../lib/format';
import { Media } from './Media';

export function ProductCard({ product }: { product: ProductSummary }) {
  const price = product.salePrice ?? product.price;
  const discount =
    product.salePrice != null && product.salePrice < product.price
      ? Math.round((1 - product.salePrice / product.price) * 100)
      : 0;

  return (
    <Link to={ROUTES.product(product.slug)} className="group flex flex-col" viewTransition>
      <div className="relative">
        <Media url={product.primaryImage} alt={product.name} label={product.name} aspect="tall" />
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {discount > 0 ? (
            <span className="bg-accent px-2 py-0.5 text-xs font-semibold text-white">-{discount}%</span>
          ) : null}
          {product.isNewArrival ? (
            <span className="bg-ink px-2 py-0.5 text-xs font-medium text-canvas">Baru</span>
          ) : null}
        </div>
        {product.totalStock === 0 ? (
          <div className="absolute inset-0 flex items-end bg-canvas/70 p-3">
            <span className="text-xs font-semibold uppercase tracking-widest text-muted">Stok habis</span>
          </div>
        ) : null}
      </div>

      <div className="mt-3 flex flex-1 flex-col">
        {product.categoryName ? <div className="eyebrow">{product.categoryName}</div> : null}
        <h3 className="mt-1 text-sm text-ink transition-colors group-hover:text-accent">{product.name}</h3>
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="text-sm font-semibold">{rupiah(price)}</span>
          {product.salePrice != null ? (
            <span className="text-xs text-muted line-through">{rupiah(product.price)}</span>
          ) : null}
        </div>
        {product.ratingCount > 0 ? (
          <div className="mt-1 flex items-center gap-1 text-xs text-muted">
            <Star className="h-3.5 w-3.5 fill-accent text-accent" />
            <span>{product.ratingAvg?.toFixed(1)}</span>
            <span>({product.ratingCount})</span>
          </div>
        ) : null}
      </div>
    </Link>
  );
}
