VELORA — Provider Setup Guide

Panduan setup dan deployment VELORA untuk Cloudflare Workers, D1, R2, KV, Firebase, Duitku, dan Biteship.

Panduan ini mencakup:

- Setup resource Cloudflare.
- Konfigurasi Firebase untuk frontend dan backend.
- Konfigurasi payment gateway Duitku.
- Konfigurasi shipping Biteship.
- Local development.
- Production deployment.
- Pengelolaan Worker Secrets tanpa mengulang konfigurasi setiap deployment.

---

1. Cloudflare Workers + D1 + R2 + KV

1.1 Prasyarat

Pastikan Bun sudah terinstal.

# Install Wrangler secara global (opsional)
bun add -g wrangler

# Login Cloudflare
bunx wrangler login

Jika tidak ingin menginstal Wrangler secara global, gunakan "bunx wrangler".

1.2 Resource Cloudflare

Resource berikut cukup dibuat satu kali.

# D1 Database
bunx wrangler d1 create velora-db

# R2 Bucket
bunx wrangler r2 bucket create velora-media

# KV Namespace
bunx wrangler kv namespace create VELORA_CACHE

Catat ID D1 dan KV yang dihasilkan.

Catatan: Pada project produksi VELORA, resource berikut sudah tersedia. Jangan membuat ulang.

Resource| Nama| Binding
D1| "velora-db"| "DB"
R2| "velora-media"| "MEDIA"
KV| "VELORA_CACHE"| "VELORA_CACHE"

1.3 Konfigurasi wrangler.toml

File konfigurasi utama berada di root repository.

name = "velora"
main = "apps/web/workers/app.ts"
compatibility_date = "2025-09-01"
compatibility_flags = ["nodejs_compat"]

[assets]
directory = "apps/web/build/client"
binding = "ASSETS"
html_handling = "auto-trailing-slash"
run_worker_first = [
  "/api/*",
  "/webhooks/*",
  "/sitemap.xml",
  "/robots.txt",
  "/manifest.webmanifest",
  "/media/*"
]

[[d1_databases]]
binding = "DB"
database_name = "velora-db"
database_id = "a4d3d754-d6c7-4f89-bb93-ce5d5b60eae0"
migrations_dir = "infra/migrations"

[[r2_buckets]]
binding = "MEDIA"
bucket_name = "velora-media"

[[kv_namespaces]]
binding = "VELORA_CACHE"
id = "7c6c4c33022644cc970c2e68b9747a4b"

[vars]
APP_ENV = "production"
LOG_LEVEL = "warn"
BRAND_NAME = "VELORA"
APP_URL = "https://velora.pribadiagus321.workers.dev"
CORS_ALLOWED_ORIGINS = "https://velora.pribadiagus321.workers.dev"
MEDIA_PUBLIC_BASE_URL = "https://velora.pribadiagus321.workers.dev/media"
FIREBASE_DATABASE_URL = "https://velora-d3b5f-default-rtdb.asia-southeast1.firebasedatabase.app"

[observability]
enabled = true

ID di atas merupakan konfigurasi resource produksi VELORA saat ini. Jangan menggantinya dengan placeholder.

Jika menggunakan domain sendiri, sesuaikan "APP_URL", "CORS_ALLOWED_ORIGINS", dan "MEDIA_PUBLIC_BASE_URL".

1.4 Migrasi database

# Migrasi database lokal
bun run db:migrate:local

# Migrasi database produksi
bun run db:migrate:remote

Jalankan migrasi remote ketika terdapat perubahan schema yang memang perlu diterapkan ke D1 produksi.

1.5 Seed data

# Seed database lokal
bun run db:seed:local

# Seed database produksi (hanya jika memang diperlukan)
bun run db:seed:remote

Jangan menjalankan seed produksi secara sembarangan karena dapat memengaruhi data yang sudah ada.

---

2. Firebase — Authentication, Realtime Database, dan FCM

2.1 Konsep konfigurasi Firebase VELORA

VELORA menggunakan dua kelompok konfigurasi Firebase.

A. Firebase Web Configuration

Digunakan oleh frontend untuk:

- Firebase Authentication.
- Realtime Database.
- Firebase Cloud Messaging.
- Registrasi Web Push.

Konfigurasi ini menggunakan variabel:

VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_DATABASE_URL=
VITE_FIREBASE_VAPID_KEY=

B. Firebase Admin Configuration

Digunakan oleh backend Worker untuk kebutuhan server-side.

FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

Kedua kelompok konfigurasi memiliki fungsi berbeda. Jangan menyamakan Firebase Web API Key dengan Firebase Service Account Private Key.

