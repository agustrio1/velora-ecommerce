import { type NotificationPrefs, ROLE_CODE, type RoleCode, type UserAddress, type UserProfile } from '@velora/shared';
import type { FirebaseIdentity } from '../auth/firebase';
import { type Row, bool, jsonParse, num, optNum, optStr, str, toIso } from '../lib/db';
import { uuid } from '../lib/ids';

export interface UserRecord {
  id: string;
  firebaseUid: string;
  email: string;
  phone: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  status: 'active' | 'disabled';
  emailVerified: boolean;
  roles: RoleCode[];
  createdAt: string | null;
}

const DEFAULT_PREFS: NotificationPrefs = {
  orderUpdates: true,
  payments: true,
  shipping: true,
  promotions: false,
  email: true,
};

const SELECT_USER = `
  SELECT u.*, GROUP_CONCAT(r.code, ',') AS role_codes
  FROM users u
  LEFT JOIN user_roles ur ON ur.user_id = u.id
  LEFT JOIN roles r ON r.id = ur.role_id`;

export function mapUser(row: Record<string, unknown> | null): UserRecord | null {
  if (!row) return null;
  const codes = str(row.role_codes);
  return {
    id: str(row.id),
    firebaseUid: str(row.firebase_uid),
    email: str(row.email),
    phone: optStr(row.phone),
    displayName: optStr(row.display_name),
    avatarUrl: optStr(row.avatar_url),
    status: row.status === 'disabled' ? 'disabled' : 'active',
    emailVerified: bool(row.email_verified),
    roles: codes ? (codes.split(',').filter(Boolean) as RoleCode[]) : [],
    createdAt: toIso(row.created_at),
  };
}

/**
 * Idempotently mirrors a verified Firebase identity into D1.
 * Firebase owns credentials; D1 owns roles, orders and profiles.
 */
export async function ensureUser(db: D1Database, identity: FirebaseIdentity): Promise<UserRecord> {
  const existing = mapUser(
    await db
      .prepare(`${SELECT_USER} WHERE u.firebase_uid = ?1 GROUP BY u.id`)
      .bind(identity.uid)
      .first<Record<string, unknown>>(),
  );

  if (existing) {
    // Keep the mirrored contact fields fresh (user may have changed them in Firebase).
    const changes: string[] = [];
    const params: unknown[] = [];
    if (identity.email && identity.email !== existing.email) {
      changes.push('email = ?');
      params.push(identity.email);
    }
    if (identity.phone && identity.phone !== existing.phone) {
      changes.push('phone = ?');
      params.push(identity.phone);
    }
    if (identity.name && !existing.displayName) {
      changes.push('display_name = ?');
      params.push(identity.name);
    }
    if (identity.picture && !existing.avatarUrl) {
      changes.push('avatar_url = ?');
      params.push(identity.picture);
    }
    if (identity.emailVerified && !existing.emailVerified) {
      changes.push('email_verified = 1');
    }
    changes.push('last_login_at = ?');
    params.push(new Date().toISOString().replace('T', ' ').slice(0, 19));
    params.push(existing.id);
    await db
      .prepare(`UPDATE users SET ${changes.join(', ')} WHERE id = ?`)
      .bind(...params)
      .run();

    if (!existing.roles.length) await grantRole(db, existing.id, ROLE_CODE.CUSTOMER);
    const refreshed = mapUser(
      await db
        .prepare(`${SELECT_USER} WHERE u.id = ?1 GROUP BY u.id`)
        .bind(existing.id)
        .first<Record<string, unknown>>(),
    );
    return refreshed ?? existing;
  }

  // Also look up by email (handles placeholder uid from seed:admin bootstrap).
  const emailMatch = identity.email
    ? mapUser(
        await db
          .prepare(`${SELECT_USER} WHERE u.email = ?1 GROUP BY u.id`)
          .bind(identity.email)
          .first<Record<string, unknown>>(),
      )
    : null;

  if (emailMatch) {
    // Link the real Firebase UID to the existing record.
    await db
      .prepare('UPDATE users SET firebase_uid = ?1, last_login_at = ?2 WHERE id = ?3')
      .bind(identity.uid, new Date().toISOString().replace('T', ' ').slice(0, 19), emailMatch.id)
      .run();
    if (!emailMatch.roles.length) await grantRole(db, emailMatch.id, ROLE_CODE.CUSTOMER);
    const refreshed = mapUser(
      await db
        .prepare(`${SELECT_USER} WHERE u.id = ?1 GROUP BY u.id`)
        .bind(emailMatch.id)
        .first<Record<string, unknown>>(),
    );
    return refreshed ?? { ...emailMatch, firebaseUid: identity.uid };
  }

  const id = uuid();
  const email = identity.email ?? `user-${identity.uid.slice(0, 10)}@velora.local`;
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  await db.batch([
    db
      .prepare(
        `INSERT INTO users (id, firebase_uid, email, phone, display_name, avatar_url, status, email_verified, last_login_at, created_at, updated_at)
         VALUES (?1,?2,?3,?4,?5,?6,'active',?7,?8,?9,?10)`,
      )
      .bind(
        id,
        identity.uid,
        email,
        identity.phone,
        identity.name ?? email.split('@')[0],
        identity.picture,
        identity.emailVerified ? 1 : 0,
        now,
        now,
        now,
      ),
    db
      .prepare(
        `INSERT INTO user_profiles (user_id, full_name, locale, notification_prefs)
         VALUES (?1,?2,'id-ID',?3)`,
      )
      .bind(id, identity.name, JSON.stringify(DEFAULT_PREFS)),
    db.prepare(`INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?1,'role_customer')`).bind(id),
  ]);

  return (
    mapUser(
      await db.prepare(`${SELECT_USER} WHERE u.id = ?1 GROUP BY u.id`).bind(id).first<Record<string, unknown>>(),
    ) ?? {
      id,
      firebaseUid: identity.uid,
      email,
      phone: identity.phone,
      displayName: identity.name,
      avatarUrl: identity.picture,
      status: 'active',
      emailVerified: identity.emailVerified,
      roles: [ROLE_CODE.CUSTOMER],
      createdAt: now,
    }
  );
}

