// ============================================
// NAQDI - MODULE 4: POS SALES SCREEN
// The merchant's daily workhorse
// ============================================

// ============ PLU BARCODE PARSER ============
// Parses EAN-13 barcodes with embedded weight or price
// Format: PP CCCCC VVVVV D
//   PP = prefix (20-29 = variable weight/price)
//   CCCCC = product PLU code (5 digits)
//   VVVVV = value (weight in grams or price in cents)
//   D = check digit
async function parsePLUBarcode(barcode) {
  if (!barcode || barcode.length !== 13) return null;
  
  const settings = await window.daftrly.getSettings();
  const plu = settings.plu || {};
  if (!plu.enabled) return null;
  
  const prefix = barcode.substring(0, 2);
  const weightPrefixes = (plu.weightPrefixes || '20,21,22,23,24,25,26,27,28').split(',').map(p => p.trim());
  const pricePrefixes = (plu.pricePrefixes || '29').split(',').map(p => p.trim());
  
  const codeLength = parseInt(plu.codeLength) || 5;
  const valueLength = parseInt(plu.valueLength) || 5;
  const valueDivisor = parseInt(plu.valueDivisor) || 1000; // 1000 for kg (grams→kg), 100 for price (cents→SAR)
  
  if (weightPrefixes.includes(prefix)) {
    const productCode = barcode.substring(2, 2 + codeLength);
    const valueStr = barcode.substring(2 + codeLength, 2 + codeLength + valueLength);
    const value = parseInt(valueStr) / valueDivisor;
    if (value > 0) return { type: 'weight', productCode, value };
  }
  
  if (pricePrefixes.includes(prefix)) {
    const productCode = barcode.substring(2, 2 + codeLength);
    const valueStr = barcode.substring(2 + codeLength, 2 + codeLength + valueLength);
    const value = parseInt(valueStr) / 100; // always cents for price
    if (value > 0) return { type: 'price', productCode, value };
  }
  
  return null;
}

// ============ POS STATE ============
let posCart = []; window._posSelectedCartIdx = -1; // { product, quantity, discount, notes, serialNumbers }
let posHeldSales = []; // parked sales
let posSelectedCategory = 'all';
let posSearchQuery = '';
window._posCustomerId = null; // Currently selected customer for loyalty/balance
window._posCustomerData = null; // Full customer object for loyalty display

// ============ PRICE RESOLUTION (Customer Groups + Tier Pricing) ============
async function resolveProductPrice(productId, basePrice, qty) {
  let price = basePrice;

  // 1. Customer price list override
  if (window._posCustomerData?.price_list_id && window._posCustomerData.price_list_id > 1) {
    const plRes = await window.daftrly.query('SELECT price FROM price_list_items WHERE price_list_id=? AND product_id=?', [window._posCustomerData.price_list_id, productId]);
    if (plRes.success && plRes.data?.[0]?.price != null) {
      price = plRes.data[0].price;
    }
  }

  // 2. Tier pricing override (highest min_qty that is <= current qty)
  const tierRes = await window.daftrly.query('SELECT price FROM tier_pricing WHERE product_id=? AND min_qty<=? ORDER BY min_qty DESC LIMIT 1', [productId, qty]);
  if (tierRes.success && tierRes.data?.[0]?.price != null) {
    price = tierRes.data[0].price;
  }

  return price;
}

// ============ PACKAGE HELPERS ============
async function getCustomerActivePackages(customerId) {
  if (!customerId) return [];
  const res = await window.daftrly.query(
    `SELECT cp.*, p.name_ar, p.name_en, p.price FROM customer_packages cp
     JOIN packages p ON cp.package_id = p.id
     WHERE cp.customer_id=? AND cp.remaining_uses > 0 AND (cp.expires_at IS NULL OR date(cp.expires_at) >= date('now'))
     ORDER BY cp.purchased_at DESC`, [customerId]);
  return (res.success && res.data) ? res.data : [];
}

// ============ MAIN RENDER ============
async function renderPOS(container) {
  const lang = window.i18n.getLang();
  posSearchQuery = ''; // reset stale search on each render
  window.dbg('nav', 'Rendering POS screen');

  const settings = await window.daftrly.getSettings();
  const vatEnabled = settings.vat?.enabled;
  const vatRate = settings.vat?.rate || 15;
  const vatInclusive = settings.vat?.inclusive;
  const posLayout = settings.posLayout || 'grid';

  // Store VAT settings on window for cart calculations
  window._posVat = { enabled: vatEnabled, rate: vatRate, inclusive: vatInclusive };

  if (posLayout === 'list') {
    // ============ LIST MODE — Full-width cart, no product grid ============
    container.innerHTML = `
      <div class="pos-layout" style="display:flex;flex-direction:column;height:100%;gap:0;">
        <!-- Search bar -->
        <div style="display:flex;gap:8px;padding:12px 16px;background:var(--bg-secondary);border-bottom:1px solid var(--border);align-items:center;">
          <div style="position:relative;flex:1;">
            <div class="pos-search-icon">${window.icons.getIcon('search')}</div>
            <input type="text" id="pos-search" class="pos-search-input" 
              placeholder="${lang === 'ar' ? 'ابحث بالاسم أو الباركود أو الرقم...' : 'Search by name, barcode, or SKU...'}" autofocus>
            <div id="pos-search-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;z-index:999;background:var(--bg-primary);border:1px solid var(--border);border-radius:0 0 10px 10px;max-height:280px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,0.3);"></div>
          </div>
          ${posHeldSales.length > 0 ? `<button class="pos-held-badge" id="pos-recall-btn" title="${lang === 'ar' ? 'استرجاع' : 'Recall'}">${posHeldSales.length} ⏸</button>` : ''}
          <button class="btn btn-sm btn-secondary" id="pos-help-btn" title="${lang === 'ar' ? 'اختصارات' : 'Shortcuts'}" style="padding:4px 8px;font-size:14px;opacity:0.6;">?</button>
        </div>

        <!-- Customer bar -->
        <div style="display:flex;gap:6px;align-items:center;padding:6px 16px;background:var(--bg-secondary);" id="pos-customer-bar">
          <input type="text" id="pos-customer-phone" class="form-input" 
            placeholder="${lang === 'ar' ? '📱 رقم الجوال...' : '📱 Phone number...'}" 
            style="flex:1;padding:6px 10px;font-size:13px;">
          <button class="btn btn-sm btn-secondary" id="pos-customer-clear" style="display:none;padding:4px 8px;">✕</button>
        </div>
        <div id="pos-customer-info" style="display:none;background:var(--accent);color:#fff;padding:8px 16px;font-size:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <span id="pos-customer-name-display" style="font-weight:700;"></span>
            <span id="pos-customer-points-display">⭐ 0</span>
          </div>
        </div>

        <!-- Cart Header with Clear -->
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 16px;border-bottom:1px solid var(--border);">
          <span style="font-size:13px;font-weight:600;color:var(--text-secondary);">${lang === 'ar' ? 'السلة' : 'Cart'} <span id="pos-cart-count-header" style="color:var(--accent);">(${posCart.length})</span></span>
          <button class="pos-cart-clear" id="pos-clear-cart" style="${posCart.length > 0 ? '' : 'display:none;'}">🗑 ${lang === 'ar' ? 'مسح الكل' : 'Clear All'}</button>
        </div>

        <!-- Cart — full width -->
        <div class="pos-cart-items" id="pos-cart-items" style="flex:1;overflow-y:auto;padding:8px 16px;">
          <div class="pos-cart-empty" id="pos-cart-empty">
            <div style="font-size:48px;opacity:0.12;margin-bottom:12px;">📦</div>
            <div style="font-size:15px;">${lang === 'ar' ? 'امسح الباركود أو ابحث بالاسم' : 'Scan barcode or search by name'}</div>
            <div style="font-size:12px;margin-top:4px;color:var(--text-tertiary);">${lang === 'ar' ? 'اضغط ? لعرض اختصارات لوحة المفاتيح' : 'Press ? to see keyboard shortcuts'}</div>
          </div>
        </div>

        <!-- Totals -->
        <div class="pos-cart-totals" id="pos-cart-totals" style="padding:8px 16px;border-top:1px solid var(--border);"></div>

        <span class="pos-cart-count" id="pos-cart-count" style="display:none;">0</span>

        <!-- Actions + Payment -->
        <div style="padding:8px 16px;display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid var(--border);background:var(--bg-secondary);">
          ${window.hasPermission('pos_hold') ? `<button class="pos-action-btn pos-action-hold" id="pos-hold-btn" title="(F8)">⏸ ${lang === 'ar' ? 'تعليق' : 'Hold'}</button>` : ''}
          ${window.hasPermission('pos_discount') ? `<button class="pos-action-btn pos-action-discount" id="pos-discount-btn" title="(F9)">% ${lang === 'ar' ? 'خصم' : 'Discount'}</button>` : ''}
          <button class="pos-action-btn pos-action-note" id="pos-note-btn">📝 ${lang === 'ar' ? 'ملاحظة' : 'Note'}</button>
          <button class="pos-action-btn" id="pos-drawer-btn" style="background:var(--bg-tertiary);" title="">💰 ${lang === 'ar' ? 'الدرج' : 'Drawer'}</button>
          ${window.hasPermission('pos_refund') ? `
            <button class="pos-action-btn" id="pos-return-btn" style="background:var(--danger);color:#fff;">↩ ${lang === 'ar' ? 'مرتجع' : 'Return'}</button>
            ${window.appSettings?.returnAllowExchange !== false ? `<button class="pos-action-btn" id="pos-exchange-btn" style="background:var(--warning);color:#fff;">🔄 ${lang === 'ar' ? 'استبدال' : 'Exchange'}</button>` : ''}
          ` : ''}
          <div style="flex:1;"></div>
          <button class="pos-pay-btn pos-pay-cash" id="pos-pay-cash" title="(F5)" style="flex:0;min-width:120px;">💵 ${lang === 'ar' ? 'نقدي' : 'Cash'}</button>
          <button class="pos-pay-btn pos-pay-card" id="pos-pay-card" title="(F6)" style="flex:0;min-width:120px;">💳 ${lang === 'ar' ? 'بطاقة' : 'Card'}</button>
          ${window.hasPermission('pos_split') ? '<button class="pos-pay-btn pos-pay-split" id="pos-pay-split" title="(F7)" style="flex:0;min-width:120px;">🔀 ' + (lang === 'ar' ? 'تقسيم' : 'Split') + '</button>' : ''}
        </div>
      </div>

      <!-- Modal Overlay -->
      <div class="modal-overlay" id="pos-modal-overlay" style="display:none">
        <div class="modal" id="pos-modal-content"></div>
      </div>
    `;

  } else {
    // ============ GRID MODES — grid (default), cart-left, top-bottom ============
    const layoutClass = posLayout === 'cart-left' ? 'layout-cart-left' : posLayout === 'top-bottom' ? 'layout-top-bottom' : '';
    container.innerHTML = `
      <div class="pos-layout ${layoutClass}">
        <!-- Products Panel -->
        <div class="pos-products-panel">
          <!-- Search + Barcode -->
          <div class="pos-search-bar">
            <div class="pos-search-icon">${window.icons.getIcon('search')}</div>
            <input type="text" id="pos-search" class="pos-search-input" 
              placeholder="${lang === 'ar' ? 'ابحث أو امسح الباركود...' : 'Search or scan barcode...'}" autofocus>
            ${posHeldSales.length > 0 ? `<button class="pos-held-badge" id="pos-recall-btn" title="${lang === 'ar' ? 'استرجاع مبيعات معلقة' : 'Recall held sales'}">${posHeldSales.length} ⏸</button>` : ''}
            <button class="btn btn-sm btn-secondary" id="pos-help-btn" title="${lang === 'ar' ? 'اختصارات' : 'Shortcuts'}" style="padding:4px 8px;font-size:14px;opacity:0.6;">?</button>
          </div>

          <!-- Category Tabs -->
          <div class="pos-categories" id="pos-categories"></div>

          <!-- Product Grid -->
          <div class="pos-product-grid" id="pos-product-grid">
            <div class="products-loading">${lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}</div>
          </div>
        </div>

        <!-- RIGHT: Cart -->
        <div class="pos-cart-panel">
          <div class="pos-cart-header">
            <h3 class="pos-cart-title">${lang === 'ar' ? 'السلة' : 'Cart'}</h3>
            <span class="pos-cart-count" id="pos-cart-count">0</span>
            <button class="pos-cart-clear" id="pos-clear-cart" style="${posCart.length > 0 ? '' : 'display:none;'}">🗑 ${lang === 'ar' ? 'مسح الكل' : 'Clear All'}</button>
          </div>

          <!-- Cart Items -->
          <div class="pos-cart-items" id="pos-cart-items">
            <div class="pos-cart-empty" id="pos-cart-empty">
              <div style="font-size:40px;opacity:0.15;margin-bottom:8px;">🛒</div>
              <div>${lang === 'ar' ? 'السلة فارغة' : 'Cart is empty'}</div>
              <div style="font-size:11px;margin-top:4px;color:var(--text-tertiary);">${lang === 'ar' ? 'ابحث أو اضغط على منتج لإضافته' : 'Search or tap a product to add'}</div>
            </div>
          </div>

          <!-- Cart Totals -->
          <div class="pos-cart-totals" id="pos-cart-totals"></div>

          <!-- Customer Quick Lookup -->
          <div style="display:flex;gap:6px;align-items:center;margin-bottom:8px;" id="pos-customer-bar">
            <input type="text" id="pos-customer-phone" class="form-input" 
              placeholder="${lang === 'ar' ? '📱 رقم الجوال...' : '📱 Phone number...'}" 
              style="flex:1;padding:6px 10px;font-size:13px;">
            <button class="btn btn-sm btn-secondary" id="pos-customer-clear" style="display:none;padding:4px 8px;">✕</button>
          </div>
          <div id="pos-customer-info" style="display:none;background:var(--accent);color:#fff;padding:8px 12px;border-radius:8px;margin-bottom:8px;font-size:12px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <span id="pos-customer-name-display" style="font-weight:700;"></span>
              <span id="pos-customer-points-display">⭐ 0</span>
            </div>
          </div>

          <!-- Action Buttons Row 1 -->
          <div class="pos-cart-actions">
            ${window.hasPermission('pos_hold') ? `<button class="pos-action-btn pos-action-hold" id="pos-hold-btn" title="(F8)">
              ⏸ ${lang === 'ar' ? 'تعليق' : 'Hold'}
            </button>` : ''}
            ${window.hasPermission('pos_discount') ? `<button class="pos-action-btn pos-action-discount" id="pos-discount-btn" title="(F9)">
              % ${lang === 'ar' ? 'خصم' : 'Discount'}
            </button>` : ''}
            <button class="pos-action-btn pos-action-note" id="pos-note-btn">
              📝 ${lang === 'ar' ? 'ملاحظة' : 'Note'}
            </button>
            <button class="pos-action-btn" id="pos-drawer-btn" style="background:var(--bg-tertiary);" title="(F9)">
              💰 ${lang === 'ar' ? 'الدرج' : 'Drawer'}
            </button>
          </div>
          <!-- Action Buttons Row 2 (Return/Exchange — only if permitted) -->
          ${window.hasPermission('pos_refund') ? `
          <div class="pos-cart-actions" style="padding-top:0;">
            <button class="pos-action-btn" id="pos-return-btn" style="background:var(--danger);color:#fff;">
              ↩ ${lang === 'ar' ? 'مرتجع' : 'Return'}
            </button>
            ${window.appSettings?.returnAllowExchange !== false ? `<button class="pos-action-btn" id="pos-exchange-btn" style="background:var(--warning);color:#fff;">
              🔄 ${lang === 'ar' ? 'استبدال' : 'Exchange'}
            </button>` : ''}
          </div>` : ''}

          <!-- Payment Buttons -->
          <div class="pos-payment-actions">
            <button class="pos-pay-btn pos-pay-cash" id="pos-pay-cash" title="(F5)">
              💵 ${lang === 'ar' ? 'نقدي' : 'Cash'}
            </button>
            <button class="pos-pay-btn pos-pay-card" id="pos-pay-card" title="(F6)">
              💳 ${lang === 'ar' ? 'بطاقة' : 'Card'}
            </button>
            ${window.hasPermission('pos_split') ? `<button class="pos-pay-btn pos-pay-split" id="pos-pay-split" title="(F7)">
              🔀 ${lang === 'ar' ? 'تقسيم' : 'Split'}
            </button>` : ''}
          </div>
        </div>
      </div>

      <!-- Modal Overlay -->
      <div class="modal-overlay" id="pos-modal-overlay" style="display:none">
        <div class="modal" id="pos-modal-content"></div>
      </div>
    `;
  }

  // Bind events
  bindPOSEvents(container);

  // Load categories and products (all modes except list)
  if (posLayout !== 'list') {
    await loadPOSCategories(container);
    await loadPOSProducts(container);
  }

  // Render cart
  renderCart(container);
}