2.2 Buat Firebase Project

1. Buka https://console.firebase.google.com
2. Buat atau pilih project Firebase.
3. Buka Project Settings → General.
4. Pada bagian Your apps, buat atau pilih Web App.
5. Ambil konfigurasi Firebase Web App.

Google Analytics bersifat opsional. VELORA tidak mewajibkan konfigurasi Measurement ID.

2.3 Aktifkan Firebase Authentication

1. Buka Firebase Console.
2. Pilih Authentication.
3. Buka Sign-in method.
4. Aktifkan Email/Password.
5. Aktifkan Google jika fitur login Google digunakan.

Tambahkan domain produksi ke Authorized domains.

Contoh:

velora.pribadiagus321.workers.dev

2.4 Aktifkan Realtime Database

1. Buka Realtime Database.
2. Klik Create Database.
3. Pilih lokasi database yang sesuai.
4. Gunakan mode locked.
5. Catat Database URL.

Contoh:

https://velora-default-rtdb.asia-southeast1.firebasedatabase.app

Deploy rules dari root repository:

firebase login

firebase deploy --only database

Pastikan Firebase CLI sudah dikonfigurasi dan "firebase.json" mengarah ke file rules yang benar.

2.5 Aktifkan Firebase Cloud Messaging

1. Buka Project Settings.
2. Pilih Cloud Messaging.
3. Pastikan Cloud Messaging aktif.
4. Buka Web Push Certificates.
5. Generate key pair.
6. Salin VAPID public key.

Simpan nilai tersebut untuk konfigurasi "VITE_FIREBASE_VAPID_KEY".

2.6 Firebase Service Account

1. Buka Project Settings.
2. Pilih Service accounts.
3. Generate new private key.
4. Unduh file JSON.
5. Ambil nilai berikut:

Field JSON| Worker Secret
"project_id"| "FIREBASE_PROJECT_ID"
"client_email"| "FIREBASE_CLIENT_EMAIL"
"private_key"| "FIREBASE_PRIVATE_KEY"

Jaga file JSON dan private key. Jangan commit ke GitHub atau memasukkannya ke frontend.

2.7 Firebase Web Configuration — Local Development

Untuk konfigurasi frontend lokal, gunakan file:

apps/web/.env

Contoh:

VITE_APP_NAME=VELORA
VITE_APP_URL=http://localhost:5173
VITE_API_BASE_URL=http://localhost:8787/api

VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=velora.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=velora
VITE_FIREBASE_STORAGE_BUCKET=velora.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef

VITE_FIREBASE_DATABASE_URL=https://velora-default-rtdb.asia-southeast1.firebasedatabase.app
VITE_FIREBASE_VAPID_KEY=BI...

# Opsional, kosongkan jika tidak menggunakan Google Analytics
VITE_FIREBASE_MEASUREMENT_ID=

Jangan commit file ".env" yang berisi konfigurasi pribadi atau credential.

2.8 Firebase Runtime Configuration — Production

PENTING: VELORA menggunakan Cloudflare Worker Secrets untuk Firebase Web Configuration di produksi.

Frontend tidak lagi bergantung pada pengisian ulang ".env" setiap kali melakukan deployment.

Worker menyediakan endpoint:

GET /api/runtime-config

Endpoint mengembalikan konfigurasi Firebase Web yang dibutuhkan frontend.

Implementasi berada di:

apps/web/workers/app.ts

Frontend memuat konfigurasi melalui:

apps/web/app/lib/config.ts

Prosesnya:

1. Browser meminta "/api/runtime-config".
2. Cloudflare Worker membaca Firebase Web Configuration dari environment.
3. Worker mengembalikan konfigurasi Firebase yang memang digunakan frontend.
4. "loadRuntimeConfig()" memperbarui konfigurasi frontend.
5. Firebase Auth diinisialisasi setelah runtime configuration selesai dimuat.

Contoh bentuk respons:

{
  "firebase": {
    "apiKey": "...",
    "authDomain": "...",
    "projectId": "...",
    "storageBucket": "...",
    "messagingSenderId": "...",
    "appId": "...",
    "databaseURL": "...",
    "vapidKey": "..."
  }
}

Endpoint tersebut hanya mengembalikan Firebase Web Configuration, bukan Firebase Service Account Private Key.

2.9 Upload Firebase Web Configuration ke Cloudflare

Delapan konfigurasi berikut sudah berhasil dipasang sebagai Worker Secrets di produksi VELORA:

VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
VITE_FIREBASE_DATABASE_URL
VITE_FIREBASE_VAPID_KEY

