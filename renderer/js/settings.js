// ============================================
// NAQDI - MODULE 2: SETTINGS PANEL
// The merchant's control center
// ============================================

// Help box helper — shows contextual info at top of settings sections
function settingsHelpBox(ar, en, exAr, exEn) {
  const lang = window.i18n?.getLang() || 'ar';
  return `<div style="background:rgba(37,99,235,0.08);border:1px solid rgba(37,99,235,0.2);border-radius:10px;padding:14px 16px;margin-bottom:20px;font-size:13px;line-height:1.7;">
    <div style="color:var(--text-primary);">${lang === 'ar' ? ar : en}</div>
    ${exAr ? `<div style="color:var(--text-tertiary);font-size:12px;margin-top:6px;">💡 ${lang === 'ar' ? exAr : exEn}</div>` : ''}
  </div>`;
}

let settingsActiveTab = 'business';

async function renderSettings(container) {
  const lang = window.i18n.getLang();
  window.dbg('load', 'Settings page: fetching all settings...');
  const allSettings = await window.daftrly.getSettings();
  window.dbg('load', 'Settings loaded', { keys: Object.keys(allSettings), business: allSettings.business || '(missing)' });

  const tabs = [
    { id: 'business', icon: 'user', labelAr: 'النشاط التجاري', labelEn: 'Business Info' },
    { id: 'vat', icon: 'receipt', labelAr: 'ضريبة القيمة المضافة', labelEn: 'VAT Settings', perm: 'settings_access' },
    { id: 'zakat', icon: 'receipt', labelAr: 'إعدادات الزكاة', labelEn: 'Zakat Settings', perm: 'settings_access' },
    { id: 'invoice', icon: 'receipt', labelAr: 'تنسيق الفاتورة', labelEn: 'Invoice Format', perm: 'settings_access' },
    { id: 'returns', icon: 'receipt', labelAr: 'المرتجعات والخصومات', labelEn: 'Returns & Discounts', perm: 'settings_access' },
    { id: 'coupons', icon: 'receipt', labelAr: 'كوبونات الخصم', labelEn: 'Discount Coupons', perm: 'settings_access' },
    { id: 'promotions', icon: 'receipt', labelAr: 'العروض والتخفيضات', labelEn: 'Promotions & Offers', perm: 'settings_access' },
    { id: 'gift_cards', icon: 'receipt', labelAr: 'بطاقات الهدايا', labelEn: 'Gift Cards', perm: 'settings_access' },
    { id: 'price_lists', icon: 'receipt', labelAr: 'قوائم الأسعار', labelEn: 'Price Lists', perm: 'settings_access' },
    { id: 'packages', icon: 'receipt', labelAr: 'باقات الاشتراك', labelEn: 'Packages', perm: 'settings_access' },
    { id: 'plu', icon: 'receipt', labelAr: 'باركود الوزن (PLU)', labelEn: 'PLU Barcode', perm: 'settings_access' },
    { id: 'loyalty', icon: 'customers', labelAr: 'برنامج الولاء', labelEn: 'Loyalty Program', perm: 'settings_access' },
    { id: 'branches', icon: 'settings', labelAr: 'الفروع', labelEn: 'Branches', perm: 'settings_access' },
    { id: 'display', icon: 'settings', labelAr: 'العرض واللغة', labelEn: 'Display & Language' },
    { id: 'printer', icon: 'receipt', labelAr: 'الطابعة', labelEn: 'Printer' },
    { id: 'terminal', icon: 'pos', labelAr: 'جهاز الدفع', labelEn: 'Payment Terminal', perm: 'settings_access' },
    { id: 'zatca', icon: 'receipt', labelAr: 'الفوترة الإلكترونية', labelEn: 'E-Invoicing (ZATCA)', perm: 'settings_access' },
    { id: 'qoyod', icon: 'receipt', labelAr: 'ربط المحاسبة (قيود)', labelEn: 'Accounting (Qoyod)', perm: 'settings_access' },
    { id: 'backup', icon: 'settings', labelAr: 'النسخ الاحتياطي', labelEn: 'Backup', perm: 'backup_access' },
    { id: 'stock_adjust', icon: 'products', labelAr: 'تعديل المخزون', labelEn: 'Stock Adjustment', perm: 'settings_access' },
    { id: 'peer_sync', icon: 'settings', labelAr: 'مزامنة الأجهزة', labelEn: 'Device Sync', perm: 'settings_access' },
    { id: 'data_manage', icon: 'settings', labelAr: 'إدارة البيانات', labelEn: 'Data Management', perm: 'settings_access' },
    { id: 'users', icon: 'customers', labelAr: 'المستخدمين', labelEn: 'Users', perm: 'users_manage' },
    { id: 'license', icon: 'settings', labelAr: 'الترخيص', labelEn: 'License' },
  ].filter(tab => !tab.perm || window.hasPermission(tab.perm));

  container.innerHTML = `
    <div class="settings-layout slide-in">
      <div class="settings-sidebar">
        ${tabs.map(tab => `
          <div class="settings-tab ${settingsActiveTab === tab.id ? 'active' : ''}" data-tab="${tab.id}">
            <div class="nav-item-icon">${window.icons.getIcon(tab.icon)}</div>
            <span>${lang === 'ar' ? tab.labelAr : tab.labelEn}</span>
          </div>
        `).join('')}
      </div>
      <div class="settings-content" id="settings-content"></div>
    </div>
  `;

  // Bind tab clicks
  container.querySelectorAll('.settings-tab').forEach(tab => {
    tab.addEventListener('click', async () => {
      settingsActiveTab = tab.dataset.tab;
      container.querySelectorAll('.settings-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      window.dbg('nav', `Settings tab switched to: ${settingsActiveTab}`);
      window.dbg('load', 'Re-fetching settings from disk...');
      const freshSettings = await window.daftrly.getSettings();
      window.dbg('load', 'Fresh settings loaded', { 
        business: freshSettings.business || '(missing)', 
        vat_rate: freshSettings.vat?.rate,
        theme: freshSettings.theme 
      });
      renderSettingsTab(document.getElementById('settings-content'), settingsActiveTab, freshSettings);
    });
  });

  // Render active tab
  renderSettingsTab(document.getElementById('settings-content'), settingsActiveTab, allSettings);
}

function renderSettingsTab(container, tabId, allSettings) {
  switch (tabId) {
    case 'business': renderBusinessSettings(container, allSettings); break;
    case 'vat': renderVatSettings(container, allSettings); break;
    case 'zakat': renderZakatSettings(container, allSettings); break;
    case 'invoice': renderInvoiceFormatSettings(container, allSettings); break;
    case 'returns': renderReturnsSettings(container, allSettings); break;
    case 'coupons': renderCouponsSettings(container); break;
    case 'promotions': renderPromotionsSettings(container); break;
    case 'gift_cards': renderGiftCardSettings(container); break;
    case 'price_lists': renderPriceListSettings(container); break;
    case 'packages': renderPackageSettings(container); break;
    case 'plu': renderPLUSettings(container, allSettings); break;
    case 'loyalty': renderLoyaltySettings(container, allSettings); break;
    case 'branches': renderBranchSettings(container, allSettings); break;
    case 'display': renderDisplaySettings(container, allSettings); break;
    case 'printer': renderPrinterSettings(container, allSettings); break;
    case 'terminal': renderTerminalSettings(container, allSettings); break;
    case 'zatca': renderZatcaSettings(container, allSettings); break;
    case 'qoyod': renderQoyodSettings(container, allSettings); break;
    case 'backup': renderBackupSettings(container, allSettings); break;
    case 'stock_adjust': renderStockAdjustment(container, allSettings); break;
    case 'peer_sync': renderPeerSyncSettings(container, allSettings); break;
    case 'data_manage': renderDataManagement(container, allSettings); break;
    case 'users': renderUserManagement(container); break;
    case 'license': renderLicenseSettings(container, allSettings); break;
    default: renderBusinessSettings(container, allSettings);
  }
}

// ============ HELPER: Create form field ============
function field(id, labelAr, labelEn, value, type, opts = {}) {
  const lang = window.i18n.getLang();
  const label = lang === 'ar' ? labelAr : labelEn;

  if (type === 'toggle') {
    return `
      <div class="settings-field toggle-field">
        <div class="field-info">
          <label class="form-label">${label}</label>
          ${opts.descAr ? `<div class="field-desc">${lang === 'ar' ? opts.descAr : opts.descEn}</div>` : ''}
        </div>
        <label class="toggle">
          <input type="checkbox" id="${id}" ${value ? 'checked' : ''}>
          <span class="toggle-slider"></span>
        </label>
      </div>
    `;
  }

  if (type === 'select') {
    return `
      <div class="settings-field">
        <label class="form-label" for="${id}">${label}</label>
        <select id="${id}" class="form-input form-select">
          ${opts.options.map(o => `<option value="${o.value}" ${String(value) === String(o.value) ? 'selected' : ''}>${lang === 'ar' ? o.labelAr : o.labelEn}</option>`).join('')}
        </select>
        ${opts.descAr ? `<div class="field-desc">${lang === 'ar' ? opts.descAr : opts.descEn}</div>` : ''}
      </div>
    `;
  }

  if (type === 'textarea') {
    return `
      <div class="settings-field">
        <label class="form-label" for="${id}">${label}</label>
        <textarea id="${id}" class="form-input form-textarea" rows="${opts.rows || 3}" placeholder="${opts.placeholder || ''}">${value || ''}</textarea>
      </div>
    `;
  }

  return `
    <div class="settings-field">
      <label class="form-label" for="${id}">${label}</label>
      <input type="${type || 'text'}" id="${id}" class="form-input" value="${value || ''}" placeholder="${opts.placeholder || ''}">
      ${opts.descAr ? `<div class="field-desc">${lang === 'ar' ? opts.descAr : opts.descEn}</div>` : ''}
    </div>
  `;
}

function settingsHeader(titleAr, titleEn, descAr, descEn) {
  const lang = window.i18n.getLang();
  return `
    <div class="settings-header">
      <h2 class="settings-title">${lang === 'ar' ? titleAr : titleEn}</h2>
      <p class="settings-desc">${lang === 'ar' ? descAr : descEn}</p>
    </div>
  `;
}

function saveButton() {
  const lang = window.i18n.getLang();
  return `<div class="settings-actions"><button class="btn btn-primary" id="settings-save-btn">${lang === 'ar' ? 'حفظ التغييرات' : 'Save Changes'}</button></div>`;
}

// ============ BUSINESS INFO ============
function renderBusinessSettings(container, s) {
  const biz = s.business || {};
  container.innerHTML = `
    <div class="settings-page fade-in">
      ${settingsHeader('معلومات النشاط التجاري', 'Business Information', 'بيانات نشاطك التجاري التي تظهر على الفواتير والإيصالات', 'Your business details shown on invoices and receipts')}
      <div class="settings-form">
        <div class="settings-row">
          ${field('biz-name-ar', 'اسم النشاط (عربي)', 'Business Name (Arabic)', biz.nameAr, 'text', { placeholder: 'مثال: مؤسسة النور التجارية' })}
          ${field('biz-name-en', 'اسم النشاط (إنجليزي)', 'Business Name (English)', biz.nameEn, 'text', { placeholder: 'e.g. Al Noor Trading Est.' })}
        </div>
        <div class="settings-row">
          ${field('biz-cr', 'رقم السجل التجاري', 'Commercial Registration #', biz.crNumber, 'text', { placeholder: '1010XXXXXX' })}
          ${field('biz-vat', 'الرقم الضريبي (VAT)', 'VAT Registration Number', biz.vatNumber, 'text', { placeholder: '3XXXXXXXXXX0003' })}
        </div>
        <div class="settings-row">
          ${field('biz-phone', 'رقم الهاتف', 'Phone', biz.phone, 'tel', { placeholder: '05XXXXXXXX' })}
          ${field('biz-email', 'البريد الإلكتروني', 'Email', biz.email, 'email', { placeholder: 'info@example.com' })}
        </div>
        ${field('biz-address', 'العنوان', 'Address', biz.address, 'text', { placeholder: window.i18n.getLang() === 'ar' ? 'المدينة، الحي، الشارع' : 'City, District, Street' })}
        ${field('biz-footer', 'نص أسفل الفاتورة', 'Invoice Footer Text', biz.footerText, 'textarea', { rows: 2, placeholder: window.i18n.getLang() === 'ar' ? 'مثال: شكراً لزيارتكم' : 'e.g. Thank you for your visit' })}
        
        <div class="settings-field">
          <label class="form-label">${window.i18n.getLang() === 'ar' ? 'شعار النشاط' : 'Business Logo'}</label>
          <div class="logo-upload" id="logo-upload">
            <div class="logo-preview" id="logo-preview">
              ${biz.logo ? '<img id="logo-img" alt="Logo">' : `<span class="logo-placeholder">${window.i18n.getLang() === 'ar' ? 'اضغط لإضافة الشعار' : 'Click to add logo'}</span>`}
            </div>
            <input type="file" id="logo-file" accept=".png,.jpg,.jpeg,.webp,.svg" style="display:none">
          </div>
          <div class="field-desc">${window.i18n.getLang() === 'ar' ? 'سيظهر على الفواتير والإيصالات المطبوعة' : 'Will appear on printed invoices and receipts'}</div>
        </div>

        ${saveButton()}
      </div>
    </div>
  `;

  // Set logo src via DOM (avoids base64 breaking innerHTML template)
  if (biz.logo) {
    const logoImg = container.querySelector('#logo-img');
    if (logoImg) {
      logoImg.src = biz.logo;
      window.dbg('load', 'Logo loaded from saved data', { length: biz.logo.length });
    }
  }

  // Logo upload handler
  const logoUpload = container.querySelector('#logo-upload');
  const logoFile = container.querySelector('#logo-file');
  const LOGO_MAX_SIZE = 2 * 1024 * 1024; // 2MB raw file limit
  const LOGO_MAX_PX = 512; // resize to max 512x512
  const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/svg+xml'];

  logoUpload.addEventListener('click', (e) => {
    if (e.target !== logoFile) logoFile.click();
  });
  logoFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate type
    if (!LOGO_TYPES.includes(file.type)) {
      window.dbg('warn', 'Logo rejected: invalid type', { type: file.type });
      showToast(window.i18n.getLang() === 'ar' 
        ? 'نوع الملف غير مدعوم. استخدم PNG أو JPG أو WebP' 
        : 'File type not supported. Use PNG, JPG, or WebP', 'error');
      logoFile.value = '';
      return;
    }

    // Validate size
    if (file.size > LOGO_MAX_SIZE) {
      window.dbg('warn', 'Logo rejected: too large', { size: file.size, max: LOGO_MAX_SIZE });
      showToast(window.i18n.getLang() === 'ar' 
        ? 'حجم الصورة كبير جداً. الحد الأقصى 2 ميجابايت' 
        : 'Image too large. Maximum 2MB', 'error');
      logoFile.value = '';
      return;
    }

    // Read and auto-resize
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        if (w > LOGO_MAX_PX || h > LOGO_MAX_PX) {
          if (w > h) { h = Math.round(h * LOGO_MAX_PX / w); w = LOGO_MAX_PX; }
          else { w = Math.round(w * LOGO_MAX_PX / h); h = LOGO_MAX_PX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const resized = canvas.toDataURL('image/png', 0.9);

        const preview = container.querySelector('#logo-preview');
        preview.innerHTML = '<img alt="Logo">';
        preview.querySelector('img').src = resized;
        preview.dataset.logoData = resized;
        window.dbg('ui', 'Logo uploaded & resized', { 
          original: `${img.width}x${img.height} (${file.size} bytes)`, 
          resized: `${w}x${h} (${resized.length} chars base64)` 
        });
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });

  // Save handler
  container.querySelector('#settings-save-btn').addEventListener('click', async () => {
    const logoData = container.querySelector('#logo-preview').dataset.logoData || biz.logo || '';
    const data = {
      nameAr: container.querySelector('#biz-name-ar').value,
      nameEn: container.querySelector('#biz-name-en').value,
      crNumber: container.querySelector('#biz-cr').value,
      vatNumber: container.querySelector('#biz-vat').value,
      phone: container.querySelector('#biz-phone').value,
      email: container.querySelector('#biz-email').value,
      address: container.querySelector('#biz-address').value,
      footerText: container.querySelector('#biz-footer').value,
      logo: logoData ? '(base64 image)' : '',
    };
    window.dbg('save', 'Business: saving...', data);
    const result = await window.daftrly.setSetting('business', {
      nameAr: container.querySelector('#biz-name-ar').value,
      nameEn: container.querySelector('#biz-name-en').value,
      crNumber: container.querySelector('#biz-cr').value,
      vatNumber: container.querySelector('#biz-vat').value,
      phone: container.querySelector('#biz-phone').value,
      email: container.querySelector('#biz-email').value,
      address: container.querySelector('#biz-address').value,
      footerText: container.querySelector('#biz-footer').value,
      logo: logoData,
    });
    window.dbg('save', `Business: setSetting returned: ${result}`);
    // Verify by re-reading
    const verify = await window.daftrly.getSettings();
    window.dbg('save', 'Business: verify after save', verify.business);
    showToast(window.i18n.getLang() === 'ar' ? 'تم حفظ بيانات النشاط' : 'Business info saved', 'success');
  });
}

// ============ VAT SETTINGS ============
function renderVatSettings(container, s) {
  const vat = s.vat || {};
  const biz = s.business || {};
  const bizVatNumber = biz.vatNumber || '';
  const lang = window.i18n.getLang();
  container.innerHTML = `
    <div class="settings-page fade-in">
      ${settingsHeader('إعدادات ضريبة القيمة المضافة', 'VAT Settings', 'تكوين حساب الضريبة على فواتيرك', 'Configure tax calculation on your invoices')}
      ${settingsHelpBox(
        'ضريبة القيمة المضافة (VAT) تُضاف على جميع المبيعات. النسبة الحالية في السعودية 15%. اختر إذا كانت أسعارك شاملة أو مضافة.',
        'VAT is added to all sales. Current Saudi rate is 15%. Choose whether your prices include or exclude VAT.',
        'شاملة: السعر 115 ر.س = المنتج 100 + ضريبة 15. مضافة: السعر 100 + ضريبة 15 = العميل يدفع 115',
        'Inclusive: Price 115 SAR = product 100 + tax 15. Exclusive: Price 100 + tax 15 = customer pays 115'
      )}
      <div class="settings-form">
        ${field('vat-enabled', 'تفعيل الضريبة', 'Enable VAT', vat.enabled, 'toggle', { descAr: 'تطبيق الضريبة على المبيعات', descEn: 'Apply tax on sales' })}
        ${field('vat-rate', 'نسبة الضريبة %', 'VAT Rate %', vat.rate || 15, 'number', { descAr: 'النسبة الحالية في السعودية: 15%', descEn: 'Current Saudi rate: 15%' })}
        ${field('vat-inclusive', 'الأسعار شاملة الضريبة', 'Prices are VAT inclusive', vat.inclusive, 'toggle', { descAr: 'السعر المعروض يشمل الضريبة', descEn: 'Displayed price includes VAT' })}
        <div class="settings-field">
          <label class="form-label" for="vat-reg">${lang === 'ar' ? 'الرقم الضريبي' : 'VAT Registration Number'}</label>
          <input type="text" id="vat-reg" class="form-input" value="${bizVatNumber}" readonly style="background:var(--bg-tertiary);cursor:not-allowed;opacity:0.8;">
          <div class="field-desc">${lang === 'ar' ? 'يتم جلبه تلقائياً من معلومات النشاط التجاري. لتعديله، اذهب إلى إعدادات معلومات النشاط التجاري.' : 'Automatically synced from Business Info. To change it, go to Business Info settings.'}</div>
        </div>
        ${saveButton()}
      </div>
    </div>
  `;

  container.querySelector('#settings-save-btn').addEventListener('click', async () => {
    // Always sync VAT registration number from Business Info
    const latestSettings = await window.daftrly.getSettings();
    const latestBizVat = (latestSettings.business?.vatNumber || '').trim();
    const data = {
      enabled: container.querySelector('#vat-enabled').checked,
      rate: parseFloat(container.querySelector('#vat-rate').value) || 15,
      inclusive: container.querySelector('#vat-inclusive').checked,
      registrationNumber: latestBizVat,
    };
    window.dbg('save', 'VAT: saving...', data);
    const result = await window.daftrly.setSetting('vat', data);
    window.appSettings = await window.daftrly.getSettings();
    window.dbg('save', `VAT: setSetting returned: ${result}`);
    showToast(window.i18n.getLang() === 'ar' ? 'تم حفظ إعدادات الضريبة' : 'VAT settings saved', 'success');
  });
}

// ============ ZAKAT SETTINGS ============
function renderZakatSettings(container, s) {
  const zakat = s.zakat || {};
  container.innerHTML = `
    <div class="settings-page fade-in">
      ${settingsHeader('إعدادات الزكاة', 'Zakat Settings', 'إعداد حساب الزكاة لنشاطك التجاري', 'Configure Zakat calculation for your business')}
      <div class="settings-form">
        ${field('zakat-enabled', 'تفعيل حساب الزكاة', 'Enable Zakat Calculation', zakat.enabled, 'toggle', { descAr: 'حساب تقديري للزكاة بناءً على الأرباح', descEn: 'Estimate Zakat based on profits and net assets' })}
        ${field('zakat-rate', 'نسبة الزكاة %', 'Zakat Rate %', zakat.rate || 2.5, 'number', { descAr: 'النسبة الشرعية: 2.5%', descEn: 'Standard Islamic rate: 2.5%' })}
        ${field('zakat-fiscal', 'بداية السنة المالية', 'Fiscal Year Start', zakat.fiscalYearStart || '01-01', 'select', {
          options: [
            { value: '01-01', labelAr: '1 يناير (ميلادي)', labelEn: 'January 1 (Gregorian)' },
            { value: '01-07', labelAr: '1 محرم (هجري تقريبي)', labelEn: 'Muharram 1 (approx Hijri)' },
            { value: 'custom', labelAr: 'تاريخ مخصص', labelEn: 'Custom date' },
          ],
          descAr: 'بداية السنة لحساب الزكاة', descEn: 'Year start for Zakat calculation'
        })}
        <div class="settings-note">
          <strong>${window.i18n.getLang() === 'ar' ? 'ملاحظة:' : 'Note:'}</strong>
          ${window.i18n.getLang() === 'ar'
            ? 'حساب الزكاة في التطبيق تقديري فقط وليس بديلاً عن محاسب معتمد. استشر محاسبك للحساب الدقيق.'
            : 'Zakat calculation in the app is an estimate only and not a substitute for a certified accountant. Consult your accountant for exact calculation.'}
        </div>
        ${saveButton()}
      </div>
    </div>
  `;

  container.querySelector('#settings-save-btn').addEventListener('click', async () => {
    const data = {
      enabled: container.querySelector('#zakat-enabled').checked,
      rate: parseFloat(container.querySelector('#zakat-rate').value) || 2.5,
      fiscalYearStart: container.querySelector('#zakat-fiscal').value,
    };
    window.dbg('save', 'Zakat: saving...', data);
    await window.daftrly.setSetting('zakat', data);
    window.dbg('success', 'Zakat saved');
    showToast(window.i18n.getLang() === 'ar' ? 'تم حفظ إعدادات الزكاة' : 'Zakat settings saved', 'success');
  });
}

// ============ INVOICE FORMAT BUILDER ============
function renderInvoiceFormatSettings(container, s) {
  const fmt = s.invoiceFormat || {};
  const lang = window.i18n.getLang();
  const blocks = fmt.blocks || ['prefix', 'year', 'sequence'];
  const allBlocks = [
    { id: 'prefix', labelAr: 'بادئة', labelEn: 'Prefix', example: fmt.prefix || 'INV' },
    { id: 'year', labelAr: 'السنة', labelEn: 'Year', example: new Date().getFullYear() },
    { id: 'month', labelAr: 'الشهر', labelEn: 'Month', example: String(new Date().getMonth() + 1).padStart(2, '0') },
    { id: 'day', labelAr: 'اليوم', labelEn: 'Day', example: String(new Date().getDate()).padStart(2, '0') },
    { id: 'branch', labelAr: 'رمز الفرع', labelEn: 'Branch Code', example: fmt.branchCode || '01' },
    { id: 'sequence', labelAr: 'رقم تسلسلي', labelEn: 'Sequence #', example: '00001' },
  ];

  function generatePreview() {
    const sep = container.querySelector('#inv-separator')?.value || fmt.separator || '-';
    const prefix = container.querySelector('#inv-prefix')?.value || fmt.prefix || 'INV';
    const digits = parseInt(container.querySelector('#inv-digits')?.value) || fmt.sequenceDigits || 5;
    const branchCode = container.querySelector('#inv-branch')?.value || fmt.branchCode || '01';
    const activeBlocks = Array.from(container.querySelectorAll('.inv-block.active')).map(b => b.dataset.block);

    const parts = activeBlocks.map(b => {
      switch (b) {
        case 'prefix': return prefix;
        case 'year': return new Date().getFullYear();
        case 'month': return String(new Date().getMonth() + 1).padStart(2, '0');
        case 'day': return String(new Date().getDate()).padStart(2, '0');
        case 'branch': return branchCode;
        case 'sequence': return '1'.padStart(digits, '0');
        default: return '';
      }
    });

    const preview = container.querySelector('#inv-preview-text');
    if (preview) preview.textContent = parts.join(sep);
  }

  container.innerHTML = `
    <div class="settings-page fade-in">
      ${settingsHeader('تنسيق رقم الفاتورة', 'Invoice Number Format', 'صمم تنسيق أرقام فواتيرك بالطريقة التي تناسبك', 'Design your invoice numbering format the way you want')}
      <div class="settings-form">
        
        <div class="settings-field">
          <label class="form-label">${lang === 'ar' ? 'اختر المكونات (اضغط لتفعيل/تعطيل)' : 'Choose blocks (click to enable/disable)'}</label>
          <div class="inv-blocks" id="inv-blocks">
            ${allBlocks.map(b => `
              <div class="inv-block ${blocks.includes(b.id) ? 'active' : ''}" data-block="${b.id}">
                <span class="inv-block-label">${lang === 'ar' ? b.labelAr : b.labelEn}</span>
                <span class="inv-block-example">${b.example}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="settings-row">
          ${field('inv-prefix', 'البادئة', 'Prefix', fmt.prefix || 'INV', 'text', { placeholder: 'INV' })}
          ${field('inv-separator', 'الفاصل', 'Separator', fmt.separator || '-', 'select', {
            options: [
              { value: '-', labelAr: 'شرطة ( - )', labelEn: 'Dash ( - )' },
              { value: '/', labelAr: 'خط مائل ( / )', labelEn: 'Slash ( / )' },
              { value: '_', labelAr: 'شرطة سفلية ( _ )', labelEn: 'Underscore ( _ )' },
              { value: '', labelAr: 'بدون فاصل', labelEn: 'No separator' },
            ]
          })}
        </div>
        <div class="settings-row">
          ${field('inv-digits', 'عدد أرقام التسلسل', 'Sequence Digits', fmt.sequenceDigits || 5, 'number')}
          ${field('inv-branch', 'رمز الفرع', 'Branch Code', fmt.branchCode || '01', 'text')}
        </div>

        <div class="settings-field">
          <label class="form-label">${lang === 'ar' ? 'معاينة حية' : 'Live Preview'}</label>
          <div class="inv-preview">
            <span class="inv-preview-label">${lang === 'ar' ? 'رقم الفاتورة التالي:' : 'Next invoice number:'}</span>
            <span class="inv-preview-text" id="inv-preview-text"></span>
          </div>
        </div>

        ${saveButton()}
      </div>
    </div>
  `;

  // Block toggle handler
  container.querySelectorAll('.inv-block').forEach(block => {
    block.addEventListener('click', () => {
      if (block.dataset.block === 'sequence') return; // sequence is always required
      block.classList.toggle('active');
      generatePreview();
    });
  });

  // Live preview on any input change
  container.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('input', generatePreview);
    el.addEventListener('change', generatePreview);
  });

  // Initial preview
  generatePreview();

  // Save handler
  container.querySelector('#settings-save-btn').addEventListener('click', async () => {
    const activeBlocks = Array.from(container.querySelectorAll('.inv-block.active')).map(b => b.dataset.block);
    const data = {
      blocks: activeBlocks,
      prefix: container.querySelector('#inv-prefix').value,
      separator: container.querySelector('#inv-separator').value,
      sequenceDigits: parseInt(container.querySelector('#inv-digits').value) || 5,
      branchCode: container.querySelector('#inv-branch').value,
    };
    window.dbg('save', 'Invoice format: saving...', data);
    await window.daftrly.setSetting('invoiceFormat', data);
    window.appSettings = await window.daftrly.getSettings();
    window.dbg('success', 'Invoice format saved');
    showToast(lang === 'ar' ? 'تم حفظ تنسيق الفاتورة' : 'Invoice format saved', 'success');
  });
}

// ============ DISPLAY & LANGUAGE ============
function renderDisplaySettings(container, s) {
  const lang = window.i18n.getLang();
  container.innerHTML = `
    <div class="settings-page fade-in">
      ${settingsHeader('العرض واللغة', 'Display & Language', 'تخصيص مظهر التطبيق واللغة والتاريخ والعملة', 'Customize app appearance, language, date, and currency')}
      ${settingsHelpBox(
        'اختر لغة ومظهر التطبيق. وضع الكشك يجعل التطبيق بشاشة كاملة بدون إمكانية إغلاقه — للأجهزة المخصصة فقط.',
        'Choose app language and theme. Kiosk mode makes the app fullscreen with no way to close it — for dedicated POS devices only.',
        '⚠️ وضع الكشك: لا تفعّله إلا إذا كان الجهاز مخصص للبيع فقط. للخروج تحتاج PIN المدير.',
        '⚠️ Kiosk mode: Only enable if this device is dedicated to POS. You need admin PIN to exit.'
      )}
      <div class="settings-form">
        ${field('disp-lang', 'اللغة', 'Language', s.language || 'ar', 'select', {
          options: [
            { value: 'ar', labelAr: 'العربية', labelEn: 'Arabic' },
            { value: 'en', labelAr: 'الإنجليزية', labelEn: 'English' },
          ]
        })}
        ${field('disp-theme', 'المظهر', 'Theme', s.theme || 'dark', 'select', {
          options: [
            { value: 'dark', labelAr: 'داكن', labelEn: 'Dark' },
            { value: 'light', labelAr: 'فاتح', labelEn: 'Light' },
          ]
        })}
        ${field('disp-date', 'تنسيق التاريخ', 'Date Format', s.dateFormat || 'gregorian', 'select', {
          options: [
            { value: 'gregorian', labelAr: 'ميلادي', labelEn: 'Gregorian' },
          ]
        })}

        <div class="settings-note" style="margin-top:16px;"><strong>${lang === 'ar' ? '🌍 البلد والعملة' : '🌍 Country & Currency'}</strong></div>
        <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:8px;">${lang === 'ar' ? 'اختيار البلد يضبط العملة والضريبة تلقائياً — يمكنك تعديلها بعد ذلك' : 'Selecting a country auto-sets currency and tax — you can modify them after'}</div>
        
        ${field('disp-country', 'البلد', 'Country', s.country || 'SA', 'select', {
          options: [
            { value: 'SA', labelAr: '🇸🇦 السعودية', labelEn: '🇸🇦 Saudi Arabia' },
            { value: 'AE', labelAr: '🇦🇪 الإمارات', labelEn: '🇦🇪 UAE' },
            { value: 'BH', labelAr: '🇧🇭 البحرين', labelEn: '🇧🇭 Bahrain' },
            { value: 'KW', labelAr: '🇰🇼 الكويت', labelEn: '🇰🇼 Kuwait' },
            { value: 'OM', labelAr: '🇴🇲 عُمان', labelEn: '🇴🇲 Oman' },
            { value: 'QA', labelAr: '🇶🇦 قطر', labelEn: '🇶🇦 Qatar' },
            { value: 'EG', labelAr: '🇪🇬 مصر', labelEn: '🇪🇬 Egypt' },
            { value: 'JO', labelAr: '🇯🇴 الأردن', labelEn: '🇯🇴 Jordan' },
            { value: 'IQ', labelAr: '🇮🇶 العراق', labelEn: '🇮🇶 Iraq' },
            { value: 'LB', labelAr: '🇱🇧 لبنان', labelEn: '🇱🇧 Lebanon' },
            { value: 'MA', labelAr: '🇲🇦 المغرب', labelEn: '🇲🇦 Morocco' },
            { value: 'TN', labelAr: '🇹🇳 تونس', labelEn: '🇹🇳 Tunisia' },
            { value: 'TR', labelAr: '🇹🇷 تركيا', labelEn: '🇹🇷 Turkey' },
            { value: 'PK', labelAr: '🇵🇰 باكستان', labelEn: '🇵🇰 Pakistan' },
            { value: 'US', labelAr: '🇺🇸 أمريكا', labelEn: '🇺🇸 United States' },
            { value: 'GB', labelAr: '🇬🇧 بريطانيا', labelEn: '🇬🇧 United Kingdom' },
            { value: 'custom', labelAr: '⚙️ مخصص', labelEn: '⚙️ Custom' },
          ]
        })}

        <div class="settings-row">
          ${field('disp-currency-symbol', 'رمز العملة', 'Currency Symbol', s.currency?.symbol || 'ر.س', 'text', { placeholder: 'SAR, $, €' })}
          ${field('disp-currency-code', 'كود العملة', 'Currency Code', s.currency?.code || 'SAR', 'text', { placeholder: 'SAR, AED, USD' })}
        </div>
        <div class="settings-row">
          ${field('disp-currency-pos', 'موضع رمز العملة', 'Currency Symbol Position', s.currency?.position || 'after', 'select', {
            options: [
              { value: 'after', labelAr: 'بعد المبلغ (100 ر.س)', labelEn: 'After amount (100 SAR)' },
              { value: 'before', labelAr: 'قبل المبلغ (ر.س 100)', labelEn: 'Before amount (SAR 100)' },
            ]
          })}
          ${field('disp-decimals', 'عدد الخانات العشرية', 'Decimal Places', s.currency?.decimals ?? 2, 'select', {
            options: [
              { value: '0', labelAr: '0 (بدون كسور)', labelEn: '0 (no decimals)' },
              { value: '2', labelAr: '2 (0.00)', labelEn: '2 (0.00)' },
              { value: '3', labelAr: '3 (0.000)', labelEn: '3 (0.000)' },
            ]
          })}
        </div>
        ${field('disp-tax-name', 'اسم الضريبة', 'Tax Name', s.taxName || (lang === 'ar' ? 'ضريبة القيمة المضافة' : 'VAT'), 'text', { placeholder: 'VAT, GST, Sales Tax' })}

        <div class="settings-note" style="margin-top:16px;"><strong>${lang === 'ar' ? '🖥 تخطيط نقطة البيع' : '🖥 POS Layout'}</strong></div>
        ${field('disp-pos-layout', 'تخطيط شاشة البيع', 'POS Screen Layout', s.posLayout || 'grid', 'select', {
          options: [
            { value: 'grid', labelAr: '📱 شبكة — منتجات + سلة', labelEn: '📱 Grid — Products + Cart' },
            { value: 'cart-left', labelAr: '📱 شبكة — سلة + منتجات', labelEn: '📱 Grid — Cart + Products' },
            { value: 'top-bottom', labelAr: '📱 شبكة — منتجات أعلى + سلة أسفل', labelEn: '📱 Grid — Products top + Cart bottom' },
            { value: 'list', labelAr: '📋 قائمة — سلة بعرض كامل', labelEn: '📋 List — Full-width cart' },
          ],
          descAr: 'الشبكة: المنتجات على اليسار والسلة على اليمين. القائمة: سلة بعرض كامل للمسح السريع.',
          descEn: 'Grid: products left + cart right. List: full-width cart for fast scanning.'
        })}

        <div class="settings-note" style="margin-top:16px;"><strong>${lang === 'ar' ? 'وضع الكشك (POS مخصص)' : 'Kiosk Mode (Dedicated POS)'}</strong></div>
        ${field('disp-kiosk', 'وضع الكشك', 'Kiosk Mode', s.kioskMode, 'toggle', {
          descAr: 'شاشة كاملة بدون شريط مهام أو أزرار إغلاق. مثالي لأجهزة POS المخصصة. يحتاج PIN المدير للخروج.',
          descEn: 'Fullscreen without taskbar or close buttons. Ideal for dedicated POS machines. Requires admin PIN to exit.'
        })}
        ${field('disp-autostart', 'تشغيل تلقائي مع Windows', 'Auto-start with Windows', s.autoStart, 'toggle', {
          descAr: 'يفتح التطبيق تلقائياً عند تشغيل الجهاز',
          descEn: 'Opens the app automatically when the computer starts'
        })}

        <div class="settings-note" style="margin-top:16px;"><strong>${lang === 'ar' ? 'الأمان' : 'Security'}</strong></div>
        ${field('disp-session-timeout', 'قفل الشاشة التلقائي', 'Auto-Lock Screen', s.sessionTimeout || 0, 'select', {
          options: [
            { value: '0', labelAr: 'إيقاف', labelEn: 'Off' },
            { value: '5', labelAr: '5 دقائق', labelEn: '5 minutes' },
            { value: '10', labelAr: '10 دقائق', labelEn: '10 minutes' },
            { value: '15', labelAr: '15 دقيقة', labelEn: '15 minutes' },
            { value: '30', labelAr: '30 دقيقة', labelEn: '30 minutes' },
            { value: '60', labelAr: '60 دقيقة', labelEn: '60 minutes' },
          ],
          descAr: 'يقفل الشاشة تلقائياً بعد فترة عدم النشاط',
          descEn: 'Automatically locks the screen after period of inactivity'
        })}
        ${s.kioskMode ? `
          <button class="btn btn-secondary btn-sm" id="disp-exit-kiosk" style="color:var(--danger);margin-bottom:12px;">
            🔓 ${lang === 'ar' ? 'خروج من وضع الكشك (يحتاج PIN)' : 'Exit Kiosk Mode (requires PIN)'}
          </button>
        ` : ''}

        <div class="settings-note" style="margin-top:16px;"><strong>${lang === 'ar' ? 'شاشة العميل' : 'Customer Display'}</strong></div>
        ${field('disp-customer-display', 'تفعيل شاشة العميل', 'Enable Customer Display', s.customerDisplay, 'toggle', {
          descAr: 'تعرض للعميل المنتجات والإجمالي على شاشة ثانية',
          descEn: 'Shows the customer items and total on a second screen'
        })}
        <div id="disp-screen-select" style="display:${s.customerDisplay ? 'block' : 'none'};">
          <div class="form-group">
            <label class="form-label">${lang === 'ar' ? 'اختر الشاشة' : 'Select Screen'}</label>
            <div style="display:flex;gap:8px;">
              <select id="disp-screen-idx" class="form-input form-select" style="flex:1;">
                <option value="">${lang === 'ar' ? 'جاري الكشف...' : 'Detecting...'}</option>
              </select>
              <button class="btn btn-secondary btn-sm" id="disp-screen-refresh">🔄</button>
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" id="disp-test-display" style="margin-bottom:12px;">📺 ${lang === 'ar' ? 'اختبار شاشة العميل' : 'Test Customer Display'}</button>
        </div>

        ${saveButton()}
      </div>
    </div>
  `;

  // Country profiles — auto-fill currency and VAT
  const COUNTRY_PROFILES = {
    SA: { symbol: 'ر.س', code: 'SAR', position: 'after', decimals: 2, taxName: 'ضريبة القيمة المضافة', taxNameEn: 'VAT', taxRate: 15, date: 'hijri_gregorian' },
    AE: { symbol: 'د.إ', code: 'AED', position: 'after', decimals: 2, taxName: 'ضريبة القيمة المضافة', taxNameEn: 'VAT', taxRate: 5, date: 'gregorian' },
    BH: { symbol: 'د.ب', code: 'BHD', position: 'after', decimals: 3, taxName: 'ضريبة القيمة المضافة', taxNameEn: 'VAT', taxRate: 10, date: 'gregorian' },
    KW: { symbol: 'د.ك', code: 'KWD', position: 'after', decimals: 3, taxName: 'ضريبة القيمة المضافة', taxNameEn: 'VAT', taxRate: 0, date: 'gregorian' },
    OM: { symbol: 'ر.ع', code: 'OMR', position: 'after', decimals: 3, taxName: 'ضريبة القيمة المضافة', taxNameEn: 'VAT', taxRate: 5, date: 'gregorian' },
    QA: { symbol: 'ر.ق', code: 'QAR', position: 'after', decimals: 2, taxName: 'ضريبة القيمة المضافة', taxNameEn: 'VAT', taxRate: 0, date: 'gregorian' },
    EG: { symbol: 'ج.م', code: 'EGP', position: 'after', decimals: 2, taxName: 'ضريبة القيمة المضافة', taxNameEn: 'VAT', taxRate: 14, date: 'gregorian' },
    JO: { symbol: 'د.أ', code: 'JOD', position: 'after', decimals: 3, taxName: 'ضريبة المبيعات', taxNameEn: 'GST', taxRate: 16, date: 'gregorian' },
    IQ: { symbol: 'د.ع', code: 'IQD', position: 'after', decimals: 0, taxName: 'ضريبة المبيعات', taxNameEn: 'Sales Tax', taxRate: 15, date: 'gregorian' },
    LB: { symbol: 'ل.ل', code: 'LBP', position: 'after', decimals: 0, taxName: 'ضريبة القيمة المضافة', taxNameEn: 'VAT', taxRate: 11, date: 'gregorian' },
    MA: { symbol: 'د.م', code: 'MAD', position: 'after', decimals: 2, taxName: 'ضريبة القيمة المضافة', taxNameEn: 'TVA', taxRate: 20, date: 'gregorian' },
    TN: { symbol: 'د.ت', code: 'TND', position: 'after', decimals: 3, taxName: 'ضريبة القيمة المضافة', taxNameEn: 'TVA', taxRate: 19, date: 'gregorian' },
    TR: { symbol: '₺', code: 'TRY', position: 'before', decimals: 2, taxName: 'KDV', taxNameEn: 'VAT', taxRate: 20, date: 'gregorian' },
    PK: { symbol: 'Rs', code: 'PKR', position: 'before', decimals: 0, taxName: 'Sales Tax', taxNameEn: 'Sales Tax', taxRate: 18, date: 'gregorian' },
    US: { symbol: '$', code: 'USD', position: 'before', decimals: 2, taxName: 'Sales Tax', taxNameEn: 'Sales Tax', taxRate: 0, date: 'gregorian' },
    GB: { symbol: '£', code: 'GBP', position: 'before', decimals: 2, taxName: 'VAT', taxNameEn: 'VAT', taxRate: 20, date: 'gregorian' },
  };

  const countrySelect = container.querySelector('#disp-country');
  if (countrySelect) {
    countrySelect.addEventListener('change', () => {
      const profile = COUNTRY_PROFILES[countrySelect.value];
      if (!profile) return;
      const symEl = container.querySelector('#disp-currency-symbol');
      const codeEl = container.querySelector('#disp-currency-code');
      const posEl = container.querySelector('#disp-currency-pos');
      const decEl = container.querySelector('#disp-decimals');
      const taxEl = container.querySelector('#disp-tax-name');
      const dateEl = container.querySelector('#disp-date');
      if (symEl) symEl.value = profile.symbol;
      if (codeEl) codeEl.value = profile.code;
      if (posEl) posEl.value = profile.position;
      if (decEl) decEl.value = String(profile.decimals);
      if (taxEl) taxEl.value = lang === 'ar' ? profile.taxName : profile.taxNameEn;
      if (dateEl) dateEl.value = profile.date;
      // Also update VAT rate in vat settings
      showToast(lang === 'ar' 
        ? `✅ تم ضبط: ${profile.code} — ${profile.taxNameEn} ${profile.taxRate}% — يمكنك تعديل القيم`
        : `✅ Set: ${profile.code} — ${profile.taxNameEn} ${profile.taxRate}% — you can adjust values`, 'success');
    });
  }

  container.querySelector('#settings-save-btn').addEventListener('click', async () => {
    const newLang = container.querySelector('#disp-lang').value;
    const newTheme = container.querySelector('#disp-theme').value;
    const country = container.querySelector('#disp-country')?.value || 'SA';
    const currencyData = {
      symbol: container.querySelector('#disp-currency-symbol').value,
      code: container.querySelector('#disp-currency-code')?.value || 'SAR',
      position: container.querySelector('#disp-currency-pos').value,
      decimals: parseInt(container.querySelector('#disp-decimals').value),
    };
    const taxName = container.querySelector('#disp-tax-name')?.value || '';

    // Auto-update VAT rate when country changes
    const profile = COUNTRY_PROFILES[country];
    if (profile) {
      const currentVat = await window.daftrly.getSettings();
      const vatData = currentVat.vat || {};
      vatData.rate = profile.taxRate;
      await window.daftrly.setSetting('vat', vatData);
    }

    await window.daftrly.setSetting('language', newLang);
    await window.daftrly.setSetting('theme', newTheme);
    await window.daftrly.setSetting('country', country);
    await window.daftrly.setSetting('dateFormat', container.querySelector('#disp-date').value);
    await window.daftrly.setSetting('currency', currencyData);
    await window.daftrly.setSetting('taxName', taxName);
    await window.daftrly.setSetting('posLayout', container.querySelector('#disp-pos-layout')?.value || 'grid');

    // Kiosk & auto-start & session timeout & customer display
    const kioskEnabled = container.querySelector('#disp-kiosk').checked;
    const autoStart = container.querySelector('#disp-autostart').checked;
    const sessionTimeout = parseInt(container.querySelector('#disp-session-timeout')?.value) || 0;
    const customerDisplay = container.querySelector('#disp-customer-display')?.checked || false;
    const customerScreenIdx = parseInt(container.querySelector('#disp-screen-idx')?.value) || 1;
    await window.daftrly.setSetting('kioskMode', kioskEnabled);
    await window.daftrly.setSetting('autoStart', autoStart);
    await window.daftrly.setSetting('sessionTimeout', sessionTimeout);
    await window.daftrly.setSetting('customerDisplay', customerDisplay);
    await window.daftrly.setSetting('customerScreenIdx', customerScreenIdx);
    window.daftrly.setKiosk(kioskEnabled);
    window.daftrly.setAutoStart(autoStart);
    if (window._startInactivityTimer) window._startInactivityTimer();

    // Open/close customer display
    if (customerDisplay) {
      window.daftrly.openDisplay(customerScreenIdx);
      const biz = window.appSettings?.business || {};
      setTimeout(() => {
        window.daftrly.updateDisplay({ type: 'init', shopName: biz.nameAr || biz.nameEn || 'نقدي', totalLabel: newLang === 'ar' ? 'الإجمالي' : 'Total' });
      }, 1000);
    } else {
      window.daftrly.closeDisplay();
    }

    document.documentElement.setAttribute('data-theme', newTheme);
    window.i18n.setLanguage(newLang);
    window.appSettings = await window.daftrly.getSettings();
    window.dbg('success', 'Display saved & applied', { lang: newLang, theme: newTheme });

    // Re-render entire app to apply language/theme
    renderApp();
    navigateTo('settings');

    // Show toast AFTER re-render (DOM rebuilds, so toast must come after)
    setTimeout(() => {
      showToast(newLang === 'ar' ? '✅ تم حفظ إعدادات العرض' : '✅ Display settings saved', 'success');
    }, 300);
  });

  // Exit kiosk mode button
  const exitKioskBtn = container.querySelector('#disp-exit-kiosk');
  if (exitKioskBtn) {
    exitKioskBtn.addEventListener('click', async () => {
      const isAdmin = window._currentUser?.role === 'admin';
      if (!isAdmin) {
        const authorized = await window.requestManagerAuth(
          lang === 'ar' ? '🔓 الخروج من وضع الكشك\n\nمطلوب صلاحية المدير' : '🔓 Exit Kiosk Mode\n\nManager authorization required'
        );
        if (!authorized) return;
      }
      await window.daftrly.setSetting('kioskMode', false);
      window.daftrly.setKiosk(false);
      showToast(lang === 'ar' ? '✅ تم الخروج من وضع الكشك' : '✅ Kiosk mode disabled', 'success');
      renderApp();
      navigateTo('settings');
    });
  }

  // Customer display toggle
  const custDispToggle = container.querySelector('#disp-customer-display');
  const screenSelectDiv = container.querySelector('#disp-screen-select');
  if (custDispToggle && screenSelectDiv) {
    custDispToggle.addEventListener('change', () => {
      screenSelectDiv.style.display = custDispToggle.checked ? 'block' : 'none';
      if (custDispToggle.checked) loadScreens();
    });
  }

  async function loadScreens() {
    const select = container.querySelector('#disp-screen-idx');
    if (!select) return;
    const res = await window.daftrly.getScreens();
    if (!res.success || !res.data?.length) return;
    select.innerHTML = res.data.map(s => `<option value="${s.index}" ${s.index === (window.appSettings?.customerScreenIdx || 1) ? 'selected' : ''}>${s.label}</option>`).join('');
  }
  if (container.querySelector('#disp-customer-display')?.checked) loadScreens();

  const screenRefreshBtn = container.querySelector('#disp-screen-refresh');
  if (screenRefreshBtn) screenRefreshBtn.addEventListener('click', loadScreens);

  const testDisplayBtn = container.querySelector('#disp-test-display');
  if (testDisplayBtn) {
    testDisplayBtn.addEventListener('click', async () => {
      const idx = parseInt(container.querySelector('#disp-screen-idx')?.value) || 1;
      const biz = window.appSettings?.business || {};
      await window.daftrly.openDisplay(idx);
      setTimeout(() => {
        window.daftrly.updateDisplay({ type: 'init', shopName: biz.nameAr || biz.nameEn || 'نقدي', totalLabel: lang === 'ar' ? 'الإجمالي' : 'Total' });
        window.daftrly.updateDisplay({ type: 'cart', items: [
          { name: lang === 'ar' ? 'منتج تجريبي 1' : 'Test Product 1', price: '25.00' },
          { name: lang === 'ar' ? 'منتج تجريبي 2' : 'Test Product 2', price: '15.50' },
        ], total: '40.50' });
        showToast(lang === 'ar' ? '✅ شاشة العميل تعمل' : '✅ Customer display working', 'success');
      }, 1000);
    });
  }
}

// ============ PRINTER SETTINGS ============
function renderPrinterSettings(container, s) {
  const lang = window.i18n.getLang();
  const pr = s.printer || {};
  const rcpt = s.receipt || {};
  container.innerHTML = `
    <div class="settings-page fade-in">
      ${settingsHeader('إعدادات الطابعة والإيصال', 'Printer & Receipt Settings', 'تخصيص الطابعة ومحتوى الإيصال', 'Customize printer and receipt content')}
      ${settingsHelpBox(
        'اختر كيف تطبع الإيصالات. "متصفح" = طباعة عادية من المتصفح. "شبكة" = طابعة حرارية متصلة بالشبكة المحلية عبر IP.',
        'Choose how to print receipts. "Browser" = standard browser printing. "Network" = thermal printer connected via local network IP.',
        'الطابعة الحرارية: أدخل عنوان IP (مثل 192.168.1.100) والمنفذ 9100. درج النقود يتصل بالطابعة عبر كيبل RJ11.',
        'Thermal printer: Enter IP address (e.g. 192.168.1.100) and port 9100. Cash drawer connects to printer via RJ11 cable.'
      )}
      <div class="settings-form">
        <div class="settings-note"><strong>${lang === 'ar' ? 'الطابعة' : 'Printer'}</strong></div>
        ${field('pr-enabled', 'تفعيل الطباعة', 'Enable Printing', pr.enabled, 'toggle')}
        ${field('pr-type', 'نوع الاتصال', 'Connection Type', pr.type || 'browser', 'select', {
          options: [
            { value: 'browser', labelAr: 'طباعة المتصفح (افتراضي)', labelEn: 'Browser Print (Default)' },
            { value: 'usb', labelAr: 'طابعة USB (صامت)', labelEn: 'USB Printer (Silent)' },
            { value: 'network', labelAr: 'شبكة (IP)', labelEn: 'Network (IP)' },
          ],
          descAr: 'USB: طباعة صامتة للطابعات المتصلة مباشرة. الشبكة: للطابعات الحرارية عبر IP.',
          descEn: 'USB: silent print for directly connected printers. Network: for thermal printers via IP.'
        })}
        <div id="pr-usb-fields" style="display:${pr.type === 'usb' ? 'block' : 'none'};">
          <div class="form-group">
            <label class="form-label">${lang === 'ar' ? 'اختر الطابعة' : 'Select Printer'}</label>
            <div style="display:flex;gap:8px;">
              <select id="pr-usb-name" class="form-input form-select" style="flex:1;">
                <option value="">${lang === 'ar' ? 'جاري البحث...' : 'Detecting...'}</option>
              </select>
              <button class="btn btn-secondary btn-sm" id="pr-usb-refresh">🔄</button>
            </div>
          </div>
          <button class="btn btn-secondary btn-sm" id="pr-usb-test" style="margin-bottom:12px;">🖨 ${lang === 'ar' ? 'طباعة تجريبية' : 'Test Print'}</button>
        </div>
        <div id="pr-network-fields" style="display:${pr.type === 'network' ? 'block' : 'none'};">
          ${field('pr-ip', 'عنوان IP الطابعة', 'Printer IP Address', pr.ip || '192.168.1.100', 'text', { placeholder: '192.168.1.100' })}
          ${field('pr-port', 'المنفذ', 'Port', pr.port || 9100, 'number', { placeholder: '9100' })}
          <div style="display:flex;gap:8px;margin-bottom:12px;">
            <button class="btn btn-secondary btn-sm" id="pr-test-btn">🖨 ${lang === 'ar' ? 'طباعة تجريبية' : 'Test Print'}</button>
            <button class="btn btn-secondary btn-sm" id="pr-drawer-btn">💰 ${lang === 'ar' ? 'فتح الدرج' : 'Open Drawer'}</button>
            <button class="btn btn-secondary btn-sm" id="pr-scan-btn">🔍 ${lang === 'ar' ? 'بحث تلقائي' : 'Auto-detect'}</button>
          </div>
        </div>
        ${field('pr-width', 'عرض الورق', 'Paper Width', pr.paperWidth || 80, 'select', {
          options: [
            { value: '58', labelAr: '58mm', labelEn: '58mm' },
            { value: '80', labelAr: '80mm', labelEn: '80mm' },
          ]
        })}
        ${field('pr-auto', 'طباعة تلقائية بعد البيع', 'Auto-print after sale', pr.autoPrint, 'toggle')}
        ${field('pr-drawer-kick', 'فتح الدرج تلقائياً بعد البيع', 'Auto-open drawer after sale', pr.drawerKick, 'toggle', {
          descAr: 'يفتح درج النقود تلقائياً بعد كل عملية بيع نقدي',
          descEn: 'Automatically opens cash drawer after every cash sale'
        })}
        ${field('pr-copies', 'عدد النسخ', 'Number of Copies', pr.copies || 1, 'number')}

        <div class="settings-note" style="margin-top:16px;"><strong>${window.i18n.getLang() === 'ar' ? 'رقم التذكرة / الطلب' : 'Ticket / Order Number'}</strong></div>
        ${field('rcpt-ticket', 'تفعيل رقم التذكرة', 'Enable Ticket Number', rcpt.ticketEnabled, 'toggle', { descAr: 'رقم يومي يُعاد تعيينه كل صباح', descEn: 'Daily number that resets each morning' })}
        ${field('rcpt-ticket-start', 'رقم البداية', 'Start Number', rcpt.ticketStart || 1, 'number')}

        <div class="settings-note" style="margin-top:16px;"><strong>${window.i18n.getLang() === 'ar' ? 'محتوى الإيصال' : 'Receipt Content'}</strong></div>
        
        <div id="zatca-receipt-warning" class="settings-note" style="background:rgba(245,158,11,0.1);border:1px solid var(--warning);display:none;">
          <strong style="color:var(--warning);">⚠️ ${window.i18n.getLang() === 'ar' ? 'متطلبات هيئة الزكاة والضريبة:' : 'ZATCA Requirements:'}</strong><br>
          ${window.i18n.getLang() === 'ar' 
            ? 'عند تفعيل الفوترة الإلكترونية، يُنصح بتفعيل: اسم النشاط بالعربي، الرقم الضريبي، قائمة المنتجات، رمز QR. يمكنك تخصيص الإيصال كما تريد.'
            : 'When e-invoicing is enabled, it is recommended to enable: Arabic business name, VAT number, items list, QR code. You can customize the receipt as you wish.'}
          <br><button class="btn btn-secondary btn-sm" id="rcpt-reset-zatca" style="margin-top:8px;">🔄 ${window.i18n.getLang() === 'ar' ? 'إعادة تعيين إلى إعدادات ZATCA الافتراضية' : 'Reset to ZATCA Defaults'}</button>
        </div>

        ${field('rcpt-logo', 'عرض الشعار', 'Show Logo', rcpt.showLogo !== false, 'toggle')}
        ${field('rcpt-name-ar', 'عرض اسم النشاط', 'Show Business Name', rcpt.showNameAr !== false, 'toggle', {
          descAr: 'يعرض الاسم حسب لغة الإيصال المختارة أدناه',
          descEn: 'Displays name based on receipt language selected below'
        })}
        ${field('rcpt-vat', 'عرض الرقم الضريبي', 'Show VAT Number', rcpt.showVat !== false, 'toggle')}
        ${field('rcpt-cr', 'عرض السجل التجاري', 'Show CR Number', rcpt.showCR, 'toggle')}
        ${field('rcpt-address', 'عرض العنوان', 'Show Address', rcpt.showAddress, 'toggle')}
        ${field('rcpt-phone', 'عرض رقم الهاتف', 'Show Phone', rcpt.showPhone, 'toggle')}
        ${field('rcpt-items', 'عرض قائمة المنتجات', 'Show Items List', rcpt.showItems !== false, 'toggle', { descAr: 'عرض المنتجات والكميات في الإيصال', descEn: 'Show products and quantities on the receipt' })}
        ${field('rcpt-lang', 'لغة الإيصال', 'Receipt Language', rcpt.receiptLang || 'ar', 'select', {
          options: [
            { value: 'ar', labelAr: 'عربي فقط', labelEn: 'Arabic Only' },
            { value: 'en', labelAr: 'إنجليزي فقط', labelEn: 'English Only' },
            { value: 'both', labelAr: 'عربي + إنجليزي (ثنائي)', labelEn: 'Arabic + English (Bilingual)' },
          ],
          descAr: 'اختر لغة عرض جميع محتويات الإيصال',
          descEn: 'Choose the display language for all receipt content'
        })}
        ${field('rcpt-barcode', 'باركود رقم الفاتورة', 'Invoice Number Barcode', rcpt.showBarcode !== false, 'toggle', { descAr: 'باركود لمسح رقم الفاتورة عند الإرجاع', descEn: 'Barcode for scanning invoice number on returns' })}
        ${field('rcpt-qr', 'رمز QR (ZATCA)', 'QR Code (ZATCA)', rcpt.showQR !== false, 'toggle', { descAr: 'مطلوب للمسجلين في ضريبة القيمة المضافة', descEn: 'Required for VAT-registered businesses' })}
        ${field('rcpt-coupon', 'عرض خصم الكوبون', 'Show Coupon Discount', rcpt.showCoupon !== false, 'toggle', { descAr: 'يعرض سطر خصم الكوبون في الإيصال', descEn: 'Shows coupon discount line on the receipt' })}
        ${field('rcpt-loyalty', 'عرض خصم نقاط الولاء', 'Show Loyalty Discount', rcpt.showLoyalty !== false, 'toggle', { descAr: 'يعرض سطر خصم نقاط الولاء في الإيصال', descEn: 'Shows loyalty points discount line on the receipt' })}
        ${field('rcpt-points-earned', 'عرض النقاط المكتسبة', 'Show Points Earned', rcpt.showPointsEarned !== false, 'toggle', { descAr: 'يعرض عدد النقاط المكتسبة أسفل الإيصال', descEn: 'Shows points earned at the bottom of the receipt' })}
        ${field('rcpt-qr-size', 'حجم رمز QR', 'QR Code Size', rcpt.qrSize || 'medium', 'select', {
          options: [
            { value: 'small', labelAr: 'صغير', labelEn: 'Small' },
            { value: 'medium', labelAr: 'متوسط', labelEn: 'Medium' },
            { value: 'large', labelAr: 'كبير', labelEn: 'Large' },
          ]
        })}
        ${field('rcpt-font', 'حجم الخط', 'Font Size', rcpt.fontSize || 'medium', 'select', {
          options: [
            { value: 'small', labelAr: 'صغير', labelEn: 'Small' },
            { value: 'medium', labelAr: 'متوسط', labelEn: 'Medium' },
            { value: 'large', labelAr: 'كبير', labelEn: 'Large' },
          ]
        })}
        ${saveButton()}
      </div>
    </div>
  `;

  container.querySelector('#settings-save-btn').addEventListener('click', async () => {
    const printerData = {
      enabled: container.querySelector('#pr-enabled').checked,
      type: container.querySelector('#pr-type').value,
      ip: container.querySelector('#pr-ip')?.value || '',
      port: parseInt(container.querySelector('#pr-port')?.value) || 9100,
      usbName: container.querySelector('#pr-usb-name')?.value || '',
      paperWidth: parseInt(container.querySelector('#pr-width').value),
      autoPrint: container.querySelector('#pr-auto').checked,
      drawerKick: container.querySelector('#pr-drawer-kick').checked,
      copies: parseInt(container.querySelector('#pr-copies').value) || 1,
    };
    const receiptData = {
      ticketEnabled: container.querySelector('#rcpt-ticket').checked,
      ticketStart: parseInt(container.querySelector('#rcpt-ticket-start').value) || 1,
      showItems: container.querySelector('#rcpt-items').checked,
      showLogo: container.querySelector('#rcpt-logo').checked,
      showNameAr: container.querySelector('#rcpt-name-ar').checked,
      showVat: container.querySelector('#rcpt-vat').checked,
      showCR: container.querySelector('#rcpt-cr').checked,
      showAddress: container.querySelector('#rcpt-address').checked,
      showPhone: container.querySelector('#rcpt-phone').checked,
      bilingualItems: container.querySelector('#rcpt-lang').value === 'both',
      receiptLang: container.querySelector('#rcpt-lang').value,
      showBarcode: container.querySelector('#rcpt-barcode').checked,
      showQR: container.querySelector('#rcpt-qr').checked,
      showCoupon: container.querySelector('#rcpt-coupon').checked,
      showLoyalty: container.querySelector('#rcpt-loyalty').checked,
      showPointsEarned: container.querySelector('#rcpt-points-earned').checked,
      qrSize: container.querySelector('#rcpt-qr-size').value,
      fontSize: container.querySelector('#rcpt-font').value,
    };
    // ZATCA warning (advisory only — merchant decides)
    const allS = await window.daftrly.getSettings();
    if (allS.zatcaMode && allS.zatcaMode !== 'off') {
      const missing = [];
      if (!receiptData.showNameAr) missing.push(lang === 'ar' ? 'اسم النشاط' : 'Business name');
      if (!receiptData.showVat) missing.push(lang === 'ar' ? 'الرقم الضريبي' : 'VAT number');
      if (!receiptData.showItems) missing.push(lang === 'ar' ? 'قائمة المنتجات' : 'Items list');
      if (!receiptData.showQR) missing.push(lang === 'ar' ? 'رمز QR' : 'QR code');
      if (missing.length > 0) {
        showToast(lang === 'ar' 
          ? `⚠️ تنبيه ZATCA: الحقول التالية مطلوبة: ${missing.join('، ')}`
          : `⚠️ ZATCA advisory: These fields are recommended: ${missing.join(', ')}`, 'warning');
      }
    }
    window.dbg('save', 'Printer & Receipt: saving...', { printer: printerData, receipt: receiptData });
    await window.daftrly.setSetting('printer', printerData);
    await window.daftrly.setSetting('receipt', receiptData);
    window.appSettings = await window.daftrly.getSettings();
    window.dbg('success', 'Printer & Receipt saved');
    showToast(window.i18n.getLang() === 'ar' ? 'تم حفظ إعدادات الطابعة والإيصال' : 'Printer & receipt settings saved', 'success');
  });

  // Connection type toggle — show/hide fields
  const prTypeSelect = container.querySelector('#pr-type');
  const networkFields = container.querySelector('#pr-network-fields');
  const usbFields = container.querySelector('#pr-usb-fields');
  if (prTypeSelect) {
    prTypeSelect.addEventListener('change', () => {
      if (networkFields) networkFields.style.display = prTypeSelect.value === 'network' ? 'block' : 'none';
      if (usbFields) usbFields.style.display = prTypeSelect.value === 'usb' ? 'block' : 'none';
      if (prTypeSelect.value === 'usb') loadUSBPrinters();
    });
  }

  // USB printer list
  async function loadUSBPrinters() {
    const select = container.querySelector('#pr-usb-name');
    if (!select) return;
    select.innerHTML = `<option value="">${lang === 'ar' ? 'جاري البحث...' : 'Detecting...'}</option>`;
    const res = await window.daftrly.listPrinters();
    if (!res.success || !res.data?.length) {
      select.innerHTML = `<option value="">${lang === 'ar' ? 'لم يتم العثور على طابعات' : 'No printers found'}</option>`;
      return;
    }
    select.innerHTML = res.data.map(p => {
      const selected = p.name === pr.usbName ? 'selected' : '';
      const label = p.isDefault ? `⭐ ${p.displayName}` : p.displayName;
      return `<option value="${escapeAttr(p.name)}" ${selected}>${label}</option>`;
    }).join('');
  }
  if (pr.type === 'usb') loadUSBPrinters();

  const usbRefreshBtn = container.querySelector('#pr-usb-refresh');
  if (usbRefreshBtn) usbRefreshBtn.addEventListener('click', loadUSBPrinters);

  // USB test print
  const usbTestBtn = container.querySelector('#pr-usb-test');
  if (usbTestBtn) {
    usbTestBtn.addEventListener('click', async () => {
      const printerName = container.querySelector('#pr-usb-name')?.value;
      if (!printerName) { showToast(lang === 'ar' ? 'اختر طابعة' : 'Select a printer', 'error'); return; }
      const html = `<html><body style="font-family:monospace;text-align:center;padding:8px;"><h3>Naqdi نقدي</h3><p>--- Test Print ---</p><p>${new Date().toLocaleString()}</p></body></html>`;
      const width = parseInt(container.querySelector('#pr-width')?.value) || 80;
      const result = await window.daftrly.printUSB(printerName, html, width);
      if (result.success) showToast(lang === 'ar' ? '✅ تم الطباعة' : '✅ Print successful', 'success');
      else showToast(lang === 'ar' ? '❌ فشل: ' + (result.error || '') : '❌ Failed: ' + (result.error || ''), 'error');
    });
  }

  // Network test print button
  const testBtn = container.querySelector('#pr-test-btn');
  if (testBtn) {
    testBtn.addEventListener('click', async () => {
      const ip = container.querySelector('#pr-ip')?.value || '';
      const port = parseInt(container.querySelector('#pr-port')?.value) || 9100;
      if (!ip) { showToast(lang === 'ar' ? 'أدخل عنوان IP' : 'Enter IP address', 'error'); return; }
      const result = await window.daftrly.printerSend(ip, port, 'test');
      if (result.success) showToast(lang === 'ar' ? '✅ تم الاتصال بالطابعة' : '✅ Printer connected', 'success');
      else showToast(lang === 'ar' ? '❌ فشل الاتصال: ' + result.error : '❌ Connection failed: ' + result.error, 'error');
    });
  }

  // Open drawer button
  const drawerBtn = container.querySelector('#pr-drawer-btn');
  if (drawerBtn) {
    drawerBtn.addEventListener('click', async () => {
      const ip = container.querySelector('#pr-ip')?.value || '';
      const port = parseInt(container.querySelector('#pr-port')?.value) || 9100;
      if (!ip) { showToast(lang === 'ar' ? 'أدخل عنوان IP' : 'Enter IP address', 'error'); return; }
      const result = await window.daftrly.printerSend(ip, port, 'drawer');
      if (result.success) showToast(lang === 'ar' ? '✅ تم فتح الدرج' : '✅ Drawer opened', 'success');
      else showToast(lang === 'ar' ? '❌ فشل: ' + result.error : '❌ Failed: ' + result.error, 'error');
    });
  }

  // Network auto-scan button
  const scanBtn = container.querySelector('#pr-scan-btn');
  if (scanBtn) {
    scanBtn.addEventListener('click', async () => {
      scanBtn.disabled = true;
      scanBtn.textContent = lang === 'ar' ? '⏳ جاري البحث...' : '⏳ Scanning...';
      const res = await window.daftrly.scanNetwork(9100, 800);
      scanBtn.disabled = false;
      scanBtn.textContent = lang === 'ar' ? '🔍 بحث تلقائي' : '🔍 Auto-detect';
      if (res.success && res.data?.length) {
        const ipInput = container.querySelector('#pr-ip');
        if (ipInput) ipInput.value = res.data[0];
        showToast(lang === 'ar' ? `✅ تم العثور على طابعة: ${res.data[0]}` : `✅ Printer found: ${res.data[0]}`, 'success');
      } else {
        showToast(lang === 'ar' ? '❌ لم يتم العثور على طابعات في الشبكة' : '❌ No printers found on network', 'warning');
      }
    });
  }

  // ZATCA compliance: show advisory warning only (merchant has full control)
  async function enforceZatcaFields() {
    const allSettings = await window.daftrly.getSettings();
    const zatcaMode = allSettings.zatcaMode || 'off';
    const isZatcaActive = zatcaMode !== 'off';
    const warning = container.querySelector('#zatca-receipt-warning');
    
    if (warning) warning.style.display = isZatcaActive ? 'block' : 'none';
    // No field locking — merchant decides
  }
  enforceZatcaFields();

  // Reset to ZATCA defaults button
  const resetBtn = container.querySelector('#rcpt-reset-zatca');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      // ZATCA mandatory defaults
      const checkOn = ['rcpt-logo', 'rcpt-name-ar', 'rcpt-vat', 'rcpt-items', 'rcpt-qr', 'rcpt-barcode', 'rcpt-address'];
      const checkOff = ['rcpt-cr', 'rcpt-phone'];
      checkOn.forEach(id => { const el = container.querySelector('#' + id); if (el) el.checked = true; });
      checkOff.forEach(id => { const el = container.querySelector('#' + id); if (el) el.checked = false; });
      // Reset selects
      const qrSize = container.querySelector('#rcpt-qr-size');
      if (qrSize) qrSize.value = 'medium';
      const fontSize = container.querySelector('#rcpt-font');
      if (fontSize) fontSize.value = 'medium';
      showToast(window.i18n.getLang() === 'ar' ? 'تم إعادة التعيين إلى إعدادات ZATCA الافتراضية — اضغط حفظ لتطبيق التغييرات' : 'Reset to ZATCA defaults — click Save to apply', 'success');
    });
  }
}

// ============ PAYMENT TERMINAL ============
function renderTerminalSettings(container, s) {
  const term = s.posTerminal || {};
  const lang = window.i18n.getLang();
  container.innerHTML = `
    <div class="settings-page fade-in">
      ${settingsHeader('جهاز الدفع (ECR)', 'Payment Terminal (ECR)', 'إعداد الاتصال بجهاز الدفع الإلكتروني', 'Configure connection to the card payment terminal')}
      ${settingsHelpBox(
        'يتصل النظام بجهاز الدفع (Mada/Visa/MasterCard) عبر خدمة Geidea Web ECR التي تعمل على الكمبيوتر. عند الدفع بالبطاقة، يُرسل المبلغ تلقائياً للجهاز — العميل يمسح أو يدخل البطاقة — النتيجة تعود للنظام.',
        'The system connects to the card terminal (Mada/Visa/MasterCard) via the Geidea Web ECR service running on this computer. When paying by card, the amount is sent automatically to the terminal — customer taps or inserts card — result returns to the system.',
        'المتطلبات: 1. تثبيت Geidea Web ECR Service على الكمبيوتر 2. جهاز دفع Geidea متصل (Verifone/Spectra/PAX) 3. تفعيل الخدمة من services.msc',
        'Requirements: 1. Install Geidea Web ECR Service on this PC 2. Geidea terminal connected (Verifone/Spectra/PAX) 3. Enable the service from services.msc'
      )}
      <div class="settings-form" style="max-width:600px;">

        <label style="display:flex;align-items:center;gap:8px;margin-bottom:16px;cursor:pointer;">
          <input type="checkbox" id="term-enabled" ${term.enabled ? 'checked' : ''} style="width:20px;height:20px;">
          <span style="font-weight:700;font-size:15px;">${lang === 'ar' ? 'تفعيل جهاز الدفع' : 'Enable Payment Terminal'}</span>
        </label>

        <div id="term-fields" style="${term.enabled ? '' : 'opacity:0.4;pointer-events:none;'}">

          <div class="form-group">
            <label class="form-label">${lang === 'ar' ? 'نوع الاتصال' : 'Connection Type'}</label>
            <select id="term-type" class="form-input form-select">
              <option value="geidea_web_ecr" ${(term.type || 'geidea_web_ecr') === 'geidea_web_ecr' ? 'selected' : ''}>Geidea Web ECR (HTTP — ${lang === 'ar' ? 'موصى به' : 'Recommended'})</option>
              <option value="tcp_direct" ${term.type === 'tcp_direct' ? 'selected' : ''}>TCP Direct (${lang === 'ar' ? 'اتصال مباشر' : 'Direct Connection'})</option>
            </select>
          </div>

          <div id="term-geidea-fields">
            <div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;">
              <div class="form-group">
                <label class="form-label">${lang === 'ar' ? 'عنوان الخدمة' : 'Service URL'}</label>
                <input type="text" id="term-url" class="form-input" value="${term.url || 'http://localhost:5000'}" placeholder="http://localhost:5000">
                <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;">${lang === 'ar' ? 'عنوان خدمة Geidea Web ECR — الافتراضي: localhost:5000' : 'Geidea Web ECR service address — default: localhost:5000'}</div>
              </div>
              <div class="form-group">
                <label class="form-label">${lang === 'ar' ? 'مهلة الانتظار' : 'Timeout'}</label>
                <select id="term-timeout" class="form-input form-select">
                  ${[30,45,60,90,120].map(t => `<option value="${t}" ${(term.timeout || 60) == t ? 'selected' : ''}>${t} ${lang === 'ar' ? 'ثانية' : 'sec'}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="form-group">
              <label class="form-label">${lang === 'ar' ? 'نوع الجهاز' : 'Terminal Device'}</label>
              <select id="term-device" class="form-input form-select">
                <option value="verifone" ${(term.device || 'verifone') === 'verifone' ? 'selected' : ''}>Verifone</option>
                <option value="spectra" ${term.device === 'spectra' ? 'selected' : ''}>Spectra</option>
                <option value="pax" ${term.device === 'pax' ? 'selected' : ''}>PAX</option>
                <option value="other" ${term.device === 'other' ? 'selected' : ''}>${lang === 'ar' ? 'أخرى' : 'Other'}</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">${lang === 'ar' ? 'معرّف الجهاز (اختياري)' : 'Terminal ID (optional)'}</label>
              <input type="text" id="term-tid" class="form-input" value="${term.terminalId || ''}" placeholder="${lang === 'ar' ? 'يُملأ تلقائياً من الجهاز' : 'Auto-filled from terminal'}">
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:8px;">
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
              <input type="checkbox" id="term-auto-settle" ${term.autoSettle !== false ? 'checked' : ''}>
              <span style="font-size:13px;">${lang === 'ar' ? 'تسوية تلقائية نهاية اليوم' : 'Auto settle end of day'}</span>
            </label>
            <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
              <input type="checkbox" id="term-print-receipt" ${term.terminalPrint !== false ? 'checked' : ''}>
              <span style="font-size:13px;">${lang === 'ar' ? 'طباعة إيصال من الجهاز' : 'Print receipt from terminal'}</span>
            </label>
          </div>

          <div style="display:flex;gap:8px;margin-top:16px;">
            <button class="btn btn-secondary" id="term-test">🔌 ${lang === 'ar' ? 'اختبار الاتصال' : 'Test Connection'}</button>
            <button class="btn btn-secondary" id="term-test-pay">💳 ${lang === 'ar' ? 'دفعة تجريبية (1 ر.س)' : 'Test Payment (1 SAR)'}</button>
          </div>
          <div id="term-status" style="margin-top:8px;font-size:13px;"></div>
        </div>

        <button class="btn btn-primary" id="term-save" style="margin-top:20px;">💾 ${lang === 'ar' ? 'حفظ' : 'Save'}</button>
      </div>

      <div style="margin-top:24px;padding:16px;background:var(--bg-tertiary);border-radius:10px;max-width:600px;">
        <div style="font-weight:600;margin-bottom:8px;">📖 ${lang === 'ar' ? 'خطوات التثبيت:' : 'Setup Steps:'}</div>
        <div style="font-size:12px;line-height:2;color:var(--text-secondary);">
          ${lang === 'ar' ? `
            1. احصل على ملف <code>geidea-ecr-core-web-integration.exe</code> من فريق Geidea<br>
            2. ثبّت الخدمة: افتح CMD كمسؤول واكتب:<br>
            <code style="background:var(--bg-primary);padding:2px 6px;border-radius:4px;">SC CREATE "WEB_ECR" binpath= "C:\\geidea\\geidea-ecr-core-web-integration.exe"</code><br>
            3. افتح services.msc ← ابحث عن WEB_ECR ← اضبطه على "تشغيل تلقائي" ← شغّله<br>
            4. الخدمة تعمل على <code>http://localhost:5000</code><br>
            5. وصّل جهاز الدفع بالكمبيوتر (USB أو شبكة)<br>
            6. اضغط "اختبار الاتصال" للتأكد
          ` : `
            1. Get <code>geidea-ecr-core-web-integration.exe</code> from Geidea team<br>
            2. Install service: Open CMD as admin and run:<br>
            <code style="background:var(--bg-primary);padding:2px 6px;border-radius:4px;">SC CREATE "WEB_ECR" binpath= "C:\\geidea\\geidea-ecr-core-web-integration.exe"</code><br>
            3. Open services.msc → find WEB_ECR → set to "Automatic" → Start<br>
            4. Service runs on <code>http://localhost:5000</code><br>
            5. Connect Geidea terminal to PC (USB or network)<br>
            6. Click "Test Connection" to verify
          `}
        </div>
      </div>
    </div>
  `;

  // Toggle fields
  container.querySelector('#term-enabled').addEventListener('change', (e) => {
    const fields = container.querySelector('#term-fields');
    fields.style.opacity = e.target.checked ? '1' : '0.4';
    fields.style.pointerEvents = e.target.checked ? 'auto' : 'none';
  });

  // Test connection
  container.querySelector('#term-test').addEventListener('click', async () => {
    const statusEl = container.querySelector('#term-status');
    const url = container.querySelector('#term-url').value.trim() || 'http://localhost:5000';
    statusEl.innerHTML = `<span style="color:var(--text-secondary);">⏳ ${lang === 'ar' ? 'جاري الاتصال...' : 'Connecting...'}</span>`;
    const result = await window.daftrly.testTerminal(url);
    if (result.success) {
      statusEl.innerHTML = `<span style="color:var(--success);">✅ ${lang === 'ar' ? 'الجهاز متصل!' : 'Terminal connected!'} ${result.info || ''}</span>`;
    } else {
      statusEl.innerHTML = `<span style="color:var(--danger);">❌ ${lang === 'ar' ? 'فشل الاتصال:' : 'Connection failed:'} ${result.error || 'No response'}</span>`;
    }
  });

  // Test payment
  container.querySelector('#term-test-pay').addEventListener('click', async () => {
    const statusEl = container.querySelector('#term-status');
    const url = container.querySelector('#term-url').value.trim() || 'http://localhost:5000';
    statusEl.innerHTML = `<span style="color:var(--text-secondary);">⏳ ${lang === 'ar' ? 'جاري إرسال دفعة تجريبية...' : 'Sending test payment...'}</span>`;
    const result = await window.daftrly.sendTerminalPayment(url, 1.00, 'TEST-001');
    if (result.success) {
      statusEl.innerHTML = `<span style="color:var(--success);">✅ ${lang === 'ar' ? 'تمت الدفعة التجريبية!' : 'Test payment successful!'} Ref: ${result.referenceNumber || '—'}</span>`;
    } else {
      statusEl.innerHTML = `<span style="color:var(--danger);">❌ ${result.error || 'Failed'}</span>`;
    }
  });

  // Save
  container.querySelector('#term-save').addEventListener('click', async () => {
    const data = {
      enabled: container.querySelector('#term-enabled').checked,
      type: container.querySelector('#term-type').value,
      url: container.querySelector('#term-url').value.trim() || 'http://localhost:5000',
      timeout: parseInt(container.querySelector('#term-timeout').value) || 60,
      device: container.querySelector('#term-device').value,
      terminalId: container.querySelector('#term-tid').value.trim(),
      autoSettle: container.querySelector('#term-auto-settle').checked,
      terminalPrint: container.querySelector('#term-print-receipt').checked,
    };
    await window.daftrly.setSetting('posTerminal', data);
    window.appSettings = await window.daftrly.getSettings();
    showToast(lang === 'ar' ? '✅ تم حفظ إعدادات جهاز الدفع' : '✅ Terminal settings saved', 'success');
  });
}

// ============ RETURNS POLICY ============
function renderReturnsSettings(container, allSettings) {
  const lang = window.i18n.getLang();
  const s = allSettings;

  container.innerHTML = `
    <div class="settings-page fade-in">
      ${settingsHeader('سياسة المرتجعات والخصومات', 'Returns & Discount Policy', 'إعدادات المرتجعات والخصومات', 'Return and discount settings')}
      ${settingsHelpBox(
        'تحكم في صلاحيات الكاشير للخصومات والمرتجعات. الحد الأقصى للخصم يمنع الكاشير من إعطاء خصم كبير بدون موافقتك.',
        'Control cashier permissions for discounts and returns. Max discount prevents cashiers from giving large discounts without your approval.',
        'مثال: الحد الأقصى 20% ← الكاشير يعطي 25% ← يظهر طلب PIN المدير للموافقة. المدير لا يوجد عليه حد.',
        'Example: Max 20% → cashier gives 25% → manager PIN required to approve. Admin has no limit.'
      )}
      <div class="settings-form">
        <div class="settings-note"><strong>${lang === 'ar' ? 'الخصومات' : 'Discounts'}</strong></div>
        ${field('max-discount-percent', 'الحد الأقصى للخصم %', 'Max Discount %', s.maxDiscountPercent || 0, 'number', {
          descAr: '0 = بدون حد. مثال: 20 يعني لا يمكن لأي كاشير إعطاء خصم أكثر من 20% — يحتاج موافقة مدير لتجاوز الحد',
          descEn: '0 = no limit. Example: 20 means no cashier can give more than 20% discount — needs manager approval to exceed'
        })}

        <div class="settings-note" style="margin-top:16px;"><strong>${lang === 'ar' ? 'المرتجعات' : 'Returns'}</strong></div>
        ${field('return-days-limit', 'فترة الاسترجاع (أيام)', 'Return Period (days)', s.returnDaysLimit || 0, 'number', {
          descAr: '0 = بدون حد زمني. أدخل عدد الأيام المسموح بها للاسترجاع بعد البيع',
          descEn: '0 = no time limit. Enter number of days allowed for returns after sale'
        })}
        ${field('return-approval-threshold', 'حد الموافقة', 'Approval Threshold', s.returnApprovalThreshold || 0, 'number', {
          descAr: '0 = بدون موافقة مطلوبة. المرتجعات التي تتجاوز هذا المبلغ تحتاج موافقة المدير (PIN)',
          descEn: '0 = no approval needed. Returns exceeding this amount require manager approval (PIN)'
        })}
        ${field('return-allow-exchange', 'السماح بالاستبدال', 'Allow Exchanges', s.returnAllowExchange !== false, 'toggle', {
          descAr: 'السماح بمبادلة المنتجات المرتجعة بمنتجات أخرى',
          descEn: 'Allow exchanging returned products for other items'
        })}

        <div class="settings-note" style="margin-top:16px;"><strong>${lang === 'ar' ? 'تنبيهات انتهاء الصلاحية' : 'Expiry Alerts'}</strong></div>
        ${field('expiry-alert-days', 'أيام التنبيه قبل الانتهاء', 'Alert days before expiry', s.expiryAlertDays || 30, 'number', {
          descAr: 'عدد الأيام قبل انتهاء صلاحية المنتج لإظهار تنبيه في لوحة التحكم',
          descEn: 'Days before product expiry to show alert on dashboard'
        })}

        ${saveButton()}
      </div>
    </div>
  `;

  container.querySelector('#settings-save-btn').addEventListener('click', async () => {
    await window.daftrly.setSetting('maxDiscountPercent', Number(container.querySelector('#max-discount-percent').value) || 0);
    await window.daftrly.setSetting('returnDaysLimit', Number(container.querySelector('#return-days-limit').value) || 0);
    await window.daftrly.setSetting('returnApprovalThreshold', Number(container.querySelector('#return-approval-threshold').value) || 0);
    await window.daftrly.setSetting('returnAllowExchange', container.querySelector('#return-allow-exchange').checked);
    await window.daftrly.setSetting('expiryAlertDays', Number(container.querySelector('#expiry-alert-days').value) || 30);
    window.appSettings = await window.daftrly.getSettings();
    showToast(lang === 'ar' ? '✅ تم حفظ إعدادات المرتجعات' : '✅ Returns settings saved', 'success');
  });
}

// ============ LOYALTY PROGRAM ============
function renderLoyaltySettings(container, allSettings) {
  const lang = window.i18n.getLang();
  const s = allSettings;
  const loyalty = s.loyalty || {};

  container.innerHTML = `
    <div class="settings-page fade-in">
      ${settingsHeader('برنامج الولاء', 'Loyalty Program', 'إعدادات نقاط الولاء للعملاء', 'Customer loyalty points settings')}
      ${settingsHelpBox(
        'العميل يجمع نقاط مع كل عملية شراء ويستخدمها كخصم في المرات القادمة. يشجع العملاء على العودة.',
        'Customers earn points with every purchase and redeem them as discounts. Encourages repeat visits.',
        'مثال: كل 1 ر.س = نقطة واحدة. كل 100 نقطة = 1 ر.س خصم. عميل اشترى بـ 500 ر.س = جمع 500 نقطة = 5 ر.س خصم في المرة القادمة',
        'Example: 1 SAR = 1 point. 100 points = 1 SAR discount. Customer spends 500 SAR = earns 500 points = 5 SAR off next time'
      )}
      <div class="settings-form">
        ${field('loyalty-enabled', 'تفعيل برنامج الولاء', 'Enable Loyalty Program', loyalty.enabled || false, 'toggle', {
          descAr: 'يكسب العميل نقاط مع كل عملية شراء',
          descEn: 'Customer earns points with every purchase'
        })}
        ${field('loyalty-points-per-sar', 'نقاط لكل ريال', 'Points per SAR', loyalty.pointsPerSar || 1, 'number', {
          descAr: 'عدد النقاط المكتسبة لكل ريال يتم إنفاقه',
          descEn: 'Points earned per SAR spent'
        })}
        ${field('loyalty-point-value', 'قيمة النقطة', 'Point Value (SAR)', loyalty.pointValue || 0.01, 'number', {
          descAr: 'قيمة كل نقطة عند الاستبدال بالريال',
          descEn: 'Value of each point when redeemed in SAR'
        })}
        ${field('loyalty-min-redeem', 'الحد الأدنى للاستبدال', 'Min Points to Redeem', loyalty.minRedeem || 100, 'number', {
          descAr: 'الحد الأدنى من النقاط المطلوبة للاستبدال',
          descEn: 'Minimum points required to redeem'
        })}
        ${saveButton()}
      </div>
    </div>
  `;

  container.querySelector('#settings-save-btn').addEventListener('click', async () => {
    const loyaltyData = {
      enabled: container.querySelector('#loyalty-enabled').checked,
      pointsPerSar: Number(container.querySelector('#loyalty-points-per-sar').value) || 1,
      pointValue: Number(container.querySelector('#loyalty-point-value').value) || 0.01,
      minRedeem: Number(container.querySelector('#loyalty-min-redeem').value) || 100,
    };
    await window.daftrly.setSetting('loyalty', loyaltyData);
    window.appSettings = await window.daftrly.getSettings();
    showToast(lang === 'ar' ? '✅ تم حفظ إعدادات الولاء' : '✅ Loyalty settings saved', 'success');
  });
}

// ============ BRANCHES ============
function renderBranchSettings(container, allSettings) {
  const lang = window.i18n.getLang();
  const branches = allSettings.branches || [{ id: 1, name_ar: 'الفرع الرئيسي', name_en: 'Main Branch' }];

  container.innerHTML = `
    <div class="settings-page fade-in">
      ${settingsHeader('الفروع', 'Branches', 'إدارة فروع المتجر', 'Manage store branches')}
      <div class="settings-form">
        <div style="margin-bottom:16px;">
          <button class="btn btn-primary" id="add-branch-btn">+ ${lang === 'ar' ? 'فرع جديد' : 'New Branch'}</button>
        </div>
        <div id="branches-list">
          ${branches.map((b, i) => `
            <div style="background:var(--bg-secondary);padding:12px;border-radius:8px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;">
              <div>
                <strong>${lang === 'ar' ? b.name_ar : (b.name_en || b.name_ar)}</strong>
                ${i === 0 ? `<span style="font-size:11px;color:var(--accent);"> (${lang === 'ar' ? 'الافتراضي' : 'Default'})</span>` : ''}
              </div>
              ${i > 0 ? `<button class="btn btn-secondary btn-sm" data-remove-branch="${i}" style="color:var(--danger);">🗑</button>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  container.querySelector('#add-branch-btn').addEventListener('click', async () => {
    const nameAr = await window.daftrlyPrompt(lang === 'ar' ? 'اسم الفرع (عربي)' : 'Branch Name (Arabic)', lang === 'ar' ? 'مثال: فرع الرياض' : 'e.g. Riyadh Branch');
    if (!nameAr) return;
    const nameEn = await window.daftrlyPrompt(lang === 'ar' ? 'اسم الفرع (إنجليزي)' : 'Branch Name (English)', 'Optional');
    branches.push({ id: branches.length + 1, name_ar: nameAr, name_en: nameEn || '' });
    await window.daftrly.setSetting('branches', branches);
    showToast(lang === 'ar' ? '✅ تمت إضافة الفرع' : '✅ Branch added', 'success');
    renderBranchSettings(container, { ...allSettings, branches });
  });

  container.querySelectorAll('[data-remove-branch]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = parseInt(btn.dataset.removeBranch);
      branches.splice(idx, 1);
      await window.daftrly.setSetting('branches', branches);
      showToast(lang === 'ar' ? 'تم حذف الفرع' : 'Branch removed', 'success');
      renderBranchSettings(container, { ...allSettings, branches });
    });
  });
}

// ============ ZATCA E-INVOICING ============
function renderZatcaSettings(container, s) {
  const lang = window.i18n.getLang();
  
  container.innerHTML = `
    <div class="settings-page fade-in">
      ${settingsHeader('الفوترة الإلكترونية (ZATCA)', 'E-Invoicing (ZATCA)', 'إعداد الفوترة الإلكترونية حسب متطلبات هيئة الزكاة والضريبة', 'Configure e-invoicing as required by ZATCA')}
      <div class="settings-form">
        ${field('zatca-mode', 'الوضع', 'Mode', s.zatcaMode || 'off', 'select', {
          options: [
            { value: 'off', labelAr: 'إيقاف', labelEn: 'Off' },
            { value: 'phase1', labelAr: 'المرحلة 1 — رمز QR على الفاتورة', labelEn: 'Phase 1 — QR code on invoice' },
            { value: 'phase2_sandbox', labelAr: 'المرحلة 2 — تجريبي', labelEn: 'Phase 2 — Sandbox' },
            { value: 'phase2', labelAr: 'المرحلة 2 — إنتاج', labelEn: 'Phase 2 — Production' },
          ]
        })}

        <div id="zatca-phase1-note" style="display:none;">
          <div class="settings-note">
            ${lang === 'ar' ? 'رمز QR يُضاف تلقائياً على كل فاتورة. لا يحتاج إنترنت.' : 'QR code is added automatically to every invoice. No internet required.'}
          </div>
        </div>

        <div id="zatca-phase2-section" style="display:none;">
          <div class="settings-note" style="background:var(--accent-subtle);border:1px solid var(--accent);">
            <strong>${lang === 'ar' ? 'خطوات التفعيل:' : 'Activation steps:'}</strong><br>
            ${lang === 'ar' 
              ? '1. ادخل على بوابة فاتورة: zatca.gov.sa<br>2. اختر "تسجيل جهاز جديد"<br>3. انسخ رمز OTP<br>4. الصقه أدناه واضغط "تفعيل"'
              : '1. Go to Fatoora portal: zatca.gov.sa<br>2. Choose "Onboard new device"<br>3. Copy the OTP code<br>4. Paste it below and click "Activate"'}
          </div>
          
          <div class="form-group">
            <label class="form-label">${lang === 'ar' ? 'رمز OTP' : 'OTP Code'}</label>
            <div style="display:flex;gap:8px;">
              <input type="text" id="zatca-otp" class="form-input" placeholder="${lang === 'ar' ? '6 أرقام' : '6 digits'}" maxlength="6" style="flex:1;">
              <button class="btn btn-primary" id="zatca-onboard-btn">${lang === 'ar' ? '🔗 تفعيل' : '🔗 Activate'}</button>
            </div>
            <div style="margin-top:8px;padding:10px 12px;background:rgba(212,168,83,0.12);border:1px solid rgba(212,168,83,0.3);border-radius:8px;font-size:12px;line-height:1.6;">
              <strong style="color:#D4A853;">⚠️ ${lang === 'ar' ? 'مهم:' : 'Important:'}</strong>
              ${lang === 'ar' 
                ? 'بعد إدخال رمز OTP، اضغط <strong>حفظ</strong> أولاً ثم اضغط <strong>تفعيل</strong>. تأكد أيضاً من إدخال الرقم الضريبي في معلومات النشاط التجاري.'
                : 'After entering the OTP code, click <strong>Save</strong> first, then click <strong>Activate</strong>. Also make sure the VAT number is entered in Business Info.'}
            </div>
          </div>

          <div id="zatca-status-area"></div>
        </div>

        ${saveButton()}
      </div>
    </div>
  `;

  // Show/hide sections based on mode
  const modeSelect = container.querySelector('#zatca-mode');
  const phase1Note = container.querySelector('#zatca-phase1-note');
  const phase2Section = container.querySelector('#zatca-phase2-section');
  const statusArea = container.querySelector('#zatca-status-area');

  function updateVisibility() {
    const mode = modeSelect.value;
    phase1Note.style.display = mode === 'phase1' ? 'block' : 'none';
    phase2Section.style.display = (mode === 'phase2' || mode === 'phase2_sandbox') ? 'block' : 'none';
  }
  modeSelect.addEventListener('change', updateVisibility);
  updateVisibility();

  // Load current ZATCA status
  async function loadStatus() {
    const status = await window.daftrly.zatcaGetStatus();
    if (status.status === 'active') {
      statusArea.innerHTML = `
        <div class="settings-note" style="background:rgba(16,185,129,0.1);border:1px solid var(--success);">
          <strong style="color:var(--success);">✅ ${lang === 'ar' ? 'متصل ونشط' : 'Connected & Active'}</strong><br>
          ${lang === 'ar' ? 'تاريخ التفعيل:' : 'Onboarded:'} ${status.onboardedAt ? status.onboardedAt.substring(0, 10) : '-'}<br>
          ${lang === 'ar' ? 'ينتهي في:' : 'Expires:'} ${status.expiresAt ? status.expiresAt.substring(0, 10) : '-'} (${status.daysLeft} ${lang === 'ar' ? 'يوم متبقي' : 'days left'})<br>
          ${lang === 'ar' ? 'فواتير مرسلة:' : 'Invoices reported:'} ${status.invoiceCounter || 0}
        </div>`;
    } else if (status.status === 'expiring_soon') {
      statusArea.innerHTML = `
        <div class="settings-note" style="background:rgba(245,158,11,0.1);border:1px solid var(--warning);">
          <strong style="color:var(--warning);">⚠️ ${lang === 'ar' ? 'ينتهي قريباً' : 'Expiring Soon'}</strong><br>
          ${status.daysLeft} ${lang === 'ar' ? 'يوم متبقي. يرجى التجديد قبل انتهاء الصلاحية.' : 'days left. Please renew before expiry.'}
        </div>`;
    } else if (status.status === 'expired') {
      statusArea.innerHTML = `
        <div class="settings-note" style="background:rgba(239,68,68,0.1);border:1px solid var(--danger);">
          <strong style="color:var(--danger);">❌ ${lang === 'ar' ? 'منتهي الصلاحية' : 'Expired'}</strong><br>
          ${lang === 'ar' ? 'يرجى إعادة التفعيل بالحصول على رمز OTP جديد.' : 'Please re-activate with a new OTP.'}
        </div>`;
    }
  }
  loadStatus();

  // Onboard button
  container.querySelector('#zatca-onboard-btn').addEventListener('click', async () => {
    const otp = container.querySelector('#zatca-otp').value.trim();
    if (!otp || otp.length !== 6 || !/^\d+$/.test(otp)) {
      showToast(lang === 'ar' ? 'أدخل رمز OTP صحيح (6 أرقام)' : 'Enter a valid OTP (6 digits)', 'error');
      return;
    }

    const btn = container.querySelector('#zatca-onboard-btn');
    btn.disabled = true;
    btn.textContent = lang === 'ar' ? '⏳ جاري التفعيل...' : '⏳ Activating...';

    window.dbg('save', 'ZATCA onboarding started...', { otp: otp.substring(0, 2) + '****' });

    try {
      const result = await window.daftrly.zatcaOnboard(otp);
      if (result.success) {
        window.dbg('success', 'ZATCA onboarded!', result);
        showToast(lang === 'ar' ? '✅ تم الربط مع هيئة الزكاة والضريبة بنجاح!' : '✅ Successfully connected to ZATCA!', 'success');
        loadStatus();
      } else {
        window.dbg('error', 'ZATCA onboarding failed', result.error);
        showToast(lang === 'ar' ? 'فشل التفعيل: ' + result.error : 'Activation failed: ' + result.error, 'error');
      }
    } catch (e) {
      window.dbg('error', 'ZATCA onboarding exception', e.message);
      showToast(lang === 'ar' ? 'خطأ: ' + e.message : 'Error: ' + e.message, 'error');
    }

    btn.disabled = false;
    btn.textContent = lang === 'ar' ? '🔗 تفعيل الربط' : '🔗 Activate';
  });

  // Save mode
  container.querySelector('#settings-save-btn').addEventListener('click', async () => {
    const mode = container.querySelector('#zatca-mode').value;
    window.dbg('save', 'ZATCA: saving mode...', { mode });
    await window.daftrly.setSetting('zatcaMode', mode);
    window.appSettings = await window.daftrly.getSettings();
    window.dbg('success', 'ZATCA mode saved');
    showToast(lang === 'ar' ? 'تم حفظ إعدادات الفوترة' : 'E-invoicing settings saved', 'success');
  });
}

// ============ BACKUP SETTINGS ============
async function renderBackupSettings(container, s) {
  const bk = s.backup || {};
  const lang = window.i18n.getLang();
  
  // Get DB size and last backup date
  const sizeRes = await window.daftrly.getDbSize();
  const dbBytes = sizeRes.success ? sizeRes.bytes : 0;
  const dbSizeMB = (dbBytes / (1024 * 1024)).toFixed(1);
  
  const lastBkRes = await window.daftrly.getLastBackupDate();
  const lastBkDate = lastBkRes.success && lastBkRes.date ? lastBkRes.date : null;
  const lastBkStr = lastBkDate ? lastBkDate.substring(0, 10) : (lang === 'ar' ? 'لم يتم بعد' : 'Never');
  const daysSinceBackup = lastBkDate ? Math.floor((Date.now() - new Date(lastBkDate).getTime()) / 86400000) : 999;

  container.innerHTML = `
    <div class="settings-page fade-in">
      ${settingsHeader('النسخ الاحتياطي وتصدير البيانات', 'Backup & Data Export', 'حماية بياناتك وتصدير السجلات التجارية', 'Protect your data and export business records')}
      ${settingsHelpBox(
        'النسخ الاحتياطي يحفظ جميع بياناتك في ملف واحد. تصدير السجلات ينشئ ملفات Excel يمكن لمحاسبك قراءتها.',
        'Backup saves all your data in one file. Records export creates Excel files your accountant can read.',
        'ننصح بعمل نسخة احتياطية يومياً على الأقل وتصدير السجلات شهرياً.',
        'We recommend daily backups and monthly records export.'
      )}

      <!-- Database Info -->
      <div style="display:flex;gap:16px;margin-bottom:24px;flex-wrap:wrap;">
        <div style="flex:1;min-width:200px;background:var(--bg-secondary);padding:16px;border-radius:10px;text-align:center;">
          <div style="font-size:28px;font-weight:900;color:var(--accent);">${dbSizeMB} MB</div>
          <div style="font-size:12px;color:var(--text-secondary);">${lang === 'ar' ? 'حجم قاعدة البيانات' : 'Database Size'}</div>
        </div>
        <div style="flex:1;min-width:200px;background:var(--bg-secondary);padding:16px;border-radius:10px;text-align:center;">
          <div style="font-size:28px;font-weight:900;color:${daysSinceBackup > 3 ? 'var(--danger)' : 'var(--success)'};">${lastBkStr}</div>
          <div style="font-size:12px;color:var(--text-secondary);">${lang === 'ar' ? 'آخر نسخة احتياطية' : 'Last Backup'}</div>
          ${daysSinceBackup > 3 ? `<div style="font-size:11px;color:var(--danger);margin-top:4px;">⚠️ ${lang === 'ar' ? `منذ ${daysSinceBackup} يوم!` : `${daysSinceBackup} days ago!`}</div>` : ''}
        </div>
      </div>

      <!-- Section 1: Manual Backup/Restore -->
      <div style="background:var(--bg-secondary);padding:20px;border-radius:12px;margin-bottom:20px;">
        <h3 style="margin-bottom:12px;">💾 ${lang === 'ar' ? 'النسخ الاحتياطي والاستعادة' : 'Backup & Restore'}</h3>
        <div style="display:flex;gap:12px;flex-wrap:wrap;">
          <button class="btn btn-primary" id="backup-now-btn">💾 ${lang === 'ar' ? 'نسخ احتياطي الآن' : 'Backup Now'}</button>
          <button class="btn btn-secondary" id="restore-btn">📥 ${lang === 'ar' ? 'استعادة من نسخة' : 'Restore from Backup'}</button>
        </div>
      </div>

      <!-- Section 2: Auto Backup Settings -->
      <div style="background:var(--bg-secondary);padding:20px;border-radius:12px;margin-bottom:20px;">
        <h3 style="margin-bottom:12px;">⏰ ${lang === 'ar' ? 'النسخ الاحتياطي التلقائي' : 'Auto Backup Settings'}</h3>
        <div style="display:grid;gap:12px;">
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="checkbox" id="bk-auto" ${bk.autoEnabled ? 'checked' : ''}>
            <span style="font-weight:600;">${lang === 'ar' ? 'تفعيل النسخ الاحتياطي التلقائي اليومي' : 'Enable daily auto backup'}</span>
          </label>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;" id="bk-auto-fields" ${!bk.autoEnabled ? 'style="opacity:0.4;pointer-events:none;"' : ''}>
            <div class="form-group">
              <label class="form-label">${lang === 'ar' ? 'الساعة' : 'Time'}</label>
              <input type="time" id="bk-time" class="form-input" value="${bk.autoTime || '02:00'}">
            </div>
            <div class="form-group">
              <label class="form-label">${lang === 'ar' ? 'الاحتفاظ بآخر' : 'Keep last'}</label>
              <select id="bk-keep" class="form-input form-select">
                ${[3,5,7,10,14,30].map(n => `<option value="${n}" ${(bk.keepCount || 7) == n ? 'selected' : ''}>${n} ${lang === 'ar' ? 'نسخ' : 'backups'}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">${lang === 'ar' ? 'المجلد' : 'Folder'}</label>
              <input type="text" id="bk-location" class="form-input" value="${bk.location || ''}" placeholder="${lang === 'ar' ? 'D:\\backup' : 'D:\\backup'}">
            </div>
          </div>
          <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="checkbox" id="bk-reminder" ${bk.reminderEnabled !== false ? 'checked' : ''}>
            <span>${lang === 'ar' ? 'تذكير عند عدم النسخ لأكثر من' : 'Remind if no backup for'}</span>
            <select id="bk-reminder-days" class="form-input form-select" style="width:auto;">
              ${[1,2,3,5,7].map(n => `<option value="${n}" ${(bk.reminderDays || 3) == n ? 'selected' : ''}>${n} ${lang === 'ar' ? 'أيام' : 'days'}</option>`).join('')}
            </select>
          </label>
        </div>
        <button class="btn btn-primary btn-sm" id="bk-save" style="margin-top:12px;">💾 ${lang === 'ar' ? 'حفظ الإعدادات' : 'Save Settings'}</button>
      </div>

      <!-- Section 3: Business Records Export -->
      <div style="background:var(--bg-secondary);padding:20px;border-radius:12px;">
        <h3 style="margin-bottom:4px;">📤 ${lang === 'ar' ? 'تصدير السجلات التجارية' : 'Export Business Records'}</h3>
        <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">
          ${lang === 'ar' ? 'تصدير جميع البيانات كملفات Excel — المبيعات، المنتجات، العملاء، المصروفات، الضريبة، الموردين، التصنيفات، المرتجعات' : 'Export all data as Excel files — sales, products, customers, expenses, VAT, suppliers, categories, returns'}
        </p>
        <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:12px;">
          ${lang === 'ar' ? 'يتم تصدير 9 ملفات Excel:' : '9 Excel files exported:'}
          ${lang === 'ar' 
            ? 'المبيعات، بنود المبيعات، المنتجات، التصنيفات، العملاء، المصروفات، ملخص الضريبة، المرتجعات، الموردين'
            : 'Sales, Sale Items, Products, Categories, Customers, Expenses, VAT Summary, Returns, Suppliers'}
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap;">
          <span style="font-size:13px;">${lang === 'ar' ? 'الفترة:' : 'Period:'}</span>
          <input type="date" id="exp-from" class="form-input" style="width:auto;font-size:12px;">
          <span>→</span>
          <input type="date" id="exp-to" class="form-input" style="width:auto;font-size:12px;">
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="btn btn-primary" id="exp-all">📤 ${lang === 'ar' ? 'تصدير الكل' : 'Export All'}</button>
          <button class="btn btn-secondary" id="exp-month">📤 ${lang === 'ar' ? 'الشهر الحالي' : 'This Month'}</button>
          <button class="btn btn-secondary" id="exp-year">📤 ${lang === 'ar' ? 'السنة الحالية' : 'This Year'}</button>
        </div>
        <div id="exp-result" style="margin-top:12px;"></div>
      </div>
    </div>
  `;

  // Toggle auto fields
  container.querySelector('#bk-auto').addEventListener('change', (e) => {
    const fields = container.querySelector('#bk-auto-fields');
    fields.style.opacity = e.target.checked ? '1' : '0.4';
    fields.style.pointerEvents = e.target.checked ? 'auto' : 'none';
  });

  // Backup now
  container.querySelector('#backup-now-btn').addEventListener('click', async () => {
    const result = await window.daftrly.createBackup();
    if (result.success) {
      showToast(lang === 'ar' ? '✅ تم إنشاء النسخة الاحتياطية' : '✅ Backup created', 'success');
      renderBackupSettings(container, await window.daftrly.getSettings());
    } else if (!result.canceled) {
      showToast(result.error || 'Error', 'error');
    }
  });

  // Restore
  container.querySelector('#restore-btn').addEventListener('click', async () => {
    if (!await window.daftrlyConfirm(lang === 'ar' ? 'سيتم استبدال جميع البيانات الحالية. هل أنت متأكد؟' : 'All current data will be replaced. Are you sure?')) return;
    const result = await window.daftrly.restoreBackup();
    if (result.success) {
      showToast(lang === 'ar' ? '✅ تمت الاستعادة. سيتم إعادة التشغيل.' : '✅ Restored. App will reload.', 'success');
      setTimeout(() => location.reload(), 1500);
    } else if (!result.canceled) {
      showToast(result.error || 'Error', 'error');
    }
  });

  // Save auto settings
  container.querySelector('#bk-save').addEventListener('click', async () => {
    const data = {
      autoEnabled: container.querySelector('#bk-auto').checked,
      autoTime: container.querySelector('#bk-time').value,
      keepCount: parseInt(container.querySelector('#bk-keep').value) || 7,
      location: container.querySelector('#bk-location').value,
      reminderEnabled: container.querySelector('#bk-reminder').checked,
      reminderDays: parseInt(container.querySelector('#bk-reminder-days').value) || 3,
    };
    await window.daftrly.setSetting('backup', data);
    showToast(lang === 'ar' ? '✅ تم حفظ الإعدادات' : '✅ Settings saved', 'success');
  });

  // Export records
  async function doExport(from, to) {
    const resultEl = container.querySelector('#exp-result');
    resultEl.innerHTML = `<div style="color:var(--text-secondary);">⏳ ${lang === 'ar' ? 'جاري التصدير...' : 'Exporting...'}</div>`;
    const result = await window.daftrly.exportRecords(from || '', to || '');
    if (result.success) {
      resultEl.innerHTML = `<div style="color:var(--success);font-weight:600;">✅ ${lang === 'ar' ? `تم تصدير ${result.count} ملفات إلى: ${result.folder}` : `Exported ${result.count} files to: ${result.folder}`}</div>`;
    } else if (!result.canceled) {
      resultEl.innerHTML = `<div style="color:var(--danger);">❌ ${result.error || 'Error'}</div>`;
    } else {
      resultEl.innerHTML = '';
    }
  }

  container.querySelector('#exp-all').addEventListener('click', () => {
    const from = container.querySelector('#exp-from').value;
    const to = container.querySelector('#exp-to').value;
    doExport(from, to);
  });
  container.querySelector('#exp-month').addEventListener('click', () => {
    const now = new Date();
    const from = now.toISOString().substring(0, 8) + '01';
    const to = now.toISOString().substring(0, 10);
    doExport(from, to);
  });
  container.querySelector('#exp-year').addEventListener('click', () => {
    const now = new Date();
    const from = now.getFullYear() + '-01-01';
    const to = now.toISOString().substring(0, 10);
    doExport(from, to);
  });
}

// ============ USERS ============
function renderUsersSettings(container, s) {
  const lang = window.i18n.getLang();
  container.innerHTML = `
    <div class="settings-page fade-in">
      ${settingsHeader('المستخدمين والصلاحيات', 'Users & Permissions', 'إدارة المستخدمين وتحديد صلاحياتهم', 'Manage users and their permissions')}
      <div class="settings-form">
        <div class="settings-note">
          ${lang === 'ar' ? 'إدارة المستخدمين الكاملة ستكون متاحة في وحدة لاحقة. حالياً يوجد مستخدم مدير واحد (PIN: 0000).' : 'Full user management will be available in a later module. Currently there is one admin user (PIN: 0000).'}
        </div>
        <div class="card">
          <div class="card-body" style="display: flex; align-items: center; gap: 16px;">
            <div class="sidebar-user-avatar" style="width:48px;height:48px;font-size:16px;">${lang === 'ar' ? 'مد' : 'AD'}</div>
            <div>
              <div style="font-size:15px;font-weight:600;color:var(--text-primary);">${lang === 'ar' ? 'المدير' : 'Admin'}</div>
              <div style="font-size:13px;color:var(--text-secondary);">PIN: 0000 | ${lang === 'ar' ? 'صلاحيات كاملة' : 'Full permissions'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============ LICENSE ============
function renderLicenseSettings(container, s) {
  const lang = window.i18n.getLang();

  async function renderLicenseContent() {
    const licStatus = await window.daftrly.licenseGetStatus();
    window._licenseStatus = licStatus;

    const statusColor = licStatus.status === 'licensed' ? 'var(--success)' : licStatus.status === 'trial' ? 'var(--warning)' : 'var(--danger)';
    const statusText = licStatus.status === 'licensed'
      ? (lang === 'ar' ? '✅ مفعّل' : '✅ Licensed')
      : licStatus.status === 'trial'
      ? (lang === 'ar' ? '⏳ تجربة مجانية' : '⏳ Free Trial')
      : (lang === 'ar' ? '🔒 منتهي' : '🔒 Expired');

    let trialInfo = '';
    if (licStatus.status === 'trial') {
      const remaining = licStatus.remainingMs || 0;
      const mins = Math.ceil(remaining / 60000);
      const secs = Math.ceil(remaining / 1000);
      const days = Math.ceil(remaining / (24 * 60 * 60 * 1000));
      const timeText = `${days} ${lang === 'ar' ? 'يوم' : (days === 1 ? 'day' : 'days')}`;
      trialInfo = `<div id="lic-timer" style="font-size:13px;color:var(--warning);margin-top:4px;">${lang === 'ar' ? timeText + ' متبقية' : timeText + ' remaining'}</div>`;
    }

    container.innerHTML = `
      <div class="settings-page fade-in">
        ${settingsHeader('الترخيص', 'License', 'تفعيل وإدارة ترخيص التطبيق', 'Activate and manage application license')}
        <div class="settings-form">
          <div class="card" style="margin-bottom:16px;">
            <div class="card-body">
              <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
                <img src="icon-64.png" style="width:48px;height:48px;border-radius:12px;" alt="Naqdi">
                <div>
                  <div style="font-size:18px;font-weight:700;color:var(--text-primary);">Naqdi ${lang === 'ar' ? 'نقدي' : ''}</div>
                  <div style="font-size:13px;color:var(--text-secondary);">${lang === 'ar' ? 'الإصدار' : 'Version'} 2.4</div>
                </div>
              </div>
              <div style="padding:12px;background:var(--bg-secondary);border-radius:var(--radius-md);margin-bottom:12px;">
                <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:4px;">${lang === 'ar' ? 'حالة الترخيص' : 'License Status'}</div>
                <div style="font-size:15px;font-weight:600;color:${statusColor};">${statusText}</div>
                ${trialInfo}
                ${licStatus.status === 'licensed' ? '<div style="font-size:12px;color:var(--text-tertiary);margin-top:4px;">' + (lang === 'ar' ? 'المفتاح:' : 'Key:') + ' ' + (licStatus.licenseKey || '') + '</div>' : ''}
              </div>

              ${licStatus.status !== 'licensed' ? `
                <div style="margin-bottom:16px;">
                  <label class="form-label">${lang === 'ar' ? 'مفتاح الترخيص' : 'License Key'}</label>
                  <div style="display:flex;gap:8px;">
                    <input type="text" id="lic-key-input" class="form-input" placeholder="${lang === 'ar' ? 'أدخل مفتاح الترخيص' : 'Enter license key'}" style="flex:1;font-family:monospace;">
                    <button class="btn btn-primary" id="lic-activate-btn">🔓 ${lang === 'ar' ? 'تفعيل' : 'Activate'}</button>
                  </div>
                  <div id="lic-result" style="margin-top:6px;font-size:12px;min-height:18px;"></div>
                </div>
                <a href="#" id="lic-buy-link" style="display:inline-block;padding:10px 20px;border-radius:8px;background:linear-gradient(135deg,#D4A853,#B8941F);color:#1E293B;text-decoration:none;font-size:13px;font-weight:700;">
                  🛒 ${lang === 'ar' ? 'شراء ترخيص' : 'Buy License'}
                </a>
              ` : `
                <div style="margin-top:12px;">
                  <button class="btn btn-sm" id="lic-deactivate-btn" style="background:var(--danger);color:#fff;border:none;">
                    🗑 ${lang === 'ar' ? 'إلغاء تفعيل الترخيص' : 'Deactivate License'}
                  </button>
                  <div style="font-size:11px;color:var(--text-tertiary);margin-top:6px;">
                    ${lang === 'ar' ? 'تحذير: الإلغاء نهائي — ستحتاج مفتاح جديد' : 'Warning: Deactivation is permanent — you will need a new key'}
                  </div>
                </div>
              `}
            </div>
          </div>
          <div style="font-size:12px;color:var(--text-tertiary);padding:8px;">
            ${lang === 'ar' ? 'شركة أساس البحث التجارية المحدودة — info@asassearch.com' : 'Asas Albahth Commercial Company — info@asassearch.com'}
          </div>
        </div>
      </div>
    `;

    // Live timer update for trial
    if (licStatus.status === 'trial') {
      const timerInterval = setInterval(async () => {
        const fresh = await window.daftrly.licenseGetStatus();
        const el = container.querySelector('#lic-timer');
        if (!el) { clearInterval(timerInterval); return; }
        if (fresh.status !== 'trial') { clearInterval(timerInterval); renderLicenseContent(); return; }
        const rem = fresh.remainingMs || 0;
        const m = Math.ceil(rem / 60000);
        const sc = Math.ceil(rem / 1000);
        const d = Math.ceil(rem / (24 * 60 * 60 * 1000));
        const tt = `${d} ${lang === 'ar' ? 'يوم' : (d === 1 ? 'day' : 'days')}`;
        el.textContent = lang === 'ar' ? tt + ' متبقية' : tt + ' remaining';
      }, 5000);
    }

    container.querySelector('#lic-buy-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      window.daftrly.openExternal('https://essentialsmarket.online/en/products/RtOjkDRNDaggXfM2gtyO');
    });

    container.querySelector('#lic-activate-btn')?.addEventListener('click', async () => {
      const key = container.querySelector('#lic-key-input')?.value.trim();
      const res = container.querySelector('#lic-result');
      const btn = container.querySelector('#lic-activate-btn');
      if (!key) { res.innerHTML = '<span style="color:var(--danger);">' + (lang === 'ar' ? 'أدخل المفتاح' : 'Enter key') + '</span>'; return; }
      btn.disabled = true; btn.textContent = '⏳ ...'; res.innerHTML = '';
      const result = await window.daftrly.licenseActivate(key);
      if (result.success) {
        res.innerHTML = '<span style="color:var(--success);">✅ ' + (lang === 'ar' ? 'تم التفعيل!' : 'Activated!') + '</span>';
        const banner = document.getElementById('trial-banner');
        if (banner) { clearInterval(banner._interval); banner.remove(); document.body.style.paddingTop = '0'; }
        window._licenseStatus = { status: 'licensed' };
        setTimeout(() => renderLicenseContent(), 1500);
      } else {
        btn.disabled = false; btn.textContent = lang === 'ar' ? '🔓 تفعيل' : '🔓 Activate';
        res.innerHTML = '<span style="color:var(--danger);">❌ ' + (result.error || 'Failed') + '</span>' + (result.debug ? '<br><span style="font-size:10px;color:var(--text-tertiary);word-break:break-all;">' + result.debug + '</span>' : '');
      }
    });

    container.querySelector('#lic-deactivate-btn')?.addEventListener('click', async () => {
      const confirmed = await window.daftrlyConfirm(
        lang === 'ar' ? 'هل تريد إلغاء تفعيل الترخيص؟ ستحتاج شراء مفتاح جديد.' : 'Deactivate? You will need a new key.'
      );
      if (!confirmed) return;
      await window.daftrly.licenseDeactivate();
      window.location.reload();
    });
  }

  renderLicenseContent();
}

// ============ PLU BARCODE SETTINGS ============
function renderPLUSettings(container, allSettings) {
  const lang = window.i18n.getLang();
  const plu = allSettings.plu || {};

  container.innerHTML = `
    <div class="settings-page fade-in">
      <div class="settings-header">
        <h2>${lang === 'ar' ? '🏷 باركود الوزن (PLU)' : '🏷 PLU Barcode (Weight/Price Embedded)'}</h2>
        <p style="color:var(--text-secondary);font-size:13px;">
          ${lang === 'ar' ? 'لمنتجات الوزن مثل الفواكه والخضروات — يقرأ الوزن أو السعر من الباركود المطبوع من الميزان' : 'For weighed products like fruits & vegetables — reads weight or price from the scale-printed barcode'}
        </p>
      </div>

      ${settingsHelpBox(
        'هل لديك ميزان يطبع ملصقات باركود على المنتجات الموزونة؟ هذا الإعداد يجعل النظام يقرأ الوزن تلقائياً من الباركود بدون إدخال يدوي.',
        'Do you have a scale that prints barcode labels on weighed products? This setting lets the system read the weight automatically from the barcode — no manual entry needed.',
        'كيف يعمل: تفاح بسعر 10 ر.س/كجم ← العميل يضع 1.5 كجم على الميزان ← الميزان يطبع ملصق باركود ← الكاشير يمسح الملصق ← النظام يضيف: تفاح × 1.5 كجم = 15 ر.س',
        'How it works: Apple at 10 SAR/kg → customer puts 1.5 kg on scale → scale prints barcode label → cashier scans label → system adds: Apple × 1.5 kg = 15 SAR'
      )}

      <div class="settings-section" style="max-width:600px;">
        <div class="form-group">
          <label class="form-label" style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" id="plu-enabled" ${plu.enabled ? 'checked' : ''}>
            <span style="font-weight:700;">${lang === 'ar' ? 'تفعيل باركود الوزن' : 'Enable PLU Barcode'}</span>
          </label>
          <div style="font-size:12px;color:var(--text-tertiary);margin-top:4px;">
            ${lang === 'ar' ? 'عند التفعيل، النظام يتعرف تلقائياً على باركود EAN-13 الذي يحتوي وزن أو سعر المنتج' : 'When enabled, the system auto-detects EAN-13 barcodes with embedded weight or price'}
          </div>
        </div>

        <div id="plu-fields" style="${plu.enabled ? '' : 'opacity:0.4;pointer-events:none;'}">
          <div class="form-group" style="margin-top:16px;">
            <label class="form-label">${lang === 'ar' ? 'بادئة الوزن (مفصولة بفاصلة)' : 'Weight Prefixes (comma-separated)'}</label>
            <input type="text" id="plu-weight-prefixes" class="form-input" value="${plu.weightPrefixes || '20,21,22,23,24,25,26,27,28'}" placeholder="20,21,22,23,24,25,26,27,28">
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;">
              ${lang === 'ar' ? 'باركود يبدأ بهذه الأرقام يُعتبر باركود وزن' : 'Barcodes starting with these digits are treated as weight barcodes'}
            </div>
          </div>

          <div class="form-group">
            <label class="form-label">${lang === 'ar' ? 'بادئة السعر' : 'Price Prefixes'}</label>
            <input type="text" id="plu-price-prefixes" class="form-input" value="${plu.pricePrefixes || '29'}" placeholder="29">
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;">
              ${lang === 'ar' ? 'باركود يبدأ بهذه الأرقام يُعتبر باركود سعر' : 'Barcodes starting with these digits are treated as price barcodes'}
            </div>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
            <div class="form-group">
              <label class="form-label">${lang === 'ar' ? 'طول كود المنتج' : 'Product Code Length'}</label>
              <select id="plu-code-length" class="form-input form-select">
                <option value="4" ${(plu.codeLength || 5) == 4 ? 'selected' : ''}>4 ${lang === 'ar' ? 'أرقام' : 'digits'}</option>
                <option value="5" ${(plu.codeLength || 5) == 5 ? 'selected' : ''}>5 ${lang === 'ar' ? 'أرقام' : 'digits'}</option>
                <option value="6" ${(plu.codeLength || 5) == 6 ? 'selected' : ''}>6 ${lang === 'ar' ? 'أرقام' : 'digits'}</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">${lang === 'ar' ? 'طول قيمة الوزن' : 'Value Length'}</label>
              <select id="plu-value-length" class="form-input form-select">
                <option value="4" ${(plu.valueLength || 5) == 4 ? 'selected' : ''}>4 ${lang === 'ar' ? 'أرقام' : 'digits'}</option>
                <option value="5" ${(plu.valueLength || 5) == 5 ? 'selected' : ''}>5 ${lang === 'ar' ? 'أرقام' : 'digits'}</option>
                <option value="6" ${(plu.valueLength || 5) == 6 ? 'selected' : ''}>6 ${lang === 'ar' ? 'أرقام' : 'digits'}</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">${lang === 'ar' ? 'مقسوم الوزن' : 'Weight Divisor'}</label>
              <select id="plu-divisor" class="form-input form-select">
                <option value="1000" ${(plu.valueDivisor || 1000) == 1000 ? 'selected' : ''}>÷1000 (${lang === 'ar' ? 'جرام → كجم' : 'g → kg'})</option>
                <option value="100" ${(plu.valueDivisor || 1000) == 100 ? 'selected' : ''}>÷100</option>
                <option value="10" ${(plu.valueDivisor || 1000) == 10 ? 'selected' : ''}>÷10</option>
              </select>
            </div>
          </div>

          <div style="margin-top:16px;padding:16px;background:var(--bg-tertiary);border-radius:10px;">
            <div style="font-weight:600;margin-bottom:8px;">${lang === 'ar' ? '📖 مثال:' : '📖 Example:'}</div>
            <div style="font-size:12px;line-height:1.8;color:var(--text-secondary);">
              ${lang === 'ar' ? 'باركود:' : 'Barcode:'} <code style="background:var(--bg-primary);padding:2px 6px;border-radius:4px;font-weight:700;">2812345015000</code><br>
              ${lang === 'ar' ? 'البادئة:' : 'Prefix:'} <strong>28</strong> → ${lang === 'ar' ? 'باركود وزن' : 'weight barcode'}<br>
              ${lang === 'ar' ? 'كود المنتج:' : 'Product code:'} <strong>12345</strong><br>
              ${lang === 'ar' ? 'الوزن:' : 'Weight:'} <strong>01500</strong> ÷ 1000 = <strong>1.500 ${lang === 'ar' ? 'كجم' : 'kg'}</strong><br>
              ${lang === 'ar' ? 'النتيجة: يبحث عن منتج بباركود 12345 ويضيفه بوزن 1.5 كجم' : 'Result: finds product with barcode 12345 and adds it with weight 1.5 kg'}
            </div>
          </div>
        </div>

        <button class="btn btn-primary" id="plu-save" style="margin-top:20px;">
          ${lang === 'ar' ? '💾 حفظ' : '💾 Save'}
        </button>
      </div>
    </div>
  `;

  // Toggle fields visibility
  container.querySelector('#plu-enabled').addEventListener('change', (e) => {
    container.querySelector('#plu-fields').style.opacity = e.target.checked ? '1' : '0.4';
    container.querySelector('#plu-fields').style.pointerEvents = e.target.checked ? 'auto' : 'none';
  });

  // Save
  container.querySelector('#plu-save').addEventListener('click', async () => {
    const pluSettings = {
      enabled: container.querySelector('#plu-enabled').checked,
      weightPrefixes: container.querySelector('#plu-weight-prefixes').value.trim(),
      pricePrefixes: container.querySelector('#plu-price-prefixes').value.trim(),
      codeLength: container.querySelector('#plu-code-length').value,
      valueLength: container.querySelector('#plu-value-length').value,
      valueDivisor: container.querySelector('#plu-divisor').value,
    };
    await window.daftrly.setSetting('plu', pluSettings);
    window.appSettings = await window.daftrly.getSettings();
    showToast(lang === 'ar' ? '✅ تم حفظ إعدادات PLU' : '✅ PLU settings saved', 'success');
  });
}

// ============ GIFT CARDS MANAGEMENT ============
async function renderGiftCardSettings(container) {
  const lang = window.i18n.getLang();
  const allS = await window.daftrly.getSettings();
  const gcEnabled = allS.giftCardsEnabled !== false;
  const biz = allS.business || {};

  function generateCode() {
    return 'GC-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substring(2, 6).toUpperCase();
  }

  function printCodesOnly(cards) {
    const w = window.open('', '_blank', 'width=400,height=600');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><style>
      body{font-family:monospace;margin:20px;color:#000;}
      h3{font-family:'Noto Sans Arabic',sans-serif;text-align:center;margin-bottom:16px;}
      .row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee;font-size:14px;}
      .code{font-weight:700;letter-spacing:1px;} .amt{color:#2563EB;font-weight:700;}
      @media print{body{margin:8px;}}
    </style></head><body>
      <h3>${escapeAttr(biz.nameAr || 'نقدي')} — ${lang === 'ar' ? 'أكواد بطاقات الهدايا' : 'Gift Card Codes'}</h3>
      ${cards.map(c => `<div class="row"><span class="code">${c.code}</span><span class="amt">${Number(c.amount).toFixed(2)} ${window.getCurrSym()}</span>${c.expiry ? `<span style="font-size:11px;color:#666;">${c.expiry}</span>` : ''}</div>`).join('')}
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  }

  function printReceipts(cards) {
    const w = window.open('', '_blank', 'width=350,height=600');
    if (!w) return;
    w.document.write(`<!DOCTYPE html><html><head><style>
      body{font-family:'Noto Sans Arabic',sans-serif;width:280px;margin:0 auto;color:#000;}
      .card{text-align:center;padding:16px 0;page-break-after:always;}
      .card:last-child{page-break-after:auto;}
      .shop{font-size:13px;font-weight:700;} .sub{font-size:10px;color:#666;}
      .title{font-size:16px;font-weight:700;margin:10px 0 6px;color:#D4A853;}
      .code{font-size:22px;font-weight:700;letter-spacing:2px;background:#f5f5f5;padding:10px;border-radius:8px;margin:10px 0;font-family:monospace;}
      .amount{font-size:26px;font-weight:700;color:#2563EB;margin:6px 0;}
      .info{font-size:10px;color:#666;margin:3px 0;}
      .line{border-top:1px dashed #ccc;margin:10px 0;}
      @media print{body{margin:0;}}
    </style></head><body>
      ${cards.map(c => `<div class="card">
        <div class="shop">${escapeAttr(biz.nameAr || 'نقدي')}</div>
        ${biz.nameEn ? `<div class="sub">${escapeAttr(biz.nameEn)}</div>` : ''}
        <div class="line"></div>
        <div class="title">🎁 ${lang === 'ar' ? 'بطاقة هدية' : 'Gift Card'}</div>
        <div class="code">${c.code}</div>
        <div class="amount">${Number(c.amount).toFixed(2)} ${window.getCurrSym()}</div>
        ${c.expiry ? `<div class="info">${lang === 'ar' ? 'صالحة حتى:' : 'Valid until:'} ${c.expiry}</div>` : ''}
        <div class="line"></div>
        <div class="info">${lang === 'ar' ? 'قدّم هذا الرمز عند الدفع' : 'Present this code at checkout'}</div>
        ${biz.phone ? `<div class="info">📞 ${biz.phone}</div>` : ''}
      </div>`).join('')}
    </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 300);
  }

  async function loadCards() {
    const res = await window.daftrly.query('SELECT gc.*, c.name_ar as cust_name FROM gift_cards gc LEFT JOIN customers c ON gc.customer_id=c.id ORDER BY gc.created_at DESC');
    const cards = res.success ? (res.data || []) : [];

    const cardsHtml = cards.length > 0 ? cards.map(gc => {
      const expired = gc.expiry_date && new Date(gc.expiry_date) < new Date();
      const statusLabel = gc.status !== 'active' ? (lang === 'ar' ? '🚫 معطلة' : '🚫 Inactive')
        : expired ? (lang === 'ar' ? '⏰ منتهية' : '⏰ Expired')
        : (lang === 'ar' ? '✅ نشطة' : '✅ Active');
      return `<tr>
        <td><input type="checkbox" class="gc-select" data-code="${gc.code}" data-amount="${gc.initial_balance}" data-expiry="${gc.expiry_date || ''}" style="width:16px;height:16px;"></td>
        <td style="font-family:var(--font-mono);font-weight:600;">${gc.code}</td>
        <td>${formatCurrency(gc.initial_balance)}</td>
        <td style="font-weight:700;color:${gc.balance > 0 ? 'var(--success)' : 'var(--text-tertiary)'}">${formatCurrency(gc.balance)}</td>
        <td>${gc.cust_name || '—'}</td>
        <td>${statusLabel}</td>
        <td>${gc.expiry_date || '—'}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-secondary btn-sm" data-action="gc-history" data-id="${gc.id}">${lang === 'ar' ? 'السجل' : 'Log'}</button>
          ${gc.status === 'active' ? `<button class="btn btn-secondary btn-sm" data-action="gc-deactivate" data-id="${gc.id}" style="color:var(--danger);">✕</button>` : ''}
        </td>
      </tr>`;
    }).join('') : `<tr><td colspan="8" style="text-align:center;color:var(--text-tertiary);padding:20px;">${lang === 'ar' ? 'لا توجد بطاقات هدايا' : 'No gift cards yet'}</td></tr>`;

    container.querySelector('#gc-table-body').innerHTML = cardsHtml;

    // Select all checkbox
    const selectAll = container.querySelector('#gc-select-all');
    if (selectAll) {
      selectAll.addEventListener('change', () => {
        container.querySelectorAll('.gc-select').forEach(cb => { cb.checked = selectAll.checked; });
      });
    }

    // Bind deactivate
    container.querySelectorAll('[data-action="gc-deactivate"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const ok = await window.daftrlyConfirm(lang === 'ar' ? 'تعطيل هذه البطاقة؟' : 'Deactivate this card?');
        if (!ok) return;
        await window.daftrly.query('UPDATE gift_cards SET status=? WHERE id=?', ['inactive', parseInt(btn.dataset.id)]);
        window.logAudit('gift_card_deactivate', 'gift_cards', parseInt(btn.dataset.id), '');
        showToast(lang === 'ar' ? '✅ تم التعطيل' : '✅ Deactivated', 'success');
        loadCards();
      });
    });

    // Bind history
    container.querySelectorAll('[data-action="gc-history"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const txRes = await window.daftrly.query('SELECT * FROM gift_card_transactions WHERE card_id=? ORDER BY created_at DESC LIMIT 20', [parseInt(btn.dataset.id)]);
        const txs = txRes.success ? (txRes.data || []) : [];
        const html = txs.length > 0 ? txs.map(t => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--border-primary);font-size:12px;">
          <span>${t.type === 'issue' ? '🎁' : t.type === 'redeem' ? '💳' : '↩'} ${t.type}</span>
          <span style="color:${t.type === 'redeem' ? 'var(--danger)' : 'var(--success)'}">${t.type === 'redeem' ? '-' : '+'}${formatCurrency(t.amount)}</span>
          <span style="color:var(--text-tertiary);">${t.created_at?.substring(0, 16) || ''}</span>
        </div>`).join('') : `<div style="text-align:center;color:var(--text-tertiary);padding:12px;">${lang === 'ar' ? 'لا توجد عمليات' : 'No transactions'}</div>`;
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.style.cssText = 'display:flex;position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.5);align-items:center;justify-content:center;';
        overlay.innerHTML = `<div class="modal" style="max-width:400px;width:95%;"><div class="modal-header"><h3>${lang === 'ar' ? 'سجل العمليات' : 'Transaction History'}</h3><button class="modal-close" id="gc-hist-close">✕</button></div><div class="modal-body" style="padding:12px;max-height:300px;overflow-y:auto;">${html}</div></div>`;
        document.body.appendChild(overlay);
        overlay.querySelector('#gc-hist-close').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
      });
    });
  }

  function getSelectedCards() {
    const selected = [];
    container.querySelectorAll('.gc-select:checked').forEach(cb => {
      selected.push({ code: cb.dataset.code, amount: cb.dataset.amount, expiry: cb.dataset.expiry || null });
    });
    return selected;
  }

  container.innerHTML = `
    <div class="settings-page fade-in">
      ${settingsHeader('بطاقات الهدايا', 'Gift Cards', 'إصدار وإدارة بطاقات الهدايا', 'Issue and manage gift cards')}
      <div class="settings-form">
        <!-- Enable toggle -->
        <div style="margin-bottom:16px;">
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;">
            <input type="checkbox" id="gc-enabled" ${gcEnabled ? 'checked' : ''} style="width:18px;height:18px;">
            <strong>${lang === 'ar' ? 'تفعيل بطاقات الهدايا' : 'Enable Gift Cards'}</strong>
          </label>
        </div>

        <!-- Issue section -->
        <div style="background:var(--bg-secondary);padding:14px;border-radius:10px;margin-bottom:16px;">
          <div style="font-weight:600;font-size:13px;margin-bottom:10px;">${lang === 'ar' ? 'إصدار بطاقات جديدة' : 'Issue New Cards'}</div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <input type="text" inputmode="decimal" id="gc-amount" class="form-input" placeholder="${lang === 'ar' ? 'المبلغ' : 'Amount'}" style="width:110px;">
            <input type="text" inputmode="numeric" id="gc-qty" class="form-input" placeholder="${lang === 'ar' ? 'العدد' : 'Qty'}" value="1" style="width:70px;">
            <input type="date" id="gc-expiry" class="form-input" style="width:140px;">
            <button class="btn btn-primary btn-sm" id="gc-issue-btn">🎁 ${lang === 'ar' ? 'إصدار' : 'Issue'}</button>
          </div>
        </div>

        <!-- Print actions for selected cards -->
        <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;align-items:center;">
          <span style="font-size:12px;color:var(--text-secondary);" id="gc-selected-count"></span>
          <button class="btn btn-secondary btn-sm" id="gc-print-codes" disabled>🖨 ${lang === 'ar' ? 'طباعة الأكواد فقط' : 'Print Codes Only'}</button>
          <button class="btn btn-secondary btn-sm" id="gc-print-receipts" disabled>🎁 ${lang === 'ar' ? 'طباعة إيصالات' : 'Print Receipts'}</button>
        </div>

        <!-- Table -->
        <table class="data-table">
          <thead><tr>
            <th style="width:30px;"><input type="checkbox" id="gc-select-all" style="width:16px;height:16px;"></th>
            <th>${lang === 'ar' ? 'الرمز' : 'Code'}</th>
            <th>${lang === 'ar' ? 'المبلغ' : 'Amount'}</th>
            <th>${lang === 'ar' ? 'الرصيد' : 'Balance'}</th>
            <th>${lang === 'ar' ? 'العميل' : 'Customer'}</th>
            <th>${lang === 'ar' ? 'الحالة' : 'Status'}</th>
            <th>${lang === 'ar' ? 'الصلاحية' : 'Expiry'}</th>
            <th></th>
          </tr></thead>
          <tbody id="gc-table-body"></tbody>
        </table>
      </div>
    </div>
  `;

  // Enable/disable toggle
  container.querySelector('#gc-enabled').addEventListener('change', async (e) => {
    await window.daftrly.setSetting('giftCardsEnabled', e.target.checked);
    window.appSettings = await window.daftrly.getSettings();
    showToast(lang === 'ar'
      ? (e.target.checked ? '✅ تم تفعيل بطاقات الهدايا' : '⛔ تم تعطيل بطاقات الهدايا')
      : (e.target.checked ? '✅ Gift cards enabled' : '⛔ Gift cards disabled'), 'success');
  });

  // Update selected count and button states
  function updatePrintBtns() {
    const count = getSelectedCards().length;
    const countEl = container.querySelector('#gc-selected-count');
    const codesBtn = container.querySelector('#gc-print-codes');
    const rcptBtn = container.querySelector('#gc-print-receipts');
    if (countEl) countEl.textContent = count > 0 ? (lang === 'ar' ? `${count} محدد` : `${count} selected`) : '';
    if (codesBtn) codesBtn.disabled = count === 0;
    if (rcptBtn) rcptBtn.disabled = count === 0;
  }
  container.addEventListener('change', (e) => {
    if (e.target.classList?.contains('gc-select') || e.target.id === 'gc-select-all') updatePrintBtns();
  });

  // Print codes only
  container.querySelector('#gc-print-codes').addEventListener('click', () => {
    const sel = getSelectedCards();
    if (sel.length === 0) return;
    printCodesOnly(sel);
  });

  // Print styled receipts
  container.querySelector('#gc-print-receipts').addEventListener('click', () => {
    const sel = getSelectedCards();
    if (sel.length === 0) return;
    printReceipts(sel);
  });

  // Issue cards (single or bulk)
  container.querySelector('#gc-issue-btn').addEventListener('click', async () => {
    const amount = parseFloat(container.querySelector('#gc-amount').value);
    if (!amount || amount <= 0) { showToast(lang === 'ar' ? 'أدخل مبلغ صحيح' : 'Enter a valid amount', 'error'); return; }
    const qty = Math.min(100, Math.max(1, parseInt(container.querySelector('#gc-qty').value) || 1));
    const expiry = container.querySelector('#gc-expiry').value || null;

    const codes = [];
    for (let i = 0; i < qty; i++) {
      const code = generateCode();
      // Tiny delay between codes to ensure unique timestamps
      if (i > 0) await new Promise(r => setTimeout(r, 2));
      await window.daftrly.query('INSERT INTO gift_cards (code, initial_balance, balance, expiry_date) VALUES (?,?,?,?)', [code, amount, amount, expiry]);
      const cardRes = await window.daftrly.query('SELECT last_insert_rowid() as id');
      const cardId = cardRes.success && cardRes.data?.[0] ? cardRes.data[0].id : null;
      if (cardId) {
        await window.daftrly.query('INSERT INTO gift_card_transactions (card_id, type, amount, notes) VALUES (?,?,?,?)', [cardId, 'issue', amount, 'Initial issue']);
      }
      window.logAudit('gift_card_issue', 'gift_cards', cardId, `${code} | ${amount}`);
      codes.push({ code, amount, expiry });
    }

    container.querySelector('#gc-amount').value = '';
    container.querySelector('#gc-qty').value = '1';
    loadCards();

    showToast(lang === 'ar' ? `✅ تم إصدار ${codes.length} بطاقة` : `✅ ${codes.length} card(s) issued`, 'success');
  });

  loadCards();
}

// ============ PROMOTIONS ENGINE ============
async function renderPromotionsSettings(container) {
  const lang = window.i18n.getLang();
  const allS = await window.daftrly.getSettings();
  const promoEnabled = allS.promotionsEnabled !== false;

  async function loadPromos() {
    const res = await window.daftrly.query("SELECT p.*, bp.name_ar as buy_name, gp.name_ar as get_name FROM promotions p LEFT JOIN products bp ON p.buy_product_id=bp.id LEFT JOIN products gp ON p.get_product_id=gp.id WHERE p.promo_type != 'coupon' OR p.promo_type IS NULL ORDER BY p.is_active DESC, p.created_at DESC");
    const promos = res.success ? (res.data || []).filter(p => p.promo_type && p.promo_type !== 'coupon') : [];

    const html = promos.length > 0 ? promos.map(p => {
      const typeLabel = p.promo_type === 'buy_x_get_y' ? (lang === 'ar' ? 'اشتر X واحصل Y' : 'Buy X Get Y')
        : p.promo_type === 'auto_discount' ? (lang === 'ar' ? 'خصم تلقائي' : 'Auto Discount')
        : p.promo_type;
      const detail = p.promo_type === 'buy_x_get_y'
        ? `${lang === 'ar' ? 'اشتر' : 'Buy'} ${p.buy_quantity}× ${p.buy_name || '?'} → ${lang === 'ar' ? 'احصل' : 'Get'} ${p.get_quantity}× ${p.get_name || '?'} (${p.get_discount}% ${lang === 'ar' ? 'خصم' : 'off'})`
        : `${p.type === 'percentage' ? p.value + '%' : formatCurrency(p.value)} ${lang === 'ar' ? 'خصم' : 'off'}${p.min_purchase > 0 ? ` — ${lang === 'ar' ? 'حد أدنى' : 'Min'}: ${formatCurrency(p.min_purchase)}` : ''}`;
      const active = p.is_active ? (lang === 'ar' ? '✅ نشط' : '✅ Active') : (lang === 'ar' ? '⛔ متوقف' : '⛔ Inactive');
      return `<div style="background:var(--bg-secondary);padding:14px;border-radius:10px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
        <div style="flex:1;min-width:200px;">
          <div style="font-weight:700;font-size:14px;">${escapeAttr(p.name_ar)} ${p.name_en ? '(' + escapeAttr(p.name_en) + ')' : ''}</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${typeLabel} — ${detail}</div>
          <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;">${active}${p.end_date ? ` | ${lang === 'ar' ? 'ينتهي' : 'Ends'}: ${p.end_date}` : ''}${p.auto_apply ? ` | 🔄 ${lang === 'ar' ? 'تلقائي' : 'Auto'}` : ''}</div>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-secondary btn-sm" data-toggle-promo="${p.id}">${p.is_active ? '⏸' : '▶'}</button>
          <button class="btn btn-secondary btn-sm" data-delete-promo="${p.id}" style="color:var(--danger);">🗑</button>
        </div>
      </div>`;
    }).join('') : `<div style="text-align:center;padding:30px;color:var(--text-tertiary);font-size:13px;">${lang === 'ar' ? 'لا توجد عروض' : 'No promotions yet'}</div>`;

    container.querySelector('#promo-list').innerHTML = html;

    container.querySelectorAll('[data-toggle-promo]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = parseInt(btn.dataset.togglePromo);
        await window.daftrly.query('UPDATE promotions SET is_active = CASE WHEN is_active=1 THEN 0 ELSE 1 END WHERE id=?', [id]);
        loadPromos();
      });
    });
    container.querySelectorAll('[data-delete-promo]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!await window.daftrlyConfirm(lang === 'ar' ? 'حذف هذا العرض؟' : 'Delete this promotion?')) return;
        await window.daftrly.query('DELETE FROM promotions WHERE id=?', [parseInt(btn.dataset.deletePromo)]);
        loadPromos();
      });
    });
  }

  container.innerHTML = `
    <div class="settings-page fade-in">
      ${settingsHeader('العروض والتخفيضات', 'Promotions & Offers', 'إنشاء عروض تلقائية — اشتر X واحصل Y، خصومات تلقائية', 'Create auto-apply offers — Buy X Get Y, automatic discounts')}
      <div class="settings-form">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;">
            <input type="checkbox" id="promo-enabled" ${promoEnabled ? 'checked' : ''} style="width:18px;height:18px;">
            <strong>${lang === 'ar' ? 'تفعيل العروض' : 'Enable Promotions'}</strong>
          </label>
          <button class="btn btn-primary btn-sm" id="promo-add">+ ${lang === 'ar' ? 'عرض جديد' : 'New Promotion'}</button>
        </div>
        <div id="promo-list"></div>
      </div>
    </div>
  `;

  // Enable toggle
  container.querySelector('#promo-enabled').addEventListener('change', async (e) => {
    await window.daftrly.setSetting('promotionsEnabled', e.target.checked);
    window.appSettings = await window.daftrly.getSettings();
    showToast(lang === 'ar' ? (e.target.checked ? '✅ تم تفعيل العروض' : '⛔ تم تعطيل العروض') : (e.target.checked ? '✅ Promotions enabled' : '⛔ Promotions disabled'), 'success');
  });

  // Add promotion modal
  container.querySelector('#promo-add').addEventListener('click', async () => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `<div class="modal" style="max-width:480px;width:95%;max-height:85vh;overflow-y:auto;">
      <div class="modal-header"><h3>${lang === 'ar' ? 'عرض جديد' : 'New Promotion'}</h3><button class="modal-close" id="promo-modal-close">✕</button></div>
      <div class="modal-body" style="padding:16px;">
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'اسم العرض (عربي) *' : 'Promotion Name (Arabic) *'}</label>
          <input type="text" id="pm-name-ar" class="form-input" placeholder="${lang === 'ar' ? 'مثال: عرض رمضان' : 'e.g. Ramadan Offer'}">
        </div>
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'اسم العرض (إنجليزي)' : 'Promotion Name (English)'}</label>
          <input type="text" id="pm-name-en" class="form-input" placeholder="${lang === 'ar' ? 'اختياري' : 'Optional'}">
        </div>
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'نوع العرض *' : 'Promotion Type *'}</label>
          <select id="pm-promo-type" class="form-input form-select">
            <option value="buy_x_get_y">${lang === 'ar' ? '🎁 اشتر X واحصل على Y' : '🎁 Buy X Get Y'}</option>
            <option value="auto_discount">${lang === 'ar' ? '💰 خصم تلقائي على المنتج' : '💰 Auto Discount on Product'}</option>
          </select>
        </div>
        <div id="pm-bxgy-fields">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">${lang === 'ar' ? 'المنتج المطلوب شراؤه' : 'Product to Buy'}</label>
              <input type="text" id="pm-buy-search" class="form-input" placeholder="${lang === 'ar' ? 'ابحث عن منتج...' : 'Search product...'}">
              <input type="hidden" id="pm-buy-id">
              <div id="pm-buy-result" style="font-size:12px;color:var(--success);margin-top:4px;"></div>
            </div>
            <div class="form-group">
              <label class="form-label">${lang === 'ar' ? 'الكمية المطلوبة' : 'Required Qty'}</label>
              <input type="text" inputmode="numeric" id="pm-buy-qty" class="form-input" value="1">
            </div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">${lang === 'ar' ? 'المنتج المجاني / المخفض' : 'Free/Discounted Product'}</label>
              <input type="text" id="pm-get-search" class="form-input" placeholder="${lang === 'ar' ? 'ابحث عن منتج...' : 'Search product...'}">
              <input type="hidden" id="pm-get-id">
              <div id="pm-get-result" style="font-size:12px;color:var(--success);margin-top:4px;"></div>
            </div>
            <div class="form-group">
              <label class="form-label">${lang === 'ar' ? 'الكمية المجانية' : 'Free Qty'}</label>
              <input type="text" inputmode="numeric" id="pm-get-qty" class="form-input" value="1">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">${lang === 'ar' ? 'نسبة الخصم على المنتج المجاني' : 'Discount % on free product'}</label>
            <input type="text" inputmode="decimal" id="pm-get-discount" class="form-input" value="100" placeholder="100 = free">
            <div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;">${lang === 'ar' ? '100 = مجاني تماماً، 50 = نصف السعر' : '100 = completely free, 50 = half price'}</div>
          </div>
        </div>
        <div id="pm-auto-fields" style="display:none;">
          <div class="form-group">
            <label class="form-label">${lang === 'ar' ? 'المنتج' : 'Product'}</label>
            <input type="text" id="pm-auto-search" class="form-input" placeholder="${lang === 'ar' ? 'ابحث عن منتج...' : 'Search product...'}">
            <input type="hidden" id="pm-auto-id">
            <div id="pm-auto-result" style="font-size:12px;color:var(--success);margin-top:4px;"></div>
          </div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">${lang === 'ar' ? 'نوع الخصم' : 'Discount Type'}</label>
              <select id="pm-disc-type" class="form-input form-select">
                <option value="percentage">${lang === 'ar' ? 'نسبة %' : 'Percentage %'}</option>
                <option value="fixed">${lang === 'ar' ? 'مبلغ ثابت' : 'Fixed Amount'}</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">${lang === 'ar' ? 'القيمة' : 'Value'}</label>
              <input type="text" inputmode="decimal" id="pm-disc-value" class="form-input" value="10">
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">${lang === 'ar' ? 'الحد الأدنى للشراء' : 'Minimum Purchase'}</label>
            <input type="text" inputmode="decimal" id="pm-min-purchase" class="form-input" value="0">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">${lang === 'ar' ? 'تاريخ البداية' : 'Start Date'}</label>
            <input type="date" id="pm-start" class="form-input">
          </div>
          <div class="form-group">
            <label class="form-label">${lang === 'ar' ? 'تاريخ النهاية' : 'End Date'}</label>
            <input type="date" id="pm-end" class="form-input">
          </div>
        </div>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;margin-top:8px;">
          <input type="checkbox" id="pm-auto-apply" checked style="width:16px;height:16px;">
          ${lang === 'ar' ? 'تطبيق تلقائي عند البيع' : 'Auto-apply at checkout'}
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="promo-modal-cancel">${lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
        <button class="btn btn-primary" id="promo-modal-save">${lang === 'ar' ? 'حفظ العرض' : 'Save Promotion'}</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    overlay.querySelector('#promo-modal-close').addEventListener('click', closeModal);
    overlay.querySelector('#promo-modal-cancel').addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    // Type toggle
    overlay.querySelector('#pm-promo-type').addEventListener('change', (e) => {
      overlay.querySelector('#pm-bxgy-fields').style.display = e.target.value === 'buy_x_get_y' ? 'block' : 'none';
      overlay.querySelector('#pm-auto-fields').style.display = e.target.value === 'auto_discount' ? 'block' : 'none';
    });

    // Product search helpers
    async function searchProduct(input, resultEl, hiddenInput) {
      const q = input.value.trim();
      if (q.length < 2) return;
      const like = '%' + q + '%';
      const res = await window.daftrly.query("SELECT id, name_ar, name_en, price FROM products WHERE is_active=1 AND (name_ar LIKE ? OR name_en LIKE ? OR barcode LIKE ?) LIMIT 5", [like, like, like]);
      if (res.success && res.data?.length) {
        const p = res.data[0];
        hiddenInput.value = p.id;
        resultEl.textContent = `✅ ${p.name_ar} — ${formatCurrency(p.price)}`;
        if (res.data.length > 1) resultEl.textContent += ` (+${res.data.length - 1})`;
      } else {
        hiddenInput.value = '';
        resultEl.textContent = lang === 'ar' ? '❌ لم يتم العثور' : '❌ Not found';
      }
    }
    ['pm-buy-search', 'pm-get-search', 'pm-auto-search'].forEach(id => {
      const input = overlay.querySelector('#' + id);
      if (input) {
        const resultId = id.replace('-search', '-result');
        const hiddenId = id.replace('-search', '-id');
        input.addEventListener('input', () => searchProduct(input, overlay.querySelector('#' + resultId), overlay.querySelector('#' + hiddenId)));
      }
    });

    // Save
    overlay.querySelector('#promo-modal-save').addEventListener('click', async () => {
      const nameAr = overlay.querySelector('#pm-name-ar').value.trim();
      if (!nameAr) { showToast(lang === 'ar' ? 'أدخل اسم العرض' : 'Enter promotion name', 'error'); return; }
      const nameEn = overlay.querySelector('#pm-name-en').value.trim();
      const promoType = overlay.querySelector('#pm-promo-type').value;
      const startDate = overlay.querySelector('#pm-start').value || null;
      const endDate = overlay.querySelector('#pm-end').value || null;
      const autoApply = overlay.querySelector('#pm-auto-apply').checked ? 1 : 0;

      if (promoType === 'buy_x_get_y') {
        const buyId = parseInt(overlay.querySelector('#pm-buy-id').value) || 0;
        const getIdVal = parseInt(overlay.querySelector('#pm-get-id').value) || 0;
        if (!buyId || !getIdVal) { showToast(lang === 'ar' ? 'اختر المنتجات' : 'Select products', 'error'); return; }
        await window.daftrly.query(
          `INSERT INTO promotions (name_ar, name_en, type, value, promo_type, buy_product_id, buy_quantity, get_product_id, get_quantity, get_discount, auto_apply, start_date, end_date)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [nameAr, nameEn, 'percentage', 0, promoType, buyId,
           parseInt(overlay.querySelector('#pm-buy-qty').value) || 1, getIdVal,
           parseInt(overlay.querySelector('#pm-get-qty').value) || 1,
           parseFloat(overlay.querySelector('#pm-get-discount').value) || 100,
           autoApply, startDate, endDate]);
      } else {
        const productId = parseInt(overlay.querySelector('#pm-auto-id').value) || 0;
        const discType = overlay.querySelector('#pm-disc-type').value;
        const discValue = parseFloat(overlay.querySelector('#pm-disc-value').value) || 0;
        const minPurchase = parseFloat(overlay.querySelector('#pm-min-purchase').value) || 0;
        await window.daftrly.query(
          `INSERT INTO promotions (name_ar, name_en, type, value, promo_type, product_id, min_purchase, auto_apply, start_date, end_date)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [nameAr, nameEn, discType, discValue, promoType, productId, minPurchase, autoApply, startDate, endDate]);
      }
      window.logAudit('promo_create', 'promotions', null, nameAr);
      showToast(lang === 'ar' ? '✅ تم إنشاء العرض' : '✅ Promotion created', 'success');
      closeModal();
      loadPromos();
    });
  });

  loadPromos();
}

// ============ COUPONS MANAGEMENT ============
async function renderCouponsSettings(container) {
  const lang = window.i18n.getLang();
  const allS = await window.daftrly.getSettings();
  const couponsEnabled = allS.couponsEnabled !== false; // default enabled
  const res = await window.daftrly.query('SELECT * FROM promotions ORDER BY is_active DESC, created_at DESC');
  const coupons = res.success ? (res.data || []) : [];

  container.innerHTML = `
    <div class="settings-page fade-in">
      <div class="settings-header" style="display:flex;justify-content:space-between;align-items:center;">
        <div>
          <h2>${lang === 'ar' ? '🎟 كوبونات الخصم' : '🎟 Discount Coupons'}</h2>
          <p style="color:var(--text-secondary);font-size:13px;">${lang === 'ar' ? 'إنشاء وإدارة أكواد الخصم التي يستخدمها الكاشير عند البيع' : 'Create and manage discount codes used by cashiers at checkout'}</p>
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;">
            <input type="checkbox" id="coupons-enabled" ${couponsEnabled ? 'checked' : ''} style="width:18px;height:18px;">
            ${lang === 'ar' ? 'تفعيل الكوبونات' : 'Enable Coupons'}
          </label>
          <button class="btn btn-primary btn-sm" id="coupon-add">+ ${lang === 'ar' ? 'كوبون جديد' : 'New Coupon'}</button>
        </div>
      </div>

      ${settingsHelpBox(
        'أنشئ أكواد خصم يكتبها العميل عند الشراء. يمكنك تحديد نوع الخصم (نسبة أو مبلغ ثابت)، حد أدنى للشراء، وفترة صلاحية.',
        'Create discount codes customers use at checkout. Set discount type (percentage or fixed amount), minimum purchase, and validity period.',
        'مثال: كود "خصم10" — خصم 10% — حد أدنى 50 ر.س — ينتهي 31/12/2026. الكاشير يكتب الكود فقط — لا يستطيع إنشاء أو تعديل الأكواد.',
        'Example: Code "SAVE10" — 10% off — min 50 SAR — expires 31/12/2026. Cashier can only enter codes — cannot create or edit them.'
      )}

      ${coupons.length === 0 ? `
        <div style="text-align:center;padding:40px;color:var(--text-tertiary);">
          <div style="font-size:48px;opacity:0.15;margin-bottom:12px;">🎟</div>
          <div>${lang === 'ar' ? 'لا توجد كوبونات. أنشئ أول كوبون.' : 'No coupons. Create your first one.'}</div>
        </div>
      ` : `
        <table class="data-table" style="margin-top:12px;">
          <thead><tr>
            <th>${lang === 'ar' ? 'الكود' : 'Code'}</th>
            <th>${lang === 'ar' ? 'الخصم' : 'Discount'}</th>
            <th>${lang === 'ar' ? 'الحد الأدنى' : 'Min Purchase'}</th>
            <th>${lang === 'ar' ? 'الصلاحية' : 'Validity'}</th>
            <th>${lang === 'ar' ? 'الحالة' : 'Status'}</th>
            <th></th>
          </tr></thead>
          <tbody>
            ${coupons.map(c => {
              const isExpired = c.end_date && new Date(c.end_date) < new Date();
              const status = !c.is_active ? (lang === 'ar' ? 'معطّل' : 'Disabled') : isExpired ? (lang === 'ar' ? 'منتهي' : 'Expired') : (lang === 'ar' ? 'نشط' : 'Active');
              const statusColor = !c.is_active ? 'var(--text-tertiary)' : isExpired ? 'var(--danger)' : 'var(--success)';
              return `<tr style="${!c.is_active ? 'opacity:0.5;' : ''}">
                <td style="font-family:var(--font-mono);font-weight:700;font-size:13px;">${_escU(c.name_en || c.name_ar)}</td>
                <td>${c.type === 'percent' ? c.value + '%' : c.value.toFixed(2) + ' ' + window.getCurrSym()}</td>
                <td>${c.min_purchase > 0 ? c.min_purchase.toFixed(2) : '—'}</td>
                <td style="font-size:11px;">${c.start_date || '—'} → ${c.end_date || (lang === 'ar' ? 'بدون حد' : 'No limit')}</td>
                <td style="font-weight:600;color:${statusColor};">${status}</td>
                <td style="display:flex;gap:4px;">
                  <button class="btn btn-secondary btn-sm" data-edit-coupon="${c.id}">✏️</button>
                  <button class="btn btn-secondary btn-sm" data-toggle-coupon="${c.id}" data-active="${c.is_active}">${c.is_active ? '⏸' : '▶'}</button>
                  <button class="btn btn-secondary btn-sm" data-delete-coupon="${c.id}" style="color:var(--danger);">🗑</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      `}
    </div>
  `;

  // Enable/disable coupons toggle
  container.querySelector('#coupons-enabled').addEventListener('change', async (e) => {
    await window.daftrly.setSetting('couponsEnabled', e.target.checked);
    window.appSettings = await window.daftrly.getSettings();
    showToast(lang === 'ar'
      ? (e.target.checked ? '✅ تم تفعيل الكوبونات' : '⛔ تم تعطيل الكوبونات')
      : (e.target.checked ? '✅ Coupons enabled' : '⛔ Coupons disabled'), 'success');
  });

  // Add coupon
  container.querySelector('#coupon-add').addEventListener('click', () => openCouponModal(container, null));

  // Edit
  container.querySelectorAll('[data-edit-coupon]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.editCoupon);
      const r = await window.daftrly.query('SELECT * FROM promotions WHERE id = ?', [id]);
      if (r.success && r.data?.[0]) openCouponModal(container, r.data[0]);
    });
  });

  // Toggle active
  container.querySelectorAll('[data-toggle-coupon]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.toggleCoupon);
      const newVal = btn.dataset.active === '1' ? 0 : 1;
      await window.daftrly.query('UPDATE promotions SET is_active = ? WHERE id = ?', [newVal, id]);
      renderCouponsSettings(container);
    });
  });

  // Delete
  container.querySelectorAll('[data-delete-coupon]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const confirmed = await window.daftrlyConfirm(lang === 'ar' ? 'حذف هذا الكوبون نهائياً؟' : 'Delete this coupon permanently?');
      if (!confirmed) return;
      await window.daftrly.query('DELETE FROM promotions WHERE id = ?', [parseInt(btn.dataset.deleteCoupon)]);
      showToast(lang === 'ar' ? '✅ تم الحذف' : '✅ Deleted', 'success');
      renderCouponsSettings(container);
    });
  });
}

function openCouponModal(container, coupon) {
  const lang = window.i18n.getLang();
  const isEdit = !!coupon;
  const c = coupon || { name_ar: '', name_en: '', type: 'percent', value: 10, min_purchase: 0, start_date: '', end_date: '', is_active: 1 };

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:500px;width:95%;">
      <div class="modal-header">
        <h3>${isEdit ? (lang === 'ar' ? 'تعديل الكوبون' : 'Edit Coupon') : (lang === 'ar' ? 'كوبون جديد' : 'New Coupon')}</h3>
        <button class="modal-close" id="cpn-close">✕</button>
      </div>
      <div class="modal-body" style="padding:20px;">
        <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label class="form-label">${lang === 'ar' ? 'كود الكوبون (عربي) *' : 'Coupon Code (Arabic) *'}</label>
            <input type="text" id="cpn-name-ar" class="form-input" value="${c.name_ar}" placeholder="${lang === 'ar' ? 'مثال: خصم10' : 'e.g. SAVE10'}" style="text-transform:uppercase;">
          </div>
          <div class="form-group">
            <label class="form-label">${lang === 'ar' ? 'كود الكوبون (إنجليزي)' : 'Coupon Code (English)'}</label>
            <input type="text" id="cpn-name-en" class="form-input" value="${c.name_en || ''}" placeholder="${lang === 'ar' ? 'مثال: SAVE10' : 'e.g. SAVE10'}" style="text-transform:uppercase;">
          </div>
        </div>
        <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label class="form-label">${lang === 'ar' ? 'نوع الخصم' : 'Discount Type'}</label>
            <select id="cpn-type" class="form-input form-select">
              <option value="percent" ${c.type === 'percent' ? 'selected' : ''}>% ${lang === 'ar' ? 'نسبة مئوية' : 'Percentage'}</option>
              <option value="fixed" ${c.type === 'fixed' ? 'selected' : ''}>${lang === 'ar' ? 'مبلغ ثابت' : 'Fixed Amount'}</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">${lang === 'ar' ? 'القيمة *' : 'Value *'}</label>
            <input type="text" inputmode="decimal" id="cpn-value" class="form-input" value="${c.value}">
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">${lang === 'ar' ? 'الحد الأدنى للشراء' : 'Minimum Purchase'}</label>
          <input type="text" inputmode="decimal" id="cpn-min" class="form-input" value="${c.min_purchase || 0}" placeholder="0 = ${lang === 'ar' ? 'بدون حد' : 'no minimum'}">
        </div>
        <div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label class="form-label">${lang === 'ar' ? 'تاريخ البداية' : 'Start Date'}</label>
            <input type="date" id="cpn-start" class="form-input" value="${c.start_date || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">${lang === 'ar' ? 'تاريخ الانتهاء' : 'End Date'}</label>
            <input type="date" id="cpn-end" class="form-input" value="${c.end_date || ''}">
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" id="cpn-cancel">${lang === 'ar' ? 'إلغاء' : 'Cancel'}</button>
        <button class="btn btn-primary" id="cpn-save">${isEdit ? (lang === 'ar' ? 'تحديث' : 'Update') : (lang === 'ar' ? 'إنشاء' : 'Create')}</button>
      </div>
    </div>
  `;

  overlay.style.display = 'flex';
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('#cpn-close').addEventListener('click', close);
  overlay.querySelector('#cpn-cancel').addEventListener('click', close);

  overlay.querySelector('#cpn-save').addEventListener('click', async () => {
    const nameAr = overlay.querySelector('#cpn-name-ar').value.trim();
    const nameEn = overlay.querySelector('#cpn-name-en').value.trim();
    const type = overlay.querySelector('#cpn-type').value;
    const value = parseFloat(overlay.querySelector('#cpn-value').value) || 0;
    const minPurchase = parseFloat(overlay.querySelector('#cpn-min').value) || 0;
    const startDate = overlay.querySelector('#cpn-start').value || null;
    const endDate = overlay.querySelector('#cpn-end').value || null;

    if (!nameAr) {
      showToast(lang === 'ar' ? 'أدخل كود الكوبون' : 'Enter coupon code', 'error');
      return;
    }
    if (value <= 0) {
      showToast(lang === 'ar' ? 'أدخل قيمة الخصم' : 'Enter discount value', 'error');
      return;
    }
    if (type === 'percent' && value > 100) {
      showToast(lang === 'ar' ? 'النسبة لا تتجاوز 100%' : 'Percentage cannot exceed 100%', 'error');
      return;
    }

    if (isEdit) {
      await window.daftrly.query(
        'UPDATE promotions SET name_ar=?, name_en=?, type=?, value=?, min_purchase=?, start_date=?, end_date=? WHERE id=?',
        [nameAr, nameEn || nameAr, type, value, minPurchase, startDate, endDate, coupon.id]);
      showToast(lang === 'ar' ? '✅ تم تحديث الكوبون' : '✅ Coupon updated', 'success');
    } else {
      await window.daftrly.query(
        'INSERT INTO promotions (name_ar, name_en, type, value, min_purchase, start_date, end_date) VALUES (?,?,?,?,?,?,?)',
        [nameAr, nameEn || nameAr, type, value, minPurchase, startDate, endDate]);
      showToast(lang === 'ar' ? '✅ تم إنشاء الكوبون' : '✅ Coupon created', 'success');
    }

    close();
    renderCouponsSettings(container);
  });
}

// Make renderSettings globally accessible
window.renderSettings = renderSettings;
window.setSettingsActiveTab = function(tabId) { settingsActiveTab = tabId; };

// ============ STOCK ADJUSTMENT ============
async function renderStockAdjustment(container) {
  const lang = window.i18n.getLang();

  const prodsRes = await window.daftrly.query('SELECT id, name_ar, name_en, stock_quantity, unit, barcode FROM products WHERE is_active=1 AND track_stock=1 ORDER BY name_ar');
  const products = prodsRes.success ? (prodsRes.data || []) : [];

  // Recent adjustments
  const histRes = await window.daftrly.query(
    `SELECT sm.*, p.name_ar, p.name_en FROM stock_movements sm JOIN products p ON sm.product_id=p.id
     WHERE sm.movement_type IN ('adjustment','damaged','lost','counted','gift_in') ORDER BY sm.created_at DESC LIMIT 20`);
  const history = histRes.success ? (histRes.data || []) : [];

  container.innerHTML = `
    <div class="settings-page fade-in">
      ${settingsHeader('تعديل المخزون', 'Stock Adjustment', 'تصحيح كميات المخزون مع تسجيل السبب', 'Correct stock quantities with reason tracking')}
      ${settingsHelpBox(
        'استخدم هذه الصفحة لتعديل المخزون عند وجود فرق بين النظام والجرد الفعلي. كل تعديل يُسجل في سجل حركات المخزون مع السبب ولا يمكن التراجع عنه.',
        'Use this page to adjust stock when there is a difference between the system and physical count. Every adjustment is logged with a reason and cannot be undone.',
        'أمثلة: جرد فعلي يظهر 45 بدل 50 ← اختر "جرد فعلي" وأدخل 45. منتج تالف ← اختر "تالف" وأدخل -1.',
        'Examples: Physical count shows 45 instead of 50 → select "Count" and enter 45. Damaged product → select "Damaged" and enter -1.'
      )}

      <div style="background:var(--bg-secondary);padding:20px;border-radius:12px;margin-bottom:20px;">
        <h3 style="margin-bottom:12px;">📦 ${lang === 'ar' ? 'تعديل جديد' : 'New Adjustment'}</h3>
        <div style="display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:12px;align-items:end;">
          <div class="form-group" style="margin:0;">
            <label class="form-label">${lang === 'ar' ? 'المنتج' : 'Product'}</label>
            <select id="sa-product" class="form-input form-select">
              <option value="">${lang === 'ar' ? '— اختر منتج —' : '— Select product —'}</option>
              ${products.map(p => `<option value="${p.id}" data-stock="${p.stock_quantity}" data-unit="${p.unit || ''}">${lang === 'ar' ? p.name_ar : (p.name_en || p.name_ar)} [${p.stock_quantity} ${p.unit || ''}]</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label">${lang === 'ar' ? 'السبب' : 'Reason'}</label>
            <select id="sa-reason" class="form-input form-select">
              <option value="counted">${lang === 'ar' ? '📋 جرد فعلي' : '📋 Physical Count'}</option>
              <option value="damaged">${lang === 'ar' ? '💔 تالف' : '💔 Damaged'}</option>
              <option value="lost">${lang === 'ar' ? '❓ مفقود' : '❓ Lost'}</option>
              <option value="gift_in">${lang === 'ar' ? '🎁 هدية/إضافة' : '🎁 Gift/Addition'}</option>
              <option value="adjustment">${lang === 'ar' ? '🔧 تعديل يدوي' : '🔧 Manual Adjustment'}</option>
            </select>
          </div>
          <div class="form-group" style="margin:0;">
            <label class="form-label" id="sa-qty-label">${lang === 'ar' ? 'الكمية الجديدة' : 'New Quantity'}</label>
            <input type="text" inputmode="decimal" id="sa-qty" class="form-input" placeholder="0">
          </div>
          <button class="btn btn-primary" id="sa-apply" style="height:40px;">✅ ${lang === 'ar' ? 'تطبيق' : 'Apply'}</button>
        </div>
        <div id="sa-preview" style="margin-top:8px;font-size:12px;color:var(--text-secondary);"></div>
        <div class="form-group" style="margin-top:8px;">
          <input type="text" id="sa-notes" class="form-input" placeholder="${lang === 'ar' ? 'ملاحظات (اختياري)' : 'Notes (optional)'}">
        </div>
      </div>

      ${history.length > 0 ? `
        <h3 style="margin-bottom:8px;">${lang === 'ar' ? '📜 آخر التعديلات' : '📜 Recent Adjustments'}</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="border-bottom:2px solid var(--border);">
            <th style="padding:6px;">${lang === 'ar' ? 'التاريخ' : 'Date'}</th>
            <th style="padding:6px;">${lang === 'ar' ? 'المنتج' : 'Product'}</th>
            <th style="padding:6px;">${lang === 'ar' ? 'النوع' : 'Type'}</th>
            <th style="padding:6px;">${lang === 'ar' ? 'الكمية' : 'Qty'}</th>
            <th style="padding:6px;">${lang === 'ar' ? 'ملاحظات' : 'Notes'}</th>
          </tr></thead>
          <tbody>${history.map(h => {
            const types = { adjustment: '🔧', damaged: '💔', lost: '❓', counted: '📋', gift_in: '🎁' };
            return `<tr style="border-bottom:1px solid var(--border);">
              <td style="padding:4px 6px;font-size:11px;">${h.created_at?.substring(0, 16).replace('T', ' ') || ''}</td>
              <td style="padding:4px 6px;font-weight:600;">${lang === 'ar' ? h.name_ar : (h.name_en || h.name_ar)}</td>
              <td style="padding:4px 6px;">${types[h.movement_type] || ''} ${h.movement_type}</td>
              <td style="padding:4px 6px;font-weight:700;color:${h.quantity >= 0 ? 'var(--success)' : 'var(--danger)'};">${h.quantity >= 0 ? '+' : ''}${h.quantity}</td>
              <td style="padding:4px 6px;font-size:11px;color:var(--text-secondary);">${h.notes || ''}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      ` : ''}
    </div>
  `;

  // Show preview when product/reason changes
  const prodSel = container.querySelector('#sa-product');
  const reasonSel = container.querySelector('#sa-reason');
  const qtyInput = container.querySelector('#sa-qty');
  const qtyLabel = container.querySelector('#sa-qty-label');
  const preview = container.querySelector('#sa-preview');

  function updatePreview() {
    const opt = prodSel.selectedOptions[0];
    if (!opt || !opt.value) { preview.innerHTML = ''; return; }
    const currentStock = parseFloat(opt.dataset.stock) || 0;
    const reason = reasonSel.value;
    const qty = parseFloat(qtyInput.value);
    if (reason === 'counted') {
      qtyLabel.textContent = lang === 'ar' ? 'الكمية الفعلية' : 'Actual Quantity';
      if (!isNaN(qty)) {
        const diff = qty - currentStock;
        preview.innerHTML = `${lang === 'ar' ? 'المخزون الحالي' : 'Current'}: <strong>${currentStock}</strong> → ${lang === 'ar' ? 'الجديد' : 'New'}: <strong>${qty}</strong> (${diff >= 0 ? '+' : ''}${diff})`;
      }
    } else {
      qtyLabel.textContent = lang === 'ar' ? 'الكمية (+ إضافة / - خصم)' : 'Quantity (+ add / - subtract)';
      if (!isNaN(qty)) {
        const newStock = currentStock + qty;
        preview.innerHTML = `${lang === 'ar' ? 'المخزون الحالي' : 'Current'}: <strong>${currentStock}</strong> ${qty >= 0 ? '+' : ''}${qty} → ${lang === 'ar' ? 'الجديد' : 'New'}: <strong>${newStock}</strong>`;
      }
    }
  }
  prodSel.addEventListener('change', updatePreview);
  reasonSel.addEventListener('change', updatePreview);
  qtyInput.addEventListener('input', updatePreview);

  // Apply adjustment
  container.querySelector('#sa-apply').addEventListener('click', async () => {
    const productId = parseInt(prodSel.value);
    if (!productId) { showToast(lang === 'ar' ? 'اختر منتج' : 'Select a product', 'error'); return; }
    const reason = reasonSel.value;
    const qty = parseFloat(qtyInput.value);
    if (isNaN(qty)) { showToast(lang === 'ar' ? 'أدخل كمية' : 'Enter quantity', 'error'); return; }
    const notes = container.querySelector('#sa-notes').value.trim();
    const currentStock = parseFloat(prodSel.selectedOptions[0].dataset.stock) || 0;

    let movementQty, newStock;
    if (reason === 'counted') {
      movementQty = qty - currentStock;
      newStock = qty;
    } else {
      movementQty = qty;
      newStock = currentStock + qty;
    }

    const confirmMsg = lang === 'ar'
      ? `⚠️ تعديل المخزون لا يمكن التراجع عنه!\n\nالمنتج: ${prodSel.selectedOptions[0].text}\nالمخزون الحالي: ${currentStock}\nالمخزون الجديد: ${newStock}\nالتغيير: ${movementQty >= 0 ? '+' : ''}${movementQty}\nالسبب: ${reason}\n\nهل أنت متأكد؟`
      : `⚠️ Stock adjustment cannot be undone!\n\nProduct: ${prodSel.selectedOptions[0].text}\nCurrent stock: ${currentStock}\nNew stock: ${newStock}\nChange: ${movementQty >= 0 ? '+' : ''}${movementQty}\nReason: ${reason}\n\nAre you sure?`;

    if (!await window.daftrlyConfirm(confirmMsg)) return;

    await window.daftrly.query('UPDATE products SET stock_quantity = ? WHERE id = ?', [newStock, productId]);
    await window.daftrly.query('INSERT INTO stock_movements (product_id, movement_type, quantity, reference_type, notes) VALUES (?,?,?,?,?)',
      [productId, reason, movementQty, 'adjustment', notes || reason]);
    window.logAudit('stock_adjust', 'products', productId, `${reason} | ${currentStock} → ${newStock} (${movementQty >= 0 ? '+' : ''}${movementQty})${notes ? ' | ' + notes : ''}`);

    showToast(lang === 'ar' ? `✅ تم تعديل المخزون: ${currentStock} → ${newStock}` : `✅ Stock adjusted: ${currentStock} → ${newStock}`, 'success');
    renderStockAdjustment(container);
  });
}

// ============ DATA MANAGEMENT ============
async function renderDataManagement(container) {
  const lang = window.i18n.getLang();

  // Get counts
  const salesCount = (await window.daftrly.query("SELECT COUNT(*) as c FROM sales")).data?.[0]?.c || 0;
  const returnsCount = (await window.daftrly.query("SELECT COUNT(*) as c FROM returns")).data?.[0]?.c || 0;
  const expCount = (await window.daftrly.query("SELECT COUNT(*) as c FROM expenses")).data?.[0]?.c || 0;
  const auditCount = (await window.daftrly.query("SELECT COUNT(*) as c FROM audit_log")).data?.[0]?.c || 0;
  const prodCount = (await window.daftrly.query("SELECT COUNT(*) as c FROM products")).data?.[0]?.c || 0;
  const custCount = (await window.daftrly.query("SELECT COUNT(*) as c FROM customers")).data?.[0]?.c || 0;
  const gcCount = (await window.daftrly.query("SELECT COUNT(*) as c FROM gift_cards")).data?.[0]?.c || 0;
  const couponCount = (await window.daftrly.query("SELECT COUNT(*) as c FROM promotions")).data?.[0]?.c || 0;

  container.innerHTML = `
    <div class="settings-page fade-in">
      ${settingsHeader('إدارة البيانات', 'Data Management', 'مسح وإعادة تعيين البيانات — للمدير فقط', 'Clear and reset data — admin only')}
      ${settingsHelpBox(
        '⚠️ تحذير: جميع العمليات في هذه الصفحة لا يمكن التراجع عنها! ننصح بعمل نسخة احتياطية قبل أي عملية مسح.',
        '⚠️ Warning: All operations on this page are irreversible! We recommend creating a backup before any reset.',
        'هذه الصفحة مخصصة للمدير فقط. يمكنك مسح المبيعات القديمة لبدء سنة جديدة أو مسح بيانات التجربة.',
        'This page is for admin only. You can clear old sales to start a new year or clear test data.'
      )}

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px;">
        <div style="background:var(--bg-secondary);padding:12px;border-radius:8px;text-align:center;">
          <div style="font-size:22px;font-weight:900;color:var(--accent);">${salesCount}</div>
          <div style="font-size:11px;color:var(--text-secondary);">${lang === 'ar' ? 'فاتورة' : 'Invoices'}</div>
        </div>
        <div style="background:var(--bg-secondary);padding:12px;border-radius:8px;text-align:center;">
          <div style="font-size:22px;font-weight:900;color:var(--accent);">${prodCount}</div>
          <div style="font-size:11px;color:var(--text-secondary);">${lang === 'ar' ? 'منتج' : 'Products'}</div>
        </div>
        <div style="background:var(--bg-secondary);padding:12px;border-radius:8px;text-align:center;">
          <div style="font-size:22px;font-weight:900;color:var(--accent);">${custCount}</div>
          <div style="font-size:11px;color:var(--text-secondary);">${lang === 'ar' ? 'عميل' : 'Customers'}</div>
        </div>
        <div style="background:var(--bg-secondary);padding:12px;border-radius:8px;text-align:center;">
          <div style="font-size:22px;font-weight:900;color:var(--accent);">${gcCount}</div>
          <div style="font-size:11px;color:var(--text-secondary);">${lang === 'ar' ? 'بطاقة هدية' : 'Gift Cards'}</div>
        </div>
      </div>

      <div style="display:grid;gap:12px;">
        <div style="background:var(--bg-secondary);padding:16px;border-radius:10px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:700;">🧾 ${lang === 'ar' ? 'مسح جميع المبيعات والمرتجعات' : 'Clear All Sales & Returns'}</div>
            <div style="font-size:12px;color:var(--text-secondary);">${lang === 'ar' ? `${salesCount} فاتورة + ${returnsCount} مرتجع + المدفوعات` : `${salesCount} invoices + ${returnsCount} returns + payments`}</div>
          </div>
          <button class="btn btn-sm" id="dm-clear-sales" style="background:var(--danger);color:#fff;border:none;">🗑 ${lang === 'ar' ? 'مسح' : 'Clear'}</button>
        </div>

        <div style="background:var(--bg-secondary);padding:16px;border-radius:10px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:700;">💰 ${lang === 'ar' ? 'مسح المصروفات' : 'Clear Expenses'}</div>
            <div style="font-size:12px;color:var(--text-secondary);">${expCount} ${lang === 'ar' ? 'مصروف' : 'expenses'}</div>
          </div>
          <button class="btn btn-sm" id="dm-clear-expenses" style="background:var(--danger);color:#fff;border:none;">🗑 ${lang === 'ar' ? 'مسح' : 'Clear'}</button>
        </div>

        <div style="background:var(--bg-secondary);padding:16px;border-radius:10px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:700;">🎁 ${lang === 'ar' ? 'مسح بطاقات الهدايا' : 'Clear Gift Cards'}</div>
            <div style="font-size:12px;color:var(--text-secondary);">${gcCount} ${lang === 'ar' ? 'بطاقة + سجل العمليات' : 'cards + transaction history'}</div>
          </div>
          <button class="btn btn-sm" id="dm-clear-giftcards" style="background:var(--danger);color:#fff;border:none;">🗑 ${lang === 'ar' ? 'مسح' : 'Clear'}</button>
        </div>

        <div style="background:var(--bg-secondary);padding:16px;border-radius:10px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:700;">🎟 ${lang === 'ar' ? 'مسح الكوبونات' : 'Clear Coupons'}</div>
            <div style="font-size:12px;color:var(--text-secondary);">${couponCount} ${lang === 'ar' ? 'كوبون' : 'coupons'}</div>
          </div>
          <button class="btn btn-sm" id="dm-clear-coupons" style="background:var(--danger);color:#fff;border:none;">🗑 ${lang === 'ar' ? 'مسح' : 'Clear'}</button>
        </div>

        <div style="background:var(--bg-secondary);padding:16px;border-radius:10px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:700;">📋 ${lang === 'ar' ? 'مسح سجل النشاط' : 'Clear Activity Log'}</div>
            <div style="font-size:12px;color:var(--text-secondary);">${auditCount} ${lang === 'ar' ? 'سجل' : 'entries'}</div>
          </div>
          <button class="btn btn-sm" id="dm-clear-audit" style="background:var(--danger);color:#fff;border:none;">🗑 ${lang === 'ar' ? 'مسح' : 'Clear'}</button>
        </div>

        <div style="background:var(--bg-secondary);padding:16px;border-radius:10px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:700;">📦 ${lang === 'ar' ? 'إعادة تعيين المخزون لصفر' : 'Reset All Stock to Zero'}</div>
            <div style="font-size:12px;color:var(--text-secondary);">${lang === 'ar' ? 'يصفّر كميات المنتجات والمتغيرات — للجرد الشامل' : 'Zeros all product + variant stock — for full recount'}</div>
          </div>
          <button class="btn btn-sm" id="dm-reset-stock" style="background:var(--danger);color:#fff;border:none;">🔄 ${lang === 'ar' ? 'تصفير' : 'Reset'}</button>
        </div>

        <div style="background:var(--bg-secondary);padding:16px;border-radius:10px;border:2px solid var(--danger);display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:700;color:var(--danger);">💣 ${lang === 'ar' ? 'مسح كل شيء — بداية جديدة' : 'Clear Everything — Fresh Start'}</div>
            <div style="font-size:12px;color:var(--text-secondary);">${lang === 'ar' ? 'يمسح: المبيعات، المرتجعات، المصروفات، العملاء، المنتجات، بطاقات الهدايا، الكوبونات، السجلات' : 'Clears: sales, returns, expenses, customers, products, gift cards, coupons, logs'}</div>
          </div>
          <button class="btn btn-sm" id="dm-nuke" style="background:var(--danger);color:#fff;border:none;">💣 ${lang === 'ar' ? 'مسح الكل' : 'Clear All'}</button>
        </div>
      </div>
    </div>
  `;

  async function confirmAndClear(msgAr, msgEn, queries, auditAction) {
    const msg = lang === 'ar'
      ? `⚠️ تحذير — لا يمكن التراجع!\n\n${msgAr}\n\nننصح بعمل نسخة احتياطية أولاً.\n\nهل أنت متأكد؟`
      : `⚠️ Warning — Cannot be undone!\n\n${msgEn}\n\nWe recommend creating a backup first.\n\nAre you sure?`;
    if (!await window.daftrlyConfirm(msg)) return;
    const msg2 = lang === 'ar' ? 'اكتب "نعم" للتأكيد النهائي:' : 'Type "yes" to confirm:';
    const typed = await window.daftrlyPrompt(msg2, lang === 'ar' ? 'اكتب نعم هنا...' : 'type yes here...');
    if (typed !== (lang === 'ar' ? 'نعم' : 'yes')) { showToast(lang === 'ar' ? 'تم الإلغاء' : 'Cancelled', 'info'); return; }
    for (const q of queries) await window.daftrly.query(q);
    window.logAudit(auditAction, 'system', null, msgEn);
    showToast(lang === 'ar' ? '✅ تم المسح' : '✅ Cleared', 'success');
    renderDataManagement(container);
  }

  container.querySelector('#dm-clear-sales')?.addEventListener('click', () => confirmAndClear(
    'سيتم مسح جميع الفواتير والمرتجعات والمدفوعات نهائياً.',
    'All invoices, returns, and payments will be permanently deleted.',
    ['DELETE FROM sale_items', 'DELETE FROM payments', 'DELETE FROM installment_payments',
     'DELETE FROM returns', 'DELETE FROM return_items', 'DELETE FROM sales',
     'DELETE FROM credit_debit_notes', 'DELETE FROM zatca_queue',
     "DELETE FROM qoyod_sync WHERE sync_type IN ('invoice','credit_note','return')",
     "UPDATE sequences SET current_value = 0 WHERE id = 'invoice'"],
    'clear_sales'));

  container.querySelector('#dm-clear-expenses')?.addEventListener('click', () => confirmAndClear(
    'سيتم مسح جميع المصروفات نهائياً.',
    'All expenses will be permanently deleted.',
    ['DELETE FROM expenses'],
    'clear_expenses'));

  container.querySelector('#dm-clear-giftcards')?.addEventListener('click', () => confirmAndClear(
    'سيتم مسح جميع بطاقات الهدايا وسجل العمليات.',
    'All gift cards and their transaction history will be deleted.',
    ['DELETE FROM gift_card_transactions', 'DELETE FROM gift_cards'],
    'clear_gift_cards'));

  container.querySelector('#dm-clear-coupons')?.addEventListener('click', () => confirmAndClear(
    'سيتم مسح جميع كوبونات الخصم.',
    'All discount coupons will be deleted.',
    ['DELETE FROM promotions'],
    'clear_coupons'));

  container.querySelector('#dm-clear-audit')?.addEventListener('click', () => confirmAndClear(
    'سيتم مسح سجل النشاط بالكامل.',
    'Activity log will be completely cleared.',
    ['DELETE FROM audit_log'],
    'clear_audit'));

  container.querySelector('#dm-reset-stock')?.addEventListener('click', () => confirmAndClear(
    'سيتم تصفير مخزون جميع المنتجات والمتغيرات.',
    'All product and variant stock will be reset to zero.',
    ['UPDATE products SET stock_quantity = 0 WHERE track_stock = 1',
     'UPDATE product_variants SET stock_quantity = 0'],
    'reset_stock'));

  container.querySelector('#dm-nuke')?.addEventListener('click', () => confirmAndClear(
    '💣 سيتم مسح كل شيء: المبيعات، المرتجعات، المصروفات، العملاء، المنتجات، المتغيرات، الحزم، بطاقات الهدايا، الكوبونات، السجلات، الورديات. فقط الإعدادات والمستخدمين ستبقى.',
    '💣 Everything will be cleared: sales, returns, expenses, customers, products, variants, bundles, gift cards, coupons, logs, sessions. Only settings and users remain.',
    ['DELETE FROM sale_items', 'DELETE FROM payments', 'DELETE FROM installment_payments',
     'DELETE FROM returns', 'DELETE FROM return_items', 'DELETE FROM sales',
     'DELETE FROM expenses', 'DELETE FROM customers',
     'DELETE FROM bundle_items', 'DELETE FROM product_variants', 'DELETE FROM products', 'DELETE FROM categories',
     'DELETE FROM suppliers', 'DELETE FROM purchase_order_items', 'DELETE FROM purchase_orders',
     'DELETE FROM gift_card_transactions', 'DELETE FROM gift_cards',
     'DELETE FROM promotions',
     'DELETE FROM credit_debit_notes',
     'DELETE FROM stock_movements', 'DELETE FROM audit_log',
     'DELETE FROM cash_sessions', 'DELETE FROM cash_movements',
     'DELETE FROM zatca_queue', 'DELETE FROM qoyod_sync',
     'DELETE FROM tier_pricing', 'DELETE FROM packages', 'DELETE FROM customer_packages',
     'DELETE FROM supplier_payments', 'DELETE FROM commission_payouts', 'DELETE FROM price_list_items',
     "UPDATE customers SET qoyod_id = NULL", "UPDATE products SET qoyod_id = NULL",
     "UPDATE suppliers SET qoyod_id = NULL", "UPDATE categories SET qoyod_id = NULL",
     "UPDATE sequences SET current_value = 0"],
    'nuke_all'));
}

// ==================== PEER SYNC SETTINGS ====================

async function renderPeerSyncSettings(container, allSettings) {
  const lang = window.i18n.getLang();

  let status = {};
  try { status = await window.daftrly.syncGetStatus(); } catch (e) {}

  const isNone = !status.role || status.role === 'none';
  const isPrimary = status.role === 'primary';
  const isSecondary = status.role === 'secondary';

  container.innerHTML = `
    <div style="max-width:600px;">
      ${settingsHeader('مزامنة الأجهزة', 'Device Sync',
        'مزامنة البيانات بين أجهزة نقدي على نفس شبكة WiFi',
        'Sync data between Naqdi devices on the same WiFi network')}

      <div class="settings-card" style="margin-top:16px;">
        ${isNone ? `
          <div style="text-align:center;padding:20px 0;">
            <div style="color:var(--text-secondary);font-size:13px;margin-bottom:20px;">
              ${lang === 'ar'
                ? 'اختر دور هذا الجهاز في المزامنة'
                : 'Choose this device sync role'}
            </div>
            <button class="btn btn-primary" id="sync-create-btn" style="width:100%;padding:12px;font-size:14px;margin-bottom:12px;">
              🖥️ ${lang === 'ar' ? 'إنشاء مجموعة (جهاز رئيسي)' : 'Create Group (Primary)'}
            </button>
            <div style="color:var(--text-tertiary);font-size:12px;margin:12px 0;">
              ${lang === 'ar' ? '— أو —' : '— or —'}
            </div>
            <div style="display:flex;gap:8px;margin-bottom:8px;">
              <input type="text" id="sync-join-code" class="form-input" placeholder="${lang === 'ar' ? 'رمز المجموعة' : 'Group Code'}" maxlength="6" style="flex:1;text-align:center;font-size:18px;letter-spacing:4px;">
              <input type="text" id="sync-join-secret" class="form-input" placeholder="${lang === 'ar' ? 'رمز الأمان' : 'Secret'}" maxlength="4" style="width:100px;text-align:center;font-size:18px;letter-spacing:2px;text-transform:uppercase;">
            </div>
            <input type="text" id="sync-join-ip" class="form-input" placeholder="${lang === 'ar' ? 'IP الجهاز الرئيسي (اختياري)' : 'Primary IP (optional)'}" style="margin-bottom:8px;">
            <button class="btn btn-secondary" id="sync-join-btn" style="width:100%;padding:12px;font-size:14px;">
              📱 ${lang === 'ar' ? 'انضمام (جهاز ثانوي)' : 'Join Group (Secondary)'}
            </button>
          </div>
        ` : ''}

        ${isPrimary ? `
          <div style="background:rgba(34,197,94,0.1);border:1px solid #22c55e;border-radius:8px;padding:20px;text-align:center;">
            <div style="color:#22c55e;font-weight:700;font-size:14px;margin-bottom:12px;">
              🖥️ ${lang === 'ar' ? 'جهاز رئيسي — نشط' : 'Primary — Active'}
            </div>
            <div style="font-size:28px;font-weight:800;color:var(--text);letter-spacing:6px;margin:8px 0;">
              ${status.code || '------'}
            </div>
            <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:4px;">
              ${lang === 'ar' ? 'رمز المجموعة' : 'Group Code'}
            </div>
            <div style="font-size:22px;font-weight:800;color:var(--accent);letter-spacing:4px;margin:12px 0 4px;">
              ${status.secret || '----'}
            </div>
            <div style="font-size:11px;color:var(--text-tertiary);margin-bottom:12px;">
              ${lang === 'ar' ? 'رمز الأمان — شاركه مع الجهاز الثانوي' : 'Security Code — share with secondary device'}
            </div>
            <div style="color:var(--text-secondary);font-size:12px;">
              ${lang === 'ar' ? 'الأجهزة المتصلة:' : 'Connected:'} <strong>${status.connected || 0}</strong>
            </div>
            <div style="color:var(--text-secondary);font-size:12px;margin-top:4px;">
              ${lang === 'ar' ? 'آخر مزامنة:' : 'Last sync:'} ${status.lastSync ? status.lastSync.substring(11, 19) : '-'}
            </div>
          </div>
        ` : ''}

        ${isSecondary ? `
          <div style="background:rgba(59,130,246,0.1);border:1px solid #3b82f6;border-radius:8px;padding:20px;text-align:center;">
            <div style="color:#3b82f6;font-weight:700;font-size:14px;margin-bottom:8px;">
              📱 ${lang === 'ar' ? 'جهاز ثانوي — متصل' : 'Secondary — Connected'}
            </div>
            <div style="color:var(--text-secondary);font-size:12px;">
              ${lang === 'ar' ? 'متصل بـ:' : 'Connected to:'} ${status.primaryIP || '-'}
            </div>
            <div style="color:var(--text-secondary);font-size:12px;margin-top:4px;">
              ${lang === 'ar' ? 'آخر مزامنة:' : 'Last sync:'} ${status.lastSync ? status.lastSync.substring(11, 19) : '-'}
            </div>
          </div>
        ` : ''}

        ${!isNone ? `
          <div style="display:flex;gap:8px;margin-top:16px;">
            <button class="btn btn-primary" id="sync-now-btn" style="flex:1;padding:10px;">
              🔄 ${lang === 'ar' ? 'مزامنة الآن' : 'Sync Now'}
            </button>
            <button class="btn btn-danger" id="sync-stop-btn" style="padding:10px;">
              ⏹ ${lang === 'ar' ? 'قطع الاتصال' : 'Disconnect'}
            </button>
          </div>
        ` : ''}
      </div>

      <div class="settings-card" style="margin-top:16px;padding:16px;">
        <div style="font-weight:700;color:var(--text);font-size:13px;margin-bottom:8px;">
          ${lang === 'ar' ? 'ما يتم مزامنته:' : 'What gets synced:'}
        </div>
        <div style="color:var(--text-secondary);font-size:12px;line-height:1.8;">
          ✅ ${lang === 'ar' ? 'المنتجات والأصناف' : 'Products & Categories'}<br>
          ✅ ${lang === 'ar' ? 'العملاء' : 'Customers'}<br>
          ✅ ${lang === 'ar' ? 'المبيعات والفواتير' : 'Sales & Invoices'}<br>
          ✅ ${lang === 'ar' ? 'المرتجعات' : 'Returns'}<br>
          ✅ ${lang === 'ar' ? 'حركات المخزون' : 'Stock Movements'}<br>
          ✅ ${lang === 'ar' ? 'المستخدمين (الكاشير)' : 'Users (Cashiers)'}<br>
          ✅ ${lang === 'ar' ? 'الإعدادات المشتركة (الضريبة، الفاتورة)' : 'Shared Settings (VAT, Invoice Format)'}
        </div>
      </div>
    </div>
  `;

  // Create Group
  const createBtn = container.querySelector('#sync-create-btn');
  if (createBtn) {
    createBtn.addEventListener('click', async () => {
      createBtn.disabled = true;
      createBtn.textContent = '...';
      try {
        const result = await window.daftrly.syncCreateGroup();
        if (result.error) throw new Error(result.error);
        showToast(lang === 'ar' ? '✅ تم إنشاء مجموعة المزامنة' : '✅ Sync group created', 'success');
        renderPeerSyncSettings(container, allSettings);
      } catch (e) {
        showToast(e.message, 'error');
        createBtn.disabled = false;
        createBtn.textContent = lang === 'ar' ? '🖥️ إنشاء مجموعة (جهاز رئيسي)' : '🖥️ Create Group (Primary)';
      }
    });
  }

  // Join Group
  const joinBtn = container.querySelector('#sync-join-btn');
  if (joinBtn) {
    joinBtn.addEventListener('click', async () => {
      const code = container.querySelector('#sync-join-code')?.value?.trim();
      const secret = container.querySelector('#sync-join-secret')?.value?.trim()?.toUpperCase();
      const ip = container.querySelector('#sync-join-ip')?.value?.trim();

      if (!code || code.length !== 6) { showToast(lang === 'ar' ? 'أدخل رمز المجموعة (6 أرقام)' : 'Enter 6-digit group code', 'error'); return; }
      if (!secret || secret.length !== 4) { showToast(lang === 'ar' ? 'أدخل رمز الأمان (4 أحرف)' : 'Enter 4-character security code', 'error'); return; }

      joinBtn.disabled = true;
      joinBtn.textContent = '...';
      try {
        const result = await window.daftrly.syncJoinGroup(code, secret, ip || undefined);
        if (result.error) throw new Error(result.error);
        showToast(lang === 'ar' ? '✅ تم الانضمام' : '✅ Joined successfully', 'success');
        renderPeerSyncSettings(container, allSettings);
      } catch (e) {
        showToast(e.message, 'error');
        joinBtn.disabled = false;
        joinBtn.textContent = lang === 'ar' ? '📱 انضمام (جهاز ثانوي)' : '📱 Join Group (Secondary)';
      }
    });
  }

  // Sync Now
  const syncNowBtn = container.querySelector('#sync-now-btn');
  if (syncNowBtn) {
    syncNowBtn.addEventListener('click', async () => {
      syncNowBtn.disabled = true;
      syncNowBtn.textContent = '...';
      try {
        const result = await window.daftrly.syncNow();
        showToast(result.message || (result.success ? '✅' : '⚠️'), result.success ? 'success' : 'warning');
      } catch (e) { showToast(e.message, 'error'); }
      syncNowBtn.disabled = false;
      syncNowBtn.textContent = lang === 'ar' ? '🔄 مزامنة الآن' : '🔄 Sync Now';
    });
  }

  // Disconnect
  const stopBtn = container.querySelector('#sync-stop-btn');
  if (stopBtn) {
    stopBtn.addEventListener('click', async () => {
      try {
        await window.daftrly.syncStop();
        showToast(lang === 'ar' ? 'تم قطع الاتصال' : 'Disconnected', 'success');
        renderPeerSyncSettings(container, allSettings);
      } catch (e) { showToast(e.message, 'error'); }
    });
  }

  // Status updates will show on next manual navigation to this tab
  // (no auto-refresh listener — prevents infinite re-render loop)
}

// ==================== QOYOD ACCOUNTING INTEGRATION ====================

function renderQoyodSettings(container, allSettings) {
  const lang = window.i18n?.getLang() || 'ar';
  const q = allSettings.qoyod || {};
  const enabled = q.enabled || false;
  const apiKey = q.apiKey || '';

  container.innerHTML = `
    <div class="settings-page fade-in">
      ${settingsHeader('ربط المحاسبة — قيود', 'Accounting Integration — Qoyod',
        'ربط نقطة البيع مع برنامج قيود المحاسبي — المبيعات والعملاء والمنتجات تُرسل تلقائياً',
        'Connect POS to Qoyod accounting — sales, customers, and products sync automatically')}

      <div class="settings-form">
        <div class="settings-note" style="background:rgba(37,99,235,0.08);border:1px solid var(--accent);margin-bottom:16px;padding:12px;border-radius:8px;">
          <strong style="color:var(--accent);">${lang === 'ar' ? '📘 كيف تبدأ؟' : '📘 How to start?'}</strong><br>
          ${lang === 'ar'
            ? '١. سجّل في <b>qoyod.com</b> واشترك بالباقة التي تدعم API<br>٢. الإعدادات العامة ← أنشئ مفتاح API<br>٣. الصق المفتاح أدناه ← اضغط "اختبار"<br>٤. اختر الحسابات والمستودع ← حفظ'
            : '1. Sign up at <b>qoyod.com</b> and subscribe to a plan with API access<br>2. General Settings → Generate API Key<br>3. Paste key below → click "Test"<br>4. Select accounts & inventory → Save'}
        </div>

        ${field('qoyod-enabled', 'تفعيل ربط قيود', 'Enable Qoyod Integration', enabled, 'toggle', { descAr: 'إرسال البيانات تلقائياً لبرنامج قيود', descEn: 'Automatically send data to Qoyod accounting' })}

        <div id="qoyod-config" style="display:${enabled ? '' : 'none'};">
          <div class="settings-row">
            <div class="settings-field" style="flex:1;">
              <label class="form-label">${lang === 'ar' ? 'مفتاح API' : 'API Key'}</label>
              <div style="display:flex;gap:8px;">
                <input type="text" id="qoyod-apikey" class="form-input" value="${apiKey}" placeholder="${lang === 'ar' ? 'الصق مفتاح API من قيود' : 'Paste Qoyod API key'}" style="flex:1;font-family:monospace;font-size:12px;">
                <button class="btn btn-secondary" id="qoyod-test-btn" style="white-space:nowrap;">🔌 ${lang === 'ar' ? 'اختبار' : 'Test'}</button>
              </div>
              <div id="qoyod-test-result" style="margin-top:6px;font-size:12px;"></div>
            </div>
          </div>

          <div id="qoyod-mapping" style="display:${apiKey ? '' : 'none'};">
            <h3 style="margin:16px 0 8px;color:var(--text-primary);font-size:14px;">${lang === 'ar' ? '⚙️ ربط الحسابات' : '⚙️ Account Mapping'}</h3>
            <div class="settings-note" style="font-size:12px;margin-bottom:12px;">
              ${lang === 'ar' ? 'اضغط "🔄 جلب" لتحميل الحسابات من قيود تلقائياً' : 'Click "🔄 Fetch" to load accounts from Qoyod automatically'}
            </div>
            <button class="btn btn-secondary btn-sm" id="qoyod-fetch-setup" style="margin-bottom:12px;">🔄 ${lang === 'ar' ? 'جلب الحسابات والمستودعات' : 'Fetch Accounts & Inventories'}</button>
            <div id="qoyod-dropdowns">
              ${renderQoyodDropdowns(q, lang)}
            </div>

            <h3 style="margin:20px 0 8px;color:var(--text-primary);font-size:14px;">${lang === 'ar' ? '📤 ما يتم إرساله' : '📤 What Gets Synced'}</h3>
            ${field('qoyod-sync-sales', 'مزامنة المبيعات تلقائياً', 'Auto-sync sales', q.syncSales !== false, 'toggle', { descAr: 'كل عملية بيع تُرسل كفاتورة في قيود', descEn: 'Every sale sent as invoice to Qoyod' })}
            ${field('qoyod-sync-customers', 'مزامنة العملاء', 'Sync customers', q.syncCustomers !== false, 'toggle', { descAr: 'العملاء الجدد يُنشأون تلقائياً في قيود', descEn: 'New customers auto-created in Qoyod' })}
            ${field('qoyod-sync-products', 'مزامنة المنتجات', 'Sync products', q.syncProducts !== false, 'toggle', { descAr: 'المنتجات الجديدة تُنشأ تلقائياً في قيود', descEn: 'New products auto-created in Qoyod' })}
            ${field('qoyod-sync-notes', 'مزامنة الإشعارات الدائنة/المدينة', 'Sync credit/debit notes', q.syncNotes !== false, 'toggle', { descAr: 'إشعارات العملاء والموردين', descEn: 'Customer and supplier notes' })}
            ${field('qoyod-sync-returns', 'مزامنة المرتجعات كإشعارات دائنة', 'Sync returns as credit notes', q.syncReturns !== false, 'toggle', { descAr: 'المرتجعات تُرسل كإشعارات دائنة في قيود', descEn: 'Returns sent as credit notes in Qoyod' })}
            ${field('qoyod-invoice-status', 'حالة الفاتورة في قيود', 'Invoice status in Qoyod', q.invoiceStatus || 'Approved', 'select', {
              options: [
                { value: 'Approved', labelAr: 'معتمدة (فورية)', labelEn: 'Approved (immediate)' },
                { value: 'Draft', labelAr: 'مسودة (تحتاج اعتماد يدوي)', labelEn: 'Draft (needs manual approval)' }
              ]
            })}

            <h3 style="margin:20px 0 8px;color:var(--text-primary);font-size:14px;">${lang === 'ar' ? '📊 حالة المزامنة' : '📊 Sync Status'}</h3>
            <div class="settings-note" style="font-size:12px;margin-bottom:8px;background:rgba(212,168,83,0.1);border:1px solid var(--gold);padding:8px;border-radius:6px;">
              <strong style="color:var(--gold);">⚠️ ${lang === 'ar' ? 'مهم:' : 'Important:'}</strong>
              ${lang === 'ar'
                ? 'البيانات لا تُرسل لقيود إلا <b>بعد الحفظ</b>. اضغط "حفظ التغييرات" أولاً، ثم المبيعات الجديدة فقط ستُرسل تلقائياً. المبيعات القديمة لا تُرسل إلا بضغط "دفع الكل".'
                : 'Data is NOT sent to Qoyod until you <b>Save</b>. Click "Save Changes" first, then only NEW sales will auto-sync. Old sales are only sent when you click "Push All".'}
            </div>
            <div id="qoyod-sync-status" style="font-size:13px;color:var(--text-secondary);padding:8px;background:var(--bg-tertiary);border-radius:8px;">
              ${lang === 'ar' ? 'جارٍ التحميل...' : 'Loading...'}
            </div>
            <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">
              <button class="btn btn-secondary btn-sm" id="qoyod-test-sync-btn">🧪 ${lang === 'ar' ? 'اختبار بفاتورة واحدة' : 'Test with 1 invoice'}</button>
              <button class="btn btn-secondary btn-sm" id="qoyod-retry-btn">🔁 ${lang === 'ar' ? 'إعادة المحاولات الفاشلة' : 'Retry Failed'}</button>
              <button class="btn btn-secondary btn-sm" id="qoyod-push-all-btn">📤 ${lang === 'ar' ? 'دفع الكل يدوياً' : 'Push All Manually'}</button>
            </div>
          </div>
        </div>
      </div>
      ${saveButton()}
    </div>
  `;

  // Toggle show/hide
  container.querySelector('#qoyod-enabled')?.addEventListener('change', (e) => {
    const cfg = container.querySelector('#qoyod-config');
    if (cfg) cfg.style.display = e.target.checked ? '' : 'none';
  });

  // Test connection
  container.querySelector('#qoyod-test-btn')?.addEventListener('click', async () => {
    const key = container.querySelector('#qoyod-apikey')?.value.trim();
    const resultEl = container.querySelector('#qoyod-test-result');
    if (!key) { resultEl.innerHTML = `<span style="color:var(--danger);">❌ ${lang === 'ar' ? 'أدخل المفتاح' : 'Enter API key'}</span>`; return; }
    resultEl.innerHTML = `<span style="color:var(--text-secondary);">⏳ ${lang === 'ar' ? 'جارٍ الاختبار...' : 'Testing...'}</span>`;
    const res = await window.daftrly.qoyodTest(key);
    if (res.success) {
      resultEl.innerHTML = `<span style="color:var(--success);">✅ ${lang === 'ar' ? 'متصل بنجاح!' : 'Connected!'} (${res.data?.accounts?.length || 0} ${lang === 'ar' ? 'حساب' : 'accounts'})</span>`;
      const mapping = container.querySelector('#qoyod-mapping');
      if (mapping) mapping.style.display = '';
    } else {
      resultEl.innerHTML = `<span style="color:var(--danger);">❌ ${res.error || 'Connection failed'}</span>`;
    }
  });

  // Fetch setup data
  container.querySelector('#qoyod-fetch-setup')?.addEventListener('click', async () => {
    const key = container.querySelector('#qoyod-apikey')?.value.trim();
    if (!key) return;
    const btn = container.querySelector('#qoyod-fetch-setup');
    btn.textContent = lang === 'ar' ? '⏳ جارٍ الجلب...' : '⏳ Fetching...';
    btn.disabled = true;
    const res = await window.daftrly.qoyodFetchSetup(key);
    btn.disabled = false;
    btn.textContent = lang === 'ar' ? '🔄 جلب الحسابات والمستودعات' : '🔄 Fetch Accounts & Inventories';
    if (res.accounts?.success) {
      const setupData = {
        accounts: res.accounts.data?.accounts || [],
        inventories: res.inventories?.data?.inventories || [],
        units: res.units?.data?.product_unit_types || [],
        categories: res.categories?.data?.categories || []
      };
      await window.daftrly.setSetting('qoyodSetupData', setupData);
      window.appSettings = await window.daftrly.getSettings();
      const dd = container.querySelector('#qoyod-dropdowns');
      if (dd) dd.innerHTML = renderQoyodDropdowns(q, lang, setupData);
      window.showToast?.(lang === 'ar' ? '✅ تم جلب البيانات' : '✅ Data fetched', 'success');
    } else {
      window.showToast?.(lang === 'ar' ? '❌ فشل الجلب' : '❌ Fetch failed', 'error');
    }
  });

  // Load sync status
  loadQoyodSyncStatus(container, lang);

  // Test sync — send just 1 invoice to verify setup works
  container.querySelector('#qoyod-test-sync-btn')?.addEventListener('click', async () => {
    const lastSale = await window.daftrly.query("SELECT id, invoice_number FROM sales WHERE status='completed' ORDER BY id DESC LIMIT 1");
    if (!lastSale.success || !lastSale.data?.[0]) {
      window.showToast?.(lang === 'ar' ? 'لا توجد فواتير للاختبار — قم ببيع أولاً' : 'No invoices to test — make a sale first', 'warning');
      return;
    }
    const sale = lastSale.data[0];
    const confirmed = await window.daftrlyConfirm(
      lang === 'ar'
        ? `سيتم إرسال فاتورة واحدة (${sale.invoice_number}) لقيود كاختبار. هل تريد المتابعة؟`
        : `This will send 1 invoice (${sale.invoice_number}) to Qoyod as a test. Continue?`
    );
    if (!confirmed) return;

    // Save current settings first
    const cfg = {
      enabled: container.querySelector('#qoyod-enabled')?.checked || false,
      apiKey: container.querySelector('#qoyod-apikey')?.value.trim() || '',
      inventoryId: container.querySelector('#qoyod-inventory')?.value || '',
      salesAccountId: container.querySelector('#qoyod-sales-account')?.value || '',
      expenseAccountId: container.querySelector('#qoyod-expense-account')?.value || '',
      cashAccountId: container.querySelector('#qoyod-cash-account')?.value || '',
      bankAccountId: container.querySelector('#qoyod-bank-account')?.value || '',
      unitTypeId: container.querySelector('#qoyod-unit')?.value || '',
      categoryId: container.querySelector('#qoyod-category')?.value || '',
      syncSales: container.querySelector('#qoyod-sync-sales')?.checked ?? true,
      syncCustomers: container.querySelector('#qoyod-sync-customers')?.checked ?? true,
      syncProducts: container.querySelector('#qoyod-sync-products')?.checked ?? true,
      syncNotes: container.querySelector('#qoyod-sync-notes')?.checked ?? true,
      syncReturns: container.querySelector('#qoyod-sync-returns')?.checked ?? true,
      invoiceStatus: container.querySelector('#qoyod-invoice-status')?.value || 'Approved',
    };
    await window.daftrly.setSetting('qoyod', cfg);
    window.appSettings = await window.daftrly.getSettings();

    // Queue and process this one sale (skip if already synced)
    const existingSync = await window.daftrly.query("SELECT id, status FROM qoyod_sync WHERE sync_type='invoice' AND local_id=? AND status='synced' LIMIT 1", [sale.id]);
    if (existingSync.success && existingSync.data?.length) {
      window.showToast?.(lang === 'ar' ? `ℹ️ هذه الفاتورة مُزامنة مسبقاً` : `ℹ️ This invoice is already synced`, 'info');
      return;
    }
    // Remove any previous failed attempts for clean re-test
    await window.daftrly.query("DELETE FROM qoyod_sync WHERE sync_type='invoice' AND local_id=? AND status='failed'", [sale.id]);
    await window.daftrly.query("INSERT INTO qoyod_sync (sync_type, local_id, status) VALUES ('invoice', ?, 'pending')", [sale.id]);
    await processQoyodSyncQueue();

    // Check result
    const result = await window.daftrly.query("SELECT status, error FROM qoyod_sync WHERE sync_type='invoice' AND local_id=? ORDER BY id DESC LIMIT 1", [sale.id]);
    const r = result.data?.[0];
    if (r?.status === 'synced') {
      window.showToast?.(lang === 'ar' ? `✅ نجح الاختبار! ${sale.invoice_number} أُرسلت لقيود` : `✅ Test passed! ${sale.invoice_number} sent to Qoyod`, 'success');
    } else {
      window.showToast?.(lang === 'ar' ? `❌ فشل الاختبار: ${r?.error || 'خطأ'}` : `❌ Test failed: ${r?.error || 'Error'}`, 'error');
    }
    loadQoyodSyncStatus(container, lang);
  });

  // Retry failed
  container.querySelector('#qoyod-retry-btn')?.addEventListener('click', async () => {
    await retryFailedQoyodSyncs();
    loadQoyodSyncStatus(container, lang);
  });

  // Push all manually — with confirmation
  container.querySelector('#qoyod-push-all-btn')?.addEventListener('click', async () => {
    const unsyncedRes = await window.daftrly.query(
      "SELECT COUNT(*) as c FROM sales WHERE status='completed' AND id NOT IN (SELECT local_id FROM qoyod_sync WHERE sync_type='invoice')");
    const count = unsyncedRes.data?.[0]?.c || 0;
    if (count === 0) {
      window.showToast?.(lang === 'ar' ? 'لا توجد بيانات جديدة للإرسال' : 'No new data to push', 'info');
      return;
    }
    const confirmed = await window.daftrlyConfirm(
      lang === 'ar'
        ? `سيتم إرسال ${count} فاتورة + الإشعارات والمرتجعات إلى قيود. هل تريد المتابعة؟`
        : `This will push ${count} invoices + notes and returns to Qoyod. Continue?`
    );
    if (!confirmed) return;
    await pushAllToQoyod();
    loadQoyodSyncStatus(container, lang);
  });

  // Save
  container.querySelector('#settings-save-btn')?.addEventListener('click', async () => {
    const cfg = {
      enabled: container.querySelector('#qoyod-enabled')?.checked || false,
      apiKey: container.querySelector('#qoyod-apikey')?.value.trim() || '',
      inventoryId: container.querySelector('#qoyod-inventory')?.value || '',
      salesAccountId: container.querySelector('#qoyod-sales-account')?.value || '',
      expenseAccountId: container.querySelector('#qoyod-expense-account')?.value || '',
      cashAccountId: container.querySelector('#qoyod-cash-account')?.value || '',
      bankAccountId: container.querySelector('#qoyod-bank-account')?.value || '',
      unitTypeId: container.querySelector('#qoyod-unit')?.value || '',
      categoryId: container.querySelector('#qoyod-category')?.value || '',
      syncSales: container.querySelector('#qoyod-sync-sales')?.checked ?? true,
      syncCustomers: container.querySelector('#qoyod-sync-customers')?.checked ?? true,
      syncProducts: container.querySelector('#qoyod-sync-products')?.checked ?? true,
      syncNotes: container.querySelector('#qoyod-sync-notes')?.checked ?? true,
      syncReturns: container.querySelector('#qoyod-sync-returns')?.checked ?? true,
      invoiceStatus: container.querySelector('#qoyod-invoice-status')?.value || 'Approved',
    };
    await window.daftrly.setSetting('qoyod', cfg);
    window.appSettings = await window.daftrly.getSettings();
    window.showToast?.(lang === 'ar' ? '✅ تم الحفظ' : '✅ Saved', 'success');
  });
}

function renderQoyodDropdowns(q, lang, setupData) {
  let data = setupData;
  if (!data) {
    try { const raw = window.appSettings?.qoyodSetupData; data = (typeof raw === 'object' && raw) ? raw : JSON.parse(raw || '{}'); } catch { data = {}; }
  }
  const accounts = data.accounts || [];
  const inventories = data.inventories || [];
  const units = data.units || [];
  const categories = data.categories || [];

  if (!accounts.length && !inventories.length) {
    return `<div style="color:var(--text-secondary);font-size:13px;padding:8px;">${lang === 'ar' ? 'اضغط "🔄 جلب" أولاً' : 'Click "🔄 Fetch" first'}</div>`;
  }

  const saleAccounts = accounts.filter(a => ['Sale','Revenue','OtherIncome'].includes(a.type));
  const expAccounts = accounts.filter(a => ['DirectCost','Expense','Overhead'].includes(a.type));
  const cashAccounts = accounts.filter(a => a.type === 'Cash');
  const bankAccounts = accounts.filter(a => a.type === 'Bank');

  function dd(id, labelAr, labelEn, options, selectedVal) {
    return `<div class="settings-field">
      <label class="form-label">${lang === 'ar' ? labelAr : labelEn}</label>
      <select id="${id}" class="form-input form-select">
        <option value="">— ${lang === 'ar' ? 'اختر' : 'Select'} —</option>
        ${options.map(o => `<option value="${o.id}" ${String(q[selectedVal]) === String(o.id) ? 'selected' : ''}>${o.name_en || o.name || o.unit_name || ''} ${o.name_ar || o.ar_name || ''} ${o.code ? '(' + o.code + ')' : ''}</option>`).join('')}
      </select>
    </div>`;
  }

  return `
    ${dd('qoyod-inventory', 'المستودع / الفرع', 'Inventory / Branch', inventories, 'inventoryId')}
    ${dd('qoyod-sales-account', 'حساب إيرادات المبيعات', 'Sales Revenue Account', saleAccounts, 'salesAccountId')}
    ${dd('qoyod-expense-account', 'حساب تكلفة المبيعات', 'COGS / Expense Account', expAccounts, 'expenseAccountId')}
    ${dd('qoyod-cash-account', 'حساب النقد (للدفع النقدي)', 'Cash Account (for cash payments)', cashAccounts, 'cashAccountId')}
    ${dd('qoyod-bank-account', 'حساب البنك (للدفع بالبطاقة)', 'Bank Account (for card payments)', bankAccounts, 'bankAccountId')}
    ${dd('qoyod-unit', 'وحدة المنتج الافتراضية', 'Default Product Unit', units, 'unitTypeId')}
    ${dd('qoyod-category', 'تصنيف المنتج الافتراضي', 'Default Product Category', categories, 'categoryId')}
  `;
}

async function loadQoyodSyncStatus(container, lang) {
  const el = container.querySelector('#qoyod-sync-status');
  if (!el) return;
  const pending = await window.daftrly.query("SELECT COUNT(*) as c FROM qoyod_sync WHERE status='pending'");
  const synced = await window.daftrly.query("SELECT COUNT(*) as c FROM qoyod_sync WHERE status='synced'");
  const failed = await window.daftrly.query("SELECT COUNT(*) as c FROM qoyod_sync WHERE status='failed'");
  const last = await window.daftrly.query("SELECT synced_at FROM qoyod_sync WHERE status='synced' ORDER BY synced_at DESC LIMIT 1");
  const p = pending.data?.[0]?.c || 0;
  const s = synced.data?.[0]?.c || 0;
  const f = failed.data?.[0]?.c || 0;
  const lastSync = last.data?.[0]?.synced_at || (lang === 'ar' ? 'لم تتم بعد' : 'Never');
  el.innerHTML = `
    <div style="display:flex;gap:16px;flex-wrap:wrap;">
      <span>✅ ${lang === 'ar' ? 'مُزامَن' : 'Synced'}: <b>${s}</b></span>
      <span>⏳ ${lang === 'ar' ? 'معلق' : 'Pending'}: <b style="color:${p > 0 ? 'var(--warning)' : 'inherit'};">${p}</b></span>
      <span>❌ ${lang === 'ar' ? 'فاشل' : 'Failed'}: <b style="color:${f > 0 ? 'var(--danger)' : 'inherit'};">${f}</b></span>
    </div>
    <div style="margin-top:4px;font-size:11px;">🕐 ${lang === 'ar' ? 'آخر مزامنة' : 'Last sync'}: ${lastSync}</div>
  `;
}

// ==================== QOYOD SYNC ENGINE ====================

// Exposed globally for pos.js and invoices.js to call
window.qoyodSyncSale = async function(saleId) {
  const qCfg = getQoyodConfig();
  if (!qCfg || !qCfg.enabled || !qCfg.syncSales || !qCfg.apiKey) return;

  // Dedup: skip if already queued (pending or synced)
  const existing = await window.daftrly.query("SELECT id FROM qoyod_sync WHERE sync_type='invoice' AND local_id=? AND status IN ('pending','synced') LIMIT 1", [saleId]);
  if (existing.success && existing.data?.length) return;

  // Insert pending sync record
  await window.daftrly.query("INSERT INTO qoyod_sync (sync_type, local_id, status) VALUES ('invoice', ?, 'pending')", [saleId]);

  // Process immediately (non-blocking)
  processQoyodSyncQueue().catch(e => console.error('Qoyod sync error:', e));
};

window.qoyodSyncCreditNote = async function(noteId) {
  const qCfg = getQoyodConfig();
  if (!qCfg || !qCfg.enabled || !qCfg.syncNotes || !qCfg.apiKey) return;
  const existing = await window.daftrly.query("SELECT id FROM qoyod_sync WHERE sync_type='credit_note' AND local_id=? AND status IN ('pending','synced') LIMIT 1", [noteId]);
  if (existing.success && existing.data?.length) return;
  await window.daftrly.query("INSERT INTO qoyod_sync (sync_type, local_id, status) VALUES ('credit_note', ?, 'pending')", [noteId]);
  processQoyodSyncQueue().catch(e => console.error('Qoyod sync error:', e));
};

window.qoyodSyncReturn = async function(returnId) {
  const qCfg = getQoyodConfig();
  if (!qCfg || !qCfg.enabled || !qCfg.syncReturns || !qCfg.apiKey) return;
  const existing = await window.daftrly.query("SELECT id FROM qoyod_sync WHERE sync_type='return' AND local_id=? AND status IN ('pending','synced') LIMIT 1", [returnId]);
  if (existing.success && existing.data?.length) return;
  await window.daftrly.query("INSERT INTO qoyod_sync (sync_type, local_id, status) VALUES ('return', ?, 'pending')", [returnId]);
  processQoyodSyncQueue().catch(e => console.error('Qoyod sync error:', e));
};

function getQoyodConfig() {
  try {
    const raw = window.appSettings?.qoyod;
    if (!raw) return null;
    if (typeof raw === 'object') return raw;
    return JSON.parse(raw);
  } catch { return null; }
}

async function ensureQoyodCustomer(customerId, qCfg) {
  if (!customerId) {
    // Walk-in customer — Qoyod requires contact_id, so create/reuse a generic walk-in
    return await ensureWalkinCustomer(qCfg);
  }

  // If syncCustomers is disabled, don't create real customers — use walk-in instead
  // But still return existing qoyod_id if already synced
  const cust = await window.daftrly.query('SELECT * FROM customers WHERE id=?', [customerId]);
  if (!cust.success || !cust.data?.[0]) return await ensureWalkinCustomer(qCfg);
  const c = cust.data[0];
  if (c.qoyod_id) return c.qoyod_id;

  // If customer sync is disabled, use walk-in for new (unsynced) customers
  if (qCfg.syncCustomers === false) return await ensureWalkinCustomer(qCfg);

  // Create in Qoyod
  const res = await window.daftrly.qoyodApi('POST', '/customers', qCfg.apiKey, {
    contact: {
      name: c.name_ar || c.name_en || 'Customer',
      organization: '',
      email: c.email || '',
      phone_number: c.phone || '',
      tax_number: c.vat_number || '',
      status: 'Active'
    }
  });
  if (res.success && res.data?.contact?.id) {
    await window.daftrly.query('UPDATE customers SET qoyod_id=? WHERE id=?', [res.data.contact.id, customerId]);
    return res.data.contact.id;
  }
  // If already exists (search by phone) — response key is 'customers' not 'contacts'
  if (!res.success && c.phone) {
    const search = await window.daftrly.qoyodApi('GET', `/customers?q[phone_number_eq]=${encodeURIComponent(c.phone)}`, qCfg.apiKey);
    if (search.success && search.data?.customers?.[0]?.id) {
      await window.daftrly.query('UPDATE customers SET qoyod_id=? WHERE id=?', [search.data.customers[0].id, customerId]);
      return search.data.customers[0].id;
    }
  }
  // Fallback to walk-in
  return await ensureWalkinCustomer(qCfg);
}

// Creates or retrieves a generic "Walk-in Customer" in Qoyod for anonymous sales
async function ensureWalkinCustomer(qCfg) {
  // Check if we already have the walk-in qoyod_id saved in sync table
  const walkinRes = await window.daftrly.query("SELECT qoyod_id FROM qoyod_sync WHERE sync_type='walkin_customer' AND status='synced' LIMIT 1");
  if (walkinRes.success && walkinRes.data?.[0]?.qoyod_id) return walkinRes.data[0].qoyod_id;

  // Search for existing walk-in by name
  const search = await window.daftrly.qoyodApi('GET', `/customers?q[name_eq]=${encodeURIComponent('عميل نقدي')}`, qCfg.apiKey);
  if (search.success && search.data?.customers?.[0]?.id) {
    await window.daftrly.query("INSERT INTO qoyod_sync (sync_type, local_id, qoyod_id, status, synced_at) VALUES ('walkin_customer', 0, ?, 'synced', datetime('now'))",
      [search.data.customers[0].id]);
    return search.data.customers[0].id;
  }

  // Create walk-in customer
  const res = await window.daftrly.qoyodApi('POST', '/customers', qCfg.apiKey, {
    contact: {
      name: 'عميل نقدي',
      organization: 'Walk-in Customer',
      email: '',
      phone_number: '0000000000',
      tax_number: '',
      status: 'Active'
    }
  });
  if (res.success && res.data?.contact?.id) {
    await window.daftrly.query("INSERT INTO qoyod_sync (sync_type, local_id, qoyod_id, status, synced_at) VALUES ('walkin_customer', 0, ?, 'synced', datetime('now'))",
      [res.data.contact.id]);
    return res.data.contact.id;
  }
  return null;
}

async function ensureQoyodProduct(productId, qCfg) {
  if (!productId) return null;
  const prod = await window.daftrly.query('SELECT * FROM products WHERE id=?', [productId]);
  if (!prod.success || !prod.data?.[0]) return null;
  const p = prod.data[0];
  if (p.qoyod_id) return p.qoyod_id;

  // If product sync is disabled, don't auto-create — try to find by SKU first, otherwise skip
  if (qCfg.syncProducts === false) {
    const sku = p.sku || `NQDI-${p.id}`;
    const search = await window.daftrly.qoyodApi('GET', `/products?q[sku_eq]=${encodeURIComponent(sku)}`, qCfg.apiKey);
    if (search.success && search.data?.products?.[0]?.id) {
      await window.daftrly.query('UPDATE products SET qoyod_id=? WHERE id=?', [search.data.products[0].id, productId]);
      return search.data.products[0].id;
    }
    return null; // Product not found in Qoyod and sync disabled — skip
  }

  // Determine tax_id: standard=1(15%), zero=2, exempt=3
  let taxId = 1;
  let specialTaxReasonId = null;
  if (p.tax_status === 'zero') {
    taxId = 2;
    // Qoyod requires special_tax_reason_id for zero-rated products (ZATCA compliance)
    // Default to "Export of goods" (1) — can be overridden per product if needed
    specialTaxReasonId = p.special_tax_reason_id || 1;
  } else if (p.tax_status === 'exempt') {
    taxId = 3;
    // Default to "Financial services" (12) for exempt products
    specialTaxReasonId = p.special_tax_reason_id || 12;
  }

  const productData = {
      sku: p.sku || `NQDI-${p.id}`,
      barcode: p.barcode || '',
      name_ar: p.name_ar || p.name_en || 'Product',
      name_en: p.name_en || p.name_ar || 'Product',
      description: '',
      product_unit_type_id: qCfg.unitTypeId || '1',
      category_id: qCfg.categoryId || '1',
      track_quantity: '0', // Don't track in Qoyod — we track in Naqdi
      purchase_item: p.cost > 0 ? '1' : '0',
      buying_price: String(p.cost || 0),
      expense_account_id: qCfg.expenseAccountId || '12',
      sale_item: '1',
      selling_price: String(p.price || 0),
      sales_account_id: qCfg.salesAccountId || '17',
      tax_id: String(taxId),
      type: p.product_type === 'service' ? 'Service' : 'Product'
  };
  if (specialTaxReasonId) productData.special_tax_reason_id = String(specialTaxReasonId);

  const body = { product: productData };

  const res = await window.daftrly.qoyodApi('POST', '/products', qCfg.apiKey, body);
  if (res.success && res.data?.product?.id) {
    await window.daftrly.query('UPDATE products SET qoyod_id=? WHERE id=?', [res.data.product.id, productId]);
    return res.data.product.id;
  }
  // If SKU already exists, search for it
  if (!res.success) {
    const sku = p.sku || `NQDI-${p.id}`;
    const search = await window.daftrly.qoyodApi('GET', `/products?q[sku_eq]=${encodeURIComponent(sku)}`, qCfg.apiKey);
    if (search.success && search.data?.products?.[0]?.id) {
      await window.daftrly.query('UPDATE products SET qoyod_id=? WHERE id=?', [search.data.products[0].id, productId]);
      return search.data.products[0].id;
    }
  }
  return null;
}

let _qoyodSyncRunning = false;
async function processQoyodSyncQueue() {
  if (_qoyodSyncRunning) return; // Prevent parallel processing
  _qoyodSyncRunning = true;
  try {
  const qCfg = getQoyodConfig();
  if (!qCfg || !qCfg.enabled || !qCfg.apiKey) return;

  // Loop until no more pending items (process in batches of 10)
  let hasMore = true;
  while (hasMore) {
    const pending = await window.daftrly.query("SELECT * FROM qoyod_sync WHERE status='pending' AND attempts < 5 ORDER BY id ASC LIMIT 10");
    if (!pending.success || !pending.data?.length) { hasMore = false; break; }

    for (const item of pending.data) {
      try {
        let result;
        if (item.sync_type === 'invoice') {
          result = await syncSaleToQoyod(item.local_id, qCfg);
        } else if (item.sync_type === 'credit_note') {
          result = await syncCreditNoteToQoyod(item.local_id, qCfg);
        } else if (item.sync_type === 'return') {
          result = await syncReturnToQoyod(item.local_id, qCfg);
        }

        if (result?.success) {
          await window.daftrly.query("UPDATE qoyod_sync SET status='synced', qoyod_id=?, qoyod_ref=?, synced_at=datetime('now'), error=NULL WHERE id=?",
            [result.qoyodId || null, result.qoyodRef || null, item.id]);
        } else {
          await window.daftrly.query("UPDATE qoyod_sync SET status='failed', attempts=attempts+1, error=? WHERE id=?",
            [result?.error || 'Unknown error', item.id]);
        }
      } catch (e) {
        await window.daftrly.query("UPDATE qoyod_sync SET status='failed', attempts=attempts+1, error=? WHERE id=?",
          [e.message || 'Exception', item.id]);
      }
    }

    // If we got fewer than 10, we're done
    if (pending.data.length < 10) hasMore = false;
  }
  } finally { _qoyodSyncRunning = false; }
}

async function syncSaleToQoyod(saleId, qCfg) {
  // Get sale data
  const saleRes = await window.daftrly.query('SELECT * FROM sales WHERE id=?', [saleId]);
  if (!saleRes.success || !saleRes.data?.[0]) return { success: false, error: 'Sale not found' };
  const sale = saleRes.data[0];

  // Get items
  const itemsRes = await window.daftrly.query('SELECT * FROM sale_items WHERE sale_id=?', [saleId]);
  const items = itemsRes.data || [];
  if (!items.length) return { success: false, error: 'No items' };

  // Ensure customer exists — contact_id is REQUIRED by Qoyod
  const contactId = await ensureQoyodCustomer(sale.customer_id || null, qCfg);
  if (!contactId) return { success: false, error: 'Could not create/find Qoyod customer' };

  // Check if VAT is inclusive — stored as JSON in appSettings.vat
  let vatCfg;
  try { vatCfg = typeof window.appSettings?.vat === 'string' ? JSON.parse(window.appSettings.vat) : (window.appSettings?.vat || {}); } catch { vatCfg = {}; }
  const isInclusive = vatCfg.inclusive === true || vatCfg.inclusive === 'true';

  // Build line items
  const lineItems = [];
  for (const item of items) {
    const qProductId = item.product_id ? await ensureQoyodProduct(item.product_id, qCfg) : null;
    if (!qProductId) continue;

    lineItems.push({
      product_id: qProductId,
      description: item.name_ar || item.name_en || '',
      quantity: item.quantity || 1,
      unit_price: item.unit_price || 0,
      discount: item.discount_amount || 0,
      discount_type: 'amount',
      tax_percent: item.tax_rate || 15,
      is_inclusive: isInclusive
    });
  }

  if (!lineItems.length) return { success: false, error: 'No mappable items' };

  // Distribute invoice-level discounts (coupon, loyalty, gift card, invoice discount)
  // across line items proportionally — Qoyod only supports per-line-item discounts
  const totalItemDiscount = items.reduce((s, i) => s + Number(i.discount_amount || 0), 0);
  const storedTotalDiscount = Number(sale.discount_amount) || 0;
  const extraDiscount = storedTotalDiscount - totalItemDiscount; // invoice discount + coupon + loyalty

  if (extraDiscount > 0 && lineItems.length > 0) {
    const totalLineAmt = lineItems.reduce((s, li) => s + (li.unit_price * li.quantity), 0);
    if (totalLineAmt > 0) {
      let remaining = extraDiscount;
      for (let i = 0; i < lineItems.length; i++) {
        const li = lineItems[i];
        const lineAmt = li.unit_price * li.quantity;
        let share;
        if (i === lineItems.length - 1) {
          // Last item gets remainder to avoid rounding loss
          share = Math.round(remaining * 100) / 100;
        } else {
          share = Math.round(extraDiscount * (lineAmt / totalLineAmt) * 100) / 100;
          remaining -= share;
        }
        // Add proportional share to existing item-level discount
        li.discount = (li.discount || 0) + share;
      }
    }
  }

  const saleDate = sale.created_at ? sale.created_at.substring(0, 10) : new Date().toISOString().substring(0, 10);
  const invoiceBody = {
    invoice: {
      contact_id: contactId,
      reference: sale.invoice_number || `SALE-${saleId}`,
      description: sale.notes || '',
      issue_date: saleDate,
      due_date: saleDate,
      status: qCfg.invoiceStatus || 'Approved',
      inventory_id: parseInt(qCfg.inventoryId) || 1,
      draft_if_out_of_stock: true,
      line_items: lineItems
    }
  };

  const res = await window.daftrly.qoyodApi('POST', '/invoices', qCfg.apiKey, invoiceBody);
  if (!res.success) return { success: false, error: res.error || `HTTP ${res.status}` };

  const qoyodInvoiceId = res.data?.invoice?.id;
  if (!qoyodInvoiceId) return { success: false, error: 'No invoice ID returned' };

  // Now create payment(s)
  const payments = await window.daftrly.query('SELECT * FROM payments WHERE sale_id=?', [saleId]);
  if (payments.success && payments.data?.length) {
    for (const pay of payments.data) {
      // Map payment method to Qoyod account
      // card → bank account, everything else (cash, gift_card, store_credit, exchange) → cash account
      const accountId = (pay.method === 'card')
        ? (qCfg.bankAccountId || qCfg.cashAccountId)
        : qCfg.cashAccountId;
      if (!accountId) continue;

      // For cash payments: pay.amount is what customer handed over (includes change)
      // Qoyod needs the actual payment applied to the invoice, not the received amount
      let paymentAmount = Number(pay.amount) || 0;
      if (pay.method === 'cash') {
        // Actual cash applied = received - change, or simply the sale total for this payment
        const saleChange = Number(sale.change_amount) || 0;
        paymentAmount = Math.max(0, paymentAmount - saleChange);
      }

      if (paymentAmount <= 0) continue; // Skip zero payments

      const payRef = `PAY-${sale.invoice_number}-${pay.id}`;
      await window.daftrly.qoyodApi('POST', '/invoice_payments', qCfg.apiKey, {
        invoice_payment: {
          reference: payRef,
          invoice_id: String(qoyodInvoiceId),
          account_id: String(accountId),
          date: saleDate,
          amount: String(paymentAmount)
        }
      });
    }
  }

  return { success: true, qoyodId: qoyodInvoiceId, qoyodRef: sale.invoice_number };
}

async function syncCreditNoteToQoyod(noteId, qCfg) {
  const noteRes = await window.daftrly.query('SELECT * FROM credit_debit_notes WHERE id=?', [noteId]);
  if (!noteRes.success || !noteRes.data?.[0]) return { success: false, error: 'Note not found' };
  const note = noteRes.data[0];

  // Only sync customer credit notes to Qoyod credit notes
  if (note.note_type !== 'credit') return { success: false, error: 'Not a customer credit note' };

  const contactId = await ensureQoyodCustomer(note.customer_id || null, qCfg);
  if (!contactId) return { success: false, error: 'Could not create/find Qoyod customer for credit note' };

  // Read VAT config for tax_percent
  let vatCfg;
  try { vatCfg = typeof window.appSettings?.vat === 'string' ? JSON.parse(window.appSettings.vat) : (window.appSettings?.vat || {}); } catch { vatCfg = {}; }
  const isInclusive = vatCfg.inclusive === true || vatCfg.inclusive === 'true';

  // Get original sale items to find a product reference for the credit note line
  // Credit notes in this system have a single amount, so we create one line item
  // but we search all items to find one with a valid product_id
  const saleItems = await window.daftrly.query('SELECT * FROM sale_items WHERE sale_id=?', [note.sale_id]);
  let lineItems = [];
  if (saleItems.success && saleItems.data?.length) {
    // Find first item with a product_id we can map
    for (const item of saleItems.data) {
      const qProdId = item.product_id ? await ensureQoyodProduct(item.product_id, qCfg) : null;
      if (qProdId) {
        // Note: Qoyod credit note line items do NOT support is_inclusive (unlike invoices)
        // If VAT is inclusive, we need to back-calculate the exclusive price
        let creditUnitPrice = parseFloat(note.amount) || 0;
        const taxRate = parseFloat(item.tax_rate || vatCfg.rate || 15);
        if (isInclusive && taxRate > 0) {
          // Convert inclusive amount to exclusive for Qoyod
          creditUnitPrice = creditUnitPrice / (1 + taxRate / 100);
          creditUnitPrice = Math.round(creditUnitPrice * 100) / 100;
        }
        lineItems.push({
          product_id: qProdId,
          description: note.reason || 'Credit note',
          unit_price: String(creditUnitPrice),
          quantity: '1',
          tax_percent: String(taxRate)
        });
        break;
      }
    }
  }

  if (!lineItems.length) return { success: false, error: 'No product to reference' };

  const noteDate = note.created_at ? note.created_at.substring(0, 10) : new Date().toISOString().substring(0, 10);
  const res = await window.daftrly.qoyodApi('POST', '/credit_notes', qCfg.apiKey, {
    credit_note: {
      contact_id: contactId,
      reference: note.note_number,
      issue_date: noteDate,
      status: 'Approved',
      inventory_id: parseInt(qCfg.inventoryId) || 1,
      notes: note.reason || '',
      line_items: lineItems
    }
  });

  // Qoyod credit note response is flat { id, contact_id, note_no, ... } — not wrapped in "credit_note" key
  if (res.success) return { success: true, qoyodId: res.data?.id || res.data?.credit_note?.id, qoyodRef: note.note_number };
  return { success: false, error: res.error || `HTTP ${res.status}` };
}

async function syncReturnToQoyod(returnId, qCfg) {
  const retRes = await window.daftrly.query('SELECT r.*, s.customer_id FROM returns r LEFT JOIN sales s ON r.original_sale_id=s.id WHERE r.id=?', [returnId]);
  if (!retRes.success || !retRes.data?.[0]) return { success: false, error: 'Return not found' };
  const ret = retRes.data[0];

  const contactId = await ensureQoyodCustomer(ret.customer_id || null, qCfg);
  if (!contactId) return { success: false, error: 'Could not create/find Qoyod customer for return' };

  // Read VAT config
  let vatCfg;
  try { vatCfg = typeof window.appSettings?.vat === 'string' ? JSON.parse(window.appSettings.vat) : (window.appSettings?.vat || {}); } catch { vatCfg = {}; }
  const isInclusive = vatCfg.inclusive === true || vatCfg.inclusive === 'true';

  // Get return items
  const retItems = await window.daftrly.query(`SELECT ri.*, si.product_id, si.name_ar, si.unit_price, si.tax_rate
    FROM return_items ri JOIN sale_items si ON ri.sale_item_id=si.id WHERE ri.return_id=?`, [returnId]);

  const lineItems = [];
  if (retItems.success && retItems.data?.length) {
    for (const ri of retItems.data) {
      const qProdId = ri.product_id ? await ensureQoyodProduct(ri.product_id, qCfg) : null;
      if (!qProdId) continue;
      // Note: Qoyod credit note line items do NOT support is_inclusive
      // If VAT is inclusive, back-calculate the exclusive unit price
      let retUnitPrice = parseFloat(ri.unit_price || 0);
      const retTaxRate = parseFloat(ri.tax_rate || 15);
      if (isInclusive && retTaxRate > 0) {
        retUnitPrice = retUnitPrice / (1 + retTaxRate / 100);
        retUnitPrice = Math.round(retUnitPrice * 100) / 100;
      }
      lineItems.push({
        product_id: qProdId,
        description: ret.reason || 'Return',
        unit_price: String(retUnitPrice),
        quantity: String(ri.quantity || 1),
        tax_percent: String(retTaxRate)
      });
    }
  }

  if (!lineItems.length) return { success: false, error: 'No return items to map' };

  const retDate = ret.created_at ? ret.created_at.substring(0, 10) : new Date().toISOString().substring(0, 10);
  const res = await window.daftrly.qoyodApi('POST', '/credit_notes', qCfg.apiKey, {
    credit_note: {
      contact_id: contactId,
      reference: ret.return_number,
      issue_date: retDate,
      status: 'Approved',
      inventory_id: parseInt(qCfg.inventoryId) || 1,
      notes: ret.reason || '',
      line_items: lineItems
    }
  });

  // Qoyod credit note response is flat { id, ... } — not wrapped in "credit_note" key
  if (res.success) return { success: true, qoyodId: res.data?.id || res.data?.credit_note?.id, qoyodRef: ret.return_number };
  return { success: false, error: res.error || `HTTP ${res.status}` };
}

async function retryFailedQoyodSyncs() {
  await window.daftrly.query("UPDATE qoyod_sync SET status='pending', attempts=0 WHERE status='failed'");
  await processQoyodSyncQueue();
}

async function pushAllToQoyod() {
  const qCfg = getQoyodConfig();
  if (!qCfg || !qCfg.enabled || !qCfg.apiKey) return;
  const lang = window.i18n?.getLang() || 'ar';

  // Find all sales not yet in qoyod_sync
  const unsyncedSales = await window.daftrly.query(
    "SELECT id FROM sales WHERE status='completed' AND id NOT IN (SELECT local_id FROM qoyod_sync WHERE sync_type='invoice') ORDER BY id ASC"
  );
  if (unsyncedSales.success && unsyncedSales.data?.length) {
    for (const s of unsyncedSales.data) {
      await window.daftrly.query("INSERT INTO qoyod_sync (sync_type, local_id, status) VALUES ('invoice', ?, 'pending')", [s.id]);
    }
  }

  // Find all credit notes not yet synced
  const unsyncedNotes = await window.daftrly.query(
    "SELECT id FROM credit_debit_notes WHERE note_type='credit' AND id NOT IN (SELECT local_id FROM qoyod_sync WHERE sync_type='credit_note') ORDER BY id ASC"
  );
  if (unsyncedNotes.success && unsyncedNotes.data?.length) {
    for (const n of unsyncedNotes.data) {
      await window.daftrly.query("INSERT INTO qoyod_sync (sync_type, local_id, status) VALUES ('credit_note', ?, 'pending')", [n.id]);
    }
  }

  // Find all returns not yet synced
  const unsyncedReturns = await window.daftrly.query(
    "SELECT id FROM returns WHERE id NOT IN (SELECT local_id FROM qoyod_sync WHERE sync_type='return') ORDER BY id ASC"
  );
  if (unsyncedReturns.success && unsyncedReturns.data?.length) {
    for (const r of unsyncedReturns.data) {
      await window.daftrly.query("INSERT INTO qoyod_sync (sync_type, local_id, status) VALUES ('return', ?, 'pending')", [r.id]);
    }
  }

  // Process queue
  await processQoyodSyncQueue();
  window.showToast?.(lang === 'ar' ? '📤 تم دفع الكل' : '📤 Push complete', 'success');
}

// ==================== PRICE LISTS (Customer Groups) ====================
async function renderPriceListSettings(container) {
  const lang = window.i18n.getLang();
  const plRes = await window.daftrly.query('SELECT * FROM price_lists ORDER BY id');
  const lists = (plRes.success && plRes.data) ? plRes.data : [];

  container.innerHTML = `
    <div class="settings-page fade-in">
      ${settingsHeader('قوائم الأسعار', 'Price Lists', 'مجموعات أسعار مختلفة (تجزئة، جملة، VIP) — تُربط بالعملاء', 'Different price groups (retail, wholesale, VIP) — linked to customers')}
      <div class="settings-form">
        <div style="display:flex;gap:8px;margin-bottom:16px;">
          <input type="text" id="pl-name-ar" class="form-input" placeholder="${lang === 'ar' ? 'اسم القائمة (عربي)' : 'List name (Arabic)'}" style="flex:1;">
          <input type="text" id="pl-name-en" class="form-input" placeholder="${lang === 'ar' ? 'اسم القائمة (إنجليزي)' : 'List name (English)'}" style="flex:1;">
          <button class="btn btn-primary" id="pl-add-btn">+ ${lang === 'ar' ? 'إضافة' : 'Add'}</button>
        </div>
        <table class="data-table" id="pl-table">
          <thead><tr><th>ID</th><th>${lang === 'ar' ? 'الاسم' : 'Name'}</th><th>${lang === 'ar' ? 'افتراضي' : 'Default'}</th><th>${lang === 'ar' ? 'المنتجات' : 'Products'}</th><th></th></tr></thead>
          <tbody>${lists.map(pl => `<tr>
            <td>${pl.id}</td>
            <td>${pl.name_ar || ''} ${pl.name_en ? '(' + pl.name_en + ')' : ''}</td>
            <td>${pl.is_default ? '⭐' : ''}</td>
            <td><button class="btn btn-secondary btn-sm" data-action="pl-items" data-id="${pl.id}" data-name="${pl.name_ar || pl.name_en}">${lang === 'ar' ? 'تسعير' : 'Pricing'}</button></td>
            <td>${!pl.is_default ? `<button class="btn btn-sm" data-action="pl-delete" data-id="${pl.id}" style="background:var(--danger);color:#fff;border:none;">🗑</button>` : ''}</td>
          </tr>`).join('')}</tbody>
        </table>
        <div class="settings-note" style="margin-top:12px;">
          ${lang === 'ar' ? '💡 لربط العميل بقائمة أسعار: افتح العميل ← اختر مجموعة السعر. عند البيع، السعر يتغير تلقائياً.' : '💡 To link a customer: open customer → select price group. At POS, price changes automatically.'}
        </div>
      </div>
    </div>
  `;

  container.querySelector('#pl-add-btn')?.addEventListener('click', async () => {
    const nameAr = container.querySelector('#pl-name-ar')?.value.trim();
    const nameEn = container.querySelector('#pl-name-en')?.value.trim();
    if (!nameAr) { showToast(lang === 'ar' ? 'أدخل اسم القائمة' : 'Enter list name', 'error'); return; }
    await window.daftrly.query('INSERT INTO price_lists (name_ar, name_en, is_default) VALUES (?,?,0)', [nameAr, nameEn || '']);
    renderPriceListSettings(container);
  });

  container.querySelectorAll('[data-action="pl-delete"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const confirmed = await window.daftrlyConfirm(lang === 'ar' ? 'حذف هذه القائمة؟' : 'Delete this list?');
      if (!confirmed) return;
      await window.daftrly.query('DELETE FROM price_list_items WHERE price_list_id=?', [btn.dataset.id]);
      await window.daftrly.query('DELETE FROM price_lists WHERE id=?', [btn.dataset.id]);
      renderPriceListSettings(container);
    });
  });

  container.querySelectorAll('[data-action="pl-items"]').forEach(btn => {
    btn.addEventListener('click', () => openPriceListItems(container, parseInt(btn.dataset.id), btn.dataset.name, lang));
  });
}

async function openPriceListItems(container, plId, plName, lang) {
  const prodRes = await window.daftrly.query('SELECT p.id, p.name_ar, p.name_en, p.price, pli.price as custom_price FROM products p LEFT JOIN price_list_items pli ON pli.product_id=p.id AND pli.price_list_id=? WHERE p.is_active=1 ORDER BY p.name_ar', [plId]);
  const products = (prodRes.success && prodRes.data) ? prodRes.data : [];

  // Create modal overlay directly
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:9999;display:flex;align-items:center;justify-content:center;';
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.style.cssText = 'background:var(--bg-primary);border-radius:12px;width:90%;max-width:700px;max-height:85vh;overflow:hidden;display:flex;flex-direction:column;';

  modal.innerHTML = `
    <div class="modal-header" style="padding:16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
      <h3 style="margin:0;font-size:16px;">${lang === 'ar' ? 'تسعير:' : 'Pricing:'} ${plName}</h3>
      <button class="modal-close" id="modal-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text-secondary);">✕</button>
    </div>
    <div style="padding:8px 16px;">
      <input type="text" id="pli-search" class="form-input" placeholder="${lang === 'ar' ? '🔍 بحث عن منتج...' : '🔍 Search product...'}" style="font-size:13px;">
    </div>
    <div style="padding:0 16px;flex:1;overflow-y:auto;">
      <table class="data-table">
        <thead><tr><th>${lang === 'ar' ? 'المنتج' : 'Product'}</th><th>${lang === 'ar' ? 'السعر الأصلي' : 'Default Price'}</th><th>${lang === 'ar' ? 'سعر القائمة' : 'List Price'}</th></tr></thead>
        <tbody>${products.map(p => `<tr data-prod-name="${(p.name_ar || '').toLowerCase()} ${(p.name_en || '').toLowerCase()}">
          <td style="font-size:13px;">${p.name_ar || p.name_en}</td>
          <td style="color:var(--text-tertiary);">${Number(p.price).toFixed(2)}</td>
          <td><input type="number" class="form-input pli-price" data-pid="${p.id}" value="${p.custom_price != null ? Number(p.custom_price).toFixed(2) : ''}" placeholder="${Number(p.price).toFixed(2)}" step="0.01" min="0" style="width:100px;font-size:13px;"></td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
    <div style="padding:12px 16px;border-top:1px solid var(--border);display:flex;gap:8px;justify-content:flex-end;">
      <button class="btn btn-secondary" id="modal-done">${lang === 'ar' ? 'إغلاق' : 'Close'}</button>
      <button class="btn btn-primary" id="pli-save">${lang === 'ar' ? 'حفظ الأسعار' : 'Save Prices'}</button>
    </div>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  const closeModal = () => overlay.remove();
  modal.querySelector('#modal-close').addEventListener('click', closeModal);
  modal.querySelector('#modal-done').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

  modal.querySelector('#pli-search')?.addEventListener('input', (e) => {
    const q = e.target.value.toLowerCase();
    modal.querySelectorAll('tbody tr').forEach(r => { r.style.display = (!q || r.dataset.prodName.includes(q)) ? '' : 'none'; });
  });

  modal.querySelector('#pli-save')?.addEventListener('click', async () => {
    await window.daftrly.query('DELETE FROM price_list_items WHERE price_list_id=?', [plId]);
    const inputs = modal.querySelectorAll('.pli-price');
    for (const inp of inputs) {
      const val = parseFloat(inp.value);
      if (!isNaN(val) && val > 0) {
        await window.daftrly.query('INSERT INTO price_list_items (price_list_id, product_id, price) VALUES (?,?,?)', [plId, parseInt(inp.dataset.pid), val]);
      }
    }
    showToast(lang === 'ar' ? '✅ تم حفظ الأسعار' : '✅ Prices saved', 'success');
    closeModal();
  });
}

// ==================== PACKAGES (Subscription/Membership) ====================
async function renderPackageSettings(container) {
  const lang = window.i18n.getLang();
  const enabled = window.appSettings?.packagesEnabled || false;
  const pkgRes = await window.daftrly.query('SELECT * FROM packages ORDER BY id DESC');
  const packages = (pkgRes.success && pkgRes.data) ? pkgRes.data : [];

  container.innerHTML = `
    <div class="settings-page fade-in">
      ${settingsHeader('باقات الاشتراك', 'Subscription Packages', 'باقات للخدمات المتكررة — غسيل سيارات، صالون، نادي رياضي', 'Packages for recurring services — car wash, salon, gym')}
      <div class="settings-form">
        ${field('pkg-enabled', 'تفعيل الباقات', 'Enable Packages', enabled, 'toggle', {
          descAr: 'إظهار أزرار بيع واستخدام الباقات في نقطة البيع',
          descEn: 'Show sell and use package buttons at POS'
        })}
        <div id="pkg-content" style="display:${enabled ? '' : 'none'};">
          <button class="btn btn-primary" id="pkg-add" style="margin-bottom:16px;">+ ${lang === 'ar' ? 'إضافة باقة' : 'Add Package'}</button>
          <div id="pkg-list">
            ${packages.length === 0 ? `<div style="color:var(--text-tertiary);padding:24px;text-align:center;">${lang === 'ar' ? 'لا توجد باقات' : 'No packages'}</div>` : ''}
            ${packages.map(p => `
              <div class="card" style="margin-bottom:8px;">
                <div class="card-body" style="display:flex;justify-content:space-between;align-items:center;padding:12px;">
                  <div>
                    <div style="font-weight:700;">${p.name_ar || p.name_en}</div>
                    <div style="font-size:12px;color:var(--text-tertiary);">
                      ${p.total_uses} ${lang === 'ar' ? 'استخدام' : 'uses'} | 
                      ${formatCurrency(p.price)}
                      ${p.expiry_days > 0 ? ` | ${p.expiry_days} ${lang === 'ar' ? 'يوم صلاحية' : 'days valid'}` : ''}
                    </div>
                  </div>
                  <div style="display:flex;gap:6px;">
                    <span style="padding:3px 8px;border-radius:4px;font-size:11px;background:${p.is_active ? 'var(--success)' : 'var(--danger)'};color:#fff;">${p.is_active ? (lang === 'ar' ? 'نشط' : 'Active') : (lang === 'ar' ? 'معطل' : 'Inactive')}</span>
                    <button class="btn btn-sm" data-action="pkg-toggle" data-id="${p.id}" data-active="${p.is_active}" style="border:1px solid var(--border);font-size:11px;">${p.is_active ? '⏸' : '▶'}</button>
                    <button class="btn btn-sm" data-action="pkg-delete" data-id="${p.id}" style="background:var(--danger);color:#fff;border:none;font-size:11px;">🗑</button>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;

  // Enable toggle
  const toggle = container.querySelector('#pkg-enabled');
  if (toggle) {
    toggle.addEventListener('change', async () => {
      await window.daftrly.setSetting('packagesEnabled', toggle.checked);
      window.appSettings = await window.daftrly.getSettings();
      const content = container.querySelector('#pkg-content');
      if (content) content.style.display = toggle.checked ? '' : 'none';
    });
  }

  container.querySelector('#pkg-add')?.addEventListener('click', async () => {
    const nameAr = await window.daftrlyPrompt(lang === 'ar' ? 'اسم الباقة (عربي):' : 'Package name (Arabic):');
    if (!nameAr) return;
    const nameEn = await window.daftrlyPrompt(lang === 'ar' ? 'اسم الباقة (إنجليزي):' : 'Package name (English):');
    const uses = parseInt(await window.daftrlyPrompt(lang === 'ar' ? 'عدد الاستخدامات:' : 'Number of uses:')) || 1;
    const price = parseFloat(await window.daftrlyPrompt(lang === 'ar' ? 'السعر (ر.س):' : 'Price (SAR):')) || 0;
    const days = parseInt(await window.daftrlyPrompt(lang === 'ar' ? 'صلاحية بالأيام (0 = بلا حد):' : 'Valid days (0 = unlimited):')) || 0;
    if (price <= 0 || uses <= 0) { showToast(lang === 'ar' ? 'أدخل بيانات صحيحة' : 'Enter valid data', 'error'); return; }
    await window.daftrly.query('INSERT INTO packages (name_ar, name_en, total_uses, price, expiry_days) VALUES (?,?,?,?,?)', [nameAr, nameEn || '', uses, price, days]);
    renderPackageSettings(container);
  });

  container.querySelectorAll('[data-action="pkg-toggle"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const newActive = btn.dataset.active === '1' ? 0 : 1;
      await window.daftrly.query('UPDATE packages SET is_active=? WHERE id=?', [newActive, btn.dataset.id]);
      renderPackageSettings(container);
    });
  });

  container.querySelectorAll('[data-action="pkg-delete"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const confirmed = await window.daftrlyConfirm(lang === 'ar' ? 'حذف هذه الباقة؟' : 'Delete this package?');
      if (!confirmed) return;
      await window.daftrly.query('DELETE FROM packages WHERE id=?', [btn.dataset.id]);
      renderPackageSettings(container);
    });
  });
}
