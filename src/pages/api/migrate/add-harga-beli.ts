import type { APIRoute } from 'astro';
import { getDB, getEnvFromLocals } from '../../../lib/db';
import { requireAdmin } from '../../../lib/auth';

export const GET: APIRoute = async ({ request, locals }) => {
  const env = getEnvFromLocals(locals);
  const user = await requireAdmin(env, request);
  if (user instanceof Response) return user;

  const db = await getDB(env);

  try {
    // Check if column already exists
    const columns = await db.prepare("PRAGMA table_info(sales_items)").all();
    const hasHargaBeli = columns.results.some((c: any) => c.name === 'harga_beli');

    if (!hasHargaBeli) {
      await db.prepare("ALTER TABLE sales_items ADD COLUMN harga_beli REAL DEFAULT 0").run();
      return new Response(JSON.stringify({ success: true, message: 'Column harga_beli added' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, message: 'Column already exists' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
