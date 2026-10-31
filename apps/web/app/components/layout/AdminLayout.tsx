import { cn } from '@/lib/utils';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronDown, ExternalLink, LogOut, Menu, Plus, Settings, User } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { RequireStaff } from '../Protected';
import { AdminCommandPalette, AdminSearchTrigger } from '../admin/command-palette';
import { ADMIN_NAV, type AdminNavGroup, type AdminNavItem, navLabelForPath } from '../admin/nav';
import { Button } from '../ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/overlay';

/** Longest-prefix match so `/admin/produk/:id` keeps "Produk" highlighted. */
function useNavContext() {
  const { pathname } = useLocation();
  return useMemo(() => {
    const active = [...ADMIN_NAV.flatMap((group) => group.items)]
      .filter((item) => (item.end ? pathname === item.to : pathname === item.to || pathname.startsWith(`${item.to}/`)))
      .sort((a, b) => b.to.length - a.to.length)[0];
    return {
      activeTo: active?.to ?? '/admin',
      title: navLabelForPath(pathname),
      quickCreate: active?.create,
    };
  }, [pathname]);
}

/** Nav groups for this viewer: super-admin-only entries are stripped for admins. */
function useNavGroups(isSuperAdmin: boolean): AdminNavGroup[] {
  return useMemo(
    () =>
      ADMIN_NAV.map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.superAdminOnly || isSuperAdmin),
      })).filter((group) => group.items.length > 0),
    [isSuperAdmin],
  );
}

function NavLinks({ items, onNavigate }: { items: AdminNavItem[]; onNavigate?: () => void }) {
  const { activeTo } = useNavContext();
  return (
    <ul className="space-y-0.5">
      {items.map((item) => {
        const isActive = item.to === activeTo;
        return (
          <li key={item.to}>
            <Link
              to={item.to}
              onClick={onNavigate}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'group flex items-center gap-2.5 rounded-(--radius-card) px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-soft font-medium text-ink shadow-[inset_2px_0_0_0_var(--color-accent)]'
                  : 'text-muted hover:bg-soft/60 hover:text-ink',
              )}
            >
              <item.icon
                className={cn('h-4 w-4 shrink-0', isActive ? 'text-accent' : 'text-muted group-hover:text-ink')}
              />
              <span className="truncate">{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Sidebar body shared by the desktop rail and the mobile drawer. */
function SidebarBody({ groups, onNavigate }: { groups: AdminNavGroup[]; onNavigate?: () => void }) {
  const { user, signOut } = useAuth();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-4">
        <Link to="/admin" onClick={onNavigate} className="font-display text-base tracking-[0.22em] text-ink">
          VELORA
        </Link>
        <span className="rounded-pill border border-line px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted">
          Admin
        </span>
      </div>

      <nav className="no-scrollbar flex-1 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.title} className="mb-5 last:mb-0">
            <div className="mb-1.5 px-2 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-muted/80">
              {group.title}
            </div>
            <NavLinks items={group.items} onNavigate={onNavigate} />
          </div>
        ))}
      </nav>

      <div className="shrink-0 space-y-2 border-t border-line px-3 py-3">
        <Link
          to="/"
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-(--radius-card) px-3 py-2 text-sm text-muted transition-colors hover:bg-soft/60 hover:text-ink"
        >
          <ExternalLink className="h-4 w-4" /> Lihat toko
        </Link>
        <div className="flex items-center gap-2.5 rounded-(--radius-card) bg-canvas px-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-ink">
            {(user?.email?.[0] ?? 'A').toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium text-ink">{user?.email ?? 'Admin'}</div>
            <div className="text-[0.65rem] uppercase tracking-wider text-muted">Staf</div>
          </div>
          <button
            type="button"
            onClick={() => void signOut()}
            aria-label="Keluar"
            title="Keluar"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-(--radius-card) text-muted transition-colors hover:bg-soft hover:text-ink"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** User menu in the topbar. */
function UserMenu() {
  const { user, signOut } = useAuth();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 px-2 text-muted hover:text-ink">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-ink">
            {(user?.email?.[0] ?? 'A').toUpperCase()}
          </span>
          <span className="hidden max-w-40 truncate text-xs text-ink sm:inline">{user?.email}</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Akun</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link to="/">
            <User /> Halaman toko
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/admin/pengaturan">
            <Settings /> Pengaturan
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()} className="text-red-800 [&_svg]:text-red-700">
          <LogOut /> Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AdminLayout() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const { title, quickCreate } = useNavContext();
  const { isSuperAdmin, isStaff, authReady } = useAuth();
  const groups = useNavGroups(isSuperAdmin);
  // Roles resolve after mount; keeping the palette out of the SSR markup also
  // keeps the header identical on the first client paint.
  const canSearch = authReady && isStaff;

  return (
    <div className="min-h-screen bg-canvas">
      {/* Desktop rail */}
      <aside className="hidden border-r border-line bg-surface lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:block lg:w-68">
        <SidebarBody groups={groups} />
      </aside>

      {/* Mobile drawer (Radix dialog handles focus trap + scroll lock) */}
      <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            className="fixed inset-y-0 left-0 z-50 w-68 max-w-[85vw] border-r border-line bg-surface shadow-(--shadow-pop) lg:hidden"
          >
            <DialogPrimitive.Title className="sr-only">Menu admin</DialogPrimitive.Title>
            <SidebarBody groups={groups} onNavigate={() => setDrawerOpen(false)} />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {canSearch ? <AdminCommandPalette open={searchOpen} onOpenChange={setSearchOpen} /> : null}

      <div className="lg:pl-68">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-surface px-4 sm:px-6">
          <Button
            variant="secondary"
            size="icon"
            aria-label="Buka menu"
            onClick={() => setDrawerOpen(true)}
            className="lg:hidden"
          >
            <Menu />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-ink">{title}</div>
          </div>
          {canSearch ? <AdminSearchTrigger onOpen={() => setSearchOpen(true)} /> : null}
          {quickCreate ? (
            <Button asChild size="sm" variant="secondary" className="hidden sm:inline-flex">
              <Link to={quickCreate.to}>
                <Plus /> {quickCreate.label}
              </Link>
            </Button>
          ) : null}
          <UserMenu />
        </header>

        <main className="min-w-0">
          <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <RequireStaff>
              <Outlet />
            </RequireStaff>
          </div>
        </main>
      </div>
    </div>
  );
}

export default AdminLayout;
