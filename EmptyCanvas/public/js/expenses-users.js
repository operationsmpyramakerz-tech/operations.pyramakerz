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

      const lastSettledLabel = u.lastSettledDate
        ? `Last settled: ${escapeHtml(formatDateDisplay(u.lastSettledDate))}`
        : "Last settled: —";

      btn.innerHTML = `
        <span class="user-name">${escapeHtml(u.name)}</span>
        <span class="user-total">${totalStr}</span>
        <span class="user-count">(${u.count} items)</span>
        <span class="user-settled">${lastSettledLabel}</span>
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
  listEl.innerHTML = "Loading...";

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
    const fromD = from ? new Date(from) : null;
    const toD = to ? new Date(to) : null;

    result = result.filter((it) => {
      const raw = it?.date || it?.createdTime || it?.created_time || null;
      if (!raw) return true; // keep if no date

      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) return true;
      if (fromD && d < fromD) return false;
      if (toD && d > toD) return false;
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
  const from = document.getElementById("dateFrom")?.value || "";
  const to = document.getElementById("dateTo")?.value || "";
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

function buildExpenseItemElement(it) {
  const cashIn = Number(it.cashIn || 0);
  const cashOut = Number(it.cashOut || 0);

  const isIn = cashIn > 0;
  const arrow = isIn
    ? `<span class="arrow-icon arrow-in">↙</span>`
    : `<span class="arrow-icon arrow-out">↗</span>`;

  const title = isIn ? "Cash In" : it.fundsType || "Cash Out";

  const dateLine = it.date
    ? `<div class="expense-person"><strong>Date:</strong> ${escapeHtml(it.date)}</div>`
    : "";

  const line1 = isIn
    ? `<div class="expense-person"><strong>Cash in from:</strong> ${escapeHtml(
        it.cashInFrom || "-"
      )}</div>`
    : `<div class="expense-person"><strong>Reason:</strong> ${escapeHtml(
        it.reason || ""
      )}</div>`;

  const line2 = !isIn && (it.from || it.to)
    ? `<div class="expense-person">${escapeHtml(it.from || "")}${it.to ? " ← " + escapeHtml(it.to) : ""}</div>`
    : "";

  const screenshotHtml = !isIn ? renderReceiptImagesHtml(it) : "";

  const div = document.createElement("div");
  div.className = "expense-item";

  div.innerHTML = `
      <div class="expense-icon">${arrow}</div>

      <div class="expense-details">
        <div class="expense-title">${escapeHtml(title)}</div>
        ${dateLine}
        ${line1}
        ${line2}
        ${screenshotHtml}
      </div>

      <div class="expense-amount">
        ${cashIn ? `<span class="amount-in">+£${cashIn.toLocaleString()}</span>` : ""}
        ${cashOut ? `<span class="amount-out">-£${cashOut.toLocaleString()}</span>` : ""}
      </div>
    `;

  return div;
}

function renderUserExpensesGrouped(recentItems, pastItems, totalEl, listEl) {
  const recent = Array.isArray(recentItems) ? recentItems : [];
  const past = Array.isArray(pastItems) ? pastItems : [];

  listEl.innerHTML = "";

  // Always compute balance from RECENT (after last settle)
  let total = 0;
  for (const it of recent) {
    total += Number(it.cashIn || 0) - Number(it.cashOut || 0);
  }

  totalEl.textContent = formatGBP(total);
  setTotalBalanceCard(total);

  // Empty state for recent
  if (recent.length === 0) {
    // If user has old history, guide them to "Show past expenses"
    if (PAST_USER_ITEMS.length > 0) {
      const hint = document.createElement("p");
      hint.style.color = "#9ca3af";
      hint.style.marginTop = "0.5rem";
      hint.textContent = "No expenses since the last settlement.";
      listEl.appendChild(hint);
    } else {
      const empty = document.createElement("p");
      empty.style.color = "#9ca3af";
      empty.style.marginTop = "0.5rem";
      empty.textContent = "No expenses for this user.";
      listEl.appendChild(empty);
    }
  } else {
    recent.forEach((it) => listEl.appendChild(buildExpenseItemElement(it)));
  }

  // Past section (optional)
  if (SHOW_PAST_EXPENSES && past.length > 0) {
    // Divider line between recent and past
    const sep = document.createElement("div");
    sep.className = "expenses-separator";
    sep.innerHTML = "<span>Past expenses</span>";
    listEl.appendChild(sep);

    past.forEach((it) => listEl.appendChild(buildExpenseItemElement(it)));
  }
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

// Download Excel ONLY (after last settle) + respects filters
const downloadExcelBtn = document.getElementById("downloadExcelBtn");
if (downloadExcelBtn) {
  downloadExcelBtn.addEventListener("click", () => {
    // Always re-apply filters so download matches current UI controls
    const updated = applyFiltersAndSorting();
    if (!Array.isArray(updated.recent) || updated.recent.length === 0) {
      return alert("No expenses to download.");
    }

    fetch(`/api/expenses/export/excel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userName: document.getElementById("userExpensesTitle")?.textContent || "Expenses",
        items: updated.recent,
        lastSettledDate: LAST_SETTLED_DATE,
        lastSettledAt: LAST_SETTLED_AT,
      }),
    })
      .then((res) => res.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "expenses.xlsx";
        a.click();
      });
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

  if (!modal || !sheet) return;
  if (modal.style.display !== "flex") return;
  if (e.target.closest(".user-tab")) return;

  if (!sheet.contains(e.target)) closeUserExpensesModal();
});

function closeUserExpensesModal() {
  const modal = document.getElementById("userExpensesModal");
  const sheet = document.getElementById("userExpensesSheet");
  const pastWrapper = document.getElementById("pastExpensesWrapper");
  const toggleBtn = document.getElementById("togglePastExpensesBtn");

  if (!modal || !sheet) return;

  // reset state so next open starts clean
  SHOW_PAST_EXPENSES = false;
  if (toggleBtn) toggleBtn.textContent = "Show past expenses";
  if (pastWrapper) pastWrapper.style.display = "none";

  sheet.style.transform = "translateY(100%)";
  setTimeout(() => (modal.style.display = "none"), 300);
}

// ---------------------------
document.addEventListener("DOMContentLoaded", loadExpenseUsers);
