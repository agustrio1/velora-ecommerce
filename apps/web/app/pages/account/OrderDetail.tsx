import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ORDER_STATUS, type OrderDetail as OrderDetailView, ROUTES } from '@velora/shared';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { Link, type LoaderFunctionArgs, useParams } from 'react-router';
import { Media } from '../../components/Media';
import { AccountNav } from '../../components/account/AccountNav';
import { Button, Field, Modal, Spinner, Textarea } from '../../components/ui';
import { useToast } from '../../context/ToastContext';
import { ApiError, api } from '../../lib/api';
import { PAYMENT_STATUS_LABEL, dateOnly, dateTime, rupiah, statusChip } from '../../lib/format';
import { cloudflareEnv } from '../../services/cloudflare.server';
import { requireSession } from '../../services/session.server';

export async function loader({ request, context }: LoaderFunctionArgs) {
  await requireSession(request, cloudflareEnv(context));
  return null;
}

const CANCELABLE: string[] = [ORDER_STATUS.PENDING_PAYMENT, ORDER_STATUS.PAID, ORDER_STATUS.PROCESSING];

export function OrderDetailPage() {
  const { code = '' } = useParams();
  const upper = code.toUpperCase();
  const toast = useToast();
  const qc = useQueryClient();
  const [showCancel, setShowCancel] = useState(false);
  const [reason, setReason] = useState('');

  const order = useQuery<OrderDetailView>({
    queryKey: ['order', upper],
    queryFn: () => api.get<OrderDetailView>(`/account/orders/${upper}`),
  });

  const cancel = useMutation({
    mutationFn: () =>
      api.post<{ order: OrderDetailView }>(`/account/orders/${upper}/cancel`, { reason: reason.trim() }),
    onSuccess: () => {
      setShowCancel(false);
      setReason('');
      qc.invalidateQueries({ queryKey: ['order', upper] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      toast.push('Pesanan dibatalkan', 'success');
    },
    onError: (err) => toast.push(err instanceof ApiError ? err.message : 'Gagal membatalkan', 'error'),
  });

  if (order.isLoading && !order.data)
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <Spinner />
      </div>
    );
  if (!order.data)
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <p className="text-muted">Pesanan tidak ditemukan.</p>
        <Link to={ROUTES.orders} className="mt-3 inline-block text-accent hover:underline">
          Kembali ke pesanan
        </Link>
      </div>
    );

  const o = order.data;
  const chip = statusChip(o.status);
  const canCancel = CANCELABLE.includes(o.status);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="mb-1 text-2xl sm:text-3xl">Akun saya</h1>
      <AccountNav current="orders" />

      <Link to={ROUTES.orders} className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Semua pesanan
      </Link>

      <div className="border border-line bg-surface">
        <div className="flex items-center justify-between border-b border-line p-4">
          <div>
            <div className="text-sm font-medium">#{o.code}</div>
            <div className="text-xs text-muted">Dibuat {dateTime(o.createdAt)}</div>
          </div>
          <span className={'rounded-pill border px-3 py-1 text-xs ' + chip.className}>{chip.label}</span>
        </div>

        {/* Items */}
        <ul className="divide-y divide-line border-b border-line">
          {o.items.map((it) => (
            <li key={it.id} className="flex gap-3 p-4">
              <div className="w-14 shrink-0">
                <Media url={it.imageUrl} label={it.productName} aspect="portrait" />
              </div>
              <div className="flex-1 text-sm">
                <div className="line-clamp-1">{it.productName}</div>
                <div className="text-xs text-muted">
                  {it.variantLabel} · SKU {it.sku}
                </div>
                <div className="text-xs text-muted">
                  {it.quantity} × {rupiah(it.unitPrice)}
                </div>
              </div>
              <span className="text-sm font-semibold">{rupiah(it.lineTotal)}</span>
            </li>
          ))}
        </ul>

        {/* Totals */}
        <dl className="space-y-1.5 border-b border-line p-4 text-sm">
          <Row label="Subtotal" value={rupiah(o.subtotal)} />
          {o.discountTotal > 0 ? (
            <Row
              label={'Diskon' + (o.couponCode ? ` (${o.couponCode})` : '')}
              value={'-' + rupiah(o.discountTotal)}
              accent
            />
          ) : null}
          <Row label="Ongkir" value={rupiah(o.shippingFee)} />
          {o.paymentFee > 0 ? <Row label="Biaya admin" value={rupiah(o.paymentFee)} /> : null}
          <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
            <dt>Total</dt>
            <dd>{rupiah(o.grandTotal)}</dd>
          </div>
        </dl>

        {/* Shipping address */}
        <div className="border-b border-line p-4 text-sm">
          <div className="eyebrow mb-1">Alamat pengiriman</div>
          <div className="font-medium">
            {o.shipping.recipientName} · {o.shipping.phone}
          </div>
          <div className="text-muted">
            {o.shipping.detail}, {o.shipping.district}, {o.shipping.city}, {o.shipping.province} {o.shipping.postcode}
          </div>
        </div>

        {/* Payment */}
        {o.payment ? (
          <div className="border-b border-line p-4 text-sm">
            <div className="eyebrow mb-1">Pembayaran</div>
            <div className="flex justify-between">
              <span className="text-muted">Status</span>
              <span>{o.payment.status ? PAYMENT_STATUS_LABEL[o.payment.status] : '—'}</span>
            </div>
            {o.payment.method ? (
              <div className="flex justify-between">
                <span className="text-muted">Metode</span>
                <span>{o.payment.method}</span>
              </div>
            ) : null}
            {o.payment.reference ? (
              <div className="flex justify-between">
                <span className="text-muted">Referensi</span>
                <span className="tabular-nums">{o.payment.reference}</span>
              </div>
            ) : null}
            {o.status === ORDER_STATUS.PENDING_PAYMENT && o.payment.paymentUrl ? (
              <a href={o.payment.paymentUrl} target="_blank" rel="noopener noreferrer">
                <Button size="sm" className="mt-3 w-full">
                  <ExternalLink className="h-4 w-4" /> Lanjut pembayaran
                </Button>
              </a>
            ) : null}
          </div>
        ) : null}

        {/* Shipment / tracking */}
        {o.shipment ? (
          <div className="border-b border-line p-4 text-sm">
            <div className="eyebrow mb-1">Pengiriman</div>
            <div className="font-medium">
              {o.shipment.courierCompany} · {o.shipment.courierService}
            </div>
            {o.shipment.trackingNumber ? (
              <div className="text-muted">
                No. Resi: <span className="tabular-nums text-ink">{o.shipment.trackingNumber}</span>
              </div>
            ) : null}
            {o.shipment.events.length ? (
              <ol className="mt-3 space-y-2 border-l border-line pl-4">
                {o.shipment.events.map((e) => (
                  <li key={e.id} className="relative text-xs">
                    <span className="absolute -left-5.25 top-1 h-2 w-2 rounded-full bg-accent" />
                    <div className="text-ink">{e.label}</div>
                    <div className="text-muted">{dateTime(e.occurredAt)}</div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-xs text-muted">Belum ada pembaruan lacak.</p>
            )}
          </div>
        ) : null}

        {/* Timeline */}
        {o.timeline.length ? (
          <div className="p-4 text-sm">
            <div className="eyebrow mb-2">Riwayat status</div>
            <ol className="space-y-2">
              {o.timeline.map((t) => (
                <li key={t.id} className="flex justify-between text-xs">
                  <span className="text-ink">
                    {statusChip(t.toStatus).label}
                    {t.note ? ` — ${t.note}` : ''}
                  </span>
                  <span className="text-muted">{dateOnly(t.createdAt)}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        {o.cancelReason ? (
          <div className="border-t border-line p-4 text-sm text-red-700">Alasan pembatalan: {o.cancelReason}</div>
        ) : null}
      </div>

      {canCancel ? (
        <div className="mt-4 flex justify-end">
          <Button variant="danger" size="sm" onClick={() => setShowCancel(true)}>
            Batalkan pesanan
          </Button>
        </div>
      ) : null}

      <Modal open={showCancel} title="Batalkan pesanan" onClose={() => setShowCancel(false)}>
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Pesanan <strong>#{o.code}</strong> akan dibatalkan. Tindakan ini tidak dapat dibatalkan.
          </p>
          <Field label="Alasan pembatalan" required>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
              placeholder="mis. salah ukuran, butuh cepat, dll."
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowCancel(false)}>
              Kembali
            </Button>
            <Button
              variant="danger"
              loading={cancel.isPending}
              disabled={reason.trim().length < 3}
              onClick={() => cancel.mutate()}
            >
              Ya, batalkan
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={'flex justify-between ' + (accent ? 'text-accent' : '')}>
      <dt className={accent ? '' : 'text-muted'}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export default OrderDetailPage;
