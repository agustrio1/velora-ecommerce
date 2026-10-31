# VELORA — Provider Setup Guide

Panduan langkah demi langkah untuk menyiapkan Cloudflare (D1, R2, KV), Firebase
(Auth, RTDB, FCM), Duitku dan Biteship — baik untuk **local dev** maupun
**produksi di Workers**.

---

## 1. Cloudflare Workers + D1 + R2 + KV

### 1.1 Prasyarat

```bash
# Install Wrangler CLI global (atau pakai `bunx wrangler` tanpa install)
bun add -g wrangler

# Login ke akun Cloudflare
bunx wrangler login
```

### 1.2 Buat resource (sekali saja, dari terminal)

```bash
# 1. D1 Database
bunx wrangler d1 create velora-db
# Catat database_id yang muncul → paste ke wrangler.toml

# 2. R2 Bucket (penyimpanan media)
bunx wrangler r2 bucket create velora-media

# 3. KV Namespace (cache)
bunx wrangler kv namespace create VELORA_CACHE
# Catat id → paste ke wrangler.toml
```

### 1.3 Update `wrangler.toml`

Ganti placeholder `00000000-...` dengan ID asli:

```toml
[[d1_databases]]
binding = "DB"
database_name = "velora-db"
database_id = "<ID_ASLI_DARI_WRANGLER>"   # ← ganti
migrations_dir = "infra/migrations"

[[kv_namespaces]]
binding = "VELORA_CACHE"
id = "<ID_ASLI_KV>"                        # ← ganti
```

### 1.4 Jalankan migrasi

```bash
# Local (miniflare SQLite untuk dev)
bun run db:migrate:local

# Remote (produksi D1)
bun run db:migrate:remote
```

### 1.5 Seed data (opsional untuk dev)

```bash
bun run db:seed:local
```

### 1.6 Deploy Worker

```bash
# Build SPA + deploy Worker ke Workers
bun run deploy
# → https://velora.<your-subdomain>.workers.dev

# Atau hanya upload tanpa deploy:
bunx wrangler deploy --dry-run --outdir dist
```

### 1.7 Dev server lokal

```bash
bun run dev
# api  → http://localhost:8787
# web  → http://localhost:5173 (Vite proxy ke :8787)
```

---

## 2. Firebase (Auth + Realtime Database + Cloud Messaging)

### 2.1 Buat Project Firebase

1. Buka https://console.firebase.google.com → **Add project** → nama `velora` → matikan Google Analytics (opsional).
2. **Web App**: Project settings → General → Your apps → klik ikon web (`</>`) → daftar →
   salin `firebaseConfig` ke `.env` frontend.

### 2.2 Aktifkan Firebase Authentication

1. Firebase Console → **Authentication** → **Sign-in method**.
2. Aktifkan **Email/Password** dan **Google**.
3. (Opsional) set authorized domain saat deploy: `velora.<subdomain>.workers.dev`.

### 2.3 Aktifkan Realtime Database

1. Firebase Console → **Realtime Database** → **Create Database** → mode **locked** (kita deploy rules sendiri).
2. Catat **Database URL** (misal `https://velora-default-rtdb.asia-southeast1.firebasedatabase.app`).
3. Deploy security rules dari repo:

```bash
# Install Firebase CLI (sekali saja)
npm i -g firebase-tools
firebase login

# Deploy rules (dari root repo — firebase.json sudah mengarah ke firebase/database.rules.json)
firebase deploy --only database
```

### 2.4 Aktifkan Cloud Messaging (FCM) + Web Push

1. Firebase Console → **Project settings** → **Cloud Messaging**:
   - Catat **Project ID**, **Sender ID**, dan **Server key** (legacy tidak dipakai, hanya untuk cek).
2. Buat **Web Push Certificate (VAPID key)**:
   - Cloud Messaging → Web Push Certificates → **Generate key pair**.
   - Salin **Key/Certificate** (VAPID public key, format `BIfN...`).

