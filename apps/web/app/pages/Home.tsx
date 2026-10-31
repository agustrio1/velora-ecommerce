import { useQuery } from '@tanstack/react-query';
import { type HomePagePayload, ROUTES } from '@velora/shared';
import { Link, type LoaderFunctionArgs, type MetaFunction, useLoaderData } from 'react-router';
import { Media } from '../components/Media';
import { NewsletterForm } from '../components/NewsletterForm';
import { ProductCard } from '../components/ProductCard';
import { Button } from '../components/ui';
import { api } from '../lib/api';
import { absoluteUrl, homeDescription, homeTitle, pageMeta, siteHead } from '../lib/seo';
import { internalApi } from '../services/api.server';
import { cloudflareEnv } from '../services/cloudflare.server';

const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent';

/** Home data is server-rendered so the hero and collections ship in the HTML. */
export async function loader({ context }: LoaderFunctionArgs) {
  const env = cloudflareEnv(context);
  const home = await internalApi<HomePagePayload>('/api/home', env);
  return { home };
}

/**
 * The homepage owns the store's most valuable keywords, so it never falls back
 * to the site-wide title: the admin override wins, otherwise the head is built
 * from the hero and category links that are actually on the page. A route that
 * exports `meta` replaces the root head, so the whole set is built here.
 */
export const meta: MetaFunction<typeof loader> = ({ loaderData, matches }) => {
  const head = siteHead(matches);
  const home = loaderData?.home;
  const heroImage = absoluteUrl(home?.hero?.imageUrl ?? home?.heroSecondary?.imageUrl ?? null, head.base);
  return pageMeta({
    head,
    title: homeTitle(head.seo, home, head.site),
    description: homeDescription(head.seo, home, head.site),
    path: ROUTES.home,
    image: heroImage ?? head.image,
  });
};

