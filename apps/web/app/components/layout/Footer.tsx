import { ROUTES } from '@velora/shared';
import { Link } from 'react-router';
import { useCategories, useConfig } from '../../hooks/useStore';

export function Footer() {
  const { data: categories } = useCategories();
  const { data: config } = useConfig();

  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:grid-cols-2 sm:px-6 lg:grid-cols-4">
        <div>
          <div className="font-display text-lg tracking-[0.2em]">VELORA</div>
          <p className="mt-3 max-w-xs text-sm text-muted">
            Busana modern bergaya editorial. Harga jujur, bahan pilihan, pengiriman ke seluruh Indonesia.
          </p>
        </div>

        <div>
          <div className="eyebrow mb-3">Belanja</div>
          <ul className="space-y-2 text-sm">
            <li>
              <Link to={ROUTES.catalog} className="hover:text-accent">
                Semua Produk
              </Link>
            </li>
            {(categories ?? []).slice(0, 5).map((c) => (
              <li key={c.id}>
                <Link to={ROUTES.category(c.slug)} className="hover:text-accent">
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="eyebrow mb-3">Bantuan</div>
          <ul className="space-y-2 text-sm">
            <li>
              <Link to="/halaman/pengiriman" className="hover:text-accent">
                Pengiriman
              </Link>
            </li>
            <li>
              <Link to="/halaman/pengembalian" className="hover:text-accent">
                Pengembalian
              </Link>
            </li>
            <li>
              <Link to={ROUTES.page('tentang-kami')} className="hover:text-accent">
                Tentang kami
              </Link>
            </li>
            <li>
              <Link to={ROUTES.page('faq')} className="hover:text-accent">
                FAQ
              </Link>
            </li>
            <li>
              <Link to={ROUTES.page('hubungi-kami')} className="hover:text-accent">
                Hubungi kami
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <div className="eyebrow mb-3">Layanan Pelanggan</div>
          <ul className="space-y-2 text-sm text-muted">
            {config?.whatsapp ? (
              <li>
                WhatsApp:{' '}
                <a href={`https://wa.me/${config.whatsapp.replace(/\D/g, '')}`} className="text-ink hover:text-accent">
                  {config.whatsapp}
                </a>
              </li>
            ) : null}
            {config?.email ? (
              <li>
                Email:{' '}
                <a href={`mailto:${config.email}`} className="text-ink hover:text-accent">
                  {config.email}
                </a>
              </li>
            ) : null}
          </ul>
        </div>
      </div>

      <div className="border-t border-line py-5 text-center text-xs text-muted">
        © {new Date().getFullYear()} VELORA. Semua harga dalam Rupiah dan dihitung di server.
      </div>
    </footer>
  );
}
