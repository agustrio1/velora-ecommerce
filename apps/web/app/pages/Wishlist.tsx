import { type ProductSummary, ROUTES } from '@velora/shared';
import { Heart, ShoppingBag } from 'lucide-react';
import { Link } from 'react-router';
import { Media } from '../components/Media';
import { Button, EmptyState, Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useWishlist } from '../hooks/useWishlist';
import { rupiah } from '../lib/format';

export function WishlistPage() {
  const { user } = useAuth();
  const { items, isLoading, toggle } = useWishlist();

  if (!user) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <EmptyState
          title="Wishlist butuh akun"
          body="Masuk untuk menyimpan produk favorit dan menemukannya kembali kapan saja."
          action={
            <Link to={ROUTES.login} state={{ from: ROUTES.wishlist }}>
              <Button>Masuk sekarang</Button>
            </Link>
          }
        />
      </div>
    );
  }

  if (isLoading && items.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16">
        <Spinner label="Memuat wishlist…" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <EmptyState
          title="Wishlist masih kosong"
          body="Ketuk ikon hati pada produk untuk menyimpannya di sini."
          action={
            <Link to={ROUTES.catalog}>
              <Button>Jelajahi katalog</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center gap-2">
        <Heart className="h-5 w-5 text-accent" />
        <h1 className="text-2xl sm:text-3xl">Wishlist</h1>
        <span className="text-sm text-muted">({items.length})</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((p) => (
          <WishTile key={p.id} product={p} onRemove={() => toggle(p.id)} />
        ))}
      </div>
    </div>
  );
}

function WishTile({ product, onRemove }: { product: ProductSummary; onRemove: () => void }) {
  const price = product.salePrice ?? product.price;
  return (
    <div className="flex flex-col">
      <div className="relative">
        <Link to={ROUTES.product(product.slug)}>
          <Media url={product.primaryImage} alt={product.name} label={product.name} aspect="tall" />
        </Link>
        <button
          onClick={onRemove}
          aria-label="Hapus dari wishlist"
          className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-accent hover:bg-soft"
        >
          <Heart className="h-4 w-4 fill-accent" />
        </button>
      </div>
      <div className="mt-2 flex flex-1 flex-col">
        <Link to={ROUTES.product(product.slug)} className="text-sm hover:text-accent">
          {product.name}
        </Link>
        <span className="mt-1 text-sm font-semibold">{rupiah(price)}</span>
        <Link to={ROUTES.product(product.slug)} className="mt-2">
          <Button size="sm" variant="secondary" className="w-full">
            <ShoppingBag className="h-4 w-4" /> Lihat
          </Button>
        </Link>
      </div>
    </div>
  );
}

export default WishlistPage;
