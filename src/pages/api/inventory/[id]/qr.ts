import type { APIRoute } from 'astro';
import { getDB, getEnvFromLocals } from '../../../../lib/db';
import QRCode from 'qrcode';

export const GET: APIRoute = async ({ params, locals, url }) => {
  const env = getEnvFromLocals(locals);
  const db = await getDB(env);
  const id = params.id;

  const item = await db.prepare('SELECT sku FROM inventory WHERE id = ?').bind(id).first() as any;
  if (!item) return new Response('Not found', { status: 404 });

  // Generate QR as SVG (public, no login required)
  const scanUrl = `${url.origin}/scan/${id}`;
  const qrSvg = await QRCode.toString(scanUrl, {
    type: 'svg',
    width: 300,
    margin: 1,
    color: { dark: '#111827', light: '#ffffff' },
  });

  return new Response(qrSvg, {
    status: 200,
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'no-cache',
    },
  });
};
