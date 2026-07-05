import type { APIRoute } from 'astro';
import { getDB, getEnvFromLocals } from '../../../lib/db';

export const DELETE: APIRoute = async ({ url, locals }) => {
  const env = getEnvFromLocals(locals);
  const db = await getDB(env);
  
  const id = url.searchParams.get('id');
  
  try {
    if (id) {
      // Delete single record
      await db.prepare(`DELETE FROM email_history WHERE id = ?`).bind(id).run();
    } else {
      // Delete all records
      await db.prepare(`DELETE FROM email_history`).run();
    }
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
