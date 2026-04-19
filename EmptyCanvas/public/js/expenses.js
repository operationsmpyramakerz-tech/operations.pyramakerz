/* =============================
    EXPENSES PAGE — FRONTEND LOGIC
   ============================= */

let FUNDS_TYPES = [];
let FUNDS_TYPES_LOADED = false;
let FUNDS_TYPES_LOADING = false;

const EXTRA_FUNDS_TYPES = ["نقل", "توكتوك", "مشال", "مصروفات"];
const HIDDEN_FUNDS_TYPE_KEYS = new Set(["settledmyaccount", "cashreceipt", "cashreciept"]);
const REQUIRED_SCREENSHOT_FUNDS_TYPE_KEYS = new Set([
  "owncar",
  "swvl",
  "gobus",
  "bybus",
  "train",
  "indrive",
  "uber",
  "uper",
  "didi",
]);
const CASH_IN_FUNDS_TYPE_OPTIONS = ["Cash Payment", "Online Transfer"];

let CASH_IN_FROM_OPTIONS = [];
let EXPENSE_ORDER_OPTIONS = [];
let EXPENSE_ORDER_OPTIONS_LOADED = false;
let EXPENSE_ORDER_OPTIONS_REQUEST = null;
const EXPENSE_ORDER_OTHER_REASON_ID = "__expense_other_reason__";
let SELECTED_EXPENSE_ORDER_ID = "";
let SELECTED_EXPENSE_ORDER_LABEL = "";
let SELECTED_EXPENSE_ORDER_DATE = "";
let SELECTED_EXPENSE_ORDER_REASON = "";
let EXPENSE_ORDER_OPTIONS_LOADING = false;
let PENDING_CASH_OUT_ITEMS = [];
let CASH_OUT_DRAFT_SEQUENCE = 0;

// Prevent duplicate submits
let IS_CASHIN_SUBMITTING = false;
let IS_CASHOUT_DRAFTING = false;
let IS_CASHOUT_SUBMITTING = false;

function showSubmitLoader(text) {
  const overlay = document.getElementById("submitLoader");
  const label = document.getElementById("submitLoaderText");
  if (label) label.textContent = String(text || "Saving...");
  if (overlay) {
    overlay.style.display = "flex";
    overlay.setAttribute("aria-hidden", "false");
  }
  document.body.classList.add("is-loading");
}

function hideSubmitLoader() {
  const overlay = document.getElementById("submitLoader");
  if (overlay) {
    overlay.style.display = "none";
    overlay.setAttribute("aria-hidden", "true");
  }
  document.body.classList.remove("is-loading");
}

/* =============================
   MODERN TOAST (errors / info)
   - Replaces browser alert() with a modern UI message
   ============================= */
function ensureToastContainer() {
  let el = document.getElementById("toastContainer");
  if (el) return el;

  el = document.createElement("div");
  el.id = "toastContainer";
  el.className = "toast-container";
  el.setAttribute("aria-live", "polite");
  el.setAttribute("aria-atomic", "true");
  document.body.appendChild(el);
  return el;
}

function showToast(message, type = "error", { duration = 4000 } = {}) {
  const container = ensureToastContainer();
  if (!container) return;

  const safeType = ["error", "success", "info"].includes(type) ? type : "error";
  const iconMap = {
    error: "x-circle",
    success: "check-circle",
    info: "info",
  };
  const fallbackIconMap = { error: "!", success: "✓", info: "i" };
  const iconHtml =
    featherIconMarkup(iconMap[safeType], { width: 18, height: 18, strokeWidth: 2.35 }) ||
    `<span>${fallbackIconMap[safeType] || "!"}</span>`;

  const toast = document.createElement("div");
  toast.className = `toast toast--${safeType}`;
  toast.innerHTML = `
    <div class="toast__icon" aria-hidden="true">${iconHtml}</div>
    <div class="toast__body">
      <p class="toast__msg"></p>
    </div>
    <button class="toast__close" type="button" aria-label="Close">✕</button>
  `;

  const msgEl = toast.querySelector(".toast__msg");
  if (msgEl) msgEl.textContent = String(message || "");

  const closeBtn = toast.querySelector(".toast__close");
  const remove = () => {
    try { toast.remove(); } catch {}
  };

  if (closeBtn) closeBtn.addEventListener("click", remove);

  container.appendChild(toast);

  if (duration && duration > 0) {
    window.setTimeout(remove, duration);
  }
}

/* =============================
   CASH IN FROM (Searchable Select)
   - User types inside the same field.
   - We show a dropdown list below it.
   - The hidden <select id="ci_from"> stores the Notion page id.
   ============================= */

function syncCashInFromHiddenSelect() {
  const sel = document.getElementById("ci_from");
  if (!sel) return;

  const current = String(sel.value || "");
  sel.innerHTML = `<option value="">Select user...</option>`;

  CASH_IN_FROM_OPTIONS.forEach((o) => {
    if (!o || !o.id) return;
    sel.innerHTML += `<option value="${escapeHtml(o.id)}">${escapeHtml(o.name || "Unnamed")}</option>`;
  });

  // keep selection if still valid
  if (current) sel.value = current;
}

function hideCashInFromDropdown() {
  const dd = document.getElementById("ci_from_dropdown");
  if (dd) dd.style.display = "none";
}

function showCashInFromDropdown() {
  const dd = document.getElementById("ci_from_dropdown");
  if (dd) dd.style.display = "block";
}

function setCashInFromSelection(id, name) {
  const sel = document.getElementById("ci_from");
  const input = document.getElementById("ci_from_search");
  if (sel) sel.value = String(id || "");
  if (input) input.value = String(name || "");
  hideCashInFromDropdown();
}

