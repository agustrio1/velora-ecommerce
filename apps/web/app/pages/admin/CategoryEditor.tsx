import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { FormSection } from '../../components/admin/kit';
import { ImageField } from '../../components/admin/media-fields';
import { PageHeader } from '../../components/admin/page-header';
import { Button } from '../../components/ui/button';
import { Field, Input, Select, Switch, Textarea } from '../../components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/overlay';
import { useToast } from '../../context/ToastContext';
import { useTaxonomies } from '../../hooks/useTaxonomies';
import { ApiError, api } from '../../lib/api';
import type { Taxonomies } from '../../lib/api-types';

type CategoryRow = Taxonomies['categories'][number];

const CRUMBS = [
  { label: 'Admin', to: '/admin' },
  { label: 'Kategori', to: '/admin/kategori' },
];

/** `/admin/kategori/baru` and `/admin/kategori/:id`. */
export function AdminCategoryEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;
  const taxonomies = useTaxonomies();

  if (!isNew && taxonomies.isLoading && !taxonomies.data) {
    return (
      <div className="space-y-4">
        <PageHeader title="Memuat kategori…" />
        <div className="h-48 animate-pulse rounded-(--radius-card) border border-line bg-soft/40" />
      </div>
    );
  }

  const initial = isNew ? null : (taxonomies.data?.categories.find((c) => c.id === id) ?? null);

  if (!isNew && !initial) {
    return (
      <PageHeader
        breadcrumbs={CRUMBS}
        title="Kategori tidak ditemukan"
        actions={
          <Button asChild variant="secondary">
            <Link to="/admin/kategori">
              <ArrowLeft /> Kembali
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <CategoryForm
      initial={initial}
      siblings={taxonomies.data?.categories ?? []}
      onDone={() => navigate('/admin/kategori')}
    />
  );
}

function CategoryForm({
  initial,
  siblings,
  onDone,
}: {
  initial: CategoryRow | null;
  siblings: CategoryRow[];
  onDone: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const [name, setName] = useState(initial?.name ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [parentId, setParentId] = useState(initial?.parentId ?? '');
  const [imageKey, setImageKey] = useState(initial?.imageKey ?? '');
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [metaTitle, setMetaTitle] = useState(initial?.metaTitle ?? '');
  const [metaDescription, setMetaDescription] = useState(initial?.metaDescription ?? '');
  const [confirmRemove, setConfirmRemove] = useState(false);

  const slugValid = slug === '' || /^[a-z0-9-]+$/.test(slug);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: name.trim(),
        slug: slug.trim() || undefined,
        description: description.trim() || null,
        parentId: parentId || null,
        imageKey: imageKey || null,
        sortOrder: Number(sortOrder) || 0,
        isActive,
        metaTitle: metaTitle.trim() || null,
        metaDescription: metaDescription.trim() || null,
      };
      return initial ? api.post('/admin/categories', body, { id: initial.id }) : api.post('/admin/categories', body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'taxonomies'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
      toast.push('Kategori disimpan', 'success');
      onDone();
    },
    onError: (error) => toast.push(error instanceof ApiError ? error.message : 'Gagal menyimpan', 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/admin/categories/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'taxonomies'] });
      qc.invalidateQueries({ queryKey: ['categories'] });
      toast.push('Kategori dihapus', 'success');
      onDone();
    },
    onError: (error) => toast.push(error instanceof ApiError ? error.message : 'Gagal menghapus', 'error'),
  });

  // A category cannot be its own parent; grandchildren cycles are not offered.
  const parentOptions = siblings.filter((c) => c.id !== initial?.id);

  return (
    <div>
      <PageHeader
        breadcrumbs={[...CRUMBS, { label: initial ? 'Ubah' : 'Baru' }]}
        title={initial ? 'Ubah kategori' : 'Kategori baru'}
        description="Nama, induk, dan status kategori yang tampil di katalog."
        actions={
          <>
            <Button variant="secondary" onClick={onDone}>
              Batal
            </Button>
            <Button
              loading={save.isPending}
              disabled={name.trim().length < 2 || !slugValid}
              onClick={() => save.mutate()}
            >
              <Save /> Simpan
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <FormSection title="Informasi kategori">
            <Field label="Nama" required htmlFor="category-name">
              <Input
                id="category-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                placeholder="Atasan, Bawahan, Aksesori…"
              />
            </Field>

            <Field
              label="Slug"
              htmlFor="category-slug"
              hint="Huruf kecil, angka, dan tanda hubung. Kosongkan untuk dibuat otomatis dari nama."
            >
              <Input
                id="category-slug"
                value={slug}
                onChange={(event) => setSlug(event.target.value.toLowerCase())}
                maxLength={80}
                placeholder="atasan"
              />
            </Field>
            {slugValid ? null : (
              <p className="text-xs text-red-800">Slug hanya boleh berisi huruf kecil, angka, dan tanda hubung.</p>
            )}

            <Field label="Deskripsi" htmlFor="category-description" hint="Muncul di atas daftar produk kategori.">
              <Textarea
                id="category-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="min-h-32"
                maxLength={1000}
              />
            </Field>

            <ImageField
              label="Gambar kategori"
              folder="categories"
              imageKey={imageKey}
              onChange={(key) => setImageKey(key)}
              hint="Dipakai pada kartu kategori di beranda."
            />
          </FormSection>

          <FormSection title="SEO">
            <Field label="Meta title" htmlFor="category-meta-title" hint="Maksimal 180 karakter.">
              <Input
                id="category-meta-title"
                value={metaTitle}
                onChange={(event) => setMetaTitle(event.target.value)}
                maxLength={180}
              />
            </Field>
            <Field label="Meta description" htmlFor="category-meta-description" hint="Maksimal 320 karakter.">
              <Textarea
                id="category-meta-description"
                value={metaDescription}
                onChange={(event) => setMetaDescription(event.target.value)}
                maxLength={320}
              />
            </Field>
          </FormSection>
        </div>

        <div className="space-y-4">
          <FormSection title="Pengaturan">
            <Field label="Kategori induk" htmlFor="category-parent" hint="Kosongkan untuk kategori tingkat atas.">
              <Select id="category-parent" value={parentId} onChange={(event) => setParentId(event.target.value)}>
                <option value="">— Tanpa induk —</option>
                {parentOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Urutan" htmlFor="category-sort" hint="Angka kecil tampil lebih dulu.">
              <Input
                id="category-sort"
                inputMode="numeric"
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value.replace(/\D/g, ''))}
              />
            </Field>

            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-ink">Tampilkan di toko</div>
                <div className="text-xs text-muted">Matikan untuk menyembunyikan tanpa menghapus.</div>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} aria-label="Tampilkan kategori di toko" />
            </div>
          </FormSection>

          {initial ? (
            <FormSection title="Zona berbahaya">
              <p className="text-xs text-muted">
                {initial.productCount > 0
                  ? `${initial.productCount} produk memakai kategori ini. Hapus tidak tersedia — nonaktifkan saja.`
                  : 'Kategori ini belum dipakai produk sehingga dapat dihapus permanen.'}
              </p>
              <Button variant="destructive" disabled={initial.productCount > 0} onClick={() => setConfirmRemove(true)}>
                <Trash2 /> Hapus kategori
              </Button>
            </FormSection>
          ) : null}
        </div>
      </div>

      <Dialog open={confirmRemove} onOpenChange={(next) => (next ? undefined : setConfirmRemove(false))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus kategori?</DialogTitle>
            <DialogDescription>“{initial?.name ?? ''}” akan dihapus permanen.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmRemove(false)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              loading={remove.isPending}
              onClick={() => initial && remove.mutate(initial.id)}
            >
              <Trash2 /> Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdminCategoryEditorPage;
