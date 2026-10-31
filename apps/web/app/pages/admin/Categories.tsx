import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { type Column, DataTable, SearchBar, StatCard } from '../../components/admin/kit';
import { mediaSrc } from '../../components/admin/media-fields';
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
import { useTaxonomies } from '../../hooks/useTaxonomies';
import { ApiError, api } from '../../lib/api';
import type { Taxonomies } from '../../lib/api-types';

type CategoryRow = Taxonomies['categories'][number];

/**
 * `/admin/kategori` — category list with activate/deactivate.
 *
 * Deactivating is a normal upsert with `isActive: false`; the storefront hides
 * inactive categories while their products stay untouched.
 */
export function AdminCategories() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const taxonomies = useTaxonomies();
  const [term, setTerm] = useState('');
  const [removing, setRemoving] = useState<CategoryRow | null>(null);

  /** The upsert replaces every column, so the whole row has to travel with it. */
  const payload = (row: CategoryRow, overrides: { isActive?: boolean } = {}) => ({
    name: row.name,
    slug: row.slug,
    description: row.description,
    parentId: row.parentId,
    imageKey: row.imageKey,
    sortOrder: row.sortOrder,
    isActive: overrides.isActive ?? row.isActive,
    metaTitle: row.metaTitle,
    metaDescription: row.metaDescription,
  });

  const toggle = useMutation({
    mutationFn: (row: CategoryRow) =>
      api.post('/admin/categories', payload(row, { isActive: !row.isActive }), { id: row.id }),
    onSuccess: (_ok, row) => {
      qc.invalidateQueries({ queryKey: ['admin', 'taxonomies'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
      toast.push(row.isActive ? 'Kategori dinonaktifkan' : 'Kategori diaktifkan', 'success');
    },
    onError: (error) => toast.push(error instanceof ApiError ? error.message : 'Gagal mengubah status', 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/admin/categories/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'taxonomies'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
      toast.push('Kategori dihapus', 'success');
      setRemoving(null);
    },
    onError: (error) => toast.push(error instanceof ApiError ? error.message : 'Gagal menghapus', 'error'),
  });

  const all = taxonomies.data?.categories ?? [];
  const needle = term.trim().toLowerCase();
  const rows = needle
    ? all.filter((c) => `${c.name} ${c.slug} ${c.description ?? ''}`.toLowerCase().includes(needle))
    : all;
  const nameOf = new Map(all.map((c) => [c.id, c.name]));
  const activeCount = all.filter((c) => c.isActive).length;

  const columns: Column<CategoryRow>[] = [
    {
      key: 'name',
      header: 'Kategori',
      render: (c) => (
        <div className="flex min-w-0 items-center gap-3">
          <div className="hidden h-10 w-10 shrink-0 overflow-hidden rounded-(--radius-card) border border-line bg-soft sm:block">
            {mediaSrc(c.imageUrl) ? (
              <img src={mediaSrc(c.imageUrl) ?? ''} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : null}
          </div>
          <div className="min-w-0">
            <Link to={`/admin/kategori/${c.id}`} className="block truncate font-medium hover:text-accent">
              {c.name}
            </Link>
            <div className="truncate text-xs text-muted">/{c.slug}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'parent',
      header: 'Induk',
      hideOnMobile: true,
      render: (c) => <span className="text-muted">{(c.parentId && nameOf.get(c.parentId)) || '—'}</span>,
    },
    {
      key: 'products',
      header: 'Produk',
      render: (c) => <span className="tabular-nums">{c.productCount}</span>,
    },
    {
      key: 'sort',
      header: 'Urutan',
      hideOnMobile: true,
      render: (c) => <span className="tabular-nums text-muted">{c.sortOrder}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => <Badge variant={c.isActive ? 'success' : 'outline'}>{c.isActive ? 'Aktif' : 'Nonaktif'}</Badge>,
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (c) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Aksi ${c.name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onSelect={() => navigate(`/admin/kategori/${c.id}`)}>
              <Pencil /> Ubah
            </DropdownMenuItem>
            <DropdownMenuItem disabled={toggle.isPending} onSelect={() => toggle.mutate(c)}>
              {c.isActive ? (
                <>
                  <EyeOff /> Nonaktifkan
                </>
              ) : (
                <>
                  <Eye /> Aktifkan
                </>
              )}
            </DropdownMenuItem>
            {c.productCount === 0 ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setRemoving(c)} className="text-red-800 [&_svg]:text-red-700">
                  <Trash2 /> Hapus
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Kategori' }]}
        title="Kategori"
        description="Susun kategori katalog. Kategori nonaktif disembunyikan dari toko."
        actions={
          <Button asChild>
            <Link to="/admin/kategori/baru">
              <Plus /> Kategori baru
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Total kategori" value={all.length} />
        <StatCard label="Aktif" value={activeCount} tone="accent" />
        <StatCard label="Nonaktif" value={all.length - activeCount} hint={`${rows.length} baris tampil`} />
      </div>

      <SearchBar value={term} onChange={setTerm} placeholder="Cari nama atau slug kategori…" className="sm:max-w-sm" />

      <DataTable
        columns={columns}
        rows={rows}
        loading={taxonomies.isLoading && !taxonomies.data}
        rowKey={(c) => c.id}
        empty="Belum ada kategori yang cocok."
      />

      <p className="text-xs text-muted">
        Kategori yang masih dipakai produk tidak dapat dihapus — nonaktifkan saja agar tetap tersimpan untuk laporan.
      </p>

      <Dialog open={Boolean(removing)} onOpenChange={(next) => (next ? undefined : setRemoving(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus kategori?</DialogTitle>
            <DialogDescription>
              “{removing?.name ?? ''}” akan dihapus permanen. Nonaktifkan saja bila hanya ingin menyembunyikannya.
            </DialogDescription>
          </DialogHeader>
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

export default AdminCategories;