function renderCashInFromDropdown(filterText = "") {
  const dd = document.getElementById("ci_from_dropdown");
  if (!dd) return;

  const q = String(filterText || "").trim().toLowerCase();

  const filtered = CASH_IN_FROM_OPTIONS.filter((o) => {
    if (!o) return false;
    if (!q) return true;
    return String(o.name || "").toLowerCase().includes(q);
  });

  if (!filtered.length) {
    dd.innerHTML = `<div class="combo-empty">No matching users</div>`;
    return;
  }

  dd.innerHTML = filtered
    .map((o) => {
      const id = escapeHtml(o.id);
      const name = escapeHtml(o.name || "Unnamed");
      return `<div class="combo-item" data-id="${id}">${name}</div>`;
    })
    .join("");
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ---------------------------------
// Receipts rendering (multiple images)
// ---------------------------------
function getReceiptImages(it) {
  // New API: it.screenshots = [{ name, url }]
  if (Array.isArray(it?.screenshots) && it.screenshots.length) {
    return it.screenshots
      .map((s) => ({ name: s?.name || "", url: s?.url || "" }))
      .filter((s) => !!String(s.url || "").trim());
  }

  // Backward-compat: it.screenshotUrl + it.screenshotName
  const url = String(it?.screenshotUrl || "").trim();
  if (!url) return [];
  return [{ name: String(it?.screenshotName || "Receipt"), url }];
}

function renderReceiptImagesHtml(it) {
  const shots = getReceiptImages(it);
  if (!shots.length) return "";

  return `
    <div class="expense-screenshots">
      ${shots
        .map((s) => {
          const u = escapeHtml(s.url);
          const n = escapeHtml(s.name || "Receipt");
          return `<a class="expense-screenshot-link" href="${u}" target="_blank" rel="noopener noreferrer">
                    <img class="expense-screenshot-thumb" src="${u}" alt="${n}" />
                  </a>`;
        })
        .join("")}
    </div>
  `;
}

function formatLastSettledAt(iso) {
  const raw = String(iso || "").trim();
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ------------------------
// View All (Bottom sheet): split by last settlement
// ------------------------

let VIEW_ALL_SHOW_PAST = false;
let VIEW_ALL_RECENT_ITEMS = [];
let VIEW_ALL_PAST_ITEMS = [];
let VIEW_ALL_LAST_SETTLED_AT = null;
let EXPENSES_ALL_ITEMS = [];
let EXPENSES_WEEKLY_ITEMS = [];
let ACTIVE_EXPENSES_FILTER = "recent";

function normalizeFundsType(s) {
  return String(s || "").trim().toLowerCase();
}

function getExpenseTimeValue(it) {
  // Prefer createdTime from the API (Notion created_time)
  const raw = it?.createdTime || it?.created_time || "";
  if (raw) {
    const t = new Date(raw).getTime();
    if (Number.isFinite(t)) return t;
  }

  // Fallback: Notion Date property (YYYY-MM-DD)
  const dRaw = it?.date || "";
  const t2 = dRaw ? new Date(dRaw).getTime() : NaN;
  return Number.isFinite(t2) ? t2 : 0;
}

function splitExpensesByLastSettlement(items, lastSettledAt) {
  const all = Array.isArray(items) ? items : [];
  const settledAt = String(lastSettledAt || "").trim();
  if (!settledAt) {
    return { recent: [...all], past: [] };
  }

  const cutoff = new Date(settledAt).getTime();
  if (!Number.isFinite(cutoff)) {
    return { recent: [...all], past: [] };
  }

  const recent = [];
  const past = [];
  for (const it of all) {
    const t = getExpenseTimeValue(it);
    if (t > cutoff) recent.push(it);
    else past.push(it);
  }

  return { recent, past };
}

function normalizeExpenseGroupText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function getExpenseOrdersArray(item) {
  return Array.isArray(item?.orders) ? item.orders.filter(Boolean) : [];
}

function getExpenseDisplayReason(item) {
  const rawReason = String(item?.reason || "").trim();
  const orders = getExpenseOrdersArray(item);
  const primaryOrder = orders[0] || null;
  const primaryLabel = String(primaryOrder?.label || "").trim();

  if (primaryLabel && rawReason) {
    const normalizedReason = normalizeExpenseGroupText(rawReason);
    const normalizedLabel = normalizeExpenseGroupText(primaryLabel);
    if (normalizedReason === normalizedLabel || normalizedReason.startsWith(`${normalizedLabel} •`)) {
      return primaryLabel;
    }
  }

  if (rawReason) return rawReason;
  if (primaryLabel) return primaryLabel;
  if (Number(item?.cashIn || 0) > 0) return "Cash In";
  return String(item?.fundsType || "").trim() || "Cash Out";
}

function getExpenseRouteEndpoints(item) {
  const isCashIn = Number(item?.cashIn || 0) > 0;
  let from = String(item?.from || "").trim();
  let to = String(item?.to || "").trim();

  if (isCashIn) {
    if (!from) from = String(item?.cashInFrom || "").trim() || "Cash in";
    if (!to) to = "Wallet";
  }

  return {
    from: from || "—",
    to: to || "—",
  };
}

function formatExpenseAmountLabel(item) {
  const isCashIn = Number(item?.cashIn || 0) > 0;
  if (isCashIn) return `+£${formatExpenseNumber(item?.cashIn || 0)}`;

  const fundsType = String(item?.fundsType || "").trim();
  const kilometer = Number(item?.kilometer || 0);
  const cashOut = Number(item?.cashOut || 0);

  if (isOwnCarFundsType(fundsType) && kilometer > 0 && !cashOut) {
    return `${formatExpenseNumber(kilometer)} km`;
  }

  return `-£${formatExpenseNumber(cashOut)}`;
}

function getExpenseRowTypeLabel(item) {
  if (Number(item?.cashIn || 0) > 0) return "Cash In";
  return String(item?.fundsType || "").trim() || "Cash Out";
}

function formatExpenseGroupDateLabel(value) {
  const pretty = formatExpenseOrderDate(value);
  return pretty || String(value || "").trim() || "No date";
}

function buildGroupedExpenseCollections(items) {
  const grouped = new Map();
  const source = Array.isArray(items) ? items : [];

  for (const item of source) {
    const reason = getExpenseDisplayReason(item);
    const date = String(item?.date || "").trim();
    const key = `${date}__${normalizeExpenseGroupText(reason)}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        date,
        reason: reason || "No reason",
        items: [],
        ordersMap: new Map(),
        screenshots: [],
        screenshotsSeen: new Set(),
        createdSort: getExpenseTimeValue(item),
        totalCashIn: 0,
        totalCashOut: 0,
        totalKilometer: 0,
      });
    }

    const group = grouped.get(key);
    group.items.push(item);
    group.totalCashIn += Number(item?.cashIn || 0);
    group.totalCashOut += Number(item?.cashOut || 0);
    group.totalKilometer += Number(item?.kilometer || 0);
    group.createdSort = Math.max(group.createdSort, getExpenseTimeValue(item));

    for (const order of getExpenseOrdersArray(item)) {
      const orderKey = String(order?.key || order?.trackingGroupId || order?.label || order?.orderId || "").trim();
      if (!orderKey) continue;
      if (!group.ordersMap.has(orderKey)) {
        group.ordersMap.set(orderKey, order);
      }
    }

    for (const shot of getReceiptImages(item)) {
      const shotUrl = String(shot?.url || "").trim();
      if (!shotUrl) continue;
      const shotKey = `${String(shot?.name || "").trim()}__${shotUrl}`;
      if (group.screenshotsSeen.has(shotKey)) continue;
      group.screenshotsSeen.add(shotKey);
      group.screenshots.push({
        name: String(shot?.name || "").trim() || "Receipt",
        url: shotUrl,
      });
    }
  }

  return Array.from(grouped.values())
    .map((group) => ({
      key: group.key,
      date: group.date,
      reason: group.reason,
      items: group.items,
      orders: Array.from(group.ordersMap.values()),
      screenshots: group.screenshots,
      createdSort: group.createdSort,
      totalCashIn: group.totalCashIn,
      totalCashOut: group.totalCashOut,
      totalKilometer: group.totalKilometer,
      totalNet: Number(group.totalCashIn || 0) - Number(group.totalCashOut || 0),
    }))
    .sort((a, b) => {
      const dateA = new Date(`${a?.date || ""}T00:00:00`).getTime();
      const dateB = new Date(`${b?.date || ""}T00:00:00`).getTime();

      if (Number.isFinite(dateA) && Number.isFinite(dateB) && dateA !== dateB) {
        return dateB - dateA;
      }
      return Number(b?.createdSort || 0) - Number(a?.createdSort || 0);
    });
}

function getExpenseGroupTotalDisplay(group) {
  const cashNet = Number(group?.totalNet || 0);
  const kilometerTotal = Number(group?.totalKilometer || 0);
  const hasCash = Math.abs(Number(group?.totalCashIn || 0)) > 1e-9 || Math.abs(Number(group?.totalCashOut || 0)) > 1e-9;

  if (!hasCash && kilometerTotal > 0) {
    return { text: `${formatExpenseNumber(kilometerTotal)} km`, className: "is-neutral" };
  }

  if (cashNet > 0) {
    return { text: `+£${formatExpenseNumber(cashNet)}`, className: "is-positive" };
  }

  if (cashNet < 0) {
    return { text: `-£${formatExpenseNumber(Math.abs(cashNet))}`, className: "is-negative" };
  }

  return { text: `£${formatExpenseNumber(0)}`, className: "is-neutral" };
}

function buildExpenseOrderActionHtml(order) {
  if (!order) return "";

  const meta = getExpenseOrderTypeMeta(order?.orderType || "");
  const href = String(order?.receiptViewerUrl || order?.trackingUrl || "").trim();
  const orderLabel = [
    String(order?.orderId || "").trim(),
    String(order?.orderType || "").trim(),
  ].filter(Boolean).join(" · ") || String(order?.label || "Order").trim() || "Order";

  const content = `
    ${featherIconMarkup(meta.icon, { width: 15, height: 15 })}
    <span>${escapeHtml(orderLabel)}</span>
    ${href ? featherIconMarkup("external-link", { width: 14, height: 14 }) : ""}
  `;

  if (href) {
    return `
      <a
        class="expense-ticket__order-btn"
        style="--expense-order-btn-bg:${meta.bg};--expense-order-btn-fg:${meta.fg};--expense-order-btn-border:${meta.bd};"
        href="${escapeHtml(href)}"
        target="_blank"
        rel="noopener noreferrer"
      >
        ${content}
      </a>
    `;
  }

  return `
    <span
      class="expense-ticket__order-btn expense-ticket__order-btn--disabled"
      style="--expense-order-btn-bg:${meta.bg};--expense-order-btn-fg:${meta.fg};--expense-order-btn-border:${meta.bd};"
    >
      ${content}
    </span>
  `;
}

function getExpensePrimaryScreenshot(item) {
  const shots = getReceiptImages(item);
  return shots.length ? shots[0] : null;
}


function getExpenseAmountToneClass(item) {
  const isCashIn = Number(item?.cashIn || 0) > 0;
  if (isCashIn) return "is-positive";

  const fundsType = String(item?.fundsType || "").trim();
  const kilometer = Number(item?.kilometer || 0);
  const cashOut = Number(item?.cashOut || 0);

  if (isOwnCarFundsType(fundsType) && kilometer > 0 && !cashOut) {
    return "is-neutral";
  }

  return cashOut > 0 ? "is-negative" : "is-neutral";
}

function encodeExpenseShotsData(shots) {
  try {
    const safeShots = (Array.isArray(shots) ? shots : [])
      .map((shot) => ({
        name: String(shot?.name || "Receipt").trim() || "Receipt",
        url: String(shot?.url || "").trim(),
      }))
      .filter((shot) => shot.url);

    return encodeURIComponent(JSON.stringify(safeShots));
  } catch (err) {
    return "";
  }
}

function decodeExpenseShotsData(value) {
  try {
    const parsed = JSON.parse(decodeURIComponent(String(value || "")));
    return (Array.isArray(parsed) ? parsed : [])
      .map((shot) => ({
        name: String(shot?.name || "Receipt").trim() || "Receipt",
        url: String(shot?.url || "").trim(),
      }))
      .filter((shot) => shot.url);
  } catch (err) {
    return [];
  }
}

function buildExpenseScreenshotButtonHtml(item) {
  const shots = getReceiptImages(item);
  const hasShots = shots.length > 0;
  const serializedShots = encodeExpenseShotsData(shots);
  const ariaLabel = hasShots
    ? `View ${shots.length} screenshot${shots.length === 1 ? "" : "s"}`
    : "No screenshots uploaded";

  return `
    <button
      type="button"
      class="expense-ticket__shot-btn${hasShots ? " expense-ticket__shot-btn--has-shots" : ""}"
      aria-label="${escapeHtml(ariaLabel)}"
      data-shots="${escapeHtml(serializedShots)}"
    >
      <span class="expense-ticket__shot-btn-icon" aria-hidden="true">${featherIconMarkup("image", { width: 18, height: 18 })}</span>
    </button>
  `;
}

function buildExpenseShotsViewerBodyHtml(shots) {
  const safeShots = Array.isArray(shots) ? shots : [];
  if (!safeShots.length) {
    return `
      <div class="expense-shots-modal__empty">
        <div class="expense-shots-modal__empty-icon" aria-hidden="true">${featherIconMarkup("image", { width: 24, height: 24 })}</div>
        <div>No screenshots uploaded for this expense.</div>
      </div>
    `;
  }

  return `
    <div class="expense-shots-modal__grid">
      ${safeShots
        .map((shot, index) => `
          <a class="expense-shots-modal__item" href="${escapeHtml(shot.url)}" target="_blank" rel="noopener noreferrer">
            <span class="expense-shots-modal__image-wrap">
              <img class="expense-shots-modal__image" src="${escapeHtml(shot.url)}" alt="${escapeHtml(shot.name || `Screenshot ${index + 1}`)}" loading="lazy" />
            </span>
            <span class="expense-shots-modal__caption">${escapeHtml(shot.name || `Screenshot ${index + 1}`)}</span>
          </a>
        `)
        .join("")}
    </div>
  `;
}

function openExpenseShotsModal(shots) {
  const modal = document.getElementById("expenseShotsModal");
  const countEl = document.getElementById("expenseShotsModalCount");
  const bodyEl = document.getElementById("expenseShotsModalBody");
  if (!modal || !countEl || !bodyEl) return;

  const safeShots = (Array.isArray(shots) ? shots : [])
    .map((shot) => ({
      name: String(shot?.name || "Receipt").trim() || "Receipt",
      url: String(shot?.url || "").trim(),
    }))
    .filter((shot) => shot.url);

  countEl.textContent = safeShots.length
    ? `${safeShots.length} image${safeShots.length === 1 ? "" : "s"}`
    : "No images uploaded";

  bodyEl.innerHTML = buildExpenseShotsViewerBodyHtml(safeShots);
  modal.style.display = "flex";
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("expense-shots-modal-open");
  requestAnimationFrame(() => modal.classList.add("is-open"));
}

function closeExpenseShotsModal() {
  const modal = document.getElementById("expenseShotsModal");
  if (!modal) return;

  modal.classList.remove("is-open");
  modal.setAttribute("aria-hidden", "true");
  document.body.classList.remove("expense-shots-modal-open");
  window.setTimeout(() => {
    if (!modal.classList.contains("is-open")) {
      modal.style.display = "none";
    }
  }, 180);
}

function setupExpenseShotsViewer() {
  const modal = document.getElementById("expenseShotsModal");
  const card = modal?.querySelector ? modal.querySelector(".expense-shots-modal__card") : null;
  if (!modal || !card) return;

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest(".expense-ticket__shot-btn");
    if (!trigger) return;

    event.preventDefault();
    event.stopPropagation();
    openExpenseShotsModal(decodeExpenseShotsData(trigger.getAttribute("data-shots")));
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal || event.target.closest("[data-expense-shots-close]")) {
      event.stopPropagation();
      closeExpenseShotsModal();
      return;
    }

    if (card.contains(event.target)) {
      event.stopPropagation();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modal.style.display === "flex") {
      closeExpenseShotsModal();
    }
  });
}


function buildExpenseTicketRowHtml(item) {
  const endpoints = getExpenseRouteEndpoints(item);
  const typeLabel = getExpenseRowTypeLabel(item);
  const amountLabel = formatExpenseAmountLabel(item);
  const amountToneClass = getExpenseAmountToneClass(item);

  return `
    <div class="expense-ticket__route">
      <div class="expense-ticket__route-frame">
        <div class="expense-ticket__route-shot">
          ${buildExpenseScreenshotButtonHtml(item)}
        </div>
        <div class="expense-ticket__route-body">
          <div class="expense-ticket__route-top">
            <div class="expense-ticket__route-title" dir="auto" title="${escapeHtml(typeLabel)}">${escapeHtml(typeLabel)}</div>
            <div class="expense-ticket__route-amount ${amountToneClass}" title="${escapeHtml(amountLabel)}">${escapeHtml(amountLabel)}</div>
          </div>
          <div class="expense-ticket__route-sub">
            <span class="expense-ticket__route-endpoint expense-ticket__route-endpoint--from" dir="auto" title="${escapeHtml(endpoints.from)}">${escapeHtml(endpoints.from)}</span>
            <span class="expense-ticket__route-arrow" aria-hidden="true">${featherIconMarkup("arrow-right", { width: 16, height: 16 })}</span>
            <span class="expense-ticket__route-endpoint expense-ticket__route-endpoint--to" dir="auto" title="${escapeHtml(endpoints.to)}">${escapeHtml(endpoints.to)}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}


function buildExpenseTicketHtml(group, { compact = false } = {}) {
  const total = getExpenseGroupTotalDisplay(group);
  const rows = [...(Array.isArray(group?.items) ? group.items : [])].sort(
    (a, b) => getExpenseTimeValue(a) - getExpenseTimeValue(b),
  );
  const hideReason = shouldHideExpenseGroupReason(group);
  const hasOrders = Array.isArray(group?.orders) && group.orders.length > 0;
  const ordersHtml = hasOrders
    ? `<div class="expense-ticket__order-actions">${group.orders.map(buildExpenseOrderActionHtml).join("")}</div>`
    : "";
  const reasonHtml = hideReason
    ? ""
    : `<div class="expense-ticket__reason">${escapeHtml(group?.reason || "No reason")}</div>`;
  const headerSideHtml = hasOrders ? ordersHtml : reasonHtml;
  const secondaryReasonHtml = hasOrders && reasonHtml
    ? `<div class="expense-ticket__reason expense-ticket__reason--block">${escapeHtml(group?.reason || "No reason")}</div>`
    : "";
  return `
    <article class="expense-ticket${compact ? " expense-ticket--compact" : ""}">
      <div class="expense-ticket__top">
        <div class="expense-ticket__header-row${hasOrders ? " expense-ticket__header-row--with-order" : ""}">
          <div class="expense-ticket__meta">
            <span class="expense-ticket__date">${escapeHtml(formatExpenseGroupDateLabel(group?.date))}</span>
          </div>
          ${headerSideHtml}
        </div>
        ${secondaryReasonHtml}
        <div class="expense-ticket__header-divider" aria-hidden="true"></div>
      </div>
      <div class="expense-ticket__legs">
        ${rows.map(buildExpenseTicketRowHtml).join("")}
      </div>
      <div class="expense-ticket__separator" aria-hidden="true"></div>
      <div class="expense-ticket__footer">
        <span class="expense-ticket__footer-label">Total</span>
        <span class="expense-ticket__footer-value ${total.className}">${escapeHtml(total.text)}</span>
      </div>
    </article>
  `;
}

function buildExpensesTicketsHtml(items, { emptyMessage = "No expenses yet.", compact = false } = {}) {
  const groups = buildGroupedExpenseCollections(items);
  if (!groups.length) {
    return `<div class="expenses-empty">${escapeHtml(emptyMessage)}</div>`;
  }
  return groups.map((group) => buildExpenseTicketHtml(group, { compact })).join("");
}

function renderAllExpensesModalList(listEl) {
  if (!listEl) return;

  const recent = Array.isArray(VIEW_ALL_RECENT_ITEMS) ? VIEW_ALL_RECENT_ITEMS : [];
  const past = Array.isArray(VIEW_ALL_PAST_ITEMS) ? VIEW_ALL_PAST_ITEMS : [];

  let html = "";

  // Empty states
  if (recent.length === 0) {
    if (past.length > 0 && !VIEW_ALL_SHOW_PAST) {
      html += `<div class="expenses-empty">No expenses since your last settlement.</div>`;
    } else if (past.length === 0) {
      html += `<div class="expenses-empty">No expenses yet.</div>`;
    }
  }

  // Recent items
  if (recent.length > 0) {
    html += buildExpensesTicketsHtml(recent, {
      emptyMessage: "No expenses since your last settlement.",
      compact: true,
    });
  }

  // Past items (optional)
  if (VIEW_ALL_SHOW_PAST && past.length > 0) {
    html += `
      <div class="expenses-separator"><span>Past expenses</span></div>
    `;
    html += buildExpensesTicketsHtml(past, { compact: true });
  }

  // Toggle button
  if (past.length > 0) {
    const label = VIEW_ALL_SHOW_PAST ? "Hide past expenses" : "Show past expenses";
    html += `
      <div class="past-expenses-wrapper">
        <button type="button" id="togglePastExpensesBtn" class="past-expenses-btn">${label}</button>
      </div>
    `;
  }

  listEl.innerHTML = html;

  // Bind toggle (re-render)
  const toggleBtn = document.getElementById("togglePastExpensesBtn");
  if (toggleBtn) {
    toggleBtn.addEventListener("click", (e) => {
      e.preventDefault();
      VIEW_ALL_SHOW_PAST = !VIEW_ALL_SHOW_PAST;
      renderAllExpensesModalList(listEl);
    });
  }
}

/* =============================
   LOAD FUNDS TYPES FROM SERVER
   ============================= */
async function loadFundsTypes() {
    FUNDS_TYPES_LOADING = true;

    try {
        const res = await fetch("/api/expenses/types");
        const data = await res.json();
        if (data.success && Array.isArray(data.options)) {
            FUNDS_TYPES = data.options;
        } else {
            FUNDS_TYPES = [];
        }
    } catch (err) {
        console.error("Funds Type Load Error", err);
        FUNDS_TYPES = [];
    } finally {
        FUNDS_TYPES_LOADED = true;
        FUNDS_TYPES_LOADING = false;
    }

    syncFundsTypeHiddenSelect();
    syncCashOutFormTypeState({ showOwnCarInfo: false });
}

/* =============================
   LOAD CASH-IN-FROM OPTIONS (RELATION)
   ============================= */
async function loadCashInFromOptions() {
  const sel = document.getElementById("ci_from");
  if (!sel) return;

  CASH_IN_FROM_OPTIONS = [];
  syncCashInFromHiddenSelect();
  renderCashInFromDropdown(document.getElementById("ci_from_search")?.value || "");

  try {
    const res = await fetch("/api/expenses/cash-in-from/options");
    const data = await res.json();
    if (data && data.success && Array.isArray(data.options)) {
      CASH_IN_FROM_OPTIONS = data.options;
      syncCashInFromHiddenSelect();
      renderCashInFromDropdown(document.getElementById("ci_from_search")?.value || "");
    }
  } catch (err) {
    console.error("Cash-in-from options load error:", err);
  }
}

function setupCashInFromSearchableSelect() {
  const wrap = document.getElementById("ci_from_wrap");
  const input = document.getElementById("ci_from_search");
  const sel = document.getElementById("ci_from");
  const dd = document.getElementById("ci_from_dropdown");
  if (!wrap || !input || !sel || !dd) return;

  // Ensure the real select stays hidden (value storage only)
  sel.style.display = "none";

  // Open dropdown when user focuses/clicks the input
  const open = () => {
    renderCashInFromDropdown(input.value);
    showCashInFromDropdown();
  };

  input.addEventListener("focus", open);
  input.addEventListener("click", open);

  // Filter as the user types (and clear previous selection)
  input.addEventListener("input", () => {
    // If user types, we consider selection changed until they pick again
    sel.value = "";
    renderCashInFromDropdown(input.value);
    showCashInFromDropdown();
  });

  // Click on an item selects it
  dd.addEventListener("click", (e) => {
    const item = e.target && e.target.closest ? e.target.closest(".combo-item") : null;
    if (!item) return;

    const id = String(item.getAttribute("data-id") || "");
    const opt = CASH_IN_FROM_OPTIONS.find((o) => String(o?.id || "") === id);
    setCashInFromSelection(id, opt?.name || item.textContent || "");
  });

  // Close dropdown on outside click
  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) hideCashInFromDropdown();
  });

  // Close on Escape
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideCashInFromDropdown();
  });
}

