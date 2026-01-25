// public/js/notifications.js
// Notifications page UI (tabs: Today / This Week / Earlier)

(function () {
  const listEl = document.getElementById("notifCenterList");
  const tabs = Array.from(document.querySelectorAll(".notif-tab"));
  const seeAllBtn = document.getElementById("notifSeeAllBtn");
  const searchInput = document.getElementById("notifSearch");

  if (!listEl || !tabs.length) return;

  let allItems = [];
  let activeTab = "today";
  let showAll = false; // mimics the mock: card shows a few notifications, 'See All' expands
  let q = "";

  function startOfDay(ts) {
    const d = ts ? new Date(ts) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }

  function startOfWeek(ts) {
    const d = ts ? new Date(ts) : new Date();
    const day = d.getDay(); // 0=Sun
    const diffToMonday = (day === 0 ? 6 : day - 1);
    const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diffToMonday);
    return new Date(monday.getFullYear(), monday.getMonth(), monday.getDate()).getTime();
  }

  function timeAgo(ts) {
    try {
      const now = Date.now();
      const diff = Math.max(0, now - Number(ts || 0));
      const sec = Math.floor(diff / 1000);
      const min = Math.floor(sec / 60);
      const hr = Math.floor(min / 60);
      const day = Math.floor(hr / 24);

      if (day > 0) return `${day}d ago`;
      if (hr > 0) return `${hr}h ago`;
      if (min > 0) return `${min}m ago`;
      return `Just now`;
    } catch {
      return "";
    }
  }

  function iconFor(item) {
    const t = String(item?.type || "").toLowerCase();
    const title = String(item?.title || "").toLowerCase();

    if (t.includes("maintenance") || title.includes("maintenance")) return "tool";
    if (t.includes("analysis") || title.includes("analysis")) return "bar-chart-2";
    if (t.includes("order") || title.includes("order")) return "package";
    if (t.includes("task") || title.includes("task")) return "check-circle";
    if (t.includes("expense") || title.includes("expense") || title.includes("cash")) return "dollar-sign";
    return "bell";
  }

  function matchesQuery(item, query) {
    if (!query) return true;
    const hay = `${item?.title || ""} ${item?.body || ""}`.toLowerCase();
    return hay.includes(query.toLowerCase());
  }

  function classify(items) {
    const now = Date.now();
    const sod = startOfDay(now);
    const sow = startOfWeek(now);

    const out = {
      today: [],
      week: [],
      earlier: [],
    };

    (items || []).forEach((n) => {
      const ts = Number(n?.ts || 0);
      if (ts >= sod) out.today.push(n);
      else if (ts >= sow) out.week.push(n);
      else out.earlier.push(n);
    });

    Object.keys(out).forEach((k) => {
      out[k].sort((a, b) => (b?.ts || 0) - (a?.ts || 0));
    });

    return out;
  }

  function render() {
    const groups = classify(allItems.filter((n) => matchesQuery(n, q)));
    const items = groups[activeTab] || [];

    const shown = showAll ? items : items.slice(0, 3);

    if (!shown.length) {
      listEl.innerHTML = `<div class="notif-center-empty">No notifications</div>`;
      return;
    }

    listEl.innerHTML = shown
      .map((n) => {
        const unread = !n.read;
        const ico = iconFor(n);
        const title = escapeHtml(String(n.title || "Notification"));
        const body = escapeHtml(String(n.body || ""));
        const when = timeAgo(n.ts);
        const clickable = n.url ? "is-clickable" : "";
        const cls = `${clickable} ${unread ? "is-unread" : ""}`.trim();

        return `
          <div class="notif-row ${cls}" data-id="${escapeAttr(n.id)}" data-url="${escapeAttr(n.url || "")}">
            <div class="notif-ico"><i data-feather="${ico}"></i></div>
            <div class="notif-main">
              <div class="notif-head">
                <div class="notif-title"><span class="notif-dot"></span>${title}</div>
                <div class="notif-time">${escapeHtml(when)}</div>
              </div>
              <div class="notif-body">${body}</div>
            </div>
          </div>
        `;
      })
      .join("");

    if (window.feather) {
      try { window.feather.replace(); } catch {}
    }

    // Row click
    listEl.querySelectorAll(".notif-row").forEach((row) => {
      row.addEventListener("click", async () => {
        const id = row.getAttribute("data-id") || "";
        const url = row.getAttribute("data-url") || "";

        if (id) {
          await markRead(id);
          row.classList.remove("is-unread");
        }

        if (url) {
          window.location.href = url;
        }
      });
    });
  }

  async function load() {
    try {
      listEl.innerHTML = `<div class="notif-center-empty">Loading…</div>`;
      const resp = await fetch("/api/notifications?limit=80", { credentials: "include" });
      const data = await resp.json();
      allItems = Array.isArray(data?.items) ? data.items : [];
      render();
    } catch (e) {
      console.warn("[notifications page] load failed", e);
      listEl.innerHTML = `<div class="notif-center-empty">Couldn’t load notifications</div>`;
    }
  }

  async function markRead(id) {
    try {
      await fetch("/api/notifications/read", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ id }),
      });
      const it = allItems.find((x) => String(x?.id) === String(id));
      if (it) it.read = true;
    } catch {}
  }

  // Helpers (minimal escape — content is expected to be plain text)
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(str) {
    return escapeHtml(str).replace(/\s/g, " ");
  }

  // Tabs
  tabs.forEach((t) => {
    t.addEventListener("click", () => {
      tabs.forEach((x) => {
        x.classList.remove("is-active");
        x.setAttribute("aria-selected", "false");
      });
      t.classList.add("is-active");
      t.setAttribute("aria-selected", "true");
      activeTab = t.getAttribute("data-tab") || "today";
      render();
    });
  });

  // See all
  if (seeAllBtn) {
    seeAllBtn.addEventListener("click", () => {
      showAll = true;
      render();
    });
  }

  // Search
  if (searchInput) {
    let to = null;
    searchInput.addEventListener("input", () => {
      window.clearTimeout(to);
      to = window.setTimeout(() => {
        q = String(searchInput.value || "").trim();
        render();
      }, 120);
    });
  }

  // Initial load
  load();
})();
