// Naqdi Translation System
const translations = {
  ar: {
    // Sidebar
    'nav.dashboard': 'لوحة التحكم',
    'nav.pos': 'نقطة البيع',
    'nav.products': 'المنتجات',
    'nav.customers': 'العملاء',
    'nav.reports': 'التقارير',
    'nav.expenses': 'المصروفات',
    'nav.suppliers': 'الموردين',
    'nav.purchases': 'المشتريات',
    'nav.settings': 'الإعدادات',
    'nav.updates': 'التحديثات',
    'nav.main': 'الرئيسية',
    'nav.management': 'الإدارة',
    'nav.more': 'المزيد',

    // Header
    'header.search': 'بحث في كل شيء... (منتج، فاتورة، عميل)',
    'header.lang': 'EN',

    // Dashboard
    'dashboard.title': 'لوحة التحكم',
    'dashboard.today_sales': 'مبيعات اليوم',
    'dashboard.today_orders': 'طلبات اليوم',
    'dashboard.today_profit': 'أرباح اليوم',
    'dashboard.low_stock': 'مخزون منخفض',
    'dashboard.welcome': 'مرحباً بك في نقدي',
    'dashboard.welcome_sub': 'ابدأ بإضافة منتجاتك وأجري أول عملية بيع',
    'dashboard.recent_sales': 'آخر المبيعات',
    'dashboard.top_products': 'المنتجات الأكثر مبيعاً',
    'dashboard.quick_actions': 'إجراءات سريعة',
    'dashboard.new_sale': 'بيع جديد',
    'dashboard.add_product': 'إضافة منتج',
    'dashboard.add_expense': 'إضافة مصروف',
    'dashboard.view_reports': 'عرض التقارير',
    'dashboard.zatca_status': 'حالة الفوترة الإلكترونية',
    'dashboard.pending_invoices': 'فواتير معلقة',
    'dashboard.last_sync': 'آخر مزامنة',

    // Returns
    'returns.title': 'المرتجعات',
    'returns.return_number': 'رقم المرتجع',
    'returns.original_invoice': 'الفاتورة الأصلية',
    'returns.refund_amount': 'مبلغ الاسترداد',
    'returns.reason': 'السبب',
    'returns.status': 'الحالة',
    'returns.restock': 'تم إعادته للمخزون',
    'returns.write_off': 'شطب',

    // Common
    'common.save': 'حفظ',
    'common.cancel': 'إلغاء',
    'common.delete': 'حذف',
    'common.edit': 'تعديل',
    'common.add': 'إضافة',
    'common.search': 'بحث',
    'common.filter': 'تصفية',
    'common.export': 'تصدير',
    'common.print': 'طباعة',
    'common.close': 'إغلاق',
    'common.confirm': 'تأكيد',
    'common.back': 'رجوع',
    'common.next': 'التالي',
    'common.yes': 'نعم',
    'common.no': 'لا',
    'common.all': 'الكل',
    'common.none': 'لا شيء',
    'common.loading': 'جاري التحميل...',
    'common.no_data': 'لا توجد بيانات',
    'common.sar': 'ر.س',
    'common.total': 'الإجمالي',
    'common.subtotal': 'المجموع الفرعي',
    'common.tax': 'الضريبة',
    'common.discount': 'خصم',
    'common.quantity': 'الكمية',
    'common.price': 'السعر',
    'common.actions': 'إجراءات',
    'common.status': 'الحالة',
    'common.date': 'التاريخ',
    'common.time': 'الوقت',
    'common.name': 'الاسم',
    'common.phone': 'الهاتف',
    'common.email': 'البريد الإلكتروني',
    'common.notes': 'ملاحظات',
    'common.description': 'الوصف',
    'common.category': 'التصنيف',
    'common.amount': 'المبلغ',

    // POS
    'pos.title': 'نقطة البيع',
    'pos.cart': 'السلة',
    'pos.empty_cart': 'السلة فارغة',
    'pos.add_items': 'أضف منتجات لبدء عملية البيع',
    'pos.pay_cash': 'دفع نقدي',
    'pos.pay_card': 'دفع بالبطاقة',
    'pos.pay_split': 'دفع مقسم',
    'pos.hold': 'تعليق',
    'pos.recall': 'استرجاع',
    'pos.clear': 'مسح',
    'pos.discount': 'خصم',
    'pos.customer': 'العميل',
    'pos.note': 'ملاحظة',
    'pos.complete': 'إتمام البيع',
    'pos.change': 'الباقي',
    'pos.received': 'المبلغ المستلم',
    'pos.favorites': 'المفضلة',
    'pos.all_products': 'كل المنتجات',
    'pos.open_item': 'صنف مفتوح',

    // Settings
    'settings.title': 'الإعدادات',
    'settings.business': 'معلومات النشاط التجاري',
    'settings.vat': 'إعدادات ضريبة القيمة المضافة',
    'settings.zakat': 'إعدادات الزكاة',
    'settings.language': 'اللغة',
    'settings.invoice_format': 'تنسيق رقم الفاتورة',
    'settings.printer': 'إعدادات الطابعة',
    'settings.terminal': 'جهاز الدفع',
    'settings.backup': 'النسخ الاحتياطي',
    'settings.theme': 'المظهر',
    'settings.users': 'المستخدمين والصلاحيات',
    'settings.zatca': 'الفوترة الإلكترونية (ZATCA)',
    'settings.license': 'الترخيص',
    'settings.about': 'حول التطبيق',

    // User roles
    'role.admin': 'مدير',
    'role.cashier': 'كاشير',
  },

  en: {
    // Sidebar
    'nav.dashboard': 'Dashboard',
    'nav.pos': 'Point of Sale',
    'nav.products': 'Products',
    'nav.customers': 'Customers',
    'nav.reports': 'Reports',
    'nav.expenses': 'Expenses',
    'nav.suppliers': 'Suppliers',
    'nav.purchases': 'Purchases',
    'nav.settings': 'Settings',
    'nav.updates': 'Updates',
    'nav.main': 'Main',
    'nav.management': 'Management',
    'nav.more': 'More',

    // Header
    'header.search': 'Search everything... (product, invoice, customer)',
    'header.lang': 'عربي',

    // Dashboard
    'dashboard.title': 'Dashboard',
    'dashboard.today_sales': "Today's Sales",
    'dashboard.today_orders': "Today's Orders",
    'dashboard.today_profit': "Today's Profit",
    'dashboard.low_stock': 'Low Stock',
    'dashboard.welcome': 'Welcome to Naqdi',
    'dashboard.welcome_sub': 'Start by adding your products and make your first sale',
    'dashboard.recent_sales': 'Recent Sales',
    'dashboard.top_products': 'Top Selling Products',
    'dashboard.quick_actions': 'Quick Actions',
    'dashboard.new_sale': 'New Sale',
    'dashboard.add_product': 'Add Product',
    'dashboard.add_expense': 'Add Expense',
    'dashboard.view_reports': 'View Reports',
    'dashboard.zatca_status': 'E-Invoicing Status',
    'dashboard.pending_invoices': 'Pending Invoices',
    'dashboard.last_sync': 'Last Sync',

    // Returns
    'returns.title': 'Returns',
    'returns.return_number': 'Return #',
    'returns.original_invoice': 'Original Invoice',
    'returns.refund_amount': 'Refund Amount',
    'returns.reason': 'Reason',
    'returns.status': 'Status',
    'returns.restock': 'Restocked',
    'returns.write_off': 'Written Off',

    // Common
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.delete': 'Delete',
    'common.edit': 'Edit',
    'common.add': 'Add',
    'common.search': 'Search',
    'common.filter': 'Filter',
    'common.export': 'Export',
    'common.print': 'Print',
    'common.close': 'Close',
    'common.confirm': 'Confirm',
    'common.back': 'Back',
    'common.next': 'Next',
    'common.yes': 'Yes',
    'common.no': 'No',
    'common.all': 'All',
    'common.none': 'None',
    'common.loading': 'Loading...',
    'common.no_data': 'No data',
    'common.sar': 'SAR',
    'common.total': 'Total',
    'common.subtotal': 'Subtotal',
    'common.tax': 'Tax',
    'common.discount': 'Discount',
    'common.quantity': 'Qty',
    'common.price': 'Price',
    'common.actions': 'Actions',
    'common.status': 'Status',
    'common.date': 'Date',
    'common.time': 'Time',
    'common.name': 'Name',
    'common.phone': 'Phone',
    'common.email': 'Email',
    'common.notes': 'Notes',
    'common.description': 'Description',
    'common.category': 'Category',
    'common.amount': 'Amount',

    // POS
    'pos.title': 'Point of Sale',
    'pos.cart': 'Cart',
    'pos.empty_cart': 'Cart is empty',
    'pos.add_items': 'Add products to start a sale',
    'pos.pay_cash': 'Cash',
    'pos.pay_card': 'Card',
    'pos.pay_split': 'Split',
    'pos.hold': 'Hold',
    'pos.recall': 'Recall',
    'pos.clear': 'Clear',
    'pos.discount': 'Discount',
    'pos.customer': 'Customer',
    'pos.note': 'Note',
    'pos.complete': 'Complete Sale',
    'pos.change': 'Change',
    'pos.received': 'Received',
    'pos.favorites': 'Favorites',
    'pos.all_products': 'All Products',
    'pos.open_item': 'Open Item',

    // Settings
    'settings.title': 'Settings',
    'settings.business': 'Business Information',
    'settings.vat': 'VAT Settings',
    'settings.zakat': 'Zakat Settings',
    'settings.language': 'Language',
    'settings.invoice_format': 'Invoice Number Format',
    'settings.printer': 'Printer Settings',
    'settings.terminal': 'Payment Terminal',
    'settings.backup': 'Backup',
    'settings.theme': 'Theme',
    'settings.users': 'Users & Permissions',
    'settings.zatca': 'E-Invoicing (ZATCA)',
    'settings.license': 'License',
    'settings.about': 'About',

    // User roles
    'role.admin': 'Admin',
    'role.cashier': 'Cashier',
  }
};

