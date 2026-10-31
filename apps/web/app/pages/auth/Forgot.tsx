import { ROUTES } from '@velora/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button, Field, Input } from '../../components/ui';
import { isFirebaseReady, requestReset } from '../../lib/firebase';
import { AuthNotice, AuthShell, friendlyAuthError } from './AuthShell';

export function ForgotPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await requestReset(email);
      setSent(true);
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell title="Lupa kata sandi" subtitle="Kami kirim tautan reset ke email Anda.">
      <AuthNotice />
      {sent ? (
        <p className="text-sm text-ink">
          Jika <strong>{email}</strong> terdaftar, tautan reset sudah dikirim. Cek kotak masuk Anda.
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <Field label="Email" required>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </Field>
          {error ? <p className="text-sm text-red-700">{error}</p> : null}
          <Button type="submit" className="w-full" loading={busy} disabled={!isFirebaseReady()}>
            Kirim tautan reset
          </Button>
        </form>
      )}
      <p className="mt-6 text-center text-sm text-muted">
        <Link to={ROUTES.login} className="text-accent hover:underline">
          Kembali ke masuk
        </Link>
      </p>
    </AuthShell>
  );
}

export default ForgotPage;
