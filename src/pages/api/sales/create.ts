import type { APIRoute } from 'astro';
import { getDB, getEnvFromLocals } from '../../../lib/db';
import { nanoid } from 'nanoid';
import { generateInvoiceNo } from '../../../lib/auth';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getEnvFromLocals(locals);
  const db = await getDB(env);
  const body = await request.json() as any;

  const { items, paymentMethod, customerName, customerPhone, discount, notes } = body;

  if (!items || items.length === 0) {
    return new Response('Cart is empty', { status: 400 });
  }

  const invoiceNo = generateInvoiceNo();
  const saleId = nanoid();
  const today = new Date().toISOString().split('T')[0];

  let subtotal = 0;
  let totalItems = 0;

  // Calculate totals
  for (const item of items) {
    subtotal += item.price * item.qty;
    totalItems += item.qty;
  }

  const total = Math.max(0, subtotal - (discount || 0));

  // Insert sale
  await db
    .prepare(`INSERT INTO sales (id, invoice_no, tanggal, total_items, subtotal, discount, total, payment_method, customer_name, customer_phone, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(saleId, invoiceNo, today, totalItems, subtotal, discount || 0, total, paymentMethod || 'manual', customerName || null, customerPhone || null, notes || null)
    .run();

  // Insert sale items and update inventory
  for (const item of items) {
    const itemId = nanoid();
    const itemSubtotal = item.price * item.qty;

    // Get inventory to retrieve harga_beli
    const inv = await db.prepare('SELECT * FROM inventory WHERE id = ?').bind(item.id).first() as any;
    const hargaBeli = inv?.harga_beli_awal || 0;

    await db
      .prepare(`INSERT INTO sales_items (id, sale_id, inventory_id, sku, nama_barang, qty, harga_satuan, harga_beli, subtotal)
        VALUES (?,?,?,?,?,?,?,?,?)`)
      .bind(itemId, saleId, item.id, item.sku, item.name, item.qty, item.price, hargaBeli, itemSubtotal)
      .run();

    // Update inventory stock
    if (inv) {
      const newStock = Math.max(0, inv.stock_saat_ini - item.qty);
      const newStockTerjual = inv.stock_terjual + item.qty;
      const profit = (item.price - inv.harga_beli_awal) * item.qty;
      const newProfit = inv.keuntungan_penjualan + profit;
      const newNilaiTerjual = inv.nilai_barang_terjual + itemSubtotal;
      const newNilaiAset = inv.harga_beli_awal * newStock;
      const newStatus = newStock <= inv.batas_stok_min ? 'MENIPIS' : 'AMAN';

      await db
        .prepare(`UPDATE inventory SET stock_saat_ini = ?, stock_terjual = ?, keuntungan_penjualan = ?,
          nilai_barang_terjual = ?, nilai_aset = ?, status_stok = ?, updated_at = datetime('now')
          WHERE id = ?`)
        .bind(newStock, newStockTerjual, newProfit, newNilaiTerjual, newNilaiAset, newStatus, item.id)
        .run();

      // Auto-flag restock needed
      if (newStock <= inv.batas_stok_min) {
        await db
          .prepare(`UPDATE inventory SET restock_needed = 1 WHERE id = ?`)
          .bind(item.id)
          .run();
      }
    }
  }

  return new Response(JSON.stringify({ invoiceNo, saleId }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
