/* =============================
    EXPENSES PAGE — FRONTEND LOGIC
   ============================= */

let FUNDS_TYPES = [];

let CASH_IN_FROM_OPTIONS = [];
let EXPENSE_ORDER_OPTIONS = [];
let EXPENSE_ORDER_OPTIONS_LOADED = false;
let EXPENSE_ORDER_OPTIONS_REQUEST = null;
let SELECTED_EXPENSE_ORDER_ID = "";
let SELECTED_EXPENSE_ORDER_LABEL = "";
let SELECTED_EXPENSE_ORDER_DATE = "";
let EXPENSE_ORDER_OPTIONS_LOADING = false;

// Prevent duplicate submits
let IS_CASHIN_SUBMITTING = false;
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
  const iconMap = { error: "!", success: "✓", info: "i" };

  const toast = document.createElement("div");
  toast.className = `toast toast--${safeType}`;
  toast.innerHTML = `
    <div class="toast__icon" aria-hidden="true">${iconMap[safeType] || "!"}</div>
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

function buildExpenseItemHtmlForModal(it) {
  const isIn = Number(it?.cashIn || 0) > 0;
  const arrow = isIn
    ? `<span class="arrow-icon arrow-in">↙</span>`
    : `<span class="arrow-icon arrow-out">↗</span>`;

  const title = isIn ? "Cash In" : (it?.fundsType || "Cash Out");
  const dateLine = it?.date
    ? `<div class="expense-person"><strong>Date:</strong> ${escapeHtml(it.date)}</div>`
    : "";

  const line1 = isIn
    ? (
        it?.reason
          ? `<div class="expense-person"><strong>Receipt number:</strong> ${escapeHtml(it.reason)}</div>`
          : `<div class="expense-person"><strong>Cash in from:</strong> ${escapeHtml(it.cashInFrom || "-")}</div>`
      )
    : `<div class="expense-person"><strong>Reason:</strong> ${escapeHtml(it?.reason || "")}</div>`;

  const line2 = (!isIn && (it?.from || it?.to))
    ? `<div class="expense-person">${escapeHtml(it.from || "")} ← ${escapeHtml(it.to || "")}</div>`
    : "";

  const screenshotHtml = (!isIn) ? renderReceiptImagesHtml(it) : "";

  return `
    <div class="expense-item">
      <div class="expense-icon">${arrow}</div>
      <div class="expense-details">
        <div class="expense-title">${escapeHtml(title)}</div>
        ${dateLine}
        ${line1}
        ${line2}
        ${screenshotHtml}
      </div>
      <div class="expense-amount">
        ${it?.cashIn ? `<span class="amount-in">+£${Number(it.cashIn).toLocaleString()}</span>` : ""}
        ${it?.cashOut ? `<span class="amount-out">-£${Number(it.cashOut).toLocaleString()}</span>` : ""}
      </div>
    </div>
  `;
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
  html += recent.map(buildExpenseItemHtmlForModal).join("");

  // Past items (optional)
  if (VIEW_ALL_SHOW_PAST && past.length > 0) {
    html += `
      <div class="expenses-separator"><span>Past expenses</span></div>
    `;
    html += past.map(buildExpenseItemHtmlForModal).join("");
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
    try {
        const res = await fetch("/api/expenses/types");
        const data = await res.json();
        if (data.success) {
            FUNDS_TYPES = data.options;
        }
    } catch (err) {
        console.error("Funds Type Load Error", err);
        FUNDS_TYPES = [];
    }

    // Fill select inside Cash Out modal
    const sel = document.getElementById("co_type");
    if (sel) {
        sel.innerHTML = `<option value="">Select funds type...</option>`;
        FUNDS_TYPES.forEach(t => {
            sel.innerHTML += `<option value="${t}">${t}</option>`;
        });

        // KM logic
        sel.addEventListener("change", () => {
            const v = sel.value;
            const kmBlock   = document.getElementById("co_km_block");
            const cashBlock = document.getElementById("co_cash_block");
            if (kmBlock && cashBlock) {
                kmBlock.style.display  = v === "Own car" ? "block" : "none";
                cashBlock.style.display = v === "Own car" ? "none"  : "block";
            }
        });
    }
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
function getSelectedExpenseOrderOption() {
  return EXPENSE_ORDER_OPTIONS.find(
    (item) => String(item?.id || "") === String(SELECTED_EXPENSE_ORDER_ID || ""),
  ) || null;
}

function formatExpenseOrderLabel(item) {
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

function openExpenseOrderDropdown() {
  const trigger = document.getElementById("cashOutOrderTrigger");
  const dropdown = document.getElementById("cashOutOrderDropdown");
  if (!trigger || !dropdown) return;
  dropdown.hidden = false;
  trigger.classList.add("is-open");
  trigger.setAttribute("aria-expanded", "true");
  renderExpenseOrderDropdown();
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

  if (EXPENSE_ORDER_OPTIONS_LOADING && !EXPENSE_ORDER_OPTIONS.length) {
    stateEl.textContent = "Loading orders...";
    stateEl.style.display = "block";
    listEl.innerHTML = "";
    return;
  }

  if (!EXPENSE_ORDER_OPTIONS.length) {
    const fallback = String(document.getElementById("cashOutOrderEmpty")?.textContent || "").trim() || "No orders available right now.";
    stateEl.textContent = fallback;
    stateEl.style.display = "block";
    listEl.innerHTML = "";
    return;
  }

  stateEl.style.display = "none";
  listEl.innerHTML = EXPENSE_ORDER_OPTIONS.map((item) => {
    const optionId = String(item?.id || "");
    const orderId = String(item?.orderId || "").trim() || "Order";
    const orderType = String(item?.orderType || "").trim() || "Order";
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
        <span class="order-select__option-main">${escapeHtml(orderId)}</span>
        <span class="order-select__chip">${escapeHtml(orderType)}</span>
      </button>
    `;
  }).join("");
}

