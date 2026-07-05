import type { APIRoute } from 'astro';
import { getDB, getEnvFromLocals } from '../../../../lib/db';
import { formatCurrency, formatDate } from '../../../../lib/auth';

export const GET: APIRoute = async ({ request, params, locals }) => {
  const env = getEnvFromLocals(locals);
  const db = await getDB(env);
  const invoiceNo = params.invoiceNo;

  const sale = await db.prepare('SELECT * FROM sales WHERE invoice_no = ?').bind(invoiceNo).first() as any;
  if (!sale) return new Response('Invoice not found', { status: 404 });

  const items = (await db.prepare('SELECT * FROM sales_items WHERE sale_id = ?').bind(sale.id).all()).results as any[];

  // Calculate totals
  let totalCOGS = 0;
  for (const item of items) {
    totalCOGS += (item.harga_beli || 0) * item.qty;
  }
  const totalProfit = sale.total - totalCOGS;
  const profitMargin = sale.total > 0 ? ((totalProfit / sale.total) * 100).toFixed(1) : '0';

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Invoice ${invoiceNo}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 2px solid #1a56db; padding-bottom: 20px; }
  .brand { font-size: 28px; font-weight: bold; color: #1a56db; }
  .brand span { color: #333; }
  .invoice-info { text-align: right; }
  .invoice-info h2 { color: #1a56db; margin-bottom: 5px; }
  .info-row { font-size: 13px; color: #666; margin: 2px 0; }
  .customer { margin-bottom: 20px; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { background: #1a56db; color: white; padding: 10px 12px; text-align: left; font-size: 13px; }
  td { padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 13px; }
  .totals { width: 300px; margin-left: auto; }
  .totals .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 14px; }
  .totals .row.grand { font-size: 18px; font-weight: bold; border-top: 2px solid #1a56db; padding-top: 10px; margin-top: 5px; }
  .footer { margin-top: 40px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 15px; }
  .payment-badge { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: bold; }
  .pay-manual { background: #d1fae5; color: #065f46; }
  .pay-qris { background: #dbeafe; color: #1e40af; }
  .pay-transfer { background: #fef3c7; color: #92400e; }
  .stamp-container { text-align: center; margin: 40px 0 20px; }
  .stamp {
    display: inline-block;
    border: 5px double #dc2626;
    border-radius: 50%;
    width: 160px;
    height: 160px;
    position: relative;
    transform: rotate(-12deg);
    opacity: 0.85;
    box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.3), inset 0 0 0 2px rgba(220, 38, 38, 0.2);
  }
  .stamp::before {
    content: '';
    position: absolute;
    top: 10px;
    left: 10px;
    right: 10px;
    bottom: 10px;
    border: 2px solid #dc2626;
    border-radius: 50%;
    opacity: 0.6;
  }
  .stamp-text {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -60%);
    font-size: 32px;
    font-weight: 900;
    color: #dc2626;
    letter-spacing: 4px;
    font-family: 'Courier New', monospace;
    text-shadow: 1px 1px 2px rgba(220, 38, 38, 0.3);
  }
  .stamp-date {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, 40%);
    font-size: 11px;
    color: #dc2626;
    font-weight: 700;
    letter-spacing: 1px;
    font-family: Arial, sans-serif;
  }
  @media print { body { padding: 20px; } }
</style></head><body>
  <div class="header">
    <div>
      <div class="brand" style="font-size:24px;letter-spacing:1px;">KAY ID</div>
      <div style="font-size:14px;color:#333;font-weight:600;margin-top:3px;">TOKO BANGUNAN</div>
    </div>
    <div class="invoice-info">
      <h2>INVOICE</h2>
      <div class="info-row"><strong>${sale.invoice_no}</strong></div>
      <div class="info-row">Tanggal: ${formatDate(sale.tanggal)}</div>
      <div class="info-row">Kasir: ${sale.cashier_id || 'Admin'}</div>
    </div>
  </div>
  ${sale.customer_name ? `<div class="customer"><strong>Pelanggan:</strong> ${sale.customer_name}</div>` : ''}
  <table>
    <thead><tr><th>No</th><th>SKU</th><th>Nama Barang</th><th>Qty</th><th>Harga</th><th>Modal</th><th>Subtotal</th></tr></thead>
    <tbody>
      ${items.map((item: any, i: number) => `
        <tr>
          <td>${i + 1}</td>
          <td>${item.sku}</td>
          <td>${item.nama_barang}</td>
          <td>${item.qty}</td>
          <td>${formatCurrency(item.harga_satuan)}</td>
          <td style="color:#666;">${formatCurrency(item.harga_beli || 0)}</td>
          <td>${formatCurrency(item.subtotal)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${formatCurrency(sale.subtotal)}</span></div>
    ${sale.discount > 0 ? `<div class="row"><span>Diskon</span><span>-${formatCurrency(sale.discount)}</span></div>` : ''}
    <div class="row grand"><span>TOTAL</span><span>${formatCurrency(sale.total)}</span></div>
    <div class="row" style="margin-top:10px;border-top:1px solid #eee;padding-top:8px;">
      <span>Modal (COGS):</span><span style="color:#666;">${formatCurrency(totalCOGS)}</span>
    </div>
    <div class="row" style="font-weight:600;">
      <span>Keuntungan:</span><span style="color:#059669;">${formatCurrency(totalProfit)}</span>
    </div>
    <div class="row" style="font-size:12px;color:#666;">
      <span>Margin:</span><span>${profitMargin}%</span>
    </div>
    <div class="row" style="margin-top:10px;">
      <span>Pembayaran:</span>
      <span class="payment-badge pay-${sale.payment_method}">
        ${sale.payment_method === 'manual' ? 'Tunai' : sale.payment_method === 'qris' ? 'QRIS' : 'Transfer'}
      </span>
    </div>
  </div>
  ${sale.notes ? `<div style="margin-top:20px;font-size:13px;"><strong>Catatan:</strong> ${sale.notes}</div>` : ''}
  <div class="stamp-container">
    <div class="stamp">
      <div class="stamp-text">LUNAS</div>
      <div class="stamp-date">${formatDate(sale.tanggal)}</div>
    </div>
  </div>
  <div class="footer">
    <p>Terima kasih atas pembelian Anda di KAY ID TOKO BANGUNAN</p>
    <p>Invoice ini dicetak secara otomatis pada ${new Date().toLocaleString('id-ID')}</p>
  </div>
  <script>window.onload = () => window.print();</script>
</body></html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' },
  });
};
