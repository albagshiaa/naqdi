// ============================================
// NAQDI - PEER SYNC MODULE (Windows/Electron)
// Device-to-device sync over WiFi using TCP
// Protocol-compatible with Android sync.ts v2.0
// ============================================

const net = require('net');
const os = require('os');

const SYNC_PORT = 9473;
const SYNC_VERSION = '2.0';

let _server = null;
let _clients = [];
let _authenticatedClients = new Set();
let _syncRunning = false;
let _deviceId = '';
let _role = 'none'; // 'primary' | 'secondary' | 'none'
let _primaryIP = '';
let _syncCode = '';
let _syncSecret = '';
let _reconnectAttempts = 0;
let _reconnectTimer = null;
let _onStatusChange = null;
let _store = null; // electron-store instance, injected via init()
let _saveDb = null; // saveDatabase callback, injected via init()

// ─── Init (must be called with the settings store and saveDatabase function) ───
function init(store, saveDb) {
  _store = store;
  _saveDb = saveDb || null;
}

// ─── Device ID ───
function getDeviceId() {
  if (_deviceId) return _deviceId;
  if (_store) {
    const saved = _store.get('syncDeviceId');
    if (saved) { _deviceId = saved; return _deviceId; }
  }
  _deviceId = 'DEV-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  if (_store) _store.set('syncDeviceId', _deviceId);
  return _deviceId;
}

// ─── Get local IP ───
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '0.0.0.0';
}

// ─── IP to 6-digit code ───
function ipToCode(ip) {
  const parts = ip.split('.').map(Number);
  const num = (parts[2] * 256 + parts[3]) % 1000000;
  return String(num).padStart(6, '0');
}

// ─── Generate 4-char secret ───
function generateSecret() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
  return s;
}

// ─── Create Sync Group (Primary) ───
async function createSyncGroup(db) {
  const ip = getLocalIP();
  if (ip === '0.0.0.0') throw new Error('No WiFi/LAN connection detected.');

  _role = 'primary';
  _syncCode = ipToCode(ip);
  _syncSecret = generateSecret();
  _authenticatedClients = new Set();

  if (_server) { try { _server.close(); } catch (e) {} }

  _server = net.createServer((socket) => {
    console.log('[SYNC] Client connected (awaiting authentication)');

    let buffer = '';
    socket.on('data', (data) => {
      buffer += data.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.trim()) handleMessage(line.trim(), socket, db);
      }
    });

    socket.on('close', () => {
      _clients = _clients.filter(c => c !== socket);
      _authenticatedClients.delete(socket);
      console.log('[SYNC] Client disconnected');
      if (_onStatusChange) _onStatusChange({ connected: _authenticatedClients.size, role: 'primary' });
    });

    socket.on('error', (err) => console.log('[SYNC] Socket error:', err.message));
  });

  _server.listen(SYNC_PORT, '0.0.0.0');

  if (_store) {
    _store.set('syncRole', 'primary');
    _store.set('syncCode', _syncCode);
    _store.set('syncIP', ip);
    _store.set('syncSecret', _syncSecret);
  }

  if (_onStatusChange) _onStatusChange({ role: 'primary', code: _syncCode, secret: _syncSecret, ip, connected: 0 });

  return { code: _syncCode, ip, secret: _syncSecret };
}

// ─── Join Sync Group (Secondary) ───
async function joinSyncGroup(db, code, secret, primaryIP) {
  if (!secret || secret.length !== 4) throw new Error('Invalid sync secret. Get the 4-character code from the primary device.');

  _role = 'secondary';
  _syncCode = code;
  _syncSecret = secret.toUpperCase();
  _reconnectAttempts = 0;

  if (!primaryIP) {
    const myIP = getLocalIP();
    const subnet = myIP.split('.').slice(0, 3).join('.');
    for (let i = 1; i <= 254; i++) {
      const testIP = `${subnet}.${i}`;
      try { if (ipToCode(testIP) === code) { primaryIP = testIP; break; } } catch (e) {}
    }
    if (!primaryIP) throw new Error('Could not find primary device. Enter IP manually.');
  }

  _primaryIP = primaryIP;

  const connected = await connectToPrimary(db);
  if (!connected) throw new Error('Could not connect to primary device at ' + primaryIP);

  if (_store) {
    _store.set('syncRole', 'secondary');
    _store.set('syncCode', code);
    _store.set('syncPrimaryIP', primaryIP);
    _store.set('syncSecret', _syncSecret);
  }

  return true;
}

