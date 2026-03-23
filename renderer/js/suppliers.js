// ============================================
// NAQDI - MODULE 6B: SUPPLIERS
// Supplier database with CRUD
// ============================================

async function renderSuppliers(container) {
  const lang = window.i18n.getLang();
  window.dbg('nav', 'Rendering Suppliers page');

  container.innerHTML = `
    <div class="customers-page slide-in">
      <div class="products-toolbar">
        <div class="products-search-wrap">
          <div class="products-search-icon">${window.icons.getIcon('search')}</div>
          <input type="text" id="sup-search" class="products-search" 
            placeholder="${lang === 'ar' ? 'ابحث عن مورد...' : 'Search suppliers...'}">
        </div>
        <div class="products-actions">
          <button class="btn btn-primary btn-sm" id="btn-add-supplier">
            ${window.icons.getIcon('plus')}
            <span>${lang === 'ar' ? 'مورد جديد' : 'New Supplier'}</span>
          </button>
        </div>
      </div>
      <div class="customers-list" id="suppliers-list"></div>
    </div>
    <div class="modal-overlay" id="modal-overlay" style="display:none">
      <div class="modal" id="modal-content"></div>
    </div>
  `;

  container.querySelector('#btn-add-supplier').addEventListener('click', () => openSupplierModal(container, null));

  let searchTimer;
  container.querySelector('#sup-search').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadSuppliersList(container, e.target.value.trim()), 300);
  });

  await loadSuppliersList(container, '');
}

