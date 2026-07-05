import type { APIRoute } from 'astro';
import { getDB, getEnvFromLocals } from '../../../../lib/db';
import QRCode from 'qrcode';

export const GET: APIRoute = async ({ params, locals }) => {
  const env = getEnvFromLocals(locals);
  const db = await getDB(env);
  const id = params.id;

  const item = await db.prepare('SELECT sku, nama_barang, kategori, satuan, lokasi_rak, stock_saat_ini, harga_jual_eceran FROM inventory WHERE id = ?').bind(id).first() as any;
  if (!item) return new Response('Not found', { status: 404 });

  // Generate QR code as PNG data URL
  const qrDataUrl = await QRCode.toDataURL(item.sku, {
    width: 300,
    margin: 1,
    color: { dark: '#111827', light: '#ffffff' },
  });

  // Convert data URL to buffer
  const base64 = qrDataUrl.split(',')[1];
  const buffer = Buffer.from(base64, 'base64');

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `inline; filename="qr-${item.sku}.png"`,
    },
  });
};
