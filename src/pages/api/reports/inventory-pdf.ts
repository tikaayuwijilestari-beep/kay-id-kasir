import type { APIRoute } from 'astro';
import { getDB, getEnvFromLocals } from '../../../lib/db';
import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';

export const GET: APIRoute = async ({ request, locals }) => {
  const env = getEnvFromLocals(locals);
  const db = await getDB(env);
  const url = new URL(request.url);
  const type = url.searchParams.get('type') || 'all';

  let query = 'SELECT sku, nama_barang, merk, kategori, satuan, lokasi_rak, stock_saat_ini, batas_stok_min, harga_beli_awal, harga_jual_eceran, nilai_aset, status_stok FROM inventory';
  const params: string[] = [];

  if (type === 'low') {
    query += ' WHERE stock_saat_ini <= batas_stok_min';
  } else if (type === 'safe') {
    query += ' WHERE stock_saat_ini > batas_stok_min';
  }

  query += ' ORDER BY kategori ASC, nama_barang ASC';

  const items = params.length > 0
    ? (await db.prepare(query).bind(...params).all()).results as any[]
    : (await db.prepare(query).all()).results as any[];

  // Create PDF
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = PageSizes.A4[0]; // landscape width
  const pageHeight = PageSizes.A4[1]; // landscape height
  // Use landscape: swap width and height
  const W = pageHeight;
  const H = pageWidth;

  const margin = 30;
  const fontSize = 6.5;
  const headerFontSize = 7;
  const titleFontSize = 14;
  const subFontSize = 8;
  const rowHeight = 16;
  const headerHeight = 20;

  // Column definitions: [label, width, alignment]
  const columns: [string, number, string][] = [
    ['SKU', 50, 'left'],
    ['Nama Barang', 110, 'left'],
    ['Merk', 55, 'left'],
    ['Kategori', 55, 'left'],
    ['Satuan', 35, 'left'],
    ['Lokasi', 50, 'left'],
    ['Stok', 30, 'right'],
    ['Min', 25, 'right'],
    ['H. Beli', 55, 'right'],
    ['H. Jual', 55, 'right'],
    ['Nilai Aset', 60, 'right'],
    ['Status', 45, 'center'],
  ];
  const tableWidth = columns.reduce((sum, c) => sum + c[1], 0);

  const formatRp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`;
  const now = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  const totalAset = items.reduce((sum, i) => sum + (i.nilai_aset || 0), 0);
  const lowStock = items.filter(i => i.stock_saat_ini <= i.batas_stok_min).length;
  const typeLabel = type === 'low' ? ' (Stok Menipis)' : type === 'safe' ? ' (Stok Aman)' : '';

  // Helper to draw text with alignment
  const drawCellText = (page: any, text: string, x: number, y: number, colWidth: number, align: string, fs: number, f: any, color: any) => {
    const textWidth = f.widthOfTextAtSize(text, fs);
    let tx = x + 3;
    if (align === 'right') tx = x + colWidth - textWidth - 3;
    else if (align === 'center') tx = x + (colWidth - textWidth) / 2;
    page.drawText(text, { x: tx, y: y, size: fs, font: f, color: color || rgb(0.2, 0.2, 0.2) });
  };

  // Helper to draw a new page with header
  const drawPageHeader = (doc: PDFDocument, pageNum: number, totalPages: { value: number }): any => {
    const page = doc.addPage([W, H]);
    // Title
    page.drawText('Kay.id - Laporan Inventory' + typeLabel, {
      x: margin, y: H - margin - titleFontSize,
      size: titleFontSize, font: fontBold, color: rgb(0.1, 0.34, 0.86),
    });
    // Subtitle
    page.drawText(`Tanggal: ${now} | Total: ${items.length} produk | Nilai Aset: ${formatRp(totalAset)} | Stok Menipis: ${lowStock}`, {
      x: margin, y: H - margin - titleFontSize - subFontSize - 6,
      size: subFontSize, font: font, color: rgb(0.4, 0.4, 0.4),
    });
    return page;
  };

  let currentPage = drawPageHeader(pdfDoc, 1, { value: 1 });
  let y = H - margin - titleFontSize - subFontSize - 6 - 20;

  // Draw table header
  const drawTableHeader = (page: any, yPos: number) => {
    // Header background
    page.drawRectangle({
      x: margin, y: yPos - headerHeight + 4,
      width: tableWidth, height: headerHeight,
      color: rgb(0.1, 0.34, 0.86),
    });
    let x = margin;
    for (const [label, width, align] of columns) {
      drawCellText(page, label, x, yPos - 8, width, align, headerFontSize, fontBold, rgb(1, 1, 1));
      x += width;
    }
    return yPos - headerHeight;
  };

  y = drawTableHeader(currentPage, y);

  // Draw rows
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const isLow = item.stock_saat_ini <= item.batas_stok_min;

    // Check if we need a new page
    if (y - rowHeight < margin + 20) {
      // Footer on current page
      currentPage.drawText(`Kay.id Inventory Report - Halaman ${i}`, {
        x: margin, y: 15,
        size: 6, font: font, color: rgb(0.6, 0.6, 0.6),
      });
      currentPage = drawPageHeader(pdfDoc, i + 1, { value: 1 });
      y = H - margin - titleFontSize - subFontSize - 6 - 20;
      y = drawTableHeader(currentPage, y);
    }

    // Row background (alternate)
    if (i % 2 === 0) {
      currentPage.drawRectangle({
        x: margin, y: y - rowHeight + 4,
        width: tableWidth, height: rowHeight,
        color: rgb(0.97, 0.98, 0.99),
      });
    }

    // Row bottom border
    currentPage.drawLine({
      start: { x: margin, y: y - rowHeight + 4 },
      end: { x: margin + tableWidth, y: y - rowHeight + 4 },
      thickness: 0.5,
      color: rgb(0.9, 0.9, 0.9),
    });

    const row: [string, number, string][] = [
      [item.sku, columns[0][1], columns[0][2]],
      [item.nama_barang, columns[1][1], columns[1][2]],
      [item.merk || '-', columns[2][1], columns[2][2]],
      [item.kategori || '-', columns[3][1], columns[3][2]],
      [item.satuan, columns[4][1], columns[4][2]],
      [item.lokasi_rak || '-', columns[5][1], columns[5][2]],
      [String(item.stock_saat_ini), columns[6][1], columns[6][2]],
      [String(item.batas_stok_min), columns[7][1], columns[7][2]],
      [formatRp(item.harga_beli_awal), columns[8][1], columns[8][2]],
      [formatRp(item.harga_jual_eceran), columns[9][1], columns[9][2]],
      [formatRp(item.nilai_aset || 0), columns[10][1], columns[10][2]],
      [isLow ? 'MENIPIS' : 'AMAN', columns[11][1], columns[11][2]],
    ];

    let x = margin;
    for (let c = 0; c < row.length; c++) {
      const [text, width, align] = row[c];
      let cellColor = rgb(0.2, 0.2, 0.2);
      let cellFont = font;
      if (c === 0) cellFont = fontBold;
      if (c === 11) {
        cellFont = fontBold;
        cellColor = isLow ? rgb(0.86, 0.15, 0.15) : rgb(0.02, 0.59, 0.41);
      }
      drawCellText(currentPage, text, x, y - 6, width, align, fontSize, cellFont, cellColor);
      x += width;
    }

    y -= rowHeight;
  }

  // Footer on last page
  const pageCount = pdfDoc.getPageCount();
  for (let i = 0; i < pageCount; i++) {
    const page = pdfDoc.getPage(i);
    page.drawText(`Kay.id Inventory Report - Halaman ${i + 1}/${pageCount}`, {
      x: margin, y: 15,
      size: 6, font: font, color: rgb(0.6, 0.6, 0.6),
    });
  }

  const pdfBytes = await pdfDoc.save();

  return new Response(pdfBytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="inventory-report-${type}-${now.replace(/\s/g, '-')}.pdf"`,
    },
  });
};
