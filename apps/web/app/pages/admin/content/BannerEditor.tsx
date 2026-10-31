import { useMutation, useQuery } from '@tanstack/react-query';
import type { Banner } from '@velora/shared';
import { ArrowLeft, Eye, Save } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { FormSection } from '../../../components/admin/kit';
import { ImageField } from '../../../components/admin/media-fields';
import { PageHeader } from '../../../components/admin/page-header';
import { Button } from '../../../components/ui/button';
import { Field, Input, Select, Switch } from '../../../components/ui/form';
import { useToast } from '../../../context/ToastContext';
import { ApiError, api } from '../../../lib/api';

const PLACEMENTS: { value: string; label: string }[] = [
  { value: 'hero', label: 'Hero utama' },
  { value: 'hero_secondary', label: 'Hero sekunder' },
  { value: 'promo', label: 'Balok promo' },
  { value: 'category', label: 'Kepala kategori' },
];

const CRUMBS = [
  { label: 'Admin', to: '/admin' },
  { label: 'Konten', to: '/admin/konten?tab=banners' },
  { label: 'Banner', to: '/admin/konten?tab=banners' },
];

/** `/admin/konten/banner/baru` and `/admin/konten/banner/:id`. */
export function AdminBannerEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;

  const list = useQuery<{ items: Banner[] }>({
    queryKey: ['admin', 'banners'],
    queryFn: () => api.get<{ items: Banner[] }>('/admin/banners', undefined, { anonymous: true }),
    enabled: !isNew,
  });

  if (!isNew && list.isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Memuat banner…" />
        <div className="h-64 animate-pulse rounded-(--radius-card) border border-line bg-soft/40" />
      </div>
    );
  }

  const initial = isNew ? null : (list.data?.items.find((banner) => banner.id === id) ?? null);

  if (!isNew && !initial) {
    return (
      <PageHeader
        breadcrumbs={CRUMBS}
        title="Banner tidak ditemukan"
        actions={
          <Button asChild variant="secondary">
            <Link to="/admin/konten?tab=banners">
              <ArrowLeft /> Kembali
            </Link>
          </Button>
        }
      />
    );
  }

  return <BannerForm initial={initial} onDone={() => navigate('/admin/konten?tab=banners')} />;
}

function BannerForm({ initial, onDone }: { initial: Banner | null; onDone: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [subtitle, setSubtitle] = useState(initial?.subtitle ?? '');
  const [imageKey, setImageKey] = useState(initial?.imageKey ?? '');
  const [targetUrl, setTargetUrl] = useState(initial?.targetUrl ?? '');
  const [ctaLabel, setCtaLabel] = useState(initial?.ctaLabel ?? '');
  const [placement, setPlacement] = useState(initial?.placement ?? 'hero');
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 0));
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        title: title.trim(),
        subtitle: subtitle || null,
        imageKey: imageKey || null,
        targetUrl: targetUrl || null,
        ctaLabel: ctaLabel || null,
        placement,
        sortOrder: Number(sortOrder) || 0,
        isActive,
      };
      return initial ? api.put(`/admin/banners/${initial.id}`, body) : api.post('/admin/banners', body);
    },
    onSuccess: () => {
      toast.push('Banner disimpan', 'success');
      onDone();
    },
    onError: (error) => toast.push(error instanceof ApiError ? error.message : 'Gagal menyimpan', 'error'),
  });

  return (
    <div>
      <PageHeader
        breadcrumbs={[...CRUMBS.slice(0, 2), { label: initial ? initial.title : 'Baru' }]}
        title={initial ? 'Ubah banner' : 'Banner baru'}
        description="Visual promosi di beranda dan kepala kategori."
        actions={
          <>
            <Button variant="secondary" onClick={onDone}>
              Batal
            </Button>
            <Button loading={save.isPending} disabled={title.trim().length < 2} onClick={() => save.mutate()}>
              <Save /> Simpan
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <FormSection title="Konten banner">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Judul" required htmlFor="banner-title">
                <Input
                  id="banner-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={120}
                />
              </Field>
              <Field label="Subjudul" htmlFor="banner-subtitle">
                <Input
                  id="banner-subtitle"
                  value={subtitle}
                  onChange={(event) => setSubtitle(event.target.value)}
                  maxLength={200}
                />
              </Field>
            </div>
            <ImageField
              imageKey={imageKey}
              onChange={(key) => setImageKey(key)}
              folder="banners"
              label="Gambar banner"
              hint="Rasio 16:9 direkomendasikan (min. 1600 px lebar)."
            />
          </FormSection>

          <FormSection title="Tautan & tombol">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tautan tujuan" htmlFor="banner-target">
                <Input
                  id="banner-target"
                  value={targetUrl}
                  onChange={(event) => setTargetUrl(event.target.value)}
                  placeholder="/katalog?koleksi=baru"
                />
              </Field>
              <Field label="Label tombol" htmlFor="banner-cta">
                <Input
                  id="banner-cta"
                  value={ctaLabel}
                  onChange={(event) => setCtaLabel(event.target.value)}
                  maxLength={40}
                  placeholder="Belanja sekarang"
                />
              </Field>
            </div>
          </FormSection>
        </div>

        <div className="space-y-4">
          <FormSection title="Pratinjau">
            <div className="relative overflow-hidden rounded-(--radius-card) border border-line">
              {imageKey ? (
                <img src={`/media/${imageKey}`} alt="" className="aspect-video w-full object-cover" />
              ) : (
                <div className="flex aspect-video items-center justify-center bg-soft text-xs text-muted">
                  Belum ada gambar
                </div>
              )}
              <div className="space-y-1 bg-ink/70 p-3 text-canvas">
                <div className="font-display text-lg">{title || 'Judul banner'}</div>
                {subtitle ? <div className="text-xs text-canvas/80">{subtitle}</div> : null}
                {ctaLabel ? (
                  <span className="mt-1 inline-flex items-center gap-1 border border-canvas/40 px-2 py-0.5 text-[0.65rem] uppercase tracking-wider">
                    <Eye className="h-3 w-3" /> {ctaLabel}
                  </span>
                ) : null}
              </div>
            </div>
          </FormSection>

          <FormSection title="Penempatan">
            <Field label="Lokasi" htmlFor="banner-placement">
              <Select id="banner-placement" value={placement} onChange={(event) => setPlacement(event.target.value)}>
                {PLACEMENTS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Urutan" htmlFor="banner-sort" hint="Angka kecil tampil lebih dulu.">
              <Input
                id="banner-sort"
                inputMode="numeric"
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value.replace(/\D/g, ''))}
              />
            </Field>
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-ink">Tampilkan</div>
              <Switch checked={isActive} onCheckedChange={setIsActive} aria-label="Tampilkan banner" />
            </div>
          </FormSection>
        </div>
      </div>
    </div>
  );
}

export default AdminBannerEditorPage;
