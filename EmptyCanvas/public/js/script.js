// public/js/script.js
// Current Orders page

document.addEventListener('DOMContentLoaded', () => {
  const ordersListDiv = document.getElementById('orders-list');
  const searchInput = document.getElementById('orderSearch');

  // This file is included on multiple pages, so only run when the Current Orders list exists.
  if (!ordersListDiv) return;

  const CACHE_KEY = 'ordersDataV3';
  const CACHE_TTL_MS = 30 * 1000;

  let allOrders = [];
  let filtered = [];

  const norm = (s) => String(s || '').toLowerCase().trim();
  const toDate = (d) => new Date(d || 0);

  const escapeHTML = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));

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
    if (moneyFmt) return moneyFmt.format(safe);
    return `£${safe.toFixed(2)}`;
  }

  function fmtCreated(createdTime) {
    const d = toDate(createdTime);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function sortByNewest(list) {
    return (list || []).slice().sort((a, b) => toDate(b.createdTime) - toDate(a.createdTime));
  }

  function computeStage(items) {
    const statuses = (items || []).map((x) => norm(x.status));
    const deliveredSet = new Set(['received', 'delivered']);
    const onTheWaySet = new Set(['prepared', 'on the way', 'ontheway', 'on_the_way', 'shipped', 'delivering']);

    if (statuses.length > 0 && statuses.every((s) => deliveredSet.has(s))) {
      return { step: 3, label: 'Delivered', pill: 'co-pill is-muted' };
    }

    if (statuses.some((s) => onTheWaySet.has(s))) {
      return { step: 2, label: 'On the way', pill: 'co-pill is-outline' };
    }
    return { step: 1, label: 'Order Received', pill: 'co-pill' };
  }

  function buildGroups(list) {
    const sorted = sortByNewest(list);
    const map = new Map();

    for (const o of sorted) {
      const key = o.reason || 'No Reason';
      let g = map.get(key);
      if (!g) {
        g = {
          reason: key,
          groupId: o.id, // newest order page id for this reason
          latestCreated: o.createdTime,
          products: [],
        };
        map.set(key, g);
      }
      g.products.push(o);

      if (!g.latestCreated || toDate(o.createdTime) > toDate(g.latestCreated)) {
        g.latestCreated = o.createdTime;
        g.groupId = o.id;
      }
    }

    return Array.from(map.values()).sort((a, b) => toDate(b.latestCreated) - toDate(a.latestCreated));
  }

  function goToTracking(groupId) {
    if (!groupId) return;
    const url = `/orders/tracking?groupId=${encodeURIComponent(groupId)}`;
    window.location.href = url;
  }

  function renderCard(group) {
    const items = group.products || [];
    const first = items[0] || {};

    const itemsCount = items.length;
    const totalQty = items.reduce((sum, x) => sum + (Number(x.quantity) || 0), 0);
    const estimateTotal = items.reduce((sum, x) => sum + (Number(x.quantity) || 0) * (Number(x.unitPrice) || 0), 0);

    const created = fmtCreated(group.latestCreated);
    const stage = computeStage(items);

    const title = escapeHTML(group.reason);

    let sub = first.productName ? escapeHTML(first.productName) : '—';
    if (itemsCount > 1) sub += ` <span class="co-more">+${itemsCount - 1} more</span>`;

    const unitPrice = fmtMoney(first.unitPrice);

    const thumbHTML = first.productImage
      ? `<img src="${escapeHTML(first.productImage)}" alt="${escapeHTML(first.productName || group.reason)}" loading="lazy" />`
      : `<div class="co-thumb__ph">${escapeHTML(String(group.reason || '?').trim().slice(0, 2).toUpperCase())}</div>`;

    const card = document.createElement('article');
    card.className = 'co-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.dataset.groupId = group.groupId;

    card.innerHTML = `
      <div class="co-top">
        <div class="co-thumb">${thumbHTML}</div>

        <div class="co-main">
          <div class="co-title">${title}</div>
          <div class="co-sub">${sub}</div>
          <div class="co-price">${unitPrice}</div>
        </div>

        <div class="co-qty">x${Number.isFinite(totalQty) ? totalQty : 0}</div>
      </div>

      <div class="co-divider"></div>

      <div class="co-bottom">
        <div class="co-est">
          <div class="co-est-label">Estimate Total</div>
          <div class="co-est-value">${fmtMoney(estimateTotal)}</div>
          <div class="co-meta">Created: ${escapeHTML(created)} • ${itemsCount} item${itemsCount === 1 ? '' : 's'}</div>
        </div>

        <div class="co-actions">
          <span class="${stage.pill}">${escapeHTML(stage.label)}</span>
          <span class="co-right-ico" aria-hidden="true"><i data-feather="percent"></i></span>
        </div>
      </div>
    `;

    card.addEventListener('click', () => goToTracking(group.groupId));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        goToTracking(group.groupId);
      }
    });

    return card;
  }

  function displayOrders(list) {
    ordersListDiv.innerHTML = '';

    const groups = buildGroups(list);
    if (!groups || groups.length === 0) {
      ordersListDiv.innerHTML = '<p>No orders found.</p>';
      return;
    }

    const frag = document.createDocumentFragment();
    for (const g of groups) frag.appendChild(renderCard(g));
    ordersListDiv.appendChild(frag);

    if (window.feather) window.feather.replace();
  }

  async function fetchAndDisplayOrders() {
    ordersListDiv.innerHTML = '<p><i class="loading-icon" data-feather="loader"></i> Loading orders...</p>';
    if (window.feather) window.feather.replace();

    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && Array.isArray(parsed.data) && (Date.now() - (parsed.ts || 0) < CACHE_TTL_MS)) {
          allOrders = sortByNewest(parsed.data);
          filtered = allOrders.slice();
          displayOrders(filtered);
          return;
        }
        sessionStorage.removeItem(CACHE_KEY);
      }
    } catch {
      // ignore cache parse errors
    }

    try {
      const response = await fetch('/api/orders', { credentials: 'include', cache: 'no-store' });
      if (response.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch orders');
      }

      const data = await response.json();
      allOrders = sortByNewest(Array.isArray(data) ? data : []);
      filtered = allOrders.slice();
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: allOrders }));
      displayOrders(filtered);
    } catch (error) {
      console.error('Error fetching orders:', error);
      ordersListDiv.innerHTML = `<p style="color: red;">Error: ${escapeHTML(error.message)}</p>`;
    }
  }

  function setupSearch() {
    if (!searchInput) return;

    function runFilter() {
      const q = norm(searchInput.value);
      const base = allOrders;
      filtered = q
        ? base.filter((o) => norm(o.reason).includes(q) || norm(o.productName).includes(q))
        : base.slice();
      displayOrders(filtered);
    }

    searchInput.addEventListener('input', runFilter);
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && searchInput.value) {
        searchInput.value = '';
        runFilter();
      }
    });
  }

  fetchAndDisplayOrders();
  setupSearch();
});
