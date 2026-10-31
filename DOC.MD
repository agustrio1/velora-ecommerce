# MASTER PROMPT — FULL PRODUCTION-READY FASHION E-COMMERCE
## Cloudflare Serverless + Firebase + Duitku + Biteship + Bun

---

# ROLE DAN TANGGUNG JAWAB

Bertindak sebagai Senior Software Architect, Senior Full-Stack Engineer, Database Architect, UI/UX Designer, Security Engineer, DevOps Engineer, dan QA Engineer.

Bangun aplikasi e-commerce toko pakaian yang profesional, lengkap, scalable, aman, dan siap dipersiapkan untuk production.

Aplikasi bukan sekadar UI demo, landing page, atau mini e-commerce.

Target aplikasi adalah online fashion store dengan sistem transaksi nyata, katalog produk, variasi ukuran dan warna, inventory management, checkout, pembayaran otomatis, pengiriman, notifikasi, live chat, dan admin dashboard lengkap.

Kamu diperbolehkan melakukan pekerjaan secara langsung:

- Membaca seluruh source code project.
- Membuat, mengedit, memindahkan, dan menghapus file.
- Menjalankan terminal PowerShell.
- Menginstal dan menghapus dependency jika diperlukan.
- Menggunakan Bun sebagai package manager utama.
- Menjalankan database migrations.
- Menjalankan database seeding.
- Menjalankan development server.
- Menjalankan automated tests.
- Menjalankan lint dan type checking.
- Melakukan build production.
- Memperbaiki error secara langsung.
- Melakukan refactoring.
- Mengatur Cloudflare dan Firebase.
- Melakukan deployment setelah konfigurasi tersedia.

Jangan hanya memberikan tutorial atau contoh kode. Lakukan implementasi langsung.

Jika membutuhkan credential yang belum tersedia, buat integrasi menggunakan environment variables dan sandbox mode. Jangan membuat credential palsu.

---

# 1. MASTER ARCHITECTURE

Gunakan diagram arsitektur yang diberikan sebagai referensi utama.

Pertahankan konsep 100% serverless cloud tanpa VPS, Docker, Nginx, maupun server database tradisional.

Gunakan kombinasi Cloudflare dan Firebase dengan pembagian fungsi yang jelas.

## A. Frontend

- React.
- TypeScript.
- Vite.
- Tailwind CSS.
- React Router.
- TanStack Query.
- React Hook Form.
- Zod.
- Lucide React.
- Firebase JavaScript SDK Modular.

## B. Backend

- Cloudflare Workers.
- Hono Framework.
- TypeScript.
- REST API.
- Bun untuk development dan package management.

## C. Database

Cloudflare D1:
- SQLite.
- Relational database.
- Database migrations.
- Indexing.
- Transaction management.

## D. Object Storage

Cloudflare R2:
- Product images.
- Product variant images.
- Homepage banners.
- Editorial images.
- Category images.
- Other media files.

## E. Authentication

Firebase Authentication:
- Email/password.
- Google login.
- Password reset.
- Email verification.
- Firebase UID.
- Firebase ID Token.

## F. Real-time

Firebase Realtime Database:
- Customer support chat.
- Admin chat.
- Typing indicators.
- Online/offline presence.
- Read receipts.
- Realtime message updates.

## G. Push Notifications

Firebase Cloud Messaging:
- Order notification.
- Payment notification.
- Shipping notification.
- Promotional notification.
- Admin notification.

## H. Payment Gateway

Duitku:
- QRIS.
- Virtual Account.
- E-wallet.
- Bank transfer.
- Other active payment channels.

Jangan menggunakan Midtrans.

## I. Shipping API

Biteship:
- Search area.
- Shipping rate.
- Courier services.
- Create shipping order.
- Tracking.
- Webhook.

## J. Hosting

- Cloudflare Workers Static Assets.
- Cloudflare Edge Network.
- Custom Domain.
- HTTPS.
- Global CDN.
- Cloudflare WAF.

Gunakan arsitektur Workers Static Assets untuk aplikasi baru, bukan mengharuskan frontend dan backend berada di dua deployment yang terpisah.

Pastikan konfigurasi Vite dan Wrangler sesuai dengan dokumentasi Cloudflare terbaru.

## Arsitektur komunikasi

CUSTOMER:
Browser → Cloudflare Edge → React Storefront → Cloudflare Workers API.

ADMIN:
Browser → Cloudflare Edge → React Admin → Cloudflare Workers API.

AUTHENTICATION:
React → Firebase Authentication → Firebase ID Token → Cloudflare Workers → Token Verification → D1 User Mapping.

BUSINESS LOGIC:
Cloudflare Workers → Hono → Services → Cloudflare D1.

MEDIA:
React → Worker Upload Endpoint → Cloudflare R2.

PAYMENT:
Worker → Duitku → Customer Payment → Duitku Callback → Worker → D1.

SHIPPING:
Worker → Biteship → Courier → Biteship Webhook → Worker → D1.

NOTIFICATION:
Worker → Firebase Cloud Messaging → Customer Browser.

REALTIME CHAT:
Customer/Admin → Firebase Realtime Database → Customer/Admin.

---

# 2. ATURAN WAJIB PENGGUNAAN BUN

Gunakan Bun sebagai package manager utama.

