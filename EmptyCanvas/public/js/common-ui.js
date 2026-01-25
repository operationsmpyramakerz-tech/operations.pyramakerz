// public/js/common-ui.js
document.addEventListener('DOMContentLoaded', () => {
  // 🔒 مهم: نخفي روابط السايدبار من البداية لتجنب "فلاش" كل الصفحات
  // لازم الـ body يبقى عليه الكلاس ده قبل ما الصلاحيات تتطبق.
  // هنضيفه هنا كـ safety (وكمان هنضيفه في الـ HTML body كـ default).
  document.body.classList.add('permissions-loading');

  // Page-specific body class (used by CSS to tune some pages like Home/Notifications)
  // Examples: /home => page-home, /expenses/users => page-expenses-users
  try {
    const p = String(window.location?.pathname || "/").replace(/\/+$/, "") || "/";
    const slug = (p === "/") ? "root" : p.split("/").filter(Boolean).join("-");
    document.body.classList.add(`page-${slug}`);
  } catch {}

  const logoutBtn     = document.getElementById('logoutBtn');
  let menuToggle    = null;     // injected on mobile
  let sidebarToggle = document.getElementById('sidebar-toggle');  // removed (logo is the toggle now)

  const KEY_MINI       = 'ui.sidebarMini';   // 1 = mini على الديسكتوب
  const CACHE_ALLOWED  = 'allowedPages';     // sessionStorage key
  const isMobile = () => window.innerWidth <= 768;

  // =====================================================
  // UI Redesign helpers
  // - Sidebar tooltips when labels are hidden
  // - Ensure every page has a main header
  // - Convert the existing header to the new green style
  // =====================================================

  function ensureNavTooltips(){
    document.querySelectorAll('.sidebar .nav-link').forEach((a) => {
      try {
        const lbl = a.querySelector('.nav-label');
        const text = (lbl && lbl.textContent) ? String(lbl.textContent).trim() : '';
        if (text && !a.getAttribute('title')) a.setAttribute('title', text);
      } catch {}
    });
  }

  function ensureMainHeaderExists(){
    // Some pages (e.g. tasks.html) intentionally shipped without a main header.
    // The redesign requires a consistent header on all pages.
    if (document.querySelector('.main-header')) return;

    const main = document.querySelector('.main-content');
    if (!main) return;

    const header = document.createElement('header');
    header.className = 'main-header';

    const row1 = document.createElement('div');
    row1.className = 'header-row1';

    const left = document.createElement('div');
    left.className = 'left';

    const right = document.createElement('div');
    right.className = 'right topbar-right';

    // Account shortcut (will be restyled as avatar in the green header)
    const acc = document.createElement('a');
    acc.className = 'account-mini';
    acc.href = '/account';
    acc.title = 'My account';
    acc.setAttribute('aria-label', 'My account');
    acc.innerHTML = `
      <span class="ico-circle"><img src="/images/logo.png" alt="Logo" /></span>
      <span class="label">My account</span>
    `;

    right.appendChild(acc);
    row1.appendChild(left);
    row1.appendChild(right);

    const row2 = document.createElement('div');
    row2.className = 'header-row2';
    const h1 = document.createElement('h1');
    h1.className = 'page-title';
    h1.textContent = (document.title || 'Dashboard').trim();
    row2.appendChild(h1);

    header.appendChild(row1);
    header.appendChild(row2);

    // Insert at the top of main content
    main.insertBefore(header, main.firstChild);
  }

  function ensureGreenHeaderLayout(){
    const header = document.querySelector('.main-header');
    if (!header) return;

    const row1 = header.querySelector('.header-row1');
    if (!row1) return;

    const left = row1.querySelector('.left') || row1;
    const right = row1.querySelector('.right') || row1;

    // 1) Lead round button (left)
    let lead = left.querySelector('.gh-lead-btn');
    if (!lead) {
      lead = document.createElement('button');
      lead.type = 'button';
      lead.className = 'gh-lead-btn';
      lead.id = 'ghLeadBtn';
      lead.setAttribute('aria-label', 'Menu');
      // Match the reference UI (asterisk-like icon)
      lead.innerHTML = `<i data-feather="asterisk"></i>`;

      // On mobile: toggle the sidebar overlay
      lead.addEventListener('click', (e) => {
        if (!isMobile()) return;
        toggleSidebar(e);
      });

      // Put it first in the left area
      left.insertBefore(lead, left.firstChild);
    }

    // 2) Wave container (right)
    let wave = right.querySelector('.gh-wave');
    if (!wave) {
      wave = document.createElement('div');
      wave.className = 'gh-wave';
      wave.id = 'ghWave';
      right.insertBefore(wave, right.firstChild);
    }

    // 3) Searchbar: reuse existing if present to preserve page-specific JS
    const existingSearch = header.querySelector('.searchbar');
    if (existingSearch && existingSearch.parentElement !== wave) {
      wave.insertBefore(existingSearch, wave.firstChild);
    }

    if (!wave.querySelector('.searchbar')) {
      const sb = document.createElement('div');
      sb.className = 'searchbar';
      sb.id = 'ghSearchbar';
      sb.setAttribute('role', 'search');
      sb.innerHTML = `
        <i data-feather="search"></i>
        <input type="search" placeholder="SEARCH" aria-label="Search" />
      `;
      wave.insertBefore(sb, wave.firstChild);
    }

    // 4) Notifications: if already mounted elsewhere, move inside the wave
    const notifWrap = header.querySelector('.notif-wrap');
    if (notifWrap && notifWrap.parentElement !== wave) {
      wave.appendChild(notifWrap);
    }

    // 5) Account (avatar): move inside the wave
    const acc = header.querySelector('.account-mini');
    if (acc && acc.parentElement !== wave) {
      wave.appendChild(acc);
    }

    // Feather re-render for injected icons
    if (window.feather) {
      try { window.feather.replace(); } catch {}
    }
  }

  // ====== Sidebar Branding + Profile + Settings ======
  function ensureSidebarBranding(){
    const header = document.querySelector('.sidebar .sidebar-header');
    if (!header) return;

    // Replace the "Dashboard" title with the company orange logo.
    // (Do not rely on editing every HTML page.)
    const h2 = header.querySelector('h2');
    if (h2) {
      // Keep for accessibility, but do not show the text.
      h2.setAttribute('aria-label', (h2.textContent || 'Dashboard').trim());
      h2.textContent = '';
      h2.style.display = 'none';
    }
    // Remove legacy single-logo implementation (older builds)
    const legacyLogo = header.querySelector('img.sidebar-brand-logo');
    if (legacyLogo) {
      try { legacyLogo.remove(); } catch {}
    }

    // Insert a brand toggle that can animate between:
    // - Full horizontal logo (sidebar open)
    // - Icon logo (sidebar mini)
    let brandToggle = header.querySelector('#sidebar-logo-toggle');
    if (!brandToggle) {
      brandToggle = document.createElement('div');
      brandToggle.className = 'sidebar-brand-toggle';
      brandToggle.id = 'sidebar-logo-toggle';
      brandToggle.innerHTML = `
        <img class="brand-logo-full" src="/images/Logo%20horizontal.png" alt="Company logo" />
        <img class="brand-logo-icon" src="/images/logo.png" alt="" aria-hidden="true" />
      `;
      header.insertBefore(brandToggle, header.firstChild);
    }

    // Make brand toggle act as the sidebar toggle (replaces the arrow button)
    brandToggle.setAttribute('role', 'button');
    brandToggle.setAttribute('tabindex', '0');
    brandToggle.setAttribute('aria-label', 'Toggle dashboard');

    if (!brandToggle.dataset.boundToggle) {
      brandToggle.dataset.boundToggle = '1';
      brandToggle.addEventListener('click', (e) => toggleSidebar(e));
      brandToggle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          toggleSidebar(e);
        }
      });
    }
  }

  function ensureSidebarProfile(){
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return null;

    let profile = sidebar.querySelector('.sidebar-profile');
    if (profile) return profile;

    const nav = sidebar.querySelector('.sidebar-nav');
    if (!nav) return null;

    profile = document.createElement('div');
    profile.className = 'sidebar-profile';
    profile.innerHTML = `
      <div class="sidebar-profile__avatar">
        <img class="sidebar-profile__img" alt="Profile photo" loading="lazy" />
        <div class="sidebar-profile__fallback" aria-hidden="true"></div>
      </div>
      <div class="sidebar-profile__meta">
        <div class="sidebar-profile__name" data-sidebar-name>...</div>
        <div class="sidebar-profile__role" data-sidebar-role></div>
      </div>
    `;

    sidebar.insertBefore(profile, nav);
    return profile;
  }

  function initialsFromName(name){
    const n = String(name || '').trim();
    if (!n) return '';
    const parts = n.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] || '';
    const last  = parts.length > 1 ? parts[parts.length - 1]?.[0] : '';
    return (first + last).toUpperCase();
  }

  function renderSidebarProfile({ name = '', position = '', department = '', photoUrl = '' } = {}){
    const profile = ensureSidebarProfile();
    if (!profile) return;

    const elName = profile.querySelector('[data-sidebar-name]');
    const elRole = profile.querySelector('[data-sidebar-role]');
    const img    = profile.querySelector('.sidebar-profile__img');
    const fb     = profile.querySelector('.sidebar-profile__fallback');

    const safeName = String(name || '').trim() || getCachedName() || 'User';
    const safeRole = String(position || '').trim() || String(department || '').trim();

    if (elName) elName.textContent = safeName;
    if (elRole) elRole.textContent = safeRole;

    const initials = initialsFromName(safeName);

    // Show image if we have a URL, otherwise show initials fallback.
    if (img) {
      if (photoUrl) {
        img.src = photoUrl;
        img.style.display = 'block';
        img.setAttribute('alt', safeName + ' photo');
        if (fb) fb.style.display = 'none';
      } else {
        img.removeAttribute('src');
        img.style.display = 'none';
        if (fb) {
          fb.textContent = initials || '';
          fb.style.display = 'grid';
        }
      }
    }
  }

  function ensureSettingsLink(){
    // Add a settings action above logout → opens account info
    const sidebar = document.querySelector('.sidebar');
    if (!sidebar) return;
    const footer = sidebar.querySelector('.sidebar-footer');
    if (!footer) return;

    const logout = footer.querySelector('#logoutBtn');
    let settings = footer.querySelector('#sidebarSettings');
    if (!settings) {
      settings = document.createElement('a');
      settings.id = 'sidebarSettings';
      settings.className = 'logout-btn settings-btn';
      settings.href = '/account';
      settings.innerHTML = `<i data-feather="settings"></i> Settings`;
      if (logout) footer.insertBefore(settings, logout);
      else footer.appendChild(settings);
    }

    // On mobile, close sidebar when navigating
    settings.addEventListener('click', () => {
      if (!isMobile()) return;
      document.body.classList.add('sidebar-collapsed');
      setAria();
    });
  }
