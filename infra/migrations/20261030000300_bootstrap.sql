-- VELORA · D1 — structural bootstrap (required for the app to run at all).
-- Deterministic ids so seeds and migrations can reference them safely.
-- Demo/merchant data lives in infra/seeds (separate, optional, re-runnable).

INSERT OR IGNORE INTO roles (id, code, name, description) VALUES
  ('role_customer', 'customer', 'Pelanggan', 'Akun pembeli yang terdaftar lewat Firebase Authentication'),
  ('role_admin', 'admin', 'Administrator', 'Akses penuh ke dashboard operasional'),
  ('role_super_admin', 'super_admin', 'Super Administrator', 'Termasuk pengaturan toko dan manajemen peran');

INSERT OR IGNORE INTO size_guides (id, name, type, description, columns, rows) VALUES
  ('sg_tops', 'Panduan Ukuran Atasan', 'tops', 'Semua pengukuran dalam sentimeter, diukur datar.',
   '["Size","Lingkar Dada","Lebar Bahu","Panjang Lengan","Tinggi Badan"]',
   '[["S","92-96","44","20","160-168"],["M","96-100","46","21","168-174"],["L","100-106","48","22","174-180"],["XL","106-112","50","23","180-186"],["XXL","112-118","52","24","186-192"]]'),
  ('sg_bottoms', 'Panduan Ukuran Bawahan', 'bottoms', 'Lingkar pinggang diukur pada bagian paling sempit.',
   '["Size","Lingkar Pinggang","Panjang Celana","Sobek (Inseam)"]',
   '[["S","70-74","100","70"],["M","74-80","102","72"],["L","80-86","104","74"],["XL","86-92","106","76"],["XXL","92-100","108","78"]]'),
  ('sg_general', 'Panduan Umum', 'general', 'Produk aksesori dan one-size mengikuti panduan ini.',
   '["Size","Keterangan"]',
   '[["One Size","Dapat disesuaikan"],["Free Size","Muat untuk 54-60 cm"]]');

INSERT OR IGNORE INTO sizes (id, code, name, sort_order, size_guide_id) VALUES
  ('size_s', 'S', 'Small', 1, 'sg_tops'),
  ('size_m', 'M', 'Medium', 2, 'sg_tops'),
  ('size_l', 'L', 'Large', 3, 'sg_tops'),
  ('size_xl', 'XL', 'Extra Large', 4, 'sg_tops'),
  ('size_xxl', 'XXL', 'Double Extra Large', 5, 'sg_tops'),
  ('size_28', '28', 'Pinggang 28', 6, 'sg_bottoms'),
  ('size_30', '30', 'Pinggang 30', 7, 'sg_bottoms'),
  ('size_32', '32', 'Pinggang 32', 8, 'sg_bottoms'),
  ('size_34', '34', 'Pinggang 34', 9, 'sg_bottoms'),
  ('size_os', 'OS', 'One Size', 10, 'sg_general');

INSERT OR IGNORE INTO colors (id, name, slug, hex_code) VALUES
  ('color_black', 'Hitam', 'hitam', '#191919'),
  ('color_white', 'Putih', 'putih', '#FFFFFF'),
  ('color_cream', 'Cream', 'cream', '#EFE6D6'),
  ('color_navy', 'Navy', 'navy', '#1F2A44'),
  ('color_charcoal', 'Charcoal', 'charcoal', '#4A4A4A'),
  ('color_olive', 'Olive', 'olive', '#5A5F41'),
  ('color_sand', 'Sand', 'sand', '#C9B79C'),
  ('color_brown', 'Cokelat', 'cokelat', '#74634F'),
  ('color_grey', 'Abu-abu', 'abu-abu', '#8A8A8A'),
  ('color_indigo', 'Indigo', 'indigo', '#2B3A67'),
  ('color_stone', 'Stone', 'stone', '#A9A49B'),
  ('color_wine', 'Wine', 'wine', '#5E2730');

INSERT OR IGNORE INTO categories (id, name, slug, description, sort_order, is_active, meta_title, meta_description) VALUES
  ('cat_tshirts', 'T-Shirts', 'kaos', 'Kaos katun combed, oversized dan boxy fit untuk harian.', 1, 1, 'Kaos Pria & Wanita Terbaru | VELORA', 'Koleksi kaos katun premium dengan potongan modern. Varian warna dan ukuran lengkap.'),
  ('cat_shirts', 'Shirts', 'kemeja', 'Kemeja oxford, linen dan relaxed fit.', 2, 1, 'Kemeja Casual & Formal | VELORA', 'Kemeja oxford dan linen dengan potongan rapi untuk kerja maupun akhir pekan.'),
  ('cat_outerwear', 'Outerwear', 'outerwear', 'Hoodie, varsity, dan jaket ringan.', 3, 1, 'Hoodie & Jaket | VELORA', 'Lapisan luar yang hangat dan ringan, dirancang untuk iklim tropis.'),
  ('cat_trousers', 'Trousers', 'celana', 'Chino, cargo, dan formal trousers.', 4, 1, 'Celana Chino & Cargo | VELORA', 'Celana dengan potongan relaxed dan straight fit, bahan katun twill.'),
  ('cat_denim', 'Denim', 'denim', 'Jeans straight, slim dan relaxed.', 5, 1, 'Celana Jeans Denim | VELORA', 'Denim dengan cucian minimal, jahitan kuat, dan warna tahan lama.'),
  ('cat_accessories', 'Accessories', 'aksesori', 'Topi, tas, kaus kaki, dan aksesori kecil.', 6, 1, 'Aksesori Fashion | VELORA', 'Pelengkap tampilan: topi, tas selempang, dan aksesori harian.');

