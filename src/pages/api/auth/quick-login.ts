import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';
import { nanoid } from 'nanoid';

export const POST: APIRoute = async ({ request }) => {
  const db = await getDB(request);
  const formData = await request.formData();
  const name = formData.get('name') as string;
  const email = formData.get('email') as string;

  if (!name || !email) {
    return new Response('Name and email required', { status: 400 });
  }

  // Upsert user
  await db
    .prepare(
      `INSERT INTO users (id, email, name, role, last_login)
       VALUES (?, ?, ?, 'admin', datetime('now'))
       ON CONFLICT(email) DO UPDATE SET last_login = datetime('now'), name = excluded.name`
    )
    .bind(nanoid(), email, name)
    .run();

  const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first() as any;

  // Create session
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
