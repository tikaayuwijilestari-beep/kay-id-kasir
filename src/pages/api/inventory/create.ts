import type { APIRoute } from 'astro';
import { getDB } from '../../../lib/db';
import { nanoid } from 'nanoid';
import { generateSKU } from '../../../lib/auth';

export const POST: APIRoute = async ({ request }) => {
  const db = await getDB(request);
  const formData = await request.formData();

  const id = nanoid();
  const sku = generateSKU();
  const barcode = (formData.get('barcode') as string) || null;
  const nama_barang = formData.get('nama_barang') as string;
  const merk = formData.get('merk') as string || null;
  const kategori = formData.get('kategori') as string || null;
  const satuan = formData.get('satuan') as string;
  const lokasi_rak = formData.get('lokasi_rak') as string || null;
  const supplier = formData.get('supplier') as string || null;
  const batas_stok_min = parseInt(formData.get('batas_stok_min') as string) || 0;
  const stock_awal = parseInt(formData.get('stock_awal') as string) || 0;
  const harga_beli_awal = parseFloat(formData.get('harga_beli_awal') as string) || 0;
  const harga_jual_eceran = parseFloat(formData.get('harga_jual_eceran') as string) || 0;
  const harga_jual_grosir = parseFloat(formData.get('harga_jual_grosir') as string) || 0;
  const keterangan = formData.get('keterangan') as string || null;

  const nilai_aset = harga_beli_awal * stock_awal;
  const status_stok = stock_awal <= batas_stok_min ? 'MENIPIS' : 'AMAN';

  await db
    .prepare(`INSERT INTO inventory (id, sku, barcode, nama_barang, merk, kategori, satuan, lokasi_rak, supplier,
      batas_stok_min, stock_awal, stock_saat_ini, harga_beli_awal, harga_jual_eceran, harga_jual_grosir,
      nilai_aset, status_stok, keterangan) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(id, sku, barcode, nama_barang, merk, kategori, satuan, lokasi_rak, supplier,
      batas_stok_min, stock_awal, stock_awal, harga_beli_awal, harga_jual_eceran, harga_jual_grosir,
      nilai_aset, status_stok, keterangan)
    .run();

  return new Response(null, {
    status: 302,
    headers: { Location: '/inventory' },
  });
};
