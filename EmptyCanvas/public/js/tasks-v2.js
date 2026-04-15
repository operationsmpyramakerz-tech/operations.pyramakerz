// public/js/tasks-v2.js
// Tasks (V2) UI wiring:
// - Calendar (week) built from Delivery Date (Notion "Delivery Date" -> API "dueDate")
// - Filter dropdown: My tasks and Delegated tasks

(function () {
  "use strict";

  function $(id) {
    return document.getElementById(id);
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function isoDayFromAny(dateOrIso) {
    if (!dateOrIso) return "";
    if (dateOrIso instanceof Date) {
      const y = dateOrIso.getFullYear();
      const m = String(dateOrIso.getMonth() + 1).padStart(2, "0");
      const d = String(dateOrIso.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }
    const s = String(dateOrIso);
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
  }

  function getTodayIso() {
    return isoDayFromAny(new Date());
  }

  // Parse an ISO date or datetime string into a LOCAL Date using only YYYY-MM-DD
  // (Avoids timezone shifts when Notion returns date-only strings.)
  function parseIsoDayToLocalDate(iso) {
    const s = String(iso || "");
    const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const d = Number(m[3]);
    return new Date(y, mo, d);
  }

  function formatMonthName(date) {
    try {
      return date.toLocaleString("en-US", { month: "long" });
    } catch {
      return "";
    }
  }

  function formatFullDate(date) {
    try {
      return date.toLocaleDateString("en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "";
    }
  }

  function addDays(date, days) {
    const d = new Date(date.getTime());
    d.setDate(d.getDate() + Number(days || 0));
    return d;
  }

  function startOfWeekSunday(date) {
    const d = new Date(date.getTime());
    const day = d.getDay(); // 0..6 (Sun..Sat)
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - day);
    return d;
  }

  function initialsFromName(name) {
    const n = String(name || "").trim();
    if (!n) return "";
    const parts = n.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] || "";
    const last = parts.length > 1 ? parts[parts.length - 1]?.[0] : "";
    return (first + last).toUpperCase();
  }

  const AVATAR_CLASSES = ["tv2-avatar--a", "tv2-avatar--b", "tv2-avatar--c", "tv2-avatar--d", "tv2-avatar--e"];

  function renderAvatars(names, { center = false, max = 3 } = {}) {
    const list = Array.isArray(names) ? names.filter(Boolean) : [];
    if (!list.length) return "";

    const shown = list.slice(0, max);
    const rest = Math.max(0, list.length - shown.length);

    const avatars = shown
      .map((n, i) => {
        const cls = AVATAR_CLASSES[i % AVATAR_CLASSES.length];
        return `<span class="tv2-avatar ${cls}">${escapeHtml(initialsFromName(n) || "?")}</span>`;
      })
      .join("");

    const more = rest ? `<span class="tv2-avatar-more">+${rest}</span>` : "";

    return `<div class="tv2-avatars${center ? " tv2-avatars--center" : ""}" aria-hidden="true">${avatars}${more}</div>`;
  }

  function showListLoading(gridEl, msg) {
    if (!gridEl) return;
    gridEl.innerHTML = `
      <div class="modern-loading" role="status" aria-live="polite">
        <div class="modern-loading__spinner" aria-hidden="true"></div>
        <div class="modern-loading__text">
          ${escapeHtml(msg || "Loading")}
          <span class="modern-loading__dots" aria-hidden="true"><span></span><span></span><span></span></span>
        </div>
      </div>
    `;
  }

  function showListError(gridEl, msg) {
    if (!gridEl) return;
    gridEl.innerHTML = `<div class="tv2-empty">${escapeHtml(msg || "Failed to load tasks")}</div>`;
  }

  function showListEmpty(gridEl, msg) {
    if (!gridEl) return;
    gridEl.innerHTML = `<div class="tv2-empty">${escapeHtml(msg || "No tasks")}</div>`;
  }

  document.addEventListener("DOMContentLoaded", () => {
    try {
      const themeMeta = document.querySelector('meta[name="theme-color"]');
      if (themeMeta) themeMeta.setAttribute("content", "#000000");
      const appleStatusMeta = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
      if (appleStatusMeta) appleStatusMeta.setAttribute("content", "black-translucent");
    } catch {}

    const daysEl = $("tasksV2Days");
    const monthLabelEl = $("tasksV2MonthLabel");
    const monthBtn = $("tasksV2MonthBtn");
    const gridEl = $("tasksGrid");

    // NOTE:
    // The Tasks "view" dropdown (My tasks / Delegated tasks) is rendered inside the list actions bar
    // (next to New task + Sort). Since the list is re-rendered, the DOM nodes are dynamic.
    // We keep references in mutable variables and wire them after every list render.
    let filterBtnEl = null;
    let filterMenuEl = null;
    let filterDocCloseBound = false;
    let globalKeydownBound = false;

    // Month / year picker
    const monthPickerEl = $("tasksV2MonthPicker");
    const yearPrevBtn = $("tasksV2YearPrev");
    const yearNextBtn = $("tasksV2YearNext");
    const yearLabelBtn = $("tasksV2YearLabel");
    const monthsGridEl = $("tasksV2MonthsGrid");

    const profileImg = $("tasksV2ProfileImg");

    const detailTitleEl = $("taskDetailTitle");
    const detailSubEl = $("taskDetailSub");
    const detailTimeEl = $("taskDetailTimePill");
    const detailAvatarsEl = $("taskDetailAvatars");
    const detailBodyEl = $("taskDetailBody");
    const detailCloseBtn = $("taskDetailCloseBtn");
    const detailOpenNotionBtn = $("taskDetailOpenNotionBtn");

    const LS_FILTER = "tasksV2.filter";
    const LS_DAY = "tasksV2.day";
    const LS_SORT = "tasksV2.sort";
    const LS_STATUS = "tasksV2.statusTab";

    let deptUsers = [];
    let meId = "";
    let usersById = new Map();

    let state = {
      // mode: 'all' | 'mine' | 'user'
      // Default view: My tasks
      mode: "mine",
      assigneeId: "",
      selectedDay: "",
      weekStart: null,
      weekAnimDir: "",
      tasks: [],
      selectedTaskId: "",
      selectedTaskUrl: "",
      // sort: 'priority' | 'delivery' | 'created'
      sortKey: "delivery",
      // Status tabs
      statusTab: "all",
    };


const STATUS_TABS = [
  { key: "all", label: "All", notion: "" },
  { key: "not-started", label: "Not started", notion: "Not started" },
  { key: "in-progress", label: "In progress", notion: "In progress" },
  { key: "paused", label: "Paused", notion: "Paused" },
  { key: "done", label: "Done", notion: "Done" },
  { key: "canceled", label: "Canceled", notion: "Canceled" },
];

const SORT_META = {
  priority: { label: "By Priority Level", icon: "flag" },
  delivery: { label: "By Delivery Date", icon: "calendar" },
  created: { label: "By Created time", icon: "clock" },
};

    let monthPickerYear = new Date().getFullYear();

    // List action elements (rendered inside the list, so references are refreshed after each render)
    let newTaskBtnEl = null;
    let sortBtnEl = null;
    let sortMenuEl = null;
    let sortDocCloseBound = false;

    // Detail screen is a separate "page".
    // We toggle it by adding/removing a class on <body>.
    function openDetailView() {
      document.body.classList.add("tv2-detail-open");
    }

    function closeDetailView() {
      document.body.classList.remove("tv2-detail-open");
    }

    function isMonthPickerOpen() {
      return !!(monthPickerEl && monthPickerEl.hidden === false);
    }

    function closeMonthPicker() {
      if (!monthPickerEl) return;
      monthPickerEl.hidden = true;
      monthPickerEl.setAttribute("aria-hidden", "true");
    }

    function monthShortLabel(monthIndex) {
      try {
        return new Date(2000, monthIndex, 1).toLocaleString("en-US", { month: "short" });
      } catch {
        const fallback = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return fallback[monthIndex] || "";
      }
    }

    function renderMonthPicker() {
      if (!monthPickerEl || !yearLabelBtn || !monthsGridEl) return;

      const cur = parseIsoDayToLocalDate(state.selectedDay) || new Date();
      const activeYear = cur.getFullYear();
      const activeMonth = cur.getMonth();

      yearLabelBtn.textContent = String(monthPickerYear);

      const btns = [];
      for (let m = 0; m < 12; m++) {
        const active = monthPickerYear === activeYear && m === activeMonth;
        btns.push(
          `<button class="tv2-month-btn${active ? " is-active" : ""}" type="button" data-month="${m}">${escapeHtml(
            monthShortLabel(m)
          )}</button>`
        );
      }

      monthsGridEl.innerHTML = btns.join("");

      monthsGridEl.querySelectorAll("[data-month]").forEach((b) => {
        b.addEventListener("click", () => {
          const m = Number(b.getAttribute("data-month"));
          if (!Number.isFinite(m)) return;
          jumpToMonth(monthPickerYear, m);
          closeMonthPicker();
        });
      });
    }

    function openMonthPicker() {
      if (!monthPickerEl) return;
      closeMenu();
      closeSortMenu();

      const cur = parseIsoDayToLocalDate(state.selectedDay) || new Date();
      monthPickerYear = cur.getFullYear();

      renderMonthPicker();
      monthPickerEl.hidden = false;
      monthPickerEl.setAttribute("aria-hidden", "false");
      if (window.feather) window.feather.replace();
    }

    function jumpToMonth(year, monthIndex) {
      // Prefer the first Delivery Date that exists in the chosen month.
      // Otherwise, fallback to the 1st of the month.
      const candidates = [];
      for (const t of state.tasks || []) {
        const iso = isoDayFromAny(t?.dueDate);
        if (!iso) continue;
        const d = parseIsoDayToLocalDate(iso);
        if (!d) continue;
        if (d.getFullYear() === year && d.getMonth() === monthIndex) {
          candidates.push(iso);
        }
      }

      candidates.sort();

      const targetIso = candidates[0] || isoDayFromAny(new Date(year, monthIndex, 1));
      setSelectedDay(targetIso);
    }

    // Calendar swipe handlers should only be bound once (renderCalendar re-renders buttons).
    let calendarSwipeBound = false;
    let calendarTouchStartX = null;

    // Small arrow (orange) that appears when there are tasks outside the current week.
    // Clicking it jumps to the nearest day that has a task outside the displayed week.
    let tv2WeekJumpBtn = null;
    const TV2_ENABLE_WEEK_JUMP = false;
    function tv2EnsureWeekJumpBtn() {
      if (!TV2_ENABLE_WEEK_JUMP) {
        if (tv2WeekJumpBtn) {
          tv2WeekJumpBtn.hidden = true;
          tv2WeekJumpBtn.style.display = "none";
        }
        return;
      }
      if (tv2WeekJumpBtn) return;
      if (!daysEl) return;
      const cal = daysEl.parentElement; // .tasks-v2-calendar
      if (!cal) return;

      tv2WeekJumpBtn = document.createElement("button");
      tv2WeekJumpBtn.type = "button";
      tv2WeekJumpBtn.className = "tv2-week-jump";
      tv2WeekJumpBtn.id = "tasksV2WeekJumpBtn";
      tv2WeekJumpBtn.setAttribute("aria-label", "Jump to tasks outside this week");
      tv2WeekJumpBtn.hidden = true;
      tv2WeekJumpBtn.style.display = "none";
      tv2WeekJumpBtn.innerHTML = `<i data-feather="chevron-right"></i>`;

      cal.appendChild(tv2WeekJumpBtn);

      tv2WeekJumpBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const target = tv2WeekJumpBtn?.getAttribute("data-target-day") || "";
        const dir = tv2WeekJumpBtn?.getAttribute("data-week-dir") || "";
        if (!target) return;
        setSelectedDay(target, { weekDir: dir === "prev" ? "prev" : "next" });
      });
    }

    function currentFilterLabel() {
      if (state.mode === "mine") return "My tasks";
      if (state.mode === "delegated") return "Delegated tasks";
      return "My tasks";
    }

// ---- Status tabs (filter by task Status) ----
function tv2NormalizeKey(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function tv2ResolveStatusNotionName(key) {
  const k = String(key || "").trim();
  const found = STATUS_TABS.find((t) => t.key === k);
  return found ? String(found.notion || "") : "";
}

function restoreStatusFromStorage() {
  let v = "all";
  try {
    v = String(localStorage.getItem(LS_STATUS) || "all");
  } catch {}

  if (!STATUS_TABS.some((t) => t.key === v)) v = "all";
  state.statusTab = v;
}

function setStatusTab(key) {
  const k = String(key || "").trim();
  if (!STATUS_TABS.some((t) => t.key === k)) return;

  state.statusTab = k;
  try {
    localStorage.setItem(LS_STATUS, k);
  } catch {}

  // UX: when switching status, return to list view and close menus
  closeMenu();
  closeSortMenu();
  closeDetailView();
  if (tv2DelegatedOverlay && tv2DelegatedOverlay.hidden === false) tv2CloseDelegatedModal();

  renderCalendar();
  renderTasksList();
}

function filterTasksByStatus(list) {
  const arr = Array.isArray(list) ? list : [];
  const key = String(state.statusTab || "all");
  if (!key || key === "all") return arr;

  const want = tv2ResolveStatusNotionName(key);
  if (!want) return arr;
  const wantNorm = tv2NormalizeKey(want);

  return arr.filter((t) => tv2NormalizeKey(t?.status?.name) === wantNorm);
}


    // ---- Sort dropdown (inside list) ----
    function isSortMenuOpen() {
      return !!(sortMenuEl && sortMenuEl.hidden === false);
    }

    function closeSortMenu() {
      if (!sortMenuEl || !sortBtnEl) return;
      sortMenuEl.hidden = true;
      sortBtnEl.setAttribute("aria-expanded", "false");
    }

    function openSortMenu() {
      if (!sortMenuEl || !sortBtnEl) return;
      // avoid having both menus open at once
      closeMenu();
      closeMonthPicker();

      sortMenuEl.hidden = false;
      sortBtnEl.setAttribute("aria-expanded", "true");
    }

    function toggleSortMenu() {
      if (!sortMenuEl) return;
      if (sortMenuEl.hidden) openSortMenu();
      else closeSortMenu();
    }

    function bindSortDocCloseOnce() {
      if (sortDocCloseBound) return;
      sortDocCloseBound = true;

      document.addEventListener("click", (e) => {
        if (!isSortMenuOpen()) return;
        const t = e.target;
        if (t && (sortMenuEl?.contains(t) || sortBtnEl?.contains(t))) return;
        closeSortMenu();
      });
    }

    function bindFilterDocCloseOnce() {
      if (filterDocCloseBound) return;
      filterDocCloseBound = true;

      document.addEventListener("click", (e) => {
        if (!isMenuOpen()) return;
        const t = e.target;
        if (t && (filterMenuEl?.contains(t) || filterBtnEl?.contains(t))) return;
        closeMenu();
      });
    }

    function bindGlobalKeydownOnce() {
      if (globalKeydownBound) return;
      globalKeydownBound = true;

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          // Close the top-most overlay first
          if (tv2DelegatedOverlay && tv2DelegatedOverlay.hidden === false) tv2CloseDelegatedModal();
          else if (tv2PointsOverlay && tv2PointsOverlay.hidden === false) tv2ClosePointsModal();
          else if (tv2CheckpointComposerOverlay && tv2CheckpointComposerOverlay.hidden === false) tv2CloseCheckpointComposerModal();
          else if (tv2NewTaskOverlay && tv2NewTaskOverlay.hidden === false) tv2CloseNewTaskModal();
          else if (isMonthPickerOpen()) closeMonthPicker();
          else if (document.body.classList.contains("tv2-detail-open")) closeDetailView();
          else if (sortMenuEl && !sortMenuEl.hidden) closeSortMenu();
          else if (isMenuOpen()) closeMenu();
          return;
        }

        // Keyboard day navigation
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          // avoid interfering with typing, if any input exists
          const ae = document.activeElement;
          if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA" || ae.tagName === "SELECT")) return;

          const cur = parseIsoDayToLocalDate(state.selectedDay) || new Date();
          const next = e.key === "ArrowLeft" ? addDays(cur, -1) : addDays(cur, 1);
          setSelectedDay(next);
        }
      });
    }

    function isMenuOpen() {
      return !!(filterMenuEl && filterMenuEl.hidden === false);
    }

    function closeMenu() {
      if (!filterMenuEl || !filterBtnEl) return;
      filterMenuEl.hidden = true;
      filterBtnEl.setAttribute("aria-expanded", "false");
    }

    function openMenu() {
      if (!filterMenuEl || !filterBtnEl) return;
      closeSortMenu();
      filterMenuEl.hidden = false;
      filterBtnEl.setAttribute("aria-expanded", "true");
    }

    function toggleMenu() {
      if (!filterMenuEl) return;
      if (filterMenuEl.hidden) openMenu();
      else closeMenu();
    }

    function setFilter(mode) {
      const m = String(mode || "").trim();
      state.mode = m === "delegated" ? "delegated" : "mine";
      state.assigneeId = "";

      // Persist
      try {
        localStorage.setItem(LS_FILTER, state.mode);
      } catch {}

      renderFilterMenu();
      closeMenu();
      closeSortMenu();
      if (tv2DelegatedOverlay && tv2DelegatedOverlay.hidden === false) tv2CloseDelegatedModal();
      if (tv2PointsOverlay && tv2PointsOverlay.hidden === false) tv2ClosePointsModal();
      loadTasks();
    }

    function restoreSortFromStorage() {
      let v = "delivery";
      try {
        v = String(localStorage.getItem(LS_SORT) || "delivery");
      } catch {}

      if (v === "priority" || v === "delivery" || v === "created") {
        state.sortKey = v;
      } else {
        state.sortKey = "delivery";
      }
    }

    function setSort(key) {
      const v = String(key || "").trim();
      if (v !== "priority" && v !== "delivery" && v !== "created") return;
      state.sortKey = v;
      try {
        localStorage.setItem(LS_SORT, v);
      } catch {}
      closeSortMenu();
      renderTasksList();
    }

    function priorityRank(name) {
      const s = String(name || "").toLowerCase();
      if (!s) return 0;
      if (s.includes("urgent") || s.includes("critical")) return 4;
      if (s.includes("high")) return 3;
      if (s.includes("medium")) return 2;
      if (s.includes("low")) return 1;
      return 0;
    }

    function sortTasks(tasks) {
      const arr = Array.isArray(tasks) ? tasks.slice() : [];

      const byDueAsc = (a, b) => {
        const ad = isoDayFromAny(a?.dueDate);
        const bd = isoDayFromAny(b?.dueDate);
        if (!ad && !bd) return 0;
        if (!ad) return 1;
        if (!bd) return -1;
        if (ad < bd) return -1;
        if (ad > bd) return 1;
        return 0;
      };

      const byCreatedDesc = (a, b) => {
        const at = String(a?.createdTime || "");
        const bt = String(b?.createdTime || "");
        if (!at && !bt) return 0;
        if (!at) return 1;
        if (!bt) return -1;
        if (at < bt) return 1;
        if (at > bt) return -1;
        return 0;
      };

      if (state.sortKey === "priority") {
        arr.sort((a, b) => {
          const pa = priorityRank(a?.priority?.name);
          const pb = priorityRank(b?.priority?.name);
          if (pa !== pb) return pb - pa;
          const d = byDueAsc(a, b);
          if (d !== 0) return d;
          return byCreatedDesc(a, b);
        });
        return arr;
      }

      if (state.sortKey === "created") {
        arr.sort((a, b) => {
          const c = byCreatedDesc(a, b);
          if (c !== 0) return c;
          return byDueAsc(a, b);
        });
        return arr;
      }

      // default: delivery date
      arr.sort((a, b) => {
        const d = byDueAsc(a, b);
        if (d !== 0) return d;
        return byCreatedDesc(a, b);
      });
      return arr;
    }

    function formatDueLabel(isoDay) {
      const d = isoDay ? parseIsoDayToLocalDate(isoDay) : null;
      if (!d) return "No due date";
      try {
        const md = d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
        return `Due ${md}`;
      } catch {
        return "Due";
      }
    }

    function renderFilterMenu() {
      if (!filterMenuEl) return;

      const items = [
        { key: "mine", label: "My tasks", icon: "user" },
        { key: "delegated", label: "Delegated tasks", icon: "users" },
      ];

      const activeKey = state.mode === "delegated" ? "delegated" : "mine";

      filterMenuEl.innerHTML = items
        .map((it) => {
          const active = it.key === activeKey ? "is-active" : "";
          return `
            <button class="tasks-v2-dropdown-item ${active}" type="button" role="menuitem" data-filter="${escapeHtml(it.key)}">
              <span class="tasks-v2-dropdown-item__main">
                <i data-feather="${escapeHtml(it.icon || "user")}"></i>
                <span>${escapeHtml(it.label)}</span>
              </span>
            </button>
          `;
        })
        .join("");

      // Bind clicks
      filterMenuEl.querySelectorAll("[data-filter]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const key = String(btn.getAttribute("data-filter") || "");
          if (key === "delegated") return setFilter("delegated");
          return setFilter("mine");
        });
      });

      if (window.feather) window.feather.replace();
    }

    async function loadAccountPhoto() {
      if (!profileImg) return;
      try {
        const r = await fetch("/api/account", { cache: "no-store" });
        if (!r.ok) return;
        const a = await r.json();
        if (a?.photoUrl) {
          profileImg.src = a.photoUrl;
          profileImg.alt = "Profile photo";
        }
      } catch {}
    }

    async function loadUsers() {
      try {
        const r = await fetch("/api/tasks/users", { cache: "no-store" });
        if (!r.ok) throw new Error("Failed to load users");
        const data = await r.json();
        meId = String(data?.meId || "");
        deptUsers = Array.isArray(data?.users) ? data.users : [];
        usersById = new Map(deptUsers.map((u) => [u.id, u.name]));
      } catch (e) {
        console.warn("Tasks users load failed:", e);
        meId = "";
        deptUsers = [];
        usersById = new Map();
      }
    }

    function restoreFilterFromStorage() {
      // Default view: My tasks
      let v = "mine";
      try {
        v = String(localStorage.getItem(LS_FILTER) || "mine");
      } catch {}

      if (String(v || "").trim() === "delegated") {
        state.mode = "delegated";
      } else {
        state.mode = "mine";
      }

      state.assigneeId = "";
    }

    function restoreSortFromStorage() {
      let v = "delivery";
      try {
        v = String(localStorage.getItem(LS_SORT) || "delivery");
      } catch {}

      if (v === "priority" || v === "delivery" || v === "created") {
        state.sortKey = v;
        return;
      }

      state.sortKey = "delivery";
    }

    function setSort(key) {
      const k = String(key || "").trim();
      if (!k) return;
      if (k !== "priority" && k !== "delivery" && k !== "created") return;

      state.sortKey = k;
      try {
        localStorage.setItem(LS_SORT, k);
      } catch {}

      closeSortMenu();
      renderTasksList();
    }

    function priorityRank(name) {
      const s = String(name || "").toLowerCase();
      if (!s) return 0;
      if (s.includes("critical")) return 4;
      if (s.includes("urgent")) return 4;
      if (s.includes("high")) return 3;
      if (s.includes("medium")) return 2;
      if (s.includes("low")) return 1;
      return 0;
    }

    function sortTasks(list) {
      const arr = Array.isArray(list) ? list.slice() : [];

      const dueKey = (t) => isoDayFromAny(t?.dueDate) || "";
      const createdKey = (t) => String(t?.createdTime || "");

      const cmpDueAsc = (a, b) => {
        const da = dueKey(a);
        const db = dueKey(b);
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return da.localeCompare(db);
      };

      const cmpCreatedDesc = (a, b) => {
        const ca = createdKey(a);
        const cb = createdKey(b);
        if (!ca && !cb) return 0;
        if (!ca) return 1;
        if (!cb) return -1;
        // ISO datetime strings compare lexicographically
        return cb.localeCompare(ca);
      };

      if (state.sortKey === "created") {
        arr.sort((a, b) => cmpCreatedDesc(a, b) || cmpDueAsc(a, b));
        return arr;
      }

      if (state.sortKey === "priority") {
        arr.sort((a, b) => {
          const pa = priorityRank(a?.priority?.name);
          const pb = priorityRank(b?.priority?.name);
          if (pa !== pb) return pb - pa;
          return cmpDueAsc(a, b) || cmpCreatedDesc(a, b);
        });
        return arr;
      }

      // Default: Delivery Date
      arr.sort((a, b) => cmpDueAsc(a, b) || cmpCreatedDesc(a, b));
      return arr;
    }

    function pickInitialDayFromTasks(tasks) {
      // UX request:
      // Always open the calendar on TODAY by default.
      return getTodayIso();
    }

    function setSelectedDay(dayIso, opts) {
      const iso = isoDayFromAny(dayIso);
      if (!iso) return;

      const prevWeek = state.weekStart;
      state.selectedDay = iso;

      try {
        localStorage.setItem(LS_DAY, iso);
      } catch {}

      const d = parseIsoDayToLocalDate(iso) || new Date();
      const nextWeek = startOfWeekSunday(d);

      // Week change animation direction (used by the week swipe / navigation)
      let dir = "";
      const wanted = opts && typeof opts.weekDir === "string" ? opts.weekDir : "";
      if (wanted === "next" || wanted === "prev") {
        dir = wanted;
      } else if (prevWeek && nextWeek && prevWeek.getTime() !== nextWeek.getTime()) {
        dir = nextWeek.getTime() > prevWeek.getTime() ? "next" : "prev";
      }

      state.weekAnimDir = dir;
      state.weekStart = nextWeek;

      renderCalendar();

      // By request: show all tasks (do NOT filter by selected day).
      // Selecting a day only helps navigation.
      if (!(opts && opts.noScroll)) {
        scrollToDayInList(iso);
      }
    }

    function scrollToDayInList(dayIso) {
      if (!gridEl) return;
      const iso = isoDayFromAny(dayIso);
      if (!iso) return;

      let first = null;
      try {
        gridEl.querySelectorAll("[data-due-day]").forEach((el) => {
          if (first) return;
          const v = el.getAttribute("data-due-day");
          if (v === iso) first = el;
        });
      } catch {
        // fallback: no-op
      }
      if (!first) return;

      try {
        first.scrollIntoView({ behavior: "smooth", block: "start" });
      } catch {
        // fallback
        try {
          first.scrollIntoView(true);
        } catch {}
      }

      first.classList.add("tv2-card--jump");
      setTimeout(() => first.classList.remove("tv2-card--jump"), 1000);
    }

    function renderCalendar() {
      if (!daysEl) return;

      const selectedDate = parseIsoDayToLocalDate(state.selectedDay) || new Date();
      const weekStart = state.weekStart || startOfWeekSunday(selectedDate);

      if (monthLabelEl) {
        monthLabelEl.textContent = formatMonthName(selectedDate) || "";
      }

      const tasksForCalendar = filterTasksByStatus(state.tasks || []);

      const dueSet = new Set(
        tasksForCalendar.map((t) => isoDayFromAny(t?.dueDate)).filter(Boolean)
      );
      // Optional week jump button is disabled in the current mobile layout.
      if (TV2_ENABLE_WEEK_JUMP) {
        tv2EnsureWeekJumpBtn();
        if (tv2WeekJumpBtn) {
          const dueDaysSorted = Array.from(dueSet).sort();
          const weekStartIso = isoDayFromAny(weekStart);
          const weekEndIso = isoDayFromAny(addDays(weekStart, 6));

          let nextOutside = "";
          let prevOutside = "";
          for (const d of dueDaysSorted) {
            if (d < weekStartIso) prevOutside = d;
            if (!nextOutside && d > weekEndIso) nextOutside = d;
          }

          const target = nextOutside || prevOutside;
          const dir = nextOutside ? "next" : prevOutside ? "prev" : "";

          if (target && dir) {
            tv2WeekJumpBtn.hidden = false;
            tv2WeekJumpBtn.style.display = "inline-flex";
            tv2WeekJumpBtn.setAttribute("data-target-day", target);
            tv2WeekJumpBtn.setAttribute("data-week-dir", dir);
            tv2WeekJumpBtn.setAttribute("aria-label", dir === "prev" ? "Jump to previous tasks" : "Jump to next tasks");
            tv2WeekJumpBtn.innerHTML = dir === "prev" ? `<i data-feather="chevron-left"></i>` : `<i data-feather="chevron-right"></i>`;
          } else {
            tv2WeekJumpBtn.hidden = true;
            tv2WeekJumpBtn.style.display = "none";
            tv2WeekJumpBtn.removeAttribute("data-target-day");
            tv2WeekJumpBtn.removeAttribute("data-week-dir");
          }
        }
      } else if (tv2WeekJumpBtn) {
        tv2WeekJumpBtn.hidden = true;
        tv2WeekJumpBtn.style.display = "none";
        tv2WeekJumpBtn.removeAttribute("data-target-day");
        tv2WeekJumpBtn.removeAttribute("data-week-dir");
      }

      const btns = [];
      for (let i = 0; i < 7; i++) {
        const d = addDays(weekStart, i);
        const iso = isoDayFromAny(d);
        const num = d.getDate();
        let dow = "";
        try {
          dow = d.toLocaleDateString("en-US", { weekday: "short" });
        } catch {
          dow = "";
        }
        const active = iso === state.selectedDay;
        const hasTask = dueSet.has(iso);
        btns.push(
          `<button class="tasks-v2-day${hasTask ? " has-task" : ""}${active ? " is-active" : ""}" type="button" role="tab" aria-selected="${active ? "true" : "false"}" aria-label="${escapeHtml(
            `${dow} ${num}`
          )}" data-day="${iso}">
            <span class="tasks-v2-day__dow">${escapeHtml(dow)}</span>
            <span class="tasks-v2-day__num">${num}</span>
          </button>`
        );
      }

      daysEl.innerHTML = btns.join("");

      daysEl.querySelectorAll("[data-day]").forEach((b) => {
        b.addEventListener("click", () => {
          const day = b.getAttribute("data-day");
          if (!day) return;
          setSelectedDay(day);
        });
      });

      // Swipe to move a week (keeps UI close to the mock: no visible arrows)
      if (!calendarSwipeBound) {
        calendarSwipeBound = true;
        daysEl.addEventListener(
          "touchstart",
          (e) => {
            const t = e.touches && e.touches[0];
            if (!t) return;
            calendarTouchStartX = t.clientX;
          },
          { passive: true }
        );
        daysEl.addEventListener(
          "touchend",
          (e) => {
            if (calendarTouchStartX === null) return;
            const t = e.changedTouches && e.changedTouches[0];
            if (!t) {
              calendarTouchStartX = null;
              return;
            }
            const dx = t.clientX - calendarTouchStartX;
            calendarTouchStartX = null;
            if (Math.abs(dx) < 60) return;
            const cur = parseIsoDayToLocalDate(state.selectedDay) || new Date();
            const next = dx > 0 ? addDays(cur, -7) : addDays(cur, 7);
            const dir = dx > 0 ? "prev" : "next";
            setSelectedDay(next, { weekDir: dir });
          },
          { passive: true }
        );
      }

      // Week enter animation (applied after re-render)
      if (state.weekAnimDir === "next" || state.weekAnimDir === "prev") {
        const cls = state.weekAnimDir === "next" ? "tv2-week-anim--next" : "tv2-week-anim--prev";
        state.weekAnimDir = "";

        daysEl.classList.remove("tv2-week-anim--next", "tv2-week-anim--prev");
        // Force reflow so the same animation can retrigger
        void daysEl.offsetWidth;
        daysEl.classList.add(cls);

        const cleanup = () => {
          daysEl.classList.remove("tv2-week-anim--next", "tv2-week-anim--prev");
        };

        daysEl.addEventListener("animationend", cleanup, { once: true });
        // Fallback (e.g. reduced motion)
        setTimeout(cleanup, 260);
      }

      if (window.feather) window.feather.replace();
    }

    function renderTasksList() {
      if (!gridEl) return;

      const allTasks = Array.isArray(state.tasks) ? state.tasks : [];
      const filteredTasks = filterTasksByStatus(allTasks);
      const visible = sortTasks(filteredTasks);

      // Keep selection only if it still exists in the current visible list
      if (state.selectedTaskId && !visible.some((t) => t.id === state.selectedTaskId)) {
        state.selectedTaskId = "";
        state.selectedTaskUrl = "";
        renderTaskDetailsEmpty();
      }

      // If no tasks for the selected day, clear details and ensure we are on the list screen
      if (!visible.length) {
        renderTaskDetailsEmpty();
        closeDetailView();
      }

      const sortItems = [
        { key: "priority", label: "By Priority Level", icon: "flag" },
        { key: "delivery", label: "By Delivery Date", icon: "calendar" },
        { key: "created", label: "By Created time", icon: "clock" },
      ];
      const currentSortMeta = SORT_META[state.sortKey] || SORT_META.delivery;

      const sortMenuHTML = sortItems
        .map((it) => {
          const active = it.key === state.sortKey ? "is-active" : "";
          return `
            <button class="tasks-v2-dropdown-item ${active}" type="button" role="menuitem" data-sort="${escapeHtml(it.key)}">
              <span class="tasks-v2-dropdown-item__main">
                <i data-feather="${escapeHtml(it.icon)}"></i>
                <span>${escapeHtml(it.label)}</span>
              </span>
            </button>
          `;
        })
        .join("");

      const actionsHTML = `
        <div class="tv2-actionsbar" aria-label="List actions">
          <div class="tv2-actionsbar__group tv2-actionsbar__group--start">
            <div class="tv2-view-wrap">
              <button
                class="tv2-view-btn"
                type="button"
                id="tasksV2FilterBtn"
                aria-label="View"
                aria-haspopup="menu"
                aria-expanded="false"
              >
                <i data-feather="sliders"></i>
                <span class="tv2-view-label">View</span>
              </button>
              <div class="tasks-v2-dropdown" id="tasksV2FilterMenu" role="menu" aria-label="Tasks view" hidden></div>
            </div>

            <div class="tv2-sort-wrap">
              <button
                class="tv2-sort-btn"
                type="button"
                id="tasksV2SortBtn"
                aria-label="Sort"
                aria-haspopup="menu"
                aria-expanded="false"
              >
                <i data-feather="${escapeHtml(currentSortMeta.icon)}"></i>
                <span class="tv2-sort-label">Sort</span>
              </button>
              <div class="tasks-v2-dropdown" id="tasksV2SortMenu" role="menu" aria-label="Sort tasks" hidden>
                ${sortMenuHTML}
              </div>
            </div>
          </div>

          <div class="tv2-actionsbar__group tv2-actionsbar__group--end">
            <button class="tv2-newtask-btn" type="button" id="tasksV2NewTaskBtn" aria-label="New project">
              <i data-feather="plus"></i>
              <span>New project</span>
            </button>
          </div>
        </div>
      `;

const statusTabsHTML = `
  <div class="tv2-status-tabs" role="tablist" aria-label="Task status">
    ${STATUS_TABS.map((tab) => {
      const active = tab.key === state.statusTab;
      return `
        <button
          class="tv2-status-tab${active ? " is-active" : ""}"
          type="button"
          role="tab"
          aria-selected="${active ? "true" : "false"}"
          data-status-tab="${escapeHtml(tab.key)}"
        >
          ${escapeHtml(tab.label)}
        </button>
      `;
    }).join("")}
  </div>
`;

const toolbarHTML = `
  <div class="tv2-toolbar" aria-label="Tasks toolbar">
    ${statusTabsHTML}
    ${actionsHTML}
  </div>
`;


      if (!visible.length) {
        gridEl.innerHTML = toolbarHTML + `<div class="tv2-empty">No tasks</div>`;
        wireListActions();
        if (window.feather) window.feather.replace();
        return;
      }

      const cards = visible
        .map((t) => {
          const top = t?.idText ? `ID: ${t.idText}` : "";
          const creatorName = String(t?.createdBy || "").trim();

          const completionNum = Number(t?.completion);
          const pct = Number.isFinite(completionNum) ? Math.min(100, Math.max(0, Math.round(completionNum))) : 0;
          const dueIso = isoDayFromAny(t?.dueDate);
          const dueLabel = formatDueLabel(dueIso);

          const creatorPill = creatorName
            ? `
                <div class="tv2-created-pill" aria-label="Created by ${escapeHtml(creatorName)}">
                  <i data-feather="user"></i>
                  <span>${escapeHtml(creatorName)}</span>
                </div>
              `
            : `<span class="tv2-created-pill tv2-created-pill--empty" aria-hidden="true"></span>`;

          const prioName = String(t?.priority?.name || "");
          const prioNorm = prioName.trim().toLowerCase();
          let prioClass = "";
          if (prioNorm.includes("high")) prioClass = " tv2-card--prio-high";
          else if (prioNorm.includes("medium")) prioClass = " tv2-card--prio-medium";
          else if (prioNorm.includes("low")) prioClass = " tv2-card--prio-low";

          const selected = t.id === state.selectedTaskId ? " is-selected" : "";

          return `
            <article class="tv2-card${prioClass}${selected}" data-task-id="${escapeHtml(t.id)}" data-due-day="${escapeHtml(
              dueIso
            )}" aria-label="${escapeHtml(t.title || "Task")}">
              <div class="tv2-card__top">
                ${top ? `<div class="tv2-time">${escapeHtml(top)}</div>` : `<span class="tv2-time tv2-time--empty" aria-hidden="true"></span>`}
                ${creatorPill}
              </div>

              <div class="tv2-card__title">${escapeHtml(t.title || "Untitled")}</div>

              <div class="tv2-progress-row" aria-label="Progress">
                <div class="tv2-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
                  <div class="tv2-progress__fill" style="width:${pct}%"></div>
                  <div class="tv2-progress__pct">${pct}%</div>
                </div>
                <div class="tv2-progress__due">${escapeHtml(dueLabel)}</div>
              </div>
            </article>
          `;
        })
        .join("");

      gridEl.innerHTML = toolbarHTML + cards;

      wireListActions();

      // Bind card clicks
      gridEl.querySelectorAll("[data-task-id]").forEach((card) => {
        const id = card.getAttribute("data-task-id");
        if (!id) return;

        card.addEventListener("click", () => {
          // UX request:
          // - My tasks: open the Task Points window (check + upload per point)
          // - Delegated tasks: open a centered small window with checkpoint cards
          if (state.mode === "mine") {
            openTaskPointsForTask(id);
          } else {
            openDelegatedProjectModal(id);
          }
        });
      });

      if (window.feather) window.feather.replace();
    }

    // List actions (New task + Sort) are re-rendered with the list, so we wire them after every render.
        // --- New Task Modal (small window) ---
    let tv2NewTaskOverlay = null;
    let tv2NewTaskForm = null;
    let tv2NewTaskSubject = null;
    let tv2NewTaskAssignee = null;
    let tv2NewTaskDueDate = null;
    let tv2NewTaskFiles = null;
    let tv2NewTaskPriority = null;
    let tv2NewTaskFilesMeta = null;
    let tv2NewTaskAssigneePicker = null;
    let tv2NewTaskAssigneeTrigger = null;
    let tv2NewTaskAssigneeTriggerLabel = null;
    let tv2NewTaskAssigneeDropdown = null;
    let tv2NewTaskAssigneeOptions = null;
    let tv2NewTaskPriorityPicker = null;
    let tv2NewTaskPriorityTrigger = null;
    let tv2NewTaskPriorityTriggerLabel = null;
    let tv2NewTaskPriorityDropdown = null;
    let tv2NewTaskPriorityOptions = null;
    let tv2NewTaskSelectDocBound = false;
    let tv2ChecklistList = null;
    let tv2AddCheckpointBtn = null;
    let tv2NewTaskCancelBtn = null;
    let tv2NewTaskSubmitBtn = null;
    let tv2NewTaskCloseBtn = null;
    let tv2NewTaskEscWired = false;
    let tv2CheckpointDrafts = [];
    let tv2CheckpointComposerOverlay = null;
    let tv2CheckpointComposerForm = null;
    let tv2CheckpointComposerTitle = null;
    let tv2CheckpointComposerAssignee = null;
    let tv2CheckpointComposerDueDate = null;
    let tv2CheckpointComposerPriority = null;
    let tv2CheckpointComposerFiles = null;
    let tv2CheckpointComposerFilesMeta = null;
    let tv2CheckpointComposerSaveBtn = null;
    let tv2CheckpointComposerCancelBtn = null;
    let tv2CheckpointComposerCloseBtn = null;
    let tv2CheckpointComposerEditingId = "";
    let tv2CheckpointComposerFilesBuffer = [];

    // --- Task Points Modal (small window for assignee tasks) ---
    let tv2PointsOverlay = null;
    let tv2PointsTitleEl = null;
    let tv2PointsCountEl = null;
    let tv2PointsBarEl = null;
    let tv2PointsBarFillEl = null;
    let tv2PointsPctEl = null;
    let tv2PointsListEl = null;
    let tv2PointsCloseBtn = null;
    let tv2PointsTask = null; // current task details
    let tv2PointsTaskId = "";
    let tv2CheckpointMenuDocBound = false;

    // --- Delegated Project Modal (small window) ---
    let tv2DelegatedOverlay = null;
    let tv2DelegatedTitleEl = null;
    let tv2DelegatedCountEl = null;
    let tv2DelegatedBarEl = null;
    let tv2DelegatedBarFillEl = null;
    let tv2DelegatedPctEl = null;
    let tv2DelegatedSummaryEl = null;
    let tv2DelegatedListEl = null;
    let tv2DelegatedCloseBtn = null;
    let tv2DelegatedTask = null;

    function tv2EnsureNewTaskModal() {
      if (tv2NewTaskOverlay) return;

      tv2NewTaskOverlay = document.createElement("div");
      tv2NewTaskOverlay.className = "tv2-modal-overlay";
      tv2NewTaskOverlay.id = "tv2NewTaskOverlay";
      tv2NewTaskOverlay.hidden = true;
      tv2NewTaskOverlay.style.display = "none";

      tv2NewTaskOverlay.innerHTML = `
        <div class="tv2-modal tv2-modal--project" role="dialog" aria-modal="true" aria-labelledby="tv2NewTaskTitle">
          <div class="tv2-modal-header">
            <h3 class="tv2-modal-title" id="tv2NewTaskTitle">New project</h3>
            <button class="tv2-modal-icon-btn" type="button" id="tv2NewTaskCloseBtn" aria-label="Close">
              <span class="tv2-x" aria-hidden="true">×</span>
            </button>
          </div>

          <form class="tv2-modal-form" id="tv2NewTaskForm">
            <div class="tv2-modal-body">
              <div class="tv2-form-grid tv2-form-grid--single">
                <div class="tv2-form-row tv2-form-row--full">
                  <label class="tv2-label" for="tv2TaskSubject">Subject</label>
                  <div class="tv2-field tv2-field--text">
                    <span class="tv2-field__icon" aria-hidden="true"><i data-feather="edit-3"></i></span>
                    <input class="tv2-input" type="text" id="tv2TaskSubject" placeholder="Write project subject" required />
                  </div>
                </div>

                <div class="tv2-form-row tv2-form-row--full">
                  <div class="tv2-checklist-panel">
                    <div class="tv2-label-row tv2-label-row--project">
                      <div>
                        <label class="tv2-label">Project checkpoints</label>
                        <div class="tv2-help tv2-help--tight">Add each task point with assignee, due date, files, and priority from the checkpoint window.</div>
                      </div>
                      <button class="tv2-link-btn" type="button" id="tv2AddCheckpointBtn">
                        <i data-feather="plus"></i>
                        <span>Add checkpoint</span>
                      </button>
                    </div>
                    <div class="tv2-checklist tv2-checklist--cards" id="tv2ChecklistList"></div>
                  </div>
                </div>
              </div>
            </div>

            <div class="tv2-modal-footer">
              <button class="tv2-btn tv2-btn--ghost" type="button" id="tv2NewTaskCancelBtn">Cancel</button>
              <button class="tv2-btn tv2-btn--primary" type="submit" id="tv2NewTaskSubmitBtn">Create project</button>
            </div>
          </form>
        </div>
      `;

      document.body.appendChild(tv2NewTaskOverlay);

      tv2NewTaskForm = tv2NewTaskOverlay.querySelector("#tv2NewTaskForm");
      tv2NewTaskSubject = tv2NewTaskOverlay.querySelector("#tv2TaskSubject");
      tv2ChecklistList = tv2NewTaskOverlay.querySelector("#tv2ChecklistList");
      tv2AddCheckpointBtn = tv2NewTaskOverlay.querySelector("#tv2AddCheckpointBtn");
      tv2NewTaskCancelBtn = tv2NewTaskOverlay.querySelector("#tv2NewTaskCancelBtn");
      tv2NewTaskSubmitBtn = tv2NewTaskOverlay.querySelector("#tv2NewTaskSubmitBtn");
      tv2NewTaskCloseBtn = tv2NewTaskOverlay.querySelector("#tv2NewTaskCloseBtn");

      tv2EnsureCheckpointComposerModal();
      tv2BindCheckpointMenuDocCloseOnce();

      tv2NewTaskOverlay.addEventListener("click", (e) => {
        if (e.target === tv2NewTaskOverlay) tv2CloseNewTaskModal();
      });

      if (tv2NewTaskCloseBtn) {
        tv2NewTaskCloseBtn.addEventListener("click", (e) => {
          e.preventDefault();
          tv2CloseNewTaskModal();
        });
      }

      if (tv2NewTaskCancelBtn) {
        tv2NewTaskCancelBtn.addEventListener("click", (e) => {
          e.preventDefault();
          tv2CloseNewTaskModal();
        });
      }

      if (tv2AddCheckpointBtn) {
        tv2AddCheckpointBtn.addEventListener("click", (e) => {
          e.preventDefault();
          tv2OpenCheckpointComposerModal();
        });
      }

      if (tv2NewTaskForm) {
        tv2NewTaskForm.addEventListener("submit", tv2SubmitNewTaskForm);
      }

      if (!tv2NewTaskEscWired) {
        tv2NewTaskEscWired = true;
        document.addEventListener("keydown", (e) => {
          if (e.key !== "Escape") return;
          if (tv2CheckpointComposerOverlay && tv2CheckpointComposerOverlay.hidden === false) {
            tv2CloseCheckpointComposerModal();
            return;
          }
          if (!tv2NewTaskOverlay || tv2NewTaskOverlay.hidden) return;
          tv2CloseNewTaskModal();
        });
      }

      if (window.feather) window.feather.replace();
    }

    function tv2EnsureCheckpointComposerModal() {
      if (tv2CheckpointComposerOverlay) return;

      tv2CheckpointComposerOverlay = document.createElement("div");
      tv2CheckpointComposerOverlay.className = "tv2-modal-overlay tv2-checkpoint-overlay";
      tv2CheckpointComposerOverlay.id = "tv2CheckpointComposerOverlay";
      tv2CheckpointComposerOverlay.hidden = true;
      tv2CheckpointComposerOverlay.style.display = "none";

      tv2CheckpointComposerOverlay.innerHTML = `
        <div class="tv2-mini-modal" role="dialog" aria-modal="true" aria-labelledby="tv2CheckpointComposerTitle">
          <div class="tv2-mini-modal__header">
            <h4 class="tv2-mini-modal__title" id="tv2CheckpointComposerTitle">Checkpoint details</h4>
            <button class="tv2-modal-icon-btn tv2-modal-icon-btn--sm" type="button" id="tv2CheckpointComposerCloseBtn" aria-label="Close checkpoint window">
              <span class="tv2-x" aria-hidden="true">×</span>
            </button>
          </div>

          <form class="tv2-mini-modal__form" id="tv2CheckpointComposerForm">
            <div class="tv2-mini-modal__body">
              <div class="tv2-form-row">
                <label class="tv2-label" for="tv2CheckpointTitle">Checkpoint</label>
                <div class="tv2-field tv2-field--text">
                  <span class="tv2-field__icon" aria-hidden="true"><i data-feather="check-square"></i></span>
                  <input class="tv2-input" type="text" id="tv2CheckpointTitle" placeholder="Write checkpoint name" required />
                </div>
              </div>

              <div class="tv2-form-row">
                <label class="tv2-label" for="tv2CheckpointAssignee">Assignee To</label>
                <div class="tv2-field tv2-field--select">
                  <span class="tv2-field__icon" aria-hidden="true"><i data-feather="user"></i></span>
                  <select class="tv2-select" id="tv2CheckpointAssignee"></select>
                  <span class="tv2-field__chevron" aria-hidden="true"><i data-feather="chevron-down"></i></span>
                </div>
              </div>

              <div class="tv2-form-row">
                <label class="tv2-label" for="tv2CheckpointDueDate">Delivery Date</label>
                <div class="tv2-field tv2-field--date">
                  <span class="tv2-field__icon" aria-hidden="true"><i data-feather="calendar"></i></span>
                  <input class="tv2-input tv2-input--date" type="date" id="tv2CheckpointDueDate" />
                </div>
              </div>

              <div class="tv2-form-row">
                <label class="tv2-label" for="tv2CheckpointPriority">Priority Level</label>
                <div class="tv2-field tv2-field--select">
                  <span class="tv2-field__icon" aria-hidden="true"><i data-feather="flag"></i></span>
                  <select class="tv2-select" id="tv2CheckpointPriority">
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                  <span class="tv2-field__chevron" aria-hidden="true"><i data-feather="chevron-down"></i></span>
                </div>
              </div>

              <div class="tv2-form-row tv2-form-row--full">
                <label class="tv2-label" for="tv2CheckpointFiles">Files &amp; media</label>
                <div class="tv2-file-wrap tv2-file-wrap--compact">
                  <input class="tv2-file-input" type="file" id="tv2CheckpointFiles" multiple />
                  <div class="tv2-file-meta" id="tv2CheckpointFilesMeta">No files selected yet</div>
                  <div class="tv2-help">You can select more than one file.</div>
                </div>
              </div>
            </div>

            <div class="tv2-mini-modal__footer">
              <button class="tv2-btn tv2-btn--ghost" type="button" id="tv2CheckpointComposerCancelBtn">Cancel</button>
              <button class="tv2-btn tv2-btn--primary" type="submit" id="tv2CheckpointComposerSaveBtn">Save checkpoint</button>
            </div>
          </form>
        </div>
      `;

      document.body.appendChild(tv2CheckpointComposerOverlay);

      tv2CheckpointComposerForm = tv2CheckpointComposerOverlay.querySelector("#tv2CheckpointComposerForm");
      tv2CheckpointComposerTitle = tv2CheckpointComposerOverlay.querySelector("#tv2CheckpointTitle");
      tv2CheckpointComposerAssignee = tv2CheckpointComposerOverlay.querySelector("#tv2CheckpointAssignee");
      tv2CheckpointComposerDueDate = tv2CheckpointComposerOverlay.querySelector("#tv2CheckpointDueDate");
      tv2CheckpointComposerPriority = tv2CheckpointComposerOverlay.querySelector("#tv2CheckpointPriority");
      tv2CheckpointComposerFiles = tv2CheckpointComposerOverlay.querySelector("#tv2CheckpointFiles");
      tv2CheckpointComposerFilesMeta = tv2CheckpointComposerOverlay.querySelector("#tv2CheckpointFilesMeta");
      tv2CheckpointComposerSaveBtn = tv2CheckpointComposerOverlay.querySelector("#tv2CheckpointComposerSaveBtn");
      tv2CheckpointComposerCancelBtn = tv2CheckpointComposerOverlay.querySelector("#tv2CheckpointComposerCancelBtn");
      tv2CheckpointComposerCloseBtn = tv2CheckpointComposerOverlay.querySelector("#tv2CheckpointComposerCloseBtn");

      tv2CheckpointComposerOverlay.addEventListener("click", (e) => {
        if (e.target === tv2CheckpointComposerOverlay) tv2CloseCheckpointComposerModal();
      });

      if (tv2CheckpointComposerCloseBtn) {
        tv2CheckpointComposerCloseBtn.addEventListener("click", (e) => {
          e.preventDefault();
          tv2CloseCheckpointComposerModal();
        });
      }

      if (tv2CheckpointComposerCancelBtn) {
        tv2CheckpointComposerCancelBtn.addEventListener("click", (e) => {
          e.preventDefault();
          tv2CloseCheckpointComposerModal();
        });
      }

      if (tv2CheckpointComposerFiles) {
        tv2CheckpointComposerFiles.addEventListener("change", () => {
          tv2CheckpointComposerFilesBuffer = Array.from(tv2CheckpointComposerFiles.files || []);
          tv2RenderCheckpointFilesMeta();
        });
      }

      if (tv2CheckpointComposerForm) {
        tv2CheckpointComposerForm.addEventListener("submit", (e) => {
          e.preventDefault();
          const textValue = String(tv2CheckpointComposerTitle?.value || "").trim();
          if (!textValue) {
            if (window.toast) window.toast.error("Checkpoint name is required");
            return;
          }

          const assigneeId = String(tv2CheckpointComposerAssignee?.value || "").trim();
          const assigneeName = assigneeId ? String(tv2CheckpointComposerAssignee?.selectedOptions?.[0]?.textContent || "").trim() : "";
          const draft = {
            id: tv2CheckpointComposerEditingId || `cp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
            text: textValue,
            assigneeId,
            assigneeName,
            dueDate: String(tv2CheckpointComposerDueDate?.value || "").trim(),
            priority: String(tv2CheckpointComposerPriority?.value || "").trim() || "Medium",
            files: Array.isArray(tv2CheckpointComposerFilesBuffer) ? tv2CheckpointComposerFilesBuffer.slice() : [],
          };

          const existingIndex = tv2CheckpointDrafts.findIndex((item) => item && item.id === draft.id);
          if (existingIndex >= 0) tv2CheckpointDrafts.splice(existingIndex, 1, draft);
          else tv2CheckpointDrafts.push(draft);

          tv2RenderChecklist();
          tv2CloseCheckpointComposerModal();
        });
      }

      if (window.feather) window.feather.replace();
    }

    function tv2PopulateCheckpointAssigneeOptions(selectedId) {
      if (!tv2CheckpointComposerAssignee) return;
      const opts = [];
      for (const u of deptUsers || []) {
        if (!u || !u.id) continue;
        opts.push({ id: String(u.id), name: String(u.name || "Unnamed") });
      }
      if (meId && !opts.some((o) => o.id === meId)) {
        opts.unshift({ id: String(meId), name: "Me" });
      }
      const safe = [];
      const seen = new Set();
      for (const o of opts) {
        if (!o.id || seen.has(o.id)) continue;
        seen.add(o.id);
        safe.push(o);
      }
      if (!safe.length) safe.push({ id: "", name: "Unassigned" });
      tv2CheckpointComposerAssignee.innerHTML = safe.map((o) => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.name)}</option>`).join("");
      const fallback = selectedId || meId || safe[0]?.id || "";
      tv2CheckpointComposerAssignee.value = safe.some((o) => o.id === fallback) ? fallback : safe[0]?.id || "";
    }

    function tv2RenderCheckpointFilesMeta() {
      if (!tv2CheckpointComposerFilesMeta) return;
      const files = Array.isArray(tv2CheckpointComposerFilesBuffer) ? tv2CheckpointComposerFilesBuffer : [];
      if (!files.length) {
        tv2CheckpointComposerFilesMeta.textContent = "No files selected yet";
        tv2CheckpointComposerFilesMeta.classList.remove("has-files");
        return;
      }
      if (files.length === 1) tv2CheckpointComposerFilesMeta.textContent = String(files[0]?.name || "1 file selected");
      else tv2CheckpointComposerFilesMeta.textContent = `${files.length} files selected`;
      tv2CheckpointComposerFilesMeta.classList.add("has-files");
    }

    function tv2OpenCheckpointComposerModal(checkpointId) {
      tv2EnsureCheckpointComposerModal();
      tv2CloseCheckpointMenus();
      const current = checkpointId ? tv2CheckpointDrafts.find((item) => item && item.id === checkpointId) || null : null;
      tv2CheckpointComposerEditingId = current?.id || "";
      if (tv2CheckpointComposerTitle) tv2CheckpointComposerTitle.value = current?.text || "";
      if (tv2CheckpointComposerDueDate) tv2CheckpointComposerDueDate.value = current?.dueDate || getTodayIso();
      if (tv2CheckpointComposerPriority) tv2CheckpointComposerPriority.value = current?.priority || "Medium";
      tv2CheckpointComposerFilesBuffer = Array.isArray(current?.files) ? current.files.slice() : [];
      if (tv2CheckpointComposerFiles) tv2CheckpointComposerFiles.value = "";
      tv2PopulateCheckpointAssigneeOptions(current?.assigneeId || "");
      tv2RenderCheckpointFilesMeta();
      tv2CheckpointComposerOverlay.hidden = false;
      tv2CheckpointComposerOverlay.style.display = "flex";
      if (tv2CheckpointComposerTitle) {
        setTimeout(() => {
          try { tv2CheckpointComposerTitle.focus(); } catch {}
        }, 0);
      }
      if (window.feather) window.feather.replace();
    }

    function tv2CloseCheckpointComposerModal() {
      if (!tv2CheckpointComposerOverlay) return;
      tv2CheckpointComposerEditingId = "";
      tv2CheckpointComposerOverlay.hidden = true;
      tv2CheckpointComposerOverlay.style.display = "none";
    }

    function tv2OpenNewTaskModal() {
      if (!tv2NewTaskOverlay) return;

      if (tv2NewTaskSubject) tv2NewTaskSubject.value = "";
      tv2ResetChecklist();
      tv2RenderChecklist();
      tv2CloseCheckpointComposerModal();
      tv2CloseAllNewTaskSelects();

      tv2NewTaskOverlay.hidden = false;
      tv2NewTaskOverlay.style.display = "flex";
      document.body.classList.add("tv2-modal-open");

      setTimeout(() => {
        try {
          if (tv2NewTaskSubject) tv2NewTaskSubject.focus();
        } catch {}
      }, 0);
    }

    function tv2CloseNewTaskModal() {
      if (!tv2NewTaskOverlay) return;
      tv2CloseCheckpointComposerModal();
      tv2CloseCheckpointMenus();
      tv2CloseAllNewTaskSelects();
      tv2NewTaskOverlay.hidden = true;
      tv2NewTaskOverlay.style.display = "none";
      document.body.classList.remove("tv2-modal-open");
    }

    // ===============================
    // Task Points Modal (assignee UX)
    // ===============================

    function tv2EnsurePointsModal() {
      if (tv2PointsOverlay) return;

      tv2PointsOverlay = document.createElement("div");
      tv2PointsOverlay.className = "tv2-modal-overlay tv2-points-overlay";
      tv2PointsOverlay.id = "tv2PointsOverlay";
      tv2PointsOverlay.hidden = true;
      tv2PointsOverlay.style.display = "none";

      tv2PointsOverlay.innerHTML = `
        <div class="tv2-points" role="dialog" aria-modal="true" aria-labelledby="tv2PointsTitle">
          <div class="tv2-points__header">
            <div class="tv2-points__headtxt">
              <div class="tv2-points__title" id="tv2PointsTitle">Task</div>
              <div class="tv2-points__meta" id="tv2PointsCount">—</div>
            </div>

            <button class="tv2-modal-icon-btn" type="button" id="tv2PointsCloseBtn" aria-label="Close">
              <span class="tv2-x" aria-hidden="true">×</span>
            </button>
          </div>

          <div class="tv2-points__progress">
            <div class="tv2-points__bar" id="tv2PointsBar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
              <div class="tv2-points__barfill" id="tv2PointsBarFill" style="width:0%"></div>
            </div>
            <div class="tv2-points__pct" id="tv2PointsPct">0%</div>
          </div>

          <div class="tv2-points__list" id="tv2PointsList"></div>
        </div>
      `;

      document.body.appendChild(tv2PointsOverlay);

      tv2PointsTitleEl = tv2PointsOverlay.querySelector("#tv2PointsTitle");
      tv2PointsCountEl = tv2PointsOverlay.querySelector("#tv2PointsCount");
      tv2PointsBarEl = tv2PointsOverlay.querySelector("#tv2PointsBar");
      tv2PointsBarFillEl = tv2PointsOverlay.querySelector("#tv2PointsBarFill");
      tv2PointsPctEl = tv2PointsOverlay.querySelector("#tv2PointsPct");
      tv2PointsListEl = tv2PointsOverlay.querySelector("#tv2PointsList");
      tv2PointsCloseBtn = tv2PointsOverlay.querySelector("#tv2PointsCloseBtn");

      // Close by clicking outside
      tv2PointsOverlay.addEventListener("click", (e) => {
        // Any click inside the modal should close any open attachments dropdown.
        tv2CloseAllPointFilesMenus();
        if (e.target === tv2PointsOverlay) tv2ClosePointsModal();
      });

      if (tv2PointsCloseBtn) {
        tv2PointsCloseBtn.addEventListener("click", (e) => {
          e.preventDefault();
          tv2ClosePointsModal();
        });
      }

      if (window.feather) window.feather.replace();
    }

    function tv2OpenPointsModal() {
      if (!tv2PointsOverlay) return;
      tv2PointsOverlay.hidden = false;
      tv2PointsOverlay.style.display = "flex";
      document.body.classList.add("tv2-modal-open");
    }

    function tv2ClosePointsModal() {
      if (!tv2PointsOverlay) return;
      tv2CloseAllPointFilesMenus();
      tv2SetPointsLoadingState(false);
      tv2PointsOverlay.hidden = true;
      tv2PointsOverlay.style.display = "none";
      document.body.classList.remove("tv2-modal-open");
      tv2PointsTask = null;
      tv2PointsTaskId = "";
    }

    function tv2NormalizePriorityKey(name) {
      const s = String(name || "").trim().toLowerCase();
      if (s.includes("high")) return "high";
      if (s.includes("medium")) return "medium";
      if (s.includes("low")) return "low";
      return "";
    }

    function tv2TodoAssigneeLabel(todo) {
      const names = [];
      if (Array.isArray(todo?.assigneeNames)) names.push(...todo.assigneeNames.filter(Boolean));
      if (String(todo?.assigneeName || "").trim()) names.push(String(todo.assigneeName).trim());
      const unique = [];
      const seen = new Set();
      names.forEach((name) => {
        const label = String(name || "").trim();
        const key = label.toLowerCase();
        if (!label || seen.has(key)) return;
        seen.add(key);
        unique.push(label);
      });
      return unique.length ? unique.join(", ") : "Unassigned";
    }

    function tv2EnsureDelegatedModal() {
      if (tv2DelegatedOverlay) return;

      tv2DelegatedOverlay = document.createElement("div");
      tv2DelegatedOverlay.className = "tv2-modal-overlay tv2-points-overlay tv2-delegated-overlay";
      tv2DelegatedOverlay.id = "tv2DelegatedOverlay";
      tv2DelegatedOverlay.hidden = true;
      tv2DelegatedOverlay.style.display = "none";

      tv2DelegatedOverlay.innerHTML = `
        <div class="tv2-points tv2-points--delegated" role="dialog" aria-modal="true" aria-labelledby="tv2DelegatedTitle">
          <div class="tv2-points__header">
            <div class="tv2-points__headtxt">
              <div class="tv2-points__title" id="tv2DelegatedTitle">Project</div>
              <div class="tv2-points__meta" id="tv2DelegatedCount">—</div>
            </div>

            <button class="tv2-modal-icon-btn" type="button" id="tv2DelegatedCloseBtn" aria-label="Close">
              <span class="tv2-x" aria-hidden="true">×</span>
            </button>
          </div>

          <div class="tv2-points__progress">
            <div class="tv2-points__bar" id="tv2DelegatedBar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
              <div class="tv2-points__barfill" id="tv2DelegatedBarFill" style="width:0%"></div>
            </div>
            <div class="tv2-points__pct" id="tv2DelegatedPct">0%</div>
          </div>

          <div class="tv2-delegated-summary" id="tv2DelegatedSummary"></div>
          <div class="tv2-delegated-list" id="tv2DelegatedList"></div>
        </div>
      `;

      document.body.appendChild(tv2DelegatedOverlay);

      tv2DelegatedTitleEl = tv2DelegatedOverlay.querySelector("#tv2DelegatedTitle");
      tv2DelegatedCountEl = tv2DelegatedOverlay.querySelector("#tv2DelegatedCount");
      tv2DelegatedBarEl = tv2DelegatedOverlay.querySelector("#tv2DelegatedBar");
      tv2DelegatedBarFillEl = tv2DelegatedOverlay.querySelector("#tv2DelegatedBarFill");
      tv2DelegatedPctEl = tv2DelegatedOverlay.querySelector("#tv2DelegatedPct");
      tv2DelegatedSummaryEl = tv2DelegatedOverlay.querySelector("#tv2DelegatedSummary");
      tv2DelegatedListEl = tv2DelegatedOverlay.querySelector("#tv2DelegatedList");
      tv2DelegatedCloseBtn = tv2DelegatedOverlay.querySelector("#tv2DelegatedCloseBtn");

      tv2DelegatedOverlay.addEventListener("click", (e) => {
        if (e.target === tv2DelegatedOverlay) tv2CloseDelegatedModal();
      });

      if (tv2DelegatedCloseBtn) {
        tv2DelegatedCloseBtn.addEventListener("click", (e) => {
          e.preventDefault();
          tv2CloseDelegatedModal();
        });
      }

      if (window.feather) window.feather.replace();
    }

    function tv2OpenDelegatedModal() {
      if (!tv2DelegatedOverlay) return;
      tv2DelegatedOverlay.hidden = false;
      tv2DelegatedOverlay.style.display = "flex";
      document.body.classList.add("tv2-modal-open");
    }

    function tv2CloseDelegatedModal() {
      if (!tv2DelegatedOverlay) return;
      tv2DelegatedOverlay.hidden = true;
      tv2DelegatedOverlay.style.display = "none";
      document.body.classList.remove("tv2-modal-open");
      tv2DelegatedTask = null;
    }

    function tv2RenderDelegatedLoading(taskTitle) {
      const safeTitle = String(taskTitle || "Project").trim() || "Project";
      if (tv2DelegatedTitleEl) tv2DelegatedTitleEl.textContent = safeTitle;
      if (tv2DelegatedCountEl) tv2DelegatedCountEl.textContent = "Loading checkpoints…";
      if (tv2DelegatedPctEl) tv2DelegatedPctEl.textContent = "";
      if (tv2DelegatedBarEl) tv2DelegatedBarEl.setAttribute("aria-valuenow", "0");
      if (tv2DelegatedBarFillEl) tv2DelegatedBarFillEl.style.width = "36%";
      if (tv2DelegatedSummaryEl) {
        tv2DelegatedSummaryEl.hidden = true;
        tv2DelegatedSummaryEl.innerHTML = "";
      }
      if (tv2DelegatedListEl) {
        tv2DelegatedListEl.innerHTML = `
          <div class="tv2-points-loading" role="status" aria-live="polite">
            <div class="tv2-points-loading__hero">
              <div class="tv2-points-loading__ring" aria-hidden="true"></div>
              <div class="tv2-points-loading__copy">
                <div class="tv2-points-loading__title">Loading delegated checkpoints</div>
                <div class="tv2-points-loading__sub">Preparing assignees, due dates, and progress</div>
              </div>
            </div>
            <div class="tv2-points-loading__stack">
              <div class="tv2-delegated-card tv2-delegated-card--skeleton">
                <span class="tv2-delegated-card__skel tv2-delegated-card__skel-status"></span>
                <div class="tv2-delegated-card__skel-copy">
                  <span class="tv2-delegated-card__skel tv2-delegated-card__skel--label"></span>
                  <span class="tv2-delegated-card__skel tv2-delegated-card__skel--title"></span>
                  <div class="tv2-delegated-card__skel-row">
                    <span class="tv2-delegated-card__skel tv2-delegated-card__skel--chip"></span>
                    <span class="tv2-delegated-card__skel tv2-delegated-card__skel--chip tv2-delegated-card__skel--chip-sm"></span>
                    <span class="tv2-delegated-card__skel tv2-delegated-card__skel--chip"></span>
                  </div>
                </div>
              </div>
              <div class="tv2-delegated-card tv2-delegated-card--skeleton">
                <span class="tv2-delegated-card__skel tv2-delegated-card__skel-status"></span>
                <div class="tv2-delegated-card__skel-copy">
                  <span class="tv2-delegated-card__skel tv2-delegated-card__skel--label"></span>
                  <span class="tv2-delegated-card__skel tv2-delegated-card__skel--title tv2-delegated-card__skel--title-sm"></span>
                  <div class="tv2-delegated-card__skel-row">
                    <span class="tv2-delegated-card__skel tv2-delegated-card__skel--chip"></span>
                    <span class="tv2-delegated-card__skel tv2-delegated-card__skel--chip"></span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;
      }
    }

    function tv2RenderDelegatedModal(task) {
      tv2DelegatedTask = task || null;
      const todos = Array.isArray(task?.todos) ? task.todos.filter((t) => String(t?.text || "").trim()) : [];
      const stats = tv2ComputePointsStats(todos);
      const priorityName = String(task?.priority?.name || "").trim();
      const priorityKey = tv2NormalizePriorityKey(priorityName);
      const assignees = Array.isArray(task?.assignees) ? task.assignees.filter(Boolean) : [];

      if (tv2DelegatedTitleEl) tv2DelegatedTitleEl.textContent = task?.title || "Project";
      if (tv2DelegatedCountEl) {
        const checkpointWord = stats.total === 1 ? "checkpoint" : "checkpoints";
        tv2DelegatedCountEl.textContent = `${stats.total} ${checkpointWord} • ${stats.checked} done`;
      }
      if (tv2DelegatedPctEl) tv2DelegatedPctEl.textContent = `${stats.pct}%`;
      if (tv2DelegatedBarEl) tv2DelegatedBarEl.setAttribute("aria-valuenow", String(stats.pct));
      if (tv2DelegatedBarFillEl) tv2DelegatedBarFillEl.style.width = `${stats.pct}%`;

      if (tv2DelegatedSummaryEl) {
        const chips = [];
        if (task?.dueDate) {
          chips.push(`<span class="tv2-checkpoint-chip"><i data-feather="calendar"></i><span>${escapeHtml(formatDueLabel(task.dueDate))}</span></span>`);
        }
        if (priorityName) {
          chips.push(`<span class="tv2-checkpoint-chip tv2-checkpoint-chip--priority tv2-checkpoint-chip--${escapeHtml(priorityKey)}"><i data-feather="flag"></i><span>${escapeHtml(priorityName)}</span></span>`);
        }
        if (assignees.length) {
          chips.push(`<span class="tv2-checkpoint-chip"><i data-feather="users"></i><span>${escapeHtml(assignees.join(", "))}</span></span>`);
        }
        if (chips.length) {
          tv2DelegatedSummaryEl.hidden = false;
          tv2DelegatedSummaryEl.innerHTML = `
            <section class="tv2-delegated-summary-card">
              <div class="tv2-delegated-summary-card__label">Project overview</div>
              <div class="tv2-delegated-summary-card__chips">${chips.join("")}</div>
            </section>
          `;
        } else {
          tv2DelegatedSummaryEl.innerHTML = "";
          tv2DelegatedSummaryEl.hidden = true;
        }
      }

      if (!tv2DelegatedListEl) return;

      if (!todos.length) {
        tv2DelegatedListEl.innerHTML = `<div class="tv2-empty">No delegated checkpoints yet</div>`;
        if (window.feather) window.feather.replace();
        return;
      }

      tv2DelegatedListEl.innerHTML = todos
        .map((item, index) => {
          const assigneeLabel = tv2TodoAssigneeLabel(item);
          const dueLabel = tv2FormatCheckpointDate(item?.dueDate || "");
          const pointPriority = String(item?.priority?.name || item?.priority || "").trim() || "No priority";
          const pointPriorityKey = tv2NormalizePriorityKey(pointPriority);
          const filesCount = Array.isArray(item?.files) ? item.files.length : 0;
          const done = !!item?.checked;
          const stateLabel = done ? "Completed" : "In progress";
          const stateClass = done ? " is-done" : "";
          const statusInner = done
            ? `<i data-feather="check"></i>`
            : `<span class="tv2-delegated-card__check-dot"></span>`;
          const fileChip = filesCount
            ? `<span class="tv2-checkpoint-chip"><i data-feather="paperclip"></i><span>${escapeHtml(`${filesCount} file${filesCount > 1 ? "s" : ""}`)}</span></span>`
            : "";

          return `
            <article class="tv2-delegated-card${stateClass}">
              <div class="tv2-delegated-card__status-col">
                <span class="tv2-delegated-card__check${stateClass}" aria-hidden="true">${statusInner}</span>
              </div>
              <div class="tv2-delegated-card__content">
                <div class="tv2-delegated-card__header">
                  <div class="tv2-delegated-card__title-wrap">
                    <div class="tv2-delegated-card__eyebrow">Checkpoint ${index + 1}</div>
                    <div class="tv2-delegated-card__title">${escapeHtml(item?.text || "Checkpoint")}</div>
                  </div>
                  <span class="tv2-delegated-card__state${stateClass}">
                    <i data-feather="${done ? "check-circle" : "clock"}"></i>
                    <span>${escapeHtml(stateLabel)}</span>
                  </span>
                </div>
                <div class="tv2-delegated-card__meta">
                  <span class="tv2-checkpoint-chip"><i data-feather="user"></i><span>${escapeHtml(`Assigned to ${assigneeLabel}`)}</span></span>
                  <span class="tv2-checkpoint-chip"><i data-feather="calendar"></i><span>${escapeHtml(dueLabel)}</span></span>
                  ${pointPriority && pointPriority !== "No priority" ? `<span class="tv2-checkpoint-chip tv2-checkpoint-chip--priority tv2-checkpoint-chip--${escapeHtml(pointPriorityKey)}"><i data-feather="flag"></i><span>${escapeHtml(pointPriority)}</span></span>` : ""}
                  ${fileChip}
                </div>
              </div>
            </article>
          `;
        })
        .join("");

      if (window.feather) window.feather.replace();
    }

    async function openDelegatedProjectModal(id) {
      if (!id) return;
      tv2EnsureDelegatedModal();
      if (tv2PointsOverlay && tv2PointsOverlay.hidden === false) tv2ClosePointsModal();
      closeDetailView();

      const taskSummary = state.tasks.find((t) => t && t.id === id) || null;
      state.selectedTaskId = id;
      renderTasksList();

      tv2RenderDelegatedLoading(taskSummary?.title || "Project");
      tv2OpenDelegatedModal();

      try {
        const r = await fetch(`/api/tasks/${encodeURIComponent(id)}?scope=delegated`, { cache: "no-store" });
        if (!r.ok) throw new Error("Failed to load delegated project");
        const data = await r.json();
        tv2RenderDelegatedModal(data);

        const pct = tv2ComputePointsStats(data?.todos).pct;
        const idx = state.tasks.findIndex((t) => t && t.id === id);
        if (idx !== -1) {
          state.tasks[idx].completion = pct;
          renderTasksList();
        }
      } catch (e) {
        console.error(e);
        if (tv2DelegatedCountEl) tv2DelegatedCountEl.textContent = "Failed to load";
        if (tv2DelegatedPctEl) tv2DelegatedPctEl.textContent = "";
        if (tv2DelegatedBarEl) tv2DelegatedBarEl.setAttribute("aria-valuenow", "0");
        if (tv2DelegatedBarFillEl) tv2DelegatedBarFillEl.style.width = "0%";
        if (tv2DelegatedSummaryEl) tv2DelegatedSummaryEl.innerHTML = "";
        if (tv2DelegatedListEl) tv2DelegatedListEl.innerHTML = `<div class="tv2-empty">Failed to load delegated checkpoints</div>`;
        if (window.toast) window.toast.error("Failed to load delegated project");
      }
    }

    function tv2RenderPointsLoading(taskTitle) {
      const safeTitle = String(taskTitle || "Task").trim() || "Task";
      tv2SetPointsLoadingState(true);
      if (tv2PointsTitleEl) tv2PointsTitleEl.textContent = safeTitle;
      if (tv2PointsCountEl) tv2PointsCountEl.textContent = "Preparing checklist";
      if (tv2PointsPctEl) tv2PointsPctEl.textContent = "…";
      if (tv2PointsBarEl) tv2PointsBarEl.setAttribute("aria-valuenow", "0");
      if (tv2PointsBarFillEl) tv2PointsBarFillEl.style.width = "36%";
      if (tv2PointsListEl) {
        tv2PointsListEl.innerHTML = `
          <div class="tv2-points-loading" role="status" aria-live="polite">
            <div class="tv2-points-loading__hero">
              <div class="tv2-points-loading__ring" aria-hidden="true"></div>
              <div class="tv2-points-loading__copy">
                <div class="tv2-points-loading__title">Loading task points</div>
                <div class="tv2-points-loading__sub">Syncing checkpoints and attachments</div>
              </div>
            </div>

            <div class="tv2-points-loading__stack" aria-hidden="true">
              <div class="tv2-points-skeleton-row">
                <span class="tv2-points-skeleton-row__circle"></span>
                <span class="tv2-points-skeleton-row__line tv2-points-skeleton-row__line--lg"></span>
                <span class="tv2-points-skeleton-row__action"></span>
                <span class="tv2-points-skeleton-row__action tv2-points-skeleton-row__action--light"></span>
              </div>
              <div class="tv2-points-skeleton-row">
                <span class="tv2-points-skeleton-row__circle"></span>
                <span class="tv2-points-skeleton-row__line"></span>
                <span class="tv2-points-skeleton-row__action"></span>
                <span class="tv2-points-skeleton-row__action tv2-points-skeleton-row__action--light"></span>
              </div>
              <div class="tv2-points-skeleton-row">
                <span class="tv2-points-skeleton-row__circle"></span>
                <span class="tv2-points-skeleton-row__line tv2-points-skeleton-row__line--md"></span>
                <span class="tv2-points-skeleton-row__action"></span>
                <span class="tv2-points-skeleton-row__action tv2-points-skeleton-row__action--light"></span>
              </div>
            </div>
          </div>
        `;
      }
    }

    function tv2ComputePointsStats(todos) {
      const list = Array.isArray(todos) ? todos.filter((t) => String(t?.text || "").trim()) : [];
      const total = list.length;
      const checked = list.reduce((acc, t) => acc + (t?.checked ? 1 : 0), 0);
      const pct = total ? Math.max(0, Math.min(100, Math.round((checked / total) * 100))) : 0;
      return { total, checked, pct };
    }

    function tv2SetPointsLoadingState(isLoading) {
      const shell = tv2PointsOverlay?.querySelector?.(".tv2-points") || null;
      if (shell) shell.classList.toggle("is-loading", !!isLoading);
      if (tv2PointsBarEl) tv2PointsBarEl.classList.toggle("is-loading", !!isLoading);
      if (tv2PointsBarFillEl) tv2PointsBarFillEl.classList.toggle("is-loading", !!isLoading);
    }

    function tv2PointFilesMenuHtml(files) {
      const list = Array.isArray(files)
        ? files
            .map((f) => {
              if (!f) return null;
              const name = String(f?.name || "file");
              const url = String(f?.url || "");
              return { name, url };
            })
            .filter(Boolean)
        : [];

      if (!list.length) {
        return `<div class="tv2-point-files-empty">No attachments</div>`;
      }

      return list
        .map((f) => {
          const name = escapeHtml(f.name || "file");
          const url = String(f.url || "");
          if (url) {
            return `
              <button
                class="tv2-point-file-item"
                type="button"
                role="menuitem"
                data-file-url="${escapeHtml(url)}"
                data-file-name="${name}"
              >
                <span class="tv2-point-file-item__main">
                  <span class="tv2-point-file-item__icon" aria-hidden="true"><i data-feather="download"></i></span>
                  <span class="tv2-point-file-item__name">${name}</span>
                </span>
              </button>
            `;
          }
          return `
            <button class="tv2-point-file-item is-disabled" type="button" role="menuitem" disabled>
              <span class="tv2-point-file-item__main">
                <span class="tv2-point-file-item__icon" aria-hidden="true"><i data-feather="file"></i></span>
                <span class="tv2-point-file-item__name">${name}</span>
              </span>
            </button>
          `;
        })
        .join("");
    }

    async function tv2DownloadFile(url, fileName) {
      const href = String(url || "").trim();
      if (!href) return;

      const safeName = String(fileName || "attachment").trim() || "attachment";
      const fallback = () => {
        try {
          const link = document.createElement("a");
          link.href = href;
          link.download = safeName;
          link.target = "_blank";
          link.rel = "noopener";
          document.body.appendChild(link);
          link.click();
          link.remove();
        } catch {}
      };

      try {
        const r = await fetch(href, { mode: "cors" });
        if (!r.ok) throw new Error("DOWNLOAD_FAILED");
        const blob = await r.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.download = safeName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => {
          try {
            URL.revokeObjectURL(objectUrl);
          } catch {}
        }, 1200);
      } catch (err) {
        console.warn("Task point file download fallback:", err);
        fallback();
      }
    }

    function tv2CloseAllPointFilesMenus() {
      if (!tv2PointsListEl) return;
      try {
        tv2PointsListEl.querySelectorAll(".tv2-point-files-menu").forEach((m) => {
          m.hidden = true;
        });
        tv2PointsListEl.querySelectorAll(".tv2-point-files-btn").forEach((b) => {
          b.setAttribute("aria-expanded", "false");
        });
      } catch {}
    }

    function tv2UpdatePointsStatsUI() {
      if (!tv2PointsTask) return;
      const stats = tv2ComputePointsStats(tv2PointsTask.todos);

      if (tv2PointsCountEl) {
        tv2PointsCountEl.textContent = `${stats.checked} of ${stats.total} complete`;
      }
      if (tv2PointsPctEl) tv2PointsPctEl.textContent = `${stats.pct}%`;
      if (tv2PointsBarEl) tv2PointsBarEl.setAttribute("aria-valuenow", String(stats.pct));
      if (tv2PointsBarFillEl) tv2PointsBarFillEl.style.width = `${stats.pct}%`;

      // Sync completion on the selected task card in the list
      const idx = state.tasks.findIndex((t) => t && t.id === tv2PointsTaskId);
      if (idx !== -1) {
        state.tasks[idx].completion = stats.pct;
        renderTasksList();
      }
    }

    async function tv2SetPointChecked(pointId, checked, rowEl) {
      if (!pointId) return;
      if (!tv2PointsTask || !Array.isArray(tv2PointsTask.todos)) return;

      const item = tv2PointsTask.todos.find((t) => String(t?.id || "") === String(pointId));
      if (!item) return;

      const prevChecked = !!item.checked;
      const checkBtn = rowEl?.querySelector?.(".tv2-point-check") || null;
      const prevDisabled = !!(checkBtn && checkBtn.disabled);

      if (rowEl) {
        rowEl.classList.add("is-checking");
        rowEl.classList.remove("is-checked");
      }
      if (checkBtn) {
        checkBtn.disabled = true;
        checkBtn.classList.add("is-loading");
        checkBtn.setAttribute("aria-busy", "true");
      }

      try {
        const r = await fetch(`/api/task-points/${encodeURIComponent(pointId)}/check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ checked: !!checked }),
        });

        if (!r.ok) {
          const msg = await r.text().catch(() => "");
          throw new Error(msg || "FAILED");
        }

        const data = await r.json().catch(() => ({}));
        item.checked = !!checked;
        if (rowEl) rowEl.classList.toggle("is-checked", !!checked);
        tv2UpdatePointsStatsUI();

        const localStats = tv2ComputePointsStats(tv2PointsTask?.todos || []);
        const nextStatusName = localStats.pct >= 100 ? "Done" : localStats.pct > 0 ? "In progress" : "Not started";
        const nextStatusColor = localStats.pct >= 100 ? "green" : localStats.pct > 0 ? "yellow" : "default";

        if (tv2PointsTask) {
          if (!tv2PointsTask.status) tv2PointsTask.status = { name: nextStatusName, color: nextStatusColor };
          tv2PointsTask.status.name = nextStatusName;
          tv2PointsTask.status.color = nextStatusColor;
        }

        const idx = state.tasks.findIndex((t) => t && t.id === tv2PointsTaskId);
        if (idx !== -1) {
          if (!state.tasks[idx].status) state.tasks[idx].status = { name: nextStatusName, color: nextStatusColor };
          state.tasks[idx].status.name = nextStatusName;
          state.tasks[idx].status.color = nextStatusColor;
          state.tasks[idx].completion = localStats.pct;
        }

        renderTasksList();
      } catch (err) {
        item.checked = prevChecked;
        if (rowEl) rowEl.classList.toggle("is-checked", prevChecked);
        tv2UpdatePointsStatsUI();
        console.error(err);
        if (window.toast) window.toast.error("Failed to update point");
      } finally {
        if (rowEl) rowEl.classList.remove("is-checking");
        if (checkBtn) {
          checkBtn.disabled = prevDisabled;
          checkBtn.classList.remove("is-loading");
          checkBtn.removeAttribute("aria-busy");
        }
      }
    }

    async function tv2UploadPointAttachments(pointId, fileInputEl, uploadBtnEl) {
      if (!pointId || !fileInputEl) return;
      if (!fileInputEl.files || !fileInputEl.files.length) return;

      let attachments = [];
      try {
        attachments = await tv2ReadFilesAsDataUrls(fileInputEl);
      } catch (e) {
        console.error(e);
        if (window.toast) window.toast.error("Failed to read files");
        return;
      }

      if (!attachments.length) return;

      const prevDisabled = !!(uploadBtnEl && uploadBtnEl.disabled);
      if (uploadBtnEl) {
        uploadBtnEl.disabled = true;
        uploadBtnEl.classList.add("is-loading");
        uploadBtnEl.setAttribute("aria-busy", "true");
      }

      try {
        const r = await fetch(`/api/task-points/${encodeURIComponent(pointId)}/attachments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attachments }),
        });
        if (!r.ok) {
          const msg = await r.text().catch(() => "");
          throw new Error(msg || "FAILED");
        }

        const data = await r.json().catch(() => ({}));
        if (window.toast) window.toast.success("Attachment uploaded");

        // Update badge count (best-effort)
        const count = Number(data?.filesCount);

        // Update in-memory list + dropdown menu so the user can view attachments immediately.
        const files = Array.isArray(data?.files) ? data.files : null;
        if (files && tv2PointsTask && Array.isArray(tv2PointsTask.todos)) {
          try {
            const item = tv2PointsTask.todos.find((t) => String(t?.id || "") === String(pointId));
            if (item) item.files = files;
          } catch {}

          const row = uploadBtnEl && uploadBtnEl.closest ? uploadBtnEl.closest(".tv2-point-row") : null;
          if (row) {
            const filesBtn = row.querySelector(".tv2-point-files-btn");
            const menu = row.querySelector(".tv2-point-files-menu");
            if (filesBtn) {
              filesBtn.disabled = !(Array.isArray(files) && files.length);
              const badge = filesBtn.querySelector(".tv2-point-badge");
              if (Number.isFinite(count) && count > 0) {
                if (badge) badge.textContent = String(count);
                else filesBtn.insertAdjacentHTML("beforeend", `<span class="tv2-point-badge">${escapeHtml(String(count))}</span>`);
              } else if (badge) {
                badge.remove();
              }
            }
            if (menu) {
              menu.innerHTML = tv2PointFilesMenuHtml(files);
              menu.hidden = true;
              if (filesBtn) filesBtn.setAttribute("aria-expanded", "false");
            }
            if (window.feather) window.feather.replace();
          }
        }
      } catch (e) {
        console.error(e);
        if (window.toast) window.toast.error("Failed to upload attachment");
      } finally {
        if (uploadBtnEl) {
          uploadBtnEl.disabled = prevDisabled;
          uploadBtnEl.classList.remove("is-loading");
          uploadBtnEl.removeAttribute("aria-busy");
        }
        try {
          fileInputEl.value = "";
        } catch {}
      }
    }

    function tv2RenderPointsModal(task, { canEdit } = {}) {
      tv2SetPointsLoadingState(false);
      tv2PointsTask = task || null;
      if (tv2PointsTitleEl) tv2PointsTitleEl.textContent = task?.title || "Task";

      const todos = Array.isArray(task?.todos) ? task.todos.filter((t) => String(t?.text || "").trim()) : [];
      const stats = tv2ComputePointsStats(todos);

      if (tv2PointsCountEl) tv2PointsCountEl.textContent = `${stats.checked} of ${stats.total} complete`;
      if (tv2PointsPctEl) tv2PointsPctEl.textContent = `${stats.pct}%`;
      if (tv2PointsBarEl) tv2PointsBarEl.setAttribute("aria-valuenow", String(stats.pct));
      if (tv2PointsBarFillEl) tv2PointsBarFillEl.style.width = `${stats.pct}%`;

      if (!tv2PointsListEl) return;

      if (!todos.length) {
        tv2PointsListEl.innerHTML = `<div class="tv2-empty">No task points</div>`;
        return;
      }

      const editable = !!canEdit;
      tv2PointsListEl.innerHTML = todos
        .map((t) => {
          const id = String(t?.id || "");
          const checked = !!t?.checked;
          const files = Array.isArray(t?.files) ? t.files : [];
          const filesCount = files.length;
          const disabledAttr = editable && id ? "" : "disabled";
          const badge = filesCount ? `<span class="tv2-point-badge">${escapeHtml(String(filesCount))}</span>` : "";
          const menuHtml = tv2PointFilesMenuHtml(files);
          const filesBtnDisabled = filesCount ? "" : "disabled";

          return `
            <div class="tv2-point-row${checked ? " is-checked" : ""}${!editable ? " is-readonly" : ""}" data-point-id="${escapeHtml(id)}">
              <button class="tv2-point-check" type="button" aria-label="Mark complete" ${disabledAttr}></button>
              <div class="tv2-point-text">${escapeHtml(t.text)}</div>
              <div class="tv2-point-actions">
                <button class="tv2-point-upload" type="button" aria-label="Upload files and media" title="Upload files and media" ${disabledAttr}>
                  <i data-feather="plus"></i>
                </button>

                <div class="tv2-point-files-wrap">
                  <button class="tv2-point-files-btn" type="button" aria-label="View uploaded files" title="View uploaded files" aria-haspopup="menu" aria-expanded="false" ${filesBtnDisabled}>
                    <i data-feather="paperclip"></i>
                    ${badge}
                  </button>
                  <div class="tv2-point-files-menu" role="menu" hidden>
                    ${menuHtml}
                  </div>
                </div>

                <input class="tv2-point-file-input" type="file" multiple hidden />
              </div>
            </div>
          `;
        })
        .join("");

      // Wire interactions
      tv2PointsListEl.querySelectorAll(".tv2-point-row").forEach((row) => {
        const pointId = row.getAttribute("data-point-id") || "";

        const checkBtn = row.querySelector(".tv2-point-check");
        if (checkBtn) {
          checkBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!editable) return;
            if (!pointId) return;
            const next = !row.classList.contains("is-checked");
            tv2SetPointChecked(pointId, next, row);
          });
        }

        const uploadBtn = row.querySelector(".tv2-point-upload");
        const fileInput = row.querySelector(".tv2-point-file-input");

        const filesBtn = row.querySelector(".tv2-point-files-btn");
        const filesMenu = row.querySelector(".tv2-point-files-menu");

        if (uploadBtn && fileInput) {
          uploadBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!editable) return;
            if (!pointId) return;
            try {
              fileInput.click();
            } catch {}
          });

          fileInput.addEventListener("change", () => {
            if (!editable) return;
            if (!pointId) return;
            tv2UploadPointAttachments(pointId, fileInput, uploadBtn);
          });
        }

        // Attachments dropdown
        if (filesBtn && filesMenu) {
          // Prevent overlay click handler from closing the menu immediately.
          filesBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (filesBtn.disabled) return;

            const isOpen = filesMenu.hidden === false;
            tv2CloseAllPointFilesMenus();

            if (!isOpen) {
              filesMenu.hidden = false;
              filesBtn.setAttribute("aria-expanded", "true");
            }
          });

          // Keep clicks inside the menu from bubbling to the overlay and download files on tap.
          filesMenu.addEventListener("click", async (e) => {
            const fileBtn = e.target?.closest ? e.target.closest("[data-file-url]") : null;
            if (fileBtn) {
              e.preventDefault();
              e.stopPropagation();
              const fileUrl = String(fileBtn.getAttribute("data-file-url") || "");
              const fileName = String(fileBtn.getAttribute("data-file-name") || "attachment");
              await tv2DownloadFile(fileUrl, fileName);
              return;
            }
            e.stopPropagation();
          });
        }
      });

      if (window.feather) window.feather.replace();
    }

    async function openTaskPointsForTask(id) {
      if (!id) return;
      tv2EnsurePointsModal();

      const taskSummary = state.tasks.find((t) => t && t.id === id) || null;

      // Highlight selection in list
      state.selectedTaskId = id;
      renderTasksList();

      tv2PointsTaskId = id;
      tv2RenderPointsLoading(taskSummary?.title || "Task");
      tv2OpenPointsModal();

      try {
        const r = await fetch(`/api/tasks/${encodeURIComponent(id)}?scope=${encodeURIComponent(state.mode === "delegated" ? "delegated" : "mine")}`, { cache: "no-store" });
        if (!r.ok) throw new Error("Failed to load task");
        const data = await r.json();

        // We only enable editing in My tasks view (UX request)
        tv2RenderPointsModal(data, { canEdit: state.mode === "mine" });

        // Sync card completion from fetched data (best-effort)
        const pct = tv2ComputePointsStats(data?.todos).pct;
        const idx = state.tasks.findIndex((t) => t && t.id === id);
        if (idx !== -1) {
          state.tasks[idx].completion = pct;
          renderTasksList();
        }
      } catch (e) {
        console.error(e);
        tv2SetPointsLoadingState(false);
        if (tv2PointsCountEl) tv2PointsCountEl.textContent = "Failed to load";
        if (tv2PointsPctEl) tv2PointsPctEl.textContent = "";
        if (tv2PointsBarEl) tv2PointsBarEl.setAttribute("aria-valuenow", "0");
        if (tv2PointsBarFillEl) tv2PointsBarFillEl.style.width = "0%";
        if (tv2PointsListEl) tv2PointsListEl.innerHTML = `<div class="tv2-empty">Failed to load task points</div>`;
        if (window.toast) window.toast.error("Failed to load task points");
      }
    }

    function tv2GetNewTaskSelectConfig(kind) {
      if (kind === "assignee") {
        return {
          kind,
          picker: tv2NewTaskAssigneePicker,
          trigger: tv2NewTaskAssigneeTrigger,
          triggerLabel: tv2NewTaskAssigneeTriggerLabel,
          dropdown: tv2NewTaskAssigneeDropdown,
          optionsEl: tv2NewTaskAssigneeOptions,
          select: tv2NewTaskAssignee,
          fallbackLabel: "Auto (me)",
        };
      }

      if (kind === "priority") {
        return {
          kind,
          picker: tv2NewTaskPriorityPicker,
          trigger: tv2NewTaskPriorityTrigger,
          triggerLabel: tv2NewTaskPriorityTriggerLabel,
          dropdown: tv2NewTaskPriorityDropdown,
          optionsEl: tv2NewTaskPriorityOptions,
          select: tv2NewTaskPriority,
          fallbackLabel: "Select priority",
        };
      }

      return null;
    }

    function tv2AllNewTaskSelectKinds() {
      return ["assignee", "priority"];
    }

    function tv2CloseNewTaskSelect(kind) {
      const meta = tv2GetNewTaskSelectConfig(kind);
      if (!meta?.dropdown || !meta.trigger) return;
      meta.dropdown.hidden = true;
      meta.trigger.classList.remove("is-open");
      meta.trigger.setAttribute("aria-expanded", "false");
      if (meta.picker) meta.picker.classList.remove("is-dropup");
    }

    function tv2CloseAllNewTaskSelects(exceptKind) {
      tv2AllNewTaskSelectKinds().forEach((kind) => {
        if (kind === exceptKind) return;
        tv2CloseNewTaskSelect(kind);
      });
    }

    function tv2PositionNewTaskSelect(kind) {
      const meta = tv2GetNewTaskSelectConfig(kind);
      if (!meta?.picker || !meta.trigger || !meta.dropdown) return;

      const rect = meta.trigger.getBoundingClientRect();
      const viewportPad = 16;
      const dropdownHeight = Math.min(320, Math.max(180, meta.dropdown.scrollHeight || 0));
      const spaceBelow = window.innerHeight - rect.bottom - viewportPad;
      const spaceAbove = rect.top - viewportPad;
      const openUp = spaceBelow < Math.min(220, dropdownHeight) && spaceAbove > spaceBelow;

      meta.picker.classList.toggle("is-dropup", openUp);
    }

    function tv2RenderNewTaskSelectOptions(kind) {
      const meta = tv2GetNewTaskSelectConfig(kind);
      if (!meta?.optionsEl || !meta.select) return;

      const options = Array.from(meta.select.options || []);
      meta.optionsEl.innerHTML = options
        .map((opt, index) => {
          const selected = !!opt.selected;
          const placeholder = String(opt.dataset?.tv2Placeholder || "") === "1";
          return `
            <button
              class="tv2-order-select__option${selected ? " is-selected" : ""}${placeholder ? " is-placeholder-option" : ""}"
              type="button"
              role="option"
              aria-selected="${selected ? "true" : "false"}"
              data-select-index="${index}"
            >
              <span class="tv2-order-select__option-main">
                <span class="tv2-order-select__option-label">${escapeHtml(opt.textContent || "")}</span>
              </span>
              <span class="tv2-order-select__option-check">${selected ? `<i data-feather="check"></i>` : ""}</span>
            </button>
          `;
        })
        .join("");

      if (window.feather) window.feather.replace();
    }

    function tv2SyncNewTaskSelect(kind) {
      const meta = tv2GetNewTaskSelectConfig(kind);
      if (!meta?.select || !meta.triggerLabel || !meta.trigger) return;

      const selectedIndex = Number(meta.select.selectedIndex);
      const selectedOpt = selectedIndex >= 0 ? meta.select.options[selectedIndex] : null;
      const label = String(selectedOpt?.textContent || meta.fallbackLabel || "").trim() || meta.fallbackLabel || "";
      const isPlaceholder = !selectedOpt || String(selectedOpt.dataset?.tv2Placeholder || "") === "1";

      meta.triggerLabel.textContent = label;
      meta.trigger.classList.toggle("is-placeholder", isPlaceholder);
      meta.trigger.classList.toggle("is-selected", !isPlaceholder);

      tv2RenderNewTaskSelectOptions(kind);
    }

    function tv2OpenNewTaskSelect(kind) {
      const meta = tv2GetNewTaskSelectConfig(kind);
      if (!meta?.dropdown || !meta.trigger) return;

      tv2SyncNewTaskSelect(kind);
      tv2CloseAllNewTaskSelects(kind);

      meta.dropdown.hidden = false;
      meta.trigger.classList.add("is-open");
      meta.trigger.setAttribute("aria-expanded", "true");
      tv2PositionNewTaskSelect(kind);
      window.requestAnimationFrame(() => tv2PositionNewTaskSelect(kind));
    }

    function tv2ToggleNewTaskSelect(kind) {
      const meta = tv2GetNewTaskSelectConfig(kind);
      if (!meta?.dropdown) return;
      if (meta.dropdown.hidden) tv2OpenNewTaskSelect(kind);
      else tv2CloseNewTaskSelect(kind);
    }

    function tv2WireNewTaskSelect(kind) {
      const meta = tv2GetNewTaskSelectConfig(kind);
      if (!meta?.trigger || !meta.dropdown || !meta.optionsEl || !meta.select) return;
      if (meta.trigger.dataset.tv2Bound === "1") return;
      meta.trigger.dataset.tv2Bound = "1";

      meta.trigger.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        tv2ToggleNewTaskSelect(kind);
      });

      meta.optionsEl.addEventListener("click", (e) => {
        const btn = e.target?.closest ? e.target.closest("[data-select-index]") : null;
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();

        const index = Number(btn.getAttribute("data-select-index"));
        if (!Number.isFinite(index) || index < 0 || index >= meta.select.options.length) return;

        meta.select.selectedIndex = index;
        meta.select.dispatchEvent(new Event("change", { bubbles: true }));
        tv2CloseNewTaskSelect(kind);
      });

      meta.dropdown.addEventListener("click", (e) => {
        e.stopPropagation();
      });

      meta.select.addEventListener("change", () => {
        tv2SyncNewTaskSelect(kind);
      });
    }

    function tv2WireNewTaskSelects() {
      tv2WireNewTaskSelect("assignee");
      tv2WireNewTaskSelect("priority");

      if (!tv2NewTaskSelectDocBound) {
        tv2NewTaskSelectDocBound = true;

        document.addEventListener("click", (e) => {
          if (!tv2NewTaskOverlay || tv2NewTaskOverlay.hidden) return;
          const target = e.target;
          const insideAnyPicker = tv2AllNewTaskSelectKinds().some((kind) => {
            const meta = tv2GetNewTaskSelectConfig(kind);
            return !!(meta?.picker && target && meta.picker.contains(target));
          });
          if (!insideAnyPicker) tv2CloseAllNewTaskSelects();
        });

        window.addEventListener("resize", () => {
          if (!tv2NewTaskOverlay || tv2NewTaskOverlay.hidden) return;
          tv2AllNewTaskSelectKinds().forEach((kind) => {
            const meta = tv2GetNewTaskSelectConfig(kind);
            if (meta?.dropdown && meta.dropdown.hidden === false) tv2PositionNewTaskSelect(kind);
          });
        });
      }
    }

    function tv2RenderAssigneeOptions() {
      if (!tv2NewTaskAssignee) return;

      const cur = String(tv2NewTaskAssignee.value || "");

      const opts = [];
      // Default: empty => server will set "me"
      opts.push({ id: "", name: "Auto (me)" });

      // Department users
      for (const u of deptUsers || []) {
        if (!u || !u.id) continue;
        opts.push({ id: String(u.id), name: String(u.name || "Unnamed") });
      }

      // Ensure "me" exists even if dept list failed
      if (meId && !opts.some((o) => o.id === meId)) {
        opts.push({ id: String(meId), name: "Me" });
      }

      // De-dup by id
      const seen = new Set();
      const safe = [];
      for (const o of opts) {
        const id = String(o.id || "");
        if (seen.has(id)) continue;
        seen.add(id);
        safe.push(o);
      }

      tv2NewTaskAssignee.innerHTML = safe
        .map((o) => {
          const label = escapeHtml(o.name);
          const value = escapeHtml(o.id);
          return `<option value="${value}">${label}</option>`;
        })
        .join("");

      // Default to me (if possible)
      if (cur && safe.some((o) => o.id === cur)) {
        tv2NewTaskAssignee.value = cur;
      } else if (meId && safe.some((o) => o.id === meId)) {
        tv2NewTaskAssignee.value = meId;
      } else {
        tv2NewTaskAssignee.value = "";
      }

      tv2SyncNewTaskSelect("assignee");
    }

    function tv2ResetChecklist() {
      tv2CheckpointDrafts = [];
      if (tv2ChecklistList) tv2ChecklistList.innerHTML = "";
    }

    function tv2FormatCheckpointDate(isoDay) {
      const d = isoDay ? parseIsoDayToLocalDate(isoDay) : null;
      if (!d) return "No due date";
      try {
        return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      } catch {
        return String(isoDay || "");
      }
    }

    function tv2CloseCheckpointMenus(exceptWrap) {
      if (!tv2ChecklistList) return;
      const keep = exceptWrap || null;
      tv2ChecklistList.querySelectorAll(".tv2-checkpoint-card__menu-wrap").forEach((wrap) => {
        const menu = wrap.querySelector(".tv2-checkpoint-card__menu");
        const btn = wrap.querySelector("[data-checkpoint-menu-toggle]");
        const open = !!(keep && wrap === keep);
        if (menu) menu.hidden = !open;
        if (btn) {
          btn.setAttribute("aria-expanded", open ? "true" : "false");
          btn.classList.toggle("is-open", open);
        }
      });
    }

    function tv2BindCheckpointMenuDocCloseOnce() {
      if (tv2CheckpointMenuDocBound) return;
      tv2CheckpointMenuDocBound = true;

      document.addEventListener("click", (e) => {
        if (!tv2NewTaskOverlay || tv2NewTaskOverlay.hidden) return;
        const insideMenu = e.target?.closest ? e.target.closest(".tv2-checkpoint-card__menu-wrap") : null;
        if (!insideMenu) tv2CloseCheckpointMenus();
      });
    }

    function tv2RenderChecklist() {
      if (!tv2ChecklistList) return;

      if (!tv2CheckpointDrafts.length) {
        tv2ChecklistList.innerHTML = `
          <div class="tv2-checklist-empty">
            <div class="tv2-checklist-empty__icon" aria-hidden="true"><i data-feather="layers"></i></div>
            <div class="tv2-checklist-empty__title">No checkpoints yet</div>
            <div class="tv2-checklist-empty__text">Tap Add checkpoint to assign work, add due dates, files, and priority inside the project.</div>
          </div>
        `;
        if (window.feather) window.feather.replace();
        return;
      }

      tv2ChecklistList.innerHTML = tv2CheckpointDrafts
        .map((item) => {
          const assigneeLabel = item?.assigneeName || (item?.assigneeId && usersById.get(item.assigneeId)) || "Unassigned";
          const dueLabel = tv2FormatCheckpointDate(item?.dueDate || "");
          const priorityLabel = String(item?.priority || "Medium") || "Medium";
          const priorityKey = String(priorityLabel || "").trim().toLowerCase();
          const filesCount = Array.isArray(item?.files) ? item.files.length : 0;
          return `
            <div class="tv2-checkpoint-card" data-checkpoint-id="${escapeHtml(item.id)}">
              <div class="tv2-checkpoint-card__body">
                <div class="tv2-checkpoint-card__header">
                  <div class="tv2-checkpoint-card__title-wrap">
                    <span class="tv2-checkpoint-card__bullet" aria-hidden="true"></span>
                    <div class="tv2-checkpoint-card__title">${escapeHtml(item.text || "Checkpoint")}</div>
                  </div>
                  <div class="tv2-checkpoint-card__menu-wrap">
                    <button class="tv2-checkpoint-card__menu-btn" type="button" data-checkpoint-menu-toggle="${escapeHtml(item.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="Checkpoint options">
                      <i data-feather="more-horizontal"></i>
                    </button>
                    <div class="tv2-checkpoint-card__menu" data-checkpoint-menu="${escapeHtml(item.id)}" role="menu" hidden>
                      <button class="tv2-checkpoint-card__menu-item" type="button" data-checkpoint-edit="${escapeHtml(item.id)}" role="menuitem">
                        <i data-feather="edit-2"></i>
                        <span>Edit checkpoint</span>
                      </button>
                      <button class="tv2-checkpoint-card__menu-item is-danger" type="button" data-checkpoint-delete="${escapeHtml(item.id)}" role="menuitem">
                        <i data-feather="trash-2"></i>
                        <span>Delete checkpoint</span>
                      </button>
                    </div>
                  </div>
                </div>
                <div class="tv2-checkpoint-card__meta">
                  <span class="tv2-checkpoint-chip"><i data-feather="user"></i><span>${escapeHtml(assigneeLabel)}</span></span>
                  <span class="tv2-checkpoint-chip"><i data-feather="calendar"></i><span>${escapeHtml(dueLabel)}</span></span>
                  <span class="tv2-checkpoint-chip tv2-checkpoint-chip--priority tv2-checkpoint-chip--${escapeHtml(priorityKey)}"><i data-feather="flag"></i><span>${escapeHtml(priorityLabel)}</span></span>
                  <span class="tv2-checkpoint-chip"><i data-feather="paperclip"></i><span>${filesCount ? `${filesCount} file${filesCount > 1 ? "s" : ""}` : "No files"}</span></span>
                </div>
              </div>
            </div>
          `;
        })
        .join("");

      tv2ChecklistList.querySelectorAll("[data-checkpoint-menu-toggle]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const wrap = btn.closest(".tv2-checkpoint-card__menu-wrap");
          const menu = wrap?.querySelector(".tv2-checkpoint-card__menu");
          if (!wrap || !menu) return;
          const willOpen = menu.hidden;
          tv2CloseCheckpointMenus(willOpen ? wrap : null);
        });
      });

      tv2ChecklistList.querySelectorAll(".tv2-checkpoint-card__menu").forEach((menu) => {
        menu.addEventListener("click", (e) => e.stopPropagation());
      });

      tv2ChecklistList.querySelectorAll("[data-checkpoint-edit]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const id = btn.getAttribute("data-checkpoint-edit") || "";
          if (!id) return;
          tv2CloseCheckpointMenus();
          tv2OpenCheckpointComposerModal(id);
        });
      });

      tv2ChecklistList.querySelectorAll("[data-checkpoint-delete]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          const id = btn.getAttribute("data-checkpoint-delete") || "";
          if (!id) return;
          tv2CloseCheckpointMenus();
          tv2CheckpointDrafts = tv2CheckpointDrafts.filter((item) => item && item.id !== id);
          tv2RenderChecklist();
        });
      });

      if (window.feather) window.feather.replace();
    }

    function tv2CollectChecklist() {
      return Array.isArray(tv2CheckpointDrafts) ? tv2CheckpointDrafts.map((item) => ({ ...item })) : [];
    }

    function tv2ReadFileAsDataUrl(file) {
      return new Promise((resolve, reject) => {
        try {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result || ""));
          reader.onerror = () => reject(reader.error || new Error("READ_FAILED"));
          reader.readAsDataURL(file);
        } catch (e) {
          reject(e);
        }
      });
    }

    async function tv2ReadFilesAsDataUrls(fileInputEl) {
      const out = [];
      if (!fileInputEl || !fileInputEl.files || !fileInputEl.files.length) return out;

      const files = Array.from(fileInputEl.files || []);
      for (const f of files) {
        if (!f) continue;
        const dataUrl = await tv2ReadFileAsDataUrl(f);
        if (!dataUrl) continue;
        out.push({ name: f.name || "file", dataUrl });
      }
      return out;
    }

    async function tv2ReadFileListArrayAsDataUrls(filesArray) {
      const out = [];
      for (const f of Array.isArray(filesArray) ? filesArray : []) {
        if (!f) continue;
        if (f && typeof f === "object" && typeof f.dataUrl === "string") {
          out.push({ name: String(f.name || "file"), dataUrl: String(f.dataUrl) });
          continue;
        }
        const dataUrl = await tv2ReadFileAsDataUrl(f);
        if (!dataUrl) continue;
        out.push({ name: f.name || "file", dataUrl });
      }
      return out;
    }

    async function tv2SubmitNewTaskForm(e) {
      e.preventDefault();

      const title = String(tv2NewTaskSubject?.value || "").trim();
      if (!title) {
        if (window.toast) window.toast.error("Project subject is required");
        return;
      }

      const checklist = tv2CollectChecklist();
      const payload = { title };

      try {
        if (Array.isArray(checklist) && checklist.length) {
          payload.checklist = [];
          for (const item of checklist) {
            const point = {
              text: String(item?.text || "").trim(),
              assigneeId: String(item?.assigneeId || "").trim(),
              assigneeName: String(item?.assigneeName || "").trim(),
              deliveryDate: String(item?.dueDate || "").trim(),
              priority: String(item?.priority || "").trim(),
            };
            const files = await tv2ReadFileListArrayAsDataUrls(item?.files || []);
            if (files.length) point.attachments = files;
            if (point.text) payload.checklist.push(point);
          }
        }
      } catch (err) {
        console.error(err);
        if (window.toast) window.toast.error("Failed to prepare checkpoint files");
        return;
      }

      const prevText = tv2NewTaskSubmitBtn ? tv2NewTaskSubmitBtn.textContent : "";
      if (tv2NewTaskSubmitBtn) {
        tv2NewTaskSubmitBtn.disabled = true;
        tv2NewTaskSubmitBtn.textContent = "Creating project...";
      }
      if (tv2NewTaskCancelBtn) tv2NewTaskCancelBtn.disabled = true;
      if (tv2NewTaskCloseBtn) tv2NewTaskCloseBtn.disabled = true;

      try {
        const r = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!r.ok) throw new Error("Failed to create project");
        const data = await r.json();

        if (window.toast) window.toast.success("Project created");
        tv2CloseNewTaskModal();

        await loadTasks({ keepDay: true });

        if (data?.id && state.tasks.some((t) => t && String(t.id) === String(data.id))) {
          try {
            if (state.mode === "mine") await openTaskPointsForTask(String(data.id));
            else await openDelegatedProjectModal(String(data.id));
          } catch {}
        }
      } catch (err) {
        console.error(err);
        if (window.toast) window.toast.error("Failed to create project");
      } finally {
        if (tv2NewTaskSubmitBtn) {
          tv2NewTaskSubmitBtn.disabled = false;
          tv2NewTaskSubmitBtn.textContent = prevText || "Create project";
        }
        if (tv2NewTaskCancelBtn) tv2NewTaskCancelBtn.disabled = false;
        if (tv2NewTaskCloseBtn) tv2NewTaskCloseBtn.disabled = false;
      }
    }

    async function createNewTask() {
      closeMenu();
      closeSortMenu();
      tv2EnsureNewTaskModal();
      tv2OpenNewTaskModal();
    }

function wireListActions() {
      if (!gridEl) return;

// Status tabs
try {
  gridEl.querySelectorAll("[data-status-tab]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const key = String(btn.getAttribute("data-status-tab") || "").trim();
      setStatusTab(key);
    });
  });
} catch {}


      // View (My tasks / Delegated tasks)
      filterBtnEl = gridEl.querySelector("#tasksV2FilterBtn");
      filterMenuEl = gridEl.querySelector("#tasksV2FilterMenu");

      if (filterMenuEl) filterMenuEl.hidden = true;
      if (filterBtnEl) filterBtnEl.setAttribute("aria-expanded", "false");

      if (filterBtnEl) {
        filterBtnEl.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleMenu();
        });
      }

      sortBtnEl = gridEl.querySelector("#tasksV2SortBtn");
      sortMenuEl = gridEl.querySelector("#tasksV2SortMenu");
      newTaskBtnEl = gridEl.querySelector("#tasksV2NewTaskBtn");

      if (sortMenuEl) sortMenuEl.hidden = true;
      if (sortBtnEl) sortBtnEl.setAttribute("aria-expanded", "false");

      if (newTaskBtnEl) {
        newTaskBtnEl.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          createNewTask();
        });
      }

      if (sortBtnEl) {
        sortBtnEl.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          toggleSortMenu();
        });
      }

      if (sortMenuEl) {
        sortMenuEl.querySelectorAll("[data-sort]").forEach((btn) => {
          btn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const key = String(btn.getAttribute("data-sort") || "");
            setSort(key);
          });
        });
      }

      // Close sort menu when clicking anywhere else
      bindSortDocCloseOnce();
      // Close view menu when clicking anywhere else
      bindFilterDocCloseOnce();

      // Render current view menu items (and wire clicks)
      renderFilterMenu();

      // Global keyboard shortcuts (Escape + day navigation)
      bindGlobalKeydownOnce();

      if (window.feather) window.feather.replace();
    }

    function renderTaskDetailsEmpty() {
      if (detailTitleEl) detailTitleEl.textContent = "Select a task";
      if (detailSubEl) detailSubEl.textContent = "Choose a task from the left list.";
      if (detailTimeEl) detailTimeEl.textContent = "—";
      if (detailAvatarsEl) detailAvatarsEl.innerHTML = "";
      if (detailBodyEl) {
        detailBodyEl.innerHTML = `
          <div class="tv2-plan-item">
            <div class="tv2-plan-item__txt">No task selected</div>
            <div class="tv2-plan-item__time">—</div>
          </div>
        `;
      }
      state.selectedTaskUrl = "";
      if (detailOpenNotionBtn) detailOpenNotionBtn.disabled = true;
      if (window.feather) window.feather.replace();
    }

    function renderTaskDetailsLoading() {
      if (detailBodyEl) {
        detailBodyEl.innerHTML = `
          <div class="modern-loading" role="status" aria-live="polite">
            <div class="modern-loading__spinner" aria-hidden="true"></div>
            <div class="modern-loading__text">Loading details <span class="modern-loading__dots" aria-hidden="true"><span></span><span></span><span></span></span></div>
          </div>
        `;
      }
    }

    function renderTaskDetails(task) {
      if (!task) {
        renderTaskDetailsEmpty();
        return;
      }

      const dueIso = isoDayFromAny(task.dueDate);
      const dueDateObj = dueIso ? parseIsoDayToLocalDate(dueIso) : null;

      if (detailTimeEl) {
        detailTimeEl.textContent = dueDateObj ? formatFullDate(dueDateObj) : "No delivery date";
      }

      if (detailTitleEl) detailTitleEl.textContent = task.title || "Untitled";

      const subBits = [];
      if (task?.status?.name) subBits.push(task.status.name);
      if (task?.priority?.name) subBits.push(task.priority.name);
      if (task?.completion !== null && task?.completion !== undefined && task?.completion !== "") {
        const n = Number(task.completion);
        if (Number.isFinite(n)) subBits.push(`${Math.round(n)}%`);
      }
      if (detailSubEl) detailSubEl.textContent = subBits.join(" • ") || "";

      if (detailAvatarsEl) {
        detailAvatarsEl.innerHTML = renderAvatars(task.assignees || [], { center: true, max: 4 });
      }

      // Checklist / Plan
      const todos = Array.isArray(task.todos) ? task.todos.filter((t) => String(t?.text || "").trim()) : [];
      if (detailBodyEl) {
        if (todos.length) {
          const firstPending = todos.findIndex((t) => !t.checked);
          const activeIdx = firstPending === -1 ? 0 : firstPending;

          detailBodyEl.innerHTML = todos
            .map((t, idx) => {
              const active = idx === activeIdx ? " tv2-plan-item--active" : "";
              const time = t.checked ? "Done" : "Todo";
              return `
                <div class="tv2-plan-item${active}">
                  <div class="tv2-plan-item__txt">${escapeHtml(t.text)}</div>
                  <div class="tv2-plan-item__time">${escapeHtml(time)}</div>
                </div>
              `;
            })
            .join("");
        } else {
          // Fallback to some meta rows
          const metaRows = [
            { txt: task.createdBy ? `Created by: ${task.createdBy}` : "Created by: —", time: "" },
            {
              txt:
                Array.isArray(task.assignees) && task.assignees.length
                  ? `Assignees: ${task.assignees.join(", ")}`
                  : "Assignees: —",
              time: "",
            },
            { txt: task?.status?.name ? `Status: ${task.status.name}` : "Status: —", time: "" },
            { txt: task?.priority?.name ? `Priority: ${task.priority.name}` : "Priority: —", time: "" },
          ];

          detailBodyEl.innerHTML = metaRows
            .map((r, idx) => {
              const active = idx === 0 ? " tv2-plan-item--active" : "";
              return `
                <div class="tv2-plan-item${active}">
                  <div class="tv2-plan-item__txt">${escapeHtml(r.txt)}</div>
                  <div class="tv2-plan-item__time">${escapeHtml(r.time || "")}</div>
                </div>
              `;
            })
            .join("");
        }
      }

      state.selectedTaskUrl = task.url || "";
      if (detailOpenNotionBtn) detailOpenNotionBtn.disabled = !state.selectedTaskUrl;

      if (window.feather) window.feather.replace();
    }

    async function selectTask(id, opts) {
      if (!id) return;
      const open = !!(opts && opts.open);
      state.selectedTaskId = id;

      // Update URL cache from list
      const inList = state.tasks.find((t) => t.id === id);
      if (inList?.url) state.selectedTaskUrl = inList.url;

      renderTasksList();
      renderTaskDetailsLoading();

      if (open) {
        closeMenu();
        openDetailView();
      }

      try {
        const r = await fetch(`/api/tasks/${encodeURIComponent(id)}?scope=${encodeURIComponent(state.mode === "delegated" ? "delegated" : "mine")}`, { cache: "no-store" });
        if (!r.ok) throw new Error("Failed to load task details");
        const data = await r.json();
        renderTaskDetails(data);
      } catch (e) {
        console.error(e);
        renderTaskDetails(null);
        if (window.toast) window.toast.error("Failed to load task details");
      }
    }

    async function loadTasks(opts) {
      showListLoading(gridEl, "Loading tasks");

      // If the user changes filter/scope while an overlay is open, close it.
      if (tv2PointsOverlay && tv2PointsOverlay.hidden === false) {
        tv2ClosePointsModal();
      }
      if (tv2DelegatedOverlay && tv2DelegatedOverlay.hidden === false) {
        tv2CloseDelegatedModal();
      }

      // Always start from the list screen when reloading tasks
      closeDetailView();

      // Reset selection when changing scope
      state.selectedTaskId = "";
      state.selectedTaskUrl = "";
      renderTaskDetailsEmpty();

      try {
        const qs = new URLSearchParams();

        if (state.mode === "delegated") {
          qs.set("scope", "delegated");
        } else {
          qs.set("scope", "mine");
        }

        const url = qs.toString() ? `/api/tasks?${qs.toString()}` : "/api/tasks";
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error("Failed to load tasks");
        const data = await r.json();
        state.tasks = Array.isArray(data?.tasks) ? data.tasks : [];

        // Keep current day if requested (e.g. after creating a task)
        if (opts && opts.keepDay && state.selectedDay) {
          setSelectedDay(state.selectedDay, { noScroll: true });
        } else {
          state.selectedDay = pickInitialDayFromTasks(state.tasks);
          setSelectedDay(state.selectedDay, { noScroll: true });
        }

        renderTasksList();
      } catch (e) {
        console.error(e);
        showListError(gridEl, "Failed to load tasks");
      }
    }

    // --- Global UI bindings ---
    // (The view dropdown is wired inside wireListActions() because its DOM is dynamic.)
    bindGlobalKeydownOnce();

    // Month picker bindings
    if (monthBtn && monthPickerEl) {
      monthBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (isMonthPickerOpen()) closeMonthPicker();
        else openMonthPicker();
      });

      monthPickerEl.addEventListener("click", (e) => {
        const t = e.target;
        if (!t) return;
        const closeEl = t.closest && t.closest("[data-close]");
        if (closeEl) {
          e.preventDefault();
          closeMonthPicker();
        }
      });
    }

    if (yearPrevBtn) {
      yearPrevBtn.addEventListener("click", (e) => {
        e.preventDefault();
        monthPickerYear -= 1;
        renderMonthPicker();
      });
    }

    if (yearNextBtn) {
      yearNextBtn.addEventListener("click", (e) => {
        e.preventDefault();
        monthPickerYear += 1;
        renderMonthPicker();
      });
    }

    if (yearLabelBtn) {
      yearLabelBtn.addEventListener("click", (e) => {
        e.preventDefault();
        const val = window.prompt("Enter year", String(monthPickerYear));
        if (val === null) return;
        const n = Number(String(val).trim());
        if (!Number.isFinite(n)) return;
        const y = Math.round(n);
        if (y < 1970 || y > 2100) return;
        monthPickerYear = y;
        renderMonthPicker();
      });
    }

    if (detailCloseBtn) {
      detailCloseBtn.addEventListener("click", () => {
        closeDetailView();
      });
    }

    if (detailOpenNotionBtn) {
      detailOpenNotionBtn.disabled = true;
      detailOpenNotionBtn.addEventListener("click", () => {
        if (!state.selectedTaskUrl) return;
        window.open(state.selectedTaskUrl, "_blank", "noopener");
      });
    }

    // Init
    (async () => {
      await loadAccountPhoto();
      await loadUsers();
      restoreFilterFromStorage();
      restoreSortFromStorage();
      restoreStatusFromStorage();
      renderFilterMenu();
      closeMenu();
      closeSortMenu();
      renderTaskDetailsEmpty();
      await loadTasks();
    })();
  });
})();
