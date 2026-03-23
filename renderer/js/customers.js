// ============================================
// NAQDI - MODULE 5A: CUSTOMERS
// Customer database with CRUD
// ============================================

async function renderCustomers(container) {
  const lang = window.i18n.getLang();
  window.dbg('nav', 'Rendering Customers page');

  container.innerHTML = `
    <div class="customers-page slide-in">
      <div class="products-toolbar">
        <div class="products-search-wrap">
          <div class="products-search-icon">${window.icons.getIcon('search')}</div>
          <input type="text" id="cust-search" class="products-search" 
            placeholder="${lang === 'ar' ? 'ابحث عن عميل... (اسم، هاتف)' : 'Search customers... (name, phone)'}">
        </div>
        <div class="products-actions">
          ${window.hasPermission('customers_add') ? `<button class="btn btn-primary btn-sm" id="btn-add-customer">
            ${window.icons.getIcon('plus')}
            <span>${lang === 'ar' ? 'عميل جديد' : 'New Customer'}</span>
          </button>` : ''}
        </div>
      </div>
      <div class="customers-list" id="customers-list"></div>
    </div>
    <div class="modal-overlay" id="modal-overlay" style="display:none">
      <div class="modal" id="modal-content"></div>
    </div>
  `;

  const addCustBtn = container.querySelector('#btn-add-customer');
  if (addCustBtn) addCustBtn.addEventListener('click', () => openCustomerModal(container, null));

  let searchTimer;
  container.querySelector('#cust-search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { window._custPage = 1; loadCustomersList(container, e.target.value.trim()); }, 300);
  });

  await loadCustomersList(container, '');
}