/* =============================
   EXPENSE ORDER PICKER
   ============================= */
function featherIconMarkup(name, attrs = {}) {
  try {
    if (!name || !window.feather?.icons?.[name]) return "";
    return window.feather.icons[name].toSvg(attrs);
  } catch {
    return "";
  }
}

function normalizeFundsTypeKey(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";

  const asciiKey = raw.replace(/[^a-z0-9]/g, "");
  if (asciiKey) return asciiKey;

  try {
    return raw
      .normalize("NFKC")
      .replace(/[\u064B-\u065F\u0610-\u061A\u06D6-\u06ED]/g, "")
      .replace(/[^a-z0-9\u0600-\u06FF]+/g, "");
  } catch {
    return raw.replace(/\s+/g, "");
  }
}

function getVisibleFundsTypes() {
  const seen = new Set();
  return [...(Array.isArray(FUNDS_TYPES) ? FUNDS_TYPES : []), ...EXTRA_FUNDS_TYPES]
    .map((type) => String(type || "").trim())
    .filter(Boolean)
    .filter((type) => {
      const key = normalizeFundsTypeKey(type);
      if (!key || HIDDEN_FUNDS_TYPE_KEYS.has(key) || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function isOwnCarFundsType(value) {
  return normalizeFundsTypeKey(value) === "owncar";
}

function isScreenshotRequiredForFundsType(value) {
  return REQUIRED_SCREENSHOT_FUNDS_TYPE_KEYS.has(normalizeFundsTypeKey(value));
}

function getFundsTypeOptionNote(value) {
  if (isOwnCarFundsType(value)) {
    return "Google Maps screenshot required";
  }

  if (isScreenshotRequiredForFundsType(value)) {
    return "Screenshot is required for this ride";
  }

  return "Screenshot upload is optional";
}

function getFundsTypeChipMeta(value) {
  if (isOwnCarFundsType(value)) {
    return {
      label: "Maps required",
      icon: "navigation",
      bg: "#ede9fe",
      fg: "#6d28d9",
      bd: "#c4b5fd",
    };
  }

  if (isScreenshotRequiredForFundsType(value)) {
    return {
      label: "Required",
      icon: "image",
      bg: "#fff7ed",
      fg: "#c2410c",
      bd: "#fdba74",
    };
  }

  return {
    label: "Optional",
    icon: "check-circle",
    bg: "#f8fafc",
    fg: "#475569",
    bd: "#cbd5e1",
  };
}

function buildFundsTypeStatusChipHtml(value, { className = "order-select__chip" } = {}) {
  const meta = getFundsTypeChipMeta(value);
  return `
    <span
      class="${className}"
      style="--order-chip-bg:${meta.bg};--order-chip-fg:${meta.fg};--order-chip-border:${meta.bd};"
    >
      ${featherIconMarkup(meta.icon, { width: 15, height: 15 })}
      <span>${escapeHtml(meta.label)}</span>
    </span>
  `;
}

function buildFundsTypeSummaryHtml(value) {
  const type = String(value || "").trim();
  if (!type) return "";
  return `
    <span class="funds-type-summary">
      <span class="funds-type-summary__name">${escapeHtml(type)}</span>
      ${buildFundsTypeStatusChipHtml(type, { className: "order-select__chip order-select__chip--selected" })}
    </span>
  `;
}

function isCashInOnlineTransfer(value) {
  return normalizeFundsTypeKey(value) === "onlinetransfer";
}

function isCashInCashPayment(value) {
  const key = normalizeFundsTypeKey(value);
  return key === "cashpayment" || key === "cashreceipt" || key === "cashreciept";
}

function getCashInFundsTypeOptions() {
  return [...CASH_IN_FUNDS_TYPE_OPTIONS];
}

function getCashInFundsTypeNote(value) {
  return isCashInOnlineTransfer(value)
    ? "Screenshot is required for this transfer"
    : "Receipt number is required for this payment";
}

function syncCashInFundsTypeHiddenSelect() {
  const selectEl = document.getElementById("ci_funds_type");
  if (!selectEl) return;

  const currentValue = String(selectEl.value || "").trim();
  const options = getCashInFundsTypeOptions();
  selectEl.innerHTML = `<option value="">Select funds type...</option>`;

  options.forEach((type) => {
    const opt = document.createElement("option");
    opt.value = type;
    opt.textContent = type;
    selectEl.appendChild(opt);
  });

  if (currentValue && options.includes(currentValue)) {
    selectEl.value = currentValue;
  } else if (currentValue) {
    selectEl.value = "";
  }
}

function positionCashInFundsTypeDropdown() {
  const trigger = document.getElementById("cashInFundsTypeTrigger");
  const dropdown = document.getElementById("cashInFundsTypeDropdown");
  if (!trigger || !dropdown || dropdown.hidden) return;

  const rect = trigger.getBoundingClientRect();
  const viewportPad = 16;
  const width = Math.min(rect.width, window.innerWidth - viewportPad * 2);
  const left = Math.min(Math.max(viewportPad, rect.left), window.innerWidth - viewportPad - width);
  const spaceBelow = Math.max(120, window.innerHeight - rect.bottom - viewportPad);
  const spaceAbove = Math.max(120, rect.top - viewportPad);
  const placeAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
  const availableSpace = placeAbove ? spaceAbove : spaceBelow;
  const optionsList = document.getElementById("cashInFundsTypeOptionsList");

  dropdown.style.left = `${left}px`;
  dropdown.style.width = `${width}px`;
  dropdown.style.maxHeight = `${Math.min(300, availableSpace)}px`;
  if (optionsList) {
    optionsList.style.maxHeight = `${Math.max(100, Math.min(220, availableSpace - 24))}px`;
  }

  if (placeAbove) {
    dropdown.style.top = "auto";
    dropdown.style.bottom = `${Math.max(viewportPad, window.innerHeight - rect.top + 8)}px`;
  } else {
    dropdown.style.bottom = "auto";
    dropdown.style.top = `${Math.min(window.innerHeight - viewportPad, rect.bottom + 8)}px`;
  }
}

function renderCashInFundsTypeDropdown() {
  const listEl = document.getElementById("cashInFundsTypeOptionsList");
  const stateEl = document.getElementById("cashInFundsTypeDropdownState");
  const selectEl = document.getElementById("ci_funds_type");
  if (!listEl || !stateEl || !selectEl) return;

  const options = getCashInFundsTypeOptions();
  const selectedValue = String(selectEl.value || "").trim();

  stateEl.style.display = options.length ? "none" : "block";
  if (!options.length) stateEl.textContent = "No funds types available right now.";

  listEl.innerHTML = options.map((type) => {
    const selected = type === selectedValue;
    return `
      <button
        type="button"
        class="order-select__option${selected ? " is-selected" : ""}"
        data-cashin-funds-type="${escapeHtml(type)}"
        role="option"
        aria-selected="${selected ? "true" : "false"}"
        title="${escapeHtml(type)}"
      >
        <span class="funds-select__option-main">
          <span class="order-select__option-id">${escapeHtml(type)}</span>
          <span class="funds-select__option-note">${escapeHtml(getCashInFundsTypeNote(type))}</span>
        </span>
      </button>
    `;
  }).join("");

  window.requestAnimationFrame(positionCashInFundsTypeDropdown);
}

function openCashInFundsTypeDropdown() {
  const trigger = document.getElementById("cashInFundsTypeTrigger");
  const dropdown = document.getElementById("cashInFundsTypeDropdown");
  if (!trigger || !dropdown) return;
  dropdown.hidden = false;
  trigger.classList.add("is-open");
  trigger.setAttribute("aria-expanded", "true");
  renderCashInFundsTypeDropdown();
  window.requestAnimationFrame(positionCashInFundsTypeDropdown);
}

function closeCashInFundsTypeDropdown() {
  const trigger = document.getElementById("cashInFundsTypeTrigger");
  const dropdown = document.getElementById("cashInFundsTypeDropdown");
  if (!trigger || !dropdown) return;
  dropdown.hidden = true;
  trigger.classList.remove("is-open");
  trigger.setAttribute("aria-expanded", "false");
}

function syncCashInFormTypeState() {
  const selectEl = document.getElementById("ci_funds_type");
  const trigger = document.getElementById("cashInFundsTypeTrigger");
  const triggerText = document.getElementById("cashInFundsTypeTriggerText");
  const receiptBlock = document.getElementById("ci_receipt_block");
  const receiptInput = document.getElementById("ci_receipt");
  const screenshotBlock = document.getElementById("ci_screenshot_block");
  const screenshotInput = document.getElementById("ci_screenshot");
  const screenshotName = document.getElementById("ci_screenshot_name");
  const selectedType = String(selectEl?.value || "").trim();
  const isTransfer = isCashInOnlineTransfer(selectedType);
  const isPayment = isCashInCashPayment(selectedType);

  if (triggerText) {
    triggerText.textContent = selectedType || "Select funds type...";
  }

  if (trigger) {
    trigger.classList.toggle("is-placeholder", !selectedType);
    trigger.classList.toggle("is-selected", !!selectedType);
  }

  if (receiptBlock) receiptBlock.style.display = isPayment ? "block" : "none";
  if (receiptInput) {
    receiptInput.required = isPayment;
    if (!isPayment) receiptInput.value = "";
  }

  if (screenshotBlock) screenshotBlock.style.display = isTransfer ? "block" : "none";
  if (screenshotInput) {
    screenshotInput.required = isTransfer;
    if (!isTransfer) screenshotInput.value = "";
  }
  if (!isTransfer && screenshotName) screenshotName.textContent = "No file chosen";

  renderCashInFundsTypeDropdown();
}

function setCashInFundsTypeSelection(value = "") {
  const selectEl = document.getElementById("ci_funds_type");
  if (!selectEl) return;

  const nextValue = String(value || "").trim();
  selectEl.value = nextValue;
  if (selectEl.value !== nextValue) {
    selectEl.value = "";
  }

  syncCashInFormTypeState();
}

function syncFundsTypeHiddenSelect() {
  const selectEl = document.getElementById("co_type");
  if (!selectEl) return;

  const currentValue = String(selectEl.value || "").trim();
  const visibleTypes = getVisibleFundsTypes();

  selectEl.innerHTML = `<option value="">Select funds type...</option>`;
  visibleTypes.forEach((type) => {
    const opt = document.createElement("option");
    opt.value = type;
    opt.textContent = type;
    selectEl.appendChild(opt);
  });

  if (currentValue && visibleTypes.includes(currentValue)) {
    selectEl.value = currentValue;
  } else if (currentValue) {
    selectEl.value = "";
  }
}

function positionFundsTypeDropdown() {
  const trigger = document.getElementById("fundsTypeTrigger");
  const dropdown = document.getElementById("fundsTypeDropdown");
  if (!trigger || !dropdown || dropdown.hidden) return;

  const rect = trigger.getBoundingClientRect();
  const viewportPad = 16;
  const width = Math.min(rect.width, window.innerWidth - viewportPad * 2);
  const left = Math.min(Math.max(viewportPad, rect.left), window.innerWidth - viewportPad - width);
  const spaceBelow = Math.max(120, window.innerHeight - rect.bottom - viewportPad);
  const spaceAbove = Math.max(120, rect.top - viewportPad);
  const placeAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
  const availableSpace = placeAbove ? spaceAbove : spaceBelow;
  const optionsList = document.getElementById("fundsTypeOptionsList");

  dropdown.style.left = `${left}px`;
  dropdown.style.width = `${width}px`;
  dropdown.style.maxHeight = `${Math.min(360, availableSpace)}px`;
  if (optionsList) {
    optionsList.style.maxHeight = `${Math.max(120, Math.min(260, availableSpace - 24))}px`;
  }

  if (placeAbove) {
    dropdown.style.top = "auto";
    dropdown.style.bottom = `${Math.max(viewportPad, window.innerHeight - rect.top + 8)}px`;
  } else {
    dropdown.style.bottom = "auto";
    dropdown.style.top = `${Math.min(window.innerHeight - viewportPad, rect.bottom + 8)}px`;
  }
}

function openFundsTypeDropdown() {
  const trigger = document.getElementById("fundsTypeTrigger");
  const dropdown = document.getElementById("fundsTypeDropdown");
  if (!trigger || !dropdown) return;
  dropdown.hidden = false;
  trigger.classList.add("is-open");
  trigger.setAttribute("aria-expanded", "true");
  renderFundsTypeDropdown();
  window.requestAnimationFrame(positionFundsTypeDropdown);
}

function closeFundsTypeDropdown() {
  const trigger = document.getElementById("fundsTypeTrigger");
  const dropdown = document.getElementById("fundsTypeDropdown");
  if (!trigger || !dropdown) return;
  dropdown.hidden = true;
  trigger.classList.remove("is-open");
  trigger.setAttribute("aria-expanded", "false");
}

function renderFundsTypeDropdown() {
  const listEl = document.getElementById("fundsTypeOptionsList");
  const stateEl = document.getElementById("fundsTypeDropdownState");
  const selectEl = document.getElementById("co_type");
  if (!listEl || !stateEl || !selectEl) return;

  const visibleTypes = getVisibleFundsTypes();
  const selectedValue = String(selectEl.value || "").trim();

  if (FUNDS_TYPES_LOADING && !FUNDS_TYPES_LOADED) {
    stateEl.textContent = "Loading funds types...";
    stateEl.style.display = "block";
  } else if (!visibleTypes.length) {
    stateEl.textContent = "No funds types available right now.";
    stateEl.style.display = "block";
  } else {
    stateEl.style.display = "none";
  }

  listEl.innerHTML = visibleTypes.map((type) => {
    const selected = type === selectedValue;
    return `
      <button
        type="button"
        class="order-select__option${selected ? " is-selected" : ""}"
        data-funds-type="${escapeHtml(type)}"
        role="option"
        aria-selected="${selected ? "true" : "false"}"
        title="${escapeHtml(type)}"
      >
        <span class="funds-select__option-main">
          <span class="order-select__option-id">${escapeHtml(type)}</span>
          <span class="funds-select__option-note">${escapeHtml(getFundsTypeOptionNote(type))}</span>
        </span>
        ${buildFundsTypeStatusChipHtml(type)}
      </button>
    `;
  }).join("");

  window.requestAnimationFrame(positionFundsTypeDropdown);
}

function syncCashOutFormTypeState({ showOwnCarInfo = false } = {}) {
  const selectEl = document.getElementById("co_type");
  const trigger = document.getElementById("fundsTypeTrigger");
  const triggerText = document.getElementById("fundsTypeTriggerText");
  const kmBlock = document.getElementById("co_km_block");
  const cashBlock = document.getElementById("co_cash_block");
  const cashInput = document.getElementById("co_cash");
  const cashIndicator = document.getElementById("co_cash_indicator");
  const screenshotInput = document.getElementById("co_screenshot");
  const screenshotWrap = document.getElementById("co_screenshot_wrap");
  const screenshotIndicator = document.getElementById("co_screenshot_indicator");
  const screenshotHelp = document.getElementById("co_screenshot_help");
  const selectedType = String(selectEl?.value || "").trim();
  const ownCar = isOwnCarFundsType(selectedType);
  const screenshotRequired = isScreenshotRequiredForFundsType(selectedType);

  if (kmBlock) kmBlock.style.display = ownCar ? "block" : "none";
  if (cashBlock) cashBlock.style.display = ownCar ? "none" : "block";

  if (cashInput) {
    cashInput.required = !ownCar;
  }

  if (cashIndicator) {
    cashIndicator.textContent = ownCar ? "" : "(Required)";
    cashIndicator.className = ownCar ? "opt-tag" : "req-text";
  }

  if (triggerText) {
    if (selectedType) triggerText.innerHTML = buildFundsTypeSummaryHtml(selectedType);
    else triggerText.textContent = "Select funds type...";
  }

  if (trigger) {
    trigger.classList.toggle("is-placeholder", !selectedType);
    trigger.classList.toggle("is-selected", !!selectedType);
  }

  if (screenshotInput) {
    screenshotInput.required = screenshotRequired;
  }

  if (screenshotIndicator) {
    screenshotIndicator.textContent = screenshotRequired ? "(Required)" : "(Optional)";
    screenshotIndicator.className = screenshotRequired ? "req-text" : "opt-tag";
  }

  if (screenshotWrap) {
    screenshotWrap.classList.toggle("is-required", screenshotRequired);
  }

  if (screenshotHelp) {
    if (ownCar) {
      screenshotHelp.textContent = "Upload a Google Maps screenshot showing the distance between the starting point and destination.";
    } else if (screenshotRequired) {
      screenshotHelp.textContent = "Upload a screenshot or receipt for this funds type.";
    } else {
      screenshotHelp.textContent = "Upload receipt screenshots (JPG/PNG).";
    }
    screenshotHelp.classList.toggle("is-emphasis", ownCar || screenshotRequired);
  }

  renderFundsTypeDropdown();

  if (showOwnCarInfo && ownCar) {
    openOwnCarInfoModal();
  } else if (!ownCar) {
    closeOwnCarInfoModal();
  }
}

function setFundsTypeSelection(value = "", { showOwnCarInfo = false } = {}) {
  const selectEl = document.getElementById("co_type");
  if (!selectEl) return;

  const nextValue = String(value || "").trim();
  selectEl.value = nextValue;
  if (selectEl.value !== nextValue) {
    selectEl.value = "";
  }

  syncCashOutFormTypeState({ showOwnCarInfo });
}

function openOwnCarInfoModal() {
  const modal = document.getElementById("ownCarInfoModal");
  if (!modal) return;
  modal.style.display = "flex";
  modal.setAttribute("aria-hidden", "false");
}

function closeOwnCarInfoModal() {
  const modal = document.getElementById("ownCarInfoModal");
  if (!modal) return;
  modal.style.display = "none";
  modal.setAttribute("aria-hidden", "true");
}

function normalizeExpenseOrderTypeKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function isOtherReasonExpenseOrderId(value) {
  return String(value || "").trim() === EXPENSE_ORDER_OTHER_REASON_ID;
}

function isOtherReasonSelected() {
  return isOtherReasonExpenseOrderId(SELECTED_EXPENSE_ORDER_ID);
}

function hasSelectedExpenseOrderScope() {
  return !!String(SELECTED_EXPENSE_ORDER_ID || "").trim();
}

function getSelectedExpenseManualReason({ trimmed = true } = {}) {
  const raw = String(SELECTED_EXPENSE_ORDER_REASON || "");
  return trimmed ? raw.trim() : raw;
}

function getExpenseManualReasonInput() {
  return document.getElementById("cashOutManualReason");
}

function setSelectedExpenseManualReason(value = "", { syncUI = true } = {}) {
  SELECTED_EXPENSE_ORDER_REASON = String(value || "");

  const input = getExpenseManualReasonInput();
  if (input && input.value !== SELECTED_EXPENSE_ORDER_REASON) {
    input.value = SELECTED_EXPENSE_ORDER_REASON;
  }

  if (syncUI) {
    syncSelectedExpenseOrderUI();
  }
}

function buildOtherReasonExpenseOrderOption() {
  return {
    id: EXPENSE_ORDER_OTHER_REASON_ID,
    label: "Other reason",
    orderId: "Other reason",
    orderType: "Manual reason",
    relationIds: [],
    isManualReason: true,
  };
}

function getExpenseOrderPickerOptions() {
  return [buildOtherReasonExpenseOrderOption(), ...EXPENSE_ORDER_OPTIONS];
}

function getExpenseOrderTypeMeta(type) {
  const label = String(type || "").trim();
  const key = normalizeExpenseOrderTypeKey(type);

  if (key === "manualreason" || key === "otherreason" || key === "manual") {
    return {
      label: label || "Manual reason",
      icon: "edit-3",
      bg: "#F3F4F6",
      fg: "#111827",
      bd: "#D1D5DB",
    };
  }

  if (key === "requestproducts" || key === "delivery") {
    return {
      label: label || "Request Products",
      icon: "shopping-cart",
      bg: "#DCFCE7",
      fg: "#166534",
      bd: "#86EFAC",
    };
  }

  if (key === "withdrawproducts" || key === "withdrawal") {
    return {
      label: label || "Withdraw Products",
      icon: "log-out",
      bg: "#FEE2E2",
      fg: "#B91C1C",
      bd: "#FECACA",
    };
  }

  if (key === "requestmaintenance" || key === "maintenance") {
    return {
      label: label || "Request Maintenance",
      icon: "tool",
      bg: "#FEF3C7",
      fg: "#92400E",
      bd: "#FDE68A",
    };
  }

  return {
    label: label || "Order",
    icon: "package",
    bg: "#EFF6FF",
    fg: "#1D4ED8",
    bd: "#BFDBFE",
  };
}

function buildExpenseOrderTypeChipHtml(type, { className = "order-select__chip", label = "" } = {}) {
  const meta = getExpenseOrderTypeMeta(type);
  const chipLabel = String(label || meta.label || "Order").trim() || "Order";
  return `
    <span
      class="${className}"
      style="--order-chip-bg:${meta.bg};--order-chip-fg:${meta.fg};--order-chip-border:${meta.bd};"
    >
      ${featherIconMarkup(meta.icon, { width: 15, height: 15 })}
      <span>${escapeHtml(chipLabel)}</span>
    </span>
  `;
}

function buildExpenseOrderSummaryHtml(item) {
  if (!item) return "";
  const isManualReason = !!item?.isManualReason || isOtherReasonExpenseOrderId(item?.id);
  const orderId = isManualReason
    ? "Other reason"
    : String(item?.orderId || "").trim() || "Order";
  const chipLabel = isManualReason ? "Manual" : "";
  return `
    <span class="order-summary-inline">
      <span class="order-summary-inline__id">${escapeHtml(orderId)}</span>
      ${buildExpenseOrderTypeChipHtml(item?.orderType, {
        className: "order-select__chip order-select__chip--selected",
        label: chipLabel,
      })}
    </span>
  `;
}

function formatExpenseNumber(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return "0";
  return num.toLocaleString("en-GB", { maximumFractionDigits: 2 });
}

function formatHeroMoney(value, { sign = "", absolute = false } = {}) {
  const raw = Number(value || 0);
  const safe = absolute ? Math.abs(raw) : raw;
  return `${sign}£${formatExpenseNumber(safe)}`;
}

function isSettledMyAccountItem(item) {
  return normalizeFundsTypeKey(item?.fundsType) === "settledmyaccount";
}

function getSettlementReceiptNumber(item) {
  return String(item?.reason || "").trim();
}

function findLatestSettlementReceiptNumber(items, lastSettledAt) {
  const source = Array.isArray(items) ? items : [];
  const exactCreatedTime = String(lastSettledAt || "").trim();

  if (exactCreatedTime) {
    const exactMatch = source.find((item) => {
      return isSettledMyAccountItem(item)
        && String(item?.createdTime || "").trim() === exactCreatedTime
        && !!getSettlementReceiptNumber(item);
    });
    if (exactMatch) return getSettlementReceiptNumber(exactMatch);
  }

  let fallbackReceipt = "";
  let fallbackTime = Number.NEGATIVE_INFINITY;

  source.forEach((item) => {
    if (!isSettledMyAccountItem(item)) return;

    const receipt = getSettlementReceiptNumber(item);
    if (!receipt) return;

    const candidateTime = getExpenseTimeValue(item);
    if (Number.isFinite(candidateTime) && candidateTime >= fallbackTime) {
      fallbackTime = candidateTime;
      fallbackReceipt = receipt;
      return;
    }

    if (!fallbackReceipt) {
      fallbackReceipt = receipt;
    }
  });

  return fallbackReceipt;
}

function formatLastSettledChipText(items, lastSettledAt) {
  const receiptNumber = findLatestSettlementReceiptNumber(items, lastSettledAt);
  if (!receiptNumber) return "No settlements yet";
  return `Receipt #${receiptNumber}`;
}

function syncExpenseFilterButtons() {
  const buttons = Array.from(document.querySelectorAll("[data-expense-filter]"));
  buttons.forEach((btn) => {
    const key = String(btn.getAttribute("data-expense-filter") || "").trim();
    const active = key === ACTIVE_EXPENSES_FILTER;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function getActiveExpenseItems() {
  const weeklyItems = Array.isArray(EXPENSES_WEEKLY_ITEMS) ? EXPENSES_WEEKLY_ITEMS : [];
  if (ACTIVE_EXPENSES_FILTER === "cash-in") {
    return weeklyItems.filter((item) => Number(item?.cashIn || 0) > 0);
  }
  if (ACTIVE_EXPENSES_FILTER === "cash-out") {
    return weeklyItems.filter((item) => {
      const hasCashOut = Number(item?.cashOut || 0) > 0;
      const hasOwnCarDistance = isOwnCarFundsType(item?.fundsType) && Number(item?.kilometer || 0) > 0;
      return hasCashOut || hasOwnCarDistance;
    });
  }
  return weeklyItems;
}

function getActiveExpenseEmptyMessage() {
  if (ACTIVE_EXPENSES_FILTER === "cash-in") return "No cash in for this week.";
  if (ACTIVE_EXPENSES_FILTER === "cash-out") return "No cash out for this week.";
  return "No expenses for this week.";
}

function renderExpensesListForActiveFilter() {
  const container = document.getElementById("expensesContent");
  if (!container) return;

  const items = getActiveExpenseItems();
  container.innerHTML = buildExpensesTicketsHtml(items, {
    emptyMessage: getActiveExpenseEmptyMessage(),
  });
}

function updateExpensesHeroSummary(items, lastSettledAt) {
  const totalBox = document.getElementById("totalAmount");
  const cashInBox = document.getElementById("cashInTotal");
  const cashOutBox = document.getElementById("cashOutTotal");
  const lastSettledEl = document.getElementById("lastSettledTime");

  const source = Array.isArray(items) ? items : [];
  let total = 0;
  let cashInTotal = 0;
  let cashOutTotal = 0;

  source.forEach((item) => {
    const cashIn = Number(item?.cashIn || 0);
    const cashOut = Number(item?.cashOut || 0);
    cashInTotal += cashIn;
    cashOutTotal += cashOut;
    total += cashIn - cashOut;
  });

  if (totalBox) {
    totalBox.textContent = total < 0
      ? `-£${formatExpenseNumber(Math.abs(total))}`
      : `£${formatExpenseNumber(total)}`;
  }
  if (cashInBox) {
    cashInBox.textContent = formatHeroMoney(cashInTotal, { sign: "+", absolute: true });
  }
  if (cashOutBox) {
    cashOutBox.textContent = formatHeroMoney(cashOutTotal, { sign: "-", absolute: true });
  }
  if (lastSettledEl) {
    lastSettledEl.textContent = formatLastSettledChipText(source, lastSettledAt);
  }
}

function setActiveExpenseFilter(nextFilter) {
  const safeFilter = ["recent", "cash-in", "cash-out"].includes(String(nextFilter || ""))
    ? String(nextFilter)
    : "recent";

  ACTIVE_EXPENSES_FILTER = safeFilter;
  syncExpenseFilterButtons();
  renderExpensesListForActiveFilter();
}

function bindExpenseFilterControls() {
  const buttons = Array.from(document.querySelectorAll("[data-expense-filter]"));
  if (!buttons.length) return;

  buttons.forEach((btn) => {
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      const nextFilter = String(btn.getAttribute("data-expense-filter") || "recent").trim();
      setActiveExpenseFilter(nextFilter || "recent");
    });
  });

  syncExpenseFilterButtons();
}

function shouldHideExpenseGroupReason(group) {
  const reason = normalizeExpenseGroupText(group?.reason);
  const orders = Array.isArray(group?.orders) ? group.orders : [];
  if (!reason || !orders.length) return false;

  return orders.some((order) => {
    const label = normalizeExpenseGroupText(order?.label);
    const orderId = normalizeExpenseGroupText(order?.orderId);
    return (!!label && reason === label) || (!!orderId && reason === orderId);
  });
}

function formatPendingCashOutValue(item) {
  if (isOwnCarFundsType(item?.fundsType)) {
    return `${formatExpenseNumber(item?.kilometer)} km`;
  }
  return `£${formatExpenseNumber(item?.amount)}`;
}

function formatPendingCashOutMeta(item) {
  const parts = [];
  const reason = String(item?.reason || "").trim();
  const from = String(item?.from || "").trim();
  const to = String(item?.to || "").trim();
  if (reason) {
    parts.push(reason);
  }
  if (from || to) {
    parts.push([from, to].filter(Boolean).join(from && to ? " → " : " "));
  }
  const screenshotsCount = Array.isArray(item?.screenshots) ? item.screenshots.length : 0;
  if (screenshotsCount > 0) {
    parts.push(`${screenshotsCount} screenshot${screenshotsCount === 1 ? "" : "s"}`);
  }
  return parts.join(" • ");
}

function nextCashOutDraftId() {
  CASH_OUT_DRAFT_SEQUENCE += 1;
  return `draft-${Date.now()}-${CASH_OUT_DRAFT_SEQUENCE}`;
}

function resetCashOutFormFields() {
  const fromInput = document.getElementById("co_from");
  const toInput = document.getElementById("co_to");
  const kmInput = document.getElementById("co_km");
  const cashInput = document.getElementById("co_cash");
  const fileInput = document.getElementById("co_screenshot");
  const fileNameEl = document.getElementById("co_screenshot_name");

  if (fromInput) fromInput.value = "";
  if (toInput) toInput.value = "";
  if (kmInput) kmInput.value = "";
  if (cashInput) cashInput.value = "";
  if (fileInput) fileInput.value = "";
  if (fileNameEl) fileNameEl.textContent = "No file chosen";

  closeFundsTypeDropdown();
  closeOwnCarInfoModal();
  setFundsTypeSelection("", { showOwnCarInfo: false });
}

function syncCashOutOrderActionUI() {
  const addExpenseBtn = document.getElementById("cashOutOrderAddExpenseBtn");
  const confirmBtn = document.getElementById("cashOutOrderNextBtn");
  const hasSelection = hasSelectedExpenseOrderScope();
  const hasDate = !!String(SELECTED_EXPENSE_ORDER_DATE || "").trim();
  const hasOrders = isOtherReasonSelected() || !!EXPENSE_ORDER_OPTIONS.length;
  const hasDrafts = PENDING_CASH_OUT_ITEMS.length > 0;
  const hasReason = !isOtherReasonSelected() || !!getSelectedExpenseManualReason();
  const isWaitingForOrders = EXPENSE_ORDER_OPTIONS_LOADING && !isOtherReasonSelected();
  const baseDisabled = !hasSelection || !hasDate || !hasOrders || !hasReason || isWaitingForOrders || IS_CASHOUT_SUBMITTING;

  if (addExpenseBtn) {
    addExpenseBtn.disabled = baseDisabled || IS_CASHOUT_DRAFTING;
  }

  if (confirmBtn) {
    confirmBtn.disabled = baseDisabled || !hasDrafts;
    confirmBtn.textContent = hasDrafts ? `Confirm (${PENDING_CASH_OUT_ITEMS.length})` : "Confirm";
  }
}

function renderPendingCashOutDrafts() {
  const wrap = document.getElementById("cashOutPendingWrap");
  const listEl = document.getElementById("cashOutPendingList");
  const countEl = document.getElementById("cashOutPendingCount");
  if (!wrap || !listEl || !countEl) return;

  if (!PENDING_CASH_OUT_ITEMS.length) {
    wrap.style.display = "none";
    listEl.innerHTML = "";
    countEl.textContent = "0";
    syncCashOutOrderActionUI();
    return;
  }

  countEl.textContent = String(PENDING_CASH_OUT_ITEMS.length);
  listEl.innerHTML = PENDING_CASH_OUT_ITEMS.map((item) => {
    const title = escapeHtml(String(item?.fundsType || "Cash Out").trim() || "Cash Out");
    const meta = formatPendingCashOutMeta(item);
    const value = escapeHtml(formatPendingCashOutValue(item));
    return `
      <div class="expense-draft-card" data-draft-id="${escapeHtml(item.id || "")}">
        <div class="expense-draft-card__main">
          <div class="expense-draft-card__title">${title}</div>
          <div class="expense-draft-card__meta">${meta ? escapeHtml(meta) : "Ready to save"}</div>
        </div>
        <div class="expense-draft-card__value">${value}</div>
        <button type="button" class="expense-draft-card__remove" data-draft-id="${escapeHtml(item.id || "")}" aria-label="Remove expense">✕</button>
      </div>
    `;
  }).join("");

  wrap.style.display = "block";
  syncCashOutOrderActionUI();
}

function clearPendingCashOutDrafts({ render = true } = {}) {
  PENDING_CASH_OUT_ITEMS = [];
  if (render) renderPendingCashOutDrafts();
}

function resetCashOutFlowState() {
  SELECTED_EXPENSE_ORDER_ID = "";
  SELECTED_EXPENSE_ORDER_LABEL = "";
  SELECTED_EXPENSE_ORDER_DATE = "";
  SELECTED_EXPENSE_ORDER_REASON = "";
  clearPendingCashOutDrafts({ render: false });
  resetCashOutFormFields();
  syncSelectedExpenseOrderUI();
  renderPendingCashOutDrafts();
}

function clearPendingDraftsForScopeChange(message) {
  if (!PENDING_CASH_OUT_ITEMS.length) return;
  clearPendingCashOutDrafts();
  if (message) showToast(message, "info", { duration: 2600 });
}

function getSelectedExpenseOrderOption() {
  if (isOtherReasonSelected()) {
    return buildOtherReasonExpenseOrderOption();
  }

  return EXPENSE_ORDER_OPTIONS.find(
    (item) => String(item?.id || "") === String(SELECTED_EXPENSE_ORDER_ID || ""),
  ) || null;
}

function formatExpenseOrderLabel(item) {
  if (item?.isManualReason || isOtherReasonExpenseOrderId(item?.id)) {
    return "Other reason";
  }

  const orderId = String(item?.orderId || "").trim() || "Order";
  const orderType = String(item?.orderType || "").trim();
  return orderType ? `${orderId} - ${orderType}` : orderId;
}

function formatExpenseOrderDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function positionExpenseOrderDropdown() {
  const trigger = document.getElementById("cashOutOrderTrigger");
  const dropdown = document.getElementById("cashOutOrderDropdown");
  if (!trigger || !dropdown || dropdown.hidden) return;

  const rect = trigger.getBoundingClientRect();
  const viewportPad = 16;
  const width = Math.min(rect.width, window.innerWidth - viewportPad * 2);
  const left = Math.min(Math.max(viewportPad, rect.left), window.innerWidth - viewportPad - width);
  const spaceBelow = Math.max(120, window.innerHeight - rect.bottom - viewportPad);
  const spaceAbove = Math.max(120, rect.top - viewportPad);
  const placeAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
  const availableSpace = placeAbove ? spaceAbove : spaceBelow;
  const optionsList = document.getElementById("cashOutOrderOptionsList");

  dropdown.style.left = `${left}px`;
  dropdown.style.width = `${width}px`;
  dropdown.style.maxHeight = `${Math.min(360, availableSpace)}px`;
  if (optionsList) {
    optionsList.style.maxHeight = `${Math.max(120, Math.min(260, availableSpace - 24))}px`;
  }

  if (placeAbove) {
    dropdown.style.top = "auto";
    dropdown.style.bottom = `${Math.max(viewportPad, window.innerHeight - rect.top + 8)}px`;
  } else {
    dropdown.style.bottom = "auto";
    dropdown.style.top = `${Math.min(window.innerHeight - viewportPad, rect.bottom + 8)}px`;
  }
}

function openExpenseOrderDropdown() {
  const trigger = document.getElementById("cashOutOrderTrigger");
  const dropdown = document.getElementById("cashOutOrderDropdown");
  if (!trigger || !dropdown) return;
  dropdown.hidden = false;
  trigger.classList.add("is-open");
  trigger.setAttribute("aria-expanded", "true");
  renderExpenseOrderDropdown();
  window.requestAnimationFrame(positionExpenseOrderDropdown);
}

function closeExpenseOrderDropdown() {
  const trigger = document.getElementById("cashOutOrderTrigger");
  const dropdown = document.getElementById("cashOutOrderDropdown");
  if (!trigger || !dropdown) return;
  dropdown.hidden = true;
  trigger.classList.remove("is-open");
  trigger.setAttribute("aria-expanded", "false");
}

function renderExpenseOrderDropdown() {
  const listEl = document.getElementById("cashOutOrderOptionsList");
  const stateEl = document.getElementById("cashOutOrderDropdownState");
  if (!listEl || !stateEl) return;

  const pickerOptions = getExpenseOrderPickerOptions();
  const hasRealOrders = EXPENSE_ORDER_OPTIONS.length > 0;

  if (EXPENSE_ORDER_OPTIONS_LOADING) {
    stateEl.textContent = "Loading orders...";
    stateEl.style.display = "block";
  } else if (!hasRealOrders) {
    const fallback = String(document.getElementById("cashOutOrderEmpty")?.textContent || "").trim() || "No orders available right now.";
    stateEl.textContent = `${fallback} You can still use Other reason.`;
    stateEl.style.display = "block";
  } else {
    stateEl.style.display = "none";
  }

  listEl.innerHTML = pickerOptions.map((item) => {
    const optionId = String(item?.id || "");
    const isManualReason = !!item?.isManualReason || isOtherReasonExpenseOrderId(optionId);
    const orderId = isManualReason
      ? "Other reason"
      : String(item?.orderId || "").trim() || "Order";
    const chipLabel = isManualReason ? "Manual" : "";
    const selected = optionId === String(SELECTED_EXPENSE_ORDER_ID || "");
    return `
      <button
        type="button"
        class="order-select__option${selected ? " is-selected" : ""}"
        data-order-id="${escapeHtml(optionId)}"
        role="option"
        aria-selected="${selected ? "true" : "false"}"
        title="${escapeHtml(formatExpenseOrderLabel(item))}"
      >
        <span class="order-select__option-main">
          <span class="order-select__option-id">${escapeHtml(orderId)}</span>
        </span>
        ${buildExpenseOrderTypeChipHtml(item?.orderType, { label: chipLabel })}
      </button>
    `;
  }).join("");

  window.requestAnimationFrame(positionExpenseOrderDropdown);
}

function syncSelectedExpenseOrderUI() {
  const selectEl = document.getElementById("cashOutOrderSelect");
  const trigger = document.getElementById("cashOutOrderTrigger");
  const triggerText = document.getElementById("cashOutOrderTriggerText");
  const emptyEl = document.getElementById("cashOutOrderEmpty");
  const manualReasonWrap = document.getElementById("cashOutManualReasonWrap");
  const manualReasonInput = getExpenseManualReasonInput();
  const selectedCard = document.getElementById("cashOutSelectedOrderCard");
  const selectedText = document.getElementById("cashOutSelectedOrderText");
  const selectedMeta = document.getElementById("cashOutSelectedOrderMeta");
  const dateInput = document.getElementById("cashOutOrderDate");
  const hasSelection = hasSelectedExpenseOrderScope();
  const selected = getSelectedExpenseOrderOption();
  const label = String(SELECTED_EXPENSE_ORDER_LABEL || selected?.label || formatExpenseOrderLabel(selected) || "").trim();
  const dateLabel = formatExpenseOrderDate(SELECTED_EXPENSE_ORDER_DATE);
  const manualReason = getSelectedExpenseManualReason();
  const isManualReason = isOtherReasonSelected();
  const pickerOptions = getExpenseOrderPickerOptions();

  if (selectEl) {
    const hasOption = Array.from(selectEl.options || []).some((opt) => String(opt.value || "") === SELECTED_EXPENSE_ORDER_ID);
    selectEl.value = hasSelection && hasOption ? SELECTED_EXPENSE_ORDER_ID : "";
  }

  if (dateInput && dateInput.value !== SELECTED_EXPENSE_ORDER_DATE) {
    dateInput.value = SELECTED_EXPENSE_ORDER_DATE;
  }

  if (triggerText) {
    if (hasSelection && selected) {
      triggerText.innerHTML = buildExpenseOrderSummaryHtml(selected);
    } else {
      triggerText.textContent = hasSelection ? label : "Select order...";
    }
  }

  if (trigger) {
    trigger.classList.toggle("is-placeholder", !hasSelection);
    trigger.classList.toggle("is-selected", hasSelection);
  }

  if (emptyEl) {
    emptyEl.style.display = emptyEl.textContent.trim() && !pickerOptions.length ? "block" : "none";
  }

  if (manualReasonWrap) {
    manualReasonWrap.style.display = isManualReason ? "block" : "none";
  }

  if (manualReasonInput) {
    if (manualReasonInput.value !== getSelectedExpenseManualReason({ trimmed: false })) {
      manualReasonInput.value = getSelectedExpenseManualReason({ trimmed: false });
    }
    manualReasonInput.disabled = !isManualReason;
    manualReasonInput.required = isManualReason;
  }

  if (selectedText) {
    if (selected) selectedText.innerHTML = buildExpenseOrderSummaryHtml(selected);
    else selectedText.textContent = label;
  }

  if (selectedMeta) {
    const metaParts = [];
    if (isManualReason && manualReason) {
      metaParts.push(`Reason: ${manualReason}`);
    }
    if (dateLabel) {
      metaParts.push(`Expense date: ${dateLabel}`);
    }
    selectedMeta.textContent = metaParts.join(" • ");
    selectedMeta.style.display = metaParts.length ? "block" : "none";
  }

  if (selectedCard) {
    selectedCard.style.display = hasSelection ? "block" : "none";
  }

  renderExpenseOrderDropdown();
  syncCashOutOrderActionUI();
}

function setSelectedExpenseOrder(orderId, label = "") {
  const previousId = String(SELECTED_EXPENSE_ORDER_ID || "").trim();
  SELECTED_EXPENSE_ORDER_ID = String(orderId || "").trim();

  if (!SELECTED_EXPENSE_ORDER_ID) {
    SELECTED_EXPENSE_ORDER_LABEL = "";
    SELECTED_EXPENSE_ORDER_REASON = "";
    syncSelectedExpenseOrderUI();
    return;
  }

  if (isOtherReasonExpenseOrderId(previousId) && !isOtherReasonExpenseOrderId(SELECTED_EXPENSE_ORDER_ID)) {
    SELECTED_EXPENSE_ORDER_REASON = "";
  }

  const matched = getSelectedExpenseOrderOption();
  SELECTED_EXPENSE_ORDER_LABEL = String(
    label || matched?.label || formatExpenseOrderLabel(matched) || "",
  ).trim();

  syncSelectedExpenseOrderUI();
}

function setSelectedExpenseOrderDate(dateValue = "") {
  SELECTED_EXPENSE_ORDER_DATE = String(dateValue || "").trim();
  syncSelectedExpenseOrderUI();
}

function populateExpenseOrderSelect() {
  const selectEl = document.getElementById("cashOutOrderSelect");
  const emptyEl = document.getElementById("cashOutOrderEmpty");
  if (!selectEl) return;

  const pickerOptions = getExpenseOrderPickerOptions();

  selectEl.innerHTML = `<option value="">Select order...</option>`;

  for (const item of pickerOptions) {
    if (!item?.id) continue;
    const opt = document.createElement("option");
    opt.value = String(item.id || "");
    opt.textContent = String(item.label || formatExpenseOrderLabel(item) || "Untitled order");
    selectEl.appendChild(opt);
  }

  const hasOptions = pickerOptions.length > 0;
  selectEl.disabled = !hasOptions;

  if (emptyEl) {
    emptyEl.textContent = hasOptions ? "" : "No orders available right now.";
    emptyEl.style.display = hasOptions ? "none" : "block";
  }

  if (SELECTED_EXPENSE_ORDER_ID) {
    const exists = pickerOptions.some(
      (item) => String(item?.id || "") === String(SELECTED_EXPENSE_ORDER_ID || ""),
    );
    if (!exists) {
      SELECTED_EXPENSE_ORDER_ID = "";
      SELECTED_EXPENSE_ORDER_LABEL = "";
      SELECTED_EXPENSE_ORDER_REASON = "";
      clearPendingCashOutDrafts({ render: false });
    }
  }

  syncSelectedExpenseOrderUI();
  renderPendingCashOutDrafts();
}

async function loadExpenseOrderOptions({ force = false } = {}) {
  const selectEl = document.getElementById("cashOutOrderSelect");
  const emptyEl = document.getElementById("cashOutOrderEmpty");

  if (!force && EXPENSE_ORDER_OPTIONS_LOADED) {
    EXPENSE_ORDER_OPTIONS_LOADING = false;
    populateExpenseOrderSelect();
    return EXPENSE_ORDER_OPTIONS;
  }

  if (!force && EXPENSE_ORDER_OPTIONS_REQUEST) {
    return EXPENSE_ORDER_OPTIONS_REQUEST;
  }

  EXPENSE_ORDER_OPTIONS_LOADING = true;

  if (selectEl) {
    selectEl.disabled = true;
    selectEl.innerHTML = `<option value="">Loading orders...</option>`;
  }
  if (emptyEl) {
    emptyEl.textContent = "";
    emptyEl.style.display = "none";
  }
  syncSelectedExpenseOrderUI();

  EXPENSE_ORDER_OPTIONS_REQUEST = (async () => {
    try {
      const res = await fetch("/api/expenses/orders/options", {
        cache: "no-store",
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Failed to load orders.");
      }

      EXPENSE_ORDER_OPTIONS = Array.isArray(data.options) ? data.options : [];
      EXPENSE_ORDER_OPTIONS_LOADED = true;
      populateExpenseOrderSelect();
      return EXPENSE_ORDER_OPTIONS;
    } catch (err) {
      console.error("Expense orders load error:", err);
      EXPENSE_ORDER_OPTIONS = [];
      EXPENSE_ORDER_OPTIONS_LOADED = true;
      if (emptyEl) {
        emptyEl.textContent = "Could not load orders right now.";
        emptyEl.style.display = "block";
      }
      populateExpenseOrderSelect();
      showToast("Failed to load orders.", "error");
      return [];
    } finally {
      EXPENSE_ORDER_OPTIONS_LOADING = false;
      EXPENSE_ORDER_OPTIONS_REQUEST = null;
      syncSelectedExpenseOrderUI();
    }
  })();

  return EXPENSE_ORDER_OPTIONS_REQUEST;
}

function openCashOutOrderModal({ resetSelection = true, resetDate = true, forceReload = false, resetDrafts = true } = {}) {
  if (resetDrafts) clearPendingCashOutDrafts({ render: false });
  if (resetSelection) setSelectedExpenseOrder("", "");
  if (resetDate) setSelectedExpenseOrderDate("");

  const modal = document.getElementById("cashOutOrderModal");
  if (modal) modal.style.display = "flex";

  closeExpenseOrderDropdown();
  syncSelectedExpenseOrderUI();
  renderPendingCashOutDrafts();
  void loadExpenseOrderOptions({ force: forceReload });
}

function closeCashOutOrderModal({ resetFlow = true } = {}) {
  closeExpenseOrderDropdown();
  const modal = document.getElementById("cashOutOrderModal");
  if (modal) modal.style.display = "none";
  if (resetFlow) resetCashOutFlowState();
}

function proceedToCashOutDetails() {
  const selected = getSelectedExpenseOrderOption();
  const orderId = String(selected?.id || SELECTED_EXPENSE_ORDER_ID || "").trim();
  const dateValue = String(SELECTED_EXPENSE_ORDER_DATE || "").trim();
  const manualReason = getSelectedExpenseManualReason();
  const isManualReason = isOtherReasonSelected();

  if (!hasSelectedExpenseOrderScope() || !orderId || !selected) {
    showToast("Please select an order first.", "error");
    return;
  }

  if (isManualReason && !manualReason) {
    showToast("Please write the reason first.", "error");
    return;
  }

  if (!dateValue) {
    showToast("Please select the expense date first.", "error");
    return;
  }

  setSelectedExpenseOrder(orderId, selected.label || formatExpenseOrderLabel(selected));
  closeCashOutOrderModal({ resetFlow: false });
  openCashOutModal();
}

/* =============================
   OPEN / CLOSE MODALS
   ============================= */
function openCashInModal() {
    const d = document.getElementById("ci_date");
    const c = document.getElementById("ci_cash");
    const r = document.getElementById("ci_receipt");
    const t = document.getElementById("ci_funds_type");
    const p = document.getElementById("ci_payment_by");
    const sInput = document.getElementById("ci_screenshot");
    const sName = document.getElementById("ci_screenshot_name");
    if (d) d.value = "";
    if (c) c.value = "";
    if (r) r.value = "";
    if (t) t.value = "";
    if (p) p.value = "";
    if (sInput) sInput.value = "";
    if (sName) sName.textContent = "No file chosen";
    hideCashInFromDropdown();
    closeCashInFundsTypeDropdown();
    setCashInFundsTypeSelection("");
    renderCashInFromDropdown("");
    const modal = document.getElementById("cashInModal");
    if (modal) modal.style.display = "flex";
}

function closeCashInModal() {
    closeCashInFundsTypeDropdown();
    const modal = document.getElementById("cashInModal");
    if (modal) modal.style.display = "none";
}

function openCashOutModal() {
    if (!hasSelectedExpenseOrderScope() || !String(SELECTED_EXPENSE_ORDER_DATE || "").trim()) {
      showToast("Please select the order and date first.", "error");
      openCashOutOrderModal({ resetSelection: false, resetDate: false, forceReload: false, resetDrafts: false });
      return;
    }

    if (isOtherReasonSelected() && !getSelectedExpenseManualReason()) {
      showToast("Please write the reason first.", "error");
      openCashOutOrderModal({ resetSelection: false, resetDate: false, forceReload: false, resetDrafts: false });
      return;
    }

    if (!FUNDS_TYPES_LOADED && !FUNDS_TYPES_LOADING) {
      void loadFundsTypes();
    }

    resetCashOutFormFields();
    syncSelectedExpenseOrderUI();

    const modal = document.getElementById("cashOutModal");
    if (modal) modal.style.display = "flex";
}

function closeCashOutModal({ returnToPicker = true } = {}) {
    const modal = document.getElementById("cashOutModal");
    if (modal) modal.style.display = "none";
    resetCashOutFormFields();
    if (returnToPicker) {
      openCashOutOrderModal({ resetSelection: false, resetDate: false, forceReload: false, resetDrafts: false });
    }
}

/* =============================
   SUBMIT CASH IN
   ============================= */
async function submitCashIn() {
    if (IS_CASHIN_SUBMITTING) return;

    const dateInput = document.getElementById("ci_date");
    const amountInput = document.getElementById("ci_cash");
    const typeInput = document.getElementById("ci_funds_type");
    const paymentByInput = document.getElementById("ci_payment_by");
    const receiptInput = document.getElementById("ci_receipt");
    const screenshotInput = document.getElementById("ci_screenshot");

    const date = dateInput ? String(dateInput.value || "").trim() : "";
    const amount = amountInput ? String(amountInput.value || "").trim() : "";
    const fundsType = typeInput ? String(typeInput.value || "").trim() : "";
    const paymentBy = paymentByInput ? String(paymentByInput.value || "").trim() : "";
    const receiptNumber = receiptInput ? String(receiptInput.value || "").trim() : "";
    const isTransfer = isCashInOnlineTransfer(fundsType);
    const isPayment = isCashInCashPayment(fundsType);

    if (!date || !amount || !fundsType || !paymentBy) {
      showToast("Please fill required fields.", "error");
      return;
    }

    if (!isTransfer && !isPayment) {
      showToast("Please select a valid funds type.", "error");
      return;
    }

    if (isPayment && !receiptNumber) {
      showToast("Receipt number is required for cash payment.", "error");
      return;
    }

    const files = Array.from(screenshotInput?.files || []);
    if (isTransfer && !files.length) {
      showToast("Transfer screenshot is required.", "error");
      return;
    }

    let screenshots = [];
    if (files.length) {
      const MAX_FILES = 6;
      if (files.length > MAX_FILES) {
        showToast(`You can upload up to ${MAX_FILES} images.`, "error");
        return;
      }

      try {
        screenshots = (await Promise.all(files.map(async (file) => {
          const dataUrl = await fileToDataURL(file);
          if (!dataUrl) return null;
          return {
            name: file?.name || "transfer.png",
            dataUrl,
          };
        }))).filter(Boolean);
      } catch (fileErr) {
        console.error("Cash-in screenshot read error:", fileErr);
        showToast("Failed to read the uploaded screenshot.", "error");
        return;
      }
    }

    const btn = document.getElementById("ci_submit");
    IS_CASHIN_SUBMITTING = true;
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Saving...";
    }

    closeCashInModal();
    showSubmitLoader("Saving cash in...");

    try {
        const res = await fetch("/api/expenses/cash-in", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              date,
              amount,
              fundsType,
              paymentBy,
              receiptNumber: isPayment ? receiptNumber : "",
              screenshots,
            }),
        });

        const data = await res.json();
        if (data.success) {
            await loadExpenses();
        } else {
            showToast("Error: " + (data.error || "Unknown error"), "error");
        }
    } catch (err) {
        console.error("Cash-in submit error:", err);
        showToast("Failed to submit cash in.", "error");
    } finally {
        hideSubmitLoader();
        IS_CASHIN_SUBMITTING = false;
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Submit";
        }
    }
}

/* =============================
   SUBMIT CASH OUT DRAFTS
   ============================= */
async function buildCashOutDraftFromForm() {
  const selectedOrderId = String(SELECTED_EXPENSE_ORDER_ID || "").trim();
  const selectedOrder = getSelectedExpenseOrderOption();
  const isManualReason = isOtherReasonSelected();
  const manualReason = getSelectedExpenseManualReason();
  const type = String(document.getElementById("co_type")?.value || "").trim();
  const date = String(SELECTED_EXPENSE_ORDER_DATE || "").trim();
  const from = String(document.getElementById("co_from")?.value || "").trim();
  const to = String(document.getElementById("co_to")?.value || "").trim();

  if (!hasSelectedExpenseOrderScope() || !selectedOrderId || !selectedOrder) {
    throw new Error("Please select an order first.");
  }

  if (isManualReason && !manualReason) {
    throw new Error("Please write the reason first.");
  }

  if (!type || !date) {
    throw new Error("Please fill required fields.");
  }

  const draft = {
    id: nextCashOutDraftId(),
    fundsType: type,
    from,
    to,
    reason: isManualReason
      ? manualReason
      : String(selectedOrder?.label || formatExpenseOrderLabel(selectedOrder) || "").trim(),
    screenshots: [],
  };

  if (isOwnCarFundsType(type)) {
    draft.kilometer = Number(document.getElementById("co_km")?.value || 0);
  } else {
    draft.amount = Number(document.getElementById("co_cash")?.value || 0);
    if (!Number.isFinite(draft.amount) || draft.amount <= 0) {
      throw new Error("Cash out amount is required.");
    }
  }

  const fileInput = document.getElementById("co_screenshot");
  const files = Array.from(fileInput?.files || []);
  if (files.length) {
    const MAX_FILES = 6;
    if (files.length > MAX_FILES) {
      throw new Error(`You can upload up to ${MAX_FILES} images.`);
    }

    for (const file of files) {
      if (!file) continue;
      const dataUrl = await fileToDataURL(file);
      if (!dataUrl) continue;
      draft.screenshots.push({ name: file.name, dataUrl });
    }
  }

  if (isScreenshotRequiredForFundsType(type) && !draft.screenshots.length) {
    if (isOwnCarFundsType(type)) {
      throw new Error("A Google Maps screenshot is required for Own car.");
    }
    throw new Error("Screenshot is required for this funds type.");
  }

  return draft;
}

function buildCashOutPayloadFromDraft(draft, selectedOrder) {
  const isManualReason = isOtherReasonExpenseOrderId(draft?.scopeId || SELECTED_EXPENSE_ORDER_ID);
  const body = {
    orderId: isManualReason ? "" : String(SELECTED_EXPENSE_ORDER_ID || "").trim(),
    orderIds: isManualReason ? [] : (Array.isArray(selectedOrder?.relationIds) ? selectedOrder.relationIds : []),
    orderLabel: isManualReason ? "Other reason" : (selectedOrder?.label || SELECTED_EXPENSE_ORDER_LABEL || ""),
    orderType: isManualReason ? "Manual reason" : (selectedOrder?.orderType || ""),
    orderDisplayId: isManualReason ? "" : (selectedOrder?.orderId || ""),
    reason: String(draft?.reason || "").trim(),
    fundsType: String(draft?.fundsType || "").trim(),
    date: String(SELECTED_EXPENSE_ORDER_DATE || "").trim(),
    from: String(draft?.from || "").trim(),
    to: String(draft?.to || "").trim(),
  };

  if (isOwnCarFundsType(body.fundsType)) {
    body.kilometer = Number(draft?.kilometer || 0);
  } else {
    body.amount = Number(draft?.amount || 0);
  }

  if (Array.isArray(draft?.screenshots) && draft.screenshots.length) {
    body.screenshots = draft.screenshots.map((shot) => ({
      name: String(shot?.name || "receipt.png").trim() || "receipt.png",
      dataUrl: shot?.dataUrl || "",
    })).filter((shot) => !!shot.dataUrl);
  }

  return body;
}

async function sendCashOutDraft(draft, selectedOrder) {
  const res = await fetch("/api/expenses/cash-out", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(buildCashOutPayloadFromDraft(draft, selectedOrder)),
  });

  const data = await res.json();
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || "Failed to save cash out.");
  }

  return data;
}

