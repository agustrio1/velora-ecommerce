import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  FolderTree,
  HelpCircle,
  Images,
  type LucideIcon,
  Package,
  Plus,
  Search,
  ShoppingCart,
  Tags,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../lib/api';
import type { AdminSearchGroup, AdminSearchResult } from '../../lib/api-types';
import { rupiah } from '../../lib/format';
import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandLoading,
  CommandShortcut,
} from '../ui/command';
import { ADMIN_NAV } from './nav';

/** Entity groups, each living under the admin menu of the same name. */
const COLLECTIONS: {
  key: keyof Omit<AdminSearchResult, 'q'>;
  label: string;
  icon: LucideIcon;
  href: (id: string) => string;
  /** List page that understands `?q=` — only those get a "lihat semua" row. */
  seeAll?: string;
}[] = [
  { key: 'products', label: 'Produk', icon: Package, href: (id) => `/admin/produk/${id}`, seeAll: '/admin/produk' },
  {
    key: 'orders',
    label: 'Pesanan',
    icon: ShoppingCart,
    href: (id) => `/admin/pesanan/${id}`,
    seeAll: '/admin/pesanan',
  },
  {
    key: 'customers',
    label: 'Pelanggan',
    icon: Users,
    href: (id) => `/admin/pelanggan/${id}`,
    seeAll: '/admin/pelanggan',
  },
  { key: 'categories', label: 'Kategori', icon: FolderTree, href: (id) => `/admin/kategori/${id}` },
  { key: 'coupons', label: 'Promo', icon: Tags, href: (id) => `/admin/promo/${id}` },
  { key: 'pages', label: 'Halaman', icon: Images, href: (id) => `/admin/konten/halaman/${id}` },
  { key: 'faqs', label: 'FAQ', icon: HelpCircle, href: (id) => `/admin/konten/faq/${id}` },
];

const ACTIONS = [
  { label: 'Buat produk', to: '/admin/produk/baru' },
  { label: 'Kategori baru', to: '/admin/kategori/baru' },
  { label: 'Buat kupon', to: '/admin/promo/baru' },
  { label: 'Halaman baru', to: '/admin/konten/halaman/baru' },
];

/** Shortest term the API answers; below it the palette stays a menu jumper. */
const MIN_TERM = 2;

const matches = (haystack: string, needle: string): boolean => haystack.toLowerCase().includes(needle);

/**
 * Global search for the admin shell — menus on the left of the colon, their
 * contents on the right. Everything the server returns is already filtered, so
 * the palette runs with `shouldFilter={false}` and only narrows the static
 * groups (menus, quick actions) locally.
 */
