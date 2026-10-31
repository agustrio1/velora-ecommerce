import { ROUTES } from '@velora/shared';
import { type LoaderFunctionArgs, type MetaFunction, useParams } from 'react-router';
import { catalogCategoryName, catalogHeadData, catalogMeta, isFilteredCatalog, siteHead } from '../lib/seo';
import { loadCatalog } from '../services/catalog.server';
import { CatalogPage } from './Catalog';

/** Same catalog data, scoped to the category in the URL. */
export async function loader({ request, params, context }: LoaderFunctionArgs) {
  return loadCatalog(request, params.slug, context);
}

/** A category page competes on its own keywords, so it gets its own head. */
export const meta: MetaFunction<typeof loader> = ({ loaderData, matches, params, location }) => {
  const head = siteHead(matches);
  const slug = params.slug ?? '';
  const search = new URLSearchParams(location.search);
  return catalogMeta({
    head,
    ...catalogHeadData(loaderData?.data),
    path: ROUTES.category(slug),
    category: slug ? catalogCategoryName(loaderData?.data, slug) : null,
    q: search.get('q'),
    filtered: isFilteredCatalog(search),
  });
};

/** `/kategori/:slug` reuses the catalog grid, scoped to one category. */
export function CategoryPage() {
  const { slug = '' } = useParams();
  return <CatalogPage categorySlug={slug} />;
}

export default CategoryPage;
