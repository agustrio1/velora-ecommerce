import { ROUTES } from '@velora/shared';
import { useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { Button, Field, Input } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { isFirebaseReady, signIn, signInWithGoogle } from '../../lib/firebase';
import { AuthNotice, AuthShell, friendlyAuthError } from './AuthShell';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [search] = useSearchParams();
  const { refresh } = useAuth();
  // `next` comes from the SSR guard, `state.from` from client-side redirects.
  const nextParam = search.get('next');
  const from =
    (location.state as { from?: string } | null)?.from ??
    (nextParam?.startsWith('/') ? nextParam : null) ??
    ROUTES.profile;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(email, password);
      await refresh();
      navigate(from, { replace: true });
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setError(null);
    setGoogleBusy(true);
    try {
      await signInWithGoogle();
      await refresh();
      navigate(from, { replace: true });
    } catch (err) {
      setError(friendlyAuthError(err));
    } finally {
      setGoogleBusy(false);
    }
  }

  return (
    <AuthShell title="Masuk" subtitle="Selamat datang kembali di VELORA.">
      <AuthNotice />
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email" required>
          <Input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Kata sandi" required>
          <Input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        <Button type="submit" className="w-full" loading={busy} disabled={!isFirebaseReady()}>
          Masuk
        </Button>
      </form>

      <div className="my-4 flex items-center gap-3 text-xs text-muted">
        <span className="h-px flex-1 bg-line" /> atau <span className="h-px flex-1 bg-line" />
      </div>
      <Button
        variant="secondary"
        className="w-full"
        onClick={onGoogle}
        loading={googleBusy}
        disabled={!isFirebaseReady()}
      >
        Lanjut dengan Google
      </Button>

      <div className="mt-6 flex justify-between text-sm">
        <Link to={ROUTES.forgotPassword} className="text-muted hover:text-accent">
          Lupa sandi?
        </Link>
        <Link to={ROUTES.register} className="text-accent hover:underline">
          Daftar akun
        </Link>
      </div>
    </AuthShell>
  );
}

export default LoginPage;
