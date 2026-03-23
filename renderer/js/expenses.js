// ============================================
// NAQDI - MODULE 6A: EXPENSES
// Track business expenses
// ============================================

const EXPENSE_CATEGORIES = [
  { value: 'rent', ar: 'إيجار', en: 'Rent' },
  { value: 'salary', ar: 'رواتب', en: 'Salaries' },
  { value: 'utilities', ar: 'كهرباء ومياه', en: 'Utilities' },
  { value: 'supplies', ar: 'مستلزمات', en: 'Supplies' },
  { value: 'maintenance', ar: 'صيانة', en: 'Maintenance' },
  { value: 'transport', ar: 'نقل ومواصلات', en: 'Transport' },
  { value: 'marketing', ar: 'تسويق وإعلان', en: 'Marketing' },
  { value: 'telecom', ar: 'اتصالات وإنترنت', en: 'Telecom' },
  { value: 'insurance', ar: 'تأمين', en: 'Insurance' },
  { value: 'taxes', ar: 'ضرائب ورسوم', en: 'Taxes & Fees' },
  { value: 'other', ar: 'أخرى', en: 'Other' },
];

async function renderExpenses(container) {
  const lang = window.i18n.getLang();
  window.dbg('nav', 'Rendering Expenses page');

  const thisMonth = new Date().toISOString().substring(0, 7); // YYYY-MM

  container.innerHTML = `
    <div class="expenses-page slide-in">
      <div class="products-toolbar">
        <div class="products-search-wrap">
          <div class="products-search-icon">${window.icons.getIcon('search')}</div>
          <input type="text" id="exp-search" class="products-search" 
            placeholder="${lang === 'ar' ? 'ابحث في المصروفات...' : 'Search expenses...'}">
        </div>
        <div class="products-actions">
          <input type="month" id="exp-month" class="form-input btn-sm" value="${thisMonth}" style="width:160px;">
          ${window.hasPermission('expenses_add') ? `<button class="btn btn-primary btn-sm" id="btn-add-expense">
            ${window.icons.getIcon('plus')}
            <span>${lang === 'ar' ? 'مصروف جديد' : 'New Expense'}</span>
          </button>` : ''}
        </div>
      </div>

      <div class="sales-summary" id="exp-summary"></div>
      <div class="sales-table-wrap" id="exp-table"></div>
    </div>
    <div class="modal-overlay" id="modal-overlay" style="display:none">
      <div class="modal" id="modal-content"></div>
    </div>
  `;

  const addExpBtn = container.querySelector('#btn-add-expense');
  if (addExpBtn) addExpBtn.addEventListener('click', () => openExpenseModal(container, null));

  let searchTimer;
  container.querySelector('#exp-search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadExpensesList(container), 300);
  });

  container.querySelector('#exp-month').addEventListener('change', () => loadExpensesList(container));

  await loadExpensesList(container);
}