INSERT OR IGNORE INTO brands (id, name, slug, description, is_active) VALUES
  ('brand_velora', 'VELORA Essentials', 'velora-essentials', 'Lini utama VELORA: potongan bersih, bahan harian.', 1),
  ('brand_atelier', 'Atelier by VELORA', 'atelier', 'Potongan tailored dan material pilihan.', 1),
  ('brand_north', 'Northline', 'northline', 'Outerwear dan lapisan aktif.', 1),
  ('brand_studio', 'Studio Basic', 'studio-basic', 'Dasar lemari pakaian tanpa kompromi.', 1);

INSERT OR IGNORE INTO shipping_origins (id, name, contact_name, phone, address, province, city, district, postcode, area_id, is_default, is_active) VALUES
  ('origin_sp', 'Gudang VELORA Bandung', 'Operasional VELORA', '081200000000',
   'Jl. Soekarno-Hatta No. 123, Gedung VELORA, Lantai 2', 'Jawa Barat', 'Kota Bandung', 'Coblong', '40115',
   '1712', 1, 1);

-- Defaults are safe, non secret and editable through the admin dashboard.
INSERT OR IGNORE INTO store_settings (key, value, is_public) VALUES
  ('store_name', '{"value":"VELORA"}', 1),
  ('logo', '{"value":null}', 1),
  ('announcement_bar', '{"value":"Kirim gratis untuk pesanan di atas Rp 500.000 · Bayar dengan QRIS"}', 1),
  ('whatsapp', '{"value":"6281200000000"}', 1),
  ('email', '{"value":"care@velora.example"}', 1),
  ('social_media', '{"instagram":"https://instagram.com","tiktok":"https://tiktok.com","facebook":null,"twitter":null}', 1),
  ('store_address', '{"province":"Jawa Barat","city":"Kota Bandung","district":"Coblong","detail":"Jl. Soekarno-Hatta No. 123"}', 1),
  ('tax_settings', '{"enabled":false,"ratePercent":11,"includeInPrice":true}', 0),
  ('order_settings', '{"pendingExpiryMinutes":60,"autoCancelUnpaid":true,"minOrderValue":0}', 0),
  ('seo_settings', '{"siteName":"VELORA","defaultTitle":"VELORA — Modern Fashion Store","defaultDescription":"Toko pakaian modern dengan potongan bersih dan bahan yang jujur.","defaultOgImage":null,"canonicalBaseUrl":null}', 1),
  ('duitku_config', '{"environment":"sandbox","expiryMinutes":60,"enabledChannels":[]}', 0),
  ('biteship_config', '{"environment":"sandbox","deliveryType":"regular","insurancePercent":0,"allowedCouriers":[]}', 0);

INSERT OR IGNORE INTO menus (id, code, items, is_active) VALUES
  ('menu_main', 'main', '[{"label":"Kaos","href":"/kategori/kaos"},{"label":"Kemeja","href":"/kategori/kemeja"},{"label":"Outerwear","href":"/kategori/outerwear"},{"label":"Celana","href":"/kategori/celana"},{"label":"Denim","href":"/kategori/denim"},{"label":"Aksesori","href":"/kategori/aksesori"}]', 1),
  ('menu_category', 'category', '[{"label":"New Arrivals","href":"/katalog?sort=latest&new=1"},{"label":"Best Sellers","href":"/katalog?sort=best_seller"},{"label":"On Sale","href":"/katalog?onSale=1"}]', 1),
  ('menu_footer', 'footer', '[{"label":"Tentang Kami","href":"/halaman/tentang"},{"label":"Panduan Ukuran","href":"/halaman/panduan-ukuran"},{"label":"Kebijakan Pengiriman","href":"/halaman/pengiriman"},{"label":"Retur & Refund","href":"/halaman/retur"},{"label":"Syarat & Ketentuan","href":"/halaman/syarat"},{"label":"FAQ","href":"/halaman/faq"}]', 1),
  ('menu_mobile', 'mobile', '[{"label":"Katalog","href":"/katalog"},{"label":"Keranjang","href":"/keranjang"},{"label":"Akun","href":"/akun"}]', 1);

