// public/js/requested-orders.js
// Operations Orders (Schools orders requested) — requested list + tracking modal
document.addEventListener("DOMContentLoaded", () => {
  // ---------- DOM ----------
  const searchInput = document.getElementById("requestedSearch");
  const listDiv = document.getElementById("requested-list");
  const tabsWrap = document.getElementById("reqTabs");

  // Modal
  const orderModal = document.getElementById("reqOrderModal");
  const modalClose = document.getElementById("reqModalClose");
  const modalTitle = document.getElementById("reqModalTitle");
  const modalSub = document.getElementById("reqModalSub");

  // Meta (match Current Orders header)
  const modalReason = document.getElementById("reqModalReason");
  const modalDate = document.getElementById("reqModalDate");
  const modalComponents = document.getElementById("reqModalComponents");
  const modalTotalPrice = document.getElementById("reqModalTotalPrice");

  // Extra header rows (shown in "Received" tab)
  const receiptRow = document.getElementById("reqReceiptRow");
  const receivedByRow = document.getElementById("reqReceivedByRow");
  const modalReceiptNumber = document.getElementById("reqModalReceiptNumber");
  const modalOperationsBy = document.getElementById("reqModalOperationsBy");

  const modalItems = document.getElementById("reqModalItems");

  // Actions (Download dropdown)
  const downloadMenuWrap = document.getElementById("reqDownloadMenuWrap");
  const downloadMenuBtn = document.getElementById("reqDownloadMenuBtn");
  const downloadMenuPanel = document.getElementById("reqDownloadMenuPanel");
  const excelBtn = document.getElementById("reqDownloadExcelBtn");
  const pdfBtn = document.getElementById("reqDownloadPdfBtn");

  const shippedBtn =
    document.getElementById("reqReceivedBtn") ||
    document.getElementById("reqMarkShippedBtn");
  const arrivedBtn =
    document.getElementById("reqReceivedShippedBtn") ||
    document.getElementById("reqMarkArrivedBtn");
  // Tracker steps
  const stepEls = {
    1: document.getElementById("reqStep1"),
    2: document.getElementById("reqStep2"),
    3: document.getElementById("reqStep3"),
    4: document.getElementById("reqStep4"),
    5: document.getElementById("reqStep5"),
  };
  const connEls = {
    1: document.getElementById("reqConn1"),
    2: document.getElementById("reqConn2"),
    3: document.getElementById("reqConn3"),
    4: document.getElementById("reqConn4"),
  };

  // Receipt sub-modal
  const receiptModal = document.getElementById("reqReceiptModal");
  const receiptCloseBtn = document.getElementById("reqReceiptClose");
  const receiptCancelBtn = document.getElementById("reqReceiptCancel");
  const receiptConfirmBtn = document.getElementById("reqReceiptConfirm");
  const receiptInput = document.getElementById("reqReceiptInput");
  const receiptError = document.getElementById("reqReceiptError");

  // ---------- Utils ----------
  const norm = (s) => String(s || "").trim().toLowerCase();

  const escapeHTML = (str) =>
    String(str || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));

  // Only allow http/https URLs to be opened from the UI
  function safeHttpUrl(url) {
    try {
      const raw = String(url || "").trim();
      if (!raw) return null;
      const u = new URL(raw, window.location.origin);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      return u.toString();
    } catch {
      return null;
    }
  }

  // Map Notion select/status colors to a pill background/foreground close to Notion labels
  function notionColorVars(notionColor) {
    const key = norm(String(notionColor || "default").replace(/_background$/i, ""));
    const map = {
      default: { bg: "#E5E7EB", fg: "#374151", bd: "#D1D5DB" },
      gray: { bg: "#E5E7EB", fg: "#374151", bd: "#D1D5DB" },
      brown: { bg: "#F3E8E2", fg: "#6B4F3A", bd: "#E7D3C8" },
      orange: { bg: "#FFEDD5", fg: "#9A3412", bd: "#FED7AA" },
      yellow: { bg: "#FEF3C7", fg: "#92400E", bd: "#FDE68A" },
      green: { bg: "#D1FAE5", fg: "#065F46", bd: "#A7F3D0" },
      blue: { bg: "#DBEAFE", fg: "#1D4ED8", bd: "#BFDBFE" },
      purple: { bg: "#EDE9FE", fg: "#6D28D9", bd: "#DDD6FE" },
      pink: { bg: "#FCE7F3", fg: "#BE185D", bd: "#FBCFE8" },
      red: { bg: "#FEE2E2", fg: "#B91C1C", bd: "#FECACA" },
    };
    return map[key] || map.default;
  }

  const moneyFmt = (() => {
    try {
      return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
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

  // Quantity helpers
  // - Must support fractions (e.g. 0.5)
  // - Avoid floating point artifacts in UI (e.g. 0.30000000000004)
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
    // Keep integers clean
    if (Number.isInteger(r)) return String(r);
    // Show up to QTY_DECIMALS decimals, trimming trailing zeros
    return r
      .toFixed(QTY_DECIMALS)
      .replace(/\.0+$/, "")
      .replace(/(\.[0-9]*?)0+$/, "$1");
  }

  function toDate(v) {
    if (!v) return null;
    try {
      const d = v instanceof Date ? v : new Date(v);
      return Number.isFinite(d.getTime()) ? d : null;
    } catch {
      return null;
    }
  }

  function fmtDateOnly(dateLike) {
    const d = toDate(dateLike);
    if (!d) return "";
    try {
      return d.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return d.toISOString().slice(0, 10);
    }
  }

  function fmtDateTime(dateLike) {
    const d = toDate(dateLike);
    if (!d) return "";
    try {
      return d.toLocaleString("en-GB", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return d.toISOString();
    }
  }

  function toast(type, title, message) {
    if (window.UI?.toast) {
      window.UI.toast({ type, title, message });
    }
  }

  // ---------- Status / Tabs ----------
  // NOTE: "Delivered" tab maps to Arrived/Delivered/Received.
  const STATUS_FLOW = [
    { key: "placed", label: "Order Placed", sub: "We received your order." },
    { key: "supervision", label: "Under Supervision", sub: "Your order is under supervision." },
    { key: "progress", label: "In progress", sub: "We are preparing your order." },
    { key: "shipped", label: "Shipped", sub: "Your order is on the way." },
    { key: "arrived", label: "Arrived", sub: "Your order has arrived." },
  ];

  function statusToIndex(status) {
    const s = norm(status);
    if (/(arrived|delivered|received)/.test(s)) return 5;
    if (/shipped/.test(s)) return 4;
    if (/(in\s*progress|preparing|processing)/.test(s)) return 3;
    if (/under\s*supervision/.test(s)) return 2;
    return 1;
  }

  function computeStage(items) {
    const list = Array.isArray(items) ? items : [];
    let bestIdx = 1;
    let bestColor = null;

    for (const it of list) {
      const idx = statusToIndex(it.status);
      if (idx > bestIdx) {
        bestIdx = idx;
        bestColor = it.statusColor || null;
      } else if (idx === bestIdx && !bestColor) {
        bestColor = it.statusColor || null;
      }
    }

    const base = STATUS_FLOW[bestIdx - 1] || STATUS_FLOW[0];
    return { ...base, idx: bestIdx, color: bestColor };
  }

  function tabFromStageIdx(idx) {
    if (idx >= 5) return "delivered";
    if (idx >= 4) return "received";
    return "not-started";
  }

  function readTabFromUrl() {
    const url = new URL(window.location.href);
    const tab = norm(url.searchParams.get("tab"));
    const allowed = new Set(["not-started", "remaining", "received", "delivered"]);
    return allowed.has(tab) ? tab : "not-started";
  }

  // Stage alone is not enough because we split "Shipped" into:
  // - Remaining: shipped but not fully received (remaining qty > 0)
  // - Received: shipped and fully received
  function tabForGroup(g) {
    const idx = g?.stage?.idx || 1;
    if (idx >= 5) return "delivered";
    if (idx >= 4) return g?.hasRemaining ? "remaining" : "received";
    return "not-started";
  }

  function updateTabUI() {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", currentTab);
    window.history.replaceState({}, "", url);

    const tabs = tabsWrap ? Array.from(tabsWrap.querySelectorAll(".tab-portfolio")) : [];
    tabs.forEach((a) => {
      const t = norm(a.getAttribute("data-tab"));
      const active = t === currentTab;
      a.classList.toggle("is-active", active);
      a.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  function setActiveStep(step) {
    const safe = Math.min(5, Math.max(1, Number(step) || 1));
    for (let i = 1; i <= 5; i++) {
      const el = stepEls[i];
      if (!el) continue;
      el.classList.toggle("is-active", i <= safe);
      el.classList.toggle("is-current", i === safe);
    }
    for (let i = 1; i <= 4; i++) {
      const el = connEls[i];
      if (!el) continue;
      el.classList.toggle("is-active", i < safe);
    }
  }

  // ---------- Grouping ----------
  function computeOrderIdRange(items) {
    const list = (items || [])
      .map((it) => ({
        text: it.orderId || null,
        prefix: it.orderIdPrefix || null,
        number: Number.isFinite(Number(it.orderIdNumber)) ? Number(it.orderIdNumber) : null,
      }))
      .filter((x) => x.text || x.number !== null);

    if (!list.length) return "Order";

    const nums = list.filter((x) => x.number !== null);
    if (nums.length) {
      const prefix = nums[0].prefix || "";
      const samePrefix = nums.every((x) => (x.prefix || "") === prefix);
      const min = Math.min(...nums.map((x) => x.number));
      const max = Math.max(...nums.map((x) => x.number));

      if (min === max) return prefix ? `${prefix}-${min}` : String(min);
      if (samePrefix && prefix) return `${prefix}-${min} : ${prefix}-${max}`;
    }

    const texts = list.map((x) => x.text).filter(Boolean);
    if (!texts.length) return "Order";
    if (texts.length === 1) return texts[0];
    return `${texts[0]} : ${texts[texts.length - 1]}`;
  }

  function operationsSummary(items) {
    const names = new Set(
      (items || [])
        .map((x) => String(x.operationsByName || "").trim())
        .filter(Boolean),
    );
    if (names.size === 0) return "";
    if (names.size === 1) return Array.from(names)[0];
    return "Multiple";
  }

  // Quantity shown to Operations can use the dedicated "Quantity Received by operations" column
  // (if filled). Otherwise we fallback to the base quantity coming from Notion (Quantity Progress / Requested).
  function effectiveQty(it) {
    const rec =
      it &&
      typeof it.quantityReceived === "number" &&
      Number.isFinite(it.quantityReceived)
        ? Number(it.quantityReceived)
        : null;
    const base = Number(it?.quantity) || 0;
    return rec !== null && rec !== undefined ? rec : base;
  }

  // Quantities helpers
  function baseQty(it) {
    const n = Number(it?.quantity);
    return Number.isFinite(n) ? Math.max(0, roundQty(n)) : 0;
  }

  // Raw received quantity from Notion (independent of current tab).
  function receivedQtyRaw(it) {
    const n = Number(it?.quantityReceived);
    if (!Number.isFinite(n)) return null;
    return Math.max(0, roundQty(n));
  }

  // Quantity shown in the UI. In "Not Started" we treat Quantity Progress as the primary value,
  // and we only show a received override if Operations explicitly edited it.
  function receivedQtyDisplay(it) {
    const v = receivedQtyRaw(it);
    if (v === null || v === undefined) return null;
    if (currentTab === "not-started" && !it?.quantityReceivedEdited) return null;
    return v;
  }

  function receivedQtyOrZero(it) {
    const r = receivedQtyRaw(it);
    return r === null || r === undefined ? 0 : r;
  }

  // Remaining quantity. Prefer the dedicated Notion column "Quantity Remaining" if present.
  function remainingQty(it) {
    const stored = Number(it?.quantityRemaining);
    if (Number.isFinite(stored)) return Math.max(0, roundQty(stored));
    return Math.max(roundQty(baseQty(it) - receivedQtyOrZero(it)), 0);
  }

  function hasReceivedNumber(it) {
    return receivedQtyRaw(it) !== null && receivedQtyRaw(it) !== undefined;
  }



  function buildGroups(items) {
    const map = new Map();

    // Sort newest first (createdTime)
    const sorted = (Array.isArray(items) ? items.slice() : []).sort((a, b) => {
      const da = toDate(a.createdTime)?.getTime() || 0;
      const db = toDate(b.createdTime)?.getTime() || 0;
      return db - da;
    });

    // Grouping should match Current Orders behavior:
    // group all components that were created at the same time (to the minute),
    // regardless of per-component Reason (reasons can differ per product).
    const pad2 = (n) => String(n).padStart(2, "0");
    const timeKey = (dateLike) => {
      const d = toDate(dateLike);
      if (!d) return "0";
      const yyyy = d.getFullYear();
      const mm = pad2(d.getMonth() + 1);
      const dd = pad2(d.getDate());
      const hh = pad2(d.getHours());
      const mi = pad2(d.getMinutes());
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
    };

    for (const it of sorted) {
      const created = toDate(it.createdTime);

      // Prefer grouping by Order - ID (Number). Fallback (legacy rows): created-by + created-time (minute).
      const oid = Number(it.orderIdNumber);
      const gKey = Number.isFinite(oid)
        ? `ord:${oid}`
        : [String(it.createdById || "").trim(), timeKey(created)].join("|");

      if (!map.has(gKey)) {
        map.set(gKey, {
          groupId: gKey,
          orderIdNumber: Number.isFinite(oid) ? oid : null,
          createdById: it.createdById || "",
          createdByName: it.createdByName || "",
          // We keep a group-level summary reason for search only.
          // The modal always shows per-item reasons.
          reason: "",
          latestCreated: created ? created.toISOString() : "",
          items: [],
        });
      }
      map.get(gKey).items.push(it);
    }

    // Same summarization idea as Current Orders (helps search UX)
    const summarizeReasons = (itemsArr) => {
      const counts = new Map();
      for (const it of itemsArr || []) {
        const r = String(it?.reason || "").trim();
        if (!r) continue;
        counts.set(r, (counts.get(r) || 0) + 1);
      }
      const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
      const unique = entries.map(([k]) => k);
      if (unique.length === 0) return { title: "", uniqueReasons: [] };
      if (unique.length === 1) return { title: unique[0], uniqueReasons: unique };
      const main = unique[0];
      return { title: `${main} +${unique.length - 1}`, uniqueReasons: unique };
    };

    const groups = Array.from(map.values()).map((g) => {
      const itemsArr = g.items || [];
      // Base totals (same meaning as Current Orders)
      const totalQty = itemsArr.reduce((sum, x) => sum + baseQty(x), 0);
      const estimateTotal = itemsArr.reduce(
        (sum, x) => sum + baseQty(x) * (Number(x.unitPrice) || 0),
        0,
      );

      // Remaining/received breakdown (used by the new "Remaining" tab)
      const receivedTotalQty = itemsArr.reduce((sum, x) => sum + receivedQtyOrZero(x), 0);
      const receivedItemsCount = itemsArr.reduce(
        (sum, x) => sum + (hasReceivedNumber(x) ? 1 : 0),
        0,
      );
      const receivedEstimateTotal = itemsArr.reduce(
        (sum, x) => sum + receivedQtyOrZero(x) * (Number(x.unitPrice) || 0),
        0,
      );
      const remainingTotalQty = itemsArr.reduce((sum, x) => sum + remainingQty(x), 0);
      const remainingItemsCount = itemsArr.reduce((sum, x) => sum + (remainingQty(x) > 0 ? 1 : 0), 0);
      const remainingEstimateTotal = itemsArr.reduce(
        (sum, x) => sum + remainingQty(x) * (Number(x.unitPrice) || 0),
        0,
      );
      const hasRemaining = remainingItemsCount > 0;
      const hasReceived = receivedItemsCount > 0;
      const stage = computeStage(itemsArr);
      const rs = summarizeReasons(itemsArr);

      // Receipt number should be identical for all components in the same order.
      // We pick the first non-null value; if multiple different values exist, show "Multiple".
      const receiptVals = (itemsArr || [])
        .map((x) => (x && x.receiptNumber !== null && x.receiptNumber !== undefined ? x.receiptNumber : null))
        .filter((x) => x !== null && x !== undefined);
      let receiptNumber = null;
      if (receiptVals.length) {
        const set = new Set(receiptVals.map((x) => String(x)));
        receiptNumber = set.size === 1 ? receiptVals[0] : "Multiple";
      }

      return {
        ...g,
        reason: rs.title,
        reasons: rs.uniqueReasons,
        orderIds: itemsArr.map((x) => x.id).filter(Boolean),
        itemsCount: itemsArr.length,
        totalQty,
        estimateTotal,
        receivedTotalQty,
        receivedItemsCount,
        receivedEstimateTotal,
        remainingTotalQty,
        remainingItemsCount,
        remainingEstimateTotal,
        hasRemaining,
        hasReceived,
        stage,
        orderIdRange: computeOrderIdRange(itemsArr),
        operationsByName: operationsSummary(itemsArr),
        receiptNumber,
      };
    });

    // Newest group first
    return groups.sort((a, b) => {
      const da = toDate(a.latestCreated)?.getTime() || 0;
      const db = toDate(b.latestCreated)?.getTime() || 0;
      return db - da;
    });
  }

  // ---------- Rendering ----------
  let allItems = [];
  let groups = [];
  let currentTab = "not-started";
  let activeGroup = null;
  let lastFocus = null;

  function groupMatchesQuery(g, q) {
    if (!q) return true;
    const hay = [
      g.reason,
      ...(Array.isArray(g.reasons) ? g.reasons : []),
      g.orderIdRange,
      g.receiptNumber,
      g.createdByName,
      g.operationsByName,
      ...(g.items || []).map((x) => x.productName),
      ...(g.items || []).map((x) => x.reason),
    ]
      .filter(Boolean)
      .join(" ");
    return norm(hay).includes(q);
  }

  function getFilteredGroups() {
    const q = norm(searchInput?.value || "");
    return (groups || [])
      .filter((g) => {
        const idx = g?.stage?.idx || 1;
        if (currentTab === "not-started") return idx < 4;
        if (currentTab === "remaining") return idx === 4 && !!g?.hasRemaining;
        if (currentTab === "received") return idx === 4 && !!g?.hasReceived;
        if (currentTab === "delivered") return idx >= 5;
        return false;
      })
      .filter((g) => groupMatchesQuery(g, q));
  }

  function renderCard(g) {
    const first = (g.items || [])[0] || {};
    const title = escapeHTML(g.orderIdRange || g.reason || "Order");
    const sub = escapeHTML(fmtDateOnly(g.latestCreated) || "—");
    const createdBy = escapeHTML(String(g.createdByName || first.createdByName || "").trim() || "—");

    const thumbLabel = String(g.orderIdRange || g.reason || "?").trim();
    const thumbHTML = first.productImage
      ? `<img src="${escapeHTML(first.productImage)}" alt="${escapeHTML(first.productName || thumbLabel)}" loading="lazy" />`
      : `<div class="co-thumb__ph">${escapeHTML(thumbLabel.slice(0, 2).toUpperCase())}</div>`;

    const stage = g.stage || computeStage(g.items || []);
    const statusVars = notionColorVars(stage.color);
    const statusStyle = `--tag-bg:${statusVars.bg};--tag-fg:${statusVars.fg};--tag-border:${statusVars.bd};`;

    const receivedBy = String(g.operationsByName || "").trim();
    const receivedLine = receivedBy
      ? `<div class="co-received-by">Received by: ${escapeHTML(receivedBy)}</div>`
      : "";

    // Tab-specific card totals:
    // - Remaining: show only remaining items/cost
    // - Received: show only received items/cost
    const isRemaining = currentTab === "remaining";
    const isReceived = currentTab === "received";
    const displayCount = isRemaining
      ? Number(g.remainingItemsCount) || 0
      : isReceived
        ? Number(g.receivedItemsCount) || 0
        : Number(g.itemsCount) || 0;
    const displayTotal = isRemaining
      ? Number(g.remainingEstimateTotal) || 0
      : isReceived
        ? Number(g.receivedEstimateTotal) || 0
        : Number(g.estimateTotal) || 0;

    const card = document.createElement("article");
    card.className = "co-card";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.dataset.groupId = g.groupId;

    card.innerHTML = `
      <div class="co-top">
        <div class="co-thumb">${thumbHTML}</div>

        <div class="co-main">
          <div class="co-title">${title}</div>
          <div class="co-sub">${sub}</div>
          <div class="co-createdby">${createdBy}</div>
        </div>

        <div class="co-qty">x${Number.isFinite(Number(displayCount)) ? Number(displayCount) : 0}</div>
      </div>

      <div class="co-divider"></div>

      <div class="co-bottom">
        <div class="co-est">
          <div class="co-est-label">Estimate Total</div>
          <div class="co-est-value">${fmtMoney(displayTotal)}</div>
          ${receivedLine}
        </div>

        <div class="co-actions">
          <span class="co-status-btn" style="${statusStyle}">${escapeHTML(stage.label)}</span>
          <span class="co-right-ico" aria-hidden="true"><i data-feather="percent"></i></span>
        </div>
      </div>
    `;

    card.addEventListener("click", () => openOrderModal(g));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openOrderModal(g);
      }
    });

    return card;
  }

  function render() {
    if (!listDiv) return;

    const filtered = getFilteredGroups();
    listDiv.innerHTML = "";

    if (!filtered.length) {
      listDiv.innerHTML = `<p>No orders found.</p>`;
      if (window.feather) window.feather.replace();
      return;
    }

    const frag = document.createDocumentFragment();
    for (const g of filtered) frag.appendChild(renderCard(g));
    listDiv.appendChild(frag);

    if (window.feather) window.feather.replace();
  }

  // ---------- Modal ----------
  function openOrderModal(g) {
    if (!orderModal) return;
    const wasOpen = orderModal.classList.contains("is-open");
    activeGroup = g;

    // Only capture focus when opening the modal the first time.
    if (!wasOpen) lastFocus = document.activeElement;

    // Reset any open UI inside the modal
    closeDownloadMenu();
    closeReceiptModal({ restoreFocus: false });

    const all = g.items || [];
    const stage = g.stage || computeStage(all);

    const isRemainingTab = currentTab === "remaining";
    const isReceivedTab = currentTab === "received";

    // Items shown depend on the active tab:
    // - Remaining: show items that still have remaining qty.
    // - Received: show only items that have a value in "Quantity received by operations".
    // - Others: show all items.
    const items = isRemainingTab
      ? all.filter((it) => remainingQty(it) > 0 || it.justUpdated)
      : isReceivedTab
        ? all.filter((it) => hasReceivedNumber(it))
        : all;

    // Header
    if (modalTitle) modalTitle.textContent = stage.label || "—";
    if (modalSub) modalSub.textContent = stage.sub || "—";

    // Tracker
    setActiveStep(stage.idx || 1);

    // Meta (match Current Orders)
    if (modalReason) modalReason.textContent = String(g.reason || "—").trim() || "—";
    if (modalDate) modalDate.textContent = fmtDateTime(g.latestCreated) || "—";
    if (modalComponents) {
      const c = isRemainingTab
        ? (Number(g.remainingItemsCount) || items.length)
        : isReceivedTab
          ? (Number(g.receivedItemsCount) || items.length)
          : Number(g.itemsCount) || items.length;
      modalComponents.textContent = String(c);
    }
    if (modalTotalPrice) {
      const t = isRemainingTab
        ? (Number(g.remainingEstimateTotal) || items.reduce((sum, x) => sum + remainingQty(x) * (Number(x.unitPrice) || 0), 0))
        : isReceivedTab
          ? (Number(g.receivedEstimateTotal) || items.reduce((sum, x) => sum + receivedQtyOrZero(x) * (Number(x.unitPrice) || 0), 0))
          : Number(g.estimateTotal) || 0;
      modalTotalPrice.textContent = fmtMoney(t);
    }

    // Extra fields: show for "Received" and later only
    // NOTE: User request: in "Not Started" tab hide Receipt/Received-by even if present.
    const shouldShowExtras = currentTab !== "not-started" && (stage?.idx || 1) >= 4;
    const receiptVal = g && (g.receiptNumber !== null && g.receiptNumber !== undefined) ? g.receiptNumber : null;
    const receivedByVal = String(g.operationsByName || "").trim();

    if (receiptRow) receiptRow.hidden = !shouldShowExtras;
    if (modalReceiptNumber) modalReceiptNumber.textContent = receiptVal !== null ? String(receiptVal) : "—";

    if (receivedByRow) receivedByRow.hidden = !shouldShowExtras;
    if (modalOperationsBy) modalOperationsBy.textContent = receivedByVal || "—";

    // Actions visibility
    // - Not Started: show "Received by operations" only before shipping
    // - Remaining: show it again so operations can add another receipt number
    if (shippedBtn) {
      shippedBtn.style.display =
        (currentTab === "not-started" && stage.idx < 4) || currentTab === "remaining"
          ? "inline-flex"
          : "none";
    }
    // Only allow "Delivered" when the order is fully received (no remaining items)
    if (arrivedBtn) arrivedBtn.style.display = stage.idx === 4 && !g.hasRemaining ? "inline-flex" : "none";

    // Items list
    if (modalItems) {
      modalItems.innerHTML = "";
      const frag = document.createDocumentFragment();

      const canEditQty = currentTab === "not-started" || currentTab === "remaining";

      if (isRemainingTab && items.length === 0) {
        const empty = document.createElement("div");
        empty.style.padding = "10px";
        empty.textContent = "No remaining components.";
        frag.appendChild(empty);
      }

      if (!isRemainingTab && currentTab === "received" && items.length === 0) {
        const empty = document.createElement("div");
        empty.style.padding = "10px";
        empty.textContent = "No received components yet.";
        frag.appendChild(empty);
      }

      for (const it of items) {
        const product = escapeHTML(it.productName || "Component");
        const qtyBase = baseQty(it);

        // For Not Started, we only display a received override if it was edited.
        const qtyReceivedDisplay = receivedQtyDisplay(it);
        // For Received tab, we always use the raw received value.
        const qtyReceivedRawVal = receivedQtyRaw(it);

        const qtyEffective =
          isReceivedTab
            ? (qtyReceivedRawVal !== null && qtyReceivedRawVal !== undefined ? qtyReceivedRawVal : qtyBase)
            : (qtyReceivedDisplay !== null && qtyReceivedDisplay !== undefined ? qtyReceivedDisplay : qtyBase);
        const unit = Number(it.unitPrice) || 0;
        const qtyRem = remainingQty(it);

        const total = (isRemainingTab ? qtyRem : qtyEffective) * unit;

        const showStrike =
          !isRemainingTab &&
          !isReceivedTab &&
          qtyReceivedDisplay !== null &&
          qtyReceivedDisplay !== undefined &&
          qtyReceivedDisplay !== qtyBase;

        // Check for pending updates in Remaining tab
        const pendingRem = it.pendingRemaining;
        const pendingAdd = it.pendingReceivedAdd;
        const hasPending = pendingRem !== undefined && pendingRem !== null;

        // In Remaining tab, if user edited the value, we show the *new remaining amount* (pendingRem)
        // next to the old remaining amount.
        const showDiffRemaining = hasPending && Number(pendingRem) !== qtyRem;
        const showDiffJustUpdated = !!(it.justUpdated && it.previousRemaining !== undefined);

        const qtyHTML = isRemainingTab
          ? (showDiffRemaining
              ? `<span class="sv-qty-diff"><span class="sv-qty-old">${escapeHTML(fmtQty(qtyRem))}</span><strong class="sv-qty-new" data-role="qty-val">${escapeHTML(fmtQty(pendingRem))}</strong></span>`
              : showDiffJustUpdated
                ? `<span class="sv-qty-diff"><span class="sv-qty-old">${escapeHTML(fmtQty(it.previousRemaining))}</span><strong class="sv-qty-new" data-role="qty-val">${escapeHTML(fmtQty(qtyRem))}</strong></span>`
                : `<strong data-role="qty-val">${escapeHTML(fmtQty(hasPending ? pendingRem : qtyRem))}</strong>`)
          : showStrike
            ? `<span class="sv-qty-diff"><span class="sv-qty-old">${escapeHTML(fmtQty(qtyBase))}</span><strong class="sv-qty-new" data-role="qty-val">${escapeHTML(fmtQty(qtyReceivedDisplay))}</strong></span>`
            : `<strong data-role="qty-val">${escapeHTML(fmtQty(qtyEffective))}</strong>`;

        const href = safeHttpUrl(it.productUrl);
        const linkHTML = href
          ? `<a class="co-item-link" href="${escapeHTML(href)}" target="_blank" rel="noopener" title="Open link">
               <i data-feather="external-link"></i>
             </a>`
          : "";

        const editBtnHTML = canEditQty
          ? `<button class="btn btn-xs ro-edit ro-edit-inline ro-edit-dark" data-id="${escapeHTML(it.id)}" type="button" title="Edit received qty">
               <i data-feather="edit-2"></i> Edit
             </button>`
          : "";

        const row = document.createElement("div");
        row.className = "co-item";
        row.innerHTML = `
          <div class="co-item-left">
            <div class="co-item-title">
              <div class="co-item-name">${product}</div>
              ${linkHTML}
            </div>
            <div class="co-item-sub">Unit: ${fmtMoney(unit)} · Total: ${fmtMoney(total)}</div>
          </div>
          <div class="co-item-right">
            <div class="co-item-total">${isRemainingTab ? "Qty remaining:" : "Qty:"} ${qtyHTML}</div>
            <div class="co-item-right-row">
              ${editBtnHTML}
            </div>
          </div>
        `;
        frag.appendChild(row);
      }

      modalItems.appendChild(frag);
    }

    // Open
    orderModal.classList.add("is-open");
    document.body.classList.add("co-modal-open");
    orderModal.setAttribute("aria-hidden", "false");

    if (window.feather) window.feather.replace();

    // Focus close button for accessibility
    try {
      modalClose?.focus();
    } catch {}
  }

  function closeOrderModal() {
    if (!orderModal) return;

    // Close any open dropdown/sub-modals first
    closeReceiptModal({ restoreFocus: false });
    closeDownloadMenu();

    orderModal.classList.remove("is-open");
    document.body.classList.remove("co-modal-open");
    orderModal.setAttribute("aria-hidden", "true");

    if (activeGroup && activeGroup.items) {
      activeGroup.items.forEach((it) => {
        delete it.justUpdated;
        delete it.previousRemaining;
      });
    }

    activeGroup = null;

    try {
      if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
    } catch {}
  }

  // ---------- Download dropdown helpers (single Download button) ----------
  function closeDownloadMenu() {
    if (!downloadMenuPanel) return;
    downloadMenuPanel.hidden = true;
    if (downloadMenuBtn) downloadMenuBtn.setAttribute("aria-expanded", "false");
  }

  function openDownloadMenu() {
    if (!downloadMenuPanel) return;
    downloadMenuPanel.hidden = false;
    if (downloadMenuBtn) downloadMenuBtn.setAttribute("aria-expanded", "true");
    if (window.feather) window.feather.replace();
  }

  function toggleDownloadMenu() {
    if (!downloadMenuPanel) return;
    if (downloadMenuPanel.hidden) openDownloadMenu();
    else closeDownloadMenu();
  }

  // ---------- Receipt sub-modal helpers ----------
  let receiptLastFocus = null;

  function setReceiptError(message) {
    if (!receiptError) return;
    receiptError.textContent = String(message || "");
  }

  function isReceiptOpen() {
    return !!receiptModal && receiptModal.classList.contains("is-open");
  }

  function openReceiptModal() {
    if (!receiptModal || !receiptInput || !receiptConfirmBtn || !receiptCancelBtn) {
      // Fallback to prompt
      const raw = window.prompt("Enter receipt number:");
      if (raw === null) return;
      const val = String(raw).trim();
      if (!val) {
        alert("Please enter a valid receipt number.");
        return;
      }
      markReceivedByOperations(activeGroup, val);
      return;
    }

    // Reset
    setReceiptError("");
    // Do NOT pre-fill the input. Receipt Number is stored as rich_text and may contain
    // multiple values (one per delivery). We want the user to enter a new number each time.
    receiptInput.value = "";

    receiptConfirmBtn.disabled = false;
    receiptCancelBtn.disabled = false;
    if (receiptCloseBtn) receiptCloseBtn.disabled = false;

    receiptLastFocus = document.activeElement;
    receiptModal.hidden = false;
    receiptModal.classList.add("is-open");
    receiptModal.setAttribute("aria-hidden", "false");

    if (window.feather) window.feather.replace();

    window.requestAnimationFrame(() => {
      try {
        receiptInput.focus();
        receiptInput.select();
      } catch {}
    });
  }

  function closeReceiptModal({ restoreFocus = true } = {}) {
    if (!receiptModal) return;
    if (!isReceiptOpen() && receiptModal.hidden) return;
    receiptModal.classList.remove("is-open");
    receiptModal.setAttribute("aria-hidden", "true");
    receiptModal.hidden = true;
    setReceiptError("");

    if (restoreFocus) {
      try {
        if (receiptLastFocus && typeof receiptLastFocus.focus === "function") receiptLastFocus.focus();
      } catch {}
    }
    receiptLastFocus = null;
  }

  // ---------- Actions ----------
  async function downloadExcel(g) {
  if (!g || !g.orderIds || !g.orderIds.length) return;

  if (excelBtn) {
    excelBtn.disabled = true;
    excelBtn.dataset.prevHtml = excelBtn.innerHTML;
    excelBtn.textContent = "Preparing...";
  }

  try {
    const res = await fetch("/api/orders/requested/export/excel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ orderIds: g.orderIds }),
    });

    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to export Excel");
    }

    const blob = await res.blob();

    // Try to extract filename from content-disposition
    const cd = res.headers.get("content-disposition") || "";
    const m = cd.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
    const filename = decodeURIComponent((m && (m[1] || m[2])) || "operations_orders.xlsx");

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    toast("success", "Downloaded", "Excel exported successfully.");
  } catch (e) {
    console.error(e);
    alert(e.message || "Failed to export Excel");
  } finally {
    if (excelBtn) {
      excelBtn.disabled = false;
      const prev = excelBtn.dataset.prevHtml;
      if (prev) excelBtn.innerHTML = prev;
      else excelBtn.textContent = "Download Excel";
    }
  }
}

  async function downloadPdf(g) {
    if (!g || !g.orderIds || !g.orderIds.length) return;

    if (pdfBtn) {
      pdfBtn.disabled = true;
      pdfBtn.dataset.prevHtml = pdfBtn.innerHTML;
      pdfBtn.textContent = "Preparing...";
    }

    try {
      const res = await fetch("/api/orders/requested/export/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ orderIds: g.orderIds }),
      });

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to export PDF");
      }

      const blob = await res.blob();

      // filename from content-disposition
      const cd = res.headers.get("content-disposition") || "";
      let filename = "order.pdf";
      const m = cd.match(/filename\*=UTF-8''([^;]+)|filename=\"?([^;\"]+)\"?/i);
      if (m) filename = decodeURIComponent(m[1] || m[2] || filename);

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast("success", "Downloaded", "PDF downloaded.");
    } catch (e) {
      console.error(e);
      alert(e.message || "Failed to export PDF");
    } finally {
      if (pdfBtn) {
        pdfBtn.disabled = false;
        const prev = pdfBtn.dataset.prevHtml;
        if (prev) pdfBtn.innerHTML = prev;
        else pdfBtn.textContent = "Download PDF";
      }
    }
  }

async function postJson(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      throw new Error(data.error || "Request failed");
    }
    return data;
  }

    // ===== Edit quantity (writes to Notion: "Quantity Received by operations") =====
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

  async function updateReceivedQty(itemId, value) {
    const id = String(itemId || "").trim();
    if (!id) throw new Error("Missing item id.");
    return postJson(`/api/orders/requested/${encodeURIComponent(id)}/received-quantity`, { value });
  }

  async function openQtyPopover(btn, id, mode = "set") {
    if (!btn || !id) return;
    if (popEl && popForId === id) { destroyPopover(); return; }
    destroyPopover();
    popForId = id; popAnchor = btn;

    const isAddMode = String(mode || "set") === "add";

    const it = allItems.find((x) => String(x.id) === String(id));
    const base = baseQty(it);
    const recRaw = receivedQtyDisplay(it);
    const rec = receivedQtyOrZero(it);
    const rem = remainingQty(it);

    const currentVal = isAddMode
      ? rem
      : (recRaw !== null && recRaw !== undefined ? recRaw : base);
    const maxVal = isAddMode ? rem : null;

    popEl = document.createElement("div");
    popEl.className = "sv-qty-popover";
    popEl.innerHTML = `
      <div class="sv-qty-popover__arrow"></div>
      <div class="sv-qty-popover__body">
        ${isAddMode ? `<div class="sv-qty-hint">Receive quantity (remaining: ${escapeHTML(fmtQty(rem))})</div>` : ""}
        <div class="sv-qty-row">
          <button class="sv-qty-btn sv-qty-dec" type="button" aria-label="Decrease">−</button>
          <input class="sv-qty-input" type="number" min="0" step="any" ${maxVal !== null ? `max="${escapeHTML(String(maxVal))}"` : ""} value="${escapeHTML(fmtQty(currentVal))}" />
          <button class="sv-qty-btn sv-qty-inc" type="button" aria-label="Increase">+</button>
        </div>
        <div class="sv-qty-actions">
          <button class="btn btn-success btn-xs ro-qty-save">${isAddMode ? "Receive" : "Save"}</button>
          <button class="btn btn-danger btn-xs ro-qty-cancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(popEl);
    placePopoverNear(btn);

    const input  = popEl.querySelector(".sv-qty-input");
    const decBtn = popEl.querySelector(".sv-qty-dec");
    const incBtn = popEl.querySelector(".sv-qty-inc");
    const saveBtn= popEl.querySelector(".ro-qty-save");
    const cancel = popEl.querySelector(".ro-qty-cancel");

    input.focus(); input.select();

    const clamp = (n) => {
      const raw = Number(n);
      const v = Number.isFinite(raw) ? Math.max(0, raw) : 0;
      const r = roundQty(v);
      if (maxVal !== null) return Math.min(roundQty(maxVal), r);
      return r;
    };

    decBtn.addEventListener("click", () => { input.value = fmtQty(clamp((Number(input.value) || 0) - 1)); });
    incBtn.addEventListener("click", () => { input.value = fmtQty(clamp((Number(input.value) || 0) + 1)); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") saveBtn.click(); });

    saveBtn.addEventListener("click", async () => {
      const v = clamp(input.value);
      try {
        const newReceived = isAddMode ? roundQty(Math.min(base, rec + v)) : v;

        // For "Remaining" tab, we delay the API call until "Received by operations" is clicked.
        if (currentTab === "remaining") {
          const idx = allItems.findIndex((x) => String(x.id) === String(id));
          if (idx >= 0) {
            allItems[idx].pendingReceived = newReceived;
            allItems[idx].pendingReceivedAdd = v; // used for display context if needed
            allItems[idx].pendingRemaining = Math.max(0, roundQty(base - newReceived));
          }

          // Re-render to show pending state
          groups = buildGroups(allItems);
          const updated = activeGroup ? groups.find((x) => x.groupId === activeGroup.groupId) : null;
          render();
          if (updated && orderModal?.classList.contains("is-open")) {
            openOrderModal(updated);
          }

          toast("success", "Pending", "Update pending confirmation.");
          destroyPopover();
          return;
        }

        await updateReceivedQty(id, newReceived);

        // update in-memory data
        const idx = allItems.findIndex((x) => String(x.id) === String(id));
        if (idx >= 0) {
          allItems[idx].quantityReceived = newReceived;
          // Mark as an explicit ops edit (used to decide strike-through in "Not Started")
          allItems[idx].quantityReceivedEdited = true;
          // best-effort mirror for UI; backend is source of truth
          allItems[idx].quantityRemaining = Math.max(0, roundQty(base - newReceived));
        }

        // rebuild + rerender (keep modal open)
        groups = buildGroups(allItems);
        const updated = activeGroup ? groups.find((x) => x.groupId === activeGroup.groupId) : null;

        // If we just completed all remaining items, move the user to the "Received" tab automatically.
        if (currentTab === "remaining" && updated && !updated.hasRemaining) {
          currentTab = "received";
          updateTabUI();
        }

        render();

        if (updated && orderModal?.classList.contains("is-open")) {
          openOrderModal(updated);
        }

        toast("success", "Updated", "Quantity updated.");
        destroyPopover();
      } catch (e) {
        console.error(e);
        toast("error", "Failed", e.message || "Failed to update quantity.");
      }
    });

    cancel.addEventListener("click", destroyPopover);

    setTimeout(() => {
      document.addEventListener("pointerdown", onDocPointerDown, true);
      document.addEventListener("keydown", onPopEsc, true);
    }, 0);
  }

async function markReceivedByOperations(g, receiptNumber) {
    if (!g || !g.orderIds?.length) return;

    // Receipt number can be text now (Notion column is rich_text) so we keep it as string.
    // If missing, we still allow the action.
    const rnText =
      receiptNumber === null || receiptNumber === undefined
        ? ""
        : String(receiptNumber).trim();
    const rnVal = rnText ? rnText : null;

    if (shippedBtn) {
      shippedBtn.disabled = true;
      shippedBtn.dataset.prevHtml = shippedBtn.innerHTML;
      shippedBtn.textContent = "Receiving...";
    }

    try {
      // Collect quantity updates for the items in this group.
      //
      // IMPORTANT (Remaining tab behavior):
      // - Default: add the current "Quantity Remaining" to "Quantity Received by operations"
      // - If the user edited the remaining qty (popover), we add the edited value instead.
      //
      // The backend expects *absolute* received totals per item (not the delta),
      // so we send the final received number for each affected item.
      const quantities = {};
      const isRemainingTab = currentTab === "remaining";

      (g.items || []).forEach((it) => {
        const id = String(it?.id || "").trim();
        if (!id) return;

        const base = baseQty(it);
        const clampToBase = (n) => (base > 0 ? Math.min(base, n) : n);

        // If the user edited this item in Remaining tab, use the pending absolute received value.
        if (it.pendingReceived !== undefined && it.pendingReceived !== null) {
          const raw = Number(it.pendingReceived);
          const v = Number.isFinite(raw) ? Math.max(0, roundQty(raw)) : 0;
          quantities[id] = clampToBase(v);
          return;
        }

        // Remaining tab default: receive the full remaining quantity.
        if (isRemainingTab) {
          const recNow = receivedQtyOrZero(it);
          const remNow = remainingQty(it);

          // Only update items that still have remaining qty.
          if (remNow > 0) {
            const nextReceived = clampToBase(Math.max(0, roundQty(recNow + remNow)));
            quantities[id] = nextReceived;
          }
        }
      });

      const data = await postJson("/api/orders/requested/mark-shipped", {
        orderIds: g.orderIds,
        receiptNumber: rnVal,
        quantities,
      });

      // Update local state (set status = Shipped + operationsByName)
      const username = String(data.operationsByName || localStorage.getItem("username") || "").trim();
      const idSet = new Set(g.orderIds);

      allItems.forEach((it) => {
        if (!idSet.has(it.id)) return;

        // Capture previous state for visual feedback in Remaining tab
        it.previousRemaining = remainingQty(it);
        it.justUpdated = true;

        it.status = "Shipped";
        it.statusColor = data.statusColor || it.statusColor;
        if (username) it.operationsByName = username;
        if (data.receiptNumber !== null && data.receiptNumber !== undefined) {
          it.receiptNumber = data.receiptNumber;
        }

        const base = baseQty(it);

        // Remaining tab: apply the new absolute received totals we just confirmed.
        // This ensures "Quantity Remaining" is subtracted correctly.
        if (currentTab === "remaining") {
          const hasQty = Object.prototype.hasOwnProperty.call(quantities || {}, it.id);
          if (hasQty) {
            const raw = Number(quantities[it.id]);
            const nextReceived = Number.isFinite(raw) ? Math.max(0, roundQty(raw)) : 0;
            it.quantityReceived = base > 0 ? Math.min(base, nextReceived) : nextReceived;
            it.quantityReceivedEdited = true;
            it.quantityRemaining = Math.max(0, roundQty(base - it.quantityReceived));

            // Clear any pending UI state for this item
            delete it.pendingReceived;
            delete it.pendingRemaining;
            delete it.pendingReceivedAdd;
          } else {
            // No quantity update for this item; keep values but ensure remaining is consistent.
            const rec = receivedQtyOrZero(it);
            it.quantityRemaining = Math.max(0, roundQty(base - rec));
          }
          return;
        }

        // Non-Remaining tabs (existing behavior):
        // - If item was never edited, fill full base qty.
        // - If edited, keep the edited value.
        // - If there was a pending update (rare outside Remaining), apply it.
        if (it.pendingReceived !== undefined && it.pendingReceived !== null) {
          const raw = Number(it.pendingReceived);
          it.quantityReceived = Number.isFinite(raw) ? Math.max(0, roundQty(raw)) : 0;
          it.quantityReceivedEdited = true;
          delete it.pendingReceived;
          delete it.pendingRemaining;
          delete it.pendingReceivedAdd;
        }

        const edited = !!it.quantityReceivedEdited;
        if (!edited) {
          it.quantityReceived = base;
          it.quantityRemaining = 0;
        } else {
          const rec = receivedQtyOrZero(it);
          it.quantityRemaining = Math.max(0, roundQty(base - rec));
        }
      });

      groups = buildGroups(allItems);
      render();

      // Keep modal open and refreshed
      const updated = groups.find((x) => x.groupId === g.groupId);
      if (updated && orderModal?.classList.contains("is-open")) {
        openOrderModal(updated);
      }

      toast("success", "Received", "Marked as received by operations.");

      // Close receipt prompt (if opened)
      closeReceiptModal({ restoreFocus: false });
    } catch (e) {
      console.error(e);
      alert(e.message || "Failed to mark as received.");
    } finally {
      if (shippedBtn) {
        shippedBtn.disabled = false;
        const prev = shippedBtn.dataset.prevHtml;
        if (prev) shippedBtn.innerHTML = prev;
        else shippedBtn.textContent = "Received by operations";
      }
    }
  }

  async function markArrived(g) {
    if (!g || !g.orderIds?.length) return;

    if (arrivedBtn) {
      arrivedBtn.disabled = true;
      arrivedBtn.dataset.prevHtml = arrivedBtn.innerHTML;
      arrivedBtn.textContent = "Marking...";
    }

    try {
      const data = await postJson("/api/orders/requested/mark-arrived", { orderIds: g.orderIds });

      const idSet = new Set(g.orderIds);
      allItems.forEach((it) => {
        if (!idSet.has(it.id)) return;
        it.status = "Arrived";
        it.statusColor = data.statusColor || it.statusColor;
      });

      groups = buildGroups(allItems);
      render();

      const updated = groups.find((x) => x.groupId === g.groupId);
      if (updated && orderModal?.classList.contains("is-open")) {
        openOrderModal(updated);
      }

      toast("success", "Delivered", "Marked as delivered.");
    } catch (e) {
      console.error(e);
      alert(e.message || "Failed to mark as delivered.");
    } finally {
      if (arrivedBtn) {
        arrivedBtn.disabled = false;
        const prev = arrivedBtn.dataset.prevHtml;
        if (prev) arrivedBtn.innerHTML = prev;
        else arrivedBtn.textContent = "Received";
      }
    }
  }

  // ---------- Load data ----------
  async function loadRequested() {
    if (listDiv) {
      listDiv.innerHTML = `
        <div class="modern-loading" role="status" aria-live="polite">
          <div class="modern-loading__spinner" aria-hidden="true"></div>
          <div class="modern-loading__text">
            Loading requested orders
            <span class="modern-loading__dots" aria-hidden="true"><span></span><span></span><span></span></span>
          </div>
        </div>
      `;
      if (window.feather) window.feather.replace();
    }

    const res = await fetch("/api/orders/requested", {
      credentials: "same-origin",
      cache: "no-store",
    });

    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to fetch requested orders");
    }

    const data = await res.json().catch(() => []);
    allItems = Array.isArray(data) ? data : [];
    groups = buildGroups(allItems);
    render();
  }

  // ---------- Events ----------
  searchInput?.addEventListener("input", render);
  searchInput?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      searchInput.value = "";
      render();
    }
  });

  tabsWrap?.addEventListener("click", (e) => {
    const a = e.target?.closest?.("a.tab-portfolio");
    if (!a) return;
    const t = norm(a.getAttribute("data-tab"));
    if (t) {
      currentTab = t;
      updateTabUI();
      render();
    }
  });

  modalClose?.addEventListener("click", closeOrderModal);
  orderModal?.addEventListener("click", (e) => {
    if (e.target === orderModal) closeOrderModal();
  });

  // Download dropdown
  if (downloadMenuBtn && downloadMenuPanel && downloadMenuWrap) {
    downloadMenuBtn.addEventListener("click", (e) => {
      e.preventDefault();
      toggleDownloadMenu();
    });

    // Click outside closes
    document.addEventListener("click", (e) => {
      if (!downloadMenuPanel || downloadMenuPanel.hidden) return;
      if (downloadMenuWrap.contains(e.target)) return;
      closeDownloadMenu();
    });
  }

  // Receipt modal: click outside closes
  receiptModal?.addEventListener("click", (e) => {
    if (e.target === receiptModal) closeReceiptModal();
  });

  // Global Esc handling (close sub-modal -> dropdown -> main modal)
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;

    if (isReceiptOpen()) {
      e.preventDefault();
      closeReceiptModal();
      return;
    }

    if (downloadMenuPanel && !downloadMenuPanel.hidden) {
      e.preventDefault();
      closeDownloadMenu();
      return;
    }

    if (orderModal?.classList.contains("is-open")) {
      e.preventDefault();
      closeOrderModal();
    }
  });

  modalItems?.addEventListener("click", (e) => {
    const btn = e.target.closest("button.ro-edit");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    openQtyPopover(btn, btn.dataset.id, currentTab === "remaining" ? "add" : "set");
  });

  excelBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    closeDownloadMenu();
    downloadExcel(activeGroup);
  });
  pdfBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    closeDownloadMenu();
    downloadPdf(activeGroup);
  });

  // "Received by operations" now asks for a receipt number first
  shippedBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    closeDownloadMenu();
    openReceiptModal();
  });
  arrivedBtn?.addEventListener("click", () => markArrived(activeGroup));

  receiptCloseBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    closeReceiptModal();
  });
  receiptCancelBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    closeReceiptModal();
  });

  receiptInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") receiptConfirmBtn?.click();
  });

  receiptConfirmBtn?.addEventListener("click", async (e) => {
    e.preventDefault();

    const raw = String(receiptInput?.value || "").trim();
    if (!raw) {
      setReceiptError("Receipt number is required.");
      return;
    }

    // Keep it as text (Notion Receipt Number is rich_text now).
    // We still validate it's numeric to match the expected workflow.
    if (!/^\d+$/.test(raw)) {
      setReceiptError("Please enter a valid receipt number.");
      return;
    }

    setReceiptError("");

    // Disable sub-modal buttons while saving
    if (receiptConfirmBtn) receiptConfirmBtn.disabled = true;
    if (receiptCancelBtn) receiptCancelBtn.disabled = true;
    if (receiptCloseBtn) receiptCloseBtn.disabled = true;

    try {
      await markReceivedByOperations(activeGroup, raw);
    } finally {
      // Buttons are re-enabled when the modal opens again; keep it simple.
      // (closeReceiptModal is called on success)
      if (receiptConfirmBtn) receiptConfirmBtn.disabled = false;
      if (receiptCancelBtn) receiptCancelBtn.disabled = false;
      if (receiptCloseBtn) receiptCloseBtn.disabled = false;
    }
  });

  // ---------- Init ----------
  currentTab = readTabFromUrl();
  updateTabUI();

  loadRequested().catch((e) => {
    console.error(e);
    if (listDiv) listDiv.innerHTML = `<p style="color:#B91C1C;">${escapeHTML(e.message || "Failed to load")}</p>`;
  });
});
