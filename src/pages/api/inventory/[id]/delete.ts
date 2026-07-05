import type { APIRoute } from 'astro';
import { getDB } from '../../../../lib/db';

export const POST: APIRoute = async ({ request, params }) => {
  const db = await getDB(request);
  const id = params.id;

  await db.prepare('DELETE FROM inventory WHERE id = ?').bind(id).run();

  return new Response(null, {
    status: 302,
    headers: { Location: '/inventory' },
  });
};