async function loadCustomersList(container, search) {
  const lang = window.i18n.getLang();
  let sql = 'SELECT * FROM customers WHERE is_active = 1';
  const params = [];
  const countParams = [];
  let countSql = 'SELECT COUNT(*) as total FROM customers WHERE is_active = 1';
  if (search) {
    sql += ' AND (name_ar LIKE ? OR name_en LIKE ? OR phone LIKE ?)';
    countSql += ' AND (name_ar LIKE ? OR name_en LIKE ? OR phone LIKE ?)';
    const q = `%${search}%`;
    params.push(q, q, q);
    countParams.push(q, q, q);
  }
  const perPage = 50;
  const page = window._custPage || 1;
  const offset = (page - 1) * perPage;
  sql += ' ORDER BY name_ar LIMIT ? OFFSET ?';
  params.push(perPage, offset);

  const countRes = await window.daftrly.query(countSql, countParams);
  const total = countRes.success && countRes.data?.[0] ? countRes.data[0].total : 0;
  const totalPages = Math.ceil(total / perPage);

  const result = await window.daftrly.query(sql, params);
  const customers = (result.success && result.data) ? result.data : [];
  window.dbg('load', `Customers loaded: ${customers.length} of ${total}`);

  const listEl = container.querySelector('#customers-list');
  if (!listEl) return;

  if (customers.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state" style="padding:40px">
        <div style="font-size:48px;opacity:0.15;margin-bottom:12px;">👥</div>
        <div class="empty-state-title">${search ? (lang === 'ar' ? 'لا توجد نتائج' : 'No results') : (lang === 'ar' ? 'لا يوجد عملاء بعد' : 'No customers yet')}</div>
      </div>`;
    return;
  }

  listEl.innerHTML = `
    <table class="data-table">
      <thead>
        <tr>
          <th>${lang === 'ar' ? 'الاسم' : 'Name'}</th>
          <th>${lang === 'ar' ? 'الهاتف' : 'Phone'}</th>
          <th>${lang === 'ar' ? 'البريد' : 'Email'}</th>
          <th>${lang === 'ar' ? 'الرقم الضريبي' : 'VAT #'}</th>
          <th>${lang === 'ar' ? 'الرصيد' : 'Balance'}</th>
          <th>${lang === 'ar' ? 'نقاط الولاء' : 'Loyalty'}</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        ${customers.map(c => `
          <tr>
            <td class="td-name">${_esc(lang === 'ar' ? c.name_ar : (c.name_en || c.name_ar))}</td>
            <td>${_esc(c.phone || '-')}</td>
            <td>${_esc(c.email || '-')}</td>
            <td style="font-family:var(--font-mono);font-size:12px;">${_esc(c.vat_number || '-')}</td>
            <td>${formatCurrency(c.credit_balance || 0)}</td>
            <td>${Number(c.loyalty_points || 0).toFixed(0)} ⭐</td>
            <td>
              <div style="display:flex;gap:4px;justify-content:flex-end;">
                <button class="btn-icon" data-action="statement-cust" data-id="${c.id}" title="${lang === 'ar' ? 'كشف حساب' : 'Statement'}">📊</button>
                ${window.hasPermission('customers_edit') ? `<button class="btn-icon" data-action="edit-cust" data-id="${c.id}" title="${lang === 'ar' ? 'تعديل' : 'Edit'}">✏️</button>` : ''}
                <button class="btn-icon" data-action="history-cust" data-id="${c.id}" title="${lang === 'ar' ? 'سجل المشتريات' : 'Purchase history'}">📋</button>
                ${window.hasPermission('customers_edit') ? `<button class="btn-icon btn-icon-danger" data-action="delete-cust" data-id="${c.id}" title="${lang === 'ar' ? 'حذف' : 'Delete'}">🗑</button>` : ''}
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    ${totalPages > 1 ? `
      <div style="display:flex;justify-content:center;align-items:center;gap:8px;margin-top:12px;">
        ${page > 1 ? `<button class="btn btn-secondary btn-sm" id="cust-prev">← ${lang === 'ar' ? 'السابق' : 'Prev'}</button>` : ''}
        <span style="color:var(--text-secondary);font-size:13px;">${page} / ${totalPages} (${total})</span>
        ${page < totalPages ? `<button class="btn btn-secondary btn-sm" id="cust-next">${lang === 'ar' ? 'التالي' : 'Next'} →</button>` : ''}
      </div>
    ` : ''}
  `;

  // Pagination
  const cprev = listEl.querySelector('#cust-prev');
  const cnext = listEl.querySelector('#cust-next');
  if (cprev) cprev.addEventListener('click', () => { window._custPage = page - 1; loadCustomersList(container, search); });
  if (cnext) cnext.addEventListener('click', () => { window._custPage = page + 1; loadCustomersList(container, search); });

  listEl.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id);
      const action = btn.dataset.action;
      if (action === 'edit-cust') {
        const r = await window.daftrly.query('SELECT * FROM customers WHERE id = ?', [id]);
        if (r.success && r.data?.[0]) openCustomerModal(container, r.data[0]);
      } else if (action === 'delete-cust') {
        const ok = await window.daftrlyConfirm(lang === 'ar' ? 'حذف هذا العميل؟' : 'Delete this customer?');
        if (ok) {
          await window.daftrly.query('UPDATE customers SET is_active = 0 WHERE id = ?', [id]);
          window.dbg('save', `Customer ${id} deleted`);
          showToast(lang === 'ar' ? 'تم حذف العميل' : 'Customer deleted', 'success');
          loadCustomersList(container, container.querySelector('#cust-search')?.value || '');
        }
      } else if (action === 'history-cust') {
        openCustomerHistory(container, id);
      } else if (action === 'statement-cust') {
        openCustomerStatement(container, id);
      }
    });
  });
}