// ====== Mobile Sidebar UX (hamburger button + backdrop) ======
// Goal:
// - On mobile: sidebar is collapsed by default.
// - Provide a top-left button to open it.
// - Clicking anywhere outside (backdrop) closes it.
function ensureSidebarBackdrop(){
  let backdrop = document.querySelector('.sidebar-backdrop');
  if (!backdrop){
    backdrop = document.createElement('div');
    backdrop.className = 'sidebar-backdrop';
    backdrop.id = 'sidebar-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    document.body.appendChild(backdrop);
  }

  // Close when tapping outside the sidebar (mobile only)
  // Note: CSS already shows/hides backdrop via body.sidebar-collapsed
  backdrop.addEventListener('click', () => {
    if (!isMobile()) return;
    if (document.body.classList.contains('sidebar-collapsed')) return;
    document.body.classList.add('sidebar-collapsed');
    setAria();
  });

  return backdrop;
}

function ensureMenuToggle(){
  let btn = document.getElementById('menu-toggle');
  if (btn) {
    // If it already exists from an older build, normalize it to the logo button
    btn.setAttribute('aria-label', 'Toggle dashboard');
    if (!btn.querySelector('img.menu-toggle-logo')) {
      btn.innerHTML = '<img class="menu-toggle-logo" src="/images/logo.png" alt="" />';
    }
    return btn;
  }

  // Put the button at the top-left inside the header (if header exists)
  const target =
    document.querySelector('.main-header .header-row1 .left') ||
    document.querySelector('.main-header .header-row1') ||
    document.querySelector('.main-header');

  if (!target) return null;

  btn = document.createElement('button');
  btn.id = 'menu-toggle';
  btn.type = 'button';
  btn.className = 'menu-toggle';
  btn.setAttribute('aria-label', 'Toggle dashboard');
  btn.innerHTML = '<img class="menu-toggle-logo" src="/images/logo.png" alt="" />';

  target.insertBefore(btn, target.firstChild);
  return btn;
}


