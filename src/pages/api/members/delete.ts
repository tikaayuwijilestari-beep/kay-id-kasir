import type { APIRoute } from 'astro';
import { getDB, getEnvFromLocals } from '../../../lib/db';
import { requireAdmin, OWNER_EMAIL } from '../../../lib/auth';

// Delete member - admin only, cannot delete owner
export const POST: APIRoute = async ({ request, locals }) => {
  const env = getEnvFromLocals(locals);
  const user = await requireAdmin(env, request);
  if (user instanceof Response) return user;

  const db = await getDB(env);
  const formData = await request.formData();
  const userId = formData.get('user_id') as string;

  if (!userId) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/members?error=missing_id' },
    });
  }

  // Cannot delete owner
  const targetUser = await db.prepare('SELECT email FROM users WHERE id = ?').bind(userId).first() as any;
  if (!targetUser) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/members?error=not_found' },
    });
  }

  if (targetUser.email === OWNER_EMAIL) {
    return new Response(null, {
      status: 302,
      headers: { Location: '/members?error=cannot_delete_owner' },
    });
  }

  // Delete user sessions first
  await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId).run();
  // Delete user
  await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();

  return new Response(null, {
    status: 302,
    headers: { Location: '/members' },
  });
};
