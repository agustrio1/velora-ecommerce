import { ROUTES } from '@velora/shared';
import { Link, type LoaderFunction, type MetaFunction, data } from 'react-router';
import { Button } from '../components/ui';
import { brandTitle, pageMeta, siteHead } from '../lib/seo';

/**
 * The catch-all route must answer 404, not 200: crawlers and the PWA install
 * check rely on the status code, and a soft 200 makes every typo look real.
 */
export const loader: LoaderFunction = () => data(null, { status: 404 });

/** A soft 404 must not inherit the storefront title either. */
export const meta: MetaFunction<typeof loader> = ({ matches, location }) => {
  const head = siteHead(matches);
  return pageMeta({
    head,
    title: brandTitle('Halaman tidak ditemukan', head.site),
    description: `Halaman yang Anda cari tidak tersedia di ${head.site}.`,
    path: location.pathname,
    robots: 'noindex, follow',
  });
};

export function NotFoundPage() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <span className="eyebrow">404</span>
      <h1 className="mt-2 font-display text-4xl">Halaman tidak ditemukan</h1>
      <p className="mt-3 text-muted">Tautan yang Anda buka mungkin sudah berpindah atau memang belum ada.</p>
      <div className="mt-6 flex gap-3">
        <Link to={ROUTES.home}>
          <Button>Kembali ke toko</Button>
        </Link>
        <Link to={ROUTES.catalog}>
          <Button variant="secondary">Lihat katalog</Button>
        </Link>
      </div>
    </div>
  );
}

export default NotFoundPage;
