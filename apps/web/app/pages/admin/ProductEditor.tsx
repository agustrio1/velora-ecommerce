import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PRODUCT_STATUS, type ProductStatus } from '@velora/shared';
import { ArrowLeft, Images, Info, Plus, Save, Search, Shapes, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { FormSection } from '../../components/admin/kit';
import { type GalleryImage, ImageGallery } from '../../components/admin/media-fields';
import { PageHeader } from '../../components/admin/page-header';
import { Button } from '../../components/ui/button';
import { Field, Input, Select, Switch, Textarea } from '../../components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/overlay';
import { Badge } from '../../components/ui/surface';
import { useToast } from '../../context/ToastContext';
import { useTaxonomies } from '../../hooks/useTaxonomies';
import { ApiError, api } from '../../lib/api';
import type { AdminProductDetail, Taxonomies } from '../../lib/api-types';
import { cn } from '../../lib/utils';

interface VariantDraft {
  sku: string;
  price: string;
  salePrice: string;
  weightGrams: string;
  stock: number;
  status: 'active' | 'inactive';
}

const KEY_SEP = '::';
const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
const toInt = (value: string | number): number => {
  const parsed = typeof value === 'number' ? value : Number.parseInt(value.replace(/\D/g, ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const STATUS_OPTIONS: { value: ProductStatus; label: string }[] = [
  { value: PRODUCT_STATUS.DRAFT, label: 'Draf' },
  { value: PRODUCT_STATUS.ACTIVE, label: 'Aktif' },
  { value: PRODUCT_STATUS.OUT_OF_STOCK, label: 'Stok habis' },
  { value: PRODUCT_STATUS.ARCHIVED, label: 'Arsip' },
];

/**
 * Full-page product workspace (`/admin/produk/baru` and `/admin/produk/:id`).
 * Replaces the old modal editor; every section is a tab so long catalog
 * records stay navigable on a laptop screen.
 */
export function AdminProductEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;

  const detail = useQuery<AdminProductDetail>({
    queryKey: ['admin', 'product', id],
    queryFn: () => api.get<AdminProductDetail>(`/admin/products/${id}`, undefined, { anonymous: true }),
    enabled: Boolean(id),
  });

  if (detail.isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Memuat produk…" />
        <div className="h-64 animate-pulse rounded-(--radius-card) border border-line bg-soft/40" />
      </div>
    );
  }

  if (detail.isError) {
    return (
      <div className="space-y-4">
        <PageHeader
          breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Produk', to: '/admin/produk' }, { label: 'Error' }]}
          title="Produk tidak ditemukan"
          description="Data mungkin sudah dihapus atau tautannya salah."
          actions={
            <Button asChild variant="secondary">
              <Link to="/admin/produk">
                <ArrowLeft /> Kembali
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  return <ProductForm initial={detail.data ?? null} isNew={isNew} onDone={() => navigate('/admin/produk')} />;
}

function ProductForm({
  initial,
  isNew,
  onDone,
}: {
  initial: AdminProductDetail | null;
  isNew: boolean;
  onDone: () => void;
}) {
  const toast = useToast();
  const qc = useQueryClient();
  const taxonomies = useTaxonomies();
  const categories = taxonomies.data?.categories ?? [];
  const brands = taxonomies.data?.brands ?? [];

  const [base, setBase] = useState({
    name: initial?.name ?? '',
    slug: initial?.slug ?? '',
    sku: initial?.sku ?? '',
    description: initial?.description ?? '',
    categoryId: initial?.categoryId ?? '',
    brandId: initial?.brandId ?? '',
    material: initial?.material ?? '',
    price: initial?.price ? String(initial.price) : '',
    salePrice: initial?.salePrice ? String(initial.salePrice) : '',
    weightGrams: initial?.weightGrams ? String(initial.weightGrams) : '200',
    status: (initial?.status ?? PRODUCT_STATUS.DRAFT) as ProductStatus,
    isFeatured: initial?.isFeatured ?? false,
    isNewArrival: initial?.isNewArrival ?? false,
    isBestSeller: initial?.isBestSeller ?? false,
    metaTitle: initial?.metaTitle ?? '',
    metaDescription: initial?.metaDescription ?? '',
  });
  const [colorIds, setColorIds] = useState<string[]>(initial?.colors ?? []);
  const [sizeIds, setSizeIds] = useState<string[]>(initial?.sizes ?? []);
  const [images, setImages] = useState<GalleryImage[]>(
    initial?.images.map((image) => ({ imageKey: image.imageKey, alt: image.alt ?? '', isPrimary: image.isPrimary })) ??
      [],
  );
  const [variants, setVariants] = useState<Record<string, VariantDraft>>(() => {
    const seed: Record<string, VariantDraft> = {};
    for (const variant of initial?.variants ?? []) {
      seed[`${variant.colorId}${KEY_SEP}${variant.sizeId}`] = {
        sku: variant.sku,
        price: variant.price != null ? String(variant.price) : '',
        salePrice: variant.salePrice != null ? String(variant.salePrice) : '',
        weightGrams: variant.weightGrams != null ? String(variant.weightGrams) : '',
        stock: variant.stock,
        status: variant.status === 'inactive' ? 'inactive' : 'active',
      };
    }
    return seed;
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [tab, setTab] = useState('detail');

  // Warna/ukuran baru dibuat langsung dari form ini; digabung dengan taksonomi
  // agar pil dan baris matriks langsung tampil sebelum cache selesai diambil ulang.
  const [createdColors, setCreatedColors] = useState<Taxonomies['colors']>([]);
  const [createdSizes, setCreatedSizes] = useState<Taxonomies['sizes']>([]);
  const [addingColor, setAddingColor] = useState(false);
  const [colorDraft, setColorDraft] = useState({ name: '', hexCode: '#191919' });
  const [addingSize, setAddingSize] = useState(false);
  const [sizeDraft, setSizeDraft] = useState({ code: '', name: '' });

  const colors = useMemo(() => {
    const base = taxonomies.data?.colors ?? [];
    return [...base, ...createdColors.filter((color) => !base.some((item) => item.id === color.id))];
  }, [taxonomies.data, createdColors]);
  const sizes = useMemo(() => {
    const base = taxonomies.data?.sizes ?? [];
    return [...base, ...createdSizes.filter((size) => !base.some((item) => item.id === size.id))];
  }, [taxonomies.data, createdSizes]);

  const colorById = useMemo(() => new Map(colors.map((color) => [color.id, color])), [colors]);
  const sizeById = useMemo(() => new Map(sizes.map((size) => [size.id, size])), [sizes]);

  function variantKey(colorId: string, sizeId: string) {
    return `${colorId}${KEY_SEP}${sizeId}`;
  }
  function getDraft(colorId: string, sizeId: string): VariantDraft {
    const existing = variants[variantKey(colorId, sizeId)];
    if (existing) return existing;
    const color = colorById.get(colorId);
    const size = sizeById.get(sizeId);
    const auto = [base.sku || slugify(base.name), color?.slug, size?.code].filter(Boolean).join('-').toUpperCase();
    return { sku: auto, price: '', salePrice: '', weightGrams: '', stock: 0, status: 'active' };
  }
  function patchDraft(colorId: string, sizeId: string, patch: Partial<VariantDraft>) {
    setVariants((prev) => ({
      ...prev,
      [variantKey(colorId, sizeId)]: { ...getDraft(colorId, sizeId), ...patch },
    }));
  }
  function toggle(list: string[], id: string, setter: (value: string[]) => void) {
    setter(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = buildPayload();
      if (initial) return api.put<{ id: string }>(`/admin/products/${initial.id}`, payload);
      return api.post<{ id: string; slug: string }>('/admin/products', payload);
    },
    onSuccess: () => {
      toast.push(initial ? 'Produk diperbarui' : 'Produk dibuat', 'success');
      qc.invalidateQueries({ queryKey: ['admin', 'products'] });
      qc.invalidateQueries({ queryKey: ['admin', 'product'] });
      onDone();
    },
    onError: (error) => {
      if (error instanceof ApiError && Object.keys(error.fieldErrors).length) {
        setErrors(error.fieldErrors);
        toast.push('Periksa kembali isian produk.', 'error');
      } else {
        toast.push(error instanceof ApiError ? error.message : 'Gagal menyimpan produk', 'error');
      }
    },
  });

  const createColor = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>('/admin/colors', {
        name: colorDraft.name.trim(),
        hexCode: colorDraft.hexCode,
      }),
    onSuccess: ({ id }) => {
      const name = colorDraft.name.trim();
      setCreatedColors((prev) => [
        ...prev,
        { id, name, slug: slugify(name), hexCode: colorDraft.hexCode, productCount: 0 },
      ]);
      setColorIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      setColorDraft({ name: '', hexCode: '#191919' });
      setAddingColor(false);
      qc.invalidateQueries({ queryKey: ['admin', 'taxonomies'] });
      toast.push('Warna ditambahkan', 'success');
    },
    onError: (error) => toast.push(error instanceof ApiError ? error.message : 'Gagal menambah warna', 'error'),
  });

  const createSize = useMutation({
    mutationFn: () =>
      api.post<{ id: string }>('/admin/sizes', {
        code: sizeDraft.code.trim().toUpperCase(),
        name: sizeDraft.name.trim() || sizeDraft.code.trim().toUpperCase(),
        sortOrder: sizes.length,
      }),
    onSuccess: ({ id }) => {
      const code = sizeDraft.code.trim().toUpperCase();
      setCreatedSizes((prev) => [
        ...prev,
        { id, code, name: sizeDraft.name.trim() || code, sortOrder: sizes.length, sizeGuideId: null, variantCount: 0 },
      ]);
      setSizeIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
      setSizeDraft({ code: '', name: '' });
      setAddingSize(false);
      qc.invalidateQueries({ queryKey: ['admin', 'taxonomies'] });
      toast.push('Ukuran ditambahkan', 'success');
    },
    onError: (error) => toast.push(error instanceof ApiError ? error.message : 'Gagal menambah ukuran', 'error'),
  });

  function buildPayload() {
    const variantList = [];
    for (const colorId of colorIds) {
      for (const sizeId of sizeIds) {
        const draft = getDraft(colorId, sizeId);
        variantList.push({
          colorId,
          sizeId,
          sku: draft.sku,
          price: draft.price ? toInt(draft.price) : undefined,
          salePrice: draft.salePrice ? toInt(draft.salePrice) : null,
          weightGrams: draft.weightGrams ? toInt(draft.weightGrams) : undefined,
          stock: draft.stock,
          imageKey: null,
          status: draft.status,
        });
      }
    }
    return {
      name: base.name.trim(),
      slug: base.slug.trim() || undefined,
      sku: base.sku.trim(),
      description: base.description.trim(),
      categoryId: base.categoryId || null,
      categoryIds: base.categoryId ? [base.categoryId] : [],
      brandId: base.brandId || null,
      material: base.material || null,
      price: toInt(base.price),
      salePrice: base.salePrice ? toInt(base.salePrice) : null,
      weightGrams: Math.max(1, toInt(base.weightGrams)),
      status: base.status,
      isFeatured: base.isFeatured,
      isNewArrival: base.isNewArrival,
      isBestSeller: base.isBestSeller,
      metaTitle: base.metaTitle || null,
      metaDescription: base.metaDescription || null,
      colors: colorIds,
      sizes: sizeIds,
      variants: variantList,
      images: images.map((image, index) => ({
        imageKey: image.imageKey,
        alt: image.alt || null,
        sortOrder: index,
        isPrimary: image.isPrimary || index === 0,
      })),
    };
  }

  const err = (key: string) => errors[key]?.[0];
  const matrixReady = colorIds.length > 0 && sizeIds.length > 0;
  const variantCount = colorIds.length * sizeIds.length;

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Produk', to: '/admin/produk' },
          { label: isNew ? 'Baru' : (initial?.name ?? 'Ubah') },
        ]}
        title={isNew ? 'Produk baru' : (initial?.name ?? 'Ubah produk')}
        description={isNew ? 'Lengkapi detail katalog, varian, dan media.' : `SKU ${initial?.sku ?? '—'}`}
        actions={
          <>
            <Badge variant="outline" className="hidden sm:inline-flex">
              {STATUS_OPTIONS.find((option) => option.value === base.status)?.label}
            </Badge>
            <Button variant="secondary" onClick={onDone}>
              Batal
            </Button>
            <Button loading={save.isPending} onClick={() => save.mutate()}>
              <Save /> {isNew ? 'Buat produk' : 'Simpan'}
            </Button>
          </>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="detail">
            <Info className="mr-1.5 inline h-3.5 w-3.5" /> Detail
          </TabsTrigger>
          <TabsTrigger value="deskripsi">
            <Sparkles className="mr-1.5 inline h-3.5 w-3.5" /> Deskripsi
          </TabsTrigger>
          <TabsTrigger value="varian">
            <Shapes className="mr-1.5 inline h-3.5 w-3.5" /> Varian ({variantCount})
          </TabsTrigger>
          <TabsTrigger value="media">
            <Images className="mr-1.5 inline h-3.5 w-3.5" /> Media ({images.length})
          </TabsTrigger>
          <TabsTrigger value="seo">
            <Search className="mr-1.5 inline h-3.5 w-3.5" /> SEO
          </TabsTrigger>
        </TabsList>

        {/* -------------------------------- detail ------------------------------- */}
        <TabsContent value="detail" className="space-y-4">
          <FormSection title="Identitas" description="Nama, SKU, dan alamat produk di toko.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nama" required error={err('name')} htmlFor="product-name">
                <Input
                  id="product-name"
                  value={base.name}
                  onChange={(event) => {
                    const name = event.target.value;
                    setBase((prev) => ({ ...prev, name, slug: prev.slug || slugify(name) }));
                  }}
                />
              </Field>
              <Field label="SKU" required error={err('sku')} htmlFor="product-sku">
                <Input
                  id="product-sku"
                  value={base.sku}
                  onChange={(event) => setBase((prev) => ({ ...prev, sku: event.target.value.toUpperCase() }))}
                />
              </Field>
              <Field label="Slug" error={err('slug')} hint="Kosongkan untuk dibuat otomatis." htmlFor="product-slug">
                <Input
                  id="product-slug"
                  value={base.slug}
                  onChange={(event) => setBase((prev) => ({ ...prev, slug: event.target.value }))}
                />
              </Field>
              <Field label="Status" htmlFor="product-status">
                <Select
                  id="product-status"
                  value={base.status}
                  onChange={(event) => setBase((prev) => ({ ...prev, status: event.target.value as ProductStatus }))}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </FormSection>

          <FormSection title="Klasifikasi" description="Kategori dan merek untuk penelusuran katalog.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Kategori" htmlFor="product-category">
                <Select
                  id="product-category"
                  value={base.categoryId}
                  onChange={(event) => setBase((prev) => ({ ...prev, categoryId: event.target.value }))}
                >
                  <option value="">—</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Merek" htmlFor="product-brand">
                <Select
                  id="product-brand"
                  value={base.brandId}
                  onChange={(event) => setBase((prev) => ({ ...prev, brandId: event.target.value }))}
                >
                  <option value="">—</option>
                  {brands.map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {brand.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Bahan" htmlFor="product-material">
                <Input
                  id="product-material"
                  value={base.material}
                  onChange={(event) => setBase((prev) => ({ ...prev, material: event.target.value }))}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Harga & pengiriman" description="Nilai dasar; varian dapat menimpanya.">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Harga (Rp)" required error={err('price')} htmlFor="product-price">
                <Input
                  id="product-price"
                  inputMode="numeric"
                  value={base.price}
                  onChange={(event) => setBase((prev) => ({ ...prev, price: event.target.value }))}
                />
              </Field>
              <Field label="Harga diskon (Rp)" error={err('salePrice')} htmlFor="product-sale">
                <Input
                  id="product-sale"
                  inputMode="numeric"
                  value={base.salePrice}
                  onChange={(event) => setBase((prev) => ({ ...prev, salePrice: event.target.value }))}
                />
              </Field>
              <Field label="Berat (gram)" required error={err('weightGrams')} htmlFor="product-weight">
                <Input
                  id="product-weight"
                  inputMode="numeric"
                  value={base.weightGrams}
                  onChange={(event) => setBase((prev) => ({ ...prev, weightGrams: event.target.value }))}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Penempatan" description="Sorotan di beranda dan halaman katalog.">
            <div className="space-y-3">
              <SwitchRow
                label="Unggulan"
                hint="Tampil di bagian pilihan editor."
                checked={base.isFeatured}
                onChange={(checked) => setBase((prev) => ({ ...prev, isFeatured: checked }))}
              />
              <SwitchRow
                label="Produk baru"
                hint="Masuk deretan kedatangan terbaru."
                checked={base.isNewArrival}
                onChange={(checked) => setBase((prev) => ({ ...prev, isNewArrival: checked }))}
              />
              <SwitchRow
                label="Terlaris"
                hint="Tampil di rak terlaris."
                checked={base.isBestSeller}
                onChange={(checked) => setBase((prev) => ({ ...prev, isBestSeller: checked }))}
              />
            </div>
          </FormSection>
        </TabsContent>

        {/* ------------------------------- description --------------------------- */}
        <TabsContent value="deskripsi" className="space-y-4">
          <FormSection title="Deskripsi produk" description="Ditampilkan di halaman produk. Baris baru dipertahankan.">
            <Field error={err('description')} hint="Minimal 10 karakter.">
              <Textarea
                value={base.description}
                onChange={(event) => setBase((prev) => ({ ...prev, description: event.target.value }))}
                className="min-h-72"
                placeholder="Jelaskan potongan, bahan, dan saran pemakaian…"
              />
            </Field>
            <p className="text-right text-xs text-muted">{base.description.length} karakter</p>
          </FormSection>
        </TabsContent>

        {/* -------------------------------- variants ----------------------------- */}
        <TabsContent value="varian" className="space-y-4">
          <FormSection
            title="Warna & ukuran"
            description="Pilih kombinasi yang tersedia atau tambahkan warna/ukuran baru; matriks varian dibuat otomatis."
          >
            {taxonomies.isLoading ? (
              <p className="text-sm text-muted">Memuat warna & ukuran…</p>
            ) : (
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted">Warna</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setAddingColor((prev) => !prev)}>
                      <Plus /> Tambah
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {colors.map((color) => (
                      <button
                        key={color.id}
                        type="button"
                        onClick={() => toggle(colorIds, color.id, setColorIds)}
                        className={cn(
                          'flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs transition-colors',
                          colorIds.includes(color.id) ? 'border-ink bg-soft' : 'border-line hover:border-ink/40',
                        )}
                      >
                        <span
                          className="h-3 w-3 rounded-full border border-line"
                          style={{ backgroundColor: color.hexCode }}
                        />
                        {color.name}
                      </button>
                    ))}
                    {!colors.length ? <span className="text-xs text-muted">Belum ada warna.</span> : null}
                  </div>
                  {addingColor ? (
                    <form
                      className="mt-3 space-y-2 rounded-(--radius-card) border border-line bg-canvas/50 p-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (colorDraft.name.trim().length >= 2) createColor.mutate();
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <Input
                          value={colorDraft.name}
                          onChange={(event) => setColorDraft((prev) => ({ ...prev, name: event.target.value }))}
                          placeholder="Nama warna, mis. Sage"
                          aria-label="Nama warna"
                          maxLength={40}
                          className="h-8"
                        />
                        <input
                          type="color"
                          value={colorDraft.hexCode}
                          onChange={(event) => setColorDraft((prev) => ({ ...prev, hexCode: event.target.value }))}
                          aria-label="Kode warna"
                          className="h-8 w-11 shrink-0 cursor-pointer rounded-(--radius-card) border border-line bg-surface p-0.5"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setAddingColor(false)}>
                          Batal
                        </Button>
                        <Button
                          type="submit"
                          size="sm"
                          loading={createColor.isPending}
                          disabled={colorDraft.name.trim().length < 2}
                        >
                          Simpan warna
                        </Button>
                      </div>
                    </form>
                  ) : null}
                </div>
                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted">Ukuran</span>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setAddingSize((prev) => !prev)}>
                      <Plus /> Tambah
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {sizes.map((size) => (
                      <button
                        key={size.id}
                        type="button"
                        onClick={() => toggle(sizeIds, size.id, setSizeIds)}
                        className={cn(
                          'min-w-10 rounded-(--radius-card) border px-2.5 py-1 text-sm transition-colors',
                          sizeIds.includes(size.id) ? 'border-ink bg-soft' : 'border-line hover:border-ink/40',
                        )}
                      >
                        {size.code}
                      </button>
                    ))}
                    {!sizes.length ? <span className="text-xs text-muted">Belum ada ukuran.</span> : null}
                  </div>
                  {addingSize ? (
                    <form
                      className="mt-3 space-y-2 rounded-(--radius-card) border border-line bg-canvas/50 p-3"
                      onSubmit={(event) => {
                        event.preventDefault();
                        if (sizeDraft.code.trim()) createSize.mutate();
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <Input
                          value={sizeDraft.code}
                          onChange={(event) =>
                            setSizeDraft((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))
                          }
                          placeholder="Kode"
                          aria-label="Kode ukuran"
                          maxLength={10}
                          className="h-8 w-24 shrink-0"
                        />
                        <Input
                          value={sizeDraft.name}
                          onChange={(event) => setSizeDraft((prev) => ({ ...prev, name: event.target.value }))}
                          placeholder="Nama, mis. Extra large"
                          aria-label="Nama ukuran"
                          maxLength={40}
                          className="h-8"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setAddingSize(false)}>
                          Batal
                        </Button>
                        <Button
                          type="submit"
                          size="sm"
                          loading={createSize.isPending}
                          disabled={!sizeDraft.code.trim()}
                        >
                          Simpan ukuran
                        </Button>
                      </div>
                    </form>
                  ) : null}
                </div>
              </div>
            )}
          </FormSection>

          <FormSection title="Matriks varian" description={`${variantCount} kombinasi akan disimpan.`}>
            {!matrixReady ? (
              <p className="text-sm text-muted">Pilih minimal satu warna dan satu ukuran untuk membuat varian.</p>
            ) : (
              <div className="overflow-x-auto rounded-(--radius-card) border border-line">
                <table className="w-full min-w-lg text-sm">
                  <thead>
                    <tr className="border-b border-line bg-canvas/60 text-left text-[0.7rem] uppercase tracking-wider text-muted">
                      <th className="px-3 py-2 font-semibold">Varian</th>
                      <th className="px-3 py-2 font-semibold">SKU</th>
                      <th className="w-24 px-3 py-2 font-semibold">Stok</th>
                      <th className="w-32 px-3 py-2 font-semibold">Harga</th>
                      <th className="w-16 px-3 py-2 font-semibold">Aktif</th>
                    </tr>
                  </thead>
                  <tbody>
                    {colorIds.map((colorId) =>
                      sizeIds.map((sizeId) => {
                        const draft = getDraft(colorId, sizeId);
                        const color = colorById.get(colorId);
                        const size = sizeById.get(sizeId);
                        return (
                          <tr key={`${colorId}${sizeId}`} className="border-b border-line last:border-0">
                            <td className="whitespace-nowrap px-3 py-2">
                              <span className="inline-flex items-center gap-1.5">
                                <span
                                  className="h-3 w-3 rounded-full border border-line"
                                  style={{ backgroundColor: color?.hexCode }}
                                />
                                {color?.name} · {size?.code}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                className="h-8"
                                value={draft.sku}
                                onChange={(event) =>
                                  patchDraft(colorId, sizeId, { sku: event.target.value.toUpperCase() })
                                }
                                aria-label="SKU varian"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                className="h-8"
                                inputMode="numeric"
                                value={String(draft.stock)}
                                onChange={(event) =>
                                  patchDraft(colorId, sizeId, { stock: Math.max(0, toInt(event.target.value)) })
                                }
                                aria-label="Stok varian"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                className="h-8"
                                inputMode="numeric"
                                value={draft.price}
                                placeholder="warisan"
                                onChange={(event) => patchDraft(colorId, sizeId, { price: event.target.value })}
                                aria-label="Harga varian"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <Switch
                                checked={draft.status === 'active'}
                                onCheckedChange={(checked) =>
                                  patchDraft(colorId, sizeId, { status: checked ? 'active' : 'inactive' })
                                }
                                aria-label="Varian aktif"
                              />
                            </td>
                          </tr>
                        );
                      }),
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </FormSection>
        </TabsContent>

        {/* --------------------------------- media ------------------------------- */}
        <TabsContent value="media" className="space-y-4">
          <FormSection title="Galeri produk" description="Unggah langsung ke R2; urutan pertama tampil di katalog.">
            <ImageGallery images={images} onChange={setImages} folder="products" />
          </FormSection>
        </TabsContent>

        {/* ---------------------------------- seo -------------------------------- */}
        <TabsContent value="seo" className="space-y-4">
          <FormSection title="Mesin pencari" description="Pratinjau judul dan deskripsi hasil pencarian.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Meta judul" error={err('metaTitle')} htmlFor="product-meta-title">
                <Input
                  id="product-meta-title"
                  value={base.metaTitle}
                  onChange={(event) => setBase((prev) => ({ ...prev, metaTitle: event.target.value }))}
                  maxLength={180}
                />
              </Field>
              <Field label="Meta deskripsi" error={err('metaDescription')} htmlFor="product-meta-description">
                <Input
                  id="product-meta-description"
                  value={base.metaDescription}
                  onChange={(event) => setBase((prev) => ({ ...prev, metaDescription: event.target.value }))}
                  maxLength={320}
                />
              </Field>
            </div>
            <div className="rounded-(--radius-card) border border-line bg-canvas/50 p-4">
              <div className="text-xs text-muted">{base.slug ? `/produk/${base.slug}` : '/produk/…'}</div>
              <div className="mt-1 text-base text-sky-800">
                {base.metaTitle || base.name || 'Judul hasil pencarian'}
              </div>
              <div className="text-sm text-muted">
                {base.metaDescription || 'Deskripsi singkat produk akan tampil di sini.'}
              </div>
            </div>
          </FormSection>
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-4 mt-6 flex justify-end gap-2 rounded-(--radius-card) border border-line bg-surface px-4 py-3 shadow-(--shadow-pop)">
        <Button variant="ghost" onClick={onDone}>
          Batal
        </Button>
        <Button loading={save.isPending} onClick={() => save.mutate()}>
          <Save /> {isNew ? 'Buat produk' : 'Simpan perubahan'}
        </Button>
      </div>
    </div>
  );
}

function SwitchRow({
  label,
  hint,
  checked,
  onChange,
}: { label: string; hint: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-(--radius-card) border border-line px-3 py-2.5">
      <div>
        <div className="text-sm font-medium text-ink">{label}</div>
        <div className="text-xs text-muted">{hint}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  );
}

export default AdminProductEditorPage;
