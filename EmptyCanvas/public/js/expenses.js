/* =============================
    EXPENSES PAGE — FRONTEND LOGIC
   ============================= */

let FUNDS_TYPES = [];

let CASH_IN_FROM_OPTIONS = [];

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

  document.body.classList.remove("is-loading");
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
    const d   = document.getElementById("co_date");
    const r   = document.getElementById("co_reason");
    const f   = document.getElementById("co_from");
    const t   = document.getElementById("co_to");
    const km  = document.getElementById("co_km");
    const ca  = document.getElementById("co_cash");
    const typ = document.getElementById("co_type");

    if (d)  d.value  = "";
    if (r)  r.value  = "";
    if (f)  f.value  = "";
    if (t)  t.value  = "";
    if (km) km.value = "";
    if (ca) ca.value = "";
    if (typ) typ.value = "";

    const kmBlock   = document.getElementById("co_km_block");
    const cashBlock = document.getElementById("co_cash_block");
    if (kmBlock)   kmBlock.style.display   = "none";
    if (cashBlock) cashBlock.style.display = "block";

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

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);     // data:*/*;base64,...
    r.onerror = reject;
    r.readAsDataURL(file);
  });
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

  const type   = String(document.getElementById("co_type")?.value || "").trim();
  const reason = String(document.getElementById("co_reason")?.value || "").trim();
  const date   = String(document.getElementById("co_date")?.value || "").trim();
  const from   = String(document.getElementById("co_from")?.value || "").trim();
  const to     = String(document.getElementById("co_to")?.value || "").trim();

  if (!type || !reason || !date) {
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

  try {
    const body = {
      fundsType: type,
      reason,
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

    // Screenshot (optional)
    const file = fileInput?.files?.[0];
    if (file) {
      body.screenshotName = file.name;
      body.screenshotDataUrl = await fileToDataURL(file);
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
    const file = input.files && input.files[0];
    nameEl.textContent = file ? file.name : "No file chosen";
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

    container.innerHTML = `<p style="color:#999;">Loading...</p>`;

    try {
        const res = await fetch("/api/expenses");
        const data = await res.json();

        if (!data.success) {
            container.innerHTML = "<p>Error loading data</p>";
            return;
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

                const screenshotHtml = (!isIn && it.screenshotUrl)
                  ? `<a class="expense-screenshot-link" href="${escapeHtml(it.screenshotUrl)}" target="_blank" rel="noopener noreferrer">
                        <img class="expense-screenshot-thumb" src="${escapeHtml(it.screenshotUrl)}" alt="Receipt screenshot" />
                      </a>`
                  : "";

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
document.addEventListener("DOMContentLoaded", async () => {
    await loadFundsTypes();
    await loadCashInFromOptions();
    await loadExpenses();

    setupCashInFromSearchableSelect();
    setupScreenshotUploadUI();

    const cashInBtn  = document.getElementById("cashInBtn");
    const cashOutBtn = document.getElementById("cashOutBtn");
    if (cashInBtn)  cashInBtn.addEventListener("click", openCashInModal);
    if (cashOutBtn) cashOutBtn.addEventListener("click", openCashOutModal);
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

    list.innerHTML = "Loading...";

    fetch("/api/expenses")
        .then(res => res.json())
        .then(data => {
            if (!data.success) {
                list.innerHTML = "<p>Error loading expenses</p>";
                return;
            }

            const items = data.items || [];
            if (!items.length) {
                list.innerHTML = "<p>No expenses yet.</p>";
                return;
            }

            list.innerHTML = "";
            items.forEach(it => {
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
                  ? `<div class="expense-person">${escapeHtml(it.from || "")} ← ${escapeHtml(it.to || "")}</div>`
                  : "";
                const screenshotHtml = (!isIn && it.screenshotUrl)
                  ? `<a class="expense-screenshot-link" href="${escapeHtml(it.screenshotUrl)}" target="_blank" rel="noopener noreferrer">
                        <img class="expense-screenshot-thumb" src="${escapeHtml(it.screenshotUrl)}" alt="Receipt screenshot" />
                      </a>`
                  : "";

                list.innerHTML += `
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
        })
        .catch(err => {
            console.error("Error loading all expenses:", err);
            list.innerHTML = "<p>Error loading expenses</p>";
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