async function submitCashOut() {
  if (IS_CASHOUT_DRAFTING || IS_CASHOUT_SUBMITTING) return;

  const btn = document.getElementById("co_submit");
  IS_CASHOUT_DRAFTING = true;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Adding...";
  }

  try {
    const draft = await buildCashOutDraftFromForm();
    draft.scopeId = String(SELECTED_EXPENSE_ORDER_ID || "").trim();
    PENDING_CASH_OUT_ITEMS.push(draft);
    renderPendingCashOutDrafts();
    closeCashOutModal({ returnToPicker: true });
    showToast("Expense added. You can add another one or confirm now.", "success", { duration: 2500 });
  } catch (err) {
    console.error("Cash-out draft error:", err);
    showToast(err?.message || "Failed to add expense.", "error");
  } finally {
    IS_CASHOUT_DRAFTING = false;
    syncSelectedExpenseOrderUI();
    renderPendingCashOutDrafts();
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Add Expense";
    }
  }
}

async function confirmCashOutDrafts() {
  if (IS_CASHOUT_SUBMITTING || IS_CASHOUT_DRAFTING) return;

  const selectedOrder = getSelectedExpenseOrderOption();
  const orderId = String(selectedOrder?.id || SELECTED_EXPENSE_ORDER_ID || "").trim();
  const date = String(SELECTED_EXPENSE_ORDER_DATE || "").trim();
  const isManualReason = isOtherReasonSelected();
  const manualReason = getSelectedExpenseManualReason();

  if (!hasSelectedExpenseOrderScope() || !orderId || !selectedOrder) {
    showToast("Please select an order first.", "error");
    return;
  }

  if (isManualReason && !manualReason) {
    showToast("Please write the reason first.", "error");
    return;
  }

  if (!date) {
    showToast("Please select the expense date first.", "error");
    return;
  }

  if (!PENDING_CASH_OUT_ITEMS.length) {
    showToast("Add at least one expense before confirming.", "error");
    return;
  }

  const totalDrafts = PENDING_CASH_OUT_ITEMS.length;
  const failedDrafts = [];
  let savedCount = 0;
  let lastError = "";

  IS_CASHOUT_SUBMITTING = true;
  syncCashOutOrderActionUI();
  showSubmitLoader(`Saving ${totalDrafts} expense${totalDrafts === 1 ? "" : "s"}...`);

  try {
    for (const draft of PENDING_CASH_OUT_ITEMS) {
      try {
        await sendCashOutDraft(draft, selectedOrder);
        savedCount += 1;
      } catch (err) {
        console.error("Cash-out confirm error:", err);
        lastError = err?.message || "Failed to save expense.";
        failedDrafts.push(draft);
      }
    }

    PENDING_CASH_OUT_ITEMS = failedDrafts;
    renderPendingCashOutDrafts();

    if (savedCount > 0) {
      await loadExpenses();
    }

    if (!failedDrafts.length) {
      closeCashOutOrderModal({ resetFlow: true });
      showToast(`${savedCount} expense${savedCount === 1 ? "" : "s"} saved successfully.`, "success");
      return;
    }

    const failCount = failedDrafts.length;
    if (savedCount > 0) {
      showToast(`Saved ${savedCount} expense${savedCount === 1 ? "" : "s"}. ${failCount} failed, please review and confirm again.`, "error", { duration: 6000 });
    } else {
      showToast(lastError || "Failed to save expenses.", "error", { duration: 6000 });
    }
  } finally {
    hideSubmitLoader();
    IS_CASHOUT_SUBMITTING = false;
    syncSelectedExpenseOrderUI();
    renderPendingCashOutDrafts();
  }
}

