// ============================================
// NAQDI - MODULES 8-12: SYSTEM FEATURES
// ZATCA Phase 2, Hardware, Users, Backup, Polish
// ============================================

// ============ MASTER PIN (emergency unlock — only you know this) ============
// Master PIN verified via backend IPC — never stored in frontend

// ============ CURRENT USER STATE ============
window._currentUser = null; // { id, name_ar, name_en, role, permissions }

// ============ UNIVERSAL MODAL CONFIRM (replaces native confirm) ============
function daftrlyConfirm(message) {
  return new Promise((resolve) => {
    const lang = window.i18n?.getLang() || 'ar';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'display:flex;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:99999;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:var(--bg-primary);border-radius:12px;padding:24px;min-width:360px;max-width:480px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
        <div style="margin-bottom:16px;color:var(--text-primary);white-space:pre-line;line-height:1.6;">${message}</div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn btn-secondary" id="dc-cancel">${lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
          <button class="btn btn-primary" id="dc-ok" style="background:var(--danger);border-color:var(--danger);">${lang === 'ar' ? 'متأكد' : 'Confirm'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const okBtn = overlay.querySelector('#dc-ok');
    setTimeout(() => okBtn.focus(), 100);
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') { overlay.remove(); resolve(false); } });
    overlay.querySelector('#dc-cancel').addEventListener('click', () => { overlay.remove(); resolve(false); });
    okBtn.addEventListener('click', () => { overlay.remove(); resolve(true); });
  });
}
window.daftrlyConfirm = daftrlyConfirm;

// ============ UNIVERSAL MODAL PROMPT (replaces browser prompt) ============
function daftrlyPrompt(title, placeholder, defaultVal) {
  return new Promise((resolve) => {
    const lang = window.i18n?.getLang() || 'ar';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'display:flex;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:99999;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:var(--bg-primary);border-radius:12px;padding:24px;min-width:340px;max-width:420px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
        <h3 style="margin-bottom:12px;color:var(--text-primary);">${title}</h3>
        <input type="text" id="dp-input" class="form-input" placeholder="${placeholder || ''}" value="${defaultVal || ''}" style="width:100%;margin-bottom:16px;">
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn btn-secondary" id="dp-cancel">${lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
          <button class="btn btn-primary" id="dp-ok">${lang === 'ar' ? 'موافق' : 'OK'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const input = overlay.querySelector('#dp-input');
    // Force focus with multiple attempts
    setTimeout(() => { input.focus(); input.select(); }, 100);
    setTimeout(() => { input.focus(); }, 300);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { overlay.remove(); resolve(input.value.trim()); } if (e.key === 'Escape') { overlay.remove(); resolve(null); } });
    overlay.querySelector('#dp-cancel').addEventListener('click', () => { overlay.remove(); resolve(null); });
    overlay.querySelector('#dp-ok').addEventListener('click', () => { overlay.remove(); resolve(input.value.trim()); });
  });
}
window.daftrlyPrompt = daftrlyPrompt;

// ============ MANAGER AUTHORIZATION (PIN + NFC) ============
// Returns true if authorized, false if cancelled/failed
// Used for: discount override, return approval, kiosk exit, etc.
function requestManagerAuth(message) {
  return new Promise((resolve) => {
    const lang = window.i18n?.getLang() || 'ar';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.cssText = 'display:flex;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:99999;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:var(--bg-primary);border-radius:12px;padding:24px;min-width:380px;max-width:440px;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
        <div style="margin-bottom:16px;color:var(--text-primary);line-height:1.6;font-size:14px;">${message}</div>
        <div style="margin-bottom:12px;">
          <input type="password" id="mgr-pin" class="form-input" placeholder="${lang === 'ar' ? 'أدخل رمز PIN' : 'Enter PIN'}" 
            style="text-align:center;font-size:20px;letter-spacing:6px;padding:12px;">
        </div>
        <div id="mgr-card-status" style="text-align:center;font-size:12px;color:var(--text-tertiary);margin-bottom:12px;">
          💳 ${lang === 'ar' ? 'أو امسح بطاقة المدير' : 'or tap manager card'}
        </div>
        <div id="mgr-error" style="color:var(--danger);font-size:13px;text-align:center;min-height:20px;margin-bottom:8px;"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button class="btn btn-secondary" id="mgr-cancel">${lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
          <button class="btn btn-primary" id="mgr-ok">${lang === 'ar' ? 'تأكيد' : 'Confirm'}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    
    const pinInput = overlay.querySelector('#mgr-pin');
    const errorEl = overlay.querySelector('#mgr-error');
    const cardStatus = overlay.querySelector('#mgr-card-status');
    
    setTimeout(() => pinInput.focus(), 100);

    // NFC card listener
    let cardBuffer = '';
    let cardLastKey = 0;
    let cardTimeout = null;
    let cardActive = true;

    async function checkAuth(value) {
      // Check master PIN
      const isMaster = await window.daftrly.verifyMasterPin(value);
      if (isMaster) return true;
      // Check admin PIN
      const pinCheck = await window.daftrly.query("SELECT id FROM users WHERE role = 'admin' AND pin = ?", [value]);
      if (pinCheck.success && pinCheck.data?.length) return true;
      // Check admin card
      const cardCheck = await window.daftrly.query("SELECT id FROM users WHERE role = 'admin' AND card_id = ?", [value]);
      if (cardCheck.success && cardCheck.data?.length) return true;
      return false;
    }

    function cardKeyListener(e) {
      if (!cardActive) return;
      // Don't intercept when typing in the PIN input
      if (document.activeElement === pinInput) return;
      if (e.key.length === 1) {
        const now = Date.now();
        if (now - cardLastKey < 80) {
          cardBuffer += e.key;
        } else {
          cardBuffer = e.key;
        }
        cardLastKey = now;
        e.preventDefault();
        e.stopPropagation();

        clearTimeout(cardTimeout);
        cardTimeout = setTimeout(async () => {
          if (cardBuffer.length >= 6) {
            cardStatus.innerHTML = '⏳ ' + (lang === 'ar' ? 'جاري التحقق...' : 'Verifying...');
            const ok = await checkAuth(cardBuffer.trim());
            if (ok) {
              cleanup();
              resolve(true);
            } else {
              errorEl.textContent = lang === 'ar' ? '❌ بطاقة غير مصرح لها' : '❌ Unauthorized card';
              cardStatus.innerHTML = '💳 ' + (lang === 'ar' ? 'أو امسح بطاقة المدير' : 'or tap manager card');
            }
          }
          cardBuffer = '';
        }, 300);
      }
    }
    document.addEventListener('keydown', cardKeyListener, true);

    function cleanup() {
      cardActive = false;
      document.removeEventListener('keydown', cardKeyListener, true);
      overlay.remove();
    }

    // PIN confirm
    async function tryPin() {
      const pin = pinInput.value.trim();
      if (!pin) return;
      const ok = await checkAuth(pin);
      if (ok) {
        cleanup();
        resolve(true);
      } else {
        errorEl.textContent = lang === 'ar' ? '❌ رمز PIN غير صحيح' : '❌ Invalid PIN';
        pinInput.value = '';
        pinInput.focus();
      }
    }

    overlay.querySelector('#mgr-ok').addEventListener('click', tryPin);
    pinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); tryPin(); } });
    overlay.querySelector('#mgr-cancel').addEventListener('click', () => { cleanup(); resolve(false); });
    overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') { cleanup(); resolve(false); } });
  });
}
window.requestManagerAuth = requestManagerAuth;

// ============ PERMISSION LABELS ============
const PERMISSION_LABELS = {
  pos_sell:        { ar: 'البيع', en: 'Sell' },
  pos_discount:    { ar: 'الخصومات', en: 'Discounts' },
  pos_refund:      { ar: 'المرتجعات', en: 'Returns/Refunds' },
  pos_hold:        { ar: 'تعليق البيع', en: 'Hold Sales' },
  pos_partial:     { ar: 'الدفع الجزئي', en: 'Partial Payment' },
  pos_split:       { ar: 'الدفع المقسم', en: 'Split Payment' },
  pos_giftcard:    { ar: 'قبول بطاقات الهدايا', en: 'Accept Gift Cards' },
  pos_credit_notes: { ar: 'إصدار إشعارات دائنة/مدينة', en: 'Issue Credit/Debit Notes' },
  products_view:   { ar: 'عرض المنتجات', en: 'View Products' },
  products_add:    { ar: 'إضافة منتجات', en: 'Add Products' },
  products_edit:   { ar: 'تعديل منتجات', en: 'Edit Products' },
  products_delete: { ar: 'حذف منتجات', en: 'Delete Products' },
  products_view_cost: { ar: 'عرض سعر التكلفة', en: 'View Cost Price' },
  customers_view:  { ar: 'عرض العملاء', en: 'View Customers' },
  customers_add:   { ar: 'إضافة عملاء', en: 'Add Customers' },
  customers_edit:  { ar: 'تعديل عملاء', en: 'Edit Customers' },
  reports_view:    { ar: 'عرض التقارير', en: 'View Reports' },
  reports_export:  { ar: 'تصدير التقارير', en: 'Export Reports' },
  expenses_view:   { ar: 'عرض المصروفات', en: 'View Expenses' },
  expenses_add:    { ar: 'إضافة مصروفات', en: 'Add Expenses' },
  settings_access: { ar: 'الوصول للإعدادات', en: 'Access Settings' },
  users_manage:    { ar: 'إدارة المستخدمين', en: 'Manage Users' },
  backup_access:   { ar: 'النسخ الاحتياطي', en: 'Backup/Restore' },
  cash_session:    { ar: 'إدارة الورديات', en: 'Cash Sessions' },
};

