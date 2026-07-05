import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';
import { requireAdmin, createSession, cleanupSessions } from '../../../lib/auth';

// Create member - admin only
export const POST: APIRoute = async ({ request }) => {
  const user = await requireAdmin(request);
  if (user instanceof Response) return user;

  const db = await getDB(request);
  const formData = await request.formData();
  const name = formData.get('name') as string;
  const email = formData.get('email') as string;
  const role = formData.get('role') as string || 'kasir';

  if (!name || !email) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/members?error=missing_fields' },
    });
  }

  // Check if email already exists
  const existing = await db.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/members?error=email_exists' },
    });
  }

  await cleanupSessions(db);

  const userId = crypto.randomUUID();
  await db
    .prepare('INSERT INTO users (id, email, name, role, created_at, last_login) VALUES (?, ?, ?, ?, datetime("now"), datetime("now"))')
    .bind(userId, email, name, role)
    .run();

  return new Response(null, {
    status: 302,
    headers: { Location: '/members' },
  });
};