function syncSelectedExpenseOrderUI() {
  const selectEl = document.getElementById("cashOutOrderSelect");
  const nextBtn = document.getElementById("cashOutOrderNextBtn");
  const trigger = document.getElementById("cashOutOrderTrigger");
  const triggerText = document.getElementById("cashOutOrderTriggerText");
  const emptyEl = document.getElementById("cashOutOrderEmpty");
  const selectedCard = document.getElementById("cashOutSelectedOrderCard");
  const selectedText = document.getElementById("cashOutSelectedOrderText");
  const selectedMeta = document.getElementById("cashOutSelectedOrderMeta");
  const dateInput = document.getElementById("cashOutOrderDate");
  const hasSelection = !!String(SELECTED_EXPENSE_ORDER_ID || "").trim();
  const hasDate = !!String(SELECTED_EXPENSE_ORDER_DATE || "").trim();
  const label = String(SELECTED_EXPENSE_ORDER_LABEL || "").trim();
  const dateLabel = formatExpenseOrderDate(SELECTED_EXPENSE_ORDER_DATE);

  if (selectEl) {
    const hasOption = Array.from(selectEl.options || []).some((opt) => String(opt.value || "") === SELECTED_EXPENSE_ORDER_ID);
    selectEl.value = hasSelection && hasOption ? SELECTED_EXPENSE_ORDER_ID : "";
  }

  if (dateInput && dateInput.value !== SELECTED_EXPENSE_ORDER_DATE) {
    dateInput.value = SELECTED_EXPENSE_ORDER_DATE;
  }

  if (nextBtn) {
    nextBtn.disabled = !hasSelection || !hasDate || EXPENSE_ORDER_OPTIONS_LOADING || !EXPENSE_ORDER_OPTIONS.length;
  }

  if (triggerText) {
    triggerText.textContent = hasSelection ? label : "Select order...";
  }
  if (trigger) {
    trigger.classList.toggle("is-placeholder", !hasSelection);
    trigger.classList.toggle("is-selected", hasSelection);
  }

  if (emptyEl) {
    emptyEl.style.display = emptyEl.textContent.trim() ? "block" : "none";
  }

  if (selectedText) selectedText.textContent = label;
  if (selectedMeta) {
    selectedMeta.textContent = dateLabel ? `Expense date: ${dateLabel}` : "";
    selectedMeta.style.display = dateLabel ? "block" : "none";
  }
  if (selectedCard) selectedCard.style.display = label ? "block" : "none";

  renderExpenseOrderDropdown();
}

