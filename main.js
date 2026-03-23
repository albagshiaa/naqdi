const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ============ AUTO-UPDATER ============
const { autoUpdater } = require('electron-updater');
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.logger = require('electron').app ? null : console;

function setupAutoUpdater() {
  // Check for updates silently on startup — don't block the app
  autoUpdater.on('update-available', (info) => {
    console.log('[Updater] Update available:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:available', info.version);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Updater] Update downloaded:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update:downloaded', info.version);
    }
  });

  autoUpdater.on('error', (err) => {
    console.error('[Updater] Error:', err.message);
    // Don't show errors to user — silent fail, try again next launch
  });

  // Check after 10 seconds (let the app finish loading first)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 10000);

  // Then check every 4 hours
  setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, 4 * 60 * 60 * 1000);
}

// IPC handler — user clicks "restart to update"
ipcMain.handle('update:install', () => {
  autoUpdater.quitAndInstall(false, true);
});

ipcMain.handle('app:getVersion', () => {
  return app.getVersion();
});

// ============ CRASH PREVENTION — catch all unhandled errors ============
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught exception:', err.message, err.stack);
  // Don't crash — log and continue
});
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled promise rejection:', reason);
  // Don't crash — log and continue
});

// Master PIN — stored as SHA-256 hash, never in plaintext in frontend
const MASTER_PIN_HASH = crypto.createHash('sha256').update('#4321#').digest('hex');

// ============ SIMPLE SETTINGS STORE ============
class SettingsStore {
  constructor(defaults = {}) {
    this.filePath = path.join(app.getPath('userData'), 'settings.json');
    this.defaults = defaults;
    this.data = { ...defaults };
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        this.data = this._deepMerge(this.defaults, parsed);
      }
    } catch (e) {
      console.error('Settings load error:', e.message);
      this.data = { ...this.defaults };
    }
  }

  _save() {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Settings save error:', e.message);
    }
  }

  _deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) &&
          target[key] && typeof target[key] === 'object' && !Array.isArray(target[key])) {
        result[key] = this._deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  get(key) {
    if (!key) return this.data;
    return key.split('.').reduce((obj, k) => (obj != null ? obj[k] : undefined), this.data);
  }

  set(key, value) {
    const keys = key.split('.');
    let obj = this.data;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!obj[keys[i]] || typeof obj[keys[i]] !== 'object') {
        obj[keys[i]] = {};
      }
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    this._save();
  }

  getAll() {
    return this.data;
  }
}

// ============ DATABASE ============
let db = null;
let dbPath = '';

// Execute a single SQL statement
function dbRun(sql, params) {
  if (!db) return;
  if (params && params.length > 0) {
    db.run(sql, params);
  } else {
    db.run(sql);
  }
}

// Execute multiple SQL statements separated by semicolons
function dbExecMulti(statements) {
  statements.forEach(sql => {
    const trimmed = sql.trim();
    if (trimmed.length > 0) {
      try {
        db.run(trimmed);
      } catch (e) {
        console.error('SQL error on:', trimmed.substring(0, 60), e.message);
      }
    }
  });
}