function relocateAccountLink(){
  // Move the "My account" button from the top header into the sidebar footer,
  // and render it as a Settings action (above Logout).
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  const footer = sidebar.querySelector('.sidebar-footer');
  if (!footer) return;

  const accountLink =
    document.querySelector('.account-mini[href="/account"]') ||
    document.querySelector('.account-mini[href="/account/"]') ||
    document.querySelector('a.account-mini');

  if (!accountLink) return;

  // Convert to a settings-style link (icon + label)
  const styleAsSettings = () => {
    accountLink.id = 'sidebarSettings';
    accountLink.href = '/account';
    accountLink.setAttribute('aria-label', 'Account settings');
    accountLink.classList.remove('account-mini', 'account-in-sidebar');
    accountLink.classList.add('logout-btn', 'settings-btn');
    accountLink.innerHTML = `<i data-feather="settings"></i> Settings`;
  };

  // If it's already in the footer, just ensure order (above Logout)
  const logout = footer.querySelector('#logoutBtn');
  if (footer.contains(accountLink)) {
    if (logout && logout.parentNode === footer) {
      footer.insertBefore(accountLink, logout);
    }
    styleAsSettings();
    return;
  }

  // Detach from header and place in footer above logout
  if (logout && logout.parentNode === footer) footer.insertBefore(accountLink, logout);
  else footer.appendChild(accountLink);

  styleAsSettings();
}