export async function findUserById(db: D1Database, id: string): Promise<UserRecord | null> {
  return mapUser(
    await db.prepare(`${SELECT_USER} WHERE u.id = ?1 GROUP BY u.id`).bind(id).first<Record<string, unknown>>(),
  );
}

export async function findUserByFirebaseUid(db: D1Database, uid: string): Promise<UserRecord | null> {
  return mapUser(
    await db
      .prepare(`${SELECT_USER} WHERE u.firebase_uid = ?1 GROUP BY u.id`)
      .bind(uid)
      .first<Record<string, unknown>>(),
  );
}

export async function roleCodes(db: D1Database, userId: string): Promise<RoleCode[]> {
  const r = await db
    .prepare(
      `SELECT GROUP_CONCAT(rc.code, ',') AS codes
       FROM user_roles ur JOIN roles rc ON rc.id = ur.role_id WHERE ur.user_id = ?1`,
    )
    .bind(userId)
    .first<{ codes: string | null }>();
  return r?.codes ? (r.codes.split(',').filter(Boolean) as RoleCode[]) : [];
}

export async function grantRole(db: D1Database, userId: string, code: RoleCode, grantedBy?: string | null) {
  const role = await db.prepare(`SELECT id FROM roles WHERE code = ?1`).bind(code).first<{ id: string }>();
  if (!role) return false;
  await db
    .prepare(`INSERT OR IGNORE INTO user_roles (user_id, role_id, granted_by) VALUES (?1,?2,?3)`)
    .bind(userId, role.id, grantedBy ?? null)
    .run();
  return true;
}

export async function revokeRole(db: D1Database, userId: string, code: RoleCode) {
  await db
    .prepare(`DELETE FROM user_roles WHERE user_id = ?1 AND role_id = (SELECT id FROM roles WHERE code = ?2)`)
    .bind(userId, code)
    .run();
}

export async function isAdmin(db: D1Database, userId: string): Promise<boolean> {
  const codes = await roleCodes(db, userId);
  return codes.includes(ROLE_CODE.ADMIN) || codes.includes(ROLE_CODE.SUPER_ADMIN);
}

export async function setUserStatus(db: D1Database, userId: string, status: 'active' | 'disabled') {
  await db
    .prepare(`UPDATE users SET status = ?1, updated_at = ?2 WHERE id = ?3`)
    .bind(status, new Date().toISOString().replace('T', ' ').slice(0, 19), userId)
    .run();
}

/* ------------------------------- preferences ------------------------------ */