async function initDatabase() {
  const initSqlJs = require('sql.js');
  dbPath = path.join(app.getPath('userData'), 'naqdi.db');

  // CRITICAL: Tell sql.js where the WASM file is located
  const wasmPath = path.join(
    path.dirname(require.resolve('sql.js')),
    'sql-wasm.wasm'
  );

  const SQL = await initSqlJs({
    locateFile: () => wasmPath
  });

  // Load existing DB or create new
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Enable foreign keys
  dbRun('PRAGMA foreign_keys = ON');

  // Create all tables - ONE statement at a time (sql.js requirement)
  const tables = [
    `CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_ar TEXT NOT NULL, name_en TEXT,
      color TEXT DEFAULT '#2563EB', icon TEXT DEFAULT 'box',
      parent_id INTEGER, sort_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_ar TEXT NOT NULL, name_en TEXT,
      sku TEXT, barcode TEXT, category_id INTEGER,
      price REAL NOT NULL DEFAULT 0, cost REAL DEFAULT 0,
      tax_status TEXT DEFAULT 'standard', unit TEXT DEFAULT 'piece',
      track_stock INTEGER DEFAULT 1, stock_quantity REAL DEFAULT 0,
      reorder_level REAL DEFAULT 0, expiry_date TEXT,
      serial_tracking INTEGER DEFAULT 0, batch_tracking INTEGER DEFAULT 0,
      image TEXT, is_active INTEGER DEFAULT 1, is_favorite INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS product_variants (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL, name_ar TEXT NOT NULL, name_en TEXT,
      sku TEXT, barcode TEXT, price_adjustment REAL DEFAULT 0,
      stock_quantity REAL DEFAULT 0, is_active INTEGER DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS product_units (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL, unit_name_ar TEXT NOT NULL, unit_name_en TEXT,
      conversion_factor REAL NOT NULL DEFAULT 1, barcode TEXT, price REAL
    )`,
    `CREATE TABLE IF NOT EXISTS product_barcodes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL, barcode TEXT NOT NULL, variant_id INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_ar TEXT NOT NULL, name_en TEXT, phone TEXT, email TEXT,
      vat_number TEXT, address TEXT, notes TEXT,
      loyalty_points REAL DEFAULT 0, credit_balance REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_ar TEXT NOT NULL, name_en TEXT, phone TEXT, email TEXT,
      vat_number TEXT, address TEXT, payment_terms TEXT, notes TEXT,
      is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL, customer_id INTEGER,
      sale_type TEXT DEFAULT 'retail',
      subtotal REAL NOT NULL DEFAULT 0, discount_amount REAL DEFAULT 0,
      discount_type TEXT DEFAULT 'fixed', tax_amount REAL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0, paid_amount REAL DEFAULT 0,
      change_amount REAL DEFAULT 0, payment_status TEXT DEFAULT 'paid',
      status TEXT DEFAULT 'completed', notes TEXT, cashier_id INTEGER,
      price_list TEXT DEFAULT 'retail', is_quotation INTEGER DEFAULT 0,
      quotation_ref TEXT, zatca_status TEXT DEFAULT 'pending',
      zatca_uuid TEXT, zatca_hash TEXT, qr_code TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL, product_id INTEGER, variant_id INTEGER,
      name_ar TEXT NOT NULL, name_en TEXT,
      quantity REAL NOT NULL DEFAULT 1, unit_price REAL NOT NULL DEFAULT 0,
      discount_amount REAL DEFAULT 0, tax_rate REAL DEFAULT 15,
      tax_amount REAL DEFAULT 0, total REAL NOT NULL DEFAULT 0,
      notes TEXT, serial_number TEXT, is_open_item INTEGER DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL, method TEXT NOT NULL DEFAULT 'cash',
      amount REAL NOT NULL DEFAULT 0, reference TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_sale_id INTEGER NOT NULL, return_number TEXT NOT NULL,
      total_refund REAL NOT NULL DEFAULT 0, reason TEXT,
      refund_method TEXT DEFAULT 'cash', status TEXT DEFAULT 'completed',
      cashier_id INTEGER, created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS return_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      return_id INTEGER NOT NULL, sale_item_id INTEGER NOT NULL,
      quantity REAL NOT NULL DEFAULT 1, refund_amount REAL NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL, description TEXT,
      amount REAL NOT NULL DEFAULT 0, payment_method TEXT DEFAULT 'cash',
      is_recurring INTEGER DEFAULT 0, recurring_interval TEXT,
      receipt_image TEXT, created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_number TEXT NOT NULL, supplier_id INTEGER,
      status TEXT DEFAULT 'draft', subtotal REAL DEFAULT 0,
      tax_amount REAL DEFAULT 0, total REAL DEFAULT 0,
      notes TEXT, expected_date TEXT, received_date TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS purchase_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      po_id INTEGER NOT NULL, product_id INTEGER NOT NULL,
      quantity REAL NOT NULL DEFAULT 0, received_quantity REAL DEFAULT 0,
      unit_cost REAL NOT NULL DEFAULT 0, total REAL NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL, variant_id INTEGER,
      movement_type TEXT NOT NULL, quantity REAL NOT NULL,
      reference_type TEXT, reference_id INTEGER,
      notes TEXT, created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS cash_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cashier_id INTEGER, opening_amount REAL DEFAULT 0,
      closing_amount REAL, expected_amount REAL, difference REAL,
      cash_in REAL DEFAULT 0, cash_out REAL DEFAULT 0,
      status TEXT DEFAULT 'open',
      opened_at TEXT DEFAULT (datetime('now')), closed_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS cash_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL, type TEXT NOT NULL,
      amount REAL NOT NULL, reason TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_ar TEXT NOT NULL, name_en TEXT,
      role TEXT DEFAULT 'cashier', pin TEXT,
      permissions TEXT DEFAULT '{}', is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS promotions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_ar TEXT NOT NULL, name_en TEXT,
      type TEXT NOT NULL, value REAL NOT NULL,
      min_purchase REAL DEFAULT 0, start_date TEXT, end_date TEXT,
      applies_to TEXT DEFAULT 'all', category_id INTEGER, product_id INTEGER,
      is_active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS price_lists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_ar TEXT NOT NULL, name_en TEXT,
      is_default INTEGER DEFAULT 0, is_active INTEGER DEFAULT 1
    )`,
    `CREATE TABLE IF NOT EXISTS price_list_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      price_list_id INTEGER NOT NULL, product_id INTEGER NOT NULL,
      price REAL NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS installments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL, customer_id INTEGER NOT NULL,
      total_amount REAL NOT NULL, paid_amount REAL DEFAULT 0,
      remaining_amount REAL NOT NULL, num_installments INTEGER NOT NULL,
      installment_amount REAL NOT NULL, status TEXT DEFAULT 'active',
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS installment_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      installment_id INTEGER NOT NULL, amount REAL NOT NULL,
      due_date TEXT NOT NULL, paid_date TEXT,
      status TEXT DEFAULT 'pending', payment_method TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER, action TEXT NOT NULL,
      entity_type TEXT, entity_id INTEGER, details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS zatca_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL, invoice_data TEXT, xml_content TEXT,
      status TEXT DEFAULT 'pending', retry_count INTEGER DEFAULT 0,
      zatca_response TEXT, last_error TEXT, 
      processed_at TEXT, submitted_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS sequences (
      id TEXT PRIMARY KEY, current_value INTEGER DEFAULT 0
    )`,
  ];

  dbExecMulti(tables);

  // Initialize default data
  dbRun("INSERT OR IGNORE INTO sequences (id, current_value) VALUES ('invoice', 0)");
  dbRun("INSERT OR IGNORE INTO sequences (id, current_value) VALUES ('return', 0)");
  dbRun("INSERT OR IGNORE INTO sequences (id, current_value) VALUES ('purchase_order', 0)");
  dbRun("INSERT OR IGNORE INTO sequences (id, current_value) VALUES ('ticket', 0)");
  dbRun("INSERT OR IGNORE INTO sequences (id, current_value) VALUES ('ticket_date', 0)");
  dbRun("INSERT OR IGNORE INTO sequences (id, current_value) VALUES ('credit_note', 0)");
  dbRun("INSERT OR IGNORE INTO sequences (id, current_value) VALUES ('debit_note', 0)");
  dbRun("INSERT OR IGNORE INTO price_lists (id, name_ar, name_en, is_default) VALUES (1, 'تجزئة', 'Retail', 1)");
  dbRun("INSERT OR IGNORE INTO price_lists (id, name_ar, name_en, is_default) VALUES (2, 'جملة', 'Wholesale', 0)");
  dbRun("INSERT OR IGNORE INTO users (id, name_ar, name_en, role, pin) VALUES (1, 'المدير', 'Admin', 'admin', '')");

  // Clean up stale category references (products pointing to deleted/inactive categories)
  dbRun("UPDATE products SET category_id = NULL WHERE category_id IS NOT NULL AND category_id NOT IN (SELECT id FROM categories WHERE is_active = 1)");

  // Create indexes
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_products_barcode ON products(barcode)',
    'CREATE INDEX IF NOT EXISTS idx_products_sku ON products(sku)',
    'CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id)',
    'CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_sales_invoice ON sales(invoice_number)',
    'CREATE INDEX IF NOT EXISTS idx_sale_items_sale ON sale_items(sale_id)',
    'CREATE INDEX IF NOT EXISTS idx_sale_items_product ON sale_items(product_id)',
    'CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id)',
    'CREATE INDEX IF NOT EXISTS idx_audit_log_date ON audit_log(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(created_at)',
    'CREATE INDEX IF NOT EXISTS idx_zatca_queue_status ON zatca_queue(status)',
  ];
  dbExecMulti(indexes);

  // ============ MIGRATIONS (add columns to existing tables safely) ============
  const migrations = [
    // Sales: store ZATCA invoice counter per sale (needed for credit note reference)
    'ALTER TABLE sales ADD COLUMN zatca_invoice_counter INTEGER',
    'ALTER TABLE sales ADD COLUMN payment_method TEXT',
    // Returns: enhanced columns for full return workflow
    'ALTER TABLE returns ADD COLUMN return_type TEXT DEFAULT \'return\'',
    'ALTER TABLE returns ADD COLUMN original_invoice_number TEXT',
    'ALTER TABLE returns ADD COLUMN zatca_status TEXT DEFAULT \'not_required\'',
    'ALTER TABLE returns ADD COLUMN zatca_uuid TEXT',
    'ALTER TABLE returns ADD COLUMN zatca_hash TEXT',
    'ALTER TABLE returns ADD COLUMN approved_by INTEGER',
    // Return items: enhanced columns for per-item tracking
    'ALTER TABLE return_items ADD COLUMN product_id INTEGER',
    'ALTER TABLE return_items ADD COLUMN product_name TEXT',
    'ALTER TABLE return_items ADD COLUMN unit_price REAL DEFAULT 0',
    'ALTER TABLE return_items ADD COLUMN tax_rate REAL DEFAULT 15',
    'ALTER TABLE return_items ADD COLUMN tax_amount REAL DEFAULT 0',
    'ALTER TABLE return_items ADD COLUMN return_reason TEXT DEFAULT \'changed_mind\'',
    'ALTER TABLE return_items ADD COLUMN restock INTEGER DEFAULT 1',
    // Feature 13: Product type (product/service/custom)
    'ALTER TABLE products ADD COLUMN product_type TEXT DEFAULT \'product\'',
    // Feature 14: Serial number enforcement
    'ALTER TABLE products ADD COLUMN serial_required INTEGER DEFAULT 0',
    // Feature 12: Variant attributes stored as JSON
    'ALTER TABLE product_variants ADD COLUMN attributes TEXT DEFAULT \'{}\'',
    // Feature 6: Multi-branch
    'ALTER TABLE products ADD COLUMN branch_id INTEGER',
    'ALTER TABLE sales ADD COLUMN branch_id INTEGER',
    'ALTER TABLE users ADD COLUMN branch_id INTEGER',
    'ALTER TABLE cash_sessions ADD COLUMN branch_id INTEGER',
    // Feature 7: Employee commissions
    'ALTER TABLE users ADD COLUMN commission_rate REAL DEFAULT 0',
    // NFC/RFID card login
    'ALTER TABLE users ADD COLUMN card_id TEXT',
    'ALTER TABLE sales ADD COLUMN cashier_commission REAL DEFAULT 0',
    // Feature 5: Loyalty — points earned per sale
    'ALTER TABLE sales ADD COLUMN loyalty_points_earned REAL DEFAULT 0',
    'ALTER TABLE sales ADD COLUMN loyalty_points_redeemed REAL DEFAULT 0',
    // Feature 14: Serial numbers on sale items
    'ALTER TABLE sale_items ADD COLUMN serial_numbers TEXT',
    // Feature 9: Partial payments — payment status tracking
    'ALTER TABLE sales ADD COLUMN balance_due REAL DEFAULT 0',
    // Feature 3: Coupon code on sale
    'ALTER TABLE sales ADD COLUMN coupon_code TEXT',
    'ALTER TABLE sales ADD COLUMN coupon_discount REAL DEFAULT 0',
    'ALTER TABLE sales ADD COLUMN exchange_credit REAL DEFAULT 0',
    // Gift Cards
    `CREATE TABLE IF NOT EXISTS gift_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      initial_balance REAL NOT NULL DEFAULT 0,
      balance REAL NOT NULL DEFAULT 0,
      customer_id INTEGER,
      status TEXT DEFAULT 'active',
      expiry_date TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS gift_card_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      sale_id INTEGER,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    // Product Bundles
    `CREATE TABLE IF NOT EXISTS bundle_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bundle_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity REAL NOT NULL DEFAULT 1
    )`,
    // Promotions Engine — Buy X Get Y, auto-apply
    'ALTER TABLE promotions ADD COLUMN promo_type TEXT DEFAULT \'coupon\'',
    'ALTER TABLE promotions ADD COLUMN buy_product_id INTEGER',
    'ALTER TABLE promotions ADD COLUMN buy_quantity INTEGER DEFAULT 1',
    'ALTER TABLE promotions ADD COLUMN get_product_id INTEGER',
    'ALTER TABLE promotions ADD COLUMN get_quantity INTEGER DEFAULT 1',
    'ALTER TABLE promotions ADD COLUMN get_discount REAL DEFAULT 100',
    'ALTER TABLE promotions ADD COLUMN auto_apply INTEGER DEFAULT 0',
    'ALTER TABLE promotions ADD COLUMN max_uses INTEGER DEFAULT 0',
    'ALTER TABLE promotions ADD COLUMN used_count INTEGER DEFAULT 0',
    // Debit/Credit Notes
    `CREATE TABLE IF NOT EXISTS credit_debit_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_number TEXT NOT NULL,
      note_type TEXT NOT NULL,
      sale_id INTEGER NOT NULL,
      invoice_number TEXT NOT NULL,
      amount REAL NOT NULL,
      reason TEXT,
      status TEXT DEFAULT 'active',
      customer_id INTEGER,
      created_by INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )`,

    // ===== Qoyod Accounting Integration =====
    'ALTER TABLE customers ADD COLUMN qoyod_id INTEGER',
    'ALTER TABLE products ADD COLUMN qoyod_id INTEGER',
    'ALTER TABLE suppliers ADD COLUMN qoyod_id INTEGER',
    'ALTER TABLE categories ADD COLUMN qoyod_id INTEGER',
    `CREATE TABLE IF NOT EXISTS qoyod_sync (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sync_type TEXT NOT NULL,
      local_id INTEGER NOT NULL,
      qoyod_id INTEGER,
      qoyod_ref TEXT,
      status TEXT DEFAULT 'pending',
      error TEXT,
      attempts INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      synced_at TEXT
    )`,

    // ===== Feature: Customer Price Groups =====
    'ALTER TABLE customers ADD COLUMN price_list_id INTEGER DEFAULT 1',

    // ===== Feature: Supplier Payments =====
    `CREATE TABLE IF NOT EXISTS supplier_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      supplier_id INTEGER NOT NULL,
      po_id INTEGER,
      amount REAL NOT NULL DEFAULT 0,
      method TEXT DEFAULT 'cash',
      reference TEXT,
      notes TEXT,
      date TEXT DEFAULT (date('now')),
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    'ALTER TABLE purchase_orders ADD COLUMN paid_amount REAL DEFAULT 0',

    // ===== Feature: Tiered/Quantity Pricing =====
    `CREATE TABLE IF NOT EXISTS tier_pricing (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      min_qty REAL NOT NULL DEFAULT 1,
      price REAL NOT NULL DEFAULT 0
    )`,

    // ===== Feature: Commission per product =====
    'ALTER TABLE products ADD COLUMN commission_rate REAL DEFAULT 0',
    `CREATE TABLE IF NOT EXISTS commission_payouts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      period_from TEXT,
      period_to TEXT,
      status TEXT DEFAULT 'pending',
      paid_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,

    // ===== Feature: Subscription/Membership Packages =====
    `CREATE TABLE IF NOT EXISTS packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name_ar TEXT NOT NULL,
      name_en TEXT,
      total_uses INTEGER NOT NULL DEFAULT 1,
      price REAL NOT NULL DEFAULT 0,
      expiry_days INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS customer_packages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      package_id INTEGER NOT NULL,
      remaining_uses INTEGER NOT NULL DEFAULT 0,
      purchased_at TEXT DEFAULT (datetime('now')),
      expires_at TEXT,
      sale_id INTEGER
    )`,
  ];
  migrations.forEach(sql => {
    try { db.run(sql); } catch (e) { /* Column already exists — ignore */ }
  });

  // Save to disk
  saveDatabase();
}

function saveDatabase() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (e) {
    console.error('DB save error:', e.message);
  }
}

// Auto-save every 30 seconds
setInterval(() => { saveDatabase(); }, 30000);

// ============ SETTINGS ============
let store;

// ============ WINDOW ============
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: 'Naqdi - نقدي',
    icon: path.join(__dirname, 'renderer', 'icon-256.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    backgroundColor: '#0F172A',
    show: false
  });

  mainWindow.loadFile('renderer/index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize();

    // Apply kiosk mode if enabled
    try {
      const kioskMode = store.get('kioskMode');
      if (kioskMode) {
        mainWindow.setKiosk(true);
        mainWindow.setFullScreen(true);
        mainWindow.setClosable(false);
        mainWindow.setMinimizable(false);
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
        mainWindow.setSkipTaskbar(true);
        mainWindow.setMenuBarVisibility(false);
        mainWindow.setAutoHideMenuBar(true);
      }
    } catch(e) { /* ignore */ }
  });

  mainWindow.on('close', (e) => {
    // In kiosk mode, prevent closing unless explicitly quitting
    try {
      const kioskMode = store.get('kioskMode');
      if (kioskMode && !mainWindow._forceClose) {
        e.preventDefault();
      }
    } catch(_) {}
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ============ IPC HANDLERS ============
ipcMain.handle('settings:get', (event, key) => {
  const result = key ? store.get(key) : store.getAll();
  return result;
});

ipcMain.handle('settings:set', (event, key, value) => {
  store.set(key, value);
  // Verify it was saved by re-reading
  const verify = store.get(key);
  const match = JSON.stringify(verify) === JSON.stringify(value);
  if (!match) {
    console.error('[IPC] SAVE FAILED! Written:', JSON.stringify(value).substring(0, 80), 'Read back:', JSON.stringify(verify).substring(0, 80));
  }
  return match;
});

ipcMain.handle('db:query', (event, sql, params) => {
  try {
    if (!db) return { success: false, error: 'Database not initialized' };
    const trimmed = sql.trim().toUpperCase();
    if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH')) {
      const stmt = db.prepare(sql);
      if (params && params.length > 0) stmt.bind(params);
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      return { success: true, data: results };
    } else {
      if (params && params.length > 0) {
        db.run(sql, params);
      } else {
        db.run(sql);
      }
      // Capture lastInsertId BEFORE saveDatabase() which calls db.export() / COMMIT internally
      let lastInsertId = 0;
      try {
        const idStmt = db.prepare('SELECT last_insert_rowid() as id');
        if (idStmt.step()) lastInsertId = idStmt.getAsObject().id || 0;
        idStmt.free();
      } catch (_) {}
      saveDatabase();
      return { success: true, data: { changes: db.getRowsModified(), lastInsertId } };
    }
  } catch (error) {
    console.error('DB query error:', error.message, 'SQL:', sql.substring(0, 80));
    return { success: false, error: error.message };
  }
});

// Transaction handler — runs multiple queries atomically
ipcMain.handle('db:transaction', (event, queries) => {
  try {
    if (!db) return { success: false, error: 'Database not initialized' };
    if (!Array.isArray(queries) || queries.length === 0) return { success: false, error: 'No queries' };
    
    db.run('BEGIN TRANSACTION');
    const results = [];
    try {
      for (const q of queries) {
        const sql = q.sql;
        const params = q.params || [];
        const trimmed = sql.trim().toUpperCase();
        if (trimmed.startsWith('SELECT') || trimmed.startsWith('WITH')) {
          const stmt = db.prepare(sql);
          if (params.length > 0) stmt.bind(params);
          const rows = [];
          while (stmt.step()) rows.push(stmt.getAsObject());
          stmt.free();
          results.push({ success: true, data: rows });
        } else {
          if (params.length > 0) db.run(sql, params);
          else db.run(sql);
          let lastInsertId = 0;
          try {
            const idStmt = db.prepare('SELECT last_insert_rowid() as id');
            if (idStmt.step()) lastInsertId = idStmt.getAsObject().id || 0;
            idStmt.free();
          } catch (_) {}
          results.push({ success: true, data: { changes: db.getRowsModified(), lastInsertId } });
        }
      }
      db.run('COMMIT');
      saveDatabase();
      return { success: true, results };
    } catch (txError) {
      try { db.run('ROLLBACK'); } catch (_) {}
      console.error('Transaction failed, rolled back:', txError.message);
      return { success: false, error: txError.message };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Master PIN verification — runs in backend, PIN never stored in frontend
ipcMain.handle('auth:verifyMasterPin', (event, pin) => {
  const hash = crypto.createHash('sha256').update(pin).digest('hex');
  return hash === MASTER_PIN_HASH;
});

ipcMain.handle('db:nextSequence', (event, sequenceName) => {
  try {
    db.run('UPDATE sequences SET current_value = current_value + 1 WHERE id = ?', [sequenceName]);
    const stmt = db.prepare('SELECT current_value FROM sequences WHERE id = ?');
    stmt.bind([sequenceName]);
    let value = 0;
    if (stmt.step()) {
      value = stmt.getAsObject().current_value;
    }
    stmt.free();
    saveDatabase();
    return value;
  } catch (error) {
    console.error('Sequence error:', error.message);
    return 0;
  }
});

// Get next ticket number — resets daily
ipcMain.handle('db:nextTicket', (event) => {
  try {
    const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
    const todayNum = parseInt(today);

    // Check if date changed
    const dateStmt = db.prepare('SELECT current_value FROM sequences WHERE id = ?');
    dateStmt.bind(['ticket_date']);
    let lastDate = 0;
    if (dateStmt.step()) lastDate = dateStmt.getAsObject().current_value;
    dateStmt.free();

    if (lastDate !== todayNum) {
      // New day — reset ticket counter
      const startNum = store.get('receipt')?.ticketStart || 1;
      db.run('UPDATE sequences SET current_value = ? WHERE id = ?', [startNum - 1, 'ticket']);
      db.run('UPDATE sequences SET current_value = ? WHERE id = ?', [todayNum, 'ticket_date']);
    }

    // Increment and return
    db.run('UPDATE sequences SET current_value = current_value + 1 WHERE id = ?', ['ticket']);
    const stmt = db.prepare('SELECT current_value FROM sequences WHERE id = ?');
    stmt.bind(['ticket']);
    let value = 0;
    if (stmt.step()) value = stmt.getAsObject().current_value;
    stmt.free();
    saveDatabase();
    return value;
  } catch (error) {
    console.error('Ticket error:', error.message);
    return 0;
  }
});

// ============ QR CODE GENERATION ============
const QRCodeLib = require('qrcode');

ipcMain.handle('qr:generate', async (event, data) => {
  try {
    const svg = await QRCodeLib.toString(data, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', width: 200 });
    return { success: true, svg };
  } catch (e) {
    console.error('[IPC] QR generate error:', e.message);
    return { success: false, error: e.message };
  }
});

// ============ EXCEL IMPORT/EXPORT ============
const XLSX = require('xlsx');

// Generate and save product template
ipcMain.handle('excel:downloadTemplate', async () => {
  try {
    const lang = store.get('language') || 'ar';

    // Template headers bilingual
    const headers = [
      { ar: 'اسم المنتج (عربي) *', en: 'Product Name Arabic *', key: 'name_ar' },
      { ar: 'اسم المنتج (إنجليزي)', en: 'Product Name English', key: 'name_en' },
      { ar: 'الباركود', en: 'Barcode', key: 'barcode' },
      { ar: 'رمز SKU', en: 'SKU', key: 'sku' },
      { ar: 'التصنيف', en: 'Category', key: 'category' },
      { ar: 'سعر البيع *', en: 'Selling Price *', key: 'price' },
      { ar: 'سعر التكلفة', en: 'Cost Price', key: 'cost' },
      { ar: 'الوحدة', en: 'Unit', key: 'unit' },
      { ar: 'الكمية', en: 'Stock Quantity', key: 'stock_quantity' },
      { ar: 'حد إعادة الطلب', en: 'Reorder Level', key: 'reorder_level' },
      { ar: 'حالة الضريبة', en: 'Tax Status', key: 'tax_status' },
    ];

    // Create workbook with bilingual headers
    const wsData = [
      headers.map(h => `${h.ar}\n${h.en}`),
      // Example row
      ['حليب طازج', 'Fresh Milk', '6281000000001', 'MLK-001', 'ألبان / Dairy', 5.50, 4.00, 'piece', 100, 10, 'standard'],
    ];

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Set column widths
    ws['!cols'] = headers.map(() => ({ wch: 22 }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products');

    // Add instructions sheet
    const instrData = [
      [lang === 'ar' ? 'تعليمات استيراد المنتجات - نقدي' : 'Product Import Instructions - Naqdi'],
      [''],
      [lang === 'ar' ? '1. الحقول المطلوبة: اسم المنتج (عربي) وسعر البيع' : '1. Required fields: Product Name (Arabic) and Selling Price'],
      [lang === 'ar' ? '2. التصنيف: اكتب اسم التصنيف كما تريد. سيتم إنشاء التصنيفات غير الموجودة تلقائياً' : '2. Category: Write category name as you want. Non-existing categories will be created automatically'],
      [lang === 'ar' ? '3. الوحدة: piece, kg, gram, liter, meter, box, pack, carton' : '3. Unit: piece, kg, gram, liter, meter, box, pack, carton'],
      [lang === 'ar' ? '4. حالة الضريبة: standard (خاضع), zero (صفري), exempt (معفى)' : '4. Tax Status: standard (taxable), zero (zero-rated), exempt'],
      [lang === 'ar' ? '5. يمكنك حذف صف المثال قبل الاستيراد' : '5. You can delete the example row before importing'],
      [lang === 'ar' ? '6. يمكنك استيراد ملف من نظام آخر - التطبيق سيحاول مطابقة الأعمدة تلقائياً' : '6. You can import files from other systems - the app will try to auto-match columns'],
    ];
    const wsInstr = XLSX.utils.aoa_to_sheet(instrData);
    wsInstr['!cols'] = [{ wch: 80 }];
    XLSX.utils.book_append_sheet(wb, wsInstr, lang === 'ar' ? 'تعليمات' : 'Instructions');

    // Show save dialog
    const result = await dialog.showSaveDialog(mainWindow, {
      title: lang === 'ar' ? 'حفظ قالب استيراد المنتجات' : 'Save Product Import Template',
      defaultPath: path.join(app.getPath('documents'), 'naqdi-products-template.xlsx'),
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    });

    if (result.canceled) return { success: false, canceled: true };

    XLSX.writeFile(wb, result.filePath);
    return { success: true, path: result.filePath };
  } catch (error) {
    console.error('[IPC] Template error:', error.message);
    return { success: false, error: error.message };
  }
});

// Read Excel file and return parsed data for preview
ipcMain.handle('excel:readFile', async () => {
  try {
    const lang = store.get('language') || 'ar';

    const result = await dialog.showOpenDialog(mainWindow, {
      title: lang === 'ar' ? 'اختر ملف Excel لاستيراد المنتجات' : 'Select Excel file to import products',
      filters: [
        { name: 'Excel / CSV', extensions: ['xlsx', 'xls', 'csv'] },
      ],
      properties: ['openFile'],
    });

    if (result.canceled || !result.filePaths.length) return { success: false, canceled: true };

    const filePath = result.filePaths[0];

    const wb = XLSX.readFile(filePath, { type: 'file', cellDates: true });
    const sheetName = wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    if (!rawData || rawData.length < 2) {
      return { success: false, error: lang === 'ar' ? 'الملف فارغ أو لا يحتوي على بيانات' : 'File is empty or has no data' };
    }

    const headers = rawData[0].map(h => String(h).trim());
    const rows = rawData.slice(1).filter(row => row.some(cell => cell !== ''));

    return { success: true, headers, rows, fileName: path.basename(filePath) };
  } catch (error) {
    console.error('[IPC] Excel read error:', error.message);
    return { success: false, error: error.message };
  }
});

// Export products to Excel
ipcMain.handle('excel:exportProducts', async () => {
  try {
    const lang = store.get('language') || 'ar';
    if (!db) return { success: false, error: 'Database not initialized' };

    // Fetch all active products with categories
    const stmt = db.prepare(`SELECT p.*, c.name_ar as cat_name_ar, c.name_en as cat_name_en 
      FROM products p LEFT JOIN categories c ON p.category_id = c.id 
      WHERE p.is_active = 1 ORDER BY p.name_ar`);
    const products = [];
    while (stmt.step()) products.push(stmt.getAsObject());
    stmt.free();

    if (products.length === 0) {
      return { success: false, error: lang === 'ar' ? 'لا توجد منتجات للتصدير' : 'No products to export' };
    }

    const headers = ['اسم المنتج (عربي)\nProduct Name Arabic', 'اسم المنتج (إنجليزي)\nProduct Name English',
      'الباركود\nBarcode', 'رمز SKU\nSKU', 'التصنيف\nCategory', 'سعر البيع\nSelling Price',
      'سعر التكلفة\nCost Price', 'الوحدة\nUnit', 'الكمية\nStock Quantity',
      'حد إعادة الطلب\nReorder Level', 'حالة الضريبة\nTax Status'];

    const data = [headers];
    products.forEach(p => {
      data.push([
        p.name_ar || '', p.name_en || '', p.barcode || '', p.sku || '',
        (lang === 'ar' ? p.cat_name_ar : p.cat_name_en) || p.cat_name_ar || '',
        p.price || 0, p.cost || 0, p.unit || 'piece', p.stock_quantity || 0,
        p.reorder_level || 0, p.tax_status || 'standard',
      ]);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = headers.map(() => ({ wch: 20 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products');

    const saveResult = await dialog.showSaveDialog(mainWindow, {
      title: lang === 'ar' ? 'تصدير المنتجات' : 'Export Products',
      defaultPath: path.join(app.getPath('documents'), `naqdi-products-${new Date().toISOString().split('T')[0]}.xlsx`),
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    });

    if (saveResult.canceled) return { success: false, canceled: true };

    XLSX.writeFile(wb, saveResult.filePath);
    return { success: true, path: saveResult.filePath, count: products.length };
  } catch (error) {
    console.error('[IPC] Export error:', error.message);
    return { success: false, error: error.message };
  }
});

// Export sales to Excel
ipcMain.handle('excel:exportSales', async (event, dateFrom, dateTo) => {
  try {
    const lang = store.get('language') || 'ar';
    if (!db) return { success: false, error: 'Database not initialized' };

    let sql = `SELECT s.*, c.name_ar as cust_name_ar FROM sales s 
      LEFT JOIN customers c ON s.customer_id = c.id WHERE s.status = 'completed'`;
    const params = [];
    if (dateFrom) { sql += ' AND date(s.created_at) >= ?'; params.push(dateFrom); }
    if (dateTo) { sql += ' AND date(s.created_at) <= ?'; params.push(dateTo); }
    sql += ' ORDER BY s.created_at DESC';

    const stmt = db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    const sales = [];
    while (stmt.step()) sales.push(stmt.getAsObject());
    stmt.free();

    if (sales.length === 0) {
      return { success: false, error: lang === 'ar' ? 'لا توجد مبيعات للتصدير' : 'No sales to export' };
    }

    const headers = ['رقم الفاتورة\nInvoice #', 'التاريخ\nDate', 'العميل\nCustomer',
      'المجموع الفرعي\nSubtotal', 'الخصم\nDiscount', 'الضريبة\nTax', 'الإجمالي\nTotal',
      'المدفوع\nPaid', 'الباقي\nChange', 'الحالة\nStatus'];

    const data = [headers];
    sales.forEach(s => {
      data.push([s.invoice_number, s.created_at ? s.created_at.substring(0, 19) : '',
        s.cust_name_ar || '', s.subtotal || 0, s.discount_amount || 0,
        s.tax_amount || 0, s.total || 0, s.paid_amount || 0,
        s.change_amount || 0, s.payment_status || 'paid']);
    });

    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = headers.map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sales');

    const saveResult = await dialog.showSaveDialog(mainWindow, {
      title: lang === 'ar' ? 'تصدير المبيعات' : 'Export Sales',
      defaultPath: path.join(app.getPath('documents'), `naqdi-sales-${new Date().toISOString().split('T')[0]}.xlsx`),
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    });

    if (saveResult.canceled) return { success: false, canceled: true };
    XLSX.writeFile(wb, saveResult.filePath);
    return { success: true, path: saveResult.filePath, count: sales.length };
  } catch (error) {
    console.error('[IPC] Sales export error:', error.message);
    return { success: false, error: error.message };
  }
});

// Generic report export — receives headers + rows from renderer
ipcMain.handle('excel:exportReport', async (event, { title, headers, rows, filename }) => {
  try {
    const lang = store.get('language') || 'ar';
    if (!rows || rows.length === 0) {
      return { success: false, error: lang === 'ar' ? 'لا توجد بيانات للتصدير' : 'No data to export' };
    }

    const data = [headers, ...rows];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = headers.map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, title || 'Report');

    const saveResult = await dialog.showSaveDialog(mainWindow, {
      title: lang === 'ar' ? 'تصدير التقرير' : 'Export Report',
      defaultPath: path.join(app.getPath('documents'), `${filename || 'naqdi-report'}-${new Date().toISOString().split('T')[0]}.xlsx`),
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    });

    if (saveResult.canceled) return { success: false, canceled: true };
    XLSX.writeFile(wb, saveResult.filePath);
    return { success: true, path: saveResult.filePath, count: rows.length };
  } catch (error) {
    console.error('[IPC] Report export error:', error.message);
    return { success: false, error: error.message };
  }
});

// Database size
ipcMain.handle('db:size', () => {
  try {
    if (fs.existsSync(dbPath)) {
      const stats = fs.statSync(dbPath);
      return { success: true, bytes: stats.size };
    }
    return { success: true, bytes: 0 };
  } catch (e) { return { success: false, bytes: 0 }; }
});

// Last backup date
ipcMain.handle('backup:lastDate', () => {
  try {
    const d = store.get('lastBackupDate');
    return { success: true, date: d || null };
  } catch (e) { return { success: false, date: null }; }
});

// Export business records as Excel files to a folder
ipcMain.handle('backup:exportRecords', async (event, dateFrom, dateTo) => {
  try {
    const lang = store.get('language') || 'ar';
    if (!db) return { success: false, error: 'DB not ready' };

    const folderResult = await dialog.showOpenDialog(mainWindow, {
      title: lang === 'ar' ? 'اختر مجلد التصدير' : 'Select Export Folder',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (folderResult.canceled || !folderResult.filePaths?.[0]) return { success: false, canceled: true };
    const folder = folderResult.filePaths[0];
    const prefix = `naqdi-${dateFrom || 'all'}-to-${dateTo || 'all'}`;
    const exported = [];

    function queryAll(sql, params) {
      const stmt = db.prepare(sql);
      if (params?.length) stmt.bind(params);
      const rows = [];
      while (stmt.step()) rows.push(stmt.getAsObject());
      stmt.free();
      return rows;
    }

    function saveSheet(filename, sheetName, headers, rows) {
      const data = [headers, ...rows];
      const ws = XLSX.utils.aoa_to_sheet(data);
      ws['!cols'] = headers.map(() => ({ wch: 18 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      const fp = path.join(folder, filename);
      XLSX.writeFile(wb, fp);
      exported.push(filename);
    }

    const dateWhere = (col) => {
      let w = ''; const p = [];
      if (dateFrom) { w += ` AND date(${col}) >= ?`; p.push(dateFrom); }
      if (dateTo) { w += ` AND date(${col}) <= ?`; p.push(dateTo); }
      return { w, p };
    };

    // 1. Sales
    const sd = dateWhere('s.created_at');
    const sales = queryAll(`SELECT s.invoice_number, s.created_at, s.subtotal, s.discount_amount, s.tax_amount, s.total, s.paid_amount, s.change_amount, s.balance_due, s.payment_method, s.payment_status, c.name_ar as customer FROM sales s LEFT JOIN customers c ON s.customer_id=c.id WHERE s.status='completed'${sd.w} ORDER BY s.created_at`, sd.p);
    saveSheet(`${prefix}-sales.xlsx`, 'Sales',
      ['Invoice', 'Date', 'Customer', 'Subtotal', 'Discount', 'VAT', 'Total', 'Paid', 'Change', 'Balance', 'Method', 'Status'],
      sales.map(r => [r.invoice_number, r.created_at, r.customer||'', r.subtotal, r.discount_amount, r.tax_amount, r.total, r.paid_amount, r.change_amount, r.balance_due, r.payment_method, r.payment_status]));

    // 2. Sale Items
    const sid = dateWhere('s.created_at');
    const items = queryAll(`SELECT si.name_ar, si.name_en, si.quantity, si.unit_price, si.discount_amount, si.tax_amount, si.total, s.invoice_number, s.created_at FROM sale_items si JOIN sales s ON si.sale_id=s.id WHERE s.status='completed'${sid.w} ORDER BY s.created_at`, sid.p);
    saveSheet(`${prefix}-sale-items.xlsx`, 'Items',
      ['Invoice', 'Date', 'Product AR', 'Product EN', 'Qty', 'Price', 'Discount', 'Tax', 'Total'],
      items.map(r => [r.invoice_number, r.created_at, r.name_ar, r.name_en, r.quantity, r.unit_price, r.discount_amount, r.tax_amount, r.total]));

    // 3. Products
    const prods = queryAll('SELECT p.name_ar, p.name_en, p.barcode, p.sku, p.price, p.cost, p.stock_quantity, p.unit, p.product_type, c.name_ar as category FROM products p LEFT JOIN categories c ON p.category_id=c.id WHERE p.is_active=1 ORDER BY p.name_ar');
    saveSheet(`${prefix}-products.xlsx`, 'Products',
      ['Name AR', 'Name EN', 'Barcode', 'SKU', 'Price', 'Cost', 'Stock', 'Unit', 'Type', 'Category'],
      prods.map(r => [r.name_ar, r.name_en, r.barcode, r.sku, r.price, r.cost, r.stock_quantity, r.unit, r.product_type, r.category]));

    // 4. Categories
    const cats = queryAll('SELECT name_ar, name_en, color FROM categories WHERE is_active=1 ORDER BY sort_order');
    saveSheet(`${prefix}-categories.xlsx`, 'Categories',
      ['Name AR', 'Name EN', 'Color'],
      cats.map(r => [r.name_ar, r.name_en, r.color]));

    // 5. Customers
    const custs = queryAll('SELECT name_ar, name_en, phone, email, vat_number, loyalty_points, credit_balance FROM customers WHERE is_active=1 ORDER BY name_ar');
    saveSheet(`${prefix}-customers.xlsx`, 'Customers',
      ['Name AR', 'Name EN', 'Phone', 'Email', 'VAT', 'Points', 'Credit Balance'],
      custs.map(r => [r.name_ar, r.name_en, r.phone, r.email, r.vat_number, r.loyalty_points, r.credit_balance]));

    // 6. Expenses
    const ed = dateWhere('created_at');
    const exps = queryAll(`SELECT description, amount, category, payment_method, created_at FROM expenses WHERE 1=1${ed.w} ORDER BY created_at`, ed.p);
    saveSheet(`${prefix}-expenses.xlsx`, 'Expenses',
      ['Date', 'Description', 'Amount', 'Category', 'Method'],
      exps.map(r => [r.created_at, r.description, r.amount, r.category, r.payment_method]));

    // 7. VAT Summary
    const vd = dateWhere('s.created_at');
    const vatOut = queryAll(`SELECT COALESCE(SUM(total),0) as sales, COALESCE(SUM(tax_amount),0) as vat FROM sales s WHERE status='completed'${vd.w}`, vd.p);
    const vp = dateWhere('received_date');
    const vatIn = queryAll(`SELECT COALESCE(SUM(total),0) as purchases FROM purchase_orders WHERE status='received'${vp.w}`, vp.p);
    const vatRate = (store.get('vat') || {}).rate || 15;
    const outVat = vatOut[0]?.vat || 0;
    const inVat = (vatIn[0]?.purchases || 0) * (vatRate / (100 + vatRate));
    saveSheet(`${prefix}-vat-summary.xlsx`, 'VAT',
      ['Item', 'Amount'],
      [['Period', `${dateFrom || 'All'} to ${dateTo || 'All'}`], ['Total Sales', vatOut[0]?.sales||0], ['Output VAT', outVat], ['Total Purchases', vatIn[0]?.purchases||0], ['Input VAT (est)', inVat], ['Net VAT Payable', outVat - inVat]]);

    // 8. Returns
    const rd = dateWhere('r.created_at');
    const rets = queryAll(`SELECT r.original_invoice_number, r.total_refund, r.refund_method, r.return_type, r.reason, r.created_at FROM returns r WHERE 1=1${rd.w} ORDER BY r.created_at`, rd.p);
    saveSheet(`${prefix}-returns.xlsx`, 'Returns',
      ['Date', 'Original Invoice', 'Refund', 'Method', 'Type', 'Reason'],
      rets.map(r => [r.created_at, r.original_invoice_number, r.total_refund, r.refund_method, r.return_type, r.reason]));

    // 9. Suppliers
    const sups = queryAll('SELECT name_ar, name_en, phone, email, vat_number, address FROM suppliers WHERE is_active=1 ORDER BY name_ar');
    saveSheet(`${prefix}-suppliers.xlsx`, 'Suppliers',
      ['Name AR', 'Name EN', 'Phone', 'Email', 'VAT', 'Address'],
      sups.map(r => [r.name_ar, r.name_en, r.phone, r.email, r.vat_number, r.address]));

    return { success: true, folder, files: exported, count: exported.length };
  } catch (error) {
    console.error('[IPC] Export records error:', error.message);
    return { success: false, error: error.message };
  }
});

// ============ BACKUP & RESTORE ============
ipcMain.handle('backup:create', async () => {
  try {
    const lang = store.get('language') || 'ar';
    saveDatabase(); // ensure latest data is on disk

    const result = await dialog.showSaveDialog(mainWindow, {
      title: lang === 'ar' ? 'حفظ نسخة احتياطية' : 'Save Backup',
      defaultPath: path.join(app.getPath('documents'), `naqdi-backup-${new Date().toISOString().split('T')[0]}.naqdi`),
      filters: [{ name: 'Naqdi Backup', extensions: ['naqdi'] }],
    });

    if (result.canceled) return { success: false, canceled: true };

    // Create backup: copy DB + settings into one package
    const backupData = {
      version: '1.0.0',
      date: new Date().toISOString(),
      settings: store.getAll(),
      database: null,
    };

    if (fs.existsSync(dbPath)) {
      const dbBuffer = fs.readFileSync(dbPath);
      backupData.database = dbBuffer.toString('base64');
    }

    fs.writeFileSync(result.filePath, JSON.stringify(backupData), 'utf-8');
    store.set('lastBackupDate', new Date().toISOString());
    return { success: true, path: result.filePath };
  } catch (error) {
    console.error('[IPC] Backup error:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('backup:restore', async () => {
  try {
    const lang = store.get('language') || 'ar';

    const result = await dialog.showOpenDialog(mainWindow, {
      title: lang === 'ar' ? 'استعادة نسخة احتياطية' : 'Restore Backup',
      filters: [{ name: 'Naqdi Backup', extensions: ['naqdi'] }],
      properties: ['openFile'],
    });

    if (result.canceled || !result.filePaths.length) return { success: false, canceled: true };

    const raw = fs.readFileSync(result.filePaths[0], 'utf-8');
    const backupData = JSON.parse(raw);

    if (!backupData.version || !backupData.database) {
      return { success: false, error: lang === 'ar' ? 'ملف النسخة غير صالح' : 'Invalid backup file' };
    }

    // Restore settings
    if (backupData.settings) {
      for (const [key, value] of Object.entries(backupData.settings)) {
        store.set(key, value);
      }
    }

    // Restore database
    const dbBuffer = Buffer.from(backupData.database, 'base64');
    fs.writeFileSync(dbPath, dbBuffer);

    // Close old database and reload
    if (db) {
      try { db.close(); } catch(e) { /* ignore */ }
    }
    const initSqlJs = require('sql.js');
    const wasmPath = path.join(path.dirname(require.resolve('sql.js')), 'sql-wasm.wasm');
    const SQL = await initSqlJs({ locateFile: () => wasmPath });
    db = new SQL.Database(dbBuffer);

    return { success: true, date: backupData.date };
  } catch (error) {
    console.error('[IPC] Restore error:', error.message);
    return { success: false, error: error.message };
  }
});

// ============ PRINTER (ESC/POS over TCP) ============
ipcMain.handle('printer:send', async (event, ip, port, command) => {
  const net = require('net');
  // Force IPv4 — some Windows machines resolve localhost to IPv6 ::1
  const safeIp = (ip === 'localhost') ? '127.0.0.1' : ip;
  
  return new Promise((resolve) => {
    try {
      const socket = new net.Socket();
      socket.setTimeout(5000);

      socket.on('error', (err) => {
        socket.destroy();
        resolve({ success: false, error: err.message });
      });

      socket.on('timeout', () => {
        socket.destroy();
        resolve({ success: false, error: 'Connection timeout' });
      });

      socket.connect(port, safeIp, () => {
        let data;

        if (command === 'drawer') {
          // ESC/POS cash drawer kick command
          // ESC p 0 25 250 — Pin 2, 25*2ms on, 250*2ms off
          data = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]);
        } else if (command === 'test') {
          // Test print — print a line and cut
          const encoder = new TextEncoder();
          const testLine = '--- Naqdi Test Print ---\n\n\n';
          const initCmd = Buffer.from([0x1B, 0x40]); // ESC @ — Initialize printer
          const textBuf = Buffer.from(testLine, 'utf8');
          const cutCmd = Buffer.from([0x1D, 0x56, 0x00]); // GS V 0 — Full cut
          data = Buffer.concat([initCmd, textBuf, cutCmd]);
        } else if (command === 'cut') {
          // Just cut
          data = Buffer.from([0x1D, 0x56, 0x00]);
        } else if (Buffer.isBuffer(command)) {
          // Raw ESC/POS data (for receipt printing)
          data = command;
        } else {
          // String data — send as UTF8
          data = Buffer.from(String(command), 'utf8');
        }

        socket.write(data, () => {
          socket.end();
          resolve({ success: true });
        });
      });
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
});

// ============ ESC/POS IMAGE & QR HELPERS ============

/**
 * Convert a base64-encoded image (PNG/JPEG) to ESC/POS raster bitmap commands.
 * Returns a Buffer ready to send to the printer, or null on failure.
 * Uses Electron's nativeImage for decoding — no external libraries needed.
 */
function logoToEscPosRaster(base64Data, maxWidthPx) {
  try {
    const { nativeImage } = require('electron');

    // Strip data URI prefix if present
    let raw = base64Data;
    if (raw.includes(',')) raw = raw.split(',')[1];

    const img = nativeImage.createFromBuffer(Buffer.from(raw, 'base64'));
    if (img.isEmpty()) return null;

    const origSize = img.getSize();
    // Scale to fit printer width while keeping aspect ratio
    const targetW = Math.min(origSize.width, maxWidthPx || 384);
    const scale = targetW / origSize.width;
    const targetH = Math.round(origSize.height * scale);

    const resized = img.resize({ width: targetW, height: targetH, quality: 'good' });
    const bitmap = resized.toBitmap();
    const size = resized.getSize();
    const w = size.width;
    const h = size.height;

    // Bitmap is BGRA (4 bytes per pixel). Convert to 1-bit monochrome.
    // Each byte in the output holds 8 horizontal pixels (MSB = leftmost).
    // ESC/POS raster format: width in bytes per row, then row data.
    const bytesPerRow = Math.ceil(w / 8);
    const monoData = Buffer.alloc(bytesPerRow * h, 0x00);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const offset = (y * w + x) * 4; // BGRA
        const b = bitmap[offset];
        const g = bitmap[offset + 1];
        const r = bitmap[offset + 2];
        // Luminance threshold — dark pixels become black (bit=1)
        const lum = 0.299 * r + 0.587 * g + 0.114 * b;
        if (lum < 128) {
          const byteIdx = y * bytesPerRow + Math.floor(x / 8);
          const bitIdx = 7 - (x % 8);
          monoData[byteIdx] |= (1 << bitIdx);
        }
      }
    }

    // Build GS v 0 command: Print raster bit image
    // GS v 0 m xL xH yL yH d1...dk
    // m=0 (normal), xL/xH = bytes per row, yL/yH = rows
    const header = Buffer.from([
      0x1D, 0x76, 0x30, 0x00,
      bytesPerRow & 0xFF, (bytesPerRow >> 8) & 0xFF,
      h & 0xFF, (h >> 8) & 0xFF,
    ]);

    // Center align before image, restore after
    const centerOn = Buffer.from([0x1B, 0x61, 0x01]);
    const centerOff = Buffer.from([0x1B, 0x61, 0x00]);

    return Buffer.concat([centerOn, header, monoData, centerOff]);
  } catch (e) {
    console.error('[ESC/POS] Logo conversion error:', e.message);
    return null;
  }
}

/**
 * Build ESC/POS native QR code commands.
 * Uses GS ( k — supported by most modern thermal printers.
 * Returns a Buffer ready to send, or null on failure.
 */
function qrToEscPos(data, moduleSize) {
  try {
    if (!data || data.length === 0) return null;
    const textBuf = Buffer.from(data, 'utf8');
    const len = textBuf.length + 3; // pL/pH count data + overhead

    const parts = [];

    // Center align
    parts.push(Buffer.from([0x1B, 0x61, 0x01]));

    // GS ( k — QR Code: Select model (model 2)
    parts.push(Buffer.from([0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00]));

    // GS ( k — QR Code: Set module size (3-8, default 4)
    const modSize = moduleSize || 5;
    parts.push(Buffer.from([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, modSize]));

    // GS ( k — QR Code: Set error correction level (L=48, M=49, Q=50, H=51)
    parts.push(Buffer.from([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31])); // M level

    // GS ( k — QR Code: Store data
    // pL pH cn fn m d1...dk  where pL pH = length of (cn fn m d1...dk) = textBuf.length + 3
    const storeLenLo = len & 0xFF;
    const storeLenHi = (len >> 8) & 0xFF;
    parts.push(Buffer.from([0x1D, 0x28, 0x6B, storeLenLo, storeLenHi, 0x31, 0x50, 0x30]));
    parts.push(textBuf);

    // GS ( k — QR Code: Print
    parts.push(Buffer.from([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30]));

    // Restore left align
    parts.push(Buffer.from([0x1B, 0x61, 0x00]));

    return Buffer.concat(parts);
  } catch (e) {
    console.error('[ESC/POS] QR generation error:', e.message);
    return null;
  }
}

// ============ ESC/POS THERMAL RECEIPT PRINTING ============
ipcMain.handle('printer:printReceipt', async (event, receiptData) => {
  const net = require('net');
  const settings = store.getAll();
  const pr = settings.printer || {};
  const ip = (pr.ip === 'localhost') ? '127.0.0.1' : pr.ip;
  const port = pr.port || 9100;
  const paperWidth = pr.paperWidth || 80;
  const charWidth = paperWidth === 58 ? 32 : 48; // chars per line

  if (!ip) return { success: false, error: 'No printer IP configured' };

  try {
    // Build ESC/POS command buffer
    const parts = [];

    // ESC @ — Initialize
    parts.push(Buffer.from([0x1B, 0x40]));

    // Helper: center text
    function centerText(text) {
      parts.push(Buffer.from([0x1B, 0x61, 0x01])); // ESC a 1 = center
      parts.push(Buffer.from(text + '\n', 'utf8'));
    }
    // Helper: left align
    function leftText(text) {
      parts.push(Buffer.from([0x1B, 0x61, 0x00])); // ESC a 0 = left
      parts.push(Buffer.from(text + '\n', 'utf8'));
    }
    // Helper: right align
    function rightText(text) {
      parts.push(Buffer.from([0x1B, 0x61, 0x02])); // ESC a 2 = right
      parts.push(Buffer.from(text + '\n', 'utf8'));
    }
    // Helper: bold on/off
    function boldOn() { parts.push(Buffer.from([0x1B, 0x45, 0x01])); }
    function boldOff() { parts.push(Buffer.from([0x1B, 0x45, 0x00])); }
    // Helper: double size on/off
    function doubleOn() { parts.push(Buffer.from([0x1D, 0x21, 0x11])); }
    function doubleOff() { parts.push(Buffer.from([0x1D, 0x21, 0x00])); }
    // Helper: line
    function line() { leftText('-'.repeat(charWidth)); }
    // Helper: two columns (left + right aligned)
    function row(left, right) {
      const space = charWidth - left.length - right.length;
      const padded = left + (space > 0 ? ' '.repeat(space) : ' ') + right;
      leftText(padded);
    }
    // Helper: feed lines
    function feed(n) { parts.push(Buffer.from([0x1B, 0x64, n || 1])); }

    const d = receiptData;

    // === LOGO (bitmap image) ===
    if (d.logo) {
      const maxPx = paperWidth === 58 ? 256 : 384; // pixel width for 58mm vs 80mm paper
      const logoBuf = logoToEscPosRaster(d.logo, maxPx);
      if (logoBuf) {
        parts.push(logoBuf);
        feed(1);
      }
    }

    // === HEADER ===
    if (d.businessNameAr) {
      boldOn(); doubleOn();
      centerText(d.businessNameAr);
      doubleOff(); boldOff();
    }
    if (d.businessNameEn) {
      boldOn();
      centerText(d.businessNameEn);
      boldOff();
    }
    if (d.vatNumber) centerText(d.vatNumber);
    if (d.crNumber) centerText(d.crNumber);
    if (d.address) centerText(d.address);
    if (d.phone) centerText(d.phone);

    line();

    // === INVOICE INFO ===
    if (d.invoiceNumber) row(d.labelInvoice || 'Invoice:', d.invoiceNumber);
    if (d.date) row(d.labelDate || 'Date:', d.date);
    if (d.time) row(d.labelTime || 'Time:', d.time);
    if (d.cashier) row(d.labelCashier || 'Cashier:', d.cashier);
    if (d.ticketNumber) {
      boldOn(); doubleOn();
      centerText('#' + d.ticketNumber);
      doubleOff(); boldOff();
    }
    if (d.customerName) row(d.labelCustomer || 'Customer:', d.customerName);

    line();

    // === ITEMS ===
    if (d.items && d.items.length > 0) {
      for (const item of d.items) {
        const name = item.name || '';
        const qty = item.quantity || 0;
        const price = Number(item.unitPrice || 0).toFixed(2);
        const total = Number(item.total || 0).toFixed(2);
        
        // Product name on first line
        leftText(name);
        // Qty × Price = Total on second line, indented
        row('  ' + qty + ' x ' + price, total);
        
        if (item.discount > 0) {
          row('  ' + (d.labelDiscount || 'Disc:'), '-' + Number(item.discount).toFixed(2));
        }
      }
      line();
    }

    // === TOTALS ===
    row(d.labelSubtotal || 'Subtotal:', Number(d.subtotal || 0).toFixed(2));
    
    if (d.discount > 0) {
      row(d.labelDiscount || 'Discount:', '-' + Number(d.discount).toFixed(2));
    }
    if (d.couponDiscount > 0) {
      row(d.labelCoupon || 'Coupon:', '-' + Number(d.couponDiscount).toFixed(2));
    }
    if (d.loyaltyDiscount > 0) {
      row(d.labelLoyalty || 'Points:', '-' + Number(d.loyaltyDiscount).toFixed(2));
    }
    if (d.exchangeCredit > 0) {
      row(d.labelExchange || 'Exchange:', '-' + Number(d.exchangeCredit).toFixed(2));
    }

    row(d.labelVat || 'VAT (' + (d.vatRate || 15) + '%):', Number(d.tax || 0).toFixed(2));

    line();
    boldOn(); doubleOn();
    row(d.labelTotal || 'TOTAL:', Number(d.total || 0).toFixed(2) + ' ' + (d.currencySymbol || 'SAR'));
    doubleOff(); boldOff();
    line();

    // === PAYMENT ===
    if (d.method === 'split') {
      row(d.labelMethod || 'Payment:', d.labelSplit || 'Split');
      if (d.splitCash > 0) row('  ' + (d.labelCash || 'Cash') + ':', Number(d.splitCash).toFixed(2));
      if (d.splitCard > 0) row('  ' + (d.labelCard || 'Card') + ':', Number(d.splitCard).toFixed(2));
    } else {
      row(d.labelMethod || 'Payment:', d.method === 'cash' ? (d.labelCash || 'Cash') : (d.labelCard || 'Card'));
      row(d.labelPaid || 'Paid:', Number(d.paid || d.total || 0).toFixed(2));
    }
    
    if (d.change > 0) {
      boldOn();
      row(d.labelChange || 'Change:', Number(d.change).toFixed(2));
      boldOff();
    }
    if (d.balanceDue > 0) {
      boldOn();
      row(d.labelBalanceDue || 'Balance Due:', Number(d.balanceDue).toFixed(2));
      boldOff();
    }

    // === LOYALTY POINTS EARNED ===
    if (d.pointsEarned > 0) {
      feed(1);
      centerText('⭐ ' + (d.labelPointsEarned || 'Points Earned') + ': +' + d.pointsEarned);
    }

    // === FOOTER ===
    if (d.footer) {
      feed(1);
      centerText(d.footer);
    }

    // === QR CODE (native ESC/POS QR) ===
    if (d.qrData) {
      feed(1);
      const qrModuleSize = { small: 3, medium: 5, large: 7 };
      const qrBuf = qrToEscPos(d.qrData, qrModuleSize[d.qrSize] || 5);
      if (qrBuf) {
        parts.push(qrBuf);
      } else {
        // Fallback: print QR data as text if native QR fails
        centerText('[QR] ' + d.qrData.substring(0, 40));
      }
    }

    // === BARCODE — invoice number ===
    if (d.showBarcode && d.invoiceNumber) {
      feed(1);
      centerText(d.invoiceNumber);
    }

    feed(3);
    // GS V 0 — Full cut
    parts.push(Buffer.from([0x1D, 0x56, 0x00]));

    // === DRAWER KICK (if enabled) ===
    if (d.kickDrawer) {
      parts.push(Buffer.from([0x1B, 0x70, 0x00, 0x19, 0xFA]));
    }

    // Combine all parts into single buffer
    const fullBuffer = Buffer.concat(parts);

    // Send to printer
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(10000);
      socket.on('error', (err) => { socket.destroy(); resolve({ success: false, error: err.message }); });
      socket.on('timeout', () => { socket.destroy(); resolve({ success: false, error: 'Printer timeout' }); });
      socket.connect(port, ip, () => {
        socket.write(fullBuffer, () => {
          socket.end();
          resolve({ success: true, bytes: fullBuffer.length });
        });
      });
    });
  } catch (err) {
    console.error('[ESC/POS] Receipt error:', err.message);
    return { success: false, error: err.message };
  }
});

// ============ PAYMENT TERMINAL (ECR) ============
// Communicates with Geidea Web ECR service via HTTP on localhost:5000
const http = require('http');

function terminalRequest(url, endpoint, body, timeoutMs) {
  return new Promise((resolve) => {
    try {
      // Force IPv4 — some Windows machines resolve localhost to IPv6 ::1
      const safeUrl = url.replace('://localhost', '://127.0.0.1');
      const fullUrl = new URL(endpoint, safeUrl);
      const postData = body ? JSON.stringify(body) : '';
      const options = {
        hostname: fullUrl.hostname,
        port: fullUrl.port || 5000,
        path: fullUrl.pathname,
        method: body ? 'POST' : 'GET',
        headers: body ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) } : {},
        timeout: timeoutMs || 10000,
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve({ success: true, status: res.statusCode, data: JSON.parse(data) }); }
          catch (e) { resolve({ success: true, status: res.statusCode, data: data }); }
        });
      });
      req.on('error', (e) => resolve({ success: false, error: e.message }));
      req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Connection timeout' }); });
      if (postData) req.write(postData);
      req.end();
    } catch (e) { resolve({ success: false, error: e.message }); }
  });
}

// Test connection — ping the service
ipcMain.handle('terminal:test', async (event, url) => {
  try {
    // Try common Geidea Web ECR endpoints
    const result = await terminalRequest(url || 'http://localhost:5000', '/api/status', null, 5000);
    if (result.success) {
      return { success: true, info: typeof result.data === 'object' ? JSON.stringify(result.data) : String(result.data).substring(0, 100) };
    }
    // Fallback: try root
    const root = await terminalRequest(url || 'http://localhost:5000', '/', null, 5000);
    if (root.success) return { success: true, info: 'Service responding' };
    return { success: false, error: result.error || 'No response' };
  } catch (e) { return { success: false, error: e.message }; }
});

// Send payment to terminal
ipcMain.handle('terminal:pay', async (event, url, amount, invoiceNumber, timeout) => {
  try {
    const settings = store.get('posTerminal') || {};
    const timeoutMs = (timeout || settings.timeout || 60) * 1000;
    
    // Geidea Web ECR payment request
    // Exact endpoint/format may vary — this follows the pattern from Odoo integration
    const body = {
      amount: Number(amount).toFixed(2),
      currency: 'SAR',
      invoiceNumber: invoiceNumber || '',
      transactionType: 'PURCHASE',
      printReceipt: settings.terminalPrint !== false,
    };
    
    const result = await terminalRequest(url || 'http://localhost:5000', '/api/payment', body, timeoutMs);
    
    if (result.success && result.data) {
      const resp = typeof result.data === 'object' ? result.data : {};
      // Map common response fields
      const approved = resp.approved || resp.status === 'APPROVED' || resp.responseCode === '000' || resp.success === true;
      return {
        success: approved,
        referenceNumber: resp.referenceNumber || resp.rrn || resp.ref || '',
        approvalCode: resp.approvalCode || resp.authCode || '',
        cardType: resp.cardType || resp.scheme || '',
        maskedPan: resp.maskedPan || resp.cardNumber || '',
        responseMessage: resp.responseMessage || resp.message || '',
        rawResponse: resp,
      };
    }
    return { success: false, error: result.error || 'No response from terminal' };
  } catch (e) {
    console.error('[ECR] Payment error:', e.message);
    return { success: false, error: e.message };
  }
});

// Refund via terminal
ipcMain.handle('terminal:refund', async (event, url, amount, originalRef, timeout) => {
  try {
    const settings = store.get('posTerminal') || {};
    const timeoutMs = (timeout || settings.timeout || 60) * 1000;
    const body = {
      amount: Number(amount).toFixed(2),
      currency: 'SAR',
      transactionType: 'REFUND',
      originalReferenceNumber: originalRef || '',
      printReceipt: settings.terminalPrint !== false,
    };
    const result = await terminalRequest(url || 'http://localhost:5000', '/api/refund', body, timeoutMs);
    if (result.success && result.data) {
      const resp = typeof result.data === 'object' ? result.data : {};
      const approved = resp.approved || resp.status === 'APPROVED' || resp.responseCode === '000' || resp.success === true;
      return { success: approved, referenceNumber: resp.referenceNumber || resp.rrn || '', responseMessage: resp.responseMessage || '', rawResponse: resp };
    }
    return { success: false, error: result.error || 'No response' };
  } catch (e) { return { success: false, error: e.message }; }
});

// ============ KIOSK MODE & AUTO-START ============
ipcMain.handle('app:setKiosk', (event, enabled) => {
  try {
    if (mainWindow) {
      if (enabled) {
        mainWindow.setKiosk(true);
        mainWindow.setFullScreen(true);
        mainWindow.setClosable(false);
        mainWindow.setMinimizable(false);
        mainWindow.setAlwaysOnTop(true, 'screen-saver');
        mainWindow.setSkipTaskbar(true);
        mainWindow.setMenuBarVisibility(false);
        mainWindow.setAutoHideMenuBar(true);
      } else {
        mainWindow.setKiosk(false);
        mainWindow.setFullScreen(false);
        mainWindow.setClosable(true);
        mainWindow.setMinimizable(true);
        mainWindow.setAlwaysOnTop(false);
        mainWindow.setSkipTaskbar(false);
        mainWindow.setMenuBarVisibility(true);
        mainWindow.setAutoHideMenuBar(false);
      }
    }
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('app:setAutoStart', (event, enabled) => {
  try {
    const { app } = require('electron');
    app.setLoginItemSettings({
      openAtLogin: enabled,
      path: process.execPath,
      args: []
    });
    return { success: true };
  } catch (e) {
    console.error('[IPC] Auto-start error:', e.message);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('app:exit', () => {
  if (mainWindow) mainWindow._forceClose = true;
  const { app } = require('electron');
  app.quit();
});

// ============ ZATCA PHASE 2 ============
const zatca = require('./zatca');

ipcMain.handle('zatca:onboard', async (event, otp) => {
  try {
    const result = await zatca.onboardEGS(store, otp);
    return result;
  } catch (error) {
    console.error('[IPC] ZATCA onboard error:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('zatca:getStatus', () => {
  try {
    return zatca.getZatcaStatus(store);
  } catch (error) {
    return { status: 'error', message: error.message };
  }
});

ipcMain.handle('zatca:reportInvoice', async (event, invoiceData) => {
  try {
    const result = await zatca.reportInvoice(store, invoiceData);
    return result;
  } catch (error) {
    console.error('[IPC] ZATCA report error:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('zatca:clearInvoice', async (event, invoiceData) => {
  try {
    const result = await zatca.clearInvoice(store, invoiceData);
    return result;
  } catch (error) {
    console.error('[IPC] ZATCA clearance error:', error.message);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('zatca:processQueue', async () => {
  try {
    if (!db) return { success: false, error: 'Database not initialized' };
    const creds = store.get('zatcaCredentials');
    if (!creds || creds.status !== 'active') return { success: false, error: 'Not onboarded' };

    // Debug: check total records in zatca_queue
    try {
      const countStmt = db.prepare('SELECT count(*) as cnt, status FROM zatca_queue GROUP BY status');
      const counts = [];
      while (countStmt.step()) counts.push(countStmt.getAsObject());
      countStmt.free();
    } catch(e) {}

    let totalProcessed = 0;
    let totalFailed = 0;
    let totalItems = 0;

    // Loop until no more pending items (process in batches of 10)
    let hasMore = true;
    while (hasMore) {
      const stmt = db.prepare("SELECT * FROM zatca_queue WHERE status = 'pending' ORDER BY created_at ASC LIMIT 10");
      const pending = [];
      while (stmt.step()) pending.push(stmt.getAsObject());
      stmt.free();

      if (pending.length === 0) { hasMore = false; break; }
      totalItems += pending.length;

      for (const item of pending) {
        try {
          const invoiceData = JSON.parse(item.invoice_data);
          const result = await zatca.reportInvoice(store, invoiceData);
          if (result.success) {
            db.run("UPDATE zatca_queue SET status = ?, zatca_response = ?, processed_at = datetime('now') WHERE id = ?",
              ['reported', JSON.stringify(result.data), item.id]);
            totalProcessed++;
          } else {
            const retries = (item.retry_count || 0) + 1;
            const newStatus = retries >= 3 ? 'failed' : 'pending';
            db.run('UPDATE zatca_queue SET status = ?, retry_count = ?, last_error = ? WHERE id = ?',
              [newStatus, retries, JSON.stringify(result.data), item.id]);
            if (newStatus === 'failed') totalFailed++;
          }
        } catch (e) {
          db.run('UPDATE zatca_queue SET retry_count = retry_count + 1, last_error = ? WHERE id = ?',
            [e.message, item.id]);
        }
      }

      // If fewer than 10, we're done
      if (pending.length < 10) hasMore = false;
    }

    saveDatabase();
    return { success: true, processed: totalProcessed, failed: totalFailed, total: totalItems };
  } catch (error) {
    console.error('[IPC] ZATCA queue error:', error.message);
    return { success: false, error: error.message };
  }
});

// ============ APP LIFECYCLE ============
app.whenReady().then(async () => {
  store = new SettingsStore({
    language: 'ar',
    theme: 'dark',
    dateFormat: 'hijri_gregorian',
    currency: { symbol: 'ر.س', position: 'after', decimals: 2 },
    vat: { enabled: true, rate: 15, inclusive: false, registrationNumber: '' },
    zakat: { enabled: false, rate: 2.5, fiscalYearStart: '01-01' },
    business: {
      nameAr: '', nameEn: '', logo: '', crNumber: '', vatNumber: '',
      address: '', phone: '', email: '', footerText: ''
    },
    invoiceFormat: {
      blocks: ['prefix', 'year', 'sequence'],
      prefix: 'INV', separator: '-', sequenceDigits: 5, branchCode: '01'
    },
    zatcaMode: 'off',
    printer: { enabled: false, paperWidth: 80, autoPrint: true, copies: 1 },
    receipt: { ticketEnabled: false, ticketStart: 1, showItems: true, showLogo: true, showNameAr: true, showNameEn: true, showVat: true, showCR: false, showAddress: false, showPhone: false, bilingualItems: false, showBarcode: true, showQR: true, qrSize: 'medium', fontSize: 'medium' },
    posTerminal: { enabled: false, brand: 'pax', port: 'COM1', baudRate: 9600 },
    backup: { autoEnabled: false, schedule: 'daily', location: '', keepCount: 10 }
  });

  try {
    await initDatabase();
  } catch (e) {
    console.error('FATAL: Database init failed:', e.message);
  }

  createWindow();

  // Start auto-updater (checks GitHub for new versions)
  setupAutoUpdater();

  // ============ APP MENU ============
  const { Menu, shell } = require('electron');
  
  function buildMenu(isAdmin) {
    const fileSubmenu = [
      { label: 'بيع جديد / New Sale', accelerator: 'F2', click: () => mainWindow?.webContents.send('nav', 'pos') },
    ];
    if (isAdmin) {
      fileSubmenu.push(
        { label: 'تصدير المبيعات / Export Sales', click: () => mainWindow?.webContents.send('action', 'export-sales') },
        { type: 'separator' },
        { label: 'نسخ احتياطي / Backup Now', click: () => mainWindow?.webContents.send('action', 'backup') },
        { label: 'استعادة / Restore Backup', click: () => mainWindow?.webContents.send('action', 'restore') },
      );
    }
    fileSubmenu.push(
      { type: 'separator' },
      { label: 'خروج / Exit', accelerator: 'CmdOrCtrl+Q', click: () => { if (mainWindow) mainWindow._forceClose = true; app.quit(); } }
    );

    const viewSubmenu = [
      { label: 'لوحة التحكم / Dashboard', accelerator: 'F1', click: () => mainWindow?.webContents.send('nav', 'dashboard') },
      { label: 'نقطة البيع / POS', accelerator: 'F2', click: () => mainWindow?.webContents.send('nav', 'pos') },
      { type: 'separator' },
      { label: 'شاشة كاملة / Fullscreen', accelerator: 'F11', click: () => { if (mainWindow) mainWindow.setFullScreen(!mainWindow.isFullScreen()); } },
      { type: 'separator' },
      { label: 'تكبير / Zoom In', accelerator: 'CmdOrCtrl+=', role: 'zoomIn' },
      { label: 'تصغير / Zoom Out', accelerator: 'CmdOrCtrl+-', role: 'zoomOut' },
      { label: 'حجم افتراضي / Reset Zoom', accelerator: 'CmdOrCtrl+0', role: 'resetZoom' },
    ];

    const menuTemplate = [
      { label: 'ملف / File', submenu: fileSubmenu },
      {
        label: 'تعديل / Edit',
        submenu: [
          { label: 'تراجع / Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
          { label: 'إعادة / Redo', accelerator: 'CmdOrCtrl+Shift+Z', role: 'redo' },
          { type: 'separator' },
          { label: 'قص / Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
          { label: 'نسخ / Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
          { label: 'لصق / Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
          { label: 'تحديد الكل / Select All', accelerator: 'CmdOrCtrl+A', role: 'selectAll' },
        ]
      },
      { label: 'عرض / View', submenu: viewSubmenu },
      {
        label: 'مساعدة / Help',
        submenu: [
          { label: 'اختصارات لوحة المفاتيح / Keyboard Shortcuts', click: () => mainWindow?.webContents.send('action', 'shortcuts') },
          { type: 'separator' },
          { label: 'تواصل مع الدعم / Contact Support', click: () => shell.openExternal('mailto:info@asassearch.com?subject=Naqdi Support') },
          { type: 'separator' },
          { label: 'عن نقدي / About Naqdi', click: () => mainWindow?.webContents.send('action', 'about') },
        ]
      }
    ];
    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);
  }

  // Build default menu (admin)
  buildMenu(true);

  // Rebuild menu when user changes
  ipcMain.handle('app:setMenu', (event, isAdmin) => {
    buildMenu(isAdmin);
    return { success: true };
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  saveDatabase();
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  saveDatabase();
});

// ============ USB PRINTER — List Windows printers ============
ipcMain.handle('printer:list', async () => {
  try {
    const printers = mainWindow.webContents.getPrintersAsync
      ? await mainWindow.webContents.getPrintersAsync()
      : mainWindow.webContents.getPrinters();
    return { success: true, data: printers.map(p => ({
      name: p.name,
      displayName: p.displayName || p.name,
      isDefault: p.isDefault,
      status: p.status,
    })) };
  } catch (e) {
    return { success: false, error: e.message, data: [] };
  }
});

// ============ USB PRINTER — Silent print HTML receipt ============
ipcMain.handle('printer:printUSB', async (event, printerName, htmlContent, paperWidth) => {
  return new Promise((resolve) => {
    try {
      const printWin = new BrowserWindow({
        show: false,
        width: paperWidth === 58 ? 220 : 302,
        height: 900,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      });
      printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));
      printWin.webContents.on('did-finish-load', () => {
        setTimeout(() => {
          printWin.webContents.print({
            silent: true,
            printBackground: true,
            deviceName: printerName,
            margins: { marginType: 'none' },
            pageSize: { width: (paperWidth === 58 ? 58000 : 80000), height: 297000 },
          }, (success, failureReason) => {
            printWin.close();
            resolve({ success, error: failureReason || null });
          });
        }, 300);
      });
    } catch (e) {
      resolve({ success: false, error: e.message });
    }
  });
});

// ============ BROWSER PRINT WITH PREVIEW ============
ipcMain.handle('printer:printPreview', async (event, htmlContent, paperWidth) => {
  return new Promise((resolve) => {
    try {
      const printWin = new BrowserWindow({
        show: false,
        width: paperWidth === 58 ? 220 : 302,
        height: 900,
        webPreferences: { nodeIntegration: false, contextIsolation: true },
      });
      printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent));
      printWin.webContents.on('did-finish-load', () => {
        setTimeout(() => {
          printWin.webContents.print({
            silent: false,
            printBackground: true,
            margins: { marginType: 'none' },
            pageSize: { width: (paperWidth === 58 ? 58000 : 80000), height: 297000 },
          }, (success, failureReason) => {
            printWin.close();
            resolve({ success, error: failureReason || null });
          });
        }, 300);
      });
    } catch (e) {
      resolve({ success: false, error: e.message });
    }
  });
});

// ============ CUSTOMER DISPLAY — Second screen window ============
let customerDisplayWindow = null;
ipcMain.handle('display:open', async (event, screenIndex) => {
  try {
    const { screen } = require('electron');
    const displays = screen.getAllDisplays();
    if (displays.length < 2 && screenIndex !== 0) {
      return { success: false, error: 'No second display detected' };
    }
    const targetDisplay = displays[screenIndex] || displays[displays.length - 1];
    const { x, y, width, height } = targetDisplay.bounds;

    if (customerDisplayWindow && !customerDisplayWindow.isDestroyed()) {
      customerDisplayWindow.close();
    }

    customerDisplayWindow = new BrowserWindow({
      x, y, width, height,
      fullscreen: true,
      frame: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });
    customerDisplayWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!DOCTYPE html><html><head><style>
      *{margin:0;padding:0;box-sizing:border-box;}
      body{background:#0a0e1a;color:#fff;font-family:'Noto Sans Arabic','Inter',sans-serif;display:flex;flex-direction:column;height:100vh;overflow:hidden;}
      #header{padding:20px;text-align:center;background:linear-gradient(135deg,#1a237e,#0d47a1);}
      #logo{font-size:28px;font-weight:900;color:#D4A853;}
      #shop{font-size:16px;color:rgba(255,255,255,0.7);margin-top:4px;}
      #items{flex:1;overflow-y:auto;padding:16px 24px;}
      .item{display:flex;justify-content:space-between;padding:14px 0;border-bottom:1px solid rgba(255,255,255,0.08);font-size:20px;animation:fadeIn 0.3s ease;}
      .item-name{flex:1;} .item-price{font-weight:700;color:#D4A853;min-width:120px;text-align:left;}
      #footer{background:#111827;padding:24px;text-align:center;}
      #total-label{font-size:18px;color:rgba(255,255,255,0.5);}
      #total{font-size:52px;font-weight:900;color:#D4A853;margin-top:4px;}
      #message{font-size:24px;color:#4CAF50;display:none;padding:40px;text-align:center;}
      @keyframes fadeIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
    </style></head><body>
      <div id="header"><div id="logo">نقدي</div><div id="shop"></div></div>
      <div id="items"></div>
      <div id="footer"><div id="total-label"></div><div id="total">0.00</div></div>
      <div id="message"></div>
      <script>
        window.addEventListener('message', (e) => {
          if (!e.data || !e.data.type) return;
          const d = e.data;
          if (d.type === 'init') {
            document.getElementById('shop').textContent = d.shopName || '';
            document.getElementById('total-label').textContent = d.totalLabel || 'الإجمالي';
          }
          if (d.type === 'cart') {
            const el = document.getElementById('items');
            el.innerHTML = (d.items||[]).map(i => '<div class="item"><span class="item-name">'+i.name+'</span><span class="item-price">'+i.price+'</span></div>').join('');
            document.getElementById('total').textContent = d.total || '0.00';
            document.getElementById('message').style.display = 'none';
            document.getElementById('items').style.display = '';
            document.getElementById('footer').style.display = '';
            el.scrollTop = el.scrollHeight;
          }
          if (d.type === 'success') {
            document.getElementById('items').style.display = 'none';
            document.getElementById('footer').style.display = 'none';
            const msg = document.getElementById('message');
            msg.style.display = 'block';
            msg.innerHTML = '<div style="font-size:80px;margin-bottom:16px;">✅</div><div>'+d.text+'</div>';
            setTimeout(() => { msg.style.display='none'; document.getElementById('items').style.display=''; document.getElementById('footer').style.display=''; document.getElementById('items').innerHTML=''; document.getElementById('total').textContent='0.00'; }, 5000);
          }
        });
      </script>
    </body></html>`));

    customerDisplayWindow.on('closed', () => { customerDisplayWindow = null; });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('display:update', (event, data) => {
  try {
    if (customerDisplayWindow && !customerDisplayWindow.isDestroyed()) {
      customerDisplayWindow.webContents.executeJavaScript(`window.postMessage(${JSON.stringify(data)}, '*');`);
      return { success: true };
    }
    return { success: false, error: 'Display not open' };
  } catch (e) { return { success: false, error: e.message }; }
});

