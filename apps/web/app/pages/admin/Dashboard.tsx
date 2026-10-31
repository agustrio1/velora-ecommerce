import { useQuery } from '@tanstack/react-query';
import { type DashboardStats, type OrderSummary, ROUTES } from '@velora/shared';
import { ArrowRight, Package, ShoppingBag, TrendingUp, Users } from 'lucide-react';
import { Link } from 'react-router';
import { type Column, DataTable, StatCard } from '../../components/admin/kit';
import { PageHeader } from '../../components/admin/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/surface';
import { api } from '../../lib/api';
import { rupiah, statusChip } from '../../lib/format';

interface Health {
  failedPayments: number;
  stuckOrders: number;
  expiredReservations: number;
  failedWebhooks: number;
  lowStock: number;
  unreadChats: number;
  integrations: {
    payments: { configured: boolean; environment: string };
    shipping: { configured: boolean; environment: string };
    realtime: { configured: boolean };
    email: { configured: boolean; provider: string | null };
  };
}

export function AdminDashboard() {
  const stats = useQuery<DashboardStats & { unreadChats: number }>({
    queryKey: ['admin', 'dashboard'],
    queryFn: () =>
      api.get<DashboardStats & { unreadChats: number }>('/admin/dashboard', undefined, { anonymous: true }),
  });
  const health = useQuery<Health>({
    queryKey: ['admin', 'health'],
    queryFn: () => api.get<Health>('/admin/health', undefined, { anonymous: true }),
  });

  if (stats.isLoading && !stats.data) return <p className="text-muted">Memuat ringkasan…</p>;
  const d = stats.data;
  if (!d) return <p className="text-red-700">Gagal memuat dashboard.</p>;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: 'Admin' }, { label: 'Dashboard' }]}
        title="Ringkasan"
        description="Kondisi toko secara menyeluruh."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Pendapatan 30 hari"
          value={rupiah(d.revenue30d)}
          hint={`Total ${rupiah(d.revenueTotal)}`}
          tone="accent"
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <StatCard
          label="Pesanan"
          value={d.ordersTotal}
          hint={`${d.statusCounts.pending_payment ?? 0} menunggu bayar`}
          icon={<ShoppingBag className="h-4 w-4" />}
        />
        <StatCard label="Pelanggan" value={d.customersTotal} icon={<Users className="h-4 w-4" />} />
        <StatCard
          label="Produk"
          value={d.productsTotal}
          hint={`${d.lowStockCount} stok menipis`}
          icon={<Package className="h-4 w-4" />}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Tren pendapatan (14 hari)</CardTitle>
          </CardHeader>
          <CardContent>
            <RevenueBars series={d.revenueSeries} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Kategori terlaris</CardTitle>
          </CardHeader>
          <CardContent>
            {d.topCategories.length ? (
              <ul className="space-y-2 text-sm">
                {d.topCategories.map((c) => (
                  <li key={c.name} className="flex justify-between">
                    <span className="capitalize">{c.name}</span>
                    <span className="tabular-nums text-muted">{rupiah(c.revenue)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Belum ada data penjualan.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {health.data ? <HealthStrip health={health.data} /> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg">Pesanan terbaru</h2>
            <Link to="/admin/pesanan" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
              Semua <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <RecentOrders rows={d.recentOrders} />
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg">Produk terlaris</h2>
            <Link to="/admin/produk" className="inline-flex items-center gap-1 text-sm text-accent hover:underline">
              Katalog <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <Card>
            {d.bestSellers.length ? (
              <ul className="divide-y divide-line text-sm">
                {d.bestSellers.map((b) => (
                  <li key={b.id} className="flex items-center justify-between px-4 py-2.5">
                    <Link to={ROUTES.product(b.slug)} className="hover:text-accent">
                      {b.name}
                    </Link>
                    <span className="text-muted">
                      {b.sold} terjual · {rupiah(b.revenue)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-8 text-center text-muted">Belum ada penjualan.</p>
            )}
          </Card>
        </section>
      </div>
    </div>
  );
}

function RevenueBars({ series }: { series: DashboardStats['revenueSeries'] }) {
  const max = Math.max(1, ...series.map((s) => s.revenue));
  if (!series.length) return <p className="text-sm text-muted">Belum ada data.</p>;
  return (
    <div className="flex h-40 items-end gap-1.5">
      {series.map((s) => (
        <div
          key={s.date}
          className="group flex flex-1 flex-col items-center justify-end"
          title={`${s.date}: ${rupiah(s.revenue)}`}
        >
          <div
            className="w-full bg-accent/70 transition-colors group-hover:bg-accent"
            style={{ height: `${Math.max(2, (s.revenue / max) * 100)}%` }}
          />
          <span className="mt-1 hidden text-[10px] text-muted sm:block">{s.date.slice(8)}</span>
        </div>
      ))}
    </div>
  );
}

function HealthStrip({ health }: { health: Health }) {
  const items = [
    { label: 'Pembayaran gagal', value: health.failedPayments },
    { label: 'Pesanan tersangkut', value: health.stuckOrders },
    { label: 'Reservasi kadaluarsa', value: health.expiredReservations },
    { label: 'Webhook gagal', value: health.failedWebhooks },
    { label: 'Chat belum dibaca', value: health.unreadChats },
  ];
  const int = health.integrations;
  const flags = [
    { label: 'Pembayaran', on: int.payments.configured, env: int.payments.environment },
    { label: 'Pengiriman', on: int.shipping.configured, env: int.shipping.environment },
    { label: 'Realtime', on: int.realtime.configured, env: null },
    { label: 'Email', on: int.email.configured, env: int.email.provider },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Kesehatan sistem</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {items.map((i) => (
            <div key={i.label}>
              <span className={i.value > 0 ? 'font-semibold text-red-700' : 'text-muted'}>{i.value}</span>{' '}
              <span className="text-muted">{i.label.toLowerCase()}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {flags.map((f) => (
            <span
              key={f.label}
              className={
                'inline-flex items-center gap-1 rounded-pill border px-2.5 py-0.5 ' +
                (f.on ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-line bg-soft text-muted')
              }
            >
              <span className={'h-1.5 w-1.5 rounded-full ' + (f.on ? 'bg-emerald-500' : 'bg-muted')} />
              {f.label}
              {f.on && f.env ? ` · ${f.env}` : f.on ? '' : ' (belum)'}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RecentOrders({ rows }: { rows: OrderSummary[] }) {
  const columns: Column<OrderSummary>[] = [
    {
      key: 'code',
      header: 'Kode',
      render: (o) => (
        <Link to={`/admin/pesanan/${o.code}`} className="text-accent hover:underline">
          {o.code}
        </Link>
      ),
    },
    {
      key: 'date',
      header: 'Tanggal',
      hideOnMobile: true,
      render: (o) => <span className="text-muted">{o.createdAt.slice(0, 10)}</span>,
    },
    { key: 'total', header: 'Total', render: (o) => <span className="tabular-nums">{rupiah(o.grandTotal)}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (o) => {
        const chip = statusChip(o.status);
        return <span className={'rounded-pill border px-2 py-0.5 text-xs ' + chip.className}>{chip.label}</span>;
      },
    },
  ];
  return <DataTable columns={columns} rows={rows} rowKey={(o) => o.id} />;
}

export default AdminDashboard;