// Inject only on pages that have the sidebar layout
if (document.querySelector('.sidebar')) {
  ensureSidebarBackdrop();
  menuToggle = ensureMenuToggle();
  ensureSidebarBranding();

  // Remove the old arrow toggle button (we toggle via the company logo instead)
  if (sidebarToggle) {
    try { sidebarToggle.remove(); } catch {}
    sidebarToggle = null;
  }
  ensureSidebarProfile();
  relocateAccountLink();
  ensureSettingsLink();
  if (window.feather) feather.replace();
}


  // ====== Access control (show/hide links) ======
  // مفاتيح lowercase للمقارنة الثابتة
  const PAGE_SELECTORS = {
    // ===== Orders =====
    'current orders': 'a[href="/orders"]',
    'create new order': 'a[href="/orders/new"]',
    'stocktaking': 'a[href="/stocktaking"]',
    'tasks': 'a[href="/tasks"]',

    'requested orders': 'a[href="/orders/requested"]',
    'schools requested orders': 'a[href="/orders/requested"]',

    'assigned schools requested orders': 'a[href="/orders/assigned"]',
    'storage': 'a[href="/orders/assigned"]',

    's.v schools orders': 'a[href="/orders/sv-orders"]',

    // ===== B2B =====
    'b2b': 'a[href="/b2b"]',

    // ===== Logistics =====
    'logistics': 'a[href="/logistics"]',

    // ===== Expenses =====
    'my expenses': 'a[href="/expenses"]',
    'expenses': 'a[href="/expenses"]',

    'expenses users': 'a[href^="/expenses/users"]',
    'expenses by user': 'a[href^="/expenses/users"]',

    // ===== Finance =====
    'funds': 'a[href="/funds"]',

    // ===== Assets =====
    'damaged assets': 'a[href="/damaged-assets"]',
    's.v schools assets': 'a[href="/sv-assets"]',
    'damaged assets reviewed': 'a[href="/damaged-assets-reviewed"]',
    'reviewed damaged assets': 'a[href="/damaged-assets-reviewed"]'
  };

  const toKey = (s) => String(s || '').trim().toLowerCase();
  const normPath = (s) => toKey(s).replace(/\/+$/, ''); // يشيل / في الآخر لو موجود

  function hideEl(el){ if (el){ el.style.display = 'none'; el.setAttribute('aria-hidden','true'); } }
  function showEl(el){ if (el){ el.style.display = ''; el.removeAttribute('aria-hidden'); } }

  // أظهر المسموح وأخفِ غير المسموح (حتمي)
  function applyAllowedPages(allowed){
    if (!Array.isArray(allowed)) return;

    // allowedPages ممكن تيجي:
    // 1) أسماء صفحات: "Expenses Users"
    // 2) مسارات: "/expenses/users" أو "expenses/users"
    const allowedSet = new Set();
    allowed.forEach(v => {
      const k = toKey(v);
      const p = normPath(v);
      allowedSet.add(k);
      allowedSet.add(p);
      if (p && !p.startsWith('/')) allowedSet.add('/' + p);
      if (p && p.startsWith('/')) allowedSet.add(p.slice(1));
    });

    // 🔒 Default deny: اخفي كل اللينكات الأول
    Object.values(PAGE_SELECTORS).forEach(selector => {
      const link = document.querySelector(selector);
      if (!link) return;
      hideEl(link.closest('li') || link);
    });

    // ✅ أظهر المسموح فقط
    Object.entries(PAGE_SELECTORS).forEach(([key, selector]) => {
      const link = document.querySelector(selector);
      if (!link) return;

      const li = link.closest('li') || link;
      const href = link.getAttribute('href') || '';
      const hrefKey = normPath(href); // "/expenses/users"

      // matching على:
      // - اسم الصفحة (key)
      // - أو href path (مع normalize)
      if (allowedSet.has(key) || allowedSet.has(hrefKey)) {
        showEl(li);
      }
    });
  }

  function cacheAllowedPages(arr){
    try { sessionStorage.setItem(CACHE_ALLOWED, JSON.stringify(arr || [])); } catch {}
  }
  function getCachedAllowedPages(){
    try {
      const r = sessionStorage.getItem(CACHE_ALLOWED);
      const a = JSON.parse(r);
      return Array.isArray(a) ? a : null;
    } catch { return null; }
  }

  // ====== Greeting ======
  const getCachedName = () => (localStorage.getItem('username') || '').trim();
  const renderGreeting = (name) => {
    const n = (name || '').trim();
    document.querySelectorAll('[data-username]').forEach(el => el.textContent = n || 'User');
  };

  // ★ Inject links once so they exist for show/hide (لو مش موجودين في الـ HTML)
    function ensureLink({ href, label, icon, prepend = false, beforeHref = '' }) {
      const nav = document.querySelector('.sidebar .nav-list, .sidebar nav ul, .sidebar ul');
      if (!nav) return;
      if (nav.querySelector(`a[href="${href}"]`)) return;

      const li = document.createElement('li');
      const a  = document.createElement('a');
      a.className = 'nav-link';
      a.href = href;
      a.innerHTML = `<i data-feather="${icon}"></i><span class="nav-label">${label}</span>`;
      li.appendChild(a);

      // Insert position controls
      const before = beforeHref ? nav.querySelector(`a[href="${beforeHref}"]`)?.closest('li') : null;
      if (before) {
        nav.insertBefore(li, before);
      } else if (prepend && nav.firstChild) {
        nav.insertBefore(li, nav.firstChild);
      } else {
        nav.appendChild(li);
      }

      if (window.feather) feather.replace();
    }


  // Rename sidebar labels (display-only) without changing routes
  function renameSidebarLabels(){
    // Operations Orders (was: Operations Requested Orders)
    document
      .querySelectorAll('a.nav-item[href^="/orders/requested"], a.nav-link[href^="/orders/requested"]')
      .forEach((a) => {
        const lbl = a.querySelector('.nav-label');
        if (lbl) lbl.textContent = 'Operations Orders';
      });
  }

  async function ensureGreetingAndPages(){
    const cached = getCachedName();
    if (cached) {
      renderGreeting(cached);
      // also prefill sidebar profile quickly from cache (then refresh from API)
      renderSidebarProfile({ name: cached });
    }

    try {
      const res = await fetch('/api/account', { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();

      const name = (data && (data.name || data.username)) ? String(data.name || data.username) : '';
      if (name) {
        if (name !== cached) localStorage.setItem('username', name);
        renderGreeting(name);
      } else if (!cached) {
        renderGreeting('User');
      }

      // Sidebar profile (photo + name + position)
      renderSidebarProfile({
        name: name || cached || '',
        position: data.position || '',
        department: data.department || '',
        photoUrl: data.photoUrl || ''
      });

      if (Array.isArray(data.allowedPages)) {
        cacheAllowedPages(data.allowedPages);

        // 🔒 اخفي الكل ثم أظهر المسموح
        applyAllowedPages([]);
        applyAllowedPages(data.allowedPages);

        // ✅ بعد ما طبقنا الصلاحيات، نكشف اللي مسموح بس (بدون فلاش)
        document.body.classList.remove('permissions-loading');
        document.body.classList.add('permissions-ready');
      }
    } catch {}
  }

  // ====== Sidebar toggle ======
  function setAria(){
    const expanded = isMobile()
      ? !document.body.classList.contains('sidebar-collapsed')
      : !document.body.classList.contains('sidebar-mini');
    const sidebarLogoToggle = document.getElementById('sidebar-logo-toggle');
    [menuToggle, sidebarLogoToggle].forEach(btn => btn && btn.setAttribute('aria-expanded', String(!!expanded)));
  }

  function applyInitial(){
    if (isMobile()){
      document.body.classList.remove('sidebar-mini');
      // على الموبايل: السايدبار يكون مقفول افتراضياً (overlay)
      // ويفتح فوق المحتوى بدون ما يزق الصفحة.
      document.body.classList.add('sidebar-collapsed');
    } else {
      const pref = localStorage.getItem(KEY_MINI);
      if (pref === '1') document.body.classList.add('sidebar-mini');
      else document.body.classList.remove('sidebar-mini');
      document.body.classList.remove('sidebar-collapsed');
    }
    setAria();
  }

  function toggleSidebar(e){
    if (e){ e.preventDefault(); e.stopPropagation(); }
    if (isMobile()){
      document.body.classList.toggle('sidebar-collapsed');
    } else {
      document.body.classList.toggle('sidebar-mini');
      localStorage.setItem(KEY_MINI, document.body.classList.contains('sidebar-mini') ? '1' : '0');
    }
    setAria();
    if (window.feather) feather.replace();
  }

  menuToggle    && menuToggle.addEventListener('click', toggleSidebar);

  // ✅ Requested: close the dashboard when clicking outside it
  // - Mobile: closes the overlay sidebar
  // - Desktop: collapses to mini sidebar
  document.addEventListener('click', (event) => {
    const insideSidebar = event.target.closest('.sidebar');
    const onToggles = event.target.closest('#menu-toggle') || event.target.closest('#sidebar-logo-toggle');
    if (insideSidebar || onToggles) return;

    if (isMobile()) {
      // Close only if open
      if (document.body.classList.contains('sidebar-collapsed')) return;
      document.body.classList.add('sidebar-collapsed');
      setAria();
      return;
    }

    // Desktop: collapse only if currently expanded
    if (document.body.classList.contains('sidebar-mini')) return;
    document.body.classList.add('sidebar-mini');
    try { localStorage.setItem(KEY_MINI, '1'); } catch {}
    setAria();
  });

  document.addEventListener('keydown', (e) => {
    if (isMobile() && e.key === 'Escape' && !document.body.classList.contains('sidebar-collapsed')) {
      document.body.classList.add('sidebar-collapsed');
      setAria();
    }
  });

  // ====== Logout ======
  logoutBtn && logoutBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try { await fetch('/api/logout', { method: 'POST', credentials: 'include' }); } catch(e) {}
    try { sessionStorage.clear(); } catch {}
    try { localStorage.removeItem(KEY_MINI); localStorage.removeItem('username'); } catch {}
    window.location.href = '/login';
  });

  // Init
  applyInitial();

  // UI Redesign: ensure header exists + convert it to the green style
  ensureMainHeaderExists();
  ensureGreenHeaderLayout();

  // لو عندك لينكات بتتعمل inject في صفحات معينة:
    // Home should appear for everyone (not tied to permissions)
  ensureLink({ href: '/home', label: 'Home', icon: 'home', prepend: true });
