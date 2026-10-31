import { useMutation, useQuery } from '@tanstack/react-query';
import type { Faq } from '@velora/shared';
import { ArrowLeft, Save } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { FormSection } from '../../../components/admin/kit';
import { PageHeader } from '../../../components/admin/page-header';
import { Button } from '../../../components/ui/button';
import { Field, Input, Switch, Textarea } from '../../../components/ui/form';
import { useToast } from '../../../context/ToastContext';
import { ApiError, api } from '../../../lib/api';

const CRUMBS = [
  { label: 'Admin', to: '/admin' },
  { label: 'Konten', to: '/admin/konten?tab=faqs' },
  { label: 'FAQ', to: '/admin/konten?tab=faqs' },
];

/** `/admin/konten/faq/baru` and `/admin/konten/faq/:id`. */
export function AdminFaqEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;

  const list = useQuery<{ items: Faq[] }>({
    queryKey: ['admin', 'faqs'],
    queryFn: () => api.get<{ items: Faq[] }>('/admin/faqs', undefined, { anonymous: true }),
    enabled: !isNew,
  });

  if (!isNew && list.isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Memuat FAQ…" />
        <div className="h-48 animate-pulse rounded-(--radius-card) border border-line bg-soft/40" />
      </div>
    );
  }

  const initial = isNew ? null : (list.data?.items.find((faq) => faq.id === id) ?? null);

  if (!isNew && !initial) {
    return (
      <PageHeader
        breadcrumbs={CRUMBS}
        title="FAQ tidak ditemukan"
        actions={
          <Button asChild variant="secondary">
            <Link to="/admin/konten?tab=faqs">
              <ArrowLeft /> Kembali
            </Link>
          </Button>
        }
      />
    );
  }

  return <FaqForm initial={initial} onDone={() => navigate('/admin/konten?tab=faqs')} />;
}

function FaqForm({ initial, onDone }: { initial: Faq | null; onDone: () => void }) {
  const toast = useToast();
  const [question, setQuestion] = useState(initial?.question ?? '');
  const [answer, setAnswer] = useState(initial?.answer ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 0));
  const [isPublished, setIsPublished] = useState(true);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        question: question.trim(),
        answer: answer.trim(),
        category: category || null,
        sortOrder: Number(sortOrder) || 0,
        isPublished,
      };
      return initial ? api.put(`/admin/faqs/${initial.id}`, body) : api.post('/admin/faqs', body);
    },
    onSuccess: () => {
      toast.push('FAQ disimpan', 'success');
      onDone();
    },
    onError: (error) => toast.push(error instanceof ApiError ? error.message : 'Gagal menyimpan', 'error'),
  });

  return (
    <div>
      <PageHeader
        breadcrumbs={[...CRUMBS.slice(0, 2), { label: initial ? 'Ubah' : 'Baru' }]}
        title={initial ? 'Ubah FAQ' : 'FAQ baru'}
        description="Pertanyaan umum di halaman bantuan dan footer."
        actions={
          <>
            <Button variant="secondary" onClick={onDone}>
              Batal
            </Button>
            <Button
              loading={save.isPending}
              disabled={question.trim().length < 5 || answer.trim().length < 5}
              onClick={() => save.mutate()}
            >
              <Save /> Simpan
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
        <FormSection title="Pertanyaan & jawaban">
          <Field label="Pertanyaan" required htmlFor="faq-question">
            <Input
              id="faq-question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              maxLength={300}
            />
          </Field>
          <Field label="Jawaban" required htmlFor="faq-answer" hint="Teks biasa; baris baru dipertahankan.">
            <Textarea
              id="faq-answer"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              className="min-h-56"
              maxLength={5000}
            />
          </Field>
        </FormSection>

        <div className="space-y-4">
          <FormSection title="Pengaturan">
            <Field label="Kategori" htmlFor="faq-category">
              <Input
                id="faq-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                maxLength={60}
                placeholder="Pengiriman, Pembayaran…"
              />
            </Field>
            <Field label="Urutan" htmlFor="faq-sort" hint="Angka kecil tampil lebih dulu.">
              <Input
                id="faq-sort"
                inputMode="numeric"
                value={sortOrder}
                onChange={(event) => setSortOrder(event.target.value.replace(/\D/g, ''))}
              />
            </Field>
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-medium text-ink">Terbitkan</div>
              <Switch checked={isPublished} onCheckedChange={setIsPublished} aria-label="Terbitkan FAQ" />
            </div>
          </FormSection>
        </div>
      </div>
    </div>
  );
}

export default AdminFaqEditorPage;
