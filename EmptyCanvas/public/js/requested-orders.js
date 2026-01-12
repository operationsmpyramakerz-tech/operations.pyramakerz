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

  const modalOrderId = document.getElementById("reqModalOrderId");
  const modalCreatedBy = document.getElementById("reqModalCreatedBy");
  const modalDate = document.getElementById("reqModalDate");
  const modalOperationsBy = document.getElementById("reqModalOperationsBy");
  const modalComponents = document.getElementById("reqModalComponents");
  const modalTotalQty = document.getElementById("reqModalTotalQty");
  const modalTotalPrice = document.getElementById("reqModalTotalPrice");
  const modalItems = document.getElementById("reqModalItems");
  const excelBtn =
    document.getElementById("reqExcelBtn") ||
    document.getElementById("reqDownloadExcelBtn");
  const pdfBtn =
    document.getElementById("reqPdfBtn") ||
    document.getElementById("reqDownloadPdfBtn");
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
    const allowed = new Set(["not-started", "received", "delivered"]);
    return allowed.has(tab) ? tab : "not-started";
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
      const gKey = [String(it.createdById || "").trim(), timeKey(created)].join("|");

      if (!map.has(gKey)) {
        map.set(gKey, {
          groupId: gKey,
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
      const totalQty = itemsArr.reduce((sum, x) => sum + effectiveQty(x), 0);
      const estimateTotal = itemsArr.reduce(
        (sum, x) => sum + effectiveQty(x) * (Number(x.unitPrice) || 0),
        0,
      );
      const stage = computeStage(itemsArr);
      const rs = summarizeReasons(itemsArr);

      return {
        ...g,
        reason: rs.title,
        reasons: rs.uniqueReasons,
        orderIds: itemsArr.map((x) => x.id).filter(Boolean),
        itemsCount: itemsArr.length,
        totalQty,
        estimateTotal,
        stage,
        orderIdRange: computeOrderIdRange(itemsArr),
        operationsByName: operationsSummary(itemsArr),
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
      .filter((g) => tabFromStageIdx(g.stage?.idx || 1) === currentTab)
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

        <div class="co-qty">x${Number.isFinite(Number(g.itemsCount)) ? Number(g.itemsCount) : 0}</div>
      </div>

      <div class="co-divider"></div>

      <div class="co-bottom">
        <div class="co-est">
          <div class="co-est-label">Estimate Total</div>
          <div class="co-est-value">${fmtMoney(g.estimateTotal)}</div>
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
    activeGroup = g;
    lastFocus = document.activeElement;

    const items = g.items || [];
    const stage = g.stage || computeStage(items);

    // Header
    if (modalTitle) modalTitle.textContent = stage.label || "—";
    if (modalSub) modalSub.textContent = stage.sub || "—";

    // Tracker
    setActiveStep(stage.idx || 1);

    // Meta
    if (modalOrderId) modalOrderId.textContent = g.orderIdRange || "—";
    if (modalCreatedBy) modalCreatedBy.textContent = g.createdByName || "—";
    if (modalDate) modalDate.textContent = fmtDateTime(g.latestCreated) || "—";
    if (modalOperationsBy) modalOperationsBy.textContent = g.operationsByName || "—";
    if (modalComponents) modalComponents.textContent = String(g.itemsCount || 0);
    if (modalTotalQty) modalTotalQty.textContent = String(g.totalQty || 0);
    if (modalTotalPrice) modalTotalPrice.textContent = fmtMoney(g.estimateTotal);

    // Actions visibility
    if (excelBtn) excelBtn.style.display = "inline-flex";
    if (pdfBtn) pdfBtn.style.display = "inline-flex";

    if (shippedBtn) shippedBtn.style.display = stage.idx < 4 ? "inline-flex" : "none";
    if (arrivedBtn) arrivedBtn.style.display = stage.idx === 4 ? "inline-flex" : "none";

    // Items list
    if (modalItems) {
      modalItems.innerHTML = "";
      const frag = document.createDocumentFragment();

      const canEditQty = (stage?.idx || 1) < 4;

      for (const it of items) {
        const product = escapeHTML(it.productName || "Component");
        const reason = escapeHTML(it.reason || "");
        const qtyBase = Number(it.quantity) || 0;
        const qtyReceived =
          typeof it.quantityReceived === "number" && Number.isFinite(it.quantityReceived)
            ? Number(it.quantityReceived)
            : null;
        const qtyEffective = qtyReceived !== null && qtyReceived !== undefined ? qtyReceived : qtyBase;
        const unit = Number(it.unitPrice) || 0;
        const total = qtyEffective * unit;

        const showReceived = qtyReceived !== null && qtyReceived !== undefined && qtyReceived !== qtyBase;
        const qtyHTML = showReceived
          ? `<span class="sv-qty-diff"><span class="sv-qty-old">${escapeHTML(String(qtyBase))}</span><strong class="sv-qty-new" data-role="qty-val">${escapeHTML(String(qtyReceived))}</strong></span>`
          : `<strong data-role="qty-val">${escapeHTML(String(qtyEffective))}</strong>`;

        const stVars = notionColorVars(it.statusColor);
        const stStyle = `--tag-bg:${stVars.bg};--tag-fg:${stVars.fg};--tag-border:${stVars.bd};`;

        const href = safeHttpUrl(it.productUrl);
        const linkHTML = href
          ? `<a class="co-item-link" href="${escapeHTML(href)}" target="_blank" rel="noopener" title="Open link">
               <i data-feather="external-link"></i>
             </a>`
          : "";

        const editBtnHTML = canEditQty
          ? `<button class="btn btn-warning btn-xs ro-edit ro-edit-inline" data-id="${escapeHTML(it.id)}" type="button" title="Edit received qty">
               <i data-feather="edit-2"></i> Edit
             </button>`
          : "";

        const row = document.createElement("div");
        row.className = "co-item";
        row.innerHTML = `
          <div class="co-item-left">
            <div class="co-item-name">
              <span>${product}</span>
              ${linkHTML}
            </div>
            <div class="co-item-sub">Reason: ${reason} · Qty: ${qtyHTML} · Unit: ${fmtMoney(unit)}</div>
          </div>
          <div class="co-item-right">
            <div class="co-item-total">${fmtMoney(total)}</div>
            <div class="co-item-right-row">
              <div class="co-item-status" style="${stStyle}">${escapeHTML(it.status || "—")}</div>
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
    orderModal.classList.remove("is-open");
    document.body.classList.remove("co-modal-open");
    orderModal.setAttribute("aria-hidden", "true");
    activeGroup = null;

    try {
      if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
    } catch {}
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

  async function openQtyPopover(btn, id) {
    if (!btn || !id) return;
    if (popEl && popForId === id) { destroyPopover(); return; }
    destroyPopover();
    popForId = id; popAnchor = btn;

    const it = allItems.find((x) => String(x.id) === String(id));
    const base = Number(it?.quantity) || 0;
    const rec =
      it &&
      typeof it.quantityReceived === "number" &&
      Number.isFinite(it.quantityReceived)
        ? Number(it.quantityReceived)
        : null;

    const currentVal = rec !== null && rec !== undefined ? rec : base;

    popEl = document.createElement("div");
    popEl.className = "sv-qty-popover";
    popEl.innerHTML = `
      <div class="sv-qty-popover__arrow"></div>
      <div class="sv-qty-popover__body">
        <div class="sv-qty-row">
          <button class="sv-qty-btn sv-qty-dec" type="button" aria-label="Decrease">−</button>
          <input class="sv-qty-input" type="number" min="0" step="1" value="${escapeHTML(String(currentVal))}" />
          <button class="sv-qty-btn sv-qty-inc" type="button" aria-label="Increase">+</button>
        </div>
        <div class="sv-qty-actions">
          <button class="btn btn-success btn-xs ro-qty-save">Save</button>
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

    decBtn.addEventListener("click", () => { input.value = Math.max(0, (Number(input.value) || 0) - 1); });
    incBtn.addEventListener("click", () => { input.value = Math.max(0, (Number(input.value) || 0) + 1); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") saveBtn.click(); });

    saveBtn.addEventListener("click", async () => {
      const v = Math.max(0, Math.floor(Number(input.value) || 0));
      try {
        await updateReceivedQty(id, v);

        // update in-memory data
        const idx = allItems.findIndex((x) => String(x.id) === String(id));
        if (idx >= 0) allItems[idx].quantityReceived = v;

        // rebuild + rerender (keep modal open)
        groups = buildGroups(allItems);
        render();

        if (activeGroup && orderModal?.classList.contains("is-open")) {
          const updated = groups.find((x) => x.groupId === activeGroup.groupId);
          if (updated) openOrderModal(updated);
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

async function markReceivedByOperations(g) {
    if (!g || !g.orderIds?.length) return;

    if (shippedBtn) {
      shippedBtn.disabled = true;
      shippedBtn.dataset.prevHtml = shippedBtn.innerHTML;
      shippedBtn.textContent = "Receiving...";
    }

    try {
      const data = await postJson("/api/orders/requested/mark-shipped", { orderIds: g.orderIds });

      // Update local state (set status = Shipped + operationsByName)
      const username = String(data.operationsByName || localStorage.getItem("username") || "").trim();
      const idSet = new Set(g.orderIds);

      allItems.forEach((it) => {
        if (!idSet.has(it.id)) return;
        it.status = "Shipped";
        it.statusColor = data.statusColor || it.statusColor;
        if (username) it.operationsByName = username;
      });

      groups = buildGroups(allItems);
      render();

      // Keep modal open and refreshed
      const updated = groups.find((x) => x.groupId === g.groupId);
      if (updated && orderModal?.classList.contains("is-open")) {
        openOrderModal(updated);
      }

      toast("success", "Received", "Marked as received by operations.");
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
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && orderModal?.classList.contains("is-open")) closeOrderModal();
  });

  modalItems?.addEventListener("click", (e) => {
    const btn = e.target.closest("button.ro-edit");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    openQtyPopover(btn, btn.dataset.id);
  });

  excelBtn?.addEventListener("click", () => downloadExcel(activeGroup));
  pdfBtn?.addEventListener("click", () => downloadPdf(activeGroup));
  shippedBtn?.addEventListener("click", () => markReceivedByOperations(activeGroup));
  arrivedBtn?.addEventListener("click", () => markArrived(activeGroup));

  // ---------- Init ----------
  currentTab = readTabFromUrl();
  updateTabUI();

  loadRequested().catch((e) => {
    console.error(e);
    if (listDiv) listDiv.innerHTML = `<p style="color:#B91C1C;">${escapeHTML(e.message || "Failed to load")}</p>`;
  });
});
