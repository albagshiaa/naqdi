// ============================================
// NAQDI - MODULE 6C: PURCHASE ORDERS
// Create POs, receive stock, track costs
// ============================================

async function renderPurchases(container) {
  const lang = window.i18n.getLang();
  window.dbg('nav', 'Rendering Purchases page');

  container.innerHTML = `
    <div class="sales-page slide-in">
      <div class="products-toolbar">
        <div class="products-search-wrap">
          <div class="products-search-icon">${window.icons.getIcon('search')}</div>
          <input type="text" id="po-search" class="products-search" 
            placeholder="${lang === 'ar' ? 'ابحث برقم أمر الشراء...' : 'Search by PO number...'}">
        </div>
        <div class="products-actions">
          <button class="btn btn-primary btn-sm" id="btn-add-po">
            ${window.icons.getIcon('plus')}
            <span>${lang === 'ar' ? 'أمر شراء جديد' : 'New Purchase Order'}</span>
          </button>
        </div>
      </div>
      <div class="sales-table-wrap" id="po-table"></div>
    </div>
    <div class="modal-overlay" id="modal-overlay" style="display:none">
      <div class="modal" id="modal-content" style="max-width:800px;"></div>
    </div>
  `;

  container.querySelector('#btn-add-po').addEventListener('click', () => openPOModal(container, null));

  let searchTimer;
  container.querySelector('#po-search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadPOList(container), 300);
  });

  await loadPOList(container);
}