Gunakan:
- bun install.
- bun add.
- bun add -d.
- bun remove.
- bun run.
- bunx.
- bun test.

Jangan menggunakan npm, yarn, atau pnpm untuk instalasi dependency.

Jangan menjadikan Node.js sebagai runtime development utama.

Gunakan Wrangler yang kompatibel dengan Bun.

PENTING:

Bun merupakan runtime dan tooling development. Production backend berjalan pada Cloudflare Workers Runtime.

Pastikan seluruh dependency backend kompatibel dengan Cloudflare Workers dan Web APIs.

Jangan menggunakan API khusus Bun yang tidak tersedia di Cloudflare Workers production.

Jangan menggunakan package yang membutuhkan native binary atau Node.js filesystem API pada runtime Worker jika tidak didukung.

---

# 3. DESIGN SYSTEM DAN UI/UX

Bangun toko pakaian dengan gaya:

- Modern fashion editorial.
- Premium minimalist.
- Clean commercial fashion.
- Contemporary clothing brand.
- Professional online store.

Desain harus terasa seperti toko fashion sungguhan, bukan template AI generator.

## Color palette

Gunakan:

- Background: #F7F6F2.
- White: #FFFFFF.
- Primary text: #191919.
- Secondary text: #777777.
- Border: #E8E6E0.
- Accent: #74634F.
- Muted: #EEECE6.

Warna dapat dikembangkan secara konsisten sesuai kebutuhan brand.

## Typography

Gunakan kombinasi typography modern yang cocok untuk fashion editorial.

Utamakan:
- Strong heading hierarchy.
- Readable body text.
- Clean navigation.
- Consistent font sizes.

## Larangan visual

DILARANG menggunakan:

- Gradient.
- Glow.
- Neon.
- Glassmorphism.
- Excessive shadow.
- Background warna-warni.
- Animasi berlebihan.
- Card berlebihan.
- Border radius berlebihan.
- AI slop.
- Desain dashboard generik.
- Layout yang terlalu padat.

Gunakan:
- Spacing konsisten.
- Border tipis.
- Typography yang jelas.
- Foto produk berkualitas.
- Grid produk rapi.
- Hover effect sederhana.
- Animasi halus dan fungsional.
- Layout editorial.
- White space yang cukup.

## Responsive design

Prioritaskan mobile-first.

Pastikan:
- Mobile header.
- Hamburger menu.
- Mobile category navigation.
- Product grid responsive.
- Product detail responsive.
- Filter drawer.
- Mobile cart.
- Mobile checkout.
- Admin responsive.
- Dashboard tables responsive.

Jangan membuat tampilan mobile sebagai versi desktop yang diperkecil.

---

# 4. CUSTOMER STOREFRONT

## A. Homepage

Buat homepage dengan:

1. Announcement bar.
2. Header.
3. Brand logo.
4. Search.
5. Main navigation.
6. Category navigation.
7. Hero editorial.
8. Featured collection.
9. New arrivals.
10. Best sellers.
11. Promotional section.
12. Recommended products.
13. Brand story.
14. Newsletter.
15. Customer service information.
16. Footer.

Homepage harus dinamis dan dikelola melalui admin.

## B. Product Catalog

Fitur:

- Product listing.
- Category browsing.
- Search products.
- Filter by category.
- Filter by brand.
- Filter by size.
- Filter by color.
- Filter by price.
- Filter by stock.
- Sorting by latest.
- Sorting by price.
- Sorting by popularity.
- Sorting by best seller.
- Pagination.
- Load more.

Gunakan query database yang benar.

Jangan hanya memfilter data di frontend.

## C. Product Detail

Setiap produk mempunyai:

- Product name.
- Slug.
- SKU.
- Description.
- Normal price.
- Sale price.
- Discount.
- Product images.
- Product gallery.
- Category.
- Brand.
- Material.
- Size guide.
- Weight.
- Dimensions.
- Colors.
- Sizes.
- Variant availability.
- Stock.
- Related products.
- Reviews.

## D. Fashion Variant System

Fitur varian wajib dibuat dengan sistem relational.

Contoh:

Produk: Oversized Cotton T-Shirt.

Warna:
- Black.
- White.
- Cream.
- Navy.

Ukuran:
- S.
- M.
- L.
- XL.
- XXL.

Kombinasi:

- Black / S.
- Black / M.
- Black / L.
- White / S.
- White / M.
- White / L.

Setiap kombinasi memiliki:
- Variant ID.
- SKU unik.
- Color ID.
- Size ID.
- Price.
- Stock.
- Weight.
- Status.
- Optional image.

Jangan menggunakan satu stok untuk seluruh variasi produk.

Setiap kombinasi harus memiliki stok sendiri.

Ketika customer memilih warna dan ukuran, tampilkan kombinasi varian yang benar.

Jika stok habis, customer tidak dapat menambahkannya ke cart.

## E. Shopping Cart

- Add to cart.
- Remove item.
- Update quantity.
- Update size.
- Update color.
- Subtotal.
- Discount.
- Cart persistence.
- Stock validation.
- Cart badge.

Validasi ulang semua produk dan varian di backend.

## F. Wishlist

- Add wishlist.
- Remove wishlist.
- Wishlist page.
- Login requirement.
- Product availability.

## G. Customer Profile

- Profile information.
- Name.
- Email.
- Phone.
- Profile photo.
- Address book.
- Change password melalui Firebase Authentication.
- Order history.
- Wishlist.
- Notification preferences.