Untuk memasang atau memperbarui secret:

bunx wrangler secret put VITE_FIREBASE_API_KEY --config wrangler.toml

Masukkan nilainya ketika diminta Wrangler.

Ulangi untuk secret lain yang perlu dipasang atau diperbarui.

Jika Wrangler menolak perubahan dengan pesan bahwa versi Worker terbaru belum ter-deploy, gunakan mekanisme versioned secret:

bunx wrangler versions secret put VITE_FIREBASE_API_KEY --config wrangler.toml

Setelah memasukkan secret, catat Version ID yang dihasilkan Wrangler.

Untuk mengaktifkan versi tersebut:

bunx wrangler versions deploy VERSION_ID@100% --config wrangler.toml

Ganti "VERSION_ID" dengan ID versi yang benar-benar dihasilkan.

Catatan penting:

- Tidak perlu memasukkan ulang seluruh secret setiap kali ada perubahan kode.
- Jika hanya mengubah UI, API, fitur, atau bug fixing, cukup jalankan deployment normal.
- Gunakan perintah pengelolaan secret hanya ketika ada secret baru atau nilainya berubah.
- Jangan mencetak nilai secret ke terminal atau membagikannya.

2.10 Firebase Admin Secrets

Secret server-side berikut digunakan oleh backend:

FIREBASE_PROJECT_ID
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY

Jika belum tersedia di produksi, pasang melalui Wrangler:

bunx wrangler secret put FIREBASE_PROJECT_ID --config wrangler.toml
bunx wrangler secret put FIREBASE_CLIENT_EMAIL --config wrangler.toml
bunx wrangler secret put FIREBASE_PRIVATE_KEY --config wrangler.toml

Private key harus menggunakan format satu baris dengan karakter "\n" sebagai pemisah baris jika memang demikian format yang dibutuhkan implementasi.

Pada konfigurasi VELORA saat ini, sebagian konfigurasi Firebase server-side sudah tersedia. Periksa terlebih dahulu sebelum membuat atau memperbarui secret.

---

3. Duitku — Payment Gateway

3.1 Daftar merchant

1. Buka https://duitku.com.
2. Daftar merchant.
3. Selesaikan aktivasi akun.
4. Ambil Merchant Code dan API Key dari dashboard.

Gunakan sandbox untuk development dan kredensial production untuk transaksi sebenarnya.

3.2 Konfigurasi local development

Tambahkan ke ".dev.vars" di root repository:

DUITKU_MERCHANT_CODE=
DUITKU_API_KEY=
DUITKU_ENVIRONMENT=sandbox

Isi sesuai kredensial sandbox.

3.3 Production Secrets

Jika belum tersedia, pasang:

bunx wrangler secret put DUITKU_MERCHANT_CODE --config wrangler.toml

bunx wrangler secret put DUITKU_API_KEY --config wrangler.toml

Pastikan environment Duitku yang digunakan oleh implementasi backend sesuai dengan kredensial yang dipasang.

3.4 Callback URL

Contoh URL callback produksi:

https://velora.pribadiagus321.workers.dev/webhooks/duitku/callback

Sesuaikan URL callback di dashboard Duitku.

Untuk development lokal, callback dari Duitku membutuhkan URL publik melalui tunnel seperti Cloudflare Tunnel.

3.5 Catatan keamanan pembayaran

- Signature request dan callback harus mengikuti urutan parameter sesuai spesifikasi integrasi Duitku.
- Jangan menentukan status pesanan "paid" hanya berdasarkan redirect atau return URL.
- Verifikasi signature callback.
- Lakukan validasi status transaksi melalui mekanisme verifikasi Duitku yang digunakan implementasi.
- Pastikan callback idempotent agar notifikasi pembayaran berulang tidak memproses transaksi dua kali.

---

4. Biteship — Shipping API

4.1 Daftar akun

1. Buka https://biteship.com.
2. Daftar dan verifikasi email.
3. Buka dashboard.
4. Cari API Keys.
5. Ambil Test Key dan Live Key.

4.2 Local Development

Tambahkan ke ".dev.vars":

BITESHIP_API_KEY=test_xxxxxxxxxxxxx
BITESHIP_ENVIRONMENT=sandbox

Gunakan test key untuk pengujian.

4.3 Production Secret

Pasang live key jika belum tersedia:

bunx wrangler secret put BITESHIP_API_KEY --config wrangler.toml

Pastikan backend menggunakan environment production ketika menggunakan live key.

4.4 Webhook Tracking

URL webhook produksi:

https://velora.pribadiagus321.workers.dev/webhooks/biteship

Atur URL tersebut melalui dashboard Biteship.

Jika menggunakan shared secret, pasang:

bunx wrangler secret put BITESHIP_WEBHOOK_SECRET --config wrangler.toml

Pastikan validasi webhook sesuai mekanisme autentikasi yang digunakan oleh implementasi VELORA.

4.5 Shipping Origin

Alamat gudang atau toko disimpan di D1.

Pengaturan dapat dilakukan melalui dashboard admin pada:

/admin/pengaturan

Pastikan alamat, kota, provinsi, kode pos, dan nomor telepon sudah benar sebelum melakukan pengujian ongkir.

---

5. Worker Secrets — Referensi Produksi

Daftar berikut merupakan referensi nama secret. Tidak semua secret perlu diunggah ulang jika sudah tersedia.

Secret| Fungsi
"VITE_FIREBASE_API_KEY"| Firebase Web API Key
"VITE_FIREBASE_AUTH_DOMAIN"| Firebase Auth Domain
"VITE_FIREBASE_PROJECT_ID"| Firebase Web Project ID
"VITE_FIREBASE_STORAGE_BUCKET"| Firebase Storage Bucket
"VITE_FIREBASE_MESSAGING_SENDER_ID"| Firebase Sender ID
"VITE_FIREBASE_APP_ID"| Firebase Web App ID
"VITE_FIREBASE_DATABASE_URL"| Firebase Realtime Database URL
"VITE_FIREBASE_VAPID_KEY"| Firebase Web Push VAPID
"FIREBASE_PROJECT_ID"| Firebase Admin Project ID
"FIREBASE_CLIENT_EMAIL"| Service Account Email
"FIREBASE_PRIVATE_KEY"| Service Account Private Key
"DUITKU_MERCHANT_CODE"| Duitku Merchant Code
"DUITKU_API_KEY"| Duitku API Key
"BITESHIP_API_KEY"| Biteship API Key
"BITESHIP_WEBHOOK_SECRET"| Biteship Webhook Secret
"EMAIL_API_KEY"| Email Provider API Key
"EMAIL_FROM"| Email pengirim
"SUPERADMIN_EMAIL"| Email administrator utama
"SESSION_SECRET"| Session signing secret

Untuk secret tambahan, gunakan nama yang benar-benar dibaca oleh kode backend.

Jangan menganggap semua variabel yang ada di dokumentasi otomatis sudah digunakan oleh aplikasi. Periksa implementasi environment/configuration sebelum menambahkan variabel baru.

---

6. Deployment Produksi

6.1 Deployment normal

Perintah utama deployment VELORA:

bun run deploy

Script ini menjalankan:

1. TypeScript typecheck.
2. Build frontend dan server.
3. Deployment Cloudflare Worker.
4. Upload static assets.

Output deployment menampilkan URL Worker dan Version ID.

6.2 Apakah perlu mengisi ulang secret?

Tidak.

Setelah secret berhasil disimpan di Cloudflare Worker, secret tetap tersedia untuk deployment kode berikutnya selama menggunakan Worker dan konfigurasi yang sama.

Untuk perubahan berikut, cukup:

bun run deploy

Contoh:

- Perubahan UI/UX.
- Penambahan halaman.
- Perubahan API.
- Perbaikan bug.
- Penambahan fitur.
- Perubahan komponen frontend.
- Perubahan logika backend.

Secret hanya perlu dikelola ulang jika:

- Ada credential baru.
- Nilai secret berubah.
- Secret dihapus.
- Ada perubahan konfigurasi provider.

6.3 Migrasi D1 Produksi

Jika ada perubahan schema:

bun run db:migrate:remote

Kemudian deploy:

bun run deploy

Jangan menjalankan migrasi hanya karena ada perubahan UI atau kode yang tidak mengubah database.

6.4 Firebase Authorized Domains

Pastikan domain produksi sudah terdaftar di Firebase Authentication → Settings → Authorized domains.

Jika menggunakan domain custom, tambahkan domain tersebut juga.

---

7. Local Development

7.1 File konfigurasi lokal

File yang digunakan:

apps/web/.env
.dev.vars

Keterangan:

- "apps/web/.env": konfigurasi frontend lokal.
- ".dev.vars": environment dan secret untuk Worker lokal ketika menjalankan Wrangler.

Jangan commit file tersebut ke repository.

7.2 Install dependencies

bun install

7.3 Jalankan development server

Script "dev" pada package.json VELORA saat ini:

{
  "dev": "vite apps/web --port 5173 --strictPort"
}