async function loadPOList(container) {
  const lang = window.i18n.getLang();
  const search = container.querySelector('#po-search')?.value.trim() || '';

  let sql = `SELECT po.*, s.name_ar as sup_name_ar, s.name_en as sup_name_en 
    FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id WHERE 1=1`;
  const params = [];

  if (search) {
    sql += ' AND po.po_number LIKE ?';
    params.push(`%${search}%`);
  }
  sql += ' ORDER BY po.created_at DESC LIMIT 100';

  const result = await window.daftrly.query(sql, params);
  const orders = (result.success && result.data) ? result.data : [];
  window.dbg('load', `Purchase orders loaded: ${orders.length}`);

  const tableEl = container.querySelector('#po-table');
  if (!tableEl) return;

  if (orders.length === 0) {
    tableEl.innerHTML = `<div class="empty-state" style="padding:40px"><div style="font-size:48px;opacity:0.15;margin-bottom:12px;">🛍️</div><div class="empty-state-title">${lang === 'ar' ? 'لا توجد أوامر شراء' : 'No purchase orders'}</div></div>`;
    return;
  }

  const statusLabels = {
    draft: { ar: 'مسودة', en: 'Draft', cls: 'status-draft' },
    ordered: { ar: 'تم الطلب', en: 'Ordered', cls: 'status-ordered' },
    received: { ar: 'تم الاستلام', en: 'Received', cls: 'status-received' },
    partial: { ar: 'استلام جزئي', en: 'Partial', cls: 'status-partial' },
  };

  tableEl.innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>${lang === 'ar' ? 'رقم الأمر' : 'PO #'}</th>
        <th>${lang === 'ar' ? 'المورد' : 'Supplier'}</th>
        <th>${lang === 'ar' ? 'التاريخ' : 'Date'}</th>
        <th>${lang === 'ar' ? 'الإجمالي' : 'Total'}</th>
        <th>${lang === 'ar' ? 'الحالة' : 'Status'}</th>
        <th></th>
      </tr></thead>
      <tbody>
        ${orders.map(po => {
          const supName = po.sup_name_ar ? (lang === 'ar' ? po.sup_name_ar : (po.sup_name_en || po.sup_name_ar)) : (lang === 'ar' ? 'غير محدد' : 'Unknown');
          const st = statusLabels[po.status] || statusLabels.draft;
          return `<tr>
            <td style="font-family:var(--font-mono);font-size:12px;font-weight:600;">${_escP(po.po_number)}</td>
            <td>${_escP(supName)}</td>
            <td style="font-size:12px;">${po.created_at ? po.created_at.substring(0, 10) : '-'}</td>
            <td style="font-weight:700;">${formatCurrency(po.total)}</td>
            <td><span class="po-status ${st.cls}">${lang === 'ar' ? st.ar : st.en}</span></td>
            <td>
              <div style="display:flex;gap:4px;justify-content:flex-end;">
                <button class="btn btn-secondary btn-sm" data-action="view-po" data-id="${po.id}">${lang === 'ar' ? 'عرض' : 'View'}</button>
                ${po.status === 'draft' ? `<button class="btn btn-secondary btn-sm" data-action="edit-po" data-id="${po.id}">${lang === 'ar' ? 'تعديل' : 'Edit'}</button>` : ''}
                ${po.status === 'ordered' || po.status === 'draft' ? `<button class="btn btn-primary btn-sm" data-action="receive-po" data-id="${po.id}">${lang === 'ar' ? 'استلام' : 'Receive'}</button>` : ''}
                ${po.status === 'draft' || po.status === 'ordered' ? `<button class="btn btn-danger btn-sm" data-action="delete-po" data-id="${po.id}">${lang === 'ar' ? 'حذف' : 'Delete'}</button>` : ''}
              </div>
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;

  tableEl.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id);
      if (btn.dataset.action === 'view-po') {
        await openPODetail(container, id);
      } else if (btn.dataset.action === 'edit-po') {
        const poRes = await window.daftrly.query('SELECT * FROM purchase_orders WHERE id = ?', [id]);
        if (poRes.success && poRes.data?.[0]) await openPOModal(container, poRes.data[0]);
      } else if (btn.dataset.action === 'receive-po') {
        await receivePO(container, id);
      } else if (btn.dataset.action === 'delete-po') {
        await deletePO(container, id);
      }
    });
  });
}

// ============ CREATE / EDIT PO ============
async function openPOModal(container, po) {
  const lang = window.i18n.getLang();
  const isEdit = !!po;
  const overlay = container.querySelector('#modal-overlay');
  const modal = container.querySelector('#modal-content');

  // Load suppliers
  const supResult = await window.daftrly.query('SELECT * FROM suppliers WHERE is_active = 1 ORDER BY name_ar');
  const suppliers = (supResult.success && supResult.data) ? supResult.data : [];

  // Load products
  const prodResult = await window.daftrly.query('SELECT * FROM products WHERE is_active = 1 ORDER BY name_ar');
  const products = (prodResult.success && prodResult.data) ? prodResult.data : [];

  // PO items state
  let poItems = [];
  if (isEdit) {
    const itemsResult = await window.daftrly.query(
      `SELECT poi.*, p.name_ar, p.name_en FROM purchase_order_items poi 
       LEFT JOIN products p ON poi.product_id = p.id WHERE poi.po_id = ?`, [po.id]);
    poItems = (itemsResult.success && itemsResult.data) ? itemsResult.data : [];
  }

  function renderModal() {
    const poTotal = poItems.reduce((s, i) => s + (i.quantity * i.unit_cost), 0);

    modal.innerHTML = `
      <div class="modal-header">
        <h3 class="modal-title">${isEdit ? (lang === 'ar' ? 'تعديل أمر الشراء' : 'Edit Purchase Order') : (lang === 'ar' ? 'أمر شراء جديد' : 'New Purchase Order')}</h3>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
      <div class="modal-body">
        <!-- Add product to PO (first) -->
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'إضافة منتج' : 'Add Product'}</label>
          <div class="po-add-row">
            <select id="po-product" class="form-input form-select" style="flex:2;">
              <option value="">${lang === 'ar' ? 'اختر المنتج' : 'Select product'}</option>
              ${products.map(p => `<option value="${p.id}" data-cost="${p.cost || 0}">${lang === 'ar' ? p.name_ar : (p.name_en || p.name_ar)}</option>`).join('')}
            </select>
            <input type="text" inputmode="numeric" id="po-qty" class="form-input" placeholder="${lang === 'ar' ? 'الكمية' : 'Qty'}" value="1" style="flex:0.7;">
            <input type="text" inputmode="decimal" id="po-cost" class="form-input" placeholder="${lang === 'ar' ? 'التكلفة' : 'Cost'}" style="flex:0.7;">
            <button class="btn btn-primary btn-sm" id="po-add-item">${window.icons.getIcon('plus')}</button>
          </div>
        </div>

        <!-- PO Items list -->
        <div class="po-items-list" id="po-items-list">
          ${poItems.length === 0 ? `<div class="empty-state" style="padding:16px"><div class="empty-state-desc">${lang === 'ar' ? 'لم يتم إضافة منتجات بعد' : 'No products added yet'}</div></div>` : `
          <table class="data-table">
            <thead><tr>
              <th>${lang === 'ar' ? 'المنتج' : 'Product'}</th>
              <th>${lang === 'ar' ? 'الكمية' : 'Qty'}</th>
              <th>${lang === 'ar' ? 'التكلفة' : 'Cost'}</th>
              <th>${lang === 'ar' ? 'الإجمالي' : 'Total'}</th>
              <th></th>
            </tr></thead>
            <tbody>
              ${poItems.map((item, idx) => `<tr>
                <td>${_escP(lang === 'ar' ? item.name_ar : (item.name_en || item.name_ar))}</td>
                <td>${item.quantity}</td>
                <td>${formatCurrency(item.unit_cost)}</td>
                <td style="font-weight:600;">${formatCurrency(item.quantity * item.unit_cost)}</td>
                <td><button class="btn-icon btn-icon-danger" data-remove-idx="${idx}">✕</button></td>
              </tr>`).join('')}
            </tbody>
          </table>
          <div style="text-align:end;padding:10px 14px;font-weight:700;font-size:16px;color:var(--accent);">
            ${lang === 'ar' ? 'الإجمالي:' : 'Total:'} ${formatCurrency(poTotal)}
          </div>`}
        </div>

        <!-- Supplier & date (after products) -->
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">${lang === 'ar' ? 'المورد' : 'Supplier'}</label>
            <select id="po-supplier" class="form-input form-select">
              <option value="">${lang === 'ar' ? 'اختر المورد (اختياري)' : 'Select supplier (optional)'}</option>
              ${suppliers.map(s => `<option value="${s.id}" ${po?.supplier_id === s.id ? 'selected' : ''}>${lang === 'ar' ? s.name_ar : (s.name_en || s.name_ar)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">${lang === 'ar' ? 'تاريخ التوصيل المتوقع' : 'Expected Delivery'}</label>
            <input type="date" id="po-date" class="form-input" value="${po?.expected_date || ''}">
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'ملاحظات' : 'Notes'}</label>
          <textarea id="po-notes" class="form-input form-textarea" rows="2">${_escP(po?.notes || '')}</textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="modal-cancel">${lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
        <button class="btn btn-primary" id="modal-save">${isEdit ? (lang === 'ar' ? 'حفظ' : 'Save') : (lang === 'ar' ? 'إنشاء أمر الشراء' : 'Create PO')}</button>
      </div>
    `;

    // Auto-fill cost when product selected
    const prodSelect = modal.querySelector('#po-product');
    const costInput = modal.querySelector('#po-cost');
    prodSelect.addEventListener('change', () => {
      const opt = prodSelect.options[prodSelect.selectedIndex];
      costInput.value = opt.dataset.cost || '';
    });

    // Add item
    modal.querySelector('#po-add-item').addEventListener('click', () => {
      const productId = parseInt(prodSelect.value);
      if (!productId) { showToast(lang === 'ar' ? 'اختر المنتج' : 'Select a product', 'warning'); return; }
      const qty = parseFloat(modal.querySelector('#po-qty').value) || 0;
      if (qty <= 0) { showToast(lang === 'ar' ? 'أدخل الكمية' : 'Enter quantity', 'warning'); return; }
      const cost = parseFloat(costInput.value) || 0;

      const prod = products.find(p => p.id === productId);
      poItems.push({
        product_id: productId,
        name_ar: prod?.name_ar || '',
        name_en: prod?.name_en || '',
        quantity: qty,
        unit_cost: cost,
        received_quantity: 0,
      });
      window.dbg('ui', `PO item added: ${prod?.name_ar}, qty: ${qty}, cost: ${cost}`);
      renderModal(); // re-render to show updated items
    });

    // Remove items
    modal.querySelectorAll('[data-remove-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        poItems.splice(parseInt(btn.dataset.removeIdx), 1);
        renderModal();
      });
    });

    // Close
    modal.querySelector('#modal-close').addEventListener('click', () => { overlay.style.display = 'none'; });
    modal.querySelector('#modal-cancel').addEventListener('click', () => { overlay.style.display = 'none'; });

    // Save
    modal.querySelector('#modal-save').addEventListener('click', async () => {
      const supplierId = parseInt(modal.querySelector('#po-supplier').value) || null;
      if (poItems.length === 0) { showToast(lang === 'ar' ? 'أضف منتجاً واحداً على الأقل' : 'Add at least one product', 'error'); return; }

      const total = poItems.reduce((s, i) => s + (i.quantity * i.unit_cost), 0);
      const notes = modal.querySelector('#po-notes').value.trim();
      const expectedDate = modal.querySelector('#po-date').value || null;

      window.dbg('save', `PO ${isEdit ? 'update' : 'create'}`, { supplier: supplierId, items: poItems.length, total });

      if (isEdit) {
        await window.daftrly.query('UPDATE purchase_orders SET supplier_id=?, total=?, notes=?, expected_date=? WHERE id=?',
          [supplierId, total, notes, expectedDate, po.id]);
        // Delete old items and re-insert
        await window.daftrly.query('DELETE FROM purchase_order_items WHERE po_id = ?', [po.id]);
        for (const item of poItems) {
          await window.daftrly.query(
            'INSERT INTO purchase_order_items (po_id, product_id, quantity, unit_cost, total) VALUES (?,?,?,?,?)',
            [po.id, item.product_id, item.quantity, item.unit_cost, item.quantity * item.unit_cost]);
        }
      } else {
        const poNum = await window.daftrly.nextSequence('purchase_order');
        const poNumber = `PO-${new Date().getFullYear()}-${String(poNum).padStart(5, '0')}`;
        const poResult = await window.daftrly.query(
          'INSERT INTO purchase_orders (po_number, supplier_id, status, total, notes, expected_date) VALUES (?,?,?,?,?,?)',
          [poNumber, supplierId, 'draft', total, notes, expectedDate]);

        if (poResult.success) {
          const newPoId = poResult.data.lastInsertId || 0;
          for (const item of poItems) {
            await window.daftrly.query(
              'INSERT INTO purchase_order_items (po_id, product_id, quantity, unit_cost, total) VALUES (?,?,?,?,?)',
              [newPoId, item.product_id, item.quantity, item.unit_cost, item.quantity * item.unit_cost]);
          }
        }
      }

      window.dbg('success', `PO ${isEdit ? 'updated' : 'created'}`);
      showToast(lang === 'ar' ? (isEdit ? 'تم التحديث' : 'تم إنشاء أمر الشراء') : (isEdit ? 'Updated' : 'PO Created'), 'success');
      overlay.style.display = 'none';
      loadPOList(container);
    });
  }

  overlay.style.display = 'flex';
  renderModal();
}