// Current language state
let currentLang = 'ar';

function setLanguage(lang) {
  currentLang = lang;
  document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', lang);
  
  // Update all translatable elements
  document.querySelectorAll('[data-t]').forEach(el => {
    const key = el.getAttribute('data-t');
    if (translations[lang][key]) {
      el.textContent = translations[lang][key];
    }
  });
  
  // Update all placeholder translations
  document.querySelectorAll('[data-t-placeholder]').forEach(el => {
    const key = el.getAttribute('data-t-placeholder');
    if (translations[lang][key]) {
      el.placeholder = translations[lang][key];
    }
  });
}

function t(key) {
  return translations[currentLang][key] || key;
}

function getLang() {
  return currentLang;
}

window.i18n = { setLanguage, t, getLang, translations };

// Global HTML escape — single source of truth for all modules
window.escHtml = function(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
};

// Get currency symbol from settings
window.getCurrSym = function() {
  return window.appSettings?.currency?.symbol || (window.i18n?.getLang() === 'ar' ? 'ر.س' : 'SAR');
};

// ============ NUMERIC INPUT FILTER ============
// Auto-filters keystrokes on inputmode="decimal" and inputmode="numeric" fields
// Allows: digits, one dot (decimal only), backspace, delete, arrows, tab
document.addEventListener('keydown', (e) => {
  const el = e.target;
  if (!el || el.tagName !== 'INPUT') return;
  const mode = el.getAttribute('inputmode');
  if (mode !== 'decimal' && mode !== 'numeric') return;

  // Always allow: navigation, editing, shortcuts
  if (['Backspace','Delete','Tab','Escape','Enter','ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)) return;
  if (e.ctrlKey || e.metaKey) return; // Ctrl+A, Ctrl+C, Ctrl+V etc

  // Digits always allowed
  if (/^\d$/.test(e.key)) return;

  // Dot allowed once for decimal mode only
  if (e.key === '.' && mode === 'decimal' && !el.value.includes('.')) return;

  // Minus only at start for decimal mode
  if (e.key === '-' && mode === 'decimal' && el.selectionStart === 0 && !el.value.includes('-')) return;

  // Block everything else
  e.preventDefault();
});

// Also clean pasted content
document.addEventListener('paste', (e) => {
  const el = e.target;
  if (!el || el.tagName !== 'INPUT') return;
  const mode = el.getAttribute('inputmode');
  if (mode !== 'decimal' && mode !== 'numeric') return;

  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text');
  let clean;
  if (mode === 'numeric') {
    clean = text.replace(/[^\d]/g, '');
  } else {
    // decimal: keep digits, one dot, optional leading minus
    clean = text.replace(/[^\d.\-]/g, '');
    // Remove extra dots
    const parts = clean.split('.');
    if (parts.length > 2) clean = parts[0] + '.' + parts.slice(1).join('');
    // Remove extra minuses
    if (clean.indexOf('-') > 0) clean = clean.replace(/-/g, '');
  }
  document.execCommand('insertText', false, clean);
});
