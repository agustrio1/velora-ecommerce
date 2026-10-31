import { cn } from '@/lib/utils';
import { SEO_ORG_TYPES, type SeoOrgType } from '@velora/shared';
import { BadgeCheck, Braces, Check, Image as ImageIcon, Minus, Sparkles, Wand2 } from 'lucide-react';
import { FormSection } from '../../../components/admin/kit';
import { Button } from '../../../components/ui/button';
import { Field, Input, Label, Select, Textarea } from '../../../components/ui/form';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/surface';
import type { PublicSettings } from '../../../lib/api-types';
import { buildStoreJsonLd, parseJsonLdExtra, seoBase } from '../../../lib/seo';
import { ToggleRow } from './controls';
import type { SeoFormState, SettingsForm } from './settings-form';

const ORG_LABEL: Record<SeoOrgType, string> = {
  OnlineStore: 'OnlineStore — toko daring',
  Store: 'Store — toko fisik',
  LocalBusiness: 'LocalBusiness — usaha lokal',
  Organization: 'Organization — organisasi',
};

const FAQ_TEMPLATE = JSON.stringify(
  {
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: 'Berapa lama pengiriman?',
        acceptedAnswer: { '@type': 'Answer', text: 'Pesanan dikirim 1–3 hari kerja setelah pembayaran.' },
      },
    ],
  },
  null,
  2,
);

/** The document URL the preview pretends to be, so the JSON-LD matches production shape. */
function previewBase(form: SettingsForm): string {
  return seoBase({ canonicalBaseUrl: form.seo.canonicalBaseUrl.trim() || null }, 'https://velora.id');
}

/* --------------------------------- SEO tab -------------------------------- */

