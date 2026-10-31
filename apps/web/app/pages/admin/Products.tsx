import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ProductStatus } from '@velora/shared';
import { MoreHorizontal, Package, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Media } from '../../components/Media';
import { type Column, DataTable, Pager, SearchBar, StatCard, useSearchQuery } from '../../components/admin/kit';
import { PageHeader } from '../../components/admin/page-header';
import { Button } from '../../components/ui/button';
import { Field, Input, Label, Select } from '../../components/ui/form';
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
import type { AdminProductRow, Paginated } from '../../lib/api-types';
import { rupiah } from '../../lib/format';

const STATUS_LABEL: Record<string, string> = {
  active: 'Aktif',
  draft: 'Draf',
  archived: 'Arsip',
  out_of_stock: 'Stok habis',
};

const STATUS_TONE: Record<string, 'success' | 'outline' | 'warning' | 'danger'> = {
  active: 'success',
  draft: 'outline',
  archived: 'warning',
  out_of_stock: 'danger',
};

export function AdminProducts() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const search = useSearchQuery();
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [deleting, setDeleting] = useState<AdminProductRow | null>(null);
  const [confirmText, setConfirmText] = useState('');

  const list = useQuery<Paginated<AdminProductRow>>({
    queryKey: ['admin', 'products', search.committed, status, page],
    queryFn: () =>
      api.get<Paginated<AdminProductRow>>(
        '/admin/products',
        { q: search.committed || undefined, status: status || undefined, page, pageSize: 20 },
        { anonymous: true },
      ),
  });

  const setStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ProductStatus }) =>
      api.patch(`/admin/products/${id}/status`, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
      toast.push('Status diperbarui', 'success');
    },
    onError: (err) => toast.push(err instanceof ApiError ? err.message : 'Gagal', 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del<{ message?: string }>(`/admin/products/${id}`),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
      toast.push(res.message ?? 'Produk dihapus', 'success');
      setDeleting(null);
    },
    onError: (err) => toast.push(err instanceof ApiError ? err.message : 'Gagal menghapus', 'error'),
  });

  const rows = list.data?.items ?? [];
  const outOfStock = rows.filter((product) => product.totalStock === 0).length;

  const columns: Column<AdminProductRow>[] = [
    {
      key: 'name',
      header: 'Produk',
      render: (product) => (
        <div className="flex items-center gap-3">
          <div className="w-10 shrink-0">
            <Media url={product.primaryImage} label={product.name} aspect="portrait" />
          </div>
          <div className="min-w-0">
            <Link to={`/admin/produk/${product.id}`} className="block truncate font-medium hover:text-accent">
              {product.name}
            </Link>
            <div className="truncate text-xs text-muted">
              {product.sku} · {product.categoryName ?? '—'}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'price',
      header: 'Harga',
      render: (product) => (
        <div className="tabular-nums">
          <div>{rupiah(product.salePrice ?? product.price)}</div>
          {product.salePrice ? <div className="text-xs text-muted line-through">{rupiah(product.price)}</div> : null}
        </div>
      ),
    },
    {
      key: 'stock',
      header: 'Stok',
      hideOnMobile: true,
      render: (product) => (
        <span className={product.totalStock === 0 ? 'font-medium text-red-700' : 'tabular-nums'}>
          {product.totalStock}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (product) => (
        <Select
          value={product.status}
          onChange={(event) =>
            setStatusMutation.mutate({ id: product.id, status: event.target.value as ProductStatus })
          }
          className="h-8 w-32 px-2 text-xs"
          aria-label={`Status ${product.name}`}
        >
          {Object.entries(STATUS_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </Select>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (product) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Aksi ${product.name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => navigate(`/admin/produk/${product.id}`)}>
              <Pencil /> Ubah produk
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void navigator.clipboard.writeText(product.slug)}>
              Salin slug
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setDeleting(product)} className="text-red-800 [&_svg]:text-red-700">
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
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Produk' }]}
        title="Produk"
        description="Katalog, harga, dan status tayang."
        actions={
          <Button asChild>
            <Link to="/admin/produk/baru">
              <Plus /> Produk baru
            </Link>
          </Button>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatCard label="Total hasil" value={list.data?.total ?? '—'} icon={<Package className="h-4 w-4" />} />
        <StatCard label="Stok habis (halaman ini)" value={outOfStock} tone={outOfStock ? 'accent' : undefined} />
        <StatCard
          label="Status aktif (halaman ini)"
          value={rows.filter((product) => product.status === 'active').length}
        />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SearchBar
          value={search.term}
          onChange={search.setTerm}
          onSubmit={() => {
            search.submit();
            setPage(1);
          }}
          placeholder="Cari nama, SKU, atau slug…"
          className="sm:max-w-sm"
        />
        <div className="w-44">
          <Label htmlFor="product-status-filter" className="sr-only">
            Status
          </Label>
          <Select
            id="product-status-filter"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Semua status</option>
            {Object.entries(STATUS_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </div>
        <Button
          variant="secondary"
          onClick={() => {
            search.submit();
            setPage(1);
          }}
        >
          Cari
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={list.isLoading && !list.data}
        rowKey={(product) => product.id}
        empty={search.committed ? `Tidak ada produk yang cocok dengan “${search.committed}”.` : 'Belum ada produk.'}
      />
      {list.data ? (
        <div className="mt-4">
          <Pager page={list.data.page} totalPages={list.data.totalPages} onChange={setPage} />
        </div>
      ) : null}

      <Dialog
        open={Boolean(deleting)}
        onOpenChange={(open) => {
          if (open) return;
          setDeleting(null);
          setConfirmText('');
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus produk?</DialogTitle>
            <DialogDescription>Produk akan hilang dari katalog dan tidak dapat dipulihkan.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 px-5 py-4 text-sm text-muted">
            <p>
              “<span className="font-medium text-ink">{deleting?.name}</span>” akan dihapus dari katalog. Tindakan ini
              tidak dapat dibatalkan.
            </p>
            {deleting ? (
              <div className="flex items-center gap-2">
                <Badge variant={STATUS_TONE[deleting.status] ?? 'outline'}>
                  {STATUS_LABEL[deleting.status] ?? deleting.status}
                </Badge>
                <span className="text-xs">{deleting.sku}</span>
              </div>
            ) : null}
            <Field label="Ketik nama produk untuk konfirmasi">
              <Input
                value={confirmText}
                onChange={(event) => setConfirmText(event.target.value)}
                placeholder={deleting?.name}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              variant="secondary"
              onClick={() => {
                setDeleting(null);
                setConfirmText('');
              }}
            >
              Batal
            </Button>
            <Button
              variant="destructive"
              loading={remove.isPending}
              disabled={!deleting || confirmText.trim() !== deleting.name}
              onClick={() => deleting && remove.mutate(deleting.id)}
            >
              <Trash2 /> Hapus produk
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdminProducts;