// ─── Connect to primary ───
function connectToPrimary(db) {
  return new Promise((resolve) => {
    try {
      const client = new net.Socket();
      client.setTimeout(5000);

      client.connect(SYNC_PORT, _primaryIP, () => {
        console.log('[SYNC] Connected to primary at', _primaryIP);
        for (const old of _clients) { try { old.destroy(); } catch (e) {} }
        _clients = [client];
        _reconnectAttempts = 0;

        sendMessage(client, { type: 'handshake', deviceId: getDeviceId(), version: SYNC_VERSION, secret: _syncSecret });

        let buffer = '';
        client.on('data', (data) => {
          buffer += data.toString();
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.trim()) handleMessage(line.trim(), client, db);
          }
        });

        client.on('close', () => {
          _clients = [];
          _authenticatedClients.delete(client);
          if (_onStatusChange) _onStatusChange({ connected: 0, role: 'secondary' });
          scheduleReconnect(db);
        });

        client.on('error', (err) => console.log('[SYNC] Connection error:', err.message));

        if (_onStatusChange) _onStatusChange({ connected: 1, role: 'secondary' });
        resolve(true);
      });

      client.on('error', () => resolve(false));
      client.on('timeout', () => { client.destroy(); resolve(false); });
    } catch (e) { resolve(false); }
  });
}

// ─── Exponential backoff reconnect ───
function scheduleReconnect(db) {
  if (_role !== 'secondary') return;
  if (_reconnectTimer) clearTimeout(_reconnectTimer);

  _reconnectAttempts++;
  const delay = Math.min(5000 * Math.pow(2, _reconnectAttempts - 1), 60000);
  console.log(`[SYNC] Reconnecting in ${delay / 1000}s (attempt ${_reconnectAttempts})`);

  _reconnectTimer = setTimeout(() => {
    if (_role === 'secondary') connectToPrimary(db);
  }, delay);
}

// ─── Send message ───
function sendMessage(socket, msg) {
  try { socket.write(JSON.stringify(msg) + '\n'); } catch (e) {}
}

function isAuthenticated(socket) {
  return _authenticatedClients.has(socket);
}

