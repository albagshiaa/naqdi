// ============================================
// NAQDI - MODULE 5B: SALES HISTORY & INVOICES
// View sales, invoice detail, QR, receipt
// ============================================

let salesFilter = { search: '', dateFrom: '', dateTo: '' };

// Default Naqdi logo (SVG as data URI — used when merchant hasn't uploaded custom logo)
const NAQDI_DEFAULT_LOGO = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTYwIiBoZWlnaHQ9IjE2MCIgdmlld0JveD0iMCAwIDg4IDg4IiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHg9IjIiIHk9IjIiIHdpZHRoPSI4NCIgaGVpZ2h0PSI4NCIgcng9IjIwIiBmaWxsPSJub25lIiBzdHJva2U9IiMyNTYzRUIiIHN0cm9rZS13aWR0aD0iNCIvPjxwYXRoIGQ9Ik0zMiAzMCBDMzIgMzAgMTggMzAgMTggNDggQzE4IDY2IDM4IDY2IDU0IDY2IiBmaWxsPSJub25lIiBzdHJva2U9IiMyNTYzRUIiIHN0cm9rZS13aWR0aD0iNS41IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz48cGF0aCBkPSJNNTQgNjYgQzY4IDY2IDcwIDQ4IDcwIDQwIEM3MCAyOCA2MiAyOCA1NiAyOCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjRDRBODUzIiBzdHJva2Utd2lkdGg9IjUuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PGNpcmNsZSBjeD0iNTgiIGN5PSIxNiIgcj0iNiIgZmlsbD0iI0Q0QTg1MyIvPjwvc3ZnPg==';

// ============ SALES HISTORY PAGE ============
async function renderReports(container) {
  const lang = window.i18n.getLang();
  window.dbg('nav', 'Rendering Sales/Reports page');

  const today = new Date().toISOString().split('T')[0];

  container.innerHTML = `
    <div class="sales-page slide-in">
      <div class="products-toolbar">
        <div class="products-search-wrap">
          <div class="products-search-icon">${window.icons.getIcon('search')}</div>
          <input type="text" id="sales-search" class="products-search" 
            placeholder="${lang === 'ar' ? 'ابحث برقم الفاتورة...' : 'Search by invoice number...'}">
        </div>
        <div class="products-actions" style="gap:6px;">
          <input type="date" id="sales-date-from" class="form-input btn-sm" value="${today}" style="width:140px;">
          <input type="date" id="sales-date-to" class="form-input btn-sm" value="${today}" style="width:140px;">
          <button class="btn btn-secondary btn-sm" id="sales-filter-btn">
            ${window.icons.getIcon('search')} ${lang === 'ar' ? 'بحث' : 'Filter'}
          </button>
        </div>
      </div>

      <!-- Summary Cards -->
      <div class="sales-summary" id="sales-summary"></div>

      <!-- Sales Table -->
      <div class="sales-table-wrap" id="sales-table-wrap"></div>
    </div>

    <div class="modal-overlay" id="modal-overlay" style="display:none">
      <div class="modal" id="modal-content" style="max-width:800px;"></div>
    </div>
  `;

  // Bind events
  const searchInput = container.querySelector('#sales-search');
  const dateFrom = container.querySelector('#sales-date-from');
  const dateTo = container.querySelector('#sales-date-to');

  container.querySelector('#sales-filter-btn').addEventListener('click', () => {
    salesFilter.search = searchInput.value.trim();
    salesFilter.dateFrom = dateFrom.value;
    salesFilter.dateTo = dateTo.value;
    window._salesPage = 1;
    loadSales(container);
  });

  let searchTimer;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      salesFilter.search = e.target.value.trim();
      loadSales(container);
    }, 300);
  });

  salesFilter.dateFrom = today;
  salesFilter.dateTo = today;
  await loadSales(container);
}

