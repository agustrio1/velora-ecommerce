import { ROUTES } from '@velora/shared';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Button, Field, Input } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { isFirebaseReady, register } from '../../lib/firebase';
import { AuthNotice, AuthShell, friendlyAuthError } from './AuthShell';

export function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useAuth();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) return setError('Kata sandi minimal 6 karakter.');
    if (password !== confirm) return setError('Konfirmasi kata sandi tidak cocok.');
    setBusy(true);
    try {
      await register(name, email, password);
      await refresh();
      navigate(ROUTES.profile, { replace: true });
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Daftar akun" subtitle="Buat akun VELORA untuk checkout dan lacak pesanan.">
      <AuthNotice />
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Nama lengkap" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </Field>
        <Field label="Email" required>
          <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </Field>
        <Field label="Kata sandi" required hint="Minimal 6 karakter.">
          <Input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Konfirmasi kata sandi" required>
          <Input
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
          />
        </Field>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <Button type="submit" className="w-full" loading={busy} disabled={!isFirebaseReady()}>
          Daftar
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-muted">
        Sudah punya akun?{' '}
        <Link to={ROUTES.login} className="text-accent hover:underline">
          Masuk
        </Link>
      </p>
    </AuthShell>
  );
}

export default RegisterPage;