## H. Customer Authentication

Gunakan Firebase Authentication.

Implementasikan:
- Register.
- Login.
- Google login.
- Logout.
- Forgot password.
- Password reset.
- Email verification.
- Auth state persistence.
- Firebase ID Token refresh.

Buat route protection untuk customer dan admin.

Jangan mempercayai role dari localStorage atau frontend.

---

# 5. FIREBASE INTEGRATION

Firebase wajib digunakan sesuai pembagian tanggung jawab berikut.

## A. Firebase Authentication

Gunakan Firebase JS SDK Modular.

Dokumentasi:
https://firebase.google.com/docs/auth/web/start

Metode:
- Email/password.
- Google sign-in.
- Password reset.
- Email verification.

Setiap user mempunyai Firebase UID.

Hubungkan UID dengan users table pada D1.

Backend wajib memverifikasi Firebase ID Token.

Dokumentasi:
https://firebase.google.com/docs/auth/admin/verify-id-tokens

Gunakan jose atau library JWT lain yang kompatibel dengan Workers.

Verifikasi:
- Signature RS256.
- Key ID.
- Expiration.
- Issuer.
- Audience.
- Subject.
- Firebase Project ID.

Gunakan public key Firebase resmi dan cache berdasarkan HTTP Cache-Control.

Jangan menerima token yang tidak valid.

Jangan menggunakan Firebase Admin SDK tanpa memastikan kompatibilitas Cloudflare Workers.

Role customer dan admin dikelola oleh backend serta database D1.

Firebase Authentication tidak otomatis memberikan hak admin.

## B. Firebase Cloud Messaging

Dokumentasi:
https://firebase.google.com/docs/cloud-messaging/web/get-started

Implementasikan Web Push Notification.

Fitur:
- Order created.
- Payment successful.
- Payment failed.
- Order processing.
- Order shipped.
- Shipping updated.
- Order completed.
- Promotional notification.
- Admin alert.

Gunakan:
- Firebase Messaging SDK.
- Service worker.
- VAPID key.
- Notification permission.
- Device token registration.
- Token storage.
- Token cleanup.
- Notification preferences.

Backend mengirim notifikasi melalui FCM HTTP v1 API.

Gunakan service account dan OAuth2 access token sesuai dokumentasi resmi.

Service account private key hanya berada di Cloudflare Worker Secrets.

Jangan mengirim notifikasi payment successful sebelum pembayaran benar-benar terverifikasi.

## C. Firebase Realtime Database

Dokumentasi:
https://firebase.google.com/docs/database/web/start

Gunakan untuk:

1. Customer live chat.
2. Admin live chat.
3. Typing indicators.
4. Online presence.
5. Offline presence.
6. Read receipts.
7. Realtime messages.

Struktur data yang disarankan:

/chats/{chatId}
/chatMessages/{chatId}/{messageId}
/presence/{userId}
/typing/{chatId}/{userId}
/userNotifications/{userId}/{notificationId}

Gunakan Firebase Realtime Database Security Rules.

Pastikan:
- Customer hanya dapat membaca chat miliknya.
- Customer tidak dapat membaca chat customer lain.
- Admin dapat membaca chat sesuai role.
- Pesan tidak dapat dimanipulasi user lain.
- Presence tidak dapat digunakan untuk mengakses data privat.

Jika perlu backend access, gunakan REST API atau metode yang kompatibel dengan Workers.

Jangan membuat dua sumber data utama untuk transaksi.

## D. Firebase Responsibilities

Firebase Auth = Identity.

Firebase FCM = Push notifications.

Firebase Realtime Database = Realtime communication.

Cloudflare D1 = Transactional business database.

Cloudflare R2 = File storage.

Jangan menggunakan Firebase sebagai pengganti D1.

---

# 6. CHECKOUT DAN ORDER MANAGEMENT

Buat proses checkout yang sederhana tetapi lengkap.

Alur:

1. Customer memilih produk.
2. Customer memilih ukuran.
3. Customer memilih warna.
4. Customer menambahkan ke cart.
5. Customer memilih alamat pengiriman.
6. Customer memilih layanan kurir.
7. Backend mengambil ongkir.
8. Customer memilih payment method.
9. Backend menghitung total.
10. Backend membuat order.
11. Backend membuat payment request.
12. Customer menyelesaikan pembayaran.
13. Payment callback diverifikasi.
14. Order diproses.
15. Shipping order dibuat.
16. Tracking diperbarui.
17. Customer menerima notifikasi.

Tampilkan:
- Product subtotal.
- Discount.
- Shipping fee.
- Payment fee jika ada.
- Grand total.

Semua nominal dihitung di backend.

Jangan mempercayai total harga dari frontend.

Gunakan integer untuk Rupiah.

---

# 7. DUITKU PAYMENT GATEWAY

Gunakan Duitku.

JANGAN menggunakan Midtrans.

Dokumentasi resmi:

https://docs.duitku.com/api/id/

## Payment methods

Gunakan channel yang aktif pada akun merchant:

- QRIS.
- Virtual Account.
- E-wallet.
- Bank transfer.
- Retail outlet jika tersedia.
- Metode lain yang diaktifkan.

Gunakan Get Payment Method API untuk mengambil metode pembayaran aktif.

