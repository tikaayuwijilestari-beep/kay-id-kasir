import type { APIRoute } from 'astro';
import { getDB, getEnvFromLocals } from '../../../lib/db';
import { destroySession } from '../../../lib/auth';

export const GET: APIRoute = async ({ request, locals }) => {
  const env = getEnvFromLocals(locals);
  const cookies = request.headers.get('cookie') || '';
  const match = cookies.match(/session=([a-zA-Z0-9_-]+)/);

  if (match) {
    try {
      const db = await getDB(env);
      await destroySession(db, match[1]);
    } catch {
      // Ignore DB errors on logout
    }
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: '/login',
      'Set-Cookie': 'session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
    },
  });
};
