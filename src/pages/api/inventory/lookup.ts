import type { APIRoute } from 'astro';
import { getDB, getEnvFromLocals } from '../../../lib/db';

export const GET: APIRoute = async ({ request, locals }) => {
  const env = getEnvFromLocals(locals);
  const db = await getDB(env);
  const url = new URL(request.url);
  const sku = url.searchParams.get('sku');

  if (!sku) return new Response('Missing sku', { status: 400 });

  const item = await db.prepare('SELECT id, sku, nama_barang, merk, kategori, satuan, lokasi_rak, stock_saat_ini, harga_jual_eceran, status_stok FROM inventory WHERE sku = ?').bind(sku).first() as any;
  if (!item) return new Response('Not found', { status: 404 });

  return new Response(JSON.stringify(item), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
