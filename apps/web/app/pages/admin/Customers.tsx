import { useQuery } from '@tanstack/react-query';
import { type AdminCustomerRow, ROLE_CODE, type RoleCode } from '@velora/shared';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { type Column, DataTable, Pager, SearchBar, StatCard, useSearchQuery } from '../../components/admin/kit';
import { PageHeader } from '../../components/admin/page-header';
import { Button } from '../../components/ui/button';
import { api } from '../../lib/api';
import type { Paginated } from '../../lib/api-types';
import { dateOnly, rupiah } from '../../lib/format';

const ROLE_LABEL: Record<RoleCode, string> = {
  customer: 'Pelanggan',
  admin: 'Admin',
  super_admin: 'Super admin',
};

export function AdminCustomers() {
  const navigate = useNavigate();
  const search = useSearchQuery();
  const [page, setPage] = useState(1);

  const list = useQuery<Paginated<AdminCustomerRow>>({
    queryKey: ['admin', 'customers', search.committed, page],
    queryFn: () =>
      api.get<Paginated<AdminCustomerRow>>(
        '/admin/customers',
        { q: search.committed || undefined, page, pageSize: 20 },
        { anonymous: true },
      ),
  });

  const rows = list.data?.items ?? [];
  const active = rows.filter((c) => c.status === 'active').length;
  const spent = rows.reduce((sum, c) => sum + c.totalSpent, 0);

  const columns: Column<AdminCustomerRow>[] = [
    {
      key: 'who',
      header: 'Pelanggan',
      render: (c) => (
        <div>
          <div className="font-medium">{c.displayName ?? '—'}</div>
          <div className="text-xs text-muted">
            {c.email}
            {c.phone ? ` · ${c.phone}` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'roles',
      header: 'Peran',
      hideOnMobile: true,
      render: (c) => <span className="text-xs text-muted">{c.roles.map((r) => ROLE_LABEL[r] ?? r).join(', ')}</span>,
    },
    { key: 'orders', header: 'Pesanan', render: (c) => <span className="tabular-nums">{c.orderCount}</span> },
    {
      key: 'spent',
      header: 'Total belanja',
      render: (c) => <span className="tabular-nums">{rupiah(c.totalSpent)}</span>,
    },
    {
      key: 'last',
      header: 'Terakhir',
      hideOnMobile: true,
      render: (c) => <span className="text-muted">{dateOnly(c.lastOrderAt)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
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
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Pelanggan' }]}
        title="Pelanggan"
        description="Akun, peran, dan riwayat belanja."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Total pelanggan" value={list.data?.total ?? 0} />
        <StatCard label="Aktif (halaman ini)" value={active} hint={`${rows.length} baris`} />
        <StatCard label="Belanja (halaman ini)" value={rupiah(spent)} tone="accent" />
      </div>

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
        onRowClick={(c) => navigate(`/admin/pelanggan/${c.id}`)}
        empty="Tidak ada pelanggan yang cocok."
        footer={list.data ? <Pager page={list.data.page} totalPages={list.data.totalPages} onChange={setPage} /> : null}
      />

      <p className="text-xs text-muted">
        Pelanggan dengan peran {ROLE_LABEL[ROLE_CODE.ADMIN].toLowerCase()} dapat membuka panel admin.
      </p>
    </div>
  );
}

export default AdminCustomers;
