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

  const EMBEDDED_SHELL_CONTENT = isOpsShellEmbeddedMode();
  if (EMBEDDED_SHELL_CONTENT) {
    try { document.body.classList.add('shell-embedded'); } catch {}
  }

  const logoutBtn     = document.getElementById('logoutBtn');
  let menuToggle    = null;     // injected on mobile
  let sidebarToggle = document.getElementById('sidebar-toggle');  // removed (logo is the toggle now)

  const KEY_MINI       = 'ui.sidebarMini';   // 1 = mini على الديسكتوب (legacy)
  const KEY_COLLAPSED  = 'ui.sidebarCollapsed'; // 1 = dashboard مغلق (drawer)
  const CACHE_ALLOWED  = 'allowedPages';     // sessionStorage key
  const isMobile = () => window.innerWidth <= 768;


  // =====================================================
  // API data cache (sessionStorage) + background prefetch
  // - keeps navigation between pages fast in this multi-page app
  // - first load still comes from the server, then later pages reuse cached JSON
  // - any successful mutation clears the cache so the UI stays fresh
  // =====================================================
  const APP_API_CACHE_NS = 'ops.api.cache.v2';
  const APP_API_CACHE_PREFIX = `${APP_API_CACHE_NS}:entry:`;
  const APP_API_PRIME_PREFIX = `${APP_API_CACHE_NS}:prime:`;
  const APP_API_MAX_ENTRY_CHARS = 1_500_000;
  const _nativeFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;
  const _apiCacheInflight = new Map();

  function cachePart(value) {
    return encodeURIComponent(String(value ?? '').trim() || '-');
  }

  function getApiCacheStorageKey(name, urlObj) {
    return `${APP_API_CACHE_PREFIX}${name}:${cachePart(urlObj.pathname + urlObj.search)}`;
  }

  function clearAppApiCache() {
    try {
      const toDelete = [];
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const key = sessionStorage.key(i);
        if (!key) continue;
        if (key.startsWith(APP_API_CACHE_PREFIX) || key.startsWith(APP_API_PRIME_PREFIX)) {
          toDelete.push(key);
        }
      }
      toDelete.forEach((key) => {
        try { sessionStorage.removeItem(key); } catch {}
      });
    } catch {}
  }

  function readAppApiCache(storageKey) {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const expiresAt = Number(parsed?.expiresAt || 0);
      if (!expiresAt || Date.now() > expiresAt) {
        try { sessionStorage.removeItem(storageKey); } catch {}
        return null;
      }
      if (typeof parsed?.bodyText !== 'string' || !parsed.bodyText) return null;
      return parsed;
    } catch {
      try { sessionStorage.removeItem(storageKey); } catch {}
      return null;
    }
  }

  function writeAppApiCache(storageKey, bodyText, ttlMs, status = 200) {
    try {
      if (typeof bodyText !== 'string' || !bodyText) return;
      if (bodyText.length > APP_API_MAX_ENTRY_CHARS) return;
      const payload = {
        status: Number(status || 200),
        bodyText,
        expiresAt: Date.now() + Math.max(1000, Number(ttlMs) || 1000),
      };
      sessionStorage.setItem(storageKey, JSON.stringify(payload));
    } catch (e) {
      const name = String(e?.name || '');
      if (/quota/i.test(name)) {
        clearAppApiCache();
      }
    }
  }

  function buildCachedJsonResponse(entry) {
    return new Response(entry.bodyText, {
      status: Number(entry?.status || 200),
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Ops-Client-Cache': 'HIT',
      },
    });
  }

  function pageForcesFreshApiRequests() {
    try {
      const params = new URLSearchParams(window.location.search || '');
      return params.get('_fresh') === '1' || params.has('_refresh');
    } catch {
      return false;
    }
  }

  function clearTransientRefreshParams() {
    try {
      const url = new URL(window.location.href);
      const hadFresh = url.searchParams.get('_fresh') === '1' || url.searchParams.has('_refresh');
      if (!hadFresh) return;
      url.searchParams.delete('_fresh');
      url.searchParams.delete('_refresh');
      const next = `${url.pathname}${url.search}${url.hash}`;
      window.history.replaceState({}, document.title, next || url.pathname || '/');
    } catch {}
  }

  const APP_API_CACHE_RULES = [
    { name: 'account', test: (url) => url.pathname === '/api/account', ttlMs: 5 * 60 * 1000 },
    { name: 'notifications', test: (url) => url.pathname === '/api/notifications', ttlMs: 20 * 1000 },
    { name: 'b2b-schools', test: (url) => url.pathname === '/api/b2b/schools', ttlMs: 10 * 60 * 1000 },
    { name: 'b2b-school', test: (url) => /^\/api\/b2b\/schools\/[^/]+$/.test(url.pathname), ttlMs: 5 * 60 * 1000 },
    { name: 'b2b-school-stock', test: (url) => /^\/api\/b2b\/schools\/[^/]+\/stock$/.test(url.pathname), ttlMs: 2 * 60 * 1000 },
    { name: 'order-types', test: (url) => url.pathname === '/api/order-types', ttlMs: 20 * 60 * 1000 },
    { name: 'components', test: (url) => url.pathname === '/api/components', ttlMs: 20 * 60 * 1000 },
    { name: 'orders-current', test: (url) => url.pathname === '/api/orders', ttlMs: 2 * 60 * 1000 },
    { name: 'orders-requested', test: (url) => url.pathname === '/api/orders/requested', ttlMs: 2 * 60 * 1000 },
    { name: 'orders-assigned', test: (url) => url.pathname === '/api/orders/assigned', ttlMs: 2 * 60 * 1000 },
    { name: 'tasks-users', test: (url) => url.pathname === '/api/tasks/users', ttlMs: 10 * 60 * 1000 },
    { name: 'tasks-list', test: (url) => url.pathname === '/api/tasks', ttlMs: 90 * 1000 },
    { name: 'task-detail', test: (url) => /^\/api\/tasks\/[^/]+$/.test(url.pathname), ttlMs: 90 * 1000 },
    { name: 'stock', test: (url) => url.pathname === '/api/stock', ttlMs: 2 * 60 * 1000 },
    { name: 'expenses-main', test: (url) => url.pathname === '/api/expenses', ttlMs: 2 * 60 * 1000 },
    { name: 'expenses-types', test: (url) => url.pathname === '/api/expenses/types', ttlMs: 20 * 60 * 1000 },
    { name: 'expenses-cash-in-from', test: (url) => url.pathname === '/api/expenses/cash-in-from/options', ttlMs: 20 * 60 * 1000 },
    { name: 'expenses-users', test: (url) => url.pathname === '/api/expenses/users', ttlMs: 2 * 60 * 1000 },
    { name: 'expenses-user', test: (url) => /^\/api\/expenses\/user\/[^/]+$/.test(url.pathname), ttlMs: 2 * 60 * 1000 },
  ];

  function getApiCacheRule(urlObj, method) {
    const verb = String(method || 'GET').toUpperCase();
    if (verb !== 'GET') return null;
    if (urlObj.origin !== window.location.origin) return null;
    return APP_API_CACHE_RULES.find((rule) => {
      try { return !!rule.test(urlObj); } catch { return false; }
    }) || null;
  }

  function normalizeAllowedToken(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9/]+/g, '');
  }

  function hasAllowedPage(allowedPages, aliases) {
    const set = new Set((allowedPages || []).map((item) => normalizeAllowedToken(item)));
    return (aliases || []).some((alias) => set.has(normalizeAllowedToken(alias)));
  }

  function buildPrefetchUrls(allowedPages) {
    const urls = ['/api/account', '/api/notifications?limit=60'];

    if (hasAllowedPage(allowedPages, ['B2B', '/b2b'])) {
      urls.push('/api/b2b/schools');
    }
    if (hasAllowedPage(allowedPages, ['Create New Order', '/orders/new'])) {
      urls.push('/api/order-types', '/api/components');
    }
    if (hasAllowedPage(allowedPages, ['Current Orders', '/orders'])) {
      urls.push('/api/orders');
    }
    if (hasAllowedPage(allowedPages, ['Requested Orders', 'Schools Requested Orders', '/orders/requested'])) {
      urls.push('/api/orders/requested');
    }
    if (hasAllowedPage(allowedPages, ['Maintenance Orders', '/orders/maintenance-orders'])) {
      urls.push('/api/orders/requested');
    }
    if (hasAllowedPage(allowedPages, ['Assigned Schools Requested Orders', 'Assigned Orders', 'Storage', '/orders/assigned'])) {
      urls.push('/api/orders/assigned');
    }
    if (hasAllowedPage(allowedPages, ['Tasks', '/tasks'])) {
      urls.push('/api/tasks?scope=mine', '/api/tasks/users');
    }
    if (hasAllowedPage(allowedPages, ['Stocktaking', '/stocktaking'])) {
      urls.push('/api/stock');
    }
    if (hasAllowedPage(allowedPages, ['Expenses', '/expenses'])) {
      urls.push('/api/expenses', '/api/expenses/types', '/api/expenses/cash-in-from/options');
    }
    if (hasAllowedPage(allowedPages, ['Expenses Users', '/expenses/users'])) {
      urls.push('/api/expenses/users');
    }

    return Array.from(new Set(urls));
  }

  async function prefetchApiUrls(urls, concurrency = 2) {
    const queue = Array.from(urls || []).filter(Boolean);
    if (!queue.length) return;

    let index = 0;
    const workers = new Array(Math.min(Math.max(1, concurrency), queue.length)).fill(0).map(async () => {
      while (index < queue.length) {
        const current = queue[index++];
        try {
          await window.fetch(current, {
            credentials: 'same-origin',
            headers: { 'Accept': 'application/json', 'X-Ops-Prefetch': '1' },
          });
        } catch {}
      }
    });

    await Promise.all(workers);
  }

  function schedulePrefetchForAllowedPages(allowedPages) {
    try {
      const userKey = cachePart(localStorage.getItem('username') || 'user');
      const permsKey = cachePart((allowedPages || []).join('|') || 'none');
      const marker = `${APP_API_PRIME_PREFIX}${userKey}:${permsKey}`;
      if (sessionStorage.getItem(marker) === '1') return;
      sessionStorage.setItem(marker, '1');

      const urls = buildPrefetchUrls(allowedPages);
      if (!urls.length) return;

      const run = () => {
        prefetchApiUrls(urls, 2).catch(() => {
          try { sessionStorage.removeItem(marker); } catch {}
        });
      };

      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(run, { timeout: 1500 });
      } else {
        window.setTimeout(run, 350);
      }
    } catch {}
  }

  function patchApiFetchCaching() {
    if (!_nativeFetch || window.__opsApiCachePatched) return;
    window.__opsApiCachePatched = true;

    window.fetch = async function patchedFetch(input, init) {
      const req = input instanceof Request ? input : null;
      const urlObj = new URL(typeof input === 'string' ? input : (req ? req.url : String(input || '')), window.location.origin);
      const method = String(init?.method || req?.method || 'GET').toUpperCase();
      const isApi = urlObj.origin === window.location.origin && urlObj.pathname.startsWith('/api/');

      if (isApi && method !== 'GET' && method !== 'HEAD') {
        const response = await _nativeFetch(input, init);
        if (response && response.ok) {
          clearAppApiCache();
        }
        return response;
      }

      const rule = getApiCacheRule(urlObj, method);
      const bypass = String(urlObj.searchParams.get('_fresh') || '') === '1' || pageForcesFreshApiRequests();
      if (!rule || bypass) {
        return _nativeFetch(input, init);
      }

      const storageKey = getApiCacheStorageKey(rule.name, urlObj);
      const cached = readAppApiCache(storageKey);
      if (cached) {
        return buildCachedJsonResponse(cached);
      }

      if (_apiCacheInflight.has(storageKey)) {
        try { await _apiCacheInflight.get(storageKey); } catch {}
        const warm = readAppApiCache(storageKey);
        if (warm) return buildCachedJsonResponse(warm);
      }

      const pending = (async () => {
        const response = await _nativeFetch(input, init);
        if (response && response.ok) {
          const ctype = String(response.headers.get('content-type') || '').toLowerCase();
          if (ctype.includes('json')) {
            try {
              const bodyText = await response.clone().text();
              if (bodyText) {
                JSON.parse(bodyText);
                writeAppApiCache(storageKey, bodyText, rule.ttlMs, response.status);
              }
            } catch {}
          }
        }
        return response;
      })();

      _apiCacheInflight.set(storageKey, pending.then(() => undefined).catch(() => undefined));
      try {
        return await pending;
      } finally {
        _apiCacheInflight.delete(storageKey);
      }
    };

    window.OpsAppCache = {
      clear: clearAppApiCache,
      prefetch: prefetchApiUrls,
      schedule: schedulePrefetchForAllowedPages,
    };
  }

  patchApiFetchCaching();

  if (pageForcesFreshApiRequests()) {
    window.setTimeout(clearTransientRefreshParams, 0);
  }

  // =====================================================
  // UI Redesign helpers
  // - Sidebar tooltips when labels are hidden
  // - Ensure every page has a main header
  // - Convert the existing header to the "Dashboard" topbar style
  //   (title + search + bell + user)
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

  function ensureDashboardHeaderLayout(){
    const header = document.querySelector('.main-header');
    if (!header) return;

    header.classList.add('dash-header');

    const row1 = header.querySelector('.header-row1');
    if (!row1) return;

    const left = row1.querySelector('.left') || row1;
    const right = row1.querySelector('.right') || row1;

    // Remove old injected green header nodes if they exist (from older builds)
    try { left.querySelectorAll('.gh-lead-btn').forEach(n => n.remove()); } catch {}
    try { header.querySelectorAll('.gh-wave').forEach(n => n.remove()); } catch {}

    // Page title text: prefer existing page-title
    const pageTitleEl = header.querySelector('.header-row2 .page-title') || header.querySelector('.page-title');
    const pageTitleText = (pageTitleEl && pageTitleEl.textContent) ? String(pageTitleEl.textContent).trim() : (document.title || 'Dashboard').trim();

    // Ensure left title exists
    // ✅ Requirement: "ال logo icon ... تكون شمال العنوان مش يمين"
    // We want the header logo button (#menu-toggle) to appear BEFORE the title.
    let dashTitle = left.querySelector('.dash-title');
    const menuBtn = left.querySelector('#menu-toggle');

    if (!dashTitle) {
      dashTitle = document.createElement('div');
      dashTitle.className = 'dash-title';

      // If the logo toggle exists, insert the title after it.
      if (menuBtn && menuBtn.parentElement === left) {
        left.insertBefore(dashTitle, menuBtn.nextSibling);
      } else {
        left.insertBefore(dashTitle, left.firstChild);
      }
    }

    // Enforce final order: [menu-toggle] [title] [search]
    if (menuBtn && menuBtn.parentElement === left && dashTitle && dashTitle.parentElement === left) {
      if (menuBtn.nextSibling !== dashTitle) {
        left.insertBefore(menuBtn, dashTitle);
      }
    }

    dashTitle.textContent = pageTitleText || 'Dashboard';

    // Hide the old greeting pill (kept in DOM for old pages, but not part of the new header)
    const greeting = left.querySelector('.greeting-pill');
    if (greeting) greeting.style.display = 'none';

    // Ensure searchbar exists; move it into the left group
    const existingSearch = header.querySelector('.searchbar');
    if (existingSearch && existingSearch.parentElement !== left) {
      left.appendChild(existingSearch);
    }

    if (!left.querySelector('.searchbar')) {
      const sb = document.createElement('div');
      sb.className = 'searchbar';
      sb.setAttribute('role', 'search');
      sb.innerHTML = `
        <i data-feather="search"></i>
        <input type="search" placeholder="Search" aria-label="Search" />
      `;
      left.appendChild(sb);
    }

    // Move notif + user to the right group if they exist already
    const notifWrap = header.querySelector('.notif-wrap');
    if (notifWrap && notifWrap.parentElement !== right) {
      right.insertBefore(notifWrap, right.firstChild);
    }

    const user = header.querySelector('.header-user') || header.querySelector('a.account-mini');
    if (user && user.parentElement !== right) {
      right.appendChild(user);
    }

    // Hide row2 completely (page title is now in the top row)
    header.classList.add('dash-hide-row2');

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

    // ✅ New requirement:
    // "عاوز اشيل الصورة اللي في ال sidebar خالص"
    // We intentionally do NOT inject the sidebar profile/avatar anymore.
    // If an older build injected it before, remove it.
    try {
      const existing = sidebar.querySelector('.sidebar-profile');
      if (existing) existing.remove();
    } catch {}
    return null;
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

  function shortDisplayName(name){
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'User';
    if (parts.length === 1) return parts[0];
    const last = parts[parts.length - 1] || '';
    const lastInitial = last ? String(last[0]).toUpperCase() : '';
    return `${parts[0]} ${lastInitial}`.trim();
  }

  function renderHeaderUser({ name = '', photoUrl = '' } = {}){
    const header = document.querySelector('.main-header');
    if (!header) return;

    const right = header.querySelector('.header-row1 .right') || header.querySelector('.header-row1') || header;
    if (!right) return;

    const safeName = String(name || '').trim() || getCachedName() || 'User';

    // Prefer an existing link (account-mini) so we don't duplicate
    let link = header.querySelector('a.header-user') || header.querySelector('a.account-mini');

    if (!link) {
      link = document.createElement('a');
      link.href = '/account';
      link.setAttribute('aria-label', 'Account');
      right.appendChild(link);
    }

    link.classList.remove('account-mini');
    link.classList.add('header-user');
    link.removeAttribute('href');
    link.setAttribute('role', 'button');
    link.setAttribute('tabindex', '0');
    link.dataset.userMenuTrigger = '1';
    link.title = safeName;

    const initials = initialsFromName(safeName) || '';
    const avatarHtml = photoUrl
      ? `<img class="header-user__img" src="${escapeAttr(photoUrl)}" alt="${escapeAttr(safeName)}" />`
      : `<div class="header-user__fallback" aria-hidden="true">${escapeHtml(initials)}</div>`;

    // Requested: top-right profile trigger should be icon only (no name next to it)
    link.innerHTML = `
      <span class="header-user__avatar">${avatarHtml}</span>
    `;
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

  // Remove Settings/Logout from the left sidebar footer (we use the top user menu instead)
  function stripSidebarFooterActions(){
    const footer = document.querySelector('.sidebar .sidebar-footer');
    if (!footer) return;
    try {
      footer.querySelectorAll('#sidebarSettings, #logoutBtn').forEach(el => el.remove());
    } catch {}
    try {
      footer.querySelectorAll('a.settings-btn, button.settings-btn, a.logout-btn, button.logout-btn').forEach(el => el.remove());
    } catch {}
    // If footer is now empty, hide it to avoid blank space
    try {
      if (!footer.querySelector('a,button')) footer.style.display = 'none';
    } catch {}
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
  // Removed: Settings/Logout in sidebar footer (use top-right user menu)
  stripSidebarFooterActions();
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
    'maintenance orders': 'a[href="/orders/maintenance-orders"]',

    'assigned schools requested orders': 'a[href="/orders/assigned"]',
    'storage': 'a[href="/orders/assigned"]',

    // Orders Review (formerly: "S.V schools orders")
    'orders review': 'a[href="/orders/sv-orders"]',
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

  // IMPORTANT:
  // Our sidebar layout CSS uses `display: flex !important` on `<li>` items.
  // Normal inline `style.display = 'none'` will NOT override it.
  // So we must set display with the `important` priority.
  function hideEl(el){
    if (!el) return;
    try { el.style.setProperty('display', 'none', 'important'); } catch { el.style.display = 'none'; }
    el.setAttribute('aria-hidden','true');
  }
  function showEl(el){
    if (!el) return;
    try { el.style.removeProperty('display'); } catch { el.style.display = ''; }
    el.removeAttribute('aria-hidden');
  }

  // أظهر المسموح وأخفِ غير المسموح (حتمي)
  function applyAllowedPages(allowed){
    if (!Array.isArray(allowed)) return;

    // Default-deny for the sidebar: hide every first-level nav item.
    // (Some CSS rules use `display: flex !important`, so we use hideEl() which
    // sets `display: none !important`.)
    try {
      const nav = document.querySelector('.sidebar-nav .nav-list')
        || document.querySelector('.sidebar .nav-list, .sidebar nav ul, .sidebar ul');
      if (nav && nav.children) {
        Array.from(nav.children).forEach((child) => {
          if (child && String(child.tagName).toUpperCase() === 'LI') hideEl(child);
        });
      }
    } catch {}

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

    // Home is available for every authenticated user (not tied to Allowed Pages)
    try {
      const home = document.querySelector('a[href="/home"]');
      if (home) showEl(home.closest('li') || home);
    } catch {}
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

      hydratePendingFeatherIcons();
    }


  function syncMobileDockStructure(){
    const sidebar = document.querySelector('.sidebar');
    const nav = sidebar?.querySelector('.sidebar-nav');
    if (!sidebar || !nav) return;

    const isStructured = nav.classList.contains('mobile-dock-structured');
    const list = nav.querySelector(':scope > .mobile-dock-pages-clip > .nav-list')
      || nav.querySelector(':scope > .nav-list');

    if (!list) {
      sidebar.classList.remove('mobile-dock-structured-host');
      nav.classList.remove('mobile-dock-structured');
      return;
    }

    if (isMobile()) {
      if (isStructured) {
        sidebar.classList.add('mobile-dock-structured-host');
        return;
      }

      const homeLi = list.querySelector(':scope > li:first-child');
      if (!homeLi) return;

      const homeRail = document.createElement('div');
      homeRail.className = 'mobile-dock-home-rail';

      const pagesClip = document.createElement('div');
      pagesClip.className = 'mobile-dock-pages-clip';

      nav.insertBefore(homeRail, list);
      nav.insertBefore(pagesClip, list);
      homeRail.appendChild(homeLi);
      pagesClip.appendChild(list);

      list.classList.add('mobile-dock-pages-list');
      nav.classList.add('mobile-dock-structured');
      sidebar.classList.add('mobile-dock-structured-host');
      return;
    }

    if (!isStructured) {
      sidebar.classList.remove('mobile-dock-structured-host');
      return;
    }

    const homeRail = nav.querySelector(':scope > .mobile-dock-home-rail');
    const pagesClip = nav.querySelector(':scope > .mobile-dock-pages-clip');
    const pagesList = pagesClip?.querySelector(':scope > .nav-list') || list;
    const homeLi = homeRail?.querySelector(':scope > li');

    if (pagesClip && pagesList && pagesClip.parentNode === nav) {
      nav.insertBefore(pagesList, homeRail || pagesClip);
    }
    if (homeLi && pagesList) {
      pagesList.insertBefore(homeLi, pagesList.firstChild);
    }

    try { homeRail?.remove(); } catch {}
    try { pagesClip?.remove(); } catch {}

    pagesList.classList.remove('mobile-dock-pages-list');
    nav.classList.remove('mobile-dock-structured');
    sidebar.classList.remove('mobile-dock-structured-host');
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
      // also prefill header user (then refresh from API)
      renderHeaderUser({ name: cached });

      // Expose basic user info for other widgets (e.g., the profile dropdown header)
      try {
        window.__opsUserInfo = Object.assign({}, window.__opsUserInfo || {}, {
          name: cached,
        });
      } catch {}
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

      // Header user (avatar + short name)
      renderHeaderUser({
        name: name || cached || '',
        photoUrl: data.photoUrl || ''
      });

      // Keep a global snapshot of the user (used by the profile dropdown header)
      try {
        window.__opsUserInfo = {
          name: name || cached || 'User',
          position: data.position || '',
          department: data.department || '',
          photoUrl: data.photoUrl || ''
        };

        // Notify other widgets that user info changed
        try {
          window.dispatchEvent(new CustomEvent('ops:userinfo', { detail: window.__opsUserInfo }));
        } catch {}
      } catch {}

      if (Array.isArray(data.allowedPages)) {
        cacheAllowedPages(data.allowedPages);

        // 🔒 اخفي الكل ثم أظهر المسموح
        applyAllowedPages([]);
        applyAllowedPages(data.allowedPages);

        // Prime the app data in the background once per session/tab so page transitions
        // feel instant after the first load.
        schedulePrefetchForAllowedPages(data.allowedPages);

        // ✅ بعد ما طبقنا الصلاحيات، نكشف اللي مسموح بس (بدون فلاش)
        document.body.classList.remove('permissions-loading');
        document.body.classList.add('permissions-ready');
      }
    } catch {}
  }

  // ====== Sidebar toggle ======
  function setAria(){
    const expanded = !document.body.classList.contains('sidebar-collapsed');
    const sidebarLogoToggle = document.getElementById('sidebar-logo-toggle');
    const profileToggle = document.querySelector('.sidebar-profile__toggle');
    [menuToggle, sidebarLogoToggle, profileToggle]
      .forEach(btn => btn && btn.setAttribute('aria-expanded', String(!!expanded)));
  }

  function applyInitial(){
    // We no longer rely on "sidebar-mini" for the dashboard toggle.
    // The user wants open/close (drawer) behavior.
    document.body.classList.remove('sidebar-mini');

    if (isMobile()) {
      // Mobile: closed by default (overlay drawer)
      document.body.classList.add('sidebar-collapsed');
    } else {
      // Desktop: read persisted preference (optional)
      let pref = '0';
      try { pref = String(localStorage.getItem(KEY_COLLAPSED) || '0'); } catch {}
      if (pref === '1') document.body.classList.add('sidebar-collapsed');
      else document.body.classList.remove('sidebar-collapsed');
    }
    setAria();
  }

  function hydratePendingFeatherIcons(root = document){
    try {
      if (!window.feather || !root || typeof root.querySelector !== 'function') return;
      if (!root.querySelector('[data-feather]')) return;
      feather.replace();
    } catch {}
  }

  function scrollPageToTop(){
    // User request: when the dashboard opens, jump to the start of the page content.
    const prefersInstant = document.body && document.body.dataset && document.body.dataset.sidebarOpenScroll === 'instant';
    const scrollBehavior = prefersInstant ? 'auto' : 'smooth';

    try {
      // Prefer window scroll (the page itself scrolls)
      if (typeof window.scrollTo === 'function') {
        window.scrollTo({ top: 0, left: 0, behavior: scrollBehavior });
      } else {
        window.scrollTo(0, 0);
      }
    } catch {
      try { window.scrollTo(0, 0); } catch {}
    }

    // Also reset inner scroll containers if any page uses them.
    try {
      const main = document.querySelector('.main-content');
      if (main && typeof main.scrollTo === 'function') {
        main.scrollTo({ top: 0, left: 0, behavior: scrollBehavior });
      }
    } catch {}
  }

  function toggleSidebar(e){
    if (e){ e.preventDefault(); e.stopPropagation(); }
    const wasCollapsed = document.body.classList.contains('sidebar-collapsed');
    document.body.classList.toggle('sidebar-collapsed');
    const isCollapsed = document.body.classList.contains('sidebar-collapsed');

    // Persist on desktop only (mobile always starts collapsed)
    if (!isMobile()) {
      try { localStorage.setItem(KEY_COLLAPSED, isCollapsed ? '1' : '0'); } catch {}
    }

    // Cleanup legacy state
    document.body.classList.remove('sidebar-mini');
    try { localStorage.removeItem(KEY_MINI); } catch {}

    setAria();
    hydratePendingFeatherIcons();

    // When opening: move user to top
    if (wasCollapsed && !isCollapsed) {
      scrollPageToTop();
    }
  }

  // Some pages (e.g. tasks.html) ship without a static header.
  // The header is injected later by ensureMainHeaderExists(), so ensureMenuToggle()
  // may return null during the first pass.
  // We bind the click handler defensively (once) whenever the button exists.
  function wireMenuToggleOnce(){
    const btn = document.getElementById('menu-toggle');
    if (!btn) return;
    if (btn.dataset && btn.dataset.boundSidebarToggle === '1') {
      menuToggle = btn;
      return;
    }
    try {
      if (btn.dataset) btn.dataset.boundSidebarToggle = '1';
    } catch {}
    btn.addEventListener('click', toggleSidebar);
    menuToggle = btn;
    setAria();
  }

  // Initial attempt (works on pages that already have a header in HTML)
  wireMenuToggleOnce();

  // ✅ Requested: close the dashboard when clicking outside it
  // - Mobile: closes the overlay sidebar
  // - Desktop: closes the drawer
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

    // Desktop: close only if currently open
    if (document.body.classList.contains('sidebar-collapsed')) return;
    document.body.classList.add('sidebar-collapsed');
    try { localStorage.setItem(KEY_COLLAPSED, '1'); } catch {}
    // Cleanup legacy key
    try { localStorage.removeItem(KEY_MINI); } catch {}
    setAria();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.body.classList.contains('sidebar-collapsed')) {
      document.body.classList.add('sidebar-collapsed');
      if (!isMobile()) {
        try { localStorage.setItem(KEY_COLLAPSED, '1'); } catch {}
        try { localStorage.removeItem(KEY_MINI); } catch {}
      }
      setAria();
    }
  });

  if (EMBEDDED_SHELL_CONTENT) {
    try { document.body.classList.remove('permissions-loading'); } catch {}
    try { if (window.feather) feather.replace(); } catch {}
    return;
  }

  // ====== Logout ======
  logoutBtn && logoutBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try { await fetch('/api/logout', { method: 'POST', credentials: 'include' }); } catch(e) {}
    try { sessionStorage.clear(); } catch {}
    try {
      localStorage.removeItem(KEY_MINI);
      localStorage.removeItem(KEY_COLLAPSED);
      localStorage.removeItem('username');
    } catch {}
    window.location.href = '/login';
  });

  // Init
  applyInitial();

  // UI Redesign: ensure header exists + convert it to the Dashboard topbar style
  ensureMainHeaderExists();
  // Some pages (like tasks.html) inject the header at runtime.
  // Ensure the logo toggle exists AFTER the header is created.
  // (ensureMenuToggle() is safe to call multiple times.)
  menuToggle = ensureMenuToggle() || menuToggle;
  wireMenuToggleOnce();
  ensureDashboardHeaderLayout();
  initMobileHeaderAutoHide();

  // لو عندك لينكات بتتعمل inject في صفحات معينة:
    // Home should appear for everyone (not tied to permissions)
  ensureLink({ href: '/home', label: 'Home', icon: 'home', prepend: true });
