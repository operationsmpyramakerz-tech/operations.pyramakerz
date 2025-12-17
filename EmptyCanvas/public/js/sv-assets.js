// /public/js/sv-assets.js
// S.V Schools Assets — with Not Started / Reviewed Tabs

(function () {
  const state = {
    q: "",
    loading: false,
    groups: [],
    lastFetchAt: null,
  };

  const els = {};
  function $(sel) { return document.querySelector(sel); }
  function show(el) { if (el) el.style.display = ""; }
  function hide(el) { if (el) el.style.display = "none"; }
  function featherSafeReplace() { try { feather.replace(); } catch {} }

  function showToast(message, type = "info") {
    if (typeof UI !== "undefined" && UI.toast) UI.toast({ type, message });
    else alert(message);
  }

  function fmtDateTime(d) {
    try {
      const date = (d instanceof Date) ? d : new Date(d);
      const dd = date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
      const tt = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      return `${dd} • ${tt}`;
    } catch { return String(d || ""); }
  }

  function minuteKey(iso) {
    const d = new Date(iso || Date.now());
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mm = String(d.getUTCMinutes()).padStart(2, "0");
    return `${y}-${m}-${day}T${hh}:${mm}Z`;
  }

  // ---------- fetch ----------
  async function fetchAssets() {
    state.loading = true;
    updateFetchStatus();
    show(els.loader);
    hide(els.empty);

    try {
      const url = new URL("/api/sv-assets", location.origin);
      if (state.q) url.searchParams.set("search", state.q.trim());
      const r = await fetch(url.toString(), { credentials: "same-origin" });
      if (!r.ok) throw new Error("Failed to load assets");
      const j = await r.json();

      let groups = [];
      if (Array.isArray(j.groups)) groups = j.groups;
      else if (Array.isArray(j.rows)) {
        const map = new Map();
        for (const row of j.rows) {
          const key = row.batchId || minuteKey(row.createdAt);
          if (!map.has(key)) map.set(key, { key, createdAt: row.createdAt || Date.now(), items: [] });
          map.get(key).items.push(row);
        }
        groups = Array.from(map.values());
      } else if (Array.isArray(j)) {
        const map = new Map();
        for (const row of j) {
          const key = row.batchId || minuteKey(row.createdAt);
          if (!map.has(key)) map.set(key, { key, createdAt: row.createdAt || Date.now(), items: [] });
          map.get(key).items.push(row);
        }
        groups = Array.from(map.values());
      } else throw new Error(j.error || "Unexpected response");

      const q = state.q.trim().toLowerCase();
      if (q) {
        groups = groups
          .map(g => ({
            ...g,
            items: g.items.filter(it => {
              const s = [
                it.productName || "",
                it.note || "",
                it.createdAt || "",
                it["S.V Comment"] || ""
              ].join(" ").toLowerCase();
              return s.includes(q);
            })
          }))
          .filter(g => g.items.length);
      }

      groups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      state.groups = groups;
      state.lastFetchAt = new Date();
      render();
    } catch (e) {
      console.error(e);
      showToast(e.message || "Failed to load assets", "error");
      state.groups = [];
      render();
    } finally {
      state.loading = false;
      updateFetchStatus();
      hide(els.loader);
    }
  }

  // ---------- render ----------
  function render() {
    const notStartedGrid = document.getElementById("assetsGridNotStarted");
    const reviewedGrid = document.getElementById("assetsGridReviewed");

    notStartedGrid.innerHTML = "";
    reviewedGrid.innerHTML = "";

    if (!state.groups.length) {
      show(els.empty);
      els.total.textContent = "";
      featherSafeReplace();
      return;
    }

    hide(els.empty);

    const notStarted = [];
    const reviewed = [];

    for (const g of state.groups) {
      const hasUncommented = g.items.some(it => !it["S.V Comment"] || it["S.V Comment"].trim() === "");
      if (hasUncommented) notStarted.push(g);
      else reviewed.push(g);
    }

    notStarted.forEach(g => notStartedGrid.appendChild(renderBatchCard(g)));
    reviewed.forEach(g => reviewedGrid.appendChild(renderBatchCard(g)));

    els.total.textContent = `${state.groups.length} batch${state.groups.length > 1 ? 'es' : ''}`;
    featherSafeReplace();
  }

  function renderBatchCard(group) {
    const card = document.createElement("article");
    card.className = "order-card";
    const when = fmtDateTime(group.createdAt);
    const count = group.items?.length || 0;

    card.innerHTML = `
      <div class="order-card__header" style="display:flex;justify-content:space-between;align-items:center;">
        <div style="display:flex;gap:10px;align-items:center;">
          <span class="badge badge--pill"><i data-feather="clock"></i></span>
          <div>
            <h3 style="margin:0;font-size:1.05rem;">Batch at ${when}</h3>
            <div class="muted">${count} component${count !== 1 ? 's' : ''}</div>
          </div>
        </div>
        <button class="btn btn-ghost btn-sm" data-expand><i data-feather="chevron-down"></i></button>
      </div>
      <div class="order-card__body" data-body style="display:block;margin-top:10px;">
        ${renderItemsTable(group.items)}
      </div>
    `;

    const body = card.querySelector("[data-body]");
    const btnExpand = card.querySelector("[data-expand]");
    btnExpand.addEventListener("click", () => {
      const isHidden = body.style.display === "none";
      body.style.display = isHidden ? "block" : "none";
      btnExpand.innerHTML = isHidden ? '<i data-feather="chevron-down"></i>' : '<i data-feather="chevron-right"></i>';
      featherSafeReplace();
    });

    return card;
  }

  function renderItemsTable(items) {
    if (!items?.length) return `<div class="muted">No components in this batch.</div>`;
    const rows = items.map((it, i) => {
      const name = it.productName || it.product?.name || "—";
      const qty = it.qty ?? 1;
      const note = it.note || "";
      const existingComment = it["S.V Comment"] || "";
      const isLocked = existingComment.trim() !== "";
      const commentInputId = `sv-comment-${it.id}`;
      return `
        <tr>
          <td>${i + 1}</td>
          <td>${name}</td>
          <td>${qty}</td>
          <td>${note}</td>
          <td>
            <input type="text" id="${commentInputId}" placeholder="S.V Comment"
                   value="${existingComment}"
                   ${isLocked ? "disabled" : ""}
                   style="padding:4px 6px;border:1px solid #ccc;border-radius:6px;background:${isLocked ? '#f5f5f5' : 'white'};">
            <button class="btn btn-sm btn-primary" data-send-comment data-id="${it.id}" data-input="${commentInputId}"
                    ${isLocked ? "disabled" : ""}>${isLocked ? "Saved" : "Send"}</button>
          </td>
        </tr>`;
    }).join("");

    setTimeout(() => {
      document.querySelectorAll("[data-send-comment]").forEach(btn => {
        btn.addEventListener("click", async () => {
          if (btn.disabled) return;
          const input = document.getElementById(btn.dataset.input);
          const comment = input.value.trim();
          if (!comment) return showToast("Please enter a comment before sending.", "warning");

          btn.disabled = true;
          input.disabled = true;
          btn.textContent = "Sending...";
          try {
            const res = await fetch(`/api/sv-assets/${btn.dataset.id}/comment`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ comment }),
            });
            const j = await res.json();
            if (!res.ok || !j.ok) throw new Error(j.error || "Failed to save comment");
            showToast("Comment saved successfully!", "success");
            btn.textContent = "Saved";
            input.style.background = "#f5f5f5";
          } catch (e) {
            showToast("Failed to send comment", "error");
            btn.disabled = false;
            input.disabled = false;
            btn.textContent = "Send";
          }
        });
      });
    }, 100);

    return `
      <div class="table-responsive">
        <table class="table">
          <thead><tr><th>#</th><th>Product</th><th>Qty</th><th>Note</th><th>S.V Comment</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function updateFetchStatus() {
    if (!els.fetchStatus) return;
    if (state.loading) els.fetchStatus.textContent = "Loading…";
    else if (state.lastFetchAt) els.fetchStatus.textContent = "Updated " + fmtDateTime(state.lastFetchAt);
    else els.fetchStatus.textContent = "";
  }

  function wireEvents() {
    if (els.search) {
      let t = null;
      els.search.addEventListener("input", () => {
        state.q = els.search.value;
        clearTimeout(t);
        t = setTimeout(fetchAssets, 250);
      });
    }
    if (els.refresh) els.refresh.addEventListener("click", fetchAssets);
  }

  document.addEventListener("DOMContentLoaded", () => {
    els.loader = $("#assetsLoader");
    els.empty = $("#emptyState");
    els.total = $("#totalBatches");
    els.fetchStatus = $("#fetchStatus");
    els.search = $("#assetsSearch");
    els.refresh = $("#refreshBtn");

    const tabNotStarted = $("#tabNotStarted");
    const tabReviewed = $("#tabReviewed");
    const gridNotStarted = $("#assetsGridNotStarted");
    const gridReviewed = $("#assetsGridReviewed");

    function switchTab(tab) {
      if (tab === "not") {
        tabNotStarted.classList.add("active");
        tabReviewed.classList.remove("active");
        gridNotStarted.style.display = "";
        gridReviewed.style.display = "none";
      } else {
        tabNotStarted.classList.remove("active");
        tabReviewed.classList.add("active");
        gridNotStarted.style.display = "none";
        gridReviewed.style.display = "";
      }
      feather.replace();
    }

    tabNotStarted.addEventListener("click", () => switchTab("not"));
    tabReviewed.addEventListener("click", () => switchTab("rev"));

    fetchAssets();
    wireEvents();
  });
})();
