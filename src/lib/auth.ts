import { getDB } from './db';

export async function getSession(request: Request) {
  const cookies = request.headers.get('cookie') || '';
  const match = cookies.match(/session=([a-zA-Z0-9_-]+)/);
  if (!match) return null;

  const token = match[1];
  const db = await getDB(request);

  const session = await db
    .prepare(
      `SELECT s.*, u.name, u.email, u.role, u.avatar_url
       FROM sessions s JOIN users u ON s.user_id = u.id
       WHERE s.token = ? AND s.expires_at > datetime('now')`
    )
    .bind(token)
    .first();

  return session as any;
}

export async function requireAuth(request: Request) {
  const user = await getSession(request);
  if (!user) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/login' },
    });
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