// ============ PIN LOCK SCREEN ============
async function showLockScreen() {
  const lang = window.i18n?.getLang() || 'ar';
  
  // Guard against double lock screens
  if (document.getElementById('lock-screen')) {
    document.getElementById('lock-screen').remove();
  }

  // Check if any user has a PIN or card — if not, skip lock screen
  const usersRes = await window.daftrly.query("SELECT * FROM users WHERE ((pin IS NOT NULL AND pin != '') OR (card_id IS NOT NULL AND card_id != '')) AND is_active = 1");
  const usersWithPin = usersRes.success ? (usersRes.data || []) : [];
  
  if (usersWithPin.length === 0) {
    // No PINs configured — full access, no lock
    window._currentUser = { id: 1, name_ar: 'المدير', name_en: 'Admin', role: 'admin', permissions: {} };
    return true;
  }

  return new Promise((resolve) => {
    let allUsers = usersWithPin;
    
    const overlay = document.createElement('div');
    overlay.id = 'lock-screen';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:var(--bg-primary);z-index:99999;display:flex;align-items:center;justify-content:center;flex-direction:column;';
    overlay.innerHTML = `
      <div style="text-align:center;max-width:360px;width:100%;">
        <div style="margin-bottom:12px;">
          <svg width="72" height="72" viewBox="0 0 88 88" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="88" height="88" rx="20" fill="var(--logo-bg, #2563EB)"/>
            <path d="M32 30 C32 30 18 30 18 48 C18 66 38 66 54 66" fill="none" stroke="#FFFFFF" stroke-width="5.5" stroke-linecap="round"/>
            <path d="M54 66 C68 66 70 48 70 40 C70 28 62 28 56 28" fill="none" stroke="#D4A853" stroke-width="5.5" stroke-linecap="round"/>
            <circle cx="58" cy="16" r="6" fill="#D4A853"/>
          </svg>
        </div>
        <h1 style="color:var(--accent);font-size:24px;margin-bottom:4px;">نقدي</h1>
        <p style="color:var(--text-secondary);margin-bottom:24px;font-size:13px;">Naqdi — Smart POS</p>
        
        <div style="margin-bottom:8px;">
          <input type="password" id="lock-pin" maxlength="10" 
            placeholder="${lang === 'ar' ? 'أدخل رمز PIN' : 'Enter PIN'}" 
            style="width:200px;text-align:center;font-size:24px;letter-spacing:8px;padding:12px;border:2px solid var(--border);border-radius:12px;background:var(--bg-secondary);color:var(--text-primary);outline:none;"
            autofocus>
        </div>
        <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:12px;">
          💳 ${lang === 'ar' ? 'أو امسح البطاقة' : 'or tap your card'}
        </div>
        <div id="lock-error" style="color:var(--danger);font-size:13px;margin-bottom:16px;min-height:20px;"></div>
        
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:240px;margin:0 auto;">
          ${[1,2,3,4,5,6,7,8,9,'',0,'⌫'].map(n => n === '' ? '<div></div>' : `
            <button class="lock-num-btn" data-num="${n}" style="padding:16px;font-size:20px;border:1px solid var(--border);border-radius:10px;background:var(--bg-secondary);color:var(--text-primary);cursor:pointer;font-weight:700;">
              ${n}
            </button>
          `).join('')}
        </div>
        
        <button id="lock-enter" class="btn btn-primary" style="margin-top:16px;width:240px;padding:12px;font-size:16px;">
          ${lang === 'ar' ? 'دخول' : 'Enter'}
        </button>
      </div>
    `;

    document.body.appendChild(overlay);
    const pinInput = overlay.querySelector('#lock-pin');
    const errorEl = overlay.querySelector('#lock-error');
    
    // Force focus on PIN input (autofocus doesn't always work in Electron)
    setTimeout(() => { if (pinInput) pinInput.focus(); }, 100);

    // ============ NFC/RFID CARD DETECTION ============
    // Card readers act like keyboards — they type the card ID very fast then press Enter
    // Detection: if 6+ characters arrive within 300ms, it's a card scan
    let cardBuffer = '';
    let cardTimer = null;
    let lastKeyTime = 0;

    async function handleCardScan(cardId) {
      const cardMatch = allUsers.find(u => u.card_id && u.card_id === cardId);
      if (cardMatch) {
        let perms = {};
        try { perms = JSON.parse(cardMatch.permissions || '{}'); } catch(e) {}
        window._currentUser = { id: cardMatch.id, name_ar: cardMatch.name_ar, name_en: cardMatch.name_en, role: cardMatch.role, permissions: perms };
        window.daftrly.query("INSERT INTO audit_log (user_id, action, details) VALUES (?, 'login', 'NFC Card')", [cardMatch.id]);
        overlay.remove();
        resolve(true);
        return;
      }
      const isMasterCard = await window.daftrly.verifyMasterPin(cardId);
      if (isMasterCard) {
        window._currentUser = { id: 0, name_ar: 'المدير العام', name_en: 'Super Admin', role: 'admin', permissions: {} };
        window.daftrly.query("INSERT INTO audit_log (user_id, action, details) VALUES (0, 'login', 'Master PIN (card)')");
        overlay.remove();
        resolve(true);
        return;
      }
      errorEl.textContent = lang === 'ar' ? '❌ بطاقة غير معروفة' : '❌ Unknown card';
      pinInput.value = '';
    }

    // Listen for fast keyboard input (card scan) on the document level
    function cardKeyListener(e) {
      const now = Date.now();
      // Only track printable characters
      if (e.key.length === 1) {
        if (now - lastKeyTime < 80) {
          // Fast input — accumulate in card buffer
          cardBuffer += e.key;
        } else {
          // Slow input — reset buffer, this is human typing
          cardBuffer = e.key;
        }
        lastKeyTime = now;

        clearTimeout(cardTimer);
        cardTimer = setTimeout(() => {
          // After 300ms of silence, check if we got a card scan
          if (cardBuffer.length >= 6) {
            e.preventDefault();
            pinInput.value = '';
            handleCardScan(cardBuffer.trim());
          }
          cardBuffer = '';
        }, 300);
      }
    }
    document.addEventListener('keydown', cardKeyListener);
    // ============ END CARD DETECTION ============

    // Number pad
    overlay.querySelectorAll('.lock-num-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const num = btn.dataset.num;
        if (num === '⌫') {
          pinInput.value = pinInput.value.slice(0, -1);
        } else {
          pinInput.value += num;
        }
        pinInput.focus();
      });
    });

    async function tryUnlock() {
      const pin = pinInput.value.trim();
      if (!pin) return;
      
      // Check master PIN via backend
      const isMaster = await window.daftrly.verifyMasterPin(pin);
      if (isMaster) {
        document.removeEventListener('keydown', cardKeyListener);
        window._currentUser = { id: 0, name_ar: 'المدير العام', name_en: 'Super Admin', role: 'admin', permissions: {} };
        window.daftrly.query("INSERT INTO audit_log (user_id, action, details) VALUES (0, 'login', 'Master PIN')");
        overlay.remove();
        resolve(true);
        return;
      }

      // Check user PINs
      const match = allUsers.find(u => u.pin && u.pin === pin);
      if (match) {
        document.removeEventListener('keydown', cardKeyListener);
        let perms = {};
        try { perms = JSON.parse(match.permissions || '{}'); } catch(e) {}
        window._currentUser = { id: match.id, name_ar: match.name_ar, name_en: match.name_en, role: match.role, permissions: perms };
        window.daftrly.query("INSERT INTO audit_log (user_id, action, details) VALUES (?, 'login', 'PIN')", [match.id]);
        overlay.remove();
        resolve(true);
        return;
      }

      // Check card_id (in case someone typed a card ID manually)
      const cardMatch = allUsers.find(u => u.card_id && u.card_id === pin);
      if (cardMatch) {
        document.removeEventListener('keydown', cardKeyListener);
        let perms = {};
        try { perms = JSON.parse(cardMatch.permissions || '{}'); } catch(e) {}
        window._currentUser = { id: cardMatch.id, name_ar: cardMatch.name_ar, name_en: cardMatch.name_en, role: cardMatch.role, permissions: perms };
        window.daftrly.query("INSERT INTO audit_log (user_id, action, details) VALUES (?, 'login', 'Card')", [cardMatch.id]);
        overlay.remove();
        resolve(true);
        return;
      }

      errorEl.textContent = lang === 'ar' ? '❌ رمز PIN غير صحيح' : '❌ Invalid PIN';
      pinInput.value = '';
      pinInput.focus();
    }

    overlay.querySelector('#lock-enter').addEventListener('click', tryUnlock);
    pinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') tryUnlock(); });
    setTimeout(() => pinInput.focus(), 100);
  });
}
window.showLockScreen = showLockScreen;

