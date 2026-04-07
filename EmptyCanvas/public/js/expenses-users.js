// =======================
// expenses-users.js
// =======================

// ------------------------
// GLOBAL STATE
// ------------------------

// Full list returned by the API for the selected user
let CURRENT_USER_ITEMS = [];

// Split lists (relative to the last "Settled my account")
let RECENT_USER_ITEMS = []; // after last settle
let PAST_USER_ITEMS = [];   // last settle + older

// Filtered lists (after applying date filter + sorting)
let FILTERED_RECENT_ITEMS = [];
let FILTERED_PAST_ITEMS = [];

// UI state
let SHOW_PAST_EXPENSES = false;

// Last settlement metadata (best-effort)
let LAST_SETTLED_AT = null;   // ISO string (Notion created_time)
let LAST_SETTLED_DATE = null; // YYYY-MM-DD (Notion Date property)

// ------------------------
// HELPERS
// ------------------------

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizeFundsType(s) {
  return String(s || "").trim().toLowerCase();
}

function formatGBP(value) {
  const n = Number(value || 0);
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  return n < 0 ? `-£${formatted}` : `£${formatted}`;
}

function formatDateDisplay(dateStr) {
  const s = String(dateStr || "").trim();
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;

  // Match the rest of the UI style (UK)
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function toLocalDateKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "";

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTimeValue(it) {
  // Prefer Notion created_time (higher precision + stable for "after settle")
  const raw = it?.createdTime || it?.created_time || "";
  if (raw) {
    const t = new Date(raw).getTime();
    if (Number.isFinite(t)) return t;
  }

  // Fallback to the Date property (YYYY-MM-DD)
  const dRaw = it?.date || "";
  const t2 = dRaw ? new Date(dRaw).getTime() : NaN;
  return Number.isFinite(t2) ? t2 : 0;
}

function setTotalBalanceCard(total) {
  const card = document.getElementById("totalBalanceCard");
  if (!card) return;

  const n = Number(total || 0);
  card.classList.toggle("is-negative", n < 0);
  card.classList.toggle("is-positive", n > 0);
}

function showExpensesUsersToast({ type = "info", title = "", message = "" } = {}) {
  if (window.UI?.toast) {
    window.UI.toast({ type, title, message });
    return;
  }

  const parts = [title, message].filter(Boolean);
  alert(parts.join("\n") || "Done");
}

function getDateFilterValues() {
  return {
    from: document.getElementById("dateFrom")?.value || "",
    to: document.getElementById("dateTo")?.value || "",
  };
}

function hasActiveDateFilter(filters = getDateFilterValues()) {
  return !!(String(filters?.from || "").trim() || String(filters?.to || "").trim());
}

function getCombinedExpenseItems(...collections) {
  return collections.flatMap((items) => (Array.isArray(items) ? items : []));
}

function getExportableExpenseItems(updated) {
  const next = updated || applyFiltersAndSorting();
  if (hasActiveDateFilter()) {
    const sortType = document.getElementById("sortSelect")?.value || "newest";
    return filterAndSort(getCombinedExpenseItems(next?.recent, next?.past), {
      from: "",
      to: "",
      sortType,
    });
  }
  return Array.isArray(next?.recent) ? next.recent : [];
}

// ---------------------------------
// Receipts rendering (multiple images)
// ---------------------------------

function getReceiptImages(it) {
  if (Array.isArray(it?.screenshots) && it.screenshots.length) {
    return it.screenshots
      .map((s) => ({ name: s?.name || "", url: s?.url || "" }))
      .filter((s) => !!String(s.url || "").trim());
  }

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

function featherIconMarkup(name, attrs = {}) {
  try {
    if (!name || !window.feather?.icons?.[name]) return "";
    return window.feather.icons[name].toSvg(attrs);
  } catch (err) {
    return "";
  }
}

function formatExpenseNumber(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return "0";
  return num.toLocaleString("en-GB", { maximumFractionDigits: 2 });
}

function formatExpenseGroupDateLabel(value) {
  const raw = String(value || "").trim();
  if (!raw) return "No date";
  const date = new Date(`${raw}T00:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function normalizeGroupText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizeExpenseOrderTypeKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function getExpenseOrdersArray(item) {
  return Array.isArray(item?.orders) ? item.orders.filter(Boolean) : [];
}

function isOwnCarFundsType(value) {
  return normalizeFundsType(value) === "own car";
}

function getExpenseDisplayReason(item) {
  const rawReason = String(item?.reason || "").trim();
  const orders = getExpenseOrdersArray(item);
  const primaryOrder = orders[0] || null;
  const primaryLabel = String(primaryOrder?.label || "").trim();

  if (primaryLabel && rawReason) {
    const normalizedReason = normalizeGroupText(rawReason);
    const normalizedLabel = normalizeGroupText(primaryLabel);
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

// ------------------------
// SPLIT BY LAST SETTLEMENT
// ------------------------

function findLastSettledItem(items) {
  let best = null;
  let bestT = -Infinity;
  for (const it of Array.isArray(items) ? items : []) {
    if (normalizeFundsType(it?.fundsType) !== normalizeFundsType("Settled my account")) continue;
    const t = getTimeValue(it);
    if (t > bestT) {
      best = it;
      bestT = t;
    }
  }
  return best;
}

function splitByLastSettlement(items, apiLastSettledAt, apiLastSettledDate) {
  const all = Array.isArray(items) ? items : [];

  // Prefer server-computed lastSettledAt if available
  let settledAt = String(apiLastSettledAt || "").trim() || null;
  let settledDate = String(apiLastSettledDate || "").trim() || null;

  if (!settledAt) {
    const lastItem = findLastSettledItem(all);
    settledAt = lastItem?.createdTime || lastItem?.created_time || null;
    settledDate = settledDate || lastItem?.date || null;
  }

  // Save metadata globally for UI/debug
  LAST_SETTLED_AT = settledAt;
  LAST_SETTLED_DATE = settledDate;

  if (!settledAt) {
    return {
      recent: [...all],
      past: [],
      lastSettledAt: null,
      lastSettledDate: null,
    };
  }

  const cutoff = new Date(settledAt).getTime();
  if (!Number.isFinite(cutoff)) {
    return {
      recent: [...all],
      past: [],
      lastSettledAt: null,
      lastSettledDate: settledDate,
    };
  }

  const recent = [];
  const past = [];
  for (const it of all) {
    const t = getTimeValue(it);
    if (t > cutoff) recent.push(it);
    else past.push(it);
  }

  return {
    recent,
    past,
    lastSettledAt: settledAt,
    lastSettledDate: settledDate,
  };
}

// ---------------------------
// LOAD USERS + BUILD TABS
// ---------------------------

async function loadExpenseUsers() {
  const tabsEl = document.getElementById("userTabs");
  const infoEl = document.getElementById("usersInfo");

  if (!tabsEl || !infoEl) return;

  infoEl.innerHTML = '<div class="loader"></div>';

  try {
    const res = await fetch("/api/expenses/users");
    const data = await res.json();

    if (!data.success) {
      infoEl.textContent = "Error loading expense users.";
      return;
    }

    const users = data.users || [];
    tabsEl.innerHTML = "";

    if (users.length === 0) {
      infoEl.textContent = "No expenses found for any user.";
      return;
    }

    infoEl.textContent = "";

    users.forEach((u) => {
      const btn = document.createElement("button");
      btn.className = "user-tab";
      btn.dataset.userId = u.id;
      btn.dataset.userName = u.name;

      const totalValue = Number(u.total || 0);
      const totalStr = formatGBP(totalValue);

      btn.classList.toggle("has-negative", totalValue < 0);
      btn.classList.toggle("has-positive", totalValue > 0);

      const itemCount = Number(u.count || 0);
      const itemCountLabel = `${itemCount} item${itemCount === 1 ? "" : "s"}`;
      const lastSettledValue = u.lastSettledDate
        ? escapeHtml(formatDateDisplay(u.lastSettledDate))
        : "—";

      btn.innerHTML = `
        <div class="user-tab__header">
          <span class="user-tab__count">${escapeHtml(itemCountLabel)}</span>
          <span class="user-tab__name">${escapeHtml(u.name)}</span>
        </div>
        <div class="user-tab__divider" aria-hidden="true"></div>
        <div class="user-tab__body">
          <span class="user-tab__label">Current balance</span>
          <span class="user-total">${totalStr}</span>
        </div>
        <div class="user-tab__footer">
          <span class="user-tab__footer-label">Last settled</span>
          <span class="user-settled">${lastSettledValue}</span>
        </div>
      `;

      btn.addEventListener("click", () => {
        document
          .querySelectorAll(".user-tab")
          .forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");

        openUserExpensesModal(u.id, u.name);
      });

      tabsEl.appendChild(btn);
    });
  } catch (err) {
    console.error("loadExpenseUsers error:", err);
    infoEl.textContent = "Error loading expense users.";
  }
}

// ---------------------------
// OPEN MODAL + LOAD USER DATA
// ---------------------------

async function openUserExpensesModal(userId, userName) {
  const modal = document.getElementById("userExpensesModal");
  const sheet = document.getElementById("userExpensesSheet");
  const titleEl = document.getElementById("userExpensesTitle");
  const totalEl = document.getElementById("userExpensesTotal");
  const listEl = document.getElementById("userExpensesList");

  const pastWrapper = document.getElementById("pastExpensesWrapper");
  const togglePastBtn = document.getElementById("togglePastExpensesBtn");

  // Reset UI state
  SHOW_PAST_EXPENSES = false;
  if (togglePastBtn) togglePastBtn.textContent = "Show past expenses";
  if (pastWrapper) pastWrapper.style.display = "none";

  titleEl.textContent = `Expenses — ${userName}`;
  totalEl.textContent = formatGBP(0);
  setTotalBalanceCard(0);
  listEl.innerHTML = '<div class="expenses-empty">Loading expenses…</div>';

  modal.style.display = "flex";
  setTimeout(() => (sheet.style.transform = "translateY(0)"), 10);

  try {
    const res = await fetch(`/api/expenses/user/${encodeURIComponent(userId)}`);
    const data = await res.json();

    if (!data.success) {
      listEl.innerHTML = "<p style='color:#ef4444;'>Error loading expenses.</p>";
      return;
    }

    // Save full items
    CURRENT_USER_ITEMS = Array.isArray(data.items) ? [...data.items] : [];

    // Split by last settlement
    const split = splitByLastSettlement(
      CURRENT_USER_ITEMS,
      data.lastSettledAt,
      data.lastSettledDate
    );

    RECENT_USER_ITEMS = split.recent;
    PAST_USER_ITEMS = split.past;

    // If there is any past data, enable the toggle button.
    // (Past contains the latest "Settled my account" row + older history)
    if (pastWrapper && PAST_USER_ITEMS.length > 0) {
      pastWrapper.style.display = "flex";
    }

    // Initial render: show ONLY recent items (after last settle)
    const updated = applyFiltersAndSorting();
    renderUserExpensesGrouped(
      updated.recent,
      updated.past,
      totalEl,
      listEl
    );
  } catch (err) {
    console.error("openUserExpensesModal error:", err);
    listEl.innerHTML = "<p style='color:#ef4444;'>Error loading expenses.</p>";
  }
}

// ---------------------------
// FILTERS + SORTING
// ---------------------------

function filterAndSort(items, { from, to, sortType }) {
  let result = Array.isArray(items) ? [...items] : [];

  // ---- DATE FILTER ----
  if (from || to) {
    result = result.filter((it) => {
      const raw = it?.date || it?.createdTime || it?.created_time || null;
      if (!raw) return true; // keep if no date

      const itemDateKey = toLocalDateKey(raw);
      if (!itemDateKey) return true;
      if (from && itemDateKey < from) return false;
      if (to && itemDateKey > to) return false;
      return true;
    });
  }

  // ---- SORTING ----
  result.sort((a, b) => {
    const da = new Date(a.date || a.createdTime || a.created_time || 0);
    const db = new Date(b.date || b.createdTime || b.created_time || 0);
    const amtA = (a.cashIn || 0) - (a.cashOut || 0);
    const amtB = (b.cashIn || 0) - (b.cashOut || 0);

    switch (sortType) {
      case "oldest":
        return da - db;
      case "newest":
        return db - da;
      case "high":
        return amtB - amtA;
      case "low":
        return amtA - amtB;
      default:
        return db - da;
    }
  });

  return result;
}

function applyFiltersAndSorting() {
  const { from, to } = getDateFilterValues();
  const sortType = document.getElementById("sortSelect")?.value || "newest";

  FILTERED_RECENT_ITEMS = filterAndSort(RECENT_USER_ITEMS, { from, to, sortType });
  FILTERED_PAST_ITEMS = filterAndSort(PAST_USER_ITEMS, { from, to, sortType });

  return {
    recent: FILTERED_RECENT_ITEMS,
    past: FILTERED_PAST_ITEMS,
  };
}

// ---------------------------
// RENDER EXPENSES LIST (GROUPED)
// ---------------------------

function buildGroupedExpenseCollections(items) {
  const grouped = new Map();
  const source = Array.isArray(items) ? items : [];

  for (const item of source) {
    const reason = getExpenseDisplayReason(item);
    const date = String(item?.date || "").trim();
    const key = `${date}__${normalizeGroupText(reason)}`;

    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        date,
        reason: reason || "No reason",
        items: [],
        ordersMap: new Map(),
        totalCashIn: 0,
        totalCashOut: 0,
        totalKilometer: 0,
        createdSort: getTimeValue(item),
      });
    }

    const group = grouped.get(key);
    group.items.push(item);
    group.totalCashIn += Number(item?.cashIn || 0);
    group.totalCashOut += Number(item?.cashOut || 0);
    group.totalKilometer += Number(item?.kilometer || 0);
    group.createdSort = Math.max(group.createdSort || 0, getTimeValue(item));

    for (const order of getExpenseOrdersArray(item)) {
      const orderKey = String(order?.key || order?.orderId || order?.label || "").trim();
      if (!orderKey) continue;
      if (!group.ordersMap.has(orderKey)) {
        group.ordersMap.set(orderKey, {
          key: orderKey,
          orderId: String(order?.orderId || "").trim(),
          orderType: String(order?.orderType || "").trim(),
          label: String(order?.label || "").trim(),
          trackingGroupId: String(order?.trackingGroupId || "").trim(),
          trackingUrl: String(order?.trackingUrl || "").trim(),
          receiptViewerUrl: String(order?.receiptViewerUrl || "").trim(),
          relationIds: Array.isArray(order?.relationIds) ? order.relationIds.filter(Boolean) : [],
        });
      }
    }
  }

  const sortType = document.getElementById("sortSelect")?.value || "newest";
  const groups = Array.from(grouped.values()).map((group) => ({
    ...group,
    orders: Array.from(group.ordersMap?.values?.() || []),
  }));

  groups.sort((a, b) => {
    const timeA = Number.isFinite(new Date(`${a?.date || ""}T00:00:00`).getTime())
      ? new Date(`${a?.date || ""}T00:00:00`).getTime()
      : Number(a?.createdSort || 0);
    const timeB = Number.isFinite(new Date(`${b?.date || ""}T00:00:00`).getTime())
      ? new Date(`${b?.date || ""}T00:00:00`).getTime()
      : Number(b?.createdSort || 0);
    const netA = Number(a?.totalCashIn || 0) - Number(a?.totalCashOut || 0);
    const netB = Number(b?.totalCashIn || 0) - Number(b?.totalCashOut || 0);

    switch (sortType) {
      case "oldest":
        return timeA - timeB;
      case "high":
        return netB - netA;
      case "low":
        return netA - netB;
      case "newest":
      default:
        return timeB - timeA;
    }
  });

  return groups;
}

function getExpenseGroupTotalDisplay(group) {
  const cashNet = Number(group?.totalCashIn || 0) - Number(group?.totalCashOut || 0);
  const kilometerTotal = Number(group?.totalKilometer || 0);
  const hasCash =
    Math.abs(Number(group?.totalCashIn || 0)) > 1e-9 ||
    Math.abs(Number(group?.totalCashOut || 0)) > 1e-9;

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

function shouldHideExpenseGroupReason(group) {
  const reason = normalizeGroupText(group?.reason);
  const orders = Array.isArray(group?.orders) ? group.orders : [];
  if (!reason || !orders.length) return false;

  return orders.some((order) => {
    const label = normalizeGroupText(order?.label);
    const orderId = normalizeGroupText(order?.orderId);
    return (!!label && reason === label) || (!!orderId && reason === orderId);
  });
}

function buildUserExpenseTicketHtml(group, { compact = false } = {}) {
  const total = getExpenseGroupTotalDisplay(group);
  const rows = [...(Array.isArray(group?.items) ? group.items : [])].sort(
    (a, b) => getTimeValue(a) - getTimeValue(b)
  );
  const hideReason = shouldHideExpenseGroupReason(group);
  const hasOrders = Array.isArray(group?.orders) && group.orders.length > 0;
  const reasonText = String(group?.reason || "No reason").trim() || "No reason";
  const ordersHtml = hasOrders
    ? `<div class="expense-ticket__order-actions">${group.orders.map(buildExpenseOrderActionHtml).join("")}</div>`
    : "";
  const reasonHtml = hideReason
    ? ""
    : `<div class="expense-ticket__reason">${escapeHtml(reasonText)}</div>`;
  const headerSideHtml = hasOrders ? ordersHtml : reasonHtml;
  const secondaryReasonHtml = hasOrders && reasonHtml
    ? `<div class="expense-ticket__reason expense-ticket__reason--block">${escapeHtml(reasonText)}</div>`
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

function buildUserExpensesTicketsHtml(items, { emptyMessage = "No expenses yet.", compact = false } = {}) {
  const groups = buildGroupedExpenseCollections(items);
  if (!groups.length) {
    return `<div class="expenses-empty">${escapeHtml(emptyMessage)}</div>`;
  }
  return groups.map((group) => buildUserExpenseTicketHtml(group, { compact })).join("");
}

function renderUserExpensesGrouped(recentItems, pastItems, totalEl, listEl) {
  const recent = Array.isArray(recentItems) ? recentItems : [];
  const past = Array.isArray(pastItems) ? pastItems : [];
  const dateFilterActive = hasActiveDateFilter();
  const sortType = document.getElementById("sortSelect")?.value || "newest";
  const filteredPeriodItems = dateFilterActive
    ? filterAndSort(getCombinedExpenseItems(recent, past), { from: "", to: "", sortType })
    : [];
  const totalItems = dateFilterActive ? filteredPeriodItems : recent;
  const pastWrapper = document.getElementById("pastExpensesWrapper");
  const togglePastBtn = document.getElementById("togglePastExpensesBtn");

  if (pastWrapper) {
    pastWrapper.style.display = !dateFilterActive && PAST_USER_ITEMS.length > 0 ? "flex" : "none";
  }
  if (!dateFilterActive && togglePastBtn) {
    togglePastBtn.textContent = SHOW_PAST_EXPENSES
      ? "Hide past expenses"
      : "Show past expenses";
  }

  let total = 0;
  for (const it of totalItems) {
    total += Number(it.cashIn || 0) - Number(it.cashOut || 0);
  }

  totalEl.textContent = formatGBP(total);
  setTotalBalanceCard(total);

  let html = "";

  if (totalItems.length === 0) {
    if (dateFilterActive) {
      html += '<div class="expenses-empty">No expenses found for the selected period.</div>';
    } else if (PAST_USER_ITEMS.length > 0) {
      html += '<div class="expenses-empty">No expenses since the last settlement.</div>';
    } else {
      html += '<div class="expenses-empty">No expenses for this user.</div>';
    }
  } else if (dateFilterActive) {
    html += buildUserExpensesTicketsHtml(filteredPeriodItems);
  } else {
    html += buildUserExpensesTicketsHtml(recent);

    if (SHOW_PAST_EXPENSES && past.length > 0) {
      html += '<div class="expenses-separator"><span>Past expenses</span></div>';
      html += buildUserExpensesTicketsHtml(past);
    }
  }

  listEl.innerHTML = html;
}

// ---------------------------
// UI EVENTS
// ---------------------------

const applyBtn = document.getElementById("applyDateFilterBtn");
if (applyBtn) {
  applyBtn.addEventListener("click", () => {
    const updated = applyFiltersAndSorting();
    renderUserExpensesGrouped(
      updated.recent,
      updated.past,
      document.getElementById("userExpensesTotal"),
      document.getElementById("userExpensesList")
    );
  });
}

const resetBtn = document.getElementById("resetDateFilterBtn");
if (resetBtn) {
  resetBtn.addEventListener("click", () => {
    const fromEl = document.getElementById("dateFrom");
    const toEl = document.getElementById("dateTo");
    if (fromEl) fromEl.value = "";
    if (toEl) toEl.value = "";

    const updated = applyFiltersAndSorting();
    renderUserExpensesGrouped(
      updated.recent,
      updated.past,
      document.getElementById("userExpensesTotal"),
      document.getElementById("userExpensesList")
    );
  });
}

const sortSelect = document.getElementById("sortSelect");
if (sortSelect) {
  sortSelect.addEventListener("change", () => {
    const updated = applyFiltersAndSorting();
    renderUserExpensesGrouped(
      updated.recent,
      updated.past,
      document.getElementById("userExpensesTotal"),
      document.getElementById("userExpensesList")
    );
  });
}

// Download Excel using the active date filters when present
const downloadExcelBtn = document.getElementById("downloadExcelBtn");
if (downloadExcelBtn) {
  downloadExcelBtn.addEventListener("click", async () => {
    const filters = getDateFilterValues();
    const dateFilterActive = hasActiveDateFilter(filters);

    // Always re-apply filters so download matches current UI controls
    const updated = applyFiltersAndSorting();
    const exportItems = getExportableExpenseItems(updated);

    if (!exportItems.length) {
      showExpensesUsersToast({
        type: "info",
        title: "No expenses",
        message: dateFilterActive
          ? "No expenses found for the selected period."
          : "No expenses to download.",
      });
      return;
    }

    downloadExcelBtn.disabled = true;
    downloadExcelBtn.dataset.prevHtml = downloadExcelBtn.innerHTML;
    downloadExcelBtn.textContent = "Preparing...";

    try {
      const res = await fetch(`/api/expenses/export/excel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userName: document.getElementById("userExpensesTitle")?.textContent || "Expenses",
          items: exportItems,
          lastSettledDate: LAST_SETTLED_DATE,
          lastSettledAt: LAST_SETTLED_AT,
          dateFrom: filters.from || null,
          dateTo: filters.to || null,
        }),
      });

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err.error ||
            (dateFilterActive
              ? "No expenses found for the selected period."
              : "Failed to export Excel.")
        );
      }

      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") || "";
      const match = cd.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
      const fileName = decodeURIComponent((match && (match[1] || match[2])) || "expenses.xlsx");

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      showExpensesUsersToast({
        type: "success",
        title: "Downloaded",
        message: "Excel exported successfully.",
      });
    } catch (err) {
      console.error("download expenses excel error:", err);
      showExpensesUsersToast({
        type: "error",
        title: "Export failed",
        message: err?.message || "Failed to export Excel.",
      });
    } finally {
      downloadExcelBtn.disabled = false;
      const prev = downloadExcelBtn.dataset.prevHtml;
      if (prev) downloadExcelBtn.innerHTML = prev;
      else downloadExcelBtn.textContent = "Download Excel";
      if (window.feather) window.feather.replace();
    }
  });
}

