# velora-ecommerce

VELORA — toko fashion (storefront + admin panel) yang berjalan 100% serverless di
Cloudflare Workers. Tidak ada VPS, tidak ada Docker, tidak ada Nginx.

Storefront dan API di-deploy sebagai **satu Worker**: Hono melayani `/api/*`,
`/webhooks/*`, `/media/*`, `/sitemap.xml`, `/robots.txt`, sisanya di-SSR oleh
React Router (Framework Mode).

## Stack

| Layer | Teknologi |
| --- | --- |
| Runtime | Cloudflare Workers (`nodejs_compat`), Bun sebagai package manager & task runner |
| API | Hono + Zod, TypeScript |
| Frontend | React Router v8 Framework Mode (SSR) + Vite + Tailwind CSS v4 |
| Database | Cloudflare D1 (`velora-db`) |
| Media | Cloudflare R2 (`velora-media`) |
| Cache | Cloudflare KV (`VELORA_CACHE`) |
| Auth & Push | Firebase Authentication, Realtime Database, Cloud Messaging |
| Pembayaran | Duitku |
| Pengiriman | Biteship |
| Lint/Format | Biome |

## Struktur

```
apps/api          Hono API + webhook (Worker)
apps/web          Storefront + admin (React Router SSR)
packages/shared   Schema Zod, tipe, dan konstanta yang dipakai bersama
infra/migrations  Migrasi D1 (urutan waktu, nama: <timestamp>_<slug>.sql)
infra/scripts     Bootstrap admin & utilitas
docs/             ARCHITECTURE.md, SETUP.md
tests/            Unit test (bun test)
```

## Menjalankan lokal

Prasyarat: [Bun](https://bun.sh), akun Cloudflare, dan `wrangler login`.

```bash
bun install                # instalasi dependency (workspace)
cp .env.example .env       # konfigurasi frontend (Vite)
cp .env.example .dev.vars  # secrets Worker — JANGAN di-commit

bun run db:migrate:local   # terapkan migrasi ke D1 lokal (miniflare)
bun run db:seed:local      # opsional: data contoh untuk development

bun --filter @velora/api dev   # Worker + API → http://localhost:8787
bun run dev                    # storefront/admin (Vite SSR) → http://localhost:5173
```

## Skrip yang sering dipakai

| Perintah | Fungsi |
| --- | --- |
| `bun run typecheck` | `tsc --noEmit` untuk seluruh workspace |
| `bun run lint` | Biome check |
| `bun run format` | Biome format `--write` |
| `bun test` / `bun run test` | Unit test |
| `bun run build:web` | Build SSR bundle ke `apps/web/build` |
| `bun run deploy` | Build lalu `wrangler deploy --config apps/web/build/server/wrangler.json` |
| `bun run db:migrate:remote` | Terapkan migrasi ke D1 produksi |
| `bun run seed:admin` | Bootstrap akun admin |

## Environment & secrets

- Nilai non-secret (nama brand, URL, binding) ada di `wrangler.toml` bagian `[vars]`.
- Secret lokal berada di `.dev.vars` (di-gitignore).
- Secret produksi hanya masuk lewat Worker Secrets, misalnya:

```bash
bunx wrangler secret put DUITKU_API_KEY
bunx wrangler secret put SESSION_SECRET
```

Jangan pernah mengirim `serviceAccount*.json`, `.dev.vars`, atau `.env.local` ke
repository ini — semuanya sudah ada di `.gitignore`.

## Dokumentasi

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — keputusan desain dan alur request.
- [`docs/SETUP.md`](docs/SETUP.md) — provisioning Cloudflare, Firebase, Duitku, Biteship.
- [`DOC.MD`](DOC.MD) — spesifikasi produk dan alur bisnis.