async function loadSuppliersList(container, search) {
  const lang = window.i18n.getLang();
  let sql = `SELECT s.*, 
    COALESCE((SELECT SUM(po.total) FROM purchase_orders po WHERE po.supplier_id=s.id AND po.status='received'),0) as total_purchases,
    COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.supplier_id=s.id),0) as total_paid
    FROM suppliers s WHERE s.is_active = 1`;
  const params = [];
  if (search) {
    sql += ' AND (s.name_ar LIKE ? OR s.name_en LIKE ? OR s.phone LIKE ?)';
    const q = `%${search}%`;
    params.push(q, q, q);
  }
  sql += ' ORDER BY s.name_ar';

  const result = await window.daftrly.query(sql, params);
  const suppliers = (result.success && result.data) ? result.data : [];
  window.dbg('load', `Suppliers loaded: ${suppliers.length}`);

  const listEl = container.querySelector('#suppliers-list');
  if (!listEl) return;

  if (suppliers.length === 0) {
    listEl.innerHTML = `<div class="empty-state" style="padding:40px"><div style="font-size:48px;opacity:0.15;margin-bottom:12px;">🏭</div><div class="empty-state-title">${search ? (lang === 'ar' ? 'لا توجد نتائج' : 'No results') : (lang === 'ar' ? 'لا يوجد موردين بعد' : 'No suppliers yet')}</div></div>`;
    return;
  }

  listEl.innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>${lang === 'ar' ? 'الاسم' : 'Name'}</th>
        <th>${lang === 'ar' ? 'الهاتف' : 'Phone'}</th>
        <th>${lang === 'ar' ? 'إجمالي المشتريات' : 'Total Purchases'}</th>
        <th>${lang === 'ar' ? 'المدفوع' : 'Paid'}</th>
        <th>${lang === 'ar' ? 'الرصيد المستحق' : 'Balance Due'}</th>
        <th></th>
      </tr></thead>
      <tbody>
        ${suppliers.map(s => {
          const balance = (s.total_purchases || 0) - (s.total_paid || 0);
          return `<tr>
          <td class="td-name">${_escS(lang === 'ar' ? s.name_ar : (s.name_en || s.name_ar))}</td>
          <td>${_escS(s.phone || '-')}</td>
          <td>${formatCurrency(s.total_purchases || 0)}</td>
          <td style="color:var(--success);">${formatCurrency(s.total_paid || 0)}</td>
          <td style="font-weight:700;color:${balance > 0.01 ? 'var(--danger)' : 'var(--success)'};">${formatCurrency(Math.max(0, balance))}</td>
          <td>
            <div style="display:flex;gap:4px;justify-content:flex-end;">
              <button class="btn-icon" data-action="edit-sup" data-id="${s.id}">✏️</button>
              <button class="btn-icon btn-icon-danger" data-action="delete-sup" data-id="${s.id}">🗑</button>
            </div>
          </td>
        </tr>`;}).join('')}
      </tbody>
    </table>
  `;

  listEl.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.id);
      if (btn.dataset.action === 'edit-sup') {
        const r = await window.daftrly.query('SELECT * FROM suppliers WHERE id = ?', [id]);
        if (r.success && r.data?.[0]) openSupplierModal(container, r.data[0]);
      } else if (btn.dataset.action === 'delete-sup') {
        const ok = await window.daftrlyConfirm(lang === 'ar' ? 'حذف هذا المورد؟' : 'Delete this supplier?');
        if (ok) {
          await window.daftrly.query('UPDATE suppliers SET is_active = 0 WHERE id = ?', [id]);
          window.dbg('save', `Supplier ${id} deleted`);
          showToast(lang === 'ar' ? 'تم الحذف' : 'Deleted', 'success');
          loadSuppliersList(container, container.querySelector('#sup-search')?.value || '');
        }
      }
    });
  });
}

async function openSupplierModal(container, supplier) {
  const lang = window.i18n.getLang();
  const isEdit = !!supplier;
  const s = supplier || {};
  const overlay = container.querySelector('#modal-overlay');
  const modal = container.querySelector('#modal-content');

  modal.innerHTML = `
    <div class="modal-header">
      <h3 class="modal-title">${isEdit ? (lang === 'ar' ? 'تعديل المورد' : 'Edit Supplier') : (lang === 'ar' ? 'مورد جديد' : 'New Supplier')}</h3>
      <button class="modal-close" id="modal-close">✕</button>
    </div>
    <div class="modal-body">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'الاسم (عربي) *' : 'Name (Arabic) *'}</label>
          <input type="text" id="s-name-ar" class="form-input" value="${_attrS(s.name_ar || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'الاسم (إنجليزي)' : 'Name (English)'}</label>
          <input type="text" id="s-name-en" class="form-input" value="${_attrS(s.name_en || '')}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'الهاتف' : 'Phone'}</label>
          <input type="tel" id="s-phone" class="form-input" value="${_attrS(s.phone || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'البريد الإلكتروني' : 'Email'}</label>
          <input type="email" id="s-email" class="form-input" value="${_attrS(s.email || '')}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'الرقم الضريبي' : 'VAT Number'}</label>
          <input type="text" id="s-vat" class="form-input" value="${_attrS(s.vat_number || '')}">
        </div>
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'شروط الدفع' : 'Payment Terms'}</label>
          <select id="s-terms" class="form-input form-select">
            <option value="" ${!s.payment_terms ? 'selected' : ''}>${lang === 'ar' ? 'غير محدد' : 'Not specified'}</option>
            <option value="cash" ${s.payment_terms === 'cash' ? 'selected' : ''}>${lang === 'ar' ? 'نقدي فوري' : 'Cash on delivery'}</option>
            <option value="net15" ${s.payment_terms === 'net15' ? 'selected' : ''}>${lang === 'ar' ? 'صافي 15 يوم' : 'Net 15 days'}</option>
            <option value="net30" ${s.payment_terms === 'net30' ? 'selected' : ''}>${lang === 'ar' ? 'صافي 30 يوم' : 'Net 30 days'}</option>
            <option value="net60" ${s.payment_terms === 'net60' ? 'selected' : ''}>${lang === 'ar' ? 'صافي 60 يوم' : 'Net 60 days'}</option>
          </select>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">${lang === 'ar' ? 'العنوان' : 'Address'}</label>
        <input type="text" id="s-address" class="form-input" value="${_attrS(s.address || '')}">
      </div>
      <div class="form-group">
        <label class="form-label">${lang === 'ar' ? 'ملاحظات' : 'Notes'}</label>
        <textarea id="s-notes" class="form-input form-textarea" rows="2">${_escS(s.notes || '')}</textarea>
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
    const nameAr = modal.querySelector('#s-name-ar').value.trim();
    if (!nameAr) { showToast(lang === 'ar' ? 'الاسم مطلوب' : 'Name is required', 'error'); return; }

    const data = [nameAr, modal.querySelector('#s-name-en').value.trim() || null,
      modal.querySelector('#s-phone').value.trim() || null, modal.querySelector('#s-email').value.trim() || null,
      modal.querySelector('#s-vat').value.trim() || null, modal.querySelector('#s-address').value.trim() || null,
      modal.querySelector('#s-terms').value || null, modal.querySelector('#s-notes').value.trim() || null];

    window.dbg('save', `Supplier ${isEdit ? 'update' : 'create'}: ${nameAr}`);

    let result;
    if (isEdit) {
      result = await window.daftrly.query(
        'UPDATE suppliers SET name_ar=?, name_en=?, phone=?, email=?, vat_number=?, address=?, payment_terms=?, notes=? WHERE id=?',
        [...data, s.id]);
    } else {
      result = await window.daftrly.query(
        'INSERT INTO suppliers (name_ar, name_en, phone, email, vat_number, address, payment_terms, notes) VALUES (?,?,?,?,?,?,?,?)', data);
    }

    if (result.success) {
      window.dbg('success', `Supplier ${isEdit ? 'updated' : 'created'}`);
      showToast(lang === 'ar' ? (isEdit ? 'تم التحديث' : 'تمت الإضافة') : (isEdit ? 'Updated' : 'Added'), 'success');
      close();
      loadSuppliersList(container, '');
    } else {
      window.dbg('error', 'Supplier save failed', result.error);
    }
  });
}

function _escS(s) { return window.escHtml(s); }
function _attrS(s) { return s ? String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;') : ''; }

window.renderSuppliers = renderSuppliers;