ensureLink({ href: '/orders/sv-orders', label: 'S.V schools orders', icon: 'award' });
  ensureLink({ href: '/damaged-assets', label: 'Damaged Assets', icon: 'alert-octagon' });
  ensureLink({ href: '/expenses/users', label: 'Expenses by User', icon: 'users' });
  ensureLink({ href: '/b2b', label: 'B2B', icon: 'folder' });
  ensureLink({ href: '/tasks', label: 'Tasks', icon: 'check-square' });

  // UI Redesign: sidebar tooltips (labels are hidden in the new style)
  ensureNavTooltips();

  ensureGreetingAndPages();

  window.addEventListener('user:updated', () => {
    // Refresh name + sidebar profile + permissions from the server
    ensureGreetingAndPages();
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(applyInitial, 150);
  });

  if (window.feather) feather.replace();
});


// UI Toast — modern notifications
(() => {
  const ROOT_ID = 'toast-root';

  function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      root.setAttribute('aria-live', 'polite');
      root.setAttribute('aria-atomic', 'true');
      document.body.appendChild(root);
    }
    return root;
  }

  function iconNameByType(type) {
    switch (type) {
      case 'success': return 'check-circle';
      case 'error':   return 'x-circle';
      case 'warning': return 'alert-triangle';
      default:        return 'info';
    }
  }

  function toast({ title = '', message = '', type = 'success', duration = 4000 } = {}) {
    const root = ensureRoot();

    const el = document.createElement('div');
    el.className = `toast toast--${type}`;

    el.innerHTML = `
      <div class="toast__icon"><i data-feather="${iconNameByType(type)}"></i></div>
      <div class="toast__body">
        ${title ? `<div class="toast__title">${title}</div>` : ''}
        <div class="toast__msg">${message}</div>
      </div>
      <button class="toast__close" aria-label="Close">&times;</button>
      <div class="toast__progress"></div>
    `;

    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    if (window.feather) feather.replace({ 'stroke-width': 2 });

    const close = () => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 200);
    };
    el.querySelector('.toast__close').addEventListener('click', close);

    let start = Date.now();
    const prog = el.querySelector('.toast__progress');
    const tick = () => {
      const pct = Math.min(100, ((Date.now() - start) / duration) * 100);
      prog.style.width = `${100 - pct}%`;
      if (pct < 100 && document.body.contains(el)) requestAnimationFrame(tick);
      else close();
    };
    requestAnimationFrame(tick);
  }

  window.UI = window.UI || {};
  window.UI.toast = toast;
})();

