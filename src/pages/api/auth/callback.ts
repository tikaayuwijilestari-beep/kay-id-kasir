import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';
import { nanoid } from 'nanoid';

// Google OAuth callback
export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');

  if (!code) {
    return new Response('No code provided', { status: 400 });
  }

  // Exchange code for token (in production, use env vars for client_id/secret)
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: '',
      client_secret: '',
      redirect_uri: url.origin + '/api/auth/callback',
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenRes.ok) {
    return new Response('Failed to exchange code', { status: 400 });
  }

  const tokenData = await tokenRes.json() as any;
  const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });
  const userInfo = await userInfoRes.json() as any;

  const db = await getDB(request);

  await db
    .prepare(
      `INSERT INTO users (id, email, name, role, avatar_url, last_login)
       VALUES (?, ?, ?, 'kasir', ?, datetime('now'))
       ON CONFLICT(email) DO UPDATE SET last_login = datetime('now'), avatar_url = excluded.avatar_url`
    )
    .bind(nanoid(), userInfo.email, userInfo.name, userInfo.picture)
    .run();

  const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(userInfo.email).first() as any;

  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  await db
    .prepare('INSERT INTO sessions (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)')
    .bind(nanoid(), user.id, token, expiresAt)
    .run();

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/dashboard',
      'Set-Cookie': `session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`,
    },
  });
};