/* =============================
   MODERN UPLOAD UI
   ============================= */
function setupUploadInputUI(inputId, buttonId, nameId, emptyText = "No file chosen") {
  const input = document.getElementById(inputId);
  const btn = document.getElementById(buttonId);
  const nameEl = document.getElementById(nameId);
  if (!input || !btn || !nameEl) return;

  btn.addEventListener("click", () => input.click());

  input.addEventListener("change", () => {
    const files = Array.from(input.files || []);
    if (!files.length) {
      nameEl.textContent = emptyText;
      return;
    }

    if (files.length === 1) {
      nameEl.textContent = files[0]?.name || "1 file selected";
      return;
    }

    nameEl.textContent = `${files.length} files selected`;
  });
}

function setupScreenshotUploadUI() {
  setupUploadInputUI("co_screenshot", "co_screenshot_btn", "co_screenshot_name");
  setupUploadInputUI("ci_screenshot", "ci_screenshot_btn", "ci_screenshot_name");
}

/* =============================
   SETTLE ACCOUNT
   ============================= */
function openSettleModal() {
  const receipt = document.getElementById("settle_receipt");
  if (receipt) receipt.value = "";
  const modal = document.getElementById("settleModal");
  if (modal) modal.style.display = "flex";
}

function closeSettleModal() {
  const modal = document.getElementById("settleModal");
  if (modal) modal.style.display = "none";
}

