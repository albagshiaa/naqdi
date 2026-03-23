let currentPage = 'dashboard';
window.appSettings = {};

// ============ INITIALIZATION ============
async function initApp() {
  window.dbg('info', 'App initializing...');
  
  // Load settings
  window.appSettings = await window.daftrly.getSettings();
  window.dbg('load', 'Settings loaded at startup', { theme: window.appSettings.theme, lang: window.appSettings.language, biz: window.appSettings.business?.nameAr || '(empty)' });
  
  // Apply theme
  document.documentElement.setAttribute('data-theme', window.appSettings.theme || 'dark');
  
  // Apply language
  const lang = window.appSettings.language || 'ar';
  document.documentElement.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
  document.documentElement.setAttribute('lang', lang);
  setLanguage(lang);
  
  // Show lock screen if PINs are configured
  await window.showLockScreen();

  // ====== LICENSE CHECK ======
  const licStatus = await window.daftrly.licenseGetStatus();
  window._licenseStatus = licStatus;

  if (licStatus.status === 'expired' || licStatus.status === 'invalid') {
    showLicenseLockScreen(licStatus);
    return; // Don't render the app
  }
  
  // Rebuild menu based on logged-in user
  const isAdmin = !window._currentUser || window._currentUser.role === 'admin' || window._currentUser.id === 0;
  window.daftrly.setMenu(isAdmin);
  
  // Render the app shell
  renderApp();

  // Show trial banner if in trial mode
  if (licStatus.status === 'trial') {
    showTrialBanner(licStatus);
  }
  
  // Navigate to dashboard
  navigateTo('dashboard');
  
  // Setup keyboard shortcuts
  setupKeyboardShortcuts();
  
  // Hide loading screen
  setTimeout(() => {
    const loader = document.getElementById('loading-screen');
    if (loader) {
      loader.classList.add('hide');
      setTimeout(() => loader.remove(), 500);
    }
  }, 300);
  
  window.dbg('success', 'App initialized successfully');
}

