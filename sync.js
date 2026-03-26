// NAQDI PEER SYNC v2.2 — Full debug logging, fixed socket lifecycle
const net = require('net');
const os = require('os');

const SYNC_PORT = 9473;
const AUTO_SYNC_MS = 15000; // 15 seconds between auto-syncs

let _server = null;
let _clientSocket = null; // secondary keeps ONE socket to primary
let _serverClients = []; // primary keeps list of connected sockets
let _authed = new Set();
let _syncing = false;
let _role = 'none';
let _primaryIP = '';
let _code = '';
let _secret = '';
let _deviceId = '';
let _reconAttempts = 0;
let _reconTimer = null;
let _autoTimer = null;
let _onStatus = null;
let _statusDebounce = null;
let _store = null;
let _db = null;
let _saveDb = null;

function log(...args) { console.log('[SYNC]', new Date().toISOString().substring(11, 19), ...args); }

function status(s) {
  if (!_onStatus) return;
  if (_statusDebounce) clearTimeout(_statusDebounce);
  _statusDebounce = setTimeout(() => { _onStatus(s); _statusDebounce = null; }, 300);
}

function init(store, db, saveDatabase) {
  _store = store; _db = db; _saveDb = saveDatabase;
  log('Initialized. DB:', !!db, 'SaveDB:', !!saveDatabase);
}

function getDeviceId() {
  if (_deviceId) return _deviceId;
  if (_store) { const s = _store.get('syncDeviceId'); if (s) { _deviceId = s; return s; } }
  _deviceId = 'D-' + Math.random().toString(36).substring(2, 8).toUpperCase();
  if (_store) _store.set('syncDeviceId', _deviceId);
  return _deviceId;
}

function getLocalIP() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces))
    for (const f of ifaces[name])
      if (f.family === 'IPv4' && !f.internal) return f.address;
  return '0.0.0.0';
}

function ipToCode(ip) {
  const p = ip.split('.').map(Number);
  return String((p[2] * 256 + p[3]) % 1000000).padStart(6, '0');
}

function genSecret() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

function send(socket, msg) {
  try {
    if (socket && !socket.destroyed) {
      socket.write(JSON.stringify(msg) + '\n');
      return true;
    }
  } catch (e) { log('Send error:', e.message); }
  return false;
}

// ═══ DB ═══
function Q(sql, params = []) {
  if (!_db) { log('DB not available!'); return { success: false, data: [] }; }
  try {
    const st = _db.prepare(sql);
    if (params.length) st.bind(params);
    const r = [];
    while (st.step()) r.push(st.getAsObject());
    st.free();
    return { success: true, data: r };
  } catch (e) { log('DB Q error:', e.message, sql.substring(0, 50)); return { success: false, data: [] }; }
}

function R(sql, params = []) {
  if (!_db) return { success: false };
  try {
    if (params.length) _db.run(sql, params); else _db.run(sql);
    return { success: true };
  } catch (e) { log('DB R error:', e.message, sql.substring(0, 50)); return { success: false }; }
}

function saveToDisk() {
  if (_saveDb) { try { _saveDb(); log('DB saved to disk'); } catch (e) { log('DB save error:', e.message); } }
}

// ═══ PRIMARY ═══
function createSyncGroup() {
  const ip = getLocalIP();
  if (ip === '0.0.0.0') throw new Error('No network connection.');

  // Clean up any existing
  stopSync();

  _role = 'primary';
  _code = ipToCode(ip);
  _secret = genSecret();
  _serverClients = [];
  _authed = new Set();

  _server = net.createServer(sock => {
    const addr = sock.remoteAddress + ':' + sock.remotePort;
    log('PRIMARY: client connected from', addr);

    let buf = '';
    sock.on('data', d => {
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const l of lines) if (l.trim()) onMessage(l.trim(), sock, 'PRIMARY');
    });

    sock.on('close', () => {
      log('PRIMARY: client disconnected', addr);
      _serverClients = _serverClients.filter(c => c !== sock);
      _authed.delete(sock);
      status({ connected: _authed.size, role: 'primary' });
    });

    sock.on('error', e => log('PRIMARY: socket error', addr, e.message));
  });

  _server.on('error', e => { log('PRIMARY: server error', e.message); });
  _server.listen(SYNC_PORT, '0.0.0.0', () => log('PRIMARY: listening on', SYNC_PORT));

  if (_store) { _store.set('syncRole', 'primary'); _store.set('syncCode', _code); _store.set('syncSecret', _secret); }
  startAutoSync();
  status({ role: 'primary', code: _code, secret: _secret, ip, connected: 0 });
  log('PRIMARY: group created. Code:', _code, 'Secret:', _secret);
  return { code: _code, ip, secret: _secret };
}

