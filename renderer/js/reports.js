// ============================================
// NAQDI - MODULE 7: FINANCIAL REPORTS
// P&L, VAT, Zakat, sales analytics, inventory
// ============================================

// Print report helper — prints the content of a container
function printReport(title, contentEl) {
  const htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family: 'Segoe UI', Tahoma, sans-serif; font-size:12px; padding:20px; direction:rtl; }
      h1 { font-size:18px; text-align:center; margin-bottom:4px; }
      .date { text-align:center; color:#666; margin-bottom:16px; font-size:11px; }
      table { width:100%; border-collapse:collapse; margin:8px 0; }
      th, td { border:1px solid #ddd; padding:6px 8px; text-align:right; font-size:11px; }
      th { background:#f0f0f0; font-weight:700; }
      .section-title { font-weight:700; font-size:13px; margin:12px 0 6px; }
      .summary-row { display:flex; justify-content:space-between; padding:3px 0; }
      .summary-row.bold { font-weight:700; border-top:1px solid #333; margin-top:4px; padding-top:4px; }
      @media print { @page { size:A4; margin:15mm; } }
    </style>
  </head><body>
    <h1>${title}</h1>
    <div class="date">${new Date().toLocaleString('en-GB')}</div>
    ${contentEl.innerHTML}
  </body></html>`;
  // Use native print dialog with preview and Save as PDF option
  if (window.daftrly?.printPreview) {
    window.daftrly.printPreview(htmlContent, 210).catch(e => {
      window.dbg?.('warn', 'Report print error:', e.message);
    });
  }
}

// Export report helper — exports data as Excel via IPC
async function exportReport(title, headers, rows, filename) {
  const lang = window.i18n.getLang();
  if (!rows || rows.length === 0) {
    showToast(lang === 'ar' ? 'لا توجد بيانات' : 'No data to export', 'error');
    return;
  }
  const result = await window.daftrly.exportReport({ title, headers, rows, filename });
  if (result.success) showToast(lang === 'ar' ? `✅ تم تصدير ${result.count} سجل` : `✅ Exported ${result.count} rows`, 'success');
  else if (!result.canceled) showToast(result.error || 'Error', 'error');
}

// Override the reports page — add tabs for different report types
const origRenderReports = window.renderReports;

async function renderReportsEnhanced(container) {
  const lang = window.i18n.getLang();
  window.dbg('nav', 'Rendering Enhanced Reports page');

  let activeReport = 'sales';

  const reportTabs = [
    { id: 'sales', ar: 'المبيعات', en: 'Sales' },
    { id: 'returns', ar: 'المرتجعات', en: 'Returns' },
    { id: 'by_product', ar: 'حسب المنتج', en: 'By Product' },
    { id: 'by_category', ar: 'حسب التصنيف', en: 'By Category' },
    { id: 'by_cashier', ar: 'حسب الكاشير', en: 'By Cashier' },
    { id: 'pnl', ar: 'الأرباح والخسائر', en: 'Profit & Loss' },
    { id: 'vat', ar: 'تقرير الضريبة', en: 'VAT Report' },
    { id: 'inventory', ar: 'المخزون', en: 'Inventory' },
    { id: 'customers', ar: 'العملاء', en: 'Customers' },
    { id: 'zreport', ar: 'تقرير نهاية اليوم', en: 'Z-Report' },
    { id: 'notes', ar: 'إشعارات دائنة/مدينة', en: 'Credit/Debit Notes' },
  ];

  // Add Zakat report tab only if Zakat is enabled in settings
  if (window.appSettings?.zakat?.enabled) {
    reportTabs.push({ id: 'zakat', ar: 'تقدير الزكاة', en: 'Zakat Estimate' });
  }

  container.innerHTML = `
    <div class="reports-page slide-in">
      <div class="report-tabs" id="report-tabs">
        ${reportTabs.map(t => `<button class="report-tab ${t.id === activeReport ? 'active' : ''}" data-tab="${t.id}">${lang === 'ar' ? t.ar : t.en}</button>`).join('')}
      </div>
      <div class="report-content" id="report-content"></div>
    </div>
    <div class="modal-overlay" id="modal-overlay" style="display:none">
      <div class="modal" id="modal-content" style="max-width:800px;"></div>
    </div>
  `;

  function switchTab(tabId) {
    activeReport = tabId;
    container.querySelectorAll('.report-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabId));
    const content = container.querySelector('#report-content');
    switch (tabId) {
      case 'sales': renderSalesReport(content); break;
      case 'returns': renderReturnsReport(content); break;
      case 'by_product': renderByProductReport(content); break;
      case 'by_category': renderByCategoryReport(content); break;
      case 'by_cashier': renderByCashierReport(content); break;
      case 'pnl': renderPnLReport(content); break;
      case 'vat': renderVATReport(content); break;
      case 'inventory': renderInventoryReport(content); break;
      case 'customers': renderCustomerReport(content); break;
      case 'zreport': renderZReport(content); break;
      case 'notes': renderNotesReport(content); break;
      case 'zakat': renderZakatReport(content); break;
    }
  }

  container.querySelectorAll('.report-tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  switchTab('sales');
}

// ============ SALES REPORT ============
async function renderSalesReport(container) {
  const lang = window.i18n.getLang();
  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.substring(0, 8) + '01';

  container.innerHTML = `
    <div class="report-controls">
      <input type="date" id="sr-from" class="form-input btn-sm" value="${monthStart}" style="width:150px;">
      <span style="color:var(--text-tertiary);">→</span>
      <input type="date" id="sr-to" class="form-input btn-sm" value="${today}" style="width:150px;">
      <button class="btn btn-secondary btn-sm" id="sr-load">${lang === 'ar' ? 'عرض' : 'Load'}</button>
      <button class="btn btn-secondary btn-sm" id="sr-print">🖨 ${lang === 'ar' ? 'طباعة' : 'Print'}</button>
      ${window.hasPermission('reports_export') ? `<button class="btn btn-secondary btn-sm" id="sr-export">📤 ${lang === 'ar' ? 'تصدير' : 'Export'}</button>` : ''}
    </div>
    <div id="sr-data"></div>
  `;

  async function loadData() {
    const from = container.querySelector('#sr-from').value;
    const to = container.querySelector('#sr-to').value;

    const salesR = await window.daftrly.query(
      `SELECT COUNT(*) as cnt, COALESCE(SUM(total),0) as total, COALESCE(SUM(tax_amount),0) as tax, 
       COALESCE(SUM(discount_amount),0) as disc, COALESCE(SUM(subtotal - discount_amount),0) as net
       FROM sales WHERE status='completed' AND date(created_at) BETWEEN ? AND ?`, [from, to]);
    const s = salesR.success && salesR.data?.[0] ? salesR.data[0] : { cnt: 0, total: 0, tax: 0, disc: 0, net: 0 };

    const payR = await window.daftrly.query(
      `SELECT method, COALESCE(SUM(amount),0) as total FROM payments p 
       JOIN sales s ON p.sale_id=s.id WHERE s.status='completed' AND date(s.created_at) BETWEEN ? AND ? 
       GROUP BY method`, [from, to]);
    const payments = (payR.success && payR.data) ? payR.data : [];

    const dailyR = await window.daftrly.query(
      `SELECT date(created_at) as day, COUNT(*) as cnt, SUM(total) as total 
       FROM sales WHERE status='completed' AND date(created_at) BETWEEN ? AND ? 
       GROUP BY date(created_at) ORDER BY day`, [from, to]);
    const daily = (dailyR.success && dailyR.data) ? dailyR.data : [];

    const el = container.querySelector('#sr-data');
    const cashTotal = payments.find(p => p.method === 'cash')?.total || 0;
    const cardTotal = payments.find(p => p.method === 'card')?.total || 0;

    el.innerHTML = `
      <div class="sales-summary" style="margin:16px 0;">
        <div class="stat-card"><div class="stat-card-label">${lang === 'ar' ? 'عدد الفواتير' : 'Invoices'}</div><div class="stat-card-value">${s.cnt}</div></div>
        <div class="stat-card"><div class="stat-card-label">${lang === 'ar' ? 'إجمالي المبيعات' : 'Total Sales'}</div><div class="stat-card-value">${formatCurrency(s.total)}</div></div>
        <div class="stat-card"><div class="stat-card-label">${lang === 'ar' ? 'نقدي' : 'Cash'}</div><div class="stat-card-value">${formatCurrency(cashTotal)}</div></div>
        <div class="stat-card"><div class="stat-card-label">${lang === 'ar' ? 'بطاقة' : 'Card'}</div><div class="stat-card-value">${formatCurrency(cardTotal)}</div></div>
      </div>
      <div class="sales-summary" style="margin-bottom:16px;">
        <div class="stat-card"><div class="stat-card-label">${lang === 'ar' ? 'الضريبة المحصلة' : 'Tax Collected'}</div><div class="stat-card-value">${formatCurrency(s.tax)}</div></div>
        <div class="stat-card"><div class="stat-card-label">${lang === 'ar' ? 'الخصومات' : 'Discounts'}</div><div class="stat-card-value">${formatCurrency(s.disc)}</div></div>
        <div class="stat-card"><div class="stat-card-label">${lang === 'ar' ? 'صافي المبيعات' : 'Net Sales'}</div><div class="stat-card-value">${formatCurrency(s.net)}</div></div>
        <div class="stat-card"><div class="stat-card-label">${lang === 'ar' ? 'متوسط الفاتورة' : 'Avg Invoice'}</div><div class="stat-card-value">${formatCurrency(s.cnt ? s.total / s.cnt : 0)}</div></div>
      </div>
      ${daily.length > 0 ? `
      <div class="report-section-title">${lang === 'ar' ? 'المبيعات اليومية' : 'Daily Sales'}</div>
      <div style="margin-bottom:12px;">
        <input type="text" id="sr-global-search" class="form-input" placeholder="${lang === 'ar' ? '🔍 بحث برقم الفاتورة في كل الأيام...' : '🔍 Search by invoice number across all days...'}" style="max-width:400px;font-size:13px;">
      </div>
      <div id="sr-search-results" style="display:none;margin-bottom:16px;"></div>
      <div class="sales-table-wrap" id="sr-daily-table">
        <table class="data-table">
          <thead><tr><th>${lang === 'ar' ? 'التاريخ' : 'Date'}</th><th>${lang === 'ar' ? 'الفواتير' : 'Invoices'}</th><th>${lang === 'ar' ? 'الإجمالي' : 'Total'}</th><th></th></tr></thead>
          <tbody>${daily.map(d => `<tr data-day="${d.day}" style="cursor:pointer;"><td>${d.day}</td><td>${d.cnt}</td><td style="font-weight:700">${formatCurrency(d.total)}</td><td><button class="btn btn-secondary btn-sm">${lang === 'ar' ? 'عرض' : 'View'}</button></td></tr>`).join('')}</tbody>
        </table>
      </div>` : ''}
    `;

    // Bind click handlers to daily rows
    const outerContainer = container.parentElement.parentElement;
    el.querySelectorAll('tr[data-day]').forEach(row => {
      row.addEventListener('click', () => openDaySales(row.dataset.day, outerContainer, lang));
    });

    // Global invoice search across all days
    const globalSearch = el.querySelector('#sr-global-search');
    const searchResults = el.querySelector('#sr-search-results');
    if (globalSearch && searchResults) {
      let searchTimeout;
      globalSearch.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const q = globalSearch.value.trim();
        if (q.length < 2) { searchResults.style.display = 'none'; return; }
        searchTimeout = setTimeout(async () => {
          const from = container.querySelector('#sr-from').value;
          const to = container.querySelector('#sr-to').value;
          const res = await window.daftrly.query(
            `SELECT s.id, s.invoice_number, s.total, s.created_at, c.name_ar as cust_name_ar, c.name_en as cust_name_en
             FROM sales s LEFT JOIN customers c ON s.customer_id = c.id
             WHERE s.status='completed' AND date(s.created_at) BETWEEN ? AND ? AND s.invoice_number LIKE ?
             ORDER BY s.created_at DESC LIMIT 20`, [from, to, '%' + q + '%']);
          const matches = (res.success && res.data) ? res.data : [];
          if (!matches.length) {
            searchResults.innerHTML = `<div style="padding:12px;color:var(--text-tertiary);font-size:13px;">${lang === 'ar' ? 'لا توجد نتائج' : 'No results'}</div>`;
          } else {
            searchResults.innerHTML = `
              <table class="data-table">
                <thead><tr>
                  <th>${lang === 'ar' ? 'رقم الفاتورة' : 'Invoice #'}</th>
                  <th>${lang === 'ar' ? 'التاريخ' : 'Date'}</th>
                  <th>${lang === 'ar' ? 'العميل' : 'Customer'}</th>
                  <th>${lang === 'ar' ? 'الإجمالي' : 'Total'}</th>
                  <th></th>
                </tr></thead>
                <tbody>${matches.map(m => {
                  const cName = m.cust_name_ar ? (lang === 'ar' ? m.cust_name_ar : (m.cust_name_en || m.cust_name_ar)) : (lang === 'ar' ? 'بدون عميل' : 'Walk-in');
                  const dt = m.created_at ? m.created_at.substring(0, 16).replace('T', ' ') : '-';
                  return `<tr style="cursor:pointer;" data-search-id="${m.id}">
                    <td style="font-family:var(--font-mono);font-size:12px;font-weight:600;">${_escR(m.invoice_number)}</td>
                    <td style="font-size:12px;">${dt}</td>
                    <td>${_escR(cName)}</td>
                    <td style="font-weight:700;">${formatCurrency(m.total)}</td>
                    <td><button class="btn btn-secondary btn-sm" data-action="view-search-inv" data-id="${m.id}">${lang === 'ar' ? 'عرض' : 'View'}</button></td>
                  </tr>`;
                }).join('')}</tbody>
              </table>`;
            searchResults.querySelectorAll('[data-action="view-search-inv"]').forEach(btn => {
              btn.addEventListener('click', (e) => {
                e.stopPropagation();
                openInvoiceDetail(outerContainer, parseInt(btn.dataset.id));
              });
            });
            searchResults.querySelectorAll('tr[data-search-id]').forEach(row => {
              row.addEventListener('click', () => openInvoiceDetail(outerContainer, parseInt(row.dataset.searchId)));
            });
          }
          searchResults.style.display = '';
        }, 300);
      });
    }
  }

  container.querySelector('#sr-load').addEventListener('click', loadData);
  container.querySelector('#sr-print')?.addEventListener('click', () => {
    const lang2 = window.i18n.getLang();
    printReport(lang2 === 'ar' ? 'تقرير المبيعات' : 'Sales Report', container.querySelector('#sr-data'));
  });
  const exportBtn = container.querySelector('#sr-export');
  if (exportBtn) exportBtn.addEventListener('click', async () => {
    const from = container.querySelector('#sr-from').value;
    const to = container.querySelector('#sr-to').value;
    window.dbg('ui', 'Exporting sales', { from, to });
    const result = await window.daftrly.exportSales(from, to);
    if (result.success) showToast(lang === 'ar' ? `تم تصدير ${result.count} فاتورة` : `${result.count} invoices exported`, 'success');
    else if (!result.canceled) showToast(result.error || (lang === 'ar' ? 'خطأ' : 'Error'), 'error');
  });
  await loadData();
}

// ============ P&L REPORT ============
async function renderPnLReport(container) {
  const lang = window.i18n.getLang();
  const today = new Date().toISOString().split('T')[0];
  const monthStart = today.substring(0, 8) + '01';

  container.innerHTML = `
    <div class="report-controls">
      <input type="date" id="pnl-from" class="form-input btn-sm" value="${monthStart}" style="width:150px;">
      <span style="color:var(--text-tertiary);">→</span>
      <input type="date" id="pnl-to" class="form-input btn-sm" value="${today}" style="width:150px;">
      <button class="btn btn-secondary btn-sm" id="pnl-load">${lang === 'ar' ? 'عرض' : 'Load'}</button>
      <button class="btn btn-secondary btn-sm" id="pnl-print">🖨 ${lang === 'ar' ? 'طباعة' : 'Print'}</button>
      <button class="btn btn-secondary btn-sm" id="pnl-export">📤 ${lang === 'ar' ? 'تصدير' : 'Export'}</button>
    </div>
    <div id="pnl-data"></div>
  `;

  async function loadData() {
    const from = container.querySelector('#pnl-from').value;
    const to = container.querySelector('#pnl-to').value;

    // Revenue
    const revR = await window.daftrly.query(
      `SELECT COALESCE(SUM(total),0) as revenue, COALESCE(SUM(tax_amount),0) as tax, COALESCE(SUM(discount_amount),0) as disc
       FROM sales WHERE status='completed' AND date(created_at) BETWEEN ? AND ?`, [from, to]);
    const rev = revR.success && revR.data?.[0] ? revR.data[0] : { revenue: 0, tax: 0, disc: 0 };

    // COGS (cost of goods sold)
    const cogsR = await window.daftrly.query(
      `SELECT COALESCE(SUM(si.quantity * p.cost),0) as cogs 
       FROM sale_items si JOIN products p ON si.product_id=p.id 
       JOIN sales s ON si.sale_id=s.id 
       WHERE s.status='completed' AND date(s.created_at) BETWEEN ? AND ?`, [from, to]);
    const cogs = cogsR.success && cogsR.data?.[0] ? cogsR.data[0].cogs : 0;

    // Expenses
    const expR = await window.daftrly.query(
      `SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE date(created_at) BETWEEN ? AND ?`, [from, to]);
    const expenses = expR.success && expR.data?.[0] ? expR.data[0].total : 0;

    const grossProfit = rev.revenue - rev.tax - cogs;
    const netProfit = grossProfit - expenses;

    container.querySelector('#pnl-data').innerHTML = `
      <div class="pnl-report" style="margin-top:16px;" id="pnl-printable">
        <div class="pnl-section">
          <div class="pnl-header">${lang === 'ar' ? 'الإيرادات' : 'Revenue'}</div>
          <div class="pnl-row"><span>${lang === 'ar' ? 'إجمالي المبيعات' : 'Total Sales'}</span><span>${formatCurrency(rev.revenue)}</span></div>
          <div class="pnl-row pnl-sub"><span>${lang === 'ar' ? '(-) ضريبة القيمة المضافة' : '(-) VAT'}</span><span>${formatCurrency(rev.tax)}</span></div>
          <div class="pnl-row pnl-sub"><span>${lang === 'ar' ? '(-) تكلفة البضاعة المباعة' : '(-) Cost of Goods Sold'}</span><span>${formatCurrency(cogs)}</span></div>
          <div class="pnl-row pnl-total"><span>${lang === 'ar' ? 'إجمالي الربح' : 'Gross Profit'}</span><span style="color:${grossProfit >= 0 ? 'var(--success)' : 'var(--danger)'}">${formatCurrency(grossProfit)}</span></div>
        </div>
        <div class="pnl-section">
          <div class="pnl-header">${lang === 'ar' ? 'المصروفات' : 'Operating Expenses'}</div>
          <div class="pnl-row"><span>${lang === 'ar' ? 'إجمالي المصروفات' : 'Total Expenses'}</span><span>${formatCurrency(expenses)}</span></div>
        </div>
        <div class="pnl-section">
          <div class="pnl-row pnl-grand"><span>${lang === 'ar' ? 'صافي الربح / الخسارة' : 'Net Profit / Loss'}</span><span style="color:${netProfit >= 0 ? 'var(--success)' : 'var(--danger)'}; font-size:24px;">${formatCurrency(netProfit)}</span></div>
        </div>
      </div>
    `;

    window._pnlExportData = { from, to, revenue: rev.revenue, tax: rev.tax, disc: rev.disc, cogs, expenses, grossProfit, netProfit };
  }

  container.querySelector('#pnl-load').addEventListener('click', loadData);
  container.querySelector('#pnl-print')?.addEventListener('click', () => {
    const lang2 = window.i18n.getLang();
    const el = container.querySelector('#pnl-printable');
    if (el) printReport(lang2 === 'ar' ? 'الأرباح والخسائر' : 'Profit & Loss', el);
  });
  container.querySelector('#pnl-export')?.addEventListener('click', () => {
    const d = window._pnlExportData;
    if (!d) { showToast('Load data first', 'error'); return; }
    const h = ['البند / Item', 'المبلغ / Amount'];
    const r = [
      ['الفترة / Period', `${d.from} → ${d.to}`],
      ['إجمالي المبيعات / Total Sales', d.revenue],
      ['ضريبة القيمة المضافة / VAT', d.tax],
      ['تكلفة البضاعة المباعة / COGS', d.cogs],
      ['إجمالي الربح / Gross Profit', d.grossProfit],
      ['المصروفات / Expenses', d.expenses],
      ['صافي الربح / Net Profit', d.netProfit],
    ];
    exportReport('Profit & Loss', h, r, 'naqdi-pnl');
  });
  await loadData();
}

// ============ VAT REPORT ============
async function renderVATReport(container) {
  const lang = window.i18n.getLang();
  const today = new Date().toISOString().split('T')[0];
  const qStart = today.substring(0, 5) + (Math.ceil((new Date().getMonth() + 1) / 3) * 3 - 2).toString().padStart(2, '0') + '-01';

  container.innerHTML = `
    <div class="report-controls">
      <input type="date" id="vat-from" class="form-input btn-sm" value="${qStart}" style="width:150px;">
      <span style="color:var(--text-tertiary);">→</span>
      <input type="date" id="vat-to" class="form-input btn-sm" value="${today}" style="width:150px;">
      <button class="btn btn-secondary btn-sm" id="vat-load">${lang === 'ar' ? 'عرض' : 'Load'}</button>
      <button class="btn btn-secondary btn-sm" id="vat-print">🖨 ${lang === 'ar' ? 'طباعة' : 'Print'}</button>
      <button class="btn btn-secondary btn-sm" id="vat-export">📤 ${lang === 'ar' ? 'تصدير' : 'Export'}</button>
    </div>
    <div id="vat-data"></div>
  `;

  async function loadData() {
    const from = container.querySelector('#vat-from').value;
    const to = container.querySelector('#vat-to').value;

    // Output VAT (sales)
    const outR = await window.daftrly.query(
      `SELECT COALESCE(SUM(total),0) as sales, COALESCE(SUM(tax_amount),0) as vat_out
       FROM sales WHERE status='completed' AND date(created_at) BETWEEN ? AND ?`, [from, to]);
    const out = outR.success && outR.data?.[0] ? outR.data[0] : { sales: 0, vat_out: 0 };

    // Input VAT (purchases) — estimated from PO costs
    const inR = await window.daftrly.query(
      `SELECT COALESCE(SUM(total),0) as purchases FROM purchase_orders 
       WHERE status='received' AND date(received_date) BETWEEN ? AND ?`, [from, to]);
    const purchases = inR.success && inR.data?.[0] ? inR.data[0].purchases : 0;

    const settings = await window.daftrly.getSettings();
    const vatRate = settings.vat?.rate || 15;
    const vatInput = purchases * (vatRate / (100 + vatRate)); // Extract VAT from inclusive amount
    const netVat = out.vat_out - vatInput;

    container.querySelector('#vat-data').innerHTML = `
      <div class="pnl-report" style="margin-top:16px;" id="vat-printable">
        <div class="pnl-section">
          <div class="pnl-header">${lang === 'ar' ? 'ضريبة المخرجات (المبيعات)' : 'Output VAT (Sales)'}</div>
          <div class="pnl-row"><span>${lang === 'ar' ? 'إجمالي المبيعات' : 'Total Sales'}</span><span>${formatCurrency(out.sales)}</span></div>
          <div class="pnl-row pnl-total"><span>${lang === 'ar' ? 'ضريبة المخرجات' : 'Output VAT'}</span><span>${formatCurrency(out.vat_out)}</span></div>
        </div>
        <div class="pnl-section">
          <div class="pnl-header">${lang === 'ar' ? 'ضريبة المدخلات (المشتريات)' : 'Input VAT (Purchases)'}</div>
          <div class="pnl-row"><span>${lang === 'ar' ? 'إجمالي المشتريات' : 'Total Purchases'}</span><span>${formatCurrency(purchases)}</span></div>
          <div class="pnl-row pnl-total"><span>${lang === 'ar' ? 'ضريبة المدخلات (تقديرية)' : 'Input VAT (estimated)'}</span><span>${formatCurrency(vatInput)}</span></div>
        </div>
        <div class="pnl-section">
          <div class="pnl-row pnl-grand"><span>${lang === 'ar' ? 'صافي الضريبة المستحقة' : 'Net VAT Payable'}</span><span style="color:${netVat >= 0 ? 'var(--danger)' : 'var(--success)'}; font-size:24px;">${formatCurrency(Math.abs(netVat))}</span></div>
          <div style="text-align:center;font-size:12px;color:var(--text-tertiary);margin-top:8px;">
            ${netVat >= 0 ? (lang === 'ar' ? 'مستحق الدفع لهيئة الزكاة والضريبة' : 'Payable to ZATCA') : (lang === 'ar' ? 'رصيد لصالحك' : 'Credit in your favor')}
          </div>
        </div>
      </div>
    `;

    // Store data for export
    window._vatExportData = { from, to, sales: out.sales, vatOut: out.vat_out, purchases, vatInput, netVat };
  }

  container.querySelector('#vat-load').addEventListener('click', loadData);
  container.querySelector('#vat-print')?.addEventListener('click', () => {
    const lang2 = window.i18n.getLang();
    const el = container.querySelector('#vat-printable');
    if (el) printReport(lang2 === 'ar' ? 'تقرير ضريبة القيمة المضافة' : 'VAT Report', el);
  });
  container.querySelector('#vat-export')?.addEventListener('click', () => {
    const d = window._vatExportData;
    if (!d) { showToast('Load data first', 'error'); return; }
    const h = ['البند / Item', 'المبلغ / Amount'];
    const r = [
      ['الفترة / Period', `${d.from} → ${d.to}`],
      ['إجمالي المبيعات / Total Sales', d.sales],
      ['ضريبة المخرجات / Output VAT', d.vatOut],
      ['إجمالي المشتريات / Total Purchases', d.purchases],
      ['ضريبة المدخلات / Input VAT (est.)', d.vatInput],
      ['صافي الضريبة المستحقة / Net VAT Payable', d.netVat],
    ];
    exportReport('VAT Report', h, r, 'naqdi-vat');
  });
  await loadData();
}

// ============ ZAKAT REPORT ============
async function renderZakatReport(container) {
  const lang = window.i18n.getLang();
  const settings = await window.daftrly.getSettings();
  const zakatRate = settings.zakat?.rate || 2.5;
  const year = new Date().getFullYear();

  // Calculate net assets: inventory value + cash from sales - expenses
  const invR = await window.daftrly.query('SELECT COALESCE(SUM(stock_quantity * cost),0) as val FROM products WHERE is_active=1 AND track_stock=1');
  const inventoryVal = invR.success && invR.data?.[0] ? invR.data[0].val : 0;

  const salesR = await window.daftrly.query(`SELECT COALESCE(SUM(total),0) as total FROM sales WHERE status='completed' AND strftime('%Y',created_at)=?`, [String(year)]);
  const yearSales = salesR.success && salesR.data?.[0] ? salesR.data[0].total : 0;

  const expR = await window.daftrly.query(`SELECT COALESCE(SUM(amount),0) as total FROM expenses WHERE strftime('%Y',created_at)=?`, [String(year)]);
  const yearExpenses = expR.success && expR.data?.[0] ? expR.data[0].total : 0;

  const netAssets = inventoryVal + yearSales - yearExpenses;
  const zakatDue = Math.max(0, netAssets * (zakatRate / 100));

  container.innerHTML = `
    <div class="pnl-report" style="margin-top:16px;">
      <div class="pnl-section">
        <div class="pnl-header">${lang === 'ar' ? `تقدير الزكاة لعام ${year}` : `Zakat Estimate for ${year}`}</div>
        <div class="pnl-row"><span>${lang === 'ar' ? 'قيمة المخزون' : 'Inventory Value'}</span><span>${formatCurrency(inventoryVal)}</span></div>
        <div class="pnl-row"><span>${lang === 'ar' ? 'إجمالي المبيعات (السنة)' : 'Total Sales (Year)'}</span><span>${formatCurrency(yearSales)}</span></div>
        <div class="pnl-row pnl-sub"><span>${lang === 'ar' ? '(-) إجمالي المصروفات' : '(-) Total Expenses'}</span><span>${formatCurrency(yearExpenses)}</span></div>
        <div class="pnl-row pnl-total"><span>${lang === 'ar' ? 'صافي الأصول الخاضعة للزكاة' : 'Net Zakatable Assets'}</span><span>${formatCurrency(netAssets)}</span></div>
      </div>
      <div class="pnl-section">
        <div class="pnl-row"><span>${lang === 'ar' ? 'نسبة الزكاة' : 'Zakat Rate'}</span><span>${zakatRate}%</span></div>
        <div class="pnl-row pnl-grand"><span>${lang === 'ar' ? 'الزكاة المقدرة' : 'Estimated Zakat Due'}</span><span style="font-size:24px;color:var(--gold);">${formatCurrency(zakatDue)}</span></div>
      </div>
      <div class="settings-note" style="margin-top:16px;">
        <strong>${lang === 'ar' ? 'تنبيه:' : 'Note:'}</strong> 
        ${lang === 'ar' ? 'هذا تقدير فقط. استشر محاسبك المعتمد للحساب الدقيق.' : 'This is an estimate only. Consult your certified accountant for exact calculation.'}
      </div>
    </div>
  `;
}

// ============ PRODUCT ANALYTICS ============
async function renderProductAnalytics(container) {
  const lang = window.i18n.getLang();

  const topR = await window.daftrly.query(
    `SELECT si.product_id, si.name_ar, si.name_en, SUM(si.quantity) as qty, SUM(si.total) as revenue
     FROM sale_items si JOIN sales s ON si.sale_id=s.id WHERE s.status='completed'
     GROUP BY si.product_id ORDER BY revenue DESC LIMIT 20`);
  const topProducts = (topR.success && topR.data) ? topR.data : [];

  const slowR = await window.daftrly.query(
    `SELECT p.id, p.name_ar, p.name_en, p.stock_quantity, p.cost,
     COALESCE((SELECT SUM(si.quantity) FROM sale_items si JOIN sales s ON si.sale_id=s.id WHERE si.product_id=p.id AND s.status='completed'),0) as sold
     FROM products p WHERE p.is_active=1 AND p.track_stock=1 ORDER BY sold ASC LIMIT 20`);
  const slowProducts = (slowR.success && slowR.data) ? slowR.data : [];

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:16px;">
      <div>
        <div class="report-section-title">${lang === 'ar' ? 'المنتجات الأكثر مبيعاً' : 'Top Selling Products'}</div>
        <div class="sales-table-wrap">
          <table class="data-table">
            <thead><tr><th>#</th><th>${lang === 'ar' ? 'المنتج' : 'Product'}</th><th>${lang === 'ar' ? 'الكمية' : 'Qty'}</th><th>${lang === 'ar' ? 'الإيرادات' : 'Revenue'}</th></tr></thead>
            <tbody>${topProducts.length === 0 ? `<tr><td colspan="4" style="text-align:center;color:var(--text-tertiary);padding:20px;">${lang === 'ar' ? 'لا توجد بيانات' : 'No data'}</td></tr>` : topProducts.map((p, i) => `<tr><td>${i + 1}</td><td>${_escR(lang === 'ar' ? p.name_ar : (p.name_en || p.name_ar))}</td><td>${p.qty}</td><td style="font-weight:600">${formatCurrency(p.revenue)}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      </div>
      <div>
        <div class="report-section-title">${lang === 'ar' ? 'المنتجات الأقل مبيعاً' : 'Slow Moving Products'}</div>
        <div class="sales-table-wrap">
          <table class="data-table">
            <thead><tr><th>${lang === 'ar' ? 'المنتج' : 'Product'}</th><th>${lang === 'ar' ? 'المخزون' : 'Stock'}</th><th>${lang === 'ar' ? 'المباع' : 'Sold'}</th></tr></thead>
            <tbody>${slowProducts.length === 0 ? `<tr><td colspan="3" style="text-align:center;color:var(--text-tertiary);padding:20px;">${lang === 'ar' ? 'لا توجد بيانات' : 'No data'}</td></tr>` : slowProducts.map(p => `<tr><td>${_escR(lang === 'ar' ? p.name_ar : (p.name_en || p.name_ar))}</td><td>${p.stock_quantity}</td><td>${p.sold}</td></tr>`).join('')}</tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// ============ INVENTORY VALUATION ============
async function renderInventoryReport(container) {
  const lang = window.i18n.getLang();

  const r = await window.daftrly.query(
    `SELECT p.*, c.name_ar as cat_name_ar, c.name_en as cat_name_en 
     FROM products p LEFT JOIN categories c ON p.category_id=c.id 
     WHERE p.is_active=1 AND p.track_stock=1 ORDER BY p.name_ar`);
  const products = (r.success && r.data) ? r.data : [];

  // Get VAT settings to adjust retail values for inclusive pricing
  const vatSettings = window.appSettings?.vat || {};
  const isVatInclusive = vatSettings.inclusive === true || vatSettings.inclusive === 'true';
  const vatRate = Number(vatSettings.rate) || 15;

  // For inclusive pricing: retail value and margin should use price excluding VAT
  const getNetPrice = (p) => {
    const taxStatus = p.tax_status || 'standard';
    if (isVatInclusive && taxStatus === 'standard' && vatRate > 0) {
      return p.price / (1 + vatRate / 100);
    }
    return p.price;
  };

  const totalCostVal = products.reduce((s, p) => s + (p.stock_quantity * (p.cost || 0)), 0);
  const totalRetailVal = products.reduce((s, p) => s + (p.stock_quantity * getNetPrice(p)), 0);
  const totalItems = products.reduce((s, p) => s + p.stock_quantity, 0);

  container.innerHTML = `
    <div class="sales-summary" style="margin:16px 0;">
      <div class="stat-card"><div class="stat-card-label">${lang === 'ar' ? 'عدد الأصناف' : 'Products'}</div><div class="stat-card-value">${products.length}</div></div>
      <div class="stat-card"><div class="stat-card-label">${lang === 'ar' ? 'إجمالي الوحدات' : 'Total Units'}</div><div class="stat-card-value">${totalItems}</div></div>
      <div class="stat-card"><div class="stat-card-label">${lang === 'ar' ? 'قيمة التكلفة' : 'Cost Value'}</div><div class="stat-card-value">${formatCurrency(totalCostVal)}</div></div>
      <div class="stat-card"><div class="stat-card-label">${lang === 'ar' ? 'قيمة البيع (بدون ضريبة)' : 'Retail Value (excl. VAT)'}</div><div class="stat-card-value">${formatCurrency(totalRetailVal)}</div></div>
    </div>
    <div style="margin-bottom:8px;">
      <button class="btn btn-secondary btn-sm" id="inv-print">🖨 ${lang === 'ar' ? 'طباعة' : 'Print'}</button>
      <button class="btn btn-secondary btn-sm" id="inv-export">📤 ${lang === 'ar' ? 'تصدير' : 'Export'}</button>
    </div>
    <div class="sales-table-wrap" id="inv-printable">
      <table class="data-table">
        <thead><tr>
          <th>${lang === 'ar' ? 'المنتج' : 'Product'}</th>
          <th>${lang === 'ar' ? 'التصنيف' : 'Category'}</th>
          <th>${lang === 'ar' ? 'الكمية' : 'Qty'}</th>
          <th>${lang === 'ar' ? 'التكلفة' : 'Cost'}</th>
          <th>${lang === 'ar' ? 'السعر (بدون ضريبة)' : 'Price (excl.)'}</th>
          <th>${lang === 'ar' ? 'قيمة التكلفة' : 'Cost Value'}</th>
          <th>${lang === 'ar' ? 'قيمة البيع' : 'Retail Value'}</th>
          <th>${lang === 'ar' ? 'الهامش' : 'Margin'}</th>
        </tr></thead>
        <tbody>
          ${products.map(p => {
            const netPrice = getNetPrice(p);
            const costVal = p.stock_quantity * (p.cost || 0);
            const retVal = p.stock_quantity * netPrice;
            const margin = netPrice > 0 ? ((netPrice - (p.cost || 0)) / netPrice * 100).toFixed(1) : 0;
            const cat = lang === 'ar' ? (p.cat_name_ar || '-') : (p.cat_name_en || p.cat_name_ar || '-');
            return `<tr>
              <td>${_escR(lang === 'ar' ? p.name_ar : (p.name_en || p.name_ar))}</td>
              <td style="font-size:12px;">${_escR(cat)}</td>
              <td>${p.stock_quantity}</td>
              <td>${formatCurrency(p.cost || 0)}</td>
              <td>${formatCurrency(netPrice)}</td>
              <td>${formatCurrency(costVal)}</td>
              <td style="font-weight:600">${formatCurrency(retVal)}</td>
              <td style="color:${margin > 0 ? 'var(--success)' : 'var(--danger)'}">${margin}%</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
  container.querySelector('#inv-print')?.addEventListener('click', () => {
    const lang2 = window.i18n.getLang();
    printReport(lang2 === 'ar' ? 'تقرير المخزون' : 'Inventory Report', container.querySelector('#inv-printable'));
  });
  container.querySelector('#inv-export')?.addEventListener('click', () => {
    const h = ['المنتج / Product', 'التصنيف / Category', 'الكمية / Qty', 'التكلفة / Cost', 'السعر / Price', 'قيمة التكلفة / Cost Value', 'قيمة البيع / Retail Value', 'الهامش / Margin'];
    const r = products.map(p => {
      const cv = p.stock_quantity * (p.cost || 0);
      const rv = p.stock_quantity * p.price;
      const mg = p.price > 0 ? ((p.price - (p.cost || 0)) / p.price * 100).toFixed(1) : 0;
      return [p.name_ar || p.name_en, p.cat_name_ar || p.cat_name_en || '-', p.stock_quantity, p.cost || 0, p.price, cv, rv, mg + '%'];
    });
    exportReport('Inventory', h, r, 'naqdi-inventory');
  });
}

// ============ DAY DRILL-DOWN ============
async function openDaySales(day, container, lang) {
  const overlay = container.querySelector('#modal-overlay');
  const modal = container.querySelector('#modal-content');
  if (!overlay || !modal) return;

  const result = await window.daftrly.query(
    `SELECT s.*, c.name_ar as cust_name_ar, c.name_en as cust_name_en
     FROM sales s LEFT JOIN customers c ON s.customer_id = c.id
     WHERE s.status='completed' AND date(s.created_at) = ? ORDER BY s.created_at DESC`, [day]);
  const sales = (result.success && result.data) ? result.data : [];

  modal.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">${lang === 'ar' ? 'فواتير يوم' : 'Invoices for'} ${day}</h3>
      <button class="modal-close" id="modal-close">✕</button>
    </div>
    <div style="padding:8px 16px;">
      <input type="text" id="day-inv-search" class="form-input" placeholder="${lang === 'ar' ? '🔍 بحث برقم الفاتورة...' : '🔍 Search by invoice number...'}" style="font-size:13px;">
    </div>
    <div class="modal-body" style="padding:0;">
      <table class="data-table" id="day-inv-table">
        <thead><tr>
          <th>${lang === 'ar' ? 'رقم الفاتورة' : 'Invoice #'}</th>
          <th>${lang === 'ar' ? 'الوقت' : 'Time'}</th>
          <th>${lang === 'ar' ? 'العميل' : 'Customer'}</th>
          <th>${lang === 'ar' ? 'الإجمالي' : 'Total'}</th>
          <th></th>
        </tr></thead>
        <tbody>
          ${sales.map(s => {
            const custName = s.cust_name_ar ? (lang === 'ar' ? s.cust_name_ar : (s.cust_name_en || s.cust_name_ar)) : (lang === 'ar' ? 'بدون عميل' : 'Walk-in');
            const time = s.created_at ? s.created_at.substring(11, 16) : '-';
            return `<tr data-inv-num="${(s.invoice_number || '').toLowerCase()}">
              <td style="font-family:var(--font-mono);font-size:12px;font-weight:600;">${_escR(s.invoice_number)}</td>
              <td style="font-size:12px;">${time}</td>
              <td>${_escR(custName)}</td>
              <td style="font-weight:700;">${formatCurrency(s.total)}</td>
              <td><button class="btn btn-secondary btn-sm" data-action="view-inv" data-id="${s.id}">${lang === 'ar' ? 'عرض' : 'View'}</button></td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    </div>
    <div class="modal-footer">
      <button class="btn btn-secondary" id="modal-done">${lang === 'ar' ? 'إغلاق' : 'Close'}</button>
    </div>
  `;

  overlay.style.display = 'flex';
  modal.querySelector('#modal-close').addEventListener('click', () => { overlay.style.display = 'none'; });
  modal.querySelector('#modal-done').addEventListener('click', () => { overlay.style.display = 'none'; });

  modal.querySelectorAll('[data-action="view-inv"]').forEach(btn => {
    btn.addEventListener('click', () => openInvoiceDetail(container, parseInt(btn.dataset.id)));
  });

  // Inner search — filter invoices within this day
  const daySearch = modal.querySelector('#day-inv-search');
  if (daySearch) {
    daySearch.addEventListener('input', () => {
      const q = daySearch.value.trim().toLowerCase();
      modal.querySelectorAll('#day-inv-table tbody tr').forEach(row => {
        const invNum = row.dataset.invNum || '';
        row.style.display = (!q || invNum.includes(q)) ? '' : 'none';
      });
    });
    // Auto-focus the search
    setTimeout(() => daySearch.focus(), 100);
  }
}

function _escR(s) { return window.escHtml(s); }

// ============ RETURNS REPORT ============
async function renderReturnsReport(content) {
  const lang = window.i18n?.getLang() || 'ar';
  const retFrom = window._retFrom || '';
  const retTo = window._retTo || '';

  let retWhere = '';
  const retParams = [];
  if (retFrom) { retWhere += " AND date(r.created_at) >= ?"; retParams.push(retFrom); }
  if (retTo) { retWhere += " AND date(r.created_at) <= ?"; retParams.push(retTo); }

  const returnsRes = await window.daftrly.query(
    `SELECT r.*, 
      (SELECT COUNT(*) FROM return_items WHERE return_id = r.id) as item_count,
      (SELECT GROUP_CONCAT(ri.product_name, ', ') FROM return_items ri WHERE ri.return_id = r.id) as products
    FROM returns r WHERE 1=1 ${retWhere} ORDER BY r.created_at DESC LIMIT 100`, retParams
  );

  const summaryRes = await window.daftrly.query(
    `SELECT COUNT(*) as total_returns, COALESCE(SUM(total_refund), 0) as total_refunded,
      COUNT(CASE WHEN return_type = 'full' THEN 1 END) as full_returns,
      COUNT(CASE WHEN return_type = 'partial' THEN 1 END) as partial_returns
    FROM returns r WHERE 1=1 ${retWhere}`, retParams
  );

  const summary = summaryRes.success && summaryRes.data?.[0] ? summaryRes.data[0] : {};
  const returns = returnsRes.success ? (returnsRes.data || []) : [];

  const reasonMap = {
    changed_mind: lang === 'ar' ? 'تغيير رأي' : 'Changed mind',
    defective: lang === 'ar' ? 'معيب' : 'Defective',
    wrong_item: lang === 'ar' ? 'منتج خاطئ' : 'Wrong item',
    expired: lang === 'ar' ? 'منتهي' : 'Expired',
    other: lang === 'ar' ? 'أخرى' : 'Other',
  };

  content.innerHTML = `
    <div class="report-section fade-in">
      <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center;flex-wrap:wrap;">
        <input type="date" id="ret-from" class="form-input" style="width:auto;font-size:12px;" value="${retFrom}">
        <span>→</span>
        <input type="date" id="ret-to" class="form-input" style="width:auto;font-size:12px;" value="${retTo}">
        <button class="btn btn-primary btn-sm" id="ret-load">${lang === 'ar' ? 'عرض' : 'Load'}</button>
        <button class="btn btn-secondary btn-sm" id="ret-print">🖨 ${lang === 'ar' ? 'طباعة' : 'Print'}</button>
        <button class="btn btn-secondary btn-sm" id="ret-export">📤 ${lang === 'ar' ? 'تصدير' : 'Export'}</button>
        ${retFrom || retTo ? `<button class="btn btn-secondary btn-sm" id="ret-clear">${lang === 'ar' ? 'مسح' : 'Clear'}</button>` : ''}
      </div>
      <div id="ret-printable">
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">
        <div style="background:var(--bg-secondary);padding:16px;border-radius:10px;text-align:center;">
          <div style="font-size:24px;font-weight:700;color:var(--danger);">${Number(summary.total_returns || 0)}</div>
          <div style="font-size:12px;color:var(--text-secondary);">${lang === 'ar' ? 'إجمالي المرتجعات' : 'Total Returns'}</div>
        </div>
        <div style="background:var(--bg-secondary);padding:16px;border-radius:10px;text-align:center;">
          <div style="font-size:24px;font-weight:700;color:var(--danger);">${Number(summary.total_refunded || 0).toFixed(2)}</div>
          <div style="font-size:12px;color:var(--text-secondary);">${lang === 'ar' ? 'إجمالي المسترد' : 'Total Refunded'}</div>
        </div>
        <div style="background:var(--bg-secondary);padding:16px;border-radius:10px;text-align:center;">
          <div style="font-size:24px;font-weight:700;">${Number(summary.full_returns || 0)}</div>
          <div style="font-size:12px;color:var(--text-secondary);">${lang === 'ar' ? 'مرتجع كامل' : 'Full Returns'}</div>
        </div>
        <div style="background:var(--bg-secondary);padding:16px;border-radius:10px;text-align:center;">
          <div style="font-size:24px;font-weight:700;">${Number(summary.partial_returns || 0)}</div>
          <div style="font-size:12px;color:var(--text-secondary);">${lang === 'ar' ? 'مرتجع جزئي' : 'Partial Returns'}</div>
        </div>
      </div>

      ${returns.length === 0 ? `<div style="text-align:center;padding:40px;color:var(--text-secondary);">${lang === 'ar' ? 'لا توجد مرتجعات' : 'No returns yet'}</div>` : `
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead>
            <tr style="border-bottom:2px solid var(--border);text-align:${lang === 'ar' ? 'right' : 'left'};">
              <th style="padding:10px;">${lang === 'ar' ? 'رقم المرتجع' : 'Return #'}</th>
              <th style="padding:10px;">${lang === 'ar' ? 'الفاتورة الأصلية' : 'Original Invoice'}</th>
              <th style="padding:10px;">${lang === 'ar' ? 'المنتجات' : 'Products'}</th>
              <th style="padding:10px;">${lang === 'ar' ? 'المبلغ' : 'Amount'}</th>
              <th style="padding:10px;">${lang === 'ar' ? 'الطريقة' : 'Method'}</th>
              <th style="padding:10px;">${lang === 'ar' ? 'النوع' : 'Type'}</th>
              <th style="padding:10px;">${lang === 'ar' ? 'ZATCA' : 'ZATCA'}</th>
              <th style="padding:10px;">${lang === 'ar' ? 'التاريخ' : 'Date'}</th>
              ${window.hasPermission('settings_access') ? `<th style="padding:10px;"></th>` : ''}
            </tr>
          </thead>
          <tbody>
            ${returns.map(r => {
              const zatcaBadge = r.zatca_status === 'reported' ? '<span style="color:var(--success);">✅</span>'
                : r.zatca_status === 'failed' ? '<span style="color:var(--danger);">❌</span>'
                : '<span style="color:var(--text-tertiary);">—</span>';
              const typeBadge = r.return_type === 'full' 
                ? `<span style="background:var(--danger);color:#fff;padding:2px 6px;border-radius:4px;font-size:11px;">${lang === 'ar' ? 'كامل' : 'Full'}</span>`
                : `<span style="background:var(--warning);color:#fff;padding:2px 6px;border-radius:4px;font-size:11px;">${lang === 'ar' ? 'جزئي' : 'Partial'}</span>`;
              return `<tr style="border-bottom:1px solid var(--border);">
                <td style="padding:10px;font-weight:600;">${_escR(r.return_number)}</td>
                <td style="padding:10px;">${_escR(r.original_invoice_number || '—')}</td>
                <td style="padding:10px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${_escR(r.products)}">${_escR(r.products || '—')}</td>
                <td style="padding:10px;font-weight:600;color:var(--danger);">${Number(r.total_refund).toFixed(2)}</td>
                <td style="padding:10px;">${r.refund_method === 'card' ? (lang === 'ar' ? 'بطاقة' : 'Card') : (lang === 'ar' ? 'نقد' : 'Cash')}</td>
                <td style="padding:10px;">${typeBadge}</td>
                <td style="padding:10px;">${zatcaBadge}</td>
                <td style="padding:10px;font-size:12px;color:var(--text-secondary);">${r.created_at ? r.created_at.split('T')[0] : '—'}</td>
                ${window.hasPermission('settings_access') ? `<td style="padding:10px;"><button class="btn btn-secondary btn-sm" data-void-return="${r.id}" data-return-num="${_escR(r.return_number)}" style="color:var(--danger);font-size:11px;">🚫 ${lang === 'ar' ? 'إلغاء' : 'Void'}</button></td>` : ''}
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      `}
    </div></div>
  `;

  content.querySelector('#ret-load')?.addEventListener('click', () => {
    window._retFrom = content.querySelector('#ret-from')?.value || '';
    window._retTo = content.querySelector('#ret-to')?.value || '';
    renderReturnsReport(content);
  });
  content.querySelector('#ret-clear')?.addEventListener('click', () => {
    window._retFrom = ''; window._retTo = '';
    renderReturnsReport(content);
  });
  content.querySelector('#ret-print')?.addEventListener('click', () => {
    const lang2 = window.i18n.getLang();
    printReport(lang2 === 'ar' ? 'تقرير المرتجعات' : 'Returns Report', content.querySelector('#ret-printable'));
  });
  content.querySelector('#ret-export')?.addEventListener('click', () => {
    const h = ['الفاتورة / Invoice', 'المنتجات / Products', 'المبلغ / Amount', 'الطريقة / Method', 'النوع / Type', 'التاريخ / Date'];
    const r = returns.map(ret => [ret.original_invoice || '', ret.products || '', ret.total_refund || 0, ret.refund_method || '', ret.return_type || '', ret.created_at ? ret.created_at.split('T')[0] : '']);
    exportReport('Returns', h, r, 'naqdi-returns');
  });

  // Void return (admin only)
  content.querySelectorAll('[data-void-return]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const returnId = parseInt(btn.dataset.voidReturn);
      const returnNum = btn.dataset.returnNum;

      const confirmMsg = lang === 'ar'
        ? `⚠️ إلغاء المرتجع ${returnNum}؟\n\nسيتم:\n• حذف سجل المرتجع\n• إعادة خصم المخزون المسترد\n• لا يمكن التراجع\n\nهل أنت متأكد؟`
        : `⚠️ Void return ${returnNum}?\n\nThis will:\n• Delete the return record\n• Re-deduct the restored stock\n• Cannot be undone\n\nAre you sure?`;
      if (!await window.daftrlyConfirm(confirmMsg)) return;

      // Get return items to reverse stock
      const itemsRes = await window.daftrly.query('SELECT product_id, quantity FROM return_items WHERE return_id = ?', [returnId]);
      const retItems = itemsRes.success ? (itemsRes.data || []) : [];

      // Reverse stock (deduct what was restored)
      for (const ri of retItems) {
        await window.daftrly.query('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?', [ri.quantity, ri.product_id]);
      }

      // Delete return records
      await window.daftrly.query('DELETE FROM return_items WHERE return_id = ?', [returnId]);
      await window.daftrly.query('DELETE FROM returns WHERE id = ?', [returnId]);

      window.logAudit('void_return', 'returns', returnId, `Voided ${returnNum} | ${retItems.length} items | stock reversed`);
      showToast(lang === 'ar' ? `✅ تم إلغاء المرتجع ${returnNum}` : `✅ Return ${returnNum} voided`, 'success');
      renderReturnsReport(content);
    });
  });
}

// ============ SALES BY PRODUCT ============
async function renderByProductReport(container) {
  const lang = window.i18n.getLang();
  const from = window._rptFrom || new Date().toISOString().split('T')[0];
  const to = window._rptTo || from;

  const res = await window.daftrly.query(
    `SELECT si.product_id, si.name_ar, si.name_en, 
     SUM(si.quantity) as qty, SUM(si.total) as revenue, SUM(si.tax_amount) as tax,
     COUNT(DISTINCT si.sale_id) as orders
     FROM sale_items si JOIN sales s ON si.sale_id = s.id 
     WHERE s.status = 'completed' AND date(s.created_at) >= ? AND date(s.created_at) <= ?
     GROUP BY si.product_id ORDER BY revenue DESC`, [from, to]);
  const data = res.success ? (res.data || []) : [];
  const totalRev = data.reduce((s, d) => s + d.revenue, 0);

  container.innerHTML = `
    <div style="margin-top:12px;">
      <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center;flex-wrap:wrap;">
        <input type="date" id="rpt-from" class="form-input" style="width:auto;font-size:12px;" value="${from}">
        <span>→</span>
        <input type="date" id="rpt-to" class="form-input" style="width:auto;font-size:12px;" value="${to}">
        <button class="btn btn-primary btn-sm" id="rpt-load">${lang === 'ar' ? 'عرض' : 'Load'}</button>
        <button class="btn btn-secondary btn-sm" id="rpt-print">🖨 ${lang === 'ar' ? 'طباعة' : 'Print'}</button>
        <button class="btn btn-secondary btn-sm" id="rpt-export">📤 ${lang === 'ar' ? 'تصدير' : 'Export'}</button>
      </div>
      <div class="report-section-title">${lang === 'ar' ? `مبيعات حسب المنتج — ${data.length} منتج — ${formatCurrency(totalRev)}` : `Sales by Product — ${data.length} products — ${formatCurrency(totalRev)}`}</div>
      <div class="sales-table-wrap" id="rpt-printable"><table class="data-table">
        <thead><tr>
          <th>#</th><th>${lang === 'ar' ? 'المنتج' : 'Product'}</th>
          <th>${lang === 'ar' ? 'الطلبات' : 'Orders'}</th><th>${lang === 'ar' ? 'الكمية' : 'Qty'}</th>
          <th>${lang === 'ar' ? 'الإيرادات' : 'Revenue'}</th><th>${lang === 'ar' ? 'الضريبة' : 'Tax'}</th>
          <th>%</th>
        </tr></thead>
        <tbody>${data.length === 0 ? `<tr><td colspan="7" style="text-align:center;padding:20px;color:var(--text-tertiary);">${lang === 'ar' ? 'لا توجد بيانات' : 'No data'}</td></tr>` : data.map((p, i) => `<tr>
          <td>${i + 1}</td>
          <td style="font-weight:600;">${_escR(lang === 'ar' ? p.name_ar : (p.name_en || p.name_ar))}</td>
          <td>${p.orders}</td><td>${Number(p.qty).toFixed(0)}</td>
          <td style="font-weight:700;">${formatCurrency(p.revenue)}</td><td>${formatCurrency(p.tax)}</td>
          <td>${totalRev > 0 ? ((p.revenue / totalRev) * 100).toFixed(1) + '%' : '—'}</td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>
  `;
  container.querySelector('#rpt-load').addEventListener('click', () => {
    window._rptFrom = container.querySelector('#rpt-from').value;
    window._rptTo = container.querySelector('#rpt-to').value;
    renderByProductReport(container);
  });
  container.querySelector('#rpt-print')?.addEventListener('click', () => {
    const lang2 = window.i18n.getLang();
    printReport(lang2 === 'ar' ? 'مبيعات حسب المنتج' : 'Sales by Product', container.querySelector('#rpt-printable'));
  });
  container.querySelector('#rpt-export')?.addEventListener('click', () => {
    const h = ['المنتج / Product', 'الطلبات / Orders', 'الكمية / Qty', 'الإيرادات / Revenue', 'الضريبة / Tax', '%'];
    const r = data.map(p => [p.name_ar || p.name_en, p.orders, Number(p.qty), p.revenue, p.tax, totalRev > 0 ? ((p.revenue / totalRev) * 100).toFixed(1) : 0]);
    exportReport('Sales by Product', h, r, 'naqdi-by-product');
  });
}

// ============ SALES BY CATEGORY ============
async function renderByCategoryReport(container) {
  const lang = window.i18n.getLang();
  const from = window._rptFrom || new Date().toISOString().split('T')[0];
  const to = window._rptTo || from;

  const res = await window.daftrly.query(
    `SELECT c.name_ar as cat_ar, c.name_en as cat_en, c.color,
     COUNT(DISTINCT s.id) as orders, SUM(si.quantity) as qty, SUM(si.total) as revenue
     FROM sale_items si JOIN sales s ON si.sale_id = s.id 
     LEFT JOIN products p ON si.product_id = p.id LEFT JOIN categories c ON p.category_id = c.id
     WHERE s.status = 'completed' AND date(s.created_at) >= ? AND date(s.created_at) <= ?
     GROUP BY p.category_id ORDER BY revenue DESC`, [from, to]);
  const data = res.success ? (res.data || []) : [];
  const totalRev = data.reduce((s, d) => s + d.revenue, 0);

  container.innerHTML = `
    <div style="margin-top:12px;">
      <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center;">
        <input type="date" id="rpt-from" class="form-input" style="width:auto;font-size:12px;" value="${from}">
        <span>→</span>
        <input type="date" id="rpt-to" class="form-input" style="width:auto;font-size:12px;" value="${to}">
        <button class="btn btn-primary btn-sm" id="rpt-load">${lang === 'ar' ? 'عرض' : 'Load'}</button>
        <button class="btn btn-secondary btn-sm" id="rpt-print">🖨 ${lang === 'ar' ? 'طباعة' : 'Print'}</button>
        <button class="btn btn-secondary btn-sm" id="rpt-export">📤 ${lang === 'ar' ? 'تصدير' : 'Export'}</button>
      </div>
      <div class="report-section-title">${lang === 'ar' ? `مبيعات حسب التصنيف — ${formatCurrency(totalRev)}` : `Sales by Category — ${formatCurrency(totalRev)}`}</div>
      <div class="sales-table-wrap" id="rpt-printable"><table class="data-table">
        <thead><tr>
          <th>${lang === 'ar' ? 'التصنيف' : 'Category'}</th>
          <th>${lang === 'ar' ? 'الطلبات' : 'Orders'}</th><th>${lang === 'ar' ? 'الكمية' : 'Qty'}</th>
          <th>${lang === 'ar' ? 'الإيرادات' : 'Revenue'}</th><th>%</th>
        </tr></thead>
        <tbody>${data.map(c => {
          const name = c.cat_ar ? (lang === 'ar' ? c.cat_ar : (c.cat_en || c.cat_ar)) : (lang === 'ar' ? 'بدون تصنيف' : 'Uncategorized');
          return `<tr>
            <td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${c.color || '#64748B'};margin-inline-end:6px;vertical-align:middle;"></span>${_escR(name)}</td>
            <td>${c.orders}</td><td>${Number(c.qty).toFixed(0)}</td>
            <td style="font-weight:700;">${formatCurrency(c.revenue)}</td>
            <td>${totalRev > 0 ? ((c.revenue / totalRev) * 100).toFixed(1) + '%' : '—'}</td>
          </tr>`;
        }).join('') || `<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-tertiary);">${lang === 'ar' ? 'لا توجد بيانات' : 'No data'}</td></tr>`}</tbody>
      </table></div>
    </div>
  `;
  container.querySelector('#rpt-load').addEventListener('click', () => {
    window._rptFrom = container.querySelector('#rpt-from').value;
    window._rptTo = container.querySelector('#rpt-to').value;
    renderByCategoryReport(container);
  });
  container.querySelector('#rpt-print')?.addEventListener('click', () => {
    const lang2 = window.i18n.getLang();
    printReport(lang2 === 'ar' ? 'مبيعات حسب التصنيف' : 'Sales by Category', container.querySelector('#rpt-printable'));
  });
  container.querySelector('#rpt-export')?.addEventListener('click', () => {
    const h = ['التصنيف / Category', 'الطلبات / Orders', 'الكمية / Qty', 'الإيرادات / Revenue', '%'];
    const r = data.map(c => [c.cat_ar || c.cat_en || 'Uncategorized', c.orders, Number(c.qty), c.revenue, totalRev > 0 ? ((c.revenue / totalRev) * 100).toFixed(1) : 0]);
    exportReport('Sales by Category', h, r, 'naqdi-by-category');
  });
}

// ============ SALES BY CASHIER ============
async function renderByCashierReport(container) {
  const lang = window.i18n.getLang();
  const from = window._rptFrom || new Date().toISOString().split('T')[0];
  const to = window._rptTo || from;

  const res = await window.daftrly.query(
    `SELECT s.cashier_id, u.name_ar as cashier_ar, u.name_en as cashier_en,
     COUNT(*) as orders, SUM(s.total) as revenue, SUM(s.tax_amount) as tax,
     SUM(s.discount_amount) as discounts, SUM(s.cashier_commission) as commission
     FROM sales s LEFT JOIN users u ON s.cashier_id = u.id
     WHERE s.status = 'completed' AND date(s.created_at) >= ? AND date(s.created_at) <= ?
     GROUP BY s.cashier_id ORDER BY revenue DESC`, [from, to]);
  const data = res.success ? (res.data || []) : [];
  const totalRev = data.reduce((s, d) => s + d.revenue, 0);

  container.innerHTML = `
    <div style="margin-top:12px;">
      <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center;">
        <input type="date" id="rpt-from" class="form-input" style="width:auto;font-size:12px;" value="${from}">
        <span>→</span>
        <input type="date" id="rpt-to" class="form-input" style="width:auto;font-size:12px;" value="${to}">
        <button class="btn btn-primary btn-sm" id="rpt-load">${lang === 'ar' ? 'عرض' : 'Load'}</button>
        <button class="btn btn-secondary btn-sm" id="rpt-print">🖨 ${lang === 'ar' ? 'طباعة' : 'Print'}</button>
        <button class="btn btn-secondary btn-sm" id="rpt-export">📤 ${lang === 'ar' ? 'تصدير' : 'Export'}</button>
      </div>
      <div class="report-section-title">${lang === 'ar' ? `مبيعات حسب الكاشير — ${formatCurrency(totalRev)}` : `Sales by Cashier — ${formatCurrency(totalRev)}`}</div>
      <div class="sales-table-wrap" id="rpt-printable"><table class="data-table">
        <thead><tr>
          <th>${lang === 'ar' ? 'الكاشير' : 'Cashier'}</th>
          <th>${lang === 'ar' ? 'الطلبات' : 'Orders'}</th>
          <th>${lang === 'ar' ? 'الإيرادات' : 'Revenue'}</th>
          <th>${lang === 'ar' ? 'الخصومات' : 'Discounts'}</th>
          <th>${lang === 'ar' ? 'العمولة' : 'Commission'}</th><th>%</th>
        </tr></thead>
        <tbody>${data.map(c => {
          const name = c.cashier_ar ? (lang === 'ar' ? c.cashier_ar : (c.cashier_en || c.cashier_ar)) : (lang === 'ar' ? 'غير محدد' : 'Unknown');
          return `<tr>
            <td style="font-weight:600;">${_escR(name)}</td>
            <td>${c.orders}</td>
            <td style="font-weight:700;">${formatCurrency(c.revenue)}</td>
            <td style="color:var(--danger);">${formatCurrency(c.discounts || 0)}</td>
            <td>${formatCurrency(c.commission || 0)}</td>
            <td>${totalRev > 0 ? ((c.revenue / totalRev) * 100).toFixed(1) + '%' : '—'}</td>
          </tr>`;
        }).join('') || `<tr><td colspan="6" style="text-align:center;padding:20px;color:var(--text-tertiary);">${lang === 'ar' ? 'لا توجد بيانات' : 'No data'}</td></tr>`}</tbody>
      </table></div>
    </div>
  `;
  container.querySelector('#rpt-load').addEventListener('click', () => {
    window._rptFrom = container.querySelector('#rpt-from').value;
    window._rptTo = container.querySelector('#rpt-to').value;
    renderByCashierReport(container);
  });
  container.querySelector('#rpt-print')?.addEventListener('click', () => {
    const lang2 = window.i18n.getLang();
    printReport(lang2 === 'ar' ? 'مبيعات حسب الكاشير' : 'Sales by Cashier', container.querySelector('#rpt-printable'));
  });
  container.querySelector('#rpt-export')?.addEventListener('click', () => {
    const h = ['الكاشير / Cashier', 'الطلبات / Orders', 'الإيرادات / Revenue', 'الخصومات / Discounts', 'العمولة / Commission', '%'];
    const r = data.map(c => [c.cashier_ar || c.cashier_en || 'Unknown', c.orders, c.revenue, c.discounts || 0, c.commission || 0, totalRev > 0 ? ((c.revenue / totalRev) * 100).toFixed(1) : 0]);
    exportReport('Sales by Cashier', h, r, 'naqdi-by-cashier');
  });
}

// ============ CUSTOMER REPORT ============
async function renderCustomerReport(container) {
  const lang = window.i18n.getLang();

  const topRes = await window.daftrly.query(
    `SELECT c.id, c.name_ar, c.name_en, c.phone, c.loyalty_points, c.credit_balance,
     COUNT(s.id) as orders, COALESCE(SUM(s.total), 0) as spent
     FROM customers c LEFT JOIN sales s ON s.customer_id = c.id AND s.status = 'completed'
     WHERE c.is_active = 1 GROUP BY c.id ORDER BY spent DESC LIMIT 30`);
  const customers = topRes.success ? (topRes.data || []) : [];

  const debtRes = await window.daftrly.query(
    `SELECT c.id, c.name_ar, c.name_en, c.phone, c.credit_balance
     FROM customers c WHERE c.credit_balance > 0 AND c.is_active = 1 ORDER BY c.credit_balance DESC`);
  const debtors = debtRes.success ? (debtRes.data || []) : [];
  const totalDebt = debtors.reduce((s, d) => s + (d.credit_balance || 0), 0);

  container.innerHTML = `
    <div style="margin-top:12px;">
      <div style="margin-bottom:12px;">
        <button class="btn btn-secondary btn-sm" id="cust-rpt-print">🖨 ${lang === 'ar' ? 'طباعة' : 'Print'}</button>
        <button class="btn btn-secondary btn-sm" id="cust-rpt-export">📤 ${lang === 'ar' ? 'تصدير' : 'Export'}</button>
      </div>
      <div id="cust-rpt-printable" style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div>
        <div class="report-section-title">${lang === 'ar' ? '🏆 أكثر العملاء إنفاقاً' : '🏆 Top Customers by Spending'}</div>
        <div class="sales-table-wrap"><table class="data-table">
          <thead><tr>
            <th>#</th><th>${lang === 'ar' ? 'العميل' : 'Customer'}</th>
            <th>${lang === 'ar' ? 'الطلبات' : 'Orders'}</th><th>${lang === 'ar' ? 'الإنفاق' : 'Spent'}</th>
            <th>${lang === 'ar' ? 'النقاط' : 'Points'}</th>
          </tr></thead>
          <tbody>${customers.map((c, i) => {
            const name = lang === 'ar' ? c.name_ar : (c.name_en || c.name_ar);
            return `<tr><td>${i + 1}</td><td style="font-weight:600;">${_escR(name)}<br><span style="font-size:11px;color:var(--text-tertiary);">${c.phone || ''}</span></td><td>${c.orders}</td><td style="font-weight:700;">${formatCurrency(c.spent)}</td><td>⭐ ${c.loyalty_points || 0}</td></tr>`;
          }).join('') || `<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-tertiary);">${lang === 'ar' ? 'لا توجد بيانات' : 'No data'}</td></tr>`}</tbody>
        </table></div>
      </div>
      <div>
        <div class="report-section-title">${lang === 'ar' ? `💰 عملاء بديون — ${formatCurrency(totalDebt)}` : `💰 Customers with Debt — ${formatCurrency(totalDebt)}`}</div>
        <div class="sales-table-wrap"><table class="data-table">
          <thead><tr>
            <th>${lang === 'ar' ? 'العميل' : 'Customer'}</th><th>${lang === 'ar' ? 'الهاتف' : 'Phone'}</th>
            <th>${lang === 'ar' ? 'الدين' : 'Debt'}</th>
          </tr></thead>
          <tbody>${debtors.length === 0 ? `<tr><td colspan="3" style="text-align:center;padding:20px;color:var(--success);">✅ ${lang === 'ar' ? 'لا توجد ديون' : 'No debts'}</td></tr>` : debtors.map(c => {
            const name = lang === 'ar' ? c.name_ar : (c.name_en || c.name_ar);
            return `<tr><td style="font-weight:600;">${_escR(name)}</td><td>${c.phone || '—'}</td><td style="color:var(--danger);font-weight:700;">${formatCurrency(c.credit_balance)}</td></tr>`;
          }).join('')}</tbody>
        </table></div>
      </div>
    </div></div>
  `;
  container.querySelector('#cust-rpt-print')?.addEventListener('click', () => {
    const lang2 = window.i18n.getLang();
    printReport(lang2 === 'ar' ? 'تقرير العملاء' : 'Customer Report', container.querySelector('#cust-rpt-printable'));
  });
  container.querySelector('#cust-rpt-export')?.addEventListener('click', () => {
    const h = ['العميل / Customer', 'الهاتف / Phone', 'الطلبات / Orders', 'الإنفاق / Spent', 'النقاط / Points', 'الدين / Debt'];
    const r = customers.map(c => [c.name_ar || c.name_en, c.phone || '', c.orders || 0, c.spent || 0, c.loyalty_points || 0, c.credit_balance || 0]);
    exportReport('Customers', h, r, 'naqdi-customers');
  });
}

// ============ Z-REPORT (END OF DAY) ============
async function renderZReport(container) {
  const lang = window.i18n.getLang();
  const date = window._zDate || new Date().toISOString().split('T')[0];

  const salesRes = await window.daftrly.query(
    `SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total, COALESCE(SUM(tax_amount), 0) as tax,
     COALESCE(SUM(discount_amount), 0) as discounts, COALESCE(SUM(balance_due), 0) as credit
     FROM sales WHERE date(created_at) = ? AND status = 'completed'`, [date]);
  const s = salesRes.success && salesRes.data?.[0] ? salesRes.data[0] : { count: 0, total: 0, tax: 0, discounts: 0, credit: 0 };

  const payRes = await window.daftrly.query(
    `SELECT p.method, SUM(p.amount) as total FROM payments p JOIN sales sa ON p.sale_id = sa.id
     WHERE date(sa.created_at) = ? AND sa.status = 'completed' GROUP BY p.method`, [date]);
  const payments = payRes.success ? (payRes.data || []) : [];
  const cashPay = payments.find(p => p.method === 'cash')?.total || 0;
  const cardPay = payments.find(p => p.method === 'card')?.total || 0;

  const retRes = await window.daftrly.query(
    `SELECT COUNT(*) as count, COALESCE(SUM(total_refund), 0) as total FROM returns WHERE date(created_at) = ?`, [date]);
  const ret = retRes.success && retRes.data?.[0] ? retRes.data[0] : { count: 0, total: 0 };

  const sessRes = await window.daftrly.query(
    `SELECT opening_amount, closing_amount, expected_amount, difference FROM cash_sessions 
     WHERE date(opened_at) = ? ORDER BY id DESC LIMIT 1`, [date]);
  const sess = sessRes.success && sessRes.data?.[0] ? sessRes.data[0] : null;

  const expRes = await window.daftrly.query(
    `SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE date(created_at) = ?`, [date]);
  const expenses = expRes.success && expRes.data?.[0] ? expRes.data[0].total : 0;

  container.innerHTML = `
    <div style="margin-top:12px;">
      <div style="display:flex;gap:8px;margin-bottom:16px;align-items:center;">
        <input type="date" id="z-date" class="form-input" style="width:auto;font-size:12px;" value="${date}">
        <button class="btn btn-primary btn-sm" id="z-load">${lang === 'ar' ? 'عرض' : 'Load'}</button>
        <button class="btn btn-secondary btn-sm" id="z-print">🖨 ${lang === 'ar' ? 'طباعة' : 'Print'}</button>
      </div>

      <div id="z-printable" style="background:var(--bg-secondary);border:1px solid var(--border);border-radius:12px;padding:24px;max-width:500px;font-family:var(--font-mono);font-size:13px;">
        <div style="text-align:center;font-size:18px;font-weight:700;margin-bottom:4px;">${lang === 'ar' ? 'تقرير نهاية اليوم' : 'End of Day Report'}</div>
        <div style="text-align:center;color:var(--text-secondary);margin-bottom:16px;">${date}</div>
        
        <div style="border-top:1px dashed var(--border);padding-top:12px;">
          <div style="display:flex;justify-content:space-between;padding:3px 0;font-weight:700;">${lang === 'ar' ? 'المبيعات' : 'SALES'}<span>${s.count} ${lang === 'ar' ? 'فاتورة' : 'invoices'}</span></div>
          <div style="display:flex;justify-content:space-between;padding:3px 0;">${lang === 'ar' ? 'إجمالي المبيعات' : 'Total Sales'}<span style="font-weight:700;">${formatCurrency(s.total)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:3px 0;">${lang === 'ar' ? 'الخصومات' : 'Discounts'}<span style="color:var(--danger);">-${formatCurrency(s.discounts)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:3px 0;">${lang === 'ar' ? 'الضريبة' : 'VAT Collected'}<span>${formatCurrency(s.tax)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:3px 0;">${lang === 'ar' ? 'مبيعات آجلة' : 'Credit Sales'}<span>${formatCurrency(s.credit)}</span></div>
        </div>

        <div style="border-top:1px dashed var(--border);padding-top:12px;margin-top:8px;">
          <div style="display:flex;justify-content:space-between;padding:3px 0;font-weight:700;">${lang === 'ar' ? 'طرق الدفع' : 'PAYMENTS'}</div>
          <div style="display:flex;justify-content:space-between;padding:3px 0;">${lang === 'ar' ? 'نقدي' : 'Cash'}<span>${formatCurrency(cashPay)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:3px 0;">${lang === 'ar' ? 'بطاقة' : 'Card'}<span>${formatCurrency(cardPay)}</span></div>
        </div>

        <div style="border-top:1px dashed var(--border);padding-top:12px;margin-top:8px;">
          <div style="display:flex;justify-content:space-between;padding:3px 0;font-weight:700;">${lang === 'ar' ? 'المرتجعات' : 'RETURNS'}</div>
          <div style="display:flex;justify-content:space-between;padding:3px 0;">${ret.count} ${lang === 'ar' ? 'مرتجع' : 'returns'}<span style="color:var(--danger);">-${formatCurrency(ret.total)}</span></div>
        </div>

        <div style="border-top:1px dashed var(--border);padding-top:12px;margin-top:8px;">
          <div style="display:flex;justify-content:space-between;padding:3px 0;font-weight:700;">${lang === 'ar' ? 'المصروفات' : 'EXPENSES'}</div>
          <div style="display:flex;justify-content:space-between;padding:3px 0;">${lang === 'ar' ? 'إجمالي المصروفات' : 'Total Expenses'}<span style="color:var(--danger);">-${formatCurrency(expenses)}</span></div>
        </div>

        ${sess ? `
        <div style="border-top:1px dashed var(--border);padding-top:12px;margin-top:8px;">
          <div style="display:flex;justify-content:space-between;padding:3px 0;font-weight:700;">${lang === 'ar' ? 'الدرج' : 'CASH DRAWER'}</div>
          <div style="display:flex;justify-content:space-between;padding:3px 0;">${lang === 'ar' ? 'افتتاحي' : 'Opening'}<span>${formatCurrency(sess.opening_amount)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:3px 0;">${lang === 'ar' ? 'متوقع' : 'Expected'}<span>${formatCurrency(sess.expected_amount)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:3px 0;">${lang === 'ar' ? 'فعلي' : 'Actual'}<span>${formatCurrency(sess.closing_amount)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:3px 0;font-weight:700;color:${Number(sess.difference) === 0 ? 'var(--success)' : 'var(--danger)'};">${lang === 'ar' ? 'الفرق' : 'Difference'}<span>${Number(sess.difference) >= 0 ? '+' : ''}${formatCurrency(sess.difference)}</span></div>
        </div>` : ''}

        <div style="border-top:2px solid var(--border);padding-top:12px;margin-top:12px;">
          <div style="display:flex;justify-content:space-between;font-size:16px;font-weight:900;">
            ${lang === 'ar' ? 'صافي اليوم' : 'NET TODAY'}
            <span style="color:var(--success);">${formatCurrency(s.total - ret.total - expenses)}</span>
          </div>
        </div>
      </div>
    </div>
  `;
  container.querySelector('#z-load').addEventListener('click', () => {
    window._zDate = container.querySelector('#z-date').value;
    renderZReport(container);
  });
  container.querySelector('#z-print')?.addEventListener('click', () => {
    const lang2 = window.i18n.getLang();
    printReport(lang2 === 'ar' ? 'تقرير نهاية اليوم — ' + date : 'Z-Report — ' + date, container.querySelector('#z-printable'));
  });
}

// Override
window.renderReports = renderReportsEnhanced;

// ============ CREDIT/DEBIT NOTES REPORT ============
async function renderNotesReport(container) {
  const lang = window.i18n.getLang();
  const res = await window.daftrly.query(
    `SELECT cdn.*, c.name_ar as cust_name, c.phone as cust_phone, u.name_ar as created_by_name
     FROM credit_debit_notes cdn
     LEFT JOIN customers c ON cdn.customer_id = c.id
     LEFT JOIN users u ON cdn.created_by = u.id
     ORDER BY cdn.created_at DESC LIMIT 200`);
  const notes = res.success ? (res.data || []) : [];

  const totalCredits = notes.filter(n => n.note_type === 'credit' || n.note_type === 'supplier_credit').reduce((s, n) => s + n.amount, 0);
  const totalDebits = notes.filter(n => n.note_type === 'debit' || n.note_type === 'supplier_debit').reduce((s, n) => s + n.amount, 0);
  const creditCount = notes.filter(n => n.note_type === 'credit' || n.note_type === 'supplier_credit').length;
  const debitCount = notes.filter(n => n.note_type === 'debit' || n.note_type === 'supplier_debit').length;

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px;">
      <div style="background:var(--bg-secondary);padding:14px;border-radius:10px;text-align:center;">
        <div style="font-size:24px;font-weight:900;color:var(--success);">${creditCount}</div>
        <div style="font-size:11px;color:var(--text-secondary);">${lang === 'ar' ? 'إشعار دائن' : 'Credit Notes'}</div>
      </div>
      <div style="background:var(--bg-secondary);padding:14px;border-radius:10px;text-align:center;">
        <div style="font-size:24px;font-weight:900;color:var(--success);">${formatCurrency(totalCredits)}</div>
        <div style="font-size:11px;color:var(--text-secondary);">${lang === 'ar' ? 'إجمالي الدائن' : 'Total Credits'}</div>
      </div>
      <div style="background:var(--bg-secondary);padding:14px;border-radius:10px;text-align:center;">
        <div style="font-size:24px;font-weight:900;color:var(--warning);">${debitCount}</div>
        <div style="font-size:11px;color:var(--text-secondary);">${lang === 'ar' ? 'إشعار مدين' : 'Debit Notes'}</div>
      </div>
      <div style="background:var(--bg-secondary);padding:14px;border-radius:10px;text-align:center;">
        <div style="font-size:24px;font-weight:900;color:var(--warning);">${formatCurrency(totalDebits)}</div>
        <div style="font-size:11px;color:var(--text-secondary);">${lang === 'ar' ? 'إجمالي المدين' : 'Total Debits'}</div>
      </div>
    </div>

    ${notes.length === 0 ? `
      <div style="text-align:center;padding:40px;color:var(--text-tertiary);">
        <div style="font-size:48px;opacity:0.15;margin-bottom:12px;">📄</div>
        <div>${lang === 'ar' ? 'لا توجد إشعارات' : 'No notes yet'}</div>
      </div>
    ` : `
      <table class="data-table">
        <thead><tr>
          <th>${lang === 'ar' ? 'الرقم' : 'Note #'}</th>
          <th>${lang === 'ar' ? 'النوع' : 'Type'}</th>
          <th>${lang === 'ar' ? 'الفاتورة' : 'Invoice'}</th>
          <th>${lang === 'ar' ? 'المبلغ' : 'Amount'}</th>
          <th>${lang === 'ar' ? 'العميل' : 'Customer'}</th>
          <th>${lang === 'ar' ? 'السبب' : 'Reason'}</th>
          <th>${lang === 'ar' ? 'المعالجة' : 'Resolution'}</th>
          <th>${lang === 'ar' ? 'بواسطة' : 'By'}</th>
          <th>${lang === 'ar' ? 'التاريخ' : 'Date'}</th>
        </tr></thead>
        <tbody>
          ${notes.map(n => {
            const isCredit = n.note_type === 'credit' || n.note_type === 'supplier_credit';
            const isSupplier = n.note_type === 'supplier_credit' || n.note_type === 'supplier_debit';
            const typeLabels = {
              credit: `<span style="color:var(--success);">📄 ${lang === 'ar' ? 'دائن — عميل' : 'Credit — Customer'}</span>`,
              debit: `<span style="color:var(--warning);">📄 ${lang === 'ar' ? 'مدين — عميل' : 'Debit — Customer'}</span>`,
              supplier_credit: `<span style="color:var(--success);">📄 ${lang === 'ar' ? 'دائن — مورد' : 'Credit — Supplier'}</span>`,
              supplier_debit: `<span style="color:var(--warning);">📄 ${lang === 'ar' ? 'مدين — مورد' : 'Debit — Supplier'}</span>`,
            };
            const typeLabel = typeLabels[n.note_type] || n.note_type;
            const statusMap = { store_credit: lang === 'ar' ? '💳 رصيد دائن' : '💳 Store Credit', cash_refund: lang === 'ar' ? '💵 رد نقدي' : '💵 Cash Refund', outstanding: lang === 'ar' ? '⏳ معلق' : '⏳ Outstanding', standalone: lang === 'ar' ? '📋 مسجل' : '📋 Recorded' };
            const statusLabel = statusMap[n.status] || n.status || '—';
            return `<tr>
              <td style="font-family:var(--font-mono);font-weight:600;">${n.note_number}</td>
              <td>${typeLabel}</td>
              <td>${n.invoice_number}</td>
              <td style="font-weight:700;color:${isCredit ? 'var(--danger)' : 'var(--success)'};">${isCredit ? '-' : '+'}${formatCurrency(n.amount)}</td>
              <td>${n.cust_name || `<span style="color:var(--text-tertiary);">${lang === 'ar' ? 'بدون عميل' : 'No customer'}</span>`}</td>
              <td style="font-size:12px;">${window.escHtml(n.reason || '—')}</td>
              <td style="font-size:12px;">${statusLabel}</td>
              <td style="font-size:12px;">${n.created_by_name || '—'}</td>
              <td style="font-size:12px;">${n.created_at?.substring(0, 16) || ''}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    `}
  `;
}