Jangan hardcode semua payment channels sebagai metode yang pasti tersedia.

## API endpoints

Get Payment Method:

POST
https://passport.duitku.com/webapi/api/merchant/paymentmethod/getpaymentmethod

Sandbox:
https://sandbox.duitku.com/webapi/api/merchant/paymentmethod/getpaymentmethod

Create Transaction:

POST
https://passport.duitku.com/webapi/api/merchant/v2/inquiry

Sandbox:
https://sandbox.duitku.com/webapi/api/merchant/v2/inquiry

Transaction Status:

POST
https://passport.duitku.com/webapi/api/merchant/transactionStatus

Sandbox:
https://sandbox.duitku.com/webapi/api/merchant/transactionStatus

Selalu verifikasi detail request dan response berdasarkan dokumentasi resmi terbaru.

## Payment flow

1. Backend memvalidasi order.
2. Backend menghitung total.
3. Backend menyimpan order pending.
4. Backend membuat merchantOrderId unik.
5. Backend membuat signature.
6. Backend mengirim request ke Duitku.
7. Backend menyimpan reference dan payment details.
8. Customer diarahkan ke paymentUrl.
9. Duitku mengirim callback.
10. Backend memverifikasi callback.
11. Backend memeriksa transaksi melalui Transaction Status API.
12. Backend memperbarui payment status.
13. Backend memproses order jika pembayaran terkonfirmasi.

## Signature

Ikuti formula resmi dan bedakan signature request dengan signature callback.

Untuk request transaksi:

stringToSign =
merchantCode + merchantOrderId + paymentAmount

signature =
HMAC_SHA256(stringToSign, apiKey)

Untuk callback:

stringToSign =
merchantCode + amount + merchantOrderId

signature =
HMAC_SHA256(stringToSign, apiKey)

Jangan menukar urutan parameter kedua formula.

Jangan menggunakan MD5 lama yang sudah obsolete.

Gunakan constant-time comparison jika tersedia.

## Payment security

Implementasikan:

- Unique merchantOrderId.
- Signature validation.
- Amount validation.
- Merchant validation.
- Transaction status verification.
- Duplicate callback protection.
- Idempotency.
- Payment expiration.
- Pending handling.
- Failed handling.
- Transaction logs.

Return URL tidak boleh menjadi bukti pembayaran berhasil.

Status paid hanya boleh diberikan setelah proses verifikasi backend.

---

# 8. BITESHIP SHIPPING INTEGRATION

Gunakan Biteship.

Dokumentasi resmi:

https://biteship.com/en/docs/api/

## A. Authentication

Base URL:

https://api.biteship.com

Gunakan API token Biteship.

Ikuti format header Authorization yang tercantum dalam dokumentasi resmi.

Dokumentasi:
https://biteship.com/en/docs/api/authentication

Simpan token di Cloudflare Worker Secrets.

Jangan menaruh token pada frontend.

Gunakan staging/testing token selama development.

Perhatikan bahwa aktivasi Order API production dapat memerlukan aktivasi akun dari Biteship.

## B. Search Area

Endpoint:

GET /v1/maps/areas

Dokumentasi:
https://biteship.com/en/docs/api/maps/search_area

Gunakan untuk:
- Area autocomplete.
- Destination.
- Origin.
- Area ID.
- Shipping address.

Gunakan debounce untuk pencarian.

Jangan melakukan request API pada setiap karakter tanpa pembatasan.

Simpan area ID yang valid jika diperlukan untuk checkout.

## C. Calculate Shipping Rates

Endpoint:

POST /v1/rates/couriers

Dokumentasi:
https://biteship.com/en/docs/api/rates/overview

Gunakan:
- Origin area.
- Destination area.
- Courier list.
- Items.
- Weight.
- Quantity.
- Value.
- Dimensions jika diperlukan.

Berat produk pakaian disimpan dalam gram.

Gunakan item category sesuai dokumentasi Biteship.

Tampilkan:
- Courier company.
- Courier service.
- Courier type.
- Price.
- Delivery estimate.
- Service information.

Jangan membuat ongkir statis.

Jangan mengarang estimasi pengiriman.

Jika API gagal, tampilkan pesan error dan jangan membuat ongkir palsu.

## D. Create Shipping Order

Endpoint:

POST /v1/orders

Dokumentasi:
https://biteship.com/en/docs/api/orders/create

Buat order pengiriman setelah pembayaran terkonfirmasi, kecuali terdapat kebijakan bisnis lain yang memang mendukung alur tersebut.

Gunakan data:
- Origin contact.
- Origin address.
- Destination contact.
- Destination address.
- Courier company.
- Courier type.
- Delivery type.
- Items.
- Weight.
- Shipping insurance jika dipilih.
- Order note.

Validasi ulang layanan dan harga di backend.

Simpan:
- Biteship order ID.
- Tracking number.
- Waybill ID.
- Courier.
- Courier service.
- Shipping cost.
- Shipping status.
- Tracking information.

## E. Tracking

Gunakan tracking API resmi Biteship.

Periksa dokumentasi terbaru untuk endpoint, request, dan response tracking.

Jangan mengarang endpoint tracking.

Implementasikan:
- Tracking lookup.
- Shipping history.
- Delivery status.
- Waybill information.
- Estimated delivery jika tersedia.

## F. Webhook