ensureLink({ href: '/orders/sv-orders', label: 'Orders Review', icon: 'award' });
  ensureLink({ href: '/orders/maintenance-orders', label: 'Maintenance Orders', icon: 'tool' });
  ensureLink({ href: '/expenses/users', label: 'Expenses by User', icon: 'credit-card' });
  ensureLink({ href: '/b2b', label: 'B2B', icon: 'folder' });
  ensureLink({ href: '/tasks', label: 'Tasks', icon: 'check-square' });

  syncMobileDockStructure();

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
    resizeTimer = setTimeout(() => {
      applyInitial();
      syncMobileDockStructure();
    }, 150);
  });

  if (window.feather) feather.replace();

  window.setTimeout(() => {
    try { initOpsPersistentShellHost(); } catch (e) { console.warn('[ops-shell] init failed', e); }
  }, 0);
});


function initMobileHeaderAutoHide() {
  const mainContent = document.querySelector('.main-content');
  const header = mainContent?.querySelector('.main-header');
  const scroller = mainContent?.querySelector(':scope > main') || mainContent?.querySelector('main');
  if (!mainContent || !header || !scroller) return;

  const media = window.matchMedia('(max-width: 768px)');
  let lastTop = 0;
  let hidden = false;
  let ticking = false;

  function syncHeaderHeight() {
    const wasHidden = mainContent.classList.contains('mobile-header-hidden');
    if (wasHidden) mainContent.classList.remove('mobile-header-hidden');

    const applyHeight = () => {
      const height = Math.ceil(header.scrollHeight || header.offsetHeight || 0);
      if (height > 0) {
        mainContent.style.setProperty('--mobile-header-height', `${height}px`);
      }
      if (wasHidden && hidden && media.matches) {
        mainContent.classList.add('mobile-header-hidden');
      }
    };

    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(applyHeight);
    } else {
      window.setTimeout(applyHeight, 0);
    }
  }

  function showHeader(force = false) {
    hidden = false;
    mainContent.classList.remove('mobile-header-hidden');
    if (force) lastTop = Number(scroller.scrollTop || 0);
  }

  function hideHeader() {
    if (hidden) return;
    hidden = true;
    mainContent.classList.add('mobile-header-hidden');
  }

  function handleScroll() {
    if (!media.matches) {
      showHeader(true);
      return;
    }

    const currentTop = Math.max(0, Number(scroller.scrollTop || 0));
    const delta = currentTop - lastTop;

    if (currentTop <= 8) {
      showHeader(true);
      return;
    }

    if (Math.abs(delta) < 6) return;

    if (delta > 0 && currentTop > 72) {
      hideHeader();
    } else if (delta < 0) {
      showHeader();
    }

    lastTop = currentTop;
  }

  function onScroll() {
    if (ticking) return;
    ticking = true;
    const flush = () => {
      ticking = false;
      handleScroll();
    };
    if (typeof window.requestAnimationFrame === 'function') {
      window.requestAnimationFrame(flush);
    } else {
      window.setTimeout(flush, 16);
    }
  }

  function onViewportChange() {
    syncHeaderHeight();
    if (!media.matches) {
      showHeader(true);
      return;
    }
    if ((scroller.scrollTop || 0) <= 8) {
      showHeader(true);
    }
  }

  scroller.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('orientationchange', onViewportChange);

  if (typeof media.addEventListener === 'function') {
    media.addEventListener('change', onViewportChange);
  } else if (typeof media.addListener === 'function') {
    media.addListener(onViewportChange);
  }

  syncHeaderHeight();
  showHeader(true);
}


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
  if (isOpsShellEmbeddedMode()) return;

  try {
    initNotificationsWidget();
  } catch (e) {
    console.warn("[notifications] init failed", e);
  }

  try {
    initFloatingSearchWidget();
  } catch (e) {
    console.warn("[search] init failed", e);
  }

  try {
    initUserMenuWidget();
  } catch (e) {
    console.warn("[user-menu] init failed", e);
  }
});

