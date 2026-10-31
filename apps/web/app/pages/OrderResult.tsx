import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type OrderStatus, type PaymentStatus, ROUTES } from '@velora/shared';
import { AlertTriangle, CheckCircle2, Clock, Copy, ExternalLink, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button, Spinner } from '../components/ui';
import { useToast } from '../context/ToastContext';
import { ApiError, api } from '../lib/api';
import type { PaymentMethodsResponse } from '../lib/api-types';
import { PAYMENT_STATUS_LABEL, dateTime, parseDate, rupiah, statusChip } from '../lib/format';

interface StatusView {
  code: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus | null;
  shippingStatus: string | null;
  grandTotal: number;
  expiresAt: string | null;
  paymentUrl: string | null;
  vaNumber: string | null;
  qrString: string | null;
  paymentMethod: string | null;
  paymentMethodName?: string | null;
  paymentReference: string | null;
  paymentMessage?: string | null;
  gatewayConfigured: boolean;
  paidAt: string | null;
  shipment: unknown;
}

interface RecheckResult {
  status: PaymentStatus;
  changed: boolean;
  message?: string;
}

export function OrderResultPage() {
  const { code = '' } = useParams();
  const toast = useToast();
  const qc = useQueryClient();
  const upper = code.toUpperCase();
  const [retryChannel, setRetryChannel] = useState<string | null>(null);

  const status = useQuery<StatusView>({
    queryKey: ['checkout-status', upper],
    queryFn: () => api.get<StatusView>(`/checkout/status/${upper}`),
    // While unpaid, poll so a completed gateway redirect is reflected without a refresh.
    refetchInterval: (q) => (q.state.data && q.state.data.paymentStatus === 'paid' ? false : 15_000),
  });

  const data = status.data;
  const paid = data?.paymentStatus === 'paid';
  const orderState = String(data?.status ?? '');
  const closed = orderState === 'cancelled' || orderState === 'expired';
  const hasInstructions = Boolean(data?.vaNumber || data?.paymentUrl || data?.qrString);
  // The order exists but the gateway never produced a VA / link / QR (e.g. it refused the request).
  const needsRetry = Boolean(data && !paid && !closed && data.gatewayConfigured && !hasInstructions);

  const recheck = useMutation({
    mutationFn: (_opts?: { silent?: boolean }) => api.post<RecheckResult>(`/checkout/status/${upper}/recheck`),
    onSuccess: (res, opts) => {
      qc.invalidateQueries({ queryKey: ['checkout-status', upper] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      if (!opts?.silent || res.changed) {
        toast.push(res.message ?? (res.changed ? 'Status diperbarui.' : 'Belum ada perubahan.'), 'info');
      }
    },
    onError: (err, opts) => {
      if (!opts?.silent) toast.push(err instanceof Error ? err.message : 'Gagal memeriksa status', 'error');
    },
  });

  // Duitku's callback cannot reach a local dev server, so while a payment is open
  // we ask Duitku directly every 30 seconds. In production the callback usually wins first.
  useEffect(() => {
    if (!hasInstructions || paid || closed) return;
    const id = setInterval(() => recheck.mutate({ silent: true }), 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasInstructions, paid, closed]);

  const methods = useQuery<PaymentMethodsResponse>({
    queryKey: ['payment-methods', data?.grandTotal],
    queryFn: () =>
      api.get<PaymentMethodsResponse>('/payment/methods', { amount: data?.grandTotal }, { anonymous: true }),
    enabled: needsRetry && Boolean(data?.grandTotal),
    staleTime: 5 * 60_000,
  });
  const methodList = methods.data?.methods ?? [];
  const previous = data?.paymentMethod ?? null;
  const chosenChannel = retryChannel ?? (previous && methodList.some((m) => m.code === previous) ? previous : null);

  const retry = useMutation({
    mutationFn: (channelCode: string) => api.post(`/checkout/payment/retry`, { code: upper, channelCode }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['checkout-status', upper] });
      toast.push('Instruksi pembayaran berhasil dibuat.', 'success');
    },
    onError: (err) => toast.push(err instanceof ApiError ? err.message : 'Gagal membuat pembayaran', 'error'),
  });

  if (status.isLoading && !data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Spinner label="Memuat pesanan…" />
      </div>
    );
  }

  if (status.isError && !data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-sm text-red-700">
          {status.error instanceof ApiError ? status.error.message : 'Pesanan tidak dapat dimuat.'}
        </p>
        <Link to={ROUTES.catalog} className="mt-4 inline-block text-sm text-accent hover:underline">
          Kembali belanja
        </Link>
      </div>
    );
  }

  const methodName = data?.paymentMethodName || data?.paymentMethod || null;
  const title = paid
    ? 'Pembayaran diterima'
    : closed
      ? orderState === 'expired'
        ? 'Pesanan kedaluwarsa'
        : 'Pesanan dibatalkan'
      : needsRetry
        ? 'Pembayaran belum dibuat'
        : 'Menunggu pembayaran';

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="border border-line bg-surface p-6 text-center sm:p-8">
        {paid ? (
          <CheckCircle2 className="mx-auto h-12 w-12 text-accent" />
        ) : closed ? (
          <AlertTriangle className="mx-auto h-12 w-12 text-red-600" />
        ) : needsRetry ? (
          <AlertTriangle className="mx-auto h-12 w-12 text-amber-500" />
        ) : (
          <Clock className="mx-auto h-12 w-12 text-amber-500" />
        )}
        <h1 className="mt-4 text-2xl">{title}</h1>
        <p className="mt-1 text-sm text-muted">
          Pesanan <span className="font-medium text-ink">{data?.code}</span>
        </p>
        {data ? (
          <span
            className={
              'mt-3 inline-flex items-center gap-1 rounded-pill border px-3 py-1 text-xs ' +
              statusChip(data.status).className
            }
          >
            {statusChip(data.status).label}
          </span>
        ) : null}
      </div>

      {data && !paid && !closed ? (
        <div className="mt-6 border border-line bg-surface p-6">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-lg">{needsRetry ? 'Buat pembayaran' : 'Instruksi pembayaran'}</h2>
            <span className="text-xl font-semibold">{rupiah(data.grandTotal)}</span>
          </div>

          {!data.gatewayConfigured ? (
            <p className="mt-3 border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              Gateway pembayaran belum dikonfigurasi administrator. Pesanan tetap tersimpan — hubungi toko untuk
              menyelesaikan pembayaran.
            </p>
          ) : null}

          {/* Payment could not be created: explain and offer a retry on this same order. */}
          {needsRetry ? (
            <div className="mt-4 space-y-4">
              <div className="border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="font-medium">Instruksi pembayaran belum berhasil dibuat.</p>
                <p className="mt-1">
                  Pesanan Anda tetap tersimpan. Pilih metode pembayaran lalu buat ulang — tidak perlu mengisi keranjang
                  lagi.
                </p>
                {data.paymentMessage ? (
                  <p className="mt-2 text-amber-800">Keterangan dari gateway: {data.paymentMessage}</p>
                ) : null}
              </div>

              {methods.isLoading ? (
                <Spinner label="Memuat metode pembayaran…" />
              ) : methodList.length === 0 ? (
                <p className="text-sm text-muted">
                  {methods.data?.note ?? 'Metode pembayaran belum tersedia. Coba lagi beberapa saat.'}
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {methodList.map((m) => (
                    <label
                      key={m.code}
                      className={
                        'flex cursor-pointer items-center gap-2 border p-3 text-sm ' +
                        (chosenChannel === m.code ? 'border-ink bg-soft' : 'border-line hover:border-accent')
                      }
                    >
                      <input
                        type="radio"
                        name="retry-pay"
                        checked={chosenChannel === m.code}
                        onChange={() => setRetryChannel(m.code)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{m.name}</div>
                        <div className="text-xs text-muted">{m.fee > 0 ? `Biaya ${rupiah(m.fee)}` : 'Tanpa biaya'}</div>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              <Button
                size="lg"
                className="w-full"
                disabled={!chosenChannel}
                loading={retry.isPending}
                onClick={() => chosenChannel && retry.mutate(chosenChannel)}
              >
                Buat pembayaran
              </Button>
            </div>
          ) : (
            <>
              <dl className="mt-4 space-y-2 text-sm">
                {methodName ? <Line label="Metode" value={methodName} /> : null}
                {data.vaNumber ? <CopyLine label="Nomor Virtual Account" value={data.vaNumber} strong /> : null}
                {data.qrString && !data.paymentUrl ? <CopyLine label="Kode QRIS" value={data.qrString} /> : null}
                {data.paymentReference ? <CopyLine label="Nomor referensi" value={data.paymentReference} /> : null}
                <Line label="Batas bayar" value={data.expiresAt ? dateTime(data.expiresAt) : '—'} />
                <Line
                  label="Status bayar"
                  value={data.paymentStatus ? PAYMENT_STATUS_LABEL[data.paymentStatus] : 'Menunggu'}
                />
              </dl>

              {data.vaNumber ? (
                <ol className="mt-5 list-decimal space-y-1 border border-line bg-soft p-4 pl-8 text-xs text-muted">
                  <li>Buka aplikasi mobile banking atau ATM Anda.</li>
                  <li>Pilih menu transfer / bayar ke Virtual Account.</li>
                  <li>
                    Masukkan nomor Virtual Account di atas dan pastikan nominalnya{' '}
                    <span className="font-medium text-ink">{rupiah(data.grandTotal)}</span>.
                  </li>
                  <li>Selesaikan pembayaran, lalu tekan “Periksa status”.</li>
                </ol>
              ) : null}

              <div className="mt-5 flex flex-wrap gap-2">
                {data.paymentUrl ? (
                  <a href={data.paymentUrl} target="_blank" rel="noopener noreferrer">
                    <Button size="lg" className="w-full sm:w-auto">
                      <ExternalLink className="h-4 w-4" /> Bayar sekarang
                    </Button>
                  </a>
                ) : null}
                <Button
                  variant="secondary"
                  className="flex-1 sm:flex-none"
                  loading={recheck.isPending}
                  onClick={() => recheck.mutate({ silent: false })}
                >
                  <RefreshCw className="h-4 w-4" /> Periksa status
                </Button>
              </div>

              {import.meta.env.DEV ? (
                <p className="mt-4 border border-line p-3 text-xs text-muted">
                  Mode pengembangan: di sandbox Duitku, bayar lewat simulator pembayaran di dashboard Duitku dengan
                  nomor Virtual Account di atas, lalu tekan “Periksa status”. Callback Duitku tidak bisa menjangkau
                  localhost, jadi status dicek otomatis setiap 30 detik.
                </p>
              ) : null}

              <Countdown expiresAt={data.expiresAt} onExpire={() => recheck.mutate({ silent: false })} />
            </>
          )}
        </div>
      ) : null}

      {data && paid ? (
        <div className="mt-6 border border-line bg-surface p-6 text-sm">
          <p className="text-muted">
            Terima kasih! Pesanan Anda sedang kami proses. Pantau statusnya kapan saja di halaman pesanan.
          </p>
        </div>
      ) : null}

      {data && closed ? (
        <div className="mt-6 border border-line bg-surface p-6 text-sm">
          <p className="text-muted">
            Pesanan ini tidak lagi menunggu pembayaran. Anda bisa menambahkan produknya ke keranjang dan checkout
            kembali.
          </p>
        </div>
      ) : null}

      <div className="mt-6 flex justify-center gap-3 text-sm">
        <Link to={ROUTES.orderDetail(upper)} className="text-accent hover:underline">
          Detail pesanan
        </Link>
        <span className="text-muted">·</span>
        <Link to={ROUTES.catalog} className="text-accent hover:underline">
          lanjut belanja
        </Link>
      </div>
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-line pb-2">
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}

function CopyLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  const toast = useToast();
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line pb-2">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="flex min-w-0 items-center gap-2 text-right font-medium">
        <span className={'min-w-0 break-all tabular-nums ' + (strong ? 'text-lg tracking-wide' : '')}>{value}</span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(value).then(
              () => toast.push('Disalin', 'success'),
              () => toast.push('Gagal menyalin', 'error'),
            );
          }}
          aria-label="Salin"
          className="shrink-0 text-muted hover:text-ink"
        >
          <Copy className="h-4 w-4" />
        </button>
      </dd>
    </div>
  );
}

function Countdown({ expiresAt, onExpire }: { expiresAt: string | null; onExpire: () => void }) {
  const target = parseDate(expiresAt);
  const [left, setLeft] = useState(() => Math.max(0, target - Date.now()));

  useEffect(() => {
    if (!target) return;
    const id = setInterval(() => {
      const next = Math.max(0, target - Date.now());
      setLeft(next);
      if (next === 0) {
        clearInterval(id);
        onExpire();
      }
    }, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  if (!target) return null;
  const totalSec = Math.floor(left / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    <p className="mt-3 text-center text-sm text-muted">
      {left > 0 ? (
        <>
          Bayar dalam{' '}
          <span className="font-semibold tabular-nums text-ink">
            {h > 0 ? `${pad(h)}:` : ''}
            {pad(m)}:{pad(s)}
          </span>
        </>
      ) : (
        <span className="text-red-700">Batas waktu pembayaran lewat — periksa status.</span>
      )}
    </p>
  );
}

export default OrderResultPage;
