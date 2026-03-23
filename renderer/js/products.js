// ============================================
// NAQDI - MODULE 3: PRODUCT MANAGEMENT
// Full CRUD for products and categories
// ============================================

// ============ STATE ============
let productsView = 'grid'; // 'grid' or 'list'
let productsFilter = { category: null, search: '', status: 'active', type: 'all', stock: 'all' };
let editingProduct = null;
let showCategoryManager = false;

// ============ MAIN RENDER ============
async function renderProducts(container) {
  const lang = window.i18n.getLang();
  window.dbg('nav', 'Rendering Products page');

  container.innerHTML = `
    <div class="products-page slide-in">
      <!-- Top Bar: Search + Actions -->
      <div class="products-toolbar">
        <div class="products-search-wrap">
          <div class="products-search-icon">${window.icons.getIcon('search')}</div>
          <input type="text" id="products-search" class="products-search" 
            placeholder="${lang === 'ar' ? 'ابحث عن منتج... (اسم، باركود، SKU)' : 'Search products... (name, barcode, SKU)'}"
            value="${productsFilter.search}">
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <select id="pf-type" class="form-input form-select" style="font-size:12px;padding:4px 8px;width:auto;">
            <option value="all" ${productsFilter.type === 'all' ? 'selected' : ''}>${lang === 'ar' ? 'الكل' : 'All Types'}</option>
            <option value="product" ${productsFilter.type === 'product' ? 'selected' : ''}>📦 ${lang === 'ar' ? 'منتج' : 'Product'}</option>
            <option value="service" ${productsFilter.type === 'service' ? 'selected' : ''}>🔧 ${lang === 'ar' ? 'خدمة' : 'Service'}</option>
          </select>
          <select id="pf-stock" class="form-input form-select" style="font-size:12px;padding:4px 8px;width:auto;">
            <option value="all" ${productsFilter.stock === 'all' ? 'selected' : ''}>${lang === 'ar' ? 'كل المخزون' : 'All Stock'}</option>
            <option value="low" ${productsFilter.stock === 'low' ? 'selected' : ''}>⚠️ ${lang === 'ar' ? 'مخزون منخفض' : 'Low Stock'}</option>
            <option value="out" ${productsFilter.stock === 'out' ? 'selected' : ''}>🔴 ${lang === 'ar' ? 'نفد المخزون' : 'Out of Stock'}</option>
          </select>
        </div>
        <div class="products-actions">
          ${window.hasPermission('products_add') ? `<button class="btn btn-secondary btn-sm" id="btn-import-products" title="${lang === 'ar' ? 'استيراد من Excel' : 'Import from Excel'}">
            📥 <span>${lang === 'ar' ? 'استيراد' : 'Import'}</span>
          </button>` : ''}
          <button class="btn btn-secondary btn-sm" id="btn-export-products" title="${lang === 'ar' ? 'تصدير إلى Excel' : 'Export to Excel'}">
            📤 <span>${lang === 'ar' ? 'تصدير' : 'Export'}</span>
          </button>
          <button class="btn btn-secondary btn-sm" id="btn-manage-categories">
            ${window.icons.getIcon('settings')}
            <span>${lang === 'ar' ? 'التصنيفات' : 'Categories'}</span>
          </button>
          ${window.hasPermission('products_add') ? `<button class="btn btn-primary btn-sm" id="btn-add-product">
            ${window.icons.getIcon('plus')}
            <span>${lang === 'ar' ? 'منتج جديد' : 'New Product'}</span>
          </button>` : ''}
        </div>
      </div>

      <!-- Category Filter Chips -->
      <div class="category-chips" id="category-chips"></div>

      <!-- Products Grid/List -->
      <div class="products-container" id="products-container">
        <div class="products-loading">${lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}</div>
      </div>
    </div>

    <!-- Modal Overlay -->
    <div class="modal-overlay" id="modal-overlay" style="display:none">
      <div class="modal" id="modal-content"></div>
    </div>
  `;

  // Bind toolbar events
  const addProdBtn = container.querySelector('#btn-add-product');
  if (addProdBtn) addProdBtn.addEventListener('click', () => {
    editingProduct = null;
    openProductModal(container);
  });
  container.querySelector('#btn-manage-categories').addEventListener('click', () => {
    openCategoryManager(container);
  });
  const importBtn = container.querySelector('#btn-import-products');
  if (importBtn) importBtn.addEventListener('click', () => {
    openImportWizard(container);
  });
  container.querySelector('#btn-export-products').addEventListener('click', async () => {
    await exportProducts();
  });

  // Search with debounce
  let searchTimer;
  container.querySelector('#products-search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      productsFilter.search = e.target.value;
      window._productsPage = 1;
      window.dbg('ui', 'Product search', { query: productsFilter.search });
      loadProducts(container);
    }, 300);
  });

  // Type and stock filters
  container.querySelector('#pf-type').addEventListener('change', (e) => {
    productsFilter.type = e.target.value;
    window._productsPage = 1;
    loadProducts(container);
  });
  container.querySelector('#pf-stock').addEventListener('change', (e) => {
    productsFilter.stock = e.target.value;
    window._productsPage = 1;
    loadProducts(container);
  });

  // Load categories and products
  await loadCategoryChips(container);
  await loadProducts(container);
}

// ============ LOAD CATEGORY CHIPS ============
async function loadCategoryChips(container) {
  const lang = window.i18n.getLang();
  const result = await window.daftrly.query('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order, name_ar');
  const categories = (result.success && result.data) ? result.data : [];
  window.dbg('load', `Categories loaded: ${categories.length}`);

  const chipsEl = container.querySelector('#category-chips');
  if (!chipsEl) return;

  chipsEl.innerHTML = `
    <button class="category-chip ${productsFilter.category === null ? 'active' : ''}" data-cat="all">
      ${lang === 'ar' ? 'الكل' : 'All'}
    </button>
    ${categories.map(c => `
      <button class="category-chip ${productsFilter.category === c.id ? 'active' : ''}" 
        data-cat="${c.id}" style="--chip-color: ${c.color || '#2563EB'}">
        <span class="chip-dot" style="background:${c.color || '#2563EB'}"></span>
        ${lang === 'ar' ? c.name_ar : (c.name_en || c.name_ar)}
      </button>
    `).join('')}
  `;

  chipsEl.querySelectorAll('.category-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const catVal = chip.dataset.cat;
      productsFilter.category = catVal === 'all' ? null : parseInt(catVal);
      chipsEl.querySelectorAll('.category-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      window.dbg('ui', 'Category filter', { category: productsFilter.category });
      loadProducts(container);
    });
  });
}