function initNotificationsWidget() {
  // Avoid duplicates
  if (document.getElementById("notifBellBtn")) return;

  const mount =
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
  // NOTE: we mount the panel as a portal (on <body>) so it doesn't
  // affect the header layout and doesn't get clipped by containers.
  panel.className = "notif-panel notif-panel--portal";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Notifications");
  panel.hidden = true;

  // Force overlay positioning (even if legacy CSS changes)
  panel.style.position = 'fixed';
  panel.style.zIndex = '999999';

  panel.innerHTML = `
    <div class="notif-center-shell">
      <div class="notif-center-card">
        <div class="notif-center-head">
          <div class="notif-center-title">AI Notification Center</div>
          <button type="button" class="notif-center-seeall" id="notifSeeAllBtn">See All</button>
        </div>

        <div class="notif-center-tabs" role="tablist" aria-label="Notification filters">
          <button type="button" class="notif-tab is-active" role="tab" aria-selected="true" data-scope="today">Today</button>
          <button type="button" class="notif-tab" role="tab" aria-selected="false" data-scope="week">This Week</button>
          <button type="button" class="notif-tab" role="tab" aria-selected="false" data-scope="earlier">Earlier</button>
        </div>

        <div class="notif-panel__list" id="notifList">
          <div class="notif-empty">Loading…</div>
        </div>
      </div>
    </div>
  `;

  wrap.appendChild(btn);

  // Insert before user avatar if available
  const user = mount.querySelector('.header-user') || mount.querySelector('a.account-mini');
  if (user) mount.insertBefore(wrap, user);
  else mount.appendChild(wrap);

  // Portal mount (dropdown should NOT live inside the header)
  document.body.appendChild(panel);

  // Positioning helpers
  function positionNotifPanel() {
    if (panel.hidden) return;
    try {
      const rect = btn.getBoundingClientRect();
      const gap = 12;

      // Prefer anchoring to the bell button (right aligned)
      const top = rect.bottom + gap;
      const right = Math.max(14, Math.round(window.innerWidth - rect.right));

      panel.style.top = `${Math.round(top)}px`;
      panel.style.right = `${right}px`;
      panel.style.left = 'auto';

      // Keep inside viewport
      const pRect = panel.getBoundingClientRect();
      if (pRect.left < 14) {
        panel.style.left = '14px';
        panel.style.right = 'auto';
      }

      // Prevent the panel from going beyond the bottom of the viewport
      const maxH = Math.max(240, Math.round(window.innerHeight - top - 16));
      panel.style.maxHeight = `${maxH}px`;
    } catch {}
  }

  let _notifPosRaf = 0;
  function requestNotifPanelPosition() {
    if (panel.hidden) return;
    if (_notifPosRaf) cancelAnimationFrame(_notifPosRaf);
    _notifPosRaf = requestAnimationFrame(positionNotifPanel);
  }

  // Keep it aligned on resize/scroll
  window.addEventListener('resize', requestNotifPanelPosition);
  window.addEventListener('scroll', requestNotifPanelPosition, true);

  if (window.feather) {
    try { window.feather.replace(); } catch {}
  }

  // Handlers
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    e.stopPropagation();

    // If the user menu is open, close it first (matches the reference behavior).
    try { window.__opsCloseUserMenu && window.__opsCloseUserMenu(); } catch {}

    const willOpen = panel.hidden;
    panel.hidden = !willOpen;

    if (willOpen) {
      // Make sure we are positioned before rendering
      requestNotifPanelPosition();

      // Reset view each time we open
      const st = getNotifState();
      st.showAll = false;
      st.activeTab = st.activeTab || 'today';
      syncNotifTabs();
      syncNotifSeeAll();
      await refreshNotifications(true);

      // Re-position after content renders (height may change)
      requestNotifPanelPosition();
    }
  });

  document.addEventListener("click", (e) => {
    if (panel.hidden) return;
    const target = e.target;
    if (!target) return;
    if (btn.contains(target) || panel.contains(target)) return;
    panel.hidden = true;
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) {
      panel.hidden = true;
    }
  });

  document.getElementById("notifSeeAllBtn")?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const st = getNotifState();
    st.showAll = !st.showAll;
    syncNotifSeeAll();
    const listEl = document.getElementById('notifList');
    if (listEl) renderNotificationsList(listEl, Array.isArray(st.items) ? st.items : []);
  });

  // Tabs
  panel.querySelectorAll('.notif-tab')?.forEach((t) => {
    t.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const scope = t.getAttribute('data-scope') || 'today';
      const st = getNotifState();
      st.activeTab = scope;
      syncNotifTabs();
      const listEl = document.getElementById('notifList');
      if (listEl) renderNotificationsList(listEl, Array.isArray(st.items) ? st.items : []);
    });
  });

  // Initial badge load + polling
  refreshNotifications(false);
  setInterval(() => refreshNotifications(false), 60 * 1000);
}