Dokumentasi:
https://biteship.com/en/docs/api/webhook/overview

Tangani event sesuai dokumentasi resmi, termasuk event yang tersedia seperti:

- order.status.
- order.price.
- order.waybill_id.

Validasi webhook sesuai mekanisme keamanan yang didokumentasikan Biteship.

Implementasikan:
- Event logging.
- Idempotency.
- Duplicate protection.
- Status mapping.
- Price adjustment history.
- Tracking synchronization.

Jangan mengasumsikan format signature atau header webhook.

Periksa dokumentasi resmi terbaru.

---

# 9. ADMIN DASHBOARD

Buat admin dashboard profesional dengan sidebar.

## Dashboard Overview

Tampilkan:

- Total revenue.
- Total orders.
- Pending payments.
- Paid orders.
- Processing orders.
- Shipped orders.
- Completed orders.
- Cancelled orders.
- Total customers.
- Total products.
- Low stock.
- Best selling products.
- Recent transactions.
- Revenue chart.
- Orders chart.

Semua statistik harus berasal dari database.

## Product Management

- Create product.
- Edit product.
- Delete product.
- Product image upload.
- Multiple image upload.
- Product gallery.
- Variant management.
- Color management.
- Size management.
- SKU management.
- Price management.
- Discount management.
- Category management.
- Brand management.
- SEO management.
- Featured products.
- Product status.

## Inventory Management

- Stock per variant.
- Stock adjustment.
- Stock in.
- Stock out.
- Stock history.
- Low stock alerts.
- Inventory movement.
- Stock reservation.
- Inventory report.

Cegah overselling menggunakan conditional updates dan mekanisme transaksi yang sesuai dengan kemampuan D1.

## Order Management

- Order list.
- Order detail.
- Customer detail.
- Ordered items.
- Variant details.
- Payment information.
- Shipping information.
- Order timeline.
- Tracking.
- Cancel order.
- Refund recording.
- Admin notes.

## Customer Management

- Customer list.
- Customer profile.
- Address.
- Order history.
- Customer status.
- Customer statistics.

## Promotion Management

- Coupons.
- Percentage discount.
- Fixed discount.
- Minimum purchase.
- Maximum discount.
- Start/end date.
- Usage limit.
- Per-customer limit.
- Product restriction.
- Category restriction.
- Free shipping voucher.

## Content Management

- Homepage banner.
- Hero section.
- Homepage collections.
- Navigation.
- Categories.
- Brand information.
- About.
- Contact.
- FAQ.
- Size guide.
- Shipping policy.
- Return policy.
- Terms and conditions.

## Reports

- Sales report.
- Revenue report.
- Product report.
- Inventory report.
- Customer report.
- Payment report.
- Shipping report.
- Coupon report.

Sediakan export CSV.

## Store Settings

- Store name.
- Logo.
- Store address.
- WhatsApp.
- Email.
- Social media.
- Shipping origin.
- Duitku configuration.
- Biteship configuration.
- Tax settings.
- Order settings.
- SEO settings.

Jangan menampilkan secret secara terbuka di dashboard.

---

# 10. LIVE CUSTOMER SUPPORT

Gunakan Firebase Realtime Database.

Buat halaman live chat:

Customer:
- Open chat.
- Send message.
- Receive reply.
- Typing status.
- Online status.
- Read status.

Admin:
- Chat inbox.
- Customer details.
- Reply message.
- Chat history.
- Unread count.
- Online indicator.

Gunakan Security Rules yang benar.

Buat admin chat interface yang terintegrasi dengan dashboard.

Jangan membiarkan chat diakses customer lain.

---

# 11. NOTIFICATION SYSTEM

Gunakan Firebase Cloud Messaging.

Notifikasi customer:

- Order created.
- Payment pending.
- Payment success.
- Order processing.
- Order shipped.
- Shipping update.
- Order completed.
- Promotional messages.

Notifikasi admin:

- New order.
- Payment confirmed.
- Low stock.
- New customer.
- Shipping issue.

Tambahkan notification center di dashboard.

Jika FCM belum dikonfigurasi, aplikasi tetap harus dapat berjalan tanpa error.

---

# 12. DATABASE DESIGN — CLOUDFLARE D1

Buat database relational yang lengkap.

Gunakan integer untuk nominal Rupiah.

Jangan menggunakan floating point untuk uang.

## Authentication dan users

- users
- user_profiles
- user_addresses
- user_sessions jika diperlukan untuk session tambahan
- roles
- user_roles
- admin_activity_logs

Identitas utama customer mengacu pada Firebase UID.

Jangan menyimpan password Firebase di D1.

## Products

- products
- product_images
- product_variants
- product_colors
- product_sizes
- categories
- brands
- product_categories
- product_reviews
- size_guides

## Inventory

- inventory
- inventory_movements
- stock_reservations

## Shopping

- carts
- cart_items
- wishlists
- wishlist_items

## Orders

- orders
- order_items
- order_status_history
- order_notes

## Payments

- payments
- payment_transactions
- payment_callbacks

## Shipping

- shipping_origins
- shipments
- shipment_tracking_events
- shipping_rate_logs

## Promotions

- coupons
- coupon_usages

## Content

- banners
- homepage_sections
- pages
- menus
- faqs
- newsletter_subscribers

## System

- store_settings
- notification_logs
- integration_logs