// ============================================================================
// Global protection against double-submits (auto busy state)
// - Adds a loading spinner animation on the last clicked button while a
//   mutating fetch (POST/PATCH/PUT/DELETE) is in-flight.
// - Disables the button to prevent multiple clicks.
// Works across all pages without needing to manually update every handler.
// ============================================================================
(function () {
  if (window.__opsAutoBusyWrapped) return;
  window.__opsAutoBusyWrapped = true;

  // Track the last clicked actionable element (more reliable than activeElement
  // when the code disables the button before starting the fetch).
  let lastActionEl = null;
  let lastActionAt = 0;

  const ACTION_SELECTOR = "button, .btn, .ro-action-btn";

  document.addEventListener(
    "pointerdown",
    (e) => {
      const el = e.target && e.target.closest ? e.target.closest(ACTION_SELECTOR) : null;
      if (!el) return;
      lastActionEl = el;
      lastActionAt = Date.now();
    },
    true,
  );

  function getRequestMethod(input, init) {
    try {
      if (init && init.method) return String(init.method).toUpperCase();
      if (input && typeof input === "object" && input.method) return String(input.method).toUpperCase();
    } catch {}
    return "GET";
  }

  function getBusyTarget() {
    // Prefer currently focused element
    const active = document.activeElement;
    const a = active && active.closest ? active.closest(ACTION_SELECTOR) : null;
    if (a) return a;

    // Fallback to the last clicked element (within a short window)
    if (lastActionEl && Date.now() - lastActionAt < 2500) return lastActionEl;
    return null;
  }

  function setAutoBusy(el, busy) {
    if (!el) return;
    const key = "autoBusyCount";
    const count = Number(el.dataset[key] || 0);

    if (busy) {
      const next = count + 1;
      el.dataset[key] = String(next);
      if (next === 1) {
        el.classList.add("is-auto-busy");

        // aria-busy is used for accessibility + can be used by CSS if needed
        const hadAriaBusy = el.getAttribute("aria-busy") === "true";
        el.dataset.autoBusyHadAria = hadAriaBusy ? "1" : "0";
        el.setAttribute("aria-busy", "true");

        // Disable only if it is a real <button> and it was not disabled already
        if (String(el.tagName).toUpperCase() === "BUTTON") {
          const wasDisabled = !!el.disabled;
          el.dataset.autoBusyWeDisabled = wasDisabled ? "0" : "1";
          if (!wasDisabled) el.disabled = true;
        }
      }
      return;
    }

    const next = Math.max(0, count - 1);
    el.dataset[key] = String(next);
    if (next === 0) {
      el.classList.remove("is-auto-busy");

      if (el.dataset.autoBusyHadAria === "0") {
        el.removeAttribute("aria-busy");
      }

      if (String(el.tagName).toUpperCase() === "BUTTON" && el.dataset.autoBusyWeDisabled === "1") {
        el.disabled = false;
      }

      delete el.dataset[key];
      delete el.dataset.autoBusyHadAria;
      delete el.dataset.autoBusyWeDisabled;
    }
  }

  // Wrap fetch
  if (!window.fetch) return;
  const origFetch = window.fetch.bind(window);
  const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

  window.fetch = function (input, init) {
    const method = getRequestMethod(input, init);

    let target = null;
    if (MUTATING.has(method)) {
      target = getBusyTarget();
      if (target && target.getAttribute && target.getAttribute("data-no-auto-busy") !== null) {
        target = null;
      }
      if (target) setAutoBusy(target, true);
    }

    const p = origFetch(input, init);
    if (!target) return p;

    // Ensure cleanup on both success and failure
    if (p && typeof p.finally === "function") {
      return p.finally(() => setAutoBusy(target, false));
    }

    return p.then(
      (r) => {
        setAutoBusy(target, false);
        return r;
      },
      (e) => {
        setAutoBusy(target, false);
        throw e;
      },
    );
  };
})();