ipcMain.handle('display:close', () => {
  if (customerDisplayWindow && !customerDisplayWindow.isDestroyed()) {
    customerDisplayWindow.close();
    customerDisplayWindow = null;
  }
  return { success: true };
});

ipcMain.handle('display:screens', () => {
  const { screen } = require('electron');
  const displays = screen.getAllDisplays();
  return { success: true, data: displays.map((d, i) => ({
    index: i, width: d.bounds.width, height: d.bounds.height,
    isPrimary: d.bounds.x === 0 && d.bounds.y === 0,
    label: `${d.bounds.width}×${d.bounds.height}${d.bounds.x === 0 && d.bounds.y === 0 ? ' (Primary)' : ' (External)'}`,
  })) };
});

// ============ NETWORK AUTO-SCAN — Find printers/terminals ============
ipcMain.handle('network:scan', async (event, port, timeout) => {
  const net = require('net');
  const os = require('os');
  const results = [];
  const scanTimeout = timeout || 1000;

  // Get local IP to determine subnet
  const ifaces = os.networkInterfaces();
  let subnet = '192.168.1';
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && iface.address.startsWith('192.168')) {
        subnet = iface.address.split('.').slice(0, 3).join('.');
        break;
      }
    }
  }

  // Scan common IPs (1-254) — but limit to first 50 for speed
  const scanRange = [];
  for (let i = 1; i <= 254; i++) scanRange.push(`${subnet}.${i}`);

  const promises = scanRange.map(ip => new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(scanTimeout);
    socket.on('connect', () => { results.push(ip); socket.destroy(); resolve(); });
    socket.on('error', () => { socket.destroy(); resolve(); });
    socket.on('timeout', () => { socket.destroy(); resolve(); });
    socket.connect(port, ip);
  }));

  await Promise.all(promises);
  return { success: true, data: results, subnet };
});