### 2.5 Service Account (server-side: FCM + RTDB REST)

1. Project settings → **Service accounts** → **Generate new private key** → JSON.
2. Dari file JSON, catat:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `client_email` → `FIREBASE_CLIENT_EMAIL`
   - `private_key` → `FIREBASE_PRIVATE_KEY` (dengan `\n` escapes tetap utuh)

### 2.6 Isi `.env` frontend (lokal: `apps/web/.env`)

```env
VITE_APP_NAME=VELORA
VITE_APP_URL=http://localhost:5173
VITE_API_BASE_URL=http://localhost:8787/api
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=velora.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=velora
VITE_FIREBASE_STORAGE_BUCKET=velora.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
VITE_FIREBASE_MEASUREMENT_ID=            # kosongkan tanpa GA
VITE_FIREBASE_DATABASE_URL=https://velora-default-rtdb.asia-southeast1.firebasedatabase.app
VITE_FIREBASE_VAPID_KEY=BI...            # ← kunci VAPID dari 2.4
```

### 2.7 `.dev.vars` Worker (local secrets, TIDAK di-commit)

Copy dari `.env.example` dan isi bagian backend. Letakkan di root repo sebagai `.dev.vars`:

```env
APP_ENV=development
APP_URL=http://localhost:8787
LOG_LEVEL=info
BRAND_NAME=VELORA
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8787
MEDIA_PUBLIC_BASE_URL=http://localhost:8787/media

DUITKU_MERCHANT_CODE=
DUITKU_API_KEY=
DUITKU_ENVIRONMENT=sandbox

BITESHIP_API_KEY=
BITESHIP_ENVIRONMENT=sandbox

FIREBASE_PROJECT_ID=velora
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@velora.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQ...\n-----END PRIVATE KEY-----\n"
FIREBASE_WEB_API_KEY=AIza...

EMAIL_PROVIDER=resend
EMAIL_API_KEY=
EMAIL_FROM=

WEBHOOK_SIGNING_SECRET=
```

> Catatan: `FIREBASE_PRIVATE_KEY` harus **satu baris** dengan `\n` escapes. Jangan pakai multiline.

---

## 3. Duitku (Payment Gateway)

### 3.1 Daftar merchant

1. Buka https://duitku.com → **Daftar Merchant** → isi data bisnis → submit.
2. Tunggu email aktivasi berisi **Merchant Code** dan **API Key**.
3. Sandbox tersedia tanpa verifikasi dokumen (langsung dari dashboard); production perlu KYC + rekening bank.

### 3.2 Konfigurasi sandbox (dev)

1. Login ke https://sandbox-merchant.duitku.com → **Settings**:
   - Copy **Merchant Code**.
   - Copy **API Key**.
   - Set **Callback URL** → `http://localhost:8787/webhooks/duitku/callback` (dev)
     atau `https://velora.<subdomain>.workers.dev/webhooks/duitku/callback` (produksi).
2. Isi `.dev.vars`:

```env
DUITKU_MERCHANT_CODE=M001234
DUITKU_API_KEY=abc123xyz...
DUITKU_ENVIRONMENT=sandbox
```

3. Production (`wrangler secret put`):

```bash
bunx wrangler secret put DUITKU_MERCHANT_CODE
# paste Merchant Code

bunx wrangler secret put DUITKU_API_KEY
# paste API Key

bunx wrangler secret put DUITKU_ENVIRONMENT
# ketik: production
```

### 3.3 Catatan integrasi

- Worker mengirim transaksi (request signature) = `HMAC(merchantCode + merchantOrderId + amount)`.
- Duitku callback (verifikasi) = `HMAC(merchantCode + amount + merchantOrderId)` — **urutan beda**.
- Status **paid** TIDAK ditetapkan dari return URL. Hanya setelah signature match + `transactionStatus` API → sukses.

---

## 4. Biteship (Shipping API)