Jalankan:

bun run dev

Frontend Vite berjalan di:

http://localhost:5173

Untuk menjalankan Worker lokal, gunakan konfigurasi Wrangler yang sesuai dengan workflow project. Pastikan Worker, D1, R2, KV, dan environment lokal sudah tersedia.

Jangan menganggap menjalankan Vite saja otomatis menjalankan Worker pada port 8787.

7.4 Pengujian lokal

Pastikan:

- Frontend dapat diakses.
- API dapat diakses melalui konfigurasi proxy yang digunakan project.
- Firebase Web Configuration tersedia.
- Database lokal dapat diakses.
- Credential provider menggunakan sandbox/test key.

---

8. Degradasi Tanpa Kredensial

VELORA dirancang agar provider yang belum dikonfigurasi tidak menyebabkan seluruh aplikasi crash.

Perilaku yang diharapkan:

Provider| Kondisi tanpa konfigurasi
Duitku| Pembayaran tidak dapat diproses
Biteship| Ongkir tidak tersedia atau diarahkan menghubungi admin
Firebase Auth| Autentikasi Firebase tidak aktif
Firebase RTDB| Fitur yang membutuhkan RTDB dinonaktifkan
FCM| Push notification tidak aktif
Email| Pengiriman email tidak aktif

Degradasi harus tetap memberikan pesan yang informatif kepada pengguna dan tidak menyembunyikan kegagalan penting dalam log backend.

---

9. Troubleshooting

Masalah| Pemeriksaan
Worker gagal deploy| Periksa build, TypeScript, dan konfigurasi Wrangler
D1 tidak ditemukan| Periksa "database_id" di "wrangler.toml"
R2 tidak ditemukan| Periksa nama bucket dan binding "MEDIA"
KV tidak ditemukan| Periksa ID namespace dan binding "VELORA_CACHE"
Firebase Auth tidak aktif| Periksa "/api/runtime-config" dan Firebase Authorized Domains
Runtime config HTTP 404| Pastikan kode Worker terbaru sudah dibuild dan dideploy
Runtime config HTTP 200 tetapi key kosong| Periksa nama Worker Secret dan environment yang digunakan
Firebase RTDB gagal| Periksa Database URL, security rules, dan konfigurasi service account jika backend membutuhkannya
FCM gagal registrasi| Periksa VAPID key, HTTPS, izin notifikasi, dan Service Worker
Duitku tidak tersedia| Periksa Merchant Code, API Key, dan environment
Biteship tidak tersedia| Periksa API Key, environment, dan shipping origin
Callback tidak diterima| Periksa URL webhook, konfigurasi dashboard provider, dan log Worker

9.1 Verifikasi Firebase Runtime Configuration Produksi

Gunakan perintah berikut dari Termux:

node -e 'fetch("https://velora.pribadiagus321.workers.dev/api/runtime-config").then(async r=>{const d=await r.json();const f=d.firebase??{};console.log("HTTP:",r.status);for(const k of ["apiKey","authDomain","projectId","storageBucket","messagingSenderId","appId","databaseURL","vapidKey"])console.log(k+":",f[k]?"TERSEDIA":"KOSONG")}).catch(e=>console.error("GAGAL:",e.message))'

Hasil yang diharapkan:

HTTP: 200
apiKey: TERSEDIA
authDomain: TERSEDIA
projectId: TERSEDIA
storageBucket: TERSEDIA
messagingSenderId: TERSEDIA
appId: TERSEDIA
databaseURL: TERSEDIA
vapidKey: TERSEDIA

Jangan mencetak atau membagikan nilai asli Firebase Configuration jika tidak diperlukan.

---

10. Ringkasan Workflow VELORA

Setup awal

1. Siapkan resource Cloudflare.
2. Konfigurasikan "wrangler.toml".
3. Siapkan Firebase Web App dan Firebase Admin.
4. Siapkan Duitku dan Biteship.
5. Pasang Worker Secrets.
6. Jalankan migrasi D1.
7. Build dan deploy.
8. Verifikasi endpoint, autentikasi, pembayaran, dan pengiriman.

Workflow perubahan kode berikutnya

# Masuk repository
cd ~/projects/velora-ecommerce

# Deploy perubahan kode
bun run deploy

Jika tidak ada perubahan credential atau konfigurasi provider, tidak perlu mengisi ulang secret.

Prinsip utama VELORA: konfigurasi provider disiapkan satu kali, disimpan secara aman, dan digunakan kembali pada deployment berikutnya. Perubahan kode tidak boleh memaksa developer mengulang setup credential provider.