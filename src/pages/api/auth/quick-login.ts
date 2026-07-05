import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';
import { OWNER_EMAIL, createSession, cleanupSessions } from '../../../lib/auth';

// Quick login - RESTRICTED: only owner email allowed
// In production, remove this endpoint and use Google SSO only
export const POST: APIRoute = async ({ request }) => {
  const db = await getDB(request);
  const formData = await request.formData();
  const name = formData.get('name') as string;
  const email = formData.get('email') as string;

  if (!name || !email) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/login?error=missing_fields' },
    });
  }

  // SECURITY: Only allow owner email
  if (email !== OWNER_EMAIL) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/login?error=not_authorized' },
    });
  }

  await cleanupSessions(db);

  // Upsert user as admin
  await db
    .prepare(
      `INSERT INTO users (id, email, name, role, last_login)
       VALUES (?, ?, ?, 'admin', datetime('now'))
       ON CONFLICT(email) DO UPDATE SET last_login = datetime('now'), name = excluded.name`
    )
    .bind(crypto.randomUUID(), email, name)
    .run();

  const user = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first() as any;
  const { cookie } = await createSession(db, user.id);

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/dashboard',
      'Set-Cookie': cookie,
    },
  });
};