Buat:
- Primary keys.
- Foreign keys.
- Unique constraints.
- Indexes.
- Timestamps.
- Referential integrity.
- Migration files.
- Seed files.

Jangan menyimpan data varian ukuran dan warna sebagai satu JSON besar jika harus dicari dan dikelola secara relational.

Buat ERD sebelum implementasi database selesai.

---

# 13. STOCK AND TRANSACTION CONSISTENCY

Ini merupakan bagian yang sangat penting.

Pastikan:
- Stok tidak berkurang dua kali.
- Callback tidak memproses transaksi dua kali.
- Order tidak dibuat berulang.
- Payment reference tidak tertukar.
- Varian tidak dapat dibeli melebihi stok.
- Order yang expired ditangani dengan benar.
- Stok reservation memiliki expiration.
- Stok dikembalikan jika order dibatalkan sesuai kebijakan.
- Pengiriman tidak dibuat berulang akibat callback.

Gunakan database transaction jika didukung dan conditional updates yang aman.

Jangan mengandalkan proses frontend untuk mengunci stok.

Rancang status:

Order:
- pending_payment.
- paid.
- processing.
- shipped.
- delivered.
- completed.
- cancelled.
- refunded.

Payment:
- pending.
- paid.
- failed.
- expired.
- refunded.

Shipping:
- pending.
- confirmed.
- allocated.
- picking_up.
- picked_up.
- dropping_off.
- delivered.
- returned.
- cancelled.

Sesuaikan mapping dengan status aktual dari provider.

Jangan memaksakan status provider yang tidak tersedia.

---

# 14. SECURITY

Implementasikan:

- Secure authentication.
- Firebase ID Token verification.
- Role-based authorization.
- Admin route protection.
- CSRF protection sesuai metode authentication.
- XSS prevention.
- SQL injection prevention.
- Input validation.
- Output encoding.
- Rate limiting.
- Secure cookies jika menggunakan session cookies.
- CORS configuration.
- File upload validation.
- MIME validation.
- File size limits.
- Image validation.
- Payment signature verification.
- Webhook validation.
- Idempotency.
- Audit logging.

Jangan:
- Menyimpan password plain text.
- Mengekspos service account private key.
- Mengekspos API key Duitku.
- Mengekspos Biteship token.
- Mempercayai harga frontend.
- Mempercayai role frontend.
- Mengizinkan customer mengakses admin.
- Membiarkan Firebase Database dalam test mode pada production.

---

# 15. IMAGE STORAGE — CLOUDFLARE R2

Gunakan R2 untuk semua gambar produk.

Implementasikan:
- Upload.
- Multiple upload.
- Delete.
- Replace.
- Product image gallery.
- Variant image.
- Banner image.
- Category image.

Validasi:
- File type.
- MIME type.
- File size.
- File extension.
- Image dimensions.

Gunakan object key yang aman dan unik.

Jangan menyimpan binary image ke D1.

Simpan metadata dan object key di database.

Gunakan public bucket custom domain atau mekanisme signed access yang sesuai kebutuhan.

Jangan mengekspos R2 credentials ke browser.

---

# 16. SEO AND PERFORMANCE

Implementasikan:

- Dynamic page title.
- Meta description.
- Canonical URL.
- Open Graph.
- Twitter metadata.
- Product structured data.
- Breadcrumb structured data.
- Sitemap XML.
- Robots.txt.
- Clean URL.
- Product slug.
- Category slug.
- Image alt text.
- Lazy loading.
- Responsive images.
- Caching.
- Optimized API queries.

Pastikan produk dan kategori dapat diindeks mesin pencari.

Gunakan SSR atau prerendering yang kompatibel dengan Cloudflare dan framework yang dipilih. Jangan mengorbankan SEO hanya karena menggunakan React SPA.

Optimalkan Core Web Vitals.

---

# 17. EMAIL NOTIFICATIONS

Gunakan provider email melalui API, misalnya Resend.

Fitur:
- Welcome email.
- Email verification jika diperlukan.
- Order confirmation.
- Payment confirmation.
- Shipping confirmation.
- Password reset mengikuti Firebase.
- Order completion.

Jika provider belum dikonfigurasi, siapkan adapter dan development mode.

Jangan mengklaim email terkirim jika provider belum aktif.

---

# 18. SEED DATA FASHION STORE

Buat data demo yang realistis.

Minimal:

- 6 kategori.
- 4 brand.
- 30 produk.
- Beberapa warna untuk setiap produk.
- Beberapa ukuran untuk setiap produk.
- SKU unik.
- Stok berbeda per varian.
- Foto produk relevan.
- Harga Rupiah realistis.
- 10 pelanggan demo.
- 15 order demo.

Kategori:

1. T-Shirts.
2. Shirts.
3. Outerwear.
4. Trousers.
5. Denim.
6. Accessories.

Contoh produk:

- Oversized Cotton T-Shirt.
- Premium Basic Tee.
- Boxy Fit T-Shirt.
- Oxford Casual Shirt.
- Linen Relaxed Shirt.
- Essential Hoodie.
- Lightweight Bomber Jacket.
- Relaxed Fit Chino.
- Straight Fit Denim.
- Classic Cargo Pants.
- Minimalist Crossbody Bag.
- Everyday Cap.

Jangan menggunakan gambar yang sama untuk semua produk.

