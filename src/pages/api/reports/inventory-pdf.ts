import type { APIRoute } from 'astro';
import { getDB, getEnvFromLocals } from '../../../lib/db';
import jsPDF from 'jspdf';
import 'jspdf-autotable';

declare module 'jspdf' {
  interface jsPDF {
    autoTable: (options: any) => jsPDF;
    lastAutoTable: { finalY: number };
  }
}

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

  const doc = new jsPDF('landscape', 'mm', 'a4');

  // Title
  doc.setFontSize(16);
  doc.setTextColor(26, 86, 219);
  doc.text('Kay.id - Laporan Inventory', 14, 15);

  doc.setFontSize(9);
  doc.setTextColor(100, 100, 100);
  const now = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  doc.text(`Tanggal: ${now} | Total: ${items.length} produk`, 14, 22);

  // Summary
  const totalAset = items.reduce((sum, i) => sum + (i.nilai_aset || 0), 0);
  const lowStock = items.filter(i => i.status_stok === 'MENIPIS').length;
  doc.text(`Nilai Aset: Rp ${totalAset.toLocaleString('id-ID')} | Stok Menipis: ${lowStock}`, 14, 28);

  // Table
  const typeLabel = type === 'low' ? ' (Stok Menipis)' : type === 'safe' ? ' (Stok Aman)' : '';
  (doc as any).autoTable({
    startY: 33,
    head: [['SKU', 'Nama Barang', 'Merk', 'Kategori', 'Satuan', 'Lokasi', 'Stok', 'Min', 'H. Beli', 'H. Jual', 'Nilai Aset', 'Status']],
    body: items.map((i: any) => [
      i.sku,
      i.nama_barang,
      i.merk || '-',
      i.kategori || '-',
      i.satuan,
      i.lokasi_rak || '-',
      i.stock_saat_ini,
      i.batas_stok_min,
      `Rp ${i.harga_beli_awal.toLocaleString('id-ID')}`,
      `Rp ${i.harga_jual_eceran.toLocaleString('id-ID')}`,
      `Rp ${(i.nilai_aset || 0).toLocaleString('id-ID')}`,
      i.status_stok,
    ]),
    styles: { fontSize: 7, cellPadding: 2 },
    headStyles: { fillColor: [26, 86, 219], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 22 },
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'right' },
      9: { halign: 'right' },
      10: { halign: 'right' },
      11: { halign: 'center' },
    },
    didParseCell: (data: any) => {
      if (data.column.index === 11 && data.section === 'body') {
        if (data.cell.raw === 'MENIPIS') {
          data.cell.styles.textColor = [220, 38, 38];
          data.cell.styles.fontStyle = 'bold';
        } else {
          data.cell.styles.textColor = [5, 150, 105];
        }
      }
    },
  });

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text(`Kay.id Inventory Report - Halaman ${i}/${pageCount}`, 14, doc.internal.pageSize.height - 10);
  }

  const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

  return new Response(pdfBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="inventory-report-${type}${now.replace(/\s/g, '-')}.pdf"`,
    },
  });
};
