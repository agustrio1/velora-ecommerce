import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import { useState } from 'react';
import { type Column, DataTable, Pager, StatCard } from '../../components/admin/kit';
import { PageHeader } from '../../components/admin/page-header';
import { Button } from '../../components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/overlay';
import { useToast } from '../../context/ToastContext';
import { ApiError, api } from '../../lib/api';
import type { AdminReviewRow, Paginated } from '../../lib/api-types';
import { dateTime } from '../../lib/format';

const STATUS_LABEL: Record<AdminReviewRow['status'], string> = {
  published: 'Tayang',
  pending: 'Menunggu',
  rejected: 'Ditolak',
};

const TABS = [
  { value: 'pending', label: 'Menunggu' },
  { value: 'published', label: 'Tayang' },
  { value: 'rejected', label: 'Ditolak' },
  { value: 'all', label: 'Semua' },
];

export function AdminReviews() {
  const qc = useQueryClient();
  const toast = useToast();
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);

  const list = useQuery<Paginated<AdminReviewRow>>({
    queryKey: ['admin', 'reviews', status, page],
    queryFn: () =>
      api.get<Paginated<AdminReviewRow>>(
        '/admin/reviews',
        { status: status === 'all' ? undefined : status, page, pageSize: 20 },
        { anonymous: true },
      ),
  });

  const moderate = useMutation({
    mutationFn: ({ id, next }: { id: string; next: AdminReviewRow['status'] }) =>
      api.patch(`/admin/reviews/${id}`, { status: next }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'reviews'] });
      toast.push('Ulasan diperbarui', 'success');
    },
    onError: (err) => toast.push(err instanceof ApiError ? err.message : 'Gagal memperbarui', 'error'),
  });

  const rows = list.data?.items ?? [];
  const average = rows.length ? rows.reduce((sum, r) => sum + r.rating, 0) / rows.length : 0;

  const columns: Column<AdminReviewRow>[] = [
    {
      key: 'product',
      header: 'Produk',
      render: (r) => (
        <div>
          <div className="font-medium">{r.productName}</div>
          <div className="text-xs text-muted">{r.email}</div>
        </div>
      ),
    },
    {
      key: 'rating',
      header: 'Nilai',
      render: (r) => (
        <span className="inline-flex items-center gap-1 tabular-nums">
          <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" /> {r.rating}
        </span>
      ),
    },
    {
      key: 'review',
      header: 'Ulasan',
      render: (r) => (
        <div className="max-w-md">
          {r.title ? <div className="font-medium">{r.title}</div> : null}
          <div className="text-xs text-muted">{r.body}</div>
          <div className="mt-0.5 text-[11px] text-muted">
            {dateTime(r.createdAt)}
            {r.verifiedPurchase ? ' · pembelian terverifikasi' : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      hideOnMobile: true,
      render: (r) => (
        <span
          className={
            'rounded-pill border px-2 py-0.5 text-xs ' +
            (r.status === 'published'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : r.status === 'rejected'
                ? 'border-red-200 bg-red-50 text-red-800'
                : 'border-amber-200 bg-amber-50 text-amber-900')
          }
        >
          {STATUS_LABEL[r.status]}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (r) => (
        <div className="flex justify-end gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            disabled={r.status === 'published' || moderate.isPending}
            onClick={() => moderate.mutate({ id: r.id, next: 'published' })}
          >
            Setujui
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={r.status === 'rejected' || moderate.isPending}
            onClick={() => moderate.mutate({ id: r.id, next: 'rejected' })}
          >
            Tolak
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Ulasan' }]}
        title="Ulasan"
        description="Moderasi ulasan produk sebelum tayang."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Ulasan (halaman ini)" value={rows.length} />
        <StatCard label="Rata-rata nilai" value={average ? average.toFixed(1) : '—'} tone="accent" />
        <StatCard
          label="Total hasil"
          value={list.data?.total ?? 0}
          hint={TABS.find((t) => t.value === status)?.label}
        />
      </div>

      <Tabs
        value={status}
        onValueChange={(value) => {
          setStatus(value);
          setPage(1);
        }}
      >
        <TabsList>
          {TABS.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <DataTable
        columns={columns}
        rows={rows}
        loading={list.isLoading && !list.data}
        rowKey={(r) => r.id}
        empty="Tidak ada ulasan pada status ini."
        footer={list.data ? <Pager page={list.data.page} totalPages={list.data.totalPages} onChange={setPage} /> : null}
      />
    </div>
  );
}

export default AdminReviews;
