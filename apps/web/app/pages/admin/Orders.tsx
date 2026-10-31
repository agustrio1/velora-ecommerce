import { useQuery } from '@tanstack/react-query';
import { ORDER_STATUSES, type OrderSummary } from '@velora/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { type Column, DataTable, Pager, SearchBar, StatCard, useSearchQuery } from '../../components/admin/kit';
import { PageHeader } from '../../components/admin/page-header';
import { Button } from '../../components/ui/button';
import { Select } from '../../components/ui/form';
import { Badge } from '../../components/ui/surface';
import { api } from '../../lib/api';
import type { Paginated } from '../../lib/api-types';
import { ORDER_STATUS_LABEL, dateOnly, rupiah, statusChip } from '../../lib/format';

export function AdminOrders() {
  const navigate = useNavigate();
  const search = useSearchQuery();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  const list = useQuery<Paginated<OrderSummary>>({
    queryKey: ['admin', 'orders', search.committed, status, page],
    queryFn: () =>
      api.get<Paginated<OrderSummary>>(
        '/admin/orders',
        { q: search.committed || undefined, status: status || undefined, page, pageSize: 20 },
        { anonymous: true },
      ),
  });

  const rows = list.data?.items ?? [];
  const paid = rows.filter((o) => o.status === 'paid' || o.status === 'processing').length;
  const pending = rows.filter((o) => o.status === 'pending_payment').length;
  const revenue = rows.reduce((sum, o) => sum + o.grandTotal, 0);

  const columns: Column<OrderSummary>[] = [
    { key: 'code', header: 'Kode', render: (o) => <span className="font-medium">{o.code}</span> },
    {
      key: 'date',
      header: 'Tanggal',
      hideOnMobile: true,
      render: (o) => <span className="text-muted">{dateOnly(o.createdAt)}</span>,
    },
    { key: 'items', header: 'Item', hideOnMobile: true, render: (o) => o.itemCount },
    { key: 'total', header: 'Total', render: (o) => <span className="tabular-nums">{rupiah(o.grandTotal)}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (o) => {
        const chip = statusChip(o.status);
        return <span className={'rounded-pill border px-2 py-0.5 text-xs ' + chip.className}>{chip.label}</span>;
      },
    },
    {
      key: 'payment',
      header: 'Bayar',
      hideOnMobile: true,
      render: (o) => <span className="text-muted">{o.paymentStatus ?? '—'}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Pesanan' }]}
        title="Pesanan"
        description="Kelola status, pengiriman, dan pengembalian dana."
        actions={
          status ? (
            <Button variant="ghost" onClick={() => setStatus('')}>
              Hapus filter
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Pesanan (halaman ini)" value={rows.length} />
        <StatCard label="Perlu tindakan" value={pending + paid} hint="Menunggu bayar atau diproses" />
        <StatCard label="Nilai halaman" value={rupiah(revenue)} tone="accent" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SearchBar
          value={search.term}
          onChange={(value) => {
            search.setTerm(value);
            setPage(1);
          }}
          onSubmit={() => {
            search.submit();
            setPage(1);
          }}
          placeholder="Cari kode, email, penerima…"
          className="sm:max-w-sm"
        />
        <Select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          className="h-10 w-48"
          aria-label="Filter status pesanan"
        >
          <option value="">Semua status</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        <Button variant="secondary" onClick={() => setPage(1)}>
          Cari
        </Button>
        {search.committed || status ? (
          <Badge variant="outline">
            {search.committed ? `“${search.committed}”` : 'Semua'}
            {status ? ` · ${ORDER_STATUS_LABEL[status as keyof typeof ORDER_STATUS_LABEL]}` : ''}
          </Badge>
        ) : null}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={list.isLoading && !list.data}
        rowKey={(o) => o.id}
        onRowClick={(o) => navigate(`/admin/pesanan/${o.code}`)}
        empty="Tidak ada pesanan yang cocok."
        footer={list.data ? <Pager page={list.data.page} totalPages={list.data.totalPages} onChange={setPage} /> : null}
      />
    </div>
  );
}

export default AdminOrders;
