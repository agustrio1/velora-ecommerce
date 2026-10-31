import { cn } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Braces,
  CheckCircle2,
  ChevronDown,
  Image as ImageIcon,
  type LucideIcon,
  Plug,
  Receipt,
  Save,
  Search,
  Store,
  Truck,
  Undo2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { FormSection, Labeled } from '../../components/admin/kit';
import { PageHeader } from '../../components/admin/page-header';
import { Button } from '../../components/ui/button';
import { Field, Input, Select, Separator, Spinner, Textarea } from '../../components/ui/form';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '../../components/ui/surface';
import { useToast } from '../../context/ToastContext';
import { ApiError, api } from '../../lib/api';
import type { SettingsPayload } from '../../lib/api-types';
import { parseJsonLdExtra } from '../../lib/seo';
import { ToggleRow } from './settings/controls';
import { JsonLdWorkspace, SeoWorkspace } from './settings/seo-workspace';
import {
  EMPTY_FORM,
  type SeoFormState,
  type SettingsForm,
  formFromPayload,
  payloadFromForm,
  validateForm,
} from './settings/settings-form';

type SectionId = 'identitas' | 'seo' | 'jsonld' | 'operasional' | 'pengiriman' | 'integrasi';

const SECTIONS: { id: SectionId; label: string; hint: string; icon: LucideIcon }[] = [
  { id: 'identitas', label: 'Identitas toko', hint: 'Nama, kontak, pengumuman', icon: Store },
  { id: 'seo', label: 'SEO', hint: 'Judul, deskripsi, robots', icon: Search },
  { id: 'jsonld', label: 'Data terstruktur', hint: 'JSON-LD schema.org', icon: Braces },
  { id: 'operasional', label: 'Operasional', hint: 'Pajak & batas pesanan', icon: Receipt },
  { id: 'pengiriman', label: 'Pengiriman', hint: 'Kurir & gratis ongkir', icon: Truck },
  { id: 'integrasi', label: 'Integrasi', hint: 'Duitku & Biteship', icon: Plug },
];