### 4.1 Daftar

1. Buka https://biteship.com → **Sign Up** → verifikasi email → dashboard.
2. **API Keys** (dashboard → Settings → API Keys):
   - **Test key** (sandbox) — `test_xxxx`
   - **Live key** (produksi) — `live_xxxx`

### 4.2 Konfigurasi sandbox

Isi `.dev.vars`:

```env
BITESHIP_API_KEY=test_xxxxxxxxxxxxx
BITESHIP_ENVIRONMENT=sandbox
```

### 4.3 Production secrets

```bash
bunx wrangler secret put BITESHIP_API_KEY
# paste live_xxxx

bunx wrangler secret put BITESHIP_ENVIRONMENT
# ketik: production
```

### 4.4 Webhook (tracking update)

1. Biteship Dashboard → **Webhook** → set URL:
   - Dev: `http://localhost:8787/webhooks/biteship` (menggunakan ngrok / similar tunnel jika perlu).
   - Produksi: `https://velora.<subdomain>.workers.dev/webhooks/biteship`.
2. (Opsional) aktifkan shared secret → isi `BITESHIP_WEBHOOK_SECRET` di `.dev.vars` atau:

```bash
bunx wrangler secret put BITESHIP_WEBHOOK_SECRET
```

### 4.5 Origin (alamat pengiriman toko)

Worker menyimpan shipping origin di D1 (`shipping_origins` table). Set lewat admin dashboard (`/admin/pengaturan`) atau API:

```
POST /api/admin/settings/shipping-origin
{ "name": "Gudang VELORA", "address": "...", "city": "...", "province": "...", "postcode": "...", "phone": "..." }
```

---

## 5. Deploy ke Produksi (Worker)

### 5.1 Build + Deploy

```bash
# Sekali run (build SPA + deploy Worker + upload asset)
bun run deploy

# Output URL: https://velora.<your-subdomain>.workers.dev
```

### 5.2 Set production vars

Edit `wrangler.toml` bagian `[env.production.vars]`:

```toml
[env.production.vars]
APP_ENV = "production"
LOG_LEVEL = "warn"
BRAND_NAME = "VELORA"
APP_URL = "https://velora.<subdomain>.workers.dev"
CORS_ALLOWED_ORIGINS = "https://velora.<subdomain>.workers.dev"
MEDIA_PUBLIC_BASE_URL = "https://velora.<subdomain>.workers.dev/media"
```

### 5.3 Secrets (sudah dijelaskan per provider di atas)

```bash
# Firebase
bunx wrangler secret put FIREBASE_PROJECT_ID
bunx wrangler secret put FIREBASE_CLIENT_EMAIL
bunx wrangler secret put FIREBASE_PRIVATE_KEY   # satu baris, \n escapes
bunx wrangler secret put FIREBASE_WEB_API_KEY

# Duitku
bunx wrangler secret put DUITKU_MERCHANT_CODE
bunx wrangler secret put DUITKU_API_KEY

# Biteship
bunx wrangler secret put BITESHIP_API_KEY

# Optional
bunx wrangler secret put WEBHOOK_SIGNING_SECRET
bunx wrangler secret put EMAIL_API_KEY
bunx wrangler secret put EMAIL_FROM
```

### 5.4 Migrasi remote

```bash
bun run db:migrate:remote
```

### 5.5 Seed admin

```bash
bunx wrangler secret put SUPERADMIN_EMAIL
# → lalu:
bun run seed:admin
```

### 5.6 Deploy RTDB rules ke project Firebase production

```bash
firebase deploy --only database
```

### 5.7 Set authorized domain di Firebase Auth

Project settings → Authentication → Settings → **Authorized domains** → tambahkan
`velora.<subdomain>.workers.dev`.

---

## 6. Menjalankan Lokal (Development)