// Lock the app (show lock screen again)
function lockApp() {
  window._currentUser = null;
  showLockScreen().then(() => {
    // Rebuild menu based on new user's role
    const isAdmin = !window._currentUser || window._currentUser.role === 'admin' || window._currentUser.id === 0;
    window.daftrly.setMenu(isAdmin);
    // Re-render entire app (sidebar + page) with new user's permissions
    if (window.renderApp) window.renderApp();
    if (window.navigateTo) window.navigateTo('dashboard');
  });
}
window.lockApp = lockApp;

// Check permission helper
function hasPermission(perm) {
  if (!window._currentUser) return true; // no user = no restrictions
  if (window._currentUser.role === 'admin') return true; // admin = full access
  if (window._currentUser.id === 0) return true; // master PIN = full access
  const perms = window._currentUser.permissions || {};
  // If permission not explicitly set, use DEFAULT_PERMISSIONS
  return perms[perm] !== undefined ? perms[perm] : (DEFAULT_PERMISSIONS[perm] ?? true);
}
window.hasPermission = hasPermission;

// ============ MODULE 10: USER MANAGEMENT ============
// PIN login, roles, permissions

const DEFAULT_PERMISSIONS = {
  pos_sell: true, pos_discount: false, pos_refund: false, pos_hold: true, pos_partial: false,
  pos_split: true, pos_giftcard: true, pos_credit_notes: false,
  products_view: true, products_add: false, products_edit: false, products_delete: false,
  products_view_cost: false,
  customers_view: true, customers_add: true, customers_edit: false,
  reports_view: false, reports_export: false,
  expenses_view: false, expenses_add: false,
  settings_access: false, users_manage: false,
  backup_access: false, cash_session: true,
};

// ============ MODULE 12: UNIVERSAL SEARCH ============
async function openUniversalSearch() {
  const lang = window.i18n.getLang();
  window.dbg('ui', 'Universal search opened');

  // Remove existing search modal
  const existing = document.getElementById('universal-search-overlay');
  if (existing) { existing.remove(); return; }

  const overlay = document.createElement('div');
  overlay.id = 'universal-search-overlay';
  overlay.className = 'universal-search-overlay';
  overlay.innerHTML = `
    <div class="universal-search-box">
      <div class="universal-search-input-wrap">
        <span class="universal-search-icon">${window.icons.getIcon('search')}</span>
        <input type="text" id="universal-search-input" class="universal-search-input" 
          placeholder="${lang === 'ar' ? 'بحث في كل شيء... (منتج، عميل، فاتورة، مورد)' : 'Search everything... (product, customer, invoice, supplier)'}" autofocus>
        <span class="universal-search-hint">ESC</span>
      </div>
      <div class="universal-search-results" id="universal-search-results"></div>
    </div>
  `;

  document.body.appendChild(overlay);

  const input = overlay.querySelector('#universal-search-input');
  const resultsEl = overlay.querySelector('#universal-search-results');

  // Close
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  
  let usSelectedIdx = -1;
  
  function highlightUSItem() {
    const items = resultsEl.querySelectorAll('.us-item');
    items.forEach((el, i) => {
      if (i === usSelectedIdx) {
        el.style.background = 'var(--bg-secondary)';
        el.scrollIntoView({ block: 'nearest' });
      } else {
        el.style.background = '';
      }
    });
  }

  function selectUSItem() {
    const items = resultsEl.querySelectorAll('.us-item');
    if (usSelectedIdx >= 0 && usSelectedIdx < items.length) {
      items[usSelectedIdx].click();
    }
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { close(); return; }
    const items = resultsEl.querySelectorAll('.us-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      usSelectedIdx = Math.min(usSelectedIdx + 1, items.length - 1);
      highlightUSItem();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      usSelectedIdx = Math.max(usSelectedIdx - 1, 0);
      highlightUSItem();
    } else if (e.key === 'Enter' && usSelectedIdx >= 0) {
      e.preventDefault();
      selectUSItem();
    }
  });

  let searchTimer;
  input.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      const q = input.value.trim();
      if (q.length < 2) { resultsEl.innerHTML = ''; return; }

      const like = `%${q}%`;

      // Search products
      const prodR = await window.daftrly.query(
        'SELECT id, name_ar, name_en, barcode, price FROM products WHERE is_active=1 AND (name_ar LIKE ? OR name_en LIKE ? OR barcode LIKE ? OR sku LIKE ?) LIMIT 5',
        [like, like, like, like]);
      const products = (prodR.success && prodR.data) ? prodR.data : [];

      // Search customers
      const custR = await window.daftrly.query(
        'SELECT id, name_ar, name_en, phone FROM customers WHERE is_active=1 AND (name_ar LIKE ? OR name_en LIKE ? OR phone LIKE ?) LIMIT 5',
        [like, like, like]);
      const customers = (custR.success && custR.data) ? custR.data : [];

      // Search invoices
      const invR = await window.daftrly.query(
        'SELECT id, invoice_number, total, created_at FROM sales WHERE status=\'completed\' AND invoice_number LIKE ? LIMIT 5', [like]);
      const invoices = (invR.success && invR.data) ? invR.data : [];

      // Search suppliers
      const supR = await window.daftrly.query(
        'SELECT id, name_ar, name_en, phone FROM suppliers WHERE is_active=1 AND (name_ar LIKE ? OR name_en LIKE ? OR phone LIKE ?) LIMIT 5',
        [like, like, like]);
      const suppliers = (supR.success && supR.data) ? supR.data : [];

      let html = '';

      if (products.length > 0) {
        html += `<div class="us-section">${lang === 'ar' ? '📦 المنتجات' : '📦 Products'}</div>`;
        products.forEach(p => {
          const name = lang === 'ar' ? p.name_ar : (p.name_en || p.name_ar);
          html += `<div class="us-item" data-nav="products"><span class="us-item-name">${_escU(name)}</span><span class="us-item-sub">${formatCurrency(p.price)}${p.barcode ? ' | ' + p.barcode : ''}</span></div>`;
        });
      }
      if (customers.length > 0) {
        html += `<div class="us-section">${lang === 'ar' ? '👥 العملاء' : '👥 Customers'}</div>`;
        customers.forEach(c => {
          const name = lang === 'ar' ? c.name_ar : (c.name_en || c.name_ar);
          html += `<div class="us-item" data-nav="customers"><span class="us-item-name">${_escU(name)}</span><span class="us-item-sub">${c.phone || ''}</span></div>`;
        });
      }
      if (invoices.length > 0) {
        html += `<div class="us-section">${lang === 'ar' ? '🧾 الفواتير' : '🧾 Invoices'}</div>`;
        invoices.forEach(inv => {
          const date = inv.created_at ? inv.created_at.substring(0, 10) : '';
          html += `<div class="us-item" data-nav="invoice" data-id="${inv.id}"><span class="us-item-name">${inv.invoice_number}</span><span class="us-item-sub">${formatCurrency(inv.total)}${date ? ' | ' + date : ''}</span></div>`;
        });
      }
      if (suppliers.length > 0) {
        html += `<div class="us-section">${lang === 'ar' ? '🏭 الموردين' : '🏭 Suppliers'}</div>`;
        suppliers.forEach(s => {
          const name = lang === 'ar' ? s.name_ar : (s.name_en || s.name_ar);
          html += `<div class="us-item" data-nav="suppliers"><span class="us-item-name">${_escU(name)}</span><span class="us-item-sub">${s.phone || ''}</span></div>`;
        });
      }

      if (!html) {
        html = `<div class="us-empty">${lang === 'ar' ? 'لا توجد نتائج' : 'No results'}</div>`;
      }

      resultsEl.innerHTML = html;
      usSelectedIdx = -1; // Reset keyboard selection

      // Navigate on click
      resultsEl.querySelectorAll('.us-item').forEach(item => {
        item.addEventListener('click', () => {
          close();
          if (item.dataset.nav === 'invoice' && item.dataset.id) {
            // Open invoice detail directly using tempWrapper approach
            const dummyContainer = document.createElement('div');
            document.body.appendChild(dummyContainer);
            openInvoiceDetail(dummyContainer, parseInt(item.dataset.id));
          } else {
            navigateTo(item.dataset.nav);
          }
        });
      });
    }, 200);
  });

  setTimeout(() => input.focus(), 50);
}