export async function getNotificationPrefs(db: D1Database, userId: string): Promise<NotificationPrefs> {
  const row = await db
    .prepare(`SELECT notification_prefs FROM user_profiles WHERE user_id = ?1`)
    .bind(userId)
    .first<{ notification_prefs: string }>();
  return { ...DEFAULT_PREFS, ...jsonParse<Partial<NotificationPrefs>>(row?.notification_prefs, {}) };
}

export async function setNotificationPrefs(
  db: D1Database,
  userId: string,
  prefs: NotificationPrefs,
): Promise<NotificationPrefs> {
  await db
    .prepare(`UPDATE user_profiles SET notification_prefs = ?1, updated_at = ?2 WHERE user_id = ?3`)
    .bind(JSON.stringify(prefs), new Date().toISOString().replace('T', ' ').slice(0, 19), userId)
    .run();
  return prefs;
}

export async function getProfile(db: D1Database, userId: string): Promise<UserProfile> {
  const row = await db.prepare(`SELECT * FROM user_profiles WHERE user_id = ?1`).bind(userId).first<Row>();
  return {
    userId,
    fullName: optStr(row?.full_name),
    nickname: optStr(row?.nickname),
    gender: (optStr(row?.gender) as UserProfile['gender']) ?? null,
    birthday: optStr(row?.birthday),
    preferredSize: optStr(row?.preferred_size),
    heightCm: optNum(row?.height_cm),
    weightKg: optNum(row?.weight_kg),
    locale: str(row?.locale, 'id-ID'),
    newsletter: bool(row?.newsletter),
  };
}

export async function updateProfile(db: D1Database, userId: string, input: Partial<UserProfile>) {
  await db
    .prepare(
      `INSERT INTO user_profiles (user_id, full_name, nickname, gender, birthday, preferred_size, height_cm, weight_kg, locale, newsletter, notification_prefs, updated_at)
       VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'{}',?11)
       ON CONFLICT(user_id) DO UPDATE SET
         full_name = COALESCE(excluded.full_name, user_profiles.full_name),
         nickname = COALESCE(excluded.nickname, user_profiles.nickname),
         gender = COALESCE(excluded.gender, user_profiles.gender),
         birthday = COALESCE(excluded.birthday, user_profiles.birthday),
         preferred_size = COALESCE(excluded.preferred_size, user_profiles.preferred_size),
         height_cm = COALESCE(excluded.height_cm, user_profiles.height_cm),
         weight_kg = COALESCE(excluded.weight_kg, user_profiles.weight_kg),
         newsletter = excluded.newsletter,
         updated_at = excluded.updated_at`,
    )
    .bind(
      userId,
      input.fullName ?? null,
      input.nickname ?? null,
      input.gender ?? null,
      input.birthday ?? null,
      input.preferredSize ?? null,
      input.heightCm ?? null,
      input.weightKg ?? null,
      input.locale ?? 'id-ID',
      input.newsletter ? 1 : 0,
      new Date().toISOString().replace('T', ' ').slice(0, 19),
    )
    .run();
}

/* -------------------------------- addresses ------------------------------- */

function mapAddress(row: Row): UserAddress {
  return {
    id: str(row.id),
    userId: str(row.user_id),
    label: str(row.label),
    recipientName: str(row.recipient_name),
    phone: str(row.phone),
    province: str(row.province),
    city: str(row.city),
    district: str(row.district),
    postcode: str(row.postcode),
    detail: str(row.detail),
    areaId: optStr(row.area_id),
    isDefaultShipping: bool(row.is_default_shipping),
    createdAt: toIso(row.created_at) ?? '',
  };
}

export async function listAddresses(db: D1Database, userId: string): Promise<UserAddress[]> {
  const rows = await db
    .prepare(`SELECT * FROM user_addresses WHERE user_id = ?1 ORDER BY is_default_shipping DESC, created_at DESC`)
    .bind(userId)
    .all<Row>();
  return (rows.results ?? []).map(mapAddress);
}

export async function getAddress(db: D1Database, userId: string, id: string): Promise<UserAddress | null> {
  const row = await db
    .prepare(`SELECT * FROM user_addresses WHERE id = ?1 AND user_id = ?2`)
    .bind(id, userId)
    .first<Row>();
  return row ? mapAddress(row) : null;
}

