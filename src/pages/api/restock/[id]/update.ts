import type { APIRoute } from 'astro';
import { getDB, getEnvFromLocals } from '../../../../lib/db';

export const POST: APIRoute = async ({ request, locals, params }) => {
  const env = getEnvFromLocals(locals);
  const db = await getDB(env);
  const id = params.id;
  const formData = await request.formData();

  const restock = await db.prepare('SELECT * FROM restock WHERE id = ?').bind(id).first() as any;
  if (!restock) return new Response('Not found', { status: 404 });

  const newQty = parseInt(formData.get('qty') as string) || restock.qty;
  const newHargaBeli = parseFloat(formData.get('harga_beli') as string) || restock.harga_beli;
  const newSupplier = (formData.get('supplier') as string) || restock.supplier;
  const newTanggal = (formData.get('tanggal') as string) || restock.tanggal;
  const newNotes = (formData.get('notes') as string) || restock.notes;
  const newTotalBiaya = newHargaBeli * newQty;

  // If qty changed and status was completed, adjust inventory stock
  if (newQty !== restock.qty && restock.status === 'completed') {
    const inv = await db.prepare('SELECT * FROM inventory WHERE id = ?').bind(restock.inventory_id).first() as any;
    if (inv) {
      // Reverse old qty, add new qty
      const newStock = Math.max(0, inv.stock_saat_ini - restock.qty + newQty);
      const newNilaiAset = inv.harga_beli_awal * newStock;
      const newStatus = newStock <= inv.batas_stok_min ? 'MENIPIS' : 'AMAN';
      await db
        .prepare(`UPDATE inventory SET stock_saat_ini = ?, nilai_aset = ?, status_stok = ?, updated_at = datetime('now') WHERE id = ?`)
        .bind(newStock, newNilaiAset, newStatus, restock.inventory_id)
        .run();
    }
  }

  // Update restock record
  await db
    .prepare(`UPDATE restock SET qty = ?, harga_beli = ?, total_biaya = ?, supplier = ?, tanggal = ?, notes = ? WHERE id = ?`)
    .bind(newQty, newHargaBeli, newTotalBiaya, newSupplier, newTanggal, newNotes, id)
    .run();

  return new Response(null, {
    status: 302,
    headers: { Location: '/restock' },
  });
};
