import type { APIRoute } from 'astro';
import { getDB, getEnvFromLocals } from '../../../../lib/db';

export const POST: APIRoute = async ({ request, locals, params }) => {
  const env = getEnvFromLocals(locals);
  const db = await getDB(env);
  const formData = await request.formData();

  const id = params.id;
  if (!id) {
    return new Response(JSON.stringify({ error: 'ID tidak ditemukan' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get existing item to preserve SKU and get category for count
  const existing = await db.prepare('SELECT * FROM inventory WHERE id = ?').bind(id).first() as any;
  if (!existing) {
    return new Response(JSON.stringify({ error: 'Barang tidak ditemukan' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const nama_barang = formData.get('nama_barang') as string || existing.nama_barang;
  const merk = formData.get('merk') as string || null;
  const kategori = formData.get('kategori') as string || existing.kategori;
  const satuan = formData.get('satuan') as string || existing.satuan;
  const lokasi_rak = formData.get('lokasi_rak') as string || null;
  const supplier = formData.get('supplier') as string || null;
  const batas_stok_min = parseInt(formData.get('batas_stok_min') as string) || existing.batas_stok_min;
  const stock_saat_ini = parseInt(formData.get('stock_saat_ini') as string) || existing.stock_saat_ini;
  const keterangan = formData.get('keterangan') as string || null;

  // Parse Indonesian number format
  const parseIDR = (val: string | null): number => {
    if (!val) return 0;
    return parseFloat(val.replace(/\./g, '').replace(/,/g, '.')) || 0;
  };

  const harga_beli_awal = parseIDR(formData.get('harga_beli_awal') as string) || existing.harga_beli_awal;
  const harga_jual_eceran = parseIDR(formData.get('harga_jual_eceran') as string) || existing.harga_jual_eceran;
  const harga_jual_grosir = parseIDR(formData.get('harga_jual_grosir') as string) || existing.harga_jual_grosir;

  const nilai_aset = harga_beli_awal * stock_saat_ini;
  const status_stok = stock_saat_ini <= batas_stok_min ? 'MENIPIS' : 'AMAN';

  await db
    .prepare(`UPDATE inventory SET
      nama_barang = ?, merk = ?, kategori = ?, satuan = ?, lokasi_rak = ?, supplier = ?,
      batas_stok_min = ?, stock_saat_ini = ?, harga_beli_awal = ?, harga_jual_eceran = ?,
      harga_jual_grosir = ?, nilai_aset = ?, status_stok = ?, keterangan = ?
      WHERE id = ?`)
    .bind(nama_barang, merk, kategori, satuan, lokasi_rak, supplier,
      batas_stok_min, stock_saat_ini, harga_beli_awal, harga_jual_eceran,
      harga_jual_grosir, nilai_aset, status_stok, keterangan, id)
    .run();

  return new Response(JSON.stringify({ success: true, nama_barang, sku: existing.sku }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