// ============ BIND EVENTS ============
function bindPOSEvents(container) {
  const lang = window.i18n.getLang();

  // Search with debounce + barcode scan
  let searchTimer;
  const searchInput = container.querySelector('#pos-search');
  const searchDropdown = container.querySelector('#pos-search-dropdown');

  if (searchInput) searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(async () => {
      posSearchQuery = e.target.value.trim();
      // For grid/cart-left/top-bottom — update the product grid
      loadPOSProducts(container);
      // For list mode — show dropdown
      if (searchDropdown && posSearchQuery.length >= 1) {
        const q = `%${posSearchQuery}%`;
        const res = await window.daftrly.query(
          `SELECT p.*, c.name_ar as cat_name FROM products p LEFT JOIN categories c ON p.category_id = c.id 
           WHERE p.is_active = 1 AND (p.name_ar LIKE ? OR p.name_en LIKE ? OR p.barcode LIKE ? OR p.sku LIKE ?)
           ORDER BY p.name_ar LIMIT 10`, [q, q, q, q]);
        const products = res.success ? (res.data || []) : [];
        if (products.length > 0) {
          const lang2 = window.i18n.getLang();
          searchDropdown.innerHTML = products.map(p => {
            const name = lang2 === 'ar' ? p.name_ar : (p.name_en || p.name_ar);
            const inCart = posCart.find(c => c.product.id === p.id);
            const stockInfo = p.track_stock ? (p.stock_quantity > 0 ? `📦 ${p.stock_quantity}` : '⚠️ 0') : '';
            return `<div class="pos-search-result" data-id="${p.id}" style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);transition:background 0.15s;${inCart ? 'background:rgba(37,99,235,0.08);' : ''}" 
              onmouseenter="this.style.background='var(--bg-secondary)'" onmouseleave="this.style.background='${inCart ? 'rgba(37,99,235,0.08)' : ''}'">
              <div style="flex:1;">
                <div style="font-weight:600;font-size:14px;">${window.escHtml(name)} ${inCart ? '<span style="color:var(--accent);font-size:11px;">● ' + (lang2 === 'ar' ? 'في السلة' : 'in cart') + '</span>' : ''}</div>
                <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;">${p.barcode || ''} ${p.cat_name ? '| ' + p.cat_name : ''} ${stockInfo ? '| ' + stockInfo : ''}</div>
              </div>
              <div style="font-weight:700;color:var(--accent);font-size:15px;min-width:80px;text-align:left;">${formatCurrency(p.price)}</div>
            </div>`;
          }).join('');
          searchDropdown.style.display = 'block';
          // Click handler
          searchDropdown.querySelectorAll('.pos-search-result').forEach(el => {
            el.addEventListener('click', async () => {
              const id = parseInt(el.dataset.id);
              const pRes = await window.daftrly.query('SELECT * FROM products WHERE id = ?', [id]);
              if (pRes.success && pRes.data?.[0]) {
                await addToCart(container, pRes.data[0]);
                searchInput.value = '';
                searchDropdown.style.display = 'none';
                searchInput.focus();
              }
            });
          });
        } else {
          searchDropdown.innerHTML = `<div style="padding:16px;text-align:center;color:var(--text-tertiary);font-size:13px;">${window.i18n.getLang() === 'ar' ? 'لا توجد نتائج' : 'No results'}</div>`;
          searchDropdown.style.display = 'block';
        }
      } else if (searchDropdown && posSearchQuery.length === 0) {
        searchDropdown.style.display = 'none';
      }
    }, 200);
  });

  // Close dropdown on blur
  if (searchInput && searchDropdown) {
    searchInput.addEventListener('blur', () => {
      setTimeout(() => { searchDropdown.style.display = 'none'; }, 200);
    });
    searchInput.addEventListener('focus', () => {
      if (posSearchQuery.length >= 1 && searchDropdown.innerHTML.trim()) searchDropdown.style.display = 'block';
    });
  }

  // Enter on search = add first result or barcode scan
  if (searchInput) searchInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = searchInput.value.trim();
      if (!query) return;

      // PLU barcode detection (EAN-13 with weight/price embedded)
      const pluResult = await parsePLUBarcode(query);
      if (pluResult) {
        const prodRes = await window.daftrly.query(
          'SELECT * FROM products WHERE (barcode = ? OR sku = ?) AND is_active = 1 LIMIT 1',
          [pluResult.productCode, pluResult.productCode]
        );
        if (prodRes.success && prodRes.data?.length) {
          const product = prodRes.data[0];
          if (pluResult.type === 'weight') {
            // Add with parsed weight — skip prompt
            const existing = posCart.find(c => c.product.id === product.id);
            if (existing) {
              existing.quantity = pluResult.value;
            } else {
              posCart.push({ product, quantity: pluResult.value, discount: 0, discountType: 'fixed', notes: '' });
            }
            renderCart(container);
            loadPOSProducts(container);
            window.dbg('ui', `PLU barcode: ${query} → ${product.name_ar} × ${pluResult.value} ${product.unit}`);
          } else {
            // Price embedded — calculate qty from price
            const qty = product.price > 0 ? pluResult.value / product.price : 1;
            const existing = posCart.find(c => c.product.id === product.id);
            if (existing) {
              existing.quantity = Math.round(qty * 1000) / 1000;
            } else {
              posCart.push({ product, quantity: Math.round(qty * 1000) / 1000, discount: 0, discountType: 'fixed', notes: '' });
            }
            renderCart(container);
            loadPOSProducts(container);
            window.dbg('ui', `PLU barcode (price): ${query} → ${product.name_ar} → ${pluResult.value} SAR`);
          }
          searchInput.value = '';
          posSearchQuery = '';
          showToast(`${product.name_ar} — ${pluResult.type === 'weight' ? pluResult.value + ' ' + (product.unit || 'kg') : pluResult.value.toFixed(2) + ' ' + window.getCurrSym()}`, 'success');
          return;
        }
      }

      // Standard exact barcode match — check variant barcodes first
      const varBarcodeRes = await window.daftrly.query(
        `SELECT pv.*, p.name_ar, p.name_en, p.price as base_price, p.unit, p.track_stock, p.tax_status, p.product_type, p.category_id, p.image
         FROM product_variants pv JOIN products p ON pv.product_id = p.id 
         WHERE pv.barcode = ? AND pv.is_active = 1 AND p.is_active = 1 LIMIT 1`, [query]);
      if (varBarcodeRes.success && varBarcodeRes.data?.length) {
        const v = varBarcodeRes.data[0];
        const lang = window.i18n.getLang();
        const varProduct = {
          id: v.product_id, name_ar: v.name_ar, name_en: v.name_en,
          price: v.base_price + (v.price_adjustment || 0),
          unit: v.unit, track_stock: v.track_stock, tax_status: v.tax_status,
          product_type: v.product_type, category_id: v.category_id, image: v.image,
          stock_quantity: v.stock_quantity,
          barcode: v.barcode,
          _variantId: v.id,
          _variantName: lang === 'ar' ? v.name_ar : (v.name_en || v.name_ar),
          _variantNameAr: v.name_ar,
          _variantNameEn: v.name_en || '',
        };
        addToCartDirect(container, varProduct);
        searchInput.value = '';
        posSearchQuery = '';
        loadPOSProducts(container);
        return;
      }

      const result = await window.daftrly.query(
        'SELECT * FROM products WHERE (barcode = ? OR sku = ?) AND is_active = 1 LIMIT 1',
        [query, query]
      );
      if (result.success && result.data && result.data.length > 0) {
        addToCart(container, result.data[0]);
        searchInput.value = '';
        posSearchQuery = '';
        loadPOSProducts(container);
        window.dbg('ui', `Barcode/SKU scan: ${query} → found ${result.data[0].name_ar}`);
      } else {
        window.dbg('warn', `Barcode/SKU scan: ${query} → not found`);
        showToast(window.i18n.getLang() === 'ar' ? 'المنتج غير موجود' : 'Product not found', 'warning');
      }
    }
  });

  // Clear cart
  const clearBtn = container.querySelector('#pos-clear-cart');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      if (posCart.length === 0) return;
      const ok = await window.daftrlyConfirm(lang === 'ar' ? 'مسح كل المنتجات من السلة؟' : 'Clear all items from cart?');
      if (ok) {
        posCart = []; window._posSelectedCartIdx = -1;
        window._posInvoiceDiscount = null;
        window._posInvoiceNote = '';
        window.dbg('ui', 'Cart cleared');
        renderCart(container);
        loadPOSProducts(container);
        // Hide clear button since cart is now empty
        const cb = container.querySelector('#pos-clear-cart');
        if (cb) cb.style.display = 'none';
      }
    });
  }

  // Customer quick phone lookup
  const phoneInput = container.querySelector('#pos-customer-phone');
  const custInfoBar = container.querySelector('#pos-customer-info');
  const custNameDisplay = container.querySelector('#pos-customer-name-display');
  const custPointsDisplay = container.querySelector('#pos-customer-points-display');
  const custClearBtn = container.querySelector('#pos-customer-clear');

  function showCustomerInfo(c) {
    window._posCustomerId = c.id;
    window._posCustomerData = c;
    const name = window.i18n.getLang() === 'ar' ? c.name_ar : (c.name_en || c.name_ar);
    custNameDisplay.textContent = `👤 ${name}`;
    const pts = Number(c.loyalty_points || 0);
    custPointsDisplay.textContent = `⭐ ${pts.toFixed(0)} ${lang === 'ar' ? 'نقطة' : 'pts'}`;
    custInfoBar.style.display = 'block';
    custClearBtn.style.display = 'block';
    phoneInput.value = c.phone || '';
    phoneInput.style.display = 'none';

    // Show packages only if enabled
    const packagesEnabled = window.appSettings?.packagesEnabled || false;
    if (packagesEnabled) {
      getCustomerActivePackages(c.id).then(async (pkgs) => {
        let pkgEl = custInfoBar.querySelector('#pos-cust-packages');
        if (!pkgEl) { pkgEl = document.createElement('span'); pkgEl.id = 'pos-cust-packages'; pkgEl.style.cssText = 'margin-inline-start:8px;display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap;'; custInfoBar.appendChild(pkgEl); }

        let html = '';

        // Active packages — use buttons
        if (pkgs.length > 0) {
          html += pkgs.map(p => `<span style="background:var(--gold);color:#1E293B;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;" class="pkg-use-btn" data-cpid="${p.id}" data-name="${p.name_ar || p.name_en}" data-rem="${p.remaining_uses}">📦 ${p.name_ar || p.name_en} (${p.remaining_uses})</span>`).join('');
        }

        // Sell package button
        const availRes = await window.daftrly.query('SELECT * FROM packages WHERE is_active=1 ORDER BY name_ar');
        const availPkgs = (availRes.success && availRes.data) ? availRes.data : [];
        if (availPkgs.length > 0) {
          html += `<span style="background:var(--accent);color:#fff;padding:2px 6px;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer;" id="pos-sell-pkg">🛒 ${lang === 'ar' ? 'بيع باقة' : 'Sell Package'}</span>`;
        }

        pkgEl.innerHTML = html;

        // Use package handlers
        pkgEl.querySelectorAll('.pkg-use-btn').forEach(btn => {
          btn.addEventListener('click', async () => {
            const confirmed = await window.daftrlyConfirm(lang === 'ar' ? `استخدام "${btn.dataset.name}"؟ متبقي: ${btn.dataset.rem}` : `Use "${btn.dataset.name}"? Remaining: ${btn.dataset.rem}`);
            if (!confirmed) return;
            await window.daftrly.query('UPDATE customer_packages SET remaining_uses = remaining_uses - 1 WHERE id = ? AND remaining_uses > 0', [btn.dataset.cpid]);
            showToast(lang === 'ar' ? '✅ تم الاستخدام' : '✅ Package used', 'success');
            showCustomerInfo(c);
          });
        });

        // Sell package — add to cart
        pkgEl.querySelector('#pos-sell-pkg')?.addEventListener('click', async () => {
          const sellOverlay = document.createElement('div');
          sellOverlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;';
          const sellModal = document.createElement('div');
          sellModal.style.cssText = 'background:var(--bg-primary);border-radius:12px;padding:20px;width:90%;max-width:400px;';
          sellModal.innerHTML = `
            <h3 style="margin:0 0 12px;">${lang === 'ar' ? 'بيع باقة لـ' : 'Sell Package to'} ${c.name_ar || c.name_en}</h3>
            <div style="display:flex;flex-direction:column;gap:8px;">
              ${availPkgs.map(p => `<button class="btn btn-secondary pkg-sell-choice" data-pkg-id="${p.id}" data-pkg-name="${p.name_ar || p.name_en}" data-pkg-uses="${p.total_uses}" data-pkg-price="${p.price}" data-pkg-days="${p.expiry_days || 0}" style="text-align:start;padding:12px;">
                <div style="font-weight:700;">📦 ${p.name_ar || p.name_en}</div>
                <div style="font-size:12px;color:var(--text-tertiary);">${p.total_uses} ${lang === 'ar' ? 'استخدام' : 'uses'} — ${formatCurrency(p.price)}${p.expiry_days > 0 ? ` — ${p.expiry_days} ${lang === 'ar' ? 'يوم' : 'days'}` : ''}</div>
              </button>`).join('')}
            </div>
            <button class="btn btn-secondary" id="pkg-sell-cancel" style="margin-top:12px;width:100%;">${lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
          `;
          sellOverlay.appendChild(sellModal);
          document.body.appendChild(sellOverlay);

          sellModal.querySelector('#pkg-sell-cancel').addEventListener('click', () => sellOverlay.remove());
          sellOverlay.addEventListener('click', (e) => { if (e.target === sellOverlay) sellOverlay.remove(); });

          sellModal.querySelectorAll('.pkg-sell-choice').forEach(btn => {
            btn.addEventListener('click', () => {
              const pkgId = parseInt(btn.dataset.pkgId);
              const pkgName = btn.dataset.pkgName;
              const pkgUses = parseInt(btn.dataset.pkgUses);
              const pkgPrice = parseFloat(btn.dataset.pkgPrice);
              const pkgDays = parseInt(btn.dataset.pkgDays) || 0;

              // Add package as a cart item (service product)
              const pkgProduct = {
                id: -pkgId, // negative ID to identify as package
                name_ar: '📦 ' + pkgName,
                name_en: '📦 ' + pkgName,
                price: pkgPrice,
                _basePrice: pkgPrice,
                cost: 0,
                tax_status: 'standard',
                product_type: 'service',
                track_stock: 0,
                unit: 'piece',
                _isPackage: true,
                _packageId: pkgId,
                _packageUses: pkgUses,
                _packageDays: pkgDays,
              };

              // Remove existing package of same type from cart
              const existIdx = posCart.findIndex(ci => ci.product._packageId === pkgId);
              if (existIdx >= 0) posCart.splice(existIdx, 1);

              posCart.push({ product: pkgProduct, quantity: 1, discount: 0, discountType: 'fixed', notes: '' });
              sellOverlay.remove();
              renderCart(container);
              showToast(lang === 'ar' ? `📦 ${pkgName} أضيفت للسلة — أكمل الدفع` : `📦 ${pkgName} added to cart — complete payment`, 'success');
            });
          });
        });
      });
    } else {
      // Remove package UI if disabled
      const pkgEl = custInfoBar.querySelector('#pos-cust-packages');
      if (pkgEl) pkgEl.innerHTML = '';
    }

    // Recalculate all cart item prices for this customer's price list
    recalcCartPrices(container);
  }

  function clearCustomer() {
    window._posCustomerId = null;
    window._posCustomerData = null;
    custInfoBar.style.display = 'none';
    custClearBtn.style.display = 'none';
    phoneInput.value = '';
    phoneInput.style.display = '';
    phoneInput.focus();
    // Revert cart prices to base
    recalcCartPrices(container);
  }

  async function recalcCartPrices(ctr) {
    if (posCart.length === 0) return;
    for (const item of posCart) {
      if (!item.product._basePrice) item.product._basePrice = item.product.price;
      item.product.price = await resolveProductPrice(item.product.id, item.product._basePrice, item.quantity);
    }
    renderCart(ctr);
  }

  custClearBtn.addEventListener('click', clearCustomer);

  // Type phone + Enter = instant lookup
  phoneInput.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const phone = phoneInput.value.trim();
      if (!phone) return;
      
      const r = await window.daftrly.query(
        'SELECT id, name_ar, name_en, phone, loyalty_points, credit_balance, price_list_id FROM customers WHERE is_active = 1 AND phone = ? LIMIT 1',
        [phone]);
      
      if (r.success && r.data && r.data.length > 0) {
        showCustomerInfo(r.data[0]);
        showToast(lang === 'ar' ? `✅ مرحباً ${r.data[0].name_ar}` : `✅ Welcome ${r.data[0].name_en || r.data[0].name_ar}`, 'success');
      } else {
        // Try partial match
        const r2 = await window.daftrly.query(
          'SELECT id, name_ar, name_en, phone, loyalty_points, credit_balance, price_list_id FROM customers WHERE is_active = 1 AND phone LIKE ? LIMIT 1',
          [`%${phone}%`]);
        if (r2.success && r2.data && r2.data.length > 0) {
          showCustomerInfo(r2.data[0]);
          showToast(lang === 'ar' ? `✅ مرحباً ${r2.data[0].name_ar}` : `✅ Welcome ${r2.data[0].name_en || r2.data[0].name_ar}`, 'success');
        } else {
          showToast(lang === 'ar' ? '❌ لم يتم العثور على العميل' : '❌ Customer not found', 'warning');
        }
      }
    }
  });

  // Hold sale
  const holdBtn = container.querySelector('#pos-hold-btn');
  if (holdBtn) holdBtn.addEventListener('click', () => {
    if (posCart.length === 0) {
      showToast(lang === 'ar' ? 'السلة فارغة' : 'Cart is empty', 'warning');
      return;
    }
    posHeldSales.push({ items: [...posCart], time: new Date().toLocaleTimeString(), note: '' });
    window.dbg('save', `Sale held. Total held: ${posHeldSales.length}`);
    showToast(lang === 'ar' ? 'تم تعليق البيع' : 'Sale held', 'success');
    posCart = []; window._posSelectedCartIdx = -1;
    renderPOS(container);
  });

  // Recall held sale
  const recallBtn = container.querySelector('#pos-recall-btn');
  if (recallBtn) {
    recallBtn.addEventListener('click', () => openRecallModal(container));
  }

  // Invoice discount
  const discountBtn = container.querySelector('#pos-discount-btn');
  if (discountBtn) discountBtn.addEventListener('click', () => {
    if (posCart.length === 0) { showToast(lang === 'ar' ? 'السلة فارغة' : 'Cart is empty', 'warning'); return; }
    openInvoiceDiscountModal(container);
  });

  // Invoice note
  const noteBtn = container.querySelector('#pos-note-btn');
  if (noteBtn) noteBtn.addEventListener('click', () => {
    openNoteModal(container);
  });

  // Open cash drawer
  const drawerBtn = container.querySelector('#pos-drawer-btn');
  if (drawerBtn) drawerBtn.addEventListener('click', async () => {
    const s = await window.daftrly.getSettings();
    const pr = s.printer || {};
    if (pr.type !== 'network' || !pr.ip) {
      showToast(lang === 'ar' ? '⚠️ اضبط طابعة الشبكة أولاً في الإعدادات' : '⚠️ Configure network printer in Settings first', 'warning');
      return;
    }
    const result = await window.daftrly.printerSend(pr.ip, pr.port || 9100, 'drawer');
    if (result.success) {
      showToast(lang === 'ar' ? '✅ تم فتح الدرج' : '✅ Drawer opened', 'success');
      // Log drawer open as no_sale
      await window.daftrly.query(
        "INSERT INTO cash_movements (session_id, type, amount, reason, created_at) VALUES ((SELECT id FROM cash_sessions WHERE status='open' ORDER BY id DESC LIMIT 1), 'drawer_open', 0, 'no_sale', datetime('now'))");
    } else {
      showToast(lang === 'ar' ? '❌ فشل فتح الدرج' : '❌ Failed to open drawer', 'error');
    }
  });

  // Return button
  const returnBtn = container.querySelector('#pos-return-btn');
  if (returnBtn) returnBtn.addEventListener('click', () => {
    openReturnModal(container);
  });

  // Exchange button
  const exchangeBtn = container.querySelector('#pos-exchange-btn');
  if (exchangeBtn) exchangeBtn.addEventListener('click', () => {
    openExchangeModal(container);
  });

  // Payment buttons
  const cashBtn = container.querySelector('#pos-pay-cash');
  if (cashBtn) cashBtn.addEventListener('click', () => {
    if (!window.hasPermission('pos_sell')) { showToast(lang === 'ar' ? '⛔ ليس لديك صلاحية للبيع' : '⛔ No sell permission', 'error'); return; }
    if (posCart.length === 0) { showToast(lang === 'ar' ? 'السلة فارغة' : 'Cart is empty', 'warning'); return; }
    openPaymentModal(container, 'cash');
  });
  const cardBtn = container.querySelector('#pos-pay-card');
  if (cardBtn) cardBtn.addEventListener('click', () => {
    if (!window.hasPermission('pos_sell')) { showToast(lang === 'ar' ? '⛔ ليس لديك صلاحية للبيع' : '⛔ No sell permission', 'error'); return; }
    if (posCart.length === 0) { showToast(lang === 'ar' ? 'السلة فارغة' : 'Cart is empty', 'warning'); return; }
    openPaymentModal(container, 'card');
  });
  const splitBtn = container.querySelector('#pos-pay-split');
  if (splitBtn) splitBtn.addEventListener('click', () => {
    if (!window.hasPermission('pos_sell')) { showToast(lang === 'ar' ? '⛔ ليس لديك صلاحية للبيع' : '⛔ No sell permission', 'error'); return; }
    if (!window.hasPermission('pos_split')) { showToast(lang === 'ar' ? '⛔ ليس لديك صلاحية للدفع المقسم' : '⛔ No split payment permission', 'error'); return; }
    if (posCart.length === 0) { showToast(lang === 'ar' ? 'السلة فارغة' : 'Cart is empty', 'warning'); return; }
    openPaymentModal(container, 'split');
  });

  // Help button — opens shortcut overlay
  const helpBtn = container.querySelector('#pos-help-btn');
  if (helpBtn) helpBtn.addEventListener('click', () => showShortcutOverlay());

  // POS keyboard shortcuts - remove any previous handler first
  if (window._posKeyHandler) {
    document.removeEventListener('keydown', window._posKeyHandler);
  }
  window._posSelectedCartIdx = -1; // no selection initially

  window._posKeyHandler = (e) => {
    // Only when POS is active
    if (document.querySelector('.pos-layout') === null) {
      document.removeEventListener('keydown', window._posKeyHandler);
      window._posKeyHandler = null;
      return;
    }
    
    const activeEl = document.activeElement;
    const tag = activeEl?.tagName;
    const isSearchBar = activeEl?.id === 'pos-search';
    const isInInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    
    // Cart navigation keys — work even when search bar is focused (but empty)
    const isCartKey = ['ArrowUp','ArrowDown','+','=','-','_','Delete'].includes(e.key);
    const searchEmpty = isSearchBar && !(activeEl.value || '').trim();
    
    if (isInInput && !isSearchBar) {
      // Non-search input — only allow Escape
      if (e.key === 'Escape') {
        e.preventDefault();
        activeEl.blur();
        const modal = document.querySelector('#pos-modal-overlay');
        if (modal && modal.style.display === 'flex') { modal.style.display = 'none'; }
      }
      return;
    }
    
    if (isSearchBar && !searchEmpty && !['Escape','F5','F6','F7','F8','F9'].includes(e.key)) {
      // Search bar has text — let user type, only allow F-keys and Escape
      return;
    }
    
    // F-key shortcuts
    if (e.key === 'F5') { e.preventDefault(); document.querySelector('#pos-pay-cash')?.click(); }
    if (e.key === 'F6') { e.preventDefault(); document.querySelector('#pos-pay-card')?.click(); }
    if (e.key === 'F7') { e.preventDefault(); document.querySelector('#pos-pay-split')?.click(); }
    if (e.key === 'F8') { e.preventDefault(); document.querySelector('#pos-hold-btn')?.click(); }
    if (e.key === 'F9') { e.preventDefault(); document.querySelector('#pos-discount-btn')?.click(); }

    // Cart keyboard navigation
    if (posCart.length > 0 && isCartKey) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        window._posSelectedCartIdx = Math.min(window._posSelectedCartIdx + 1, posCart.length - 1);
        highlightCartItem(container);
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        window._posSelectedCartIdx = Math.max(window._posSelectedCartIdx - 1, 0);
        highlightCartItem(container);
      }
      if (window._posSelectedCartIdx >= 0 && window._posSelectedCartIdx < posCart.length) {
        const selItem = posCart[window._posSelectedCartIdx];
        if (selItem) {
          const isWeighed = ['kg','gram','meter','sqm','liter'].includes(selItem.product.unit);
          if (e.key === '+' || e.key === '=') {
            e.preventDefault();
            if (!isWeighed) { selItem.quantity++; renderCart(container); loadPOSProducts(container); }
          }
          if (e.key === '-' || e.key === '_') {
            e.preventDefault();
            if (!isWeighed) {
              const newQ = selItem.quantity - 1;
              if (newQ <= 0) { posCart.splice(window._posSelectedCartIdx, 1); renderCart(container); loadPOSProducts(container); }
              else { selItem.quantity = newQ; renderCart(container); loadPOSProducts(container); }
            }
          }
          if (e.key === 'Delete') {
            e.preventDefault();
            posCart.splice(window._posSelectedCartIdx, 1);
            if (window._posSelectedCartIdx >= posCart.length) window._posSelectedCartIdx = posCart.length - 1;
            renderCart(container); loadPOSProducts(container);
            highlightCartItem(container);
          }
        }
      }
    }

    if (e.key === 'Escape') {
      const modal = document.querySelector('#pos-modal-overlay');
      if (modal && modal.style.display === 'flex') { modal.style.display = 'none'; }
      else if (window._posSelectedCartIdx >= 0) {
        // Deselect cart item first
        window._posSelectedCartIdx = -1;
        highlightCartItem(container);
      } else {
        document.querySelector('#pos-search')?.focus();
      }
    }
  };
  document.addEventListener('keydown', window._posKeyHandler);
}

// Highlight selected cart item
function highlightCartItem(container) {
  const items = container.querySelectorAll('.pos-cart-item');
  items.forEach((el, i) => {
    if (i === window._posSelectedCartIdx) {
      el.style.outline = '2px solid var(--accent)';
      el.style.outlineOffset = '-2px';
      el.style.borderRadius = '8px';
      el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } else {
      el.style.outline = '';
      el.style.outlineOffset = '';
    }
  });
}

