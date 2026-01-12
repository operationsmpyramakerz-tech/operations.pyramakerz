/* public/js/sv-orders.js
   S.V schools orders — render using the same card UI as Current Orders.
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

  // Modal
  const modalOverlay = document.getElementById("svOrderModal");
  const modalCloseBtn = document.getElementById("svModalClose");
  const modalEls = {
    title: document.getElementById("svModalTitle"),
    sub: document.getElementById("svModalSub"),
    orderId: document.getElementById("svModalOrderId"),
    date: document.getElementById("svModalDate"),
    approval: document.getElementById("svModalApproval"),
    components: document.getElementById("svModalComponents"),
    totalQty: document.getElementById("svModalTotalQty"),
    totalPrice: document.getElementById("svModalTotalPrice"),
    items: document.getElementById("svModalItems"),
  };

  // ===== Helpers =====
  const qs = new URLSearchParams(location.search);
  let TAB = (qs.get("tab") || "not-started").toLowerCase();

  const norm = (s) => String(s || "").toLowerCase().trim();
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

  function fmtMoney(value) {
    const n = Number(value);
    const safe = Number.isFinite(n) ? n : 0;
    if (moneyFmt) return moneyFmt.format(safe);
    return `£${safe.toFixed(2)}`;
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
    async get(url) {
      const res = await fetch(url, { credentials: "include", cache: "no-store" });
      if (res.status === 401) {
        window.location.href = "/login";
        return null;
      }
      if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
      return await res.json();
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
      const key = `${timeKey(o.createdTime)}|${o.teamMemberId || ""}`;
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

    const thumbLabel = String(group.orderIdRange || group.reason || "?").trim();
    const thumbHTML = first.productImage
      ? `<img src="${escapeHTML(first.productImage)}" alt="${escapeHTML(first.productName || thumbLabel)}" loading="lazy" />`
      : `<div class="co-thumb__ph">${escapeHTML(thumbLabel.slice(0, 2).toUpperCase())}</div>`;

    const card = document.createElement("article");
    card.className = "co-card";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.dataset.groupId = group.groupId;

    card.innerHTML = `
      <div class="co-top">
        <div class="co-thumb">${thumbHTML}</div>

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
    if (modalEls.title) modalEls.title.textContent = approval;
    if (modalEls.sub) modalEls.sub.textContent = approvalSubtitle(approval);

    // Tracking progress (operations status) — always show in all tabs
    const stage = computeStage(group.products || []);
    setSVProgress(stage.idx);

    if (modalEls.orderId) modalEls.orderId.textContent = group.orderIdRange || "—";
    if (modalEls.date) modalEls.date.textContent = fmtCreated(group.latestCreated) || "—";
    if (modalEls.approval) {
      modalEls.approval.textContent = approval;
      modalEls.approval.classList.add("sv-approval-pill");
      const aVars = notionColorVars(group.approvalColor);
      modalEls.approval.style.setProperty("--tag-bg", aVars.bg);
      modalEls.approval.style.setProperty("--tag-fg", aVars.fg);
      modalEls.approval.style.setProperty("--tag-border", aVars.bd);
    }
    if (modalEls.components) modalEls.components.textContent = String((group.products || []).length);
    if (modalEls.totalQty) modalEls.totalQty.textContent = String(group.totals?.totalQty ?? 0);
    if (modalEls.totalPrice) modalEls.totalPrice.textContent = fmtMoney(group.totals?.estimateTotal ?? 0);

    if (modalEls.items) {
      const items = group.products || [];
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
            ? `<span class="sv-qty-diff"><span class="sv-qty-old">${escapeHTML(String(qtyReq))}</span><strong class="sv-qty-new" data-role="qty-val">${escapeHTML(String(qtyEdited))}</strong></span>`
            : `<strong data-role="qty-val">${escapeHTML(String(qtyReq))}</strong>`;

          const pillVars = notionColorVars(it.approvalColor);

          const actionButtons = canAct ? `
            <div class="btn-group" style="justify-content:flex-end; margin-top:8px;">
              <button class="btn btn-warning btn-xs sv-edit" data-id="${escapeHTML(it.id)}" title="Edit qty">
                <i data-feather="edit-2"></i> Edit
              </button>
              <button class="btn btn-danger btn-xs sv-reject" data-id="${escapeHTML(it.id)}" title="Reject">
                <i data-feather="x"></i> Reject
              </button>
            </div>
          `.trim() : "";

          return `
            <div class="co-item" data-id="${escapeHTML(it.id)}">
              <div class="co-item-left">
                <div class="co-item-name">${escapeHTML(it.productName || "Unknown Product")}</div>
                <div class="co-item-sub">
                  Reason: ${escapeHTML(it.reason || "—")}
                  · Qty: ${qtyHTML}
                  · Unit: ${escapeHTML(fmtMoney(unit))}
                </div>
              </div>

              <div class="co-item-right">
                <div class="co-item-total">${escapeHTML(fmtMoney(lineTotal))}</div>
                <div style="margin-top:6px;">
                  <span class="sv-approval-pill" style="--tag-bg:${pillVars.bg};--tag-fg:${pillVars.fg};--tag-border:${pillVars.bd};">${escapeHTML(normalizeApproval(it.approval))}</span>
                </div>
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
    const currentVal = edited !== null ? edited : (it ? (Number(it.quantity) || 0) : 0);

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

    decBtn.addEventListener("click", () => { input.value = Math.max(0, (Number(input.value) || 0) - 1); });
    incBtn.addEventListener("click", () => { input.value = Math.max(0, (Number(input.value) || 0) + 1); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") saveBtn.click(); });

    saveBtn.addEventListener("click", async () => {
      const v = Math.max(0, Math.floor(Number(input.value) || 0));
      try {
        await http.post(`/api/sv-orders/${encodeURIComponent(id)}/quantity`, { value: v });

        // update in-memory
        const idx = allItems.findIndex((x) => String(x.id) === String(id));
        if (idx >= 0) {
          const req = Number(allItems[idx].quantity) || 0;
          allItems[idx].quantityEdited = (v === req) ? null : v;
        }

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

  function applyFilter() {
    const q = norm(searchInput?.value);
    filteredGroups = allGroups.filter((g) => {
      if (approvalKey(g.approval) !== TAB) return false;
      return groupMatchesSearch(g, q);
    });
  }

  function renderList() {
    if (loading) {
      listDiv.innerHTML = `<p><i class="loading-icon" data-feather="loader"></i> Loading orders...</p>`;
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

  async function loadList() {
    loading = true;
    renderList();
    try {
      const data = await http.get("/api/sv-orders?tab=all");
      if (!data) return;
      allItems = Array.isArray(data) ? data : [];
      loading = false;
      renderAll();
    } catch (e) {
      console.error("loadList()", e);
      loading = false;
      allItems = [];
      renderList();
      toastERR("Failed to load S.V orders.");
    }
  }

  // ===== Tabs =====
  function setActiveTab() {
  if (!tabsWrap) return;
  document.querySelectorAll("#svTabs a.tab-portfolio").forEach((a) => {
    const tab = (a.dataset.tab || "").toLowerCase();
    const active = tab === TAB;
    a.classList.toggle("active", active);
    a.setAttribute("aria-selected", active ? "true" : "false");
  });
}

// ===== Approve/Reject =====
  async function setApproval(id, decision) {
    try {
      const normalized = normalizeApproval(decision);
      await http.post(`/api/sv-orders/${encodeURIComponent(id)}/approval`, { decision: normalized });

      const idx = allItems.findIndex((x) => String(x.id) === String(id));
      if (idx >= 0) allItems[idx].approval = normalized;

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

      if (fail) toastERR(`Updated ${ok}/${toUpdate.length}. Some items failed.`);
      else toastOK(`All items marked as ${normalized}.`);

      renderAll({ preserveScroll: true, preserveModal: true });
    } finally {
      bulkButtons.forEach((b) => { try { b.disabled = false; } catch {} });
    }
  }

  // ===== Wire events =====
  function wireEvents() {

// Tabs: filter in place (no full page reload)
if (tabsWrap) {
  tabsWrap.addEventListener("click", (e) => {
    const a = e.target.closest("a.tab-portfolio");
    if (!a) return;

    const targetTab = (a.dataset.tab || "not-started").toLowerCase();
    if (!targetTab || targetTab === TAB) return;

    e.preventDefault();
    destroyPopover();

    TAB = targetTab;
    setActiveTab();

    renderAll({ preserveScroll: true, preserveModal: false });

    const u = new URL(window.location.href);
    u.searchParams.set("tab", TAB);
    history.replaceState({}, "", u.pathname + "?" + u.searchParams.toString());
  });
}

    if (searchInput) {
      searchInput.addEventListener("input", () => renderAll({ preserveScroll: true, preserveModal: false }));
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

    // Escape closes modal
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isModalOpen()) {
        e.preventDefault();
        closeModal();
      }
    });
  }

  // ===== Boot =====
  document.addEventListener("DOMContentLoaded", () => {
    setActiveTab();
    wireEvents();
    loadList();
  });
})();
