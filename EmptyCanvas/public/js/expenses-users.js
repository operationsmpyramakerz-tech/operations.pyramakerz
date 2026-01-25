// =======================
// expenses-users.js
// =======================

// GLOBAL DATA HOLDERS
let CURRENT_USER_ITEMS = [];
let FILTERED_ITEMS = [];

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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


function formatGBP(value) {
  const n = Number(value || 0);
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });

  return n < 0 ? `-£${formatted}` : `£${formatted}`;
}

function setTotalBalanceCard(total) {
  const card = document.getElementById("totalBalanceCard");
  if (!card) return;

  const n = Number(total || 0);
  card.classList.toggle("is-negative", n < 0);
  card.classList.toggle("is-positive", n > 0);
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

      btn.innerHTML = `
        <span class="user-name">${escapeHtml(u.name)}</span>
        <span class="user-total">${totalStr}</span>
        <span class="user-count">(${u.count} items)</span>
      `;

      btn.addEventListener("click", () => {
        document.querySelectorAll(".user-tab").forEach(b => b.classList.remove("active"));
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

  titleEl.textContent = `Expenses — ${userName}`;
  totalEl.textContent = formatGBP(0);
  setTotalBalanceCard(0);
  listEl.innerHTML = "Loading...";

  modal.style.display = "flex";
  setTimeout(() => sheet.style.transform = "translateY(0)", 10);

  try {
    const res = await fetch(`/api/expenses/user/${encodeURIComponent(userId)}`);
    const data = await res.json();

    if (!data.success) {
      listEl.innerHTML = "<p style='color:#ef4444;'>Error loading expenses.</p>";
      return;
    }

    // Save full items
    CURRENT_USER_ITEMS = [...data.items];
    FILTERED_ITEMS = [...data.items];

    // Initial Render
    renderUserExpenses(FILTERED_ITEMS, totalEl, listEl);

  } catch (err) {
    console.error("openUserExpensesModal error:", err);
    listEl.innerHTML = "<p style='color:#ef4444;'>Error loading expenses.</p>";
  }
}

// ---------------------------
// APPLY FILTERS + SORTING
// ---------------------------
function applyFiltersAndSorting() {
  let result = [...CURRENT_USER_ITEMS];

  // ---- DATE FILTER ----
  const from = document.getElementById("dateFrom").value;
  const to = document.getElementById("dateTo").value;

  if (from || to) {
    const fromD = from ? new Date(from) : null;
    const toD = to ? new Date(to) : null;

    result = result.filter((it) => {
      const d = new Date(it.date);
      if (fromD && d < fromD) return false;
      if (toD && d > toD) return false;
      return true;
    });
  }

  // ---- SORTING ----
  const sortType = document.getElementById("sortSelect").value;

  result.sort((a, b) => {
    const da = new Date(a.date);
    const db = new Date(b.date);
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
    }
  });

  FILTERED_ITEMS = result;
  return result;
}

// ---------------------------
// RENDER EXPENSES LIST
// ---------------------------

function renderUserExpenses(items, totalEl, listEl) {
  if (!items || items.length === 0) {
    totalEl.textContent = formatGBP(0);
  setTotalBalanceCard(0);
    listEl.innerHTML = "<p style='color:#9ca3af;'>No expenses for this user.</p>";
    return;
  }

  listEl.innerHTML = "";
  let total = 0;

  items.forEach((it) => {
    const cashIn = Number(it.cashIn || 0);
    const cashOut = Number(it.cashOut || 0);
    total += cashIn - cashOut;

    const isIn = cashIn > 0;

    const arrow = isIn
      ? `<span class="arrow-icon arrow-in">↙</span>`
      : `<span class="arrow-icon arrow-out">↗</span>`;

    const title = isIn ? "Cash In" : (it.fundsType || "Cash Out");

    const dateLine = it.date
      ? `<div class="expense-person"><strong>Date:</strong> ${escapeHtml(it.date)}</div>`
      : "";

    const line1 = isIn
      ? `<div class="expense-person"><strong>Cash in from:</strong> ${escapeHtml(it.cashInFrom || "-")}</div>`
      : `<div class="expense-person"><strong>Reason:</strong> ${escapeHtml(it.reason || "")}</div>`;

    const line2 = (!isIn && (it.from || it.to))
      ? `<div class="expense-person">${escapeHtml(it.from || "")}${it.to ? " ← " + escapeHtml(it.to) : ""}</div>`
      : "";

    const screenshotHtml = (!isIn) ? renderReceiptImagesHtml(it) : "";

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

    listEl.appendChild(div);
  });

  totalEl.textContent = formatGBP(total);
  setTotalBalanceCard(total);
}


// ---------------------------
// FILTER BUTTON
// ---------------------------
document.getElementById("applyDateFilterBtn").addEventListener("click", () => {
  const updated = applyFiltersAndSorting();
  renderUserExpenses(updated,
    document.getElementById("userExpensesTotal"),
    document.getElementById("userExpensesList")
  );
});

// ---------------------------
// RESET FILTER
// ---------------------------
document.getElementById("resetDateFilterBtn").addEventListener("click", () => {
  document.getElementById("dateFrom").value = "";
  document.getElementById("dateTo").value = "";

  FILTERED_ITEMS = [...CURRENT_USER_ITEMS];
  renderUserExpenses(FILTERED_ITEMS,
    document.getElementById("userExpensesTotal"),
    document.getElementById("userExpensesList")
  );
});

// ---------------------------
// SORTING CHANGE EVENT
// ---------------------------
document.getElementById("sortSelect").addEventListener("change", () => {
  const updated = applyFiltersAndSorting();
  renderUserExpenses(updated,
    document.getElementById("userExpensesTotal"),
    document.getElementById("userExpensesList")
  );
});

// ---------------------------
// DOWNLOAD MENU TOGGLE
// ---------------------------
document.getElementById("downloadBtn").addEventListener("click", () => {
  const menu = document.getElementById("downloadMenu");
  menu.style.display = menu.style.display === "block" ? "none" : "block";
});

// Close download menu when clicking outside
document.addEventListener("click", (e) => {
  if (!e.target.closest(".download-wrapper")) {
    const m = document.getElementById("downloadMenu");
    if (m) m.style.display = "none";
  }
});

// ---------------------------
// DOWNLOAD PDF
// ---------------------------
document.getElementById("downloadPdfBtn").addEventListener("click", () => {
  if (!FILTERED_ITEMS.length) return alert("No expenses to download.");

  const from = document.getElementById("dateFrom").value || null;
  const to = document.getElementById("dateTo").value || null;

  const userId = CURRENT_USER_ITEMS[0]?.employeeCode || "N/A";

  fetch(`/api/expenses/export/pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userName: document.getElementById("userExpensesTitle").textContent.replace("Expenses — ", ""),
      userId,
      dateFrom: from,
      dateTo: to,
      items: FILTERED_ITEMS
    })
  })
    .then(res => res.blob())
    .then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "expenses.pdf";
      a.click();
    });
});

// ---------------------------
// DOWNLOAD EXCEL
// ---------------------------
document.getElementById("downloadExcelBtn").addEventListener("click", () => {
  if (!FILTERED_ITEMS.length) return alert("No expenses to download.");

  fetch(`/api/expenses/export/excel`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userName: document.getElementById("userExpensesTitle").textContent,
      items: FILTERED_ITEMS
    })
  })
  .then(res => res.blob())
  .then(blob => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "expenses.xlsx";
    a.click();
  });
});

// ---------------------------
// CLOSE MODAL (outside click)
// ---------------------------
document.addEventListener("click", (e) => {
  const modal = document.getElementById("userExpensesModal");
  const sheet = document.getElementById("userExpensesSheet");

  if (modal.style.display !== "flex") return;
  if (e.target.closest(".user-tab")) return;

  if (!sheet.contains(e.target)) closeUserExpensesModal();
});

// ---------------------------
function closeUserExpensesModal() {
  const modal = document.getElementById("userExpensesModal");
  const sheet = document.getElementById("userExpensesSheet");

  sheet.style.transform = "translateY(100%)";
  setTimeout(() => modal.style.display = "none", 300);
}

// ---------------------------
document.addEventListener("DOMContentLoaded", loadExpenseUsers);