// ============ MODULE 12: KEYBOARD SHORTCUT OVERLAY ============
function showShortcutOverlay() {
  const lang = window.i18n.getLang();
  const existing = document.getElementById('shortcut-overlay');
  if (existing) { existing.remove(); return; }

  const overlay = document.createElement('div');
  overlay.id = 'shortcut-overlay';
  overlay.className = 'modal-overlay';
  overlay.style.display = 'flex';
  overlay.innerHTML = `
    <div class="modal" style="max-width:500px;">
      <div class="modal-header">
        <h3 class="modal-title">${lang === 'ar' ? '⌨️ اختصارات لوحة المفاتيح' : '⌨️ Keyboard Shortcuts'}</h3>
        <button class="modal-close" id="sc-close">✕</button>
      </div>
      <div class="modal-body" style="padding:16px;">
        <table class="data-table">
          <tbody>
            ${[
              ['Ctrl+K', lang === 'ar' ? 'البحث الشامل' : 'Universal Search'],
              ['F1', lang === 'ar' ? 'لوحة التحكم' : 'Dashboard'],
              ['F2', lang === 'ar' ? 'نقطة البيع' : 'POS'],
              ['F3', lang === 'ar' ? 'المنتجات' : 'Products'],
              ['F4', lang === 'ar' ? 'العملاء' : 'Customers'],
              ['F5', lang === 'ar' ? 'دفع نقدي (POS)' : 'Cash Payment (POS)'],
              ['F6', lang === 'ar' ? 'دفع بطاقة (POS)' : 'Card Payment (POS)'],
              ['F7', lang === 'ar' ? 'تعليق البيع (POS)' : 'Hold Sale (POS)'],
              ['F8', lang === 'ar' ? 'خصم (POS)' : 'Discount (POS)'],
              ['F9', lang === 'ar' ? 'فتح الدرج (POS)' : 'Open Drawer (POS)'],
              ['↑ ↓', lang === 'ar' ? 'التنقل بين عناصر السلة' : 'Navigate cart items'],
              ['+ −', lang === 'ar' ? 'زيادة / إنقاص الكمية' : 'Increase / Decrease qty'],
              ['Delete', lang === 'ar' ? 'حذف العنصر المحدد من السلة' : 'Remove selected item from cart'],
              ['Escape', lang === 'ar' ? 'إغلاق / رجوع' : 'Close / Back'],
              ['?', lang === 'ar' ? 'هذه القائمة' : 'This overlay'],
            ].map(([key, desc]) => `<tr><td style="font-family:var(--font-mono);font-weight:700;color:var(--accent);width:140px;">${key}</td><td>${desc}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.querySelector('#sc-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

// ============ ENHANCED KEYBOARD SHORTCUTS ============
document.addEventListener('keydown', (e) => {
  // Ctrl+K = Universal Search
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    openUniversalSearch();
    return;
  }
  // ? key = show shortcuts (only when not typing)
  const tag = document.activeElement?.tagName;
  if (e.key === '?' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
    showShortcutOverlay();
  }
});

// Hook global search bar to open universal search - uses event delegation to survive DOM rebuilds
document.addEventListener('focusin', (e) => {
  if (e.target && e.target.id === 'global-search') {
    e.target.blur();
    openUniversalSearch();
  }
});

function _escU(s) { return window.escHtml(s); }

// ============ FEATURE 1: CASH SESSION MANAGEMENT ============
async function renderCashSession(container) {
  const lang = window.i18n?.getLang() || 'ar';
  
  // Check current session
  const sessionRes = await window.daftrly.query("SELECT * FROM cash_sessions WHERE status = 'open' ORDER BY id DESC LIMIT 1");
  const currentSession = sessionRes.success && sessionRes.data?.[0] ? sessionRes.data[0] : null;

  // Get recent closed sessions with filter
  const csPage = window._csPage || 1;
  const csPerPage = 15;
  const csFrom = window._csFrom || '';
  const csTo = window._csTo || '';
  let csCountSql = "SELECT COUNT(*) as total FROM cash_sessions WHERE status = 'closed'";
  let csSql = "SELECT * FROM cash_sessions WHERE status = 'closed'";
  const csParams = [];
  const csCountParams = [];
  if (csFrom) { csSql += ' AND date(opened_at) >= ?'; csCountSql += ' AND date(opened_at) >= ?'; csParams.push(csFrom); csCountParams.push(csFrom); }
  if (csTo) { csSql += ' AND date(closed_at) <= ?'; csCountSql += ' AND date(closed_at) <= ?'; csParams.push(csTo); csCountParams.push(csTo); }
  csSql += ' ORDER BY closed_at DESC LIMIT ? OFFSET ?';
  csParams.push(csPerPage, (csPage - 1) * csPerPage);
  
  const csCountRes = await window.daftrly.query(csCountSql, csCountParams);
  const csTotal = csCountRes.success && csCountRes.data?.[0] ? csCountRes.data[0].total : 0;
  const csTotalPages = Math.ceil(csTotal / csPerPage);

  const historyRes = await window.daftrly.query(csSql, csParams);
  const history = historyRes.success ? (historyRes.data || []) : [];

  container.innerHTML = `
    <div class="settings-page fade-in">
      <div class="settings-header">
        <h2>${lang === 'ar' ? '💰 إدارة الورديات النقدية' : '💰 Cash Session Management'}</h2>
        <p style="color:var(--text-secondary);">${lang === 'ar' ? 'فتح وإغلاق الورديات وتتبع النقد في الدرج' : 'Open and close shifts, track cash in drawer'}</p>
      </div>

      ${currentSession ? `
        <div style="background:var(--success-bg, rgba(34,197,94,0.1));border:1px solid var(--success);padding:20px;border-radius:10px;margin-bottom:20px;">
          <h3 style="color:var(--success);margin-bottom:8px;">🟢 ${lang === 'ar' ? 'وردية مفتوحة' : 'Session Open'}</h3>
          <p>${lang === 'ar' ? 'فُتحت:' : 'Opened:'} ${currentSession.opened_at || '—'}</p>
          <p>${lang === 'ar' ? 'المبلغ الافتتاحي:' : 'Opening amount:'} ${Number(currentSession.opening_amount).toFixed(2)} ${window.getCurrSym()}</p>
          <div style="margin-top:12px;">
            <label class="form-label">${lang === 'ar' ? 'المبلغ الفعلي في الدرج:' : 'Actual cash in drawer:'}</label>
            <input type="text" inputmode="decimal" id="cs-closing-amount" class="form-input" placeholder="0.00" style="max-width:200px;">
          </div>
          <button class="btn btn-primary" id="cs-close-btn" style="margin-top:12px;background:var(--danger);border-color:var(--danger);">
            🔒 ${lang === 'ar' ? 'إغلاق الوردية' : 'Close Session'}
          </button>
        </div>
      ` : `
        <div style="background:var(--bg-secondary);padding:20px;border-radius:10px;margin-bottom:20px;">
          <h3 style="margin-bottom:8px;">⚪ ${lang === 'ar' ? 'لا توجد وردية مفتوحة' : 'No Open Session'}</h3>
          <div style="margin-bottom:12px;">
            <label class="form-label">${lang === 'ar' ? 'المبلغ الافتتاحي:' : 'Opening amount:'}</label>
            <input type="text" inputmode="decimal" id="cs-opening-amount" class="form-input" value="0" placeholder="0.00" style="max-width:200px;">
          </div>
          <button class="btn btn-primary" id="cs-open-btn">
            🔓 ${lang === 'ar' ? 'فتح وردية جديدة' : 'Open New Session'}
          </button>
        </div>
      `}

      <h3 style="margin-bottom:8px;">${lang === 'ar' ? 'سجل الورديات' : 'Session History'} (${csTotal})</h3>
        <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center;flex-wrap:wrap;">
          <input type="date" id="cs-from" class="form-input" style="width:auto;font-size:12px;" value="${csFrom}" placeholder="${lang === 'ar' ? 'من' : 'From'}">
          <input type="date" id="cs-to" class="form-input" style="width:auto;font-size:12px;" value="${csTo}" placeholder="${lang === 'ar' ? 'إلى' : 'To'}">
          <button class="btn btn-secondary btn-sm" id="cs-filter">${lang === 'ar' ? 'تصفية' : 'Filter'}</button>
          ${csFrom || csTo ? `<button class="btn btn-secondary btn-sm" id="cs-clear">${lang === 'ar' ? 'مسح' : 'Clear'}</button>` : ''}
        </div>

      ${history.length > 0 ? `
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="border-bottom:2px solid var(--border);">
            <th style="padding:8px;text-align:${lang === 'ar' ? 'right' : 'left'};">${lang === 'ar' ? 'الفتح' : 'Opened'}</th>
            <th style="padding:8px;">${lang === 'ar' ? 'الإغلاق' : 'Closed'}</th>
            <th style="padding:8px;">${lang === 'ar' ? 'افتتاحي' : 'Opening'}</th>
            <th style="padding:8px;">${lang === 'ar' ? 'متوقع' : 'Expected'}</th>
            <th style="padding:8px;">${lang === 'ar' ? 'فعلي' : 'Actual'}</th>
            <th style="padding:8px;">${lang === 'ar' ? 'الفرق' : 'Diff'}</th>
          </tr></thead>
          <tbody>
            ${history.map(s => {
              const diff = Number(s.difference) || 0;
              const diffColor = diff === 0 ? 'var(--success)' : diff > 0 ? 'var(--accent)' : 'var(--danger)';
              return `<tr style="border-bottom:1px solid var(--border);">
                <td style="padding:8px;font-size:12px;">${s.opened_at?.substring(0, 16).replace('T', ' ') || '—'}</td>
                <td style="padding:8px;font-size:12px;">${s.closed_at?.substring(0, 16).replace('T', ' ') || '—'}</td>
                <td style="padding:8px;">${Number(s.opening_amount).toFixed(2)}</td>
                <td style="padding:8px;">${Number(s.expected_amount).toFixed(2)}</td>
                <td style="padding:8px;">${Number(s.closing_amount).toFixed(2)}</td>
                <td style="padding:8px;font-weight:700;color:${diffColor};">${diff >= 0 ? '+' : ''}${diff.toFixed(2)}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        ${csTotalPages > 1 ? `
          <div style="display:flex;justify-content:center;gap:8px;margin-top:12px;">
            ${csPage > 1 ? `<button class="btn btn-secondary btn-sm" id="cs-prev">← ${lang === 'ar' ? 'السابق' : 'Prev'}</button>` : ''}
            <span style="color:var(--text-secondary);font-size:13px;">${csPage} / ${csTotalPages}</span>
            ${csPage < csTotalPages ? `<button class="btn btn-secondary btn-sm" id="cs-next">${lang === 'ar' ? 'التالي' : 'Next'} →</button>` : ''}
          </div>
        ` : ''}
      ` : `<div style="text-align:center;padding:20px;color:var(--text-tertiary);">${lang === 'ar' ? 'لا توجد ورديات مغلقة' : 'No closed sessions'}</div>`}
    </div>
  `;

  // Open session
  const openBtn = container.querySelector('#cs-open-btn');
  if (openBtn) {
    openBtn.addEventListener('click', async () => {
      const amount = parseFloat(container.querySelector('#cs-opening-amount').value) || 0;
      await window.daftrly.query(
        "INSERT INTO cash_sessions (cashier_id, opening_amount, status, opened_at) VALUES (1, ?, 'open', datetime('now'))",
        [amount]);
      window.dbg('success', 'Cash session opened with', amount);
      showToast(lang === 'ar' ? '✅ تم فتح الوردية' : '✅ Session opened', 'success');
      // Auto kick drawer on session open
      const prSettings = (await window.daftrly.getSettings()).printer || {};
      if (prSettings.drawerKick && prSettings.type === 'network' && prSettings.ip) {
        window.daftrly.printerSend(prSettings.ip, prSettings.port || 9100, 'drawer').catch(() => {});
      }
      renderCashSession(container);
    });
  }

  // Close session
  const closeBtn = container.querySelector('#cs-close-btn');
  if (closeBtn) {
    closeBtn.addEventListener('click', async () => {
      const closingAmount = parseFloat(container.querySelector('#cs-closing-amount').value) || 0;
      
      // Calculate expected: opening + (cash received - change given) - cash refunds
      const cashSalesRes = await window.daftrly.query(
        "SELECT COALESCE(SUM(p.amount), 0) as total FROM payments p INNER JOIN sales s ON s.id = p.sale_id WHERE p.method = 'cash' AND s.created_at >= ?",
        [currentSession.opened_at]);
      const cashSales = cashSalesRes.success && cashSalesRes.data?.[0] ? Number(cashSalesRes.data[0].total) : 0;

      // Subtract change given back to customers
      const changeRes = await window.daftrly.query(
        "SELECT COALESCE(SUM(change_amount), 0) as total FROM sales WHERE payment_method = 'cash' AND status = 'completed' AND created_at >= ?",
        [currentSession.opened_at]);
      const changeGiven = changeRes.success && changeRes.data?.[0] ? Number(changeRes.data[0].total) : 0;
      
      const cashRefundsRes = await window.daftrly.query(
        "SELECT COALESCE(SUM(total_refund), 0) as total FROM returns WHERE refund_method = 'cash' AND created_at >= ?",
        [currentSession.opened_at]);
      const cashRefunds = cashRefundsRes.success && cashRefundsRes.data?.[0] ? Number(cashRefundsRes.data[0].total) : 0;

      const expectedAmount = Number(currentSession.opening_amount) + cashSales - changeGiven - cashRefunds;
      const difference = closingAmount - expectedAmount;

      await window.daftrly.query(
        "UPDATE cash_sessions SET closing_amount = ?, expected_amount = ?, difference = ?, status = 'closed', closed_at = datetime('now') WHERE id = ?",
        [closingAmount, expectedAmount, difference, currentSession.id]);

      const diffMsg = difference === 0 
        ? (lang === 'ar' ? '✅ الدرج متطابق!' : '✅ Drawer balanced!')
        : (lang === 'ar' ? `⚠️ فرق: ${difference.toFixed(2)} ${window.getCurrSym()}` : `⚠️ Difference: ${difference.toFixed(2)} ${window.getCurrSym()}`);
      
      showToast(diffMsg, difference === 0 ? 'success' : 'warning');
      window.dbg('success', 'Cash session closed', { expected: expectedAmount, actual: closingAmount, diff: difference });
      renderCashSession(container);
    });
  }

  // Session history filter
  const csFilterBtn = container.querySelector('#cs-filter');
  if (csFilterBtn) {
    csFilterBtn.addEventListener('click', () => {
      window._csFrom = container.querySelector('#cs-from')?.value || '';
      window._csTo = container.querySelector('#cs-to')?.value || '';
      window._csPage = 1;
      renderCashSession(container);
    });
  }
  const csClearBtn = container.querySelector('#cs-clear');
  if (csClearBtn) {
    csClearBtn.addEventListener('click', () => {
      window._csFrom = ''; window._csTo = ''; window._csPage = 1;
      renderCashSession(container);
    });
  }
  const csPrev = container.querySelector('#cs-prev');
  const csNext = container.querySelector('#cs-next');
  if (csPrev) csPrev.addEventListener('click', () => { window._csPage = (window._csPage || 1) - 1; renderCashSession(container); });
  if (csNext) csNext.addEventListener('click', () => { window._csPage = (window._csPage || 1) + 1; renderCashSession(container); });
}
window.renderCashSession = renderCashSession;

// ============ FEATURE 15: USER MANAGEMENT ============
async function renderUserManagement(container) {
  const lang = window.i18n?.getLang() || 'ar';
  
  const usersRes = await window.daftrly.query('SELECT * FROM users ORDER BY id ASC');
  const users = usersRes.success ? (usersRes.data || []) : [];

  container.innerHTML = `
    <div class="settings-page fade-in">
      <div class="settings-header" style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <h2>${lang === 'ar' ? '👥 إدارة المستخدمين' : '👥 User Management'}</h2>
          <p style="color:var(--text-secondary);">${lang === 'ar' ? 'إدارة الصلاحيات وأرقام PIN' : 'Manage roles, permissions, and PINs'}</p>
        </div>
        <button class="btn btn-primary" id="add-user-btn">+ ${lang === 'ar' ? 'مستخدم جديد' : 'New User'}</button>
      </div>

      <div style="display:grid;gap:12px;">
        ${users.map(u => `
          <div style="background:var(--bg-secondary);padding:16px;border-radius:10px;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <strong>${_escU(u.name_ar)}</strong> ${u.name_en ? `<span style="color:var(--text-secondary);">(${_escU(u.name_en)})</span>` : ''}
              <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">
                <span style="background:${u.role === 'admin' ? 'var(--accent)' : 'var(--text-tertiary)'};color:#fff;padding:2px 8px;border-radius:4px;font-size:11px;">${u.role === 'admin' ? (lang === 'ar' ? 'مدير' : 'Admin') : (lang === 'ar' ? 'كاشير' : 'Cashier')}</span>
                ${u.commission_rate > 0 ? ` | ${lang === 'ar' ? 'عمولة' : 'Commission'}: ${u.commission_rate}%` : ''}
                | PIN: ${u.pin ? '••••' : (lang === 'ar' ? 'غير محدد' : 'Not set')}
              </div>
            </div>
            <div style="display:flex;gap:8px;">
              <button class="btn btn-secondary btn-sm" data-edit-user="${u.id}">✏️</button>
              ${u.id !== 1 ? `<button class="btn btn-secondary btn-sm" data-delete-user="${u.id}" style="color:var(--danger);">🗑</button>` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;

  // Add user — but first check if admin has a PIN
  container.querySelector('#add-user-btn').addEventListener('click', async () => {
    // Check if admin (user id 1) has a PIN set
    const adminRes = await window.daftrly.query('SELECT pin FROM users WHERE id = 1');
    const adminPin = adminRes.success && adminRes.data?.[0] ? adminRes.data[0].pin : '';
    
    if (!adminPin || adminPin === '') {
      // Admin has no PIN — force them to set one first
      showToast(lang === 'ar' ? '⚠️ يجب تعيين رمز PIN الخاص بك أولاً' : '⚠️ You must set your own PIN first', 'warning');
      // Open admin user for editing
      const adminUser = users.find(u => u.id === 1);
      if (adminUser) {
        openUserModal(container, adminUser);
      }
      return;
    }
    
    openUserModal(container, null);
  });

  // Edit user
  container.querySelectorAll('[data-edit-user]').forEach(btn => {
    btn.addEventListener('click', () => {
      const user = users.find(u => u.id === parseInt(btn.dataset.editUser));
      if (user) openUserModal(container, user);
    });
  });

  // Delete user
  container.querySelectorAll('[data-delete-user]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!await window.daftrlyConfirm(lang === 'ar' ? 'حذف هذا المستخدم؟' : 'Delete this user?')) return;
      await window.daftrly.query('DELETE FROM users WHERE id = ?', [parseInt(btn.dataset.deleteUser)]);
      showToast(lang === 'ar' ? 'تم حذف المستخدم' : 'User deleted', 'success');
      renderUserManagement(container);
    });
  });
}

async function openUserModal(container, user) {
  const lang = window.i18n?.getLang() || 'ar';
  const isEdit = !!user;
  const u = user || {};
  let userPerms = {};
  try { userPerms = JSON.parse(u.permissions || '{}'); } catch(e) {}

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.display = 'flex';
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px;">
      <div class="modal-header">
        <h3>${isEdit ? (lang === 'ar' ? 'تعديل المستخدم' : 'Edit User') : (lang === 'ar' ? 'مستخدم جديد' : 'New User')}</h3>
        <button class="modal-close" id="user-modal-close">✕</button>
      </div>
      <div class="modal-body" style="max-height:500px;overflow:auto;">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">${lang === 'ar' ? 'الاسم (عربي) *' : 'Name (Arabic) *'}</label>
            <input type="text" id="u-name-ar" class="form-input" value="${_escU(u.name_ar || '')}">
          </div>
          <div class="form-group">
            <label class="form-label">${lang === 'ar' ? 'الاسم (إنجليزي)' : 'Name (English)'}</label>
            <input type="text" id="u-name-en" class="form-input" value="${_escU(u.name_en || '')}">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">${lang === 'ar' ? 'الدور' : 'Role'}</label>
            <select id="u-role" class="form-input form-select">
              <option value="cashier" ${(u.role || 'cashier') === 'cashier' ? 'selected' : ''}>${lang === 'ar' ? 'كاشير' : 'Cashier'}</option>
              <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>${lang === 'ar' ? 'مدير' : 'Admin'}</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">${lang === 'ar' ? 'رمز PIN' : 'PIN Code'}</label>
            <input type="text" id="u-pin" class="form-input" maxlength="6" value="${u.pin || ''}" placeholder="0000">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'نسبة العمولة %' : 'Commission Rate %'}</label>
          <input type="number" id="u-commission" class="form-input" step="0.1" min="0" max="100" value="${u.commission_rate || 0}">
        </div>

        <!-- NFC/RFID Card Assignment -->
        <div class="form-group" style="border-top:1px solid var(--border);padding-top:12px;margin-top:8px;">
          <label class="form-label">💳 ${lang === 'ar' ? 'بطاقة الدخول (NFC/RFID)' : 'Access Card (NFC/RFID)'}</label>
          <div id="u-card-status" style="font-size:12px;margin-bottom:8px;">
            ${u.card_id 
              ? `<span style="color:var(--success);">✅ ${lang === 'ar' ? 'بطاقة مربوطة:' : 'Card assigned:'} <code style="background:var(--bg-secondary);padding:2px 6px;border-radius:4px;">${u.card_id}</code></span>`
              : `<span style="color:var(--text-tertiary);">${lang === 'ar' ? 'لا توجد بطاقة' : 'No card assigned'}</span>`
            }
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-sm btn-secondary" id="u-assign-card" type="button">
              ${u.card_id ? (lang === 'ar' ? '🔄 تغيير البطاقة' : '🔄 Change Card') : (lang === 'ar' ? '🔗 ربط بطاقة' : '🔗 Assign Card')}
            </button>
            ${u.card_id ? `<button class="btn btn-sm btn-secondary" id="u-remove-card" type="button" style="color:var(--danger);">❌ ${lang === 'ar' ? 'إزالة' : 'Remove'}</button>` : ''}
          </div>
          <input type="hidden" id="u-card-id" value="${u.card_id || ''}">
          <div id="u-card-listening" style="display:none;margin-top:8px;padding:12px;background:var(--accent);color:#fff;border-radius:8px;text-align:center;font-size:13px;animation:pulse 1.5s infinite;">
            💳 ${lang === 'ar' ? 'امسح البطاقة الآن...' : 'Tap card now...'}
          </div>
        </div>

        <!-- Permissions (only for cashier role) -->
        <div id="u-perms-section">
          <label class="form-label" style="font-weight:700;margin-top:12px;margin-bottom:8px;border-top:1px solid var(--border);padding-top:12px;">
            ${lang === 'ar' ? '🔑 الصلاحيات' : '🔑 Permissions'}
          </label>
          <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:8px;">
            ${lang === 'ar' ? 'المدير لديه صلاحيات كاملة تلقائياً' : 'Admin role has full permissions automatically'}
          </div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;" id="u-perms-grid">
            ${Object.keys(PERMISSION_LABELS).map(key => {
              const checked = userPerms[key] !== undefined ? userPerms[key] : (DEFAULT_PERMISSIONS[key] ?? true);
              const label = lang === 'ar' ? PERMISSION_LABELS[key].ar : PERMISSION_LABELS[key].en;
              return `<label style="display:flex;align-items:center;gap:6px;font-size:12px;padding:4px;cursor:pointer;">
                <input type="checkbox" class="u-perm-check" data-perm="${key}" ${checked ? 'checked' : ''} style="width:16px;height:16px;">
                ${label}
              </label>`;
            }).join('')}
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="user-modal-cancel">${lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
        <button class="btn btn-primary" id="user-modal-save">${lang === 'ar' ? 'حفظ' : 'Save'}</button>
      </div>
    </div>
  `;
  container.appendChild(overlay);

  // Show/hide perms based on role
  const roleSelect = overlay.querySelector('#u-role');
  const permsSection = overlay.querySelector('#u-perms-section');
  function updatePermsVisibility() {
    permsSection.style.opacity = roleSelect.value === 'admin' ? '0.4' : '1';
  }
  roleSelect.addEventListener('change', updatePermsVisibility);
  updatePermsVisibility();

  // NFC/RFID Card Assignment
  const cardIdInput = overlay.querySelector('#u-card-id');
  const cardStatus = overlay.querySelector('#u-card-status');
  const cardListening = overlay.querySelector('#u-card-listening');
  const assignCardBtn = overlay.querySelector('#u-assign-card');
  const removeCardBtn = overlay.querySelector('#u-remove-card');
  let cardListenerActive = false;
  let cardBuf = '';
  let cardLastKey = 0;
  let cardTimeout = null;

  function cardScanHandler(e) {
    if (!cardListenerActive) return;
    if (e.key.length === 1) {
      const now = Date.now();
      if (now - cardLastKey < 80) {
        cardBuf += e.key;
      } else {
        cardBuf = e.key;
      }
      cardLastKey = now;
      e.preventDefault();
      e.stopPropagation();

      clearTimeout(cardTimeout);
      cardTimeout = setTimeout(() => {
        if (cardBuf.length >= 6) {
          // Card scanned!
          cardIdInput.value = cardBuf.trim();
          cardStatus.innerHTML = `<span style="color:var(--success);">✅ ${lang === 'ar' ? 'تم مسح البطاقة:' : 'Card scanned:'} <code style="background:var(--bg-secondary);padding:2px 6px;border-radius:4px;">${cardBuf.trim()}</code></span>`;
          cardListening.style.display = 'none';
          cardListenerActive = false;
          showToast(lang === 'ar' ? '✅ تم قراءة البطاقة' : '✅ Card detected', 'success');
        }
        cardBuf = '';
      }, 300);
    }
  }

  if (assignCardBtn) {
    assignCardBtn.addEventListener('click', () => {
      cardListenerActive = true;
      cardBuf = '';
      cardListening.style.display = 'block';
      document.addEventListener('keydown', cardScanHandler, true);
      // Auto-stop listening after 15 seconds
      setTimeout(() => {
        if (cardListenerActive) {
          cardListenerActive = false;
          cardListening.style.display = 'none';
          document.removeEventListener('keydown', cardScanHandler, true);
        }
      }, 15000);
    });
  }

  if (removeCardBtn) {
    removeCardBtn.addEventListener('click', () => {
      cardIdInput.value = '';
      cardStatus.innerHTML = `<span style="color:var(--text-tertiary);">${lang === 'ar' ? 'تم إزالة البطاقة' : 'Card removed'}</span>`;
    });
  }

  // Clean up card listener when modal closes
  const cleanupCard = () => { cardListenerActive = false; document.removeEventListener('keydown', cardScanHandler, true); };

  overlay.querySelector('#user-modal-close').addEventListener('click', () => { cleanupCard(); overlay.remove(); });
  overlay.querySelector('#user-modal-cancel').addEventListener('click', () => { cleanupCard(); overlay.remove(); });

  overlay.querySelector('#user-modal-save').addEventListener('click', async () => {
    const nameAr = overlay.querySelector('#u-name-ar').value.trim();
    if (!nameAr) { showToast(lang === 'ar' ? 'الاسم مطلوب' : 'Name is required', 'error'); return; }

    // Collect permissions
    const perms = {};
    overlay.querySelectorAll('.u-perm-check').forEach(cb => {
      perms[cb.dataset.perm] = cb.checked;
    });

    const data = {
      name_ar: nameAr,
      name_en: overlay.querySelector('#u-name-en').value.trim(),
      role: overlay.querySelector('#u-role').value,
      pin: overlay.querySelector('#u-pin').value.trim(),
      commission_rate: parseFloat(overlay.querySelector('#u-commission').value) || 0,
      permissions: JSON.stringify(perms),
      card_id: overlay.querySelector('#u-card-id').value.trim() || null,
    };

    // Duplicate PIN check
    if (data.pin) {
      const dupCheck = await window.daftrly.query(
        'SELECT id, name_ar FROM users WHERE pin = ? AND id != ? AND is_active = 1',
        [data.pin, isEdit ? u.id : -1]);
      if (dupCheck.success && dupCheck.data && dupCheck.data.length > 0) {
        const dupName = dupCheck.data[0].name_ar;
        showToast(lang === 'ar' ? `⚠️ هذا الرمز مستخدم بالفعل بواسطة: ${dupName}` : `⚠️ PIN already used by: ${dupName}`, 'error');
        return;
      }
    }

    // Duplicate card check
    if (data.card_id) {
      const cardDup = await window.daftrly.query(
        'SELECT id, name_ar FROM users WHERE card_id = ? AND id != ? AND is_active = 1',
        [data.card_id, isEdit ? u.id : -1]);
      if (cardDup.success && cardDup.data && cardDup.data.length > 0) {
        const dupName = cardDup.data[0].name_ar;
        showToast(lang === 'ar' ? `⚠️ هذه البطاقة مستخدمة بالفعل بواسطة: ${dupName}` : `⚠️ Card already assigned to: ${dupName}`, 'error');
        return;
      }
    }

    cleanupCard();

    if (isEdit) {
      await window.daftrly.query('UPDATE users SET name_ar=?, name_en=?, role=?, pin=?, commission_rate=?, permissions=?, card_id=? WHERE id=?',
        [data.name_ar, data.name_en, data.role, data.pin, data.commission_rate, data.permissions, data.card_id, u.id]);
    } else {
      await window.daftrly.query('INSERT INTO users (name_ar, name_en, role, pin, commission_rate, permissions, card_id) VALUES (?,?,?,?,?,?,?)',
        [data.name_ar, data.name_en, data.role, data.pin, data.commission_rate, data.permissions, data.card_id]);
    }

    overlay.remove();
    showToast(lang === 'ar' ? '✅ تم حفظ المستخدم' : '✅ User saved', 'success');
    renderUserManagement(container);
  });
}
window.renderUserManagement = renderUserManagement;

// ============ FEATURE 2: LOW STOCK ALERTS ============
async function checkLowStock() {
  const result = await window.daftrly.query(
    'SELECT id, name_ar, name_en, stock_quantity, reorder_level FROM products WHERE track_stock = 1 AND is_active = 1 AND stock_quantity <= reorder_level AND reorder_level > 0'
  );
  if (result.success && result.data && result.data.length > 0) {
    const lang = window.i18n?.getLang() || 'ar';
    const count = result.data.length;
    window.dbg('warn', `Low stock alert: ${count} products below reorder level`);
    showToast(
      lang === 'ar' 
        ? `⚠️ ${count} منتج أقل من حد إعادة الطلب` 
        : `⚠️ ${count} products below reorder level`, 
      'warning'
    );
  }
  return result.success ? (result.data || []) : [];
}
window.checkLowStock = checkLowStock;

// Check low stock on app load (after 3 seconds)
setTimeout(() => { checkLowStock(); }, 3000);

// ============ AUDIT LOG ============
async function logAudit(action, entityType, entityId, details) {
  const userId = window._currentUser?.id || 0;
  const detailStr = typeof details === 'object' ? JSON.stringify(details) : String(details || '');
  await window.daftrly.query(
    'INSERT INTO audit_log (user_id, action, entity_type, entity_id, details) VALUES (?,?,?,?,?)',
    [userId, action, entityType || null, entityId || null, detailStr]
  );
}
window.logAudit = logAudit;

// ============ AUDIT LOG VIEWER ============
async function renderAuditLog(container) {
  const lang = window.i18n?.getLang() || 'ar';
  const page = window._auditPage || 1;
  const perPage = 30;
  const offset = (page - 1) * perPage;
  const auFrom = window._auditFrom || '';
  const auTo = window._auditTo || '';

  let countSql = 'SELECT COUNT(*) as total FROM audit_log';
  let dataSql = 'SELECT a.*, u.name_ar as user_name FROM audit_log a LEFT JOIN users u ON u.id = a.user_id';
  let where = '';
  const params = [];
  const countParams = [];
  if (auFrom) { where += (where ? ' AND' : ' WHERE') + ' date(a.created_at) >= ?'; params.push(auFrom); countParams.push(auFrom); }
  if (auTo) { where += (where ? ' AND' : ' WHERE') + ' date(a.created_at) <= ?'; params.push(auTo); countParams.push(auTo); }
  const countWhere = where.replace(/a\./g, '');
  
  const countRes = await window.daftrly.query(countSql + countWhere, countParams);
  const total = countRes.success && countRes.data?.[0] ? countRes.data[0].total : 0;
  const totalPages = Math.ceil(total / perPage);

  const res = await window.daftrly.query(
    dataSql + where + ` ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
    [...params, perPage, offset]);
  const logs = res.success ? (res.data || []) : [];

  const actionLabels = {
    login: { ar: 'تسجيل دخول', en: 'Login', icon: '🔐' },
    sale: { ar: 'بيع', en: 'Sale', icon: '💰' },
    refund: { ar: 'مرتجع', en: 'Refund', icon: '↩' },
    discount: { ar: 'خصم', en: 'Discount', icon: '%' },
    drawer_open: { ar: 'فتح الدرج', en: 'Drawer Open', icon: '💰' },
    session_open: { ar: 'فتح وردية', en: 'Session Open', icon: '🟢' },
    session_close: { ar: 'إغلاق وردية', en: 'Session Close', icon: '🔴' },
    product_add: { ar: 'إضافة منتج', en: 'Product Add', icon: '📦' },
    product_edit: { ar: 'تعديل منتج', en: 'Product Edit', icon: '✏️' },
    product_delete: { ar: 'حذف منتج', en: 'Product Delete', icon: '🗑' },
    sale_delete: { ar: 'حذف فاتورة', en: 'Invoice Delete', icon: '🗑' },
    payment_collect: { ar: 'تحصيل دين', en: 'Debt Collect', icon: '💵' },
    lock: { ar: 'قفل', en: 'Lock', icon: '🔒' },
  };

  container.innerHTML = `
    <div class="settings-page fade-in">
      <div class="settings-header">
        <h2>${lang === 'ar' ? '📋 سجل النشاط' : '📋 Activity Log'}</h2>
        <p style="color:var(--text-secondary);">${lang === 'ar' ? `${total} سجل` : `${total} entries`}</p>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center;flex-wrap:wrap;">
        <input type="date" id="au-from" class="form-input" style="width:auto;font-size:12px;" value="${auFrom}">
        <input type="date" id="au-to" class="form-input" style="width:auto;font-size:12px;" value="${auTo}">
        <button class="btn btn-secondary btn-sm" id="au-filter">${lang === 'ar' ? 'تصفية' : 'Filter'}</button>
        ${auFrom || auTo ? `<button class="btn btn-secondary btn-sm" id="au-clear">${lang === 'ar' ? 'مسح' : 'Clear'}</button>` : ''}
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead><tr style="border-bottom:2px solid var(--border);">
          <th style="padding:8px;text-align:${lang === 'ar' ? 'right' : 'left'};">${lang === 'ar' ? 'التاريخ' : 'Date'}</th>
          <th style="padding:8px;">${lang === 'ar' ? 'المستخدم' : 'User'}</th>
          <th style="padding:8px;">${lang === 'ar' ? 'الإجراء' : 'Action'}</th>
          <th style="padding:8px;">${lang === 'ar' ? 'التفاصيل' : 'Details'}</th>
        </tr></thead>
        <tbody>
          ${logs.map(l => {
            const label = actionLabels[l.action] || { ar: l.action, en: l.action, icon: '•' };
            return `<tr style="border-bottom:1px solid var(--border);">
              <td style="padding:6px 8px;font-size:11px;color:var(--text-secondary);white-space:nowrap;">${l.created_at?.replace('T', ' ').substring(0, 16) || '—'}</td>
              <td style="padding:6px 8px;font-weight:600;">${_escU(l.user_name || (lang === 'ar' ? 'نظام' : 'System'))}</td>
              <td style="padding:6px 8px;">${label.icon} ${lang === 'ar' ? label.ar : label.en}</td>
              <td style="padding:6px 8px;font-size:11px;color:var(--text-secondary);max-width:200px;overflow:hidden;text-overflow:ellipsis;">${_escU(l.details || '')}</td>
            </tr>`;
          }).join('') || `<tr><td colspan="4" style="padding:24px;text-align:center;color:var(--text-tertiary);">${lang === 'ar' ? 'لا توجد سجلات' : 'No entries'}</td></tr>`}
        </tbody>
      </table>

      ${totalPages > 1 ? `
        <div style="display:flex;justify-content:center;gap:8px;margin-top:16px;">
          ${page > 1 ? `<button class="btn btn-secondary btn-sm" id="audit-prev">← ${lang === 'ar' ? 'السابق' : 'Prev'}</button>` : ''}
          <span style="padding:6px 12px;color:var(--text-secondary);font-size:13px;">${page} / ${totalPages}</span>
          ${page < totalPages ? `<button class="btn btn-secondary btn-sm" id="audit-next">${lang === 'ar' ? 'التالي' : 'Next'} →</button>` : ''}
        </div>
      ` : ''}
    </div>
  `;

  const prevBtn = container.querySelector('#audit-prev');
  const nextBtn = container.querySelector('#audit-next');
  if (prevBtn) prevBtn.addEventListener('click', () => { window._auditPage = page - 1; renderAuditLog(container); });
  if (nextBtn) nextBtn.addEventListener('click', () => { window._auditPage = page + 1; renderAuditLog(container); });

  const auFilterBtn = container.querySelector('#au-filter');
  if (auFilterBtn) {
    auFilterBtn.addEventListener('click', () => {
      window._auditFrom = container.querySelector('#au-from')?.value || '';
      window._auditTo = container.querySelector('#au-to')?.value || '';
      window._auditPage = 1;
      renderAuditLog(container);
    });
  }
  const auClearBtn = container.querySelector('#au-clear');
  if (auClearBtn) {
    auClearBtn.addEventListener('click', () => {
      window._auditFrom = ''; window._auditTo = ''; window._auditPage = 1;
      renderAuditLog(container);
    });
  }
}
window.renderAuditLog = renderAuditLog;

// ============ UNPAID INVOICES ============
async function renderUnpaidInvoices(container) {
  const lang = window.i18n?.getLang() || 'ar';

  const res = await window.daftrly.query(
    `SELECT s.*, c.name_ar as cust_name_ar, c.name_en as cust_name_en, c.phone as cust_phone
     FROM sales s LEFT JOIN customers c ON s.customer_id = c.id
     WHERE s.balance_due > 0 AND s.status = 'completed'
     ORDER BY s.created_at DESC`);
  const invoices = res.success ? (res.data || []) : [];

  const totalDue = invoices.reduce((s, i) => s + (i.balance_due || 0), 0);

  container.innerHTML = `
    <div class="settings-page fade-in">
      <div class="settings-header">
        <h2>${lang === 'ar' ? '💰 مبالغ مستحقة' : '💰 Outstanding Invoices'}</h2>
        <p style="color:var(--text-secondary);">
          ${lang === 'ar' ? `${invoices.length} فاتورة — إجمالي المستحق:` : `${invoices.length} invoices — Total due:`}
          <strong style="color:var(--danger);font-size:18px;"> ${_escU(formatCurrency(totalDue))}</strong>
        </p>
      </div>

      ${invoices.length === 0 ? `
        <div style="text-align:center;padding:40px;color:var(--text-tertiary);">
          <div style="font-size:48px;opacity:0.15;margin-bottom:12px;">✅</div>
          <div>${lang === 'ar' ? 'لا توجد مبالغ مستحقة — جميع الفواتير مدفوعة' : 'No outstanding invoices — all paid'}</div>
        </div>
      ` : `
        <table class="data-table" style="margin-top:12px;">
          <thead><tr>
            <th>${lang === 'ar' ? 'الفاتورة' : 'Invoice'}</th>
            <th>${lang === 'ar' ? 'التاريخ' : 'Date'}</th>
            <th>${lang === 'ar' ? 'العميل' : 'Customer'}</th>
            <th>${lang === 'ar' ? 'الإجمالي' : 'Total'}</th>
            <th>${lang === 'ar' ? 'المدفوع' : 'Paid'}</th>
            <th>${lang === 'ar' ? 'المتبقي' : 'Due'}</th>
            <th></th>
          </tr></thead>
          <tbody>
            ${invoices.map(inv => {
              const custName = inv.cust_name_ar ? (lang === 'ar' ? inv.cust_name_ar : (inv.cust_name_en || inv.cust_name_ar)) : (lang === 'ar' ? 'بدون اسم' : 'Unknown');
              const dateStr = inv.created_at ? inv.created_at.substring(0, 10) : '-';
              const paid = inv.total - inv.balance_due;
              return `<tr>
                <td style="font-family:var(--font-mono);font-weight:600;font-size:12px;">${_escU(inv.invoice_number)}</td>
                <td style="font-size:12px;">${dateStr}</td>
                <td>
                  <div style="font-weight:600;">${_escU(custName)}</div>
                  ${inv.cust_phone ? `<div style="font-size:11px;color:var(--text-tertiary);">${_escU(inv.cust_phone)}</div>` : ''}
                </td>
                <td>${_escU(formatCurrency(inv.total))}</td>
                <td style="color:var(--success);">${_escU(formatCurrency(paid))}</td>
                <td style="color:var(--danger);font-weight:700;">${_escU(formatCurrency(inv.balance_due))}</td>
                <td>
                  <button class="btn btn-primary btn-sm" data-collect="${inv.id}" data-due="${inv.balance_due}" data-inv="${inv.invoice_number}" data-cust="${inv.customer_id || 0}">
                    ${lang === 'ar' ? '💵 تحصيل' : '💵 Collect'}
                  </button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      `}
    </div>
  `;

  // Collect payment handler
  container.querySelectorAll('[data-collect]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const saleId = parseInt(btn.dataset.collect);
      const due = parseFloat(btn.dataset.due);
      const invNum = btn.dataset.inv;
      const custId = parseInt(btn.dataset.cust);

      const amountStr = await window.daftrlyPrompt(
        lang === 'ar'
          ? `تحصيل دفعة لفاتورة ${invNum}\nالمتبقي: ${due.toFixed(2)} ${window.getCurrSym()}\nأدخل المبلغ المحصّل:`
          : `Collect payment for ${invNum}\nRemaining: ${due.toFixed(2)} ${window.getCurrSym()}\nEnter amount collected:`,
        lang === 'ar' ? 'المبلغ' : 'Amount',
        due.toFixed(2)
      );

      if (!amountStr) return;
      const amount = parseFloat(amountStr);
      if (!amount || amount <= 0) {
        showToast(lang === 'ar' ? 'أدخل مبلغ صحيح' : 'Enter a valid amount', 'error');
        return;
      }
      if (amount > due + 0.01) {
        showToast(lang === 'ar' ? 'المبلغ أكبر من المتبقي' : 'Amount exceeds balance due', 'error');
        return;
      }

      // Record payment
      await window.daftrly.query(
        'INSERT INTO payments (sale_id, method, amount, reference) VALUES (?, ?, ?, ?)',
        [saleId, 'cash', amount, lang === 'ar' ? 'تحصيل دين' : 'Debt collection']);

      // Update sale balance_due
      const newDue = Math.max(0, due - amount);
      await window.daftrly.query('UPDATE sales SET balance_due = ?, payment_status = ? WHERE id = ?',
        [newDue, newDue <= 0 ? 'paid' : 'partial', saleId]);

      // Update customer credit_balance
      if (custId > 0) {
        await window.daftrly.query('UPDATE customers SET credit_balance = credit_balance - ? WHERE id = ?', [amount, custId]);
      }

      // Audit log
      window.logAudit('payment_collect', 'sales', saleId, `${invNum} | ${amount.toFixed(2)} SAR | remaining: ${newDue.toFixed(2)}`);

      showToast(lang === 'ar'
        ? `✅ تم تحصيل ${amount.toFixed(2)} ${window.getCurrSym()} — المتبقي: ${newDue.toFixed(2)} ${window.getCurrSym()}`
        : `✅ Collected ${amount.toFixed(2)} ${window.getCurrSym()} — Remaining: ${newDue.toFixed(2)} ${window.getCurrSym()}`, 'success');

      renderUnpaidInvoices(container);
    });
  });
}
window.renderUnpaidInvoices = renderUnpaidInvoices;
