import { getDB, type Env } from './db';

// Only this email can login as admin
export const ALLOWED_EMAILS = ['tikaayuwijilestari@gmail.com'];

export const OWNER_EMAIL = 'tikaayuwijilestari@gmail.com';

export async function getSession(env: Env, request: Request) {
  const cookies = request.headers.get('cookie') || '';
  const match = cookies.match(/session=([a-zA-Z0-9_-]+)/);
  if (!match) return null;

  const token = match[1];
  const db = await getDB(env);

  const session = await db
    .prepare(
      `SELECT s.*, u.name, u.email, u.role, u.avatar_url
       FROM sessions s JOIN users u ON s.user_id = u.id
       WHERE s.token = ? AND s.expires_at > datetime('now')`
    )
    .bind(token)
    .first() as any;

  return session || null;
}

export async function requireAuth(env: Env, request: Request) {
  const user = await getSession(env, request);
  if (!user) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/login' },
    });
  }
  return user;
}

export async function requireAdmin(env: Env, request: Request) {
  const user = await requireAuth(env, request);
  if (user instanceof Response) return user;
  if (user.email !== OWNER_EMAIL) {
    return new Response('Access denied. Admin only.', { status: 403 });
  }
  return user;
}

export function formatCurrency(n: number): string {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);
}

export function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function generateInvoiceNo(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `INV-${y}${m}${d}-${rand}`;
}

export function generateSKU(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const prefix = chars[Math.floor(Math.random() * 26)] + chars[Math.floor(Math.random() * 26)] + chars[Math.floor(Math.random() * 26)];
  const num = Math.floor(Math.random() * 9000 + 1000);
  return `${prefix}-${num}`;
}

// Generate cryptographically secure session token
export function generateSessionToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

// Create a session for a user
export async function createSession(db: D1Database, userId: string): Promise<{ token: string; cookie: string }> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const sessionId = generateSessionToken().slice(0, 16);

  await db
    .prepare('INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)')
    .bind(sessionId, userId, token, expiresAt)
    .run();

  const cookie = `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}; Secure`;
  return { token, cookie };
}

// Destroy a session
export async function destroySession(db: D1Database, token: string): Promise<void> {
  await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
}

// Clean up expired sessions
export async function cleanupSessions(db: D1Database): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();
}
