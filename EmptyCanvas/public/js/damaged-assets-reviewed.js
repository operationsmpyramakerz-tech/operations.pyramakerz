// /public/js/damaged-assets-reviewed.js
// Reviewed Damaged Assets — Same layout as S.V Assets

(function () {
  const state = {
    q: "",
    loading: false,
    items: [],
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
      const date = new Date(d);
      const dd = date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
      const tt = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
      return `${dd} • ${tt}`;
    } catch { return String(d || ""); }
  }

  async function fetchReviewed() {
    state.loading = true;
    updateFetchStatus();
    show(els.loader);
    hide(els.empty);

    try {
      const url = new URL("/api/damaged-assets/reviewed", location.origin);
      const r = await fetch(url.toString(), { credentials: "same-origin" });
      if (!r.ok) throw new Error("Failed to load reviewed assets");
      const j = await r.json();

      const items = Array.isArray(j.rows) ? j.rows : [];
      state.items = items;
      state.lastFetchAt = new Date();
      render();
    } catch (e) {
      console.error(e);
      showToast(e.message || "Failed to load reviewed assets", "error");
      state.items = [];
      render();
    } finally {
      state.loading = false;
      updateFetchStatus();
      hide(els.loader);
    }
  }

  function render() {
    els.grid.innerHTML = "";

    if (!state.items.length) {
      show(els.empty);
      els.fetchStatus.textContent = "";
      featherSafeReplace();
      return;
    }

    hide(els.empty);

    const q = state.q.trim().toLowerCase();
    const filtered = q
      ? state.items.filter(it =>
          [it.title, it.comment, it.createdTime]
            .join(" ")
            .toLowerCase()
            .includes(q)
        )
      : state.items;

    filtered.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));

    filtered.forEach(it => els.grid.appendChild(renderCard(it)));

    els.fetchStatus.textContent = `${filtered.length} report${filtered.length > 1 ? "s" : ""}`;
    featherSafeReplace();
  }

  function renderCard(item) {
    const card = document.createElement("article");
    card.className = "order-card";
    const when = fmtDateTime(item.createdTime);
    const files = (item.files || []).map(f => `
      <div class="thumb">
        <img src="${f}" alt="file" style="width:100px;height:100px;object-fit:cover;border-radius:8px;border:1px solid #ddd;">
      </div>
    `).join("");

    card.innerHTML = `
      <div class="order-card__header" style="display:flex;justify-content:space-between;align-items:center;">
        <div style="display:flex;gap:10px;align-items:center;">
          <span class="badge badge--pill"><i data-feather="check-circle"></i></span>
          <div>
            <h3 style="margin:0;font-size:1.05rem;">${item.title}</h3>
            <div class="muted">${when}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="btn btn-ghost btn-sm" data-download data-id="${item.id}">
            <i data-feather="download"></i> PDF
          </button>
          <button class="btn btn-ghost btn-sm" data-expand>
            <i data-feather="chevron-down"></i>
          </button>
        </div>
      </div>
      <div class="order-card__body" data-body style="display:block;margin-top:10px;">
        <p><strong>Comment:</strong> ${item.comment || "(No comment)"}</p>
        ${files ? `<div style="margin-top:10px;display:flex;gap:10px;flex-wrap:wrap;">${files}</div>` : ""}
      </div>
    `;

    const body = card.querySelector("[data-body]");
    const btnExpand = card.querySelector("[data-expand]");
    const btnDownload = card.querySelector("[data-download]");

    btnExpand.addEventListener("click", () => {
      const isHidden = body.style.display === "none";
      body.style.display = isHidden ? "block" : "none";
      btnExpand.innerHTML = isHidden
        ? '<i data-feather="chevron-down"></i>'
        : '<i data-feather="chevron-right"></i>';
      featherSafeReplace();
    });

    btnDownload.addEventListener("click", async () => {
  try {
    btnDownload.disabled = true;
    btnDownload.innerHTML = '<i data-feather="loader"></i>';
    featherSafeReplace();

    const reportId = item.title; // assuming title or a field contains "DA-xxx"
    const pdfUrl = `/api/damaged-assets/report/${encodeURIComponent(reportId)}/pdf`;

    const a = document.createElement("a");
    a.href = pdfUrl;
    a.download = `${reportId}_Report.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();

    btnDownload.innerHTML = '<i data-feather="download"></i> PDF';
    btnDownload.disabled = false;
    featherSafeReplace();
  } catch (e) {
    showToast("Failed to download PDF", "error");
    btnDownload.disabled = false;
    btnDownload.innerHTML = '<i data-feather="download"></i> PDF';
    featherSafeReplace();
  }
});

    return card;
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
        t = setTimeout(render, 250);
      });
    }
    if (els.refresh) els.refresh.addEventListener("click", fetchReviewed);
  }

  document.addEventListener("DOMContentLoaded", () => {
    els.loader = $("#assetsLoader");
    els.empty = $("#emptyState");
    els.grid = $("#assetsGrid");
    els.search = $("#assetsSearch");
    els.refresh = $("#refreshBtn");
    els.fetchStatus = $("#fetchStatus");

    fetchReviewed();
    wireEvents();
  });
})();
