import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type PaymentMethod, ROUTES, type UserAddress } from '@velora/shared';
import { useState } from 'react';
import { Link, type LoaderFunctionArgs, useNavigate } from 'react-router';
import { AddressForm } from '../components/AddressForm';
import { Media } from '../components/Media';
import { Button, EmptyState, Field, Spinner, Textarea } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useCart } from '../hooks/useCart';
import { ApiError, api } from '../lib/api';
import type {
  AddressList,
  PaymentMethodsResponse,
  PlaceOrderResponse,
  QuoteResponse,
  ShippingOptionsResponse,
} from '../lib/api-types';
import { rupiah } from '../lib/format';
import { readGuestToken } from '../lib/guestCart';
import { cloudflareEnv } from '../services/cloudflare.server';
import { requireSession } from '../services/session.server';

/** Checkout needs an account: bounce signed-out visitors to the login page. */
export async function loader({ request, context }: LoaderFunctionArgs) {
  await requireSession(request, cloudflareEnv(context));
  return null;
}

export function CheckoutPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { cart } = useCart();

  const [addressId, setAddressId] = useState<string | null>(null);
  const [shippingOptionId, setShippingOptionId] = useState<string | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [note, setNote] = useState('');
  const [paymentCode, setPaymentCode] = useState<string | null>(null);
  const [showAddressForm, setShowAddressForm] = useState(false);

  // Wait for the signed-in user so the first request already carries a token.
  const addresses = useQuery<AddressList>({
    queryKey: ['addresses'],
    queryFn: () => api.get<AddressList>('/account/addresses', undefined, { anonymous: true }),
    enabled: Boolean(user),
  });
  const addressList = addresses.data?.items ?? [];

  // No saved address yet → open the form straight away (inline, no popup).
  const noAddress = addresses.isSuccess && addressList.length === 0;
  const formOpen = showAddressForm || noAddress;

  // Default to the saved shipping address.
  const activeAddress =
    addressList.find((a) => a.id === addressId) ??
    addressList.find((a) => a.isDefaultShipping) ??
    addressList[0] ??
    null;
  const activeAddressId = activeAddress?.id ?? null;

  const shipping = useQuery<ShippingOptionsResponse>({
    queryKey: ['shipping-options', activeAddressId],
    queryFn: () =>
      api.get<ShippingOptionsResponse>('/shipping/options', {
        areaId: activeAddress?.areaId ?? undefined,
        postcode: activeAddress?.postcode ?? undefined,
        city: activeAddress?.city ?? undefined,
        province: activeAddress?.province ?? undefined,
      }),
    enabled: Boolean(activeAddressId),
    staleTime: 60_000,
  });

  // Store-side options (pickup / manual) are always present; real couriers only
  // appear when the origin is configured and Biteship returned rates.
  const shippingList = shipping.data?.options ?? [];
  const hasCourier = shippingList.some((o) => o.courier !== 'pickup' && o.courier !== 'manual');

  const quote = useQuery<QuoteResponse>({
    queryKey: ['quote', activeAddressId, shippingOptionId, couponCode],
    queryFn: () =>
      api.post<QuoteResponse>('/checkout/quote', {
        addressId: activeAddressId,
        shippingOptionId,
        couponCode: couponCode || null,
        customerNote: note || undefined,
      }),
    enabled: Boolean(activeAddressId),
    staleTime: 30_000,
  });

  const grandTotal = quote.data?.quote.grandTotal ?? 0;
  const ready = Boolean(activeAddressId && shippingOptionId && quote.data?.ready);

  const methods = useQuery<PaymentMethodsResponse>({
    queryKey: ['payment-methods', grandTotal],
    queryFn: () => api.get<PaymentMethodsResponse>('/payment/methods', { amount: grandTotal }, { anonymous: true }),
    enabled: ready && grandTotal > 0,
    staleTime: 5 * 60_000,
  });

  const place = useMutation({
    mutationFn: () =>
      api.post<PlaceOrderResponse>('/checkout', {
        addressId: activeAddressId,
        shippingOptionId,
        couponCode: couponCode || null,
        paymentChannelCode: paymentCode,
        customerNote: note || undefined,
        guestToken: readGuestToken() ?? undefined,
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['cart'] });
      qc.invalidateQueries({ queryKey: ['orders'] });
      navigate(ROUTES.checkoutResult(res.order.code), { replace: true });
    },
    onError: (err) => {
      if (err instanceof ApiError && Object.keys(err.fieldErrors).length) {
        toast.push('Periksa kembali data checkout.', 'error');
      } else {
        toast.push(err instanceof ApiError ? err.message : 'Pesanan gagal dibuat', 'error');
      }
    },
  });

  if (!cart || cart.lines.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
        <EmptyState
          title="Tidak ada yang bisa dipesan"
          body="Keranjang Anda kosong."
          action={
            <Link to={ROUTES.catalog}>
              <Button>Belanja dulu</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 text-2xl sm:text-3xl">Checkout</h1>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-6">
          {/* 1 · Address */}
          <Step n={1} title="Alamat pengiriman">
            {addresses.isPending ? (
              <Spinner label="Memuat alamat…" />
            ) : addresses.isError ? (
              <p className="text-sm text-red-700">
                Alamat gagal dimuat.{' '}
                <button type="button" onClick={() => addresses.refetch()} className="underline">
                  Coba lagi
                </button>
              </p>
            ) : (
              <div className="space-y-4">
                {addressList.length > 0 ? (
                  <div className="space-y-2">
                    {addressList.map((a) => (
                      <AddressOption
                        key={a.id}
                        address={a}
                        selected={a.id === activeAddressId}
                        onSelect={() => setAddressId(a.id)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted">
                    Anda belum punya alamat tersimpan. Isi alamat pengiriman di bawah.
                  </p>
                )}

                {formOpen ? (
                  <div className="border border-line bg-canvas p-4 sm:p-5">
                    <h3 className="mb-4 text-sm font-semibold">Alamat baru</h3>
                    <AddressForm
                      onCancel={addressList.length > 0 ? () => setShowAddressForm(false) : undefined}
                      onSaved={(a: UserAddress) => {
                        setShowAddressForm(false);
                        setAddressId(a.id);
                        qc.invalidateQueries({ queryKey: ['addresses'] });
                      }}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowAddressForm(true)}
                    className="text-sm text-accent hover:underline"
                  >
                    + Tambah alamat baru
                  </button>
                )}
              </div>
            )}
          </Step>

          {/* 2 · Shipping */}
          <Step n={2} title="Metode pengiriman">
            {!activeAddressId ? (
              <p className="text-sm text-muted">Pilih alamat terlebih dahulu.</p>
            ) : shipping.isLoading ? (
              <Spinner label="Menghitung tarif kurir…" />
            ) : shipping.isError ? (
              <p className="text-sm text-red-700">
                {shipping.error instanceof ApiError ? shipping.error.message : 'Tarif pengiriman gagal dimuat.'}{' '}
                <button type="button" onClick={() => shipping.refetch()} className="underline">
                  Coba lagi
                </button>
              </p>
            ) : shippingList.length === 0 ? (
              <p className="text-sm text-red-700">
                {shipping.data?.note ?? 'Tarif pengiriman tidak tersedia untuk wilayah ini.'}
              </p>
            ) : (
              <div className="space-y-2">
                {!hasCourier ? (
                  <div className="border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    Tarif kurir belum tersedia untuk alamat ini.{' '}
                    {shipping.data?.note ?? 'Hanya opsi dari toko yang bisa dipilih saat ini.'}
                  </div>
                ) : null}
                {shippingList.map((o) => (
                  <label
                    key={o.id}
                    className={
                      'flex cursor-pointer items-center justify-between gap-3 border p-3 ' +
                      (shippingOptionId === o.id ? 'border-ink bg-soft' : 'border-line hover:border-accent')
                    }
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <input
                        type="radio"
                        name="ship"
                        checked={shippingOptionId === o.id}
                        onChange={() => setShippingOptionId(o.id)}
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium">
                          {o.courierName || o.courier} · {o.service}
                        </div>
                        <div className="text-xs text-muted">{o.estimate ?? 'estimasi menyusul'}</div>
                      </div>
                    </div>
                    <span className="shrink-0 text-sm font-semibold">{o.price === 0 ? 'Gratis' : rupiah(o.price)}</span>
                  </label>
                ))}
              </div>
            )}
          </Step>

          {/* 3 · Payment */}
          <Step n={3} title="Metode pembayaran">
            {!ready ? (
              <p className="text-sm text-muted">Lengkapi alamat & pengiriman untuk melihat metode bayar.</p>
            ) : methods.isLoading ? (
              <Spinner />
            ) : (methods.data?.methods.length ?? 0) === 0 ? (
              <p className="text-sm text-muted">{methods.data?.note ?? 'Metode pembayaran belum tersedia.'}</p>
            ) : (
              <PaymentList
                methods={methods.data!.methods}
                selected={paymentCode}
                onSelect={setPaymentCode}
              />
            )}
          </Step>

          {/* 4 · Coupon + note */}
          <Step n={4} title="Kupon & catatan">
            <div className="space-y-4">
              <div className="flex gap-2">
                <CouponInput value={couponCode} onChange={setCouponCode} placeholder="Kode promo" />
                <Button variant="secondary" onClick={() => quote.refetch()}>
                  Terapkan
                </Button>
              </div>
              {quote.data?.quote.appliedCoupon ? (
                <p className="text-sm text-accent">
                  Kupon “{quote.data.quote.appliedCoupon.code}” aktif — hemat{' '}
                  {rupiah(quote.data.quote.appliedCoupon.discount)}.
                </p>
              ) : null}
              <Field label="Catatan untuk penjual (opsional)">
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
              </Field>
            </div>
          </Step>
        </div>

        {/* Summary */}
        <aside className="h-fit border border-line bg-surface p-5 lg:sticky lg:top-24">
          <h2 className="text-lg">Ringkasan pesanan</h2>
          <ul className="my-4 space-y-3 border-y border-line py-4">
            {cart.lines.map((l) => (
              <li key={l.id} className="flex gap-3 text-sm">
                <div className="w-12 shrink-0">
                  <Media url={l.imageUrl} label={l.productName} aspect="portrait" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="line-clamp-1">{l.productName}</div>
                  <div className="text-xs text-muted">
                    {l.variantLabel} × {l.quantity}
                  </div>
                </div>
                <span>{rupiah(l.lineTotal)}</span>
              </li>
            ))}
          </ul>

          {quote.isLoading && activeAddressId ? (
            <Spinner label="Menghitung total…" />
          ) : (
            <dl className="space-y-1.5 text-sm">
              <Row label="Subtotal" value={rupiah(quote.data?.quote.subtotal ?? cart.subtotal)} />
              {(quote.data?.quote.discount ?? 0) > 0 && (
                <Row label="Diskon" value={'-' + rupiah(quote.data!.quote.discount)} accent />
              )}
              <Row label="Ongkir" value={rupiah(quote.data?.quote.shippingFee ?? 0)} />
              {(quote.data?.quote.paymentFee ?? 0) > 0 && (
                <Row label="Biaya admin" value={rupiah(quote.data!.quote.paymentFee)} />
              )}
              {(quote.data?.quote.taxAmount ?? 0) > 0 && (
                <Row label="Pajak" value={rupiah(quote.data!.quote.taxAmount)} />
              )}
              <div className="flex justify-between border-t border-line pt-2 text-base font-semibold">
                <dt>Total</dt>
                <dd>{rupiah(quote.data?.quote.grandTotal ?? 0)}</dd>
              </div>
            </dl>
          )}

          {quote.data && quote.data.quote.issues.length > 0 ? (
            <div className="mt-3 border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              {quote.data.quote.issues.map((i) => (
                <div key={i}>• {i}</div>
              ))}
            </div>
          ) : null}

          <Button
            className="mt-5 w-full"
            size="lg"
            disabled={!ready || !paymentCode || !quote.data?.ready}
            loading={place.isPending}
            onClick={() => place.mutate()}
          >
            Buat pesanan
          </Button>
          <p className="mt-2 text-center text-xs text-muted">
            Semua harga dihitung ulang di server saat pesanan dibuat.
          </p>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={'flex justify-between ' + (accent ? 'text-accent' : 'text-muted')}>
      <dt>{label}</dt>
      <dd className={accent ? '' : 'text-ink'}>{value}</dd>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="border border-line bg-surface p-5">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink text-xs text-canvas">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function AddressOption({
  address,
  selected,
  onSelect,
}: { address: UserAddress; selected: boolean; onSelect: () => void }) {
  return (
    <label
      className={
        'flex cursor-pointer gap-3 border p-3 ' + (selected ? 'border-ink bg-soft' : 'border-line hover:border-accent')
      }
    >
      <input type="radio" name="addr" checked={selected} onChange={onSelect} className="mt-1" />
      <div className="min-w-0 text-sm">
        <div className="font-medium">
          {address.label} · {address.recipientName}
        </div>
        <div className="break-words text-muted">
          {address.detail}, {address.district}, {address.city}, {address.province} {address.postcode}
        </div>
        <div className="text-muted">{address.phone}</div>
        {address.areaId ? null : (
          <div className="mt-1 text-xs text-amber-700">
            Wilayah belum tertaut Biteship — ongkir mungkin tidak tersedia.
          </div>
        )}
      </div>
    </label>
  );
}