// ============ LOAD PRODUCTS ============
async function loadProducts(container) {
  const lang = window.i18n.getLang();
  const perPage = 50;
  const page = window._productsPage || 1;
  const offset = (page - 1) * perPage;

  let sql = `SELECT p.*, c.name_ar as cat_name_ar, c.name_en as cat_name_en, c.color as cat_color 
             FROM products p LEFT JOIN categories c ON p.category_id = c.id 
             WHERE p.is_active = 1`;
  let countSql = `SELECT COUNT(*) as total FROM products p WHERE p.is_active = 1`;
  const params = [];
  const countParams = [];

  if (productsFilter.category) {
    sql += ' AND p.category_id = ?';
    countSql += ' AND p.category_id = ?';
    params.push(productsFilter.category);
    countParams.push(productsFilter.category);
  }
  if (productsFilter.search) {
    sql += ' AND (p.name_ar LIKE ? OR p.name_en LIKE ? OR p.barcode LIKE ? OR p.sku LIKE ?)';
    countSql += ' AND (p.name_ar LIKE ? OR p.name_en LIKE ? OR p.barcode LIKE ? OR p.sku LIKE ?)';
    const q = `%${productsFilter.search}%`;
    params.push(q, q, q, q);
    countParams.push(q, q, q, q);
  }
  if (productsFilter.type && productsFilter.type !== 'all') {
    sql += ' AND p.product_type = ?';
    countSql += ' AND p.product_type = ?';
    params.push(productsFilter.type);
    countParams.push(productsFilter.type);
  }
  if (productsFilter.stock === 'low') {
    sql += ' AND p.track_stock = 1 AND p.stock_quantity <= p.reorder_level AND p.reorder_level > 0';
    countSql += ' AND p.track_stock = 1 AND p.stock_quantity <= p.reorder_level AND p.reorder_level > 0';
  } else if (productsFilter.stock === 'out') {
    sql += ' AND p.track_stock = 1 AND p.stock_quantity <= 0';
    countSql += ' AND p.track_stock = 1 AND p.stock_quantity <= 0';
  }
  sql += ' ORDER BY p.is_favorite DESC, p.name_ar ASC LIMIT ? OFFSET ?';
  params.push(perPage, offset);

  const countRes = await window.daftrly.query(countSql, countParams);
  const total = countRes.success && countRes.data?.[0] ? countRes.data[0].total : 0;
  const totalPages = Math.ceil(total / perPage);

  const result = await window.daftrly.query(sql, params);
  const products = (result.success && result.data) ? result.data : [];
  window.dbg('load', `Products loaded: ${products.length} of ${total} (page ${page}/${totalPages})`);

  const productsEl = container.querySelector('#products-container');
  if (!productsEl) return;

  if (products.length === 0 && page === 1) {
    productsEl.innerHTML = `
      <div class="empty-state">
        <div style="font-size:56px;margin-bottom:16px;opacity:0.15;">📦</div>
        <div class="empty-state-title">${productsFilter.search 
          ? (lang === 'ar' ? 'لا توجد نتائج' : 'No results found')
          : (lang === 'ar' ? 'لا توجد منتجات بعد' : 'No products yet')}</div>
        <div class="empty-state-desc">${productsFilter.search
          ? (lang === 'ar' ? 'جرّب كلمات بحث مختلفة' : 'Try different search terms')
          : (lang === 'ar' ? 'أضف أول منتج لبدء البيع' : 'Add your first product to start selling')}</div>
      </div>
    `;
    return;
  }

  // Render product cards
  const settings = await window.daftrly.getSettings();
  const currency = settings.currency || {};

  productsEl.innerHTML = `
    <div class="products-grid">
      ${products.map(p => {
        const name = lang === 'ar' ? p.name_ar : (p.name_en || p.name_ar);
        const catName = lang === 'ar' ? (p.cat_name_ar || '') : (p.cat_name_en || p.cat_name_ar || '');
        const price = formatCurrency(p.price);
        const stockClass = p.track_stock && p.stock_quantity <= p.reorder_level ? 'stock-low' : 'stock-ok';
        const stockText = p.track_stock 
          ? `${p.stock_quantity} ${lang === 'ar' ? 'متوفر' : 'in stock'}`
          : (lang === 'ar' ? 'بدون تتبع' : 'Untracked');

        return `
          <div class="product-card" data-id="${p.id}">
            ${p.is_favorite ? '<div class="product-fav">★</div>' : ''}
            <div class="product-card-top">
              ${p.image 
                ? '<div class="product-img" id="pimg-' + p.id + '"></div>'
                : `<div class="product-img product-img-placeholder">${name.charAt(0)}</div>`}
            </div>
            <div class="product-card-body">
              <div class="product-name">${escapeHtml(name)}${p.product_type === 'service' ? ' <span style="background:var(--accent);color:#fff;font-size:10px;padding:1px 5px;border-radius:4px;">🔧</span>' : ''}</div>
              ${catName ? `<div class="product-cat"><span class="chip-dot-sm" style="background:${p.cat_color || '#64748B'}"></span>${escapeHtml(catName)}</div>` : ''}
              <div class="product-meta">
                <span class="product-price">${price}</span>
                <span class="product-stock ${stockClass}">${stockText}</span>
              </div>
              ${p.barcode ? `<div class="product-barcode">${escapeHtml(p.barcode)}</div>` : ''}
            </div>
            <div class="product-card-actions">
              ${window.hasPermission('products_edit') ? `<button class="btn-icon" data-action="edit" data-id="${p.id}" title="${lang === 'ar' ? 'تعديل' : 'Edit'}">✏️</button>` : ''}
              <button class="btn-icon" data-action="barcode" data-id="${p.id}" data-name="${escapeHtml(p.name_ar)}" data-code="${escapeHtml(p.barcode || p.sku || '')}" data-price="${p.price}" title="${lang === 'ar' ? 'طباعة باركود' : 'Print Barcode'}">🏷</button>
              <button class="btn-icon" data-action="fav" data-id="${p.id}" title="${lang === 'ar' ? 'مفضل' : 'Favorite'}">${p.is_favorite ? '★' : '☆'}</button>
              ${window.hasPermission('products_delete') ? `<button class="btn-icon btn-icon-danger" data-action="delete" data-id="${p.id}" title="${lang === 'ar' ? 'حذف' : 'Delete'}">🗑</button>` : ''}
            </div>
          </div>
        `;
      }).join('')}
    </div>
    ${totalPages > 1 ? `
      <div style="display:flex;justify-content:center;align-items:center;gap:8px;margin-top:16px;padding:8px;">
        ${page > 1 ? `<button class="btn btn-secondary btn-sm" id="prod-prev">← ${lang === 'ar' ? 'السابق' : 'Prev'}</button>` : ''}
        <span style="color:var(--text-secondary);font-size:13px;">${lang === 'ar' ? 'صفحة' : 'Page'} ${page} / ${totalPages} (${total} ${lang === 'ar' ? 'منتج' : 'products'})</span>
        ${page < totalPages ? `<button class="btn btn-secondary btn-sm" id="prod-next">${lang === 'ar' ? 'التالي' : 'Next'} →</button>` : ''}
      </div>
    ` : `<div style="text-align:center;padding:8px;font-size:12px;color:var(--text-tertiary);">${total} ${lang === 'ar' ? 'منتج' : 'products'}</div>`}
  `;

  // Pagination handlers
  const prevBtn = productsEl.querySelector('#prod-prev');
  const nextBtn = productsEl.querySelector('#prod-next');
  if (prevBtn) prevBtn.addEventListener('click', () => { window._productsPage = page - 1; loadProducts(container); });
  if (nextBtn) nextBtn.addEventListener('click', () => { window._productsPage = page + 1; loadProducts(container); });

  // Set product images via DOM (avoid base64 in template)
  products.forEach(p => {
    if (p.image) {
      const imgEl = productsEl.querySelector(`#pimg-${p.id}`);
      if (imgEl) {
        imgEl.style.backgroundImage = `url(${p.image})`;
        imgEl.style.backgroundSize = 'cover';
        imgEl.style.backgroundPosition = 'center';
      }
    }
  });

  // Bind card actions
  productsEl.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      const id = parseInt(btn.dataset.id);
      if (action === 'edit') {
        window.dbg('ui', `Edit product ${id}`);
        await openEditProduct(container, id);
      } else if (action === 'barcode') {
        openBarcodePrintModal(btn.dataset.name, btn.dataset.code, parseFloat(btn.dataset.price) || 0);
      } else if (action === 'fav') {
        await toggleFavorite(container, id);
      } else if (action === 'delete') {
        await deleteProduct(container, id);
      }
    });
  });

  // Click card to view/edit
  productsEl.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', async () => {
      if (!window.hasPermission('products_edit')) {
        showToast(window.i18n.getLang() === 'ar' ? '⚠️ لا تملك صلاحية تعديل المنتجات' : '⚠️ No permission to edit products', 'warning');
        return;
      }
      const id = parseInt(card.dataset.id);
      window.dbg('ui', `Card click → edit product ${id}`);
      await openEditProduct(container, id);
    });
  });
}

