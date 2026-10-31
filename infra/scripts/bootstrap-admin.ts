/**
 * Links a real Firebase Authentication account to the VELORA super administrator role.
 *
 *   bun run seed:admin -- --email you@example.com [--uid <firebase-uid>] [--remote]
 *
 * Roles are read from D1 on every request (mw/auth.ts -> requireAdmin), never from the
 * ID token, so granting a role here is the only step needed. The Firebase account itself
 * must already exist: create it in the Firebase console (or sign up through the storefront)
 * and pass its uid with --uid if it differs from the email.
 *
 * The statement is executed through wrangler so the script works against both the local
 * D1 replica and the remote database without any Node-only database driver.
 */
import { spawnSync } from 'node:child_process';

type Options = { email: string; uid?: string; name?: string; remote: boolean };

function parseArgs(argv: string[]): Options {
  const args: Options = { email: '', remote: false };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--email') args.email = String(argv[(i += 1)] ?? '');
    else if (token === '--uid') args.uid = argv[(i += 1)];
    else if (token === '--name') args.name = argv[(i += 1)];
    else if (token === '--remote') args.remote = true;
  }
  return args;
}

const opts = parseArgs(process.argv.slice(2));

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(opts.email)) {
  console.error('Gunakan: bun run seed:admin -- --email admin@domain.com [--uid <firebase-uid>] [--remote]');
  process.exit(1);
}

const quote = (v: string | undefined | null): string =>
  v === undefined || v === null ? 'NULL' : `'${v.replace(/'/g, "''")}'`;

/** Uppercase-free uid keeps the placeholder obvious in the users table. */
const uid = opts.uid ?? `bootstrap:${opts.email.toLowerCase()}`;
const displayName = opts.name ?? opts.email.split('@')[0];
const userId = `usr_admin_${opts.email
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '_')
  .slice(0, 40)}`;

const sql = [
  `INSERT INTO users (id, firebase_uid, email, display_name, status, email_verified, created_at, updated_at)
   VALUES (${quote(userId)}, ${quote(uid)}, ${quote(opts.email)}, ${quote(displayName)}, 'active', 1, datetime('now'), datetime('now'))
   ON CONFLICT(email) DO UPDATE SET
     firebase_uid = excluded.firebase_uid,
     display_name = COALESCE(users.display_name, excluded.display_name),
     status = 'active',
     updated_at = datetime('now');`,
  // `INSERT OR IGNORE` on the join table: re-running never duplicates a grant.
  `INSERT OR IGNORE INTO user_roles (user_id, role_id, granted_at)
   SELECT id, 'role_super_admin', datetime('now') FROM users WHERE email = ${quote(opts.email)};`,
  `INSERT OR IGNORE INTO user_roles (user_id, role_id, granted_at)
   SELECT id, 'role_admin', datetime('now') FROM users WHERE email = ${quote(opts.email)};`,
  `INSERT OR IGNORE INTO user_profiles (user_id, full_name, locale, notification_prefs, updated_at)
   SELECT id, ${quote(displayName)}, 'id-ID', '{}', datetime('now') FROM users WHERE email = ${quote(opts.email)};`,
].join('\n');

const command = ['x', 'wrangler', 'd1', 'execute', 'velora-db', opts.remote ? '--remote' : '--local', '--command', sql];

console.log(`Granting super_admin to ${opts.email} on the ${opts.remote ? 'remote' : 'local'} database...`);
const result = spawnSync('bun', command, { stdio: 'inherit' });

if (result.status !== 0) {
  console.error('\nwrangler gagal menjalankan perintah. SQL di bawah bisa dijalankan manual:');
  console.error(sql);
  process.exit(result.status ?? 1);
}

console.log(`
Selesai. Akun ${opts.email} sekarang super administrator.
Uid yang ditautkan: ${uid}
${opts.uid ? '' : 'Catatan: tanpa --uid, nilai di atas adalah placeholder. Setelah akun Firebase dibuat,\nganti dengan uid asli (Firebase Console > Authentication > user > UID) dan jalankan ulang perintah ini.'}
`);
