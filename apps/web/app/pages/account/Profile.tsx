import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type NotificationPrefs, ROUTES, type UserAddress, type UserProfile } from '@velora/shared';
import { Eye, EyeOff, KeyRound, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { Link, type LoaderFunctionArgs } from 'react-router';
import { AddressForm } from '../../components/AddressForm';
import { AccountNav } from '../../components/account/AccountNav';
import { Button, Field, Input, Modal, Select, Spinner } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ApiError, api } from '../../lib/api';
import type { AddressList } from '../../lib/api-types';
import { changePassword, hasPasswordProvider, requestReset } from '../../lib/firebase';
import { cloudflareEnv } from '../../services/cloudflare.server';
import { requireSession } from '../../services/session.server';

export async function loader({ request, context }: LoaderFunctionArgs) {
  await requireSession(request, cloudflareEnv(context));
  return null;
}

interface MeView {
  user: { email: string; displayName: string | null };
  profile: UserProfile | null;
  prefs: NotificationPrefs;
}

export function ProfilePage() {
  const toast = useToast();
  const qc = useQueryClient();
  const { signOut } = useAuth();

  const me = useQuery<MeView>({
    queryKey: ['me'],
    queryFn: () => api.get<MeView>('/account/me', undefined, { anonymous: true }),
  });

  const addresses = useQuery<AddressList>({
    queryKey: ['addresses'],
    queryFn: () => api.get<AddressList>('/account/addresses', undefined, { anonymous: true }),
  });

  const [showAddr, setShowAddr] = useState(false);
  const [editing, setEditing] = useState<UserAddress | null>(null);

  const delAddress = useMutation({
    mutationFn: (id: string) => api.del<AddressList>(`/account/addresses/${id}`),
    onSuccess: (data) => {
      qc.setQueryData<AddressList>(['addresses'], data);
      toast.push('Alamat dihapus', 'success');
    },
    onError: (err) => toast.push(err instanceof ApiError ? err.message : 'Gagal menghapus', 'error'),
  });

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="mb-1 text-2xl sm:text-3xl">Akun saya</h1>
      <AccountNav current="profile" />

      {me.isLoading && !me.data ? (
        <Spinner />
      ) : (
        <div className="space-y-8">
          <ProfileForm profile={me.data?.profile ?? null} email={me.data?.user.email ?? ''} />
          <PasswordSection email={me.data?.user.email ?? ''} />
          <PrefsForm prefs={me.data?.prefs ?? null} onSaved={() => qc.invalidateQueries({ queryKey: ['me'] })} />

          <section className="border border-line bg-surface p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg">Buku alamat</h2>
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setShowAddr(true);
                }}
              >
                <Plus className="h-4 w-4" /> Tambah
              </Button>
            </div>
            {addresses.isLoading ? (
              <Spinner />
            ) : (addresses.data?.items.length ?? 0) === 0 ? (
              <p className="text-sm text-muted">Belum ada alamat tersimpan.</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {addresses.data!.items.map((a) => (
                  <AddressCard
                    key={a.id}
                    address={a}
                    onEdit={() => {
                      setEditing(a);
                      setShowAddr(true);
                    }}
                    onDelete={() => {
                      if (!confirm(`Hapus alamat “${a.label}”?`)) return;
                      delAddress.mutate(a.id);
                    }}
                  />
                ))}
              </ul>
            )}
          </section>

          <div className="flex items-center justify-between border border-line bg-surface p-5">
            <div>
              <div className="text-sm font-medium">{me.data?.user.email}</div>
              <div className="text-xs text-muted">Keluar dari perangkat ini.</div>
            </div>
            <Button variant="secondary" size="sm" onClick={() => void signOut()}>
              Keluar
            </Button>
          </div>

          <p className="text-center text-sm text-muted">
            <Link to={ROUTES.orders} className="text-accent hover:underline">
              Lihat pesanan saya →
            </Link>
          </p>
        </div>
      )}

      <Modal open={showAddr} title={editing ? 'Ubah alamat' : 'Alamat baru'} onClose={() => setShowAddr(false)} wide>
        <AddressForm
          initial={editing}
          onCancel={() => setShowAddr(false)}
          onSaved={() => {
            setShowAddr(false);
            addresses.refetch();
          }}
        />
      </Modal>
    </div>
  );
}

function AddressCard({
  address,
  onEdit,
  onDelete,
}: { address: UserAddress; onEdit: () => void; onDelete: () => void }) {
  return (
    <li className="flex flex-col border border-line p-3 text-sm">
      <div className="flex items-center gap-2">
        <span className="font-medium">{address.label}</span>
        {address.isDefaultShipping ? (
          <span className="inline-flex items-center gap-1 text-xs text-accent">
            <Star className="h-3 w-3 fill-accent" /> utama
          </span>
        ) : null}
      </div>
      <div className="mt-1 flex-1 text-muted">
        <div>
          {address.recipientName} · {address.phone}
        </div>
        <div className="line-clamp-2">
          {address.detail}, {address.district}, {address.city}, {address.province} {address.postcode}
        </div>
      </div>
      <div className="mt-2 flex gap-3 text-xs">
        <button onClick={onEdit} className="inline-flex items-center gap-1 text-accent hover:underline">
          <Pencil className="h-3.5 w-3.5" /> Ubah
        </button>
        <button onClick={onDelete} className="inline-flex items-center gap-1 text-muted hover:text-red-700">
          <Trash2 className="h-3.5 w-3.5" /> Hapus
        </button>
      </div>
    </li>
  );
}