// ─── Handle incoming message ───
async function handleMessage(raw, socket, db) {
  try {
    const msg = JSON.parse(raw);

    switch (msg.type) {
      case 'handshake': {
        if (_role === 'primary') {
          if (msg.secret !== _syncSecret) {
            console.log('[SYNC] Handshake REJECTED — bad secret from', msg.deviceId);
            sendMessage(socket, { type: 'handshake_reject', reason: 'Invalid secret' });
            setTimeout(() => { try { socket.destroy(); } catch (e) {} }, 500);
            return;
          }
          if (!_clients.includes(socket)) _clients.push(socket);
          _authenticatedClients.add(socket);
          console.log('[SYNC] Handshake ACCEPTED from', msg.deviceId);
          sendMessage(socket, { type: 'handshake_ack', deviceId: getDeviceId(), version: SYNC_VERSION });
          if (_onStatusChange) _onStatusChange({ connected: _authenticatedClients.size, role: 'primary' });
        }
        break;
      }

      case 'handshake_ack': {
        _authenticatedClients.add(socket);
        console.log('[SYNC] Authenticated with primary', msg.deviceId);
        break;
      }

      case 'handshake_reject': {
        console.log('[SYNC] Authentication rejected:', msg.reason);
        _clients = [];
        _authenticatedClients.clear();
        if (_onStatusChange) _onStatusChange({ connected: 0, role: 'secondary', error: msg.reason });
        try { socket.destroy(); } catch (e) {}
        break;
      }

      case 'sync_request': {
        if (!isAuthenticated(socket)) { sendMessage(socket, { type: 'handshake_reject', reason: 'Not authenticated' }); return; }
        const changes = await getChangesSince(db, msg.since || '2000-01-01T00:00:00');
        sendMessage(socket, { type: 'sync_data', changes, since: msg.since, deviceId: getDeviceId() });
        break;
      }

      case 'sync_data': {
        if (!isAuthenticated(socket)) { sendMessage(socket, { type: 'handshake_reject', reason: 'Not authenticated' }); return; }
        const applied = await applyChanges(db, msg.changes || {});
        sendMessage(socket, { type: 'sync_ack', applied, deviceId: getDeviceId() });
        if (_onStatusChange) _onStatusChange({ lastSync: new Date().toISOString(), applied });
        break;
      }

      case 'sync_ack': {
        console.log('[SYNC] Sync acknowledged:', msg.applied, 'changes applied');
        if (_onStatusChange) _onStatusChange({ lastSync: new Date().toISOString() });
        break;
      }

      case 'settings_push': {
        if (!isAuthenticated(socket)) return;
        if (msg.sharedSettings && _store) {
          for (const [key, value] of Object.entries(msg.sharedSettings)) {
            _store.set(key, value);
          }
          console.log('[SYNC] Shared settings received and applied');
        }
        break;
      }
    }
  } catch (e) {
    console.log('[SYNC] Message parse error:', e.message);
  }
}

// ─── DB helper (matches main.js sql.js pattern — synchronous) ───
function dbQuery(db, sql, params = []) {
  try {
    const stmt = db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    const results = [];
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return { success: true, data: results };
  } catch (err) {
    console.error('[SYNC] DB query error:', err.message, 'SQL:', sql.substring(0, 80));
    return { success: false, data: [], error: err.message };
  }
}

function dbRun(db, sql, params = []) {
  try {
    if (params.length > 0) {
      db.run(sql, params);
    } else {
      db.run(sql);
    }
    return { success: true, changes: db.getRowsModified() };
  } catch (err) {
    console.error('[SYNC] DB run error:', err.message, 'SQL:', sql.substring(0, 80));
    return { success: false, error: err.message };
  }
}

// ─── Get changes since timestamp ───
async function getChangesSince(db, since) {
  const changes = {};

  const prods = await dbQuery(db, "SELECT * FROM products WHERE updated_at > ? ORDER BY updated_at", [since]);
  if (prods.success && prods.data.length) changes.products = prods.data;

  const custs = await dbQuery(db, "SELECT * FROM customers WHERE updated_at > ? ORDER BY updated_at", [since]);
  if (custs.success && custs.data.length) changes.customers = custs.data;

  const cats = await dbQuery(db, "SELECT * FROM categories WHERE updated_at > ? ORDER BY updated_at", [since]);
  if (cats.success && cats.data.length) changes.categories = cats.data;

  const sales = await dbQuery(db, "SELECT * FROM sales WHERE updated_at > ? AND status IN ('completed','returned','voided') ORDER BY updated_at", [since]);
  if (sales.success && sales.data.length) {
    changes.sales = sales.data;
    const saleIds = sales.data.map(s => s.id);
    if (saleIds.length > 0) {
      const items = await dbQuery(db, `SELECT si.*, s.invoice_number FROM sale_items si JOIN sales s ON si.sale_id = s.id WHERE si.sale_id IN (${saleIds.map(() => '?').join(',')})`, saleIds);
      if (items.success) changes.sale_items = items.data;
    }
  }

  const returns = await dbQuery(db, "SELECT * FROM returns WHERE created_at > ? ORDER BY created_at", [since]);
  if (returns.success && returns.data.length) {
    changes.returns = returns.data;
    const returnIds = returns.data.map(r => r.id);
    if (returnIds.length > 0) {
      const ri = await dbQuery(db, `SELECT * FROM return_items WHERE return_id IN (${returnIds.map(() => '?').join(',')})`, returnIds);
      if (ri.success) changes.return_items = ri.data;
    }
  }

  const stock = await dbQuery(db, "SELECT * FROM stock_movements WHERE created_at > ? ORDER BY created_at", [since]);
  if (stock.success && stock.data.length) changes.stock_movements = stock.data;

  const users = await dbQuery(db, "SELECT * FROM users");
  if (users.success && users.data.length) changes.users = users.data;

  return changes;
}