// Show/Hide past expenses
const togglePastBtn = document.getElementById("togglePastExpensesBtn");
if (togglePastBtn) {
  togglePastBtn.addEventListener("click", () => {
    SHOW_PAST_EXPENSES = !SHOW_PAST_EXPENSES;
    togglePastBtn.textContent = SHOW_PAST_EXPENSES
      ? "Hide past expenses"
      : "Show past expenses";

    const updated = applyFiltersAndSorting();
    renderUserExpensesGrouped(
      updated.recent,
      updated.past,
      document.getElementById("userExpensesTotal"),
      document.getElementById("userExpensesList")
    );
  });
}

// ---------------------------
// CLOSE MODAL (outside click)
// ---------------------------

document.addEventListener("click", (e) => {
  const modal = document.getElementById("userExpensesModal");
  const sheet = document.getElementById("userExpensesSheet");
  const shotsModal = document.getElementById("expenseShotsModal");

  if (!modal || !sheet) return;
  if (modal.style.display !== "flex") return;
  if (shotsModal && shotsModal.style.display === "flex") return;
  if (e.target.closest(".user-tab")) return;

  if (!sheet.contains(e.target)) closeUserExpensesModal();
});

function closeUserExpensesModal() {
  const modal = document.getElementById("userExpensesModal");
  const sheet = document.getElementById("userExpensesSheet");
  const pastWrapper = document.getElementById("pastExpensesWrapper");
  const toggleBtn = document.getElementById("togglePastExpensesBtn");

  if (!modal || !sheet) return;

  if (typeof closeExpenseShotsModal === "function") {
    closeExpenseShotsModal();
  }

  // reset state so next open starts clean
  SHOW_PAST_EXPENSES = false;
  if (toggleBtn) toggleBtn.textContent = "Show past expenses";
  if (pastWrapper) pastWrapper.style.display = "none";

  sheet.style.transform = "translateY(100%)";
  setTimeout(() => (modal.style.display = "none"), 300);
}

// ---------------------------
document.addEventListener("DOMContentLoaded", () => {
  setupExpenseShotsViewer();
  loadExpenseUsers();
});
