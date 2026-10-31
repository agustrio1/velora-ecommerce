import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  FolderTree,
  Images,
  LayoutDashboard,
  MessageSquare,
  Package,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Star,
  Tags,
  Users,
  Warehouse,
} from 'lucide-react';

export interface AdminNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
  /** Extra action shown in the topbar for this section. */
  create?: { to: string; label: string };
  /** Hidden from plain admins; the page refuses them too. */
  superAdminOnly?: boolean;
}

export interface AdminNavGroup {
  title: string;
  items: AdminNavItem[];
}

/** Single source of truth for the admin sidebar. */
export const ADMIN_NAV: AdminNavGroup[] = [
  {
    title: 'Ringkasan',
    items: [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true }],
  },
  {
    title: 'Katalog',
    items: [
      {
        to: '/admin/produk',
        label: 'Produk',
        icon: Package,
        create: { to: '/admin/produk/baru', label: 'Buat produk' },
      },
      { to: '/admin/inventaris', label: 'Inventaris', icon: Warehouse },
      { to: '/admin/kategori', label: 'Kategori', icon: FolderTree },
      { to: '/admin/ulasan', label: 'Ulasan', icon: Star },
    ],
  },
  {
    title: 'Perdagangan',
    items: [
      { to: '/admin/pesanan', label: 'Pesanan', icon: ShoppingCart },
      { to: '/admin/pelanggan', label: 'Pelanggan', icon: Users },
      {
        to: '/admin/promo',
        label: 'Promo',
        icon: Tags,
        create: { to: '/admin/promo/baru', label: 'Buat kupon' },
      },
    ],
  },
  {
    title: 'Konten & Komunikasi',
    items: [
      { to: '/admin/konten', label: 'Konten', icon: Images },
      { to: '/admin/chat', label: 'Chat', icon: MessageSquare },
    ],
  },
  {
    title: 'Sistem',
    items: [
      { to: '/admin/laporan', label: 'Laporan', icon: BarChart3 },
      { to: '/admin/pengguna', label: 'Pengguna', icon: ShieldCheck, superAdminOnly: true },
      { to: '/admin/pengaturan', label: 'Pengaturan', icon: Settings },
    ],
  },
];

/** Flat lookup used for active-state and title resolution. */
export const ADMIN_NAV_FLAT = ADMIN_NAV.flatMap((group) =>
  group.items.map((item) => ({ ...item, group: group.title })),
);

/** Human label for the current pathname (falls back to the nearest parent). */
export function navLabelForPath(pathname: string): string {
  const exact = ADMIN_NAV_FLAT.find((item) => item.to === pathname);
  if (exact) return exact.label;
  const parent = [...ADMIN_NAV_FLAT]
    .filter((item) => item.to !== '/admin' && pathname.startsWith(`${item.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0];
  return parent?.label ?? 'Admin';
}