async function submitSettleAccount() {
  const receiptInput = document.getElementById("settle_receipt");
  const receiptNumber = String(receiptInput?.value || "").trim();

  if (!receiptNumber) {
    showToast("Please enter receipt number.", "error");
    return;
  }

  const btn = document.getElementById("settle_submit");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Saving...";
  }

  try {
    const res = await fetch("/api/expenses/settle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ receiptNumber }),
    });
    const data = await res.json();
    if (!data?.success) {
      showToast("Error: " + (data?.error || "Unknown error"), "error");
      return;
    }
    closeSettleModal();
    await loadExpenses();
  } catch (err) {
    console.error("Settle account error:", err);
    showToast("Failed to settle account.", "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Submit";
    }
  }
}
/* =============================
   LOAD EXPENSES FROM SERVER
   ============================= */

async function loadExpenses() {
    const container = document.getElementById("expensesContent");

    if (container) {
      container.innerHTML = `<div class="loader" role="status" aria-label="Loading"></div>`;
    }

    try {
        const res = await fetch("/api/expenses");
        const data = await res.json();

        if (!data.success) {
            if (container) container.innerHTML = "<p>Error loading data</p>";
            return;
        }

        const items = Array.isArray(data.items) ? data.items : [];
        EXPENSES_ALL_ITEMS = items;
        updateExpensesHeroSummary(items, data.lastSettledAt);

        const now = new Date();
        const oneWeekAgo = new Date(now);
        oneWeekAgo.setDate(now.getDate() - 7);
        const cutoff = oneWeekAgo.getTime();

        EXPENSES_WEEKLY_ITEMS = items.filter((item) => {
            const value = getExpenseTimeValue(item);
            return Number.isFinite(value) && value >= cutoff;
        });

        renderExpensesListForActiveFilter();

    } catch (err) {
        console.error("Load expenses error:", err);
        if (container) container.innerHTML = "<p>Error loading data</p>";
    }
}
/* =============================
   INITIALIZATION
   ============================= */