// ============ VIEW PO DETAIL ============
async function openPODetail(container, poId) {
  const lang = window.i18n.getLang();
  const overlay = container.querySelector('#modal-overlay');
  const modal = container.querySelector('#modal-content');

  const poResult = await window.daftrly.query(
    `SELECT po.*, s.name_ar as sup_name_ar, s.name_en as sup_name_en 
     FROM purchase_orders po LEFT JOIN suppliers s ON po.supplier_id = s.id WHERE po.id = ?`, [poId]);
  if (!poResult.success || !poResult.data?.[0]) return;
  const po = poResult.data[0];

  const itemsResult = await window.daftrly.query(
    `SELECT poi.*, p.name_ar, p.name_en FROM purchase_order_items poi 
     LEFT JOIN products p ON poi.product_id = p.id WHERE poi.po_id = ?`, [poId]);
  const items = (itemsResult.success && itemsResult.data) ? itemsResult.data : [];

  const supName = po.sup_name_ar ? (lang === 'ar' ? po.sup_name_ar : (po.sup_name_en || po.sup_name_ar)) : '-';

  modal.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">${lang === 'ar' ? 'أمر شراء' : 'Purchase Order'} ${_escP(po.po_number)}</h3>
      <button class="modal-close" id="modal-close">✕</button>
    </div>
    <div class="modal-body">
      <div class="inv-customer-row">
        <span>${lang === 'ar' ? 'المورد:' : 'Supplier:'} <strong>${_escP(supName)}</strong></span>
        <span>${lang === 'ar' ? 'الحالة:' : 'Status:'} <strong>${po.status}</strong></span>
      </div>
      <table class="data-table">
        <thead><tr>
          <th>${lang === 'ar' ? 'المنتج' : 'Product'}</th>
          <th>${lang === 'ar' ? 'الكمية المطلوبة' : 'Ordered'}</th>
          <th>${lang === 'ar' ? 'المستلم' : 'Received'}</th>
          <th>${lang === 'ar' ? 'التكلفة' : 'Cost'}</th>
          <th>${lang === 'ar' ? 'الإجمالي' : 'Total'}</th>
        </tr></thead>
        <tbody>
          ${items.map(item => `<tr>
            <td>${_escP(lang === 'ar' ? item.name_ar : (item.name_en || item.name_ar))}</td>
            <td>${item.quantity}</td>
            <td>${item.received_quantity || 0}</td>
            <td>${formatCurrency(item.unit_cost)}</td>
            <td style="font-weight:600;">${formatCurrency(item.total)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div style="text-align:end;padding:12px 0;font-weight:700;font-size:18px;color:var(--accent);">
        ${lang === 'ar' ? 'الإجمالي:' : 'Total:'} ${formatCurrency(po.total)}
      </div>
      <div id="po-payment-section" style="padding:8px 0;border-top:1px solid var(--border);margin-top:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <span style="font-size:13px;font-weight:600;">${lang === 'ar' ? '💰 المدفوعات' : '💰 Payments'}</span>
          <div style="font-size:13px;">
            <span style="color:var(--success);">${lang === 'ar' ? 'مدفوع:' : 'Paid:'} ${formatCurrency(po.paid_amount || 0)}</span>
            <span style="margin:0 8px;">|</span>
            <span style="color:${(po.total - (po.paid_amount || 0)) > 0.01 ? 'var(--danger)' : 'var(--success)'};">${lang === 'ar' ? 'متبقي:' : 'Due:'} ${formatCurrency(Math.max(0, po.total - (po.paid_amount || 0)))}</span>
          </div>
        </div>
        <div id="po-payments-list" style="font-size:12px;color:var(--text-secondary);"></div>
        ${(po.total - (po.paid_amount || 0)) > 0.01 ? `
          <button class="btn btn-primary btn-sm" id="modal-record-payment" style="margin-top:8px;">💳 ${lang === 'ar' ? 'تسجيل دفعة' : 'Record Payment'}</button>
        ` : ''}
      </div>
      ${po.notes ? `<div class="inv-notes">${lang === 'ar' ? 'ملاحظات:' : 'Notes:'} ${_escP(po.notes)}</div>` : ''}
    </div>
    <div class="modal-footer" style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;">
      <div style="display:flex;gap:6px;">
        ${po.status === 'received' ? `
          <button class="btn btn-secondary btn-sm" id="modal-sup-credit" style="color:var(--success);">📄 ${lang === 'ar' ? 'إشعار دائن للمورد' : 'Supplier Credit Note'}</button>
          <button class="btn btn-secondary btn-sm" id="modal-sup-debit" style="color:var(--warning);">📄 ${lang === 'ar' ? 'إشعار مدين للمورد' : 'Supplier Debit Note'}</button>
        ` : ''}
      </div>
      <div style="display:flex;gap:6px;">
        <button class="btn btn-secondary btn-sm" id="modal-print-po">🖨 ${lang === 'ar' ? 'طباعة' : 'Print'}</button>
        <button class="btn btn-secondary" id="modal-close2">${lang === 'ar' ? 'إغلاق' : 'Close'}</button>
        ${po.status === 'draft' ? `<button class="btn btn-secondary" id="modal-edit-po">${lang === 'ar' ? 'تعديل' : 'Edit'}</button>` : ''}
        ${po.status === 'draft' || po.status === 'ordered' ? `<button class="btn btn-danger" id="modal-delete-po">${lang === 'ar' ? 'حذف' : 'Delete'}</button>` : ''}
        ${po.status === 'draft' || po.status === 'ordered' ? `<button class="btn btn-primary" id="modal-receive-po">${lang === 'ar' ? 'استلام' : 'Receive'}</button>` : ''}
      </div>
    </div>
  `;

  overlay.style.display = 'flex';
  modal.querySelector('#modal-close').addEventListener('click', () => { overlay.style.display = 'none'; });
  modal.querySelector('#modal-close2').addEventListener('click', () => { overlay.style.display = 'none'; });

  // Print PO
  modal.querySelector('#modal-print-po')?.addEventListener('click', () => {
    const biz = window.appSettings?.business || {};
    const bizName = lang === 'ar' ? (biz.nameAr || 'المحل') : (biz.nameEn || biz.nameAr || 'Shop');
    const printWin = window.open('', '_blank', 'width=400,height=600');
    printWin.document.write(`<html dir="${lang === 'ar' ? 'rtl' : 'ltr'}"><head><style>
      body{font-family:Arial,sans-serif;padding:20px;font-size:13px;color:#000;}
      h2{text-align:center;margin:0 0 4px;}
      .sub{text-align:center;font-size:11px;color:#666;margin-bottom:12px;}
      table{width:100%;border-collapse:collapse;margin:10px 0;}
      th,td{border:1px solid #ccc;padding:6px;text-align:${lang === 'ar' ? 'right' : 'left'};font-size:12px;}
      th{background:#f0f0f0;font-weight:700;}
      .total{text-align:${lang === 'ar' ? 'left' : 'right'};font-size:16px;font-weight:700;margin:10px 0;}
      .info{margin:4px 0;font-size:12px;}
      .pay{margin:8px 0;padding:8px;background:#f5f5f5;border-radius:4px;font-size:12px;}
    </style></head><body>
      <h2>${bizName}</h2>
      <div class="sub">${lang === 'ar' ? 'أمر شراء' : 'Purchase Order'}</div>
      <div class="info"><b>${lang === 'ar' ? 'رقم الأمر:' : 'PO #:'}</b> ${_escP(po.po_number)}</div>
      <div class="info"><b>${lang === 'ar' ? 'المورد:' : 'Supplier:'}</b> ${_escP(supName)}</div>
      <div class="info"><b>${lang === 'ar' ? 'الحالة:' : 'Status:'}</b> ${po.status}</div>
      <div class="info"><b>${lang === 'ar' ? 'التاريخ:' : 'Date:'}</b> ${po.created_at ? po.created_at.substring(0, 10) : '-'}</div>
      <table>
        <tr><th>${lang === 'ar' ? 'المنتج' : 'Product'}</th><th>${lang === 'ar' ? 'الكمية' : 'Qty'}</th><th>${lang === 'ar' ? 'التكلفة' : 'Cost'}</th><th>${lang === 'ar' ? 'الإجمالي' : 'Total'}</th></tr>
        ${items.map(i => `<tr><td>${_escP(lang === 'ar' ? i.name_ar : (i.name_en || i.name_ar))}</td><td>${i.quantity}</td><td>${Number(i.unit_cost).toFixed(2)}</td><td>${Number(i.total).toFixed(2)}</td></tr>`).join('')}
      </table>
      <div class="total">${lang === 'ar' ? 'الإجمالي:' : 'Total:'} ${Number(po.total).toFixed(2)} ${window.getCurrSym()}</div>
      <div class="pay">
        <div>${lang === 'ar' ? 'المدفوع:' : 'Paid:'} ${Number(po.paid_amount || 0).toFixed(2)} ${window.getCurrSym()}</div>
        <div><b>${lang === 'ar' ? 'المتبقي:' : 'Due:'} ${Math.max(0, po.total - (po.paid_amount || 0)).toFixed(2)} ${window.getCurrSym()}</b></div>
      </div>
      ${po.notes ? `<div class="info" style="margin-top:8px;"><b>${lang === 'ar' ? 'ملاحظات:' : 'Notes:'}</b> ${_escP(po.notes)}</div>` : ''}
    </body></html>`);
    setTimeout(() => { printWin.print(); printWin.close(); }, 400);
  });

  modal.querySelector('#modal-edit-po')?.addEventListener('click', async () => {
    overlay.style.display = 'none';
    await openPOModal(container, po);
  });
  modal.querySelector('#modal-delete-po')?.addEventListener('click', async () => {
    overlay.style.display = 'none';
    await deletePO(container, po.id);
  });
  modal.querySelector('#modal-receive-po')?.addEventListener('click', async () => {
    overlay.style.display = 'none';
    await receivePO(container, po.id);
  });

  // Supplier credit/debit note
  modal.querySelector('#modal-sup-credit')?.addEventListener('click', async () => {
    const amount = await window.daftrlyPrompt(lang === 'ar' ? 'مبلغ الإشعار الدائن للمورد' : 'Supplier credit note amount', '0');
    if (!amount || parseFloat(amount) <= 0) return;
    const reason = await window.daftrlyPrompt(lang === 'ar' ? 'السبب' : 'Reason', lang === 'ar' ? 'بضاعة تالفة' : 'Damaged goods');
    if (!reason) return;
    const seqRes = await window.daftrly.nextSequence('credit_note');
    const noteNumber = `SCN-${String(seqRes).padStart(5, '0')}`;
    await window.daftrly.query(
      `INSERT INTO credit_debit_notes (note_number, note_type, sale_id, invoice_number, amount, reason, status, customer_id, created_by)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [noteNumber, 'supplier_credit', po.id, po.po_number, parseFloat(amount), reason, 'recorded', null, window._currentUser?.id || null]);
    window.logAudit('supplier_credit_note', 'credit_debit_notes', null, `${noteNumber} | ${po.po_number} | ${amount}`);
    showToast(lang === 'ar' ? `✅ تم إصدار ${noteNumber}` : `✅ ${noteNumber} issued`, 'success');
  });

  modal.querySelector('#modal-sup-debit')?.addEventListener('click', async () => {
    const amount = await window.daftrlyPrompt(lang === 'ar' ? 'مبلغ الإشعار المدين للمورد' : 'Supplier debit note amount', '0');
    if (!amount || parseFloat(amount) <= 0) return;
    const reason = await window.daftrlyPrompt(lang === 'ar' ? 'السبب' : 'Reason', lang === 'ar' ? 'خدمات إضافية' : 'Additional services');
    if (!reason) return;
    const seqRes = await window.daftrly.nextSequence('debit_note');
    const noteNumber = `SDN-${String(seqRes).padStart(5, '0')}`;
    await window.daftrly.query(
      `INSERT INTO credit_debit_notes (note_number, note_type, sale_id, invoice_number, amount, reason, status, customer_id, created_by)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [noteNumber, 'supplier_debit', po.id, po.po_number, parseFloat(amount), reason, 'recorded', null, window._currentUser?.id || null]);
    window.logAudit('supplier_debit_note', 'credit_debit_notes', null, `${noteNumber} | ${po.po_number} | ${amount}`);
    showToast(lang === 'ar' ? `✅ تم إصدار ${noteNumber}` : `✅ ${noteNumber} issued`, 'success');
  });

  // Load existing payments for this PO
  const paymentsRes = await window.daftrly.query('SELECT * FROM supplier_payments WHERE po_id=? ORDER BY date DESC', [poId]);
  const paymentsList = modal.querySelector('#po-payments-list');
  if (paymentsList && paymentsRes.success && paymentsRes.data?.length) {
    paymentsList.innerHTML = paymentsRes.data.map(p => `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px dotted var(--border);">
      <span>${p.date} — ${p.method === 'cash' ? (lang === 'ar' ? 'نقدي' : 'Cash') : p.method === 'transfer' ? (lang === 'ar' ? 'تحويل' : 'Transfer') : p.method}</span>
      <span style="font-weight:600;">${formatCurrency(p.amount)}</span>
    </div>`).join('');
  }

  // Record payment
  modal.querySelector('#modal-record-payment')?.addEventListener('click', async () => {
    const due = Math.max(0, po.total - (po.paid_amount || 0));
    const amountStr = await window.daftrlyPrompt(lang === 'ar' ? `المبلغ المدفوع (المتبقي: ${formatCurrency(due)})` : `Payment amount (due: ${formatCurrency(due)})`, String(due.toFixed(2)));
    if (!amountStr) return;
    const amount = parseFloat(amountStr);
    if (!amount || amount <= 0) return;

    const methodChoices = [
      { val: 'cash', label: lang === 'ar' ? 'نقدي' : 'Cash' },
      { val: 'transfer', label: lang === 'ar' ? 'تحويل بنكي' : 'Bank Transfer' },
      { val: 'cheque', label: lang === 'ar' ? 'شيك' : 'Cheque' }
    ];
    const method = await window.daftrlyPrompt(lang === 'ar' ? 'طريقة الدفع (cash/transfer/cheque)' : 'Method (cash/transfer/cheque)', 'cash');
    const ref = await window.daftrlyPrompt(lang === 'ar' ? 'رقم المرجع (اختياري)' : 'Reference # (optional)', '');

    await window.daftrly.query('INSERT INTO supplier_payments (supplier_id, po_id, amount, method, reference, date) VALUES (?,?,?,?,?,date(\'now\'))',
      [po.supplier_id, poId, amount, method || 'cash', ref || '']);
    await window.daftrly.query('UPDATE purchase_orders SET paid_amount = COALESCE(paid_amount,0) + ? WHERE id=?', [amount, poId]);
    window.logAudit('supplier_payment', 'supplier_payments', null, `PO:${po.po_number} | ${amount} | ${method || 'cash'}`);
    showToast(lang === 'ar' ? `✅ تم تسجيل دفعة ${formatCurrency(amount)}` : `✅ Payment ${formatCurrency(amount)} recorded`, 'success');
    overlay.style.display = 'none';
    openPODetail(container, poId); // refresh
  });
}

// ============ RECEIVE PO (update stock) ============
async function receivePO(container, poId) {
  const lang = window.i18n.getLang();
  window.dbg('save', `Receiving PO ${poId}`);

  // Get PO items
  const itemsResult = await window.daftrly.query(
    'SELECT * FROM purchase_order_items WHERE po_id = ?', [poId]);
  const items = (itemsResult.success && itemsResult.data) ? itemsResult.data : [];

  if (items.length === 0) {
    showToast(lang === 'ar' ? 'لا توجد منتجات في هذا الأمر' : 'No items in this PO', 'warning');
    return;
  }

  if (!await window.daftrlyConfirm(lang === 'ar' ? 'تأكيد استلام جميع المنتجات وتحديث المخزون؟' : 'Confirm receiving all items and updating stock?')) return;

  // Update stock for each item
  for (const item of items) {
    const qtyToReceive = item.quantity - (item.received_quantity || 0);
    if (qtyToReceive > 0) {
      // Get current stock and cost for weighted average calculation
      const prodRes = await window.daftrly.query('SELECT stock_quantity, cost FROM products WHERE id = ?', [item.product_id]);
      const currentQty = (prodRes.success && prodRes.data?.[0]) ? Number(prodRes.data[0].stock_quantity) || 0 : 0;
      const currentCost = (prodRes.success && prodRes.data?.[0]) ? Number(prodRes.data[0].cost) || 0 : 0;
      const newCost = Number(item.unit_cost) || 0;

      // Weighted average cost: ((old_qty * old_cost) + (new_qty * new_cost)) / (old_qty + new_qty)
      const totalQty = currentQty + qtyToReceive;
      const weightedCost = totalQty > 0
        ? ((currentQty * currentCost) + (qtyToReceive * newCost)) / totalQty
        : newCost;

      // Update product stock and weighted average cost
      await window.daftrly.query(
        'UPDATE products SET stock_quantity = stock_quantity + ?, cost = ? WHERE id = ?',
        [qtyToReceive, Math.round(weightedCost * 100) / 100, item.product_id]);

      // Update received qty in PO items
      await window.daftrly.query(
        'UPDATE purchase_order_items SET received_quantity = quantity WHERE po_id = ? AND product_id = ?',
        [poId, item.product_id]);

      // Log stock movement
      await window.daftrly.query(
        'INSERT INTO stock_movements (product_id, movement_type, quantity, reference_type, reference_id, notes) VALUES (?,?,?,?,?,?)',
        [item.product_id, 'purchase', qtyToReceive, 'purchase_order', poId, `PO received`]);

      window.dbg('save', `Stock updated: product ${item.product_id} +${qtyToReceive}`);
    }
  }

  // Update PO status
  await window.daftrly.query('UPDATE purchase_orders SET status = ?, received_date = datetime(\'now\') WHERE id = ?',
    ['received', poId]);

  window.dbg('success', `PO ${poId} fully received`);
  showToast(lang === 'ar' ? 'تم استلام البضاعة وتحديث المخزون' : 'Stock received and inventory updated', 'success');
  loadPOList(container);
}

// ============ DELETE PO ============
async function deletePO(container, poId) {
  const lang = window.i18n.getLang();
  if (!await window.daftrlyConfirm(lang === 'ar' ? 'هل أنت متأكد من حذف أمر الشراء؟ لا يمكن التراجع عن هذا الإجراء.' : 'Delete this purchase order? This cannot be undone.')) return;
  await window.daftrly.query('DELETE FROM purchase_order_items WHERE po_id = ?', [poId]);
  await window.daftrly.query('DELETE FROM purchase_orders WHERE id = ?', [poId]);
  showToast(lang === 'ar' ? 'تم حذف أمر الشراء' : 'Purchase order deleted', 'success');
  loadPOList(container);
}

function _escP(s) { return window.escHtml(s); }

window.renderPurchases = renderPurchases;
