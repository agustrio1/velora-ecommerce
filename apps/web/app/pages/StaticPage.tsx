import { useQuery } from '@tanstack/react-query';
import { ROUTES, type StaticPage as StaticPageType } from '@velora/shared';
import { useEffect } from 'react';
import { type LoaderFunctionArgs, type MetaFunction, useLoaderData, useMatches, useParams } from 'react-router';
import { Spinner } from '../components/ui';
import { api } from '../lib/api';
import { brandTitle, metaText, pageMeta, siteHead } from '../lib/seo';
import { internalApi } from '../services/api.server';
import { cloudflareEnv } from '../services/cloudflare.server';
import { NotFoundPage } from './NotFound';

/** CMS pages are server-rendered so their content is crawlable. */
export async function loader({ params, context }: LoaderFunctionArgs) {
  const slug = params.slug ?? '';
  if (!slug) return { page: null };
  const env = cloudflareEnv(context);
  try {
    return { page: await internalApi<StaticPageType>(`/api/pages/${encodeURIComponent(slug)}`, env) };
  } catch {
    return { page: null };
  }
}

/** Title comes from the row itself, so the tab is right in the first HTML byte. */
export const meta: MetaFunction<typeof loader> = ({ loaderData, matches, params, location }) => {
  const head = siteHead(matches);
  const page = loaderData?.page;
  const slug = params.slug ?? '';
  if (!page) {
    return pageMeta({
      head,
      title: brandTitle('Halaman tidak ditemukan', head.site),
      description: `Halaman yang Anda cari tidak tersedia di ${head.site}.`,
      path: location.pathname,
      robots: 'noindex, follow',
    });
  }
  return pageMeta({
    head,
    title: brandTitle(page.metaTitle?.trim() || page.title, head.site),
    description:
      metaText(page.metaDescription, 155) ||
      metaText(page.content, 155) ||
      head.seo?.defaultDescription?.trim() ||
      brandTitle(page.title, head.site),
    path: ROUTES.page(slug),
    type: 'article',
  });
};

export function StaticPageView() {
  const { slug = '' } = useParams();
  const { page: initial } = useLoaderData<typeof loader>();
  const matches = useMatches();
  const page = useQuery<StaticPageType>({
    queryKey: ['page', slug],
    queryFn: () => api.get<StaticPageType>(`/pages/${slug}`, undefined, { anonymous: true }),
    initialData: initial ?? undefined,
    retry: 0,
  });

  // Only when the SSR loader missed but the browser caught up: the rendered head
  // has no title for this page yet, so sync the tab with the content being shown.
  useEffect(() => {
    if (initial || !page.data) return;
    document.title = brandTitle(page.data.metaTitle?.trim() || page.data.title, siteHead(matches).site);
  }, [initial, page.data, matches]);

  if (page.isLoading)
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <Spinner />
      </div>
    );
  if (!page.data) return <NotFoundPage />;

  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <h1 className="text-3xl sm:text-4xl">{page.data.title}</h1>
      <div
        className="prose-editorial mt-6"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: admin-authored content, sanitized by the Worker on save
        dangerouslySetInnerHTML={{ __html: page.data.content }}
      />
    </article>
  );
}

export default StaticPageView;