export function HomePage() {
  const { home } = useLoaderData<typeof loader>();
  const { data } = useQuery({
    queryKey: ['home'],
    queryFn: () => api.get<HomePagePayload>('/home', undefined, { anonymous: true }),
    initialData: home,
  });

  if (!data) {
    return <div className="mx-auto max-w-6xl px-4 py-16 text-center text-muted sm:px-6">Menyiapkan koleksi…</div>;
  }

  const hero = data.hero;
  const heroImage = hero?.imageUrl ?? data.heroSecondary?.imageUrl ?? null;
  // Gambar kedua hanya dipakai sebagai inset kalau hero punya gambar sendiri.
  const insetImage = hero?.imageUrl ? (data.heroSecondary?.imageUrl ?? null) : null;
  const visibleSections = data.sections.filter(({ products }) => products.length > 0);

  return (
    <div>
      {data.announcement ? (
        <div className="bg-ink py-2 text-center text-xs tracking-wide text-canvas">{data.announcement}</div>
      ) : null}

      {/* Hero */}
      <section className="border-b border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 pb-14 pt-10 sm:px-6 lg:grid-cols-12 lg:items-end lg:gap-12 lg:pb-24 lg:pt-16">
          <div className="lg:col-span-6 lg:pb-4">
            {hero?.eyebrow ? <p className="mb-4 text-sm font-medium text-accent">{hero.eyebrow}</p> : null}
            <h1 className="text-5xl leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
              {hero?.title ?? 'Busana modern, dibuat jujur.'}
            </h1>
            <p className="mt-6 max-w-md text-base leading-relaxed text-muted">
              {hero?.subtitle ?? 'Koleksi pilihan dengan material berkualitas dan harga yang transparan.'}
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to={ROUTES.catalog} className={focusRing}>
                <Button size="lg">Belanja sekarang</Button>
              </Link>
              {hero?.ctaHref ? (
                <Link to={hero.ctaHref} className={focusRing}>
                  <Button size="lg" variant="secondary">
                    {hero.ctaLabel ?? 'Lihat koleksi'}
                  </Button>
                </Link>
              ) : null}
            </div>

            {data.categories.length ? (
              <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-5 text-sm">
                <span className="text-muted">Cari cepat</span>
                {data.categories.slice(0, 4).map((c) => (
                  <Link
                    key={c.id}
                    to={ROUTES.category(c.slug)}
                    className={`underline decoration-line underline-offset-4 transition-colors hover:text-accent hover:decoration-accent ${focusRing}`}
                  >
                    {c.name}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>

          <div className="relative lg:col-span-6">
            <Media url={heroImage} label="VELORA Editorial" aspect="portrait" />
            {insetImage ? (
              <div className="absolute -bottom-6 -left-6 hidden w-1/3 rounded-(--radius-card) border-[6px] border-surface lg:block">
                <Media url={insetImage} alt="" label="VELORA" aspect="tall" />
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* Categories */}
      {data.categories.length ? (
        <section className="mx-auto max-w-6xl px-4 pb-6 pt-16 sm:px-6">
          <h2 className="mb-6 text-3xl tracking-tight sm:text-4xl">Belanja per kategori</h2>
          <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 lg:grid-cols-6 [&::-webkit-scrollbar]:hidden">
            {data.categories.slice(0, 6).map((c) => (
              <Link
                key={c.id}
                to={ROUTES.category(c.slug)}
                className={`group w-[46%] shrink-0 snap-start sm:w-auto ${focusRing}`}
              >
                <Media url={c.imageUrl} label={c.name} aspect="tall" />
                <div className="mt-3 text-sm font-medium underline decoration-transparent underline-offset-4 transition-colors group-hover:decoration-accent">
                  {c.name}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {/* Dynamic sections: yang pertama memakai judul di samping, sisanya judul di atas */}
      {visibleSections.map(({ section, products }, index) =>
        index === 0 ? (
          <section key={section.id} className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <div className="grid gap-8 lg:grid-cols-[15rem_1fr] lg:gap-12">
              <div className="lg:sticky lg:top-24 lg:self-start">
                <h2 className="text-3xl tracking-tight sm:text-4xl">{section.title ?? 'Koleksi'}</h2>
                <Link
                  to={ROUTES.catalog}
                  className={`mt-4 inline-block text-sm underline decoration-line underline-offset-4 transition-colors hover:text-accent hover:decoration-accent ${focusRing}`}
                >
                  Lihat semua produk
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3">
                {products.slice(0, 6).map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            </div>
          </section>
        ) : (
          <section key={section.id} className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
            <div className="mb-6 flex items-end justify-between gap-4">
              <h2 className="text-3xl tracking-tight sm:text-4xl">{section.title ?? 'Koleksi'}</h2>
              <Link
                to={ROUTES.catalog}
                className={`shrink-0 text-sm underline decoration-line underline-offset-4 transition-colors hover:text-accent hover:decoration-accent ${focusRing}`}
              >
                Lihat semua
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-10 sm:grid-cols-3 lg:grid-cols-4">
              {products.slice(0, 8).map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        ),
      )}

      {/* Brand story */}
      {data.brandStory ? (
        <section className="mt-10 border-y border-line bg-surface">
          <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-14 sm:px-6 lg:grid-cols-12 lg:gap-14 lg:py-20">
            <div className="lg:order-2 lg:col-span-5">
              <h2 className="text-3xl leading-tight tracking-tight sm:text-4xl">{data.brandStory.title}</h2>
              <p className="mt-5 max-w-prose text-base leading-relaxed text-muted">{data.brandStory.body}</p>
            </div>
            <div className="lg:order-1 lg:col-span-7">
              <Media url={data.brandStory.imageUrl} label={data.brandStory.title} aspect="wide" />
            </div>
          </div>
        </section>
      ) : null}

      {/* Newsletter */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-20">
        <div className="grid items-center gap-6 lg:grid-cols-2 lg:gap-12">
          <div>
            <h2 className="text-3xl tracking-tight sm:text-4xl">Kabar koleksi baru, lebih awal</h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
              Koleksi baru dan promo terpilih langsung ke email Anda.
            </p>
          </div>
          <NewsletterForm />
        </div>
      </section>
    </div>
  );
}

export default HomePage;
