import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { useSearchParams } from 'react-router';
import { Button } from '../ui/button';
import { Input } from '../ui/form';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/surface';

/** Shared admin primitives: one coherent, shadcn-style product surface. */

/* -------------------------------- page ------------------------------------ */

/** @deprecated Prefer `PageHeader` (supports breadcrumbs). Kept for compatibility. */
export function AdminPage({
  title,
  subtitle,
  actions,
  children,
}: { title: string; subtitle?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl tracking-tight">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

/* -------------------------------- stats ----------------------------------- */

export function StatCard({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'accent' | 'muted';
  icon?: ReactNode;
}) {
  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="eyebrow">{label}</div>
          {icon ? (
            <span className="flex h-8 w-8 items-center justify-center rounded-(--radius-card) bg-soft text-muted">
              {icon}
            </span>
          ) : null}
        </div>
        <div
          className={cn(
            'mt-2 text-2xl font-semibold tabular-nums tracking-tight',
            tone === 'accent' ? 'text-accent' : tone === 'muted' ? 'text-muted' : 'text-ink',
          )}
        >
          {value}
        </div>
        {hint ? <div className="mt-1 text-xs text-muted">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

/* -------------------------------- table ----------------------------------- */

export interface Column<T> {
  key: string;
  header: ReactNode;
  render: (row: T) => ReactNode;
  className?: string;
  hideOnMobile?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  loading,
  rowKey,
  onRowClick,
  empty,
  footer,
}: {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-xl border-collapse text-sm">
          <thead>
            <tr className="border-b border-line bg-canvas/60 text-left">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'whitespace-nowrap px-4 py-2.5 text-[0.7rem] font-semibold uppercase tracking-wider text-muted',
                    col.hideOnMobile && 'hidden sm:table-cell',
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 6 }).map((_, index) => (
                <tr key={`skeleton-${index}`} className="border-b border-line last:border-0">
                  {columns.map((col) => (
                    <td key={col.key} className={cn('px-4 py-3', col.hideOnMobile && 'hidden sm:table-cell')}>
                      <div className="h-3.5 animate-pulse rounded bg-soft" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-14 text-center text-muted">
                  {empty ?? 'Tidak ada data.'}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    'border-b border-line last:border-0 transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-soft/40',
                  )}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        'px-4 py-3 align-middle',
                        col.hideOnMobile && 'hidden sm:table-cell',
                        col.className,
                      )}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {footer ? <div className="border-t border-line px-4 py-3">{footer}</div> : null}
    </Card>
  );
}

/* -------------------------------- search ---------------------------------- */

export function SearchBar({
  value,
  onChange,
  onSubmit,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={cn('relative min-w-0 flex-1', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSubmit?.();
        }}
        placeholder={placeholder ?? 'Cari…'}
        className="h-10 pl-9 pr-9"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Bersihkan pencarian"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/** Local search state with an explicit commit step (Enter / button).
 *  `?q=` from the URL seeds it, so palette links like `/admin/produk?q=kaos`
 *  land on a page that is already filtered. */
export function useSearchQuery(initial = '') {
  const [params] = useSearchParams();
  // Read once: the term is local state afterwards, so typing never rewrites the URL.
  const [seed] = useState(() => params.get('q')?.trim() || initial);
  const [term, setTerm] = useState(seed);
  const [committed, setCommitted] = useState(seed);
  return {
    term,
    setTerm,
    committed,
    submit: () => setCommitted(term.trim()),
    reset: () => {
      setTerm('');
      setCommitted('');
    },
  };
}

/* -------------------------------- pager ----------------------------------- */

export function Pager({
  page,
  totalPages,
  hasMore,
  onChange,
}: { page: number; totalPages?: number; hasMore?: boolean; onChange: (p: number) => void }) {
  const last = totalPages ?? page + (hasMore ? 1 : 0);
  const canNext = totalPages ? page < totalPages : Boolean(hasMore);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted">
      <span>
        Halaman {page}
        {last ? ` / ${last}` : ''}
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
          <ChevronLeft /> Sebelumnya
        </Button>
        <Button variant="secondary" size="sm" disabled={!canNext} onClick={() => onChange(page + 1)}>
          Berikutnya <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------- labeled ---------------------------------- */

export function Labeled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="text-sm">
      <div className="eyebrow mb-1">{label}</div>
      <div className="text-ink">{children}</div>
    </div>
  );
}

/* ----------------------------- settings card ------------------------------ */

/** Section wrapper used by editor forms and settings-style pages. */
export function FormSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <CardTitle className="text-sm">{title}</CardTitle>
          {description ? <p className="text-xs text-muted">{description}</p> : null}
        </div>
        {action}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}