// ============ LOAD CATEGORIES ============
async function loadPOSCategories(container) {
  const lang = window.i18n.getLang();
  const result = await window.daftrly.query('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order, name_ar');
  const categories = (result.success && result.data) ? result.data : [];

  const el = container.querySelector('#pos-categories');
  if (!el) return;

  el.innerHTML = `
    <button class="pos-cat-btn ${posSelectedCategory === null ? 'active' : ''}" data-cat="all">
      ${lang === 'ar' ? '★ المفضلة' : '★ Favorites'}
    </button>
    <button class="pos-cat-btn ${posSelectedCategory === 'all' ? 'active' : ''}" data-cat="show-all">
      ${lang === 'ar' ? 'الكل' : 'All'}
    </button>
    ${categories.map(c => `
      <button class="pos-cat-btn ${posSelectedCategory === c.id ? 'active' : ''}" 
        data-cat="${c.id}" style="--cat-color:${c.color || '#2563EB'}">
        <span class="pos-cat-dot" style="background:${c.color || '#2563EB'}"></span>
        ${lang === 'ar' ? c.name_ar : (c.name_en || c.name_ar)}
      </button>
    `).join('')}
  `;

  el.querySelectorAll('.pos-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const v = btn.dataset.cat;
      if (v === 'all') posSelectedCategory = null; // favorites
      else if (v === 'show-all') posSelectedCategory = 'all';
      else posSelectedCategory = parseInt(v);
      el.querySelectorAll('.pos-cat-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      loadPOSProducts(container);
    });
  });
}

// ============ LOAD PRODUCTS ============
async function loadPOSProducts(container) {
  const lang = window.i18n.getLang();
  let sql = `SELECT p.*, c.color as cat_color FROM products p 
             LEFT JOIN categories c ON p.category_id = c.id WHERE p.is_active = 1`;
  const params = [];

  if (posSelectedCategory === null) {
    // Favorites
    sql += ' AND p.is_favorite = 1';
  } else if (posSelectedCategory !== 'all') {
    sql += ' AND p.category_id = ?';
    params.push(posSelectedCategory);
  }

  if (posSearchQuery) {
    sql += ' AND (p.name_ar LIKE ? OR p.name_en LIKE ? OR p.barcode LIKE ? OR p.sku LIKE ?)';
    const q = `%${posSearchQuery}%`;
    params.push(q, q, q, q);
  }

  sql += ' ORDER BY p.is_favorite DESC, p.name_ar LIMIT 60';

  const result = await window.daftrly.query(sql, params);
  const products = (result.success && result.data) ? result.data : [];

  const grid = container.querySelector('#pos-product-grid');
  if (!grid) return;

  if (products.length === 0) {
    grid.innerHTML = `
      <div class="pos-grid-empty">
        ${posSearchQuery 
          ? (lang === 'ar' ? 'لا توجد نتائج' : 'No results')
          : posSelectedCategory === null 
            ? (lang === 'ar' ? 'لا توجد منتجات مفضلة بعد. أضف منتجات للمفضلة من صفحة المنتجات.' : 'No favorite products yet. Add favorites from Products page.')
            : (lang === 'ar' ? 'لا توجد منتجات في هذا التصنيف' : 'No products in this category')}
      </div>
    `;
    return;
  }

  grid.innerHTML = products.map(p => {
    const name = lang === 'ar' ? p.name_ar : (p.name_en || p.name_ar);
    const inCart = posCart.find(c => c.product.id === p.id);
    const outOfStock = p.track_stock && p.stock_quantity <= 0;

    return `
      <button class="pos-product-btn ${inCart ? 'in-cart' : ''} ${outOfStock ? 'out-of-stock' : ''}" 
        data-id="${p.id}" 
        style="border-inline-start: 3px solid ${p.cat_color || 'var(--border-primary)'}">
        <div class="pos-product-name">${escapeHtml(name)}</div>
        <div class="pos-product-price">${formatCurrency(p.price)}</div>
        ${inCart ? `<div class="pos-product-qty-badge">${inCart.quantity}</div>` : ''}
        ${outOfStock ? `<div class="pos-product-oos">${lang === 'ar' ? 'نفذ' : 'OOS'}</div>` : ''}
      </button>
    `;
  }).join('');

  // Bind product clicks
  grid.querySelectorAll('.pos-product-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id);
      const p = products.find(pr => pr.id === id);
      if (p) addToCart(container, p);
    });
  });
}

// ============ CART MANAGEMENT ============
const DECIMAL_UNITS = ['kg', 'gram', 'meter', 'sqm', 'liter', 'hour'];