INSERT OR IGNORE INTO homepage_sections (id, section_key, title, subtitle, layout, data, is_active, sort_order) VALUES
  ('sec_hero', 'hero', 'Musim Baru, Potongan Bersih', 'Koleksi esensial yang dirancang untuk dipakai berulang, bukan sekali tampil.', 'editorial', '{"eyebrow":"Autumn Editorial 2026","ctaLabel":"Belanja Koleksi","ctaHref":"/katalog"}', 1, 1),
  ('sec_featured', 'featured_collection', 'Koleksi Unggulan', 'Pilihan redaksi VELORA musim ini.', 'grid', '{"limit":8}', 1, 2),
  ('sec_new', 'new_arrivals', 'Kedatangan Baru', 'Yang paling baru masuk gudang.', 'grid', '{"limit":8}', 1, 3),
  ('sec_best', 'best_sellers', 'Terlaris', 'Dibeli paling banyak bulan ini.', 'grid', '{"limit":8}', 1, 4),
  ('sec_promo', 'promo', 'Potongan Hingga 30%', 'Untuk selected items, selama stok masih ada.', 'banner', '{"couponCode":"VELORA30"}', 1, 5),
  ('sec_story', 'brand_story', 'Dibuat Untuk Dipakai', 'Kami hanya menjual pakaian yang kami sendiri pakai: katun tebal, jahitan rapi, warna yang tidak cepat lelah.', 'split', '{}', 1, 6),
  ('sec_reco', 'recommended', 'Rekomendasi Untukmu', 'Berdasarkan kategori yang kamu lihat.', 'grid', '{"limit":8}', 1, 7);

INSERT OR IGNORE INTO pages (id, slug, title, content, is_published, meta_title, meta_description) VALUES
  ('pg_about', 'tentang', 'Tentang VELORA', 'VELORA adalah toko pakaian yang tumbuh dari satu kebiasaan sederhana: membeli sedikit, memakai lama.\n\nKami bekerja langsung dengan penjahit di Bandung, memilih katun combed 24s-30s, dan menolak produksi massal yang tidak kami pakai sendiri.', 1, 'Tentang VELORA', 'Cerita brand VELORA dan cara kami memproduksi pakaian.'),
  ('pg_size', 'panduan-ukuran', 'Panduan Ukuran', 'Gunakan tabel panduan ukuran pada setiap halaman produk. Lingkar dada diukur datar 2 cm di bawah ketiak.', 1, 'Panduan Ukuran VELORA', 'Cara mengukur dan memilih ukuran yang tepat di VELORA.'),
  ('pg_shipping', 'pengiriman', 'Kebijakan Pengiriman', 'Pesanan diproses dalam 1x24 jam kerja setelah pembayaran terverifikasi. Pelacakan tersedia di halaman pesanan Anda.', 1, 'Kebijakan Pengiriman', 'Informasi pengiriman, kurir, dan estimasi waktu tiba.'),
  ('pg_return', 'retur', 'Retur & Refund', 'Retur diterima maksimal 7 hari setelah barang tiba, dengan kondisi label lengkap dan belum dipakai.', 1, 'Retur & Refund', 'Ketentuan pengembalian barang dan dana di VELORA.'),
  ('pg_terms', 'syarat', 'Syarat & Ketentuan', 'Dengan berbelanja di VELORA Anda menyetujui ketentuan akun, pembayaran, pengiriman, dan perlindungan data pribadi.', 1, 'Syarat & Ketentuan', 'Syarat dan ketentuan penggunaan VELORA.'),
  ('pg_faq', 'faq', 'Pertanyaan Umum', 'Cara lacak pesanan, ganti ukuran, metode pembayaran, dan estimasi pengiriman dijelaskan di sini.', 1, 'FAQ VELORA', 'Pertanyaan yang paling sering ditanyakan pelanggan VELORA.');

INSERT OR IGNORE INTO faqs (id, question, answer, category, sort_order, is_published) VALUES
  ('faq_1', 'Bagaimana cara melacak pesanan saya?', 'Buka Akun > Pesanan, lalu pilih pesanan. Nomor pelacakan dan riwayat pergerakan tampil otomatis begitu kurir mempickup paket.', 'pengiriman', 1, 1),
  ('faq_2', 'Metode pembayaran apa yang tersedia?', 'QRIS, virtual account bank, e-wallet, dan transfer bank diproses melalui Duitku. Daftar metode yang aktif tampil di halaman checkout.', 'pembayaran', 2, 1),
  ('faq_3', 'Bisakah saya menukar ukuran?', 'Bisa, sepanjang produk masih ada stoknya dan maksimal 7 hari setelah pesanan selesai. Chat tim kami untuk membuat permintaan tukar.', 'retur', 3, 1),
  ('faq_4', 'Berapa lama pengiriman ke luar Jawa?', 'Umumnya 3-6 hari kerja tergantung kurir. Estimasi real ditampilkan saat checkout sebelum Anda membayar.', 'pengiriman', 4, 1);
