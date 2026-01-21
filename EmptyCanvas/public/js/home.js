// public/js/home.js
// Home dashboard — analysis blocks (Operations)

document.addEventListener('DOMContentLoaded', () => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  const els = {
    updated: $('#homeUpdated'),
    scopeLine: $('#homeScopeLine'),
    search: $('#homeSearch'),

    // KPIs
    kpiTasksMain: $('#kpiTasksMain'),
    kpiTasksSub: $('#kpiTasksSub'),
    kpiOrdersMain: $('#kpiOrdersMain'),
    kpiOrdersSub: $('#kpiOrdersSub'),
    kpiRequestedMain: $('#kpiRequestedMain'),
    kpiRequestedSub: $('#kpiRequestedSub'),
    kpiStockMain: $('#kpiStockMain'),
    kpiStockSub: $('#kpiStockSub'),
    kpiExpensesMain: $('#kpiExpensesMain'),
    kpiExpensesSub: $('#kpiExpensesSub'),

    // Lists
    tasksSubtitle: $('#tasksSubtitle'),
    ordersSubtitle: $('#ordersSubtitle'),
    tasksList: $('#homeTasksList'),
    ordersList: $('#homeOrdersList'),

    // Actions + scope
    actions: $('#homeActions'),
    scopeDept: $('#scopeDept'),
    scopePos: $('#scopePos'),
    scopeChips: $('#scopeChips'),
  };

  const state = {
    allowedSet: new Set(),
    allowedPagesRaw: [],
    dept: '',
    position: '',
    tasks: [],
    orders: [],
    orderGroups: [],
    requestedItems: [],
    requestedGroups: [],
    expenses: [],
    stock: [],
  };

  const norm = (s) => String(s || '').trim().toLowerCase();
  const normPath = (s) => norm(s).replace(/\/+$/, '');

  const moneyFmt = (() => {
    try {
      return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
    } catch {
      return null;
    }
  })();

  function fmtMoney(value) {
    const n = Number(value);
    const safe = Number.isFinite(n) ? n : 0;
    return moneyFmt ? moneyFmt.format(safe) : `£${safe.toFixed(2)}`;
  }

  function safeText(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  function toast(type, title, message) {
    if (window.UI?.toast) return window.UI.toast({ type, title, message });
    console[type === 'error' ? 'error' : 'log'](title, message);
  }

  function setUpdatedNow() {
    if (!els.updated) return;
    const d = new Date();
    const txt = d.toLocaleString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    els.updated.textContent = `Updated ${txt}`;
  }

  function hideBlock(key) {
    $$(`[data-block="${key}"]`).forEach((el) => el.classList.add('is-hidden'));
  }
  function showBlock(key) {
    $$(`[data-block="${key}"]`).forEach((el) => el.classList.remove('is-hidden'));
  }

  function hasAccess(pageNameOrPath) {
    const k = norm(pageNameOrPath);
    const p = normPath(pageNameOrPath);
    return state.allowedSet.has(k) || state.allowedSet.has(p) || state.allowedSet.has('/' + p);
  }

  function buildAllowedSet(allowedPages) {
    const set = new Set();
    (allowedPages || []).forEach((v) => {
      const k = norm(v);
      const p = normPath(v);
      if (k) set.add(k);
      if (p) {
        set.add(p);
        if (!p.startsWith('/')) set.add('/' + p);
        if (p.startsWith('/')) set.add(p.slice(1));
      }
    });
    return set;
  }

  function formatISODate(dateStr) {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (!Number.isFinite(d.getTime())) return '';
      return d.toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  }

  function isDoneStatus(status) {
    const s = norm(status);
    return /(done|completed|complete|finished|closed)/.test(s);
  }

  function toYMD(dateLike) {
    try {
      const d = dateLike instanceof Date ? dateLike : new Date(dateLike);
      if (!Number.isFinite(d.getTime())) return '';
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${dd}`;
    } catch {
      return '';
    }
  }

  // ===== Orders grouping / stage =====
  const ORDER_FLOW = [
    { label: 'Order Placed' },
    { label: 'Under Supervision' },
    { label: 'In progress' },
    { label: 'Shipped' },
    { label: 'Arrived' },
  ];

  function orderStatusToIndex(status) {
    const s = norm(status).replace(/[_-]+/g, ' ');
    if (/(arrived|delivered|received)/.test(s)) return 5;
    if (/(shipped|on the way|delivering|prepared)/.test(s)) return 4;
    if (/(in progress|inprogress|progress)/.test(s)) return 3;
    if (/(under supervision|supervision|review)/.test(s)) return 2;
    if (/(order placed|placed|pending|order received)/.test(s)) return 1;
    return 1;
  }

  function orderComputeStage(items) {
    let bestIdx = 1;
    for (const it of items || []) {
      const i = orderStatusToIndex(it?.status);
      if (i > bestIdx) bestIdx = i;
    }
    const safeIdx = Math.min(5, Math.max(1, bestIdx));
    return { idx: safeIdx, label: ORDER_FLOW[safeIdx - 1]?.label || 'Order Placed' };
  }

  function groupOrdersByMinute(list) {
    const pad2 = (n) => String(n).padStart(2, '0');
    const keyOf = (createdTime) => {
      const d = new Date(createdTime || 0);
      if (!Number.isFinite(d.getTime())) return 'Unknown time';
      const yyyy = d.getFullYear();
      const mm = pad2(d.getMonth() + 1);
      const dd = pad2(d.getDate());
      const hh = pad2(d.getHours());
      const mi = pad2(d.getMinutes());
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
    };

    const map = new Map();
    const sorted = (list || []).slice().sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));

    for (const o of sorted) {
      const key = keyOf(o.createdTime);
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          groupId: o.id,
          latestCreated: o.createdTime,
          products: [],
        };
        map.set(key, g);
      }
      g.products.push(o);
      // representative id should be the latest created within the group
      if (new Date(o.createdTime) > new Date(g.latestCreated)) {
        g.latestCreated = o.createdTime;
        g.groupId = o.id;
      }
    }

    const groups = Array.from(map.values()).sort((a, b) => new Date(b.latestCreated) - new Date(a.latestCreated));
    return groups;
  }

  function ordersEstimateTotal(items) {
    return (items || []).reduce((sum, x) => sum + (Number(x.quantity) || 0) * (Number(x.unitPrice) || 0), 0);
  }

  // ===== Requested orders grouping (operations orders) =====
  function reqStatusToIndex(status) {
    const s = norm(status);
    if (/(arrived|delivered|received)/.test(s)) return 5;
    if (/shipped/.test(s)) return 4;
    if (/(in\s*progress|preparing|processing)/.test(s)) return 3;
    if (/under\s*supervision/.test(s)) return 2;
    return 1;
  }

  function reqTabFromStageIdx(idx) {
    if (idx >= 5) return 'delivered';
    if (idx >= 4) return 'received';
    return 'not-started';
  }

  function groupRequested(list) {
    // The API already returns a flat list of rows that belong to the same order group.
    // The safest grouping key is the "orderGroupId" if present, otherwise we fallback to minute bucket.
    const pad2 = (n) => String(n).padStart(2, '0');
    const minuteKey = (createdTime) => {
      const d = new Date(createdTime || 0);
      if (!Number.isFinite(d.getTime())) return 'Unknown time';
      const yyyy = d.getFullYear();
      const mm = pad2(d.getMonth() + 1);
      const dd = pad2(d.getDate());
      const hh = pad2(d.getHours());
      const mi = pad2(d.getMinutes());
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
    };

    const map = new Map();
    const sorted = (list || []).slice().sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));

    for (const it of sorted) {
      const key = it?.orderGroupId ? String(it.orderGroupId) : minuteKey(it.createdTime);
      let g = map.get(key);
      if (!g) {
        g = {
          key,
          groupId: it?.groupId || it?.id,
          latestCreated: it.createdTime,
          items: [],
        };
        map.set(key, g);
      }
      g.items.push(it);
      if (new Date(it.createdTime) > new Date(g.latestCreated)) {
        g.latestCreated = it.createdTime;
        g.groupId = it?.groupId || it?.id;
      }
    }

    return Array.from(map.values()).sort((a, b) => new Date(b.latestCreated) - new Date(a.latestCreated));
  }

  function reqComputeStage(items) {
    let best = 1;
    for (const it of items || []) {
      const idx = reqStatusToIndex(it?.status);
      if (idx > best) best = idx;
    }
    return { idx: best, tab: reqTabFromStageIdx(best) };
  }

  // ===== Rendering =====
  function renderEmpty(container, msg) {
    if (!container) return;
    container.innerHTML = `<div class="home-empty">${safeText(msg || 'No data')}</div>`;
  }

  function renderTasksList(list) {
    if (!els.tasksList) return;

    const q = norm(els.search?.value);
    const filtered = (list || []).filter((t) => {
      if (!q) return true;
      return norm(t.title).includes(q) || norm(t.status).includes(q) || norm(t.priority).includes(q);
    });

    if (!filtered.length) return renderEmpty(els.tasksList, 'No tasks found');

    const frag = document.createDocumentFragment();
    for (const t of filtered.slice(0, 6)) {
      const due = t.dueDate ? formatISODate(t.dueDate) : '';
      const status = t.status ? String(t.status) : '';
      const prio = t.priority ? String(t.priority) : '';
      const pct = Number.isFinite(Number(t.completion)) ? Math.round(Number(t.completion)) : null;
      const meta = [prio, status, due].filter(Boolean).join(' • ');

      const row = document.createElement('a');
      row.className = 'home-item';
      row.href = '/tasks';
      row.innerHTML = `
        <div class="home-item__main">
          <div class="home-item__title">${safeText(t.title || 'Untitled')}</div>
          <div class="home-item__meta">${safeText(meta || '—')}</div>
        </div>
        <div class="home-item__right">
          ${pct !== null ? `<span class="home-badge">${pct}%</span>` : ''}
          <span class="home-arrow" aria-hidden="true"><i data-feather="arrow-up-right"></i></span>
        </div>
      `;
      frag.appendChild(row);
    }

    els.tasksList.innerHTML = '';
    els.tasksList.appendChild(frag);
    if (window.feather) window.feather.replace();
  }

  function renderOrdersList(groups) {
    if (!els.ordersList) return;

    const q = norm(els.search?.value);
    const filtered = (groups || []).filter((g) => {
      if (!q) return true;
      const first = g.products?.[0] || {};
      const reason = first.reason || '';
      const createdBy = first.createdByName || '';
      return norm(reason).includes(q) || norm(createdBy).includes(q);
    });

    if (!filtered.length) return renderEmpty(els.ordersList, 'No orders found');

    const frag = document.createDocumentFragment();
    for (const g of filtered.slice(0, 6)) {
      const items = g.products || [];
      const stage = orderComputeStage(items);
      const total = ordersEstimateTotal(items);
      const first = items[0] || {};
      const title = first.reason || 'Order';
      const meta = `${items.length} items • ${stage.label}`;
      const href = g.groupId ? `/orders/tracking?groupId=${encodeURIComponent(g.groupId)}` : '/orders';

      const row = document.createElement('a');
      row.className = 'home-item';
      row.href = href;
      row.innerHTML = `
        <div class="home-item__main">
          <div class="home-item__title">${safeText(title)}</div>
          <div class="home-item__meta">${safeText(meta)}</div>
        </div>
        <div class="home-item__right">
          <span class="home-badge">${safeText(fmtMoney(total))}</span>
          <span class="home-arrow" aria-hidden="true"><i data-feather="arrow-up-right"></i></span>
        </div>
      `;
      frag.appendChild(row);
    }

    els.ordersList.innerHTML = '';
    els.ordersList.appendChild(frag);
    if (window.feather) window.feather.replace();
  }

  function setKpi(elMain, elSub, mainText, subText) {
    if (elMain) elMain.textContent = mainText;
    if (elSub) elSub.textContent = subText;
  }

  function buildAction(href, icon, title, sub) {
    const a = document.createElement('a');
    a.className = 'home-action';
    a.href = href;
    a.innerHTML = `
      <div class="home-action__left">
        <span class="home-action__ico"><i data-feather="${safeText(icon)}"></i></span>
        <div>
          <div class="home-action__title">${safeText(title)}</div>
          <div class="home-action__sub">${safeText(sub)}</div>
        </div>
      </div>
      <span class="home-action__right" aria-hidden="true"><i data-feather="arrow-right"></i></span>
    `;
    return a;
  }

  function renderActions() {
    if (!els.actions) return;
    els.actions.innerHTML = '';

    const actions = [];
    actions.push(buildAction('/home', 'activity', 'Refresh dashboard', 'Quick overview of your work'));

    if (hasAccess('Create New Order') || hasAccess('/orders/new')) {
      actions.push(buildAction('/orders/new', 'plus-circle', 'Create new order', 'Start a new components request'));
    }
    if (hasAccess('Current Orders') || hasAccess('/orders')) {
      actions.push(buildAction('/orders', 'list', 'Current orders', 'Track your recent requests'));
    }
    if (hasAccess('Requested Orders') || hasAccess('/orders/requested')) {
      actions.push(buildAction('/orders/requested', 'users', 'Operations orders', 'Review schools requested orders'));
    }
    if (hasAccess('Stocktaking') || hasAccess('/stocktaking')) {
      actions.push(buildAction('/stocktaking', 'archive', 'Stocktaking', 'View your school inventory'));
    }
    if (hasAccess('Tasks') || hasAccess('/tasks')) {
      actions.push(buildAction('/tasks', 'check-square', 'Tasks', 'Your department task board'));
    }
    if (hasAccess('Expenses') || hasAccess('/expenses')) {
      actions.push(buildAction('/expenses', 'dollar-sign', 'Expenses', 'Your cash in/out records'));
    }
    actions.push(buildAction('/account', 'user', 'Account', 'Profile & permissions'));

    // Render unique hrefs only
    const seen = new Set();
    const frag = document.createDocumentFragment();
    for (const a of actions) {
      if (seen.has(a.href)) continue;
      seen.add(a.href);
      frag.appendChild(a);
    }
    els.actions.appendChild(frag);
    if (window.feather) window.feather.replace();
  }

  function renderScopeChips(pages) {
    if (!els.scopeChips) return;
    els.scopeChips.innerHTML = '';

    const unique = Array.from(new Set((pages || []).map((x) => String(x || '').trim()).filter(Boolean)));
    if (!unique.length) {
      renderEmpty(els.scopeChips, 'No pages assigned');
      return;
    }

    const frag = document.createDocumentFragment();
    for (const p of unique.slice(0, 18)) {
      const chip = document.createElement('span');
      chip.className = 'home-chip';
      chip.textContent = p;
      frag.appendChild(chip);
    }
    els.scopeChips.appendChild(frag);
  }

  // ===== Data loaders =====
  async function fetchJson(url) {
    const res = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
    if (res.status === 401) {
      window.location.href = '/login';
      throw new Error('Not authenticated');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Request failed: ${res.status}`);
    }
    return res.json();
  }

  async function loadAccount() {
    const data = await fetchJson('/api/account');
    const allowed = Array.isArray(data.allowedPages) ? data.allowedPages : [];
    state.allowedPagesRaw = allowed;
    state.allowedSet = buildAllowedSet(allowed);
    state.dept = String(data.department || '').trim();
    state.position = String(data.position || '').trim();

    // Scope line
    const parts = [];
    if (state.dept) parts.push(state.dept);
    if (state.position) parts.push(state.position);
    els.scopeLine && (els.scopeLine.textContent = parts.length ? parts.join(' • ') : '—');
    els.scopeDept && (els.scopeDept.textContent = state.dept || '—');
    els.scopePos && (els.scopePos.textContent = state.position || '—');
    renderScopeChips(allowed);

    // Decide what blocks to show
    const canTasks = hasAccess('Tasks') || hasAccess('/tasks');
    const canOrders = hasAccess('Current Orders') || hasAccess('/orders');
    const canRequested = hasAccess('Requested Orders') || hasAccess('/orders/requested');
    const canStock = hasAccess('Stocktaking') || hasAccess('/stocktaking');
    const canExpenses = hasAccess('Expenses') || hasAccess('/expenses');

    if (!canTasks) hideBlock('tasks'); else showBlock('tasks');
    if (!canOrders) hideBlock('orders'); else showBlock('orders');
    if (!canRequested) hideBlock('requested'); else showBlock('requested');
    if (!canStock) hideBlock('stock'); else showBlock('stock');
    if (!canExpenses) hideBlock('expenses'); else showBlock('expenses');

    renderActions();

    return { canTasks, canOrders, canRequested, canStock, canExpenses };
  }

  async function loadTasks() {
    // KPI placeholders
    setKpi(els.kpiTasksMain, els.kpiTasksSub, '…', 'Loading');
    if (els.tasksList) renderEmpty(els.tasksList, 'Loading…');

    const data = await fetchJson('/api/tasks?scope=mine');
    const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
    state.tasks = tasks;

    const today = toYMD(new Date());
    const open = tasks.filter((t) => !isDoneStatus(t.status));
    const dueToday = open.filter((t) => t.dueDate && toYMD(t.dueDate) === today);
    const overdue = open.filter((t) => t.dueDate && toYMD(t.dueDate) < today);
    const high = open.filter((t) => /(high|urgent)/.test(norm(t.priority)));

    const avgCompletion = (() => {
      const vals = open
        .map((t) => (Number.isFinite(Number(t.completion)) ? Number(t.completion) : null))
        .filter((n) => typeof n === 'number');
      if (!vals.length) return null;
      return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    })();

    setKpi(
      els.kpiTasksMain,
      els.kpiTasksSub,
      `${dueToday.length} due today`,
      `Overdue: ${overdue.length} • High: ${high.length}${avgCompletion !== null ? ` • Avg: ${avgCompletion}%` : ''}`,
    );

    if (els.tasksSubtitle) {
      els.tasksSubtitle.textContent = `${open.length} open tasks`;
    }

    // Next tasks list = open tasks sorted by dueDate then createdTime
    const next = open
      .slice()
      .sort((a, b) => {
        const ad = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
        const bd = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
        if (ad !== bd) return ad - bd;
        return new Date(b.createdTime) - new Date(a.createdTime);
      });

    renderTasksList(next);
  }

  async function loadOrders() {
    setKpi(els.kpiOrdersMain, els.kpiOrdersSub, '…', 'Loading');
    if (els.ordersList) renderEmpty(els.ordersList, 'Loading…');

    const list = await fetchJson('/api/orders');
    const orders = Array.isArray(list) ? list : [];
    state.orders = orders;

    const groups = groupOrdersByMinute(orders);
    state.orderGroups = groups;

    const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalEstimate = 0;
    for (const g of groups) {
      const stage = orderComputeStage(g.products || []);
      counts[stage.idx] = (counts[stage.idx] || 0) + 1;
      totalEstimate += ordersEstimateTotal(g.products || []);
    }

    const openGroups = groups.filter((g) => orderComputeStage(g.products || []).idx < 5).length;
    setKpi(
      els.kpiOrdersMain,
      els.kpiOrdersSub,
      `${openGroups} open`,
      `In progress: ${counts[3]} • Shipped: ${counts[4]} • Total: ${fmtMoney(totalEstimate)}`,
    );

    if (els.ordersSubtitle) {
      els.ordersSubtitle.textContent = `${groups.length} order groups`;
    }

    renderOrdersList(groups);
  }

  async function loadRequested() {
    setKpi(els.kpiRequestedMain, els.kpiRequestedSub, '…', 'Loading');
    const list = await fetchJson('/api/orders/requested');
    const items = Array.isArray(list) ? list : [];
    state.requestedItems = items;
    const groups = groupRequested(items);
    state.requestedGroups = groups;

    const counts = { 'not-started': 0, received: 0, delivered: 0 };
    for (const g of groups) {
      const stage = reqComputeStage(g.items || []);
      counts[stage.tab] = (counts[stage.tab] || 0) + 1;
    }

    setKpi(
      els.kpiRequestedMain,
      els.kpiRequestedSub,
      `${counts['not-started']} pending`,
      `Received: ${counts.received} • Delivered: ${counts.delivered} • Total: ${groups.length}`,
    );
  }

  async function loadStock() {
    setKpi(els.kpiStockMain, els.kpiStockSub, '…', 'Loading');
    const list = await fetchJson('/api/stock');
    const items = Array.isArray(list) ? list : [];
    state.stock = items;

    let totalUnits = 0;
    let totalKits = 0;
    for (const it of items) {
      const q = Number(it?.quantity || 0);
      totalUnits += Number.isFinite(q) ? q : 0;

      const kitQty = Number(it?.oneKitQuantity || 0);
      if (Number.isFinite(kitQty) && kitQty > 0 && Number.isFinite(q)) {
        totalKits += Math.floor(q / kitQty);
      }
    }

    setKpi(
      els.kpiStockMain,
      els.kpiStockSub,
      `${items.length} items`,
      `Units: ${totalUnits} • Kits: ${totalKits}`,
    );
  }

  async function loadExpenses() {
    setKpi(els.kpiExpensesMain, els.kpiExpensesSub, '…', 'Loading');
    const data = await fetchJson('/api/expenses');
    const items = Array.isArray(data?.items) ? data.items : [];
    state.expenses = items;

    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    let inM = 0;
    let outM = 0;
    let balanceAll = 0;

    for (const it of items) {
      const cashIn = Number(it.cashIn || 0);
      const cashOut = Number(it.cashOut || 0);
      balanceAll += (cashIn - cashOut);

      if (it.date && String(it.date).slice(0, 7) === ym) {
        inM += cashIn;
        outM += cashOut;
      }
    }

    const balM = inM - outM;
    setKpi(
      els.kpiExpensesMain,
      els.kpiExpensesSub,
      `${fmtMoney(balM)} this month`,
      `In: ${fmtMoney(inM)} • Out: ${fmtMoney(outM)} • All-time: ${fmtMoney(balanceAll)}`,
    );
  }

  // ===== Search =====
  function wireSearch() {
    if (!els.search) return;
    els.search.addEventListener('input', () => {
      if (state.tasks?.length) {
        const open = state.tasks.filter((t) => !isDoneStatus(t.status));
        const next = open
          .slice()
          .sort((a, b) => {
            const ad = a.dueDate ? new Date(a.dueDate).getTime() : Number.POSITIVE_INFINITY;
            const bd = b.dueDate ? new Date(b.dueDate).getTime() : Number.POSITIVE_INFINITY;
            if (ad !== bd) return ad - bd;
            return new Date(b.createdTime) - new Date(a.createdTime);
          });
        renderTasksList(next);
      }
      if (state.orderGroups?.length) {
        renderOrdersList(state.orderGroups);
      }
    });
  }

  // ===== Init =====
  (async () => {
    try {
      setUpdatedNow();
      wireSearch();

      const { canTasks, canOrders, canRequested, canStock, canExpenses } = await loadAccount();
      setUpdatedNow();

      const jobs = [];
      if (canTasks) jobs.push(loadTasks().catch((e) => {
        console.error(e);
        setKpi(els.kpiTasksMain, els.kpiTasksSub, '—', 'Failed to load');
        renderEmpty(els.tasksList, 'Failed to load tasks');
      }));

      if (canOrders) jobs.push(loadOrders().catch((e) => {
        console.error(e);
        setKpi(els.kpiOrdersMain, els.kpiOrdersSub, '—', 'Failed to load');
        renderEmpty(els.ordersList, 'Failed to load orders');
      }));

      if (canRequested) jobs.push(loadRequested().catch((e) => {
        console.error(e);
        setKpi(els.kpiRequestedMain, els.kpiRequestedSub, '—', 'Failed to load');
      }));

      if (canStock) jobs.push(loadStock().catch((e) => {
        console.error(e);
        setKpi(els.kpiStockMain, els.kpiStockSub, '—', 'Failed to load');
      }));

      if (canExpenses) jobs.push(loadExpenses().catch((e) => {
        console.error(e);
        setKpi(els.kpiExpensesMain, els.kpiExpensesSub, '—', 'Failed to load');
      }));

      await Promise.allSettled(jobs);
      setUpdatedNow();
    } catch (e) {
      console.error(e);
      toast('error', 'Home', e.message || 'Failed to load Home');
      setUpdatedNow();
    }
  })();
});