// ============ APP SHELL ============
function renderApp() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="app-container">
      ${renderSidebar()}
      <div class="main-content">
        ${renderHeader()}
        <div class="page-content" id="page-content"></div>
      </div>
    </div>
    <div class="toast-container" id="toast-container"></div>
  `;
  
  // Bind events after render
  bindSidebarEvents();
  bindHeaderEvents();
}

// ============ SIDEBAR ============
function renderSidebar() {
  const lang = getLang();
  const navItems = [
    { section: t('nav.main'), items: [
      { id: 'dashboard', icon: 'dashboard', label: t('nav.dashboard'), perm: null },
      { id: 'pos', icon: 'pos', label: t('nav.pos'), perm: 'pos_sell' },
      { id: 'products', icon: 'products', label: t('nav.products'), perm: 'products_view' },
      { id: 'customers', icon: 'customers', label: t('nav.customers'), perm: 'customers_view' },
      { id: 'reports', icon: 'reports', label: t('nav.reports'), perm: 'reports_view' },
    ]},
    { section: t('nav.management'), items: [
      { id: 'cash_session', icon: 'pos', label: lang === 'ar' ? 'الوردية النقدية' : 'Cash Session', perm: 'cash_session' },
      { id: 'audit_log', icon: 'reports', label: lang === 'ar' ? 'سجل النشاط' : 'Activity Log', perm: 'settings_access' },
      { id: 'unpaid', icon: 'expenses', label: lang === 'ar' ? 'مبالغ مستحقة' : 'Outstanding', perm: 'reports_view' },
      { id: 'expenses', icon: 'expenses', label: t('nav.expenses'), perm: 'expenses_view' },
      { id: 'suppliers', icon: 'suppliers', label: t('nav.suppliers'), perm: 'products_view' },
      { id: 'purchases', icon: 'purchases', label: t('nav.purchases'), perm: 'products_view' },
    ]},
    { section: '', items: [
      { id: 'settings', icon: 'settings', label: t('nav.settings'), perm: 'settings_access' },
    ]},
  ];

  let navHtml = '';
  navItems.forEach(section => {
    // Filter items by permission
    const visibleItems = section.items.filter(item => !item.perm || window.hasPermission(item.perm));
    if (visibleItems.length === 0) return;
    if (section.section) {
      navHtml += `<div class="nav-section-label">${section.section}</div>`;
    }
    visibleItems.forEach(item => {
      const isActive = currentPage === item.id ? 'active' : '';
      navHtml += `
        <div class="nav-item ${isActive}" data-page="${item.id}">
          <div class="nav-item-icon">${getIcon(item.icon)}</div>
          <span>${item.label}</span>
        </div>
      `;
    });
  });

  return `
    <aside class="sidebar">
      <div class="sidebar-header">
        <div class="sidebar-logo" style="background:transparent;border:none;display:flex;align-items:center;justify-content:center;">
          <svg width="38" height="38" viewBox="0 0 88 88" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="88" height="88" rx="20" fill="var(--logo-bg, #2563EB)"/>
            <path d="M32 30 C32 30 18 30 18 48 C18 66 38 66 54 66" fill="none" stroke="#FFFFFF" stroke-width="5.5" stroke-linecap="round"/>
            <path d="M54 66 C68 66 70 48 70 40 C70 28 62 28 56 28" fill="none" stroke="#D4A853" stroke-width="5.5" stroke-linecap="round"/>
            <circle cx="58" cy="16" r="6" fill="#D4A853"/>
          </svg>
        </div>
        <div class="sidebar-brand">
          <span class="sidebar-brand-name">${lang === 'ar' ? 'نقدي' : 'Naqdi'}</span>
          <span class="sidebar-brand-sub">${lang === 'ar' ? 'الكاشير الذكي' : 'Smart POS'}</span>
        </div>
      </div>
      <nav class="sidebar-nav">
        ${navHtml}
      </nav>
      <div class="sidebar-footer">
        <div class="sidebar-user">
          <div class="sidebar-user-avatar">${window._currentUser ? (window._currentUser.name_ar?.substring(0,2) || 'مد') : (lang === 'ar' ? 'مد' : 'AD')}</div>
          <div class="sidebar-user-info">
            <div class="sidebar-user-name">${window._currentUser ? window._currentUser.name_ar : t('role.admin')}</div>
            <div class="sidebar-user-role">${window._currentUser ? (window._currentUser.role === 'admin' ? (lang === 'ar' ? 'مدير' : 'Admin') : (lang === 'ar' ? 'كاشير' : 'Cashier')) : ''}</div>
          </div>
          <button class="btn btn-sm btn-secondary" id="sidebar-lock-btn" title="${lang === 'ar' ? 'قفل' : 'Lock'}" style="margin-${lang === 'ar' ? 'right' : 'left'}:auto;padding:4px 8px;font-size:14px;">🔒</button>
        </div>
      </div>
    </aside>
  `;
}

// ============ HEADER ============
function renderHeader() {
  const lang = getLang();
  const theme = window.appSettings.theme || 'dark';
  
  return `
    <header class="main-header">
      <h1 class="header-title" id="page-title">${t('nav.dashboard')}</h1>
      <div class="search-global">
        <div class="search-global-icon">${getIcon('search')}</div>
        <input type="text" id="global-search" data-t-placeholder="header.search" placeholder="${t('header.search')}">
      </div>
      <div class="header-actions">
        <button class="header-btn" id="theme-toggle" title="${lang === 'ar' ? 'تغيير المظهر' : 'Toggle theme'}">
          ${theme === 'dark' ? getIcon('sun') : getIcon('moon')}
        </button>
        <button class="header-btn" id="notification-btn" title="${lang === 'ar' ? 'الإشعارات' : 'Notifications'}" style="position:relative;">
          ${getIcon('bell')}
          <span id="notif-badge" style="display:none;position:absolute;top:2px;inset-inline-end:2px;background:var(--danger);color:#fff;font-size:9px;font-weight:800;min-width:16px;height:16px;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:0 3px;"></span>
        </button>
        <button class="lang-switch" id="lang-toggle">${t('header.lang')}</button>
      </div>
    </header>
  `;
}

// ============ NAVIGATION ============
function navigateTo(page) {
  window.dbg('nav', `Navigate to: ${page}`);
  
  // Permission guard
  const permMap = { pos: 'pos_sell', products: 'products_view', customers: 'customers_view', reports: 'reports_view', expenses: 'expenses_view', settings: 'settings_access', cash_session: 'cash_session' };
  const perm = permMap[page];
  if (perm && !window.hasPermission(perm)) {
    showToast(window.i18n?.getLang() === 'ar' ? '⛔ ليس لديك صلاحية' : '⛔ No permission', 'error');
    return;
  }

  currentPage = page;
  
  // Update active state
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  
  // Update page title
  const titleEl = document.getElementById('page-title');
  if (titleEl) {
    titleEl.textContent = t(`nav.${page}`) || page;
  }
  
  // Render page content
  const content = document.getElementById('page-content');
  if (content) {
    content.innerHTML = '';
    content.className = 'page-content fade-in';
    
    switch(page) {
      case 'dashboard': renderDashboard(content); break;
      case 'pos': window.renderPOS(content); break;
      case 'products': window.renderProducts(content); break;
      case 'customers': window.renderCustomers(content); break;
      case 'reports': window.renderReports(content); break;
      case 'expenses': window.renderExpenses(content); break;
      case 'cash_session': window.renderCashSession(content); break;
      case 'audit_log': window.renderAuditLog(content); break;
      case 'unpaid': window.renderUnpaidInvoices(content); break;
      case 'suppliers': window.renderSuppliers(content); break;
      case 'purchases': window.renderPurchases(content); break;
      case 'settings': window.renderSettings(content); break;
      default: renderDashboard(content);
    }
  }
}

// ============ DASHBOARD ============
async function renderDashboard(container) {
  const lang = getLang();

  // === TODAY'S STATS ===
  const todayRes = await window.daftrly.query(
    `SELECT COUNT(*) as count, COALESCE(SUM(total), 0) as total, COALESCE(SUM(tax_amount), 0) as tax, COALESCE(SUM(discount_amount), 0) as discount
     FROM sales WHERE date(created_at) = date('now') AND status = 'completed'`);
  const stats = todayRes.success && todayRes.data?.[0] ? todayRes.data[0] : { count: 0, total: 0, tax: 0, discount: 0 };
  
  const lowStockRes = await window.daftrly.query(
    `SELECT COUNT(*) as count FROM products WHERE track_stock = 1 AND stock_quantity <= reorder_level AND reorder_level > 0 AND is_active = 1`);
  const lowStock = lowStockRes.success && lowStockRes.data?.[0] ? lowStockRes.data[0].count : 0;

  // === OUTSTANDING BALANCE ===
  const outRes = await window.daftrly.query(
    `SELECT COUNT(*) as count, COALESCE(SUM(balance_due), 0) as total FROM sales WHERE balance_due > 0 AND status = 'completed'`);
  const outstanding = outRes.success && outRes.data?.[0] ? outRes.data[0] : { count: 0, total: 0 };

  // === LAST 7 DAYS SALES ===
  const weekRes = await window.daftrly.query(
    `SELECT date(created_at) as day, COUNT(*) as count, COALESCE(SUM(total), 0) as total
     FROM sales WHERE date(created_at) >= date('now', '-6 days') AND status = 'completed'
     GROUP BY date(created_at) ORDER BY day`);
  const weekData = weekRes.success ? (weekRes.data || []) : [];
  
  // Fill 7 days (even empty ones)
  const days7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    const match = weekData.find(w => w.day === ds);
    days7.push({ day: ds, label: d.toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', { weekday: 'short' }), total: match ? match.total : 0, count: match ? match.count : 0 });
  }
  const maxDay = Math.max(...days7.map(d => d.total), 1);

  // === PAYMENT METHODS ===
  const payRes = await window.daftrly.query(
    `SELECT payment_method, COUNT(*) as count, COALESCE(SUM(total), 0) as total
     FROM sales WHERE date(created_at) = date('now') AND status = 'completed' GROUP BY payment_method`);
  const payData = payRes.success ? (payRes.data || []) : [];
  const cashTotal = payData.find(p => p.payment_method === 'cash')?.total || 0;
  const cardTotal = payData.find(p => p.payment_method === 'card')?.total || 0;
  const splitTotal = payData.find(p => p.payment_method === 'split')?.total || 0;
  const payTotal = cashTotal + cardTotal + splitTotal || 1;
  const cashPct = Math.round((cashTotal / payTotal) * 100);
  const cardPct = Math.round((cardTotal / payTotal) * 100);
  const splitPct = 100 - cashPct - cardPct;

  // === TOP 5 PRODUCTS ===
  const topRes = await window.daftrly.query(
    `SELECT si.name_ar, si.name_en, SUM(si.quantity) as qty, SUM(si.total) as revenue
     FROM sale_items si INNER JOIN sales s ON s.id = si.sale_id
     WHERE s.status = 'completed' AND date(s.created_at) >= date('now', '-30 days')
     GROUP BY si.product_id ORDER BY revenue DESC LIMIT 5`);
  const topProducts = topRes.success ? (topRes.data || []) : [];
  const maxRevenue = topProducts.length > 0 ? topProducts[0].revenue : 1;

  // === HOURLY BREAKDOWN (today) ===
  const hourRes = await window.daftrly.query(
    `SELECT CAST(strftime('%H', created_at) AS INTEGER) as hour, COUNT(*) as count, COALESCE(SUM(total), 0) as total
     FROM sales WHERE date(created_at) = date('now') AND status = 'completed' GROUP BY hour`);
  const hourData = hourRes.success ? (hourRes.data || []) : [];
  const hours = [];
  for (let h = 8; h <= 23; h++) {
    const match = hourData.find(x => x.hour === h);
    hours.push({ hour: h, count: match ? match.count : 0, total: match ? match.total : 0 });
  }
  const maxHour = Math.max(...hours.map(h => h.count), 1);

  container.innerHTML = `
    <div class="slide-in" style="padding:0;">
      <!-- Stats Grid -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-card-label">${t('dashboard.today_sales')}</div>
          <div class="stat-card-value">${formatCurrency(stats.total)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">${t('dashboard.today_orders')}</div>
          <div class="stat-card-value">${stats.count}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card-label">${lang === 'ar' ? 'الضريبة اليوم' : 'Today VAT'}</div>
          <div class="stat-card-value">${formatCurrency(stats.tax)}</div>
        </div>
        <div class="stat-card" style="${lowStock > 0 ? 'border-color: var(--warning);' : ''}">
          <div class="stat-card-label">${t('dashboard.low_stock')}</div>
          <div class="stat-card-value" style="${lowStock > 0 ? 'color: var(--warning);' : ''}">${lowStock}</div>
        </div>
        ${outstanding.total > 0 ? `<div class="stat-card" style="border-color: var(--danger);">
          <div class="stat-card-label">${lang === 'ar' ? '💰 مبالغ مستحقة' : '💰 Outstanding'}</div>
          <div class="stat-card-value" style="color: var(--danger);">${formatCurrency(outstanding.total)}</div>
          <div style="font-size:11px;color:var(--text-tertiary);">${outstanding.count} ${lang === 'ar' ? 'فاتورة' : 'invoices'}</div>
        </div>` : ''}
      </div>

      ${await (async () => {
        const bkSettings = (window.appSettings || {}).backup || {};
        if (bkSettings.reminderEnabled === false) return '';
        const bkRes = await window.daftrly.getLastBackupDate();
        const bkDate = bkRes.success && bkRes.date ? bkRes.date : null;
        const days = bkDate ? Math.floor((Date.now() - new Date(bkDate).getTime()) / 86400000) : 999;
        const threshold = bkSettings.reminderDays || 3;
        if (days <= threshold) return '';
        return `<div style="background:rgba(239,68,68,0.1);border:1px solid var(--danger);border-radius:10px;padding:12px 16px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <span style="font-weight:700;color:var(--danger);">⚠️ ${lang === 'ar' ? `لم يتم عمل نسخة احتياطية منذ ${days} يوم` : `No backup for ${days} days`}</span>
            <span style="font-size:12px;color:var(--text-secondary);margin-inline-start:8px;">${lang === 'ar' ? 'ننصح بعمل نسخة احتياطية الآن' : 'We recommend backing up now'}</span>
          </div>
          <button class="btn btn-sm" style="background:var(--danger);color:#fff;border:none;" id="dashboard-backup-btn">
            ${lang === 'ar' ? '💾 نسخ الآن' : '💾 Backup Now'}
          </button>
        </div>`;
      })()}

      <!-- Charts Row -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">

        <!-- 7-Day Sales Chart -->
        <div class="card">
          <div class="card-header"><h3 class="card-title">${lang === 'ar' ? '📈 مبيعات آخر 7 أيام' : '📈 Last 7 Days Sales'}</h3></div>
          <div class="card-body" style="padding:12px 16px;">
            <div style="display:flex;align-items:flex-end;gap:6px;height:120px;">
              ${days7.map(d => {
                const h = Math.max(Math.round((d.total / maxDay) * 100), 4);
                const isToday = d.day === new Date().toISOString().split('T')[0];
                return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
                  <div style="font-size:9px;color:var(--text-tertiary);">${formatCurrency(d.total)}</div>
                  <div style="width:100%;height:${h}px;background:${isToday ? 'var(--accent)' : 'var(--blue-600)'};border-radius:4px 4px 0 0;min-height:4px;transition:height 0.3s;"></div>
                  <div style="font-size:10px;color:var(--text-secondary);${isToday ? 'font-weight:700;color:var(--accent);' : ''}">${d.label}</div>
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>

        <!-- Payment Method Pie -->
        <div class="card">
          <div class="card-header"><h3 class="card-title">${lang === 'ar' ? '💳 طرق الدفع اليوم' : '💳 Payment Methods Today'}</h3></div>
          <div class="card-body" style="padding:12px 16px;display:flex;align-items:center;gap:20px;">
            <div style="width:100px;height:100px;border-radius:50%;background:conic-gradient(var(--success) 0% ${cashPct}%, var(--accent) ${cashPct}% ${cashPct + cardPct}%, var(--warning) ${cashPct + cardPct}% 100%);flex-shrink:0;position:relative;">
              <div style="position:absolute;inset:20px;border-radius:50%;background:var(--bg-primary);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;">${stats.count}</div>
            </div>
            <div style="flex:1;font-size:13px;">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <div style="width:12px;height:12px;border-radius:3px;background:var(--success);"></div>
                <span>${lang === 'ar' ? 'نقدي' : 'Cash'}: ${formatCurrency(cashTotal)} (${cashPct}%)</span>
              </div>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                <div style="width:12px;height:12px;border-radius:3px;background:var(--accent);"></div>
                <span>${lang === 'ar' ? 'بطاقة' : 'Card'}: ${formatCurrency(cardTotal)} (${cardPct}%)</span>
              </div>
              ${splitTotal > 0 ? `<div style="display:flex;align-items:center;gap:8px;">
                <div style="width:12px;height:12px;border-radius:3px;background:var(--warning);"></div>
                <span>${lang === 'ar' ? 'تقسيم' : 'Split'}: ${formatCurrency(splitTotal)} (${splitPct}%)</span>
              </div>` : ''}
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom Row -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">

        <!-- Top Products -->
        <div class="card">
          <div class="card-header"><h3 class="card-title">${lang === 'ar' ? '🏆 أكثر المنتجات مبيعاً (30 يوم)' : '🏆 Top Products (30 days)'}</h3></div>
          <div class="card-body" style="padding:12px 16px;">
            ${topProducts.length === 0 ? `<div style="text-align:center;padding:20px;color:var(--text-tertiary);font-size:13px;">${lang === 'ar' ? 'لا توجد بيانات' : 'No data'}</div>` :
              topProducts.map((p, i) => {
                const name = lang === 'ar' ? p.name_ar : (p.name_en || p.name_ar);
                const w = Math.max(Math.round((p.revenue / maxRevenue) * 100), 8);
                const colors = ['var(--gold-500)', 'var(--accent)', 'var(--blue-400)', 'var(--success)', 'var(--warning)'];
                return `<div style="margin-bottom:8px;">
                  <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:2px;">
                    <span style="font-weight:600;">${i + 1}. ${_escU(name)}</span>
                    <span style="color:var(--text-secondary);">${formatCurrency(p.revenue)} (${Number(p.qty).toFixed(0)}x)</span>
                  </div>
                  <div style="height:6px;background:var(--bg-tertiary);border-radius:3px;overflow:hidden;">
                    <div style="height:100%;width:${w}%;background:${colors[i]};border-radius:3px;"></div>
                  </div>
                </div>`;
              }).join('')}
          </div>
        </div>

        <!-- Hourly Heatmap -->
        <div class="card">
          <div class="card-header"><h3 class="card-title">${lang === 'ar' ? '⏰ ساعات الذروة اليوم' : '⏰ Peak Hours Today'}</h3></div>
          <div class="card-body" style="padding:12px 16px;">
            <div style="display:grid;grid-template-columns:repeat(8, 1fr);gap:4px;">
              ${hours.map(h => {
                const intensity = h.count > 0 ? Math.max(Math.round((h.count / maxHour) * 100), 15) : 0;
                const bg = intensity > 0 ? `rgba(37, 99, 235, ${intensity / 100})` : 'var(--bg-tertiary)';
                const label = h.hour > 12 ? `${h.hour - 12}pm` : (h.hour === 12 ? '12pm' : `${h.hour}am`);
                return `<div style="text-align:center;" title="${label}: ${h.count} ${lang === 'ar' ? 'طلب' : 'orders'}">
                  <div style="width:100%;aspect-ratio:1;border-radius:6px;background:${bg};display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:${h.count > 0 ? '700' : '400'};color:${intensity > 50 ? '#fff' : 'var(--text-tertiary)'};">${h.count || '·'}</div>
                  <div style="font-size:8px;color:var(--text-tertiary);margin-top:2px;">${label}</div>
                </div>`;
              }).join('')}
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="card" style="margin-bottom: 20px;">
        <div class="card-header"><h3 class="card-title">${t('dashboard.quick_actions')}</h3></div>
        <div class="card-body" style="display: flex; gap: 12px; flex-wrap: wrap;">
          <button class="btn btn-primary btn-lg" data-nav="pos" style="flex: 1; min-width: 140px;">
            ${getIcon('pos')} ${t('dashboard.new_sale')}
          </button>
          <button class="btn btn-secondary btn-lg" data-nav="products" style="flex: 1; min-width: 140px;">
            ${getIcon('plus')} ${t('dashboard.add_product')}
          </button>
          <button class="btn btn-secondary btn-lg" data-nav="expenses" style="flex: 1; min-width: 140px;">
            ${getIcon('expenses')} ${t('dashboard.add_expense')}
          </button>
          <button class="btn btn-secondary btn-lg" data-nav="reports" style="flex: 1; min-width: 140px;">
            ${getIcon('reports')} ${t('dashboard.view_reports')}
          </button>
        </div>
      </div>
    </div>
  `;

  container.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.nav));
  });

  const backupBtn = container.querySelector('#dashboard-backup-btn');
  if (backupBtn) {
    backupBtn.addEventListener('click', () => {
      window.setSettingsActiveTab('backup');
      navigateTo('settings');
    });
  }
}

// ============ PLACEHOLDER PAGES ============
function renderPOSPlaceholder(container) {
  container.innerHTML = `
    <div class="empty-state slide-in">
      <div style="font-size: 64px; margin-bottom: 20px; opacity: 0.2;">🛒</div>
      <div class="empty-state-title">${t('pos.title')}</div>
      <div class="empty-state-desc">${getLang() === 'ar' ? 'شاشة نقطة البيع - سيتم بناؤها في الوحدة التالية' : 'POS Screen - will be built in the next module'}</div>
    </div>
  `;
}

function renderPlaceholder(container, page) {
  const pageNames = {
    products: { ar: 'المنتجات', en: 'Products', icon: '📦' },
    customers: { ar: 'العملاء', en: 'Customers', icon: '👥' },
    reports: { ar: 'التقارير', en: 'Reports', icon: '📊' },
    expenses: { ar: 'المصروفات', en: 'Expenses', icon: '💰' },
    suppliers: { ar: 'الموردين', en: 'Suppliers', icon: '🏭' },
    purchases: { ar: 'المشتريات', en: 'Purchases', icon: '🛍️' },
    settings: { ar: 'الإعدادات', en: 'Settings', icon: '⚙️' },
  };
  
  const info = pageNames[page] || { ar: page, en: page, icon: '📄' };
  const lang = getLang();
  
  container.innerHTML = `
    <div class="empty-state slide-in">
      <div style="font-size: 64px; margin-bottom: 20px; opacity: 0.2;">${info.icon}</div>
      <div class="empty-state-title">${lang === 'ar' ? info.ar : info.en}</div>
      <div class="empty-state-desc">${lang === 'ar' ? 'سيتم بناء هذه الصفحة في الوحدات القادمة' : 'This page will be built in upcoming modules'}</div>
    </div>
  `;
}

// ============ EVENT BINDING ============
function bindSidebarEvents() {
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => {
      navigateTo(el.dataset.page);
    });
  });

  // Lock button
  const lockBtn = document.getElementById('sidebar-lock-btn');
  if (lockBtn) {
    lockBtn.addEventListener('click', () => {
      window.lockApp();
    });
  }

  // Permission-based nav hiding
  applyNavPermissions();
}

function applyNavPermissions() {
  if (!window._currentUser || window._currentUser.role === 'admin' || window._currentUser.id === 0) return;

  const permMap = {
    'products': 'products_view',
    'customers': 'customers_view',
    'reports': 'reports_view',
    'expenses': 'expenses_view',
    'settings': 'settings_access',
    'cash_session': 'cash_session',
  };

  document.querySelectorAll('.nav-item').forEach(el => {
    const page = el.dataset.page;
    const perm = permMap[page];
    if (perm && !window.hasPermission(perm)) {
      el.style.display = 'none';
    }
  });
}

function bindHeaderEvents() {
  // Theme toggle
  const themeBtn = document.getElementById('theme-toggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', async () => {
      const current = document.documentElement.getAttribute('data-theme');
      const newTheme = current === 'dark' ? 'light' : 'dark';
      window.dbg('ui', `Theme toggle: ${current} → ${newTheme}`);
      document.documentElement.setAttribute('data-theme', newTheme);
      await window.daftrly.setSetting('theme', newTheme);
      window.appSettings.theme = newTheme;
      themeBtn.innerHTML = newTheme === 'dark' ? getIcon('sun') : getIcon('moon');
      showToast(getLang() === 'ar' ? 'تم تغيير المظهر' : 'Theme changed', 'success');
    });
  }
  
  // Language toggle
  const langBtn = document.getElementById('lang-toggle');
  if (langBtn) {
    langBtn.addEventListener('click', async () => {
      const newLang = getLang() === 'ar' ? 'en' : 'ar';
      window.dbg('ui', `Language toggle: → ${newLang}`);
      await window.daftrly.setSetting('language', newLang);
      window.appSettings.language = newLang;
      setLanguage(newLang);
      renderApp();
      navigateTo(currentPage);
      showToast(newLang === 'ar' ? 'تم التغيير إلى العربية' : 'Switched to English', 'success');
    });
  }
  
  // Global search
  const searchInput = document.getElementById('global-search');
  if (searchInput) {
    searchInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Escape') {
        searchInput.value = '';
        searchInput.blur();
      }
      if (e.key === 'Enter') {
        const query = searchInput.value.trim();
        if (!query) return;
        
        // Check if it's an invoice number
        if (query.toUpperCase().startsWith('INV-') || /^\d{4,}$/.test(query)) {
          const invRes = await window.daftrly.query(
            'SELECT id FROM sales WHERE invoice_number LIKE ? OR id = ? LIMIT 1',
            [`%${query}%`, parseInt(query) || 0]);
          if (invRes.success && invRes.data?.length) {
            searchInput.value = '';
            searchInput.blur();
            openInvoicePreviewFromSearch(invRes.data[0].id);
            return;
          }
        }
        
        // Check if it's a product barcode/name
        const prodRes = await window.daftrly.query(
          'SELECT name_ar FROM products WHERE barcode = ? OR sku = ? OR name_ar LIKE ? OR name_en LIKE ? LIMIT 1',
          [query, query, `%${query}%`, `%${query}%`]);
        if (prodRes.success && prodRes.data?.length) {
          searchInput.value = '';
          searchInput.blur();
          navigateTo('products');
          return;
        }
        
        // Check if it's a customer phone
        const custRes = await window.daftrly.query(
          'SELECT id FROM customers WHERE phone LIKE ? OR name_ar LIKE ? OR name_en LIKE ? LIMIT 1',
          [`%${query}%`, `%${query}%`, `%${query}%`]);
        if (custRes.success && custRes.data?.length) {
          searchInput.value = '';
          searchInput.blur();
          navigateTo('customers');
          return;
        }
        
        // Not found
        showToast(getLang() === 'ar' ? 'لا توجد نتائج' : 'No results found', 'warning');
      }
    });
  }

  // Notification bell
  const notifBtn = document.getElementById('notification-btn');
  if (notifBtn) {
    notifBtn.addEventListener('click', () => openNotificationPanel());
  }
  // Load notification count on page load
  updateNotifBadge();
}

// ============ NOTIFICATIONS ============
async function updateNotifBadge() {
  const badge = document.getElementById('notif-badge');
  if (!badge) return;
  const count = await getNotifCount();
  if (count > 0) {
    badge.style.display = 'flex';
    badge.textContent = count > 9 ? '9+' : String(count);
  } else {
    badge.style.display = 'none';
  }
}

async function getNotifCount() {
  let count = 0;
  const oosRes = await window.daftrly.query('SELECT COUNT(*) as c FROM products WHERE track_stock=1 AND is_active=1 AND stock_quantity<=0');
  count += (oosRes.success && oosRes.data?.[0]) ? oosRes.data[0].c : 0;
  const lowRes = await window.daftrly.query('SELECT COUNT(*) as c FROM products WHERE track_stock=1 AND is_active=1 AND stock_quantity>0 AND stock_quantity<=reorder_level AND reorder_level>0');
  count += (lowRes.success && lowRes.data?.[0]) ? lowRes.data[0].c : 0;
  const unpaidRes = await window.daftrly.query("SELECT COUNT(*) as c FROM sales WHERE balance_due>0 AND status='completed'");
  count += (unpaidRes.success && unpaidRes.data?.[0]) ? unpaidRes.data[0].c : 0;
  // Backup overdue
  try {
    const bkRes = await window.daftrly.getLastBackupDate();
    const bkDate = bkRes.success && bkRes.date ? bkRes.date : null;
    const bkDays = bkDate ? Math.floor((Date.now() - new Date(bkDate).getTime()) / 86400000) : 999;
    const threshold = window.appSettings?.backup?.reminderDays || 3;
    if (bkDays > threshold) count++;
  } catch(e) {}
  return count;
}

async function openNotificationPanel() {
  // Remove existing
  const existing = document.getElementById('notif-panel');
  if (existing) { existing.remove(); return; }

  const lang = getLang();

  // Gather notifications
  const notifs = [];

  const oosRes = await window.daftrly.query('SELECT COUNT(*) as c FROM products WHERE track_stock=1 AND is_active=1 AND stock_quantity<=0');
  const oosCount = (oosRes.success && oosRes.data?.[0]) ? oosRes.data[0].c : 0;
  if (oosCount > 0) notifs.push({ icon: '🔴', text: lang === 'ar' ? `${oosCount} منتج نفد المخزون` : `${oosCount} products out of stock`, action: 'products', severity: 'danger' });

  const lowRes = await window.daftrly.query('SELECT COUNT(*) as c FROM products WHERE track_stock=1 AND is_active=1 AND stock_quantity>0 AND stock_quantity<=reorder_level AND reorder_level>0');
  const lowCount = (lowRes.success && lowRes.data?.[0]) ? lowRes.data[0].c : 0;
  if (lowCount > 0) notifs.push({ icon: '🟡', text: lang === 'ar' ? `${lowCount} منتج مخزون منخفض` : `${lowCount} products low stock`, action: 'products', severity: 'warning' });

  // Expiry date alerts
  const expiryDays = Number(window.appSettings?.expiryAlertDays) || 30;
  const expiryRes = await window.daftrly.query(
    "SELECT COUNT(*) as c FROM products WHERE is_active=1 AND expiry_date IS NOT NULL AND expiry_date != '' AND date(expiry_date) <= date('now', '+' || ? || ' days')", [expiryDays]);
  const expiryCount = (expiryRes.success && expiryRes.data?.[0]) ? expiryRes.data[0].c : 0;
  if (expiryCount > 0) notifs.push({ icon: '📅', text: lang === 'ar' ? `${expiryCount} منتج قارب انتهاء الصلاحية` : `${expiryCount} products expiring soon`, action: 'products', severity: 'warning' });

  const unpaidRes = await window.daftrly.query("SELECT COUNT(*) as c, COALESCE(SUM(balance_due),0) as total FROM sales WHERE balance_due>0 AND status='completed'");
  const unpaid = (unpaidRes.success && unpaidRes.data?.[0]) ? unpaidRes.data[0] : { c: 0, total: 0 };
  if (unpaid.c > 0) notifs.push({ icon: '💰', text: lang === 'ar' ? `${unpaid.c} فاتورة غير مدفوعة (${formatCurrency(unpaid.total)})` : `${unpaid.c} unpaid invoices (${formatCurrency(unpaid.total)})`, action: 'unpaid', severity: 'warning' });

  try {
    const bkRes = await window.daftrly.getLastBackupDate();
    const bkDate = bkRes.success && bkRes.date ? bkRes.date : null;
    const bkDays = bkDate ? Math.floor((Date.now() - new Date(bkDate).getTime()) / 86400000) : 999;
    const threshold = window.appSettings?.backup?.reminderDays || 3;
    if (bkDays > threshold) notifs.push({ icon: '⚠️', text: lang === 'ar' ? `النسخ الاحتياطي متأخر (${bkDays} يوم)` : `Backup overdue (${bkDays} days)`, action: 'settings', severity: 'danger' });
  } catch(e) {}

  const panel = document.createElement('div');
  panel.id = 'notif-panel';
  panel.style.cssText = 'position:fixed;top:52px;inset-inline-end:80px;width:320px;background:var(--bg-primary);border:1px solid var(--border);border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,0.3);z-index:9999;overflow:hidden;';
  panel.innerHTML = `
    <div style="padding:12px 16px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
      <strong style="font-size:14px;">${lang === 'ar' ? '🔔 الإشعارات' : '🔔 Notifications'}</strong>
      <span style="font-size:12px;color:var(--text-tertiary);">${notifs.length}</span>
    </div>
    ${notifs.length === 0 ? `
      <div style="padding:24px;text-align:center;color:var(--text-tertiary);font-size:13px;">
        ✅ ${lang === 'ar' ? 'لا توجد تنبيهات' : 'No alerts'}
      </div>
    ` : notifs.map(n => `
      <div class="notif-item" data-action="${n.action}" style="padding:10px 16px;border-bottom:1px solid var(--bg-tertiary);cursor:pointer;display:flex;align-items:center;gap:10px;transition:background 0.15s;" onmouseover="this.style.background='var(--bg-secondary)'" onmouseout="this.style.background='transparent'">
        <span style="font-size:18px;">${n.icon}</span>
        <span style="font-size:13px;flex:1;color:var(--text-primary);">${n.text}</span>
        <span style="font-size:11px;color:var(--text-tertiary);">→</span>
      </div>
    `).join('')}
  `;
  document.body.appendChild(panel);

  // Click on notification → navigate
  panel.querySelectorAll('.notif-item').forEach(item => {
    item.addEventListener('click', () => {
      panel.remove();
      navigateTo(item.dataset.action);
    });
  });

  // Close when clicking outside
  const closePanel = (e) => {
    if (!panel.contains(e.target) && e.target.id !== 'notification-btn' && !e.target.closest('#notification-btn')) {
      panel.remove();
      document.removeEventListener('click', closePanel);
    }
  };
  setTimeout(() => document.addEventListener('click', closePanel), 50);
}

// ============ STANDALONE INVOICE PREVIEW (from global search) ============
async function openInvoicePreviewFromSearch(saleId) {
  const lang = getLang();
  const settings = window.appSettings || {};
  const biz = settings.business || {};
  const vatRate = settings.vat?.rate || 15;

  const saleRes = await window.daftrly.query(
    `SELECT s.*, c.name_ar as cust_name_ar, c.name_en as cust_name_en, c.phone as cust_phone
     FROM sales s LEFT JOIN customers c ON s.customer_id = c.id WHERE s.id = ?`, [saleId]);
  if (!saleRes.success || !saleRes.data?.[0]) { showToast(lang === 'ar' ? 'فاتورة غير موجودة' : 'Invoice not found', 'error'); return; }
  const sale = saleRes.data[0];

  const itemsRes = await window.daftrly.query('SELECT * FROM sale_items WHERE sale_id = ?', [saleId]);
  const items = itemsRes.success ? (itemsRes.data || []) : [];

  const paymentsRes = await window.daftrly.query('SELECT * FROM payments WHERE sale_id = ?', [saleId]);
  const payments = paymentsRes.success ? (paymentsRes.data || []) : [];

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.display = 'flex';
  overlay.innerHTML = `
    <div class="modal" style="max-width:500px;width:95%;max-height:90vh;overflow-y:auto;">
      <div class="modal-header">
        <h3>${sale.invoice_number}</h3>
        <button class="modal-close" id="inv-prev-close">✕</button>
      </div>
      <div class="modal-body" style="padding:20px;font-size:13px;">
        <div style="text-align:center;margin-bottom:12px;">
          <div style="font-weight:700;font-size:16px;">${biz.nameAr || 'نقدي'}</div>
          ${biz.vatNumber ? `<div style="font-size:11px;color:var(--text-secondary);">VAT: ${biz.vatNumber}</div>` : ''}
          <div style="font-size:11px;color:var(--text-tertiary);">${sale.created_at?.substring(0, 19) || ''}</div>
        </div>

        ${sale.cust_name_ar ? `<div style="margin-bottom:8px;padding:8px;background:var(--bg-secondary);border-radius:6px;">
          <strong>${sale.cust_name_ar}</strong> ${sale.cust_phone ? '— ' + sale.cust_phone : ''}
        </div>` : ''}

        <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
          <thead><tr style="border-bottom:1px solid var(--border);">
            <th style="text-align:right;padding:4px;">${lang === 'ar' ? 'المنتج' : 'Item'}</th>
            <th style="text-align:center;padding:4px;">${lang === 'ar' ? 'الكمية' : 'Qty'}</th>
            <th style="text-align:center;padding:4px;">${lang === 'ar' ? 'السعر' : 'Price'}</th>
            <th style="text-align:left;padding:4px;">${lang === 'ar' ? 'الإجمالي' : 'Total'}</th>
          </tr></thead>
          <tbody>${items.map(it => `<tr style="border-bottom:1px solid var(--bg-tertiary);">
            <td style="padding:4px;font-weight:600;">${lang === 'ar' ? it.name_ar : (it.name_en || it.name_ar)}</td>
            <td style="padding:4px;text-align:center;">${it.quantity}</td>
            <td style="padding:4px;text-align:center;">${Number(it.unit_price).toFixed(2)}</td>
            <td style="padding:4px;text-align:left;font-weight:700;">${Number(it.total).toFixed(2)}</td>
          </tr>`).join('')}</tbody>
        </table>

        <div style="border-top:2px solid var(--border);padding-top:8px;">
          <div style="display:flex;justify-content:space-between;padding:2px 0;"><span>${lang === 'ar' ? 'المجموع الفرعي' : 'Subtotal'}</span><span>${Number(sale.subtotal).toFixed(2)}</span></div>
          ${Number(sale.discount_amount) > 0 ? `<div style="display:flex;justify-content:space-between;padding:2px 0;color:var(--danger);"><span>${lang === 'ar' ? 'الخصم' : 'Discount'}</span><span>-${Number(sale.discount_amount).toFixed(2)}</span></div>` : ''}
          ${Number(sale.exchange_credit) > 0 ? `<div style="display:flex;justify-content:space-between;padding:2px 0;color:var(--warning);"><span>${lang === 'ar' ? 'رصيد استبدال' : 'Exchange Credit'}</span><span>-${Number(sale.exchange_credit).toFixed(2)}</span></div>` : ''}
          <div style="display:flex;justify-content:space-between;padding:2px 0;"><span>${lang === 'ar' ? 'الضريبة' : 'VAT'} (${vatRate}%)</span><span>${Number(sale.tax_amount).toFixed(2)}</span></div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;font-size:18px;font-weight:900;border-top:2px solid var(--border);margin-top:4px;">
            <span>${lang === 'ar' ? 'الإجمالي' : 'TOTAL'}</span><span>${Number(sale.total).toFixed(2)} ${window.getCurrSym()}</span>
          </div>
        </div>

        ${payments.length > 0 ? `<div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);">
          ${payments.map(p => `<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:12px;">
            <span>${p.method === 'cash' ? (lang === 'ar' ? 'نقدي' : 'Cash') : p.method === 'card' ? (lang === 'ar' ? 'بطاقة' : 'Card') : p.method}</span>
            <span>${Number(p.amount).toFixed(2)}</span>
          </div>`).join('')}
          ${Number(sale.change_amount) > 0 ? `<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:12px;color:var(--success);"><span>${lang === 'ar' ? 'الباقي' : 'Change'}</span><span>${Number(sale.change_amount).toFixed(2)}</span></div>` : ''}
          ${Number(sale.balance_due) > 0 ? `<div style="display:flex;justify-content:space-between;padding:2px 0;font-size:12px;font-weight:700;color:var(--danger);"><span>${lang === 'ar' ? 'المبلغ المتبقي' : 'Balance Due'}</span><span>${Number(sale.balance_due).toFixed(2)}</span></div>` : ''}
        </div>` : ''}

        <div style="display:flex;justify-content:space-between;padding:2px 0;margin-top:8px;font-size:12px;color:var(--text-tertiary);">
          <span>${lang === 'ar' ? 'الحالة' : 'Status'}: ${sale.payment_status === 'paid' ? '✅' : '⏳'} ${sale.payment_status}</span>
          <span>${sale.payment_method || ''}</span>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.querySelector('#inv-prev-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

// ============ KEYBOARD SHORTCUTS ============
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // F1 = Dashboard
    if (e.key === 'F1') { e.preventDefault(); navigateTo('dashboard'); }
    // F2 = POS
    if (e.key === 'F2') { e.preventDefault(); navigateTo('pos'); }
    // F3 = Products
    if (e.key === 'F3') { e.preventDefault(); navigateTo('products'); }
    // F4 = Customers
    if (e.key === 'F4') { e.preventDefault(); navigateTo('customers'); }
  });
}

// ============ UTILITIES ============
function formatCurrency(amount) {
  const lang = getLang();
  const num = Number(amount || 0).toFixed(window.appSettings.currency?.decimals ?? 2);
  const formatted = Number(num).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-SA');
  const symbol = window.appSettings.currency?.symbol || (lang === 'ar' ? 'ر.س' : 'SAR');
  
  if (window.appSettings.currency?.position === 'before') {
    return `${symbol} ${formatted}`;
  }
  return `${formatted} ${symbol}`;
}

function showToast(message, type = 'success', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  const iconMap = { success: '✓', error: '✗', warning: '⚠' };
  toast.innerHTML = `<span style="font-size:16px;">${iconMap[type] || '●'}</span> ${message}`;
  
  container.appendChild(toast);
  
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 300ms ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// Make functions globally accessible
window.navigateTo = navigateTo;
window.renderApp = renderApp;
window.showToast = showToast;
window.formatCurrency = formatCurrency;
window.openInvoicePreviewFromSearch = openInvoicePreviewFromSearch;

// ============ ZATCA QUEUE PERIODIC PROCESSOR ============
// Processes any pending ZATCA invoices every 60 seconds
let _zatcaQueueRunning = false;
setInterval(async () => {
  if (_zatcaQueueRunning) return; // prevent overlap
  try {
    const settings = await window.daftrly.getSettings();
    if (settings.zatcaMode && settings.zatcaMode !== 'off') {
      _zatcaQueueRunning = true;
      const result = await window.daftrly.zatcaProcessQueue();
      if (result && result.processed > 0) {
        window.dbg('info', `ZATCA auto-queue: ${result.processed} reported, ${result.failed} failed`);
      }
    }
  } catch (e) {
    // Silent
  } finally {
    _zatcaQueueRunning = false;
  }
}, 60000);

// Refresh notification badge every 2 minutes
setInterval(() => { if (typeof updateNotifBadge === 'function') updateNotifBadge(); }, 120000);

// ============ SESSION TIMEOUT — AUTO-LOCK ============
let _inactivityTimer = null;
function startInactivityTimer() {
  clearTimeout(_inactivityTimer);
  const minutes = parseInt(window.appSettings?.sessionTimeout) || 0;
  if (minutes <= 0) return; // Disabled
  _inactivityTimer = setTimeout(() => {
    // Don't lock if payment modal is open (mid-transaction)
    if (document.querySelector('.modal-overlay[style*="flex"]') || document.querySelector('#pos-modal-overlay[style*="flex"]')) {
      startInactivityTimer(); // Restart — check again later
      return;
    }
    if (typeof window.showLockScreen === 'function') window.showLockScreen();
  }, minutes * 60 * 1000);
}
function resetInactivityTimer() { startInactivityTimer(); }
['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
  document.addEventListener(evt, resetInactivityTimer, { passive: true });
});
window._startInactivityTimer = startInactivityTimer;
// Start timer on app load
setTimeout(startInactivityTimer, 3000);

// Auto-open customer display if it was enabled
setTimeout(async () => {
  if (window.appSettings?.customerDisplay) {
    const idx = window.appSettings.customerScreenIdx || 1;
    await window.daftrly.openDisplay(idx);
    const biz = window.appSettings?.business || {};
    const lang = window.i18n?.getLang() || 'ar';
    setTimeout(() => {
      window.daftrly.updateDisplay({ type: 'init', shopName: biz.nameAr || biz.nameEn || 'نقدي', totalLabel: lang === 'ar' ? 'الإجمالي' : 'Total' });
    }, 1000);
  }
}, 4000);

// ============ MENU EVENT HANDLERS ============
if (window.daftrly.onMenuNav) {
  window.daftrly.onMenuNav((page) => {
    navigateTo(page);
  });
}

if (window.daftrly.onMenuAction) {
  window.daftrly.onMenuAction(async (action) => {
    const lang = getLang();
    switch (action) {
      case 'export-sales':
        navigateTo('reports');
        break;
      case 'backup':
        const backupResult = await window.daftrly.createBackup();
        if (backupResult.success) showToast(lang === 'ar' ? '✅ تم النسخ الاحتياطي' : '✅ Backup created', 'success');
        break;
      case 'restore':
        navigateTo('settings');
        break;
      case 'shortcuts':
        if (window.showShortcutsOverlay) window.showShortcutsOverlay();
        break;
      case 'about':
        showAboutDialog();
        break;
    }
  });
}

function showAboutDialog() {
  const lang = getLang();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:420px;width:90%;">
      <div class="modal-header">
        <h3>${lang === 'ar' ? 'عن نقدي' : 'About Naqdi'}</h3>
        <button class="modal-close" id="about-close">✕</button>
      </div>
      <div class="modal-body" style="padding:24px;text-align:center;">
        <div style="margin-bottom:16px;">
          <svg width="64" height="64" viewBox="0 0 88 88" xmlns="http://www.w3.org/2000/svg">
            <rect x="0" y="0" width="88" height="88" rx="20" fill="var(--logo-bg, #2563EB)"/>
            <path d="M32 30 C32 30 18 30 18 48 C18 66 38 66 54 66" fill="none" stroke="#FFFFFF" stroke-width="5.5" stroke-linecap="round"/>
            <path d="M54 66 C68 66 70 48 70 40 C70 28 62 28 56 28" fill="none" stroke="#D4A853" stroke-width="5.5" stroke-linecap="round"/>
            <circle cx="58" cy="16" r="6" fill="#D4A853"/>
          </svg>
        </div>
        <div style="font-size:24px;font-weight:700;margin-bottom:4px;">نقدي</div>
        <div style="font-size:13px;color:var(--text-secondary);letter-spacing:2px;margin-bottom:4px;">NAQDI</div>
        <div style="font-size:12px;color:var(--text-tertiary);margin-bottom:16px;" id="about-version">${lang === 'ar' ? 'الكاشير الذكي' : 'Smart POS'} — v${window.daftrly.version}</div>
        <div style="border-top:1px solid var(--border-primary);padding-top:16px;font-size:12px;color:var(--text-secondary);line-height:1.8;">
          <div style="font-weight:600;">© 2025 ${lang === 'ar' ? 'شركة أساس البحث التجارية المحدودة' : 'Asas Albahth Commercial Company'}</div>
          <div>${lang === 'ar' ? 'جميع الحقوق محفوظة' : 'All rights reserved'}</div>
          <div style="margin-top:8px;font-size:11px;color:var(--text-tertiary);">
            Naqdi ${lang === 'ar' ? 'علامة تجارية مسجلة مملوكة ومُشغَلة من قبل' : 'is a registered trademark owned and operated by'}<br>
            ${lang === 'ar' ? 'شركة أساس البحث التجارية المحدودة' : 'Asas Albahth Commercial Company'}
          </div>
          <div style="margin-top:12px;">
            <a href="#" id="about-email" style="color:var(--accent);text-decoration:none;font-weight:600;">info@asassearch.com</a>
          </div>
        </div>
      </div>
    </div>
  `;

  overlay.style.display = 'flex';
  document.body.appendChild(overlay);

  overlay.querySelector('#about-close').addEventListener('click', () => overlay.remove());
  // Fetch real version from main process
  if (window.daftrly.getVersion) {
    window.daftrly.getVersion().then(v => {
      const el = overlay.querySelector('#about-version');
      if (el) el.textContent = (lang === 'ar' ? 'الكاشير الذكي' : 'Smart POS') + ' — v' + v;
    }).catch(() => {});
  }
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  overlay.querySelector('#about-email').addEventListener('click', (e) => {
    e.preventDefault();
    window.daftrly.openExternal('mailto:info@asassearch.com?subject=Daftrly Support');
  });
}
window.showAboutDialog = showAboutDialog;

// ============ KEYBOARD SHORTCUTS OVERLAY ============
function showShortcutsOverlay() {
  const lang = getLang();
  const shortcuts = [
    { key: 'F5', ar: 'دفع نقدي', en: 'Cash Payment' },
    { key: 'F6', ar: 'دفع بطاقة', en: 'Card Payment' },
    { key: 'F7', ar: 'دفع مقسم', en: 'Split Payment' },
    { key: 'F8', ar: 'تعليق البيع', en: 'Hold Sale' },
    { key: 'F9', ar: 'خصم على الفاتورة', en: 'Invoice Discount' },
    { key: 'Ctrl+K', ar: 'بحث المنتجات', en: 'Search Products' },
    { key: '↑ / ↓', ar: 'التنقل في السلة', en: 'Navigate Cart' },
    { key: '+ / -', ar: 'زيادة / تقليل الكمية', en: 'Increase / Decrease Qty' },
    { key: 'Delete', ar: 'حذف من السلة', en: 'Remove from Cart' },
    { key: 'Escape', ar: 'إغلاق النافذة', en: 'Close Modal' },
    { key: 'F11', ar: 'شاشة كاملة', en: 'Toggle Fullscreen' },
    { key: 'Ctrl+B', ar: 'نسخ احتياطي', en: 'Quick Backup' },
  ];

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:480px;width:90%;">
      <div class="modal-header">
        <h3>${lang === 'ar' ? '⌨️ اختصارات لوحة المفاتيح' : '⌨️ Keyboard Shortcuts'}</h3>
        <button class="modal-close" id="shortcuts-close">✕</button>
      </div>
      <div class="modal-body" style="padding:16px 24px;">
        <table style="width:100%;border-collapse:collapse;">
          ${shortcuts.map(s => `
            <tr style="border-bottom:1px solid var(--border-primary);">
              <td style="padding:10px 8px;"><kbd style="background:var(--bg-tertiary);padding:3px 10px;border-radius:6px;font-family:var(--font-mono);font-size:13px;font-weight:700;border:1px solid var(--border-primary);">${s.key}</kbd></td>
              <td style="padding:10px 8px;font-size:14px;">${lang === 'ar' ? s.ar : s.en}</td>
            </tr>
          `).join('')}
        </table>
      </div>
    </div>
  `;

  overlay.style.display = 'flex';
  document.body.appendChild(overlay);

  overlay.querySelector('#shortcuts-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.addEventListener('keydown', function escHandler(e) {
    if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escHandler); }
  });
}
window.showShortcutsOverlay = showShortcutsOverlay;

// ============ AUTO-UPDATE NOTIFICATION ============
(function setupUpdateNotifications() {
  if (!window.daftrly?.onUpdateDownloaded) return;

  window.daftrly.onUpdateDownloaded((version) => {
    // Show a non-intrusive notification bar at the bottom
    const existing = document.getElementById('update-bar');
    if (existing) return; // Already showing

    const lang = window.appSettings?.language || 'ar';
    const bar = document.createElement('div');
    bar.id = 'update-bar';
    bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:9999;background:linear-gradient(90deg,#2563EB,#1D4ED8);color:#fff;padding:8px 16px;display:flex;align-items:center;justify-content:center;gap:12px;font-size:13px;font-weight:600;box-shadow:0 -2px 8px rgba(0,0,0,0.3);';
    bar.innerHTML = `
      <span>🎉 ${lang === 'ar' ? `الإصدار ${version} جاهز للتثبيت` : `Version ${version} is ready to install`}</span>
      <button id="update-restart" style="background:#fff;color:#1D4ED8;border:none;padding:4px 16px;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer;">
        ${lang === 'ar' ? '🔄 إعادة التشغيل الآن' : '🔄 Restart Now'}
      </button>
      <button id="update-later" style="background:transparent;color:rgba(255,255,255,0.8);border:1px solid rgba(255,255,255,0.3);padding:4px 12px;border-radius:6px;font-size:12px;cursor:pointer;">
        ${lang === 'ar' ? 'لاحقاً' : 'Later'}
      </button>
    `;
    document.body.appendChild(bar);

    bar.querySelector('#update-restart').addEventListener('click', () => {
      window.daftrly.installUpdate();
    });
    bar.querySelector('#update-later').addEventListener('click', () => {
      bar.remove();
    });
  });
})();

// ============ LICENSE: TRIAL BANNER ============
function showTrialBanner(licStatus) {
  const lang = window.appSettings?.language || 'ar';
  const banner = document.createElement('div');
  banner.id = 'trial-banner';
  banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9998;background:linear-gradient(90deg,#D4A853,#B8941F);color:#1E293B;padding:6px 16px;display:flex;align-items:center;justify-content:center;gap:12px;font-size:13px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,0.3);';
  
  const updateBanner = async () => {
    const fresh = await window.daftrly.licenseGetStatus();
    if (fresh.status === 'licensed') {
      banner.remove();
      document.body.style.paddingTop = '';
      const sb = document.querySelector('.sidebar');
      if (sb) sb.style.height = '';
      return;
    }
    if (fresh.status === 'expired' || fresh.status === 'invalid') {
      banner.remove();
      document.body.style.paddingTop = '';
      const sb = document.querySelector('.sidebar');
      if (sb) sb.style.height = '';
      showLicenseLockScreen(fresh);
      return;
    }
    const remaining = fresh.remainingMs || 0;
    const days = Math.ceil(remaining / (24 * 60 * 60 * 1000));
    const timeText = days > 0 ? `${days} ${lang === 'ar' ? 'يوم' : (days === 1 ? 'day' : 'days')}` : (lang === 'ar' ? 'انتهت' : 'Expired');
    banner.innerHTML = `
      <span>⏳ ${lang === 'ar' ? 'تجربة مجانية:' : 'Free Trial:'} <b>${timeText}</b> ${lang === 'ar' ? 'متبقي' : 'remaining'}</span>
      <a href="#" id="trial-license-link" style="background:rgba(30,41,59,0.5);color:#D4A853;padding:3px 12px;border-radius:6px;text-decoration:none;font-size:12px;font-weight:600;">
        🔑 ${lang === 'ar' ? 'إدخال الترخيص' : 'Enter License'}
      </a>
      <a href="#" id="trial-buy-link" style="background:#1E293B;color:#D4A853;padding:3px 12px;border-radius:6px;text-decoration:none;font-size:12px;font-weight:700;">
        🛒 ${lang === 'ar' ? 'شراء ترخيص' : 'Buy License'}
      </a>
    `;
    banner.querySelector('#trial-buy-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      window.daftrly.openExternal('https://essentialsmarket.online/en/products/RtOjkDRNDaggXfM2gtyO');
    });
    banner.querySelector('#trial-license-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      if (typeof navigateTo === 'function') navigateTo('settings');
      // Navigate to license tab within settings
      setTimeout(() => {
        const licTab = document.querySelector('[data-tab="license"]');
        if (licTab) licTab.click();
      }, 300);
    });
  };

  updateBanner();
  const interval = setInterval(updateBanner, 30000); // Update every 30 seconds
  banner._interval = interval;
  document.body.prepend(banner);

  // Push app content down and adjust sidebar height for the banner
  document.body.style.paddingTop = '36px';
  // Sidebar uses height:100vh — needs to shrink to account for banner
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) sidebar.style.height = 'calc(100vh - 36px)';
}

// ============ LICENSE: LOCK SCREEN ============
function showLicenseLockScreen(licStatus) {
  const lang = window.appSettings?.language || 'ar';

  // Remove any existing content
  const existingBanner = document.getElementById('trial-banner');
  if (existingBanner) {
    clearInterval(existingBanner._interval);
    existingBanner.remove();
  }
  document.body.style.paddingTop = '0';

  const overlay = document.createElement('div');
  overlay.id = 'license-lock-screen';
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:var(--bg-primary,#0F172A);z-index:99999;display:flex;align-items:center;justify-content:center;flex-direction:column;';
  
  const reasonText = licStatus.reason === 'clock_tamper' 
    ? (lang === 'ar' ? 'تم اكتشاف تلاعب بالوقت' : 'Clock tampering detected')
    : licStatus.reason === 'machine_mismatch'
    ? (lang === 'ar' ? 'هذا الترخيص مرتبط بجهاز آخر' : 'License bound to another machine')
    : (lang === 'ar' ? 'انتهت الفترة التجريبية' : 'Trial period has expired');

  overlay.innerHTML = `
    <div style="text-align:center;max-width:420px;width:100%;padding:32px;">
      <div style="margin-bottom:16px;">
        <img src="icon-64.png" style="width:72px;height:72px;border-radius:16px;" alt="Naqdi">
      </div>
      <h1 style="color:#2563EB;font-size:28px;margin-bottom:4px;">نقدي</h1>
      <p style="color:#64748B;margin-bottom:20px;font-size:13px;">Naqdi — Smart POS</p>
      
      <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:8px;padding:12px;margin-bottom:24px;">
        <div style="font-size:15px;font-weight:700;color:#EF4444;">🔒 ${reasonText}</div>
      </div>

      <div style="margin-bottom:16px;">
        <label style="display:block;text-align:${lang === 'ar' ? 'right' : 'left'};font-size:13px;font-weight:600;color:#94A3B8;margin-bottom:6px;">
          ${lang === 'ar' ? 'مفتاح الترخيص' : 'License Key'}
        </label>
        <input type="text" id="license-key-input" style="width:100%;padding:12px;border-radius:8px;border:2px solid #334155;background:#1E293B;color:#F8FAFC;font-size:15px;font-family:monospace;text-align:center;box-sizing:border-box;" 
          placeholder="${lang === 'ar' ? 'أدخل مفتاح الترخيص' : 'Enter your license key'}">
      </div>

      <button id="license-activate-btn" style="width:100%;padding:12px;border-radius:8px;border:none;background:#2563EB;color:white;font-size:15px;font-weight:700;cursor:pointer;margin-bottom:12px;">
        🔓 ${lang === 'ar' ? 'تفعيل الترخيص' : 'Activate License'}
      </button>

      <div id="license-error" style="font-size:13px;color:#EF4444;margin-bottom:12px;min-height:20px;"></div>

      <a href="#" id="license-buy-link" style="display:inline-block;padding:10px 24px;border-radius:8px;background:linear-gradient(135deg,#D4A853,#B8941F);color:#1E293B;text-decoration:none;font-size:14px;font-weight:700;">
        🛒 ${lang === 'ar' ? 'شراء ترخيص' : 'Buy License'}
      </a>

      <div style="margin-top:20px;font-size:11px;color:#475569;">
        ${lang === 'ar' ? 'بياناتك محفوظة — بعد تفعيل الترخيص ستعود كما هي' : 'Your data is safe — it will be restored after activation'}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Buy link
  overlay.querySelector('#license-buy-link').addEventListener('click', (e) => {
    e.preventDefault();
    window.daftrly.openExternal('https://essentialsmarket.online/en/products/RtOjkDRNDaggXfM2gtyO');
  });

  // Activate
  overlay.querySelector('#license-activate-btn').addEventListener('click', async () => {
    const key = overlay.querySelector('#license-key-input').value.trim();
    const errEl = overlay.querySelector('#license-error');
    const btn = overlay.querySelector('#license-activate-btn');
    if (!key) { errEl.textContent = lang === 'ar' ? 'أدخل المفتاح' : 'Enter a key'; return; }
    
    btn.disabled = true;
    btn.textContent = lang === 'ar' ? '⏳ جارٍ التحقق...' : '⏳ Verifying...';
    errEl.textContent = '';

    const result = await window.daftrly.licenseActivate(key);
    if (result.success) {
      overlay.remove();
      document.body.style.paddingTop = '0';
      // Restart the app
      window.location.reload();
    } else {
      btn.disabled = false;
      btn.textContent = lang === 'ar' ? '🔓 تفعيل الترخيص' : '🔓 Activate License';
      errEl.innerHTML = `${result.error || (lang === 'ar' ? 'فشل التفعيل' : 'Activation failed')}${result.debug ? `<br><span style="font-size:10px;color:#64748B;word-break:break-all;">${result.debug}</span>` : ''}`;
    }
  });

  // Enter key to activate
  overlay.querySelector('#license-key-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') overlay.querySelector('#license-activate-btn').click();
  });

  // Hidden: Ctrl+Shift+F12 = reset trial (for testing only — remove in production)
  document.addEventListener('keydown', function _resetHandler(e) {
    if (e.ctrlKey && e.shiftKey && e.key === 'F12') {
      document.removeEventListener('keydown', _resetHandler);
      window.daftrly.licenseDeactivate().then(() => window.location.reload());
    }
  });
}

// ============ START THE APP ============
document.addEventListener('DOMContentLoaded', initApp);