```bash
# 1. Pastikan .dev.vars ada di root + apps/web/.env ada

# 2. Install dependencies
bun install

# 3. Jalankan (concurrently: Worker API + Vite HMR)
bun run dev

# API   → http://localhost:8787/api/health  (200)
# Web   → http://localhost:5173
```

`bun run dev` memanggil `bun run build:web` terlebih dahulu (agar `wrangler dev`
punya asset SPA), lalu menjalankan:
- `wrangler dev --ip 0.0.0.0 --port 8787` (miniflare: D1 SQLite + R2 local + KV).
- Vite dev server (`--port 5173`) dengan proxy `/api`, `/webhooks`, `/media` → :8787.

---

## 7. Degradasi Tanpa Kredensial

Aplikasi dirancang tetap **jalan tanpa error** meskipun provider belum di-setup:
- Duitku belum diisi → halaman checkout tetap muncul, hanya tidak bisa submit.
- Biteship belum diisi → ongkir ditampilkan sebagai "Hubungi admin".
- Firebase belum diisi → auth offline (skip), RTDB chat disabled, FCM skip.
- Email belum diisi → notifikasi hanya in-app (log D1), tanpa error.

Semua degradasi terjadi **silently** tanpa crash, karena `env.ts → flags()`
mengembalikan `configured: false` per provider.

---

## 8. Ringkasan variabel

| Key | File | Type | Contoh |
| --- | ---- | ---- | ------ |
| `VITE_FIREBASE_API_KEY` | `apps/web/.env` | Public | `AIzaSyD...` |
| `VITE_FIREBASE_DATABASE_URL` | `apps/web/.env` | Public | `https://velora-default-rtdb...` |
| `VITE_FIREBASE_VAPID_KEY` | `apps/web/.env` | Public | `BI...` (FCM web push) |
| `FIREBASE_PROJECT_ID` | `.dev.vars` / Secret | Secret | `velora` |
| `FIREBASE_CLIENT_EMAIL` | `.dev.vars` / Secret | Secret | `firebase-adminsdk-...` |
| `FIREBASE_PRIVATE_KEY` | `.dev.vars` / Secret | Secret | `-----BEGIN PRIVATE KEY-----...` |
| `DUITKU_MERCHANT_CODE` | `.dev.vars` / Secret | Secret | `M001234` |
| `DUITKU_API_KEY` | `.dev.vars` / Secret | Secret | `abc123...` |
| `BITESHIP_API_KEY` | `.dev.vars` / Secret | Secret | `test_xxx` / `live_xxx` |
| `WEBHOOK_SIGNING_SECRET` | `.dev.vars` / Secret | Secret | random hex |
| `APP_URL` | `wrangler.toml [vars]` | Non-secret | `https://velora.workers.dev` |
| `CORS_ALLOWED_ORIGINS` | `wrangler.toml [vars]` | Non-secret | comma-separated |

---

## 9. Troubleshooting

| Gejala | Solusi |
| ------ | ------ |
| `wrangler dev` gagal "symbolic link cannot be followed" (Windows) | Aktifkan **Developer Mode** → Settings → Privacy & Security → For developers → Developer Mode ON. Atau jalankan via WSL. |
| `wrangler dev` "No database with id..." | Pastikan `database_id` di `wrangler.toml` diganti ke ID asli (bukan `00000000...`). |
| `wrangler deploy` "Cannot find module" | Pastikan `bun install` berhasil dan `main = "apps/api/src/index.ts"` benar. |
| Checkout "Layanan payment belum tersedia" | `DUITKU_MERCHANT_CODE` atau `DUITKU_API_KEY` kosong. |
| Shipping "Ongkir belum tersedia" | `BITESHIP_API_KEY` kosong atau belum set shipping origin. |
| Chat "Realtime Database belum dikonfigurasi" | `FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY` belum lengkap di `.dev.vars`. |
| FCM token registration gagal tanpa error | Normal — FCM tidak aktif di browser yang tidak support push. Cek `VITE_FIREBASE_VAPID_KEY` terisi. |