// --------------------------------------------
// Floating Search (icon next to bell)
// --------------------------------------------
function initFloatingSearchWidget() {
  // Avoid duplicates
  let btn =
    document.getElementById("searchIconBtn") ||
    document.getElementById("headerSearchBtn") ||
    document.querySelector(".search-icon-btn");

  const mount =
    document.querySelector(".main-header .header-row1 .right") ||
    document.querySelector(".main-header .topbar-right") ||
    document.querySelector(".main-header .header-row1") ||
    document.querySelector(".tasks-v2-actions") ||
    null;

  if (!mount) return;

  const notifWrap = mount.querySelector(".notif-wrap") || null;
  const userEl =
    mount.querySelector("a.header-user") ||
    mount.querySelector("a.account-mini") ||
    null;

  // Create button if needed
  if (!btn) {
    btn = document.createElement("button");
    btn.type = "button";
    btn.id = "searchIconBtn";
  }

  // Ensure the button is mounted in the right place on every page
  if (btn.parentElement !== mount) {
    if (notifWrap) mount.insertBefore(btn, notifWrap);
    else if (userEl) mount.insertBefore(btn, userEl);
    else mount.insertBefore(btn, mount.firstChild);
  } else {
    // Keep the order: Search → Bell → User
    if (notifWrap && btn.nextSibling !== notifWrap) {
      mount.insertBefore(btn, notifWrap);
    } else if (!notifWrap && userEl && btn.nextSibling !== userEl) {
      mount.insertBefore(btn, userEl);
    }
  }

  btn.className = "search-icon-btn";
  btn.setAttribute("aria-label", "Search");
  btn.setAttribute("aria-haspopup", "dialog");
  btn.setAttribute("aria-expanded", "false");
  btn.setAttribute("title", "Search");

  // Some pages/themes might set button/icon colors globally.
  // Force the icon color so it never renders "invisible".
  try {
    btn.style.setProperty("color", "#0F172A", "important");
  } catch {
    btn.style.color = "#0F172A";
  }

  btn.innerHTML = `
    <svg class="search-icon-svg" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" role="img">
      <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2.5" fill="none" />
      <line x1="16.65" y1="16.65" x2="21" y2="21" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
    </svg>
  `;
  document.body.classList.add("has-floating-search");

  let panel = document.getElementById("floatingSearchPanel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "floatingSearchPanel";
    panel.className = "floating-search-panel";
    panel.hidden = true;
    panel.innerHTML = `
      <div class="floating-search-inner">
        <svg class="search-icon-svg" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" role="img">
          <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2.5" fill="none" />
          <line x1="16.65" y1="16.65" x2="21" y2="21" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
        </svg>
        <input id="floatingSearchInput" type="search" placeholder="Search" aria-label="Search" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" />
      </div>
    `;
    document.body.appendChild(panel);
  }

  const input = panel.querySelector("#floatingSearchInput");

  function normalizeSearchText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function uniqueElements(list) {
    return Array.from(new Set((Array.isArray(list) ? list : []).filter(Boolean)));
  }

  function getSearchDocs() {
    return uniqueElements([getOpsPersistentShellFrameDocument(), document].filter(Boolean));
  }

  function getLinkedSearchInputs() {
    const selector = [
      ".main-header .searchbar input[type='search']",
      ".main-header .searchbar input:not([type])",
      ".tasks-v2-toolbar input[type='search']",
      ".tasks-v2-topbar input[type='search']",
      "#homeSearch",
      "#orderSearch",
      "#requestedSearch",
      "#svSearch",
      "#b2bSearch",
      "#stockSearch",
      "#schoolStockSearch",
      "#notifSearch"
    ].join(",");

    return uniqueElements(getSearchDocs().flatMap((doc) => Array.from(doc.querySelectorAll(selector)))).filter((el) => {
      if (!el || el === input || panel.contains(el)) return false;
      return !el.closest('[data-ops-shell-legacy="1"]');
    });
  }

  function getGenericSearchItems() {
    const selector = [
      ".co-card",
      ".order-card",
      ".tv2-card",
      ".task-card",
      ".stock-card",
      ".stock-item",
      ".school-folder-card",
      ".folder-card",
      ".notif-row"
    ].join(",");

    return uniqueElements(getSearchDocs().flatMap((doc) => Array.from(doc.querySelectorAll(selector)))).filter((el) => !el.closest('[data-ops-shell-legacy="1"]'));
  }

  function applyGenericSearchFallback(query) {
    const items = getGenericSearchItems();
    if (!items.length) return;

    const q = normalizeSearchText(query);
    items.forEach((el) => {
      const hay = normalizeSearchText(el.getAttribute("data-search") || el.textContent || "");
      const shouldShow = !q || hay.includes(q);
      el.style.display = shouldShow ? "" : "none";
    });
  }

  function syncFloatingInputFromPage() {
    const linked = getLinkedSearchInputs();
    const primary = linked[0] || null;
    if (!primary || !input) return;

    try {
      input.value = primary.value || "";
    } catch {}

    const placeholder = String(primary.getAttribute("placeholder") || "").trim();
    if (placeholder) {
      input.setAttribute("placeholder", placeholder);
      input.setAttribute("aria-label", placeholder);
    } else {
      input.setAttribute("placeholder", "Search");
      input.setAttribute("aria-label", "Search");
    }
  }

  function pushFloatingQueryToPage(nextValue) {
    const linked = getLinkedSearchInputs();
    if (!linked.length) {
      applyGenericSearchFallback(nextValue);
      return;
    }

    linked.forEach((el) => {
      if (!el) return;
      try {
        el.dataset.opsFloatingSearchSync = "1";
      } catch {}
      try {
        el.value = nextValue;
      } catch {}
      const ViewEvent = el.ownerDocument?.defaultView?.Event || Event;
      try {
        el.dispatchEvent(new ViewEvent("input", { bubbles: true }));
      } catch {}
      try {
        el.dispatchEvent(new ViewEvent("change", { bubbles: true }));
      } catch {}
      setTimeout(() => {
        try { delete el.dataset.opsFloatingSearchSync; } catch {}
      }, 0);
    });
  }

  function positionPanel() {
    const r = btn.getBoundingClientRect();
    const top = Math.max(12, r.bottom + 10);
    const right = Math.max(12, window.innerWidth - r.right);
    panel.style.position = "fixed";
    panel.style.top = `${top}px`;
    panel.style.right = `${right}px`;
    panel.style.left = "auto";
    panel.style.zIndex = "999999";

    const maxWidth = Math.min(520, Math.max(280, window.innerWidth - 28));
    panel.style.width = `${maxWidth}px`;

    const rect = panel.getBoundingClientRect();
    if (rect.left < 14) {
      panel.style.left = "14px";
      panel.style.right = "14px";
      panel.style.width = "auto";
    }
  }

  function openPanel() {
    syncFloatingInputFromPage();
    positionPanel();

    panel.classList.remove("is-open");
    panel.hidden = false;
    btn.setAttribute("aria-expanded", "true");

    requestAnimationFrame(() => {
      positionPanel();
      panel.classList.add("is-open");
    });

    setTimeout(() => {
      try {
        input && input.focus();
        input && input.select();
      } catch {}
    }, 0);
  }

  function closePanel() {
    if (panel.hidden) return;
    btn.setAttribute("aria-expanded", "false");
    panel.classList.remove("is-open");

    const finish = () => {
      panel.hidden = true;
      panel.removeEventListener("transitionend", finish);
    };

    panel.addEventListener("transitionend", finish);
    setTimeout(finish, 220);
  }

  if (input && input.dataset.floatingSearchInputBound !== "1") {
    input.dataset.floatingSearchInputBound = "1";

    input.addEventListener("input", () => {
      pushFloatingQueryToPage(input.value || "");
    });

    input.addEventListener("search", () => {
      pushFloatingQueryToPage(input.value || "");
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (input.value) {
          input.value = "";
          pushFloatingQueryToPage("");
        }
        closePanel();
      }
    });
  }

  // Bind only once per page lifecycle
  if (btn.dataset.floatingSearchBound !== "1") {
    btn.dataset.floatingSearchBound = "1";

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();

      try { window.__opsCloseUserMenu && window.__opsCloseUserMenu(); } catch {}
      try {
        const notif = document.getElementById("notifPanel");
        if (notif && !notif.hidden) notif.hidden = true;
      } catch {}

      if (panel.hidden) openPanel();
      else closePanel();
    });

    document.addEventListener("click", (e) => {
      if (panel.hidden) return;
      if (panel.contains(e.target) || btn.contains(e.target)) return;
      closePanel();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePanel();
    });

    window.addEventListener("resize", () => {
      if (!panel.hidden) positionPanel();
    });

    window.addEventListener("scroll", () => {
      if (!panel.hidden) positionPanel();
    }, true);
  }
}


