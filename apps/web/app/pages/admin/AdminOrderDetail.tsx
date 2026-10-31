import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ORDER_STATUS, ORDER_TRANSITIONS, type OrderDetail as OrderDetailView, type OrderStatus } from '@velora/shared';
import { ArrowLeft, Plus, Save } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Media } from '../../components/Media';
import { FormSection, Labeled } from '../../components/admin/kit';
import { PageHeader } from '../../components/admin/page-header';
import { Button } from '../../components/ui/button';
import { Field, Input, Select, Spinner, Textarea } from '../../components/ui/form';
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
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL, dateTime, rupiah, statusChip } from '../../lib/format';

export function AdminOrderDetail() {
  const { code = '' } = useParams();
  const upper = code.toUpperCase();
  const toast = useToast();
  const qc = useQueryClient();

  const [target, setTarget] = useState<OrderStatus | ''>('');
  const [note, setNote] = useState('');
  const [modal, setModal] = useState<null | 'refund' | 'cancel' | 'note'>(null);
  const [refundAmount, setRefundAmount] = useState('');
  const [reason, setReason] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [noteVis, setNoteVis] = useState<'internal' | 'customer'>('internal');

  const order = useQuery<OrderDetailView>({
    queryKey: ['admin', 'order', upper],
    queryFn: () => api.get<OrderDetailView>(`/admin/orders/${upper}`, undefined, { anonymous: true }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin', 'order', upper] });
    qc.invalidateQueries({ queryKey: ['admin', 'orders'] });
  };
  const fail = (err: unknown, fallback: string) =>
    toast.push(err instanceof ApiError ? err.message : fallback, 'error');

  const changeStatus = useMutation({
    mutationFn: () =>
      api.patch<{ order: OrderDetailView }>(`/admin/orders/${upper}/status`, { status: target, note: note || null }),
    onSuccess: () => {
      invalidate();
      setNote('');
      setTarget('');
      toast.push('Status diperbarui', 'success');
    },
    onError: (e) => fail(e, 'Gagal mengubah status'),
  });
  const addNote = useMutation({
    mutationFn: () => api.post(`/admin/orders/${upper}/notes`, { body: noteBody, visibility: noteVis }),
    onSuccess: () => {
      invalidate();
      setModal(null);
      setNoteBody('');
      toast.push('Catatan ditambahkan', 'success');
    },
    onError: (e) => fail(e, 'Gagal menambah catatan'),
  });
  const doCancel = useMutation({
    mutationFn: () => api.post(`/admin/orders/${upper}/cancel`, { reason }),
    onSuccess: () => {
      invalidate();
      setModal(null);
      setReason('');
      toast.push('Pesanan dibatalkan', 'success');
    },
    onError: (e) => fail(e, 'Gagal membatalkan'),
  });
  const doRefund = useMutation({
    mutationFn: () => api.post(`/admin/orders/${upper}/refund`, { amount: Number(refundAmount), reason }),
    onSuccess: () => {
      invalidate();
      setModal(null);
      setReason('');
      setRefundAmount('');
      toast.push('Refund diproses', 'success');
    },
    onError: (e) => fail(e, 'Gagal refund'),
  });
  const pushShipment = useMutation({
    mutationFn: () => api.post(`/admin/orders/${upper}/shipment`),
    onSuccess: () => {
      invalidate();
      toast.push('Kiriman dikirim ke kurir', 'success');
    },
    onError: (e) => fail(e, 'Gagal membuat kiriman'),
  });
  const syncTracking = useMutation({
    mutationFn: () => api.post(`/admin/orders/${upper}/tracking`),
    onSuccess: () => {
      invalidate();
      toast.push('Lacak disinkronkan', 'success');
    },
    onError: (e) => fail(e, 'Gagal sinkronisasi lacak'),
  });
  const recheckPayment = useMutation({
    mutationFn: () => api.post<{ status: string }>(`/admin/orders/${upper}/payment/recheck`),
    onSuccess: () => {
      invalidate();
      toast.push('Status pembayaran diperiksa', 'success');
    },
    onError: (e) => fail(e, 'Gagal memeriksa pembayaran'),
  });

  if (order.isLoading && !order.data) return <Spinner label="Memuat pesanan…" />;
  if (!order.data) {
    return (
      <div className="space-y-4">
        <PageHeader
          breadcrumbs={[
            { label: 'Admin', to: '/admin' },
            { label: 'Pesanan', to: '/admin/pesanan' },
          ]}
          title="Pesanan tidak ditemukan"
          actions={
            <Button asChild variant="secondary">
              <Link to="/admin/pesanan">
                <ArrowLeft /> Semua pesanan
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  const o = order.data;
  const chip = statusChip(o.status);
  const next = ORDER_TRANSITIONS[o.status] ?? [];

  return (
    <div className="space-y-4">
      <PageHeader
        breadcrumbs={[
          { label: 'Admin', to: '/admin' },
          { label: 'Pesanan', to: '/admin/pesanan' },
          { label: `#${o.code}` },
        ]}
        title={`#${o.code}`}
        description={`${dateTime(o.createdAt)} · ${o.customerName ?? o.customerEmail ?? 'tamu'}`}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link to="/admin/pesanan">
                <ArrowLeft /> Semua pesanan
              </Link>
            </Button>
            <span className={'rounded-pill border px-3 py-1 text-sm ' + chip.className}>{chip.label}</span>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <FormSection
            title="Aksi admin"
            description="Perubahan status mengikuti alur pesanan."
            action={
              <Button variant="secondary" size="sm" onClick={() => setModal('note')}>
                <Plus /> Catatan
              </Button>
            }
          >
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Ubah status ke" htmlFor="order-target">
                <Select
                  id="order-target"
                  value={target}
                  onChange={(event) => setTarget(event.target.value as OrderStatus)}
                  className="w-52"
                >
                  <option value="">— pilih —</option>
                  {next.map((s) => (
                    <option key={s} value={s}>
                      {ORDER_STATUS_LABEL[s]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Catatan (opsional)" htmlFor="order-note">
                <Input
                  id="order-note"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  className="w-56"
                  placeholder="mis. dibayar via transfer"
                />
              </Field>
              <Button loading={changeStatus.isPending} disabled={!target} onClick={() => changeStatus.mutate()}>
                <Save /> Terapkan
              </Button>
            </div>

            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              {o.status === ORDER_STATUS.PENDING_PAYMENT ? (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={recheckPayment.isPending}
                  onClick={() => recheckPayment.mutate()}
                >
                  Periksa pembayaran
                </Button>
              ) : null}
              {(o.status === ORDER_STATUS.PAID || o.status === ORDER_STATUS.PROCESSING) && !o.shipment ? (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={pushShipment.isPending}
                  onClick={() => pushShipment.mutate()}
                >
                  Buat kiriman (Biteship)
                </Button>
              ) : null}
              {o.shipment ? (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={syncTracking.isPending}
                  onClick={() => syncTracking.mutate()}
                >
                  Sinkron lacak
                </Button>
              ) : null}
              {([ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.PAID, ORDER_STATUS.PROCESSING] as OrderStatus[]).includes(
                o.status,
              ) ? (
                <Button variant="destructive" size="sm" onClick={() => setModal('cancel')}>
                  Batalkan
                </Button>
              ) : null}
              {o.paymentStatus === 'paid' ? (
                <Button variant="destructive" size="sm" onClick={() => setModal('refund')}>
                  Refund
                </Button>
              ) : null}
            </div>
          </FormSection>

          <FormSection title="Item pesanan">
            <ul className="divide-y divide-line text-sm">
              {o.items.map((it) => (
                <li key={it.id} className="flex gap-3 py-2">
                  <div className="w-12 shrink-0">
                    <Media url={it.imageUrl} label={it.productName} aspect="portrait" />
                  </div>
                  <div className="flex-1">
                    <div>{it.productName}</div>
                    <div className="text-xs text-muted">
                      {it.variantLabel} · {it.quantity} × {rupiah(it.unitPrice)}
                    </div>
                  </div>
                  <span className="tabular-nums">{rupiah(it.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <dl className="space-y-1 border-t border-line pt-3 text-sm">
              <Row label="Subtotal" value={rupiah(o.subtotal)} />
              {o.discountTotal > 0 ? <Row label="Diskon" value={'-' + rupiah(o.discountTotal)} /> : null}
              <Row label="Ongkir" value={rupiah(o.shippingFee)} />
              {o.paymentFee > 0 ? <Row label="Biaya admin" value={rupiah(o.paymentFee)} /> : null}
              <div className="flex justify-between text-base font-semibold">
                <dt>Total</dt>
                <dd className="tabular-nums">{rupiah(o.grandTotal)}</dd>
              </div>
            </dl>
          </FormSection>

          <FormSection title="Catatan internal" description="Riwayat catatan admin pada pesanan ini.">
            {o.notes.length ? (
              <ul className="space-y-1.5 text-sm">
                {o.notes.map((n) => (
                  <li key={n.id} className="flex justify-between gap-3 border-b border-line py-1.5 last:border-0">
                    <span>{n.body}</span>
                    <span className="shrink-0 text-xs text-muted">
                      {n.visibility === 'customer' ? 'ke pelanggan' : 'internal'} · {dateTime(n.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Belum ada catatan.</p>
            )}
          </FormSection>
        </div>

        <div className="space-y-4">
          <FormSection title="Pembayaran">
            <Labeled label="Status">
              {o.payment
                ? PAYMENT_STATUS_LABEL[o.payment.status]
                : o.paymentStatus
                  ? PAYMENT_STATUS_LABEL[o.paymentStatus]
                  : '—'}
            </Labeled>
            {o.payment?.reference ? (
              <Labeled label="Referensi">
                <span className="tabular-nums">{o.payment.reference}</span>
              </Labeled>
            ) : null}
            {o.payment?.method ? <Labeled label="Metode">{o.payment.method}</Labeled> : null}
          </FormSection>

          <FormSection title="Alamat pengiriman">
            <div className="text-sm font-medium">
              {o.shipping.recipientName} · {o.shipping.phone}
            </div>
            <div className="text-sm text-muted">
              {o.shipping.detail}, {o.shipping.district}, {o.shipping.city}, {o.shipping.province} {o.shipping.postcode}
            </div>
            {o.customerNote ? (
              <p className="border-l-2 border-line pl-2 text-sm italic text-muted">“{o.customerNote}”</p>
            ) : null}
          </FormSection>

          {o.shipment ? (
            <FormSection title="Pengiriman">
              <div className="text-sm">
                {o.shipment.courierCompany} · {o.shipment.courierService}
              </div>
              {o.shipment.trackingNumber ? (
                <div className="text-sm text-muted">
                  Resi: <span className="tabular-nums text-ink">{o.shipment.trackingNumber}</span>
                </div>
              ) : null}
              <ol className="space-y-1">
                {o.shipment.events.slice(0, 6).map((event) => (
                  <li key={event.id} className="flex justify-between gap-2 text-xs">
                    <span>{event.label}</span>
                    <span className="shrink-0 text-muted">{dateTime(event.occurredAt)}</span>
                  </li>
                ))}
              </ol>
            </FormSection>
          ) : null}
        </div>
      </div>

      <Dialog open={modal === 'refund'} onOpenChange={(open) => (open ? undefined : setModal(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refund pembayaran</DialogTitle>
            <DialogDescription>Dana dikembalikan ke metode pembayaran pelanggan.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-5 py-4">
            <Field label="Nominal (Rp)" required htmlFor="refund-amount">
              <Input
                id="refund-amount"
                inputMode="numeric"
                value={refundAmount}
                onChange={(event) => setRefundAmount(event.target.value.replace(/\D/g, ''))}
              />
            </Field>
            <Field label="Alasan" required htmlFor="refund-reason">
              <Textarea
                id="refund-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="min-h-24"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModal(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              loading={doRefund.isPending}
              disabled={!Number(refundAmount) || reason.trim().length < 3}
              onClick={() => doRefund.mutate()}
            >
              Proses refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modal === 'cancel'} onOpenChange={(open) => (open ? undefined : setModal(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batalkan pesanan</DialogTitle>
            <DialogDescription>Alasan pencatatan wajib diisi dan tersimpan di riwayat pesanan.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-5 py-4">
            <Field label="Alasan" required htmlFor="cancel-reason">
              <Textarea
                id="cancel-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="min-h-24"
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModal(null)}>
              Kembali
            </Button>
            <Button
              variant="destructive"
              loading={doCancel.isPending}
              disabled={reason.trim().length < 3}
              onClick={() => doCancel.mutate()}
            >
              Batalkan pesanan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modal === 'note'} onOpenChange={(open) => (open ? undefined : setModal(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tambah catatan</DialogTitle>
            <DialogDescription>Catatan internal tidak tampil untuk pelanggan.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-5 py-4">
            <Field label="Isi catatan" required htmlFor="note-body">
              <Textarea
                id="note-body"
                value={noteBody}
                onChange={(event) => setNoteBody(event.target.value)}
                className="min-h-24"
              />
            </Field>
            <Field label="Visibilitas" htmlFor="note-visibility">
              <Select
                id="note-visibility"
                value={noteVis}
                onChange={(event) => setNoteVis(event.target.value as 'internal' | 'customer')}
              >
                <option value="internal">Internal (hanya admin)</option>
                <option value="customer">Dapat dilihat pelanggan</option>
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModal(null)}>
              Batal
            </Button>
            <Button loading={addNote.isPending} disabled={!noteBody.trim()} onClick={() => addNote.mutate()}>
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
}

export default AdminOrderDetail;
