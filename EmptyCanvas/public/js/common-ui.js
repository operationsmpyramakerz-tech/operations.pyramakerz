// public/js/common-ui.js
document.addEventListener('DOMContentLoaded', () => {
  // 🔒 مهم: نخفي روابط السايدبار من البداية لتجنب "فلاش" كل الصفحات
  // لازم الـ body يبقى عليه الكلاس ده قبل ما الصلاحيات تتطبق.
  // هنضيفه هنا كـ safety (وكمان هنضيفه في الـ HTML body كـ default).
  document.body.classList.add('permissions-loading');

  const logoutBtn     = document.getElementById('logoutBtn');
  const menuToggle    = document.getElementById('menu-toggle');     // قد لا يوجد
  const sidebarToggle = document.getElementById('sidebar-toggle');  // موجود

  const KEY_MINI       = 'ui.sidebarMini';   // 1 = mini على الديسكتوب
  const CACHE_ALLOWED  = 'allowedPages';     // sessionStorage key
  const isMobile = () => window.innerWidth <= 768;

  // ====== Access control (show/hide links) ======
  // مفاتيح lowercase للمقارنة الثابتة
  const PAGE_SELECTORS = {
    // ===== Orders =====
    'current orders': 'a[href="/orders"]',
    'create new order': 'a[href="/orders/new"]',
    'stocktaking': 'a[href="/stocktaking"]',

    'requested orders': 'a[href="/orders/requested"]',
    'schools requested orders': 'a[href="/orders/requested"]',

    'assigned schools requested orders': 'a[href="/orders/assigned"]',
    'storage': 'a[href="/orders/assigned"]',

    's.v schools orders': 'a[href="/orders/sv-orders"]',

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
  function ensureLink({ href, label, icon }) {
    const nav = document.querySelector('.sidebar .nav-list, .sidebar nav ul, .sidebar ul');
    if (!nav) return;
    if (nav.querySelector(`a[href="${href}"]`)) return;

    const li = document.createElement('li');
    const a  = document.createElement('a');
    a.className = 'nav-link';
    a.href = href;
    a.innerHTML = `<i data-feather="${icon}"></i><span class="nav-label">${label}</span>`;
    li.appendChild(a);
    nav.appendChild(li);
    if (window.feather) feather.replace();
  }

  async function ensureGreetingAndPages(){
    const cached = getCachedName();
    if (cached) renderGreeting(cached);

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
    [menuToggle, sidebarToggle].forEach(btn => btn && btn.setAttribute('aria-expanded', String(!!expanded)));
  }

  function applyInitial(){
    if (isMobile()){
      document.body.classList.remove('sidebar-mini');
      document.body.classList.remove('sidebar-collapsed');
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

  sidebarToggle && sidebarToggle.addEventListener('click', toggleSidebar);
  menuToggle    && menuToggle.addEventListener('click', toggleSidebar);

  // إغلاق السايدبار بالضغط خارجها (موبايل)
  document.addEventListener('click', (event) => {
    if (!isMobile()) return;
    const clickedInteractive = event.target.closest('button,[type="button"],[type="submit"],a,input,select,textarea,.choices,.form-actions');
    if (clickedInteractive) return;
    const insideSidebar = event.target.closest('.sidebar');
    const onToggles = event.target.closest('#menu-toggle, #sidebar-toggle');
    if (insideSidebar || onToggles) return;
    if (!document.body.classList.contains('sidebar-collapsed')) return;
    toggleSidebar(event);
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

  // لو عندك لينكات بتتعمل inject في صفحات معينة:
  ensureLink({ href: '/orders/sv-orders', label: 'S.V schools orders', icon: 'award' });
  ensureLink({ href: '/damaged-assets', label: 'Damaged Assets', icon: 'alert-octagon' });
  ensureLink({ href: '/expenses/users', label: 'Expenses by User', icon: 'users' });

  ensureGreetingAndPages();

  window.addEventListener('user:updated', () => {
    renderGreeting(getCachedName());
    const allowed = getCachedAllowedPages();
    if (allowed) applyAllowedPages(allowed);
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