/** Settings console: one draft object, section nav on the left, one save for all. */
export function AdminSettings() {
  const qc = useQueryClient();
  const toast = useToast();

  const query = useQuery<SettingsPayload>({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get<SettingsPayload>('/admin/settings', undefined, { anonymous: true }),
  });

  const [form, setForm] = useState<SettingsForm>(EMPTY_FORM);
  const [saved, setSaved] = useState<SettingsForm>(EMPTY_FORM);
  const [section, setSection] = useState<SectionId>('identitas');
  const seeded = useRef(false);

  // Seed once: a refetch must never overwrite what the admin is typing.
  useEffect(() => {
    if (!query.data || seeded.current) return;
    seeded.current = true;
    const next = formFromPayload(query.data);
    setForm(next);
    setSaved(next);
  }, [query.data]);

  const set = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));
  const setSeo = (patch: Partial<SeoFormState>) => setForm((prev) => ({ ...prev, seo: { ...prev.seo, ...patch } }));

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved]);

  const save = useMutation({
    mutationFn: (next: SettingsForm) => api.patch<{ applied: string[] }>('/admin/settings', payloadFromForm(next)),
    onSuccess: (_result, next) => {
      setSaved(next);
      qc.invalidateQueries({ queryKey: ['admin', 'settings'] });
      toast.push('Pengaturan disimpan', 'success');
    },
    onError: (err) => toast.push(err instanceof ApiError ? err.message : 'Gagal menyimpan', 'error'),
  });

  function submit() {
    const problem = validateForm(form);
    if (problem) {
      toast.push(problem, 'error');
      return;
    }
    const jsonLd = parseJsonLdExtra(form.seo.jsonLdExtra);
    if (!jsonLd.ok) {
      setSection('jsonld');
      toast.push(jsonLd.error, 'error');
      return;
    }
    save.mutate(form);
  }

  if (query.isLoading && !query.data) return <Spinner label="Memuat pengaturan…" />;
  if (query.isError && !query.data) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted">
          Pengaturan gagal dimuat. Muat ulang halaman untuk mencoba lagi.
        </CardContent>
      </Card>
    );
  }

  const gw = query.data?.gateway;
  const origin = query.data?.origins?.[0];
  const lastUpdated = (query.data?.settings ?? [])
    .map((row) => row.updatedAt)
    .filter(Boolean)
    .sort()
    .at(-1);

  return (
    <div className={cn('space-y-5', dirty && 'pb-24 lg:pb-0')}>
      <PageHeader
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Pengaturan' }]}
        title="Pengaturan"
        description="Identitas toko, SEO dan data terstruktur, operasional, dan integrasi."
        actions={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            {dirty ? <Badge variant="warning">Belum disimpan</Badge> : null}
            {dirty ? (
              <Button
                variant="secondary"
                onClick={() => setForm(saved)}
                disabled={save.isPending}
                className="flex-1 sm:flex-none"
              >
                <Undo2 /> Batalkan
              </Button>
            ) : null}
            <Button loading={save.isPending} disabled={!dirty} onClick={submit} className="flex-1 sm:flex-none">
              <Save /> Simpan
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[236px_minmax(0,1fr)]">
        <nav aria-label="Bagian pengaturan" className="min-w-0 lg:sticky lg:top-20 lg:self-start">
          <Card className="p-1.5">
            {/* Mobile: a native picker beats a six-chip scroll strip. */}
            <div className="relative lg:hidden">
              <label htmlFor="settings-section" className="sr-only">
                Bagian pengaturan
              </label>
              <Select
                id="settings-section"
                value={section}
                onChange={(event) => setSection(event.target.value as SectionId)}
                className="pr-9 font-medium"
              >
                {SECTIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </Select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted" />
            </div>

            <ul className="no-scrollbar hidden gap-1 lg:flex lg:flex-col">
              {SECTIONS.map((item) => {
                const active = item.id === section;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSection(item.id)}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-(--radius-card) px-3 py-2 text-left text-sm transition-colors',
                        active ? 'bg-ink text-canvas' : 'text-muted hover:bg-soft hover:text-ink',
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{item.label}</span>
                        <span className={cn('block truncate text-[11px]', active ? 'text-canvas/70' : 'text-muted/80')}>
                          {item.hint}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
          {lastUpdated ? (
            <p className="mt-2 px-2 text-[11px] text-muted">Terakhir diubah {lastUpdated.slice(0, 10)}</p>
          ) : null}
        </nav>

        <div className="min-w-0">
          {section === 'identitas' ? (
            <div className="space-y-4">
              <FormSection
                title="Identitas toko"
                description="Muncul di header, footer, email transaksi, dan schema.org."
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Nama toko" htmlFor="store-name" required>
                    <Input
                      id="store-name"
                      value={form.storeName}
                      onChange={(event) => set('storeName', event.target.value)}
                      maxLength={80}
                    />
                  </Field>
                  <Field label="Email" htmlFor="store-email" hint="Alamat balasan untuk pelanggan.">
                    <Input
                      id="store-email"
                      type="email"
                      value={form.email}
                      onChange={(event) => set('email', event.target.value)}
                    />
                  </Field>
                  <Field label="WhatsApp" htmlFor="store-whatsapp" hint="Format 08xx, dipakai juga di JSON-LD.">
                    <Input
                      id="store-whatsapp"
                      value={form.whatsapp}
                      onChange={(event) => set('whatsapp', event.target.value)}
                      maxLength={30}
                      placeholder="08xxxxxxxxxx"
                    />
                  </Field>
                  <Field label="Logo" htmlFor="store-logo" hint="URL logo; dipakai sebagai gambar cadangan OG.">
                    <Input
                      id="store-logo"
                      value={form.logo}
                      onChange={(event) => set('logo', event.target.value)}
                      maxLength={300}
                      placeholder="/logo.svg atau https://…"
                    />
                  </Field>
                  <Field label="Instagram" htmlFor="store-instagram">
                    <Input
                      id="store-instagram"
                      value={form.instagram}
                      onChange={(event) => set('instagram', event.target.value)}
                      maxLength={200}
                      placeholder="https://instagram.com/…"
                    />
                  </Field>
                  <Field label="TikTok" htmlFor="store-tiktok">
                    <Input
                      id="store-tiktok"
                      value={form.tiktok}
                      onChange={(event) => set('tiktok', event.target.value)}
                      maxLength={200}
                      placeholder="https://tiktok.com/@…"
                    />
                  </Field>
                </div>

                <div className="flex items-center gap-3 rounded-(--radius-card) border border-line bg-canvas/40 p-3">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-(--radius-card) border border-line bg-surface">
                    {form.logo.trim() ? (
                      <img src={form.logo} alt="Logo toko" className="h-full w-full object-contain" />
                    ) : (
                      <ImageIcon className="h-5 w-5 text-muted" />
                    )}
                  </span>
                  <div className="min-w-0 text-xs text-muted">
                    Pratinjau logo. Rasio 1:1 paling aman untuk favicon, kartu tautan, dan schema.org.
                  </div>
                </div>
              </FormSection>

              <FormSection title="Bilah pengumuman" description="Tampil di atas navigasi toko.">
                <Field
                  label="Teks"
                  htmlFor="store-announcement"
                  hint={`${form.announcement.length}/240 — kosongkan untuk menyembunyikan bilah.`}
                >
                  <Textarea
                    id="store-announcement"
                    value={form.announcement}
                    onChange={(event) => set('announcement', event.target.value)}
                    maxLength={240}
                    className="min-h-24"
                  />
                </Field>
              </FormSection>
            </div>
          ) : null}

          {section === 'seo' ? <SeoWorkspace form={form} onSeo={setSeo} /> : null}
          {section === 'jsonld' ? <JsonLdWorkspace form={form} onSeo={setSeo} /> : null}

          {section === 'operasional' ? (
            <div className="space-y-4">
              <FormSection title="Pajak" description="Perhitungan otomatis pada checkout.">
                <ToggleRow
                  label="Aktifkan pajak"
                  hint="Tambahkan pajak ke total pesanan."
                  checked={form.taxEnabled}
                  onChange={(value) => set('taxEnabled', value)}
                />
                <Field label="Tarif (%)" htmlFor="store-tax" hint="Nilai 0–100, boleh desimal.">
                  <Input
                    id="store-tax"
                    inputMode="decimal"
                    value={form.taxPercent}
                    onChange={(event) => set('taxPercent', event.target.value.replace(/[^0-9.]/g, ''))}
                    disabled={!form.taxEnabled}
                  />
                </Field>
              </FormSection>

              <FormSection title="Pesanan" description="Batas waktu pembayaran sebelum pesanan dibatalkan otomatis.">
                <Field label="Batas bayar (menit)" htmlFor="store-expiry" hint="10–2880 menit.">
                  <Input
                    id="store-expiry"
                    inputMode="numeric"
                    value={form.expiryMinutes}
                    onChange={(event) => set('expiryMinutes', event.target.value.replace(/\D/g, ''))}
                  />
                </Field>
                <p className="rounded-(--radius-card) bg-soft/60 px-3 py-2 text-xs text-muted">
                  Setelah batas ini lewat, stok kembali tersedia dan status pesanan berubah menjadi dibatalkan.
                </p>
              </FormSection>
            </div>
          ) : null}

          {section === 'pengiriman' ? (
            <div className="space-y-4">
              <FormSection title="Kurir & ongkir" description="Dipakai saat menghitung tarif di checkout.">
                <Field
                  label="Kurir diizinkan"
                  htmlFor="store-couriers"
                  hint="Pisahkan dengan koma, mis. jne,sicepat,paxel."
                >
                  <Input
                    id="store-couriers"
                    value={form.couriers}
                    onChange={(event) => set('couriers', event.target.value)}
                    maxLength={200}
                  />
                </Field>
                <Field label="Ambang gratis ongkir (Rp)" htmlFor="store-free-ship" hint="0 = tidak ada gratis ongkir.">
                  <Input
                    id="store-free-ship"
                    inputMode="numeric"
                    value={form.freeShipThreshold}
                    onChange={(event) => set('freeShipThreshold', event.target.value.replace(/\D/g, ''))}
                  />
                </Field>
              </FormSection>

              <FormSection
                title="Gudang asal"
                description="Titik jemput yang dikirim ke Biteship saat menghitung ongkir."
              >
                {origin ? (
                  <div className="space-y-2 text-sm">
                    <div className="font-medium text-ink">{String(origin.name ?? '—')}</div>
                    <div className="text-xs text-muted">
                      {[origin.contactName, origin.phone].filter(Boolean).join(' · ') || '—'}
                    </div>
                    <div className="text-xs text-muted">
                      {[origin.address, origin.district, origin.city, origin.province, origin.postcode]
                        .filter(Boolean)
                        .join(', ') || '—'}
                    </div>
                    <Badge variant={origin.isActive ? 'success' : 'outline'}>
                      {origin.isActive ? 'Aktif' : 'Nonaktif'}
                    </Badge>
                  </div>
                ) : (
                  <p className="text-sm text-muted">Belum ada gudang asal. Ongkir dihitung dari tarif manual.</p>
                )}
              </FormSection>
            </div>
          ) : null}

          {section === 'integrasi' && gw ? (
            <div className="space-y-4">
              <FormSection title="Gateway pembayaran" description="Kredensial disimpan sebagai secret Worker.">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-ink">Duitku</div>
                    <div className="text-xs text-muted">
                      {gw.duitku.configured ? 'Terhubung' : 'Belum dikonfigurasi'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={gw.duitku.configured ? 'success' : 'outline'}>
                      {gw.duitku.configured ? gw.duitku.environment : 'off'}
                    </Badge>
                    {gw.duitku.configured ? (
                      <Badge variant="info">{gw.duitku.merchantCode ?? 'merchant n/a'}</Badge>
                    ) : null}
                  </div>
                </div>
                <Separator />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium text-ink">Biteship</div>
                    <div className="text-xs text-muted">
                      {gw.biteship.configured ? 'Terhubung' : 'Belum dikonfigurasi'}
                    </div>
                  </div>
                  <Badge variant={gw.biteship.configured ? 'success' : 'outline'}>
                    {gw.biteship.configured ? gw.biteship.environment : 'off'}
                  </Badge>
                </div>
                <p className="text-xs text-muted">
                  Kredensial API disimpan sebagai secret Worker (<span className="font-mono">wrangler secret</span>) dan
                  tidak dapat diubah dari layar ini.
                </p>
              </FormSection>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Status konfigurasi</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <Labeled label="Pembayaran">
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2
                        className={cn('h-4 w-4', gw.duitku.configured ? 'text-emerald-700' : 'text-muted')}
                      />
                      {gw.duitku.configured ? 'Siap menerima pembayaran' : 'Perlu secret Duitku'}
                    </span>
                  </Labeled>
                  <Labeled label="Pengiriman">
                    <span className="inline-flex items-center gap-1.5">
                      <CheckCircle2
                        className={cn('h-4 w-4', gw.biteship.configured ? 'text-emerald-700' : 'text-muted')}
                      />
                      {gw.biteship.configured ? 'Tarif real-time aktif' : 'Memakai tarif manual'}
                    </span>
                  </Labeled>
                </CardContent>
              </Card>
            </div>
          ) : null}

          {section === 'integrasi' && !gw ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted">
                Informasi gateway belum tersedia.
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>

      {/* Mobile: a real fixed bar. `sticky` on the last child never floats, so
          the save action used to live at the very end of a very long page. */}
      {dirty ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-pop backdrop-blur lg:hidden">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-xs text-muted">Belum disimpan</span>
            <Button variant="secondary" size="sm" onClick={() => setForm(saved)} disabled={save.isPending}>
              Batalkan
            </Button>
            <Button size="sm" loading={save.isPending} onClick={submit}>
              <Save /> Simpan
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default AdminSettings;