// --------------------------------------------
// Notifications UI + Push subscription (PWA)
// --------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  try {
    initNotificationsWidget();
  } catch (e) {
    console.warn("[notifications] init failed", e);
  }
});

function initNotificationsWidget() {
  // Avoid duplicates
  if (document.getElementById("notifBellBtn")) return;

  const mount =
    document.querySelector(".main-header .gh-wave") ||
    document.querySelector(".main-header .header-row1 .right") ||
    document.querySelector(".main-header .header-row1") ||
    document.querySelector(".tasks-v2-actions") ||
    null;

  if (!mount) return;

  const wrap = document.createElement("div");
  wrap.className = "notif-wrap";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "notifBellBtn";
  btn.className = "notif-bell-btn";
  btn.setAttribute("aria-label", "Notifications");
  btn.innerHTML = `
    <i data-feather="bell"></i>
    <span class="notif-badge" id="notifBadge" hidden>0</span>
  `;

  const panel = document.createElement("div");
  panel.id = "notifPanel";
  panel.className = "notif-panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Notifications");
  panel.hidden = true;

  panel.innerHTML = `
    <div class="notif-panel__header">
      <div class="notif-panel__title">Notifications</div>
      <div class="notif-panel__actions">
        <a class="notif-action-link" href="/notifications" id="notifSeeAllLink">See All</a>
        <button type="button" class="notif-action-btn" id="notifMarkAllBtn">Mark all read</button>
      </div>
    </div>

    <div class="notif-panel__push" id="notifPushRow"></div>

    <div class="notif-panel__list" id="notifList">
      <div class="notif-empty">Loading…</div>
    </div>

    <div class="notif-panel__footer">
      <a class="notif-footer-link" href="/notifications">Open notifications</a>
    </div>
  `;

  wrap.appendChild(btn);
  wrap.appendChild(panel);

  // If we have the new green wave container, place the bell between search and avatar
  if (mount.classList && mount.classList.contains("gh-wave")) {
    const acc = mount.querySelector('.account-mini');
    if (acc) mount.insertBefore(wrap, acc);
    else mount.appendChild(wrap);
  }
  // For legacy header right area: insert before other actions
  else if (mount.classList && (mount.classList.contains("right") || mount.classList.contains("topbar-right"))) {
    mount.insertBefore(wrap, mount.firstChild);
  }
  else {
    mount.appendChild(wrap);
  }

  if (window.feather) {
    try { window.feather.replace(); } catch {}
  }

  // Handlers
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    panel.hidden = !panel.hidden;

    if (!panel.hidden) {
      await refreshNotifications(true);
      await refreshPushRow();
    }
  });

  document.addEventListener("click", (e) => {
    if (panel.hidden) return;
    const target = e.target;
    if (!target) return;
    if (wrap.contains(target)) return;
    panel.hidden = true;
  });

  document.getElementById("notifMarkAllBtn")?.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await markAllRead();
    await refreshNotifications(true);
  });

  // Initial badge load + polling
  refreshNotifications(false);
  setInterval(() => refreshNotifications(false), 60 * 1000);
}

