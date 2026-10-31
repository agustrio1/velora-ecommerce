import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Banner, Faq, StaticPage } from '@velora/shared';
import { FileText, HelpCircle, ImagePlus, Images, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Media } from '../../components/Media';
import { type Column, DataTable, SearchBar, StatCard } from '../../components/admin/kit';
import { mediaSrc } from '../../components/admin/media-fields';
import { PageHeader } from '../../components/admin/page-header';
import { Button } from '../../components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '../../components/ui/overlay';
import { Badge } from '../../components/ui/surface';
import { useToast } from '../../context/ToastContext';
import { ApiError, api } from '../../lib/api';

type Tab = 'banners' | 'pages' | 'faqs';

const TABS: { id: Tab; label: string; description: string; createLabel: string; createTo: string; icon: LucideIcon }[] =
  [
    {
      id: 'banners',
      label: 'Banner',
      description: 'Visual promosi di beranda dan kepala kategori.',
      createLabel: 'Banner baru',
      createTo: '/admin/konten/banner/baru',
      icon: Images,
    },
    {
      id: 'pages',
      label: 'Halaman',
      description: 'Artikel editorial, kebijakan, dan informasi toko.',
      createLabel: 'Halaman baru',
      createTo: '/admin/konten/halaman/baru',
      icon: FileText,
    },
    {
      id: 'faqs',
      label: 'FAQ',
      description: 'Pertanyaan umum pelanggan.',
      createLabel: 'FAQ baru',
      createTo: '/admin/konten/faq/baru',
      icon: HelpCircle,
    },
  ];

