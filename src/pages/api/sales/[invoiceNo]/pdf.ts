import type { APIRoute } from 'astro';
import { getDB } from '../../../../lib/db';
import { formatCurrency, formatDate } from '../../../../lib/auth';

export const GET: APIRoute = async ({ request, params }) => {
  const db = await getDB(request);
  const invoiceNo = params.invoiceNo;

  const sale = await db.prepare('SELECT * FROM sales WHERE invoice_no = ?').bind(invoiceNo).first() as any;
  if (!sale) return new Response('Invoice not found', { status: 404 });

  const items = (await db.prepare('SELECT * FROM sales_items WHERE sale_id = ?').bind(sale.id).all()).results as any[];

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
  @media print { body { padding: 20px; } }
</style></head><body>
  <div class="header">
    <div>
      <div class="brand">Kay<span>.id</span></div>
      <div style="font-size:13px;color:#666;margin-top:5px;">Toko Bangunan</div>
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
    <thead><tr><th>No</th><th>SKU</th><th>Nama Barang</th><th>Qty</th><th>Harga</th><th>Subtotal</th></tr></thead>
    <tbody>
      ${items.map((item: any, i: number) => `
        <tr>
          <td>${i + 1}</td>
          <td>${item.sku}</td>
          <td>${item.nama_barang}</td>
          <td>${item.qty}</td>
          <td>${formatCurrency(item.harga_satuan)}</td>
          <td>${formatCurrency(item.subtotal)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>
  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${formatCurrency(sale.subtotal)}</span></div>
    ${sale.discount > 0 ? `<div class="row"><span>Diskon</span><span>-${formatCurrency(sale.discount)}</span></div>` : ''}
    <div class="row grand"><span>TOTAL</span><span>${formatCurrency(sale.total)}</span></div>
    <div class="row" style="margin-top:10px;">
      <span>Pembayaran:</span>
      <span class="payment-badge pay-${sale.payment_method}">
        ${sale.payment_method === 'manual' ? 'Tunai' : sale.payment_method === 'qris' ? 'QRIS' : 'Transfer'}
      </span>
    </div>
  </div>
  ${sale.notes ? `<div style="margin-top:20px;font-size:13px;"><strong>Catatan:</strong> ${sale.notes}</div>` : ''}
  <div class="footer">
    <p>Terima kasih atas pembelian Anda di Kay.id Toko Bangunan</p>
    <p>Invoice ini dicetak secara otomatis pada ${new Date().toLocaleString('id-ID')}</p>
  </div>
  <script>window.onload = () => window.print();</script>
</body></html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html' },
  });
};
