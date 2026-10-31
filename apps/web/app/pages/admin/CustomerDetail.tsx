import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type AdminCustomerRow, ROLE_CODE, type RoleCode } from '@velora/shared';
import { ArrowLeft, Mail, Phone, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { FormSection, Labeled } from '../../components/admin/kit';
import { PageHeader } from '../../components/admin/page-header';
import { Button } from '../../components/ui/button';
import { Field, Select, Spinner } from '../../components/ui/form';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '../../components/ui/surface';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { ApiError, api } from '../../lib/api';
import { dateOnly, rupiah } from '../../lib/format';

interface CustomerDetail extends AdminCustomerRow {
  addresses: {
    id: string;
    label: string | null;
    recipientName: string;
    phone: string;
    province: string;
    city: string;
    district: string;
    postcode: string;
    detail: string;
    isDefault: boolean;
  }[];
  orders: { id: string; code: string; status: string; grandTotal: number; createdAt: string }[];
}

const ROLE_LABEL: Record<RoleCode, string> = {
  customer: 'Pelanggan',
  admin: 'Admin',
  super_admin: 'Super admin',
};

const CRUMBS = [
  { label: 'Admin', to: '/admin' },
  { label: 'Pelanggan', to: '/admin/pelanggan' },
];

/** `/admin/pelanggan/:id` — customer detail and role management. */
export function AdminCustomerDetail() {
  const { id = '' } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const { user } = useAuth();
  const [status, setStatus] = useState<'active' | 'disabled'>('active');
  const [roles, setRoles] = useState<RoleCode[]>([]);

  const detail = useQuery<CustomerDetail>({
    queryKey: ['admin', 'customer', id],
    queryFn: () => api.get<CustomerDetail>(`/admin/customers/${id}`, undefined, { anonymous: true }),
    enabled: Boolean(id),
  });

  // Seed the form whenever a different customer is opened.
  useEffect(() => {
    if (!detail.data) return;
    setStatus(detail.data.status);
    setRoles(detail.data.roles);
  }, [detail.data]);

  // Role edits for your own account are refused by the API, so never send them.
  const isSelf = Boolean(detail.data && detail.data.id === user?.id);

  const save = useMutation({
    mutationFn: () => api.patch(`/admin/customers/${id}`, isSelf ? { status } : { status, roles }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'customers'] });
      qc.invalidateQueries({ queryKey: ['admin', 'customer', id] });
      toast.push('Perubahan disimpan', 'success');
    },
    onError: (err) => toast.push(err instanceof ApiError ? err.message : 'Gagal menyimpan', 'error'),
  });

  if (detail.isLoading && !detail.data) return <Spinner label="Memuat pelanggan…" />;

  if (!detail.data) {
    return (
      <div className="space-y-4">
        <PageHeader
          breadcrumbs={CRUMBS}
          title="Pelanggan tidak ditemukan"
          actions={
            <Button asChild variant="secondary">
              <Link to="/admin/pelanggan">
                <ArrowLeft /> Kembali
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const c = detail.data;

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={[...CRUMBS, { label: c.displayName ?? c.email ?? 'Detail' }]}
        title={c.displayName ?? c.email ?? 'Pelanggan'}
        description={`Bergabung ${dateOnly(c.createdAt)}`}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link to="/admin/pelanggan">
                <ArrowLeft /> Kembali
              </Link>
            </Button>
            <Button loading={save.isPending} onClick={() => save.mutate()}>
              <Save /> Simpan
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="eyebrow">Total belanja</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{rupiah(c.totalSpent)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="eyebrow">Pesanan</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{c.orderCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="eyebrow">Status akun</div>
            <div className="mt-2">
              <Badge variant={c.status === 'active' ? 'success' : 'outline'}>
                {c.status === 'active' ? 'Aktif' : 'Nonaktif'}
              </Badge>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="eyebrow">Peran</div>
            <div className="mt-2 flex flex-wrap gap-1">
              {c.roles.map((role) => (
                <Badge key={role} variant={role === ROLE_CODE.CUSTOMER ? 'outline' : 'accent'}>
                  {ROLE_LABEL[role] ?? role}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <FormSection title="Kontak">
            <div className="grid gap-4 sm:grid-cols-2 text-sm">
              <Labeled label="Email">
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="h-3.5 w-3.5 text-muted" /> {c.email}
                </span>
              </Labeled>
              <Labeled label="Telepon">
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-muted" /> {c.phone ?? '—'}
                </span>
              </Labeled>
            </div>
          </FormSection>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="text-sm">Alamat tersimpan</CardTitle>
            </CardHeader>
            {c.addresses.length ? (
              <ul className="divide-y divide-line">
                {c.addresses.map((a) => (
                  <li key={a.id} className="px-5 py-3 text-sm">
                    <div className="font-medium">
                      {a.label ?? 'Alamat'} {a.isDefault ? <Badge variant="outline">Utama</Badge> : null}
                    </div>
                    <div className="text-xs text-muted">
                      {a.recipientName} · {a.phone}
                    </div>
                    <div className="text-xs text-muted">
                      {a.detail}, {a.district}, {a.city}, {a.province} {a.postcode}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-8 text-center text-sm text-muted">Belum ada alamat.</p>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle className="text-sm">20 pesanan terakhir</CardTitle>
            </CardHeader>
            {c.orders.length ? (
              <ul className="divide-y divide-line text-sm">
                {c.orders.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <Link to={`/admin/pesanan/${o.code}`} className="font-medium text-accent hover:underline">
                      {o.code}
                    </Link>
                    <span className="text-xs text-muted">
                      {dateOnly(o.createdAt)} · {rupiah(o.grandTotal)} · {o.status}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-8 text-center text-sm text-muted">Belum ada pesanan.</p>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <FormSection title="Akses & status">
            <Field label="Status akun" htmlFor="customer-status">
              <Select
                id="customer-status"
                value={status}
                onChange={(event) => setStatus(event.target.value as 'active' | 'disabled')}
              >
                <option value="active">Aktif</option>
                <option value="disabled">Nonaktif</option>
              </Select>
            </Field>

            <fieldset className="space-y-2" disabled={isSelf}>
              <legend className="text-xs font-semibold uppercase tracking-wider text-muted">Peran</legend>
              {(Object.values(ROLE_CODE) as RoleCode[]).map((role) => (
                <label key={role} className="flex items-center gap-2 text-sm text-ink">
                  <input
                    type="checkbox"
                    checked={roles.includes(role)}
                    disabled={role === ROLE_CODE.CUSTOMER || isSelf}
                    onChange={(event) =>
                      setRoles((prev) =>
                        event.target.checked ? [...prev, role] : prev.filter((value) => value !== role),
                      )
                    }
                  />
                  {ROLE_LABEL[role]}
                </label>
              ))}
              <p className="text-xs text-muted">
                {isSelf
                  ? 'Peran akun sendiri tidak dapat diubah — minta super admin lain.'
                  : 'Peran pelanggan diberikan otomatis dan tidak dapat dicabut. Hanya super admin dapat mengubah peran.'}
              </p>
            </fieldset>
          </FormSection>

          <FormSection title="Ringkasan aktivitas">
            <Labeled label="Pesanan terakhir">{dateOnly(c.lastOrderAt)}</Labeled>
            <Labeled label="ID pelanggan">
              <span className="break-all font-mono text-xs">{c.id}</span>
            </Labeled>
          </FormSection>
        </div>
      </div>
    </div>
  );
}

export default AdminCustomerDetail;