async function loadSales(container) {
  const lang = window.i18n.getLang();
  const perPage = 30;
  const page = window._salesPage || 1;
  const offset = (page - 1) * perPage;

  let sql = `SELECT s.*, c.name_ar as cust_name_ar, c.name_en as cust_name_en
    FROM sales s LEFT JOIN customers c ON s.customer_id = c.id 
    WHERE s.status = 'completed'`;
  let countSql = "SELECT COUNT(*) as total FROM sales WHERE status = 'completed'";
  const params = [];
  const countParams = [];

  if (salesFilter.search) {
    sql += ' AND s.invoice_number LIKE ?';
    countSql += ' AND invoice_number LIKE ?';
    params.push(`%${salesFilter.search}%`);
    countParams.push(`%${salesFilter.search}%`);
  }
  if (salesFilter.dateFrom) {
    sql += ' AND date(s.created_at) >= ?';
    countSql += ' AND date(created_at) >= ?';
    params.push(salesFilter.dateFrom);
    countParams.push(salesFilter.dateFrom);
  }
  if (salesFilter.dateTo) {
    sql += ' AND date(s.created_at) <= ?';
    countSql += ' AND date(created_at) <= ?';
    params.push(salesFilter.dateTo);
    countParams.push(salesFilter.dateTo);
  }
  sql += ' ORDER BY s.created_at DESC LIMIT ? OFFSET ?';
  params.push(perPage, offset);

  const countRes = await window.daftrly.query(countSql, countParams);
  const total = countRes.success && countRes.data?.[0] ? countRes.data[0].total : 0;
  const totalPages = Math.ceil(total / perPage);

  const result = await window.daftrly.query(sql, params);
  const sales = (result.success && result.data) ? result.data : [];
  window.dbg('load', `Sales loaded: ${sales.length} of ${total} (page ${page})`);

  // Summary
  const totalSales = sales.reduce((s, sale) => s + (sale.total || 0), 0);
  const totalTax = sales.reduce((s, sale) => s + (sale.tax_amount || 0), 0);
  const totalDiscount = sales.reduce((s, sale) => s + (sale.discount_amount || 0), 0);

  const summaryEl = container.querySelector('#sales-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="stat-card"><div class="stat-card-label">${lang === 'ar' ? 'عدد الفواتير' : 'Invoices'}</div><div class="stat-card-value">${total}</div></div>
      <div class="stat-card"><div class="stat-card-label">${lang === 'ar' ? 'إجمالي المبيعات' : 'Total Sales'}</div><div class="stat-card-value">${formatCurrency(totalSales)}</div></div>
      <div class="stat-card"><div class="stat-card-label">${lang === 'ar' ? 'الضريبة' : 'Tax'}</div><div class="stat-card-value">${formatCurrency(totalTax)}</div></div>
      <div class="stat-card"><div class="stat-card-label">${lang === 'ar' ? 'الخصومات' : 'Discounts'}</div><div class="stat-card-value">${formatCurrency(totalDiscount)}</div></div>
    `;
  }

  // Table
  const tableEl = container.querySelector('#sales-table-wrap');
  if (!tableEl) return;

  if (sales.length === 0) {
    tableEl.innerHTML = `<div class="empty-state" style="padding:40px"><div style="font-size:48px;opacity:0.15;margin-bottom:12px;">📋</div><div class="empty-state-title">${lang === 'ar' ? 'لا توجد مبيعات' : 'No sales found'}</div></div>`;
    return;
  }

  // Group sales by date
  let lastDate = '';
  const salesRows = sales.map(s => {
    const custName = s.cust_name_ar ? (lang === 'ar' ? s.cust_name_ar : (s.cust_name_en || s.cust_name_ar)) : (lang === 'ar' ? 'بدون عميل' : 'Walk-in');
    const dateStr = s.created_at ? s.created_at.substring(0, 16).replace('T', ' ') : '-';
    const dayStr = s.created_at ? s.created_at.substring(0, 10) : '';
    let dateHeader = '';
    if (dayStr !== lastDate) {
      lastDate = dayStr;
      const dayLabel = dayStr === new Date().toISOString().split('T')[0] 
        ? (lang === 'ar' ? '📅 اليوم' : '📅 Today')
        : dayStr;
      dateHeader = `<tr><td colspan="7" style="background:var(--bg-tertiary);font-weight:700;font-size:13px;padding:8px 14px;border-bottom:2px solid var(--accent);">${dayLabel} — ${dayStr}</td></tr>`;
    }
    return `${dateHeader}<tr>
      <td style="font-family:var(--font-mono);font-size:12px;font-weight:600;">${_esc2(s.invoice_number)}</td>
      <td style="font-size:12px;">${dateStr.substring(11)}</td>
      <td>${_esc2(custName)}</td>
      <td style="font-weight:700;">${formatCurrency(s.total)}</td>
      <td style="font-size:12px;">${formatCurrency(s.tax_amount || 0)}</td>
      <td><span class="payment-badge">${s.payment_method === 'card' ? (lang === 'ar' ? 'بطاقة' : 'Card') : s.payment_method === 'split' ? (lang === 'ar' ? 'تقسيم' : 'Split') : (lang === 'ar' ? 'نقدي' : 'Cash')}</span></td>
      <td>
        <button class="btn btn-secondary btn-sm" data-action="view-invoice" data-id="${s.id}">${lang === 'ar' ? 'عرض' : 'View'}</button>
      </td>
    </tr>`;
  }).join('');

  tableEl.innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>${lang === 'ar' ? 'رقم الفاتورة' : 'Invoice #'}</th>
        <th>${lang === 'ar' ? 'الوقت' : 'Time'}</th>
        <th>${lang === 'ar' ? 'العميل' : 'Customer'}</th>
        <th>${lang === 'ar' ? 'الإجمالي' : 'Total'}</th>
        <th>${lang === 'ar' ? 'الضريبة' : 'Tax'}</th>
        <th>${lang === 'ar' ? 'الدفع' : 'Payment'}</th>
        <th></th>
      </tr></thead>
      <tbody>
        ${salesRows}
      </tbody>
    </table>
    ${totalPages > 1 ? `
      <div style="display:flex;justify-content:center;align-items:center;gap:8px;margin-top:12px;">
        ${page > 1 ? `<button class="btn btn-secondary btn-sm" id="sales-prev">← ${lang === 'ar' ? 'السابق' : 'Prev'}</button>` : ''}
        <span style="color:var(--text-secondary);font-size:13px;">${lang === 'ar' ? 'صفحة' : 'Page'} ${page} / ${totalPages} (${total} ${lang === 'ar' ? 'فاتورة' : 'invoices'})</span>
        ${page < totalPages ? `<button class="btn btn-secondary btn-sm" id="sales-next">${lang === 'ar' ? 'التالي' : 'Next'} →</button>` : ''}
      </div>
    ` : ''}
  `;

  // Pagination
  const sprev = tableEl.querySelector('#sales-prev');
  const snext = tableEl.querySelector('#sales-next');
  if (sprev) sprev.addEventListener('click', () => { window._salesPage = page - 1; loadSales(container); });
  if (snext) snext.addEventListener('click', () => { window._salesPage = page + 1; loadSales(container); });

  tableEl.querySelectorAll('[data-action="view-invoice"]').forEach(btn => {
    btn.addEventListener('click', () => openInvoiceDetail(container, parseInt(btn.dataset.id)));
  });
}

// ============ INVOICE DETAIL ============
async function openInvoiceDetail(container, saleId) {
  const lang = window.i18n.getLang();
  // Find modal overlay — might be in container, parent, or reports page
  let overlay = container.querySelector('#modal-overlay')
    || container.closest('.reports-page')?.parentElement?.querySelector('#modal-overlay')
    || document.querySelector('#modal-overlay');
  let modal = container.querySelector('#modal-content')
    || container.closest('.reports-page')?.parentElement?.querySelector('#modal-content')
    || document.querySelector('#modal-content');

  // If no modal exists (e.g. called from universal search while not on Reports tab),
  // create a standalone floating overlay and clean it up on close.
  let tempWrapper = null;
  if (!overlay || !modal) {
    tempWrapper = document.createElement('div');
    tempWrapper.innerHTML = `
      <div class="modal-overlay" style="display:flex;position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.6);align-items:center;justify-content:center;">
        <div class="modal" style="max-width:800px;width:95%;max-height:90vh;overflow-y:auto;"></div>
      </div>`;
    document.body.appendChild(tempWrapper);
    overlay = tempWrapper.querySelector('.modal-overlay');
    modal = tempWrapper.querySelector('.modal');
  }
  window.dbg('ui', `Viewing invoice detail: sale ${saleId}`);

  // Fetch sale + items + payment
  const saleResult = await window.daftrly.query(
    `SELECT s.*, c.name_ar as cust_name_ar, c.name_en as cust_name_en, c.phone as cust_phone, c.vat_number as cust_vat
     FROM sales s LEFT JOIN customers c ON s.customer_id = c.id WHERE s.id = ?`, [saleId]);
  if (!saleResult.success || !saleResult.data?.[0]) { showToast(lang === 'ar' ? 'فاتورة غير موجودة' : 'Invoice not found', 'error'); return; }
  const sale = saleResult.data[0];

  const itemsResult = await window.daftrly.query('SELECT * FROM sale_items WHERE sale_id = ?', [saleId]);
  const items = (itemsResult.success && itemsResult.data) ? itemsResult.data : [];

  const payResult = await window.daftrly.query('SELECT * FROM payments WHERE sale_id = ?', [saleId]);
  const payments = (payResult.success && payResult.data) ? payResult.data : [];

  const settings = await window.daftrly.getSettings();
  const biz = settings.business || {};
  const vatRate = settings.vat?.rate || 15;

  // Generate ZATCA Phase 1 QR code
  const qrData = generateZATCAQR(biz, sale, vatRate);

  const dateStr = sale.created_at ? sale.created_at.substring(0, 19).replace('T', ' ') : '-';
  const custName = sale.cust_name_ar || (lang === 'ar' ? 'عميل عام' : 'Walk-in Customer');

  modal.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">${lang === 'ar' ? 'فاتورة' : 'Invoice'} ${_esc2(sale.invoice_number)}</h3>
      <div style="display:flex;gap:6px;align-items:center;">
        <button class="btn btn-secondary btn-sm" id="inv-receipt">${lang === 'ar' ? '🖨 إيصال' : '🖨 Receipt'}</button>
        <button class="modal-close" id="modal-close">✕</button>
      </div>
    </div>
    <div class="modal-body" style="padding:0;">
      <div class="invoice-detail">
        <!-- Business Header -->
        <div class="inv-header">
          <div>
            <div class="inv-biz-name">${_esc2(biz.nameAr || 'نقدي')}</div>
            ${biz.nameEn ? `<div class="inv-biz-name-en">${_esc2(biz.nameEn)}</div>` : ''}
            ${biz.vatNumber ? `<div class="inv-biz-vat">${lang === 'ar' ? 'الرقم الضريبي:' : 'VAT #:'} ${_esc2(biz.vatNumber)}</div>` : ''}
            ${biz.address ? `<div class="inv-biz-detail">${_esc2(biz.address)}</div>` : ''}
          </div>
          <div style="text-align:end;">
            <div class="inv-number">${_esc2(sale.invoice_number)}</div>
            <div class="inv-date">${dateStr}</div>
          </div>
        </div>

        <!-- Customer -->
        <div class="inv-customer-row">
          <span>${lang === 'ar' ? 'العميل:' : 'Customer:'} <strong>${_esc2(custName)}</strong></span>
          ${sale.cust_vat ? `<span>${lang === 'ar' ? 'الرقم الضريبي:' : 'VAT:'} ${_esc2(sale.cust_vat)}</span>` : ''}
        </div>

        <!-- Items Table -->
        <table class="inv-items-table">
          <thead><tr>
            <th>#</th>
            <th>${lang === 'ar' ? 'الصنف' : 'Item'}</th>
            <th>${lang === 'ar' ? 'الكمية' : 'Qty'}</th>
            <th>${lang === 'ar' ? 'السعر' : 'Price'}</th>
            <th>${lang === 'ar' ? 'الخصم' : 'Disc.'}</th>
            <th>${lang === 'ar' ? 'الضريبة' : 'Tax'}</th>
            <th>${lang === 'ar' ? 'الإجمالي' : 'Total'}</th>
          </tr></thead>
          <tbody>
            ${items.map((item, idx) => `<tr>
              <td>${idx + 1}</td>
              <td>${_esc2(lang === 'ar' ? item.name_ar : (item.name_en || item.name_ar))}</td>
              <td>${item.quantity}</td>
              <td>${formatCurrency(item.unit_price)}</td>
              <td>${item.discount_amount > 0 ? formatCurrency(item.discount_amount) : '-'}</td>
              <td>${formatCurrency(item.tax_amount || 0)}</td>
              <td style="font-weight:600;">${formatCurrency(item.total)}</td>
            </tr>`).join('')}
          </tbody>
        </table>

        <!-- Totals -->
        <div class="inv-totals">
          <div class="inv-total-row"><span>${lang === 'ar' ? 'المجموع الفرعي' : 'Subtotal'}</span><span>${formatCurrency(sale.subtotal)}</span></div>
          ${sale.discount_amount > 0 ? `<div class="inv-total-row" style="color:var(--success)"><span>${lang === 'ar' ? 'الخصم' : 'Discount'}</span><span>-${formatCurrency(sale.discount_amount)}</span></div>` : ''}
          <div class="inv-total-row"><span>${lang === 'ar' ? 'الضريبة' : 'VAT'} (${vatRate}%)</span><span>${formatCurrency(sale.tax_amount || 0)}</span></div>
          <div class="inv-total-row inv-total-grand"><span>${lang === 'ar' ? 'الإجمالي' : 'Total'}</span><span>${formatCurrency(sale.total)}</span></div>
        </div>

        <!-- Payment Info -->
        <div class="inv-payment-row">
          ${payments.map(p => `<span>💰 ${p.method === 'cash' ? (lang === 'ar' ? 'نقدي' : 'Cash') : (lang === 'ar' ? 'بطاقة' : 'Card')}: ${formatCurrency(p.amount)}</span>`).join(' ')}
          ${sale.change_amount > 0 ? `<span>| ${lang === 'ar' ? 'الباقي:' : 'Change:'} ${formatCurrency(sale.change_amount)}</span>` : ''}
        </div>

        <!-- ZATCA QR Code -->
        <div class="inv-qr-section">
          <div class="inv-qr-label">${lang === 'ar' ? 'رمز QR - فاتورة إلكترونية (ZATCA المرحلة 1)' : 'QR Code - E-Invoice (ZATCA Phase 1)'}</div>
          <img id="inv-qr-img" width="200" height="200" style="display:block;margin:0 auto;" alt="QR Code">
        </div>

        ${sale.notes ? `<div class="inv-notes">${lang === 'ar' ? 'ملاحظات:' : 'Notes:'} ${_esc2(sale.notes)}</div>` : ''}
        ${biz.footerText ? `<div class="inv-footer-text">${_esc2(biz.footerText)}</div>` : ''}
      </div>
    </div>
    <div class="modal-footer" style="display:flex;justify-content:space-between;">
      <div style="display:flex;gap:6px;">
        ${window.hasPermission('settings_access') ? `<button class="btn btn-secondary btn-sm" id="inv-edit">✏️ ${lang === 'ar' ? 'تعديل' : 'Edit'}</button>` : ''}
        ${window.hasPermission('settings_access') ? `<button class="btn btn-secondary btn-sm" id="inv-delete" style="color:var(--danger);">🗑 ${lang === 'ar' ? 'حذف' : 'Delete'}</button>` : ''}
        ${window.hasPermission('pos_credit_notes') || window.hasPermission('settings_access') ? `<button class="btn btn-secondary btn-sm" id="inv-credit-note" style="color:var(--success);">📄 ${lang === 'ar' ? 'إشعار دائن' : 'Credit Note'}</button>` : ''}
        ${window.hasPermission('pos_credit_notes') || window.hasPermission('settings_access') ? `<button class="btn btn-secondary btn-sm" id="inv-debit-note" style="color:var(--warning);">📄 ${lang === 'ar' ? 'إشعار مدين' : 'Debit Note'}</button>` : ''}
      </div>
      <button class="btn btn-secondary" id="inv-close">${lang === 'ar' ? 'إغلاق' : 'Close'}</button>
    </div>
  `;

  overlay.style.display = 'flex';
  const closeModal = () => { overlay.style.display = 'none'; if (tempWrapper) tempWrapper.remove(); };
  modal.querySelector('#modal-close').addEventListener('click', closeModal);
  modal.querySelector('#inv-close').addEventListener('click', closeModal);

  // Edit invoice (admin only)
  const editBtn = modal.querySelector('#inv-edit');
  if (editBtn) {
    editBtn.addEventListener('click', async () => {
      const custRes = await window.daftrly.query('SELECT id, name_ar, name_en FROM customers WHERE is_active=1 ORDER BY name_ar');
      const allCusts = custRes.success ? (custRes.data || []) : [];

      modal.querySelector('.modal-body').innerHTML = `
        <div style="padding:20px;">
          <h3 style="margin-bottom:16px;">${lang === 'ar' ? '✏️ تعديل الفاتورة' : '✏️ Edit Invoice'} ${sale.invoice_number}</h3>
          <div style="background:rgba(239,68,68,0.1);border:1px solid var(--danger);border-radius:8px;padding:10px;margin-bottom:16px;font-size:12px;color:var(--danger);">
            ⚠️ ${lang === 'ar' ? 'التعديل لا يمكن التراجع عنه. سيُسجل في سجل النشاط.' : 'Edits cannot be undone. Will be logged in activity log.'}
          </div>
          <div class="form-group">
            <label class="form-label">${lang === 'ar' ? 'العميل' : 'Customer'}</label>
            <select id="inv-edit-customer" class="form-input form-select">
              <option value="">${lang === 'ar' ? 'بدون عميل' : 'Walk-in'}</option>
              ${allCusts.map(c => `<option value="${c.id}" ${sale.customer_id == c.id ? 'selected' : ''}>${lang === 'ar' ? c.name_ar : (c.name_en || c.name_ar)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">${lang === 'ar' ? 'طريقة الدفع' : 'Payment Method'}</label>
            <select id="inv-edit-method" class="form-input form-select">
              <option value="cash" ${sale.payment_method === 'cash' ? 'selected' : ''}>${lang === 'ar' ? 'نقدي' : 'Cash'}</option>
              <option value="card" ${sale.payment_method === 'card' ? 'selected' : ''}>${lang === 'ar' ? 'بطاقة' : 'Card'}</option>
              <option value="split" ${sale.payment_method === 'split' ? 'selected' : ''}>${lang === 'ar' ? 'تقسيم' : 'Split'}</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">${lang === 'ar' ? 'ملاحظات' : 'Notes'}</label>
            <input type="text" id="inv-edit-notes" class="form-input" value="${sale.notes || ''}">
          </div>
          <div style="display:flex;gap:8px;margin-top:16px;">
            <button class="btn btn-primary" id="inv-edit-save">${lang === 'ar' ? '💾 حفظ التعديلات' : '💾 Save Changes'}</button>
            <button class="btn btn-secondary" id="inv-edit-cancel">${lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
          </div>
        </div>
      `;

      modal.querySelector('#inv-edit-cancel').addEventListener('click', () => openInvoiceDetail(container, saleId));
      modal.querySelector('#inv-edit-save').addEventListener('click', async () => {
        const newCustomer = modal.querySelector('#inv-edit-customer').value || null;
        const newMethod = modal.querySelector('#inv-edit-method').value;
        const newNotes = modal.querySelector('#inv-edit-notes').value.trim();

        if (!await window.daftrlyConfirm(lang === 'ar' ? '⚠️ حفظ التعديلات؟ لا يمكن التراجع.' : '⚠️ Save changes? Cannot be undone.')) return;

        await window.daftrly.query('UPDATE sales SET customer_id=?, payment_method=?, notes=? WHERE id=?', [newCustomer, newMethod, newNotes, saleId]);
        await window.daftrly.query('UPDATE payments SET method=? WHERE sale_id=?', [newMethod, saleId]);

        const changes = [];
        if (String(sale.customer_id || '') !== String(newCustomer || '')) changes.push('customer');
        if (sale.payment_method !== newMethod) changes.push('method: ' + newMethod);
        if ((sale.notes || '') !== newNotes) changes.push('notes');
        window.logAudit('sale_edit', 'sales', saleId, `${sale.invoice_number} | edited: ${changes.join(', ')}`);

        showToast(lang === 'ar' ? '✅ تم تعديل الفاتورة' : '✅ Invoice updated', 'success');
        openInvoiceDetail(container, saleId);
      });
    });
  }

  // Delete invoice (admin only)
  const delBtn = modal.querySelector('#inv-delete');
  if (delBtn) {
    delBtn.addEventListener('click', async () => {
      const confirmed = await window.daftrlyConfirm(lang === 'ar' 
        ? '⚠️ هل أنت متأكد من حذف هذه الفاتورة نهائياً؟ لا يمكن التراجع عن هذا الإجراء.' 
        : '⚠️ Are you sure you want to permanently delete this invoice? This cannot be undone.');
      if (!confirmed) return;
      
      // Restore stock BEFORE deleting sale_items (quantities needed)
      const delItems = await window.daftrly.query('SELECT si.product_id, si.quantity, si.variant_id, p.track_stock FROM sale_items si LEFT JOIN products p ON si.product_id = p.id WHERE si.sale_id = ?', [saleId]);
      if (delItems.success && delItems.data) {
        for (const item of delItems.data) {
          if (item.track_stock && item.product_id && item.quantity > 0) {
            if (item.variant_id) {
              await window.daftrly.query('UPDATE product_variants SET stock_quantity = stock_quantity + ? WHERE id = ?', [item.quantity, item.variant_id]);
            }
            await window.daftrly.query('UPDATE products SET stock_quantity = stock_quantity + ? WHERE id = ?', [item.quantity, item.product_id]);
          }
        }
      }

      await window.daftrly.query('DELETE FROM sale_items WHERE sale_id = ?', [saleId]);
      await window.daftrly.query('DELETE FROM payments WHERE sale_id = ?', [saleId]);
      await window.daftrly.query('DELETE FROM sales WHERE id = ?', [saleId]);
      window.logAudit('sale_delete', 'sales', saleId, sale.invoice_number + ' (stock restored)');
      
      closeModal();
      showToast(lang === 'ar' ? '✅ تم حذف الفاتورة واسترجاع المخزون' : '✅ Invoice deleted and stock restored', 'success');
      loadSales(container);
    });
  }

  // Credit Note handler
  const creditNoteBtn = modal.querySelector('#inv-credit-note');
  if (creditNoteBtn) {
    creditNoteBtn.addEventListener('click', () => openCreditDebitNoteModal(container, sale, 'credit', closeModal));
  }

  // Debit Note handler
  const debitNoteBtn = modal.querySelector('#inv-debit-note');
  if (debitNoteBtn) {
    debitNoteBtn.addEventListener('click', () => openCreditDebitNoteModal(container, sale, 'debit', closeModal));
  }

  // Render QR code
  renderQRCode(modal.querySelector('#inv-qr-img'), qrData);

  // Receipt button
  modal.querySelector('#inv-receipt').addEventListener('click', () => {
    openReceiptPreview(container, sale, items, payments, biz, settings, qrData);
  });
}

