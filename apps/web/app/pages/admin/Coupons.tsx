import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { COUPON_TYPE } from '@velora/shared';
import { MoreHorizontal, Pencil, Plus, Tags, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { type Column, DataTable, Pager, SearchBar, StatCard } from '../../components/admin/kit';
import { PageHeader } from '../../components/admin/page-header';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/overlay';
import { Badge } from '../../components/ui/surface';
import { useToast } from '../../context/ToastContext';
import { ApiError, api } from '../../lib/api';
import type { CouponRow, Paginated } from '../../lib/api-types';
import { dateOnly, rupiah } from '../../lib/format';

export function AdminCoupons() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [term, setTerm] = useState('');
  const [removing, setRemoving] = useState<CouponRow | null>(null);

  const list = useQuery<Paginated<CouponRow>>({
    queryKey: ['admin', 'coupons', page],
    queryFn: () => api.get<Paginated<CouponRow>>('/admin/coupons', { page, pageSize: 20 }, { anonymous: true }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/admin/coupons/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'coupons'] });
      toast.push('Kupon dihapus', 'success');
      setRemoving(null);
    },
    onError: (error) => toast.push(error instanceof ApiError ? error.message : 'Gagal menghapus', 'error'),
  });

  const rows = (list.data?.items ?? []).filter((coupon) => {
    const needle = term.trim().toLowerCase();
    if (!needle) return true;
    return `${coupon.code} ${coupon.name}`.toLowerCase().includes(needle);
  });

  const activeCount = rows.filter((coupon) => coupon.isActive).length;

  const columns: Column<CouponRow>[] = [
    {
      key: 'code',
      header: 'Kode',
      render: (coupon) => (
        <div>
          <Link to={`/admin/promo/${coupon.id}`} className="font-mono font-medium tracking-wide hover:text-accent">
            {coupon.code}
          </Link>
          <div className="text-xs text-muted">{coupon.name}</div>
        </div>
      ),
    },
    {
      key: 'discount',
      header: 'Diskon',
      render: (coupon) => (
        <span className="text-sm">
          {coupon.type === COUPON_TYPE.PERCENT
            ? `${coupon.value}%`
            : coupon.type === COUPON_TYPE.FIXED
              ? rupiah(coupon.value)
              : 'Ongkir gratis'}
          {coupon.maxDiscount ? <span className="text-muted"> (maks {rupiah(coupon.maxDiscount)})</span> : null}
        </span>
      ),
    },
    {
      key: 'min',
      header: 'Min. belanja',
      hideOnMobile: true,
      render: (coupon) => <span className="text-muted">{coupon.minPurchase ? rupiah(coupon.minPurchase) : '—'}</span>,
    },
    {
      key: 'used',
      header: 'Dipakai',
      render: (coupon) => (
        <span className="tabular-nums">
          {coupon.usedCount}
          {coupon.usageLimit ? ` / ${coupon.usageLimit}` : ''}
        </span>
      ),
    },
    {
      key: 'window',
      header: 'Berlaku',
      hideOnMobile: true,
      render: (coupon) => (
        <span className="text-xs text-muted">
          {dateOnly(coupon.startsAt)} – {dateOnly(coupon.endsAt)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (coupon) => (
        <Badge variant={coupon.isActive ? 'success' : 'outline'}>{coupon.isActive ? 'Aktif' : 'Nonaktif'}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (coupon) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Aksi ${coupon.code}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => navigate(`/admin/promo/${coupon.id}`)}>
              <Pencil /> Ubah kupon
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setRemoving(coupon)} className="text-red-800 [&_svg]:text-red-700">
              <Trash2 /> Hapus
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Promo' }]}
        title="Promo"
        description="Kupon diskon, nominal tetap, dan gratis ongkir."
        actions={
          <Button asChild>
            <Link to="/admin/promo/baru">
              <Plus /> Kupon baru
            </Link>
          </Button>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Total kupon" value={list.data?.total ?? '—'} icon={<Tags className="h-4 w-4" />} />
        <StatCard label="Aktif (halaman ini)" value={activeCount} tone="accent" />
        <StatCard label="Pemakaian (halaman ini)" value={rows.reduce((sum, coupon) => sum + coupon.usedCount, 0)} />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <SearchBar value={term} onChange={setTerm} placeholder="Cari kode atau nama kupon…" className="sm:max-w-sm" />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={list.isLoading && !list.data}
        rowKey={(coupon) => coupon.id}
        empty={term ? `Tidak ada kupon yang cocok dengan “${term}”.` : 'Belum ada kupon.'}
      />
      {list.data ? (
        <div className="mt-4">
          <Pager page={list.data.page} totalPages={list.data.totalPages} onChange={setPage} />
        </div>
      ) : null}

      <Dialog open={Boolean(removing)} onOpenChange={(open) => (open ? undefined : setRemoving(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus kupon?</DialogTitle>
            <DialogDescription>Kupon tidak dapat dipulihkan setelah dihapus.</DialogDescription>
          </DialogHeader>
          <p className="px-5 py-4 text-sm text-muted">
            Kupon <span className="font-mono font-medium text-ink">{removing?.code}</span> akan dihapus permanen.
          </p>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              loading={remove.isPending}
              onClick={() => removing && remove.mutate(removing.id)}
            >
              <Trash2 /> Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdminCoupons;
