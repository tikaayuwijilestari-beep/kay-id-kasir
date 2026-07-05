import type { APIRoute } from 'astro';
import { getDB, getEnvFromLocals } from '../../../lib/db';
import { formatCurrency, formatDate } from '../../../lib/auth';
import { Resend } from 'resend';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const env = getEnvFromLocals(locals);
    const db = await getDB(env);

    let settings = await db.prepare(`SELECT * FROM email_settings WHERE id = 'main'`).first() as any;
    const resendApiKey = settings?.resend_api_key || env.RESEND_API_KEY;
    const recipientEmails = settings?.recipient_emails || env.REPORT_EMAILS;

    if (!resendApiKey) return new Response(JSON.stringify({ error: 'Resend API Key not configured.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    if (!recipientEmails) return new Response(JSON.stringify({ error: 'Recipient emails not configured.' }), { status: 500, headers: { 'Content-Type': 'application/json' } });

    const body = await request.json().catch(() => ({}));
    const type = body.type || 'weekly';
    const resend = new Resend(resendApiKey);

    // Date range
    let startDate: string, endDate: string, periodLabel: string;
    const today = new Date();
    if (type === 'weekly') {
      const start = new Date(today); start.setDate(today.getDate() - 6);
      startDate = start.toISOString().split('T')[0];
      endDate = today.toISOString().split('T')[0];
      periodLabel = `${formatDate(startDate)} - ${formatDate(endDate)}`;
    } else {
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      startDate = start.toISOString().split('T')[0];
      endDate = end.toISOString().split('T')[0];
      const months = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
      periodLabel = `${months[start.getMonth()]} ${start.getFullYear()}`;
    }

    const dateFilter = `AND tanggal BETWEEN '${startDate}' AND '${endDate}'`;

    // Summary
    const summary = await db.prepare(`SELECT COUNT(*) as total_transactions, COALESCE(SUM(total), 0) as total_revenue, COALESCE(SUM(discount), 0) as total_discount, COALESCE(SUM(subtotal), 0) as total_subtotal FROM sales WHERE 1=1 ${dateFilter}`).first() as any;

    // COGS & Profit
    const profitData = await db.prepare(`SELECT COALESCE(SUM(si.harga_beli * si.qty), 0) as total_cogs FROM sales_items si JOIN sales s ON si.sale_id = s.id WHERE s.tanggal BETWEEN '${startDate}' AND '${endDate}'`).first() as any;
    const totalCOGS = profitData?.total_cogs || 0;
    const totalRevenue = summary?.total_revenue || 0;
    const totalProfit = totalRevenue - totalCOGS;
    const profitMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0';

    // Top products
    const topProducts = (await db.prepare(`SELECT si.sku, si.nama_barang, SUM(si.qty) as qty_sold, SUM(si.subtotal) as revenue, SUM((si.harga_satuan - COALESCE(si.harga_beli, 0)) * si.qty) as profit FROM sales_items si JOIN sales s ON si.sale_id = s.id WHERE s.tanggal BETWEEN '${startDate}' AND '${endDate}' GROUP BY si.sku ORDER BY qty_sold DESC LIMIT 10`).all()).results as any[];

    // Daily breakdown
    const dailyBreakdown = (await db.prepare(`SELECT tanggal, COUNT(*) as transactions, COALESCE(SUM(total), 0) as revenue FROM sales WHERE 1=1 ${dateFilter} GROUP BY tanggal ORDER BY tanggal ASC`).all()).results as any[];

    // All transactions with items
    const salesList = (await db.prepare(`SELECT s.invoice_no, s.tanggal, s.total, s.subtotal, s.discount, s.customer_name, s.payment_method, s.total_items FROM sales s WHERE 1=1 ${dateFilter} ORDER BY s.tanggal DESC, s.created_at DESC LIMIT 100`).all()).results as any[];

    const salesWithItems = [];
    for (const sale of salesList) {
      const items = (await db.prepare(`SELECT si.nama_barang, si.sku, si.qty, si.harga_satuan, si.subtotal FROM sales_items si JOIN sales s ON si.sale_id = s.id WHERE s.invoice_no = ?`).bind(sale.invoice_no).all()).results as any[];
      salesWithItems.push({ ...sale, items });
    }

    // Generate PDF
    const pdfBytes = await generatePDF(type, periodLabel, summary, totalCOGS, totalProfit, profitMargin, topProducts, dailyBreakdown, salesWithItems);

    // Send email with PDF attachment
    const recipients = recipientEmails.split(',').map((e: string) => e.trim()).filter((e: string) => e);

    try {
      const result = await resend.emails.send({
        from: 'KAY ID Laporan <onboarding@resend.dev>',
        to: recipients,
        subject: `📊 Laporan ${type === 'weekly' ? 'Mingguan' : 'Bulanan'} - ${periodLabel}`,
        html: buildEmailHTML(type, periodLabel, summary, totalCOGS, totalProfit, profitMargin),
        attachments: [{
          filename: `Laporan_${type === 'weekly' ? 'Mingguan' : 'Bulanan'}_${periodLabel.replace(/\s/g, '_')}.pdf`,
          content: btoa(String.fromCharCode(...new Uint8Array(pdfBytes))),
        }],
      });

      const historyId = crypto.randomUUID();
      await db.prepare(`INSERT INTO email_history (id, type, period_label, recipients, status) VALUES (?, ?, ?, ?, 'sent')`).bind(historyId, type, periodLabel, recipients.join(', ')).run();

      return new Response(JSON.stringify({ success: true, message: `Laporan PDF berhasil dikirim ke ${recipients.length} email`, result }), { headers: { 'Content-Type': 'application/json' } });
    } catch (error: any) {
      const historyId = crypto.randomUUID();
      await db.prepare(`INSERT INTO email_history (id, type, period_label, recipients, status, error_message) VALUES (?, ?, ?, ?, 'failed', ?)`).bind(historyId, type, periodLabel, recipients.join(', '), error.message).run();
      return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
  } catch (outerError: any) {
    return new Response(JSON.stringify({ error: outerError.message || 'Internal server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
};

export const GET: APIRoute = async ({ url, locals }) => {
  const type = url.searchParams.get('type') || 'weekly';
  const fakeRequest = new Request(url, { method: 'POST', body: JSON.stringify({ type }), headers: { 'Content-Type': 'application/json' } });
  return POST({ request: fakeRequest, locals, url, params: {} } as any);
};

// ===== PDF GENERATION (LANDSCAPE) =====
async function generatePDF(
  type: string, periodLabel: string, summary: any, totalCOGS: number, totalProfit: number, profitMargin: string,
  topProducts: any[], dailyBreakdown: any[], salesWithItems: any[]
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const title = type === 'weekly' ? 'Laporan Mingguan' : 'Laporan Bulanan';

  // Colors
  const primary = rgb(79/255, 70/255, 229/255);
  const primaryLight = rgb(238/255, 242/255, 255/255);
  const success = rgb(16/255, 185/255, 129/255);
  const danger = rgb(239/255, 68/255, 68/255);
  const warning = rgb(245/255, 158/255, 11/255);
  const gray50 = rgb(248/255, 250/255, 252/255);
  const gray100 = rgb(241/255, 245/255, 249/255);
  const gray200 = rgb(226/255, 232/255, 240/255);
  const gray500 = rgb(100/255, 116/255, 139/255);
  const gray700 = rgb(51/255, 65/255, 85/255);
  const gray900 = rgb(15/255, 23/255, 42/255);
  const white = rgb(1, 1, 1);

  // LANDSCAPE A4: 842 x 595
  const W = 842;
  const H = 595;
  const M = 36;
  const contentW = W - 2 * M;
  const halfW = (contentW - 20) / 2; // for side-by-side sections

  const totalTx = summary?.total_transactions || 0;
  const totalRevenue = summary?.total_revenue || 0;
  const totalDiscount = summary?.total_discount || 0;

  // === PAGE 1: Summary + Charts side by side ===
  let page = pdfDoc.addPage([W, H]);
  let y = H - M;

  // Header bar (slim)
  page.drawRectangle({ x: 0, y: y - 42, width: W, height: 58, color: primary });
  page.drawText('KAY ID TOKO BANGUNAN', { x: M, y: y - 5, size: 16, font: fontBold, color: white });
  page.drawText(`${title}  •  ${periodLabel}`, { x: M, y: y - 24, size: 10, font: font, color: rgb(0.8, 0.8, 1) });
  // Total revenue on right
  page.drawText(formatCurrency(totalRevenue), { x: W - M - 180, y: y - 10, size: 18, font: fontBold, color: white });
  page.drawText('TOTAL PENDAPATAN', { x: W - M - 150, y: y - 26, size: 8, font: font, color: rgb(0.7, 0.7, 0.9) });
  y -= 58;

  // Financial Summary - 5 cards (landscape = more room)
  y -= 10;
  const cardW = (contentW - 4 * 8) / 5;
  const cards = [
    { label: 'Transaksi', value: `${totalTx}`, sub: `Rata-rata: ${formatCurrency(totalTx > 0 ? totalRevenue / totalTx : 0)}`, bg: primaryLight, accent: primary },
    { label: 'Pendapatan', value: formatCurrency(totalRevenue), sub: `Diskon: ${formatCurrency(totalDiscount)}`, bg: rgb(209/255, 250/255, 229/255), accent: success },
    { label: 'Modal (HPP)', value: formatCurrency(totalCOGS), sub: `COGS`, bg: rgb(254/255, 243/255, 199/255), accent: warning },
    { label: 'Profit Bersih', value: formatCurrency(totalProfit), sub: `Margin: ${profitMargin}%`, bg: rgb(167/255, 243/255, 208/255), accent: success },
    { label: 'Item Terjual', value: `${salesWithItems.reduce((s, sale) => s + sale.items.reduce((a: number, it: any) => a + it.qty, 0), 0)}`, sub: `${new Set(salesWithItems.flatMap(s => s.items.map((it: any) => it.sku))).size} produk unik`, bg: rgb(224/255, 231/255, 255/255), accent: rgb(99/255, 102/255, 241/255) },
  ];

  cards.forEach((c, i) => {
    const cx = M + i * (cardW + 8);
    page.drawRectangle({ x: cx, y: y - 50, width: cardW, height: 50, color: c.bg });
    page.drawText(c.label, { x: cx + 8, y: y - 13, size: 7, font: font, color: gray500 });
    page.drawText(c.value, { x: cx + 8, y: y - 30, size: 10, font: fontBold, color: c.accent });
    page.drawText(c.sub, { x: cx + 8, y: y - 42, size: 6, font: font, color: gray500 });
  });
  y -= 62;

  // Side-by-side: Daily Revenue (left) + Top Products (right)
  const chartY = y;

  // LEFT: Daily Revenue Chart
  if (dailyBreakdown.length > 0) {
    const leftX = M;
    let ly = chartY;
    page.drawRectangle({ x: leftX, y: ly - 16, width: halfW, height: 20, color: gray100 });
    page.drawText('PENDAPATAN HARIAN', { x: leftX + 8, y: ly - 12, size: 8, font: fontBold, color: gray700 });
    ly -= 28;

    const maxRev = Math.max(...dailyBreakdown.map((d: any) => d.revenue));
    const barMaxW = halfW - 100;
    const barH = 12;

    dailyBreakdown.sort((a: any, b: any) => a.tanggal.localeCompare(b.tanggal));
    dailyBreakdown.forEach((d: any) => {
      if (ly < 50) return;
      const pct = maxRev > 0 ? d.revenue / maxRev : 0;
      const dateShort = new Date(d.tanggal).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
      page.drawText(dateShort, { x: leftX + 4, y: ly - 1, size: 6, font: font, color: gray500 });

      const barW = pct * barMaxW;
      page.drawRectangle({ x: leftX + 50, y: ly - 4, width: barW, height: barH, color: primary });
      page.drawRectangle({ x: leftX + 50 + barW, y: ly - 4, width: barMaxW - barW, height: barH, color: gray100 });

      page.drawText(formatCurrency(d.revenue), { x: leftX + 50 + barMaxW + 5, y: ly, size: 6, font: fontBold, color: gray700 });
      ly -= barH + 3;
    });

    // Daily total line
    ly -= 4;
    page.drawLine({ start: { x: leftX + 4, y: ly + 8 }, end: { x: leftX + halfW - 4, y: ly + 8 }, thickness: 0.5, color: gray200 });
    page.drawText('Total:', { x: leftX + 4, y: ly - 4, size: 7, font: fontBold, color: gray700 });
    page.drawText(formatCurrency(totalRevenue), { x: leftX + halfW - 80, y: ly - 4, size: 7, font: fontBold, color: success });
  }

  // RIGHT: Top Products Chart
  if (topProducts.length > 0) {
    const rightX = M + halfW + 20;
    let ry = chartY;
    page.drawRectangle({ x: rightX, y: ry - 16, width: halfW, height: 20, color: gray100 });
    page.drawText('PRODUK TERLARIS', { x: rightX + 8, y: ry - 12, size: 8, font: fontBold, color: gray700 });
    ry -= 28;

    const maxQty = Math.max(...topProducts.map((p: any) => p.qty_sold));
    const barMaxW = halfW - 160;
    const barH = 12;
    const colors = [warning, primary, success, rgb(139/255, 92/255, 246/255), rgb(236/255, 72/255, 153/255), gray500];

    topProducts.slice(0, 8).forEach((p: any, i: number) => {
      if (ry < 50) return;
      const pct = maxQty > 0 ? p.qty_sold / maxQty : 0;
      const medal = i === 0 ? '1.' : i === 1 ? '2.' : i === 2 ? '3.' : `${i+1}.`;
      const color = colors[Math.min(i, colors.length - 1)];

      page.drawText(medal, { x: rightX + 4, y: ry, size: 6, font: fontBold, color: gray700 });
      const name = p.nama_barang.length > 20 ? p.nama_barang.substring(0, 20) + '..' : p.nama_barang;
      page.drawText(name, { x: rightX + 20, y: ry, size: 6, font: font, color: gray700 });

      const barW = pct * barMaxW;
      page.drawRectangle({ x: rightX + 70, y: ry - 3, width: barW, height: barH, color: color });

      page.drawText(`${p.qty_sold}`, { x: rightX + 70 + barMaxW + 5, y: ry, size: 6, font: fontBold, color: gray700 });
      page.drawText(formatCurrency(p.revenue), { x: rightX + 70 + barMaxW + 30, y: ry, size: 6, font: font, color: gray500 });
      ry -= barH + 3;
    });

    // Total products line
    ry -= 4;
    page.drawLine({ start: { x: rightX + 4, y: ry + 8 }, end: { x: rightX + halfW - 4, y: ry + 8 }, thickness: 0.5, color: gray200 });
    page.drawText('Total Produk:', { x: rightX + 4, y: ry - 4, size: 7, font: fontBold, color: gray700 });
    const totalQtySold = topProducts.reduce((s, p) => s + p.qty_sold, 0);
    page.drawText(`${totalQtySold} unit`, { x: rightX + halfW - 60, y: ry - 4, size: 7, font: fontBold, color: primary });
  }

  // === PAGE 2+: Transaction Detail (Landscape) ===
  if (salesWithItems.length > 0) {
    page = pdfDoc.addPage([W, H]);
    y = H - M;

    // Header
    page.drawRectangle({ x: 0, y: y - 30, width: W, height: 45, color: primary });
    page.drawText('DETAIL TRANSAKSI', { x: M, y: y - 5, size: 14, font: fontBold, color: white });
    page.drawText(`${salesWithItems.length} transaksi  •  Periode: ${periodLabel}`, { x: M, y: y - 20, size: 8, font: font, color: rgb(0.8, 0.8, 1) });
    page.drawText(formatCurrency(totalRevenue), { x: W - M - 120, y: y - 10, size: 14, font: fontBold, color: white });
    y -= 42;

    // Table columns (landscape = wider)
    const colX = { no: M, inv: M + 25, tgl: M + 160, item: M + 260, qty: M + 470, harga: M + 520, total: M + 620, buyer: M + 710 };
    const rowH = 13;

    // Table header
    page.drawRectangle({ x: M, y: y - 16, width: contentW, height: 16, color: primary });
    page.drawText('No', { x: colX.no + 2, y: y - 12, size: 7, font: fontBold, color: white });
    page.drawText('Invoice', { x: colX.inv, y: y - 12, size: 7, font: fontBold, color: white });
    page.drawText('Tanggal', { x: colX.tgl, y: y - 12, size: 7, font: fontBold, color: white });
    page.drawText('Nama Barang', { x: colX.item, y: y - 12, size: 7, font: fontBold, color: white });
    page.drawText('Qty', { x: colX.qty, y: y - 12, size: 7, font: fontBold, color: white });
    page.drawText('Harga Satuan', { x: colX.harga, y: y - 12, size: 7, font: fontBold, color: white });
    page.drawText('Subtotal', { x: colX.total, y: y - 12, size: 7, font: fontBold, color: white });
    page.drawText('Pembeli', { x: colX.buyer, y: y - 12, size: 7, font: fontBold, color: white });
    y -= 20;

    let no = 1;
    let grandTotal = 0;
    let grandQty = 0;

    for (const sale of salesWithItems) {
      if (y < 55) { page = pdfDoc.addPage([W, H]); y = H - M; }
      const dateStr = formatDate(sale.tanggal);

      // Sale header (merged row)
      page.drawRectangle({ x: M, y: y - rowH, width: contentW, height: rowH, color: no % 2 === 0 ? gray50 : white, borderWidth: 0 });
      page.drawText(`${no}`, { x: colX.no + 2, y: y - rowH + 3, size: 7, font: font, color: gray500 });
      page.drawText(sale.invoice_no, { x: colX.inv, y: y - rowH + 3, size: 7, font: fontBold, color: gray900 });
      page.drawText(dateStr, { x: colX.tgl, y: y - rowH + 3, size: 7, font: font, color: gray500 });
      page.drawText(formatCurrency(sale.total), { x: colX.total, y: y - rowH + 3, size: 7, font: fontBold, color: success });
      page.drawText(sale.customer_name || '-', { x: colX.buyer, y: y - rowH + 3, size: 7, font: font, color: gray500 });
      grandTotal += sale.total;
      y -= rowH + 1;

      // Items
      for (const item of sale.items) {
        if (y < 45) { page = pdfDoc.addPage([W, H]); y = H - M; }
        const itemName = item.nama_barang.length > 35 ? item.nama_barang.substring(0, 35) + '..' : item.nama_barang;
        page.drawText(itemName, { x: colX.item + 8, y: y - rowH + 3, size: 6, font: font, color: gray500 });
        page.drawText(`${item.qty}x`, { x: colX.qty, y: y - rowH + 3, size: 6, font: font, color: gray500 });
        page.drawText(formatCurrency(item.harga_satuan), { x: colX.harga, y: y - rowH + 3, size: 6, font: font, color: gray500 });
        page.drawText(formatCurrency(item.subtotal), { x: colX.total, y: y - rowH + 3, size: 6, font: font, color: gray500 });
        grandQty += item.qty;
        y -= rowH + 1;
      }

      if (sale.discount > 0) {
        if (y < 45) { page = pdfDoc.addPage([W, H]); y = H - M; }
        page.drawText(`Diskon: -${formatCurrency(sale.discount)}`, { x: colX.item + 8, y: y - 8, size: 6, font: font, color: danger });
        y -= 10;
      }

      page.drawLine({ start: { x: M, y: y }, end: { x: W - M, y: y }, thickness: 0.3, color: gray200 });
      y -= 3;
      no++;
    }

    // GRAND TOTAL ROW
    y -= 5;
    if (y < 70) { page = pdfDoc.addPage([W, H]); y = H - M; }
    page.drawRectangle({ x: M, y: y - 28, width: contentW, height: 32, color: primary });
    page.drawText('GRAND TOTAL', { x: M + 10, y: y - 10, size: 9, font: fontBold, color: white });
    page.drawText(`${salesWithItems.length} transaksi`, { x: M + 10, y: y - 22, size: 7, font: font, color: rgb(0.8, 0.8, 1) });
    page.drawText(`${grandQty} item`, { x: colX.qty, y: y - 10, size: 8, font: fontBold, color: white });
    page.drawText(formatCurrency(grandTotal), { x: colX.total, y: y - 10, size: 10, font: fontBold, color: white });
    page.drawText(`Profit: ${formatCurrency(totalProfit)}`, { x: colX.buyer, y: y - 10, size: 8, font: fontBold, color: rgb(167/255, 243/255, 208/255) });
    page.drawText(`Margin: ${profitMargin}%`, { x: colX.buyer, y: y - 22, size: 6, font: font, color: rgb(0.8, 0.8, 1) });
    y -= 40;
  }

  // Footer
  if (y < 40) { page = pdfDoc.addPage([W, H]); y = H - M; }
  y -= 10;
  page.drawLine({ start: { x: M, y: y }, end: { x: W - M, y: y }, thickness: 0.5, color: gray200 });
  y -= 12;
  page.drawText('Laporan otomatis dari sistem KAY ID Toko Bangunan', { x: M, y, size: 7, font: font, color: gray500 });
  page.drawText(`Dicetak: ${new Date().toLocaleString('id-ID')}`, { x: W - M - 150, y, size: 7, font: font, color: gray500 });

  return await pdfDoc.save();
}

// ===== SIMPLE EMAIL HTML (with note about PDF attachment) =====
function buildEmailHTML(type: string, periodLabel: string, summary: any, totalCOGS: number, totalProfit: number, profitMargin: string): string {
  const title = type === 'weekly' ? 'Laporan Mingguan' : 'Laporan Bulanan';
  const totalRevenue = summary?.total_revenue || 0;
  const totalTx = summary?.total_transactions || 0;

  return `
<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:20px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:540px;margin:0 auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#4f46e5 0%,#6366f1 100%);padding:32px;text-align:center;">
      <div style="font-size:32px;margin-bottom:8px;">📊</div>
      <h1 style="margin:0;font-size:22px;font-weight:800;color:white;">${title}</h1>
      <p style="margin:6px 0 0;font-size:14px;color:rgba(255,255,255,0.85);">KAY ID TOKO BANGUNAN</p>
      <div style="display:inline-block;margin-top:12px;padding:6px 16px;background:rgba(255,255,255,0.2);border-radius:20px;font-size:13px;font-weight:600;color:white;">${periodLabel}</div>
    </div>
    <div style="padding:24px;">
      <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
        <tr>
          <td style="padding:12px;background:#eef2ff;border-radius:8px 0 0 0;text-align:center;width:50%;">
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:600;">Transaksi</div>
            <div style="font-size:24px;font-weight:800;color:#0f172a;">${totalTx}</div>
          </td>
          <td style="padding:12px;background:#ecfdf5;border-radius:0 8px 0 0;text-align:center;width:50%;">
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:600;">Pendapatan</div>
            <div style="font-size:20px;font-weight:800;color:#059669;">${formatCurrency(totalRevenue)}</div>
          </td>
        </tr>
        <tr>
          <td style="padding:12px;background:#fff7ed;text-align:center;">
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:600;">Modal</div>
            <div style="font-size:20px;font-weight:800;color:#ea580c;">${formatCurrency(totalCOGS)}</div>
          </td>
          <td style="padding:12px;background:#f0fdf4;text-align:center;">
            <div style="font-size:11px;color:#64748b;text-transform:uppercase;font-weight:600;">Profit (Margin ${profitMargin}%)</div>
            <div style="font-size:20px;font-weight:800;color:#059669;">${formatCurrency(totalProfit)}</div>
          </td>
        </tr>
      </table>
      <div style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:16px;text-align:center;margin-bottom:20px;">
        <div style="font-size:14px;font-weight:700;color:#4338ca;margin-bottom:4px;">📎 Laporan PDF Terlampir</div>
        <div style="font-size:12px;color:#64748b;">Laporan lengkap dengan grafik, detail barang, dan daftar pembeli sudah dilampirkan dalam format PDF.</div>
      </div>
    </div>
    <div style="background:#f8fafc;padding:16px 24px;text-align:center;border-top:1px solid #e2e8f0;">
      <p style="margin:0;font-size:11px;color:#94a3b8;">Email otomatis dari <strong>KAY ID Toko Bangunan</strong></p>
    </div>
  </div>
</body></html>`;
}