// ═══ SECONDARY ═══
function joinSyncGroup(code, secret, primaryIP) {
  if (!secret || secret.length !== 4) throw new Error('Enter the 4-character security code.');

  stopSync();

  _role = 'secondary';
  _code = code;
  _secret = secret.toUpperCase();
  _reconAttempts = 0;

  if (!primaryIP) {
    const my = getLocalIP();
    const sub = my.split('.').slice(0, 3).join('.');
    for (let i = 1; i <= 254; i++) {
      try { if (ipToCode(`${sub}.${i}`) === code) { primaryIP = `${sub}.${i}`; break; } } catch (e) {}
    }
    if (!primaryIP) throw new Error('Primary not found. Enter IP manually.');
  }

  _primaryIP = primaryIP;
  log('SECONDARY: joining', primaryIP, 'code:', code);
  doConnect();

  if (_store) { _store.set('syncRole', 'secondary'); _store.set('syncPrimaryIP', primaryIP); }
  startAutoSync();
  return { success: true };
}

function doConnect() {
  if (_role !== 'secondary') return;
  if (_clientSocket && !_clientSocket.destroyed) {
    try { _clientSocket.destroy(); } catch (e) {}
  }
  _clientSocket = null;

  log('SECONDARY: connecting to', _primaryIP + ':' + SYNC_PORT);

  const sock = new net.Socket();
  sock.setKeepAlive(true, 30000); // keepalive every 30s instead of timeout
  let connected = false;

  sock.connect(SYNC_PORT, _primaryIP, () => {
    connected = true;
    _clientSocket = sock;
    _reconAttempts = 0;
    log('SECONDARY: TCP connected, sending handshake');
    send(sock, { type: 'handshake', deviceId: getDeviceId(), version: '2.2', secret: _secret });
  });

  let buf = '';
  sock.on('data', d => {
    buf += d.toString();
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const l of lines) if (l.trim()) onMessage(l.trim(), sock, 'SECONDARY');
  });

  sock.on('close', () => {
    log('SECONDARY: connection closed');
    _clientSocket = null;
    _authed.delete(sock);
    status({ connected: 0, role: 'secondary' });
    if (_role === 'secondary') scheduleReconnect();
  });

  sock.on('error', e => {
    log('SECONDARY: error', e.message);
    if (!connected && _role === 'secondary') scheduleReconnect();
  });

  // No timeout — using keepalive instead
}

function scheduleReconnect() {
  if (_role !== 'secondary') return;
  if (_reconTimer) clearTimeout(_reconTimer);
  _reconAttempts++;
  const delay = Math.min(5000 * Math.pow(2, _reconAttempts - 1), 30000);
  log('SECONDARY: reconnect in', delay / 1000, 's (attempt', _reconAttempts + ')');
  _reconTimer = setTimeout(doConnect, delay);
}

// ═══ AUTO-SYNC ═══
function startAutoSync() {
  if (_autoTimer) clearInterval(_autoTimer);
  _autoTimer = setInterval(() => {
    const hasConnections = _role === 'primary' ? _authed.size > 0 : (_clientSocket && !_clientSocket.destroyed && _authed.has(_clientSocket));
    if (hasConnections) syncNow();
  }, AUTO_SYNC_MS);
}