// ============ PRODUCT MODAL (Add/Edit) ============
async function openProductModal(container, product) {
  const lang = window.i18n.getLang();
  const isEdit = !!product;
  const p = product || {};
  window.dbg('ui', isEdit ? `Opening edit modal for product ${p.id}` : 'Opening new product modal');

  // Load categories for dropdown
  const catResult = await window.daftrly.query('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order, name_ar');
  const categories = (catResult.success && catResult.data) ? catResult.data : [];

  const overlay = container.querySelector('#modal-overlay');
  const modal = container.querySelector('#modal-content');

  modal.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">${isEdit 
        ? (lang === 'ar' ? 'تعديل المنتج' : 'Edit Product')
        : (lang === 'ar' ? 'منتج جديد' : 'New Product')}</h3>
      <button class="modal-close" id="modal-close">✕</button>
    </div>
    <div class="modal-body">
      <!-- Product Type Selector -->
      <div class="form-group" style="margin-bottom:16px;">
        <label class="form-label" style="font-weight:700;">${lang === 'ar' ? 'نوع العنصر' : 'Item Type'}</label>
        <div style="display:flex;gap:8px;" id="p-type-selector">
          <button class="btn ${(p.product_type || 'product') === 'product' ? 'btn-primary' : 'btn-secondary'}" data-type="product" style="flex:1;padding:10px;">
            📦 ${lang === 'ar' ? 'منتج' : 'Product'}
          </button>
          <button class="btn ${p.product_type === 'service' ? 'btn-primary' : 'btn-secondary'}" data-type="service" style="flex:1;padding:10px;">
            🔧 ${lang === 'ar' ? 'خدمة' : 'Service'}
          </button>
          <button class="btn ${p.product_type === 'bundle' ? 'btn-primary' : 'btn-secondary'}" data-type="bundle" style="flex:1;padding:10px;">
            📦📦 ${lang === 'ar' ? 'حزمة' : 'Bundle'}
          </button>
        </div>
        <input type="hidden" id="p-product-type" value="${p.product_type || 'product'}">
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'اسم المنتج (عربي) *' : 'Product Name (Arabic) *'}</label>
          <input type="text" id="p-name-ar" class="form-input" value="${escapeAttr(p.name_ar || '')}" 
            placeholder="${lang === 'ar' ? 'مثال: حليب طازج' : 'e.g. Fresh Milk'}">
        </div>
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'اسم المنتج (إنجليزي)' : 'Product Name (English)'}</label>
          <input type="text" id="p-name-en" class="form-input" value="${escapeAttr(p.name_en || '')}" 
            placeholder="${lang === 'ar' ? 'اختياري' : 'Optional'}">
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'سعر البيع *' : 'Selling Price *'}</label>
          <input type="text" inputmode="decimal" id="p-price" class="form-input" value="${p.price || ''}" placeholder="0.00">
        </div>
        ${window.hasPermission('products_view_cost') ? `<div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'سعر التكلفة' : 'Cost Price'}</label>
          <input type="text" inputmode="decimal" id="p-cost" class="form-input" value="${p.cost || ''}" placeholder="0.00">
        </div>` : '<div class="form-group"></div>'}
      </div>

      <!-- Physical product fields (hidden for services) -->
      <div id="physical-fields">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">${lang === 'ar' ? 'الباركود' : 'Barcode'}</label>
            <input type="text" id="p-barcode" class="form-input" value="${escapeAttr(p.barcode || '')}" placeholder="${lang === 'ar' ? 'امسح أو اكتب' : 'Scan or type'}">
          </div>
          <div class="form-group">
            <label class="form-label">${lang === 'ar' ? 'رمز SKU' : 'SKU Code'}</label>
            <input type="text" id="p-sku" class="form-input" value="${escapeAttr(p.sku || '')}" placeholder="${lang === 'ar' ? 'اختياري' : 'Optional'}">
          </div>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'التصنيف' : 'Category'}</label>
          <select id="p-category" class="form-input form-select">
            <option value="">${lang === 'ar' ? 'بدون تصنيف' : 'No category'}</option>
            ${categories.map(c => `<option value="${c.id}" ${p.category_id === c.id ? 'selected' : ''}>${lang === 'ar' ? c.name_ar : (c.name_en || c.name_ar)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'الوحدة' : 'Unit'}</label>
          <select id="p-unit" class="form-input form-select">
            ${[
              { v: 'piece', ar: 'حبة', en: 'Piece' },
              { v: 'kg', ar: 'كيلو', en: 'Kg' },
              { v: 'gram', ar: 'جرام', en: 'Gram' },
              { v: 'liter', ar: 'لتر', en: 'Liter' },
              { v: 'meter', ar: 'متر', en: 'Meter' },
              { v: 'sqm', ar: 'متر مربع', en: 'Sq. Meter' },
              { v: 'box', ar: 'علبة', en: 'Box' },
              { v: 'pack', ar: 'عبوة', en: 'Pack' },
              { v: 'carton', ar: 'كرتون', en: 'Carton' },
              { v: 'hour', ar: 'ساعة', en: 'Hour' },
              { v: 'service', ar: 'خدمة', en: 'Service' },
            ].map(u => `<option value="${u.v}" ${(p.unit || 'piece') === u.v ? 'selected' : ''}>${lang === 'ar' ? u.ar : u.en}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'حالة الضريبة' : 'Tax Status'}</label>
          <select id="p-tax" class="form-input form-select">
            <option value="standard" ${(p.tax_status || 'standard') === 'standard' ? 'selected' : ''}>${lang === 'ar' ? 'خاضع للضريبة' : 'Taxable'}</option>
            <option value="zero" ${p.tax_status === 'zero' ? 'selected' : ''}>${lang === 'ar' ? 'ضريبة صفرية' : 'Zero rated'}</option>
            <option value="exempt" ${p.tax_status === 'exempt' ? 'selected' : ''}>${lang === 'ar' ? 'معفى' : 'Exempt'}</option>
          </select>
        </div>
        <div class="form-group" id="track-stock-group">
          <label class="form-label">${lang === 'ar' ? 'تتبع المخزون' : 'Track Stock'}</label>
          <select id="p-track-stock" class="form-input form-select">
            <option value="1" ${(p.track_stock ?? 1) === 1 ? 'selected' : ''}>${lang === 'ar' ? 'نعم' : 'Yes'}</option>
            <option value="0" ${p.track_stock === 0 ? 'selected' : ''}>${lang === 'ar' ? 'لا' : 'No'}</option>
          </select>
        </div>
      </div>

      <div class="form-row" id="stock-fields">
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'الكمية الحالية' : 'Current Quantity'}</label>
          <input type="text" inputmode="numeric" id="p-stock" class="form-input" value="${p.stock_quantity || 0}" placeholder="0">
        </div>
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'حد إعادة الطلب' : 'Reorder Level'}</label>
          <input type="text" inputmode="numeric" id="p-reorder" class="form-input" value="${p.reorder_level || 0}" placeholder="0">
        </div>
      </div>

      <!-- Serial number tracking (physical products only) -->
      <div class="form-group" id="serial-field" style="display:none;">
        <label class="form-label">${lang === 'ar' ? 'تتبع الرقم التسلسلي (IMEI/Serial)' : 'Serial Number Tracking (IMEI/Serial)'}</label>
        <select id="p-serial-required" class="form-input form-select">
          <option value="0" ${!p.serial_required ? 'selected' : ''}>${lang === 'ar' ? 'لا' : 'No'}</option>
          <option value="1" ${p.serial_required ? 'selected' : ''}>${lang === 'ar' ? 'نعم — مطلوب عند البيع' : 'Yes — Required at sale'}</option>
        </select>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'تاريخ انتهاء الصلاحية' : 'Expiry Date'}</label>
          <input type="date" id="p-expiry" class="form-input" value="${p.expiry_date || ''}">
        </div>
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'نسبة عمولة الكاشير %' : 'Cashier Commission %'}</label>
          <input type="number" id="p-commission" class="form-input" step="0.1" min="0" max="100" value="${p.commission_rate || 0}" placeholder="0">
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;">${lang === 'ar' ? '0 = يستخدم عمولة الكاشير الافتراضية' : '0 = uses cashier default rate'}</div>
        </div>
      </div>

      <!-- Tier/Quantity Pricing -->
      ${isEdit ? `
      <div class="form-group" id="tier-section">
        <label class="form-label" style="display:flex;justify-content:space-between;align-items:center;">
          ${lang === 'ar' ? 'تسعير حسب الكمية' : 'Quantity Tier Pricing'}
          <button class="btn btn-secondary btn-sm" id="tier-add-btn">+ ${lang === 'ar' ? 'إضافة' : 'Add'}</button>
        </label>
        <div id="tier-list" style="font-size:13px;"></div>
      </div>` : `<div style="font-size:12px;color:var(--text-tertiary);padding:4px;">${lang === 'ar' ? '💡 التسعير حسب الكمية متاح بعد حفظ المنتج' : '💡 Tier pricing available after saving product'}</div>`}

      <!-- Product Variants (only for physical products when editing) -->
      ${isEdit ? `
      <div class="form-group" id="variants-section">
        <label class="form-label" style="display:flex;justify-content:space-between;align-items:center;">
          <span>${lang === 'ar' ? 'المتغيرات (مقاس، لون، إلخ)' : 'Variants (size, color, etc.)'}</span>
          <button class="btn btn-sm btn-secondary" id="p-add-variant" type="button">+ ${lang === 'ar' ? 'إضافة' : 'Add'}</button>
        </label>
        <div id="p-variants-list" style="max-height:150px;overflow:auto;"></div>
      </div>
      ` : ''}

      <!-- Bundle Items (only for bundle type) -->
      <div class="form-group" id="bundle-section" style="display:none;">
        <label class="form-label" style="display:flex;justify-content:space-between;align-items:center;">
          <span>📦📦 ${lang === 'ar' ? 'محتويات الحزمة' : 'Bundle Contents'}</span>
          <button class="btn btn-sm btn-secondary" id="p-add-bundle-item" type="button">+ ${lang === 'ar' ? 'إضافة منتج' : 'Add Product'}</button>
        </label>
        <div id="p-bundle-items" style="max-height:200px;overflow-y:auto;"></div>
        <div id="p-bundle-total" style="font-size:12px;color:var(--text-tertiary);margin-top:4px;"></div>
      </div>

      <div class="form-group">
        <label class="form-label">${lang === 'ar' ? 'صورة المنتج' : 'Product Image'}</label>
        <div class="product-image-upload" id="p-image-upload">
          <div class="product-image-preview" id="p-image-preview">
            ${p.image ? '<img alt="Product" id="p-img-loaded">' : `<span class="logo-placeholder">${lang === 'ar' ? 'اضغط لإضافة صورة' : 'Click to add image'}</span>`}
          </div>
          <input type="file" id="p-image-file" accept=".png,.jpg,.jpeg,.webp" style="display:none">
          ${p.image ? `<button class="btn btn-sm btn-secondary" id="p-image-remove" style="margin-top:8px">${lang === 'ar' ? 'إزالة الصورة' : 'Remove Image'}</button>` : ''}
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">${lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
      <button class="btn btn-primary" id="modal-save">${isEdit 
        ? (lang === 'ar' ? 'حفظ التعديلات' : 'Save Changes')
        : (lang === 'ar' ? 'إضافة المنتج' : 'Add Product')}</button>
    </div>
  `;

  overlay.style.display = 'flex';

  // Set product image via DOM if editing
  if (p.image) {
    const imgEl = modal.querySelector('#p-img-loaded');
    if (imgEl) imgEl.src = p.image;
  }

  // Track stock toggle visibility
  const trackStockSelect = modal.querySelector('#p-track-stock');
  const stockFields = modal.querySelector('#stock-fields');
  const physicalFields = modal.querySelector('#physical-fields');
  const trackStockGroup = modal.querySelector('#track-stock-group');
  const serialField = modal.querySelector('#serial-field');
  const productTypeInput = modal.querySelector('#p-product-type');

  function updateStockVisibility() {
    stockFields.style.display = trackStockSelect.value === '1' ? 'grid' : 'none';
  }

  function updateTypeVisibility() {
    const type = productTypeInput.value;
    const isService = type === 'service';
    const isBundle = type === 'bundle';
    physicalFields.style.display = isService ? 'none' : '';
    trackStockGroup.style.display = (isService || isBundle) ? 'none' : '';
    stockFields.style.display = (isService || isBundle) ? 'none' : (trackStockSelect.value === '1' ? 'grid' : 'none');
    serialField.style.display = (isService || isBundle) ? 'none' : 'block';
    const bundleSection = modal.querySelector('#bundle-section');
    if (bundleSection) bundleSection.style.display = isBundle ? 'block' : 'none';
    if (isService) {
      trackStockSelect.value = '0';
      modal.querySelector('#p-unit').value = 'service';
    }
    if (isBundle) {
      trackStockSelect.value = '0';
      modal.querySelector('#p-unit').value = 'piece';
    }
  }

  // Product type selector buttons
  modal.querySelectorAll('#p-type-selector button').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const type = btn.dataset.type;
      productTypeInput.value = type;
      modal.querySelectorAll('#p-type-selector button').forEach(b => {
        b.className = b.dataset.type === type ? 'btn btn-primary' : 'btn btn-secondary';
      });
      updateTypeVisibility();
    });
  });

  trackStockSelect.addEventListener('change', updateStockVisibility);
  updateTypeVisibility();
  updateStockVisibility();

  // ============ TIER PRICING MANAGEMENT ============
  if (isEdit) {
    const tierList = modal.querySelector('#tier-list');
    const tierAddBtn = modal.querySelector('#tier-add-btn');

    async function loadTiers() {
      if (!tierList) return;
      const tRes = await window.daftrly.query('SELECT * FROM tier_pricing WHERE product_id=? ORDER BY min_qty ASC', [p.id]);
      const tiers = (tRes.success && tRes.data) ? tRes.data : [];
      if (tiers.length === 0) {
        tierList.innerHTML = `<div style="font-size:12px;color:var(--text-tertiary);padding:4px;">${lang === 'ar' ? 'لا يوجد تسعير بالكمية' : 'No tier pricing'}</div>`;
      } else {
        tierList.innerHTML = tiers.map(t => `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;border-bottom:1px dotted var(--border);">
          <span style="flex:1;">${lang === 'ar' ? 'من' : 'From'} <b>${t.min_qty}</b> ${lang === 'ar' ? 'وحدة' : 'units'} → <b>${Number(t.price).toFixed(2)}</b> ${window.getCurrSym()}</span>
          <button class="btn btn-sm tier-del" data-tid="${t.id}" style="background:var(--danger);color:#fff;border:none;padding:2px 6px;">✕</button>
        </div>`).join('');
        tierList.querySelectorAll('.tier-del').forEach(btn => {
          btn.addEventListener('click', async () => {
            await window.daftrly.query('DELETE FROM tier_pricing WHERE id=?', [btn.dataset.tid]);
            loadTiers();
          });
        });
      }
    }
    loadTiers();

    if (tierAddBtn) tierAddBtn.addEventListener('click', async () => {
      const minQty = parseFloat(await window.daftrlyPrompt(lang === 'ar' ? 'الحد الأدنى للكمية:' : 'Minimum quantity:', '10'));
      if (!minQty || minQty <= 0) return;
      const tierPrice = parseFloat(await window.daftrlyPrompt(lang === 'ar' ? 'السعر لهذه الكمية:' : 'Price at this quantity:', ''));
      if (!tierPrice || tierPrice <= 0) return;
      await window.daftrly.query('INSERT INTO tier_pricing (product_id, min_qty, price) VALUES (?,?,?)', [p.id, minQty, tierPrice]);
      loadTiers();
    });
  }

  // ============ VARIANTS MANAGEMENT ============
  if (isEdit) {
    const variantsList = modal.querySelector('#p-variants-list');
    const variantsSection = modal.querySelector('#variants-section');
    const addVariantBtn = modal.querySelector('#p-add-variant');

    async function loadVariants() {
      if (!variantsList) return;
      const vRes = await window.daftrly.query('SELECT * FROM product_variants WHERE product_id = ? AND is_active = 1 ORDER BY id', [p.id]);
      const variants = vRes.success ? (vRes.data || []) : [];
      
      if (variants.length === 0) {
        variantsList.innerHTML = `<div style="font-size:12px;color:var(--text-tertiary);padding:8px;">${lang === 'ar' ? 'لا توجد متغيرات' : 'No variants'}</div>`;
      } else {
        variantsList.innerHTML = variants.map(v => `
          <div style="display:flex;gap:6px;align-items:center;padding:6px;border-bottom:1px solid var(--border);font-size:12px;">
            <span style="flex:1;font-weight:600;">${escapeAttr(v.name_ar)} ${v.name_en ? '(' + escapeAttr(v.name_en) + ')' : ''}</span>
            <span style="color:var(--text-secondary);">${v.barcode || '—'}</span>
            <span>${v.price_adjustment > 0 ? '+' : ''}${Number(v.price_adjustment).toFixed(2)}</span>
            <span style="color:var(--text-secondary);">${lang === 'ar' ? 'مخزون:' : 'Stock:'} ${Number(v.stock_quantity)}</span>
            <button class="btn-icon btn-icon-danger" data-del-variant="${v.id}" style="font-size:10px;">✕</button>
          </div>
        `).join('');

        variantsList.querySelectorAll('[data-del-variant]').forEach(btn => {
          btn.addEventListener('click', async (e) => {
            e.preventDefault();
            await window.daftrly.query('UPDATE product_variants SET is_active = 0 WHERE id = ?', [parseInt(btn.dataset.delVariant)]);
            loadVariants();
          });
        });
      }
    }

    if (addVariantBtn) {
      addVariantBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        const nameAr = await window.daftrlyPrompt(lang === 'ar' ? 'اسم المتغير (عربي)' : 'Variant Name (Arabic)', lang === 'ar' ? 'مثال: كبير، أحمر' : 'e.g. Large, Red');
        if (!nameAr) return;
        const nameEn = await window.daftrlyPrompt(lang === 'ar' ? 'اسم المتغير (إنجليزي)' : 'Variant Name (English)', 'Optional');
        const barcode = await window.daftrlyPrompt(lang === 'ar' ? 'باركود المتغير' : 'Variant Barcode', lang === 'ar' ? 'اختياري' : 'Optional');
        const priceAdjStr = await window.daftrlyPrompt(lang === 'ar' ? 'تعديل السعر (+/-)' : 'Price Adjustment (+/-)', '0');
        const stockStr = await window.daftrlyPrompt(lang === 'ar' ? 'كمية المخزون' : 'Stock Quantity', '0');
        const priceAdj = parseFloat(priceAdjStr || '0');
        const stock = parseFloat(stockStr || '0');

        await window.daftrly.query(
          'INSERT INTO product_variants (product_id, name_ar, name_en, barcode, price_adjustment, stock_quantity) VALUES (?,?,?,?,?,?)',
          [p.id, nameAr, nameEn || '', barcode || '', priceAdj, stock]);
        loadVariants();
        showToast(lang === 'ar' ? '✅ تمت إضافة المتغير' : '✅ Variant added', 'success');
      });
    }

    // Hide variants section for services
    if (variantsSection) {
      const origUpdateType = updateTypeVisibility;
      const wrappedUpdateType = () => {
        origUpdateType();
        variantsSection.style.display = productTypeInput.value === 'service' ? 'none' : 'block';
      };
      // Re-attach the type buttons with wrapped handler
      modal.querySelectorAll('#p-type-selector button').forEach(btn => {
        btn.addEventListener('click', wrappedUpdateType);
      });
      variantsSection.style.display = productTypeInput.value === 'service' ? 'none' : 'block';
    }

    loadVariants();
  }

  // ============ BUNDLE ITEMS MANAGEMENT ============
  const bundleItemsDiv = modal.querySelector('#p-bundle-items');
  const addBundleBtn = modal.querySelector('#p-add-bundle-item');
  const bundleTotalDiv = modal.querySelector('#p-bundle-total');
  let bundleItems = [];

  async function loadBundleItems() {
    if (!isEdit || !bundleItemsDiv) return;
    const res = await window.daftrly.query(
      'SELECT bi.*, p.name_ar, p.name_en, p.price, p.stock_quantity FROM bundle_items bi JOIN products p ON bi.product_id=p.id WHERE bi.bundle_id=?', [p.id]);
    bundleItems = res.success ? (res.data || []) : [];
    renderBundleItems();
  }

  function renderBundleItems() {
    if (!bundleItemsDiv) return;
    if (bundleItems.length === 0) {
      bundleItemsDiv.innerHTML = `<div style="text-align:center;color:var(--text-tertiary);padding:12px;font-size:12px;">${lang === 'ar' ? 'لا توجد منتجات في الحزمة بعد' : 'No items in bundle yet'}</div>`;
      if (bundleTotalDiv) bundleTotalDiv.textContent = '';
      return;
    }
    let totalCost = 0;
    bundleItemsDiv.innerHTML = bundleItems.map((bi, i) => {
      const name = lang === 'ar' ? bi.name_ar : (bi.name_en || bi.name_ar);
      const lineTotal = (bi.price || 0) * (bi.quantity || 1);
      totalCost += lineTotal;
      return `<div style="display:flex;align-items:center;gap:8px;padding:6px;border-bottom:1px solid var(--border-primary);font-size:12px;">
        <span style="flex:1;">${name}</span>
        <span style="color:var(--text-tertiary);">${formatCurrency(bi.price)} ×</span>
        <input type="text" inputmode="numeric" class="form-input bundle-qty" data-idx="${i}" value="${bi.quantity}" style="width:50px;text-align:center;padding:4px;font-size:12px;">
        <span style="font-weight:600;min-width:60px;text-align:right;">${formatCurrency(lineTotal)}</span>
        <button class="btn-icon bundle-remove" data-idx="${i}" style="color:var(--danger);font-size:14px;">✕</button>
      </div>`;
    }).join('');
    if (bundleTotalDiv) {
      const bundlePrice = parseFloat(modal.querySelector('#p-price')?.value) || 0;
      const savings = totalCost - bundlePrice;
      bundleTotalDiv.innerHTML = `${lang === 'ar' ? 'مجموع المنتجات:' : 'Items total:'} ${formatCurrency(totalCost)}${savings > 0 ? ` — ${lang === 'ar' ? 'توفير:' : 'Savings:'} <span style="color:var(--success);">${formatCurrency(savings)}</span>` : ''}`;
    }
    // Bind qty change
    bundleItemsDiv.querySelectorAll('.bundle-qty').forEach(inp => {
      inp.addEventListener('change', () => {
        const idx = parseInt(inp.dataset.idx);
        bundleItems[idx].quantity = Math.max(1, parseInt(inp.value) || 1);
        renderBundleItems();
      });
    });
    // Bind remove
    bundleItemsDiv.querySelectorAll('.bundle-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        bundleItems.splice(parseInt(btn.dataset.idx), 1);
        renderBundleItems();
      });
    });
  }

  if (addBundleBtn) {
    addBundleBtn.addEventListener('click', async () => {
      // Show product picker — simple prompt with search
      const searchTerm = await window.daftrlyPrompt(
        lang === 'ar' ? 'ابحث عن منتج لإضافته للحزمة' : 'Search for a product to add to bundle',
        lang === 'ar' ? 'اسم المنتج أو الباركود' : 'Product name or barcode'
      );
      if (!searchTerm) return;
      const like = '%' + searchTerm + '%';
      const res = await window.daftrly.query(
        `SELECT * FROM products WHERE is_active=1 AND product_type='product' AND (name_ar LIKE ? OR name_en LIKE ? OR barcode LIKE ?) LIMIT 10`, [like, like, like]);
      if (!res.success || !res.data?.length) {
        showToast(lang === 'ar' ? 'لا توجد نتائج' : 'No results', 'warning');
        return;
      }
      // If one result, add directly. If multiple, let user pick
      if (res.data.length === 1) {
        const prod = res.data[0];
        if (isEdit && prod.id === p.id) { showToast(lang === 'ar' ? 'لا يمكن إضافة الحزمة لنفسها' : 'Cannot add bundle to itself', 'error'); return; }
        bundleItems.push({ product_id: prod.id, name_ar: prod.name_ar, name_en: prod.name_en, price: prod.price, stock_quantity: prod.stock_quantity, quantity: 1 });
        renderBundleItems();
      } else {
        // Show selection
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';
        overlay.innerHTML = `<div style="background:var(--bg-primary);border-radius:12px;padding:16px;max-width:400px;width:90%;max-height:60vh;overflow-y:auto;">
          <div style="font-weight:700;margin-bottom:8px;">${lang === 'ar' ? 'اختر منتج' : 'Select Product'}</div>
          ${res.data.map(prod => `<div class="bundle-pick" data-id="${prod.id}" style="padding:10px;border:1px solid var(--border-primary);border-radius:6px;margin-bottom:4px;cursor:pointer;display:flex;justify-content:space-between;">
            <span>${lang === 'ar' ? prod.name_ar : (prod.name_en || prod.name_ar)}</span>
            <span style="color:var(--text-secondary);">${formatCurrency(prod.price)}</span>
          </div>`).join('')}
        </div>`;
        document.body.appendChild(overlay);
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        overlay.querySelectorAll('.bundle-pick').forEach(el => {
          el.addEventListener('click', () => {
            const prodId = parseInt(el.dataset.id);
            const prod = res.data.find(pp => pp.id === prodId);
            if (isEdit && prodId === p.id) { showToast(lang === 'ar' ? 'لا يمكن إضافة الحزمة لنفسها' : 'Cannot add bundle to itself', 'error'); overlay.remove(); return; }
            bundleItems.push({ product_id: prod.id, name_ar: prod.name_ar, name_en: prod.name_en, price: prod.price, stock_quantity: prod.stock_quantity, quantity: 1 });
            renderBundleItems();
            overlay.remove();
          });
        });
      }
    });
  }

  if (isEdit && p.product_type === 'bundle') loadBundleItems();
  renderBundleItems();

  // Image upload
  const imgUpload = modal.querySelector('#p-image-upload');
  const imgFile = modal.querySelector('#p-image-file');
  const imgPreview = modal.querySelector('#p-image-preview');

  imgUpload.addEventListener('click', (e) => {
    if (e.target.closest('#p-image-remove')) return;
    if (e.target !== imgFile) imgFile.click();
  });

  imgFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      showToast(lang === 'ar' ? 'حجم الصورة كبير جداً (الحد 2MB)' : 'Image too large (max 2MB)', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > 512 || h > 512) {
          if (w > h) { h = Math.round(h * 512 / w); w = 512; }
          else { w = Math.round(w * 512 / h); h = 512; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const resized = canvas.toDataURL('image/png', 0.9);
        imgPreview.innerHTML = '<img alt="Product">';
        imgPreview.querySelector('img').src = resized;
        imgPreview.dataset.imageData = resized;
        window.dbg('ui', 'Product image uploaded', { w, h });
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  // Remove image button
  const removeBtn = modal.querySelector('#p-image-remove');
  if (removeBtn) {
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      imgPreview.innerHTML = `<span class="logo-placeholder">${lang === 'ar' ? 'اضغط لإضافة صورة' : 'Click to add image'}</span>`;
      imgPreview.dataset.imageData = '';
      removeBtn.remove();
      window.dbg('ui', 'Product image removed');
    });
  }

  // Close handlers
  const closeModal = () => { overlay.style.display = 'none'; };
  modal.querySelector('#modal-close').addEventListener('click', closeModal);
  modal.querySelector('#modal-cancel').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

  // Save handler
  modal.querySelector('#modal-save').addEventListener('click', async () => {
    // Permission check — safety net
    if (isEdit && !window.hasPermission('products_edit')) {
      showToast(lang === 'ar' ? '⚠️ لا تملك صلاحية تعديل المنتجات' : '⚠️ No permission to edit products', 'warning');
      return;
    }
    if (!isEdit && !window.hasPermission('products_add')) {
      showToast(lang === 'ar' ? '⚠️ لا تملك صلاحية إضافة منتجات' : '⚠️ No permission to add products', 'warning');
      return;
    }
    const nameAr = modal.querySelector('#p-name-ar').value.trim();
    if (!nameAr) {
      showToast(lang === 'ar' ? 'اسم المنتج بالعربي مطلوب' : 'Arabic product name is required', 'error');
      modal.querySelector('#p-name-ar').focus();
      return;
    }
    const price = parseFloat(modal.querySelector('#p-price').value) || 0;
    if (price <= 0) {
      showToast(lang === 'ar' ? 'سعر البيع مطلوب' : 'Selling price is required', 'error');
      modal.querySelector('#p-price').focus();
      return;
    }

    const imageData = imgPreview.dataset.imageData || p.image || '';

    const data = {
      name_ar: nameAr,
      name_en: modal.querySelector('#p-name-en').value.trim(),
      price: price,
      cost: parseFloat(modal.querySelector('#p-cost')?.value) || 0,
      barcode: modal.querySelector('#p-barcode').value.trim(),
      sku: modal.querySelector('#p-sku').value.trim(),
      category_id: parseInt(modal.querySelector('#p-category').value) || null,
      unit: modal.querySelector('#p-unit').value,
      tax_status: modal.querySelector('#p-tax').value,
      track_stock: parseInt(modal.querySelector('#p-track-stock').value),
      stock_quantity: parseFloat(modal.querySelector('#p-stock').value) || 0,
      reorder_level: parseFloat(modal.querySelector('#p-reorder').value) || 0,
      image: imageData,
      product_type: modal.querySelector('#p-product-type').value || 'product',
      serial_required: parseInt(modal.querySelector('#p-serial-required').value) || 0,
      expiry_date: modal.querySelector('#p-expiry')?.value || null,
      commission_rate: parseFloat(modal.querySelector('#p-commission')?.value) || 0,
    };

    window.dbg('save', `Product ${isEdit ? 'update' : 'create'}`, { name_ar: data.name_ar, price: data.price, barcode: data.barcode });

    let result;
    if (isEdit) {
      result = await window.daftrly.query(
        `UPDATE products SET name_ar=?, name_en=?, price=?, cost=?, barcode=?, sku=?, 
         category_id=?, unit=?, tax_status=?, track_stock=?, stock_quantity=?, reorder_level=?, 
         image=?, product_type=?, serial_required=?, expiry_date=?, commission_rate=?, updated_at=datetime('now') WHERE id=?`,
        [data.name_ar, data.name_en, data.price, data.cost, data.barcode, data.sku,
         data.category_id, data.unit, data.tax_status, data.track_stock, data.stock_quantity,
         data.reorder_level, data.image, data.product_type, data.serial_required, data.expiry_date, data.commission_rate, p.id]
      );
    } else {
      result = await window.daftrly.query(
        `INSERT INTO products (name_ar, name_en, price, cost, barcode, sku, category_id, unit, 
         tax_status, track_stock, stock_quantity, reorder_level, image, product_type, serial_required, expiry_date, commission_rate) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [data.name_ar, data.name_en, data.price, data.cost, data.barcode, data.sku,
         data.category_id, data.unit, data.tax_status, data.track_stock, data.stock_quantity,
         data.reorder_level, data.image, data.product_type, data.serial_required, data.expiry_date, data.commission_rate]
      );
    }

    if (result.success) {
      // Save bundle items if this is a bundle
      if (data.product_type === 'bundle') {
        const productId = isEdit ? p.id : (result.data?.lastInsertId || 0);
        if (productId) {
          // Delete existing bundle items and re-insert
          await window.daftrly.query('DELETE FROM bundle_items WHERE bundle_id = ?', [productId]);
          for (const bi of bundleItems) {
            await window.daftrly.query('INSERT INTO bundle_items (bundle_id, product_id, quantity) VALUES (?,?,?)',
              [productId, bi.product_id, bi.quantity || 1]);
          }
        }
      }
      window.dbg('success', `Product ${isEdit ? 'updated' : 'created'}: ${data.name_ar}`);
      showToast(lang === 'ar' 
        ? (isEdit ? 'تم تحديث المنتج' : 'تمت إضافة المنتج') 
        : (isEdit ? 'Product updated' : 'Product added'), 'success');
      closeModal();
      await loadProducts(container);
      await loadCategoryChips(container);
    } else {
      window.dbg('error', 'Product save failed', result.error);
      showToast(lang === 'ar' ? 'حدث خطأ أثناء الحفظ' : 'Error saving product', 'error');
    }
  });
}