// --------------------------------------------
// User Menu (avatar → drop window)
// --------------------------------------------
function initUserMenuWidget() {
  const mount =
    document.querySelector(".main-header .header-row1 .right") ||
    document.querySelector(".main-header .header-row1") ||
    document.querySelector(".tasks-v2-actions") ||
    null;

  if (!mount) return;

  // The trigger is the user pill/avatar (generated by renderHeaderUser)
  const trigger =
    mount.querySelector("a.header-user") ||
    mount.querySelector("a.account-mini") ||
    document.querySelector(".main-header a.header-user") ||
    document.querySelector(".main-header a.account-mini") ||
    null;

  if (!trigger) return;

  // Avoid binding twice (trigger element is stable; only innerHTML changes)
  if (trigger.dataset.userMenuBound === "1") {
    // Still ensure we expose the close handler globally
    const existing = document.getElementById("userMenuPanel");
    if (existing) window.__opsCloseUserMenu = () => { try { existing.hidden = true; trigger.setAttribute("aria-expanded", "false"); } catch {} };
    return;
  }
  trigger.dataset.userMenuBound = "1";

  try {
    const existingHref = trigger.getAttribute('href');
    if (existingHref) trigger.dataset.userMenuHref = existingHref;
    trigger.removeAttribute('href');
    trigger.setAttribute('role', 'button');
    trigger.setAttribute('tabindex', '0');
    trigger.dataset.userMenuTrigger = '1';
  } catch {}

  trigger.setAttribute("aria-haspopup", "menu");
  trigger.setAttribute("aria-expanded", "false");

  // Panel (portal)
  let panel = document.getElementById("userMenuPanel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "userMenuPanel";
    panel.className = "user-menu-panel user-menu-panel--portal";
    panel.hidden = true;
    panel.setAttribute("role", "menu");
    panel.setAttribute("aria-label", "User menu");
    // Force overlay positioning (even if legacy CSS changes)
    panel.style.position = "fixed";
    panel.style.zIndex = "999999";
    panel.innerHTML = `
      <div class="user-menu-shell">
        <div class="user-menu-user" aria-label="Signed in user">
          <span class="user-menu-user__avatar" aria-hidden="true">
            <img class="user-menu-user__img" data-user-menu-img alt="Profile photo" />
            <span class="user-menu-user__fallback" data-user-menu-fallback></span>
          </span>
          <div class="user-menu-user__meta">
            <div class="user-menu-user__name" data-user-menu-name>—</div>
            <div class="user-menu-user__role" data-user-menu-role></div>
          </div>
        </div>

        <div class="user-menu-sep user-menu-sep--tight" role="separator"></div>

        <button type="button" class="user-menu-item" data-user-menu-action="profile">
          <span class="umi-ico"><i data-feather="user"></i></span>
          <span class="umi-label">User Profile</span>
        </button>

        <button type="button" class="user-menu-item" data-user-menu-action="how">
          <span class="umi-ico"><i data-feather="activity"></i></span>
          <span class="umi-label">How it works</span>
        </button>

        <button type="button" class="user-menu-item user-menu-item--refresh" data-user-menu-action="hard-refresh">
          <span class="umi-ico"><i data-feather="rotate-cw"></i></span>
          <span class="umi-label">Hard Refresh</span>
        </button>

        <div class="user-menu-sep" role="separator"></div>

        <button type="button" class="user-menu-item user-menu-item--danger" data-user-menu-action="logout">
          <span class="umi-ico"><i data-feather="log-out"></i></span>
          <span class="umi-label">Log out</span>
        </button>
      </div>
    `;
    document.body.appendChild(panel);
  }

  // Keep the header section (avatar + name + position) in sync with the account info.
  function applyUserInfoToMenu(info) {
    const safe = info && typeof info === 'object' ? info : {};
    const name = String(safe.name || localStorage.getItem('username') || 'User').trim() || 'User';
    const role = String(safe.position || safe.department || '').trim();
    const photoUrl = String(safe.photoUrl || '').trim();

    const elName = panel.querySelector('[data-user-menu-name]');
    const elRole = panel.querySelector('[data-user-menu-role]');
    const img = panel.querySelector('[data-user-menu-img]');
    const fb = panel.querySelector('[data-user-menu-fallback]');

    if (elName) elName.textContent = name;
    if (elRole) elRole.textContent = role;

    // Initials helper (kept local to avoid depending on other closures)
    const initials = (function initialsFrom(n) {
      const parts = String(n || '').trim().split(/\s+/).filter(Boolean);
      if (!parts.length) return '';
      const first = parts[0][0] || '';
      const last = parts.length > 1 ? (parts[parts.length - 1][0] || '') : '';
      return (String(first) + String(last)).toUpperCase();
    })(name);

    if (img) {
      if (photoUrl) {
        img.src = photoUrl;
        img.style.display = 'block';
        img.alt = name + ' photo';
        if (fb) fb.style.display = 'none';
      } else {
        img.removeAttribute('src');
        img.style.display = 'none';
        if (fb) {
          fb.textContent = initials;
          fb.style.display = 'grid';
        }
      }
    }
  }

  // Apply immediately from cache/global (then refresh via /api/account)
  try { applyUserInfoToMenu(window.__opsUserInfo || {}); } catch {}

  // Listen to updates from ensureGreetingAndPages()
  if (!window.__opsUserMenuInfoBound) {
    window.__opsUserMenuInfoBound = true;
    window.addEventListener('ops:userinfo', (e) => {
      try { applyUserInfoToMenu(e && e.detail ? e.detail : {}); } catch {}
    });
  }

  function positionPanel() {
    if (panel.hidden) return;
    try {
      const rect = trigger.getBoundingClientRect();
      const gap = 12;

      const top = rect.bottom + gap;
      const right = Math.max(14, Math.round(window.innerWidth - rect.right));

      panel.style.top = `${Math.round(top)}px`;
      panel.style.right = `${right}px`;
      panel.style.left = "auto";

      // Keep inside viewport
      const pRect = panel.getBoundingClientRect();
      if (pRect.left < 14) {
        panel.style.left = "14px";
        panel.style.right = "auto";
      }

      const maxH = Math.max(180, Math.round(window.innerHeight - top - 16));
      panel.style.maxHeight = `${maxH}px`;
      panel.style.overflow = "auto";
    } catch {}
  }

  let _posRaf = 0;
  function requestPosition() {
    if (panel.hidden) return;
    if (_posRaf) cancelAnimationFrame(_posRaf);
    _posRaf = requestAnimationFrame(positionPanel);
  }

  function closeMenu() {
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
  }

  function openMenu() {
    // Close other top-right panels first
    try {
      const notif = document.getElementById("notifPanel");
      if (notif && !notif.hidden) notif.hidden = true;
    } catch {}
    try {
      const s = document.getElementById("floatingSearchPanel");
      if (s && !s.hidden) s.hidden = true;
    } catch {}

    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    requestPosition();
    requestPosition();
  }

  // Expose a global close helper so other widgets (search/bell) can close it.
  window.__opsCloseUserMenu = closeMenu;

  // Trigger click
  trigger.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (panel.hidden) openMenu();
    else closeMenu();
  });

  // Keyboard support
  trigger.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      if (panel.hidden) openMenu();
      else closeMenu();
    }
    if (e.key === "Escape") closeMenu();
  });

  // Action clicks (delegated)
  if (panel.dataset.actionsBound !== "1") {
    panel.dataset.actionsBound = "1";

    async function doLogout() {
      try { await fetch('/api/logout', { method: 'POST', credentials: 'include' }); } catch(e) {}
      try { sessionStorage.clear(); } catch {}
      try {
        localStorage.removeItem('ui.sidebarMini');
        localStorage.removeItem('ui.sidebarCollapsed');
        localStorage.removeItem('username');
      } catch {}
      window.location.href = '/login';
    }

    async function doHardRefresh() {
      try {
        if (window.OpsAppCache && typeof window.OpsAppCache.clear === 'function') {
          window.OpsAppCache.clear();
        }
      } catch {}

      try { sessionStorage.clear(); } catch {}
      try { localStorage.removeItem('username'); } catch {}

      try {
        if (window.caches && typeof caches.keys === 'function') {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }
      } catch {}

      try {
        if ('serviceWorker' in navigator && typeof navigator.serviceWorker.getRegistrations === 'function') {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((reg) => reg.update().catch(() => {})));
        }
      } catch {}

      try {
        await fetch('/api/hard-refresh', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Accept': 'application/json' },
          cache: 'no-store',
        });
      } catch {}

      const url = new URL(window.location.href);
      url.searchParams.set('_fresh', '1');
      url.searchParams.set('_refresh', String(Date.now()));
      window.location.replace(url.toString());
    }

    panel.addEventListener("click", async (e) => {
      const btn = e.target && e.target.closest ? e.target.closest("[data-user-menu-action]") : null;
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();

      const action = btn.getAttribute("data-user-menu-action") || "";
      closeMenu();

      if (action === "profile") {
        if (window.OpsShell && typeof window.OpsShell.navigate === 'function') {
          window.OpsShell.navigate('/account', { pushHistory: true });
        } else {
          window.location.href = "/account";
        }
        return;
      }

      if (action === "how") {
        if (window.OpsShell && typeof window.OpsShell.navigate === 'function') {
          window.OpsShell.navigate('/how-it-works', { pushHistory: true });
        } else {
          window.location.href = "/how-it-works";
        }
        return;
      }

      if (action === "hard-refresh") {
        btn.disabled = true;
        btn.classList.add('is-loading');
        await doHardRefresh();
        return;
      }

      if (action === "logout") {
        await doLogout();
      }
    });
  }

  // Close on outside click / ESC
  if (!window.__opsUserMenuDocBound) {
    window.__opsUserMenuDocBound = true;

    document.addEventListener("click", (e) => {
      const p = document.getElementById("userMenuPanel");
      if (!p || p.hidden) return;
      const t = document.querySelector(".main-header a.header-user") || document.querySelector(".main-header a.account-mini");
      if (t && t.contains(e.target)) return;
      if (p.contains(e.target)) return;
      try { p.hidden = true; if (t) t.setAttribute("aria-expanded", "false"); } catch {}
    });

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      const p = document.getElementById("userMenuPanel");
      if (!p || p.hidden) return;
      const t = document.querySelector(".main-header a.header-user") || document.querySelector(".main-header a.account-mini");
      try { p.hidden = true; if (t) t.setAttribute("aria-expanded", "false"); } catch {}
    });

    window.addEventListener("resize", () => {
      const p = document.getElementById("userMenuPanel");
      if (!p || p.hidden) return;
      try {
        const t = document.querySelector(".main-header a.header-user") || document.querySelector(".main-header a.account-mini");
        if (!t) return;
        const r = t.getBoundingClientRect();
        const gap = 12;
        const top = r.bottom + gap;
        const right = Math.max(14, Math.round(window.innerWidth - r.right));
        p.style.top = `${Math.round(top)}px`;
        p.style.right = `${right}px`;
        p.style.left = "auto";
      } catch {}
    });

    window.addEventListener("scroll", () => {
      const p = document.getElementById("userMenuPanel");
      if (!p || p.hidden) return;
      try {
        const t = document.querySelector(".main-header a.header-user") || document.querySelector(".main-header a.account-mini");
        if (!t) return;
        const r = t.getBoundingClientRect();
        const gap = 12;
        const top = r.bottom + gap;
        const right = Math.max(14, Math.round(window.innerWidth - r.right));
        p.style.top = `${Math.round(top)}px`;
        p.style.right = `${right}px`;
        p.style.left = "auto";
      } catch {}
    }, true);
  }

  if (window.feather) {
    try { window.feather.replace(); } catch {}
  }
}



