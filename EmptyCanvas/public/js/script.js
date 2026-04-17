// public/js/script.js
// Current Orders page

document.addEventListener('DOMContentLoaded', () => {
  const ordersListDiv = document.getElementById('orders-list');
  const searchInput = document.getElementById('orderSearch');
  const tabsWrap = document.getElementById('coTabs');
  const typeFilterWrap = document.getElementById('coTypeFilter');
  const typeFilterBtn = document.getElementById('coTypeFilterBtn');
  const typeFilterPanel = document.getElementById('coTypeFilterPanel');
  const typeFilterDot = document.getElementById('coTypeFilterDot');

  // This file is included on multiple pages, so only run when the Current Orders list exists.
  if (!ordersListDiv) return;

  // Prevent accidental double-execution (e.g. if the script is injected/loaded twice).
  // Double execution can cause racing fetches and UI flicker (orders appear then disappear)
  // and can also break card click behavior.
  if (window.__CURRENT_ORDERS_UI_V7_LOADED__) return;
  window.__CURRENT_ORDERS_UI_V7_LOADED__ = true;

  const CACHE_KEY = 'ordersDataV7';
  const CACHE_TTL_MS = 30 * 1000;

  let allOrders = [];
  let filtered = [];
  let currentStatusTab = 'all';
  let currentTypeFilter = 'all';

  // Map of rendered groups by their representative groupId
  let groupsById = new Map();

  // ===== Card click delegation (extra safety) =====
  // If, for any reason, individual card listeners are lost (DOM re-render, library replacing
  // nodes, etc.), this keeps the "tap on card -> open modal" behavior working.
  function openModalFromCardEl(cardEl) {
    if (!cardEl) return;
    const gid = cardEl?.dataset?.groupId;
    if (!gid) return;
    const g = groupsById.get(gid);
    if (g) openOrderModal(g);
  }

  ordersListDiv.addEventListener('click', (e) => {
    // If a card handler already handled this click, don't double-open.
    if (e.defaultPrevented) return;

    const card = e.target?.closest?.('.co-card');
    if (!card || !ordersListDiv.contains(card)) return;

    // Ignore clicks on interactive elements inside the card (future-proof).
    const interactive = e.target?.closest?.('a, button, input, select, textarea');
    if (interactive && card.contains(interactive)) return;

    e.preventDefault();
    openModalFromCardEl(card);
  });

  ordersListDiv.addEventListener('keydown', (e) => {
    if (e.defaultPrevented) return;
    if (e.key !== 'Enter' && e.key !== ' ') return;

    const card = e.target?.closest?.('.co-card');
    if (!card || !ordersListDiv.contains(card)) return;

    e.preventDefault();
    openModalFromCardEl(card);
  });

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

  // Sub-modal (Edit password)
  const editPwdModal = document.getElementById('coEditPwdModal');
  const editPwdCloseBtn = document.getElementById('coEditPwdClose');
  const editPwdCancelBtn = document.getElementById('coEditPwdCancel');
  const editPwdConfirmBtn = document.getElementById('coEditPwdConfirm');
  const editPwdInput = document.getElementById('coEditPwdInput');
  const editPwdError = document.getElementById('coEditPwdError');
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
  let editPwdLastFocusEl = null;
  let pendingEditOrderIds = null;

  const norm = (s) => String(s || '').toLowerCase().trim();
  const toDate = (d) => new Date(d || 0);

  // Safely parse a value into a finite number.
  // IMPORTANT: Do NOT treat null/undefined as 0.
  // (Number(null) === 0) which previously caused the UI to briefly show a struck-through
  // requested quantity with a "0" progress until a refresh.
  function asFiniteNumber(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string') {
      const t = v.trim();
      if (!t) return null;
      const n = Number(t);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }

  // Current Orders groups should be stable when editing/adding items.
  // Prefer grouping by the new numeric Order - ID (shared across all components in the same order).
  // Fallback (legacy rows): group by Reason.
  function groupKeyForOrder(o) {
    const n = Number(o?.orderIdNumber);
    if (Number.isFinite(n)) return `ord:${n}`;

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

  function orderTypeMeta(type, notionColor) {
    const key = String(type || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (key === 'requestproducts') {
      return { label: 'Request Products', icon: 'shopping-cart', bg: '#DCFCE7', fg: '#166534', bd: '#86EFAC' };
    }
    if (key === 'withdrawproducts') {
      return { label: 'Withdraw Products', icon: 'log-out', bg: '#FEE2E2', fg: '#B91C1C', bd: '#FECACA' };
    }
    if (key === 'requestmaintenance') {
      return { label: 'Request Maintenance', icon: 'tool', bg: '#FEF3C7', fg: '#92400E', bd: '#FDE68A' };
    }
    const fallback = notionColorVars(notionColor);
    return {
      label: String(type || '').trim() || 'Order',
      icon: 'package',
      bg: fallback.bg,
      fg: fallback.fg,
      bd: fallback.bd,
    };
  }

  function orderTypeThumbMarkup(type, notionColor) {
    const meta = orderTypeMeta(type, notionColor);
    const style = `--co-thumb-bg:${meta.bg};--co-thumb-fg:${meta.fg};--co-thumb-border:${meta.bd};`;
    return `<div class="co-thumb co-thumb--order-type" style="${style}" title="${escapeHTML(meta.label)}" aria-label="${escapeHTML(meta.label)}"><i data-feather="${meta.icon}"></i></div>`;
  }

  function orderTypeSubtitle(type, notionColor, fallback = '—') {
    const meta = orderTypeMeta(type, notionColor);
    return meta.label && meta.label !== 'Order' ? meta.label : fallback;
  }

  function orderTypeKey(type) {
    return String(type || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  function normalizeCurrentStatusTab(value) {
    const raw = norm(String(value || '').replace(/_/g, '-'));
    return new Set(['all', 'active', 'shipped', 'arrived']).has(raw) ? raw : 'all';
  }

  function readStatusTabFromUrl() {
    try {
      return normalizeCurrentStatusTab(new URL(window.location.href).searchParams.get('tab'));
    } catch {
      return 'all';
    }
  }

  function normalizeTypeFilterValue(value) {
    return orderTypeKey(value) || 'all';
  }

  function readTypeFilterFromUrl() {
    try {
      return normalizeTypeFilterValue(new URL(window.location.href).searchParams.get('type'));
    } catch {
      return 'all';
    }
  }

  function updateCurrentOrdersToolbarUrl() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', currentStatusTab);
      if (currentTypeFilter && currentTypeFilter !== 'all') url.searchParams.set('type', currentTypeFilter);
      else url.searchParams.delete('type');
      window.history.replaceState({}, '', url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : ''));
    } catch {}
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

    const items = (group.products || []).slice().sort((a, b) =>
      String(a?.productName || '').localeCompare(String(b?.productName || ''), undefined, {
        sensitivity: 'base',
        numeric: true,
      }),
    );
    const stage = computeStage(items);

    // Populate header
    if (modalEls.statusTitle) modalEls.statusTitle.textContent = stage.label;
    if (modalEls.statusSub) {
      const first = items[0] || {};
      modalEls.statusSub.textContent = orderTypeSubtitle(
        group?.orderType || first.orderType,
        group?.orderTypeColor || first.orderTypeColor,
        stage.sub,
      );
    }

    // In Current Orders we show Qty based on:
    // - Quantity Requested (original request)
    // - Quantity Progress (current progress)
    // If Quantity Requested === Quantity Progress -> show requested normally
    // If different -> strike requested and show progress next to it
    const effectiveQty = (x) => {
      const requested =
        asFiniteNumber(x?.quantityRequested) ??
        asFiniteNumber(x?.quantity) ??
        0;

      const progress = asFiniteNumber(x?.quantityProgress);
      return progress !== null && progress !== undefined ? progress : requested;
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
          // Base qty = original requested (if provided), else fall back to the qty returned.
          const qtyRequested =
            asFiniteNumber(it?.quantityRequested) ??
            asFiniteNumber(it?.quantity) ??
            0;

          const qtyProgress = asFiniteNumber(it?.quantityProgress);

          const qty = qtyProgress !== null && qtyProgress !== undefined ? qtyProgress : qtyRequested;
          const unit = Number(it.unitPrice) || 0;
          const lineTotal = qty * unit;

          // If Quantity Progress differs from Quantity Requested, strike requested and show progress next to it
          const showDiff = qtyProgress !== null && qtyProgress !== undefined && qtyProgress !== qtyRequested;
          const qtyHTML = showDiff
            ? `<span class="sv-qty-diff"><span class="sv-qty-old">${escapeHTML(String(qtyRequested))}</span><strong class="sv-qty-new">${escapeHTML(String(qtyProgress))}</strong></span>`
            : `<strong>${escapeHTML(String(qtyRequested))}</strong>`;

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

    // If the edit password modal is open, close it first
    closeEditPasswordModal({ restoreFocus: false });

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

  // ---------- Edit password sub-modal helpers ----------
  function setEditPwdError(message) {
    if (!editPwdError) return;
    editPwdError.textContent = String(message || '');
  }

  function isEditPwdOpen() {
    return !!editPwdModal && editPwdModal.classList.contains('is-open');
  }

  function openEditPasswordModal(orderIds) {
    // Fallback to prompt if the sub-modal markup isn't present
    if (!editPwdModal || !editPwdInput || !editPwdConfirmBtn || !editPwdCancelBtn) {
      const adminPassword = window.prompt('Enter admin password to edit this order:');
      if (adminPassword === null) return null;
      const pwd = String(adminPassword || '').trim();
      return pwd || null;
    }

    pendingEditOrderIds = Array.isArray(orderIds) ? orderIds.slice() : null;
    setEditPwdError('');
    editPwdInput.value = '';

    // Reset button states
    editPwdConfirmBtn.disabled = false;
    editPwdCancelBtn.disabled = false;
    if (editPwdCloseBtn) editPwdCloseBtn.disabled = false;

    editPwdLastFocusEl = document.activeElement;
    editPwdModal.hidden = false;
    editPwdModal.classList.add('is-open');
    editPwdModal.setAttribute('aria-hidden', 'false');

    // Focus input
    window.requestAnimationFrame(() => {
      try {
        editPwdInput.focus();
      } catch {}
    });

    return true;
  }

  function closeEditPasswordModal(opts = {}) {
    const { restoreFocus = true } = opts || {};
    if (!editPwdModal) return;
    if (!isEditPwdOpen()) return;

    editPwdModal.classList.remove('is-open');
    editPwdModal.setAttribute('aria-hidden', 'true');
    editPwdModal.hidden = true;
    pendingEditOrderIds = null;
    setEditPwdError('');

    if (restoreFocus && editPwdLastFocusEl && typeof editPwdLastFocusEl.focus === 'function') {
      try {
        editPwdLastFocusEl.focus();
      } catch {}
    }
  }

  async function submitEditPassword() {
    const orderIds = Array.isArray(pendingEditOrderIds) ? pendingEditOrderIds.slice() : [];
    if (!orderIds.length) {
      closeEditPasswordModal();
      return;
    }

    const pwd = String(editPwdInput?.value || '').trim();
    if (!pwd) {
      setEditPwdError('Password is required.');
      try {
        editPwdInput?.focus();
      } catch {}
      return;
    }

    setEditPwdError('');

    // Disable sub-modal actions
    if (editPwdConfirmBtn) {
      editPwdConfirmBtn.disabled = true;
      editPwdConfirmBtn.dataset.prevHtml = editPwdConfirmBtn.innerHTML;
      editPwdConfirmBtn.textContent = 'Checking...';
    }
    if (editPwdCancelBtn) editPwdCancelBtn.disabled = true;
    if (editPwdCloseBtn) editPwdCloseBtn.disabled = true;

    try {
      const res = await fetch('/api/orders/current/edit/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ orderIds, adminPassword: pwd }),
      });

      if (res.status === 401) {
        setEditPwdError('Wrong password. Please try again.');
        editPwdInput.value = '';
        try {
          editPwdInput.focus();
        } catch {}
        return;
      }

      if (res.status === 403) {
        const data = await res.json().catch(() => ({}));
        toast('error', 'Not allowed', data?.error || 'You are not allowed to edit this order.');
        closeEditPasswordModal();
        return;
      }

      if (res.status === 404) {
        toast('error', 'Not found', 'Order not found.');
        closeEditPasswordModal();
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to init edit');
      }

      const data = await res.json().catch(() => ({}));
      const editUrl = new URL('/orders/new/products', window.location.origin);
      editUrl.searchParams.set('edit', '1');
      if (data?.orderType) editUrl.searchParams.set('type', String(data.orderType));

      // Success: close modals and go to edit page
      closeEditPasswordModal({ restoreFocus: false });
      closeOrderModal();
      window.location.href = `${editUrl.pathname}${editUrl.search}`;
    } catch (e) {
      console.error(e);
      setEditPwdError(e?.message || 'Failed to start editing.');
    } finally {
      // Re-enable sub-modal actions
      if (editPwdConfirmBtn) {
        editPwdConfirmBtn.disabled = false;
        const prev = editPwdConfirmBtn.dataset.prevHtml;
        if (prev) editPwdConfirmBtn.innerHTML = prev;
        else editPwdConfirmBtn.textContent = 'Continue';
      }
      if (editPwdCancelBtn) editPwdCancelBtn.disabled = false;
      if (editPwdCloseBtn) editPwdCloseBtn.disabled = false;
      if (window.feather) window.feather.replace();
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

    // Prefer the modern sub-modal; fallback to native prompt if missing
    const opened = openEditPasswordModal(orderIds);
    if (opened === null) return; // cancelled
    if (opened === true) return; // sub-modal opened (it will handle submission)

    // opened is a string password in fallback mode
    const pwd = String(opened || '').trim();
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

      const data = await res.json().catch(() => ({}));
      const editUrl = new URL('/orders/new/products', window.location.origin);
      editUrl.searchParams.set('edit', '1');
      if (data?.orderType) editUrl.searchParams.set('type', String(data.orderType));

      // Close modal and go to edit page
      closeOrderModal();
      window.location.href = `${editUrl.pathname}${editUrl.search}`;
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
          orderType: o.orderType || '',
          orderTypeColor: o.orderTypeColor || null,
        };
        map.set(key, g);
      }

      g.products.push(o);
      g.orderIds.push(o.id);

      if (!g.createdByName && o.createdByName) {
        g.createdByName = o.createdByName;
      }
      if (!g.orderType && o.orderType) {
        g.orderType = o.orderType;
      }
      if (!g.orderTypeColor && o.orderTypeColor) {
        g.orderTypeColor = o.orderTypeColor;
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

  function statusTabForGroup(group) {
    const stage = group?.stage || computeStage(group?.products || []);
    const idx = Number(stage?.idx) || 1;
    if (idx >= 5) return 'arrived';
    if (idx >= 4) return 'shipped';
    return 'active';
  }

  function groupTypeKey(group) {
    const first = (group?.products || [])[0] || {};
    return normalizeTypeFilterValue(group?.orderType || first.orderType);
  }

  function groupMatchesCurrentStatus(group) {
    if (currentStatusTab === 'all') return true;
    return statusTabForGroup(group) === currentStatusTab;
  }

  function groupMatchesCurrentType(group) {
    if (!currentTypeFilter || currentTypeFilter === 'all') return true;
    return groupTypeKey(group) === currentTypeFilter;
  }

  function groupMatchesSearch(group, query) {
    if (!query) return true;
    const hay = [
      group.orderIdRange || '',
      group.reason || '',
      ...(group.products || []).map((x) => x.productName || ''),
      ...(group.products || []).map((x) => x.reason || ''),
      ...(group.products || []).map((x) => x.orderId || ''),
      ...(group.products || []).map((x) => x.createdByName || ''),
    ].join(' ').toLowerCase();
    return hay.includes(query);
  }

  function setActiveStatusTabUI() {
    if (!tabsWrap) return;
    Array.from(tabsWrap.querySelectorAll('a.tab-portfolio')).forEach((a) => {
      const tab = normalizeCurrentStatusTab(a.dataset.tab || 'all');
      const active = tab === currentStatusTab;
      a.classList.toggle('active', active);
      a.classList.toggle('is-active', active);
      a.setAttribute('aria-selected', active ? 'true' : 'false');
    });
  }

  function getTypeFilterOptions(allGroups = []) {
    const scoped = (allGroups || []).filter((group) => groupMatchesCurrentStatus(group));
    const counts = new Map();
    for (const group of scoped) {
      const key = groupTypeKey(group);
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const defs = [
      { value: 'requestproducts', type: 'requestproducts' },
      { value: 'withdrawproducts', type: 'withdrawproducts' },
      { value: 'requestmaintenance', type: 'requestmaintenance' },
    ];

    return [{
      value: 'all',
      label: 'All Types',
      icon: 'layers',
      bg: '#F3F4F6',
      fg: '#111827',
      bd: '#E5E7EB',
      count: scoped.length,
    }].concat(defs.map((def) => {
      const meta = orderTypeMeta(def.type);
      return {
        value: def.value,
        label: meta.label,
        icon: meta.icon,
        bg: meta.bg,
        fg: meta.fg,
        bd: meta.bd,
        count: counts.get(def.value) || 0,
      };
    }));
  }

  function updateTypeFilterButtonState(options = getTypeFilterOptions()) {
    if (!typeFilterWrap || !typeFilterBtn) return;
    const active = options.find((opt) => opt.value === currentTypeFilter) || options[0];
    const isFiltered = !!active && active.value !== 'all';
    typeFilterWrap.classList.toggle('is-filtered', isFiltered);
    if (typeFilterDot) typeFilterDot.hidden = !isFiltered;
    typeFilterBtn.setAttribute('aria-label', isFiltered ? `Filter current orders by type. Selected: ${active.label}` : 'Filter current orders by type');
  }

  function renderTypeFilterMenu(allGroups = []) {
    if (!typeFilterPanel) return;
    const options = getTypeFilterOptions(allGroups);
    updateTypeFilterButtonState(options);
    const plural = (n) => `${n} order${n === 1 ? '' : 's'}`;
    typeFilterPanel.innerHTML = `
      <div class="orders-type-filter__panel-head">
        <div class="orders-type-filter__panel-title">Filter by type</div>
        <div class="orders-type-filter__panel-sub">${escapeHTML(plural(options[0]?.count || 0))}</div>
      </div>
      <div class="orders-type-filter__options">
        ${options.map((opt) => `
          <button
            type="button"
            class="orders-type-filter__option${opt.value === currentTypeFilter ? ' is-active' : ''}"
            data-value="${escapeHTML(opt.value)}"
            role="menuitemradio"
            aria-checked="${opt.value === currentTypeFilter ? 'true' : 'false'}"
          >
            <span class="orders-type-filter__option-icon" style="--otf-icon-bg:${opt.bg};--otf-icon-fg:${opt.fg};--otf-icon-border:${opt.bd};">
              <i data-feather="${escapeHTML(opt.icon)}"></i>
            </span>
            <span class="orders-type-filter__option-body">
              <span class="orders-type-filter__option-title">${escapeHTML(opt.label)}</span>
              <span class="orders-type-filter__option-sub">${escapeHTML(plural(opt.count || 0))}</span>
            </span>
            <span class="orders-type-filter__option-check"><i data-feather="check"></i></span>
          </button>
        `).join('')}
      </div>
    `;
  }

  function closeTypeFilterMenu() {
    if (!typeFilterWrap || !typeFilterBtn || !typeFilterPanel) return;
    typeFilterWrap.classList.remove('is-open');
    typeFilterBtn.setAttribute('aria-expanded', 'false');
    typeFilterPanel.hidden = true;
  }

  function openTypeFilterMenu(allGroups = []) {
    if (!typeFilterWrap || !typeFilterBtn || !typeFilterPanel) return;
    renderTypeFilterMenu(allGroups);
    typeFilterWrap.classList.add('is-open');
    typeFilterBtn.setAttribute('aria-expanded', 'true');
    typeFilterPanel.hidden = false;
    if (window.feather) window.feather.replace();
  }

  function toggleTypeFilterMenu(allGroups = [], force) {
    if (!typeFilterPanel) return;
    const shouldOpen = typeof force === 'boolean' ? force : typeFilterPanel.hidden;
    if (shouldOpen) openTypeFilterMenu(allGroups);
    else closeTypeFilterMenu();
  }

  function renderCurrentOrders() {
    const allGroups = buildGroups(allOrders);
    groupsById = new Map((allGroups || []).map((g) => [g.groupId, g]));
    setActiveStatusTabUI();
    updateCurrentOrdersToolbarUrl();
    renderTypeFilterMenu(allGroups);

    const q = norm(searchInput?.value || '');
    const visibleGroups = (allGroups || [])
      .filter((group) => groupMatchesCurrentStatus(group))
      .filter((group) => groupMatchesCurrentType(group))
      .filter((group) => groupMatchesSearch(group, q));

    ordersListDiv.innerHTML = '';
    if (!visibleGroups.length) {
      ordersListDiv.innerHTML = '<p>No orders found.</p>';
      if (window.feather) window.feather.replace();
      return;
    }

    const frag = document.createDocumentFragment();
    for (const g of visibleGroups) frag.appendChild(renderCard(g));
    ordersListDiv.appendChild(frag);

    if (window.feather) window.feather.replace();
  }

  function renderCard(group) {
    const items = group.products || [];
    const first = items[0] || {};

    const itemsCount = items.length;

    // Use the same "effective" quantity logic as the modal (Quantity Progress overrides).
    const effectiveQty = (x) => {
      const requested =
        asFiniteNumber(x?.quantityRequested) ??
        asFiniteNumber(x?.quantity) ??
        0;

      const progress = asFiniteNumber(x?.quantityProgress);
      return progress !== null && progress !== undefined ? progress : requested;
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

    const thumbHTML = orderTypeThumbMarkup(
      group.orderType || first.orderType,
      group.orderTypeColor || first.orderTypeColor,
    );

    const card = document.createElement('article');
    card.className = 'co-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.dataset.groupId = group.groupId;

    card.innerHTML = `
      <div class="co-top">
        ${thumbHTML}

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

    card.addEventListener('click', (e) => {
      // In some layouts a parent element may listen for clicks (or the card could
      // be wrapped by an accidental link). Prevent any default navigation and
      // stop bubbling so the click reliably opens the modal only.
      try { e.preventDefault(); } catch {}
      try { e.stopPropagation(); } catch {}
      openOrderModal(group);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        try { e.stopPropagation(); } catch {}
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
          renderCurrentOrders();
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
      renderCurrentOrders();
    } catch (error) {
      console.error('Error fetching orders:', error);
      ordersListDiv.innerHTML = `<p style="color: red;">Error: ${escapeHTML(error.message)}</p>`;
    }
  }

  function setupSearch() {
    if (!searchInput) return;

    function runFilter() {
      renderCurrentOrders();
    }

    // Some mobile browsers (and Chrome's session restore) can autofill/restore the value of
    // the search box on first interaction even when the input isn't focused.
    // That would unexpectedly filter the list to empty. We ignore those events.
    searchInput.addEventListener('input', (e) => {
      const isFloatingSearchSync = searchInput.dataset.opsFloatingSearchSync === '1';
      if (!isFloatingSearchSync && document.activeElement !== searchInput) {
        // Clear any silent autofill value and keep the current list.
        try { searchInput.value = ''; } catch {}
        return;
      }
      runFilter();
    });
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && searchInput.value) {
        searchInput.value = '';
        runFilter();
      }
    });
  }

  function setupToolbar() {
    setActiveStatusTabUI();
    updateTypeFilterButtonState();

    tabsWrap?.addEventListener('click', (e) => {
      const a = e.target?.closest?.('a.tab-portfolio');
      if (!a) return;
      const nextTab = normalizeCurrentStatusTab(a.dataset.tab || 'all');
      if (nextTab === currentStatusTab) return;
      e.preventDefault();
      currentStatusTab = nextTab;
      closeTypeFilterMenu();
      renderCurrentOrders();
    });

    typeFilterBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const allGroups = buildGroups(allOrders);
      toggleTypeFilterMenu(allGroups);
    });

    typeFilterPanel?.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('.orders-type-filter__option');
      if (!btn) return;
      const nextValue = normalizeTypeFilterValue(btn.getAttribute('data-value'));
      if (nextValue === currentTypeFilter) {
        closeTypeFilterMenu();
        return;
      }
      currentTypeFilter = nextValue;
      closeTypeFilterMenu();
      renderCurrentOrders();
    });

    document.addEventListener('click', (e) => {
      if (!typeFilterWrap || !typeFilterPanel || typeFilterPanel.hidden) return;
      if (typeFilterWrap.contains(e.target)) return;
      closeTypeFilterMenu();
    });
  }

  currentStatusTab = readStatusTabFromUrl();
  currentTypeFilter = readTypeFilterFromUrl();
  setupToolbar();
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
    if (typeFilterPanel && !typeFilterPanel.hidden) {
      e.preventDefault();
      closeTypeFilterMenu();
      return;
    }
    if (isEditPwdOpen()) {
      e.preventDefault();
      closeEditPasswordModal();
      return;
    }
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

  // Edit password sub-modal events
  if (editPwdModal) {
    // Click outside closes
    editPwdModal.addEventListener('click', (e) => {
      if (e.target === editPwdModal) closeEditPasswordModal();
    });
  }

  editPwdCloseBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    closeEditPasswordModal();
  });
  editPwdCancelBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    closeEditPasswordModal();
  });
  editPwdConfirmBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    submitEditPassword();
  });
  editPwdInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitEditPassword();
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
