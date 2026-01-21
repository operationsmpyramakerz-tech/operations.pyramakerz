// public/js/tasks-v2.js
// Tasks (V2) UI wiring:
// - Calendar (week) built from Delivery Date (Notion "Delivery Date" -> API "dueDate")
// - Filter dropdown: All Tasks (same department), Mine tasks, and users in same department

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
    const daysEl = $("tasksV2Days");
    const monthLabelEl = $("tasksV2MonthLabel");
    const monthBtn = $("tasksV2MonthBtn");
    const gridEl = $("tasksGrid");

    const filterBtn = $("tasksV2FilterBtn");
    const filterMenu = $("tasksV2FilterMenu");

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

    let deptUsers = [];
    let meId = "";
    let usersById = new Map();

    let state = {
      // mode: 'all' | 'mine' | 'user'
      mode: "all",
      assigneeId: "",
      selectedDay: "",
      weekStart: null,
      weekAnimDir: "",
      tasks: [],
      selectedTaskId: "",
      selectedTaskUrl: "",
      // sort: 'priority' | 'delivery' | 'created'
      sortKey: "delivery",
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

    function currentFilterLabel() {
      if (state.mode === "mine") return "Mine tasks";
      if (state.mode === "user") {
        const name = usersById.get(state.assigneeId) || "User";
        return name;
      }
      return "All Tasks";
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

    function closeMenu() {
      if (!filterMenu || !filterBtn) return;
      filterMenu.hidden = true;
      filterBtn.setAttribute("aria-expanded", "false");
    }

    function openMenu() {
      if (!filterMenu || !filterBtn) return;
      closeSortMenu();
      filterMenu.hidden = false;
      filterBtn.setAttribute("aria-expanded", "true");
    }

    function toggleMenu() {
      if (!filterMenu) return;
      if (filterMenu.hidden) openMenu();
      else closeMenu();
    }

    function setFilter(mode, assigneeId) {
      state.mode = mode;
      state.assigneeId = assigneeId || "";

      // Persist
      try {
        const v = mode === "user" && state.assigneeId ? `user:${state.assigneeId}` : mode;
        localStorage.setItem(LS_FILTER, v);
      } catch {}

      renderFilterMenu();
      closeMenu();
      closeSortMenu();
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
      if (!filterMenu) return;

      const items = [];
      items.push({ key: "all", label: "All Tasks" });
      items.push({ key: "mine", label: "Mine tasks" });

      // Users in same department (excluding me)
      const others = (deptUsers || []).filter((u) => u?.id && u.id !== meId);
      if (others.length) {
        items.push({ sep: true });
        for (const u of others) {
          items.push({ key: `user:${u.id}`, label: u.name || "Unnamed" });
        }
      }

      const activeKey = state.mode === "user" ? `user:${state.assigneeId}` : state.mode;

      filterMenu.innerHTML = items
        .map((it) => {
          if (it.sep) return `<div class="tasks-v2-dropdown-sep" role="separator"></div>`;
          const active = it.key === activeKey ? "is-active" : "";
          return `
            <button class="tasks-v2-dropdown-item ${active}" type="button" role="menuitem" data-filter="${escapeHtml(it.key)}">
              <span>${escapeHtml(it.label)}</span>
            </button>
          `;
        })
        .join("");

      // Bind clicks
      filterMenu.querySelectorAll("[data-filter]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const key = String(btn.getAttribute("data-filter") || "");
          if (key === "all") return setFilter("all");
          if (key === "mine") return setFilter("mine");
          if (key.startsWith("user:")) return setFilter("user", key.slice(5));
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
      let v = "all";
      try {
        v = String(localStorage.getItem(LS_FILTER) || "all");
      } catch {}

      if (v === "mine") {
        state.mode = "mine";
        state.assigneeId = "";
        return;
      }

      if (v.startsWith("user:")) {
        const id = v.slice(5);
        const exists = deptUsers.some((u) => u?.id === id);
        if (exists) {
          state.mode = "user";
          state.assigneeId = id;
          return;
        }
      }

      state.mode = "all";
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
      const dueDays = Array.from(
        new Set(
          (tasks || [])
            .map((t) => isoDayFromAny(t?.dueDate))
            .filter(Boolean)
        )
      ).sort();

      let stored = "";
      try {
        stored = String(localStorage.getItem(LS_DAY) || "");
      } catch {}

      if (stored) {
        // keep stored even if no tasks that day (calendar navigation),
        // but prefer a day that exists in the current dataset.
        if (dueDays.includes(stored)) return stored;
      }

      const today = isoDayFromAny(new Date());
      if (dueDays.includes(today)) return today;
      if (dueDays.length) return dueDays[0];
      return stored || today;
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

      const dueSet = new Set(
        (state.tasks || [])
          .map((t) => isoDayFromAny(t?.dueDate))
          .filter(Boolean)
      );

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

      const tasks = Array.isArray(state.tasks) ? state.tasks : [];
      const visible = sortTasks(tasks);

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
        { key: "priority", label: "By Priority Level" },
        { key: "delivery", label: "By Delivery Date" },
        { key: "created", label: "By Created time" },
      ];

      const sortMenuHTML = sortItems
        .map((it) => {
          const active = it.key === state.sortKey ? "is-active" : "";
          return `
            <button class="tasks-v2-dropdown-item ${active}" type="button" role="menuitem" data-sort="${escapeHtml(it.key)}">
              <span>${escapeHtml(it.label)}</span>
            </button>
          `;
        })
        .join("");

      const actionsHTML = `
        <div class="tv2-actionsbar" aria-label="List actions">
          <button class="tv2-newtask-btn" type="button" id="tasksV2NewTaskBtn" aria-label="New task">
            <span class="tv2-newtask-plus">+</span>
            <span>New task</span>
          </button>

          <div class="tv2-sort-wrap">
            <button
              class="tv2-sort-btn"
              type="button"
              id="tasksV2SortBtn"
              aria-label="Sort"
              aria-haspopup="menu"
              aria-expanded="false"
            >
              <i data-feather="arrow-up-down"></i>
            </button>
            <div class="tasks-v2-dropdown" id="tasksV2SortMenu" role="menu" aria-label="Sort tasks" hidden>
              ${sortMenuHTML}
            </div>
          </div>
        </div>
      `;

      if (!visible.length) {
        gridEl.innerHTML = actionsHTML + `<div class="tv2-empty">No tasks</div>`;
        wireListActions();
        if (window.feather) window.feather.replace();
        return;
      }

      const cards = visible
        .map((t) => {
          const topBits = [];
          if (t?.status?.name) topBits.push(t.status.name);
          if (t?.priority?.name) topBits.push(t.priority.name);
          const top = topBits.join(" • ") || (t?.idText ? `ID: ${t.idText}` : "Task");

          const subBits = [];
          if (t?.createdBy) subBits.push(`Created by ${t.createdBy}`);
          const sub = subBits.join(" • ") || "";

          const completionNum = Number(t?.completion);
          const pct = Number.isFinite(completionNum) ? Math.min(100, Math.max(0, Math.round(completionNum))) : 0;
          const dueIso = isoDayFromAny(t?.dueDate);
          const dueLabel = formatDueLabel(dueIso);

          const tags = [];
          if (t?.priority?.name) tags.push(`<span class="tv2-tag">${escapeHtml(t.priority.name)}</span>`);
          if (t?.status?.name) tags.push(`<span class="tv2-tag">${escapeHtml(t.status.name)}</span>`);

          const avatars = renderAvatars(t?.assignees || [], { center: false, max: 3 });

          const selected = t.id === state.selectedTaskId ? " is-selected" : "";

          return `
            <article class="tv2-card${selected}" data-task-id="${escapeHtml(t.id)}" data-due-day="${escapeHtml(
            dueIso
          )}" aria-label="${escapeHtml(t.title || "Task")}">
              <div class="tv2-card__top">
                <div class="tv2-time">${escapeHtml(top)}</div>
                ${avatars}
              </div>

              <div class="tv2-card__title">${escapeHtml(t.title || "Untitled")}</div>
              <div class="tv2-card__sub">${escapeHtml(sub)}</div>

              <div class="tv2-progress-row" aria-label="Progress">
                <div class="tv2-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
                  <div class="tv2-progress__fill" style="width:${pct}%"></div>
                  <div class="tv2-progress__pct">${pct}%</div>
                </div>
                <div class="tv2-progress__due">${escapeHtml(dueLabel)}</div>
              </div>

              <div class="tv2-card__bottom">
                <div class="tv2-tags" aria-hidden="true">${tags.join("")}</div>
                <button class="tv2-circle tv2-circle--dark" type="button" aria-label="Open">
                  <i data-feather="arrow-up-right"></i>
                </button>
              </div>
            </article>
          `;
        })
        .join("");

      gridEl.innerHTML = actionsHTML + cards;

      wireListActions();

      // Bind card clicks
      gridEl.querySelectorAll("[data-task-id]").forEach((card) => {
        const id = card.getAttribute("data-task-id");
        if (!id) return;

        card.addEventListener("click", () => selectTask(id, { open: true }));

        // Arrow button: open Notion if available (or just select)
        const openBtn = card.querySelector("button.tv2-circle--dark");
        if (openBtn) {
          openBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const t = state.tasks.find((x) => x.id === id);
            if (t?.url) {
              window.open(t.url, "_blank", "noopener");
            } else {
              selectTask(id, { open: true });
            }
          });
        }
      });

      if (window.feather) window.feather.replace();
    }

    // List actions (New task + Sort) are re-rendered with the list, so we wire them after every render.
    async function createNewTask() {
      closeMenu();
      closeSortMenu();
      const title = window.prompt("Task title");
      if (title === null) return;
      const t = String(title || "").trim();
      if (!t) return;

      try {
        const payload = { title: t };
        // Default due date = currently selected day (helps the calendar UI)
        if (state.selectedDay) payload.dueDate = state.selectedDay;

        const r = await fetch("/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!r.ok) throw new Error("Failed to create task");
        const data = await r.json();
        if (window.toast) window.toast.success("Task created");

        await loadTasks({ keepDay: true });

        // Optional: auto-open the created task details
        if (data?.id) {
          try {
            await selectTask(String(data.id), { open: true });
          } catch {}
        }
      } catch (e) {
        console.error(e);
        if (window.toast) window.toast.error("Failed to create task");
      }
    }

    function wireListActions() {
      if (!gridEl) return;

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
        const r = await fetch(`/api/tasks/${encodeURIComponent(id)}`, { cache: "no-store" });
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

      // Always start from the list screen when reloading tasks
      closeDetailView();

      // Reset selection when changing scope
      state.selectedTaskId = "";
      state.selectedTaskUrl = "";
      renderTaskDetailsEmpty();

      try {
        const qs = new URLSearchParams();

        if (state.mode === "mine") {
          qs.set("scope", "mine");
        } else if (state.mode === "all") {
          qs.set("scope", "all");
        } else if (state.mode === "user" && state.assigneeId) {
          qs.set("scope", "all"); // still same dept, but server will use assignee
          qs.set("assignee", state.assigneeId);
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

    // --- UI bindings ---
    if (filterBtn && filterMenu) {
      filterMenu.hidden = true;

      filterBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleMenu();
      });

      document.addEventListener("click", (e) => {
        if (filterMenu.hidden) return;
        const t = e.target;
        if (t && (filterMenu.contains(t) || filterBtn.contains(t))) return;
        closeMenu();
      });

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          if (isMonthPickerOpen()) closeMonthPicker();
          else if (document.body.classList.contains("tv2-detail-open")) closeDetailView();
          else if (sortMenuEl && !sortMenuEl.hidden) closeSortMenu();
          else closeMenu();
          return;
        }

        // Keyboard day navigation
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          // avoid interfering with typing, if any input exists
          const ae = document.activeElement;
          if (ae && (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) return;

          const cur = parseIsoDayToLocalDate(state.selectedDay) || new Date();
          const next = e.key === "ArrowLeft" ? addDays(cur, -1) : addDays(cur, 1);
          setSelectedDay(next);
        }
      });
    }

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
      renderFilterMenu();
      closeMenu();
      closeSortMenu();
      renderTaskDetailsEmpty();
      await loadTasks();
    })();
  });
})();
