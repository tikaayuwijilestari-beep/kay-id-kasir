import type { APIRoute } from 'astro';
import { getDB, getEnvFromLocals } from '../../../lib/db';

// Quick stock update from QR scan
export const POST: APIRoute = async ({ request, locals }) => {
  const env = getEnvFromLocals(locals);
  const db = await getDB(env);
  const body = await request.json() as any;

  const { sku, delta } = body; // delta: +1 or -1
  if (!sku || !delta) return new Response('Missing sku or delta', { status: 400 });

  const item = await db.prepare('SELECT * FROM inventory WHERE sku = ?').bind(sku).first() as any;
  if (!item) return new Response('Item not found', { status: 404 });

  const newStock = Math.max(0, item.stock_saat_ini + delta);
  const newNilaiAset = item.harga_beli_awal * newStock;
  const newStatus = newStock <= item.batas_stok_min ? 'MENIPIS' : 'AMAN';

  await db
    .prepare(`UPDATE inventory SET stock_saat_ini = ?, nilai_aset = ?, status_stok = ?, updated_at = datetime('now') WHERE id = ?`)
    .bind(newStock, newNilaiAset, newStatus, item.id)
    .run();

  return new Response(JSON.stringify({
    success: true,
    sku: item.sku,
    nama_barang: item.nama_barang,
    old_stock: item.stock_saat_ini,
    new_stock: newStock,
    status: newStatus,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