// ============ EDIT PRODUCT ============
async function openEditProduct(container, id) {
  const result = await window.daftrly.query('SELECT * FROM products WHERE id = ?', [id]);
  if (result.success && result.data && result.data.length > 0) {
    await openProductModal(container, result.data[0]);
  } else {
    window.dbg('error', `Product ${id} not found`);
    showToast(window.i18n.getLang() === 'ar' ? 'المنتج غير موجود' : 'Product not found', 'error');
  }
}

// ============ TOGGLE FAVORITE ============
async function toggleFavorite(container, id) {
  const result = await window.daftrly.query('SELECT is_favorite FROM products WHERE id = ?', [id]);
  if (result.success && result.data && result.data.length > 0) {
    const newVal = result.data[0].is_favorite ? 0 : 1;
    await window.daftrly.query('UPDATE products SET is_favorite = ? WHERE id = ?', [newVal, id]);
    window.dbg('ui', `Product ${id} favorite: ${newVal}`);
    showToast(window.i18n.getLang() === 'ar'
      ? (newVal ? 'تمت الإضافة للمفضلة' : 'تمت الإزالة من المفضلة')
      : (newVal ? 'Added to favorites' : 'Removed from favorites'), 'success');
    await loadProducts(container);
  }
}

// ============ DELETE PRODUCT ============
async function deleteProduct(container, id) {
  const lang = window.i18n.getLang();
  const confirmed = await window.daftrlyConfirm(lang === 'ar' ? 'هل أنت متأكد من حذف هذا المنتج؟' : 'Are you sure you want to delete this product?');
  if (!confirmed) return;

  const result = await window.daftrly.query('UPDATE products SET is_active = 0 WHERE id = ?', [id]);
  if (result.success) {
    window.dbg('save', `Product ${id} soft-deleted`);
    showToast(lang === 'ar' ? 'تم حذف المنتج' : 'Product deleted', 'success');
    await loadProducts(container);
  } else {
    window.dbg('error', `Delete product ${id} failed`, result.error);
    showToast(lang === 'ar' ? 'حدث خطأ' : 'Error occurred', 'error');
  }
}

