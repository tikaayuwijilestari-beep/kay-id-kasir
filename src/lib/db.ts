export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'kasir',
  avatar_url TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  last_login TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  sku TEXT UNIQUE NOT NULL,
  barcode TEXT UNIQUE,
  nama_barang TEXT NOT NULL,
  merk TEXT,
  kategori TEXT,
  satuan TEXT NOT NULL,
  lokasi_rak TEXT,
  supplier TEXT,
  batas_stok_min INTEGER DEFAULT 0,
  stock_awal INTEGER DEFAULT 0,
  stock_terjual INTEGER DEFAULT 0,
  stock_saat_ini INTEGER DEFAULT 0,
  harga_beli_awal REAL DEFAULT 0,
  harga_jual_eceran REAL DEFAULT 0,
  harga_jual_grosir REAL DEFAULT 0,
  nilai_aset REAL DEFAULT 0,
  nilai_barang_terjual REAL DEFAULT 0,
  keuntungan_penjualan REAL DEFAULT 0,
  status_stok TEXT DEFAULT 'AMAN',
  keterangan TEXT,
  restock_needed INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  invoice_no TEXT UNIQUE NOT NULL,
  tanggal TEXT NOT NULL,
  total_items INTEGER DEFAULT 0,
  subtotal REAL DEFAULT 0,
  discount REAL DEFAULT 0,
  total REAL DEFAULT 0,
  payment_method TEXT DEFAULT 'manual',
  payment_status TEXT DEFAULT 'paid',
  customer_name TEXT,
  cashier_id TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sales_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL,
  inventory_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  nama_barang TEXT NOT NULL,
  qty INTEGER NOT NULL,
  harga_satuan REAL NOT NULL,
  subtotal REAL NOT NULL,
  FOREIGN KEY (sale_id) REFERENCES sales(id),
  FOREIGN KEY (inventory_id) REFERENCES inventory(id)
);

CREATE TABLE IF NOT EXISTS restock (
  id TEXT PRIMARY KEY,
  inventory_id TEXT NOT NULL,
  sku TEXT NOT NULL,
  nama_barang TEXT NOT NULL,
  qty INTEGER NOT NULL,
  harga_beli REAL DEFAULT 0,
  total_biaya REAL DEFAULT 0,
  supplier TEXT,
  tanggal TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (inventory_id) REFERENCES inventory(id)
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_inventory_sku ON inventory(sku);
CREATE INDEX IF NOT EXISTS idx_inventory_barcode ON inventory(barcode);
CREATE INDEX IF NOT EXISTS idx_inventory_kategori ON inventory(kategori);
CREATE INDEX IF NOT EXISTS idx_sales_tanggal ON sales(tanggal);
CREATE INDEX IF NOT EXISTS idx_sales_invoice ON sales(invoice_no);
CREATE INDEX IF NOT EXISTS idx_sales_items_sale ON sales_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_restock_inventory ON restock(inventory_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
`;

export interface Env {
  DB: D1Database;
}

export async function initDB(db: D1Database) {
  const statements = SCHEMA_SQL
    .split(';')
    .map((s: string) => s.trim())
    .filter((s: string) => s.length > 0);

  for (const stmt of statements) {
    await db.prepare(stmt).run();
  }
}

export async function getDB(request: Request): Promise<D1Database> {
  const env = (request as any).env as Env;
  if (!env?.DB) {
    throw new Error('D1 Database not available. Make sure wrangler.toml is configured.');
  }
  await initDB(env.DB);
  return env.DB;
}
