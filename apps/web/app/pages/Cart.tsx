import { ROUTES } from '@velora/shared';
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { Media } from '../components/Media';
import { Button, EmptyState } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useCart, useCartActions } from '../hooks/useCart';
import { rupiah } from '../lib/format';

export function CartPage() {
  const { cart, isLoading } = useCart();
  const { updateQty, remove, clear } = useCartActions();
  const { user } = useAuth();
  const navigate = useNavigate();

  const lines = cart?.lines ?? [];

  if (isLoading && !cart)
    return <div className="mx-auto max-w-4xl px-4 py-20 text-center text-muted">Memuat keranjang…</div>;

  if (!lines.length) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <EmptyState
          title="Keranjang Anda kosong"
          body="Yuk jelajahi koleksi VELORA dan temukan favorit baru."
          action={
            <Link to={ROUTES.catalog}>
              <Button>Mulai belanja</Button>
            </Link>
          }
        />
      </div>
    );
  }

  function checkout() {
    if (!user) {
      navigate(ROUTES.login, { state: { from: ROUTES.checkout } });
      return;
    }
    navigate(ROUTES.checkout);
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl">Keranjang</h1>
        <button onClick={() => clear.mutate()} className="flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <Trash2 className="h-4 w-4" /> Kosongkan
        </button>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="divide-y divide-line border-y border-line">
          {lines.map((line) => {
            const problem = line.status !== 'ok';
            return (
              <div key={line.id} className="flex gap-4 py-4">
                <Link to={ROUTES.product(line.productSlug)} className="w-20 shrink-0">
                  <Media url={line.imageUrl} alt={line.productName} label={line.productName} aspect="portrait" />
                </Link>
                <div className="flex flex-1 flex-col">
                  <div className="flex justify-between gap-3">
                    <div>
                      <Link to={ROUTES.product(line.productSlug)} className="text-sm font-medium hover:text-accent">
                        {line.productName}
                      </Link>
                      <p className="text-xs text-muted">{line.variantLabel}</p>
                    </div>
                    <span className="text-sm font-semibold">{rupiah(line.lineTotal)}</span>
                  </div>

                  {problem ? (
                    <p className="mt-1 text-xs text-red-700">
                      {line.status === 'out_of_stock' ? 'Stok tidak cukup' : 'Produk tidak tersedia'}
                    </p>
                  ) : null}

                  <div className="mt-auto flex items-center justify-between pt-3">
                    <div className="flex items-center border border-line">
                      <button
                        className="px-2.5 py-1.5"
                        disabled={line.quantity <= 1}
                        onClick={() => updateQty.mutate({ lineId: line.id, quantity: line.quantity - 1 })}
                        aria-label="Kurangi"
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-8 text-center text-sm">{line.quantity}</span>
                      <button
                        className="px-2.5 py-1.5"
                        disabled={line.quantity >= Math.min(line.availableStock, 20) || line.quantity >= 20}
                        onClick={() => updateQty.mutate({ lineId: line.id, quantity: line.quantity + 1 })}
                        aria-label="Tambah"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <button onClick={() => remove.mutate(line.id)} className="text-xs text-muted hover:text-red-700">
                      Hapus
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <aside className="h-fit border border-line bg-surface p-5">
          <h2 className="text-lg">Ringkasan</h2>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd>{rupiah(cart?.subtotal ?? 0)}</dd>
            </div>
            {cart?.appliedCoupon ? (
              <div className="flex justify-between text-accent">
                <dt>Promo {cart.appliedCoupon.code}</dt>
                <dd>-{rupiah(cart.discount)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd>{rupiah((cart?.subtotal ?? 0) - (cart?.discount ?? 0))}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-muted">Ongkos kirim & pembayaran dihitung pada langkah berikutnya.</p>
          <Button className="mt-4 w-full" size="lg" onClick={checkout}>
            <ShoppingBag className="h-4 w-4" /> Checkout
          </Button>
          <Link to={ROUTES.catalog} className="mt-3 block text-center text-sm text-muted hover:text-accent">
            Lanjut belanja
          </Link>
        </aside>
      </div>
    </div>
  );
}

export default CartPage;