document.addEventListener("DOMContentLoaded", () => {
    setupCashInFromSearchableSelect();
    setupScreenshotUploadUI();
    syncCashInFundsTypeHiddenSelect();
    syncCashInFormTypeState();
    syncSelectedExpenseOrderUI();
    syncCashOutFormTypeState({ showOwnCarInfo: false });
    renderPendingCashOutDrafts();
    setupExpenseShotsViewer();
    bindExpenseFilterControls();

    const cashInBtn  = document.getElementById("cashInBtn");
    const cashOutBtn = document.getElementById("cashOutBtn");
    const cashInFundsTypePicker = document.getElementById("cashInFundsTypePicker");
    const cashInFundsTypeTrigger = document.getElementById("cashInFundsTypeTrigger");
    const cashInFundsTypeOptionsList = document.getElementById("cashInFundsTypeOptionsList");
    const fundsTypePicker = document.getElementById("fundsTypePicker");
    const fundsTypeTrigger = document.getElementById("fundsTypeTrigger");
    const fundsTypeOptionsList = document.getElementById("fundsTypeOptionsList");
    const ownCarInfoModal = document.getElementById("ownCarInfoModal");
    const ownCarInfoCard = ownCarInfoModal?.querySelector ? ownCarInfoModal.querySelector(".mini-info-modal__card") : null;
    const ownCarInfoCloseBtn = document.getElementById("ownCarInfoCloseBtn");
    const cashOutOrderPicker = document.getElementById("cashOutOrderPicker");
    const cashOutOrderTrigger = document.getElementById("cashOutOrderTrigger");
    const cashOutOrderOptionsList = document.getElementById("cashOutOrderOptionsList");
    const cashOutOrderDate = document.getElementById("cashOutOrderDate");
    const cashOutManualReason = document.getElementById("cashOutManualReason");
    const cashOutOrderAddExpenseBtn = document.getElementById("cashOutOrderAddExpenseBtn");
    const cashOutOrderNextBtn = document.getElementById("cashOutOrderNextBtn");
    const cashOutChangeOrderBtn = document.getElementById("cashOutChangeOrderBtn");
    const cashOutPendingList = document.getElementById("cashOutPendingList");

    if (cashInBtn) cashInBtn.addEventListener("click", openCashInModal);
    if (cashOutBtn) {
        cashOutBtn.addEventListener("click", (e) => {
            e.preventDefault();
            openCashOutOrderModal({ resetSelection: true, resetDate: true, forceReload: false, resetDrafts: true });
        });
    }
    if (cashInFundsTypeTrigger) {
        cashInFundsTypeTrigger.addEventListener("click", (e) => {
            e.preventDefault();
            const dropdown = document.getElementById("cashInFundsTypeDropdown");
            if (dropdown?.hidden) openCashInFundsTypeDropdown();
            else closeCashInFundsTypeDropdown();
        });
    }
    if (fundsTypeTrigger) {
        fundsTypeTrigger.addEventListener("click", (e) => {
            e.preventDefault();
            const dropdown = document.getElementById("fundsTypeDropdown");
            if (dropdown?.hidden) openFundsTypeDropdown();
            else closeFundsTypeDropdown();
        });
    }
    if (cashOutOrderTrigger) {
        cashOutOrderTrigger.addEventListener("click", (e) => {
            e.preventDefault();
            const dropdown = document.getElementById("cashOutOrderDropdown");
            if (dropdown?.hidden) openExpenseOrderDropdown();
            else closeExpenseOrderDropdown();
        });
    }
    if (cashInFundsTypeOptionsList) {
        cashInFundsTypeOptionsList.addEventListener("click", (e) => {
            const optionBtn = e.target?.closest ? e.target.closest(".order-select__option") : null;
            if (!optionBtn) return;
            const fundsType = String(optionBtn.getAttribute("data-cashin-funds-type") || "").trim();
            setCashInFundsTypeSelection(fundsType);
            closeCashInFundsTypeDropdown();
        });
    }
    if (fundsTypeOptionsList) {
        fundsTypeOptionsList.addEventListener("click", (e) => {
            const optionBtn = e.target?.closest ? e.target.closest(".order-select__option") : null;
            if (!optionBtn) return;
            const fundsType = String(optionBtn.getAttribute("data-funds-type") || "").trim();
            setFundsTypeSelection(fundsType, { showOwnCarInfo: true });
            closeFundsTypeDropdown();
        });
    }
    if (cashOutOrderOptionsList) {
        cashOutOrderOptionsList.addEventListener("click", (e) => {
            const optionBtn = e.target?.closest ? e.target.closest(".order-select__option") : null;
            if (!optionBtn) return;
            const orderId = String(optionBtn.getAttribute("data-order-id") || "").trim();
            const selected = getExpenseOrderPickerOptions().find(
                (item) => String(item?.id || "") === orderId,
            );
            if (orderId && orderId !== String(SELECTED_EXPENSE_ORDER_ID || "").trim()) {
              clearPendingDraftsForScopeChange("Added expenses were cleared because you changed the order.");
            }
            setSelectedExpenseOrder(orderId, selected?.label || formatExpenseOrderLabel(selected));
            closeExpenseOrderDropdown();
        });
    }
    if (cashOutManualReason) {
        const onReasonChange = (e) => {
            const nextReason = String(e.target?.value || "");
            const prevReason = getSelectedExpenseManualReason({ trimmed: false });
            if (!isOtherReasonSelected()) return;
            setSelectedExpenseManualReason(nextReason);
            if (nextReason.trim() !== String(prevReason || "").trim()) {
              clearPendingDraftsForScopeChange("Added expenses were cleared because you changed the reason.");
            }
        };
        cashOutManualReason.addEventListener("input", onReasonChange);
        cashOutManualReason.addEventListener("change", onReasonChange);
    }
    if (cashOutOrderDate) {
        const onDateChange = (e) => {
            const nextDate = String(e.target?.value || "").trim();
            if (nextDate !== String(SELECTED_EXPENSE_ORDER_DATE || "").trim()) {
              clearPendingDraftsForScopeChange("Added expenses were cleared because you changed the date.");
            }
            setSelectedExpenseOrderDate(nextDate);
        };
        cashOutOrderDate.addEventListener("input", onDateChange);
        cashOutOrderDate.addEventListener("change", onDateChange);
    }
    document.addEventListener("click", (e) => {
        if (!cashOutOrderPicker || !cashOutOrderPicker.contains(e.target)) {
          closeExpenseOrderDropdown();
        }
        if (!cashInFundsTypePicker || !cashInFundsTypePicker.contains(e.target)) {
          closeCashInFundsTypeDropdown();
        }
        if (!fundsTypePicker || !fundsTypePicker.contains(e.target)) {
          closeFundsTypeDropdown();
        }
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          closeExpenseOrderDropdown();
          closeCashInFundsTypeDropdown();
          closeFundsTypeDropdown();
          closeOwnCarInfoModal();
        }
    });
    document.addEventListener("scroll", () => {
        positionExpenseOrderDropdown();
        positionCashInFundsTypeDropdown();
        positionFundsTypeDropdown();
    }, true);
    window.addEventListener("resize", () => {
        positionExpenseOrderDropdown();
        positionCashInFundsTypeDropdown();
        positionFundsTypeDropdown();
    });
    if (cashOutOrderAddExpenseBtn) {
        cashOutOrderAddExpenseBtn.addEventListener("click", (e) => {
            e.preventDefault();
            proceedToCashOutDetails();
        });
    }
    if (cashOutOrderNextBtn) {
        cashOutOrderNextBtn.addEventListener("click", (e) => {
            e.preventDefault();
            confirmCashOutDrafts();
        });
    }
    if (cashOutChangeOrderBtn) {
        cashOutChangeOrderBtn.addEventListener("click", (e) => {
            e.preventDefault();
            closeCashOutModal({ returnToPicker: true });
        });
    }
    if (cashOutPendingList) {
        cashOutPendingList.addEventListener("click", (e) => {
            const removeBtn = e.target?.closest ? e.target.closest(".expense-draft-card__remove") : null;
            if (!removeBtn) return;
            const draftId = String(removeBtn.getAttribute("data-draft-id") || "").trim();
            if (!draftId) return;
            PENDING_CASH_OUT_ITEMS = PENDING_CASH_OUT_ITEMS.filter((item) => String(item?.id || "") !== draftId);
            renderPendingCashOutDrafts();
        });
    }
    if (ownCarInfoCloseBtn) {
      ownCarInfoCloseBtn.addEventListener("click", (e) => {
        e.preventDefault();
        closeOwnCarInfoModal();
      });
    }
    if (ownCarInfoModal) {
      ownCarInfoModal.addEventListener("click", (e) => {
        if (e.target === ownCarInfoModal) closeOwnCarInfoModal();
      });
    }
    if (ownCarInfoCard) {
      ownCarInfoCard.addEventListener("click", (e) => e.stopPropagation());
    }

    const viewAllBtn = document.getElementById("viewAllBtn");
    if (viewAllBtn) {
        // IMPORTANT:
        // We have an "outside click" handler for the bottom sheet.
        // Without stopping propagation, the same click that opens the sheet
        // will bubble up and immediately close it.
        viewAllBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            openAllExpensesModal();
        });
    }

    void loadFundsTypes();
    void loadCashInFromOptions();
    void loadExpenses();

    // زرار الـ Submit جوه مودال الكاش إن
    const ciSubmit = document.getElementById("ci_submit");
    if (ciSubmit) {
        ciSubmit.addEventListener("click", (e) => {
            e.preventDefault();
            submitCashIn();
        });
    }

    // زرار الـ Submit جوه مودال الكاش آوت
    const coSubmit = document.getElementById("co_submit");
    if (coSubmit) {
        coSubmit.addEventListener("click", (e) => {
            e.preventDefault();
            submitCashOut();
        });
    }

    // Bottom sheet: close ONLY when user clicks the overlay background.
    // This prevents the "open then instantly close" issue on mobile,
    // and avoids relying on a global document click handler.
    const allExpensesModal = document.getElementById("allExpenses");
    const iosSheet = document.getElementById("iosSheet");
    if (allExpensesModal && iosSheet) {
        allExpensesModal.addEventListener("click", (e) => {
            if (e.target === allExpensesModal) closeAllExpensesModal();
        });

        // Stop bubbling from inside the sheet so clicking content won't close it.
        iosSheet.addEventListener("click", (e) => e.stopPropagation());
    }

    // Settled my account
    const settleBtn = document.getElementById("settleAccountBtn");
    if (settleBtn) {
      settleBtn.addEventListener("click", (e) => {
        e.preventDefault();
        openSettleModal();
      });
    }

    const settleSubmit = document.getElementById("settle_submit");
    if (settleSubmit) {
      settleSubmit.addEventListener("click", (e) => {
        e.preventDefault();
        submitSettleAccount();
      });
    }
});

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