async function loadExpensesList(container) {
  const lang = window.i18n.getLang();
  const search = container.querySelector('#exp-search')?.value.trim() || '';
  const month = container.querySelector('#exp-month')?.value || '';

  let sql = 'SELECT * FROM expenses WHERE 1=1';
  const params = [];

  if (search) {
    sql += ' AND (category LIKE ? OR description LIKE ?)';
    const q = `%${search}%`;
    params.push(q, q);
  }
  if (month) {
    sql += ' AND strftime(\'%Y-%m\', created_at) = ?';
    params.push(month);
  }
  sql += ' ORDER BY created_at DESC LIMIT 200';

  const result = await window.daftrly.query(sql, params);
  const expenses = (result.success && result.data) ? result.data : [];
  window.dbg('load', `Expenses loaded: ${expenses.length}`);

  const totalAmount = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const catTotals = {};
  expenses.forEach(e => {
    catTotals[e.category] = (catTotals[e.category] || 0) + (e.amount || 0);
  });
  const topCat = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];

  const summaryEl = container.querySelector('#exp-summary');
  if (summaryEl) {
    const catLabel = topCat ? getCatLabel(topCat[0], lang) : '-';
    summaryEl.innerHTML = `
      <div class="stat-card"><div class="stat-card-label">${lang === 'ar' ? 'عدد المصروفات' : 'Expenses'}</div><div class="stat-card-value">${expenses.length}</div></div>
      <div class="stat-card"><div class="stat-card-label">${lang === 'ar' ? 'إجمالي المصروفات' : 'Total Expenses'}</div><div class="stat-card-value">${formatCurrency(totalAmount)}</div></div>
      <div class="stat-card"><div class="stat-card-label">${lang === 'ar' ? 'أعلى تصنيف' : 'Top Category'}</div><div class="stat-card-value" style="font-size:14px;">${catLabel}</div></div>
      <div class="stat-card"><div class="stat-card-label">${lang === 'ar' ? 'متوسط المصروف' : 'Average'}</div><div class="stat-card-value">${formatCurrency(expenses.length ? totalAmount / expenses.length : 0)}</div></div>
    `;
  }

  const tableEl = container.querySelector('#exp-table');
  if (!tableEl) return;

  if (expenses.length === 0) {
    tableEl.innerHTML = `<div class="empty-state" style="padding:40px"><div style="font-size:48px;opacity:0.15;margin-bottom:12px;">💰</div><div class="empty-state-title">${lang === 'ar' ? 'لا توجد مصروفات' : 'No expenses found'}</div></div>`;
    return;
  }

  tableEl.innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>${lang === 'ar' ? 'التاريخ' : 'Date'}</th>
        <th>${lang === 'ar' ? 'التصنيف' : 'Category'}</th>
        <th>${lang === 'ar' ? 'الوصف' : 'Description'}</th>
        <th>${lang === 'ar' ? 'المبلغ' : 'Amount'}</th>
        <th>${lang === 'ar' ? 'الدفع' : 'Payment'}</th>
        <th></th>
      </tr></thead>
      <tbody>
        ${expenses.map(e => `<tr>
          <td style="font-size:12px;">${e.created_at ? e.created_at.substring(0, 10) : '-'}</td>
          <td><span class="expense-cat-badge">${getCatLabel(e.category, lang)}</span></td>
          <td>${_escM(e.description || '-')}</td>
          <td style="font-weight:700;color:var(--danger);">${formatCurrency(e.amount)}</td>
          <td>${e.payment_method === 'cash' ? (lang === 'ar' ? 'نقدي' : 'Cash') : e.payment_method === 'card' ? (lang === 'ar' ? 'بطاقة' : 'Card') : (lang === 'ar' ? 'تحويل' : 'Transfer')}</td>
          <td>
            <div style="display:flex;gap:4px;justify-content:flex-end;">
              ${window.hasPermission('expenses_add') ? `<button class="btn-icon" data-action="edit-exp" data-id="${e.id}">✏️</button>` : ''}
              ${window.hasPermission('expenses_add') ? `<button class="btn-icon btn-icon-danger" data-action="delete-exp" data-id="${e.id}">🗑</button>` : ''}
            </div>
          </td>
        </tr>`).join('')}
      </tbody>
    </table>
  `;

  tableEl.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id);
      if (btn.dataset.action === 'edit-exp') {
        const r = await window.daftrly.query('SELECT * FROM expenses WHERE id = ?', [id]);
        if (r.success && r.data?.[0]) openExpenseModal(container, r.data[0]);
      } else if (btn.dataset.action === 'delete-exp') {
        const ok = await window.daftrlyConfirm(lang === 'ar' ? 'حذف هذا المصروف؟' : 'Delete this expense?');
        if (ok) {
          await window.daftrly.query('DELETE FROM expenses WHERE id = ?', [id]);
          window.dbg('save', `Expense ${id} deleted`);
          showToast(lang === 'ar' ? 'تم الحذف' : 'Deleted', 'success');
          loadExpensesList(container);
        }
      }
    });
  });
}

async function openExpenseModal(container, expense) {
  const lang = window.i18n.getLang();
  const isEdit = !!expense;
  const e = expense || {};
  const overlay = container.querySelector('#modal-overlay');
  const modal = container.querySelector('#modal-content');

  modal.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">${isEdit ? (lang === 'ar' ? 'تعديل المصروف' : 'Edit Expense') : (lang === 'ar' ? 'مصروف جديد' : 'New Expense')}</h3>
      <button class="modal-close" id="modal-close">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'التصنيف *' : 'Category *'}</label>
          <select id="e-category" class="form-input form-select">
            ${EXPENSE_CATEGORIES.map(c => `<option value="${c.value}" ${e.category === c.value ? 'selected' : ''}>${lang === 'ar' ? c.ar : c.en}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'المبلغ *' : 'Amount *'}</label>
          <input type="text" inputmode="decimal" id="e-amount" class="form-input" value="${e.amount || ''}" placeholder="0.00">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">${lang === 'ar' ? 'الوصف' : 'Description'}</label>
        <input type="text" id="e-desc" class="form-input" value="${_attrM(e.description || '')}" placeholder="${lang === 'ar' ? 'مثال: إيجار الشهر' : 'e.g. Monthly rent'}">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'طريقة الدفع' : 'Payment Method'}</label>
          <select id="e-payment" class="form-input form-select">
            <option value="cash" ${(e.payment_method || 'cash') === 'cash' ? 'selected' : ''}>${lang === 'ar' ? 'نقدي' : 'Cash'}</option>
            <option value="transfer" ${e.payment_method === 'transfer' ? 'selected' : ''}>${lang === 'ar' ? 'تحويل بنكي' : 'Bank Transfer'}</option>
            <option value="card" ${e.payment_method === 'card' ? 'selected' : ''}>${lang === 'ar' ? 'بطاقة' : 'Card'}</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'التاريخ' : 'Date'}</label>
          <input type="date" id="e-date" class="form-input" value="${e.created_at ? e.created_at.substring(0, 10) : new Date().toISOString().split('T')[0]}">
        </div>
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
    const amount = parseFloat(modal.querySelector('#e-amount').value) || 0;
    if (amount <= 0) { showToast(lang === 'ar' ? 'المبلغ مطلوب' : 'Amount is required', 'error'); return; }

    const data = {
      category: modal.querySelector('#e-category').value,
      amount,
      description: modal.querySelector('#e-desc').value.trim(),
      payment_method: modal.querySelector('#e-payment').value,
      date: modal.querySelector('#e-date').value,
    };

    window.dbg('save', `Expense ${isEdit ? 'update' : 'create'}`, data);

    let result;
    if (isEdit) {
      result = await window.daftrly.query(
        'UPDATE expenses SET category=?, amount=?, description=?, payment_method=?, created_at=? WHERE id=?',
        [data.category, data.amount, data.description, data.payment_method, data.date + 'T00:00:00', e.id]);
    } else {
      result = await window.daftrly.query(
        'INSERT INTO expenses (category, amount, description, payment_method, created_at) VALUES (?,?,?,?,?)',
        [data.category, data.amount, data.description, data.payment_method, data.date + 'T00:00:00']);
    }

    if (result.success) {
      window.dbg('success', `Expense ${isEdit ? 'updated' : 'created'}`);
      showToast(lang === 'ar' ? (isEdit ? 'تم التحديث' : 'تمت الإضافة') : (isEdit ? 'Updated' : 'Added'), 'success');
      close();
      loadExpensesList(container);
    } else {
      window.dbg('error', 'Expense save failed', result.error);
    }
  });
}

function getCatLabel(value, lang) {
  const cat = EXPENSE_CATEGORIES.find(c => c.value === value);
  return cat ? (lang === 'ar' ? cat.ar : cat.en) : value;
}

function _escM(s) { return window.escHtml(s); }
function _attrM(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;') : ''; }

window.renderExpenses = renderExpenses;
