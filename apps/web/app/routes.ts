import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

export default [
  // ─── Storefront (SSR) ───
  layout('components/layout/StoreLayout.tsx', [
    index('pages/Home.tsx'),
    route('katalog', 'pages/Catalog.tsx'),
    route('kategori/:slug', 'pages/Category.tsx'),
    route('produk/:slug', 'pages/Product.tsx'),
    // Path harus sama persis dengan ROUTES di @velora/shared — semua tautan
    // internal dibangun dari map itu, jadi beda path berarti halaman jadi 404.
    route('keranjang', 'pages/Cart.tsx'),
    route('wishlist', 'pages/Wishlist.tsx'),
    route('halaman/:slug', 'pages/StaticPage.tsx'),

    // Auth
    route('masuk', 'pages/auth/Login.tsx'),
    route('daftar', 'pages/auth/Register.tsx'),
    route('lupa-sandi', 'pages/auth/Forgot.tsx'),

    // Customer area (auth-gated via loader)
    route('checkout', 'pages/Checkout.tsx'),
    route('pembayaran/:code', 'pages/OrderResult.tsx'),
    route('akun/pesanan', 'pages/account/Orders.tsx'),
    route('akun/pesanan/:code', 'pages/account/OrderDetail.tsx'),
    route('akun', 'pages/account/Profile.tsx'),
    route('akun/bantuan', 'pages/account/SupportChat.tsx'),

    // 404 catch-all
    route('*', 'pages/NotFound.tsx'),
  ]),

  // ─── Admin (client-only, no SSR data) ───
  route('admin', 'components/layout/AdminLayout.tsx', [
    index('pages/admin/Dashboard.tsx'),
    route('produk', 'pages/admin/Products.tsx'),
    route('produk/baru', 'pages/admin/ProductEditor.tsx', { id: 'admin-product-new' }),
    route('produk/:id', 'pages/admin/ProductEditor.tsx'),
    route('kategori', 'pages/admin/Categories.tsx'),
    route('kategori/baru', 'pages/admin/CategoryEditor.tsx', { id: 'admin-category-new' }),
    route('kategori/:id', 'pages/admin/CategoryEditor.tsx'),
    route('inventaris', 'pages/admin/Inventory.tsx'),
    route('pesanan', 'pages/admin/Orders.tsx'),
    route('pesanan/:code', 'pages/admin/AdminOrderDetail.tsx'),
    route('pelanggan', 'pages/admin/Customers.tsx'),
    route('pelanggan/:id', 'pages/admin/CustomerDetail.tsx'),
    route('promo', 'pages/admin/Coupons.tsx'),
    route('promo/baru', 'pages/admin/CouponEditor.tsx', { id: 'admin-coupon-new' }),
    route('promo/:id', 'pages/admin/CouponEditor.tsx'),
    route('ulasan', 'pages/admin/Reviews.tsx'),
    route('konten', 'pages/admin/Content.tsx'),
    route('konten/banner/baru', 'pages/admin/content/BannerEditor.tsx', { id: 'admin-banner-new' }),
    route('konten/banner/:id', 'pages/admin/content/BannerEditor.tsx'),
    route('konten/halaman/baru', 'pages/admin/content/PageEditor.tsx', { id: 'admin-page-new' }),
    route('konten/halaman/:id', 'pages/admin/content/PageEditor.tsx'),
    route('konten/faq/baru', 'pages/admin/content/FaqEditor.tsx', { id: 'admin-faq-new' }),
    route('konten/faq/:id', 'pages/admin/content/FaqEditor.tsx'),
    route('chat', 'pages/admin/Chat.tsx'),
    route('laporan', 'pages/admin/Reports.tsx'),
    // Super-admin only: role assignment for other accounts (see components/admin/nav.ts).
    route('pengguna', 'pages/admin/Users.tsx'),
    route('pengaturan', 'pages/admin/Settings.tsx'),
  ]),
] satisfies RouteConfig;