const ADDRESS_COLUMNS = `id,user_id,label,recipient_name,phone,province,city,district,postcode,detail,area_id,is_default_shipping,created_at`;

export async function createAddress(db: D1Database, userId: string, a: AddressInput2): Promise<UserAddress> {
  const id = uuid();
  const existingCount = num(
    await db
      .prepare(`SELECT COUNT(*) AS c FROM user_addresses WHERE user_id = ?1`)
      .bind(userId)
      .first<{ c: number }>()
      .then((r) => r?.c ?? 0),
    0,
  );
  const isDefault = existingCount === 0 || Boolean(a.isDefaultShipping);
  if (isDefault)
    await db.prepare(`UPDATE user_addresses SET is_default_shipping = 0 WHERE user_id = ?1`).bind(userId).run();
  await db
    .prepare(`INSERT INTO user_addresses (${ADDRESS_COLUMNS}) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)`)
    .bind(
      id,
      userId,
      a.label,
      a.recipientName,
      a.phone,
      a.province,
      a.city,
      a.district,
      a.postcode,
      a.detail,
      a.areaId ?? null,
      isDefault ? 1 : 0,
      new Date().toISOString().replace('T', ' ').slice(0, 19),
    )
    .run();
  return (await getAddress(db, userId, id))!;
}

export async function updateAddress(
  db: D1Database,
  userId: string,
  id: string,
  a: AddressInput2,
): Promise<UserAddress | null> {
  if (a.isDefaultShipping) {
    await db.prepare(`UPDATE user_addresses SET is_default_shipping = 0 WHERE user_id = ?1`).bind(userId).run();
  }
  await db
    .prepare(
      `UPDATE user_addresses SET label=?3,recipient_name=?4,phone=?5,province=?6,city=?7,district=?8,postcode=?9,detail=?10,area_id=?11,is_default_shipping=?12,updated_at=?13
       WHERE id = ?1 AND user_id = ?2`,
    )
    .bind(
      id,
      userId,
      a.label,
      a.recipientName,
      a.phone,
      a.province,
      a.city,
      a.district,
      a.postcode,
      a.detail,
      a.areaId ?? null,
      a.isDefaultShipping ? 1 : 0,
      new Date().toISOString().replace('T', ' ').slice(0, 19),
    )
    .run();
  return getAddress(db, userId, id);
}

export async function deleteAddress(db: D1Database, userId: string, id: string): Promise<void> {
  await db.prepare(`DELETE FROM user_addresses WHERE id = ?1 AND user_id = ?2`).bind(id, userId).run();
  const remaining = await listAddresses(db, userId);
  if (!remaining.some((r) => r.isDefaultShipping) && remaining[0]) {
    await db.prepare(`UPDATE user_addresses SET is_default_shipping = 1 WHERE id = ?1`).bind(remaining[0].id).run();
  }
}

export interface AddressInput2 {
  label: string;
  recipientName: string;
  phone: string;
  province: string;
  city: string;
  district: string;
  postcode: string;
  detail: string;
  areaId?: string | null;
  isDefaultShipping?: boolean;
}

/* ------------------------------ device tokens ----------------------------- */

export async function registerDeviceToken(db: D1Database, userId: string, token: string, platform: string) {
  await db
    .prepare(
      `INSERT INTO device_tokens (id, user_id, token, platform, is_active, created_at)
       VALUES (?1,?2,?3,?4,1,?5)
       ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, platform = excluded.platform,
         is_active = 1, failure_count = 0, last_used_at = NULL`,
    )
    .bind(uuid(), userId, token, platform, new Date().toISOString().replace('T', ' ').slice(0, 19))
    .run();
}

export async function listDeviceTokens(db: D1Database, userId: string): Promise<string[]> {
  const r = await db
    .prepare(`SELECT token FROM device_tokens WHERE user_id = ?1 AND is_active = 1`)
    .bind(userId)
    .all<{ token: string }>();
  return (r.results ?? []).map((x) => x.token);
}

export async function deactivateDeviceToken(db: D1Database, token: string) {
  await db
    .prepare(`UPDATE device_tokens SET is_active = 0, failure_count = failure_count + 1 WHERE token = ?1`)
    .bind(token)
    .run();
}

export async function removeDeviceToken(db: D1Database, userId: string, token: string) {
  await db.prepare(`DELETE FROM device_tokens WHERE user_id = ?1 AND token = ?2`).bind(userId, token).run();
}
