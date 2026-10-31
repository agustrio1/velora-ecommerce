import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type AdminCustomerRow, ROLE_CODE, type RoleCode } from '@velora/shared';
import { ShieldOff } from 'lucide-react';
import { useState } from 'react';
import { type Column, DataTable, Pager, SearchBar, useSearchQuery } from '../../components/admin/kit';
import { PageHeader } from '../../components/admin/page-header';
import { Button } from '../../components/ui/button';
import { Badge, Card, CardContent } from '../../components/ui/surface';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ApiError, api } from '../../lib/api';
import type { Paginated } from '../../lib/api-types';
import { dateOnly } from '../../lib/format';
import { cn } from '../../lib/utils';

const ROLE_LABEL: Record<RoleCode, string> = {
  customer: 'Pelanggan',
  admin: 'Admin',
  super_admin: 'Super admin',
};

/** The two roles a super admin may hand out; `customer` is granted automatically. */
const ASSIGNABLE: RoleCode[] = [ROLE_CODE.ADMIN, ROLE_CODE.SUPER_ADMIN];

/**
 * `/admin/pengguna` — account and role management, super admin only.
 *
 * The rule "you cannot edit your own roles" is enforced twice: the toggles below
 * are disabled for the signed-in row, and every mutation is re-checked by
 * `requireSuperAdmin` + the self-guard in `routes/admin.ts`.
 */
export function AdminUsers() {
  const { user, isSuperAdmin } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const search = useSearchQuery();
  const [page, setPage] = useState(1);

  // Same collection as the customers screen: it already carries `roles` for every account.
  const list = useQuery<Paginated<AdminCustomerRow>>({
    queryKey: ['admin', 'users', search.committed, page],
    queryFn: () =>
      api.get<Paginated<AdminCustomerRow>>(
        '/admin/customers',
        { q: search.committed || undefined, page, pageSize: 20 },
        { anonymous: true },
      ),
    enabled: isSuperAdmin,
  });

  const change = useMutation({
    mutationFn: (input: { id: string; role: RoleCode; grant: boolean }) =>
      input.grant
        ? api.post(`/admin/customers/${input.id}/roles`, { role: input.role })
        : api.del(`/admin/customers/${input.id}/roles/${input.role}`),
    onSuccess: (_ok, input) => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      qc.invalidateQueries({ queryKey: ['admin', 'customers'] });
      qc.invalidateQueries({ queryKey: ['admin', 'customer', input.id] });
      toast.push(`${ROLE_LABEL[input.role]} ${input.grant ? 'diberikan' : 'dicabut'}`, 'success');
    },
    onError: (err) => toast.push(err instanceof ApiError ? err.message : 'Gagal mengubah peran', 'error'),
  });

  if (!isSuperAdmin) {
    return (
      <div className="space-y-4">
        <PageHeader breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Pengguna' }]} title="Pengguna" />
        <Card>
          <CardContent className="flex items-start gap-3 p-5 text-sm">
            <ShieldOff className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
            <div>
              <p className="font-medium text-ink">Khusus super admin</p>
              <p className="mt-1 text-muted">
                Halaman ini mengatur peran akun staf. Hubungi super admin bila Anda membutuhkan perubahan peran.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const rows = list.data?.items ?? [];

  const columns: Column<AdminCustomerRow>[] = [
    {
      key: 'who',
      header: 'Pengguna',
      render: (c) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-medium">{c.displayName ?? '—'}</span>
            {c.id === user?.id ? <Badge variant="outline">Akun Anda</Badge> : null}
          </div>
          <div className="truncate text-xs text-muted">{c.email}</div>
        </div>
      ),
    },
    {
      key: 'roles',
      header: 'Peran',
      render: (c) => {
        const self = c.id === user?.id;
        return (
          <div className="flex flex-wrap items-center gap-1">
            <span className="mr-1 rounded-pill border border-line px-2 py-0.5 text-xs text-muted">
              {ROLE_LABEL[ROLE_CODE.CUSTOMER]}
            </span>
            {ASSIGNABLE.map((role) => {
              const has = c.roles.includes(role);
              return (
                <button
                  key={role}
                  type="button"
                  disabled={self || change.isPending}
                  title={
                    self
                      ? 'Peran akun sendiri tidak dapat diubah'
                      : has
                        ? `Cabut ${ROLE_LABEL[role]}`
                        : `Beri ${ROLE_LABEL[role]}`
                  }
                  onClick={() => change.mutate({ id: c.id, role, grant: !has })}
                  className={cn(
                    'rounded-pill border px-2 py-0.5 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-55',
                    has
                      ? 'border-accent bg-accent/10 font-medium text-accent'
                      : 'border-line text-muted hover:border-accent hover:text-accent',
                  )}
                >
                  {ROLE_LABEL[role]}
                </button>
              );
            })}
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      hideOnMobile: true,
      render: (c) => (
        <span
          className={
            'rounded-pill border px-2 py-0.5 text-xs ' +
            (c.status === 'active'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border-line bg-soft text-muted')
          }
        >
          {c.status === 'active' ? 'Aktif' : 'Nonaktif'}
        </span>
      ),
    },
    {
      key: 'joined',
      header: 'Bergabung',
      hideOnMobile: true,
      render: (c) => <span className="text-muted">{dateOnly(c.createdAt)}</span>,
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Pengguna' }]}
        title="Pengguna"
        description="Beri atau cabut akses staf. Hanya super admin yang dapat mengubah peran."
      />

      <div className="flex flex-wrap items-center gap-2">
        <SearchBar
          value={search.term}
          onChange={(value) => {
            search.setTerm(value);
            setPage(1);
          }}
          onSubmit={() => {
            search.submit();
            setPage(1);
          }}
          placeholder="Cari email, nama, telepon…"
          className="sm:max-w-sm"
        />
        <Button variant="secondary" onClick={() => setPage(1)}>
          Cari
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={list.isLoading && !list.data}
        rowKey={(c) => c.id}
        empty="Tidak ada pengguna yang cocok."
        footer={list.data ? <Pager page={list.data.page} totalPages={list.data.totalPages} onChange={setPage} /> : null}
      />

      <p className="text-xs text-muted">
        Klik lencana peran untuk memberi atau mencabutnya. Peran pelanggan otomatis dan tidak dapat dicabut, dan peran
        akun sendiri selalu terkunci.
      </p>
    </div>
  );
}

export default AdminUsers;