function ProfileForm({ profile, email }: { profile: UserProfile | null; email: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    fullName: profile?.fullName ?? '',
    nickname: profile?.nickname ?? '',
    gender: (profile?.gender ?? '') as '' | 'male' | 'female' | 'other',
    birthday: profile?.birthday ?? '',
    preferredSize: profile?.preferredSize ?? '',
    heightCm: profile?.heightCm != null ? String(profile.heightCm) : '',
    weightKg: profile?.weightKg != null ? String(profile.weightKg) : '',
  });

  useEffect(() => {
    if (profile) {
      setForm({
        fullName: profile.fullName ?? '',
        nickname: profile.nickname ?? '',
        gender: (profile.gender ?? '') as '' | 'male' | 'female' | 'other',
        birthday: profile.birthday ?? '',
        preferredSize: profile.preferredSize ?? '',
        heightCm: profile.heightCm != null ? String(profile.heightCm) : '',
        weightKg: profile.weightKg != null ? String(profile.weightKg) : '',
      });
    }
  }, [profile]);

  const save = useMutation({
    mutationFn: () =>
      api.patch<{ profile: UserProfile }>('/account/me', {
        fullName: form.fullName || null,
        nickname: form.nickname || null,
        gender: form.gender || null,
        birthday: form.birthday || null,
        preferredSize: form.preferredSize || null,
        heightCm: form.heightCm ? Number(form.heightCm) : null,
        weightKg: form.weightKg ? Number(form.weightKg) : null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['me'] });
      toast.push('Profil diperbarui', 'success');
    },
    onError: (err) => toast.push(err instanceof ApiError ? err.message : 'Gagal menyimpan profil', 'error'),
  });

  return (
    <section className="border border-line bg-surface p-5">
      <h2 className="mb-3 text-lg">Data diri</h2>
      <div className="mb-4 text-sm text-muted">
        Email: <span className="text-ink">{email}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nama lengkap">
          <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
        </Field>
        <Field label="Nama panggilan">
          <Input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
        </Field>
        <Field label="Jenis kelamin">
          <Select
            value={form.gender}
            onChange={(e) => setForm({ ...form, gender: e.target.value as typeof form.gender })}
          >
            <option value="">—</option>
            <option value="female">Perempuan</option>
            <option value="male">Laki-laki</option>
            <option value="other">Lainnya</option>
          </Select>
        </Field>
        <Field label="Tanggal lahir">
          <Input type="date" value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} />
        </Field>
        <Field label="Ukuran favorit">
          <Input
            value={form.preferredSize}
            onChange={(e) => setForm({ ...form, preferredSize: e.target.value })}
            placeholder="mis. M / 42"
          />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Tinggi (cm)">
            <Input
              inputMode="numeric"
              value={form.heightCm}
              onChange={(e) => setForm({ ...form, heightCm: e.target.value })}
            />
          </Field>
          <Field label="Berat (kg)">
            <Input
              inputMode="numeric"
              value={form.weightKg}
              onChange={(e) => setForm({ ...form, weightKg: e.target.value })}
            />
          </Field>
        </div>
      </div>
      <div className="mt-4 flex justify-end">
        <Button loading={save.isPending} onClick={() => save.mutate()}>
          Simpan profil
        </Button>
      </div>
    </section>
  );
}