Gunakan gambar fashion yang relevan dengan nama produk.

Jangan menggunakan foto orang atau brand komersial seolah-olah merupakan aset resmi toko.

Pisahkan data demo dan production.

---

# 19. PROJECT STRUCTURE

Gunakan modular architecture.

Pisahkan:

- frontend.
- backend.
- routes.
- middleware.
- database.
- migrations.
- seeds.
- services.
- integrations.
- firebase.
- duitku.
- biteship.
- storage.
- auth.
- validation.
- shared.
- components.
- customer pages.
- admin pages.
- tests.

Pisahkan business logic dari route handlers.

Buat adapter untuk Duitku dan Biteship.

Jangan menaruh seluruh aplikasi dalam satu file.

Jangan membuat komponen dengan ribuan baris kode.

Gunakan reusable components.

Pastikan struktur mudah dikembangkan.

---

# 20. ENVIRONMENT CONFIGURATION

Buat .env.example.

Frontend configuration:

VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_DATABASE_URL=
VITE_FIREBASE_VAPID_KEY=

Backend configuration:

APP_ENV=
APP_URL=

DUITKU_MERCHANT_CODE=
DUITKU_API_KEY=
DUITKU_ENVIRONMENT=

BITESHIP_API_KEY=
BITESHIP_ENVIRONMENT=

FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

EMAIL_API_KEY=
EMAIL_FROM=

Semua credential sensitif wajib disimpan melalui Cloudflare Worker Secrets.

Jangan menaruh credential asli dalam source code.

Jangan memasukkan .env ke Git.

Jangan menampilkan secret dalam terminal output atau logs.

Gunakan Cloudflare bindings untuk D1 dan R2.

---

# 21. TESTING

Buat automated tests.

Authentication:
- Register.
- Login.
- Google login.
- Logout.
- Invalid token.
- Expired token.
- Unauthorized.
- Admin authorization.

Products:
- Listing.
- Detail.
- Variants.
- Stock.

Cart:
- Add.
- Remove.
- Update.
- Variant validation.

Checkout:
- Price validation.
- Coupon.
- Shipping rate.
- Order creation.

Duitku:
- Payment request.
- Request signature.
- Callback signature.
- Transaction verification.
- Duplicate callback.
- Failed payment.
- Pending payment.

Biteship:
- Area lookup.
- Rate calculation.
- Create order.
- Webhook processing.
- Tracking.

Firebase:
- Authentication.
- ID token verification.
- Realtime chat permissions.
- FCM token registration.
- Notification handling.

Inventory:
- Stock deduction.
- Stock reservation.
- Stock restoration.
- Concurrent purchase protection.

Jalankan:
- Type checking.
- Lint.
- Unit tests.
- Integration tests.
- Production build.

Jangan menyatakan pekerjaan selesai jika terdapat error kritis.

---

# 22. DEPLOYMENT

Gunakan Cloudflare.

Siapkan:

- Wrangler configuration.
- Workers Static Assets.
- D1 production database.
- D1 migrations.
- R2 production bucket.
- Worker secrets.
- Custom domain.
- HTTPS.
- Production environment.
- Production build.

Firebase:
- Production Firebase project.
- Authorized domains.
- Authentication providers.
- Realtime Database.
- Security Rules.
- FCM configuration.
- VAPID configuration.

Duitku:
- Sandbox testing.
- Production merchant credentials.
- Callback URL.
- Return URL.
- Payment channel verification.

Biteship:
- Testing token.
- Production token.
- Order API activation.
- Webhook configuration.
- Shipping origin.

Jangan melakukan deployment production sebelum seluruh credential dan konfigurasi tersedia.

Jangan mengklaim deployment berhasil tanpa memeriksa URL dan hasil deployment.

---

# 23. IMPLEMENTATION PHASES

Kerjakan secara bertahap.

## PHASE 1 — PROJECT AUDIT

- Periksa seluruh project.
- Periksa stack yang tersedia.
- Periksa struktur folder.
- Periksa dependency.
- Periksa konfigurasi.
- Identifikasi fitur yang sudah ada.
- Jangan menghapus fitur existing tanpa alasan.

## PHASE 2 — ARCHITECTURE

- Finalisasi arsitektur.
- Buat ERD.
- Buat database schema.
- Buat API design.
- Buat security design.
- Buat project structure.

## PHASE 3 — FOUNDATION

- Setup Bun.
- Setup React.
- Setup Vite.
- Setup Tailwind.
- Setup Hono.
- Setup Wrangler.
- Setup Cloudflare D1.
- Setup Cloudflare R2.
- Setup Firebase SDK.

## PHASE 4 — AUTHENTICATION

- Firebase Auth.
- Customer registration.
- Login.
- Google login.
- Token verification.
- Admin authorization.
- Profile.

## PHASE 5 — STOREFRONT

- Homepage.
- Product catalog.
- Product detail.
- Product variants.
- Search.
- Filter.
- Cart.
- Wishlist.

## PHASE 6 — ADMIN

- Dashboard.
- Product management.
- Variant management.
- Inventory.
- Customer management.
- Order management.
- Promotions.
- Reports.
- Settings.

## PHASE 7 — CHECKOUT

- Address.
- Biteship rates.
- Coupon.
- Price calculation.
- Order creation.

## PHASE 8 — PAYMENT