// ═══ MESSAGE HANDLER ═══
function onMessage(raw, socket, tag) {
  try {
    const msg = JSON.parse(raw);
    log(tag, 'recv:', msg.type, msg.deviceId ? 'from ' + msg.deviceId : '');

    switch (msg.type) {
      case 'handshake':
        if (_role === 'primary') {
          if (msg.secret !== _secret) {
            log(tag, 'BAD SECRET! Got:', msg.secret, 'Expected:', _secret);
            send(socket, { type: 'handshake_reject', reason: 'Invalid secret' });
            setTimeout(() => { try { socket.destroy(); } catch (e) {} }, 300);
            return;
          }
          if (!_serverClients.includes(socket)) _serverClients.push(socket);
          _authed.add(socket);
          send(socket, { type: 'handshake_ack', deviceId: getDeviceId() });
          log(tag, 'AUTH OK. Connected clients:', _authed.size);
          status({ connected: _authed.size, role: 'primary' });
        }
        break;

      case 'handshake_ack':
        _authed.add(socket);
        log(tag, 'Authenticated! Running initial sync...');
        status({ connected: 1, role: 'secondary' });
        // Do initial sync after short delay to let connection stabilize
        setTimeout(() => syncNow(), 500);
        break;

      case 'handshake_reject':
        log(tag, 'REJECTED:', msg.reason);
        _authed.clear();
        status({ connected: 0, role: 'secondary', error: msg.reason });
        try { socket.destroy(); } catch (e) {}
        break;

      case 'sync_request': {
        if (!_authed.has(socket)) return;
        const changes = collectChanges(msg.since || '2000-01-01T00:00:00');
        const keys = Object.keys(changes);
        log(tag, 'Responding to sync_request:', keys.map(k => k + '=' + changes[k].length).join(', ') || 'empty');
        send(socket, { type: 'sync_data', changes, deviceId: getDeviceId() });
        break;
      }

      case 'sync_data': {
        if (!_authed.has(socket)) return;
        const keys = Object.keys(msg.changes || {});
        log(tag, 'Received sync_data:', keys.map(k => k + '=' + (msg.changes[k]?.length || 0)).join(', ') || 'empty');
        const applied = applyAll(msg.changes || {});
        log(tag, 'Applied', applied, 'changes');
        if (applied > 0) saveToDisk();
        send(socket, { type: 'sync_ack', applied, deviceId: getDeviceId() });
        status({ lastSync: new Date().toISOString(), applied });
        break;
      }

      case 'sync_ack':
        log(tag, 'Remote applied', msg.applied, 'changes');
        status({ lastSync: new Date().toISOString() });
        break;

      case 'settings_push':
        if (!_authed.has(socket) || !_store) return;
        if (msg.sharedSettings) {
          for (const [k, v] of Object.entries(msg.sharedSettings)) _store.set(k, v);
          log(tag, 'Settings received:', Object.keys(msg.sharedSettings).join(', '));
        }
        break;
    }
  } catch (e) {
    log(tag, 'PARSE ERROR:', e.message, 'raw length:', raw.length);
  }
}

// ═══ COLLECT CHANGES ═══
function collectChanges(since) {
  const ch = {};
  let r;
  // Core tables
  r = Q("SELECT * FROM products"); if (r.data.length) ch.products = r.data;
  r = Q("SELECT * FROM customers"); if (r.data.length) ch.customers = r.data;
  r = Q("SELECT * FROM categories"); if (r.data.length) ch.categories = r.data;
  r = Q("SELECT * FROM users"); if (r.data.length) ch.users = r.data;
  // Sales + items + payments
  r = Q("SELECT * FROM sales WHERE status IN ('completed','returned','voided')");
  if (r.data.length) {
    ch.sales = r.data;
    const ids = r.data.map(s => s.id);
    if (ids.length) {
      r = Q(`SELECT si.*, s.invoice_number FROM sale_items si JOIN sales s ON si.sale_id=s.id WHERE si.sale_id IN (${ids.join(',')})`); if (r.data.length) ch.sale_items = r.data;
      r = Q(`SELECT p.*, s.invoice_number FROM payments p JOIN sales s ON p.sale_id=s.id WHERE p.sale_id IN (${ids.join(',')})`); if (r.data.length) ch.payments = r.data;
    }
  }
  // Returns
  r = Q("SELECT * FROM returns"); if (r.data.length) { ch.returns = r.data; const ids = r.data.map(x => x.id); if (ids.length) { r = Q(`SELECT * FROM return_items WHERE return_id IN (${ids.join(',')})`); if (r.data.length) ch.return_items = r.data; } }
  // Stock
  r = Q("SELECT * FROM stock_movements"); if (r.data.length) ch.stock_movements = r.data;
  // Product extras
  r = Q("SELECT * FROM product_variants"); if (r.data.length) ch.product_variants = r.data;
  r = Q("SELECT * FROM product_units"); if (r.data.length) ch.product_units = r.data;
  r = Q("SELECT * FROM product_barcodes"); if (r.data.length) ch.product_barcodes = r.data;
  r = Q("SELECT * FROM bundle_items"); if (r.data.length) ch.bundle_items = r.data;
  r = Q("SELECT * FROM tier_pricing"); if (r.data.length) ch.tier_pricing = r.data;
  // Pricing
  r = Q("SELECT * FROM price_lists"); if (r.data.length) ch.price_lists = r.data;
  r = Q("SELECT * FROM price_list_items"); if (r.data.length) ch.price_list_items = r.data;
  // Promotions
  r = Q("SELECT * FROM promotions"); if (r.data.length) ch.promotions = r.data;
  // Gift cards
  r = Q("SELECT * FROM gift_cards"); if (r.data.length) ch.gift_cards = r.data;
  // Suppliers + purchases
  r = Q("SELECT * FROM suppliers"); if (r.data.length) ch.suppliers = r.data;
  r = Q("SELECT * FROM purchase_orders"); if (r.data.length) { ch.purchase_orders = r.data; const ids = r.data.map(x => x.id); if (ids.length) { r = Q(`SELECT * FROM purchase_order_items WHERE purchase_order_id IN (${ids.join(',')})`); if (r.data.length) ch.purchase_order_items = r.data; } }
  // Expenses
  r = Q("SELECT * FROM expenses"); if (r.data.length) ch.expenses = r.data;
  // Credit/debit notes
  r = Q("SELECT * FROM credit_debit_notes"); if (r.data.length) ch.credit_debit_notes = r.data;
  // Packages
  r = Q("SELECT * FROM packages"); if (r.data.length) ch.packages = r.data;
  r = Q("SELECT * FROM customer_packages"); if (r.data.length) ch.customer_packages = r.data;
  // Sequences (invoice counters)
  r = Q("SELECT * FROM sequences"); if (r.data.length) ch.sequences = r.data;
  return ch;
}