export function AdminCommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { isSuperAdmin } = useAuth();
  const [term, setTerm] = useState('');
  const q = term.trim();
  const searching = q.length >= MIN_TERM;

  // ⌘K / Ctrl+K works anywhere in the admin area, including inside inputs.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const search = useQuery<AdminSearchResult>({
    queryKey: ['admin', 'search', q],
    queryFn: () => api.get<AdminSearchResult>('/admin/search', { q }, { anonymous: true }),
    enabled: open && searching,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const close = () => {
    onOpenChange(false);
    setTerm('');
  };

  const go = (to: string) => {
    close();
    navigate(to);
  };

  const menus = ADMIN_NAV.flatMap((group) => group.items.map((item) => ({ ...item, group: group.title })))
    .filter((item) => !item.superAdminOnly || isSuperAdmin)
    .filter((item) => !searching || matches(`${item.label} ${item.group} ${item.to}`, q));

  const actions = searching ? ACTIONS.filter((action) => matches(action.label, q)) : ACTIONS;

  const data = searching ? search.data : undefined;
  const visible = COLLECTIONS.map((collection) => ({
    collection,
    group: data?.[collection.key] as AdminSearchGroup | undefined,
  })).filter((entry) => entry.group && entry.group.items.length > 0);

  const isEmpty = searching && !search.isLoading && !menus.length && !actions.length && !visible.length;

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      filter={false}
      title="Pencarian"
    >
      <CommandInput value={term} onValueChange={setTerm} placeholder="Cari menu, produk, pesanan, pelanggan…" />
      <CommandList>
        {menus.length ? (
          <CommandGroup heading="Menu">
            {menus.map((item) => (
              <CommandItem key={item.to} value={`menu:${item.to}`} onSelect={() => go(item.to)}>
                <item.icon />
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                <span className="shrink-0 text-xs text-muted">{item.group}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {actions.length ? (
          <CommandGroup heading="Aksi cepat">
            {actions.map((action) => (
              <CommandItem key={action.to} value={`action:${action.to}`} onSelect={() => go(action.to)}>
                <Plus />
                <span className="min-w-0 flex-1 truncate">{action.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}

        {searching && search.isFetching && !data ? <CommandLoading /> : null}

        {visible.map(({ collection, group }) => (
          <CommandGroup key={collection.key} heading={collection.label}>
            {group?.items.map((hit) => (
              <CommandItem
                key={hit.id}
                value={`${collection.key}:${hit.id}`}
                onSelect={() => go(collection.href(hit.id))}
              >
                <collection.icon />
                <span className="min-w-0 flex-1 truncate">{hit.title}</span>
                {hit.amount !== undefined ? (
                  <span className="shrink-0 text-xs tabular-nums text-muted">{rupiah(hit.amount)}</span>
                ) : hit.hint ? (
                  <span className="hidden max-w-40 shrink-0 truncate text-xs text-muted sm:inline">{hit.hint}</span>
                ) : null}
              </CommandItem>
            ))}
            {collection.seeAll && group && group.total > group.items.length ? (
              <CommandItem
                value={`see-all:${collection.key}`}
                onSelect={() => go(`${collection.seeAll}?q=${encodeURIComponent(q)}`)}
                className="text-accent [&_svg]:text-accent"
              >
                <ArrowRight />
                <span className="min-w-0 flex-1 truncate">
                  Lihat semua {group.total} {collection.label.toLowerCase()}
                </span>
              </CommandItem>
            ) : null}
          </CommandGroup>
        ))}

        {isEmpty ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-ink">Tidak ada hasil untuk “{q}”.</p>
            <p className="mt-1 text-xs text-muted">Coba nama produk, kode pesanan, atau email pelanggan.</p>
          </div>
        ) : null}

        {!searching ? (
          <p className="px-2.5 py-3 text-xs text-muted">
            Ketik minimal {MIN_TERM} huruf untuk mencari isi menu — produk, pesanan, pelanggan, kategori, promo,
            halaman.
          </p>
        ) : null}
      </CommandList>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line px-4 py-2.5 text-[0.68rem] text-muted">
        <span className="flex items-center gap-1">
          <CommandShortcut className="ml-0">↑</CommandShortcut>
          <CommandShortcut className="ml-0">↓</CommandShortcut>
          navigasi
        </span>
        <span className="flex items-center gap-1">
          <CommandShortcut className="ml-0">↵</CommandShortcut>
          buka
        </span>
        <span className="flex items-center gap-1">
          <CommandShortcut className="ml-0">esc</CommandShortcut>
          tutup
        </span>
      </div>
    </CommandDialog>
  );
}

/** Topbar entry point; mirrors the keyboard shortcut so it is discoverable. */
export function AdminSearchTrigger({ onOpen }: { onOpen: () => void }) {
  // Rendered as "Ctrl" first so SSR and the first client paint agree; Macs swap after mount.
  const [modifier, setModifier] = useState('Ctrl');
  useEffect(() => {
    if (/Mac|iPhone|iPad|iPod/.test(navigator.userAgent)) setModifier('⌘');
  }, []);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Cari di admin"
      aria-keyshortcuts="Control+K Meta+K"
      className="flex h-9 w-9 shrink-0 items-center justify-center gap-2 rounded-(--radius-card) border border-line bg-canvas text-muted transition-colors hover:bg-soft hover:text-ink sm:w-56 sm:justify-start sm:px-3"
    >
      <Search className="h-4 w-4 shrink-0" />
      <span className="hidden flex-1 truncate text-left text-xs sm:inline">Cari…</span>
      <kbd className="hidden shrink-0 rounded border border-line bg-surface px-1.5 py-0.5 font-sans text-[0.65rem] font-medium md:inline">
        {modifier} K
      </kbd>
    </button>
  );
}

export default AdminCommandPalette;
