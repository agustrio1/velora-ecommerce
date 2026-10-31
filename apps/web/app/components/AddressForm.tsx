import { useMutation } from '@tanstack/react-query';
import type { UserAddress } from '@velora/shared';
import { Loader2, MapPin, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useToast } from '../context/ToastContext';
import { ApiError, api } from '../lib/api';
import type { AreasResponse } from '../lib/api-types';
import { Button, Field, Input, Textarea } from './ui';

type AreaItem = AreasResponse['items'][number];
type AreaStatus = 'idle' | 'loading' | 'done' | 'error';

const MIN_CHARS = 3;
const DEBOUNCE_MS = 350;

function joinParts(parts: Array<string | null | undefined>): string {
  return parts.filter(Boolean).join(', ');
}

export function AddressForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial?: UserAddress | null;
  onSaved: (address: UserAddress) => void;
  /** Omit to hide the cancel button (e.g. when this is the only way forward). */
  onCancel?: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState({
    label: initial?.label ?? 'Rumah',
    recipientName: initial?.recipientName ?? '',
    phone: initial?.phone ?? '',
    province: initial?.province ?? '',
    city: initial?.city ?? '',
    district: initial?.district ?? '',
    postcode: initial?.postcode ?? '',
    detail: initial?.detail ?? '',
    areaId: initial?.areaId ?? (null as string | null),
    isDefaultShipping: initial?.isDefaultShipping ?? false,
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  // Area autocomplete state
  const [areaTerm, setAreaTerm] = useState('');
  const [areas, setAreas] = useState<AreaItem[]>([]);
  const [areaStatus, setAreaStatus] = useState<AreaStatus>('idle');
  const [areaMessage, setAreaMessage] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const boxRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);
  const skipNextSearch = useRef(false);

  function set<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // Debounced search as the user types.
  useEffect(() => {
    if (skipNextSearch.current) {
      skipNextSearch.current = false;
      return;
    }
    const term = areaTerm.trim();
    if (term.length < MIN_CHARS) {
      requestId.current += 1; // invalidate any in-flight request
      setAreas([]);
      setAreaStatus('idle');
      setAreaMessage(null);
      return;
    }

    const id = ++requestId.current;
    setAreaStatus('loading');
    const timer = setTimeout(async () => {
      try {
        const res = await api.get<AreasResponse>('/shipping/areas', { q: term, limit: 8 });
        if (id !== requestId.current) return;
        setAreas(res.items ?? []);
        setAreaMessage(
          res.configured ? null : (res.message ?? 'Pencarian wilayah belum aktif. Isi alamat secara manual.'),
        );
        setAreaStatus('done');
        setMenuOpen(true);
      } catch (err) {
        if (id !== requestId.current) return;
        setAreas([]);
        setAreaMessage(err instanceof ApiError ? err.message : 'Pencarian wilayah gagal. Coba lagi.');
        setAreaStatus('error');
        setMenuOpen(true);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [areaTerm]);

  // Close the suggestion list when clicking elsewhere.
  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  function pickArea(a: AreaItem) {
    const label = joinParts([a.name, a.city]);
    if (label !== areaTerm) {
      skipNextSearch.current = true;
      setAreaTerm(label);
    }
    setForm((f) => ({
      ...f,
      areaId: a.id,
      province: a.province || f.province,
      city: a.city || f.city,
      district: a.district || f.district,
      postcode: a.postcode || f.postcode,
    }));
    setAreas([]);
    setAreaStatus('idle');
    setAreaMessage(null);
    setMenuOpen(false);
  }

  function clearArea() {
    skipNextSearch.current = areaTerm !== '';
    setAreaTerm('');
    setAreas([]);
    setAreaStatus('idle');
    setAreaMessage(null);
    setForm((f) => ({ ...f, areaId: null }));
  }

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...form, areaId: form.areaId || null };
      if (initial) return api.patch<{ address: UserAddress }>(`/account/addresses/${initial.id}`, payload);
      return api.post<{ address: UserAddress }>('/account/addresses', payload);
    },
    onSuccess: (res) => {
      toast.push('Alamat tersimpan', 'success');
      onSaved(res.address);
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        setErrors(err.fieldErrors);
        if (Object.keys(err.fieldErrors).length === 0) toast.push(err.message, 'error');
      } else {
        toast.push('Gagal menyimpan alamat', 'error');
      }
    },
  });

  const err = (k: string) => errors[k]?.[0];
  const hasArea = Boolean(form.areaId);
  const lock = (value: string) => hasArea && value.trim() !== '';
  const showMenu = menuOpen && areaStatus !== 'idle' && areaTerm.trim().length >= MIN_CHARS;

  return (
    <div className="space-y-5">
      {/* Area search (Biteship) */}
      {hasArea ? (
        <div className="flex items-start justify-between gap-3 border border-line bg-soft p-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <div className="min-w-0 text-sm">
              <div className="font-medium">Wilayah terhubung ke Biteship</div>
              <div className="text-xs text-muted">Ongkir akan dihitung otomatis untuk wilayah ini.</div>
            </div>
          </div>
          <button type="button" onClick={clearArea} className="shrink-0 text-sm text-accent hover:underline">
            Ganti
          </button>
        </div>
      ) : (
        <Field label="Cari wilayah" hint="Ketik kecamatan atau kota (min. 3 huruf), lalu pilih dari saran.">
          <div ref={boxRef} className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              value={areaTerm}
              onChange={(e) => {
                setAreaTerm(e.target.value);
                setMenuOpen(true);
              }}
              onFocus={() => setMenuOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.preventDefault();
                if (e.key === 'Escape') setMenuOpen(false);
              }}
              placeholder="mis. Grogol Petamburan"
              autoComplete="off"
              className="pl-9 pr-9"
            />
            {areaStatus === 'loading' ? (
              <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted" />
            ) : null}

            {showMenu ? (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto border border-line bg-surface shadow-lg">
                {areaStatus === 'loading' && areas.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-muted">Mencari wilayah…</p>
                ) : null}

                {areaStatus === 'error' ? <p className="px-3 py-3 text-sm text-red-700">{areaMessage}</p> : null}

                {areaStatus === 'done' && areaMessage ? (
                  <p className="px-3 py-3 text-sm text-amber-800">{areaMessage}</p>
                ) : null}

                {areaStatus === 'done' && !areaMessage && areas.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-muted">
                    Wilayah tidak ditemukan. Coba nama kecamatan atau kota lain.
                  </p>
                ) : null}

                {areas.map((a) => {
                  const sub = joinParts([a.district, a.city, a.province]) + (a.postcode ? ` ${a.postcode}` : '');
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => pickArea(a)}
                      className="block w-full border-b border-line px-3 py-2.5 text-left last:border-b-0 hover:bg-soft"
                    >
                      <span className="block text-sm font-medium">{a.name}</span>
                      {sub.trim() ? <span className="block text-xs text-muted">{sub}</span> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </Field>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 *:min-w-0">
        <Field label="Label" required error={err('label')}>
          <Input value={form.label} onChange={(e) => set('label', e.target.value)} />
        </Field>
        <Field label="Nama penerima" required error={err('recipientName')}>
          <Input value={form.recipientName} onChange={(e) => set('recipientName', e.target.value)} />
        </Field>
        <Field label="Nomor telepon" required error={err('phone')}>
          <Input
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            placeholder="08xx…"
            inputMode="tel"
          />
        </Field>
        <Field label="Kode pos" required error={err('postcode')}>
          <Input
            value={form.postcode}
            onChange={(e) => set('postcode', e.target.value)}
            inputMode="numeric"
            maxLength={5}
          />
        </Field>
        <Field label="Provinsi" required error={err('province')}>
          <Input
            value={form.province}
            onChange={(e) => set('province', e.target.value)}
            readOnly={lock(form.province)}
            className={lock(form.province) ? 'bg-soft' : undefined}
          />
        </Field>
        <Field label="Kota/Kabupaten" required error={err('city')}>
          <Input
            value={form.city}
            onChange={(e) => set('city', e.target.value)}
            readOnly={lock(form.city)}
            className={lock(form.city) ? 'bg-soft' : undefined}
          />
        </Field>
        <Field label="Kecamatan" required error={err('district')}>
          <Input
            value={form.district}
            onChange={(e) => set('district', e.target.value)}
            readOnly={lock(form.district)}
            className={lock(form.district) ? 'bg-soft' : undefined}
          />
        </Field>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isDefaultShipping}
              onChange={(e) => set('isDefaultShipping', e.target.checked)}
            />
            Jadikan alamat utama
          </label>
        </div>
      </div>

      <Field label="Alamat lengkap" required error={err('detail')}>
        <Textarea
          value={form.detail}
          onChange={(e) => set('detail', e.target.value)}
          placeholder="Nama jalan, nomor rumah, RT/RW, patokan…"
        />
      </Field>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel}>
            Batal
          </Button>
        ) : null}
        <Button onClick={() => save.mutate()} loading={save.isPending}>
          Simpan alamat
        </Button>
      </div>
    </div>
  );
}
