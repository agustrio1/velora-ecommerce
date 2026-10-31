import { ROUTES } from '@velora/shared';
import { Heart, LayoutDashboard, LogOut, Menu, Package, Search, ShoppingBag, User, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, NavLink, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { useCart } from '../../hooks/useCart';
import { useCategories } from '../../hooks/useStore';

export function Header() {
  const { user, isStaff, signOut, authReady } = useAuth();
  const { itemCount } = useCart();
  const { data: categories } = useCategories();
  const navigate = useNavigate();
  const location = useLocation();
  const [term, setTerm] = useState('');
  const [drawer, setDrawer] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Any route change — link click as well as browser back/forward — dismisses the overlays.
  useEffect(() => {
    setDrawer(false);
    setMenuOpen(false);
  }, [location.pathname, location.search]);

  // The dropdown cannot use a `fixed` click-away layer: `backdrop-blur` on the header
  // is its containing block, so the layer would cover the 56px bar only. Watch instead.
  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

  // The drawer is a full-screen overlay: freeze the page behind it and let Esc close it.
  useEffect(() => {
    if (!drawer) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawer(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [drawer]);

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = term.trim();
    navigate(q ? `${ROUTES.catalog}?q=${encodeURIComponent(q)}` : ROUTES.catalog);
    setMenuOpen(false);
  }

  const navLink = ({ isActive }: { isActive: boolean }) =>
    'text-sm transition-colors ' + (isActive ? 'text-accent' : 'text-ink hover:text-accent');

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-canvas/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:h-16 sm:gap-4 sm:px-6 lg:px-6">
        <button
          className="-ml-1 rounded-full p-2 hover:bg-soft lg:hidden"
          onClick={() => setDrawer(true)}
          aria-label="Buka menu"
          aria-expanded={drawer}
        >
          <Menu className="h-5 w-5" />
        </button>

        <Link to={ROUTES.home} className="font-display text-lg tracking-[0.2em] sm:text-xl">
          VELORA
        </Link>

        <nav className="ml-4 hidden items-center gap-6 lg:flex">
          <NavLink to={ROUTES.catalog} className={navLink}>
            Semua Produk
          </NavLink>
          {(categories ?? []).slice(0, 5).map((c) => (
            <NavLink key={c.id} to={ROUTES.category(c.slug)} className={navLink}>
              {c.name}
            </NavLink>
          ))}
        </nav>

        <form onSubmit={submitSearch} className="ml-auto hidden max-w-xs flex-1 items-center md:flex">
          <div className="relative w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Cari busana…"
              className="h-10 w-full rounded-pill border border-line bg-surface pl-9 pr-3 text-sm focus:border-accent focus:outline-none"
            />
          </div>
        </form>

        <div className="ml-auto flex items-center gap-0.5 sm:gap-1 md:ml-2">
          <Link to={ROUTES.wishlist} className="rounded-full p-2 hover:bg-soft" aria-label="Wishlist">
            <Heart className="h-5 w-5" />
          </Link>
          <Link to={ROUTES.cart} className="relative rounded-full p-2 hover:bg-soft" aria-label="Keranjang">
            <ShoppingBag className="h-5 w-5" />
            {itemCount > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
                {itemCount}
              </span>
            ) : null}
          </Link>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-full p-2 hover:bg-soft"
              aria-label="Akun"
              aria-expanded={menuOpen}
            >
              <User className="h-5 w-5" />
            </button>
            {menuOpen ? (
              <div className="absolute right-0 z-50 mt-2 w-52 max-w-[calc(100vw-1.5rem)] border border-line bg-surface p-1 shadow-pop">
                {authReady && !user ? (
                  <>
                    <MenuLink to={ROUTES.login} onClick={() => setMenuOpen(false)}>
                      Masuk
                    </MenuLink>
                    <MenuLink to={ROUTES.register} onClick={() => setMenuOpen(false)}>
                      Daftar akun
                    </MenuLink>
                  </>
                ) : (
                  <>
                    <MenuLink to={ROUTES.profile} onClick={() => setMenuOpen(false)}>
                      Akun saya
                    </MenuLink>
                    <MenuLink to={ROUTES.orders} onClick={() => setMenuOpen(false)}>
                      Pesanan saya
                    </MenuLink>
                    <MenuLink to={ROUTES.wishlist} onClick={() => setMenuOpen(false)}>
                      Wishlist
                    </MenuLink>
                    {isStaff ? (
                      <MenuLink to={ROUTES.admin} onClick={() => setMenuOpen(false)}>
                        <LayoutDashboard className="mr-2 inline h-4 w-4" /> Panel admin
                      </MenuLink>
                    ) : null}
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        void signOut();
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-muted hover:bg-soft"
                    >
                      <LogOut className="h-4 w-4" /> Keluar
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* Mobile drawer — portalled to <body> because `backdrop-blur` on the header
          would otherwise become the containing block for `fixed` children. */}
      {drawer
        ? createPortal(
            <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu navigasi">
              <div className="absolute inset-0 bg-ink/40" onClick={() => setDrawer(false)} />
              <div className="absolute inset-y-0 left-0 flex w-[86vw] max-w-sm flex-col overflow-y-auto bg-canvas pb-[max(1rem,env(safe-area-inset-bottom))]">
                <div className="sticky top-0 flex items-center justify-between border-b border-line bg-canvas px-4 py-4">
                  <span className="font-display text-lg tracking-[0.2em]">VELORA</span>
                  <button
                    onClick={() => setDrawer(false)}
                    aria-label="Tutup menu"
                    className="-mr-2 rounded-full p-2 hover:bg-soft"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <form onSubmit={submitSearch} className="px-4 pt-4 pb-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                    <input
                      value={term}
                      onChange={(e) => setTerm(e.target.value)}
                      placeholder="Cari busana…"
                      className="h-11 w-full rounded-(--radius-card) border border-line bg-surface pl-9 pr-3 text-sm focus:border-accent focus:outline-none"
                    />
                  </div>
                </form>

                <nav className="flex-1 px-2 pt-2">
                  <DrawerLink
                    to={ROUTES.catalog}
                    onNavigate={() => setDrawer(false)}
                    icon={<Package className="h-4 w-4" />}
                  >
                    Semua Produk
                  </DrawerLink>
                  <div className="eyebrow mt-5 mb-2 px-2">Kategori</div>
                  {(categories ?? []).map((c) => (
                    <DrawerLink key={c.id} to={ROUTES.category(c.slug)} onNavigate={() => setDrawer(false)}>
                      {c.name}
                    </DrawerLink>
                  ))}
                </nav>

                <div className="mt-4 border-t border-line px-4 pt-4 text-sm text-muted">
                  {authReady && !user ? (
                    <div className="flex flex-col gap-2">
                      <Link to={ROUTES.login} onClick={() => setDrawer(false)} className="text-accent hover:underline">
                        Masuk
                      </Link>
                      <Link
                        to={ROUTES.register}
                        onClick={() => setDrawer(false)}
                        className="text-accent hover:underline"
                      >
                        Daftar akun
                      </Link>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      <Link to={ROUTES.profile} onClick={() => setDrawer(false)} className="hover:text-ink">
                        Akun saya
                      </Link>
                      <Link to={ROUTES.orders} onClick={() => setDrawer(false)} className="hover:text-ink">
                        Pesanan saya
                      </Link>
                      {isStaff ? (
                        <Link to={ROUTES.admin} onClick={() => setDrawer(false)} className="hover:text-ink">
                          Panel admin
                        </Link>
                      ) : null}
                      <button
                        onClick={() => {
                          setDrawer(false);
                          void signOut();
                        }}
                        className="flex items-center gap-2 text-left text-muted hover:text-ink"
                      >
                        <LogOut className="h-4 w-4" /> Keluar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </header>
  );
}

function MenuLink({ to, onClick, children }: { to: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Link to={to} onClick={onClick} className="block rounded-(--radius-card) px-3 py-2 text-sm hover:bg-soft">
      {children}
    </Link>
  );
}

function DrawerLink({
  to,
  icon,
  onNavigate,
  children,
}: { to: string; icon?: React.ReactNode; onNavigate: () => void; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      onClick={onNavigate}
      className="flex items-center gap-2 rounded-(--radius-card) px-2 py-2.5 text-sm hover:bg-soft"
    >
      {icon}
      {children}
    </NavLink>
  );
}