// ==================== QOYOD ACCOUNTING INTEGRATION ====================
const https = require('https');

function qoyodRequest(method, path, apiKey, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(`https://api.qoyod.com/2.0${path}`);
    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname + url.search,
      method,
      headers: {
        'API-KEY': apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = data ? JSON.parse(data) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, data: json, status: res.statusCode });
          } else {
            resolve({ success: false, error: json.message || json.error || JSON.stringify(json), status: res.statusCode, data: json });
          }
        } catch (e) {
          resolve({ success: false, error: `Parse error: ${data.substring(0, 200)}`, status: res.statusCode });
        }
      });
    });
    req.on('error', (e) => resolve({ success: false, error: e.message }));
    req.setTimeout(30000, () => { req.destroy(); resolve({ success: false, error: 'Timeout (30s)' }); });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Test connection — GET /accounts
ipcMain.handle('qoyod:test', async (event, apiKey) => {
  return qoyodRequest('GET', '/accounts', apiKey);
});

// Fetch accounts, inventories, units for setup dropdowns
ipcMain.handle('qoyod:fetchSetup', async (event, apiKey) => {
  const [accounts, inventories, units, categories] = await Promise.all([
    qoyodRequest('GET', '/accounts', apiKey),
    qoyodRequest('GET', '/inventories', apiKey),
    qoyodRequest('GET', '/product_unit_types', apiKey),
    qoyodRequest('GET', '/categories', apiKey),
  ]);
  return { accounts, inventories, units, categories };
});