// ═══ APPLY CHANGES ═══
function applyAll(ch) {
  let n = 0;

  // Categories — match by name
  if (ch.categories) for (const c of ch.categories) {
    const e = Q("SELECT id,updated_at FROM categories WHERE name_ar=? AND name_en=?", [c.name_ar, c.name_en]);
    if (e.data.length) { if (c.updated_at > e.data[0].updated_at) { R("UPDATE categories SET color=?,icon=?,parent_id=?,sort_order=?,is_active=?,updated_at=? WHERE id=?", [c.color,c.icon,c.parent_id,c.sort_order,c.is_active,c.updated_at,e.data[0].id]); n++; } }
    else { R("INSERT INTO categories (name_ar,name_en,color,icon,parent_id,sort_order,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)", [c.name_ar,c.name_en,c.color,c.icon,c.parent_id,c.sort_order,c.is_active,c.created_at,c.updated_at]); n++; }
  }

  // Products — match by barcode/sku/name
  if (ch.products) for (const p of ch.products) {
    let ex = null;
    if (p.barcode) { const r = Q("SELECT id,updated_at FROM products WHERE barcode=? AND barcode!=''", [p.barcode]); if (r.data.length) ex = r.data[0]; }
    if (!ex && p.sku) { const r = Q("SELECT id,updated_at FROM products WHERE sku=? AND sku!=''", [p.sku]); if (r.data.length) ex = r.data[0]; }
    if (!ex) { const r = Q("SELECT id,updated_at FROM products WHERE name_ar=? AND price=?", [p.name_ar, p.price]); if (r.data.length) ex = r.data[0]; }
    if (ex) { if (p.updated_at > ex.updated_at) { R("UPDATE products SET name_ar=?,name_en=?,price=?,cost=?,barcode=?,sku=?,category_id=?,tax_status=?,track_stock=?,is_active=?,reorder_level=?,unit=?,product_type=?,updated_at=? WHERE id=?", [p.name_ar,p.name_en,p.price,p.cost,p.barcode,p.sku,p.category_id,p.tax_status,p.track_stock,p.is_active,p.reorder_level,p.unit,p.product_type,p.updated_at,ex.id]); n++; } }
    else { R("INSERT INTO products (name_ar,name_en,price,cost,barcode,sku,stock_quantity,category_id,tax_status,track_stock,is_active,reorder_level,unit,product_type,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", [p.name_ar,p.name_en,p.price,p.cost,p.barcode,p.sku,p.stock_quantity,p.category_id,p.tax_status,p.track_stock,p.is_active,p.reorder_level,p.unit,p.product_type,p.created_at,p.updated_at]); n++; }
  }

  // Customers — match by phone/name
  if (ch.customers) for (const c of ch.customers) {
    let ex = null;
    if (c.phone) { const r = Q("SELECT id,updated_at FROM customers WHERE phone=? AND phone!=''", [c.phone]); if (r.data.length) ex = r.data[0]; }
    if (!ex) { const r = Q("SELECT id,updated_at FROM customers WHERE name_ar=? AND name_en=?", [c.name_ar, c.name_en]); if (r.data.length) ex = r.data[0]; }
    if (ex) { if (c.updated_at > ex.updated_at) { R("UPDATE customers SET name_ar=?,name_en=?,phone=?,email=?,vat_number=?,loyalty_points=?,credit_balance=?,price_list_id=?,is_active=?,updated_at=? WHERE id=?", [c.name_ar,c.name_en,c.phone,c.email,c.vat_number,c.loyalty_points,c.credit_balance,c.price_list_id,c.is_active,c.updated_at,ex.id]); n++; } }
    else { R("INSERT INTO customers (name_ar,name_en,phone,email,vat_number,loyalty_points,credit_balance,price_list_id,is_active,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)", [c.name_ar,c.name_en,c.phone,c.email,c.vat_number,c.loyalty_points,c.credit_balance,c.price_list_id,c.is_active,c.created_at,c.updated_at]); n++; }
  }

  // Users — match by name+role
  if (ch.users) for (const u of ch.users) {
    const e = Q("SELECT id FROM users WHERE name_ar=? AND role=?", [u.name_ar, u.role]);
    if (e.data.length) { R("UPDATE users SET name_en=?,pin=?,permissions=?,is_active=? WHERE id=?", [u.name_en,u.pin,u.permissions,u.is_active,e.data[0].id]); }
    else { R("INSERT INTO users (name_ar,name_en,role,pin,permissions,is_active,created_at) VALUES (?,?,?,?,?,?,?)", [u.name_ar,u.name_en,u.role,u.pin,u.permissions,u.is_active,u.created_at]); }
    n++;
  }

  // Sales — dedup by invoice_number
  if (ch.sales) for (const s of ch.sales) {
    const e = Q("SELECT id FROM sales WHERE invoice_number=?", [s.invoice_number]);
    if (!e.data.length) {
      // Build INSERT dynamically — skip columns that may not exist on this device
      const cols = ['invoice_number','customer_id','subtotal','discount_amount','tax_amount','total','paid_amount','change_amount','balance_due','payment_method','status','cashier_id','created_at','updated_at'];
      const vals = [s.invoice_number,s.customer_id,s.subtotal,s.discount_amount,s.tax_amount,s.total,s.paid_amount,s.change_amount,s.balance_due,s.payment_method,s.status,s.cashier_id,s.created_at,s.updated_at];
      // Add optional columns if they exist in the data
      if (s.ticket_number !== undefined) { cols.push('ticket_number'); vals.push(s.ticket_number); }
      if (s.notes !== undefined) { cols.push('notes'); vals.push(s.notes); }
      if (s.coupon_code !== undefined) { cols.push('coupon_code'); vals.push(s.coupon_code); }
      if (s.coupon_discount !== undefined) { cols.push('coupon_discount'); vals.push(s.coupon_discount); }
      if (s.exchange_credit !== undefined) { cols.push('exchange_credit'); vals.push(s.exchange_credit); }
      if (s.loyalty_points_earned !== undefined) { cols.push('loyalty_points_earned'); vals.push(s.loyalty_points_earned); }
      R(`INSERT OR IGNORE INTO sales (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`, vals); n++;
    }
  }

  // Sale items — dedup by invoice_number + product + price + qty
  if (ch.sale_items) for (const si of ch.sale_items) {
    const inv = si.invoice_number; if (!inv) continue;
    const ls = Q("SELECT id FROM sales WHERE invoice_number=?", [inv]); if (!ls.data.length) continue;
    const lid = ls.data[0].id;
    const e = Q("SELECT id FROM sale_items WHERE sale_id=? AND product_id=? AND unit_price=? AND quantity=? AND COALESCE(discount_amount,0)=?", [lid,si.product_id,si.unit_price,si.quantity,si.discount_amount||0]);
    if (!e.data.length) { R("INSERT OR IGNORE INTO sale_items (sale_id,product_id,name_ar,name_en,quantity,unit_price,discount_amount,tax_amount,tax_rate,total) VALUES (?,?,?,?,?,?,?,?,?,?)", [lid,si.product_id,si.name_ar,si.name_en,si.quantity,si.unit_price,si.discount_amount,si.tax_amount,si.tax_rate,si.total]); n++; }
  }

  // Payments — dedup by invoice_number + method + amount
  if (ch.payments) for (const p of ch.payments) {
    const inv = p.invoice_number; if (!inv) continue;
    const ls = Q("SELECT id FROM sales WHERE invoice_number=?", [inv]); if (!ls.data.length) continue;
    const lid = ls.data[0].id;
    const e = Q("SELECT id FROM payments WHERE sale_id=? AND method=? AND amount=?", [lid,p.method,p.amount]);
    if (!e.data.length) { R("INSERT INTO payments (sale_id,method,amount,reference,created_at) VALUES (?,?,?,?,?)", [lid,p.method,p.amount,p.reference,p.created_at]); n++; }
  }

  // Returns — dedup by return_number
  if (ch.returns) for (const r of ch.returns) {
    const e = Q("SELECT id FROM returns WHERE return_number=?", [r.return_number]);
    if (!e.data.length) { R("INSERT OR IGNORE INTO returns (return_number,original_sale_id,total_refund,reason,status,created_at) VALUES (?,?,?,?,?,?)", [r.return_number,r.original_sale_id,r.total_refund,r.reason,r.status,r.created_at]); n++; }
  }
  if (ch.return_items) for (const ri of ch.return_items) {
    const e = Q("SELECT id FROM return_items WHERE return_id=? AND sale_item_id=?", [ri.return_id,ri.sale_item_id]);
    if (!e.data.length) { R("INSERT OR IGNORE INTO return_items (return_id,sale_item_id,quantity,refund_amount) VALUES (?,?,?,?)", [ri.return_id,ri.sale_item_id,ri.quantity,ri.refund_amount]); n++; }
  }

  // Stock movements — dedup by product+type+qty+timestamp
  if (ch.stock_movements) for (const sm of ch.stock_movements) {
    const e = Q("SELECT id FROM stock_movements WHERE product_id=? AND movement_type=? AND quantity=? AND created_at=?", [sm.product_id,sm.movement_type,sm.quantity,sm.created_at]);
    if (!e.data.length) { R("INSERT INTO stock_movements (product_id,movement_type,quantity,reference_type,notes,created_at) VALUES (?,?,?,?,?,?)", [sm.product_id,sm.movement_type,sm.quantity,sm.reference_type,sm.notes||'synced',sm.created_at]); R("UPDATE products SET stock_quantity=stock_quantity+? WHERE id=?", [sm.quantity,sm.product_id]); n++; }
  }

  // Product variants — dedup by product_id + name_ar
  if (ch.product_variants) for (const v of ch.product_variants) {
    const e = Q("SELECT id FROM product_variants WHERE product_id=? AND name_ar=?", [v.product_id,v.name_ar]);
    if (!e.data.length) { R("INSERT INTO product_variants (product_id,name_ar,name_en,sku,barcode,price_adjustment,stock_quantity,is_active) VALUES (?,?,?,?,?,?,?,?)", [v.product_id,v.name_ar,v.name_en,v.sku,v.barcode,v.price_adjustment,v.stock_quantity,v.is_active]); n++; }
  }

  // Product units — dedup by product_id + unit_name_ar
  if (ch.product_units) for (const u of ch.product_units) {
    const e = Q("SELECT id FROM product_units WHERE product_id=? AND unit_name_ar=?", [u.product_id,u.unit_name_ar]);
    if (!e.data.length) { R("INSERT INTO product_units (product_id,unit_name_ar,unit_name_en,conversion_factor,barcode,price) VALUES (?,?,?,?,?,?)", [u.product_id,u.unit_name_ar,u.unit_name_en,u.conversion_factor,u.barcode,u.price]); n++; }
  }

  // Product barcodes — dedup by barcode
  if (ch.product_barcodes) for (const b of ch.product_barcodes) {
    const e = Q("SELECT id FROM product_barcodes WHERE barcode=?", [b.barcode]);
    if (!e.data.length) { R("INSERT INTO product_barcodes (product_id,barcode,variant_id) VALUES (?,?,?)", [b.product_id,b.barcode,b.variant_id]); n++; }
  }

  // Bundle items — dedup by bundle_id + product_id
  if (ch.bundle_items) for (const b of ch.bundle_items) {
    const e = Q("SELECT id FROM bundle_items WHERE bundle_id=? AND product_id=?", [b.bundle_id,b.product_id]);
    if (!e.data.length) { R("INSERT INTO bundle_items (bundle_id,product_id,quantity) VALUES (?,?,?)", [b.bundle_id,b.product_id,b.quantity]); n++; }
  }

  // Tier pricing — dedup by product_id + min_qty
  if (ch.tier_pricing) for (const t of ch.tier_pricing) {
    const e = Q("SELECT id FROM tier_pricing WHERE product_id=? AND min_qty=?", [t.product_id,t.min_qty]);
    if (!e.data.length) { R("INSERT INTO tier_pricing (product_id,min_qty,price) VALUES (?,?,?)", [t.product_id,t.min_qty,t.price]); n++; }
  }

  // Price lists — dedup by name_ar
  if (ch.price_lists) for (const p of ch.price_lists) {
    const e = Q("SELECT id FROM price_lists WHERE name_ar=?", [p.name_ar]);
    if (!e.data.length) { R("INSERT INTO price_lists (name_ar,name_en,is_default,is_active) VALUES (?,?,?,?)", [p.name_ar,p.name_en,p.is_default,p.is_active]); n++; }
  }

  // Price list items — dedup by price_list_id + product_id
  if (ch.price_list_items) for (const p of ch.price_list_items) {
    const e = Q("SELECT id FROM price_list_items WHERE price_list_id=? AND product_id=?", [p.price_list_id,p.product_id]);
    if (!e.data.length) { R("INSERT INTO price_list_items (price_list_id,product_id,price) VALUES (?,?,?)", [p.price_list_id,p.product_id,p.price]); n++; }
  }

  // Promotions — dedup by name_ar
  if (ch.promotions) for (const p of ch.promotions) {
    const e = Q("SELECT id FROM promotions WHERE name_ar=?", [p.name_ar]);
    if (!e.data.length) { R("INSERT INTO promotions (name_ar,name_en,type,value,min_purchase,start_date,end_date,applies_to,category_id,product_id,is_active,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [p.name_ar,p.name_en,p.type,p.value,p.min_purchase,p.start_date,p.end_date,p.applies_to,p.category_id,p.product_id,p.is_active,p.created_at]); n++; }
  }

  // Gift cards — dedup by code
  if (ch.gift_cards) for (const g of ch.gift_cards) {
    const e = Q("SELECT id,balance FROM gift_cards WHERE code=?", [g.code]);
    if (e.data.length) { if (g.balance !== e.data[0].balance) { R("UPDATE gift_cards SET balance=?,status=? WHERE id=?", [g.balance,g.status,e.data[0].id]); n++; } }
    else { R("INSERT INTO gift_cards (code,initial_balance,balance,customer_id,status,expiry_date,notes,created_at) VALUES (?,?,?,?,?,?,?,?)", [g.code,g.initial_balance,g.balance,g.customer_id,g.status,g.expiry_date,g.notes,g.created_at]); n++; }
  }

  // Suppliers — dedup by name_ar or phone
  if (ch.suppliers) for (const s of ch.suppliers) {
    let ex = null;
    if (s.phone) { const r = Q("SELECT id FROM suppliers WHERE phone=? AND phone!=''", [s.phone]); if (r.data.length) ex = r.data[0]; }
    if (!ex) { const r = Q("SELECT id FROM suppliers WHERE name_ar=?", [s.name_ar]); if (r.data.length) ex = r.data[0]; }
    if (!ex) { R("INSERT INTO suppliers (name_ar,name_en,phone,email,vat_number,address,payment_terms,notes,is_active,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)", [s.name_ar,s.name_en,s.phone,s.email,s.vat_number,s.address,s.payment_terms,s.notes,s.is_active,s.created_at]); n++; }
  }

  // Purchase orders — dedup by po_number
  if (ch.purchase_orders) for (const po of ch.purchase_orders) {
    const e = Q("SELECT id FROM purchase_orders WHERE po_number=?", [po.po_number]);
    if (!e.data.length) { R("INSERT INTO purchase_orders (po_number,supplier_id,status,subtotal,tax_amount,total,notes,expected_date,received_date,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)", [po.po_number,po.supplier_id,po.status,po.subtotal,po.tax_amount,po.total,po.notes,po.expected_date,po.received_date,po.created_at]); n++; }
  }
  if (ch.purchase_order_items) for (const pi of ch.purchase_order_items) {
    const e = Q("SELECT id FROM purchase_order_items WHERE purchase_order_id=? AND product_id=?", [pi.purchase_order_id,pi.product_id]);
    if (!e.data.length) { R("INSERT INTO purchase_order_items (purchase_order_id,product_id,quantity,unit_cost,total) VALUES (?,?,?,?,?)", [pi.purchase_order_id,pi.product_id,pi.quantity,pi.unit_cost,pi.total]); n++; }
  }

  // Expenses — dedup by amount + created_at + category
  if (ch.expenses) for (const e of ch.expenses) {
    const ex = Q("SELECT id FROM expenses WHERE amount=? AND category=? AND created_at=?", [e.amount,e.category,e.created_at]);
    if (!ex.data.length) { R("INSERT INTO expenses (category,description,amount,payment_method,is_recurring,recurring_interval,created_at) VALUES (?,?,?,?,?,?,?)", [e.category,e.description,e.amount,e.payment_method,e.is_recurring,e.recurring_interval,e.created_at]); n++; }
  }

  // Credit/debit notes — dedup by note_number
  if (ch.credit_debit_notes) for (const c of ch.credit_debit_notes) {
    const e = Q("SELECT id FROM credit_debit_notes WHERE note_number=?", [c.note_number]);
    if (!e.data.length) { R("INSERT INTO credit_debit_notes (note_number,note_type,sale_id,invoice_number,amount,reason,status,customer_id,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)", [c.note_number,c.note_type,c.sale_id,c.invoice_number,c.amount,c.reason,c.status,c.customer_id,c.created_by,c.created_at]); n++; }
  }

  // Packages — dedup by name_ar
  if (ch.packages) for (const p of ch.packages) {
    const e = Q("SELECT id FROM packages WHERE name_ar=?", [p.name_ar]);
    if (!e.data.length) { R("INSERT INTO packages (name_ar,name_en,total_uses,price,expiry_days,is_active,created_at) VALUES (?,?,?,?,?,?,?)", [p.name_ar,p.name_en,p.total_uses,p.price,p.expiry_days,p.is_active,p.created_at]); n++; }
  }

  // Customer packages — dedup by customer_id + package_id + purchased_at
  if (ch.customer_packages) for (const cp of ch.customer_packages) {
    const e = Q("SELECT id FROM customer_packages WHERE customer_id=? AND package_id=? AND purchased_at=?", [cp.customer_id,cp.package_id,cp.purchased_at]);
    if (!e.data.length) { R("INSERT INTO customer_packages (customer_id,package_id,remaining_uses,purchased_at,expires_at,sale_id) VALUES (?,?,?,?,?,?)", [cp.customer_id,cp.package_id,cp.remaining_uses,cp.purchased_at,cp.expires_at,cp.sale_id]); n++; }
  }

  // Sequences — sync invoice counters (take the higher value)
  if (ch.sequences) for (const s of ch.sequences) {
    const e = Q("SELECT current_value FROM sequences WHERE id=?", [s.id]);
    if (e.data.length) { if (s.current_value > e.data[0].current_value) { R("UPDATE sequences SET current_value=? WHERE id=?", [s.current_value,s.id]); n++; } }
    else { R("INSERT OR IGNORE INTO sequences (id,current_value) VALUES (?,?)", [s.id,s.current_value]); n++; }
  }

  return n;
}

// ═══ SYNC NOW ═══
function syncNow() {
  if (_syncing) return { success: false, message: 'Already syncing.' };

  const sockets = _role === 'primary' ? _serverClients.filter(s => _authed.has(s) && !s.destroyed) : (_clientSocket && !_clientSocket.destroyed && _authed.has(_clientSocket) ? [_clientSocket] : []);
  if (!sockets.length) return { success: false, message: 'No connected devices.' };

  _syncing = true;
  try {
    const last = (_store ? _store.get('lastSyncTime') : null) || '2000-01-01T00:00:00';
    const changes = collectChanges(last);
    const keys = Object.keys(changes);

    if (_role === 'primary') {
      // Push settings
      const sh = {};
      ['vat', 'invoiceFormat', 'currency', 'country', 'business', 'receipt', 'loyalty', 'maxDiscountPercent', 'returnDaysLimit', 'plu'].forEach(k => { const v = _store?.get(k); if (v !== undefined) sh[k] = v; });
      for (const s of sockets) send(s, { type: 'settings_push', sharedSettings: sh, deviceId: getDeviceId() });
    }

    for (const s of sockets) {
      send(s, { type: 'sync_request', since: last, deviceId: getDeviceId() });
      if (keys.length) send(s, { type: 'sync_data', changes, since: last, deviceId: getDeviceId() });
    }

    if (_store) _store.set('lastSyncTime', new Date().toISOString());
    log('syncNow:', keys.length ? keys.map(k => k + '=' + changes[k].length).join(', ') : 'up to date');
    return { success: true, message: keys.length ? 'Syncing...' : 'Up to date.' };
  } finally { _syncing = false; }
}

function stopSync() {
  log('Stopping sync');
  if (_autoTimer) { clearInterval(_autoTimer); _autoTimer = null; }
  if (_reconTimer) { clearTimeout(_reconTimer); _reconTimer = null; }
  if (_server) { try { _server.close(); } catch (e) {} _server = null; }
  if (_clientSocket) { try { _clientSocket.destroy(); } catch (e) {} _clientSocket = null; }
  for (const c of _serverClients) try { c.destroy(); } catch (e) {}
  _serverClients = []; _authed = new Set(); _role = 'none'; _reconAttempts = 0;
}

function getSyncStatus() {
  return {
    available: true, role: _role, code: _code,
    secret: _role === 'primary' ? _secret : '****',
    connected: _authed.size,
    lastSync: _store ? (_store.get('lastSyncTime') || null) : null,
    primaryIP: _primaryIP || (_store ? _store.get('syncPrimaryIP') : null) || null,
    deviceId: getDeviceId(),
  };
}

function onStatusChange(cb) { _onStatus = cb; }

module.exports = { init, createSyncGroup, joinSyncGroup, syncNow, stopSync, getSyncStatus, onStatusChange };