function PasswordSection({ email }: { email: string }) {
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mailing, setMailing] = useState(false);
  const [sent, setSent] = useState(false);
  // Only email/password accounts own a credential here; Google sign-ups set one through the reset link.
  const canChange = hasPasswordProvider();

  async function mailReset() {
    setError(null);
    setMailing(true);
    try {
      await requestReset(email);
      setSent(true);
      toast.push('Tautan atur sandi dikirim', 'success');
    } catch (err) {
      setError(passwordError(err));
    } finally {
      setMailing(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (next.length < 8) return setError('Kata sandi baru minimal 8 karakter.');
    if (next !== again) return setError('Ulangi kata sandi baru dengan tepat.');
    if (next === current) return setError('Kata sandi baru harus berbeda dari yang sekarang.');
    setBusy(true);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setAgain('');
      toast.push('Kata sandi diperbarui', 'success');
    } catch (err) {
      setError(passwordError(err));
    } finally {
      setBusy(false);
    }
  }

  if (!canChange) {
    return (
      <section className="border border-line bg-surface p-5">
        <h2 className="mb-1 text-lg">Kata sandi</h2>
        <p className="mb-4 text-sm text-muted">
          Akun ini masuk lewat Google, jadi belum punya kata sandi VELORA. Kirim tautan untuk mengaturnya lebih dulu.
        </p>
        {error ? <p className="mb-3 text-sm text-red-700">{error}</p> : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" loading={mailing} onClick={() => void mailReset()}>
            <KeyRound className="h-4 w-4" /> Kirim tautan atur sandi
          </Button>
          {sent ? <span className="text-xs text-muted">Dikirim ke {email}.</span> : null}
        </div>
      </section>
    );
  }

  return (
    <section className="border border-line bg-surface p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg">Kata sandi</h2>
          <p className="mt-1 text-sm text-muted">
            Dipakai untuk masuk dengan {email}. Minimal 8 karakter — frasa panjang lebih aman.
          </p>
        </div>
        <Link to={ROUTES.forgotPassword} className="text-xs text-accent hover:underline">
          Lupa sandi?
        </Link>
      </div>

      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Kata sandi saat ini" required htmlFor="pwd-current" className="sm:col-span-2">
          <SecretInput id="pwd-current" value={current} onChange={setCurrent} autoComplete="current-password" />
        </Field>
        <Field label="Kata sandi baru" required htmlFor="pwd-next">
          <SecretInput id="pwd-next" value={next} onChange={setNext} autoComplete="new-password" />
        </Field>
        <Field label="Ulangi kata sandi baru" required htmlFor="pwd-confirm">
          <SecretInput id="pwd-confirm" value={again} onChange={setAgain} autoComplete="new-password" />
        </Field>
        {error ? <p className="text-sm text-red-700 sm:col-span-2">{error}</p> : null}
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" loading={busy} disabled={!current || !next || !again}>
            Simpan kata sandi
          </Button>
        </div>
      </form>
    </section>
  );
}

/** Password input with a reveal toggle; each field keeps its own visibility. */
function SecretInput({
  id,
  value,
  onChange,
  autoComplete,
}: { id: string; value: string; onChange: (value: string) => void; autoComplete: string }) {
  const [reveal, setReveal] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={reveal ? 'text' : 'password'}
        required
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setReveal((prev) => !prev)}
        aria-label={reveal ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
        aria-pressed={reveal}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted transition-colors hover:text-ink"
      >
        {reveal ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

/**
 * Firebase codes mean something specific here — reauthentication failures are
 * about the *current* password, so the login screen's wording would mislead.
 */
function passwordError(err: unknown): string {
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: string }).code) : '';
  if (code.includes('wrong-password') || code.includes('invalid-credential')) return 'Kata sandi saat ini salah.';
  if (code.includes('weak-password')) return 'Kata sandi baru terlalu lemah. Gunakan minimal 8 karakter.';
  if (code.includes('requires-recent-login')) return 'Sesi sudah lama. Keluar lalu masuk kembali, kemudian coba lagi.';
  if (code.includes('too-many-requests')) return 'Terlalu banyak percobaan. Tunggu beberapa saat lalu coba lagi.';
  if (code.includes('network')) return 'Koneksi bermasalah. Periksa jaringan lalu coba lagi.';
  return err instanceof Error ? err.message : 'Gagal mengubah kata sandi.';
}

function PrefsForm({ prefs, onSaved }: { prefs: NotificationPrefs | null; onSaved: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState<NotificationPrefs>(
    prefs ?? { orderUpdates: true, payments: true, shipping: true, promotions: false, email: true },
  );
  useEffect(() => {
    if (prefs) setForm(prefs);
  }, [prefs]);

  const save = useMutation({
    mutationFn: () => api.put<{ prefs: NotificationPrefs }>('/account/preferences', form),
    onSuccess: () => {
      onSaved();
      toast.push('Preferensi disimpan', 'success');
    },
    onError: (err) => toast.push(err instanceof ApiError ? err.message : 'Gagal menyimpan preferensi', 'error'),
  });

  const toggles: { key: keyof NotificationPrefs; label: string }[] = [
    { key: 'orderUpdates', label: 'Update pesanan' },
    { key: 'payments', label: 'Pembayaran' },
    { key: 'shipping', label: 'Pengiriman' },
    { key: 'promotions', label: 'Promo & katalog baru' },
    { key: 'email', label: 'Notifikasi via email' },
  ];

  return (
    <section className="border border-line bg-surface p-5">
      <h2 className="mb-3 text-lg">Preferensi notifikasi</h2>
      <div className="grid gap-2 sm:grid-cols-2">
        {toggles.map((t) => (
          <label key={t.key} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form[t.key]}
              onChange={(e) => setForm({ ...form, [t.key]: e.target.checked })}
            />
            {t.label}
          </label>
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" loading={save.isPending} onClick={() => save.mutate()}>
          Simpan preferensi
        </Button>
      </div>
    </section>
  );
}

export default ProfilePage;