async function addToCart(container, product) {
  // Check if product has active variants — show picker if yes
  const varRes = await window.daftrly.query('SELECT * FROM product_variants WHERE product_id = ? AND is_active = 1 ORDER BY id', [product.id]);
  const variants = varRes.success ? (varRes.data || []) : [];

  if (variants.length > 0) {
    // Show variant picker
    const lang = window.i18n.getLang();
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `<div style="background:var(--bg-primary);border-radius:12px;padding:20px;max-width:400px;width:90%;max-height:60vh;overflow-y:auto;">
      <div style="font-weight:700;font-size:15px;margin-bottom:12px;">${lang === 'ar' ? 'اختر المتغير' : 'Select Variant'}</div>
      <div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px;">${lang === 'ar' ? product.name_ar : (product.name_en || product.name_ar)}</div>
      ${variants.map(v => {
        const varPrice = product.price + (v.price_adjustment || 0);
        const varName = lang === 'ar' ? v.name_ar : (v.name_en || v.name_ar);
        const stockInfo = product.track_stock ? ` — ${lang === 'ar' ? 'مخزون' : 'Stock'}: ${v.stock_quantity}` : '';
        return `<div class="var-pick" data-vid="${v.id}" style="padding:12px;border:1px solid var(--border-primary);border-radius:8px;margin-bottom:6px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;transition:all 0.15s;">
          <div>
            <div style="font-weight:600;">${escapeHtml(varName)}</div>
            <div style="font-size:11px;color:var(--text-tertiary);">${v.barcode || ''}${stockInfo}</div>
          </div>
          <div style="font-weight:700;color:var(--accent);">${formatCurrency(varPrice)}${v.price_adjustment > 0 ? ` <span style="font-size:10px;color:var(--success);">+${v.price_adjustment}</span>` : v.price_adjustment < 0 ? ` <span style="font-size:10px;color:var(--danger);">${v.price_adjustment}</span>` : ''}</div>
        </div>`;
      }).join('')}
      <button class="btn btn-secondary btn-sm" style="width:100%;margin-top:8px;" id="var-cancel">${lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
    </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#var-cancel').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelectorAll('.var-pick').forEach(el => {
      el.addEventListener('mouseenter', () => { el.style.borderColor = 'var(--accent)'; el.style.background = 'var(--bg-secondary)'; });
      el.addEventListener('mouseleave', () => { el.style.borderColor = 'var(--border-primary)'; el.style.background = ''; });
      el.addEventListener('click', () => {
        const vid = parseInt(el.dataset.vid);
        const variant = variants.find(vv => vv.id === vid);
        if (!variant) return;
        overlay.remove();

        // Create a modified product with variant info
        const variantProduct = {
          ...product,
          _variantId: variant.id,
          _variantName: lang === 'ar' ? variant.name_ar : (variant.name_en || variant.name_ar),
          _variantNameAr: variant.name_ar,
          _variantNameEn: variant.name_en || '',
          price: product.price + (variant.price_adjustment || 0),
          stock_quantity: variant.stock_quantity || product.stock_quantity,
          barcode: variant.barcode || product.barcode,
        };
        addToCartDirect(container, variantProduct);
      });
    });
    return;
  }

  // No variants — add directly
  await addToCartDirect(container, product);
}

async function addToCartDirect(container, product) {
  const isDecimalUnit = DECIMAL_UNITS.includes(product.unit);
  const varId = product._variantId || null;
  const existing = posCart.find(c => c.product.id === product.id && (c.product._variantId || null) === varId);

  // Store base price for tier recalculation
  if (!product._basePrice) product._basePrice = product.price;

  if (isDecimalUnit) {
    const lang = window.i18n.getLang();
    const unitNames = { kg: lang==='ar'?'كجم':'kg', gram: lang==='ar'?'جم':'g', meter: lang==='ar'?'م':'m', sqm: lang==='ar'?'م²':'sqm', liter: lang==='ar'?'لتر':'L', hour: lang==='ar'?'ساعة':'hr' };
    const unitName = unitNames[product.unit] || product.unit;
    
    const val = await window.daftrlyPrompt(
      lang === 'ar' ? `أدخل الكمية (${unitName})` : `Enter quantity (${unitName})`,
      lang === 'ar' ? 'الكمية' : 'Quantity',
      existing ? '' : '1'
    );
    if (!val) return;
    const qty = parseFloat(val);
    if (!qty || qty <= 0) return;
    
    // Resolve price for this quantity
    product.price = await resolveProductPrice(product.id, product._basePrice, qty);

    if (existing) {
      existing.quantity = qty;
      existing.product.price = product.price;
    } else {
      if (product.track_stock && product.stock_quantity <= 0) {
        showToast(lang === 'ar' ? '⚠️ المنتج نفد — المخزون سيصبح سالب' : '⚠️ Out of stock — inventory will go negative', 'warning');
      }
      posCart.push({ product: {...product}, quantity: qty, discount: 0, discountType: 'fixed', notes: '' });
    }
    renderCart(container);
    loadPOSProducts(container);
    setTimeout(() => { container.querySelector('#pos-search')?.focus(); }, 50);
    return;
  }

  // For piece/box/pack/carton/service — integer quantity
  const newQty = existing ? existing.quantity + 1 : 1;
  // Resolve price for this quantity (price list + tier)
  product.price = await resolveProductPrice(product.id, product._basePrice, newQty);

  if (existing) {
    if (product.track_stock && existing.quantity >= product.stock_quantity) {
      showToast(window.i18n.getLang() === 'ar' ? '⚠️ المخزون سيصبح سالب' : '⚠️ Stock will go negative', 'warning');
    }
    existing.quantity = newQty;
    existing.product.price = product.price;
  } else {
    if (product.track_stock && product.stock_quantity <= 0) {
      showToast(window.i18n.getLang() === 'ar' ? '⚠️ المنتج نفد — المخزون سيصبح سالب' : '⚠️ Out of stock — inventory will go negative', 'warning');
    }
    posCart.push({ product: {...product}, quantity: 1, discount: 0, discountType: 'fixed', notes: '' });
  }
  window.dbg('ui', `Added to cart: ${product.name_ar} (qty: ${(existing ? existing.quantity : 1)})`);
  renderCart(container);
  loadPOSProducts(container);

  // Auto-apply promotions (Buy X Get Y)
  if (window.appSettings?.promotionsEnabled !== false) {
    applyAutoPromotions(container);
  }

  setTimeout(() => { container.querySelector('#pos-search')?.focus(); }, 50);
}

// Check and apply active Buy X Get Y promotions
async function applyAutoPromotions(container) {
  const lang = window.i18n.getLang();
  const now = new Date().toISOString().split('T')[0];
  const res = await window.daftrly.query(
    `SELECT * FROM promotions WHERE promo_type IN ('buy_x_get_y','auto_discount') AND auto_apply=1 AND is_active=1
     AND (start_date IS NULL OR start_date <= ?) AND (end_date IS NULL OR end_date >= ?)`, [now, now]);
  if (!res.success || !res.data?.length) return;

  for (const promo of res.data) {
    if (promo.promo_type === 'buy_x_get_y') {
      // Check if buy product is in cart with enough quantity
      const buyItem = posCart.find(c => c.product.id === promo.buy_product_id && c.quantity >= promo.buy_quantity);
      if (!buyItem) continue;
      // Check if free product already added by this promo (tagged)
      const alreadyApplied = posCart.find(c => c._promoId === promo.id);
      if (alreadyApplied) continue;
      // Add free/discounted product
      const getRes = await window.daftrly.query('SELECT * FROM products WHERE id=? AND is_active=1', [promo.get_product_id]);
      if (!getRes.success || !getRes.data?.length) continue;
      const freeProduct = getRes.data[0];
      const discountPct = promo.get_discount || 100;
      const discountAmt = freeProduct.price * (discountPct / 100);
      posCart.push({
        product: freeProduct,
        quantity: promo.get_quantity || 1,
        discount: discountAmt,
        discountType: 'fixed',
        notes: `🎁 ${promo.name_ar}`,
        _promoId: promo.id,
      });
      showToast(`🎁 ${promo.name_ar}`, 'success');
      renderCart(container);
    } else if (promo.promo_type === 'auto_discount' && promo.product_id) {
      // Auto discount on specific product
      const cartItem = posCart.find(c => c.product.id === promo.product_id && !c._promoId);
      if (!cartItem) continue;
      if (cartItem._autoDiscountApplied) continue;
      const discVal = promo.type === 'percentage' ? cartItem.product.price * (promo.value / 100) : promo.value;
      cartItem.discount = discVal;
      cartItem.discountType = 'fixed';
      cartItem._autoDiscountApplied = promo.id;
      cartItem.notes = (cartItem.notes ? cartItem.notes + ' | ' : '') + `💰 ${promo.name_ar}`;
      showToast(`💰 ${promo.name_ar}`, 'success');
      renderCart(container);
    }
  }
}

// Cart qty/remove operations now use index-based approach in renderCart event handlers

// ============ CART CALCULATIONS ============
function calculateCart() {
  const vat = window._posVat || { enabled: true, rate: 15, inclusive: false };
  let subtotal = 0;
  let totalDiscount = 0;
  let totalTax = 0;

  posCart.forEach(item => {
    const lineTotal = item.product.price * item.quantity;
    const discount = item.discountType === 'percent'
      ? lineTotal * (item.discount / 100)
      : item.discount * item.quantity;
    const afterDiscount = lineTotal - discount;

    let tax = 0;
    if (vat.enabled && (item.product.tax_status || 'standard') === 'standard') {
      if (vat.inclusive) {
        tax = afterDiscount - (afterDiscount / (1 + vat.rate / 100));
      } else {
        tax = afterDiscount * (vat.rate / 100);
      }
    }

    subtotal += lineTotal;
    totalDiscount += discount;
    totalTax += tax;
  });

  // Invoice-level discount (stored on window temporarily)
  const invDiscount = window._posInvoiceDiscount || { amount: 0, type: 'fixed' };
  let invoiceDiscountAmount = 0;
  if (invDiscount.type === 'percent') {
    invoiceDiscountAmount = (subtotal - totalDiscount) * (invDiscount.amount / 100);
  } else {
    invoiceDiscountAmount = invDiscount.amount;
  }

  // Recalculate tax to account for invoice-level discount
  // Tax should be on the FINAL amount after ALL discounts
  if (invoiceDiscountAmount > 0 && totalTax > 0) {
    const afterAllDiscounts = subtotal - totalDiscount - invoiceDiscountAmount;
    if (vat.inclusive) {
      // For inclusive: tax is embedded in the final amount
      totalTax = afterAllDiscounts - (afterAllDiscounts / (1 + vat.rate / 100));
    } else {
      // For exclusive: tax is on the net after all discounts
      totalTax = afterAllDiscounts * (vat.rate / 100);
    }
  }

  const total = subtotal - totalDiscount - invoiceDiscountAmount + (window._posVat?.inclusive ? 0 : totalTax);

  return {
    subtotal: Math.max(0, subtotal),
    itemDiscount: Math.max(0, totalDiscount),
    invoiceDiscount: Math.max(0, invoiceDiscountAmount),
    tax: Math.max(0, totalTax),
    total: Math.max(0, total),
    itemCount: posCart.reduce((s, c) => s + c.quantity, 0),
  };
}

// ============ RENDER CART ============
function renderCart(container) {
  const lang = window.i18n.getLang();
  const cartItems = container.querySelector('#pos-cart-items');
  const cartTotals = container.querySelector('#pos-cart-totals');
  const cartCount = container.querySelector('#pos-cart-count');
  const emptyEl = container.querySelector('#pos-cart-empty');

  if (!cartItems || !cartTotals) return;

  const totals = calculateCart();
  if (cartCount) cartCount.textContent = totals.itemCount;

  // Update cart header count and clear button visibility
  const headerCount = container.querySelector('#pos-cart-count-header');
  if (headerCount) headerCount.textContent = `(${posCart.length})`;
  const clearBtn = container.querySelector('#pos-clear-cart');
  if (clearBtn) clearBtn.style.display = posCart.length > 0 ? '' : 'none';

  if (posCart.length === 0) {
    cartItems.innerHTML = `
      <div class="pos-cart-empty">
        <div style="font-size:40px;opacity:0.15;margin-bottom:8px;">🛒</div>
        <div>${lang === 'ar' ? 'السلة فارغة' : 'Cart is empty'}</div>
      </div>
    `;
    cartTotals.innerHTML = '';
    return;
  }

  // Cart items
  cartItems.innerHTML = posCart.map((item, idx) => {
    const name = lang === 'ar' ? item.product.name_ar : (item.product.name_en || item.product.name_ar);
    const variantLabel = item.product._variantName ? ` (${escapeHtml(item.product._variantName)})` : '';
    const lineTotal = item.product.price * item.quantity;
    const discountAmt = item.discountType === 'percent' ? lineTotal * (item.discount / 100) : item.discount * item.quantity;

    const isWeighed = DECIMAL_UNITS.includes(item.product.unit);
    const unitLabel = { kg: lang==='ar'?'كجم':'kg', gram: lang==='ar'?'جم':'g', meter: lang==='ar'?'م':'m', sqm: lang==='ar'?'م²':'m²', liter: lang==='ar'?'لتر':'L', piece: '', box: '', pack: '', carton: '', hour: lang==='ar'?'ساعة':'hr', service: '' }[item.product.unit] || '';

    return `
      <div class="pos-cart-item" data-idx="${idx}">
        <div class="pos-cart-item-top">
          <span class="pos-cart-item-name">${escapeHtml(name)}${variantLabel}${item.product.product_type === 'service' ? ' 🔧' : ''}</span>
          <span class="pos-cart-item-total">${formatCurrency(lineTotal - discountAmt)}</span>
        </div>
        <div class="pos-cart-item-bottom">
          ${isWeighed ? `
            <div class="pos-cart-item-qty">
              <input type="text" inputmode="decimal" class="pos-weight-input" data-idx="${idx}" value="${item.quantity}" style="width:70px;padding:4px 6px;font-size:13px;text-align:center;border:1px solid var(--border);border-radius:6px;">
              <span style="font-size:11px;color:var(--text-secondary);margin-${lang==='ar'?'right':'left'}:4px;">${unitLabel}</span>
            </div>
          ` : `
            <div class="pos-cart-item-qty">
              <button class="pos-qty-btn" data-action="minus" data-idx="${idx}">−</button>
              <span class="pos-qty-val">${item.quantity}</span>
              <button class="pos-qty-btn" data-action="plus" data-idx="${idx}">+</button>
            </div>
          `}
          <span class="pos-cart-item-price">${formatCurrency(item.product.price)} × ${item.quantity}${unitLabel ? ' ' + unitLabel : ''}</span>
          <button class="pos-cart-item-remove" data-idx="${idx}">✕</button>
        </div>
        ${discountAmt > 0 ? `<div class="pos-cart-item-discount">-${formatCurrency(discountAmt)} ${lang === 'ar' ? 'خصم' : 'disc.'}</div>` : ''}
        ${item.notes ? `<div class="pos-cart-item-note">📝 ${escapeHtml(item.notes)}</div>` : ''}
        ${item.serialNumbers ? `<div class="pos-cart-item-note" style="font-size:10px;">🔢 ${item.serialNumbers.join(', ')}</div>` : ''}
      </div>
    `;
  }).join('');

  // Bind qty buttons
  cartItems.querySelectorAll('.pos-qty-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx);
      const item = posCart[idx];
      if (!item) return;
      const newQty = btn.dataset.action === 'plus' ? item.quantity + 1 : item.quantity - 1;
      if (newQty <= 0) { posCart.splice(idx, 1); renderCart(container); loadPOSProducts(container); return; }
      item.quantity = newQty;
      // Resolve tier/price list price
      const resolvedPrice = await resolveProductPrice(item.product.id, item.product._basePrice || item.product.price, newQty);
      if (!item.product._basePrice) item.product._basePrice = item.product.price;
      item.product.price = resolvedPrice;
      renderCart(container);
      loadPOSProducts(container);
    });
  });

  // Bind weight inputs (for kg/gram/meter/sqm products)
  cartItems.querySelectorAll('.pos-weight-input').forEach(input => {
    input.addEventListener('change', async () => {
      const idx = parseInt(input.dataset.idx);
      const val = parseFloat(input.value) || 0;
      if (val > 0 && posCart[idx]) {
        posCart[idx].quantity = val;
        const item = posCart[idx];
        const resolvedPrice = await resolveProductPrice(item.product.id, item.product._basePrice || item.product.price, val);
        if (!item.product._basePrice) item.product._basePrice = item.product.price;
        item.product.price = resolvedPrice;
        renderCart(container);
        loadPOSProducts(container);
      }
    });
  });

  // Bind remove
  cartItems.querySelectorAll('.pos-cart-item-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      posCart.splice(idx, 1);
      renderCart(container);
      loadPOSProducts(container);
    });
  });

  // Totals
  const vat = window._posVat || {};
  const invDisc = window._posInvoiceDiscount || { amount: 0 };

  cartTotals.innerHTML = `
    <div class="pos-total-row">
      <span>${lang === 'ar' ? 'المجموع الفرعي' : 'Subtotal'}</span>
      <span>${formatCurrency(totals.subtotal)}</span>
    </div>
    ${totals.itemDiscount > 0 ? `
    <div class="pos-total-row pos-total-discount">
      <span>${lang === 'ar' ? 'خصم على الأصناف' : 'Item discounts'}</span>
      <span>-${formatCurrency(totals.itemDiscount)}</span>
    </div>` : ''}
    ${totals.invoiceDiscount > 0 ? `
    <div class="pos-total-row pos-total-discount">
      <span>${lang === 'ar' ? 'خصم على الفاتورة' : 'Invoice discount'}</span>
      <span>-${formatCurrency(totals.invoiceDiscount)}</span>
    </div>` : ''}
    ${vat.enabled ? `
    <div class="pos-total-row">
      <span>${lang === 'ar' ? 'الضريبة' : 'VAT'} (${vat.rate}%)</span>
      <span>${formatCurrency(totals.tax)}</span>
    </div>` : ''}
    <div class="pos-total-row pos-total-grand">
      <span>${lang === 'ar' ? 'الإجمالي' : 'Total'}</span>
      <span>${formatCurrency(totals.total)}</span>
    </div>
  `;

  // Restore cart keyboard selection highlight
  if (typeof window._posSelectedCartIdx === 'number' && window._posSelectedCartIdx >= 0) {
    highlightCartItem(container);
  }

  // Update customer display (if enabled)
  if (window.appSettings?.customerDisplay) {
    const dispItems = posCart.map(item => {
      const name = lang === 'ar' ? item.product.name_ar : (item.product.name_en || item.product.name_ar);
      const varLabel = item.product._variantName ? ` (${item.product._variantName})` : '';
      return { name: name + varLabel + (item.quantity > 1 ? ` ×${item.quantity}` : ''), price: formatCurrency(item.product.price * item.quantity) };
    });
    window.daftrly.updateDisplay({ type: 'cart', items: dispItems, total: formatCurrency(totals.total) }).catch(() => {});
  }
}

// ============ PAYMENT MODAL ============
async function openPaymentModal(container, method) {
  const lang = window.i18n.getLang();
  const totals = calculateCart();
  const settings = await window.daftrly.getSettings();
  const overlay = container.querySelector('#pos-modal-overlay');
  const modal = container.querySelector('#pos-modal-content');
  window.dbg('ui', `Payment modal: ${method}, total: ${totals.total}`);

  // Check for active cash session (for cash payments)
  if (method === 'cash') {
    const sessionCheck = await window.daftrly.query("SELECT id FROM cash_sessions WHERE status = 'open' LIMIT 1");
    const cashSessionRequired = settings.cashSessionRequired;
    if (cashSessionRequired && (!sessionCheck.success || !sessionCheck.data?.length)) {
      showToast(lang === 'ar' ? 'يجب فتح وردية أولاً من قائمة النظام' : 'Must open a cash session first from System menu', 'error');
      return;
    }
  }

  // Check serial number requirements before proceeding
  const serialItems = posCart.filter(c => c.product.serial_required);
  for (const item of serialItems) {
    if (!item.serialNumbers || item.serialNumbers.length < item.quantity) {
      const serials = [];
      for (let i = 0; i < item.quantity; i++) {
        const sn = await window.daftrlyPrompt(
          lang === 'ar' 
            ? `الرقم التسلسلي ${i+1}/${item.quantity} لـ ${item.product.name_ar}` 
            : `Serial number ${i+1}/${item.quantity} for ${item.product.name_ar}`,
          lang === 'ar' ? 'IMEI / رقم تسلسلي' : 'IMEI / Serial'
        );
        if (!sn) {
          showToast(lang === 'ar' ? 'الرقم التسلسلي مطلوب' : 'Serial number is required', 'error');
          return;
        }
        serials.push(sn);
      }
      item.serialNumbers = serials;
    }
  }

  // Calculate loyalty discount if customer selected
  const loyaltySettings = settings.loyalty || {};
  const loyaltyEnabled = loyaltySettings.enabled;
  const loyaltyPointValue = Number(loyaltySettings.pointValue) || 0.01;

  // Check customer loyalty points for redemption display
  const custData = window._posCustomerData || null;
  const custPoints = custData ? Number(custData.loyalty_points || 0) : 0;
  const canRedeem = loyaltyEnabled && custData && custPoints >= (Number(loyaltySettings.minRedeem) || 100);
  const pointsValue = custPoints * loyaltyPointValue;

  // Exchange credit (from exchange flow)
  const exchangeCredit = window._exchangeCredit || 0;

  // Customer store credit (from credit notes)
  const custCreditBalance = custData ? Number(custData.credit_balance || 0) : 0;

  // Discount state — must be declared before modal HTML template uses effectiveTotal
  let appliedCoupon = null;
  let couponDiscount = 0;
  let loyaltyDiscount = 0;
  let giftCardDiscount = 0;
  let appliedGiftCard = null;
  let customerCreditUsed = 0;
  let effectiveTotal = totals.total;

  function recalcEffectiveTotal() {
    effectiveTotal = totals.total - couponDiscount - loyaltyDiscount - exchangeCredit - giftCardDiscount - customerCreditUsed;
    if (effectiveTotal < 0) effectiveTotal = 0;
  }

  // Apply exchange credit if exists
  if (exchangeCredit > 0) {
    recalcEffectiveTotal();
  }

  modal.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">${method === 'cash' ? (lang === 'ar' ? '💵 دفع نقدي' : '💵 Cash Payment') : method === 'card' ? (lang === 'ar' ? '💳 دفع بالبطاقة' : '💳 Card Payment') : (lang === 'ar' ? '🔀 دفع مقسم' : '🔀 Split Payment')}</h3>
      <button class="modal-close" id="pay-close">✕</button>
    </div>
    <div class="modal-body" style="text-align:center;padding:24px;">
      <div class="pay-total-display" id="pay-total-display">${formatCurrency(exchangeCredit > 0 ? Math.max(0, totals.total - exchangeCredit) : totals.total)}</div>
      <div style="color:var(--text-secondary);margin-bottom:16px;">${lang === 'ar' ? 'المبلغ المطلوب' : 'Amount due'}</div>

      ${exchangeCredit > 0 ? `
        <div style="background:var(--warning);color:#000;padding:10px 16px;border-radius:10px;margin-bottom:12px;max-width:320px;margin-left:auto;margin-right:auto;font-size:13px;">
          🔄 ${lang === 'ar' ? 'رصيد استبدال:' : 'Exchange credit:'} <strong>-${formatCurrency(exchangeCredit)}</strong>
        </div>
      ` : ''}

      <!-- Customer Store Credit -->
      ${custCreditBalance > 0 ? `
        <div style="background:linear-gradient(135deg,#2563EB,#1d4ed8);color:#fff;padding:12px 16px;border-radius:10px;margin-bottom:12px;max-width:320px;margin-left:auto;margin-right:auto;">
          <div style="font-size:13px;margin-bottom:6px;">
            💳 ${custData.name_ar} — ${lang === 'ar' ? 'رصيد دائن:' : 'Store credit:'} <strong>${formatCurrency(custCreditBalance)}</strong>
          </div>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;">
            <input type="checkbox" id="pay-use-credit" style="width:18px;height:18px;">
            <span>${lang === 'ar' ? 'استخدام الرصيد الدائن؟' : 'Use store credit?'}</span>
          </label>
        </div>
      ` : ''}

      <!-- Loyalty Points Redemption -->
      ${canRedeem ? `
        <div style="background:linear-gradient(135deg,#D4A853,#B8941F);color:#fff;padding:12px 16px;border-radius:10px;margin-bottom:12px;max-width:320px;margin-left:auto;margin-right:auto;">
          <div style="font-size:13px;margin-bottom:6px;">
            ⭐ ${custData.name_ar} — ${custPoints.toFixed(0)} ${lang === 'ar' ? 'نقطة' : 'points'} = <strong>${pointsValue.toFixed(2)} ${window.getCurrSym()}</strong>
          </div>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;">
            <input type="checkbox" id="pay-use-points" style="width:18px;height:18px;">
            <span>${lang === 'ar' ? 'استخدام النقاط؟' : 'Use points?'}</span>
          </label>
        </div>
      ` : (loyaltyEnabled && custData ? `
        <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:8px;">
          ⭐ ${custPoints.toFixed(0)} ${lang === 'ar' ? 'نقطة (لا يكفي للاستبدال)' : 'points (not enough to redeem)'}
        </div>
      ` : '')}

      <!-- Coupon Code -->
      ${settings.couponsEnabled !== false ? `
      <div style="display:flex;gap:6px;max-width:320px;margin:0 auto 12px;">
        <input type="text" id="pay-coupon" class="form-input" placeholder="${lang === 'ar' ? 'كود خصم (اختياري)' : 'Coupon code (optional)'}" style="flex:1;font-size:13px;padding:6px 10px;">
        <button class="btn btn-secondary btn-sm" id="pay-apply-coupon">${lang === 'ar' ? 'تطبيق' : 'Apply'}</button>
      </div>
      <div id="pay-coupon-msg" style="font-size:12px;margin-bottom:8px;"></div>
      ` : ''}

      <!-- Gift Card -->
      ${settings.giftCardsEnabled !== false && window.hasPermission('pos_giftcard') ? `
      <div style="display:flex;gap:6px;max-width:320px;margin:0 auto 12px;">
        <input type="text" id="pay-giftcard" class="form-input" placeholder="${lang === 'ar' ? 'رمز بطاقة هدية (اختياري)' : 'Gift card code (optional)'}" style="flex:1;font-size:13px;padding:6px 10px;">
        <button class="btn btn-secondary btn-sm" id="pay-apply-giftcard">🎁 ${lang === 'ar' ? 'تطبيق' : 'Apply'}</button>
      </div>
      <div id="pay-giftcard-msg" style="font-size:12px;margin-bottom:8px;"></div>
      ` : ''}

      ${method === 'cash' ? `
        <div class="form-group" style="max-width:280px;margin:0 auto 12px;">
          <label class="form-label">${lang === 'ar' ? 'المبلغ المستلم' : 'Amount received'}</label>
          <input type="text" inputmode="decimal" id="pay-received" class="form-input pay-input" value="${totals.total}" autofocus>
        </div>
        <div class="pay-change" id="pay-change">
          ${lang === 'ar' ? 'الباقي:' : 'Change:'} <strong>${formatCurrency(0)}</strong>
        </div>
        <div class="pay-quick-amounts">
          ${[10, 20, 50, 100, 200, 500].map(a => `<button class="pay-quick-btn" data-amount="${a}">${a}</button>`).join('')}
        </div>

        <!-- Partial Payment Option -->
        <div style="margin-top:12px;text-align:${lang === 'ar' ? 'right' : 'left'};">
          ${window.hasPermission('pos_partial') ? `<label style="font-size:12px;cursor:pointer;color:var(--text-secondary);">
            <input type="checkbox" id="pay-partial"> ${lang === 'ar' ? 'دفع جزئي (حساب آجل)' : 'Partial payment (on account)'}
          </label>` : ''}
        </div>
      ` : method === 'split' ? `
        <div style="max-width:320px;margin:0 auto;">
          <div class="form-group" style="margin-bottom:12px;">
            <label class="form-label" style="text-align:${lang === 'ar' ? 'right' : 'left'};">💵 ${lang === 'ar' ? 'المبلغ النقدي' : 'Cash Amount'}</label>
            <input type="text" inputmode="decimal" id="pay-split-cash" class="form-input pay-input" value="0" autofocus style="font-size:20px;height:48px;">
          </div>
          <div class="form-group" style="margin-bottom:12px;">
            <label class="form-label" style="text-align:${lang === 'ar' ? 'right' : 'left'};">💳 ${lang === 'ar' ? 'المبلغ بالبطاقة' : 'Card Amount'}</label>
            <input type="text" inputmode="decimal" id="pay-split-card" class="form-input" value="${effectiveTotal.toFixed(2)}" readonly 
              style="font-size:20px;height:48px;text-align:center;font-weight:700;background:var(--bg-secondary);color:var(--text-secondary);">
          </div>
          <div id="pay-split-error" style="color:var(--danger);font-size:12px;min-height:18px;text-align:center;"></div>
        </div>
      ` : `
        <div style="color:var(--text-secondary);font-size:14px;margin-bottom:16px;">
          ${lang === 'ar' ? 'سيتم إرسال المبلغ لجهاز الدفع' : 'Amount will be sent to payment terminal'}
        </div>
      `}
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="pay-cancel">${lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
      <button class="btn btn-primary btn-lg" id="pay-confirm" style="min-width:180px;">
        ${lang === 'ar' ? 'تأكيد الدفع' : 'Confirm Payment'} (Enter)
      </button>
    </div>
  `;

  overlay.style.display = 'flex';

  // Loyalty points redemption handler
  const usePointsCheck = modal.querySelector('#pay-use-points');
  if (usePointsCheck) {
    usePointsCheck.addEventListener('change', () => {
      if (usePointsCheck.checked) {
        loyaltyDiscount = Math.min(pointsValue, totals.total - couponDiscount);
        if (loyaltyDiscount < 0) loyaltyDiscount = 0;
      } else {
        loyaltyDiscount = 0;
      }
      recalcEffectiveTotal();
      updateTotalDisplay();
    });
  }

  // Customer store credit handler
  const useCreditCheck = modal.querySelector('#pay-use-credit');
  if (useCreditCheck) {
    useCreditCheck.addEventListener('change', () => {
      if (useCreditCheck.checked) {
        customerCreditUsed = Math.min(custCreditBalance, totals.total - couponDiscount - loyaltyDiscount);
        if (customerCreditUsed < 0) customerCreditUsed = 0;
      } else {
        customerCreditUsed = 0;
      }
      recalcEffectiveTotal();
      updateTotalDisplay();
    });
  }

  // Apply coupon
  const couponApplyBtn = modal.querySelector('#pay-apply-coupon');
  if (couponApplyBtn) couponApplyBtn.addEventListener('click', async () => {
    const code = modal.querySelector('#pay-coupon')?.value?.trim();
    const msgEl = modal.querySelector('#pay-coupon-msg');
    if (!code) { msgEl.textContent = ''; appliedCoupon = null; couponDiscount = 0; recalcEffectiveTotal(); updateTotalDisplay(); return; }
    
    const promoRes = await window.daftrly.query(
      "SELECT * FROM promotions WHERE (name_en = ? OR name_ar = ?) AND is_active = 1 AND (start_date IS NULL OR start_date <= date('now')) AND (end_date IS NULL OR end_date >= date('now')) LIMIT 1",
      [code, code]);
    
    if (!promoRes.success || !promoRes.data?.length) {
      msgEl.innerHTML = `<span style="color:var(--danger);">${lang === 'ar' ? '❌ كود غير صالح' : '❌ Invalid code'}</span>`;
      appliedCoupon = null; couponDiscount = 0; recalcEffectiveTotal(); updateTotalDisplay();
      return;
    }

    const promo = promoRes.data[0];
    if (promo.min_purchase > 0 && totals.total < promo.min_purchase) {
      msgEl.innerHTML = `<span style="color:var(--warning);">${lang === 'ar' ? `الحد الأدنى ${promo.min_purchase} ${window.getCurrSym()}` : `Minimum ${promo.min_purchase} ${window.getCurrSym()}`}</span>`;
      return;
    }

    appliedCoupon = promo;
    couponDiscount = promo.type === 'percent' ? totals.total * (promo.value / 100) : promo.value;
    couponDiscount = Math.min(couponDiscount, totals.total);
    recalcEffectiveTotal();
    
    msgEl.innerHTML = `<span style="color:var(--success);">✅ ${lang === 'ar' ? 'خصم' : 'Discount'}: -${couponDiscount.toFixed(2)} ${window.getCurrSym()}</span>`;
    updateTotalDisplay();
  });

  // Gift card apply
  const gcApplyBtn = modal.querySelector('#pay-apply-giftcard');
  if (gcApplyBtn) gcApplyBtn.addEventListener('click', async () => {
    const code = modal.querySelector('#pay-giftcard')?.value?.trim();
    const gcMsg = modal.querySelector('#pay-giftcard-msg');
    if (!code) return;
    const gcRes = await window.daftrly.query('SELECT * FROM gift_cards WHERE code = ? AND status = ?', [code, 'active']);
    if (!gcRes.success || !gcRes.data?.length) {
      gcMsg.innerHTML = `<span style="color:var(--danger);">${lang === 'ar' ? '❌ بطاقة غير موجودة أو معطلة' : '❌ Card not found or inactive'}</span>`;
      return;
    }
    const gc = gcRes.data[0];
    if (gc.expiry_date && new Date(gc.expiry_date) < new Date()) {
      gcMsg.innerHTML = `<span style="color:var(--danger);">${lang === 'ar' ? '❌ البطاقة منتهية الصلاحية' : '❌ Card expired'}</span>`;
      return;
    }
    if (gc.balance <= 0) {
      gcMsg.innerHTML = `<span style="color:var(--danger);">${lang === 'ar' ? '❌ لا يوجد رصيد' : '❌ No balance'}</span>`;
      return;
    }
    appliedGiftCard = gc;
    giftCardDiscount = Math.min(gc.balance, effectiveTotal);
    recalcEffectiveTotal();
    gcMsg.innerHTML = `<span style="color:var(--success);">🎁 ${lang === 'ar' ? 'رصيد البطاقة' : 'Card balance'}: ${formatCurrency(gc.balance)} → ${lang === 'ar' ? 'خصم' : 'Applied'}: -${formatCurrency(giftCardDiscount)}</span>`;
    updateTotalDisplay();
  });

  let updateChange = () => {}; // will be overridden for cash method

  function updateTotalDisplay() {
    modal.querySelector('#pay-total-display').textContent = formatCurrency(effectiveTotal);
    const receivedInput = modal.querySelector('#pay-received');
    if (receivedInput && !modal.querySelector('#pay-partial')?.checked) {
      receivedInput.value = effectiveTotal.toFixed(2);
    }
    if (method === 'cash') updateChange();
  }

  // Enter to confirm
  const confirmHandler = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); modal.querySelector('#pay-confirm')?.click(); }
  };
  document.addEventListener('keydown', confirmHandler);

  const closeModal = () => { 
    overlay.style.display = 'none'; 
    document.removeEventListener('keydown', confirmHandler);
  };
  modal.querySelector('#pay-close').addEventListener('click', closeModal);
  modal.querySelector('#pay-cancel').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

  // Cash change calculation
  if (method === 'cash') {
    const receivedInput = modal.querySelector('#pay-received');
    const changeDisplay = modal.querySelector('#pay-change');
    const partialCheck = modal.querySelector('#pay-partial');

    updateChange = () => {
      const received = parseFloat(receivedInput.value) || 0;
      const isPartial = partialCheck?.checked;
      const change = isPartial ? 0 : Math.max(0, received - effectiveTotal);
      const isShort = !isPartial && received < effectiveTotal;
      changeDisplay.innerHTML = isPartial
        ? `${lang === 'ar' ? 'الرصيد المتبقي:' : 'Balance due:'} <strong style="color:var(--warning);">${formatCurrency(Math.max(0, effectiveTotal - received))}</strong>`
        : `${lang === 'ar' ? 'الباقي:' : 'Change:'} <strong style="color:${isShort ? 'var(--danger)' : 'var(--success)'}">${formatCurrency(change)}</strong>`;
    };

    receivedInput.addEventListener('input', updateChange);
    receivedInput.addEventListener('focus', () => receivedInput.select());
    if (partialCheck) partialCheck.addEventListener('change', updateChange);

    modal.querySelectorAll('.pay-quick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        receivedInput.value = btn.dataset.amount;
        updateChange();
      });
    });

    updateChange();
    setTimeout(() => { receivedInput.focus(); receivedInput.select(); }, 100);
  }

  // Split payment calculation
  if (method === 'split') {
    const splitCashInput = modal.querySelector('#pay-split-cash');
    const splitCardInput = modal.querySelector('#pay-split-card');
    const splitError = modal.querySelector('#pay-split-error');

    function updateSplitCard() {
      const cashAmt = parseFloat(splitCashInput.value) || 0;
      const cardAmt = Math.max(0, effectiveTotal - cashAmt);
      splitCardInput.value = cardAmt.toFixed(2);
      if (cashAmt > effectiveTotal) {
        splitError.textContent = lang === 'ar' ? 'المبلغ النقدي أكبر من الإجمالي' : 'Cash amount exceeds total';
      } else if (cashAmt < 0) {
        splitError.textContent = lang === 'ar' ? 'المبلغ غير صحيح' : 'Invalid amount';
      } else {
        splitError.textContent = '';
      }
    }

    splitCashInput.addEventListener('input', updateSplitCard);
    splitCashInput.addEventListener('focus', () => splitCashInput.select());
    updateSplitCard();
    setTimeout(() => { splitCashInput.focus(); splitCashInput.select(); }, 100);
  }

  // Also update split card when coupons/loyalty change the total
  const origUpdateTotalDisplay = updateTotalDisplay;
  function updateTotalDisplayEnhanced() {
    origUpdateTotalDisplay();
    if (method === 'split') {
      const splitCashInput = modal.querySelector('#pay-split-cash');
      const splitCardInput = modal.querySelector('#pay-split-card');
      if (splitCashInput && splitCardInput) {
        const cashAmt = parseFloat(splitCashInput.value) || 0;
        splitCardInput.value = Math.max(0, effectiveTotal - cashAmt).toFixed(2);
      }
    }
  }

  // Confirm payment
  modal.querySelector('#pay-confirm').addEventListener('click', async () => {
    document.removeEventListener('keydown', confirmHandler);
   try {
    const isPartial = method === 'cash' && modal.querySelector('#pay-partial')?.checked;
    let received = method === 'cash' ? (parseFloat(modal.querySelector('#pay-received')?.value) || 0) : effectiveTotal;
    let splitCashAmt = 0;
    let splitCardAmt = 0;

    if (method === 'split') {
      splitCashAmt = parseFloat(modal.querySelector('#pay-split-cash')?.value) || 0;
      splitCardAmt = Math.max(0, effectiveTotal - splitCashAmt);
      if (splitCashAmt > effectiveTotal || splitCashAmt < 0) {
        showToast(lang === 'ar' ? 'المبلغ النقدي غير صحيح' : 'Invalid cash amount', 'error');
        return;
      }
      received = effectiveTotal; // Full amount covered by split
    }

    // Partial payment requires a customer to track the balance
    if (isPartial && !window._posCustomerId) {
      showToast(lang === 'ar' ? 'يجب اختيار عميل للدفع الجزئي' : 'Customer required for partial payment', 'error');
      return;
    }

    if (method === 'cash' && !isPartial && received < effectiveTotal) {
      showToast(lang === 'ar' ? 'المبلغ المستلم أقل من الإجمالي' : 'Received amount is less than total', 'error');
      return;
    }

    const change = method === 'cash' && !isPartial ? Math.max(0, received - effectiveTotal) : 0;
    const balanceDue = isPartial ? Math.max(0, effectiveTotal - received) : 0;
    const paymentStatus = isPartial ? 'partial' : 'paid';

    window.dbg('save', 'Processing sale...', { method, total: totals.total, received, change });

    // If card payment and terminal is enabled — send to physical terminal first
    if (method === 'card' || (method === 'split' && splitCardAmt > 0)) {
      const termSettings = window.appSettings?.posTerminal || {};
      if (termSettings.enabled) {
        const termUrl = termSettings.url || 'http://localhost:5000';
        const termAmount = method === 'split' ? splitCardAmt : effectiveTotal;
        showToast(lang === 'ar' ? '💳 جاري إرسال المبلغ لجهاز الدفع...' : '💳 Sending to payment terminal...', 'info');
        const termResult = await window.daftrly.sendTerminalPayment(termUrl, termAmount, '', termSettings.timeout);
        if (!termResult.success) {
          // Terminal failed — ask merchant if they want to proceed manually
          const proceed = await window.daftrlyConfirm(
            lang === 'ar' 
              ? `⚠️ لم يتم الاتصال بجهاز الدفع\n\n${termResult.error || 'رفض'}\n\nهل تريد المتابعة وتسجيل البيع يدوياً؟`
              : `⚠️ Payment terminal not reachable\n\n${termResult.error || 'Declined'}\n\nProceed and record sale manually?`
          );
          if (!proceed) return;
          // Proceed without terminal reference
          window._terminalRef = '';
          window._terminalApproval = '';
        } else {
          // Store terminal reference for the sale record
          window._terminalRef = termResult.referenceNumber || '';
          window._terminalApproval = termResult.approvalCode || '';
          showToast(lang === 'ar' ? '✅ تمت الموافقة على الدفع' : '✅ Payment approved', 'success');
        }
      }
    }

    // Generate invoice number using configured format blocks
    const invNum = await window.daftrly.nextSequence('invoice');
    const saleSettings = await window.daftrly.getSettings();
    const fmt = saleSettings.invoiceFormat || {};
    const prefix = fmt.prefix || 'INV';
    const sep = fmt.separator || '-';
    const digits = fmt.sequenceDigits || 5;
    const blocks = fmt.blocks || ['prefix', 'year', 'sequence'];
    const branchCode = fmt.branchCode || '01';
    const now = new Date();
    const invoiceNumber = blocks.map(b => {
      switch (b) {
        case 'prefix': return prefix;
        case 'year': return now.getFullYear();
        case 'month': return String(now.getMonth() + 1).padStart(2, '0');
        case 'day': return String(now.getDate()).padStart(2, '0');
        case 'branch': return branchCode;
        case 'sequence': return String(invNum).padStart(digits, '0');
        default: return '';
      }
    }).filter(Boolean).join(sep);

    // Calculate commission — use cashier's own rate, fallback to global
    const userCommRate = Number(window._currentUser?.commission_rate) || 0;
    const globalCommRate = Number(settings.commissionRate) || 0;
    const commissionRate = userCommRate > 0 ? userCommRate : globalCommRate;
    const commission = commissionRate > 0 ? effectiveTotal * (commissionRate / 100) : 0;

    // Recheck stock availability at payment time (warn if will go negative)
    for (const item of posCart) {
      if (item.product.track_stock) {
        const stockRes = await window.daftrly.query('SELECT stock_quantity FROM products WHERE id = ?', [item.product.id]);
        const currentStock = stockRes.success && stockRes.data?.[0] ? stockRes.data[0].stock_quantity : 0;
        if (item.quantity > currentStock) {
          const pName = lang === 'ar' ? item.product.name_ar : (item.product.name_en || item.product.name_ar);
          showToast(lang === 'ar' ? `⚠️ ${pName}: المخزون ${currentStock} — سيصبح سالب` : `⚠️ ${pName}: stock ${currentStock} — will go negative`, 'warning');
        }
      }
    }

    // Insert sale
    const saleResult = await window.daftrly.query(
      `INSERT INTO sales (invoice_number, subtotal, discount_amount, discount_type, tax_amount, total, 
       paid_amount, change_amount, payment_status, status, notes, cashier_id, 
       coupon_code, coupon_discount, exchange_credit, balance_due, cashier_commission, payment_method, customer_id) 
       VALUES (?, ?, ?, 'fixed', ?, ?, ?, ?, ?, 'completed', ?, 1, ?, ?, ?, ?, ?, ?, ?)`,
      [invoiceNumber, totals.subtotal, totals.itemDiscount + totals.invoiceDiscount + couponDiscount + loyaltyDiscount,
       totals.tax, exchangeCredit > 0 ? totals.total : effectiveTotal, received, change, paymentStatus, window._posInvoiceNote || '',
       appliedCoupon?.name_en || appliedCoupon?.name_ar || '', couponDiscount, exchangeCredit, balanceDue, commission, method,
       window._posCustomerId || null]
    );

    if (!saleResult.success) {
      window.dbg('error', 'Sale insert failed', saleResult.error);
      showToast(lang === 'ar' ? 'خطأ في حفظ البيع' : 'Error saving sale', 'error');
      return;
    }

    // Get sale ID
    const saleId = saleResult.data.lastInsertId || 0;

    // Insert sale items
    const vat = window._posVat || {};
    for (const item of posCart) {
      const lineTotal = item.product.price * item.quantity;
      const discount = item.discountType === 'percent' ? lineTotal * (item.discount / 100) : item.discount * item.quantity;
      const afterDiscount = lineTotal - discount;
      let taxRate = 0, taxAmount = 0;
      if (vat.enabled && (item.product.tax_status || 'standard') === 'standard') {
        taxRate = vat.rate;
        taxAmount = vat.inclusive ? afterDiscount - (afterDiscount / (1 + vat.rate / 100)) : afterDiscount * (vat.rate / 100);
      }

      const itemNameAr = item.product._variantNameAr ? item.product.name_ar + ' (' + item.product._variantNameAr + ')' : item.product.name_ar;
      const itemNameEn = item.product._variantNameEn ? (item.product.name_en || '') + ' (' + item.product._variantNameEn + ')' : (item.product.name_en || '');

      await window.daftrly.query(
        `INSERT INTO sale_items (sale_id, product_id, name_ar, name_en, quantity, unit_price, 
         discount_amount, tax_rate, tax_amount, total, notes, serial_numbers)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [saleId, item.product.id, itemNameAr, itemNameEn,
         item.quantity, item.product.price, discount, taxRate, taxAmount,
         afterDiscount + (vat.inclusive ? 0 : taxAmount), item.notes || '',
         item.serialNumbers ? JSON.stringify(item.serialNumbers) : null]
      );

      // Update stock — variant stock or product stock
      if (item.product._variantId) {
        // Deduct from variant stock
        await window.daftrly.query(
          'UPDATE product_variants SET stock_quantity = stock_quantity - ? WHERE id = ?',
          [item.quantity, item.product._variantId]
        );
      } else if (item.product.track_stock) {
        await window.daftrly.query(
          'UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?',
          [item.quantity, item.product.id]
        );
      }
      // Bundle: deduct stock from each component product
      if (item.product.product_type === 'bundle') {
        const biRes = await window.daftrly.query('SELECT bi.*, p.track_stock FROM bundle_items bi JOIN products p ON bi.product_id=p.id WHERE bi.bundle_id=?', [item.product.id]);
        if (biRes.success && biRes.data) {
          for (const bi of biRes.data) {
            if (bi.track_stock) {
              await window.daftrly.query('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?',
                [bi.quantity * item.quantity, bi.product_id]);
            }
          }
        }
      }
    }

    // Insert payment(s)
    if (method === 'split') {
      // Split: insert cash record and card record separately
      if (splitCashAmt > 0) {
        await window.daftrly.query(
          'INSERT INTO payments (sale_id, method, amount) VALUES (?, ?, ?)',
          [saleId, 'cash', splitCashAmt]
        );
      }
      if (splitCardAmt > 0) {
        await window.daftrly.query(
          'INSERT INTO payments (sale_id, method, amount, reference) VALUES (?, ?, ?, ?)',
          [saleId, 'card', splitCardAmt, window._terminalRef || '']
        );
      }
    } else {
      await window.daftrly.query(
        'INSERT INTO payments (sale_id, method, amount) VALUES (?, ?, ?)',
        [saleId, method, received]
      );
    }

    // Insert exchange credit as a separate payment if used
    if (exchangeCredit > 0) {
      await window.daftrly.query(
        'INSERT INTO payments (sale_id, method, amount, reference) VALUES (?, ?, ?, ?)',
        [saleId, 'exchange', exchangeCredit, lang === 'ar' ? 'رصيد استبدال' : 'Exchange credit']
      );
    }

    // Deduct gift card balance if used
    if (giftCardDiscount > 0 && appliedGiftCard) {
      await window.daftrly.query('UPDATE gift_cards SET balance = balance - ? WHERE id = ?', [giftCardDiscount, appliedGiftCard.id]);
      await window.daftrly.query('INSERT INTO gift_card_transactions (card_id, type, amount, sale_id, notes) VALUES (?,?,?,?,?)',
        [appliedGiftCard.id, 'redeem', giftCardDiscount, saleId, invoiceNumber]);
      await window.daftrly.query('INSERT INTO payments (sale_id, method, amount, reference) VALUES (?,?,?,?)',
        [saleId, 'gift_card', giftCardDiscount, appliedGiftCard.code]);
    }

    // Loyalty points — REDEEM if customer chose to use points
    if (loyaltyDiscount > 0 && window._posCustomerId) {
      const pointsUsed = Math.ceil(loyaltyDiscount / loyaltyPointValue);
      await window.daftrly.query('UPDATE customers SET loyalty_points = loyalty_points - ? WHERE id = ?', [pointsUsed, window._posCustomerId]);
      await window.daftrly.query('UPDATE sales SET loyalty_points_redeemed = ? WHERE id = ?', [pointsUsed, saleId]);
      window.dbg('info', `Loyalty: ${pointsUsed} points redeemed (${loyaltyDiscount.toFixed(2)} SAR) for customer ${window._posCustomerId}`);
    }

    // Customer store credit — deduct used credit from balance
    if (customerCreditUsed > 0 && window._posCustomerId) {
      await window.daftrly.query('UPDATE customers SET credit_balance = credit_balance - ? WHERE id = ?', [customerCreditUsed, window._posCustomerId]);
      await window.daftrly.query('INSERT INTO payments (sale_id, method, amount, reference) VALUES (?,?,?,?)',
        [saleId, 'store_credit', customerCreditUsed, lang === 'ar' ? 'رصيد دائن' : 'Store credit']);
      window.dbg('info', `Store credit: ${customerCreditUsed.toFixed(2)} SAR used for customer ${window._posCustomerId}`);
    }

    // Loyalty points — earn points for this sale (if customer assigned and loyalty enabled)
    const loyaltyConf = saleSettings.loyalty || {};
    if (loyaltyConf.enabled && window._posCustomerId) {
      const pointsEarned = Math.floor(effectiveTotal * (Number(loyaltyConf.pointsPerSar) || 1));
      if (pointsEarned > 0) {
        await window.daftrly.query('UPDATE customers SET loyalty_points = loyalty_points + ? WHERE id = ?', [pointsEarned, window._posCustomerId]);
        await window.daftrly.query('UPDATE sales SET loyalty_points_earned = ? WHERE id = ?', [pointsEarned, saleId]);
        window.dbg('info', `Loyalty: ${pointsEarned} points earned for customer ${window._posCustomerId}`);
      }
    }

    // Update customer balance if partial payment
    if (isPartial && window._posCustomerId && balanceDue > 0) {
      await window.daftrly.query('UPDATE customers SET credit_balance = credit_balance + ? WHERE id = ?', [balanceDue, window._posCustomerId]);
      await window.daftrly.query('UPDATE sales SET customer_id = ? WHERE id = ?', [window._posCustomerId, saleId]);
      window.dbg('info', `Customer ${window._posCustomerId} balance increased by ${balanceDue}`);
    }

    window.dbg('success', `Sale completed: ${invoiceNumber}, total: ${effectiveTotal}`);
    window.logAudit('sale', 'sales', saleId, `${invoiceNumber} | ${effectiveTotal.toFixed(2)} SAR | ${method}${exchangeCredit > 0 ? ' | exchange credit: ' + exchangeCredit.toFixed(2) : ''}`);

    // Clear exchange credit after use
    window._exchangeCredit = 0;

    // ZATCA Phase 2: Queue invoice for reporting (if enabled)
    const zatcaMode = saleSettings.zatcaMode || 'off';
    if (zatcaMode === 'phase2' || zatcaMode === 'phase2_sandbox') {
      // Report async — don't block the sale completion
      (async () => {
        try {
          const vatRate = saleSettings.vat?.rate || 15;
          const isInclusive = saleSettings.vat?.inclusive || false;
          const lineItemsForZatca = posCart.map(item => {
            const rawPrice = item.product.price;
            // Determine per-item tax rate — zero-rated and exempt items have 0% VAT
            const itemTaxStatus = item.product.tax_status || 'standard';
            const itemVatRate = (saleSettings.vat?.enabled && itemTaxStatus === 'standard') ? vatRate : 0;
            // ZATCA expects tax_exclusive_price — extract net if inclusive
            // Only divide by VAT for standard-rated items (zero/exempt prices have no VAT baked in)
            const netPrice = (isInclusive && itemVatRate > 0) ? rawPrice / (1 + itemVatRate / 100) : rawPrice;
            const taxAmt = netPrice * (itemVatRate / 100);
            // Discount must also be in exclusive terms for ZATCA
            // POS discounts are entered in inclusive/display price terms
            let discountAmount = 0;
            if (item.discount > 0) {
              if (item.discountType === 'percent') {
                // Percent discount: apply to exclusive line total (netPrice * qty)
                discountAmount = netPrice * item.quantity * item.discount / 100;
              } else {
                // Fixed per-unit discount: convert from inclusive to exclusive if needed
                const rawDiscount = item.discount * item.quantity;
                discountAmount = (isInclusive && itemVatRate > 0) ? rawDiscount / (1 + itemVatRate / 100) : rawDiscount;
              }
            }
            return {
              name: item.product.name_ar || item.product.name_en || 'Item',
              quantity: item.quantity,
              unitPrice: netPrice,
              taxRate: itemVatRate,
              taxAmount: item.quantity * taxAmt,
              total: item.quantity * (netPrice + taxAmt),
              discountAmount: discountAmount,
            };
          });
          const zatcaInvoiceData = {
            invoiceNumber: invoiceNumber,
            saleId: saleId,
            subtotal: totals.subtotal,
            taxAmount: totals.tax,
            total: effectiveTotal,
            discountAmount: totals.itemDiscount + totals.invoiceDiscount + couponDiscount + loyaltyDiscount,
            lineItems: lineItemsForZatca,
          };

          window.dbg('info', 'Reporting invoice to ZATCA (background)...');
          const zatcaResult = await window.daftrly.zatcaReportInvoice(zatcaInvoiceData);
          if (zatcaResult && zatcaResult.success) {
            window.dbg('info', 'ZATCA report SUCCESS:', zatcaResult.statusCode);
            await window.daftrly.query(
              'UPDATE sales SET zatca_status = ?, zatca_uuid = ?, zatca_hash = ?, qr_code = ?, zatca_invoice_counter = ? WHERE id = ?',
              ['reported', zatcaResult.uuid || '', zatcaResult.invoiceHash || '', zatcaResult.qrCode || '', zatcaResult.invoiceCounter || 0, saleId]);
            await window.daftrly.query(
              'INSERT INTO zatca_queue (sale_id, invoice_data, status, zatca_response, processed_at, created_at) VALUES (?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))',
              [saleId, JSON.stringify(zatcaInvoiceData), 'reported', JSON.stringify(zatcaResult.data || {})]);
          } else {
            window.dbg('warn', 'ZATCA report failed — queued for retry');
            await window.daftrly.query(
              'INSERT INTO zatca_queue (sale_id, invoice_data, status, last_error, created_at) VALUES (?, ?, ?, ?, datetime(\'now\'))',
              [saleId, JSON.stringify(zatcaInvoiceData), 'pending', JSON.stringify(zatcaResult?.data || zatcaResult?.error || 'Failed')]);
          }
        } catch (e) {
          window.dbg('warn', 'ZATCA reporting error:', e.message);
          try {
            await window.daftrly.query(
              'INSERT INTO zatca_queue (sale_id, invoice_data, status, last_error, created_at) VALUES (?, ?, ?, ?, datetime(\'now\'))',
              [saleId, JSON.stringify({invoiceNumber, subtotal: totals.subtotal, taxAmount: totals.tax, total: totals.total}), 'pending', e.message]);
          } catch (_) {}
        }
      })();
    }

    // Qoyod Accounting: Queue invoice for sync (if enabled)
    if (typeof window.qoyodSyncSale === 'function') {
      window.qoyodSyncSale(saleId).catch(e => window.dbg('warn', 'Qoyod sync error:', e.message));
    }

    // Activate packages sold in this cart
    if (window._posCustomerId) {
      for (const item of posCart) {
        if (item.product._isPackage && item.product._packageId) {
          const pkgDays = item.product._packageDays || 0;
          const expiresAt = pkgDays > 0 ? new Date(Date.now() + pkgDays * 86400000).toISOString().split('T')[0] : null;
          await window.daftrly.query(
            'INSERT INTO customer_packages (customer_id, package_id, remaining_uses, purchased_at, expires_at, sale_id) VALUES (?,?,?,datetime(\'now\'),?,?)',
            [window._posCustomerId, item.product._packageId, item.product._packageUses, expiresAt, saleId]);
          window.dbg('info', `Package ${item.product._packageId} activated for customer ${window._posCustomerId}`);
        }
      }
    }

    // Generate ticket number if enabled
    const rcptSettings = settings.receipt || {};
    let ticketNumber = null;
    if (rcptSettings.ticketEnabled) {
      ticketNumber = await window.daftrly.nextTicket();
      window.dbg('info', `Ticket number: ${ticketNumber}`);
      // Store ticket number in sale notes for reference
      await window.daftrly.query('UPDATE sales SET notes = ? WHERE id = ?', 
        [(window._posInvoiceNote ? window._posInvoiceNote + ' | ' : '') + 'TICKET:' + ticketNumber, saleId]);
    }

    // Reset cart state
    posCart = []; window._posSelectedCartIdx = -1;
    window._posInvoiceDiscount = null;
    window._posInvoiceNote = '';
    window._posCustomerId = null;
    window._posCustomerData = null;

    // Auto drawer kick for cash payments (including split with cash portion)
    if ((method === 'cash' || (method === 'split' && splitCashAmt > 0)) && settings.printer?.drawerKick && settings.printer?.type === 'network' && settings.printer?.ip) {
      window.daftrly.printerSend(settings.printer.ip, settings.printer.port || 9100, 'drawer').catch(() => {});
    }

    // Auto print receipt
    if (settings.printer?.autoPrint && settings.printer?.enabled) {
      printReceipt(invoiceNumber, effectiveTotal, change, method, ticketNumber).catch(e => window.dbg('warn', 'Auto-print error:', e.message));
    }

    // Show success (will call renderPOS when dismissed)
    closeModal();
    showSaleSuccess(container, invoiceNumber, effectiveTotal, change, method, ticketNumber);
   } catch (saleErr) {
    window.dbg('error', 'Sale processing error:', saleErr.message);
    showToast(window.i18n.getLang() === 'ar' ? `❌ خطأ في معالجة البيع: ${saleErr.message}` : `❌ Sale error: ${saleErr.message}`, 'error');
   }
  });
}

// ============ SALE SUCCESS ============
function showSaleSuccess(container, invoiceNumber, total, change, method, ticketNumber) {
  const lang = window.i18n.getLang();
  const overlay = container.querySelector('#pos-modal-overlay');
  const modal = container.querySelector('#pos-modal-content');

  modal.innerHTML = `
    <div class="modal-body" style="text-align:center;padding:40px 24px;">
      <div style="font-size:64px;margin-bottom:12px;">✅</div>
      ${ticketNumber ? `<div style="font-size:48px;font-weight:900;color:var(--accent);margin-bottom:8px;">#${ticketNumber}</div>
      <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:12px;">${lang === 'ar' ? 'رقم التذكرة' : 'Ticket Number'}</div>` : ''}
      <h2 style="color:var(--success);margin-bottom:8px;">${lang === 'ar' ? 'تمت عملية البيع بنجاح!' : 'Sale Completed!'}</h2>
      <div style="font-size:13px;color:var(--text-tertiary);margin-bottom:20px;">${invoiceNumber}</div>
      <div class="pay-total-display" style="margin-bottom:8px;">${formatCurrency(total)}</div>
      ${change > 0 ? `<div style="font-size:18px;color:var(--gold);font-weight:700;margin-bottom:20px;">${lang === 'ar' ? 'الباقي:' : 'Change:'} ${formatCurrency(change)}</div>` : ''}
      <div style="display:flex;gap:8px;justify-content:center;">
        <button class="btn btn-secondary" id="success-print" style="min-width:120px;">
          🖨 ${lang === 'ar' ? 'طباعة' : 'Print'}
        </button>
        <button class="btn btn-primary btn-lg" id="success-done" style="min-width:200px;">
          ${lang === 'ar' ? 'بيع جديد' : 'New Sale'} (Enter)
        </button>
      </div>
    </div>
  `;

  overlay.style.display = 'flex';

  const done = () => { 
    document.removeEventListener('keydown', enterHandler);
    overlay.style.display = 'none'; 
    renderPOS(container); // re-render POS with empty cart
  };
  modal.querySelector('#success-done').addEventListener('click', done);

  // Print receipt
  modal.querySelector('#success-print')?.addEventListener('click', () => {
    printReceipt(invoiceNumber, total, change, method, ticketNumber);
  });

  const enterHandler = (e) => { if (e.key === 'Enter') { e.preventDefault(); done(); } };
  document.addEventListener('keydown', enterHandler);

  showToast(lang === 'ar' ? `تم البيع: ${invoiceNumber}` : `Sale: ${invoiceNumber}`, 'success');

  // Update customer display with thank you message
  if (window.appSettings?.customerDisplay) {
    window.daftrly.updateDisplay({ type: 'success', text: lang === 'ar' ? 'شكراً لك! ✨' : 'Thank you! ✨' }).catch(() => {});
  }
}

// ============ INVOICE DISCOUNT MODAL ============
function openInvoiceDiscountModal(container) {
  const lang = window.i18n.getLang();
  const overlay = container.querySelector('#pos-modal-overlay');
  const modal = container.querySelector('#pos-modal-content');
  const current = window._posInvoiceDiscount || { amount: 0, type: 'fixed' };

  modal.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">${lang === 'ar' ? 'خصم على الفاتورة' : 'Invoice Discount'}</h3>
      <button class="modal-close" id="disc-close">✕</button>
    </div>
    <div class="modal-body" style="padding:24px;">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'نوع الخصم' : 'Discount Type'}</label>
          <select id="disc-type" class="form-input form-select">
            <option value="fixed" ${current.type === 'fixed' ? 'selected' : ''}>${lang === 'ar' ? 'مبلغ ثابت' : 'Fixed Amount'}</option>
            <option value="percent" ${current.type === 'percent' ? 'selected' : ''}>${lang === 'ar' ? 'نسبة مئوية %' : 'Percentage %'}</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'القيمة' : 'Value'}</label>
          <input type="text" inputmode="decimal" id="disc-value" class="form-input" value="${current.amount}">
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="disc-remove">${lang === 'ar' ? 'إزالة الخصم' : 'Remove Discount'}</button>
      <button class="btn btn-primary" id="disc-apply">${lang === 'ar' ? 'تطبيق' : 'Apply'}</button>
    </div>
  `;

  overlay.style.display = 'flex';
  const closeModal = () => { overlay.style.display = 'none'; };
  modal.querySelector('#disc-close').addEventListener('click', closeModal);

  modal.querySelector('#disc-remove').addEventListener('click', () => {
    window._posInvoiceDiscount = { amount: 0, type: 'fixed' };
    renderCart(container);
    closeModal();
  });

  modal.querySelector('#disc-apply').addEventListener('click', async () => {
    const type = modal.querySelector('#disc-type').value;
    const amount = parseFloat(modal.querySelector('#disc-value').value) || 0;
    
    // Enforce max discount limit
    const s = await window.daftrly.getSettings();
    const maxPct = Number(s.maxDiscountPercent) || 0;
    
    if (maxPct > 0 && !window.hasPermission('settings_access')) {
      // Calculate effective discount percentage
      const totals = calculateCart();
      const subtotal = totals.subtotal - totals.itemDiscount;
      let discPct = 0;
      if (type === 'percent') {
        discPct = amount;
      } else if (subtotal > 0) {
        discPct = (amount / subtotal) * 100;
      }
      
      if (discPct > maxPct) {
        // Admin can override freely — cashiers need manager approval
        const isAdmin = window._currentUser?.role === 'admin';
        if (!isAdmin) {
          const authorized = await window.requestManagerAuth(
            lang === 'ar' ? `⚠️ الخصم ${discPct.toFixed(1)}% يتجاوز الحد ${maxPct}%\n\nمطلوب موافقة المدير` 
              : `⚠️ Discount ${discPct.toFixed(1)}% exceeds limit ${maxPct}%\n\nManager approval required`
          );
          if (!authorized) return;
        }
      }
    }
    
    window._posInvoiceDiscount = { amount, type };
    window.dbg('ui', `Invoice discount: ${type} ${amount}`);
    window.logAudit('discount', 'sales', null, `${type} ${amount}`);
    renderCart(container);
    closeModal();
  });
}

// ============ NOTE MODAL ============
function openNoteModal(container) {
  const lang = window.i18n.getLang();
  const overlay = container.querySelector('#pos-modal-overlay');
  const modal = container.querySelector('#pos-modal-content');

  modal.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">${lang === 'ar' ? 'ملاحظة على الفاتورة' : 'Invoice Note'}</h3>
      <button class="modal-close" id="note-close">✕</button>
    </div>
    <div class="modal-body" style="padding:24px;">
      <textarea id="note-text" class="form-input form-textarea" rows="4" placeholder="${lang === 'ar' ? 'اكتب ملاحظة...' : 'Type a note...'}">${window._posInvoiceNote || ''}</textarea>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="note-cancel">${lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
      <button class="btn btn-primary" id="note-save">${lang === 'ar' ? 'حفظ' : 'Save'}</button>
    </div>
  `;

  overlay.style.display = 'flex';
  const closeModal = () => { overlay.style.display = 'none'; };
  modal.querySelector('#note-close').addEventListener('click', closeModal);
  modal.querySelector('#note-cancel').addEventListener('click', closeModal);
  modal.querySelector('#note-save').addEventListener('click', () => {
    window._posInvoiceNote = modal.querySelector('#note-text').value;
    closeModal();
  });
}

// ============ RECALL HELD SALES ============
function openRecallModal(container) {
  const lang = window.i18n.getLang();
  const overlay = container.querySelector('#pos-modal-overlay');
  const modal = container.querySelector('#pos-modal-content');

  modal.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">${lang === 'ar' ? 'مبيعات معلقة' : 'Held Sales'} (${posHeldSales.length})</h3>
      <button class="modal-close" id="recall-close">✕</button>
    </div>
    <div class="modal-body" style="padding:16px;">
      ${posHeldSales.map((sale, idx) => `
        <div class="recall-item">
          <div>
            <strong>${lang === 'ar' ? 'بيع معلق' : 'Held Sale'} #${idx + 1}</strong>
            <span style="color:var(--text-tertiary);font-size:12px;margin-inline-start:8px;">${sale.time}</span>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">
              ${sale.items.length} ${lang === 'ar' ? 'صنف' : 'items'} — ${formatCurrency(sale.items.reduce((s, i) => s + i.product.price * i.quantity, 0))}
            </div>
          </div>
          <div style="display:flex;gap:6px;">
            <button class="btn btn-primary btn-sm" data-action="recall" data-idx="${idx}">${lang === 'ar' ? 'استرجاع' : 'Recall'}</button>
            <button class="btn btn-secondary btn-sm" data-action="delete-held" data-idx="${idx}">🗑</button>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  overlay.style.display = 'flex';
  modal.querySelector('#recall-close').addEventListener('click', () => { overlay.style.display = 'none'; });

  modal.querySelectorAll('[data-action="recall"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.idx);
      if (posCart.length > 0) {
        if (!await window.daftrlyConfirm(lang === 'ar' ? 'السلة الحالية ليست فارغة. هل تريد استبدالها؟' : 'Current cart is not empty. Replace it?')) return;
      }
      posCart = posHeldSales[idx].items;
      posHeldSales.splice(idx, 1);
      window.dbg('ui', 'Sale recalled from hold');
      overlay.style.display = 'none';
      renderPOS(container);
    });
  });

  modal.querySelectorAll('[data-action="delete-held"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      posHeldSales.splice(idx, 1);
      window.dbg('ui', 'Held sale deleted');
      if (posHeldSales.length === 0) { overlay.style.display = 'none'; renderPOS(container); }
      else openRecallModal(container); // re-render
    });
  });
}

