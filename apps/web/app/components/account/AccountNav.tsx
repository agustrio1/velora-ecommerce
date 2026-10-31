import { ROUTES } from '@velora/shared';
import { clsx } from 'clsx';
import { Link, NavLink } from 'react-router';

const TABS = [
  { to: ROUTES.orders, label: 'Pesanan', end: false, key: 'orders' as const },
  { to: ROUTES.profile, label: 'Akun & Alamat', end: true, key: 'profile' as const },
  { to: ROUTES.accountChat, label: 'Bantuan', end: true, key: 'chat' as const },
];

/** Compact tab bar shared by the customer account pages. */
export function AccountNav({ current }: { current: 'orders' | 'profile' | 'chat' }) {
  return (
    <div className="mb-6 flex gap-1 border-b border-line">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={clsx(
            'px-4 py-2 text-sm transition-colors',
            current === t.key ? 'border-b-2 border-ink font-medium text-ink' : 'text-muted hover:text-ink',
          )}
        >
          {t.label}
        </NavLink>
      ))}
      <Link to={ROUTES.home} className="ml-auto hidden px-4 py-2 text-sm text-muted hover:text-ink sm:block">
        ← Toko
      </Link>
    </div>
  );
}
