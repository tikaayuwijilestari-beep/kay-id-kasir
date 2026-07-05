import type { APIRoute } from 'astro';
import { getDB, getEnvFromLocals } from '../../../../lib/db';

export const POST: APIRoute = async ({ request, params, locals }) => {
  const env = getEnvFromLocals(locals);
  const db = await getDB(env);
  const id = params.id;

  await db.prepare('DELETE FROM inventory WHERE id = ?').bind(id).run();

  return new Response(null, {
    status: 302,
    headers: { Location: '/inventory' },
  });
};