// ============ CATEGORY MANAGER ============
async function openCategoryManager(container) {
  const lang = window.i18n.getLang();
  window.dbg('ui', 'Opening category manager');

  const overlay = container.querySelector('#modal-overlay');
  const modal = container.querySelector('#modal-content');

  async function renderCategoryList() {
    const result = await window.daftrly.query('SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order, name_ar');
    const categories = (result.success && result.data) ? result.data : [];

    modal.innerHTML = `
      <div class="modal-header">
        <h3 class="modal-title">${lang === 'ar' ? 'إدارة التصنيفات' : 'Manage Categories'}</h3>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <!-- Add new category form -->
        ${window.hasPermission('products_add') ? `<div class="cat-add-form">
          <input type="text" id="cat-name-ar" class="form-input" placeholder="${lang === 'ar' ? 'اسم التصنيف (عربي)' : 'Category name (Arabic)'}">
          <input type="text" id="cat-name-en" class="form-input" placeholder="${lang === 'ar' ? 'اسم التصنيف (إنجليزي)' : 'Category name (English)'}">
          <input type="color" id="cat-color" class="form-color" value="#2563EB" title="${lang === 'ar' ? 'اللون' : 'Color'}">
          <button class="btn btn-primary btn-sm" id="cat-add-btn">
            ${window.icons.getIcon('plus')} ${lang === 'ar' ? 'إضافة' : 'Add'}
          </button>
        </div>` : ''}

        <!-- Category list -->
        <div class="cat-list" id="cat-list">
          ${categories.length === 0 ? `
            <div class="empty-state" style="padding:24px 0">
              <div class="empty-state-desc">${lang === 'ar' ? 'لا توجد تصنيفات. أضف أول تصنيف.' : 'No categories. Add your first one.'}</div>
            </div>
          ` : categories.map(c => `
            <div class="cat-item" data-id="${c.id}">
              <span class="cat-color-dot" style="background:${c.color || '#2563EB'}"></span>
              <span class="cat-item-name">${lang === 'ar' ? c.name_ar : (c.name_en || c.name_ar)}</span>
              <span class="cat-item-name-sub">${lang === 'ar' ? (c.name_en || '') : c.name_ar}</span>
              ${window.hasPermission('products_delete') ? `<button class="btn-icon btn-icon-danger cat-delete" data-id="${c.id}">🗑</button>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-done">${lang === 'ar' ? 'تم' : 'Done'}</button>
      </div>
    `;

    // Close
    const closeModal = () => { overlay.style.display = 'none'; loadCategoryChips(container); };
    modal.querySelector('#modal-close').addEventListener('click', closeModal);
    modal.querySelector('#modal-done').addEventListener('click', closeModal);

    // Add category
    const catAddBtn = modal.querySelector('#cat-add-btn');
    if (catAddBtn) catAddBtn.addEventListener('click', async () => {
      const nameAr = modal.querySelector('#cat-name-ar').value.trim();
      if (!nameAr) {
        showToast(lang === 'ar' ? 'اسم التصنيف مطلوب' : 'Category name required', 'error');
        return;
      }
      const nameEn = modal.querySelector('#cat-name-en').value.trim();
      const color = modal.querySelector('#cat-color').value;

      window.dbg('save', 'Adding category', { nameAr, nameEn, color });
      const res = await window.daftrly.query(
        'INSERT INTO categories (name_ar, name_en, color) VALUES (?, ?, ?)',
        [nameAr, nameEn || null, color]
      );
      if (res.success) {
        window.dbg('success', `Category added: ${nameAr}`);
        showToast(lang === 'ar' ? 'تمت إضافة التصنيف' : 'Category added', 'success');
        renderCategoryList(); // re-render the list
      } else {
        window.dbg('error', 'Category add failed', res.error);
      }
    });

    // Delete category
    modal.querySelectorAll('.cat-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = parseInt(btn.dataset.id);
        const confirmed = await window.daftrlyConfirm(lang === 'ar' ? 'حذف هذا التصنيف؟' : 'Delete this category?');
        if (!confirmed) return;
        await window.daftrly.query('UPDATE categories SET is_active = 0 WHERE id = ?', [id]);
        // Unassign products that had this category so POS filter stays consistent
        await window.daftrly.query('UPDATE products SET category_id = NULL WHERE category_id = ?', [id]);
        window.dbg('save', `Category ${id} deleted`);
        showToast(lang === 'ar' ? 'تم حذف التصنيف' : 'Category deleted', 'success');
        renderCategoryList();
      });
    });
  }

  overlay.style.display = 'flex';
  await renderCategoryList();
}

