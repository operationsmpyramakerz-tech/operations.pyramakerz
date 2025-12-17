// =======================
// expenses-users.js
// =======================

// GLOBAL DATA HOLDERS
let CURRENT_USER_ITEMS = [];
let FILTERED_ITEMS = [];

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

      const totalStr = (u.total || 0).toLocaleString();

      btn.innerHTML = `
        <span>${u.name}</span>
        <span class="user-total">£${totalStr}</span>
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
  totalEl.textContent = "Total: £0";
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
    totalEl.textContent = "Total: £0";
    listEl.innerHTML = "<p style='color:#9ca3af;'>No expenses for this user.</p>";
    return;
  }

  listEl.innerHTML = "";
  let total = 0;

  items.forEach((it) => {
    const cashIn = Number(it.cashIn || 0);
    const cashOut = Number(it.cashOut || 0);
    total += cashIn - cashOut;

    const arrow = cashIn > 0
      ? `<span class="arrow-icon arrow-in">↙</span>`
      : `<span class="arrow-icon arrow-out">↗</span>`;

    const div = document.createElement("div");
    div.className = "expense-item";

    div.innerHTML = `
      <div class="expense-icon">${arrow}</div>

      <div class="expense-details">
        <div class="expense-title">
          ${it.fundsType || ""} <span style="color:#9ca3af;">${it.date}</span>
        </div>

        <!-- CLEAR & VISIBLE REASON -->
        <div class="expense-reason" style="font-size:0.95rem; font-weight:700; color:#111827; margin-bottom:4px;">
          ${it.reason || ""}
        </div>

        <div class="expense-person">${it.from || ""} ${it.to ? "→ " + it.to : ""}</div>
      </div>

      <div class="expense-amount">
        ${cashIn ? `<span style="color:#16a34a;">+£${cashIn}</span>` : ""}
        ${cashOut ? `<span style="color:#dc2626;">-£${cashOut}</span>` : ""}
      </div>
    `;

    listEl.appendChild(div);
  });

  totalEl.textContent = `Total: £${total.toLocaleString()}`;
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
