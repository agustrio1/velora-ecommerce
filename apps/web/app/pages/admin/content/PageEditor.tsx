import { useMutation, useQuery } from '@tanstack/react-query';
import type { StaticPage } from '@velora/shared';
import { ArrowLeft, Save } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { FormSection } from '../../../components/admin/kit';
import { PageHeader } from '../../../components/admin/page-header';
import { RichTextEditor } from '../../../components/admin/rich-text-editor';
import { Button } from '../../../components/ui/button';
import { Field, Input, Switch } from '../../../components/ui/form';
import { useToast } from '../../../context/ToastContext';
import { ApiError, api } from '../../../lib/api';

const CRUMBS = [
  { label: 'Admin', to: '/admin' },
  { label: 'Konten', to: '/admin/konten?tab=pages' },
  { label: 'Halaman', to: '/admin/konten?tab=pages' },
];

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/**
 * `/admin/konten/halaman/baru` and `/admin/konten/halaman/:id`.
 * Editorial pages use the rich text editor; content is stored as HTML.
 */
export function AdminPageEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;

  const list = useQuery<{ items: StaticPage[] }>({
    queryKey: ['admin', 'pages'],
    queryFn: () => api.get<{ items: StaticPage[] }>('/admin/pages', undefined, { anonymous: true }),
    enabled: !isNew,
  });

  if (!isNew && list.isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Memuat halaman…" />
        <div className="h-64 animate-pulse rounded-(--radius-card) border border-line bg-soft/40" />
      </div>
    );
  }

  const initial = isNew ? null : (list.data?.items.find((page) => page.id === id) ?? null);

  if (!isNew && !initial) {
    return (
      <PageHeader
        breadcrumbs={CRUMBS}
        title="Halaman tidak ditemukan"
        actions={
          <Button asChild variant="secondary">
            <Link to="/admin/konten?tab=pages">
              <ArrowLeft /> Kembali
            </Link>
          </Button>
        }
      />
    );
  }

  return <PageForm initial={initial} onDone={() => navigate('/admin/konten?tab=pages')} />;
}

function PageForm({ initial, onDone }: { initial: StaticPage | null; onDone: () => void }) {
  const toast = useToast();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [metaTitle, setMetaTitle] = useState(initial?.metaTitle ?? '');
  const [metaDescription, setMetaDescription] = useState(initial?.metaDescription ?? '');
  const [isPublished, setIsPublished] = useState(true);
  const [preview, setPreview] = useState(false);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        slug: slug.trim(),
        title: title.trim(),
        content,
        metaTitle: metaTitle || null,
        metaDescription: metaDescription || null,
        isPublished,
      };
      return initial ? api.put(`/admin/pages/${initial.id}`, body) : api.post('/admin/pages', body);
    },
    onSuccess: () => {
      toast.push('Halaman disimpan', 'success');
      onDone();
    },
    onError: (error) => toast.push(error instanceof ApiError ? error.message : 'Gagal menyimpan halaman', 'error'),
  });

  const valid = title.trim().length >= 2 && slug.trim().length >= 2 && content.trim().length > 0;

  return (
    <div>
      <PageHeader
        breadcrumbs={[...CRUMBS.slice(0, 2), { label: initial ? initial.title : 'Baru' }]}
        title={initial ? 'Ubah halaman' : 'Halaman baru'}
        description="Artikel editorial, kebijakan, dan informasi toko."
        actions={
          <>
            <Button variant={preview ? 'secondary' : 'ghost'} onClick={() => setPreview(!preview)}>
              {preview ? 'Kembali ke editor' : 'Pratinjau'}
            </Button>
            <Button variant="secondary" onClick={onDone}>
              Batal
            </Button>
            <Button loading={save.isPending} disabled={!valid} onClick={() => save.mutate()}>
              <Save /> Simpan
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <FormSection title="Isi halaman">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Judul" required htmlFor="page-title">
                <Input
                  id="page-title"
                  value={title}
                  onChange={(event) => {
                    const next = event.target.value;
                    setTitle(next);
                    if (!initial) setSlug(slugify(next));
                  }}
                  maxLength={160}
                />
              </Field>
              <Field label="Slug" required htmlFor="page-slug" hint={`/halaman/${slug || 'slug'}`}>
                <Input
                  id="page-slug"
                  value={slug}
                  onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  maxLength={120}
                />
              </Field>
            </div>
          </FormSection>

          <FormSection
            title="Konten"
            description="Gunakan toolbar untuk format; HTML disimpan setelah dibersihkan di server."
          >
            {preview ? (
              <div
                className="prose-editorial min-h-72 rounded-(--radius-card) border border-line px-4 py-3"
                // biome-ignore lint/security/noDangerouslySetInnerHtml: admin-authored, sanitized by the Worker
                dangerouslySetInnerHTML={{ __html: content || '<p class="text-muted">Belum ada konten.</p>' }}
              />
            ) : (
              <RichTextEditor
                value={content}
                onChange={setContent}
                minHeight="20rem"
                placeholder="Tulis isi halaman…"
              />
            )}
          </FormSection>
        </div>

        <div className="space-y-4">
          <FormSection title="Publikasi">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-ink">Terbitkan</div>
                <div className="text-xs text-muted">Halaman dapat diakses publik.</div>
              </div>
              <Switch checked={isPublished} onCheckedChange={setIsPublished} aria-label="Terbitkan" />
            </div>
            {initial ? <p className="text-xs text-muted">Terakhir diubah {initial.updatedAt.slice(0, 10)}.</p> : null}
          </FormSection>

          <FormSection title="SEO">
            <Field label="Meta judul" htmlFor="page-meta-title">
              <Input
                id="page-meta-title"
                value={metaTitle}
                onChange={(event) => setMetaTitle(event.target.value)}
                maxLength={180}
              />
            </Field>
            <Field label="Meta deskripsi" htmlFor="page-meta-description">
              <Input
                id="page-meta-description"
                value={metaDescription}
                onChange={(event) => setMetaDescription(event.target.value)}
                maxLength={320}
              />
            </Field>
          </FormSection>
        </div>
      </div>
    </div>
  );
}

export default AdminPageEditorPage;
