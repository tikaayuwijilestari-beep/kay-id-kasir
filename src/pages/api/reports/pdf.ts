import type { APIRoute } from 'astro';
import { getDB, getEnvFromLocals } from '../../../lib/db';
import { formatCurrency, formatDate } from '../../../lib/auth';

export const GET: APIRoute = async ({ request, locals }) => {
  const env = getEnvFromLocals(locals);
  const db = await getDB(env);
  const url = new URL(request.url);
  const period = url.searchParams.get('period') || 'daily';
  const dateFrom = url.searchParams.get('from') || new Date().toISOString().split('T')[0];
  const dateTo = url.searchParams.get('to') || new Date().toISOString().split('T')[0];

  let dateFilter = '';
  let periodLabel = '';
  if (period === 'daily') {
    dateFilter = `AND tanggal = '${dateFrom}'`;
    periodLabel = `Harian - ${formatDate(dateFrom)}`;
  } else if (period === 'weekly') {
    dateFilter = `AND tanggal BETWEEN date('${dateFrom}', '-6 days') AND '${dateFrom}'`;
    periodLabel = `Mingguan - ${formatDate(dateFrom)}`;
  } else if (period === 'monthly') {
    const ym = dateFrom.substring(0, 7);
    dateFilter = `AND tanggal LIKE '${ym}%'`;
    periodLabel = `Bulanan - ${ym}`;
  } else {
    dateFilter = `AND tanggal BETWEEN '${dateFrom}' AND '${dateTo}'`;
    periodLabel = `${formatDate(dateFrom)} s/d ${formatDate(dateTo)}`;
  }

  const sales = (await db.prepare(`SELECT * FROM sales WHERE 1=1 ${dateFilter} ORDER BY tanggal DESC`).all()).results as any[];
  const summary = await db.prepare(`
    SELECT COUNT(*) as total_transactions, COALESCE(SUM(total), 0) as total_revenue,
    COALESCE(SUM(discount), 0) as total_discount FROM sales WHERE 1=1 ${dateFilter}
  `).first() as any;

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Laporan Keuangan - Kay.id</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
  .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #1a56db; padding-bottom: 15px; }
  .brand { font-size: 28px; font-weight: bold; color: #1a56db; }
  h2 { color: #333; margin: 15px 0 10px; font-size: 16px; }
  .period { color: #666; font-size: 14px; margin-bottom: 20px; }
  .stats { display: flex; gap: 15px; margin-bottom: 25px; }
  .stat { flex: 1; background: #f8f9fa; padding: 15px; border-radius: 8px; text-align: center; }
  .stat-label { font-size: 12px; color: #666; }
  .stat-value { font-size: 20px; font-weight: bold; color: #1a56db; margin-top: 5px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { background: #1a56db; color: white; padding: 10px; text-align: left; font-size: 12px; }
  td { padding: 8px 10px; border-bottom: 1px solid #eee; font-size: 12px; }
  .footer { margin-top: 30px; text-align: center; font-size: 11px; color: #999; }
  @media print { body { padding: 20px; } }
</style></head><body>
  <div class="header">
    <div class="brand">Kay.id</div>
    <div style="font-size:14px;color:#666;">Toko Bangunan - Laporan Keuangan</div>
  </div>
  <div class="period"><strong>Periode:</strong> ${periodLabel} | Dicetak: ${new Date().toLocaleString('id-ID')}</div>
  <div class="stats">
    <div class="stat"><div class="stat-label">Total Transaksi</div><div class="stat-value">${summary?.total_transactions || 0}</div></div>
    <div class="stat"><div class="stat-label">Total Pendapatan</div><div class="stat-value">${formatCurrency(summary?.total_revenue || 0)}</div></div>
    <div class="stat"><div class="stat-label">Total Diskon</div><div class="stat-value">${formatCurrency(summary?.total_discount || 0)}</div></div>
  </div>
  <h2>Detail Transaksi</h2>
  <table>
    <thead><tr><th>No</th><th>Invoice</th><th>Tanggal</th><th>Items</th><th>Subtotal</th><th>Diskon</th><th>Total</th><th>Pembayaran</th></tr></thead>
    <tbody>
      ${sales.map((s: any, i: number) => `
        <tr>
          <td>${i + 1}</td><td>${s.invoice_no}</td><td>${s.tanggal}</td><td>${s.total_items}</td>
          <td>${formatCurrency(s.subtotal)}</td><td>${formatCurrency(s.discount)}</td>
          <td><strong>${formatCurrency(s.total)}</strong></td>
          <td>${s.payment_method === 'manual' ? 'Tunai' : s.payment_method === 'qris' ? 'QRIS' : 'Transfer'}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  <div class="footer">
    <p>Laporan ini digenerate otomatis oleh sistem Kay.id</p>
  </div>
  <script>window.onload = () => window.print();</script>
</body></html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' },
  });
};