- Duitku integration.
- Payment channels.
- Transaction request.
- Callback.
- Verification.
- Payment status.

## PHASE 9 — SHIPPING

- Biteship integration.
- Search area.
- Shipping rate.
- Create shipping order.
- Tracking.
- Webhook.

## PHASE 10 — FIREBASE REALTIME

- FCM.
- Push notifications.
- Realtime Database.
- Customer chat.
- Admin chat.
- Presence.

## PHASE 11 — FINALIZATION

- SEO.
- Performance.
- Security.
- Automated tests.
- Production build.
- Deployment.

---

# 24. NON-NEGOTIABLE RULES

1. Jangan membuat aplikasi hanya berupa UI.
2. Jangan meninggalkan tombol tanpa fungsi.
3. Jangan menggunakan data dummy untuk transaksi production.
4. Jangan menggunakan Midtrans.
5. Jangan menghilangkan Firebase.
6. Jangan mengganti D1 sebagai database transaksi utama.
7. Jangan menggunakan Firebase sebagai pengganti D1.
8. Jangan mengarang API endpoint.
9. Jangan mengarang parameter API.
10. Jangan mengarang response API.
11. Jangan mengarang signature.
12. Jangan mengarang ongkos kirim.
13. Jangan mengasumsikan seluruh payment channel aktif.
14. Jangan mengasumsikan seluruh layanan kurir tersedia.
15. Jangan menaruh API key di frontend.
16. Jangan menggunakan npm, yarn, atau pnpm untuk instalasi dependency.
17. Jangan menjadikan Node.js sebagai runtime development utama.
18. Jangan membuat Dockerfile.
19. Jangan membuat kebutuhan VPS.
20. Jangan menggunakan gradient.
21. Jangan menggunakan glassmorphism.
22. Jangan membuat desain AI slop.
23. Jangan mempercayai harga dari frontend.
24. Jangan mengubah status pembayaran hanya berdasarkan return URL.
25. Jangan mengurangi stok akibat callback berulang.
26. Jangan membuat shipping order ganda.
27. Jangan mengizinkan akses chat customer lain.
28. Jangan menggunakan Firebase test rules di production.
29. Jangan menyatakan build berhasil jika belum dijalankan.
30. Jangan menyatakan deployment berhasil jika belum diverifikasi.

Jika ada dokumentasi API yang berubah, ikuti dokumentasi resmi terbaru.

Jika ada keterbatasan Cloudflare Workers, D1, Firebase, atau Bun, gunakan solusi yang benar-benar kompatibel.

---

# 25. FINAL ACCEPTANCE CRITERIA

Aplikasi baru dapat dinyatakan selesai jika:

CUSTOMER:
- Register.
- Login.
- Google login.
- Browse products.
- Search.
- Filter.
- Select size.
- Select color.
- Add to cart.
- Wishlist.
- Checkout.
- Select shipping.
- Pay using Duitku.
- View order.
- Track shipment.
- Receive notification.
- Use live chat.

ADMIN:
- Login.
- Dashboard.
- Product CRUD.
- Variant CRUD.
- Stock management.
- Order management.
- Payment monitoring.
- Shipping monitoring.
- Customer management.
- Coupon management.
- Content management.
- Reports.
- Settings.
- Live chat.

INTEGRATIONS:
- Firebase Authentication works.
- Firebase Realtime Database works.
- Firebase Cloud Messaging works.
- Duitku sandbox transactions work.
- Duitku callback verification works.
- Biteship rate calculation works.
- Biteship order creation works.
- Biteship webhook works.

INFRASTRUCTURE:
- Bun installation works.
- Cloudflare D1 migrations work.
- Cloudflare R2 upload works.
- Workers build succeeds.
- Production configuration is ready.
- Responsive UI works.
- Security checks pass.
- Automated tests pass.

---

# 26. FINAL EXECUTION INSTRUCTION

Mulai sekarang lakukan audit pada project yang sedang terbuka di Qoder IDE.

Sebelum implementasi, berikan ringkasan singkat:

1. Kondisi project.
2. Framework yang ditemukan.
3. Dependency yang sudah tersedia.
4. Arsitektur yang akan diterapkan.
5. Struktur database.
6. Integrasi eksternal.
7. Potensi kendala teknis.

Setelah audit, lanjutkan implementasi secara langsung.

Jangan berhenti hanya pada pembuatan struktur folder atau mockup.

Implementasikan setiap fase sampai fitur utamanya bekerja.

Jangan menunggu saya menyetujui setiap pembuatan file atau perintah terminal yang memang diperlukan untuk implementasi.

Jika membutuhkan credential, berhenti hanya pada bagian yang benar-benar membutuhkan credential tersebut. Lanjutkan bagian lain yang tidak bergantung padanya.

Gunakan sandbox untuk pengujian Duitku dan Biteship jika tersedia.

Pastikan seluruh transaksi memiliki validasi backend, keamanan, logging, dan idempotency.

Prioritas utama:

1. Correct architecture.
2. Security.
3. Transaction consistency.
4. Inventory accuracy.
5. Payment reliability.
6. Shipping reliability.
7. Professional UI/UX.
8. Maintainable code.
9. Performance.
10. Production readiness.

Bangun sebuah FULL-FEATURE CLOTHING E-COMMERCE yang benar-benar berfungsi, bukan sekadar tampilan toko online.