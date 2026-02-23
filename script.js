// public/js/script.js
// Current Orders page

document.addEventListener('DOMContentLoaded', () => {
  const ordersListDiv = document.getElementById('orders-list');
  const searchInput = document.getElementById('orderSearch');

  // This file is included on multiple pages, so only run when the Current Orders list exists.
  if (!ordersListDiv) return;

  // Bump when the /api/orders payload or UI rendering logic changes.
  // (Keeps sessionStorage from serving stale shapes.)
  const CACHE_KEY = 'ordersDataV6';
  const CACHE_TTL_MS = 30 * 1000;

  let allOrders = [];
  let filtered = [];

  // Map of rendered groups by their representative groupId
  let groupsById = new Map();

  // Modal (Order details)
  const modalOverlay = document.getElementById('coOrderModal');
  const modalCloseBtn = document.getElementById('coModalClose');
  // Actions (Download dropdown / Edit)
  const downloadMenuWrap = document.getElementById('coDownloadMenuWrap');
  const downloadMenuBtn = document.getElementById('coDownloadMenuBtn');
  const downloadMenuPanel = document.getElementById('coDownloadMenuPanel');
  const excelBtn = document.getElementById('coDownloadExcelBtn');
  const pdfBtn = document.getElementById('coDownloadPdfBtn');
  const editOrderBtn = document.getElementById('coEditOrderBtn');
  const modalEls = {
    statusTitle: document.getElementById('coModalStatusTitle'),
    statusSub: document.getElementById('coModalStatusSub'),
    reason: document.getElementById('coModalReason'),
    date: document.getElementById('coModalDate'),
    components: document.getElementById('coModalComponents'),
    totalPrice: document.getElementById('coModalTotalPrice'),
    items: document.getElementById('coModalItems'),
  };

  let lastFocusEl = null;
  let activeGroup = null; // currently opened order group in modal

  const norm = (s) => String(s || '').toLowerCase().trim();
  const toDate = (d) => new Date(d || 0);

  // Current Orders groups should be stable when editing/adding items.
  // The backend tracking endpoint groups items by Reason, so we mirror that here.
  function groupKeyForOrder(o) {
    const r = String(o?.reason || '').trim();
    return norm(r) || 'no reason';
  }

  const escapeHTML = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));

  // Parse user/Notion values as a finite number.
  // Important: Number(null) === 0, which is NOT what we want for optional Notion fields.
  function numOrNull(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const s = String(v).trim();
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  // Only allow http/https URLs to be opened from the UI
  function safeHttpUrl(url) {
    try {
      const raw = String(url || '').trim();
      if (!raw) return null;
      const u = new URL(raw, window.location.origin);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      return u.toString();
    } catch {
      return null;
    }
  }

  // Map Notion select/status colors to a pill background/foreground close to Notion labels
  function notionColorVars(notionColor) {
    const key = norm(String(notionColor || 'default').replace(/_background$/i, ''));
    const map = {
      default: { bg: '#E5E7EB', fg: '#374151', bd: '#D1D5DB' },
      gray: { bg: '#E5E7EB', fg: '#374151', bd: '#D1D5DB' },
      brown: { bg: '#F3E8E2', fg: '#6B4F3A', bd: '#E7D3C8' },
      orange: { bg: '#FFEDD5', fg: '#9A3412', bd: '#FED7AA' },
      yellow: { bg: '#FEF3C7', fg: '#92400E', bd: '#FDE68A' },
      green: { bg: '#D1FAE5', fg: '#065F46', bd: '#A7F3D0' },
      blue: { bg: '#DBEAFE', fg: '#1D4ED8', bd: '#BFDBFE' },
      purple: { bg: '#EDE9FE', fg: '#6D28D9', bd: '#DDD6FE' },
      pink: { bg: '#FCE7F3', fg: '#BE185D', bd: '#FBCFE8' },
      red: { bg: '#FEE2E2', fg: '#B91C1C', bd: '#FECACA' },
    };
    return map[key] || map.default;
  }

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

  // Date-only (to show under the Reason on the card)
  function fmtDateOnly(createdTime) {
    const d = toDate(createdTime);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  function sortByNewest(list) {
    return (list || []).slice().sort((a, b) => toDate(b.createdTime) - toDate(a.createdTime));
  }

  // Build a display string for a group based on Notion "ID" (unique_id)
  // Examples:
  // - Single item: "ORD-95"
  // - Multiple items: "ORD-95 : ORD-98"
  function computeOrderIdRange(items) {
    const arr = Array.isArray(items) ? items : [];
    const withId = arr.filter((x) => x && x.orderId);
    if (withId.length === 0) return null;

    // Prefer numeric range if available and consistent
    const withNum = withId.filter(
      (x) => typeof x.orderIdNumber === 'number' && Number.isFinite(x.orderIdNumber)
    );

    const allHaveNum = withNum.length === withId.length;
    const prefixes = new Set(withNum.map((x) => String(x.orderIdPrefix || '').trim()));
    const samePrefix = allHaveNum && prefixes.size <= 1;

    if (samePrefix) {
      const prefix = (withNum[0]?.orderIdPrefix ? String(withNum[0].orderIdPrefix).trim() : '');
      const nums = withNum.map((x) => Number(x.orderIdNumber)).filter((n) => Number.isFinite(n));
      if (nums.length) {
        const min = Math.min(...nums);
        const max = Math.max(...nums);
        const from = prefix ? `${prefix}-${min}` : String(min);
        const to = prefix ? `${prefix}-${max}` : String(max);
        return from === to ? from : `${from} : ${to}`;
      }
    }

    // Fallback: earliest -> latest by createdTime
    const sorted = withId
      .slice()
      .sort((a, b) => toDate(a.createdTime) - toDate(b.createdTime));
    const from = sorted[0]?.orderId;
    const to = sorted[sorted.length - 1]?.orderId;
    if (!from) return null;
    return from === to ? from : `${from} : ${to}`;
  }

  // ===== Order status flow (as requested) =====
  const STATUS_FLOW = [
    { label: 'Order Placed', sub: 'Your order has been placed.' },
    { label: 'Under Supervision', sub: 'Your order is under supervision.' },
    { label: 'In progress', sub: 'We are preparing your order.' },
    { label: 'Shipped', sub: 'Your cargo is on delivery.' },
    { label: 'Arrived', sub: 'Your order has arrived.' },
  ];

  function statusToIndex(status) {
    const s = norm(status).replace(/[_-]+/g, ' ');

    // Most advanced statuses first
    if (/(arrived|delivered|received)/.test(s)) return 5;
    if (/(shipped|on the way|delivering|prepared)/.test(s)) return 4;
    if (/(in progress|inprogress|progress)/.test(s)) return 3;
    if (/(under supervision|supervision|review)/.test(s)) return 2;
    if (/(order placed|placed|pending|order received)/.test(s)) return 1;
    return 1;
  }

  function computeStage(items) {
    let bestIdx = 1;
    let bestColor = null;
    for (const it of items || []) {
      const i = statusToIndex(it?.status);
      if (i > bestIdx) {
        bestIdx = i;
        bestColor = it?.statusColor || null;
      } else if (i === bestIdx && !bestColor && it?.statusColor) {
        bestColor = it.statusColor;
      }
    }

    const safe = Math.min(5, Math.max(1, bestIdx));
    const meta = STATUS_FLOW[safe - 1] || STATUS_FLOW[0];
    return { idx: safe, label: meta.label, sub: meta.sub, color: bestColor };
  }

  function setProgress(idx) {
    const safe = Math.min(5, Math.max(1, Number(idx) || 1));
    for (let i = 1; i <= 5; i++) {
      const stepEl = document.getElementById(`coStep${i}`);
      if (!stepEl) continue;
      stepEl.classList.toggle('is-active', i <= safe);
      stepEl.classList.toggle('is-current', i === safe);
    }
    for (let i = 1; i <= 4; i++) {
      const connEl = document.getElementById(`coConn${i}`);
      if (!connEl) continue;
      connEl.classList.toggle('is-active', i < safe);
    }
  }

  function openOrderModal(group) {
    if (!modalOverlay || !group) return;

    activeGroup = group;

    const items = group.products || [];
    const stage = computeStage(items);

    // Populate header
    if (modalEls.statusTitle) modalEls.statusTitle.textContent = stage.label;
    if (modalEls.statusSub) modalEls.statusSub.textContent = stage.sub;

    // Qty logic (per latest request):
    // Compare Quantity Requested vs Quantity Progress.
    // - If equal (or Progress missing): show Requested only.
    // - If different: strike Requested and show Progress next to it.
    // For cost calculations, we use Progress when available, otherwise Requested.
    const effectiveQty = (x) => {
      const req = numOrNull(x?.quantityRequested);
      const requested = req !== null ? req : (numOrNull(x?.quantity) ?? 0);
      const progress = numOrNull(x?.quantityProgress);
      return progress !== null ? progress : requested;
    };

    // Meta
    const totalQty = items.reduce((sum, x) => sum + effectiveQty(x), 0);
    const estimateTotal = items.reduce(
      (sum, x) => sum + effectiveQty(x) * (Number(x.unitPrice) || 0),
      0,
    );

    // Reason is the group key (stable order grouping)
    const groupReason = String(group?.reason || items?.[0]?.reason || '—').trim() || '—';

    if (modalEls.reason) modalEls.reason.textContent = groupReason;
    if (modalEls.date) modalEls.date.textContent = fmtCreated(group.latestCreated) || '—';
    if (modalEls.components) modalEls.components.textContent = String(items.length);
    if (modalEls.totalPrice) modalEls.totalPrice.textContent = fmtMoney(estimateTotal);

    // Items list
    if (modalEls.items) {
      modalEls.items.innerHTML = '';
      if (!items.length) {
        modalEls.items.innerHTML = '<div class="muted">No items.</div>';
      } else {
        const frag = document.createDocumentFragment();
        for (const it of items) {
          // Requested vs Progress qty (see effectiveQty() above)
          const qtyRequested = numOrNull(it?.quantityRequested);
          const qtyBase = qtyRequested !== null ? qtyRequested : (numOrNull(it?.quantity) ?? 0);
          const qtyProgress = numOrNull(it?.quantityProgress);
          const qty = qtyProgress !== null ? qtyProgress : qtyBase;
          const unit = Number(it.unitPrice) || 0;
          const lineTotal = qty * unit;

          // Show old qty normally, and only strike it when Progress differs from Requested
          const showDiff = qtyProgress !== null && qtyProgress !== qtyBase;
          const qtyHTML = showDiff
            ? `<span class="sv-qty-diff"><span class="sv-qty-old">${escapeHTML(String(qtyBase))}</span><strong class="sv-qty-new">${escapeHTML(String(qtyProgress))}</strong></span>`
            : `<strong>${escapeHTML(String(qtyBase))}</strong>`;

          const safeUrl = safeHttpUrl(it.productUrl);
          const linkHTML = safeUrl
            ? `<a class="co-item-link" href="${escapeHTML(safeUrl)}" target="_blank" rel="noopener noreferrer" title="Open link" aria-label="Open component link"><i data-feather="external-link"></i></a>`
            : '';

          const approvalLabel = it.svApproval || it.status || '—';
          const approvalColor = it.svApprovalColor || it.statusColor;
          const sVars = notionColorVars(approvalColor);
          const sStyle = `--tag-bg:${sVars.bg};--tag-fg:${sVars.fg};--tag-border:${sVars.bd};`;

          const row = document.createElement('div');
          row.className = 'co-item';
          row.innerHTML = `
            <div class="co-item-left">
              <div class="co-item-title">
                <div class="co-item-name">${escapeHTML(it.productName || 'Unknown Product')}</div>
                ${linkHTML}
              </div>
              <div class="co-item-sub">Unit: ${escapeHTML(fmtMoney(unit))} · Total: ${escapeHTML(fmtMoney(lineTotal))}</div>
            </div>
            <div class="co-item-right">
              <div class="co-item-total">Qty: ${qtyHTML}</div>
              <div class="co-item-status" style="${sStyle}">${escapeHTML(approvalLabel)}</div>
            </div>
          `;
          frag.appendChild(row);
        }
        modalEls.items.appendChild(frag);
      }
    }

    // Progress
    setProgress(stage.idx);

    // Show
    lastFocusEl = document.activeElement;
    modalOverlay.classList.add('is-open');
    modalOverlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('co-modal-open');

    // Ensure feather icons are rendered (in case the modal was injected later)
    if (window.feather) window.feather.replace();

    if (modalCloseBtn) modalCloseBtn.focus();
  }

  function closeOrderModal() {
    if (!modalOverlay) return;

    // Ensure any open download dropdown is closed
    if (downloadMenuPanel) downloadMenuPanel.hidden = true;
    if (downloadMenuBtn) downloadMenuBtn.setAttribute('aria-expanded', 'false');

    modalOverlay.classList.remove('is-open');
    modalOverlay.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('co-modal-open');
    activeGroup = null;
    if (lastFocusEl && typeof lastFocusEl.focus === 'function') {
      lastFocusEl.focus();
    }
  }

  function toast(type, title, message) {
    if (window.UI?.toast) {
      window.UI.toast({ type, title, message });
      return;
    }
    // fallback
    alert([title, message].filter(Boolean).join('\n'));
  }

  // ---------- Export (Excel / PDF) ----------
  function groupOrderIds(g) {
    if (!g) return [];
    if (Array.isArray(g.orderIds) && g.orderIds.length) return g.orderIds.slice();
    const ids = (g.products || []).map((x) => x?.id).filter(Boolean);
    return ids;
  }

  async function downloadExcel(g) {
    const orderIds = groupOrderIds(g);
    if (!orderIds.length) return;

    if (excelBtn) {
      excelBtn.disabled = true;
      excelBtn.dataset.prevHtml = excelBtn.innerHTML;
      excelBtn.textContent = 'Preparing...';
    }

    try {
      const res = await fetch('/api/orders/export/excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ orderIds }),
      });

      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to export Excel');
      }

      const blob = await res.blob();
      const cd = res.headers.get('content-disposition') || '';
      const m = cd.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
      const filename = decodeURIComponent((m && (m[1] || m[2])) || 'orders.xlsx');

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast('success', 'Downloaded', 'Excel exported successfully.');
    } catch (e) {
      console.error(e);
      toast('error', 'Export failed', e?.message || 'Failed to export Excel');
    } finally {
      if (excelBtn) {
        excelBtn.disabled = false;
        const prev = excelBtn.dataset.prevHtml;
        if (prev) excelBtn.innerHTML = prev;
        else excelBtn.textContent = 'Download Excel';
      }
      if (window.feather) window.feather.replace();
    }
  }

  async function downloadPdf(g) {
    const orderIds = groupOrderIds(g);
    if (!orderIds.length) return;

    if (pdfBtn) {
      pdfBtn.disabled = true;
      pdfBtn.dataset.prevHtml = pdfBtn.innerHTML;
      pdfBtn.textContent = 'Preparing...';
    }

    try {
      const res = await fetch('/api/orders/export/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ orderIds }),
      });

      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to export PDF');
      }

      const blob = await res.blob();
      const cd = res.headers.get('content-disposition') || '';
      const m = cd.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
      const filename = decodeURIComponent((m && (m[1] || m[2])) || 'order.pdf');

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast('success', 'Downloaded', 'PDF downloaded.');
    } catch (e) {
      console.error(e);
      toast('error', 'Export failed', e?.message || 'Failed to export PDF');
    } finally {
      if (pdfBtn) {
        pdfBtn.disabled = false;
        const prev = pdfBtn.dataset.prevHtml;
        if (prev) pdfBtn.innerHTML = prev;
        else pdfBtn.textContent = 'Download PDF';
      }
      if (window.feather) window.feather.replace();
    }
  }

  // ---------- Edit Order (admin password) ----------
  async function initEditOrder(g) {
    const orderIds = groupOrderIds(g);
    if (!orderIds.length) return;

    // Prompt for admin password
    const adminPassword = window.prompt('Enter admin password to edit this order:');
    if (adminPassword === null) return; // cancelled

    const pwd = String(adminPassword || '').trim();
    if (!pwd) {
      toast('error', 'Password required', 'Please enter the admin password.');
      return;
    }

    if (editOrderBtn) {
      editOrderBtn.disabled = true;
      editOrderBtn.dataset.prevHtml = editOrderBtn.innerHTML;
      editOrderBtn.textContent = 'Checking...';
    }

    try {
      const res = await fetch('/api/orders/current/edit/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ orderIds, adminPassword: pwd }),
      });

      if (res.status === 401) {
        toast('error', 'Wrong password', 'Admin password is incorrect.');
        return;
      }

      if (res.status === 403) {
        const data = await res.json().catch(() => ({}));
        toast('error', 'Not allowed', data?.error || 'You are not allowed to edit this order.');
        return;
      }

      if (res.status === 404) {
        toast('error', 'Not found', 'Order not found.');
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to init edit');
      }

      // Close modal and go to edit page
      closeOrderModal();
      window.location.href = '/orders/new/products?edit=1';
    } catch (e) {
      console.error(e);
      toast('error', 'Error', e?.message || 'Failed to start editing');
    } finally {
      if (editOrderBtn) {
        editOrderBtn.disabled = false;
        const prev = editOrderBtn.dataset.prevHtml;
        if (prev) editOrderBtn.innerHTML = prev;
        else editOrderBtn.textContent = 'Edit';
      }
      if (window.feather) window.feather.replace();
    }
  }

    function buildGroups(list) {
    const sorted = sortByNewest(list);

    // Pick the most common original Reason text inside a group
    // (Handles accidental casing/spaces differences while keeping grouping stable).
    const pickPrimaryReason = (items) => {
      const counts = new Map();
      for (const it of items || []) {
        const r = String(it?.reason || '').trim() || 'No Reason';
        counts.set(r, (counts.get(r) || 0) + 1);
      }
      const arr = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
      return (arr[0] && arr[0][0]) ? arr[0][0] : 'No Reason';
    };

    const map = new Map();

    for (const o of sorted) {
      // Group by Reason instead of created time, so edits/additions stay within the same order.
      const key = groupKeyForOrder(o);
      let g = map.get(key);

      if (!g) {
        g = {
          timeKey: key,
          groupId: o.id, // representative id (newest item in group)
          latestCreated: o.createdTime,
          earliestCreated: o.createdTime,
          products: [],
          orderIds: [],
          reason: '—',
          reasons: [],
          orderIdRange: null,
          createdByName: o.createdByName || '',
        };
        map.set(key, g);
      }

      g.products.push(o);
      g.orderIds.push(o.id);

      if (!g.createdByName && o.createdByName) {
        g.createdByName = o.createdByName;
      }

      if (!g.latestCreated || toDate(o.createdTime) > toDate(g.latestCreated)) {
        g.latestCreated = o.createdTime;
        g.groupId = o.id;
      }
      if (!g.earliestCreated || toDate(o.createdTime) < toDate(g.earliestCreated)) {
        g.earliestCreated = o.createdTime;
      }
    }

    for (const g of map.values()) {
      // Ensure products are ordered by newest first inside the group
      g.products = sortByNewest(g.products);

      g.reason = pickPrimaryReason(g.products);
      g.reasons = [g.reason];

      // Card title should show the Notion "ID" range
      g.orderIdRange = computeOrderIdRange(g.products);
    }

    // Sort groups by time (newest activity first) while keeping items grouped by Reason.
    return Array.from(map.values()).sort((a, b) => {
      const dt = toDate(b.latestCreated) - toDate(a.latestCreated);
      if (dt !== 0) return dt;
      return norm(a.reason).localeCompare(norm(b.reason));
    });
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

    // Use the same "effective" quantity logic as the modal (Progress overrides Requested when present).
    const effectiveQty = (x) => {
      const req = numOrNull(x?.quantityRequested);
      const requested = req !== null ? req : (numOrNull(x?.quantity) ?? 0);
      const progress = numOrNull(x?.quantityProgress);
      return progress !== null ? progress : requested;
    };

    // "Components price" = total cost of all items (qty * unitPrice)
    const estimateTotal = items.reduce(
      (sum, x) => sum + effectiveQty(x) * (Number(x.unitPrice) || 0),
      0,
    );

    // "NUMBERX" on the card should represent the number of components/items, not total quantity
    const componentsCount = itemsCount;

    const created = fmtDateOnly(group.latestCreated);
    const stage = computeStage(items);

    const statusVars = notionColorVars(stage.color);
    const statusStyle = `--tag-bg:${statusVars.bg};--tag-fg:${statusVars.fg};--tag-border:${statusVars.bd};`;

    const title = escapeHTML(group.orderIdRange || group.reason);

    // Under the title we show the date (per requested mapping)
    const sub = created ? escapeHTML(created) : '—';

    // Keep total price for the Estimate section, but show the Reason under the date
    const componentsPrice = fmtMoney(estimateTotal);
    const createdBy = String(group.reason || '').trim();

    const thumbLabel = String(group.orderIdRange || group.reason || '?').trim();
    const thumbHTML = first.productImage
      ? `<img src="${escapeHTML(first.productImage)}" alt="${escapeHTML(first.productName || thumbLabel)}" loading="lazy" />`
      : `<div class="co-thumb__ph">${escapeHTML(thumbLabel.slice(0, 2).toUpperCase())}</div>`;

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
          <div class="co-createdby">${escapeHTML(createdBy || '—')}</div>
        </div>

        <div class="co-qty">x${Number.isFinite(componentsCount) ? componentsCount : 0}</div>
      </div>

      <div class="co-divider"></div>

      <div class="co-bottom">
        <div class="co-est">
          <div class="co-est-label">Estimate Total</div>
          <div class="co-est-value">${componentsPrice}</div>
        </div>

        <div class="co-actions">
          <span class="co-status-btn" style="${statusStyle}">${escapeHTML(stage.label)}</span>
          <span class="co-right-ico" aria-hidden="true"><i data-feather="percent"></i></span>
        </div>
      </div>
    `;

    card.addEventListener('click', () => openOrderModal(group));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openOrderModal(group);
      }
    });

    return card;
  }

  function displayOrders(list) {
    ordersListDiv.innerHTML = '';

    const groups = buildGroups(list);
    groupsById = new Map((groups || []).map((g) => [g.groupId, g]));
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
    ordersListDiv.innerHTML = `
      <div class="modern-loading" role="status" aria-live="polite">
        <div class="modern-loading__spinner" aria-hidden="true"></div>
        <div class="modern-loading__text">
          Loading orders
          <span class="modern-loading__dots" aria-hidden="true"><span></span><span></span><span></span></span>
        </div>
      </div>
    `;
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
      if (!q) {
        filtered = base.slice();
        displayOrders(filtered);
        return;
      }

      // Keep whole orders together: if ANY item matches, include ALL items in that Reason-group.
      const matchedKeys = new Set();
      for (const o of base) {
        if (
          norm(o.reason).includes(q) ||
          norm(o.productName).includes(q) ||
          norm(o.orderId).includes(q)
        ) {
          matchedKeys.add(groupKeyForOrder(o));
        }
      }

      filtered = base.filter((o) => matchedKeys.has(groupKeyForOrder(o)));
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

  // Modal wiring
  if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeOrderModal);
  if (modalOverlay) {
    modalOverlay.addEventListener('click', (e) => {
      if (e.target === modalOverlay) closeOrderModal();
    });
  }

  // Download dropdown (modal)
  const closeDownloadMenu = () => {
    if (!downloadMenuPanel) return;
    downloadMenuPanel.hidden = true;
    if (downloadMenuBtn) downloadMenuBtn.setAttribute('aria-expanded', 'false');
  };

  const openDownloadMenu = () => {
    if (!downloadMenuPanel) return;
    downloadMenuPanel.hidden = false;
    if (downloadMenuBtn) downloadMenuBtn.setAttribute('aria-expanded', 'true');
    if (window.feather) window.feather.replace();
  };

  const toggleDownloadMenu = () => {
    if (!downloadMenuPanel) return;
    if (downloadMenuPanel.hidden) openDownloadMenu();
    else closeDownloadMenu();
  };

  if (downloadMenuBtn && downloadMenuPanel && downloadMenuWrap) {
    downloadMenuBtn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleDownloadMenu();
    });

    // Click outside closes
    document.addEventListener('click', (e) => {
      if (downloadMenuPanel.hidden) return;
      if (downloadMenuWrap.contains(e.target)) return;
      closeDownloadMenu();
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (downloadMenuPanel && !downloadMenuPanel.hidden) {
      e.preventDefault();
      closeDownloadMenu();
      return;
    }
    if (modalOverlay?.classList.contains('is-open')) {
      e.preventDefault();
      closeOrderModal();
    }
  });

  // Action buttons
  excelBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    closeDownloadMenu();
    if (activeGroup) downloadExcel(activeGroup);
  });
  pdfBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    closeDownloadMenu();
    if (activeGroup) downloadPdf(activeGroup);
  });
  editOrderBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    if (activeGroup) initEditOrder(activeGroup);
  });
});