function setSelectedExpenseOrder(orderId, label = "") {
  SELECTED_EXPENSE_ORDER_ID = String(orderId || "").trim();

  if (!SELECTED_EXPENSE_ORDER_ID) {
    SELECTED_EXPENSE_ORDER_LABEL = "";
    syncSelectedExpenseOrderUI();
    return;
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

  selectEl.innerHTML = `<option value="">Select order...</option>`;

  for (const item of EXPENSE_ORDER_OPTIONS) {
    if (!item?.id) continue;
    const opt = document.createElement("option");
    opt.value = String(item.id || "");
    opt.textContent = String(item.label || formatExpenseOrderLabel(item) || "Untitled order");
    selectEl.appendChild(opt);
  }

  const hasOptions = EXPENSE_ORDER_OPTIONS.length > 0;
  selectEl.disabled = !hasOptions;

  if (emptyEl) {
    emptyEl.textContent = hasOptions ? "" : "No orders available right now.";
    emptyEl.style.display = hasOptions ? "none" : "block";
  }

  if (SELECTED_EXPENSE_ORDER_ID) {
    const exists = EXPENSE_ORDER_OPTIONS.some(
      (item) => String(item?.id || "") === String(SELECTED_EXPENSE_ORDER_ID || ""),
    );
    if (!exists) {
      SELECTED_EXPENSE_ORDER_ID = "";
      SELECTED_EXPENSE_ORDER_LABEL = "";
    }
  }

  syncSelectedExpenseOrderUI();
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

function openCashOutOrderModal({ resetSelection = true, resetDate = true, forceReload = false } = {}) {
  if (resetSelection) setSelectedExpenseOrder("", "");
  if (resetDate) setSelectedExpenseOrderDate("");

  const modal = document.getElementById("cashOutOrderModal");
  if (modal) modal.style.display = "flex";

  closeExpenseOrderDropdown();
  syncSelectedExpenseOrderUI();
  void loadExpenseOrderOptions({ force: forceReload });
}

function closeCashOutOrderModal() {
  closeExpenseOrderDropdown();
  const modal = document.getElementById("cashOutOrderModal");
  if (modal) modal.style.display = "none";
}

function proceedToCashOutDetails() {
  const selected = getSelectedExpenseOrderOption();
  const orderId = String(selected?.id || SELECTED_EXPENSE_ORDER_ID || "").trim();
  const dateValue = String(SELECTED_EXPENSE_ORDER_DATE || "").trim();

  if (!orderId || !selected) {
    showToast("Please select an order first.", "error");
    return;
  }

  if (!dateValue) {
    showToast("Please select the expense date first.", "error");
    return;
  }

  setSelectedExpenseOrder(orderId, selected.label || formatExpenseOrderLabel(selected));
  closeCashOutOrderModal();
  openCashOutModal();
}

/* =============================
   OPEN / CLOSE MODALS
   ============================= */
function openCashInModal() {
    const d = document.getElementById("ci_date");
    const c = document.getElementById("ci_cash");
    const r = document.getElementById("ci_receipt");
    const f = document.getElementById("ci_from");
    const s = document.getElementById("ci_from_search");
    if (d) d.value = "";
    if (c) c.value = "";
    if (r) r.value = "";
    if (f) f.value = "";
    if (s) s.value = "";
    hideCashInFromDropdown();
    renderCashInFromDropdown("");
    const modal = document.getElementById("cashInModal");
    if (modal) modal.style.display = "flex";
}

function closeCashInModal() {
    const modal = document.getElementById("cashInModal");
    if (modal) modal.style.display = "none";
}

function openCashOutModal() {
    if (!String(SELECTED_EXPENSE_ORDER_ID || "").trim() || !String(SELECTED_EXPENSE_ORDER_DATE || "").trim()) {
      showToast("Please select the order and date first.", "error");
      openCashOutOrderModal({ resetSelection: false, resetDate: false, forceReload: false });
      return;
    }

    const f   = document.getElementById("co_from");
    const t   = document.getElementById("co_to");
    const km  = document.getElementById("co_km");
    const ca  = document.getElementById("co_cash");
    const typ = document.getElementById("co_type");

    if (!FUNDS_TYPES.length) {
      void loadFundsTypes();
    }

    if (f)  f.value  = "";
    if (t)  t.value  = "";
    if (km) km.value = "";
    if (ca) ca.value = "";
    if (typ) typ.value = "";

    const kmBlock   = document.getElementById("co_km_block");
    const cashBlock = document.getElementById("co_cash_block");
    if (kmBlock)   kmBlock.style.display   = "none";
    if (cashBlock) cashBlock.style.display = "block";

    syncSelectedExpenseOrderUI();

    const modal = document.getElementById("cashOutModal");
    if (modal) modal.style.display = "flex";

    // Reset screenshot upload UI
    const fileInput = document.getElementById("co_screenshot");
    const fileName  = document.getElementById("co_screenshot_name");
    if (fileInput) fileInput.value = "";
    if (fileName) fileName.textContent = "No file chosen";
}

function closeCashOutModal() {
    const modal = document.getElementById("cashOutModal");
    if (modal) modal.style.display = "none";
}

/* =============================
   SUBMIT CASH IN
   ============================= */
async function submitCashIn() {
    if (IS_CASHIN_SUBMITTING) return;

    const dateInput = document.getElementById("ci_date");
    const amountInput = document.getElementById("ci_cash");
    const receiptInput = document.getElementById("ci_receipt");

    const date = dateInput ? String(dateInput.value || "").trim() : "";
    const amount = amountInput ? String(amountInput.value || "").trim() : "";
    const receiptNumber = receiptInput ? String(receiptInput.value || "").trim() : "";

    if (!date || !amount || !receiptNumber) {
        showToast("Please fill required fields.", "error");
    return;
    }

    const btn = document.getElementById("ci_submit");
    IS_CASHIN_SUBMITTING = true;
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Saving...";
    }

    // Close modal immediately & show loader to prevent duplicate submits
    closeCashInModal();
    showSubmitLoader("Saving cash in...");

    try {
        const res = await fetch("/api/expenses/cash-in", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ date, amount, receiptNumber }),
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
   SUBMIT CASH OUT
   ============================= */

async function submitCashOut() {
  if (IS_CASHOUT_SUBMITTING) return;

  const selectedOrderId = String(SELECTED_EXPENSE_ORDER_ID || "").trim();
  const selectedOrder = getSelectedExpenseOrderOption();
  const type   = String(document.getElementById("co_type")?.value || "").trim();
  const date   = String(SELECTED_EXPENSE_ORDER_DATE || "").trim();
  const from   = String(document.getElementById("co_from")?.value || "").trim();
  const to     = String(document.getElementById("co_to")?.value || "").trim();

  if (!selectedOrderId || !selectedOrder) {
    showToast("Please select an order first.", "error");
    return;
  }

  if (!type || !date) {
    showToast("Please fill required fields.", "error");
    return;
  }

  const btn = document.getElementById("co_submit");
  IS_CASHOUT_SUBMITTING = true;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Saving...";
  }

  // Close modal immediately & show loader to prevent duplicate submits
  closeCashOutModal();
  showSubmitLoader("Saving cash out...");

  const fileInput = document.getElementById("co_screenshot");
  const fileNameEl = document.getElementById("co_screenshot_name");
  let saved = false;

  try {
    const body = {
      orderId: selectedOrderId,
      orderIds: Array.isArray(selectedOrder?.relationIds) ? selectedOrder.relationIds : [],
      orderLabel: selectedOrder?.label || SELECTED_EXPENSE_ORDER_LABEL || "",
      orderType: selectedOrder?.orderType || "",
      orderDisplayId: selectedOrder?.orderId || "",
      fundsType: type,
      date,
      from,
      to,
    };

    // Own car vs Cash logic
    if (type === "Own car") {
      body.kilometer = Number(document.getElementById("co_km")?.value || 0);
    } else {
      body.amount = Number(document.getElementById("co_cash")?.value || 0);
    }

    // Screenshots (optional) — allow multiple images
    const files = Array.from(fileInput?.files || []);
    if (files.length) {
      const MAX_FILES = 6; // safety (request body size)
      if (files.length > MAX_FILES) {
        showToast(`You can upload up to ${MAX_FILES} images.`, "error");
        return;
      }

      body.screenshots = [];
      for (const f of files) {
        if (!f) continue;
        const dataUrl = await fileToDataURL(f);
        if (!dataUrl) continue;
        body.screenshots.push({ name: f.name, dataUrl });
      }
    }

    const res = await fetch("/api/expenses/cash-out", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await res.json();

    if (!data?.success) {
      showToast("Error: " + (data?.error || "Unknown error"), "error");
      return;
    }

    saved = true;
    setSelectedExpenseOrder("", "");
    setSelectedExpenseOrderDate("");
    await loadExpenses();
  } catch (err) {
    console.error("Cash-out submit error:", err);
    showToast("Failed to submit cash out.", "error");
  } finally {
    hideSubmitLoader();
    IS_CASHOUT_SUBMITTING = false;
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Submit";
    }

    if (!saved) syncSelectedExpenseOrderUI();

    // Reset screenshot upload UI
    if (fileInput) fileInput.value = "";
    if (fileNameEl) fileNameEl.textContent = "No file chosen";
  }
}

/* =============================
   MODERN UPLOAD UI
   ============================= */
function setupScreenshotUploadUI() {
  const input = document.getElementById("co_screenshot");
  const btn = document.getElementById("co_screenshot_btn");
  const nameEl = document.getElementById("co_screenshot_name");
  if (!input || !btn || !nameEl) return;

  btn.addEventListener("click", () => input.click());

  input.addEventListener("change", () => {
    const files = Array.from(input.files || []);
    if (!files.length) {
      nameEl.textContent = "No file chosen";
      return;
    }

    if (files.length === 1) {
      nameEl.textContent = files[0]?.name || "1 file selected";
      return;
    }

    nameEl.textContent = `${files.length} files selected`;
  });
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
    const totalBox = document.getElementById("totalAmount");

    if (container) {
      container.innerHTML = `<div class="loader" role="status" aria-label="Loading"></div>`;
    }

    try {
        const res = await fetch("/api/expenses");
        const data = await res.json();

        if (!data.success) {
            container.innerHTML = "<p>Error loading data</p>";
            return;
        }

        // Last settled time (under the "Settled my account" button)
        const lastSettledEl = document.getElementById("lastSettledTime");
        if (lastSettledEl) {
            const ts = formatLastSettledAt(data.lastSettledAt);
            lastSettledEl.textContent = `Last settled time: ${ts}`;
        }

        const items = data.items;

        // ============================
        // TOTAL
        // ============================
        let total = 0;
        items.forEach(it => {
            if (it.cashIn) total += it.cashIn;
            if (it.cashOut) total -= it.cashOut;
        });
        totalBox.innerHTML = `£${total.toLocaleString()}`;

        // ============================
        // FILTER — LAST 7 DAYS ONLY
        // ============================
        const now = new Date();
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(now.getDate() - 7);

        const weeklyItems = items.filter(it => {
            const date = new Date(it.date);
            return date >= oneWeekAgo;
        });

        // ============================
        // GROUP WEEKLY ITEMS BY DATE
        // ============================
        const groups = {};
        weeklyItems.forEach(item => {
            const d = item.date || "Unknown";
            if (!groups[d]) groups[d] = [];
            groups[d].push(item);
        });

        // ============================
        // RENDER WEEKLY DATA
        // ============================
        let html = "";

        for (const date of Object.keys(groups)) {
            html += `<div class="section-date">${date}</div>`;

            groups[date].forEach(it => {
                const isIn = it.cashIn > 0;
                const arrow = isIn
                    ? `<span class="arrow-icon arrow-in">↙</span>`
                    : `<span class="arrow-icon arrow-out">↗</span>`;

                const title = isIn ? "Cash In" : (it.fundsType || "Cash Out");
                const dateLine = it.date ? `<div class="expense-person"><strong>Date:</strong> ${escapeHtml(it.date)}</div>` : "";

                const line1 = isIn
                  ? (
                      it.reason
                        ? `<div class="expense-person"><strong>Receipt number:</strong> ${escapeHtml(it.reason)}</div>`
                        : `<div class="expense-person"><strong>Cash in from:</strong> ${escapeHtml(it.cashInFrom || "-")}</div>`
                    )
                  : `<div class="expense-person"><strong>Reason:</strong> ${escapeHtml(it.reason || "")}</div>`;

                const line2 = (!isIn && (it.from || it.to))
                  ? `<div class="expense-person">${escapeHtml(it.from || "")} → ${escapeHtml(it.to || "")}</div>`
                  : "";

                const screenshotHtml = (!isIn) ? renderReceiptImagesHtml(it) : "";

                html += `
                <div class="expense-item">

                    <div class="expense-icon">${arrow}</div>

                    <div class="expense-details">
                        <div class="expense-title">${escapeHtml(title)}</div>
                        ${dateLine}
                        ${line1}
                        ${line2}
                        ${screenshotHtml}
                    </div>

                    <div class="expense-amount">
                        ${it.cashIn ? `<span class="amount-in">+£${Number(it.cashIn).toLocaleString()}</span>` : ""}
                        ${it.cashOut ? `<span class="amount-out">-£${Number(it.cashOut).toLocaleString()}</span>` : ""}
                    </div>

                </div>`;
            });
        }

        container.innerHTML = html || "<p>No expenses for this week.</p>";

    } catch (err) {
        console.error("Load expenses error:", err);
        container.innerHTML = "<p>Error loading data</p>";
    }
}
/* =============================
   INITIALIZATION
   ============================= */
document.addEventListener("DOMContentLoaded", () => {
    setupCashInFromSearchableSelect();
    setupScreenshotUploadUI();
    syncSelectedExpenseOrderUI();

    const cashInBtn  = document.getElementById("cashInBtn");
    const cashOutBtn = document.getElementById("cashOutBtn");
    const cashOutOrderPicker = document.getElementById("cashOutOrderPicker");
    const cashOutOrderTrigger = document.getElementById("cashOutOrderTrigger");
    const cashOutOrderOptionsList = document.getElementById("cashOutOrderOptionsList");
    const cashOutOrderDate = document.getElementById("cashOutOrderDate");
    const cashOutOrderNextBtn = document.getElementById("cashOutOrderNextBtn");
    const cashOutChangeOrderBtn = document.getElementById("cashOutChangeOrderBtn");

    if (cashInBtn) cashInBtn.addEventListener("click", openCashInModal);
    if (cashOutBtn) {
        cashOutBtn.addEventListener("click", (e) => {
            e.preventDefault();
            openCashOutOrderModal({ resetSelection: true, resetDate: true, forceReload: false });
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
    if (cashOutOrderOptionsList) {
        cashOutOrderOptionsList.addEventListener("click", (e) => {
            const optionBtn = e.target?.closest ? e.target.closest(".order-select__option") : null;
            if (!optionBtn) return;
            const orderId = String(optionBtn.getAttribute("data-order-id") || "").trim();
            const selected = EXPENSE_ORDER_OPTIONS.find(
                (item) => String(item?.id || "") === orderId,
            );
            setSelectedExpenseOrder(orderId, selected?.label || formatExpenseOrderLabel(selected));
            closeExpenseOrderDropdown();
        });
    }
    if (cashOutOrderDate) {
        const onDateChange = (e) => setSelectedExpenseOrderDate(e.target?.value || "");
        cashOutOrderDate.addEventListener("input", onDateChange);
        cashOutOrderDate.addEventListener("change", onDateChange);
    }
    document.addEventListener("click", (e) => {
        if (!cashOutOrderPicker || cashOutOrderPicker.contains(e.target)) return;
        closeExpenseOrderDropdown();
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeExpenseOrderDropdown();
    });
    if (cashOutOrderNextBtn) {
        cashOutOrderNextBtn.addEventListener("click", (e) => {
            e.preventDefault();
            proceedToCashOutDetails();
        });
    }
    if (cashOutChangeOrderBtn) {
        cashOutChangeOrderBtn.addEventListener("click", (e) => {
            e.preventDefault();
            closeCashOutModal();
            openCashOutOrderModal({ resetSelection: false, resetDate: false, forceReload: false });
        });
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