// Generic Qoyod API call
ipcMain.handle('qoyod:api', async (event, method, path, apiKey, body) => {
  return qoyodRequest(method, path, apiKey, body || null);
});

// Open external URL in system browser
ipcMain.handle('shell:openExternal', (event, url) => {
  const { shell } = require('electron');
  shell.openExternal(url);
});

// ==================== LICENSE & TRIAL SYSTEM ====================

const LICENSE_PRODUCT_ID = 'RtOjkDRNDaggXfM2gtyO';
const LICENSE_API_URL = 'https://essentialsmarket.online/api/licenses/verify';
const TRIAL_DURATION_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days offline grace
const LICENSE_SECRET = 'nqdi-k9x2m7p4w6';

function getMachineId() {
  const os = require('os');
  const raw = `${os.hostname()}-${os.cpus()[0]?.model || 'cpu'}-${os.userInfo().username}-${os.platform()}`;
  return crypto.createHash('sha256').update(raw).digest('hex').substring(0, 32);
}

function encryptLicenseData(data) {
  const machineId = getMachineId();
  const key = crypto.createHash('sha256').update(LICENSE_SECRET + machineId).digest();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptLicenseData(encStr) {
  try {
    const machineId = getMachineId();
    const key = crypto.createHash('sha256').update(LICENSE_SECRET + machineId).digest();
    const [ivHex, encrypted] = encStr.split(':');
    if (!ivHex || !encrypted) return null;
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch (e) { return null; }
}

function getLicenseFilePath() {
  return path.join(app.getPath('userData'), '.license');
}

function readLicenseFile() {
  try {
    const fp = getLicenseFilePath();
    if (!fs.existsSync(fp)) return null;
    return decryptLicenseData(fs.readFileSync(fp, 'utf-8'));
  } catch { return null; }
}

function writeLicenseFile(data) {
  fs.writeFileSync(getLicenseFilePath(), encryptLicenseData(data), 'utf-8');
}

async function verifyLicenseRemote(licenseKey) {
  return new Promise((resolve) => {
    const postData = JSON.stringify({
      product_id: LICENSE_PRODUCT_ID,
      license_key: licenseKey
    });
    const url = new URL(LICENSE_API_URL);
    
    const options = {
      hostname: url.hostname, 
      port: 443, 
      path: url.pathname, 
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Content-Length': Buffer.byteLength(postData, 'utf8')
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { 
          const json = JSON.parse(data);
          resolve({ success: res.statusCode >= 200 && res.statusCode < 300, data: json, status: res.statusCode }); 
        }
        catch { resolve({ success: false, error: 'Invalid response: ' + data.substring(0, 200) }); }
      });
    });
    req.on('error', (e) => {
      resolve({ success: false, error: e.message });
    });
    req.setTimeout(15000, () => { req.destroy(); resolve({ success: false, error: 'Timeout' }); });
    req.write(postData);
    req.end();
  });
}

