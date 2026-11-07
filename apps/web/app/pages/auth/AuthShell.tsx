
import { useAuth } from '../../context/AuthContext';
import { config } from '../../lib/config';

/** Maps raw Firebase error codes to friendly Indonesian copy. */
export function friendlyAuthError(err: unknown): string {
  const code =
    typeof err === 'object' &&
    err !== null &&
    'code' in err
      ? String((err as { code: string }).code)
      : '';

  if (
    code.includes('invalid-credential') ||
    code.includes('wrong-password')
  ) {
    return 'Email atau kata sandi salah.';
  }

  if (code.includes('user-not-found')) {
    return 'Akun dengan email itu tidak ditemukan.';
  }

  if (code.includes('email-already-in-use')) {
    return 'Email sudah terdaftar. Silakan masuk.';
  }

  if (code.includes('weak-password')) {
    return 'Kata sandi terlalu lemah (minimal 6 karakter).';
  }

  if (code.includes('invalid-email')) {
    return 'Format email tidak valid.';
  }

  if (code.includes('too-many-requests')) {
    return 'Terlalu banyak percobaan. Tunggu beberapa saat.';
  }

  if (
    code.includes('popup-closed') ||
    code.includes('cancelled')
  ) {
    return 'Login dibatalkan.';
  }

  if (code.includes('network')) {
    return 'Koneksi jaringan bermasalah. Coba lagi.';
  }

  return err instanceof Error
    ? err.message
    : 'Terjadi kesalahan, coba lagi.';
}

/**
 * Show a configuration warning only after runtime authentication
 * initialization has completed.
 */
export function AuthNotice() {
  const { authReady } = useAuth();

  // Avoid showing a false warning while runtime config is loading.
  if (!authReady) {
    return null;
  }

  // Firebase is ready when the Auth initialization succeeds.
  // The warning is based on the loaded runtime configuration.
  const firebaseReady = Boolean(
    config.firebase.apiKey &&
    config.firebase.projectId &&
    config.firebase.appId,
  );

  if (firebaseReady) {
    return null;
  }

  return (
    <div className="mb-6 border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      Firebase Auth belum dikonfigurasi. Periksa Cloudflare Worker Secrets
      untuk mengaktifkan fitur masuk dan daftar. Proyek:{' '}
      <strong>{config.firebase.projectId || '—'}</strong>.
    </div>
  );
}

export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <Link2 />

        <h1 className="mt-4 text-3xl">
          {title}
        </h1>

        {subtitle ? (
          <p className="mt-2 text-sm text-muted">
            {subtitle}
          </p>
        ) : null}
      </div>

      <div className="border border-line bg-surface p-6">
        {children}
      </div>
    </div>
  );
}

function Link2() {
  return (
    <span className="font-display text-2xl tracking-[0.3em]">
      VELORA
    </span>
  );
}
