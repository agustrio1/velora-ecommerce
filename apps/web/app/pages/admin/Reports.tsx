import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useState } from 'react';
import { StatCard } from '../../components/admin/kit';
import { PageHeader } from '../../components/admin/page-header';
import { Button } from '../../components/ui/button';
import { Field, Input, Select, Spinner } from '../../components/ui/form';
import { Card } from '../../components/ui/surface';
import { useToast } from '../../context/ToastContext';
import { api } from '../../lib/api';
import type { ReportResponse, SalesSummary } from '../../lib/api-types';
import { config } from '../../lib/config';
import { currentIdToken } from '../../lib/firebase';
import { rupiah } from '../../lib/format';

const KINDS: { id: string; label: string }[] = [
  { id: 'sales_by_day', label: 'Penjualan harian' },
  { id: 'sales_by_product', label: 'Penjualan per produk' },
  { id: 'sales_by_category', label: 'Penjualan per kategori' },
  { id: 'sales_by_payment', label: 'Penjualan per metode bayar' },
  { id: 'orders', label: 'Pesanan' },
  { id: 'customers', label: 'Pelanggan' },
  { id: 'inventory', label: 'Inventaris' },
];

export function AdminReports() {
  const toast = useToast();
  const [kind, setKind] = useState('sales_by_day');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const range = { from: from || undefined, to: to || undefined };

  const summary = useQuery<SalesSummary>({
    queryKey: ['admin', 'reports', 'summary', from, to],
    queryFn: () => api.get<SalesSummary>('/admin/reports/summary', range, { anonymous: true }),
  });

  const report = useQuery<ReportResponse>({
    queryKey: ['admin', 'reports', kind, from, to],
    queryFn: () => api.get<ReportResponse>(`/admin/reports/${kind}`, range, { anonymous: true }),
  });

  async function downloadCsv() {
    try {
      const token = await currentIdToken();
      const params = new URLSearchParams({ format: 'csv' });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const res = await fetch(`${config.apiBase}/api/admin/reports/${kind}?${params}`, {
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Gagal mengunduh');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `velora-${kind.replace(/_/g, '-')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.push('Gagal mengunduh CSV', 'error');
    }
  }

  const columns = report.data?.rows.length ? Object.keys(report.data.rows[0]) : [];

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Laporan' }]}
        title="Laporan"
        description="Ringkasan penjualan dan ekspor CSV."
        actions={
          <Button variant="secondary" onClick={() => void downloadCsv()}>
            <Download /> Unduh CSV
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <Field label="Dari" htmlFor="report-from">
          <Input
            id="report-from"
            type="date"
            value={from}
            onChange={(event) => setFrom(event.target.value)}
            className="w-44"
          />
        </Field>
        <Field label="Sampai" htmlFor="report-to">
          <Input
            id="report-to"
            type="date"
            value={to}
            onChange={(event) => setTo(event.target.value)}
            className="w-44"
          />
        </Field>
        <Field label="Jenis laporan" htmlFor="report-kind">
          <Select id="report-kind" value={kind} onChange={(event) => setKind(event.target.value)} className="w-56">
            {KINDS.map((k) => (
              <option key={k.id} value={k.id}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        {from || to ? (
          <Button
            variant="ghost"
            onClick={() => {
              setFrom('');
              setTo('');
            }}
          >
            Reset rentang
          </Button>
        ) : null}
      </div>

      {summary.data ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Pesanan"
            value={summary.data.orders}
            hint={`${summary.data.cancelledCount} batal/refund dikecualikan`}
          />
          <StatCard label="Pendapatan" value={rupiah(summary.data.revenue)} tone="accent" />
          <StatCard label="Rata-rata order" value={rupiah(summary.data.avgOrderValue)} />
          <StatCard label="Total diskon" value={rupiah(summary.data.discounts)} tone="muted" />
        </div>
      ) : null}

      {report.isLoading && !report.data ? (
        <Spinner label="Memuat laporan…" />
      ) : report.data && report.data.rows.length ? (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-xl border-collapse text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas/60 text-left">
                  {columns.map((col) => (
                    <th
                      key={col}
                      className="whitespace-nowrap px-4 py-2.5 text-[0.7rem] font-semibold uppercase tracking-wider text-muted"
                    >
                      {col.replace(/_/g, ' ')}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.data.rows.map((row, index) => (
                  <tr key={index} className="border-b border-line last:border-0">
                    {columns.map((col) => (
                      <td key={col} className="px-4 py-2.5">
                        {typeof row[col] === 'number' ? (
                          <span className="tabular-nums">{formatCell(col, row[col] as number)}</span>
                        ) : (
                          String(row[col] ?? '—')
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-line px-4 py-3 text-xs text-muted">
            {report.data.rows.length} baris · total {report.data.total}
          </div>
        </Card>
      ) : (
        <p className="py-10 text-center text-sm text-muted">Tidak ada data untuk rentang ini.</p>
      )}
    </div>
  );
}

const MONEY_COLS = /pendapatan|belanja|total|harga|subtotal|diskon|ongkir|pajak|biaya/i;
function formatCell(col: string, value: number): string {
  return MONEY_COLS.test(col) ? rupiah(value) : String(value);
}

export default AdminReports;