// ============ UTILITIES ============
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ============ SMART COLUMN MAPPING ============
const COLUMN_PATTERNS = {
  name_ar: ['اسم المنتج', 'اسم', 'product name arabic', 'product name', 'name arabic', 'name_ar', 'item name', 'item', 'description', 'اسم الصنف', 'المنتج', 'الصنف'],
  name_en: ['product name english', 'name english', 'name_en', 'english name', 'اسم انجليزي', 'الاسم بالانجليزي'],
  barcode: ['barcode', 'باركود', 'upc', 'ean', 'bar code', 'رمز الباركود'],
  sku: ['sku', 'رمز', 'code', 'item code', 'product code', 'كود', 'رمز المنتج', 'رقم الصنف'],
  category: ['category', 'تصنيف', 'التصنيف', 'فئة', 'group', 'مجموعة', 'القسم'],
  price: ['price', 'سعر البيع', 'selling price', 'retail price', 'سعر', 'السعر', 'unit price'],
  cost: ['cost', 'سعر التكلفة', 'cost price', 'تكلفة', 'purchase price', 'سعر الشراء', 'supplier price'],
  unit: ['unit', 'وحدة', 'الوحدة', 'uom', 'unit of measure'],
  stock_quantity: ['quantity', 'stock', 'كمية', 'الكمية', 'stock quantity', 'المخزون', 'qty', 'on hand'],
  reorder_level: ['reorder', 'حد إعادة الطلب', 'reorder level', 'min stock', 'الحد الأدنى', 'minimum'],
  tax_status: ['tax', 'ضريبة', 'tax status', 'حالة الضريبة', 'vat', 'tax type'],
};

function autoMapColumns(headers) {
  const mapping = {};
  const normalizedHeaders = headers.map(h => String(h).toLowerCase().replace(/[\n\r*]/g, '').trim());

  for (const [field, patterns] of Object.entries(COLUMN_PATTERNS)) {
    for (let i = 0; i < normalizedHeaders.length; i++) {
      if (mapping[field] !== undefined) break;
      const h = normalizedHeaders[i];
      for (const pattern of patterns) {
        if (h.includes(pattern.toLowerCase())) {
          mapping[field] = i;
          break;
        }
      }
    }
  }
  return mapping;
}

// ============ IMPORT WIZARD ============
async function openImportWizard(container) {
  const lang = window.i18n.getLang();
  const overlay = container.querySelector('#modal-overlay');
  const modal = container.querySelector('#modal-content');
  window.dbg('ui', 'Opening import wizard');

  // Step 1: Choose file or download template
  modal.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">${lang === 'ar' ? 'استيراد المنتجات من Excel' : 'Import Products from Excel'}</h3>
      <button class="modal-close" id="modal-close">✕</button>
    </div>
    <div class="modal-body" style="text-align:center;padding:32px 20px;">
      <div style="font-size:48px;margin-bottom:16px;opacity:0.3;">📊</div>
      <p style="color:var(--text-secondary);margin-bottom:24px;line-height:1.7;">
        ${lang === 'ar' 
          ? 'يمكنك استيراد منتجاتك من أي ملف Excel أو CSV.<br>إذا كنت تستخدم نظام آخر (رواء، دفترة، الأمين...)، صدّر منتجاتك من النظام القديم كملف Excel ثم ارفعه هنا.<br>التطبيق سيحاول مطابقة الأعمدة تلقائياً.'
          : 'Import your products from any Excel or CSV file.<br>If you use another system (Rewaa, Daftra, Al-Ameen...), export your products from the old system as Excel and upload here.<br>The app will try to auto-match columns.'}
      </p>
      <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap;">
        <button class="btn btn-primary" id="import-choose-file">
          📂 ${lang === 'ar' ? 'اختر ملف Excel' : 'Choose Excel File'}
        </button>
        <button class="btn btn-secondary" id="import-download-template">
          📥 ${lang === 'ar' ? 'تحميل القالب' : 'Download Template'}
        </button>
      </div>
    </div>
  `;

  overlay.style.display = 'flex';

  const closeModal = () => { overlay.style.display = 'none'; };
  modal.querySelector('#modal-close').addEventListener('click', closeModal);

  modal.querySelector('#import-download-template').addEventListener('click', async () => {
    window.dbg('ui', 'Downloading template');
    const result = await window.daftrly.downloadTemplate();
    if (result.success) {
      showToast(lang === 'ar' ? 'تم تحميل القالب' : 'Template downloaded', 'success');
    } else if (!result.canceled) {
      showToast(lang === 'ar' ? 'حدث خطأ' : 'Error occurred', 'error');
    }
  });

  modal.querySelector('#import-choose-file').addEventListener('click', async () => {
    window.dbg('ui', 'Opening file picker for import');
    const result = await window.daftrly.readExcelFile();
    if (result.canceled) return;
    if (!result.success) {
      showToast(result.error || (lang === 'ar' ? 'خطأ في قراءة الملف' : 'Error reading file'), 'error');
      return;
    }
    window.dbg('load', `Excel file read: ${result.fileName}`, { cols: result.headers.length, rows: result.rows.length });
    showImportMapping(container, result);
  });
}

// Step 2: Column mapping + preview
function showImportMapping(container, excelData) {
  const lang = window.i18n.getLang();
  const overlay = container.querySelector('#modal-overlay');
  const modal = container.querySelector('#modal-content');
  const { headers, rows, fileName } = excelData;
  const autoMap = autoMapColumns(headers);

  window.dbg('ui', 'Auto-mapped columns', autoMap);

  const fields = [
    { key: 'name_ar', label: lang === 'ar' ? 'اسم المنتج (عربي) *' : 'Product Name Arabic *', required: true },
    { key: 'name_en', label: lang === 'ar' ? 'اسم المنتج (إنجليزي)' : 'Product Name English' },
    { key: 'barcode', label: lang === 'ar' ? 'الباركود' : 'Barcode' },
    { key: 'sku', label: lang === 'ar' ? 'رمز SKU' : 'SKU' },
    { key: 'category', label: lang === 'ar' ? 'التصنيف' : 'Category' },
    { key: 'price', label: lang === 'ar' ? 'سعر البيع *' : 'Selling Price *', required: true },
    { key: 'cost', label: lang === 'ar' ? 'سعر التكلفة' : 'Cost Price' },
    { key: 'unit', label: lang === 'ar' ? 'الوحدة' : 'Unit' },
    { key: 'stock_quantity', label: lang === 'ar' ? 'الكمية' : 'Stock Quantity' },
    { key: 'reorder_level', label: lang === 'ar' ? 'حد إعادة الطلب' : 'Reorder Level' },
    { key: 'tax_status', label: lang === 'ar' ? 'حالة الضريبة' : 'Tax Status' },
  ];

  modal.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">${lang === 'ar' ? 'مطابقة الأعمدة' : 'Map Columns'} — ${escapeHtml(fileName)}</h3>
      <button class="modal-close" id="modal-close">✕</button>
    </div>
    <div class="modal-body">
      <p style="color:var(--text-secondary);margin-bottom:16px;font-size:13px;">
        ${lang === 'ar' 
          ? `تم العثور على ${rows.length} منتج و ${headers.length} عمود. طابق كل عمود مع الحقل المناسب:`
          : `Found ${rows.length} products and ${headers.length} columns. Match each column to the right field:`}
      </p>
      <div class="import-mapping">
        ${fields.map(f => `
          <div class="import-map-row">
            <label class="import-map-label">${f.label}</label>
            <select class="form-input form-select import-map-select" data-field="${f.key}">
              <option value="-1">${lang === 'ar' ? '— تخطي —' : '— Skip —'}</option>
              ${headers.map((h, i) => `<option value="${i}" ${autoMap[f.key] === i ? 'selected' : ''}>${escapeHtml(String(h).substring(0, 40))}</option>`).join('')}
            </select>
          </div>
        `).join('')}
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="import-back">${lang === 'ar' ? 'رجوع' : 'Back'}</button>
      <button class="btn btn-primary" id="import-preview">${lang === 'ar' ? 'معاينة' : 'Preview'} →</button>
    </div>
  `;

  modal.querySelector('#modal-close').addEventListener('click', () => { overlay.style.display = 'none'; });
  modal.querySelector('#import-back').addEventListener('click', () => { openImportWizard(container); });

  modal.querySelector('#import-preview').addEventListener('click', () => {
    // Collect mapping
    const mapping = {};
    modal.querySelectorAll('.import-map-select').forEach(sel => {
      const val = parseInt(sel.value);
      if (val >= 0) mapping[sel.dataset.field] = val;
    });

    if (mapping.name_ar === undefined) {
      showToast(lang === 'ar' ? 'حقل اسم المنتج (عربي) مطلوب' : 'Product Name (Arabic) field is required', 'error');
      return;
    }
    if (mapping.price === undefined) {
      showToast(lang === 'ar' ? 'حقل سعر البيع مطلوب' : 'Selling Price field is required', 'error');
      return;
    }

    window.dbg('ui', 'Column mapping confirmed', mapping);
    showImportPreview(container, excelData, mapping);
  });
}