// ============ ZATCA PHASE 1 QR CODE ============
// TLV encoding per ZATCA spec: Tag-Length-Value with Base64
function generateZATCAQR(biz, sale, vatRate) {
  const sellerName = biz.nameAr || 'Merchant';
  const vatNumber = biz.vatNumber || '300000000000003';
  const timestamp = sale.created_at || new Date().toISOString();
  const totalWithVat = String(sale.total || 0);
  const vatAmount = String(sale.tax_amount || 0);

  // TLV encoding
  function tlv(tag, value) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(value);
    // TLV length field is 1 byte, max 255
    const len = Math.min(bytes.length, 255);
    const truncated = bytes.slice(0, len);
    return new Uint8Array([tag, len, ...truncated]);
  }

  const t1 = tlv(1, sellerName);
  const t2 = tlv(2, vatNumber);
  const t3 = tlv(3, timestamp);
  const t4 = tlv(4, totalWithVat);
  const t5 = tlv(5, vatAmount);

  // Combine all TLV
  const combined = new Uint8Array(t1.length + t2.length + t3.length + t4.length + t5.length);
  let offset = 0;
  [t1, t2, t3, t4, t5].forEach(arr => { combined.set(arr, offset); offset += arr.length; });

  // Base64 encode
  let binary = '';
  combined.forEach(b => { binary += String.fromCharCode(b); });
  const base64 = btoa(binary);

  window.dbg('info', 'ZATCA QR generated', { seller: sellerName, total: totalWithVat, vat: vatAmount });
  return base64;
}