// ─── Apply changes from remote device ───
async function applyChanges(db, changes) {
  let count = 0;

  // Categories
  if (changes.categories) {
    for (const c of changes.categories) {
      const existing = await dbQuery(db, "SELECT id, updated_at FROM categories WHERE id = ?", [c.id]);
      if (existing.success && existing.data.length) {
        if (c.updated_at > existing.data[0].updated_at) {
          await dbRun(db, "UPDATE categories SET name_ar=?, name_en=?, color=?, icon=?, parent_id=?, sort_order=?, is_active=?, updated_at=? WHERE id=?",
            [c.name_ar, c.name_en, c.color, c.icon, c.parent_id, c.sort_order, c.is_active, c.updated_at, c.id]);
          count++;
        }
      } else {
        await dbRun(db, "INSERT OR IGNORE INTO categories (id, name_ar, name_en, color, icon, parent_id, sort_order, is_active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
          [c.id, c.name_ar, c.name_en, c.color, c.icon, c.parent_id, c.sort_order, c.is_active, c.created_at, c.updated_at]);
        count++;
      }
    }
  }

  // Products (metadata only — stock handled by stock_movements)
  if (changes.products) {
    for (const p of changes.products) {
      const existing = await dbQuery(db, "SELECT id, updated_at FROM products WHERE id = ?", [p.id]);
      if (existing.success && existing.data.length) {
        if (p.updated_at > existing.data[0].updated_at) {
          await dbRun(db, "UPDATE products SET name_ar=?, name_en=?, price=?, cost=?, barcode=?, sku=?, category_id=?, tax_status=?, track_stock=?, is_active=?, reorder_level=?, unit=?, product_type=?, updated_at=? WHERE id=?",
            [p.name_ar, p.name_en, p.price, p.cost, p.barcode, p.sku, p.category_id, p.tax_status, p.track_stock, p.is_active, p.reorder_level, p.unit, p.product_type, p.updated_at, p.id]);
          count++;
        }
      } else {
        await dbRun(db, "INSERT OR IGNORE INTO products (id, name_ar, name_en, price, cost, barcode, sku, stock_quantity, category_id, tax_status, track_stock, is_active, reorder_level, unit, product_type, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          [p.id, p.name_ar, p.name_en, p.price, p.cost, p.barcode, p.sku, p.stock_quantity, p.category_id, p.tax_status, p.track_stock, p.is_active, p.reorder_level, p.unit, p.product_type, p.created_at, p.updated_at]);
        count++;
      }
    }
  }

  // Customers
  if (changes.customers) {
    for (const c of changes.customers) {
      const existing = await dbQuery(db, "SELECT id, updated_at FROM customers WHERE id = ?", [c.id]);
      if (existing.success && existing.data.length) {
        if (c.updated_at > existing.data[0].updated_at) {
          await dbRun(db, "UPDATE customers SET name_ar=?, name_en=?, phone=?, email=?, vat_number=?, loyalty_points=?, credit_balance=?, price_list_id=?, is_active=?, updated_at=? WHERE id=?",
            [c.name_ar, c.name_en, c.phone, c.email, c.vat_number, c.loyalty_points, c.credit_balance, c.price_list_id, c.is_active, c.updated_at, c.id]);
          count++;
        }
      } else {
        await dbRun(db, "INSERT OR IGNORE INTO customers (id, name_ar, name_en, phone, email, vat_number, loyalty_points, credit_balance, price_list_id, is_active, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
          [c.id, c.name_ar, c.name_en, c.phone, c.email, c.vat_number, c.loyalty_points, c.credit_balance, c.price_list_id, c.is_active, c.created_at, c.updated_at]);
        count++;
      }
    }
  }

  // Sales (insert only)
  if (changes.sales) {
    for (const s of changes.sales) {
      const existing = await dbQuery(db, "SELECT id FROM sales WHERE invoice_number = ?", [s.invoice_number]);
      if (!existing.success || !existing.data.length) {
        await dbRun(db, "INSERT OR IGNORE INTO sales (invoice_number, customer_id, subtotal, discount_amount, tax_amount, total, paid_amount, change_amount, balance_due, payment_method, status, ticket_number, cashier_id, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
          [s.invoice_number, s.customer_id, s.subtotal, s.discount_amount, s.tax_amount, s.total, s.paid_amount, s.change_amount, s.balance_due, s.payment_method, s.status, s.ticket_number, s.cashier_id, s.created_at, s.updated_at]);
        count++;
      }
    }
  }

  // Sale items (fixed dedup)
  if (changes.sale_items) {
    for (const si of changes.sale_items) {
      const invoiceNum = si.invoice_number;
      if (!invoiceNum) continue;
      const localSale = await dbQuery(db, "SELECT id FROM sales WHERE invoice_number = ?", [invoiceNum]);
      if (!localSale.success || !localSale.data.length) continue;
      const localSaleId = localSale.data[0].id;

      const existing = await dbQuery(db,
        "SELECT id FROM sale_items WHERE sale_id = ? AND product_id = ? AND unit_price = ? AND quantity = ? AND COALESCE(discount_amount,0) = ?",
        [localSaleId, si.product_id, si.unit_price, si.quantity, si.discount_amount || 0]);
      if (!existing.success || !existing.data.length) {
        await dbRun(db, "INSERT OR IGNORE INTO sale_items (sale_id, product_id, name_ar, name_en, quantity, unit_price, discount_amount, tax_amount, tax_rate, total) VALUES (?,?,?,?,?,?,?,?,?,?)",
          [localSaleId, si.product_id, si.name_ar, si.name_en, si.quantity, si.unit_price, si.discount_amount, si.tax_amount, si.tax_rate, si.total]);
        count++;
      }
    }
  }

  // Returns (insert only)
  if (changes.returns) {
    for (const r of changes.returns) {
      const existing = await dbQuery(db, "SELECT id FROM returns WHERE return_number = ? OR (original_sale_id = ? AND created_at = ?)",
        [r.return_number, r.original_sale_id, r.created_at]);
      if (!existing.success || !existing.data.length) {
        await dbRun(db, "INSERT OR IGNORE INTO returns (return_number, original_sale_id, total_refund, reason, status, created_at) VALUES (?,?,?,?,?,?)",
          [r.return_number, r.original_sale_id, r.total_refund, r.reason, r.status, r.created_at]);
        count++;
      }
    }
  }

  // Return items
  if (changes.return_items) {
    for (const ri of changes.return_items) {
      const existing = await dbQuery(db, "SELECT id FROM return_items WHERE return_id = ? AND sale_item_id = ?", [ri.return_id, ri.sale_item_id]);
      if (!existing.success || !existing.data.length) {
        await dbRun(db, "INSERT OR IGNORE INTO return_items (return_id, sale_item_id, quantity, refund_amount) VALUES (?,?,?,?)",
          [ri.return_id, ri.sale_item_id, ri.quantity, ri.refund_amount]);
        count++;
      }
    }
  }

  // Stock movements (delta-based)
  if (changes.stock_movements) {
    for (const sm of changes.stock_movements) {
      const existing = await dbQuery(db,
        "SELECT id FROM stock_movements WHERE product_id = ? AND movement_type = ? AND quantity = ? AND created_at = ? AND reference_type = ?",
        [sm.product_id, sm.movement_type, sm.quantity, sm.created_at, sm.reference_type]);
      if (!existing.success || !existing.data.length) {
        await dbRun(db, "INSERT INTO stock_movements (product_id, movement_type, quantity, reference_type, notes, created_at) VALUES (?,?,?,?,?,?)",
          [sm.product_id, sm.movement_type, sm.quantity, sm.reference_type, sm.notes || 'synced', sm.created_at]);
        await dbRun(db, "UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?",
          [sm.quantity, sm.product_id]);
        count++;
      }
    }
  }

  // Users
  if (changes.users) {
    for (const u of changes.users) {
      const existing = await dbQuery(db, "SELECT id FROM users WHERE id = ?", [u.id]);
      if (existing.success && existing.data.length) {
        await dbRun(db, "UPDATE users SET name_ar=?, name_en=?, role=?, pin=?, permissions=?, is_active=? WHERE id=?",
          [u.name_ar, u.name_en, u.role, u.pin, u.permissions, u.is_active, u.id]);
      } else {
        await dbRun(db, "INSERT OR IGNORE INTO users (id, name_ar, name_en, role, pin, permissions, is_active, created_at) VALUES (?,?,?,?,?,?,?,?)",
          [u.id, u.name_ar, u.name_en, u.role, u.pin, u.permissions, u.is_active, u.created_at]);
      }
      count++;
    }
  }

  return count;
}

// ─── Push shared settings (primary → secondary) ───
function pushSharedSettings() {
  if (_role !== 'primary' || !_store) return;
  const shared = {};
  const keys = ['vat', 'invoiceFormat', 'currency', 'country', 'business', 'receipt', 'loyalty', 'maxDiscountPercent', 'returnDaysLimit', 'plu'];
  for (const key of keys) {
    const val = _store.get(key);
    if (val !== undefined) shared[key] = val;
  }

  for (const client of _clients) {
    if (isAuthenticated(client)) {
      sendMessage(client, { type: 'settings_push', sharedSettings: shared, deviceId: getDeviceId() });
    }
  }
}

// ─── Trigger sync now ───
async function syncNow(db) {
  if (_syncRunning) return { success: false, message: 'Sync already in progress.' };
  if (_clients.length === 0) return { success: false, message: 'No connected devices.' };
  if (_authenticatedClients.size === 0) return { success: false, message: 'No authenticated devices.' };

  _syncRunning = true;
  try {
    const lastSync = (_store ? _store.get('lastSyncTime') : null) || '2000-01-01T00:00:00';

    if (_role === 'primary') pushSharedSettings();

    const changes = await getChangesSince(db, lastSync);
    for (const client of _clients) {
      if (isAuthenticated(client)) {
        sendMessage(client, { type: 'sync_request', since: lastSync, deviceId: getDeviceId() });
        sendMessage(client, { type: 'sync_data', changes, since: lastSync, deviceId: getDeviceId() });
      }
    }

    if (_store) _store.set('lastSyncTime', new Date().toISOString());

    return { success: true, message: 'Sync initiated.' };
  } finally {
    _syncRunning = false;
  }
}

// ─── Stop sync ───
function stopSync() {
  if (_reconnectTimer) { clearTimeout(_reconnectTimer); _reconnectTimer = null; }
  if (_server) { try { _server.close(); } catch (e) {} _server = null; }
  for (const client of _clients) { try { client.destroy(); } catch (e) {} }
  _clients = [];
  _authenticatedClients = new Set();
  _role = 'none';
  _reconnectAttempts = 0;
}

// ─── Status ───
function getSyncStatus() {
  return {
    available: true,
    role: _role,
    code: _syncCode,
    secret: _role === 'primary' ? _syncSecret : '****',
    connected: _authenticatedClients.size,
    lastSync: _store ? (_store.get('lastSyncTime') || null) : null,
    primaryIP: _primaryIP || (_store ? _store.get('syncPrimaryIP') : null) || null,
    deviceId: getDeviceId(),
  };
}

function onStatusChange(callback) { _onStatusChange = callback; }

module.exports = { init, createSyncGroup, joinSyncGroup, syncNow, stopSync, getSyncStatus, onStatusChange };