// Step 3: Preview and confirm
function showImportPreview(container, excelData, mapping) {
  const lang = window.i18n.getLang();
  const overlay = container.querySelector('#modal-overlay');
  const modal = container.querySelector('#modal-content');
  const { rows } = excelData;

  // Parse rows using mapping
  let parsed = rows.map((row, idx) => {
    const name_ar = String(row[mapping.name_ar] || '').trim();
    const price = parseFloat(row[mapping.price]) || 0;

    return {
      _row: idx + 2,
      _selected: true,
      name_ar,
      name_en: mapping.name_en !== undefined ? String(row[mapping.name_en] || '').trim() : '',
      barcode: mapping.barcode !== undefined ? String(row[mapping.barcode] || '').trim() : '',
      sku: mapping.sku !== undefined ? String(row[mapping.sku] || '').trim() : '',
      category: mapping.category !== undefined ? String(row[mapping.category] || '').trim() : '',
      price,
      cost: mapping.cost !== undefined ? (parseFloat(row[mapping.cost]) || 0) : 0,
      unit: mapping.unit !== undefined ? String(row[mapping.unit] || 'piece').trim().toLowerCase() : 'piece',
      stock_quantity: mapping.stock_quantity !== undefined ? (parseFloat(row[mapping.stock_quantity]) || 0) : 0,
      reorder_level: mapping.reorder_level !== undefined ? (parseFloat(row[mapping.reorder_level]) || 0) : 0,
      tax_status: mapping.tax_status !== undefined ? String(row[mapping.tax_status] || 'standard').trim().toLowerCase() : 'standard',
    };
  }).filter(p => p.name_ar);

  // Check for duplicates against existing DB products
  let existingBarcodes = {};

  async function checkDuplicates() {
    const bcRes = await window.daftrly.query('SELECT barcode FROM products WHERE barcode IS NOT NULL AND barcode != "" AND is_active = 1');
    if (bcRes.success && bcRes.data) bcRes.data.forEach(r => { existingBarcodes[r.barcode] = true; });
  }

  function getStatus(p) {
    if (!p.name_ar) return { cls: 'error', text: lang === 'ar' ? 'اسم فارغ' : 'Empty name', icon: '❌' };
    if (p.price <= 0) return { cls: 'error', text: lang === 'ar' ? 'سعر غير صالح' : 'Invalid price', icon: '❌' };
    if (p.barcode && existingBarcodes[p.barcode]) return { cls: 'dup', text: lang === 'ar' ? 'موجود — سيتم تحديثه' : 'Exists — will update', icon: '🔄' };
    return { cls: 'ok', text: lang === 'ar' ? 'جديد' : 'New', icon: '✅' };
  }

  // Get unique categories that will be created
  function getNewCategories() {
    const cats = [...new Set(parsed.filter(p => p._selected && p.category).map(p => p.category))];
    return cats;
  }

  function render() {
    const selected = parsed.filter(p => p._selected);
    const validCount = selected.filter(p => p.name_ar && p.price > 0).length;
    const dupCount = selected.filter(p => p.barcode && existingBarcodes[p.barcode]).length;
    const newCats = getNewCategories();

    modal.innerHTML = `
      <div class="modal-header">
        <h3 class="modal-title">${lang === 'ar' ? '📋 معاينة الاستيراد' : '📋 Import Preview'}</h3>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body" style="padding:12px;">
        <!-- Summary cards -->
        <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
          <div style="background:var(--success);color:#fff;padding:8px 14px;border-radius:8px;font-size:13px;">
            ✅ ${validCount - dupCount} ${lang === 'ar' ? 'جديد' : 'new'}
          </div>
          ${dupCount > 0 ? `<div style="background:var(--warning);color:#fff;padding:8px 14px;border-radius:8px;font-size:13px;">
            🔄 ${dupCount} ${lang === 'ar' ? 'سيتم تحديثه' : 'will update'}
          </div>` : ''}
          ${parsed.length - selected.length > 0 ? `<div style="background:var(--danger);color:#fff;padding:8px 14px;border-radius:8px;font-size:13px;">
            🗑 ${parsed.length - selected.length} ${lang === 'ar' ? 'محذوف' : 'removed'}
          </div>` : ''}
          ${newCats.length > 0 ? `<div style="background:var(--accent);color:#fff;padding:8px 14px;border-radius:8px;font-size:13px;">
            📁 ${newCats.length} ${lang === 'ar' ? 'تصنيف جديد' : 'new categories'}
          </div>` : ''}
        </div>

        ${newCats.length > 0 ? `<div style="font-size:11px;color:var(--text-secondary);margin-bottom:8px;">
          ${lang === 'ar' ? 'التصنيفات الجديدة:' : 'New categories:'} ${newCats.map(c => `<span style="background:var(--bg-tertiary);padding:2px 6px;border-radius:4px;margin:0 2px;">${escapeHtml(c)}</span>`).join('')}
        </div>` : ''}

        <!-- Editable table -->
        <div style="max-height:380px;overflow:auto;border:1px solid var(--border);border-radius:8px;">
          <table style="width:100%;border-collapse:collapse;font-size:12px;">
            <thead style="position:sticky;top:0;background:var(--bg-secondary);z-index:1;">
              <tr>
                <th style="padding:6px;width:30px;"><input type="checkbox" id="imp-select-all" ${selected.length === parsed.length ? 'checked' : ''}></th>
                <th style="padding:6px;">#</th>
                <th style="padding:6px;">${lang === 'ar' ? 'الاسم' : 'Name'}</th>
                <th style="padding:6px;width:70px;">${lang === 'ar' ? 'السعر' : 'Price'}</th>
                <th style="padding:6px;">${lang === 'ar' ? 'الباركود' : 'Barcode'}</th>
                <th style="padding:6px;">${lang === 'ar' ? 'التصنيف' : 'Category'}</th>
                <th style="padding:6px;width:50px;">${lang === 'ar' ? 'مخزون' : 'Stock'}</th>
                <th style="padding:6px;width:60px;">${lang === 'ar' ? 'الحالة' : 'Status'}</th>
              </tr>
            </thead>
            <tbody>
              ${parsed.map((p, i) => {
                const st = getStatus(p);
                const bgColor = !p._selected ? 'var(--bg-secondary);opacity:0.4;' : (st.cls === 'error' ? 'rgba(239,68,68,0.05)' : st.cls === 'dup' ? 'rgba(245,158,11,0.05)' : '');
                return `<tr style="border-bottom:1px solid var(--border);background:${bgColor};" data-idx="${i}">
                  <td style="padding:4px 6px;text-align:center;"><input type="checkbox" class="imp-row-check" data-idx="${i}" ${p._selected ? 'checked' : ''}></td>
                  <td style="padding:4px 6px;color:var(--text-tertiary);">${p._row}</td>
                  <td style="padding:4px 6px;"><input type="text" class="imp-edit" data-idx="${i}" data-field="name_ar" value="${escapeAttr(p.name_ar)}" style="width:100%;border:none;background:transparent;font-size:12px;color:var(--text-primary);padding:2px;"></td>
                  <td style="padding:4px 6px;"><input type="text" inputmode="decimal" class="imp-edit" data-idx="${i}" data-field="price" value="${p.price}" style="width:60px;border:none;background:transparent;font-size:12px;color:var(--text-primary);padding:2px;text-align:center;"></td>
                  <td style="padding:4px 6px;"><input type="text" class="imp-edit" data-idx="${i}" data-field="barcode" value="${escapeAttr(p.barcode)}" style="width:100%;border:none;background:transparent;font-size:12px;color:var(--text-primary);padding:2px;"></td>
                  <td style="padding:4px 6px;"><input type="text" class="imp-edit" data-idx="${i}" data-field="category" value="${escapeAttr(p.category)}" style="width:100%;border:none;background:transparent;font-size:12px;color:var(--text-primary);padding:2px;"></td>
                  <td style="padding:4px 6px;text-align:center;"><input type="text" inputmode="numeric" class="imp-edit" data-idx="${i}" data-field="stock_quantity" value="${p.stock_quantity}" style="width:45px;border:none;background:transparent;font-size:12px;color:var(--text-primary);padding:2px;text-align:center;"></td>
                  <td style="padding:4px 6px;font-size:11px;">${st.icon} <span style="color:${st.cls === 'error' ? 'var(--danger)' : st.cls === 'dup' ? 'var(--warning)' : 'var(--success)'};">${st.text}</span></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>

        <!-- Progress bar (hidden until import starts) -->
        <div id="imp-progress" style="display:none;margin-top:12px;">
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:4px;" id="imp-progress-text"></div>
          <div style="height:6px;background:var(--bg-tertiary);border-radius:3px;overflow:hidden;">
            <div id="imp-progress-bar" style="height:100%;background:var(--accent);width:0%;transition:width 0.2s;"></div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="import-back">${lang === 'ar' ? 'رجوع' : 'Back'}</button>
        <button class="btn btn-primary" id="import-confirm" ${validCount === 0 ? 'disabled' : ''}>
          ${lang === 'ar' ? `استيراد ${validCount} منتج` : `Import ${validCount} Products`}
        </button>
      </div>
    `;

    // Select all checkbox
    modal.querySelector('#imp-select-all').addEventListener('change', (e) => {
      parsed.forEach(p => p._selected = e.target.checked);
      render();
    });

    // Row checkboxes
    modal.querySelectorAll('.imp-row-check').forEach(cb => {
      cb.addEventListener('change', () => {
        parsed[parseInt(cb.dataset.idx)]._selected = cb.checked;
        render();
      });
    });

    // Inline editing
    modal.querySelectorAll('.imp-edit').forEach(input => {
      input.addEventListener('change', () => {
        const idx = parseInt(input.dataset.idx);
        const field = input.dataset.field;
        if (field === 'price' || field === 'stock_quantity' || field === 'cost') {
          parsed[idx][field] = parseFloat(input.value) || 0;
        } else {
          parsed[idx][field] = input.value.trim();
        }
        // Re-render status column only (without full re-render to keep focus)
        const tr = input.closest('tr');
        const st = getStatus(parsed[idx]);
        const statusTd = tr.querySelector('td:last-child');
        if (statusTd) statusTd.innerHTML = `${st.icon} <span style="color:${st.cls === 'error' ? 'var(--danger)' : st.cls === 'dup' ? 'var(--warning)' : 'var(--success)'};">${st.text}</span>`;
      });
    });

    // Close / Back
    modal.querySelector('#modal-close').addEventListener('click', () => { overlay.style.display = 'none'; });
    modal.querySelector('#import-back').addEventListener('click', () => { showImportMapping(container, excelData, {}); });

    // IMPORT CONFIRM
    modal.querySelector('#import-confirm').addEventListener('click', async () => {
      const selectedProducts = parsed.filter(p => p._selected && p.name_ar && p.price > 0);
      if (selectedProducts.length === 0) return;

      const btn = modal.querySelector('#import-confirm');
      btn.disabled = true;
      btn.textContent = lang === 'ar' ? 'جاري الاستيراد...' : 'Importing...';

      const progressEl = modal.querySelector('#imp-progress');
      const progressBar = modal.querySelector('#imp-progress-bar');
      const progressText = modal.querySelector('#imp-progress-text');
      progressEl.style.display = 'block';

      let imported = 0, updated = 0, errors = 0;

      // Get existing categories
      const catResult = await window.daftrly.query('SELECT id, name_ar, name_en FROM categories WHERE is_active = 1');
      const existingCats = (catResult.success && catResult.data) ? catResult.data : [];

      for (let i = 0; i < selectedProducts.length; i++) {
        const p = selectedProducts[i];

        // Update progress
        const pct = Math.round(((i + 1) / selectedProducts.length) * 100);
        progressBar.style.width = pct + '%';
        progressText.textContent = `${i + 1} / ${selectedProducts.length} (${pct}%)`;

        try {
          // Auto-create category if needed
          let categoryId = null;
          if (p.category) {
            const catSearch = p.category.trim();
            const found = existingCats.find(c => 
              (c.name_ar && c.name_ar.trim() === catSearch) || 
              (c.name_en && c.name_en.trim() === catSearch)
            );
            if (found) {
              categoryId = found.id;
            } else {
              const createResult = await window.daftrly.query(
                'INSERT INTO categories (name_ar, name_en) VALUES (?, ?)',
                [p.category, p.category]
              );
              if (createResult.success && createResult.data?.lastInsertId) {
                categoryId = createResult.data.lastInsertId;
                existingCats.push({ id: categoryId, name_ar: p.category, name_en: p.category });
              }
            }
          }

          // Normalize unit & tax
          const validUnits = ['piece', 'kg', 'gram', 'liter', 'meter', 'sqm', 'box', 'pack', 'carton', 'hour', 'service'];
          const unit = validUnits.includes(p.unit) ? p.unit : 'piece';
          const validTax = ['standard', 'zero', 'exempt'];
          const taxStatus = validTax.includes(p.tax_status) ? p.tax_status : 'standard';

          // Check if product exists (by barcode)
          if (p.barcode && existingBarcodes[p.barcode]) {
            // UPDATE existing product
            await window.daftrly.query(
              `UPDATE products SET name_ar=?, name_en=?, category_id=?, price=?, cost=?, unit=?, 
               stock_quantity=?, reorder_level=?, tax_status=?, updated_at=datetime('now') 
               WHERE barcode=? AND is_active=1`,
              [p.name_ar, p.name_en || null, categoryId, p.price, p.cost, unit,
               p.stock_quantity, p.reorder_level, taxStatus, p.barcode]
            );
            updated++;
          } else {
            // INSERT new product
            await window.daftrly.query(
              `INSERT INTO products (name_ar, name_en, barcode, sku, category_id, price, cost, unit, 
               track_stock, stock_quantity, reorder_level, tax_status) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
              [p.name_ar, p.name_en || null, p.barcode || null, p.sku || null, categoryId,
               p.price, p.cost, unit, p.stock_quantity, p.reorder_level, taxStatus]
            );
            imported++;
          }
        } catch (e) {
          errors++;
          window.dbg('error', `Import row ${p._row} failed`, e.message);
        }
      }

      window.dbg('success', `Import complete: ${imported} new, ${updated} updated, ${errors} errors`);
      
      let msg = lang === 'ar' 
        ? `✅ تم استيراد ${imported} منتج جديد` 
        : `✅ ${imported} new products imported`;
      if (updated > 0) msg += lang === 'ar' ? ` | تحديث ${updated}` : ` | ${updated} updated`;
      if (errors > 0) msg += lang === 'ar' ? ` | ${errors} أخطاء` : ` | ${errors} errors`;
      
      showToast(msg, 'success');
      overlay.style.display = 'none';
      await loadCategoryChips(container);
      await loadProducts(container);
    });
  }

  // Initial load: check duplicates then render
  checkDuplicates().then(() => render());
}