ipcMain.handle('license:getStatus', () => {
  const data = readLicenseFile();
  const now = Date.now();

  if (!data) {
    const trialData = { type: 'trial', trialStart: now, trialEnd: now + TRIAL_DURATION_MS, lastSeen: now, machineId: getMachineId() };
    writeLicenseFile(trialData);
    return { status: 'trial', remainingMs: TRIAL_DURATION_MS, trialEnd: trialData.trialEnd };
  }

  if (data.machineId && data.machineId !== getMachineId()) {
    return { status: 'invalid', reason: 'machine_mismatch' };
  }

  if (data.lastSeen && now < data.lastSeen - 60000) {
    return { status: 'expired', reason: 'clock_tamper' };
  }

  data.lastSeen = now;
  writeLicenseFile(data);

  if (data.type === 'licensed') {
    return { status: 'licensed', licenseKey: data.licenseKey ? (data.licenseKey.substring(0, 8) + '****') : '' };
  }

  if (data.type === 'trial') {
    const remaining = data.trialEnd - now;
    if (remaining > 0) return { status: 'trial', remainingMs: remaining, trialEnd: data.trialEnd };
    return { status: 'expired', reason: 'trial_ended' };
  }

  return { status: 'expired', reason: 'unknown' };
});

ipcMain.handle('license:activate', async (event, licenseKey) => {
  if (!licenseKey || licenseKey.trim().length < 5) return { success: false, error: 'Invalid key format' };
  const result = await verifyLicenseRemote(licenseKey.trim());
  
  
  // API returns: { valid: true/false, message: "..." }
  const apiData = result.data || {};
  
  if (result.success && apiData.valid === true) {
    writeLicenseFile({ type: 'licensed', licenseKey: licenseKey.trim(), activatedAt: Date.now(), lastSeen: Date.now(), lastVerified: Date.now(), machineId: getMachineId() });
    return { success: true, message: apiData.message || 'Activated' };
  }
  
  const errMsg = apiData.message || result.error || `HTTP ${result.status || 'unknown'}`;
  return { success: false, error: errMsg, debug: JSON.stringify(result).substring(0, 500) };
});

ipcMain.handle('license:deactivate', () => {
  try {
    const fp = getLicenseFilePath();
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    return { success: true };
  } catch (e) { return { success: false, error: e.message }; }
});