// ============ UTILITIES (local) ============
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ============ RECEIPT PRINTING ============
async function printReceipt(invoiceNumber, total, change, method, ticketNumber) {
  const settings = await window.daftrly.getSettings();
  const biz = settings.business || {};
  const rcpt = settings.receipt || {};
  const rl = rcpt.receiptLang || 'ar';
  const isBoth = rl === 'both';
  const paperWidth = settings.printer?.paperWidth || 80;
  const vatRate = settings.vat?.rate || 15;

  function lb(ar, en) {
    if (isBoth) return `${ar} / ${en}`;
    return rl === 'en' ? en : ar;
  }

  const saleRes = await window.daftrly.query(
    'SELECT s.*, si.name_ar, si.name_en, si.quantity, si.unit_price, si.tax_amount, si.total as line_total FROM sales s INNER JOIN sale_items si ON si.sale_id = s.id WHERE s.invoice_number = ?',
    [invoiceNumber]);
  const items = saleRes.success ? (saleRes.data || []) : [];
  const sale = items[0] || {};

  // Query payments for split display
  const payRes = await window.daftrly.query('SELECT * FROM payments WHERE sale_id = ?', [sale.id]);
  const salePayments = payRes.success ? (payRes.data || []) : [];
  const splitCashPay = salePayments.find(p => p.method === 'cash');
  const splitCardPay = salePayments.find(p => p.method === 'card');
  const storeCreditPay = salePayments.find(p => p.method === 'store_credit');

  // Query credit/debit notes for this invoice
  const notesRes = await window.daftrly.query('SELECT * FROM credit_debit_notes WHERE sale_id = ? ORDER BY created_at', [sale.id]);
  const saleNotes = notesRes.success ? (notesRes.data || []) : [];

  // === THERMAL PRINTER (network ESC/POS) ===
  if (settings.printer?.type === 'network' && settings.printer?.ip) {
    const receiptData = {
      logo: rcpt.showLogo !== false && biz.logo ? biz.logo : '',
      businessNameAr: rcpt.showNameAr !== false ? biz.nameAr : '',
      businessNameEn: rcpt.showNameAr !== false ? biz.nameEn : '',
      vatNumber: rcpt.showVat !== false ? biz.vatNumber : '',
      crNumber: rcpt.showCR ? biz.crNumber : '',
      address: rcpt.showAddress ? biz.address : '',
      phone: rcpt.showPhone ? biz.phone : '',
      invoiceNumber: invoiceNumber,
      date: sale.created_at ? sale.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
      time: sale.created_at ? sale.created_at.split('T')[1]?.substring(0, 5) : new Date().toTimeString().substring(0, 5),
      cashier: window._currentUser?.name_ar || lb('المدير', 'Admin'),
      ticketNumber: ticketNumber || null,
      customerName: sale.cust_name_ar || '',
      items: rcpt.showItems !== false ? items.map(item => ({
        name: lb(item.name_ar || '', item.name_en || item.name_ar || ''),
        quantity: item.quantity,
        unitPrice: item.unit_price,
        total: item.line_total,
        discount: 0,
      })) : [],
      subtotal: sale.subtotal || total,
      discount: sale.discount_amount || 0,
      couponDiscount: rcpt.showCoupon !== false ? (sale.coupon_discount || 0) : 0,
      loyaltyDiscount: rcpt.showLoyalty !== false && sale.loyalty_points_redeemed > 0 ? (sale.loyalty_points_redeemed * (settings.loyalty?.pointValue || 0.01)) : 0,
      exchangeCredit: sale.exchange_credit || 0,
      vatRate: vatRate,
      tax: sale.tax_amount || 0,
      total: total,
      currencySymbol: window.getCurrSym(),
      method: method,
      paid: sale.paid_amount || total,
      splitCash: splitCashPay ? splitCashPay.amount : 0,
      splitCard: splitCardPay ? splitCardPay.amount : 0,
      change: change || 0,
      balanceDue: sale.balance_due || 0,
      pointsEarned: rcpt.showPointsEarned !== false ? (sale.loyalty_points_earned || 0) : 0,
      footer: biz.footerText || '',
      qrData: rcpt.showQR !== false && biz.vatNumber ? `${biz.nameAr || ''}|${biz.vatNumber}|${sale.created_at || ''}|${total}|${sale.tax_amount || 0}` : '',
      qrSize: rcpt.qrSize || 'medium',
      showBarcode: rcpt.showBarcode !== false,
      kickDrawer: (method === 'cash' || (method === 'split' && splitCashPay?.amount > 0)) && settings.printer?.drawerKick,
      // Labels
      labelInvoice: lb('الفاتورة:', 'Invoice:'),
      labelDate: lb('التاريخ:', 'Date:'),
      labelTime: lb('الوقت:', 'Time:'),
      labelCashier: lb('الكاشير:', 'Cashier:'),
      labelCustomer: lb('العميل:', 'Customer:'),
      labelSubtotal: lb('المجموع الفرعي', 'Subtotal'),
      labelDiscount: lb('خصم', 'Discount'),
      labelCoupon: lb('كوبون', 'Coupon'),
      labelLoyalty: lb('نقاط', 'Points'),
      labelExchange: lb('استبدال', 'Exchange'),
      labelVat: lb('الضريبة', 'VAT') + ' (' + vatRate + '%):',
      labelTotal: lb('الإجمالي', 'TOTAL'),
      labelMethod: lb('الدفع:', 'Payment:'),
      labelCash: lb('نقدي', 'Cash'),
      labelCard: lb('بطاقة', 'Card'),
      labelSplit: lb('تقسيم', 'Split'),
      labelPaid: lb('المدفوع:', 'Paid:'),
      labelChange: lb('الباقي:', 'Change:'),
      labelBalanceDue: lb('المتبقي:', 'Due:'),
      labelPointsEarned: lb('نقاط مكتسبة', 'Points Earned'),
    };

    try {
      const result = await window.daftrly.printThermalReceipt(receiptData);
      if (result.success) {
        window.dbg('info', `Thermal receipt sent: ${result.bytes} bytes`);
        return;
      } else {
        showToast(lang === 'ar' ? `⚠️ فشل الطباعة: ${result.error}` : `⚠️ Print failed: ${result.error}`, 'warning');
        return; // Don't fall through to browser — merchant chose network printer
      }
    } catch (e) {
      showToast(lang === 'ar' ? `⚠️ خطأ في الطباعة: ${e.message}` : `⚠️ Print error: ${e.message}`, 'warning');
      return; // Don't fall through to browser
    }
  }

  // === BROWSER PRINT or USB SILENT PRINT ===
  const isUSBMode = settings.printer?.type === 'usb' && settings.printer?.usbName;

  // Generate QR data URI if enabled
  let qrDataUri = '';
  if (rcpt.showQR !== false && biz.vatNumber) {
    try {
      const qrData = `${biz.nameAr || ''}|${biz.vatNumber || ''}|${sale.created_at || ''}|${total}|${sale.tax_amount || 0}`;
      const qrResult = await window.daftrly.generateQR(qrData);
      if (qrResult && qrResult.success && qrResult.svg) {
        // Convert SVG string to data URI
        qrDataUri = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(qrResult.svg)));
      }
    } catch(e) { console.error('QR gen error:', e); }
  }

  // Generate barcode as inline SVG for print window
  let barcodeHtml = '';
  if (rcpt.showBarcode !== false) {
    const bw = 2;
    const bh = 30;
    let bars = [];
    let bx = 0;
    // Start pattern
    [2, 1, 1, 2, 3, 2].forEach(b => { bars.push({ x: bx, w: bw * b, fill: true }); bx += bw * b + bw; });
    // Data pattern
    for (let i = 0; i < invoiceNumber.length; i++) {
      const code = invoiceNumber.charCodeAt(i);
      const pat = [(code >> 6) & 3, (code >> 4) & 3, (code >> 2) & 3, code & 3, ((code >> 1) & 1) + 1];
      pat.forEach((b, j) => { if (j % 2 === 0) bars.push({ x: bx, w: bw * (b + 1), fill: true }); bx += bw * (b + 1); });
    }
    const totalW = bx;
    const svgBars = bars.filter(b => b.fill).map(b => `<rect x="${b.x}" y="0" width="${b.w}" height="${bh}" fill="#000"/>`).join('');
    barcodeHtml = `<div style="text-align:center;padding:4px 0;overflow:hidden;">
      <svg viewBox="0 0 ${totalW} ${bh + 16}" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:0 auto;max-width:100%;height:auto;">
        ${svgBars}
        <text x="${totalW / 2}" y="${bh + 12}" font-family="monospace" font-size="10" font-weight="bold" text-anchor="middle" fill="#000">${invoiceNumber}</text>
      </svg>
    </div>`;
  }

  const qrSizes = { small: 80, medium: 120, large: 160 };
  const qrPx = qrSizes[rcpt.qrSize] || 120;
  const fontSizes = { small: '10px', medium: '12px', large: '14px' };
  const fontSize = fontSizes[rcpt.fontSize] || '12px';

  const receiptHtml = `
    <!DOCTYPE html>
    <html><head>
    <meta charset="UTF-8">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: 'Courier New', monospace; font-size: ${fontSize}; width: ${paperWidth}mm; padding: 4mm; text-align:center; line-height:1.5; }
      .c { text-align:center; }
      .b { font-weight:bold; }
      .s { font-size:10px; color:#555; }
      .line { border-top:1px dashed #bbb; margin:5px 0; }
      .line2 { border-top:2px solid #999; margin:5px 0; }
      .row { display:flex; justify-content:space-between; text-align:left; padding:1px 0; }
      .grand { font-size:15px; font-weight:900; border-top:1px dashed #999; margin-top:3px; padding-top:3px; display:flex; justify-content:space-between; }
      .item-name { font-weight:700; font-size:11px; text-align:left; line-height:1.3; }
      .item-sub { color:#555; font-size:0.9em; }
      h1 { font-size:16px; margin-bottom:2px; }
      @media print { body { width:${paperWidth}mm; } @page { size:${paperWidth}mm auto; margin:0; } }
    </style>
    </head><body>
      <div class="c">
        ${rcpt.showLogo !== false && biz.logo ? `<div style="margin-bottom:4px;"><img src="${biz.logo}" style="max-width:80px;max-height:60px;filter:grayscale(100%) contrast(1.5);" alt=""></div>` : ''}
        ${rcpt.showNameAr !== false && biz.nameAr ? (rl === 'en' && biz.nameEn ? `<h1>${biz.nameEn}</h1>` : `<h1>${biz.nameAr}</h1>`) : ''}
        ${rcpt.showNameAr !== false && isBoth && biz.nameEn && biz.nameEn !== biz.nameAr ? `<div class="s">${biz.nameEn}</div>` : ''}
        ${rcpt.showVat !== false && biz.vatNumber ? `<div class="s">${lb('الرقم الضريبي', 'VAT')}: ${biz.vatNumber}</div>` : ''}
        ${rcpt.showCR && biz.crNumber ? `<div class="s">${lb('السجل التجاري', 'CR')}: ${biz.crNumber}</div>` : ''}
        ${rcpt.showAddress && biz.address ? `<div class="s">${biz.address}</div>` : ''}
        ${rcpt.showPhone && biz.phone ? `<div class="s">${biz.phone}</div>` : ''}
      </div>
      <div class="line"></div>
      <div class="c b">${invoiceNumber}</div>
      <div class="c s">${sale.created_at ? sale.created_at.substring(0, 19).replace('T', ' ') : new Date().toLocaleString('en-GB')}</div>
      ${ticketNumber ? `<div class="c b" style="font-size:24px;">#${ticketNumber}</div>` : ''}
      <div class="line"></div>
      ${rcpt.showItems !== false ? items.map(item => {
        let name = rl === 'en' ? (item.name_en || item.name_ar) : item.name_ar;
        let nameLine = `<div class="item-name">${name}</div>`;
        if (isBoth && item.name_en && item.name_en !== item.name_ar) {
          nameLine += `<div class="item-name item-sub">${item.name_en}</div>`;
        }
        return `${nameLine}<div class="row"><span>${Number(item.quantity)} × ${Number(item.unit_price).toFixed(2)}</span><span>${Number(item.line_total).toFixed(2)}</span></div>`;
      }).join('') + '<div class="line"></div>' : ''}
      <div class="row"><span>${lb('المجموع', 'Subtotal')}</span><span>${Number(sale.subtotal || 0).toFixed(2)}</span></div>
      ${Number(sale.discount_amount) > 0 && !Number(sale.coupon_discount) && !Number(sale.loyalty_points_redeemed) ? `<div class="row"><span>${lb('الخصم', 'Discount')}</span><span>-${Number(sale.discount_amount).toFixed(2)}</span></div>` : ''}
      ${Number(sale.discount_amount) > 0 && (Number(sale.coupon_discount) > 0 || Number(sale.loyalty_points_redeemed) > 0) && (Number(sale.discount_amount) - Number(sale.coupon_discount || 0)) > 0.01 ? `<div class="row"><span>${lb('خصم الفاتورة', 'Invoice Discount')}</span><span>-${(Number(sale.discount_amount) - Number(sale.coupon_discount || 0)).toFixed(2)}</span></div>` : ''}
      ${rcpt.showCoupon !== false && Number(sale.coupon_discount) > 0 ? `<div class="row"><span>${lb('كوبون', 'Coupon')}</span><span>-${Number(sale.coupon_discount).toFixed(2)}</span></div>` : ''}
      ${rcpt.showLoyalty !== false && Number(sale.loyalty_points_redeemed) > 0 ? `<div class="row"><span>${lb('نقاط ولاء', 'Loyalty')}</span><span>-${(Number(sale.loyalty_points_redeemed) * (Number(settings.loyalty?.pointValue) || 0.01)).toFixed(2)}</span></div>` : ''}
      <div class="row"><span>${lb('الضريبة', 'VAT')} (${vatRate}%)</span><span>${Number(sale.tax_amount || 0).toFixed(2)}</span></div>
      <div class="grand"><span>${lb('الإجمالي', 'TOTAL')}</span><span>${Number(total).toFixed(2)} ${window.getCurrSym()}</span></div>
      <div class="line2"></div>
      <div class="c">
        ${Number(sale.exchange_credit) > 0 ? `<div>${lb('رصيد استبدال', 'Exchange Credit')}: ${Number(sale.exchange_credit).toFixed(2)}</div>` : ''}
        <div>${method === 'split' && splitCashPay && splitCardPay
          ? `${lb('نقدي', 'Cash')}: ${Number(splitCashPay.amount).toFixed(2)}<br>${lb('بطاقة', 'Card')}: ${Number(splitCardPay.amount).toFixed(2)}`
          : `${method === 'cash' ? lb('نقدي', 'Cash') : method === 'card' ? lb('بطاقة', 'Card') : lb('دفع', 'Payment')}: ${Number(sale.paid_amount || total || 0).toFixed(2)}`}</div>
        ${change > 0 ? `<div>${lb('الباقي', 'Change')}: ${Number(change).toFixed(2)}</div>` : ''}
        ${Number(sale.balance_due) > 0 ? `<div style="font-weight:700;">${lb('المبلغ المتبقي', 'Balance Due')}: ${Number(sale.balance_due).toFixed(2)}</div>` : ''}
      </div>
      ${rcpt.showPointsEarned !== false && Number(sale.loyalty_points_earned) > 0 ? `<div class="c s" style="margin-top:3px;">⭐ ${lb('نقاط مكتسبة', 'Points Earned')}: +${sale.loyalty_points_earned}</div>` : ''}
      ${barcodeHtml ? `<div class="line"></div>${barcodeHtml}` : ''}
      ${rcpt.showQR !== false && qrDataUri ? `
        <div class="line"></div>
        <div class="c" style="padding:4px 0;">
          <img src="${qrDataUri}" width="${qrPx}" height="${qrPx}" style="display:block;margin:0 auto;" alt="QR">
          <div class="s" style="margin-top:2px;">${lb('فاتورة إلكترونية', 'E-Invoice')} — ZATCA</div>
        </div>
      ` : ''}
      <div class="line"></div>
      ${saleNotes.length > 0 ? `
        <div style="margin:6px 0;">
          ${saleNotes.map(n => {
            const isCredit = n.note_type === 'credit';
            return `<div class="s" style="padding:3px 0;"><strong>${n.note_number}</strong> — ${isCredit ? lb('إشعار دائن', 'Credit Note') : lb('إشعار مدين', 'Debit Note')}: ${isCredit ? '-' : '+'}${Number(n.amount).toFixed(2)} ${window.getCurrSym()}</div>`;
          }).join('')}
        </div>
        <div class="line"></div>
      ` : ''}
      ${storeCreditPay ? `
        <div class="s" style="padding:3px 0;">💳 ${lb('رصيد دائن مستخدم', 'Store credit used')}: -${Number(storeCreditPay.amount).toFixed(2)} ${window.getCurrSym()}</div>
        <div class="line"></div>
      ` : ''}
      <div class="c s" style="margin-top:6px;">
        ${biz.footerText ? `<div>${biz.footerText}</div>` : ''}
      </div>
    </body></html>
  `;

  if (isUSBMode) {
    // USB silent print — send HTML to main process
    const fullHtml = `<!DOCTYPE html><html><head><style>${receiptHtml.match(/<style>([\s\S]*?)<\/style>/)?.[1] || ''}</style></head><body>${receiptHtml.match(/<body>([\s\S]*?)<\/body>/)?.[1] || ''}</body></html>`;
    window.daftrly.printUSB(settings.printer.usbName, receiptHtml, paperWidth).catch(() => {});
    return;
  }

  // Browser print with OS print dialog (includes print preview and Save as PDF)
  window.daftrly.printPreview(receiptHtml, paperWidth).catch(e => {
    window.dbg('warn', 'Print preview error:', e.message);
  });
}

// ============ RETURNS / REFUNDS ============

const RETURN_REASONS = {
  changed_mind: { ar: 'تغيير رأي العميل', en: 'Customer changed mind', restock: true },
  defective: { ar: 'المنتج معيب', en: 'Defective/Damaged', restock: false },
  wrong_item: { ar: 'منتج خاطئ', en: 'Wrong item given', restock: true },
  expired: { ar: 'منتهي الصلاحية', en: 'Expired', restock: false },
  other: { ar: 'سبب آخر', en: 'Other', restock: true },
};

async function openReturnModal(container) {
  const lang = window.i18n?.getLang() || 'ar';
  const settings = await window.daftrly.getSettings();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:700px;width:95%;">
      <div class="modal-header">
        <h3>↩ ${lang === 'ar' ? 'مرتجعات — البحث عن فاتورة' : 'Returns — Find Invoice'}</h3>
        <button class="modal-close" id="return-close">✕</button>
      </div>
      <div class="modal-body" id="return-body">
        <div style="display:flex;gap:8px;margin-bottom:16px;">
          <input type="text" id="return-search" class="form-input" style="flex:1;" 
            placeholder="${lang === 'ar' ? 'أدخل رقم الفاتورة (مثال: INV-2026-0012)' : 'Enter invoice number (e.g. INV-2026-0012)'}">
          <button class="btn btn-primary" id="return-search-btn">${lang === 'ar' ? 'بحث' : 'Search'}</button>
        </div>
        <div id="return-results"></div>
      </div>
    </div>`;
  container.appendChild(overlay);

  overlay.querySelector('#return-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  const searchBtn = overlay.querySelector('#return-search-btn');
  const searchInput = overlay.querySelector('#return-search');
  const resultsDiv = overlay.querySelector('#return-results');

  const doSearch = async () => {
    const query = searchInput.value.trim();
    if (!query) return;
    
    const salesRes = await window.daftrly.query(
      'SELECT s.*, (SELECT p.method FROM payments p WHERE p.sale_id = s.id LIMIT 1) as pay_method FROM sales s WHERE s.invoice_number LIKE ? AND s.status != ? ORDER BY s.created_at DESC LIMIT 10',
      ['%' + query + '%', 'voided']);
    
    if (!salesRes.success || !salesRes.data?.length) {
      resultsDiv.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-secondary);">
        ${lang === 'ar' ? 'لم يتم العثور على فاتورة' : 'No invoice found'}
      </div>`;
      return;
    }

    resultsDiv.innerHTML = salesRes.data.map(sale => {
      const date = sale.created_at ? sale.created_at.split('T')[0] : '';
      const statusBadge = sale.status === 'fully_returned' 
        ? `<span style="color:var(--danger);">${lang === 'ar' ? '(مرتجع بالكامل)' : '(Fully returned)'}</span>`
        : sale.status === 'partially_returned'
        ? `<span style="color:var(--warning);">${lang === 'ar' ? '(مرتجع جزئي)' : '(Partially returned)'}</span>`
        : '';
      return `<div class="return-sale-item" data-sale-id="${sale.id}" style="padding:12px;border:1px solid var(--border);border-radius:8px;margin-bottom:8px;cursor:pointer;transition:background 0.15s;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <strong>${escapeHtml(sale.invoice_number)}</strong> ${statusBadge}
            <div style="font-size:12px;color:var(--text-secondary);">${date} | ${sale.pay_method === 'card' ? (lang === 'ar' ? 'بطاقة' : 'Card') : (lang === 'ar' ? 'نقد' : 'Cash')}</div>
          </div>
          <div style="font-weight:600;">${Number(sale.total).toFixed(2)} ${window.getCurrSym()}</div>
        </div>
      </div>`;
    }).join('');

    resultsDiv.querySelectorAll('.return-sale-item').forEach(el => {
      el.addEventListener('mouseenter', () => el.style.background = 'var(--accent-subtle)');
      el.addEventListener('mouseleave', () => el.style.background = '');
      el.addEventListener('click', async () => {
        const saleId = parseInt(el.dataset.saleId);
        const sale = salesRes.data.find(s => s.id === saleId);
        if (sale.status === 'fully_returned') {
          showToast(lang === 'ar' ? 'هذه الفاتورة مرتجعة بالكامل' : 'This invoice is already fully returned', 'warning');
          return;
        }
        // Check return time limit
        const returnDaysLimit = Number(settings.returnDaysLimit) || 0;
        if (returnDaysLimit > 0 && sale.created_at) {
          const saleDate = new Date(sale.created_at);
          const now = new Date();
          const daysDiff = Math.floor((now - saleDate) / (1000 * 60 * 60 * 24));
          if (daysDiff > returnDaysLimit) {
            showToast(lang === 'ar' 
              ? `تجاوز فترة الاسترجاع المسموحة (${returnDaysLimit} يوم)` 
              : `Return period exceeded (${returnDaysLimit} days)`, 'error');
            return;
          }
        }
        await openReturnItemsModal(container, overlay, sale, settings);
      });
    });
  };

  searchBtn.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
  searchInput.focus();
}

async function openReturnItemsModal(container, parentOverlay, sale, settings) {
  const lang = window.i18n?.getLang() || 'ar';
  
  // Get sale items
  const itemsRes = await window.daftrly.query(
    'SELECT si.*, p.track_stock FROM sale_items si LEFT JOIN products p ON p.id = si.product_id WHERE si.sale_id = ?', [sale.id]);
  if (!itemsRes.success || !itemsRes.data?.length) {
    showToast(lang === 'ar' ? 'لا توجد عناصر في هذه الفاتورة' : 'No items in this invoice', 'error');
    return;
  }

  // Get already returned quantities for this sale
  const returnedRes = await window.daftrly.query(
    'SELECT ri.sale_item_id, SUM(ri.quantity) as returned_qty FROM return_items ri INNER JOIN returns r ON r.id = ri.return_id WHERE r.original_sale_id = ? GROUP BY ri.sale_item_id', [sale.id]);
  const returnedMap = {};
  if (returnedRes.success && returnedRes.data) {
    returnedRes.data.forEach(r => { returnedMap[r.sale_item_id] = Number(r.returned_qty) || 0; });
  }

  const items = itemsRes.data.map(item => ({
    ...item,
    returnedQty: returnedMap[item.id] || 0,
    maxReturn: Number(item.quantity) - (returnedMap[item.id] || 0),
  })).filter(item => item.maxReturn > 0);

  if (items.length === 0) {
    showToast(lang === 'ar' ? 'جميع العناصر تم إرجاعها بالفعل' : 'All items already returned', 'warning');
    return;
  }

  parentOverlay.remove();

  const reasonOptions = Object.entries(RETURN_REASONS).map(([key, val]) => 
    `<option value="${key}">${lang === 'ar' ? val.ar : val.en}</option>`
  ).join('');

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:800px;width:95%;max-height:90vh;overflow:auto;">
      <div class="modal-header">
        <h3>↩ ${lang === 'ar' ? 'مرتجع — ' : 'Return — '}${escapeHtml(sale.invoice_number)}</h3>
        <button class="modal-close" id="return-items-close">✕</button>
      </div>
      <div class="modal-body">
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="border-bottom:2px solid var(--border);text-align:${lang === 'ar' ? 'right' : 'left'};">
              <th style="padding:8px;">✓</th>
              <th style="padding:8px;">${lang === 'ar' ? 'المنتج' : 'Product'}</th>
              <th style="padding:8px;">${lang === 'ar' ? 'الكمية' : 'Qty'}</th>
              <th style="padding:8px;">${lang === 'ar' ? 'السعر' : 'Price'}</th>
              <th style="padding:8px;">${lang === 'ar' ? 'كمية المرتجع' : 'Return Qty'}</th>
              <th style="padding:8px;">${lang === 'ar' ? 'السبب' : 'Reason'}</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((item, idx) => `
              <tr style="border-bottom:1px solid var(--border);" data-item-idx="${idx}">
                <td style="padding:8px;"><input type="checkbox" class="return-check" data-idx="${idx}" checked></td>
                <td style="padding:8px;">${escapeHtml(item.name_ar || item.name_en)}</td>
                <td style="padding:8px;">${Number(item.quantity)}${item.returnedQty > 0 ? ` <small style="color:var(--warning);">(${item.returnedQty} ${lang === 'ar' ? 'مرتجع' : 'returned'})</small>` : ''}</td>
                <td style="padding:8px;">${Number(item.unit_price).toFixed(2)}</td>
                <td style="padding:8px;">
                  <input type="text" inputmode="numeric" class="form-input return-qty" data-idx="${idx}" value="${item.maxReturn}" style="width:60px;padding:4px;">
                </td>
                <td style="padding:8px;">
                  <select class="form-input return-reason" data-idx="${idx}" style="padding:4px;font-size:12px;">${reasonOptions}</select>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div style="margin-top:16px;padding:12px;background:var(--bg-secondary);border-radius:8px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <strong>${lang === 'ar' ? 'إجمالي المرتجع:' : 'Refund Total:'}</strong>
            <strong id="return-total" style="font-size:18px;color:var(--danger);">0.00 ${window.getCurrSym()}</strong>
          </div>
          <div style="margin-bottom:12px;">
            <label style="font-size:12px;display:block;margin-bottom:4px;">${lang === 'ar' ? 'طريقة الاسترداد:' : 'Refund Method:'}</label>
            <select id="return-refund-method" class="form-input" style="padding:6px;">
              <option value="cash" ${sale.pay_method === 'cash' ? 'selected' : ''}>${lang === 'ar' ? 'نقد' : 'Cash'}</option>
              <option value="card" ${sale.pay_method === 'card' ? 'selected' : ''}>${lang === 'ar' ? 'بطاقة (استرداد)' : 'Card (reversal)'}</option>
            </select>
          </div>
          <button class="btn btn-primary" id="return-confirm-btn" style="width:100%;background:var(--danger);border-color:var(--danger);padding:12px;font-size:15px;">
            ↩ ${lang === 'ar' ? 'تأكيد المرتجع' : 'Confirm Return'}
          </button>
        </div>
      </div>
    </div>`;
  container.appendChild(overlay);

  overlay.querySelector('#return-items-close').addEventListener('click', () => overlay.remove());

  // Calculate refund total
  const isVatInclusive = window._posVat?.inclusive || false;
  const calcTotal = () => {
    let total = 0;
    overlay.querySelectorAll('.return-check').forEach(chk => {
      if (!chk.checked) return;
      const idx = parseInt(chk.dataset.idx);
      const qty = Number(overlay.querySelector(`.return-qty[data-idx="${idx}"]`).value) || 0;
      const item = items[idx];
      const lineTotal = qty * Number(item.unit_price);
      if (isVatInclusive) {
        // unit_price already includes tax — refund = lineTotal (no extra tax)
        total += lineTotal;
      } else {
        // unit_price is before tax — add tax for full refund
        const lineTax = lineTotal * (Number(item.tax_rate) / 100);
        total += lineTotal + lineTax;
      }
    });
    overlay.querySelector('#return-total').textContent = total.toFixed(2) + ' ' + window.getCurrSym();
  };

  overlay.querySelectorAll('.return-check, .return-qty').forEach(el => {
    el.addEventListener('change', calcTotal);
    el.addEventListener('input', calcTotal);
  });
  calcTotal();

  // Confirm return
  overlay.querySelector('#return-confirm-btn').addEventListener('click', async () => {
    const selectedItems = [];
    overlay.querySelectorAll('.return-check').forEach(chk => {
      if (!chk.checked) return;
      const idx = parseInt(chk.dataset.idx);
      const qty = Number(overlay.querySelector(`.return-qty[data-idx="${idx}"]`).value) || 0;
      const reason = overlay.querySelector(`.return-reason[data-idx="${idx}"]`).value;
      if (qty > 0) selectedItems.push({ ...items[idx], returnQty: qty, returnReason: reason });
    });

    if (selectedItems.length === 0) {
      showToast(lang === 'ar' ? 'اختر عنصر واحد على الأقل' : 'Select at least one item', 'warning');
      return;
    }

    // Manager approval check
    const approvalThreshold = Number(settings.returnApprovalThreshold) || 0;
    const isVatIncl = window._posVat?.inclusive || false;
    let totalRefund = 0;
    selectedItems.forEach(item => {
      const lineTotal = item.returnQty * Number(item.unit_price);
      if (isVatIncl) {
        totalRefund += lineTotal; // price already includes tax
      } else {
        const lineTax = lineTotal * (Number(item.tax_rate) / 100);
        totalRefund += lineTotal + lineTax;
      }
    });

    if (approvalThreshold > 0 && totalRefund >= approvalThreshold) {
      const isAdmin = window._currentUser?.role === 'admin';
      if (!isAdmin) {
        const authorized = await window.requestManagerAuth(
          lang === 'ar' ? `⚠️ مبلغ المرتجع ${totalRefund.toFixed(2)} يتجاوز الحد ${approvalThreshold}\n\nمطلوب موافقة المدير`
            : `⚠️ Return amount ${totalRefund.toFixed(2)} exceeds threshold ${approvalThreshold}\n\nManager approval required`
        );
        if (!authorized) return;
      }
    }

    // Process the return
    try {
      const refundMethod = overlay.querySelector('#return-refund-method').value;
      const retSeq = await window.daftrly.nextSequence('return');
      const returnNumber = 'RET-' + new Date().getFullYear() + '-' + String(retSeq).padStart(4, '0');

      // Determine return type
      const allReturned = selectedItems.every(si => si.returnQty >= si.maxReturn) && selectedItems.length === items.length;
      const returnType = allReturned ? 'full' : 'partial';

      // Insert return record
      const returnRes = await window.daftrly.query(
        'INSERT INTO returns (original_sale_id, return_number, total_refund, reason, refund_method, status, return_type, original_invoice_number, cashier_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,datetime(\'now\'))',
        [sale.id, returnNumber, totalRefund, selectedItems.map(i => RETURN_REASONS[i.returnReason]?.[lang === 'ar' ? 'ar' : 'en'] || i.returnReason).join(', '), refundMethod, 'completed', returnType, sale.invoice_number, 1]);
      
      const returnId = returnRes.data?.lastInsertId;

      // Insert return items + update stock
      for (const item of selectedItems) {
        const restock = RETURN_REASONS[item.returnReason]?.restock ? 1 : 0;
        const lineTotal = item.returnQty * Number(item.unit_price);
        let lineTax, refundAmount;
        if (isVatIncl) {
          lineTax = lineTotal - (lineTotal / (1 + Number(item.tax_rate) / 100));
          refundAmount = lineTotal; // inclusive — total is the refund
        } else {
          lineTax = lineTotal * (Number(item.tax_rate) / 100);
          refundAmount = lineTotal + lineTax; // exclusive — add tax
        }

        await window.daftrly.query(
          'INSERT INTO return_items (return_id, sale_item_id, quantity, refund_amount, product_id, product_name, unit_price, tax_rate, tax_amount, return_reason, restock) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
          [returnId, item.id, item.returnQty, refundAmount, item.product_id, item.name_ar || item.name_en, item.unit_price, item.tax_rate, lineTax, item.returnReason, restock]);

        // Stock update
        if (item.product_id && item.track_stock) {
          if (restock) {
            await window.daftrly.query('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?', [item.returnQty, item.product_id]);
            await window.daftrly.query(
              'INSERT INTO stock_movements (product_id, movement_type, quantity, reference_type, reference_id, notes, created_at) VALUES (?,?,?,?,?,?,datetime(\'now\'))',
              [item.product_id, 'return', item.returnQty, 'return', returnId, 'Return to stock: ' + (RETURN_REASONS[item.returnReason]?.en || item.returnReason)]);
          } else {
            await window.daftrly.query(
              'INSERT INTO stock_movements (product_id, movement_type, quantity, reference_type, reference_id, notes, created_at) VALUES (?,?,?,?,?,?,datetime(\'now\'))',
              [item.product_id, 'write_off', item.returnQty, 'return', returnId, 'Write-off: ' + (RETURN_REASONS[item.returnReason]?.en || item.returnReason)]);
          }
        }
      }

      // Update original sale status
      const newStatus = allReturned ? 'fully_returned' : 'partially_returned';
      await window.daftrly.query('UPDATE sales SET status = ? WHERE id = ?', [newStatus, sale.id]);

      // ZATCA Credit Note (if Phase 2 enabled) — runs in background, doesn't block return
      if (settings.zatcaMode === 'phase2' || settings.zatcaMode === 'phase2_sandbox') {
        ((rId, rNum, saleObj, selItems, refMethod, refundTotal) => {
          (async () => {
            try {
              const vatRate = settings.vat?.rate || 15;
              const vatIncl = settings.vat?.inclusive || false;
              const creditNoteItems = selItems.map(item => {
                // Use per-item tax_rate from sale_items (0 for zero-rated/exempt)
                const itemVatRate = Number(item.tax_rate) || 0;
                const lineAmt = item.returnQty * Number(item.unit_price);
                let netPrice, taxAmt, totalAmt;
                if (vatIncl && itemVatRate > 0) {
                  netPrice = Number(item.unit_price) / (1 + itemVatRate / 100);
                  taxAmt = lineAmt - (lineAmt / (1 + itemVatRate / 100));
                  totalAmt = lineAmt;
                } else {
                  netPrice = Number(item.unit_price);
                  taxAmt = lineAmt * (itemVatRate / 100);
                  totalAmt = lineAmt + taxAmt;
                }
                return {
                  name: item.name_ar || item.name_en || 'Item',
                  quantity: item.returnQty,
                  unitPrice: netPrice,
                  taxRate: itemVatRate,
                  taxAmount: taxAmt,
                  total: totalAmt,
                };
              });
              const creditNoteData = {
                invoiceNumber: rNum, typeCode: '381',
                canceledInvoiceNumber: saleObj.zatca_invoice_counter || 1,
                paymentMethod: refMethod === 'card' ? '48' : '10',
                cancelReason: 'Return',
                subtotal: creditNoteItems.reduce((s, i) => s + i.quantity * i.unitPrice, 0),
                taxAmount: creditNoteItems.reduce((s, i) => s + i.taxAmount, 0),
                total: refundTotal, lineItems: creditNoteItems,
              };
              window.dbg('info', 'ZATCA credit note (background)...');
              const zatcaResult = await window.daftrly.zatcaReportInvoice(creditNoteData);
              if (zatcaResult && zatcaResult.success) {
                await window.daftrly.query('UPDATE returns SET zatca_status = ?, zatca_uuid = ?, zatca_hash = ? WHERE id = ?',
                  ['reported', zatcaResult.uuid || '', zatcaResult.invoiceHash || '', rId]);
              } else {
                await window.daftrly.query('UPDATE returns SET zatca_status = ? WHERE id = ?', ['failed', rId]);
              }
            } catch (e) {
              window.dbg('warn', 'ZATCA credit note error:', e.message);
              try { await window.daftrly.query('UPDATE returns SET zatca_status = ? WHERE id = ?', ['failed', rId]); } catch(_) {}
            }
          })();
        })(returnId, returnNumber, sale, selectedItems, refundMethod, totalRefund);
      }

      overlay.remove();
      showToast(lang === 'ar' 
        ? `✅ تم المرتجع ${returnNumber} — المبلغ: ${totalRefund.toFixed(2)} ${window.getCurrSym()}` 
        : `✅ Return ${returnNumber} processed — Refund: ${totalRefund.toFixed(2)} ${window.getCurrSym()}`, 'success');
      
      // Auto drawer kick for cash refunds
      if (refundMethod === 'cash') {
        const prSettings = settings.printer || {};
        if (prSettings.drawerKick && prSettings.type === 'network' && prSettings.ip) {
          window.daftrly.printerSend(prSettings.ip, prSettings.port || 9100, 'drawer').catch(() => {});
        }
      }

      window.dbg('success', `Return processed: ${returnNumber}, refund: ${totalRefund.toFixed(2)}, items: ${selectedItems.length}`);
      window.logAudit('refund', 'returns', returnId, `${returnNumber} | ${totalRefund.toFixed(2)} ${window.getCurrSym()} | ${selectedItems.length} items`);

      // Qoyod sync for returns
      if (returnId && typeof window.qoyodSyncReturn === 'function') {
        window.qoyodSyncReturn(returnId).catch(e => console.error('Qoyod return sync:', e));
      }
    } catch (err) {
      showToast(lang === 'ar' ? 'خطأ في معالجة المرتجع: ' + err.message : 'Return processing error: ' + err.message, 'error');
      window.dbg('error', 'Return processing error:', err.message);
    }
  });
}

// ============ EXCHANGE FLOW ============
async function openExchangeModal(container) {
  const lang = window.i18n.getLang();
  const settings = await window.daftrly.getSettings();
  const vatRate = settings.vat?.rate || 15;
  const vatEnabled = settings.vat?.enabled;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:650px;width:95%;">
      <div class="modal-header">
        <h3>🔄 ${lang === 'ar' ? 'استبدال منتج' : 'Product Exchange'}</h3>
        <button class="modal-close" id="exc-close">✕</button>
      </div>
      <div class="modal-body" style="padding:20px;">
        <div style="margin-bottom:16px;">
          <label class="form-label">${lang === 'ar' ? 'رقم الفاتورة الأصلية' : 'Original Invoice Number'}</label>
          <div style="display:flex;gap:8px;">
            <input type="text" id="exc-inv" class="form-input" placeholder="${lang === 'ar' ? 'INV-2026-0001' : 'INV-2026-0001'}" autofocus>
            <button class="btn btn-primary btn-sm" id="exc-search">${lang === 'ar' ? 'بحث' : 'Search'}</button>
          </div>
        </div>
        <div id="exc-content"></div>
      </div>
    </div>
  `;
  overlay.style.display = 'flex';
  document.body.appendChild(overlay);
  setTimeout(() => overlay.querySelector('#exc-inv')?.focus(), 100);

  const close = () => overlay.remove();
  overlay.querySelector('#exc-close').addEventListener('click', close);

  overlay.querySelector('#exc-search').addEventListener('click', async () => {
    const invNum = overlay.querySelector('#exc-inv').value.trim();
    if (!invNum) return;

    const saleRes = await window.daftrly.query(
      `SELECT s.*, si.id as item_id, si.product_id, si.name_ar, si.name_en, si.quantity, si.unit_price, si.total as line_total
       FROM sales s JOIN sale_items si ON si.sale_id = s.id WHERE s.invoice_number = ? AND s.status = 'completed'`, [invNum]);

    if (!saleRes.success || !saleRes.data?.length) {
      overlay.querySelector('#exc-content').innerHTML = `<div style="color:var(--danger);text-align:center;padding:20px;">${lang === 'ar' ? '❌ فاتورة غير موجودة' : '❌ Invoice not found'}</div>`;
      return;
    }

    const items = saleRes.data;
    const sale = items[0];

    overlay.querySelector('#exc-content').innerHTML = `
      <div style="margin-bottom:12px;padding:10px;background:var(--bg-secondary);border-radius:8px;">
        <strong>${invNum}</strong> — ${sale.created_at?.substring(0, 10)} — ${formatCurrency(sale.total)}
      </div>
      <div style="font-weight:700;margin-bottom:8px;">↩ ${lang === 'ar' ? 'المنتج المرتجع:' : 'Item to return:'}</div>
      ${items.map((it, idx) => `
        <label style="display:flex;gap:8px;padding:8px;border:1px solid var(--border);border-radius:6px;margin-bottom:4px;cursor:pointer;align-items:center;">
          <input type="radio" name="exc-item" value="${idx}" ${idx === 0 ? 'checked' : ''}>
          <span style="flex:1;font-weight:600;">${lang === 'ar' ? it.name_ar : (it.name_en || it.name_ar)}</span>
          <span>${it.quantity} × ${Number(it.unit_price).toFixed(2)}</span>
          <span style="font-weight:700;">${Number(it.line_total).toFixed(2)}</span>
        </label>
      `).join('')}
      <div class="form-group" style="margin-top:8px;">
        <label class="form-label">${lang === 'ar' ? 'كمية الإرجاع:' : 'Return qty:'}</label>
        <input type="text" inputmode="numeric" id="exc-ret-qty" class="form-input" value="1" style="width:100px;">
      </div>
      <div style="border-top:1px solid var(--border);margin:16px 0;padding-top:16px;">
        <div style="font-weight:700;margin-bottom:8px;">➕ ${lang === 'ar' ? 'المنتج الجديد:' : 'New item:'}</div>
        <input type="text" id="exc-new-search" class="form-input" placeholder="${lang === 'ar' ? 'ابحث بالاسم أو امسح الباركود...' : 'Search by name or scan barcode...'}">
        <div id="exc-new-results" style="max-height:150px;overflow-y:auto;margin-top:4px;"></div>
        <div id="exc-new-selected" style="display:none;padding:10px;background:var(--bg-tertiary);border-radius:8px;margin-top:8px;"></div>
      </div>
      <div id="exc-summary" style="display:none;border-top:2px solid var(--border);margin-top:16px;padding-top:16px;"></div>
    `;

    let selectedNewProduct = null;
    let newQty = 1;

    overlay.querySelectorAll('input[name="exc-item"]').forEach(radio => {
      radio.addEventListener('change', () => {
        const si = items[parseInt(radio.value)];
        overlay.querySelector('#exc-ret-qty').max = si.quantity;
        overlay.querySelector('#exc-ret-qty').value = 1;
        updateSummary();
      });
    });
    overlay.querySelector('#exc-ret-qty')?.addEventListener('change', updateSummary);

    let sTimer;
    overlay.querySelector('#exc-new-search').addEventListener('input', (e) => {
      clearTimeout(sTimer);
      sTimer = setTimeout(async () => {
        const q = e.target.value.trim();
        if (!q || q.length < 2) { overlay.querySelector('#exc-new-results').innerHTML = ''; return; }
        const res = await window.daftrly.query(
          'SELECT * FROM products WHERE is_active = 1 AND (name_ar LIKE ? OR name_en LIKE ? OR barcode = ? OR sku = ?) LIMIT 8',
          [`%${q}%`, `%${q}%`, q, q]);
        const prods = res.success ? (res.data || []) : [];
        overlay.querySelector('#exc-new-results').innerHTML = prods.map(p => `
          <div class="exc-prod-item" data-id="${p.id}" style="padding:8px;border:1px solid var(--border);border-radius:6px;margin-bottom:4px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;">
            <span style="font-weight:600;">${lang === 'ar' ? p.name_ar : (p.name_en || p.name_ar)}</span>
            <span style="font-weight:700;color:var(--accent);">${formatCurrency(p.price)}</span>
          </div>
        `).join('') || `<div style="padding:10px;color:var(--text-tertiary);text-align:center;">${lang === 'ar' ? 'لا نتائج' : 'No results'}</div>`;

        overlay.querySelectorAll('.exc-prod-item').forEach(item => {
          item.addEventListener('click', () => {
            const prod = prods.find(p => p.id === parseInt(item.dataset.id));
            if (!prod) return;
            selectedNewProduct = prod;
            newQty = 1;
            const isDec = ['kg','gram','meter','sqm','liter','hour'].includes(prod.unit);
            overlay.querySelector('#exc-new-results').innerHTML = '';
            overlay.querySelector('#exc-new-search').value = '';
            overlay.querySelector('#exc-new-selected').style.display = 'block';
            overlay.querySelector('#exc-new-selected').innerHTML = `
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div>
                  <div style="font-weight:700;">${lang === 'ar' ? prod.name_ar : (prod.name_en || prod.name_ar)}</div>
                  <div style="font-size:12px;color:var(--text-secondary);">${formatCurrency(prod.price)} ${prod.unit ? '/ ' + prod.unit : ''}</div>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                  <label style="font-size:12px;">${lang === 'ar' ? 'الكمية:' : 'Qty:'}</label>
                  <input type="text" inputmode="${isDec ? 'decimal' : 'numeric'}" id="exc-new-qty" class="form-input" value="1" style="width:80px;">
                  <button id="exc-remove-new" style="background:none;border:none;color:var(--danger);cursor:pointer;font-size:16px;">✕</button>
                </div>
              </div>`;
            overlay.querySelector('#exc-new-qty').addEventListener('change', (ev) => { newQty = parseFloat(ev.target.value) || 1; updateSummary(); });
            overlay.querySelector('#exc-remove-new').addEventListener('click', () => { selectedNewProduct = null; overlay.querySelector('#exc-new-selected').style.display = 'none'; overlay.querySelector('#exc-summary').style.display = 'none'; });
            updateSummary();
          });
        });
      }, 200);
    });

    function updateSummary() {
      if (!selectedNewProduct) return;
      const si = parseInt(overlay.querySelector('input[name="exc-item"]:checked')?.value || 0);
      const retItem = items[si];
      const retQty = parseInt(overlay.querySelector('#exc-ret-qty')?.value) || 1;
      const retAmt = retQty * Number(retItem.unit_price);
      const newAmt = newQty * selectedNewProduct.price;
      const diff = newAmt - retAmt;
      let diffHtml, actionHtml;
      if (diff > 0) {
        diffHtml = `<div style="font-size:18px;font-weight:900;color:var(--success);">${lang === 'ar' ? 'العميل يدفع:' : 'Customer pays:'} ${formatCurrency(diff)}</div>`;
        actionHtml = `<button class="btn" id="exc-pay-cash" style="flex:1;height:44px;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;background:var(--success);color:#fff;">💵 ${lang === 'ar' ? 'نقدي' : 'Cash'}</button>
          <button class="btn" id="exc-pay-card" style="flex:1;height:44px;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;background:var(--accent);color:#fff;">💳 ${lang === 'ar' ? 'بطاقة' : 'Card'}</button>`;
      } else if (diff < 0) {
        diffHtml = `<div style="font-size:18px;font-weight:900;color:var(--danger);">${lang === 'ar' ? 'مبلغ مسترد للعميل:' : 'Refund to customer:'} ${formatCurrency(Math.abs(diff))}</div>`;
        actionHtml = `<button class="btn" id="exc-refund" style="flex:1;height:44px;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;background:var(--danger);color:#fff;">💵 ${lang === 'ar' ? 'استرداد نقدي' : 'Cash Refund'}</button>`;
      } else {
        diffHtml = `<div style="font-size:18px;font-weight:900;color:#D4A853;">${lang === 'ar' ? 'لا يوجد فرق — استبدال مباشر' : 'No difference — even exchange'}</div>`;
        actionHtml = `<button class="btn" id="exc-even" style="flex:1;height:44px;border:none;border-radius:8px;font-size:15px;font-weight:700;cursor:pointer;background:#D4A853;color:#000;">✅ ${lang === 'ar' ? 'تأكيد الاستبدال' : 'Confirm Exchange'}</button>`;
      }
      const sumEl = overlay.querySelector('#exc-summary');
      sumEl.style.display = 'block';
      sumEl.innerHTML = `
        <div style="font-family:var(--font-mono);font-size:13px;margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;padding:4px 0;color:var(--danger);">
            <span>↩ ${retItem.name_ar} ×${retQty}</span><span>-${formatCurrency(retAmt)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:4px 0;color:var(--success);">
            <span>➕ ${selectedNewProduct.name_ar} ×${newQty}</span><span>+${formatCurrency(newAmt)}</span>
          </div>
          <div style="border-top:1px dashed var(--border);margin-top:6px;padding-top:6px;display:flex;justify-content:space-between;font-weight:700;">
            <span>${lang === 'ar' ? 'الفرق:' : 'Difference:'}</span><span>${diff >= 0 ? '' : '-'}${formatCurrency(Math.abs(diff))}</span>
          </div>
        </div>
        ${diffHtml}
        <div style="display:flex;gap:8px;margin-top:12px;">${actionHtml}</div>`;

      const doExchange = async (payMethod) => {
       try {
        const refundAmt = retAmt;
        const retSeqEx = await window.daftrly.nextSequence('return');
        const returnNumber = 'RET-' + new Date().getFullYear() + '-' + String(retSeqEx).padStart(4, '0');
        await window.daftrly.query('INSERT INTO returns (original_sale_id, return_number, total_refund, reason, refund_method, status, return_type, original_invoice_number, cashier_id, created_at) VALUES (?,?,?,?,?,?,?,?,1,datetime(\'now\'))',
          [sale.id, returnNumber, refundAmt, 'exchange', 'credit', 'completed', 'partial', invNum]);
        const retIdR = await window.daftrly.query('SELECT last_insert_rowid() as id');
        const returnId = retIdR.success && retIdR.data?.[0] ? retIdR.data[0].id : null;
        if (returnId) await window.daftrly.query('INSERT INTO return_items (return_id, product_id, product_name, quantity, unit_price, return_reason) VALUES (?,?,?,?,?,?)', [returnId, retItem.product_id, retItem.name_ar, retQty, retItem.unit_price, 'exchange']);
        await window.daftrly.query('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?', [retQty, retItem.product_id]);

        const newTax = vatEnabled ? (settings.vat?.inclusive ? newAmt * (vatRate / (100 + vatRate)) : newAmt * (vatRate / 100)) : 0;
        const newTotal = settings.vat?.inclusive ? newAmt : newAmt + newTax;
        const effectiveTotal = Math.max(0, newTotal - retAmt);
        const invNum = await window.daftrly.nextSequence('invoice');
        const exFmt = settings.invoiceFormat || {};
        const exPrefix = exFmt.prefix || 'INV';
        const exSep = exFmt.separator || '-';
        const exDigits = exFmt.sequenceDigits || 5;
        const exBlocks = exFmt.blocks || ['prefix', 'year', 'sequence'];
        const exBranch = exFmt.branchCode || '01';
        const exNow = new Date();
        const invoiceNumber = exBlocks.map(b => {
          switch (b) { case 'prefix': return exPrefix; case 'year': return exNow.getFullYear(); case 'month': return String(exNow.getMonth() + 1).padStart(2, '0'); case 'day': return String(exNow.getDate()).padStart(2, '0'); case 'branch': return exBranch; case 'sequence': return String(invNum).padStart(exDigits, '0'); default: return ''; }
        }).filter(Boolean).join(exSep);
        const saleR = await window.daftrly.query('INSERT INTO sales (invoice_number, subtotal, discount_amount, discount_type, tax_amount, total, paid_amount, change_amount, payment_status, status, exchange_credit, payment_method, cashier_id, created_at) VALUES (?,?,?,\'fixed\',?,?,?,0,\'paid\',\'completed\',?,?,1,datetime(\'now\'))',
          [invoiceNumber, newAmt, retAmt, newTax, effectiveTotal, effectiveTotal, retAmt, payMethod]);
        const newSaleId = saleR.success && saleR.data ? saleR.data.lastInsertId : 0;
        if (newSaleId) {
          await window.daftrly.query('INSERT INTO sale_items (sale_id, product_id, name_ar, name_en, quantity, unit_price, tax_amount, total) VALUES (?,?,?,?,?,?,?,?)', [newSaleId, selectedNewProduct.id, selectedNewProduct.name_ar, selectedNewProduct.name_en || '', newQty, selectedNewProduct.price, newTax, newAmt]);
          if (selectedNewProduct.track_stock) await window.daftrly.query('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?', [newQty, selectedNewProduct.id]);
          await window.daftrly.query('INSERT INTO payments (sale_id, method, amount) VALUES (?,?,?)', [newSaleId, payMethod, effectiveTotal]);
        }
        if (settings.zatcaMode && settings.zatcaMode !== 'off') {
          // Background — don't block exchange completion
          const _returnId = returnId;
          const _newSaleId = newSaleId;
          const _vatRate = vatRate;
          const _isIncl = settings.vat?.inclusive || false;
          setTimeout(async () => {
            try {
              // 1. Credit note for returned item — use per-item tax_rate from sale_items
              const retItemVatRate = Number(retItem.tax_rate) || 0;
              const retNetPrice = (_isIncl && retItemVatRate > 0) ? Number(retItem.unit_price) / (1 + retItemVatRate / 100) : Number(retItem.unit_price);
              const retTaxAmt = retNetPrice * (retItemVatRate / 100);
              const creditNoteData = {
                invoiceNumber: returnNumber, typeCode: '381',
                canceledInvoiceNumber: sale.zatca_invoice_counter || 1,
                paymentMethod: payMethod === 'card' ? '48' : '10',
                cancelReason: 'Exchange',
                subtotal: retQty * retNetPrice,
                taxAmount: retQty * retTaxAmt,
                total: retQty * (retNetPrice + retTaxAmt),
                lineItems: [{
                  name: retItem.name_ar || retItem.name_en || 'Item',
                  quantity: retQty, unitPrice: retNetPrice,
                  taxRate: retItemVatRate, taxAmount: retQty * retTaxAmt,
                  total: retQty * (retNetPrice + retTaxAmt),
                }],
              };
              await window.daftrly.zatcaReportInvoice(creditNoteData);
            } catch(e) { window.dbg('warn', 'ZATCA exchange credit note error:', e.message); }
            try {
              // 2. New sale invoice — use product's tax_status
              if (_newSaleId) {
                const newItemTaxStatus = selectedNewProduct.tax_status || 'standard';
                const newItemVatRate = (settings.vat?.enabled && newItemTaxStatus === 'standard') ? _vatRate : 0;
                const newNetPrice = (_isIncl && newItemVatRate > 0) ? selectedNewProduct.price / (1 + newItemVatRate / 100) : selectedNewProduct.price;
                const newTaxAmt2 = newNetPrice * (newItemVatRate / 100);
                const newInvoiceData = {
                  invoiceNumber: invoiceNumber, saleId: _newSaleId,
                  subtotal: newQty * newNetPrice,
                  taxAmount: newQty * newTaxAmt2,
                  total: effectiveTotal,
                  discountAmount: retAmt,
                  lineItems: [{
                    name: selectedNewProduct.name_ar || selectedNewProduct.name_en || 'Item',
                    quantity: newQty, unitPrice: newNetPrice,
                    taxRate: newItemVatRate, taxAmount: newQty * newTaxAmt2,
                    total: newQty * (newNetPrice + newTaxAmt2),
                  }],
                };
                await window.daftrly.zatcaReportInvoice(newInvoiceData);
              }
            } catch(e) { window.dbg('warn', 'ZATCA exchange new sale error:', e.message); }
          }, 100);
        }
        window.logAudit('refund', 'returns', returnId, `Exchange | ${invNum} → ${invoiceNumber} | ${retItem.name_ar} → ${selectedNewProduct.name_ar} | diff: ${diff.toFixed(2)}`);
        if (payMethod === 'cash' && settings.printer?.drawerKick && settings.printer?.type === 'network' && settings.printer?.ip) {
          window.daftrly.printerSend(settings.printer.ip, settings.printer.port || 9100, 'drawer').catch(() => {});
        }
        showToast(lang === 'ar' ? `✅ تم الاستبدال — ${invoiceNumber}` : `✅ Exchange complete — ${invoiceNumber}`, 'success');
        close();
        if (settings.printer?.autoPrint) printReceipt(invoiceNumber, effectiveTotal, 0, payMethod).catch(e => window.dbg('warn', 'Auto-print error:', e.message));
       } catch (exchErr) {
        window.dbg('error', 'Exchange error:', exchErr.message);
        showToast(window.i18n.getLang() === 'ar' ? `❌ خطأ في الاستبدال: ${exchErr.message}` : `❌ Exchange error: ${exchErr.message}`, 'error');
       }
      };

      sumEl.querySelector('#exc-pay-cash')?.addEventListener('click', () => doExchange('cash'));
      sumEl.querySelector('#exc-pay-card')?.addEventListener('click', () => doExchange('card'));
      sumEl.querySelector('#exc-refund')?.addEventListener('click', () => doExchange('cash'));
      sumEl.querySelector('#exc-even')?.addEventListener('click', () => doExchange('exchange'));
    }
  });
}

// ============ EXPOSE ============
window.renderPOS = renderPOS;