async function openCustomerModal(container, customer) {
  const lang = window.i18n.getLang();
  const isEdit = !!customer;
  const c = customer || {};
  const overlay = container.querySelector('#modal-overlay');
  const modal = container.querySelector('#modal-content');

  // Load price lists dynamically
  const plRes = await window.daftrly.query('SELECT * FROM price_lists ORDER BY id');
  const priceLists = (plRes.success && plRes.data) ? plRes.data : [{ id: 1, name_ar: 'تجزئة', name_en: 'Retail' }];

  modal.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">${isEdit ? (lang === 'ar' ? 'تعديل العميل' : 'Edit Customer') : (lang === 'ar' ? 'عميل جديد' : 'New Customer')}</h3>
      <button class="modal-close" id="modal-close">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'الاسم (عربي) *' : 'Name (Arabic) *'}</label>
          <input type="text" id="c-name-ar" class="form-input" value="${_attr(c.name_ar || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'الاسم (إنجليزي)' : 'Name (English)'}</label>
          <input type="text" id="c-name-en" class="form-input" value="${_attr(c.name_en || '')}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'الهاتف' : 'Phone'}</label>
          <input type="tel" id="c-phone" class="form-input" value="${_attr(c.phone || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'البريد الإلكتروني' : 'Email'}</label>
          <input type="email" id="c-email" class="form-input" value="${_attr(c.email || '')}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'الرقم الضريبي' : 'VAT Number'}</label>
          <input type="text" id="c-vat" class="form-input" value="${_attr(c.vat_number || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'العنوان' : 'Address'}</label>
          <input type="text" id="c-address" class="form-input" value="${_attr(c.address || '')}">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">${lang === 'ar' ? 'ملاحظات' : 'Notes'}</label>
        <textarea id="c-notes" class="form-input form-textarea" rows="2">${_esc(c.notes || '')}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">${lang === 'ar' ? 'مجموعة الأسعار' : 'Price Group'}</label>
        <select id="c-price-list" class="form-input form-select">
          ${priceLists.map(pl => `<option value="${pl.id}" ${(c.price_list_id || 1) == pl.id ? 'selected' : ''}>${lang === 'ar' ? (pl.name_ar || pl.name_en) : (pl.name_en || pl.name_ar)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">${lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
      <button class="btn btn-primary" id="modal-save">${isEdit ? (lang === 'ar' ? 'حفظ' : 'Save') : (lang === 'ar' ? 'إضافة' : 'Add')}</button>
    </div>
  `;

  overlay.style.display = 'flex';
  const close = () => { overlay.style.display = 'none'; };
  modal.querySelector('#modal-close').addEventListener('click', close);
  modal.querySelector('#modal-cancel').addEventListener('click', close);

  modal.querySelector('#modal-save').addEventListener('click', async () => {
    const nameAr = modal.querySelector('#c-name-ar').value.trim();
    if (!nameAr) { showToast(lang === 'ar' ? 'الاسم مطلوب' : 'Name is required', 'error'); return; }

    const data = [nameAr, modal.querySelector('#c-name-en').value.trim() || null,
      modal.querySelector('#c-phone').value.trim() || null, modal.querySelector('#c-email').value.trim() || null,
      modal.querySelector('#c-vat').value.trim() || null, modal.querySelector('#c-address').value.trim() || null,
      modal.querySelector('#c-notes').value.trim() || null];
    const priceListId = parseInt(modal.querySelector('#c-price-list')?.value) || 1;

    window.dbg('save', `Customer ${isEdit ? 'update' : 'create'}: ${nameAr}`);

    let result;
    if (isEdit) {
      result = await window.daftrly.query(
        'UPDATE customers SET name_ar=?, name_en=?, phone=?, email=?, vat_number=?, address=?, notes=?, price_list_id=?, updated_at=datetime(\'now\') WHERE id=?',
        [...data, priceListId, c.id]);
    } else {
      result = await window.daftrly.query(
        'INSERT INTO customers (name_ar, name_en, phone, email, vat_number, address, notes, price_list_id) VALUES (?,?,?,?,?,?,?,?)', [...data, priceListId]);
    }

    if (result.success) {
      window.dbg('success', `Customer ${isEdit ? 'updated' : 'created'}`);
      showToast(lang === 'ar' ? (isEdit ? 'تم تحديث العميل' : 'تمت إضافة العميل') : (isEdit ? 'Customer updated' : 'Customer added'), 'success');
      close();
      loadCustomersList(container, '');
    } else {
      window.dbg('error', 'Customer save failed', result.error);
    }
  });
}

async function openCustomerHistory(container, customerId) {
  const lang = window.i18n.getLang();
  const overlay = container.querySelector('#modal-overlay');
  const modal = container.querySelector('#modal-content');

  const custResult = await window.daftrly.query('SELECT * FROM customers WHERE id = ?', [customerId]);
  const cust = custResult.success && custResult.data?.[0] ? custResult.data[0] : { name_ar: '?' };

  const salesResult = await window.daftrly.query(
    'SELECT * FROM sales WHERE customer_id = ? AND status = \'completed\' ORDER BY created_at DESC LIMIT 50', [customerId]);
  const sales = (salesResult.success && salesResult.data) ? salesResult.data : [];

  const totalSpent = sales.reduce((s, sale) => s + (sale.total || 0), 0);

  modal.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">${lang === 'ar' ? 'سجل مشتريات' : 'Purchase History'}: ${_esc(cust.name_ar)}</h3>
      <button class="modal-close" id="modal-close">✕</button>
    </div>
    <div class="modal-body">
      <div style="display:flex;gap:16px;margin-bottom:16px;">
        <div class="import-stat import-stat-ok">
          <div class="import-stat-num">${sales.length}</div>
          <div class="import-stat-label">${lang === 'ar' ? 'عمليات شراء' : 'Purchases'}</div>
        </div>
        <div class="import-stat" style="background:var(--accent-subtle);border:1px solid var(--accent);">
          <div class="import-stat-num" style="font-size:20px;">${formatCurrency(totalSpent)}</div>
          <div class="import-stat-label">${lang === 'ar' ? 'إجمالي المشتريات' : 'Total spent'}</div>
        </div>
      </div>
      ${sales.length === 0 ? `<div class="empty-state"><div class="empty-state-desc">${lang === 'ar' ? 'لا توجد مشتريات بعد' : 'No purchases yet'}</div></div>` : `
      <div class="import-preview-table-wrap">
        <table class="import-preview-table">
          <thead><tr>
            <th>${lang === 'ar' ? 'الفاتورة' : 'Invoice'}</th>
            <th>${lang === 'ar' ? 'التاريخ' : 'Date'}</th>
            <th>${lang === 'ar' ? 'الإجمالي' : 'Total'}</th>
            <th>${lang === 'ar' ? 'الدفع' : 'Payment'}</th>
          </tr></thead>
          <tbody>
            ${sales.map(s => `<tr>
              <td style="font-family:var(--font-mono);font-size:12px;">${_esc(s.invoice_number)}</td>
              <td>${s.created_at ? s.created_at.substring(0, 16).replace('T', ' ') : '-'}</td>
              <td>${formatCurrency(s.total)}</td>
              <td>${s.payment_status}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`}
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-done">${lang === 'ar' ? 'تم' : 'Done'}</button>
    </div>
  `;

  overlay.style.display = 'flex';
  modal.querySelector('#modal-close').addEventListener('click', () => { overlay.style.display = 'none'; });
  modal.querySelector('#modal-done').addEventListener('click', () => { overlay.style.display = 'none'; });
}

// Escape helpers
// ============ CUSTOMER ACCOUNT STATEMENT ============
async function openCustomerStatement(container, customerId) {
  const lang = window.i18n.getLang();
  
  const custRes = await window.daftrly.query('SELECT * FROM customers WHERE id = ?', [customerId]);
  if (!custRes.success || !custRes.data?.[0]) return;
  const customer = custRes.data[0];

  // Get all sales for this customer
  const salesRes = await window.daftrly.query(
    'SELECT id, invoice_number, total, paid_amount, balance_due, payment_status, created_at FROM sales WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50',
    [customerId]);
  const sales = salesRes.success ? (salesRes.data || []) : [];

  // Get all payments
  const paymentsRes = await window.daftrly.query(
    'SELECT p.*, s.invoice_number FROM payments p INNER JOIN sales s ON s.id = p.sale_id WHERE s.customer_id = ? ORDER BY p.created_at DESC LIMIT 50',
    [customerId]);
  const payments = paymentsRes.success ? (paymentsRes.data || []) : [];

  const totalSales = sales.reduce((s, sale) => s + Number(sale.total), 0);
  const totalPaid = sales.reduce((s, sale) => s + Number(sale.paid_amount), 0);
  const totalDue = sales.reduce((s, sale) => s + Number(sale.balance_due || 0), 0);

  const overlay = container.querySelector('#modal-overlay');
  const modal = container.querySelector('#modal-content');

  modal.innerHTML = `
    <div class="modal-header">
      <h3>📊 ${lang === 'ar' ? 'كشف حساب —' : 'Account Statement —'} ${_esc(customer.name_ar)}</h3>
      <button class="modal-close" id="modal-close">✕</button>
    </div>
    <div class="modal-body" style="max-height:500px;overflow:auto;">
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;">
        <div style="background:var(--bg-secondary);padding:12px;border-radius:8px;text-align:center;">
          <div style="font-size:18px;font-weight:700;">${totalSales.toFixed(2)}</div>
          <div style="font-size:11px;color:var(--text-secondary);">${lang === 'ar' ? 'إجمالي المبيعات' : 'Total Sales'}</div>
        </div>
        <div style="background:var(--bg-secondary);padding:12px;border-radius:8px;text-align:center;">
          <div style="font-size:18px;font-weight:700;color:var(--success);">${totalPaid.toFixed(2)}</div>
          <div style="font-size:11px;color:var(--text-secondary);">${lang === 'ar' ? 'المدفوع' : 'Paid'}</div>
        </div>
        <div style="background:var(--bg-secondary);padding:12px;border-radius:8px;text-align:center;">
          <div style="font-size:18px;font-weight:700;color:${totalDue > 0 ? 'var(--danger)' : 'var(--success)'};">${totalDue.toFixed(2)}</div>
          <div style="font-size:11px;color:var(--text-secondary);">${lang === 'ar' ? 'المتبقي' : 'Due'}</div>
        </div>
        <div style="background:var(--bg-secondary);padding:12px;border-radius:8px;text-align:center;">
          <div style="font-size:18px;font-weight:700;">${Number(customer.loyalty_points || 0).toFixed(0)} ⭐</div>
          <div style="font-size:11px;color:var(--text-secondary);">${lang === 'ar' ? 'نقاط الولاء' : 'Loyalty Points'}</div>
        </div>
      </div>

      <h4 style="margin-bottom:8px;">${lang === 'ar' ? 'المعاملات' : 'Transactions'}</h4>
      <table style="width:100%;border-collapse:collapse;font-size:12px;">
        <thead><tr style="border-bottom:2px solid var(--border);">
          <th style="padding:6px;">${lang === 'ar' ? 'التاريخ' : 'Date'}</th>
          <th style="padding:6px;">${lang === 'ar' ? 'الفاتورة' : 'Invoice'}</th>
          <th style="padding:6px;">${lang === 'ar' ? 'الإجمالي' : 'Total'}</th>
          <th style="padding:6px;">${lang === 'ar' ? 'المدفوع' : 'Paid'}</th>
          <th style="padding:6px;">${lang === 'ar' ? 'المتبقي' : 'Due'}</th>
          <th style="padding:6px;">${lang === 'ar' ? 'الحالة' : 'Status'}</th>
        </tr></thead>
        <tbody>
          ${sales.map(s => {
            const statusColor = s.payment_status === 'paid' ? 'var(--success)' : 'var(--warning)';
            const statusText = s.payment_status === 'paid' ? (lang === 'ar' ? 'مدفوع' : 'Paid') : (lang === 'ar' ? 'جزئي' : 'Partial');
            return `<tr style="border-bottom:1px solid var(--border);">
              <td style="padding:6px;">${s.created_at?.split('T')[0] || '—'}</td>
              <td style="padding:6px;font-weight:600;">${_esc(s.invoice_number)}</td>
              <td style="padding:6px;">${Number(s.total).toFixed(2)}</td>
              <td style="padding:6px;">${Number(s.paid_amount).toFixed(2)}</td>
              <td style="padding:6px;color:${Number(s.balance_due) > 0 ? 'var(--danger)' : ''};">${Number(s.balance_due || 0).toFixed(2)}</td>
              <td style="padding:6px;"><span style="color:${statusColor};font-size:11px;">${statusText}</span></td>
            </tr>`;
          }).join('') || `<tr><td colspan="6" style="padding:20px;text-align:center;color:var(--text-secondary);">${lang === 'ar' ? 'لا توجد معاملات' : 'No transactions'}</td></tr>`}
        </tbody>
      </table>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-cancel">${lang === 'ar' ? 'إغلاق' : 'Close'}</button>
    </div>
  `;

  overlay.style.display = 'flex';
  modal.querySelector('#modal-close').addEventListener('click', () => overlay.style.display = 'none');
  modal.querySelector('#modal-cancel').addEventListener('click', () => overlay.style.display = 'none');
}

function _esc(s) { return window.escHtml(s); }
function _attr(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;') : ''; }

window.renderCustomers = renderCustomers;