/** Daftar metode bayar; dikelompokkan per `group` (VA, e-wallet, QRIS, dst.) bila ada lebih dari satu grup. */
function PaymentList({
  methods,
  selected,
  onSelect,
}: {
  methods: PaymentMethod[];
  selected: string | null;
  onSelect: (code: string) => void;
}) {
  const groups = new Map<string, PaymentMethod[]>();
  for (const m of methods) {
    const key = (m.group ?? '').toString().trim();
    const bucket = groups.get(key);
    if (bucket) bucket.push(m);
    else groups.set(key, [m]);
  }
  const showHeadings = groups.size > 1;

  return (
    <div className="space-y-5">
      {[...groups.entries()].map(([group, items]) => (
        <div key={group || 'lainnya'}>
          {showHeadings ? <p className="mb-2 text-xs font-medium text-muted">{group || 'Lainnya'}</p> : null}
          <div className="grid gap-2 sm:grid-cols-2">
            {items.map((m) => (
              <PaymentOption key={m.code} method={m} selected={selected === m.code} onSelect={() => onSelect(m.code)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PaymentOption({
  method,
  selected,
  onSelect,
}: { method: PaymentMethod; selected: boolean; onSelect: () => void }) {
  return (
    <label
      className={
        'flex cursor-pointer items-center gap-3 border p-3 text-sm ' +
        (selected ? 'border-ink bg-soft' : 'border-line hover:border-accent')
      }
    >
      <input type="radio" name="pay" checked={selected} onChange={onSelect} />
      <PaymentLogo url={method.icon} name={method.name} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{method.name}</div>
        <div className="text-xs text-muted">{method.fee > 0 ? `Biaya ${rupiah(method.fee)}` : 'Tanpa biaya'}</div>
      </div>
    </label>
  );
}

/** Logo bank/e-wallet dari Duitku; bila kosong atau gagal dimuat tampil tile inisial. */
function PaymentLogo({ url, name }: { url?: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const box = 'flex h-9 w-14 shrink-0 items-center justify-center rounded-(--radius-card) border border-line';

  if (!url || failed) {
    return (
      <span aria-hidden="true" className={box + ' bg-soft text-[11px] font-semibold text-muted'}>
        {name.trim().slice(0, 3).toUpperCase()}
      </span>
    );
  }
  return (
    <span className={box + ' bg-white p-1'}>
      <img
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="max-h-full max-w-full object-contain"
      />
    </span>
  );
}

function CouponInput({
  value,
  onChange,
  placeholder,
}: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value.toUpperCase())}
      placeholder={placeholder}
      className="h-11 min-w-0 flex-1 rounded-(--radius-card) border border-line bg-surface px-3.5 text-sm uppercase focus:border-accent focus:outline-none"
    />
  );
}

export default CheckoutPage;