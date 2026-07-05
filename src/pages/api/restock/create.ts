import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';
import { nanoid } from 'nanoid';

export const POST: APIRoute = async ({ request }) => {
  const db = await getDB(request);
  const contentType = request.headers.get('content-type') || '';

  let inventory_id: string, qty: number, harga_beli: number, supplier: string, tanggal: string, notes: string, auto: boolean;

  if (contentType.includes('application/json')) {
    const body = await request.json() as any;
    inventory_id = body.inventory_id;
    qty = body.qty;
    harga_beli = body.harga_beli || 0;
    supplier = body.supplier || '';
    tanggal = body.tanggal || new Date().toISOString().split('T')[0];
    notes = body.notes || '';
    auto = body.auto || false;
  } else {
    const formData = await request.formData();
    inventory_id = formData.get('inventory_id') as string;
    qty = parseInt(formData.get('qty') as string);
    harga_beli = parseFloat(formData.get('harga_beli') as string) || 0;
    supplier = formData.get('supplier') as string || '';
    tanggal = formData.get('tanggal') as string || new Date().toISOString().split('T')[0];
    notes = formData.get('notes') as string || '';
    auto = false;
  }

  // Get inventory item
  const inv = await db.prepare('SELECT * FROM inventory WHERE id = ?').bind(inventory_id).first() as any;
  if (!inv) return new Response('Item not found', { status: 404 });

  const restockId = nanoid();
  const total_biaya = harga_beli * qty;

  // Insert restock record
  await db
    .prepare(`INSERT INTO restock (id, inventory_id, sku, nama_barang, qty, harga_beli, total_biaya, supplier, tanggal, status, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(restockId, inventory_id, inv.sku, inv.nama_barang, qty, harga_beli, total_biaya, supplier || inv.supplier, tanggal, 'completed', notes)
    .run();

  // Update inventory
  const newStock = inv.stock_saat_ini + qty;
  const newNilaiAset = inv.harga_beli_awal * newStock;
  const newStatus = newStock <= inv.batas_stok_min ? 'MENIPIS' : 'AMAN';

  await db
    .prepare(`UPDATE inventory SET stock_saat_ini = ?, nilai_aset = ?, status_stok = ?, restock_needed = 0, updated_at = datetime('now')
      WHERE id = ?`)
    .bind(newStock, newNilaiAset, newStatus, inventory_id)
    .run();

  if (auto) {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(null, {
    status: 302,
    headers: { Location: '/restock' },
  });
};
