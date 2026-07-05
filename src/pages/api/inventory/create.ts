import type { APIRoute } from 'astro';
import { getDB, getEnvFromLocals } from '../../../lib/db';
import { nanoid } from 'nanoid';
import { generateSKU } from '../../../lib/auth';

export const POST: APIRoute = async ({ request, locals }) => {
  const env = getEnvFromLocals(locals);
  const db = await getDB(env);
  const formData = await request.formData();

  const id = nanoid();
  const kategori = formData.get('kategori') as string || 'UMM';
  const nama_barang = formData.get('nama_barang') as string;
  const merk = formData.get('merk') as string || null;
  const satuan = formData.get('satuan') as string;
  const lokasi_rak = formData.get('lokasi_rak') as string || null;
  const supplier = formData.get('supplier') as string || null;
  const batas_stok_min = parseInt(formData.get('batas_stok_min') as string) || 0;
  const stock_awal = parseInt(formData.get('stock_awal') as string) || 0;
  const harga_beli_awal = parseFloat(formData.get('harga_beli_awal') as string) || 0;
  const harga_jual_eceran = parseFloat(formData.get('harga_jual_eceran') as string) || 0;
  const harga_jual_grosir = parseFloat(formData.get('harga_jual_grosir') as string) || 0;
  const keterangan = formData.get('keterangan') as string || null;

  // Generate category-based SKU: query count of items in same category
  const countResult = await db.prepare('SELECT COUNT(*) as cnt FROM inventory WHERE kategori = ?').bind(kategori).first() as any;
  const existingCount = countResult?.cnt || 0;
  const sku = generateSKU(kategori, existingCount);

  const nilai_aset = harga_beli_awal * stock_awal;
  const status_stok = stock_awal <= batas_stok_min ? 'MENIPIS' : 'AMAN';

  await db
    .prepare(`INSERT INTO inventory (id, sku, nama_barang, merk, kategori, satuan, lokasi_rak, supplier,
      batas_stok_min, stock_awal, stock_saat_ini, harga_beli_awal, harga_jual_eceran, harga_jual_grosir,
      nilai_aset, status_stok, keterangan) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, sku, nama_barang, merk, kategori, satuan, lokasi_rak, supplier,
      batas_stok_min, stock_awal, stock_awal, harga_beli_awal, harga_jual_eceran, harga_jual_grosir,
      nilai_aset, status_stok, keterangan)
    .run();

  return new Response(JSON.stringify({ success: true, sku }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
