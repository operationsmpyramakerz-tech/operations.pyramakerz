/* public/js/sv-orders.js
   Orders Review — render using the same card UI as Current Orders.
   Differences:
   - Status pill shows S.V Approval status (Not Started / Approved / Rejected)
   - Clicking a card opens a modal with order components + Edit / Approve / Reject per item
*/
(() => {
  "use strict";

  // Run only on S.V orders page
  const listDiv = document.getElementById("sv-list");
  if (!listDiv) return;

  // ===== Elements =====
  const searchInput = document.getElementById("svSearch");
  const tabsWrap = document.getElementById("svTabs");
  const typeFilterWrap = document.getElementById("svTypeFilter");
  const typeFilterBtn = document.getElementById("svTypeFilterBtn");
  const typeFilterPanel = document.getElementById("svTypeFilterPanel");
  const typeFilterDot = document.getElementById("svTypeFilterDot");

  // Modal
  const modalOverlay = document.getElementById("svOrderModal");
  const modalCloseBtn = document.getElementById("svModalClose");
  const modalEls = {
    title: document.getElementById("svModalTitle"),
    sub: document.getElementById("svModalSub"),
    reason: document.getElementById("svModalReason"),
    date: document.getElementById("svModalDate"),
    components: document.getElementById("svModalComponents"),
    totalPrice: document.getElementById("svModalTotalPrice"),
    items: document.getElementById("svModalItems"),
  };
  const modalRows = {
    reason: modalEls.reason?.closest?.('.co-meta-row') || null,
    date: modalEls.date?.closest?.('.co-meta-row') || null,
    components: modalEls.components?.closest?.('.co-meta-row') || null,
    totalPrice: modalEls.totalPrice?.closest?.('.co-meta-row') || null,
  };
  const modalReasonLabel = modalRows.reason?.querySelector?.('span') || null;

  // ===== Helpers =====
  const qs = new URLSearchParams(location.search);
  let TAB = (qs.get("tab") || "not-started").toLowerCase();
  let currentTypeFilter = String(qs.get("type") || "all").toLowerCase().trim();

  const norm = (s) => String(s || "").toLowerCase().trim();


  function syncShellDisplayUrl(urlLike) {
    try {
      if (!window.parent || window.parent === window) return;
      if (window.parent.location.origin !== window.location.origin) return;

      const displayUrl = new URL(
        urlLike instanceof URL ? urlLike.toString() : String(urlLike || window.location.href),
        window.location.origin,
      );
      displayUrl.searchParams.delete('__shell');

      const next = `${displayUrl.pathname}${displayUrl.search}${displayUrl.hash}` || displayUrl.pathname || '/';
      window.parent.history.replaceState({ opsShellPath: next }, '', next);

      if (window.parent.__opsShellHostState) {
        window.parent.__opsShellHostState.currentPath = next;
      }
    } catch {}
  }

  function createToolbarTabIndicator(tablist) {
    if (!tablist) return () => {};

    let rafId = 0;

    const sync = () => {
      const activeTab = tablist.querySelector('.tab-portfolio.active, .tab-portfolio.is-active');
      if (!activeTab) {
        tablist.style.setProperty('--orders-active-tab-opacity', '0');
        try { delete tablist.dataset.tabIndicatorReady; } catch {}
        return;
      }

      const wrapRect = tablist.getBoundingClientRect();
      const tabRect = activeTab.getBoundingClientRect();
      const x = tabRect.left - wrapRect.left + tablist.scrollLeft;
      const y = tabRect.top - wrapRect.top + tablist.scrollTop;

      tablist.style.setProperty('--orders-active-tab-x', `${Math.round(x)}px`);
      tablist.style.setProperty('--orders-active-tab-y', `${Math.round(y)}px`);
      tablist.style.setProperty('--orders-active-tab-width', `${Math.round(tabRect.width)}px`);
      tablist.style.setProperty('--orders-active-tab-height', `${Math.round(tabRect.height)}px`);
      tablist.style.setProperty('--orders-active-tab-opacity', '1');
      tablist.dataset.tabIndicatorReady = '1';
    };

    const queue = () => {
      window.cancelAnimationFrame(rafId);
      rafId = window.requestAnimationFrame(sync);
    };

    tablist.addEventListener('scroll', queue, { passive: true });
    window.addEventListener('resize', queue);
    window.addEventListener('orientationchange', queue);

    if ('ResizeObserver' in window) {
      const ro = new ResizeObserver(queue);
      ro.observe(tablist);
      tablist.querySelectorAll('.tab-portfolio').forEach((tab) => ro.observe(tab));
      tablist.__ordersTabIndicatorObserver = ro;
    }

    queue();
    return queue;
  }

  const syncTabsIndicator = createToolbarTabIndicator(tabsWrap);

  // ===== Page cache (speed) =====
  // Keep a small per-tab cache so opening Orders Review does not always need a full refetch.
  const SV_CACHE_PREFIX = "cache:svOrders:v3:";
  const SV_CACHE_TTL_MS = 45 * 1000; // 45s

  function normalizeSvTab(tab) {
    const raw = String(tab || "").toLowerCase().trim();
    if (raw === "all") return "all";
    return approvalKey(raw);
  }

  function getSvCacheKey(tab = TAB) {
    return `${SV_CACHE_PREFIX}${normalizeSvTab(tab)}`;
  }

  function clearSvCache(tab) {
    try {
      if (tab) {
        sessionStorage.removeItem(getSvCacheKey(tab));
        return;
      }
      ["not-started", "approved", "rejected", "all"].forEach((key) => {
        sessionStorage.removeItem(getSvCacheKey(key));
      });
    } catch {}
  }

  function readSvCache(tab = TAB) {
    try {
      const raw = sessionStorage.getItem(getSvCacheKey(tab));
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !Array.isArray(obj.data)) return null;
      const age = Date.now() - (Number(obj.ts) || 0);
      return { data: obj.data, stale: age > SV_CACHE_TTL_MS };
    } catch {
      return null;
    }
  }

  function writeSvCache(data, tab = TAB) {
    try {
      sessionStorage.setItem(getSvCacheKey(tab), JSON.stringify({ ts: Date.now(), data: data || [] }));
    } catch {}
  }

  const toDate = (d) => new Date(d || 0);

  const escapeHTML = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));

  const moneyFmt = (() => {
    try {
      return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
    } catch {
      return null;
    }
  })();

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

  function normalizeTypeFilterValue(value) {
    return orderTypeKey(value) || 'all';
  }

  function isMaintenanceOrderType(type) {
    return orderTypeKey(type) === 'requestmaintenance';
  }

  function updateSvToolbarUrl() {
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('tab', TAB);
      if (currentTypeFilter && currentTypeFilter !== 'all') u.searchParams.set('type', currentTypeFilter);
      else u.searchParams.delete('type');
      const next = u.pathname + (u.searchParams.toString() ? `?${u.searchParams.toString()}` : '');
      history.replaceState({}, '', next);
      syncShellDisplayUrl(u);
    } catch {}
  }

  function summarizeIssueDescriptions(items) {
    const unique = [];
    const seen = new Set();
    for (const it of items || []) {
      const value = String(it?.issueDescription || it?.reason || '').trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      unique.push(value);
    }
    if (!unique.length) return '—';
    if (unique.length === 1) return unique[0];
    return `${unique[0]} +${unique.length - 1}`;
  }

  function fmtMoney(value) {
    const n = Number(value);
    const safe = Number.isFinite(n) ? n : 0;
    if (moneyFmt) return moneyFmt.format(safe);
    return `£${safe.toFixed(2)}`;
  }

  // Quantity helpers (support fractions like 0.5)
  const QTY_DECIMALS = 6;
  function roundQty(n, decimals = QTY_DECIMALS) {
    const v = Number(n);
    if (!Number.isFinite(v)) return 0;
    const p = 10 ** decimals;
    return Math.round(v * p) / p;
  }

  function fmtQty(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "0";
    const r = roundQty(n);
    if (Number.isInteger(r)) return String(r);
    return r
      .toFixed(QTY_DECIMALS)
      .replace(/\.0+$/, "")
      .replace(/(\.[0-9]*?)0+$/, "$1");
  }

  function fmtDateOnly(createdTime) {
    const d = toDate(createdTime);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  function fmtCreated(createdTime) {
    const d = toDate(createdTime);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  const http = {
    async get(url, opts = {}) {
      const timeoutMs = Math.max(0, Number(opts?.timeoutMs) || 0);
      const controller = (typeof AbortController === "function" && timeoutMs > 0)
        ? new AbortController()
        : null;
      const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

      try {
        const res = await fetch(url, {
          credentials: "include",
          cache: "no-store",
          signal: controller ? controller.signal : undefined,
        });
        if (res.status === 401) {
          window.location.href = "/login";
          return null;
        }
        if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
        return await res.json();
      } catch (err) {
        if (err?.name === "AbortError") throw new Error(`GET ${url} → timeout`);
        throw err;
      } finally {
        if (timer) clearTimeout(timer);
      }
    },
    async post(url, body) {
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body || {}),
      });
      if (res.status === 401) {
        window.location.href = "/login";
        return null;
      }
      if (!res.ok) throw new Error(`POST ${url} → ${res.status}`);
      try { return await res.json(); } catch { return { ok: true }; }
    },
  };

  const toastOK  = (m) => (window.toast ? window.toast.success(m) : console.log("[OK]", m));
  const toastERR = (m) => (window.toast ? window.toast.error(m)   : console.error("[ERR]", m));

  function normalizeApproval(raw) {
    const s = norm(raw).replace(/[_]+/g, " ");
    if (s === "approved") return "Approved";
    if (s === "rejected") return "Rejected";
    return "Not Started";
  }

  function approvalKey(label) {
    const s = norm(label);
    if (s === "approved") return "approved";
    if (s === "rejected") return "rejected";
    return "not-started";
  }

  function approvalSubtitle(label) {
    const k = approvalKey(label);
    if (k === "approved") return "This order has been approved by S.V.";
    if (k === "rejected") return "This order has been rejected by S.V.";
    return "Waiting for S.V approval.";
  }

  function badgeForApproval(status) {
    const k = approvalKey(status);
    if (k === "approved") return `<span class="sv-approval-pill" style="--tag-bg:#D1FAE5;--tag-fg:#065F46;--tag-border:#A7F3D0;">Approved</span>`;
    if (k === "rejected") return `<span class="sv-approval-pill" style="--tag-bg:#FEE2E2;--tag-fg:#B91C1C;--tag-border:#FECACA;">Rejected</span>`;
    // Not Started should be yellow like Notion
    return `<span class="sv-approval-pill" style="--tag-bg:#FEF3C7;--tag-fg:#92400E;--tag-border:#FDE68A;">Not Started</span>`;
  }

  // ===== Tracking progress (same flow as Current Orders) =====
  const STATUS_FLOW = [
    { label: "Order Placed", sub: "Your order has been placed." },
    { label: "Under Supervision", sub: "Your order is under supervision." },
    { label: "In progress", sub: "We are preparing your order." },
    { label: "Shipped", sub: "Your cargo is on delivery." },
    { label: "Arrived", sub: "Your order has arrived." },
  ];

  function statusToIndex(status) {
    const s = norm(status).replace(/[_-]+/g, " ");
    if (/(arrived|delivered|received)/.test(s)) return 5;
    if (/(shipped|on the way|delivering|prepared)/.test(s)) return 4;
    if (/(in progress|inprogress|progress)/.test(s)) return 3;
    if (/(under supervision|supervision|review)/.test(s)) return 2;
    if (/(order placed|placed|pending|order received)/.test(s)) return 1;
    return 1;
  }

  function computeStage(items) {
    const idx = Math.max(
      1,
      ...(items || []).map((x) => statusToIndex(x?.status)),
    );
    const safe = Math.min(5, Math.max(1, idx));
    const meta = STATUS_FLOW[safe - 1] || STATUS_FLOW[0];
    return { idx: safe, label: meta.label, sub: meta.sub };
  }

  function setSVProgress(idx) {
    const safe = Math.min(5, Math.max(1, Number(idx) || 1));

    for (let i = 1; i <= 5; i++) {
      const stepEl = document.getElementById(`svStep${i}`);
      if (!stepEl) continue;
      stepEl.classList.toggle("is-active", i <= safe);
      stepEl.classList.toggle("is-current", i === safe);
    }

    for (let i = 1; i <= 4; i++) {
      const connEl = document.getElementById(`svConn${i}`);
      if (!connEl) continue;
      connEl.classList.toggle("is-active", i < safe);
    }
  }

  // ===== Grouping (same strategy as Current Orders) =====
  // Build a display string for a group based on Notion "ID" (unique_id)
  // Examples:
  // - Single item: "ORD-95"
  // - Multiple items: "ORD-95 : ORD-98"
  function computeOrderIdRange(items) {
    const arr = Array.isArray(items) ? items : [];
    const withId = arr.filter((x) => x && x.orderId);
    if (withId.length === 0) return null;

    const withNum = withId.filter(
      (x) => typeof x.orderIdNumber === "number" && Number.isFinite(x.orderIdNumber),
    );

    const allHaveNum = withNum.length === withId.length;
    const prefixes = new Set(withNum.map((x) => String(x.orderIdPrefix || "").trim()));
    const samePrefix = allHaveNum && prefixes.size <= 1;

    if (samePrefix) {
      const prefix = (withNum[0]?.orderIdPrefix ? String(withNum[0].orderIdPrefix).trim() : "");
      const nums = withNum.map((x) => Number(x.orderIdNumber)).filter((n) => Number.isFinite(n));
      if (nums.length) {
        const min = Math.min(...nums);
        const max = Math.max(...nums);
        const from = prefix ? `${prefix}-${min}` : String(min);
        const to = prefix ? `${prefix}-${max}` : String(max);
        return from === to ? from : `${from} : ${to}`;
      }
    }

    const sorted = withId.slice().sort((a, b) => toDate(a.createdTime) - toDate(b.createdTime));
    const from = sorted[0]?.orderId;
    const to = sorted[sorted.length - 1]?.orderId;
    if (!from) return null;
    return from === to ? from : `${from} : ${to}`;
  }

  function summarizeReasons(items) {
    const counts = new Map();
    for (const it of items || []) {
      const r = String(it.reason || "").trim();
      if (!r) continue;
      counts.set(r, (counts.get(r) || 0) + 1);
    }

    const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
    const unique = entries.map(([k]) => k);

    if (unique.length === 0) return { title: "No Reason", uniqueReasons: [] };
    if (unique.length === 1) return { title: unique[0], uniqueReasons: unique };

    const main = unique[0];
    return { title: `${main} +${unique.length - 1}`, uniqueReasons: unique };
  }

  function computeGroupApproval(items) {
    const arr = Array.isArray(items) ? items : [];
    const normalized = arr.map((x) => normalizeApproval(x.approval));
    if (normalized.some((s) => s === "Rejected")) return "Rejected";
    if (normalized.length && normalized.every((s) => s === "Approved")) return "Approved";
    return "Not Started";
  }

  function buildGroups(list) {
    const sorted = (list || []).slice().sort((a, b) => toDate(b.createdTime) - toDate(a.createdTime));

    // Group by "date + time" to the minute (same as Current Orders)
    // BUT also include teamMemberId so orders from different users don't merge.
    const pad2 = (n) => String(n).padStart(2, "0");
    const timeKey = (createdTime) => {
      const d = toDate(createdTime);
      if (Number.isNaN(d.getTime())) return "Unknown time";
      const yyyy = d.getFullYear();
      const mm = pad2(d.getMonth() + 1);
      const dd = pad2(d.getDate());
      const hh = pad2(d.getHours());
      const mi = pad2(d.getMinutes());
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
    };

    const map = new Map();

    for (const o of sorted) {
      // Prefer grouping by Order - ID (Number). Fallback (legacy rows): created-time (minute) + team member.
      const oid = Number(o.orderIdNumber);
      const key = Number.isFinite(oid)
        ? `ord:${oid}`
        : `${timeKey(o.createdTime)}|${o.teamMemberId || ""}`;
      let g = map.get(key);

      if (!g) {
        g = {
          timeKey: key,
          // Use a stable group id so the modal doesn't randomly close
          // when items move between tabs (e.g. rejecting a single component).
          groupId: key,
          latestCreated: o.createdTime,
          earliestCreated: o.createdTime,
          products: [],
          reason: "—",
          reasons: [],
          orderIdRange: null,
          approval: "Not Started",
          orderType: o.orderType || '',
          orderTypeColor: o.orderTypeColor || null,
          totals: {
            totalQty: 0,
            estimateTotal: 0,
          },
        };
        map.set(key, g);
      }

      g.products.push(o);

      // Creator name (displayed under date on the card)
      if (!g.createdByName) g.createdByName = o.createdByName || null;
      if (!g.orderType && o.orderType) g.orderType = o.orderType;
      if (!g.orderTypeColor && o.orderTypeColor) g.orderTypeColor = o.orderTypeColor;

      if (!g.latestCreated || toDate(o.createdTime) > toDate(g.latestCreated)) {
        g.latestCreated = o.createdTime;
      }
      if (!g.earliestCreated || toDate(o.createdTime) < toDate(g.earliestCreated)) {
        g.earliestCreated = o.createdTime;
      }
    }

    for (const g of map.values()) {
      const summary = summarizeReasons(g.products);
      g.reason = summary.title;
      g.reasons = summary.uniqueReasons;

      g.orderIdRange = computeOrderIdRange(g.products);

      g.approval = computeGroupApproval(g.products);

      // Notion color of the S.V approval label (used to color the status pill)
      g.approvalColor = (g.products[0] && g.products[0].approvalColor) ? g.products[0].approvalColor : null;

      const totalQty = g.products.reduce((sum, x) => {
        const q0 = Number(x.quantity) || 0;
        const qe = (typeof x.quantityEdited === 'number' && Number.isFinite(x.quantityEdited)) ? x.quantityEdited : null;
        const q = (qe !== null && qe !== undefined) ? Number(qe) : q0;
        return sum + (Number.isFinite(q) ? q : 0);
      }, 0);

      const estimateTotal = g.products.reduce((sum, x) => {
        const q0 = Number(x.quantity) || 0;
        const qe = (typeof x.quantityEdited === 'number' && Number.isFinite(x.quantityEdited)) ? x.quantityEdited : null;
        const q = (qe !== null && qe !== undefined) ? Number(qe) : q0;
        const p = Number(x.unitPrice) || 0;
        return sum + q * p;
      }, 0);

      g.totals.totalQty = totalQty;
      g.totals.estimateTotal = estimateTotal;
    }

    return Array.from(map.values()).sort((a, b) => toDate(b.latestCreated) - toDate(a.latestCreated));
  }

  // ===== UI: Cards =====
  function renderCard(group) {
    const items = group.products || [];
    const first = items[0] || {};

    const componentsCount = items.length;
    const estimateTotal = group.totals?.estimateTotal ?? 0;

    const created = fmtDateOnly(group.latestCreated);
    const title = escapeHTML(group.orderIdRange || group.reason || "—");
    const sub = created ? escapeHTML(created) : "—";
    const componentsPrice = fmtMoney(estimateTotal);

    const creatorName = String(group.createdByName || first.createdByName || '').trim() || '—';

    const statusVars = notionColorVars(group.approvalColor);

    const thumbHTML = orderTypeThumbMarkup(
      group.orderType || first.orderType,
      group.orderTypeColor || first.orderTypeColor,
    );

    const card = document.createElement("article");
    card.className = "co-card";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.dataset.groupId = group.groupId;

    card.innerHTML = `
      <div class="co-top">
        ${thumbHTML}

        <div class="co-main">
          <div class="co-title">${title}</div>
          <div class="co-sub">${sub}</div>
          <div class="co-createdby">${escapeHTML(creatorName)}</div>
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
          <span class="co-status-btn" style="--tag-bg:${statusVars.bg};--tag-fg:${statusVars.fg};--tag-border:${statusVars.bd};">${escapeHTML(group.approval || "Not Started")}</span>
          <span class="co-right-ico" aria-hidden="true"><i data-feather="percent"></i></span>
        </div>
      </div>
    `;

    card.addEventListener("click", () => openModal(group.groupId));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openModal(group.groupId);
      }
    });

    return card;
  }

  // ===== Modal =====
  let lastFocusEl = null;

  function isModalOpen() {
    return !!(modalOverlay && modalOverlay.classList.contains("is-open"));
  }

  function closeModal() {
    if (!modalOverlay) return;
    modalOverlay.classList.remove("is-open");
    modalOverlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("co-modal-open");
    modalOverlay.removeAttribute("data-group-id");
    if (lastFocusEl && typeof lastFocusEl.focus === "function") lastFocusEl.focus();
  }

  function renderModal(group) {
    if (!modalOverlay || !group) return;

    modalOverlay.dataset.groupId = group.groupId;

    const approval = group.approval || "Not Started";
    const canAct = approvalKey(approval) === "not-started" && TAB === "not-started";
    const modalItemsList = group.products || [];
    const firstItem = modalItemsList[0] || {};
    const isMaintenanceOrder = isMaintenanceOrderType(group.orderType || firstItem.orderType);
    if (modalEls.title) modalEls.title.textContent = approval;
    if (modalEls.sub) {
      modalEls.sub.textContent = orderTypeSubtitle(
        group.orderType || firstItem.orderType,
        group.orderTypeColor || firstItem.orderTypeColor,
        approvalSubtitle(approval),
      );
    }

    // Tracking progress (operations status) — always show in all tabs
    const stage = computeStage(modalItemsList);
    setSVProgress(stage.idx);

    if (modalReasonLabel) modalReasonLabel.textContent = isMaintenanceOrder ? 'Issue Description' : 'Reason';
    if (modalRows.components) modalRows.components.hidden = isMaintenanceOrder;
    if (modalRows.totalPrice) modalRows.totalPrice.hidden = isMaintenanceOrder;
    if (modalEls.reason) {
      modalEls.reason.textContent = isMaintenanceOrder
        ? summarizeIssueDescriptions(modalItemsList)
        : (String(group?.reason || modalItemsList?.[0]?.reason || '—').trim() || '—');
    }
    if (modalEls.date) modalEls.date.textContent = fmtCreated(group.latestCreated) || "—";
    if (modalEls.components) modalEls.components.textContent = String(modalItemsList.length);
    if (modalEls.totalPrice) modalEls.totalPrice.textContent = fmtMoney(group.totals?.estimateTotal ?? 0);

    if (modalEls.items) {
      const items = (group.products || []).slice().sort((a, b) =>
        String(a?.productName || '').localeCompare(String(b?.productName || ''), undefined, {
          sensitivity: 'base',
          numeric: true,
        }),
      );
      if (!items.length) {
        modalEls.items.innerHTML = `<div class="muted">No items.</div>`;
      } else {
        const bulkCard = canAct ? `
          <div class="co-item" data-role="bulk-actions">
            <div class="co-item-left">
              <div class="co-item-name">Bulk actions</div>
              <div class="co-item-sub">Approve or reject all components in this order.</div>
            </div>
            <div class="co-item-right">
              <div class="btn-group" style="justify-content:flex-end; margin-top:8px;">
                <button class="btn btn-success btn-xs sv-approve-all" type="button" title="Approve all">
                  <i data-feather="check"></i> Approve all
                </button>
                <button class="btn btn-danger btn-xs sv-reject-all" type="button" title="Reject all">
                  <i data-feather="x"></i> Reject all
                </button>
              </div>
            </div>
          </div>
        `.trim() : "";

        modalEls.items.innerHTML = bulkCard + items.map((it) => {
          const qtyReq = Number(it.quantity) || 0;
          const qtyEdited = (typeof it.quantityEdited === 'number' && Number.isFinite(it.quantityEdited)) ? it.quantityEdited : null;
          const qtyEffective = (qtyEdited !== null && qtyEdited !== undefined) ? Number(qtyEdited) : qtyReq;
          const unit = Number(it.unitPrice) || 0;
          const lineTotal = qtyEffective * unit;

          const showEdited = qtyEdited !== null && qtyEdited !== undefined && Number(qtyEdited) !== qtyReq;
          const qtyHTML = showEdited
            ? `<span class="sv-qty-diff"><span class="sv-qty-old">${escapeHTML(fmtQty(qtyReq))}</span><strong class="sv-qty-new" data-role="qty-val">${escapeHTML(fmtQty(qtyEdited))}</strong></span>`
            : `<strong data-role="qty-val">${escapeHTML(fmtQty(qtyReq))}</strong>`;

          const actionButtons = canAct && !isMaintenanceOrder ? `
            <div class="btn-group" style="justify-content:flex-end; margin-top:8px;">
              <button class="btn btn-warning btn-xs sv-edit" data-id="${escapeHTML(it.id)}" title="Edit qty">
                <i data-feather="edit-2"></i> Edit
              </button>
              <button class="btn btn-danger btn-xs sv-reject" data-id="${escapeHTML(it.id)}" title="Reject">
                <i data-feather="x"></i> Reject
              </button>
            </div>
          `.trim() : "";

          const subLine = isMaintenanceOrder
            ? ""
            : `Unit: ${escapeHTML(fmtMoney(unit))} · Total: ${escapeHTML(fmtMoney(lineTotal))}`;

          return `
            <div class="co-item" data-id="${escapeHTML(it.id)}">
              <div class="co-item-left">
                <div class="co-item-title">
                  <div class="co-item-name">${escapeHTML(it.productName || "Unknown Product")}</div>
                </div>
                ${subLine ? `<div class="co-item-sub">${subLine}</div>` : ""}
              </div>

              <div class="co-item-right">
                <div class="co-item-total">Qty: ${qtyHTML}</div>
                ${actionButtons}
              </div>
            </div>
          `;
        }).join("");
      }
    }

    if (window.feather) window.feather.replace();
  }

  function openModal(groupId) {
    if (!modalOverlay) return;

    const group = groupsById.get(groupId);
    if (!group) return;

    lastFocusEl = document.activeElement;
    renderModal(group);

    modalOverlay.classList.add("is-open");
    modalOverlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("co-modal-open");
    if (modalCloseBtn) modalCloseBtn.focus();
  }

  // ===== Quantity popover (inline dropdown near Edit button) =====
  let popEl = null, popForId = null, popAnchor = null;

  function destroyPopover() {
    if (popEl?.parentNode) popEl.parentNode.removeChild(popEl);
    popEl = null; popForId = null; popAnchor = null;
    document.removeEventListener("pointerdown", onDocPointerDown, true);
    document.removeEventListener("keydown", onPopEsc, true);
  }

  function onDocPointerDown(e) {
    if (!popEl) return;
    if (popEl.contains(e.target)) return;
    if (popAnchor && popAnchor.contains(e.target)) return;
    destroyPopover();
  }

  function onPopEsc(e) {
    if (e.key === "Escape") destroyPopover();
  }

  function placePopoverNear(btn) {
    const r = btn.getBoundingClientRect();
    const x = Math.min(window.innerWidth - 260, Math.max(8, r.right - 220));
    const y = Math.min(window.innerHeight - 140, r.bottom + 8);
    popEl.style.left = `${x + window.scrollX}px`;
    popEl.style.top  = `${y + window.scrollY}px`;
  }

  async function openQtyPopover(btn, id) {
    if (popEl && popForId === id) { destroyPopover(); return; }
    destroyPopover();
    popForId = id; popAnchor = btn;

    const it = allItems.find((x) => String(x.id) === String(id));
    const edited = it && typeof it.quantityEdited === 'number' && Number.isFinite(it.quantityEdited)
      ? Number(it.quantityEdited)
      : null;
    const requestedQty = it ? roundQty(Number(it.quantity) || 0) : 0;
    const currentVal = edited !== null ? edited : requestedQty;
    const minAllowed = Math.min(requestedQty, 0);
    const maxAllowed = Math.max(requestedQty, 0);

    popEl = document.createElement("div");
    popEl.className = "sv-qty-popover";
    popEl.innerHTML = `
      <div class="sv-qty-popover__arrow"></div>
      <div class="sv-qty-popover__body">
        <div class="sv-qty-row">
          <button class="sv-qty-btn sv-qty-dec" type="button" aria-label="Decrease">−</button>
          <input class="sv-qty-input" type="number" min="${escapeHTML(String(minAllowed))}" max="${escapeHTML(String(maxAllowed))}" step="any" value="${escapeHTML(fmtQty(currentVal))}" />
          <button class="sv-qty-btn sv-qty-inc" type="button" aria-label="Increase">+</button>
        </div>
        <div class="sv-qty-actions">
          <button class="btn btn-success btn-xs sv-qty-save">Save</button>
          <button class="btn btn-danger btn-xs sv-qty-cancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(popEl);
    placePopoverNear(btn);

    const input  = popEl.querySelector(".sv-qty-input");
    const decBtn = popEl.querySelector(".sv-qty-dec");
    const incBtn = popEl.querySelector(".sv-qty-inc");
    const saveBtn= popEl.querySelector(".sv-qty-save");
    const cancel = popEl.querySelector(".sv-qty-cancel");

    input.focus(); input.select();

    const clamp = (n) => {
      const raw = Number(n);
      const v = Number.isFinite(raw) ? roundQty(raw) : 0;
      if (v < minAllowed) return roundQty(minAllowed);
      if (v > maxAllowed) return roundQty(maxAllowed);
      return v;
    };

    decBtn.addEventListener("click", () => { input.value = fmtQty(clamp((Number(input.value) || 0) - 1)); });
    incBtn.addEventListener("click", () => { input.value = fmtQty(clamp((Number(input.value) || 0) + 1)); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") saveBtn.click(); });

    saveBtn.addEventListener("click", async () => {
      const v = clamp(input.value);
      try {
        await http.post(`/api/sv-orders/${encodeURIComponent(id)}/quantity`, { value: v });

        // update in-memory
        const idx = allItems.findIndex((x) => String(x.id) === String(id));
        if (idx >= 0) {
          const req = Number(allItems[idx].quantity) || 0;
          // Compare using the same rounding to avoid floating point edge cases
          allItems[idx].quantityEdited = (roundQty(v) === roundQty(req)) ? null : v;
        }

        writeSvCache(allItems, TAB);
        toastOK("Quantity updated.");
        destroyPopover();
        renderAll({ preserveScroll: true, preserveModal: true });
      } catch (e) {
        console.error(e);
        toastERR("Failed to update quantity.");
      }
    });

    cancel.addEventListener("click", destroyPopover);

    setTimeout(() => {
      document.addEventListener("pointerdown", onDocPointerDown, true);
      document.addEventListener("keydown", onPopEsc, true);
    }, 0);
  }

  // ===== Data / Render =====
  let allItems = [];
  let allGroups = [];
  let filteredGroups = [];
  let groupsById = new Map();
  let loading = false;
  let loadSeq = 0;

  function groupMatchesSearch(group, q) {
    if (!q) return true;
    const hay = [
      group.orderIdRange || "",
      group.reason || "",
      ...(group.products || []).map((x) => x.productName || ""),
      ...(group.products || []).map((x) => x.reason || ""),
    ].join(" ").toLowerCase();
    return hay.includes(q);
  }

  function groupMatchesCurrentType(group) {
    if (!currentTypeFilter || currentTypeFilter === 'all') return true;
    const first = (group.products || [])[0] || {};
    return normalizeTypeFilterValue(group.orderType || first.orderType) === currentTypeFilter;
  }

  function getTypeFilterOptions() {
    const counts = new Map();
    for (const group of allGroups || []) {
      const first = (group.products || [])[0] || {};
      const key = normalizeTypeFilterValue(group.orderType || first.orderType);
      counts.set(key, (counts.get(key) || 0) + 1);
    }

    const defs = [
      { value: 'requestproducts', type: 'requestproducts' },
      { value: 'withdrawproducts', type: 'withdrawproducts' },
      { value: 'requestmaintenance', type: 'requestmaintenance' },
    ];

    const total = (allGroups || []).length;
    return [{
      value: 'all',
      label: 'All Types',
      icon: 'layers',
      bg: '#F3F4F6',
      fg: '#111827',
      bd: '#E5E7EB',
      count: total,
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
    typeFilterBtn.setAttribute('aria-label', isFiltered ? `Filter review orders by type. Selected: ${active.label}` : 'Filter review orders by type');
  }

  function renderTypeFilterMenu() {
    if (!typeFilterPanel) return;
    const options = getTypeFilterOptions();
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

  function openTypeFilterMenu() {
    if (!typeFilterWrap || !typeFilterBtn || !typeFilterPanel) return;
    renderTypeFilterMenu();
    typeFilterWrap.classList.add('is-open');
    typeFilterBtn.setAttribute('aria-expanded', 'true');
    typeFilterPanel.hidden = false;
    if (window.feather) window.feather.replace();
  }

  function toggleTypeFilterMenu(force) {
    if (!typeFilterPanel) return;
    const shouldOpen = typeof force === 'boolean' ? force : typeFilterPanel.hidden;
    if (shouldOpen) openTypeFilterMenu();
    else closeTypeFilterMenu();
  }

  function applyFilter() {
    const q = norm(searchInput?.value);
    filteredGroups = allGroups.filter((g) => {
      if (approvalKey(g.approval) !== TAB) return false;
      if (!groupMatchesCurrentType(g)) return false;
      return groupMatchesSearch(g, q);
    });
  }

  function renderList() {
    if (loading) {
      listDiv.innerHTML = `
        <div class="modern-loading" role="status" aria-live="polite">
          <div class="modern-loading__spinner" aria-hidden="true"></div>
          <div class="modern-loading__text">
            Loading orders
            <span class="modern-loading__dots" aria-hidden="true"><span></span><span></span><span></span></span>
          </div>
        </div>
      `;
      if (window.feather) window.feather.replace();
      return;
    }

    if (!filteredGroups.length) {
      listDiv.innerHTML = `<div class="empty-state">
        <i data-feather="inbox"></i>
        <div>No orders to review</div>
        <small class="muted">Linked to you via “S.V Schools”.</small>
      </div>`;
      if (window.feather) window.feather.replace();
      return;
    }

    listDiv.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (const g of filteredGroups) frag.appendChild(renderCard(g));
    listDiv.appendChild(frag);

    if (window.feather) window.feather.replace();
  }

  function renderAll(opts = {}) {
    const preserveScroll = !!opts.preserveScroll;
    const preserveModal = !!opts.preserveModal;

    const y = preserveScroll ? window.scrollY : 0;

    // IMPORTANT: groups are built from items matching the current tab only.
    // This allows per-component decisions (reject one item moves it to Rejected tab)
    // while keeping the rest of the order in Not Started until bulk decision.
    const itemsForTab = (allItems || []).filter((x) => approvalKey(normalizeApproval(x?.approval)) === TAB);
    allGroups = buildGroups(itemsForTab);
    groupsById = new Map(allGroups.map((g) => [g.groupId, g]));

    updateSvToolbarUrl();
    renderTypeFilterMenu();
    applyFilter();
    renderList();

    if (preserveScroll) window.scrollTo(0, y);

    if (preserveModal && isModalOpen() && modalOverlay?.dataset?.groupId) {
      const gid = modalOverlay.dataset.groupId;
      const g = groupsById.get(gid);
      if (g) renderModal(g);
      else closeModal();
    }
  }

  async function loadList(opts = {}) {
    const requestId = ++loadSeq;
    const requestedTab = normalizeSvTab(opts?.tab || TAB || "not-started");
    const cached = readSvCache(requestedTab);
    const hasCache = !!(cached && Array.isArray(cached.data));

    // Render cached data immediately (if available)
    if (hasCache) {
      allItems = cached.data;
      loading = false;
      renderAll();

      // If cache is still fresh, skip network refresh.
      if (!cached.stale && !opts?.force) return;
    } else {
      // No cache → show loading spinner
      loading = true;
      renderList();
    }

    try {
      const data = await http.get(`/api/sv-orders?tab=${encodeURIComponent(requestedTab)}`, { timeoutMs: 25000 });
      if (!data) return;
      if (requestId !== loadSeq || requestedTab !== normalizeSvTab(TAB)) return;

      allItems = Array.isArray(data) ? data : [];
      writeSvCache(allItems, requestedTab);

      loading = false;
      renderAll({ preserveScroll: true, preserveModal: true });
    } catch (e) {
      if (requestId !== loadSeq) return;
      console.error("loadList()", e);

      if (!hasCache) {
        loading = false;
        allItems = [];
        renderList();
        toastERR("Failed to load S.V orders.");
      } else {
        // Keep cached view (best-effort)
        toastERR("Failed to refresh S.V orders (showing cached).");
      }
    }
  }

  // ===== Tabs =====
  function setActiveTab() {
  if (!tabsWrap) return;
  document.querySelectorAll("#svTabs a.tab-portfolio").forEach((a) => {
    const tab = (a.dataset.tab || "").toLowerCase();
    const active = tab === TAB;
    a.classList.toggle("active", active);
    a.classList.toggle("is-active", active);
    a.setAttribute("aria-selected", active ? "true" : "false");
  });
  syncTabsIndicator();
}

// ===== Approve/Reject =====
  async function setApproval(id, decision) {
    try {
      const normalized = normalizeApproval(decision);
      await http.post(`/api/sv-orders/${encodeURIComponent(id)}/approval`, { decision: normalized });

      const idx = allItems.findIndex((x) => String(x.id) === String(id));
      if (idx >= 0) allItems[idx].approval = normalized;
      clearSvCache();

      toastOK(`Marked as ${normalized}.`);
      renderAll({ preserveScroll: true, preserveModal: true });
    } catch (e) {
      console.error(e);
      toastERR("Failed to update S.V approval.");
    }
  }

  async function setBulkApproval(groupId, decision) {
    if (!groupId) return;
    const group = groupsById.get(groupId);
    if (!group) return;

    const normalized = normalizeApproval(decision);

    // Only update items that actually need change
    const ids = (group.products || []).map((x) => x && x.id).filter(Boolean);
    const toUpdate = ids.filter((id) => {
      const it = allItems.find((x) => String(x.id) === String(id));
      return normalizeApproval(it?.approval) !== normalized;
    });

    if (!toUpdate.length) {
      toastOK("Nothing to update.");
      return;
    }

    destroyPopover();

    // Disable bulk buttons while running
    const bulkButtons = modalOverlay ? modalOverlay.querySelectorAll(".sv-approve-all, .sv-reject-all") : [];
    bulkButtons.forEach((b) => { try { b.disabled = true; } catch {} });

    let ok = 0;
    let fail = 0;

    try {
      const concurrency = Math.min(3, toUpdate.length);
      let cursor = 0;

      const workers = Array.from({ length: concurrency }, async () => {
        while (cursor < toUpdate.length) {
          const id = toUpdate[cursor++];
          try {
            await http.post(`/api/sv-orders/${encodeURIComponent(id)}/approval`, { decision: normalized });

            const idx = allItems.findIndex((x) => String(x.id) === String(id));
            if (idx >= 0) allItems[idx].approval = normalized;
            ok += 1;
          } catch (e) {
            console.error(e);
            fail += 1;
          }
        }
      });

      await Promise.all(workers);

      // The item may move between tabs, so drop the per-tab cache and let the next view refetch fresh data.
      clearSvCache();

      if (fail) toastERR(`Updated ${ok}/${toUpdate.length}. Some items failed.`);
      else toastOK(`All items marked as ${normalized}.`);

      renderAll({ preserveScroll: true, preserveModal: true });
    } finally {
      bulkButtons.forEach((b) => { try { b.disabled = false; } catch {} });
    }
  }

  // ===== Wire events =====
  function wireEvents() {

// Tabs: fetch each tab on demand so large accounts do not wait for all review items at once.
if (tabsWrap) {
  tabsWrap.addEventListener("click", (e) => {
    const a = e.target.closest("a.tab-portfolio");
    if (!a) return;

    e.preventDefault();

    const targetTab = normalizeSvTab(a.dataset.tab || "not-started");
    if (!targetTab || targetTab === TAB) {
      syncTabsIndicator();
      return;
    }

    destroyPopover();
    closeTypeFilterMenu();
    closeModal();

    TAB = targetTab;
    setActiveTab();
    updateSvToolbarUrl();

    loadList({ tab: TAB });
  });
}

    typeFilterBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleTypeFilterMenu();
    });

    typeFilterPanel?.addEventListener('click', (e) => {
      const btn = e.target.closest('.orders-type-filter__option');
      if (!btn) return;
      const nextValue = normalizeTypeFilterValue(btn.getAttribute('data-value'));
      if (nextValue === currentTypeFilter) {
        closeTypeFilterMenu();
        return;
      }
      currentTypeFilter = nextValue;
      updateSvToolbarUrl();
      closeTypeFilterMenu();
      renderAll({ preserveScroll: true, preserveModal: false });
    });

    document.addEventListener('click', (e) => {
      if (!typeFilterWrap || !typeFilterPanel || typeFilterPanel.hidden) return;
      if (typeFilterWrap.contains(e.target)) return;
      closeTypeFilterMenu();
    });

    if (searchInput) {
      // Debounced search to avoid heavy re-rendering on every keystroke
      let _svSearchT = null;
      searchInput.addEventListener("input", () => {
        clearTimeout(_svSearchT);
        _svSearchT = setTimeout(() => renderAll({ preserveScroll: true, preserveModal: false }), 150);
      });

      searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && searchInput.value) {
          searchInput.value = "";
          renderAll({ preserveScroll: true, preserveModal: false });
        }
      });
    }

    if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeModal);

    if (modalOverlay) {
      // Click outside to close
      modalOverlay.addEventListener("click", (e) => {
        if (e.target === modalOverlay) closeModal();
      });

      // Buttons inside modal (event delegation)
      modalOverlay.addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;

        // Bulk actions
        if (btn.classList.contains("sv-approve-all") || btn.classList.contains("sv-reject-all")) {
          e.preventDefault();
          e.stopPropagation();
          const gid = modalOverlay?.dataset?.groupId;
          if (!gid) return;
          if (btn.classList.contains("sv-approve-all")) setBulkApproval(gid, "Approved");
          else setBulkApproval(gid, "Rejected");
          return;
        }

        // Per-item actions
        const id = btn.getAttribute("data-id");
        if (!id) return;

        if (btn.classList.contains("sv-edit")) {
          e.preventDefault();
          e.stopPropagation();
          openQtyPopover(btn, id);
        } else if (btn.classList.contains("sv-reject")) {
          e.preventDefault();
          e.stopPropagation();
          setApproval(id, "Rejected");
        }
      });
    }

    // Escape closes open overlays
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (typeFilterPanel && !typeFilterPanel.hidden) {
        closeTypeFilterMenu();
        return;
      }
      if (isModalOpen()) {
        e.preventDefault();
        closeModal();
      }
    });
  }

  // ===== Boot =====
  document.addEventListener("DOMContentLoaded", () => {
    TAB = normalizeSvTab(TAB);
    currentTypeFilter = normalizeTypeFilterValue(currentTypeFilter);
    setActiveTab();
    updateTypeFilterButtonState();
    updateSvToolbarUrl();
    wireEvents();
    loadList({ tab: TAB });
  });
})();
