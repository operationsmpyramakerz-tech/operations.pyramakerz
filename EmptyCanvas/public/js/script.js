// public/js/script.js
document.addEventListener('DOMContentLoaded', function () {
  const ordersListDiv   = document.getElementById('orders-list');
  const orderModal      = document.getElementById('orderModal');
  const orderModalBody  = document.getElementById('orderModalBody');
  const orderModalClose = document.getElementById('orderModalClose');
  const searchInput     = document.getElementById('orderSearch');

  const CACHE_KEY = 'ordersDataV2';
  const CACHE_TTL_MS = 30 * 1000;

  let allOrders = [];
  let filtered  = [];

  const norm = (s) => String(s || '').toLowerCase().trim();
  const toDate = (d) => new Date(d || 0);
  const escapeHTML = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function sortByNewest(list) {
    return (list || []).slice().sort((a, b) => toDate(b.createdTime) - toDate(a.createdTime));
  }

  function displayOrders(orders) {
    if (!ordersListDiv) return;
    ordersListDiv.innerHTML = '';
    if (!orders || orders.length === 0) {
      ordersListDiv.innerHTML = '<p>No orders found.</p>';
      return;
    }

    // اجمع حسب السبب واحسب أحدث تاريخ لكل جروب
    const map = new Map();
    for (const o of orders) {
      const key = o.reason || 'No Reason';
      let g = map.get(key);
      if (!g) {
        g = { reason: key, latestCreated: o.createdTime, products: [] };
        map.set(key, g);
      }
      g.products.push(o);
      if (!g.latestCreated || toDate(o.createdTime) > toDate(g.latestCreated)) {
        g.latestCreated = o.createdTime;
      }
    }

    const groups = Array.from(map.values()).sort(
      (a, b) => toDate(b.latestCreated) - toDate(a.latestCreated)
    );

    const frag = document.createDocumentFragment();
    groups.forEach(group => {
      const card = document.createElement('div');
      card.className = 'order-card';
      const createdTime = new Date(group.latestCreated).toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      });
      card.innerHTML = `<h3>${escapeHTML(group.reason)}</h3><p class="order-time">Created: ${createdTime}</p>`;
      card.addEventListener('click', () => openOrderModal(group));
      frag.appendChild(card);
    });
    ordersListDiv.appendChild(frag);
  }

  async function fetchAndDisplayOrders() {
    if (!ordersListDiv) return;

    try {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && Array.isArray(parsed.data) && (Date.now() - (parsed.ts || 0) < CACHE_TTL_MS)) {
          allOrders = sortByNewest(parsed.data);
          filtered  = allOrders.slice();
          displayOrders(filtered);
          return;
        } else {
          sessionStorage.removeItem(CACHE_KEY);
        }
      }
    } catch {}

    try {
      const response = await fetch('/api/orders', { credentials: 'include', cache: 'no-store' });
      if (response.status === 401) { window.location.href = '/login'; return; }
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to fetch orders');
      }
      const data = await response.json();
      allOrders = sortByNewest(Array.isArray(data) ? data : []);
      filtered  = allOrders.slice();
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data: allOrders }));
      displayOrders(filtered);
    } catch (error) {
      console.error('Error fetching orders:', error);
      ordersListDiv.innerHTML = `<p style="color: red;">Error: ${error.message}</p>`;
    }
  }

  // مودال احترافي لعناصر الأوردر
  function openOrderModal(orderGroup) {
    if (!orderModalBody || !orderModal) return;

    orderModalBody.innerHTML = `
      <div class="order-modal__head">
        <div class="order-modal__title">
          <i data-feather="clipboard"></i>
          <span>${escapeHTML(orderGroup.reason)}</span>
        </div>
      </div>
      <div class="order-modal__list" id="orderModalList"></div>
    `;

    // انقل زرار X جوّه الهيدر علشان يتمركز رأسيًا
    const headEl = orderModalBody.querySelector('.order-modal__head');
    if (headEl && orderModalClose) {
      orderModalClose.classList.add('close-btn--in-head');
      headEl.appendChild(orderModalClose); // نقل العنصر داخل الهيدر
    }

    const list = document.getElementById('orderModalList');

    orderGroup.products.forEach(product => {
      const item = document.createElement('div');
      item.className = 'order-item-card';
item.innerHTML = `
  <div class="order-item__left">
    <span class="badge badge--name" title="${escapeHTML(product.productName)}">
      ${escapeHTML(product.productName)}
    </span>
  </div>

  <div class="order-item__right">
    <span class="badge badge--qty">Qty: ${Number(product.quantity) || 0}</span>

    ${
      product.status === 'Received'
        ? `<span class="pill pill-green">Received</span>`
        : `<span class="pill pill-muted">Not Received</span>`
    }
  </div>
`;

      list.appendChild(item);
    });

    orderModal.style.display = 'flex';
    if (window.feather) feather.replace();
  }

  function closeOrderModal() {
    if (!orderModal) return;
    orderModal.style.display = 'none';
    // امسح الكاش علشان نرجّع نحمّل أحدث بيانات
    sessionStorage.removeItem(CACHE_KEY);
    fetchAndDisplayOrders();
  }

  async function markAsReceived(event) {
    event.stopPropagation();
    const button = event.target;
    const orderPageId = button.dataset.orderId;
    if (!orderPageId || button.disabled) return;

    button.disabled = true;
    button.textContent = 'Updating...';
    try {
      const response = await fetch('/api/update-received', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderPageId }),
        credentials: 'include',
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.error || 'Server error');
      button.textContent = 'Received';
      button.classList.add('received');
    } catch (error) {
      console.error('Failed to update status:', error);
      alert('Failed to update status. Please try again.');
      button.textContent = 'Mark as Received';
      button.disabled = false;
    }
  }

  function setupSearch() {
    if (!searchInput) return;
    function runFilter() {
      const q = norm(searchInput.value);
      const base = allOrders;
      filtered = q
        ? base.filter(o =>
            norm(o.reason).includes(q) ||
            norm(o.productName).includes(q)
          )
        : base.slice();
      displayOrders(filtered);
    }
    searchInput.addEventListener('input', runFilter);
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && searchInput.value) {
        searchInput.value = ''; runFilter();
      }
    });
  }

  if (ordersListDiv) {
    fetchAndDisplayOrders();
    setupSearch();

    if (orderModal && orderModalClose) {
      orderModalClose.addEventListener('click', closeOrderModal);
      orderModal.addEventListener('click', (e) => { if (e.target === orderModal) closeOrderModal(); });
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeOrderModal(); });
    }
  }
});