function getNotifState(){
  if (!window.__notifWidgetState) {
    window.__notifWidgetState = {
      activeTab: 'today',
      showAll: false,
      items: [],
    };
  }
  return window.__notifWidgetState;
}

function syncNotifTabs(){
  const st = getNotifState();
  const active = st.activeTab || 'today';
  document.querySelectorAll('#notifPanel .notif-tab').forEach((btn) => {
    const scope = btn.getAttribute('data-scope') || 'today';
    const on = scope === active;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
}

function syncNotifSeeAll(){
  const st = getNotifState();
  const btn = document.getElementById('notifSeeAllBtn');
  if (!btn) return;
  btn.textContent = st.showAll ? 'Collapse' : 'See All';
}

function notifScope(ts){
  const num = Number(ts);
  const t = Number.isFinite(num) ? num : Date.now();
  const now = new Date();
  const d = new Date(t);

  // Today
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (t >= todayStart) return 'today';

  // This week (Mon → now)
  const day = now.getDay(); // 0 Sun, 1 Mon...
  const diffToMon = (day === 0 ? 6 : day - 1);
  const weekStartDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMon);
  const weekStart = new Date(weekStartDate.getFullYear(), weekStartDate.getMonth(), weekStartDate.getDate()).getTime();
  if (t >= weekStart) return 'week';

  return 'earlier';
}

function formatAgo(ts){
  const num = Number(ts);
  const t = Number.isFinite(num) ? num : Date.now();
  const diff = Math.max(0, Date.now() - t);
  const sec = Math.floor(diff / 1000);
  const min = Math.floor(sec / 60);
  const hr  = Math.floor(min / 60);
  const day = Math.floor(hr / 24);
  if (day >= 1) return `${day}d ago`;
  if (hr >= 1) return `${hr}h ago`;
  if (min >= 1) return `${min}m ago`;
  return 'just now';
}

function pickNotifIcon(n){
  const title = String(n?.title || '').toLowerCase();
  if (title.includes('task')) return 'check-circle';
  if (title.includes('stock')) return 'archive';
  if (title.includes('order')) return 'package';
  return 'bell';
}

async function refreshNotifications(renderList) {
  const badge = document.getElementById("notifBadge");
  const listEl = document.getElementById("notifList");

  try {
    const resp = await fetch("/api/notifications?limit=60", {
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

    const st = getNotifState();
    const rawItems = Array.isArray(data.items) ? data.items : [];
    st.items = rawItems
      .slice()
      .sort((a, b) => (Number(b?.ts || 0) - Number(a?.ts || 0)));

    if (renderList && listEl) {
      renderNotificationsList(listEl, st.items);
    }
  } catch (e) {
    if (renderList && listEl) {
      listEl.innerHTML = `<div class="notif-empty">Couldn’t load notifications</div>`;
    }
  }
}

function renderNotificationsList(listEl, items) {
  const st = getNotifState();
  const scope = st.activeTab || 'today';

  const scoped = Array.isArray(items)
    ? items.filter((n) => notifScope(n?.ts) === scope)
    : [];

  if (!scoped.length) {
    listEl.innerHTML = `<div class="notif-empty">No notifications</div>`;
    return;
  }

  const visible = st.showAll ? scoped : scoped.slice(0, 3);

  // Disable "See All" when there isn't anything more to show
  const seeAllBtn = document.getElementById('notifSeeAllBtn');
  if (seeAllBtn) {
    const canExpand = scoped.length > 3;
    seeAllBtn.disabled = !canExpand;
    seeAllBtn.style.opacity = canExpand ? '1' : '0.55';
    seeAllBtn.style.cursor = canExpand ? 'pointer' : 'default';
  }

  listEl.innerHTML = "";
  for (const n of visible) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'notif-row' + (n && !n.read ? ' is-unread' : '');
    row.dataset.id = n.id || '';
    row.dataset.url = (n && n.url) ? String(n.url) : '';

    const title = escapeHtml(n?.title || 'Update');
    const body = escapeHtml(n?.body || '');
    const ts = typeof n?.ts === 'number' ? n.ts : Date.now();
    const time = formatAgo(ts);
    const icon = pickNotifIcon(n);
    const showDot = !(n && n.read);

    row.innerHTML = `
      <div class="notif-row__ico"><i data-feather="${escapeAttr(icon)}"></i></div>
      <div class="notif-row__content">
        <div class="notif-row__title">
          <span class="notif-dot ${showDot ? '' : 'is-hidden'}" aria-hidden="true"></span>
          ${title}
        </div>
        ${body ? `<div class="notif-row__body">${body}</div>` : ''}
      </div>
      <div class="notif-row__time">${escapeHtml(time)}</div>
    `;

    row.addEventListener('click', async () => {
      const id = row.dataset.id;
      const url = row.dataset.url;

      if (id) {
        try {
          await fetch('/api/notifications/read', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id }),
          });
        } catch {}

        // optimistic local update
        try {
          const s = getNotifState();
          s.items = (Array.isArray(s.items) ? s.items : []).map((x) => {
            if (!x || x.id !== id) return x;
            return { ...x, read: true };
          });
        } catch {}
      }

      // Refresh badge in the background
      try { refreshNotifications(false); } catch {}

      // Close the dropdown
      const panel = document.getElementById('notifPanel');
      if (panel) panel.hidden = true;

      if (url) {
        window.location.href = url;
      }
    });

    listEl.appendChild(row);
  }

  if (window.feather) {
    try { window.feather.replace(); } catch {}
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

// Escape text for safe usage inside HTML attributes.
// (We keep it simple because we only need it for <img src="..."> and similar.)
function escapeAttr(str) {
  // escapeHtml already escapes &, <, >, " and '
  return escapeHtml(str)
    .replaceAll("`", "&#096;")
    .replaceAll("\n", " ")
    .replaceAll("\r", " ");
}


function isOpsShellEmbeddedMode() {
  try {
    const url = new URL(window.location.href);
    return url.searchParams.get('__shell') === 'content';
  } catch {
    return false;
  }
}

function getOpsPersistentShellFrame() {
  return document.getElementById('ops-shell-frame') || null;
}

function getOpsPersistentShellFrameDocument() {
  try {
    const frame = getOpsPersistentShellFrame();
    return frame?.contentDocument || frame?.contentWindow?.document || null;
  } catch {
    return null;
  }
}

function stripOpsShellParam(input) {
  try {
    const url = new URL(String(input || window.location.href), window.location.origin);
    url.searchParams.delete('__shell');
    const pathname = String(url.pathname || '/').replace(/\/+$/, '') || '/';
    return `${pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}

function resolveOpsShellCanonicalPath(input) {
  try {
    const display = stripOpsShellParam(input);
    const url = new URL(display, window.location.origin);
    const pathname = String(url.pathname || '/').replace(/\/+$/, '') || '/';

    if (pathname === '/orders/new' || pathname === '/orders/new/review') {
      url.pathname = '/orders/new/products';
    }

    const safePathname = String(url.pathname || '/').replace(/\/+$/, '') || '/';
    return `${safePathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}

function buildOpsShellContentUrl(input) {
  const display = resolveOpsShellCanonicalPath(input);
  const url = new URL(display, window.location.origin);
  url.searchParams.set('__shell', 'content');
  return url.toString();
}

function isOpsShellNavigableHref(href) {
  try {
    const url = new URL(String(href || ''), window.location.origin);
    if (url.origin !== window.location.origin) return false;
    if (url.pathname.startsWith('/api/')) return false;
    if (/\.(?:css|js|mjs|map|json|png|jpe?g|gif|webp|svg|ico|pdf|zip|txt|xml|woff2?|ttf|eot|mp4|mp3)$/i.test(url.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

function normalizeOpsShellPath(input) {
  try {
    const display = resolveOpsShellCanonicalPath(input);
    const url = new URL(display, window.location.origin);
    const pathname = String(url.pathname || '/').replace(/\/+$/, '') || '/';
    return `${pathname}${url.search}${url.hash}`;
  } catch {
    return '/';
  }
}

function deriveOpsShellTitle(path) {
  const pathname = (() => {
    try { return new URL(String(path || '/'), window.location.origin).pathname; } catch { return String(path || '/'); }
  })();
  const map = [
    ['/home', 'Home'],
    ['/tasks', 'Tasks'],
    ['/orders/new', 'Create New Order'],
    ['/orders/requested', 'Operations Orders'],
    ['/orders/maintenance-orders', 'Maintenance Orders'],
    ['/orders/sv-orders', 'Orders Review'],
    ['/orders', 'Current Orders'],
    ['/stocktaking', 'Stocktaking'],
    ['/expenses/users', 'Expenses Users'],
    ['/expenses', 'Expenses'],
    ['/b2b', 'B2B'],
    ['/account', 'Account'],
    ['/how-it-works', 'How it works'],
  ];
  const found = map.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  if (found) return found[1];
  const raw = pathname.split('/').filter(Boolean).pop() || 'Dashboard';
  return raw.replace(/[-_]+/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

function readOpsShellFrameMeta() {
  const frameDoc = getOpsPersistentShellFrameDocument();
  const frameWin = (() => { try { return getOpsPersistentShellFrame()?.contentWindow || null; } catch { return null; } })();
  const framePath = frameWin ? resolveOpsShellCanonicalPath(frameWin.location.href) : resolveOpsShellCanonicalPath(window.location.href);
  if (!frameDoc) {
    const fallbackTitle = deriveOpsShellTitle(framePath);
    return { displayTitle: fallbackTitle, fullTitle: fallbackTitle, path: framePath, searchPlaceholder: `Search in ${fallbackTitle}` };
  }

  const titleEl =
    frameDoc.querySelector('.main-header .page-title') ||
    frameDoc.querySelector('.main-header .dash-title') ||
    frameDoc.querySelector('[data-shell-title]') ||
    frameDoc.querySelector('h1');

  const displayTitle = String(titleEl?.textContent || frameDoc.title || deriveOpsShellTitle(framePath)).trim() || deriveOpsShellTitle(framePath);
  const searchInput = frameDoc.querySelector([
    '.main-header .searchbar input[type="search"]',
    '.main-header .searchbar input:not([type])',
    '.tasks-v2-toolbar input[type="search"]',
    '.tasks-v2-topbar input[type="search"]',
    '#homeSearch',
    '#orderSearch',
    '#requestedSearch',
    '#svSearch',
    '#b2bSearch',
    '#stockSearch',
    '#schoolStockSearch',
    '#notifSearch'
  ].join(','));

  const placeholder = String(searchInput?.getAttribute('placeholder') || '').trim() || `Search in ${displayTitle}`;
  return {
    displayTitle,
    fullTitle: String(frameDoc.title || displayTitle).trim() || displayTitle,
    path: framePath,
    searchPlaceholder: placeholder,
  };
}

function applyOpsShellBodyState(path) {
  try {
    document.body.classList.forEach((cls) => {
      if (/^page-/.test(cls) || cls === 'tasks-v2' || cls === 'order-modal-fit-screen') {
        document.body.classList.remove(cls);
      }
    });
  } catch {}

  document.body.classList.add('page-shell-host');

  try {
    const pathname = new URL(stripOpsShellParam(path), window.location.origin).pathname;
    const slug = (pathname === '/') ? 'root' : pathname.split('/').filter(Boolean).join('-');
    if (slug) document.body.classList.add(`page-shell-${slug}`);
  } catch {}
}

function setOpsShellActiveNav(path) {
  const currentPath = (() => {
    try { return new URL(stripOpsShellParam(path), window.location.origin).pathname; } catch { return '/'; }
  })();

  const links = Array.from(document.querySelectorAll('.sidebar .nav-link'));
  if (!links.length) return;

  links.forEach((link) => link.classList.remove('active'));

  let best = null;
  let bestLen = -1;

  links.forEach((link) => {
    try {
      const linkPath = new URL(link.getAttribute('href') || '', window.location.origin).pathname.replace(/\/+$/, '') || '/';
      const safeCurrent = currentPath.replace(/\/+$/, '') || '/';
      const matches = safeCurrent === linkPath || safeCurrent.startsWith(`${linkPath}/`);
      if (matches && linkPath.length > bestLen) {
        best = link;
        bestLen = linkPath.length;
      }
    } catch {}
  });

  if (!best) {
    best = links.find((link) => (link.getAttribute('href') || '').replace(/\/+$/, '') === '/home') || links[0];
  }

  if (best) best.classList.add('active');
}

function applyOpsShellChrome(meta) {
  const safeMeta = meta && typeof meta === 'object' ? meta : {};
  const title = String(safeMeta.displayTitle || deriveOpsShellTitle(safeMeta.path || window.location.pathname)).trim() || 'Dashboard';
  const fullTitle = String(safeMeta.fullTitle || title).trim() || title;
  const placeholder = String(safeMeta.searchPlaceholder || `Search in ${title}`).trim();

  document.title = fullTitle;
  applyOpsShellBodyState(safeMeta.path || window.location.pathname);
  setOpsShellActiveNav(safeMeta.path || window.location.pathname);

  document.querySelectorAll('.main-header .dash-title, .main-header .page-title').forEach((el) => {
    try { el.textContent = title; } catch {}
  });

  const searchInput = document.querySelector('.main-header .searchbar input');
  if (searchInput) {
    searchInput.setAttribute('placeholder', placeholder);
    searchInput.setAttribute('aria-label', placeholder);
  }

  const floating = document.getElementById('floatingSearchInput');
  if (floating && !floating.value) {
    floating.setAttribute('placeholder', placeholder);
    floating.setAttribute('aria-label', placeholder);
  }
}

function applyOpsShellSearchToFrame(query) {
  const frameDoc = getOpsPersistentShellFrameDocument();
  if (!frameDoc) return;

  const q = String(query || '');
  const selector = [
    '.main-header .searchbar input[type="search"]',
    '.main-header .searchbar input:not([type])',
    '.tasks-v2-toolbar input[type="search"]',
    '.tasks-v2-topbar input[type="search"]',
    '#homeSearch',
    '#orderSearch',
    '#requestedSearch',
    '#svSearch',
    '#b2bSearch',
    '#stockSearch',
    '#schoolStockSearch',
    '#notifSearch'
  ].join(',');

  const linked = Array.from(frameDoc.querySelectorAll(selector));
  if (linked.length) {
    linked.forEach((input) => {
      try { input.dataset.opsFloatingSearchSync = '1'; } catch {}
      try { input.value = q; } catch {}
      const ViewEvent = input.ownerDocument?.defaultView?.Event || Event;
      try { input.dispatchEvent(new ViewEvent('input', { bubbles: true })); } catch {}
      try { input.dispatchEvent(new ViewEvent('change', { bubbles: true })); } catch {}
      window.setTimeout(() => { try { delete input.dataset.opsFloatingSearchSync; } catch {} }, 0);
    });
    return;
  }

  const items = Array.from(frameDoc.querySelectorAll([
    '.co-card',
    '.order-card',
    '.tv2-card',
    '.task-card',
    '.stock-card',
    '.stock-item',
    '.school-folder-card',
    '.folder-card',
    '.notif-row'
  ].join(',')));

  const needle = q.trim().toLowerCase();
  items.forEach((el) => {
    const hay = String(el.getAttribute('data-search') || el.textContent || '').trim().toLowerCase();
    const visible = !needle || hay.includes(needle);
    el.style.display = visible ? '' : 'none';
  });
}

function bindOpsShellFrameNavigation(frameDoc) {
  if (!frameDoc || frameDoc.documentElement?.dataset?.opsShellNavBound === '1') return;
  try { frameDoc.documentElement.dataset.opsShellNavBound = '1'; } catch {}

  frameDoc.addEventListener('click', (event) => {
    const anchor = event.target.closest('a[href]');
    if (!anchor) return;
    const role = String(anchor.getAttribute('role') || '').toLowerCase();
    if (role === 'tab') {
      try { event.preventDefault(); } catch {}
      return;
    }
    if (event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (anchor.hasAttribute('download')) return;
    const target = String(anchor.getAttribute('target') || '').toLowerCase();
    if (target && target !== '_self') return;
    const href = anchor.getAttribute('href') || '';
    if (!href || href.startsWith('#')) return;
    const absolute = anchor.href || href;
    if (!isOpsShellNavigableHref(absolute)) return;

    try {
      event.preventDefault();
      if (window.OpsShell && typeof window.OpsShell.navigate === 'function') {
        window.OpsShell.navigate(absolute, { pushHistory: true });
      }
    } catch {}
  }, true);
}

function initOpsPersistentShellHost() {
  if (window.__opsShellHostInitialized) return;
  if (isOpsShellEmbeddedMode()) return;
  if (!document.querySelector('.sidebar') || !document.querySelector('.main-content')) return;

  const mainContent = document.querySelector('.main-content');
  const header = mainContent?.querySelector('.main-header');
  const legacyMain = Array.from(mainContent?.children || []).find((node) => node.tagName === 'MAIN');
  if (!mainContent || !header || !legacyMain) return;

  window.__opsShellHostInitialized = true;
  legacyMain.setAttribute('data-ops-shell-legacy', '1');

  const hostMain = document.createElement('main');
  hostMain.className = 'ops-shell-host-main';
  hostMain.hidden = true;
  hostMain.innerHTML = `
    <div class="ops-shell-frame-wrap is-loading">
      <div class="ops-shell-loading" aria-live="polite">
        <span class="ops-shell-loading__spinner" aria-hidden="true"></span>
        <span class="ops-shell-loading__text">Loading page…</span>
      </div>
      <iframe id="ops-shell-frame" class="ops-shell-frame" title="Dashboard page content" loading="eager"></iframe>
    </div>
  `;
  mainContent.appendChild(hostMain);

  const frame = hostMain.querySelector('#ops-shell-frame');
  const frameWrap = hostMain.querySelector('.ops-shell-frame-wrap');
  const hostSearch = document.querySelector('.main-header .searchbar input');
  const state = {
    currentPath: resolveOpsShellCanonicalPath(window.location.href),
    requestedPath: null,
    frame,
    frameWrap,
    legacyMain,
    hostMain,
    hostSearch,
  };
  window.__opsShellHostState = state;

  const showLoading = (hideLegacy) => {
    frameWrap.classList.add('is-loading');
    frame.classList.remove('is-ready');
    frame.style.visibility = 'hidden';
    if (hideLegacy) {
      legacyMain.hidden = true;
      hostMain.hidden = false;
    }
  };

  const finishLoad = () => {
    const meta = readOpsShellFrameMeta();
    const loadedPath = normalizeOpsShellPath(meta.path || state.requestedPath || state.currentPath);
    const requestedPath = normalizeOpsShellPath(state.requestedPath || state.currentPath);
    const currentPath = normalizeOpsShellPath(state.currentPath || '/');

    if (!state.requestedPath && loadedPath !== currentPath) {
      try { history.pushState({ opsShellPath: loadedPath }, '', loadedPath); } catch {}
    } else if (state.requestedPath && loadedPath !== requestedPath && loadedPath !== currentPath) {
      try { history.pushState({ opsShellPath: loadedPath }, '', loadedPath); } catch {}
    }

    state.currentPath = loadedPath;
    state.requestedPath = null;

    applyOpsShellChrome(meta);
    legacyMain.hidden = true;
    hostMain.hidden = false;
    frameWrap.classList.remove('is-loading');
    frame.style.visibility = 'visible';
    frame.classList.add('is-ready');
    bindOpsShellFrameNavigation(getOpsPersistentShellFrameDocument());

    if (hostSearch && hostSearch.value) {
      applyOpsShellSearchToFrame(hostSearch.value);
    }
  };

  frame.addEventListener('load', () => {
    try { finishLoad(); } catch (e) { console.warn('[ops-shell] frame load sync failed', e); }
  });

  const loadFrame = (href, opts = {}) => {
    const nextPath = resolveOpsShellCanonicalPath(href);
    const nextNormalized = normalizeOpsShellPath(nextPath);
    const currentNormalized = normalizeOpsShellPath(state.currentPath);
    const shouldPush = !!opts.pushHistory && nextNormalized !== currentNormalized;
    const shouldReplace = !!opts.replaceHistory;
    const hasLoadedFrame = !!(frame && frame.getAttribute('src'));

    if (!opts.forceReload && hasLoadedFrame && nextNormalized === currentNormalized) {
      state.requestedPath = null;
      if (shouldReplace) {
        try { history.replaceState({ opsShellPath: nextPath }, '', nextPath); } catch {}
      }
      try { bindOpsShellFrameNavigation(getOpsPersistentShellFrameDocument()); } catch {}
      return;
    }

    state.requestedPath = nextPath;

    if (shouldPush) {
      try { history.pushState({ opsShellPath: nextPath }, '', nextPath); } catch {}
    } else if (shouldReplace) {
      try { history.replaceState({ opsShellPath: nextPath }, '', nextPath); } catch {}
    }

    showLoading(!!opts.hideLegacy);
    frame.src = buildOpsShellContentUrl(nextPath);
  };

  document.addEventListener('click', (event) => {
    const anchor = event.target.closest('a[href]');
    if (!anchor) return;
    const role = String(anchor.getAttribute('role') || '').toLowerCase();
    if (role === 'tab') {
      try { event.preventDefault(); } catch {}
      return;
    }
    const insideLegacy = anchor.closest('[data-ops-shell-legacy="1"]');
    if (insideLegacy && legacyMain.hidden) return;
    if (event.defaultPrevented) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (anchor.hasAttribute('download')) return;
    const target = String(anchor.getAttribute('target') || '').toLowerCase();
    if (target && target !== '_self') return;
    const href = anchor.getAttribute('href') || '';
    if (!href || href.startsWith('#')) return;
    const absolute = anchor.href || href;
    if (!isOpsShellNavigableHref(absolute)) return;

    event.preventDefault();
    loadFrame(absolute, { pushHistory: true, hideLegacy: true });
  }, true);

  window.addEventListener('popstate', () => {
    const desired = resolveOpsShellCanonicalPath(window.location.href);
    if (normalizeOpsShellPath(desired) === normalizeOpsShellPath(state.currentPath)) return;
    loadFrame(desired, { replaceHistory: true, hideLegacy: true });
  });

  if (hostSearch && hostSearch.dataset.opsShellBound !== '1') {
    hostSearch.dataset.opsShellBound = '1';
    hostSearch.addEventListener('input', () => {
      applyOpsShellSearchToFrame(hostSearch.value || '');
    });
    hostSearch.addEventListener('search', () => {
      applyOpsShellSearchToFrame(hostSearch.value || '');
    });
  }

  window.OpsShell = {
    navigate(href, opts = {}) {
      const next = resolveOpsShellCanonicalPath(href);
      loadFrame(next, { pushHistory: opts.pushHistory !== false, replaceHistory: !!opts.replaceHistory, hideLegacy: true, forceReload: !!opts.forceReload });
    },
    getFrame() { return frame; },
    getFrameDocument() { return getOpsPersistentShellFrameDocument(); },
    getCurrentPath() { return state.currentPath; },
  };

  applyOpsShellChrome({
    displayTitle: deriveOpsShellTitle(state.currentPath),
    fullTitle: document.title || deriveOpsShellTitle(state.currentPath),
    path: state.currentPath,
    searchPlaceholder: `Search in ${deriveOpsShellTitle(state.currentPath)}`
  });
  setOpsShellActiveNav(state.currentPath);
  try { history.replaceState({ opsShellPath: state.currentPath }, '', state.currentPath); } catch {}
  loadFrame(state.currentPath, { replaceHistory: true, hideLegacy: false });
}
