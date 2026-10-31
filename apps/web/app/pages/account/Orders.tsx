import { useQuery } from '@tanstack/react-query';
import { type OrderSummary, ROUTES } from '@velora/shared';
import { ChevronLeft, ChevronRight, Package } from 'lucide-react';
import { useState } from 'react';
import { Link, type LoaderFunctionArgs } from 'react-router';
import { Media } from '../../components/Media';
import { AccountNav } from '../../components/account/AccountNav';
import { Button, EmptyState, Spinner } from '../../components/ui';
import { api } from '../../lib/api';
import type { Paginated } from '../../lib/api-types';
import { dateOnly, rupiah, statusChip } from '../../lib/format';
import { cloudflareEnv } from '../../services/cloudflare.server';
import { requireSession } from '../../services/session.server';

export async function loader({ request, context }: LoaderFunctionArgs) {
  await requireSession(request, cloudflareEnv(context));
  return null;
}

export function OrdersPage() {
  const [page, setPage] = useState(1);

  const orders = useQuery<Paginated<OrderSummary>>({
    queryKey: ['orders', page],
    queryFn: () => api.get<Paginated<OrderSummary>>('/account/orders', { page, pageSize: 10 }),
  });

  const items = orders.data?.items ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="mb-1 text-2xl sm:text-3xl">Akun saya</h1>
      <AccountNav current="orders" />

      {orders.isLoading && !orders.data ? (
        <Spinner label="Memuat pesanan…" />
      ) : items.length === 0 ? (
        <EmptyState
          title="Belum ada pesanan"
          body="Setiap pesanan yang Anda buat akan muncul di sini."
          action={
            <Link to={ROUTES.catalog}>
              <Button>Mulai belanja</Button>
            </Link>
          }
        />
      ) : (
        <>
          <ul className="space-y-3">
            {items.map((o) => {
              const chip = statusChip(o.status);
              return (
                <li key={o.id}>
                  <Link
                    to={ROUTES.orderDetail(o.code)}
                    className="flex gap-4 border border-line bg-surface p-4 transition-colors hover:border-accent"
                  >
                    <div className="w-16 shrink-0">
                      <Media url={o.primaryImage} label={o.code} aspect="portrait" />
                    </div>
                    <div className="flex flex-1 flex-col">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium">#{o.code}</div>
                          <div className="text-xs text-muted">
                            {dateOnly(o.createdAt)} · {o.itemCount} item
                          </div>
                        </div>
                        <span className={'shrink-0 rounded-pill border px-2.5 py-0.5 text-xs ' + chip.className}>
                          {chip.label}
                        </span>
                      </div>
                      <div className="mt-auto flex items-center justify-between pt-2">
                        <span className="text-sm font-semibold">{rupiah(o.grandTotal)}</span>
                        {o.trackingNumber ? (
                          <span className="flex items-center gap-1 text-xs text-muted">
                            <Package className="h-3.5 w-3.5" /> {o.courier ?? 'kurir'} · {o.trackingNumber}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>

          {orders.data && orders.data.totalPages > 1 ? (
            <div className="mt-8 flex items-center justify-center gap-3">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" /> Sebelumnya
              </Button>
              <span className="text-sm text-muted">
                {orders.data.page} / {orders.data.totalPages}
              </span>
              <Button
                variant="secondary"
                size="sm"
                disabled={!orders.data.hasMore}
                onClick={() => setPage((p) => p + 1)}
              >
                Berikutnya <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export default OrdersPage;