// OPEN iOS Bottom Sheet
function openAllExpensesModal() {
    const modal = document.getElementById("allExpenses");   // <-- كان allExpensesModal
    const sheet = document.getElementById("iosSheet");
    const list  = document.getElementById("allExpensesList");

    if (!modal || !sheet || !list) {
        console.error("All Expenses modal elements not found");
        return;
    }

    modal.style.display = "flex";
    setTimeout(() => {
        sheet.style.transform = "translateY(0)";
    }, 10);

    if (list) {
      list.innerHTML = `<div class="loader" role="status" aria-label="Loading"></div>`;
    }

    // Reset toggle each time we open
    VIEW_ALL_SHOW_PAST = false;
    VIEW_ALL_RECENT_ITEMS = [];
    VIEW_ALL_PAST_ITEMS = [];
    VIEW_ALL_LAST_SETTLED_AT = null;

    fetch("/api/expenses")
      .then(res => res.json())
      .then(data => {
        if (!data?.success) {
          if (list) list.innerHTML = "<p>Error loading expenses</p>";
          return;
        }

        const items = Array.isArray(data.items) ? data.items : [];
        VIEW_ALL_LAST_SETTLED_AT = data.lastSettledAt || null;

        const split = splitExpensesByLastSettlement(items, VIEW_ALL_LAST_SETTLED_AT);
        VIEW_ALL_RECENT_ITEMS = split.recent;
        VIEW_ALL_PAST_ITEMS = split.past;

        renderAllExpensesModalList(list);
      })
      .catch(err => {
        console.error("Error loading all expenses:", err);
        if (list) list.innerHTML = "<p>Error loading expenses</p>";
      });
}

// CLOSE
function closeAllExpensesModal() {
    const modal = document.getElementById("allExpenses");   // <-- كان allExpensesModal
    const sheet = document.getElementById("iosSheet");

    if (!modal || !sheet) return;

    sheet.style.transform = "translateY(100%)";

    setTimeout(() => {
        modal.style.display = "none";
    }, 300);
}

// (outside click is handled via the overlay listener above)
