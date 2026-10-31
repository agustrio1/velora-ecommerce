import { useMutation, useQuery } from '@tanstack/react-query';
import { COUPON_TYPE } from '@velora/shared';
import { ArrowLeft, Save, Tag } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { FormSection } from '../../components/admin/kit';
import { PageHeader } from '../../components/admin/page-header';
import { Button } from '../../components/ui/button';
import { Field, Input, Select, Switch } from '../../components/ui/form';
import { useToast } from '../../context/ToastContext';
import { ApiError, api } from '../../lib/api';
import type { CouponRow, Paginated } from '../../lib/api-types';
import { rupiah } from '../../lib/format';

const TYPE_LABEL: Record<string, string> = {
  percent: 'Persen',
  fixed: 'Nominal',
  free_shipping: 'Gratis ongkir',
};

/** `/admin/promo/baru` and `/admin/promo/:id` — a page, not a modal. */
export function AdminCouponEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isNew = !id;

  // Coupons expose no single-item endpoint; the paged list is the source.
  const list = useQuery<Paginated<CouponRow>>({
    queryKey: ['admin', 'coupons', 'editor'],
    queryFn: () => api.get<Paginated<CouponRow>>('/admin/coupons', { page: 1, pageSize: 200 }, { anonymous: true }),
    enabled: !isNew,
  });

  if (!isNew && list.isLoading) {
    return (
      <div className="space-y-4">
        <PageHeader title="Memuat kupon…" />
        <div className="h-48 animate-pulse rounded-(--radius-card) border border-line bg-soft/40" />
      </div>
    );
  }

  const initial = isNew ? null : (list.data?.items.find((coupon) => coupon.id === id) ?? null);

  if (!isNew && !initial) {
    return (
      <PageHeader
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Promo', to: '/admin/promo' }, { label: 'Error' }]}
        title="Kupon tidak ditemukan"
        actions={
          <Button asChild variant="secondary">
            <Link to="/admin/promo">
              <ArrowLeft /> Kembali
            </Link>
          </Button>
        }
      />
    );
  }

  return <CouponForm initial={initial} onDone={() => navigate('/admin/promo')} />;
}

function toInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function CouponForm({ initial, onDone }: { initial: CouponRow | null; onDone: () => void }) {
  const toast = useToast();
  const [code, setCode] = useState(initial?.code ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState<string>(initial?.type ?? COUPON_TYPE.PERCENT);
  const [value, setValue] = useState(String(initial?.value ?? 10));
  const [minPurchase, setMinPurchase] = useState(initial?.minPurchase ? String(initial.minPurchase) : '');
  const [maxDiscount, setMaxDiscount] = useState(initial?.maxDiscount ? String(initial.maxDiscount) : '');
  const [usageLimit, setUsageLimit] = useState(initial?.usageLimit ? String(initial.usageLimit) : '');
  const [perUserLimit, setPerUserLimit] = useState(initial?.perUserLimit ? String(initial.perUserLimit) : '');
  const [startsAt, setStartsAt] = useState(toInput(initial?.startsAt));
  const [endsAt, setEndsAt] = useState(toInput(initial?.endsAt));
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  const save = useMutation({
    mutationFn: () => {
      const body = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        type,
        value: Number(value) || 0,
        minPurchase: minPurchase ? Number(minPurchase) : null,
        maxDiscount: type === COUPON_TYPE.PERCENT && maxDiscount ? Number(maxDiscount) : null,
        usageLimit: usageLimit ? Number(usageLimit) : null,
        perUserLimit: perUserLimit ? Number(perUserLimit) : null,
        startsAt: startsAt ? new Date(startsAt).toISOString() : null,
        endsAt: endsAt ? new Date(endsAt).toISOString() : null,
        isActive,
      };
      return api.post('/admin/coupons', body, initial ? { id: initial.id } : undefined);
    },
    onSuccess: () => {
      toast.push('Kupon disimpan', 'success');
      onDone();
    },
    onError: (error) => toast.push(error instanceof ApiError ? error.message : 'Gagal menyimpan kupon', 'error'),
  });

  const valid = code.trim().length >= 3 && name.trim().length >= 3 && Number(value) > 0;

  return (
    <div>
      <PageHeader
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Promo', to: '/admin/promo' },
          { label: initial ? initial.code : 'Baru' },
        ]}
        title={initial ? `Ubah kupon · ${initial.code}` : 'Kupon baru'}
        description="Atur potongan harga, kuota, dan masa berlaku."
        actions={
          <>
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
          <FormSection title="Identitas kupon">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Kode" required htmlFor="coupon-code" hint="Huruf kapital, angka, tanda hubung.">
                <Input
                  id="coupon-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''))}
                  maxLength={20}
                  className="font-mono tracking-wider"
                />
              </Field>
              <Field label="Nama kampanye" required htmlFor="coupon-name">
                <Input
                  id="coupon-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={120}
                />
              </Field>
            </div>
            {initial ? (
              <div className="flex flex-wrap gap-4 text-xs text-muted">
                <span>
                  Dipakai: <span className="tabular-nums text-ink">{initial.usedCount}</span>
                  {initial.usageLimit ? ` / ${initial.usageLimit}` : ''}
                </span>
                <span>Produk terkait: {initial.productIds.length}</span>
                <span>Kategori terkait: {initial.categoryIds.length}</span>
              </div>
            ) : null}
          </FormSection>

          <FormSection title="Nilai potongan">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tipe" htmlFor="coupon-type">
                <Select id="coupon-type" value={type} onChange={(event) => setType(event.target.value)}>
                  {Object.entries(TYPE_LABEL).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={type === COUPON_TYPE.PERCENT ? 'Nilai (%)' : 'Nilai (Rp)'} required htmlFor="coupon-value">
                <Input
                  id="coupon-value"
                  inputMode="numeric"
                  value={value}
                  onChange={(event) => setValue(event.target.value.replace(/\D/g, ''))}
                  disabled={type === COUPON_TYPE.FREE_SHIPPING}
                />
              </Field>
              <Field label="Min. belanja (Rp)" htmlFor="coupon-min">
                <Input
                  id="coupon-min"
                  inputMode="numeric"
                  value={minPurchase}
                  onChange={(event) => setMinPurchase(event.target.value.replace(/\D/g, ''))}
                />
              </Field>
              {type === COUPON_TYPE.PERCENT ? (
                <Field label="Maks. diskon (Rp)" htmlFor="coupon-max">
                  <Input
                    id="coupon-max"
                    inputMode="numeric"
                    value={maxDiscount}
                    onChange={(event) => setMaxDiscount(event.target.value.replace(/\D/g, ''))}
                  />
                </Field>
              ) : null}
            </div>
            {type === COUPON_TYPE.PERCENT && Number(value) ? (
              <p className="text-xs text-muted">
                Potongan {value}% — contoh belanja {rupiah(250_000)} →{' '}
                {rupiah(250_000 - (250_000 * Number(value)) / 100)}
                {maxDiscount ? ` (dibatasi ${rupiah(Number(maxDiscount))})` : ''}.
              </p>
            ) : null}
          </FormSection>

          <FormSection title="Batasan pemakaian">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Batas total" htmlFor="coupon-usage-limit">
                <Input
                  id="coupon-usage-limit"
                  inputMode="numeric"
                  value={usageLimit}
                  onChange={(event) => setUsageLimit(event.target.value.replace(/\D/g, ''))}
                  placeholder="Tanpa batas"
                />
              </Field>
              <Field label="Batas per pelanggan" htmlFor="coupon-per-user">
                <Input
                  id="coupon-per-user"
                  inputMode="numeric"
                  value={perUserLimit}
                  onChange={(event) => setPerUserLimit(event.target.value.replace(/\D/g, ''))}
                  placeholder="Tanpa batas"
                />
              </Field>
              <Field label="Mulai" htmlFor="coupon-start">
                <Input
                  id="coupon-start"
                  type="datetime-local"
                  value={startsAt}
                  onChange={(event) => setStartsAt(event.target.value)}
                />
              </Field>
              <Field label="Berakhir" htmlFor="coupon-end">
                <Input
                  id="coupon-end"
                  type="datetime-local"
                  value={endsAt}
                  onChange={(event) => setEndsAt(event.target.value)}
                />
              </Field>
            </div>
          </FormSection>
        </div>

        <div className="space-y-4">
          <FormSection title="Pratinjau">
            <div className="rounded-(--radius-card) border border-dashed border-accent/40 bg-canvas/60 p-4 text-center">
              <Tag className="mx-auto h-5 w-5 text-accent" />
              <div className="mt-2 font-mono text-lg tracking-[0.2em]">{code || 'KODE'}</div>
              <div className="text-xs text-muted">{name || 'Nama kampanye'}</div>
              <div className="mt-2 text-sm font-medium text-ink">
                {type === COUPON_TYPE.PERCENT
                  ? `${value || 0}%`
                  : type === COUPON_TYPE.FIXED
                    ? rupiah(Number(value) || 0)
                    : 'Gratis ongkir'}
              </div>
            </div>
            <Field label="Catatan internal">
              <p className="rounded-(--radius-card) border border-line bg-canvas/40 px-3 py-2 text-xs text-muted">
                Penomoran dan audit kupon dikelola otomatis oleh sistem.
              </p>
            </Field>
          </FormSection>

          <FormSection title="Status">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium text-ink">Kupon aktif</div>
                <div className="text-xs text-muted">Nonaktifkan untuk menghentikan pemakaian.</div>
              </div>
              <Switch checked={isActive} onCheckedChange={setIsActive} aria-label="Kupon aktif" />
            </div>
          </FormSection>
        </div>
      </div>
    </div>
  );
}

export default AdminCouponEditorPage;