async function refreshNotifications(renderList) {
  const badge = document.getElementById("notifBadge");
  const listEl = document.getElementById("notifList");

  try {
    const resp = await fetch("/api/notifications?limit=25", {
      credentials: "include",
      headers: { "Accept": "application/json" },
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || !data || data.success === false) throw new Error(data.error || "Failed");

    const unread = Number(data.unreadCount || 0);
    if (badge) {
      if (unread > 0) {
        badge.hidden = false;
        badge.textContent = unread > 99 ? "99+" : String(unread);
      } else {
        badge.hidden = true;
        badge.textContent = "0";
      }
    }

    if (renderList && listEl) {
      renderNotificationsList(listEl, Array.isArray(data.items) ? data.items : []);
    }
  } catch (e) {
    if (renderList && listEl) {
      listEl.innerHTML = `<div class="notif-empty">Couldn’t load notifications</div>`;
    }
  }
}

function renderNotificationsList(listEl, items) {
  if (!items.length) {
    listEl.innerHTML = `<div class="notif-empty">No notifications yet</div>`;
    return;
  }

  listEl.innerHTML = "";
  for (const n of items) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "notif-item" + (n && !n.read ? " is-unread" : "");
    item.dataset.id = n.id || "";

    const title = escapeHtml(n.title || "Update");
    const body = escapeHtml(n.body || "");
    const ts = typeof n.ts === "number" ? n.ts : Date.now();
    const time = formatTime(ts);

    item.innerHTML = `
      <div class="notif-item__top">
        <div class="notif-item__title">${title}</div>
        <div class="notif-item__time">${time}</div>
      </div>
      ${body ? `<div class="notif-item__body">${body}</div>` : ""}
    `;

    item.addEventListener("click", async () => {
      const id = item.dataset.id;
      const url = (n && n.url) ? String(n.url) : "/dashboard";

      if (id) {
        try {
          await fetch("/api/notifications/read", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
          });
        } catch {}
      }

      // Navigate
      window.location.href = url || "/dashboard";
    });

    listEl.appendChild(item);
  }
}

async function markAllRead() {
  try {
    await fetch("/api/notifications/read-all", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
  } catch {}
}

// -------------------
// Push subscription UI
// -------------------
async function refreshPushRow() {
  const row = document.getElementById("notifPushRow");
  if (!row) return;

  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    row.innerHTML = `<div class="notif-push-msg">Push notifications are not supported on this device.</div>`;
    return;
  }

  // iOS requirement: needs to be installeds: PWA installed to Home Screen (Safari)
  const perm = Notification.permission;

  let subscribed = false;
  let sub = null;
  try {
    const reg = await navigator.serviceWorker.ready;
    sub = await reg.pushManager.getSubscription();
    subscribed = !!sub;
  } catch {}

  // Fetch server public key status (to show better errors)
  let serverEnabled = false;
  let publicKey = "";
  try {
    const r = await fetch("/api/push/vapid-public-key", { credentials: "include" });
    const d = await r.json().catch(() => ({}));
    serverEnabled = !!d.enabled;
    publicKey = String(d.publicKey || "");
  } catch {}

  if (!serverEnabled) {
    row.innerHTML = `
      <div class="notif-push-msg">
        Push is not configured on the server (missing VAPID keys).
      </div>
    `;
    return;
  }

  if (perm === "denied") {
    row.innerHTML = `
      <div class="notif-push-msg">
        Notifications are blocked in the browser settings.
      </div>
    `;
    return;
  }

  if (subscribed) {
    row.innerHTML = `
      <div class="notif-push-row">
        <div class="notif-push-status">Push notifications: <b>ON</b></div>
        <button type="button" class="notif-push-btn danger" id="notifDisablePush">Disable</button>
      </div>
    `;

    document.getElementById("notifDisablePush")?.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await disablePush();
      await refreshPushRow();
    });
    return;
  }

  row.innerHTML = `
    <div class="notif-push-row">
      <div class="notif-push-status">Push notifications: <b>OFF</b></div>
      <button type="button" class="notif-push-btn" id="notifEnablePush">Enable</button>
    </div>
  `;

  document.getElementById("notifEnablePush")?.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();
    await enablePush(publicKey);
    await refreshPushRow();
  });
}

async function enablePush(publicKey) {
  if (!publicKey) {
    alert("Push is not configured (missing VAPID public key).");
    return;
  }

  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    alert("You need to allow notifications to enable push.");
    return;
  }

  const reg = await navigator.serviceWorker.ready;

  // Convert VAPID key
  const appServerKey = urlBase64ToUint8Array(publicKey);

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: appServerKey,
  });

  // Save on server
  await fetch("/api/push/subscribe", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: sub }),
  });
}

async function disablePush() {
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;

  const endpoint = sub.endpoint;

  try {
    await sub.unsubscribe();
  } catch {}

  try {
    await fetch("/api/push/unsubscribe", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint }),
    });
  } catch {}
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function formatTime(ts) {
  try {
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
    return d.toLocaleDateString([], { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
