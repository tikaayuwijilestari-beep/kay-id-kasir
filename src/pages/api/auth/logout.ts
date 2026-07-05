import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';
import { destroySession } from '../../../lib/auth';

export const GET: APIRoute = async ({ request }) => {
  const cookies = request.headers.get('cookie') || '';
  const match = cookies.match(/session=([a-zA-Z0-9_-]+)/);

  if (match) {
    try {
      const db = await getDB(request);
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