// ============ EXPORT PRODUCTS ============
async function exportProducts() {
  const lang = window.i18n.getLang();
  window.dbg('ui', 'Exporting products');
  const result = await window.daftrly.exportProducts();
  if (result.success) {
    window.dbg('success', `Exported ${result.count} products`);
    showToast(lang === 'ar' ? `تم تصدير ${result.count} منتج` : `${result.count} products exported`, 'success');
  } else if (result.canceled) {
    // user canceled - do nothing
  } else {
    showToast(result.error || (lang === 'ar' ? 'خطأ في التصدير' : 'Export error'), 'error');
  }
}

// ============ BARCODE LABEL PRINTING ============
function openBarcodePrintModal(productName, barcode, price) {
  const lang = window.i18n?.getLang() || 'ar';
  if (!barcode) {
    showToast(lang === 'ar' ? 'هذا المنتج ليس له باركود' : 'This product has no barcode', 'error');
    return;
  }

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:550px;width:95%;">
      <div class="modal-header">
        <h3>🏷 ${lang === 'ar' ? 'طباعة ملصقات باركود' : 'Print Barcode Labels'}</h3>
        <button class="modal-close" id="lbl-close">✕</button>
      </div>
      <div class="modal-body" style="padding:20px;">
        <div style="margin-bottom:16px;padding:12px;background:var(--bg-secondary);border-radius:8px;">
          <div style="font-weight:700;">${escapeHtml(productName)}</div>
          <div style="font-size:12px;color:var(--text-secondary);font-family:var(--font-mono);">${escapeHtml(barcode)}</div>
          <div style="font-size:13px;font-weight:600;">${price.toFixed(2)} ${window.getCurrSym()}</div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label class="form-label">${lang === 'ar' ? 'عدد الملصقات *' : 'Number of Labels *'}</label>
            <input type="text" inputmode="numeric" id="lbl-qty" class="form-input" value="10" placeholder="1-500">
          </div>
          <div class="form-group">
            <label class="form-label">${lang === 'ar' ? 'حجم الملصق' : 'Label Size'}</label>
            <select id="lbl-size" class="form-input form-select">
              <option value="small">30×20mm (${lang === 'ar' ? 'صغير' : 'Small'})</option>
              <option value="medium" selected>50×25mm (${lang === 'ar' ? 'متوسط' : 'Medium'})</option>
              <option value="large">70×35mm (${lang === 'ar' ? 'كبير' : 'Large'})</option>
            </select>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label class="form-label">${lang === 'ar' ? 'أعمدة لكل صف' : 'Columns per Row'}</label>
            <select id="lbl-cols" class="form-input form-select">
              <option value="3">3</option>
              <option value="4" selected>4</option>
              <option value="5">5</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">${lang === 'ar' ? 'المحتوى' : 'Label Content'}</label>
            <div style="font-size:12px;margin-top:4px;">
              <label style="display:block;cursor:pointer;"><input type="checkbox" id="lbl-show-name" checked> ${lang === 'ar' ? 'اسم المنتج' : 'Product Name'}</label>
              <label style="display:block;cursor:pointer;"><input type="checkbox" id="lbl-show-price" checked> ${lang === 'ar' ? 'السعر' : 'Price'}</label>
            </div>
          </div>
        </div>

        <div style="margin-top:12px;padding:12px;background:var(--bg-tertiary);border-radius:8px;text-align:center;">
          <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px;">${lang === 'ar' ? 'معاينة الملصق:' : 'Label preview:'}</div>
          <div id="lbl-preview" style="display:inline-block;border:1px dashed var(--border);padding:6px 10px;background:white;color:#000;text-align:center;">
            <div style="font-size:9px;font-weight:600;">${escapeHtml(productName.substring(0, 20))}</div>
            <svg id="lbl-preview-bc" width="120" height="28" viewBox="0 0 120 28" xmlns="http://www.w3.org/2000/svg" style="display:block;margin:2px auto;"></svg>
            <div style="font-size:8px;font-family:monospace;">${escapeHtml(barcode)}</div>
            <div style="font-size:9px;font-weight:700;">${price.toFixed(2)} ${window.getCurrSym()}</div>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="lbl-cancel">${lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
        <button class="btn btn-primary" id="lbl-print">🖨 ${lang === 'ar' ? 'طباعة' : 'Print'}</button>
      </div>
    </div>
  `;

  overlay.style.display = 'flex';
  document.body.appendChild(overlay);

  // Render preview barcode
  renderSVGBarcode(overlay.querySelector('#lbl-preview-bc'), barcode);

  const close = () => overlay.remove();
  overlay.querySelector('#lbl-close').addEventListener('click', close);
  overlay.querySelector('#lbl-cancel').addEventListener('click', close);

  overlay.querySelector('#lbl-print').addEventListener('click', () => {
    const qty = parseInt(overlay.querySelector('#lbl-qty').value) || 10;
    const size = overlay.querySelector('#lbl-size').value;
    const cols = parseInt(overlay.querySelector('#lbl-cols').value) || 4;
    const showName = overlay.querySelector('#lbl-show-name').checked;
    const showPrice = overlay.querySelector('#lbl-show-price').checked;

    if (qty < 1 || qty > 500) {
      showToast(lang === 'ar' ? 'العدد من 1 إلى 500' : 'Quantity 1-500', 'error');
      return;
    }

    printBarcodeLabels(productName, barcode, price, qty, size, cols, showName, showPrice);
    close();
  });
}

function renderSVGBarcode(svgEl, text) {
  if (!svgEl || !text) return;
  const bw = 1.5;
  let bars = [];
  let bx = 0;
  [2, 1, 1, 2, 3, 2].forEach(b => { bars.push({ x: bx, w: bw * b }); bx += bw * b + bw; });
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const pat = [(code >> 6) & 3, (code >> 4) & 3, (code >> 2) & 3, code & 3, ((code >> 1) & 1) + 1];
    pat.forEach((b, j) => { if (j % 2 === 0) bars.push({ x: bx, w: bw * (b + 1) }); bx += bw * (b + 1); });
  }
  const totalW = bx;
  svgEl.setAttribute('viewBox', `0 0 ${totalW} 20`);
  svgEl.innerHTML = bars.map(b => `<rect x="${b.x}" y="0" width="${b.w}" height="20" fill="#000"/>`).join('');
}

function printBarcodeLabels(name, barcode, price, qty, size, cols, showName, showPrice) {
  const sizes = { small: { w: 90, h: 55, bcW: 70, bcH: 22, fs: 7, pfs: 8 }, medium: { w: 140, h: 70, bcW: 110, bcH: 28, fs: 9, pfs: 10 }, large: { w: 190, h: 95, bcW: 150, bcH: 35, fs: 10, pfs: 12 } };
  const s = sizes[size] || sizes.medium;
  const rows = Math.ceil(qty / cols);
  const totalPages = Math.ceil(rows / (size === 'small' ? 14 : size === 'medium' ? 10 : 7));
  const rowsPerPage = size === 'small' ? 14 : size === 'medium' ? 10 : 7;

  // Generate barcode SVG bars
  const bw = 1.5;
  let bars = [];
  let bx = 0;
  [2, 1, 1, 2, 3, 2].forEach(b => { bars.push({ x: bx, w: bw * b }); bx += bw * b + bw; });
  for (let i = 0; i < barcode.length; i++) {
    const code = barcode.charCodeAt(i);
    const pat = [(code >> 6) & 3, (code >> 4) & 3, (code >> 2) & 3, code & 3, ((code >> 1) & 1) + 1];
    pat.forEach((b, j) => { if (j % 2 === 0) bars.push({ x: bx, w: bw * (b + 1) }); bx += bw * (b + 1); });
  }
  const totalBcW = bx;
  const barsStr = bars.map(b => `<rect x="${b.x}" y="0" width="${b.w}" height="${s.bcH - 8}" fill="#000"/>`).join('');

  let labelsHtml = '';
  for (let i = 0; i < qty; i++) {
    labelsHtml += `
      <div style="width:${s.w}px;height:${s.h}px;border:0.5px dashed #ccc;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;padding:2px 4px;box-sizing:border-box;overflow:hidden;page-break-inside:avoid;">
        ${showName ? `<div style="font-size:${s.fs}px;font-weight:600;text-align:center;max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${name.substring(0, 25)}</div>` : ''}
        <svg width="${s.bcW}" height="${s.bcH}" viewBox="0 0 ${totalBcW} ${s.bcH}" xmlns="http://www.w3.org/2000/svg" style="display:block;">
          ${barsStr}
          <text x="${totalBcW / 2}" y="${s.bcH - 1}" font-family="monospace" font-size="${s.fs}" text-anchor="middle" fill="#000">${barcode}</text>
        </svg>
        ${showPrice ? `<div style="font-size:${s.pfs}px;font-weight:700;">${price.toFixed(2)} ${window.getCurrSym()}</div>` : ''}
      </div>`;
  }

  const printWin = window.open('', '_blank', 'width=800,height=600');
  printWin.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: Arial, sans-serif; padding:5mm; }
      .labels-grid { display:flex; flex-wrap:wrap; gap:0; }
      @media print { @page { size:A4; margin:5mm; } body { padding:0; } }
    </style>
  </head><body>
    <div class="labels-grid">${labelsHtml}</div>
  </body></html>`);
  printWin.document.close();
  printWin.focus();
  setTimeout(() => { printWin.print(); printWin.close(); }, 400);
}

// ============ EXPOSE ============
window.renderProducts = renderProducts;