/** Content workspace: banners, editorial pages and FAQs (pages, not modals). */
export function AdminContent() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.some((item) => item.id === params.get('tab')) ? params.get('tab') : 'banners') as Tab;
  const active = TABS.find((item) => item.id === tab) ?? TABS[0];

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Konten' }]}
        title="Konten"
        description={active.description}
        actions={
          <Button asChild>
            <Link to={active.createTo}>
              <Plus /> {active.createLabel}
            </Link>
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={(next) => setParams({ tab: next }, { replace: true })}>
        <TabsList>
          {TABS.map((item) => (
            <TabsTrigger key={item.id} value={item.id}>
              <item.icon className="mr-1.5 inline h-3.5 w-3.5" /> {item.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="banners">
          <BannersTab />
        </TabsContent>
        <TabsContent value="pages">
          <PagesTab />
        </TabsContent>
        <TabsContent value="faqs">
          <FaqsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* -------------------------------- banners --------------------------------- */

function BannersTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [removing, setRemoving] = useState<Banner | null>(null);

  const list = useQuery<{ items: Banner[] }>({
    queryKey: ['admin', 'banners'],
    queryFn: () => api.get<{ items: Banner[] }>('/admin/banners', undefined, { anonymous: true }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/admin/banners/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'banners'] });
      toast.push('Banner dihapus', 'success');
      setRemoving(null);
    },
    onError: (error) => toast.push(error instanceof ApiError ? error.message : 'Gagal menghapus', 'error'),
  });

  const rows = (list.data?.items ?? []).filter((banner) => {
    const needle = term.trim().toLowerCase();
    return !needle || `${banner.title} ${banner.placement}`.toLowerCase().includes(needle);
  });

  const columns: Column<Banner>[] = [
    {
      key: 'title',
      header: 'Banner',
      render: (banner) => (
        <div className="flex items-center gap-3">
          <div className="w-16 shrink-0">
            <Media url={banner.imageUrl ?? mediaSrc(banner.imageKey)} label={banner.title} aspect="wide" />
          </div>
          <div className="min-w-0">
            <Link to={`/admin/konten/banner/${banner.id}`} className="block truncate font-medium hover:text-accent">
              {banner.title}
            </Link>
            <div className="truncate text-xs text-muted">
              {banner.ctaLabel ?? '—'} → {banner.targetUrl ?? '—'}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'placement',
      header: 'Penempatan',
      hideOnMobile: true,
      render: (banner) => <span className="capitalize">{banner.placement.replace(/_/g, ' ')}</span>,
    },
    { key: 'sort', header: 'Urutan', hideOnMobile: true, render: (banner) => banner.sortOrder },
    {
      key: 'status',
      header: 'Status',
      render: (banner) => (
        <Badge variant={banner.isActive ? 'success' : 'outline'}>{banner.isActive ? 'Aktif' : 'Nonaktif'}</Badge>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (banner) => (
        <RowActions
          onEdit={() => navigate(`/admin/konten/banner/${banner.id}`)}
          onDelete={() => setRemoving(banner)}
          label={banner.title}
        />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total banner" value={rows.length} icon={<ImagePlus className="h-4 w-4" />} />
        <StatCard label="Tayang" value={rows.filter((banner) => banner.isActive).length} tone="accent" />
        <StatCard label="Hero" value={rows.filter((banner) => banner.placement.startsWith('hero')).length} />
      </div>
      <SearchBar value={term} onChange={setTerm} placeholder="Cari judul banner…" className="sm:max-w-sm" />
      <DataTable
        columns={columns}
        rows={rows}
        loading={list.isLoading && !list.data}
        rowKey={(banner) => banner.id}
        empty="Belum ada banner."
      />
      <RemoveDialog
        open={Boolean(removing)}
        title="Hapus banner?"
        description={`“${removing?.title ?? ''}” akan dihapus dari beranda.`}
        loading={remove.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
    </div>
  );
}

/* --------------------------------- pages ---------------------------------- */

function PagesTab() {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');

  const list = useQuery<{ items: StaticPage[] }>({
    queryKey: ['admin', 'pages'],
    queryFn: () => api.get<{ items: StaticPage[] }>('/admin/pages', undefined, { anonymous: true }),
  });

  const rows = (list.data?.items ?? []).filter((page) => {
    const needle = term.trim().toLowerCase();
    return !needle || `${page.title} ${page.slug}`.toLowerCase().includes(needle);
  });

  const columns: Column<StaticPage>[] = [
    {
      key: 'title',
      header: 'Judul',
      render: (page) => (
        <Link to={`/admin/konten/halaman/${page.id}`} className="font-medium hover:text-accent">
          {page.title}
        </Link>
      ),
    },
    { key: 'slug', header: 'Slug', render: (page) => <span className="text-muted">/halaman/{page.slug}</span> },
    {
      key: 'updated',
      header: 'Diubah',
      hideOnMobile: true,
      render: (page) => <span className="text-xs text-muted">{page.updatedAt.slice(0, 10)}</span>,
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (page) => <RowActions onEdit={() => navigate(`/admin/konten/halaman/${page.id}`)} label={page.title} />,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total halaman" value={rows.length} icon={<FileText className="h-4 w-4" />} />
        <StatCard
          label="Seo lengkap"
          value={rows.filter((page) => page.metaTitle && page.metaDescription).length}
          tone="accent"
        />
        <StatCard
          label="Diubah 30 hari"
          value={rows.filter((page) => Date.now() - new Date(page.updatedAt).getTime() < 30 * 86_400_000).length}
        />
      </div>
      <SearchBar value={term} onChange={setTerm} placeholder="Cari judul atau slug…" className="sm:max-w-sm" />
      <DataTable
        columns={columns}
        rows={rows}
        loading={list.isLoading && !list.data}
        rowKey={(page) => page.id}
        empty="Belum ada halaman."
      />
    </div>
  );
}

/* ---------------------------------- faqs ---------------------------------- */

function FaqsTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [removing, setRemoving] = useState<Faq | null>(null);

  const list = useQuery<{ items: Faq[] }>({
    queryKey: ['admin', 'faqs'],
    queryFn: () => api.get<{ items: Faq[] }>('/admin/faqs', undefined, { anonymous: true }),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/admin/faqs/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'faqs'] });
      toast.push('FAQ dihapus', 'success');
      setRemoving(null);
    },
    onError: (error) => toast.push(error instanceof ApiError ? error.message : 'Gagal menghapus', 'error'),
  });

  const rows = (list.data?.items ?? []).filter((faq) => {
    const needle = term.trim().toLowerCase();
    return !needle || `${faq.question} ${faq.category ?? ''}`.toLowerCase().includes(needle);
  });

  const columns: Column<Faq>[] = [
    {
      key: 'q',
      header: 'Pertanyaan',
      render: (faq) => (
        <div className="max-w-lg">
          <Link to={`/admin/konten/faq/${faq.id}`} className="font-medium hover:text-accent">
            {faq.question}
          </Link>
          <div className="line-clamp-1 text-xs text-muted">{faq.answer}</div>
        </div>
      ),
    },
    {
      key: 'cat',
      header: 'Kategori',
      hideOnMobile: true,
      render: (faq) => <span className="text-muted">{faq.category ?? '—'}</span>,
    },
    { key: 'sort', header: 'Urutan', hideOnMobile: true, render: (faq) => faq.sortOrder },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (faq) => (
        <RowActions
          onEdit={() => navigate(`/admin/konten/faq/${faq.id}`)}
          onDelete={() => setRemoving(faq)}
          label={faq.question}
        />
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total FAQ" value={rows.length} icon={<HelpCircle className="h-4 w-4" />} />
        <StatCard
          label="Kategori"
          value={new Set(rows.map((faq) => faq.category).filter(Boolean)).size}
          tone="accent"
        />
        <StatCard label="Teratas (urutan 0–2)" value={rows.filter((faq) => faq.sortOrder <= 2).length} />
      </div>
      <SearchBar value={term} onChange={setTerm} placeholder="Cari pertanyaan…" className="sm:max-w-sm" />
      <DataTable
        columns={columns}
        rows={rows}
        loading={list.isLoading && !list.data}
        rowKey={(faq) => faq.id}
        empty="Belum ada FAQ."
      />
      <RemoveDialog
        open={Boolean(removing)}
        title="Hapus FAQ?"
        description={`“${removing?.question ?? ''}” akan dihapus.`}
        loading={remove.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
    </div>
  );
}

/* -------------------------------- shared ---------------------------------- */

function RowActions({ onEdit, onDelete, label }: { onEdit: () => void; onDelete?: () => void; label: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Aksi ${label}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={onEdit}>
          <Pencil /> Ubah
        </DropdownMenuItem>
        {onDelete ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onDelete} className="text-red-800 [&_svg]:text-red-700">
              <Trash2 /> Hapus
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RemoveDialog({
  open,
  title,
  description,
  loading,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            Batal
          </Button>
          <Button variant="destructive" loading={loading} onClick={onConfirm}>
            <Trash2 /> Hapus
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AdminContent;