// Render QR code using the main process qrcode library (proper, scannable QR)
async function renderQRCode(imgEl, data) {
  if (!imgEl) return;
  try {
    const result = await window.daftrly.generateQR(data);
    if (result.success && result.svg) {
      imgEl.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(result.svg)));
    }
  } catch (e) {
    window.dbg('warn', 'QR render error', e.message);
  }
}

// Format currency with English digits only (for receipt printing)
function formatAmountEn(amount) {
  const num = Number(amount || 0);
  const decimals = window.appSettings?.currency?.decimals ?? 2;
  const symbol = window.appSettings?.currency?.symbol || 'SAR';
  const pos = window.appSettings?.currency?.position || 'after';
  const formatted = num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return pos === 'before' ? `${symbol} ${formatted}` : `${formatted} ${symbol}`;
}

// ============ RECEIPT PREVIEW ============
function openReceiptPreview(container, sale, items, payments, biz, settings, qrData) {
  const lang = window.i18n.getLang();
  let overlay = container.querySelector('#modal-overlay') || container.querySelector('.modal-overlay');
  let modal = container.querySelector('#modal-content') || container.querySelector('.modal');

  // If no modal found (opened from search/standalone), create a floating one
  let tempRcptWrapper = null;
  if (!overlay || !modal) {
    tempRcptWrapper = document.createElement('div');
    tempRcptWrapper.innerHTML = `
      <div class="modal-overlay" style="display:flex;position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.6);align-items:center;justify-content:center;">
        <div class="modal" style="max-width:500px;width:95%;max-height:90vh;overflow-y:auto;"></div>
      </div>`;
    document.body.appendChild(tempRcptWrapper);
    overlay = tempRcptWrapper.querySelector('.modal-overlay');
    modal = tempRcptWrapper.querySelector('.modal');
  }

  const paperWidth = settings.printer?.paperWidth || 80;
  const receiptWidth = paperWidth === 58 ? '220px' : '300px';
  const vatRate = settings.vat?.rate || 15;
  const r = settings.receipt || {};
  const rl = r.receiptLang || 'ar'; // ar, en, both
  const isBoth = rl === 'both';

  const fontSizes = { small: '10px', medium: '12px', large: '14px' };
  const fontSize = fontSizes[r.fontSize] || '12px';
  const qrSizes = { small: 80, medium: 120, large: 160 };
  const qrPx = qrSizes[r.qrSize] || 120;

  const ticketMatch = sale.notes ? sale.notes.match(/TICKET:(\d+)/) : null;
  const ticketNum = ticketMatch ? ticketMatch[1] : null;
  const dateStr = sale.created_at ? sale.created_at.substring(0, 19).replace('T', ' ') : '-';

  // Bilingual helper: shows ar, en, or both lines
  function bl(ar, en, cls) {
    const c = cls ? ` class="${cls}"` : '';
    if (isBoth) return `<div${c}>${_esc2(ar)}</div>${en && en !== ar ? `<div${c} style="font-size:0.9em;color:#555;">${_esc2(en)}</div>` : ''}`;
    if (rl === 'en') return `<div${c}>${_esc2(en || ar)}</div>`;
    return `<div${c}>${_esc2(ar)}</div>`;
  }

  // Label helper
  function lb(ar, en) {
    if (isBoth) return `${ar} / ${en}`;
    return rl === 'en' ? en : ar;
  }

  modal.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">${lang === 'ar' ? 'معاينة الإيصال' : 'Receipt Preview'}</h3>
      <button class="modal-close" id="rcpt-close">✕</button>
    </div>
    <div class="modal-body" style="display:flex;justify-content:center;align-items:flex-start;padding:20px;background:var(--bg-tertiary);overflow-y:auto;">
      <div class="receipt-paper" style="width:${receiptWidth};font-size:${fontSize};" id="receipt-content">

        ${ticketNum && r.ticketEnabled !== false ? `
        <div class="rcpt-center" style="font-size:32px;font-weight:900;margin-bottom:2px;">#${ticketNum}</div>
        <div class="rcpt-center rcpt-sub">${lb('رقم التذكرة', 'Ticket #')}</div>
        ` : ''}

        <div class="rcpt-header">
          ${r.showLogo !== false && biz.logo ? `<div class="rcpt-center" style="margin-bottom:6px;"><img id="rcpt-logo-img" style="max-width:80px;max-height:60px;filter:grayscale(100%) contrast(1.5);" alt=""></div>` : ''}
          ${r.showNameAr !== false ? bl(biz.nameAr || 'نقدي', biz.nameEn || '', 'rcpt-biz-name') : ''}
          ${r.showVat !== false && biz.vatNumber ? `<div class="rcpt-detail">${lb('الرقم الضريبي', 'VAT No')}: ${_esc2(biz.vatNumber)}</div>` : ''}
          ${r.showCR && biz.crNumber ? `<div class="rcpt-detail">${lb('السجل التجاري', 'CR No')}: ${_esc2(biz.crNumber)}</div>` : ''}
          ${r.showAddress && biz.address ? `<div class="rcpt-detail">${_esc2(biz.address)}</div>` : ''}
          ${r.showPhone && biz.phone ? `<div class="rcpt-detail">${_esc2(biz.phone)}</div>` : ''}
        </div>

        <div class="rcpt-line"></div>

        <div class="rcpt-center">
          <div style="font-weight:700;">${_esc2(sale.invoice_number)}</div>
          <div class="rcpt-sub">${dateStr}</div>
        </div>

        <div class="rcpt-line"></div>

        ${r.showItems !== false ? `
        <div class="rcpt-items">
          ${items.map(item => {
            let name;
            if (isBoth && item.name_ar && item.name_en && item.name_ar !== item.name_en) {
              name = `${_esc2(item.name_ar)}<br><span style="color:#555;font-size:0.9em;">${_esc2(item.name_en)}</span>`;
            } else if (rl === 'en') {
              name = _esc2(item.name_en || item.name_ar);
            } else {
              name = _esc2(item.name_ar);
            }
            return `
              <div class="rcpt-item">
                <div class="rcpt-item-name">${name}</div>
                <div class="rcpt-item-line">
                  <span>${Number(item.quantity)} × ${formatAmountEn(item.unit_price)}</span>
                  <span>${formatAmountEn(item.total)}</span>
                </div>
              </div>`;
          }).join('')}
        </div>
        <div class="rcpt-line"></div>` : ''}

        <div class="rcpt-totals">
          <div class="rcpt-total-row"><span>${lb('المجموع', 'Subtotal')}</span><span>${formatAmountEn(sale.subtotal)}</span></div>
          ${sale.discount_amount > 0 && !sale.coupon_discount && !sale.loyalty_points_redeemed && !sale.exchange_credit ? `<div class="rcpt-total-row"><span>${lb('الخصم', 'Discount')}</span><span>-${formatAmountEn(sale.discount_amount)}</span></div>` : ''}
          ${sale.discount_amount > 0 && (sale.coupon_discount > 0 || sale.loyalty_points_redeemed > 0 || sale.exchange_credit > 0) && (sale.discount_amount - (sale.coupon_discount || 0) - (sale.exchange_credit || 0)) > 0.01 ? `<div class="rcpt-total-row"><span>${lb('خصم الفاتورة', 'Invoice Discount')}</span><span>-${formatAmountEn(sale.discount_amount - (sale.coupon_discount || 0) - (sale.exchange_credit || 0))}</span></div>` : ''}
          ${r.showCoupon !== false && sale.coupon_discount > 0 ? `<div class="rcpt-total-row"><span>${lb('كوبون', 'Coupon')}</span><span>-${formatAmountEn(sale.coupon_discount)}</span></div>` : ''}
          ${sale.exchange_credit > 0 ? `<div class="rcpt-total-row"><span>${lb('رصيد استبدال', 'Exchange Credit')}</span><span>-${formatAmountEn(sale.exchange_credit)}</span></div>` : ''}
          ${r.showLoyalty !== false && sale.loyalty_points_redeemed > 0 ? `<div class="rcpt-total-row"><span>${lb('نقاط ولاء', 'Loyalty')}</span><span>-${formatAmountEn(sale.loyalty_points_redeemed * (Number(settings.loyalty?.pointValue) || 0.01))}</span></div>` : ''}
          <div class="rcpt-total-row"><span>${lb('الضريبة', 'VAT')} (${vatRate}%)</span><span>${formatAmountEn(sale.tax_amount || 0)}</span></div>
          <div class="rcpt-total-grand">
            <span>${lb('الإجمالي', 'TOTAL')}</span><span>${formatAmountEn(sale.total)}</span>
          </div>
        </div>

        <div class="rcpt-line-double"></div>

        <div class="rcpt-center rcpt-payment">
          ${payments.map(p => {
            const methodLabel = p.method === 'cash' ? lb('نقدي', 'Cash') : p.method === 'card' ? lb('بطاقة', 'Card') : p.method === 'exchange' ? lb('رصيد استبدال', 'Exchange Credit') : p.method;
            return `<div>${methodLabel}: ${formatAmountEn(p.amount)}</div>`;
          }).join('')}
          ${sale.change_amount > 0 ? `<div>${lb('الباقي', 'Change')}: ${formatAmountEn(sale.change_amount)}</div>` : ''}
          ${sale.balance_due > 0 ? `<div style="color:#c00;font-weight:700;">${lb('المبلغ المتبقي', 'Balance Due')}: ${formatAmountEn(sale.balance_due)}</div>` : ''}
        </div>

        ${r.showPointsEarned !== false && sale.loyalty_points_earned > 0 ? `
        <div class="rcpt-center" style="font-size:10px;color:#555;margin-top:4px;">
          ⭐ ${lb('نقاط مكتسبة', 'Points Earned')}: +${sale.loyalty_points_earned}
        </div>` : ''}

        ${r.showBarcode !== false ? `
        <div class="rcpt-line"></div>
        <div class="rcpt-center" style="padding:6px 0;">
          <canvas id="rcpt-barcode-canvas" width="${paperWidth === 58 ? 200 : 260}" height="40"></canvas>
        </div>` : ''}

        ${r.showQR !== false ? `
        ${r.showBarcode === false ? '<div class="rcpt-line"></div>' : ''}
        <div class="rcpt-center" style="padding:6px 0;">
          <img id="rcpt-qr-img" width="${qrPx}" height="${qrPx}" style="display:block;margin:0 auto;" alt="QR">
          <div class="rcpt-sub" style="margin-top:3px;">${lb('فاتورة إلكترونية', 'E-Invoice')} — ZATCA</div>
        </div>` : ''}

        ${(r.showBarcode !== false || r.showQR !== false) ? '<div class="rcpt-line"></div>' : ''}

        <div class="rcpt-center rcpt-footer">
          ${biz.footerText ? `<div>${_esc2(biz.footerText)}</div>` : ''}
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="rcpt-done">${lang === 'ar' ? 'إغلاق' : 'Close'}</button>
      <button class="btn btn-primary" id="rcpt-print">🖨 ${lang === 'ar' ? 'طباعة' : 'Print'}</button>
    </div>
  `;

  overlay.style.display = 'flex';
  const closeReceipt = () => {
    document.body.classList.remove('printing-receipt');
    if (tempRcptWrapper) { tempRcptWrapper.remove(); } else { overlay.style.display = 'none'; }
  };
  modal.querySelector('#rcpt-close').addEventListener('click', closeReceipt);
  modal.querySelector('#rcpt-done').addEventListener('click', closeReceipt);

  modal.querySelector('#rcpt-print').addEventListener('click', () => {
    document.body.classList.add('printing-receipt');
    window.print();
    document.body.classList.remove('printing-receipt');
  });

  // Set logo via DOM — only if merchant uploaded a custom logo
  if (r.showLogo !== false && biz.logo) {
    const logoImg = modal.querySelector('#rcpt-logo-img');
    if (logoImg) logoImg.src = biz.logo;
  }

  // Render barcode with number below
  if (r.showBarcode !== false) {
    renderBarcode(modal.querySelector('#rcpt-barcode-canvas'), sale.invoice_number);
  }

  // Render QR
  if (r.showQR !== false) {
    renderQRCode(modal.querySelector('#rcpt-qr-img'), qrData);
  }
}

// Simple Code 128 barcode renderer
function renderBarcode(canvas, text) {
  if (!canvas || !text) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);

  const barH = h - 14;
  const barWidth = Math.max(1, Math.floor(w / (text.length * 11 + 35)));

  // Calculate total width of bars first to center them
  let totalWidth = 0;
  // Start pattern
  [2, 1, 1, 2, 3, 2].forEach(b => { totalWidth += barWidth * b + barWidth; });
  // Data pattern
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const bars = [(code >> 6) & 3, (code >> 4) & 3, (code >> 2) & 3, code & 3, ((code >> 1) & 1) + 1];
    bars.forEach(b => { totalWidth += barWidth * (b + 1); });
  }

  // Center offset
  let x = Math.max(4, Math.floor((w - totalWidth) / 2));
  ctx.fillStyle = '#000000';

  // Draw start pattern
  [2, 1, 1, 2, 3, 2].forEach(b => {
    ctx.fillRect(x, 0, barWidth * b, barH);
    x += barWidth * b + barWidth;
  });

  // Draw data pattern
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    const bars = [(code >> 6) & 3, (code >> 4) & 3, (code >> 2) & 3, code & 3, ((code >> 1) & 1) + 1];
    bars.forEach((b, j) => {
      if (j % 2 === 0) ctx.fillRect(x, 0, barWidth * (b + 1), barH);
      x += barWidth * (b + 1);
    });
  }

  // Text below — centered
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(text, w / 2, h - 2);
}

// Escape helpers
function _esc2(s) { return window.escHtml(s); }

window.renderReports = renderReports;
window.openInvoiceDetail = openInvoiceDetail;

// ============ CREDIT / DEBIT NOTES ============
async function openCreditDebitNoteModal(container, sale, noteType, parentCloseModal) {
  const lang = window.i18n.getLang();
  const isCredit = noteType === 'credit';
  const title = isCredit ? (lang === 'ar' ? '📄 إشعار دائن (Credit Note)' : '📄 Credit Note') : (lang === 'ar' ? '📄 إشعار مدين (Debit Note)' : '📄 Debit Note');
  const desc = isCredit
    ? (lang === 'ar' ? 'تخفيض مبلغ الفاتورة — رد جزئي بدون إرجاع المنتج' : 'Reduce invoice amount — partial refund without product return')
    : (lang === 'ar' ? 'زيادة مبلغ الفاتورة — رسوم إضافية' : 'Increase invoice amount — additional charges');

  // Check existing notes for this invoice
  const existingRes = await window.daftrly.query('SELECT * FROM credit_debit_notes WHERE sale_id=? ORDER BY created_at DESC', [sale.id]);
  const existingNotes = existingRes.success ? (existingRes.data || []) : [];
  const existingHtml = existingNotes.length > 0 ? `
    <div style="margin-bottom:12px;">
      <div style="font-size:12px;font-weight:600;margin-bottom:6px;">${lang === 'ar' ? 'إشعارات سابقة على هذه الفاتورة:' : 'Previous notes on this invoice:'}</div>
      ${existingNotes.map(n => `<div style="display:flex;justify-content:space-between;padding:6px 8px;border-radius:6px;background:var(--bg-tertiary);margin-bottom:4px;font-size:12px;">
        <span>${n.note_number} — ${n.note_type === 'credit' ? (lang === 'ar' ? 'دائن' : 'Credit') : (lang === 'ar' ? 'مدين' : 'Debit')}</span>
        <span style="font-weight:700;color:${n.note_type === 'credit' ? 'var(--danger)' : 'var(--success)'};">${n.note_type === 'credit' ? '-' : '+'}${formatCurrency(n.amount)}</span>
        <span style="color:var(--text-tertiary);">${n.created_at?.substring(0, 10) || ''}</span>
      </div>`).join('')}
    </div>` : '';

  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';
  overlay.innerHTML = `<div class="modal" style="max-width:450px;width:95%;">
    <div class="modal-header"><h3>${title}</h3><button class="modal-close" id="cdn-close">✕</button></div>
    <div class="modal-body" style="padding:16px;">
      <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">${desc}</div>
      <div style="background:var(--bg-secondary);padding:10px;border-radius:8px;margin-bottom:12px;font-size:13px;">
        <div><strong>${lang === 'ar' ? 'الفاتورة:' : 'Invoice:'}</strong> ${sale.invoice_number}</div>
        <div><strong>${lang === 'ar' ? 'المبلغ الأصلي:' : 'Original Amount:'}</strong> ${formatCurrency(sale.total)}</div>
      </div>
      ${existingHtml}
      <div class="form-group">
        <label class="form-label">${lang === 'ar' ? 'المبلغ *' : 'Amount *'}</label>
        <input type="text" inputmode="decimal" id="cdn-amount" class="form-input" placeholder="0.00" autofocus>
        ${isCredit ? `<div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;">${lang === 'ar' ? 'الحد الأقصى: ' + formatCurrency(sale.total) : 'Maximum: ' + formatCurrency(sale.total)}</div>` : ''}
      </div>
      <div class="form-group">
        <label class="form-label">${lang === 'ar' ? 'السبب *' : 'Reason *'}</label>
        <select id="cdn-reason" class="form-input form-select">
          ${isCredit ? `
            <option value="price_error">${lang === 'ar' ? 'خطأ في السعر' : 'Price error'}</option>
            <option value="overcharge">${lang === 'ar' ? 'تحصيل زائد' : 'Overcharged'}</option>
            <option value="customer_goodwill">${lang === 'ar' ? 'حسن نية للعميل' : 'Customer goodwill'}</option>
            <option value="billing_dispute">${lang === 'ar' ? 'خلاف في الفاتورة' : 'Billing dispute'}</option>
            <option value="other">${lang === 'ar' ? 'سبب آخر' : 'Other'}</option>
          ` : `
            <option value="undercharge">${lang === 'ar' ? 'تحصيل ناقص' : 'Undercharged'}</option>
            <option value="additional_service">${lang === 'ar' ? 'خدمة إضافية' : 'Additional service'}</option>
            <option value="price_adjustment">${lang === 'ar' ? 'تعديل السعر' : 'Price adjustment'}</option>
            <option value="other">${lang === 'ar' ? 'سبب آخر' : 'Other'}</option>
          `}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">${lang === 'ar' ? 'ملاحظات' : 'Notes'}</label>
        <textarea id="cdn-notes" class="form-input form-textarea" rows="2" placeholder="${lang === 'ar' ? 'اختياري' : 'Optional'}"></textarea>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="cdn-cancel">${lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
      <button class="btn btn-primary" id="cdn-save">${lang === 'ar' ? 'إصدار الإشعار' : 'Issue Note'}</button>
    </div>
  </div>`;
  document.body.appendChild(overlay);

  const closeNote = () => overlay.remove();
  overlay.querySelector('#cdn-close').addEventListener('click', closeNote);
  overlay.querySelector('#cdn-cancel').addEventListener('click', closeNote);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeNote(); });

  overlay.querySelector('#cdn-save').addEventListener('click', async () => {
    const amount = parseFloat(overlay.querySelector('#cdn-amount').value);
    if (!amount || amount <= 0) {
      showToast(lang === 'ar' ? 'أدخل مبلغ صحيح' : 'Enter a valid amount', 'error');
      return;
    }
    if (isCredit && amount > sale.total) {
      showToast(lang === 'ar' ? 'المبلغ أكبر من قيمة الفاتورة' : 'Amount exceeds invoice total', 'error');
      return;
    }
    const reason = overlay.querySelector('#cdn-reason').value;
    const notes = overlay.querySelector('#cdn-notes').value.trim();

    // For credit notes: ask how to resolve
    let resolution = 'store_credit'; // default
    if (isCredit) {
      if (sale.customer_id) {
        // Customer exists — ask: cash refund or store credit?
        const choiceOverlay = document.createElement('div');
        choiceOverlay.style.cssText = 'position:fixed;inset:0;z-index:999999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';
        choiceOverlay.innerHTML = `<div class="modal" style="max-width:350px;width:90%;text-align:center;padding:24px;">
          <div style="font-size:16px;font-weight:700;margin-bottom:16px;">${lang === 'ar' ? 'كيف تريد معالجة المبلغ؟' : 'How to process the refund?'}</div>
          <div style="font-size:24px;font-weight:900;color:var(--accent);margin-bottom:20px;">${formatCurrency(amount)}</div>
          <div style="display:flex;flex-direction:column;gap:10px;">
            <button class="btn btn-primary" id="res-credit" style="padding:14px;">${lang === 'ar' ? '💳 إضافة لرصيد العميل' : '💳 Add to Customer Credit'}</button>
            <button class="btn btn-secondary" id="res-cash" style="padding:14px;">${lang === 'ar' ? '💵 رد نقدي فوري' : '💵 Cash Refund Now'}</button>
            <button class="btn btn-secondary" id="res-cancel" style="padding:10px;font-size:12px;">${lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
          </div>
        </div>`;
        document.body.appendChild(choiceOverlay);
        resolution = await new Promise(resolve => {
          choiceOverlay.querySelector('#res-credit').addEventListener('click', () => { choiceOverlay.remove(); resolve('store_credit'); });
          choiceOverlay.querySelector('#res-cash').addEventListener('click', () => { choiceOverlay.remove(); resolve('cash_refund'); });
          choiceOverlay.querySelector('#res-cancel').addEventListener('click', () => { choiceOverlay.remove(); resolve(null); });
        });
        if (!resolution) return; // cancelled
      } else {
        // No customer — default to cash refund, no credit tracking
        resolution = 'cash_refund';
      }
    }

    // For debit notes: ask how collected
    let collection = 'outstanding'; // default
    if (!isCredit) {
      if (sale.customer_id) {
        collection = 'outstanding'; // track on customer account
      } else {
        collection = 'standalone'; // just record it
      }
    }

    // Generate note number
    const prefix = isCredit ? 'CN' : 'DN';
    const seqRes = await window.daftrly.nextSequence(isCredit ? 'credit_note' : 'debit_note');
    const noteNumber = `${prefix}-${String(seqRes).padStart(5, '0')}`;

    await window.daftrly.query(
      `INSERT INTO credit_debit_notes (note_number, note_type, sale_id, invoice_number, amount, reason, status, customer_id, created_by)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [noteNumber, noteType, sale.id, sale.invoice_number, amount,
       reason + (notes ? ' | ' + notes : ''),
       resolution || collection,
       sale.customer_id || null,
       window._currentUser?.id || null]);

    // Process credit note resolution
    if (isCredit) {
      if (resolution === 'store_credit' && sale.customer_id) {
        await window.daftrly.query('UPDATE customers SET credit_balance = credit_balance + ? WHERE id = ?', [amount, sale.customer_id]);
      }
      // Cash refund is just recorded — merchant hands cash to customer
    }

    // Process debit note — add to customer balance due
    if (!isCredit && sale.customer_id) {
      await window.daftrly.query('UPDATE customers SET credit_balance = credit_balance - ? WHERE id = ?', [amount, sale.customer_id]);
    }

    window.logAudit(isCredit ? 'credit_note_issue' : 'debit_note_issue', 'credit_debit_notes', null, `${noteNumber} | ${sale.invoice_number} | ${amount} | ${resolution || collection}`);

    // Qoyod sync for credit notes
    if (isCredit && typeof window.qoyodSyncCreditNote === 'function') {
      const noteIdRes = await window.daftrly.query("SELECT id FROM credit_debit_notes WHERE note_number=? LIMIT 1", [noteNumber]);
      const noteId = noteIdRes.data?.[0]?.id;
      if (noteId) window.qoyodSyncCreditNote(noteId).catch(e => console.error('Qoyod CN sync:', e));
    }

    closeNote();
    if (parentCloseModal) parentCloseModal();
    showToast(lang === 'ar' ? `✅ تم إصدار ${noteNumber}` : `✅ ${noteNumber} issued`, 'success');
    loadSales(container);
  });
}

// Initialize sequences for credit/debit notes
(async () => {
  try {
    await window.daftrly.query("INSERT OR IGNORE INTO sequences (id, current_value) VALUES ('credit_note', 0)");
    await window.daftrly.query("INSERT OR IGNORE INTO sequences (id, current_value) VALUES ('debit_note', 0)");
  } catch(e) {}
})();
