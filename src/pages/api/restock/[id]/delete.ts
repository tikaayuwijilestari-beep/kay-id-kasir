import type { APIRoute } from 'astro';
import { getDB, getEnvFromLocals } from '../../../../lib/db';

export const POST: APIRoute = async ({ request, locals, params }) => {
  const env = getEnvFromLocals(locals);
  const db = await getDB(env);
  const id = params.id;

  // Get restock record
  const restock = await db.prepare('SELECT * FROM restock WHERE id = ?').bind(id).first() as any;
  if (!restock) return new Response('Not found', { status: 404 });

  // Reverse stock update if restock was completed
  if (restock.status === 'completed') {
    const inv = await db.prepare('SELECT * FROM inventory WHERE id = ?').bind(restock.inventory_id).first() as any;
    if (inv) {
      const newStock = Math.max(0, inv.stock_saat_ini - restock.qty);
      const newNilaiAset = inv.harga_beli_awal * newStock;
      const newStatus = newStock <= inv.batas_stok_min ? 'MENIPIS' : 'AMAN';
      await db
        .prepare(`UPDATE inventory SET stock_saat_ini = ?, nilai_aset = ?, status_stok = ?, updated_at = datetime('now') WHERE id = ?`)
        .bind(newStock, newNilaiAset, newStatus, restock.inventory_id)
        .run();
    }
  }

  // Delete restock record
  await db.prepare('DELETE FROM restock WHERE id = ?').bind(id).run();

  return new Response(null, {
    status: 302,
    headers: { Location: '/restock' },
  });
};