export function SeoWorkspace({
  form,
  onSeo,
}: {
  form: SettingsForm;
  onSeo: (patch: Partial<SeoFormState>) => void;
}) {
  const seo = form.seo;
  const base = previewBase(form);
  const domain = base.replace(/^https?:\/\//, '');
  // The preview shows the homepage: it is the row admins are actually editing.
  // Blank home fields fall back to the site defaults, exactly like the storefront.
  const previewTitle = seo.homeTitle.trim() || seo.defaultTitle || 'Judul halaman bawaan';
  const previewDescription =
    seo.homeDescription.trim() || seo.defaultDescription || 'Deskripsi halaman bawaan akan muncul di sini.';

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-4 xl:order-2 xl:sticky xl:top-20 xl:self-start">
        {/* On phones the preview comes first: it is the feedback loop while editing.
            The two cards share one sticky column so they cannot overlap. */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-accent" /> Pratinjau hasil pencarian
            </CardTitle>
          </CardHeader>
          <CardContent className="bg-white">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-soft text-[11px] font-semibold text-ink">
                {(seo.siteName || form.storeName || 'V').slice(0, 1).toUpperCase()}
              </span>
              <div className="min-w-0">
                <div className="truncate text-xs font-medium text-[#202124]">
                  {seo.siteName || form.storeName || 'VELORA'}
                </div>
                <div className="truncate text-[11px] text-[#5f6368]">{domain}</div>
              </div>
            </div>
            <h3 className="mt-2 line-clamp-2 text-lg leading-snug text-[#1a0dab]">{truncate(previewTitle, 60)}</h3>
            <p className="mt-0.5 line-clamp-2 text-sm leading-relaxed text-[#4d5156]">
              {truncate(previewDescription, 155)}
            </p>
            {!seo.homeTitle.trim() || !seo.homeDescription.trim() ? (
              <p className="mt-2 border-t border-line pt-2 text-[11px] leading-relaxed text-muted">
                Kolom beranda masih kosong: judul dan deskripsi disusun otomatis dari teks hero serta kategori yang
                tampil di halaman depan.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Ringkasan teknis</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <SummaryRow
              label="robots"
              value={`${seo.robotsIndex ? 'index' : 'noindex'}, ${seo.robotsFollow ? 'follow' : 'nofollow'}`}
            />
            <SummaryRow label="canonical" value={seo.canonicalBaseUrl.trim() ? 'URL tetap' : 'Domain permintaan'} />
            <SummaryRow label="OG image" value={seo.defaultOgImage.trim() ? 'Diatur' : 'Logo cadangan'} />
            <SummaryRow label="JSON-LD" value={seo.jsonLdEnabled ? 'Aktif' : 'Nonaktif'} />
          </CardContent>
        </Card>
      </div>

      <div className="min-w-0 space-y-4 xl:order-1">
        <FormSection
          title="Identitas mesin pencari"
          description="Dipakai sebagai judul dan deskripsi bawaan setiap halaman."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nama situs" htmlFor="seo-site-name" hint="Untuk og:site_name dan schema.org.">
              <Input
                id="seo-site-name"
                value={seo.siteName}
                onChange={(event) => onSeo({ siteName: event.target.value })}
                maxLength={80}
                placeholder="VELORA"
              />
            </Field>
            <Field label="URL kanonik" htmlFor="seo-base" hint="Kosongkan untuk memakai domain permintaan.">
              <Input
                id="seo-base"
                value={seo.canonicalBaseUrl}
                onChange={(event) => onSeo({ canonicalBaseUrl: event.target.value })}
                maxLength={300}
                placeholder="https://velora.id"
                inputMode="url"
              />
            </Field>
          </div>

          <CountedField
            id="seo-title"
            label="Judul bawaan"
            value={seo.defaultTitle}
            max={180}
            ideal={60}
            placeholder="VELORA — Busana Modern"
            hint="Sisa ruang di hasil pencarian ±60 karakter."
            onChange={(value) => onSeo({ defaultTitle: value })}
          />
          <CountedField
            id="seo-description"
            label="Deskripsi bawaan"
            value={seo.defaultDescription}
            max={320}
            ideal={155}
            multiline
            placeholder="Katalog busana modern dengan harga jujur…"
            hint="Google menampilkan ±155 karakter sebelum memotong teks."
            onChange={(value) => onSeo({ defaultDescription: value })}
          />
          <CountedField
            id="seo-home-title"
            label="Judul beranda"
            value={seo.homeTitle}
            max={180}
            ideal={60}
            placeholder="VELORA — Kaos, Kemeja, Outerwear"
            hint="Hanya untuk halaman depan. Kosongkan agar judul disusun dari konten hero dan kategori."
            onChange={(value) => onSeo({ homeTitle: value })}
          />
          <CountedField
            id="seo-home-description"
            label="Deskripsi beranda"
            value={seo.homeDescription}
            max={320}
            ideal={155}
            multiline
            placeholder="Katalog kaos, kemeja, dan outerwear dengan harga jujur serta pengiriman ke seluruh Indonesia."
            hint="Kosongkan untuk memakai teks hero halaman depan secara otomatis."
            onChange={(value) => onSeo({ homeDescription: value })}
          />
          <Field label="Kata kunci" htmlFor="seo-keywords" hint="Pisahkan dengan koma. Bobotnya kecil, isi seperlunya.">
            <Input
              id="seo-keywords"
              value={seo.keywords}
              onChange={(event) => onSeo({ keywords: event.target.value })}
              maxLength={300}
              placeholder="busana modern, pakaian premium, fashion lokal"
            />
          </Field>
        </FormSection>

        <FormSection title="Pratinjau media & sosial" description="Gambar kartu saat tautan dibagikan.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="OG image" htmlFor="seo-og" hint="Disarankan 1200×630 piksel.">
              <Input
                id="seo-og"
                value={seo.defaultOgImage}
                onChange={(event) => onSeo({ defaultOgImage: event.target.value })}
                maxLength={300}
                placeholder="/og-cover.jpg atau https://…"
              />
            </Field>
            <Field label="Akun X / Twitter" htmlFor="seo-twitter" hint="Dipakai untuk tag twitter:site.">
              <Input
                id="seo-twitter"
                value={seo.twitterHandle}
                onChange={(event) => onSeo({ twitterHandle: event.target.value })}
                maxLength={30}
                placeholder="@velora"
              />
            </Field>
          </div>
          <div className="overflow-hidden rounded-(--radius-card) border border-line">
            <div className="flex items-center gap-2 bg-soft/60 px-3 py-2 text-xs text-muted">
              <ImageIcon className="h-3.5 w-3.5" /> Kartu tautan
            </div>
            {seo.defaultOgImage.trim() ? (
              <img
                src={seo.defaultOgImage}
                alt="Pratinjau gambar OG"
                className="h-40 w-full bg-soft object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-40 w-full items-center justify-center bg-soft/40 text-xs text-muted">
                Belum ada gambar — logo toko dipakai sebagai cadangan.
              </div>
            )}
            <div className="space-y-1 border-t border-line px-3 py-2">
              <div className="truncate text-[11px] uppercase tracking-wider text-muted">{domain}</div>
              <div className="line-clamp-1 text-sm font-medium text-ink">{seo.defaultTitle || 'Judul halaman'}</div>
              <div className="line-clamp-2 text-xs text-muted">
                {seo.defaultDescription || 'Deskripsi halaman akan tampil di sini.'}
              </div>
            </div>
          </div>
        </FormSection>

        <FormSection
          title="Indeks mesin pencari"
          description="Berlaku untuk halaman publik; area akun dan admin selalu noindex."
        >
          <ToggleRow
            label="Izinkan indeks (index)"
            hint="Matikan saat toko masih dalam persiapan."
            checked={seo.robotsIndex}
            onChange={(value) => onSeo({ robotsIndex: value })}
          />
          <ToggleRow
            label="Ikuti tautan (follow)"
            hint="Jika mati, tautan keluar tidak diteruskan sebagai sinyal."
            checked={seo.robotsFollow}
            onChange={(value) => onSeo({ robotsFollow: value })}
          />
        </FormSection>
      </div>
    </div>
  );
}

/* -------------------------------- JSON-LD tab ------------------------------ */

export function JsonLdWorkspace({
  form,
  onSeo,
}: {
  form: SettingsForm;
  onSeo: (patch: Partial<SeoFormState>) => void;
}) {
  const seo = form.seo;
  const parsed = parseJsonLdExtra(seo.jsonLdExtra);
  const base = previewBase(form);
  const preview = buildStoreJsonLd(previewPayload(form), base);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="min-w-0 space-y-4">
        <FormSection title="Data terstruktur" description="Schema.org yang dikirim ke Google di setiap halaman.">
          <ToggleRow
            label="Aktifkan JSON-LD bawaan"
            hint="Menyusun node Organization/OnlineStore dan WebSite otomatis."
            checked={seo.jsonLdEnabled}
            onChange={(value) => onSeo({ jsonLdEnabled: value })}
          />
          <Field
            label="Tipe organisasi"
            htmlFor="seo-org"
            hint="Pilih sesuai bentuk usaha — memengaruhi hasil knowledge panel."
          >
            <Select
              id="seo-org"
              value={seo.organizationType}
              onChange={(event) => onSeo({ organizationType: event.target.value as SeoOrgType })}
              disabled={!seo.jsonLdEnabled}
            >
              {SEO_ORG_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ORG_LABEL[type]}
                </option>
              ))}
            </Select>
          </Field>
        </FormSection>

        <FormSection
          title="JSON-LD tambahan"
          description="Objek atau array yang digabung ke @graph. Tempel satu blok tanpa tag <script>."
          action={
            <Button type="button" variant="secondary" size="sm" onClick={() => onSeo({ jsonLdExtra: FAQ_TEMPLATE })}>
              <Wand2 /> Contoh FAQ
            </Button>
          }
        >
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="seo-jsonld">JSON</Label>
              {parsed.ok ? (
                seo.jsonLdExtra.trim() ? (
                  <Badge variant="success">
                    <BadgeCheck className="h-3 w-3" /> JSON valid
                  </Badge>
                ) : (
                  <Badge variant="outline">Kosong</Badge>
                )
              ) : (
                <Badge variant="danger">JSON tidak valid</Badge>
              )}
            </div>
            <Textarea
              id="seo-jsonld"
              value={seo.jsonLdExtra}
              onChange={(event) => onSeo({ jsonLdExtra: event.target.value })}
              maxLength={4000}
              spellCheck={false}
              className="min-h-56 font-mono text-xs leading-relaxed"
              placeholder={'{\n  "@type": "FAQPage",\n  "mainEntity": []\n}'}
            />
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className={cn(parsed.ok ? 'text-muted' : 'text-red-700')}>
                {parsed.ok ? 'Objek atau array, tanpa @context juga boleh.' : parsed.error}
              </span>
              <span className="tabular-nums text-muted">{seo.jsonLdExtra.length}/4000</span>
            </div>
          </div>
        </FormSection>

        <FormSection title="Diisi otomatis dari profil toko" description="Tidak perlu mengetik ulang di blok JSON.">
          <ul className="grid gap-2 sm:grid-cols-2">
            {[
              ['name', seo.siteName || form.storeName],
              ['url', base],
              ['logo', form.logo],
              ['telephone', form.whatsapp],
              ['email', form.email],
              ['sameAs', [form.instagram, form.tiktok].filter(Boolean).join(', ')],
            ].map(([key, value]) => (
              <li key={key} className="flex items-start gap-2 rounded-(--radius-card) bg-soft/50 px-3 py-2 text-xs">
                {value ? (
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" />
                ) : (
                  <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
                )}
                <div className="min-w-0">
                  <div className="font-mono text-[11px] text-ink">{key}</div>
                  <div className="truncate text-muted">{value || 'belum diisi'}</div>
                </div>
              </li>
            ))}
          </ul>
        </FormSection>
      </div>

      <Card className="min-w-0 xl:sticky xl:top-20 xl:self-start">
        <CardHeader className="flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Braces className="h-4 w-4 text-accent" /> Pratinjau @graph
          </CardTitle>
          <Badge variant={seo.jsonLdEnabled ? 'success' : 'outline'}>{seo.jsonLdEnabled ? 'Aktif' : 'Nonaktif'}</Badge>
        </CardHeader>
        <CardContent className="p-0">
          <pre className="max-h-64 overflow-auto bg-canvas/60 px-4 py-3 text-[11px] leading-relaxed text-ink xl:max-h-[32rem]">
            {preview ? JSON.stringify(preview, null, 2) : '// JSON-LD dinonaktifkan — tidak ada skrip yang dikirim.'}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------------------- helpers --------------------------------- */

function previewPayload(form: SettingsForm): PublicSettings {
  return {
    seo: {
      siteName: form.seo.siteName,
      defaultTitle: form.seo.defaultTitle,
      defaultDescription: form.seo.defaultDescription,
      homeTitle: form.seo.homeTitle,
      homeDescription: form.seo.homeDescription,
      defaultOgImage: form.seo.defaultOgImage || null,
      canonicalBaseUrl: form.seo.canonicalBaseUrl || null,
      keywords: form.seo.keywords,
      twitterHandle: form.seo.twitterHandle || null,
      robotsIndex: form.seo.robotsIndex,
      robotsFollow: form.seo.robotsFollow,
      jsonLdEnabled: form.seo.jsonLdEnabled,
      organizationType: form.seo.organizationType,
      jsonLdExtra: form.seo.jsonLdExtra || null,
    },
    store: {
      storeName: form.storeName,
      logoUrl: form.logo || null,
      address: '',
      whatsapp: form.whatsapp || null,
      email: form.email || null,
      social: { instagram: form.instagram, tiktok: form.tiktok },
    },
  };
}

function CountedField({
  id,
  label,
  value,
  max,
  ideal,
  hint,
  placeholder,
  multiline,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  max: number;
  ideal: number;
  hint: string;
  placeholder?: string;
  multiline?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <span className={cn('text-[11px] tabular-nums', counterTone(value.length, ideal))}>
          {value.length}/{max}
        </span>
      </div>
      {multiline ? (
        <Textarea
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={max}
          placeholder={placeholder}
          className="min-h-20"
        />
      ) : (
        <Input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={max}
          placeholder={placeholder}
        />
      )}
      <span className="block text-xs text-muted">{hint}</span>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line pb-2 last:border-0 last:pb-0">
      <span className="shrink-0 font-mono text-[11px] text-muted">{label}</span>
      <span className="min-w-0 truncate text-right text-xs text-ink">{value}</span>
    </div>
  );
}

function counterTone(length: number, ideal: number): string {
  if (length === 0) return 'text-muted';
  if (length <= ideal) return 'text-emerald-700';
  if (length <= ideal * 1.15) return 'text-amber-700';
  return 'text-orange-700';
}

function truncate(value: string, max: number): string {
  const text = value.trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
