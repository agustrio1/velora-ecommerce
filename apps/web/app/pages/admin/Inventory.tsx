import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InventoryRow } from '@velora/shared';
import { AlertTriangle, Boxes, PackageCheck } from 'lucide-react';
import { useState } from 'react';
import { type Column, DataTable, Pager, SearchBar, StatCard, useSearchQuery } from '../../components/admin/kit';
import { PageHeader } from '../../components/admin/page-header';
import { Button } from '../../components/ui/button';
import { Field, Input, Select, Switch, Textarea } from '../../components/ui/form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/overlay';
import { useToast } from '../../context/ToastContext';
import { ApiError, api } from '../../lib/api';

interface InventoryPage {
  items: InventoryRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export function AdminInventory() {
  const search = useSearchQuery();
  const [low, setLow] = useState(false);
  const [page, setPage] = useState(1);
  const [adjusting, setAdjusting] = useState<InventoryRow | null>(null);

  const list = useQuery<InventoryPage>({
    queryKey: ['admin', 'inventory', search.committed, low, page],
    queryFn: () =>
      api.get<InventoryPage>(
        '/admin/inventory',
        { q: search.committed || undefined, low: low ? '1' : undefined, page, pageSize: 25 },
        { anonymous: true },
      ),
  });

  const rows = list.data?.items ?? [];
  const lowOnPage = rows.filter((r) => r.available <= r.lowStockThreshold).length;
  const totalStock = rows.reduce((sum, r) => sum + r.available, 0);

  const columns: Column<InventoryRow>[] = [
    {
      key: 'product',
      header: 'Varian',
      render: (r) => (
        <div>
          <div className="font-medium">{r.productName}</div>
          <div className="text-xs text-muted">
            {r.sku} · {r.color} / {r.size}
          </div>
        </div>
      ),
    },
    { key: 'quantity', header: 'Stok', render: (r) => <span className="tabular-nums">{r.quantity}</span> },
    {
      key: 'reserved',
      header: 'Ditahan',
      hideOnMobile: true,
      render: (r) => <span className="tabular-nums text-muted">{r.reserved}</span>,
    },
    {
      key: 'available',
      header: 'Tersedia',
      render: (r) => (
        <span className={'tabular-nums ' + (r.available <= r.lowStockThreshold ? 'font-semibold text-red-700' : '')}>
          {r.available}
        </span>
      ),
    },
    {
      key: 'threshold',
      header: 'Ambang',
      hideOnMobile: true,
      render: (r) => <span className="tabular-nums text-muted">{r.lowStockThreshold}</span>,
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (r) => (
        <Button size="sm" variant="secondary" onClick={() => setAdjusting(r)}>
          Sesuaikan
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={[{ label: 'Admin', to: '/admin' }, { label: 'Inventaris' }]}
        title="Inventaris"
        description="Stok per varian. Setiap penyesuaian tercatat di buku pergerakan."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Varian terdaftar" value={list.data?.total ?? 0} icon={<Boxes className="h-4 w-4" />} />
        <StatCard
          label="Tersedia (halaman ini)"
          value={totalStock}
          icon={<PackageCheck className="h-4 w-4" />}
          tone="accent"
        />
        <StatCard
          label="Stok menipis"
          value={lowOnPage}
          hint="Di halaman ini"
          icon={<AlertTriangle className="h-4 w-4" />}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
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
          placeholder="Cari produk atau SKU…"
          className="sm:max-w-sm"
        />
        <span className="flex items-center gap-2 text-sm text-ink">
          <Switch
            checked={low}
            onCheckedChange={(checked) => {
              setLow(checked);
              setPage(1);
            }}
            aria-label="Hanya stok menipis"
          />
          Hanya stok menipis
        </span>
        <Button variant="secondary" onClick={() => setPage(1)}>
          Cari
        </Button>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={list.isLoading && !list.data}
        rowKey={(r) => r.variantId}
        empty="Tidak ada varian yang cocok."
        footer={list.data ? <Pager page={list.data.page} totalPages={list.data.totalPages} onChange={setPage} /> : null}
      />

      <AdjustDialog row={adjusting} onClose={() => setAdjusting(null)} />
    </div>
  );
}

function AdjustDialog({ row, onClose }: { row: InventoryRow | null; onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [type, setType] = useState<'stock_in' | 'stock_out' | 'adjust'>('stock_in');
  const [quantity, setQuantity] = useState('10');
  const [threshold, setThreshold] = useState('');
  const [note, setNote] = useState('');

  const adjust = useMutation({
    mutationFn: () =>
      api.post('/admin/inventory/adjust', {
        variantId: row?.variantId,
        type,
        quantity: Number(quantity) || 1,
        lowStockThreshold: threshold ? Number(threshold) : undefined,
        note: note || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'inventory'] });
      toast.push('Stok disesuaikan', 'success');
      setNote('');
      onClose();
    },
    onError: (err) => toast.push(err instanceof ApiError ? err.message : 'Gagal menyesuaikan stok', 'error'),
  });

  return (
    <Dialog open={Boolean(row)} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Sesuaikan stok</DialogTitle>
          <DialogDescription>
            {row ? `${row.productName} · ${row.color} / ${row.size} (${row.sku})` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tipe" htmlFor="inv-type">
              <Select id="inv-type" value={type} onChange={(event) => setType(event.target.value as typeof type)}>
                <option value="stock_in">Stok masuk</option>
                <option value="stock_out">Stok keluar</option>
                <option value="adjust">Koreksi</option>
              </Select>
            </Field>
            <Field label="Jumlah" required htmlFor="inv-qty">
              <Input
                id="inv-qty"
                inputMode="numeric"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value.replace(/\D/g, ''))}
              />
            </Field>
          </div>
          <Field label="Ambang stok menipis (opsional)" htmlFor="inv-threshold">
            <Input
              id="inv-threshold"
              inputMode="numeric"
              value={threshold}
              onChange={(event) => setThreshold(event.target.value.replace(/\D/g, ''))}
              placeholder={row ? String(row.lowStockThreshold) : ''}
            />
          </Field>
          <Field label="Catatan" htmlFor="inv-note">
            <Textarea
              id="inv-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={300}
              className="min-h-20"
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button loading={adjust.isPending} disabled={!Number(quantity)} onClick={() => adjust.mutate()}>
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default AdminInventory;
