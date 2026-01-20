// public/js/tasks.js

document.addEventListener("DOMContentLoaded", () => {
  const grid = document.getElementById("tasksGrid");
  if (!grid) return;

  const searchInput = document.getElementById("tasksSearch");
  const scopeMineBtn = document.getElementById("scopeMineBtn");
  const scopeAllBtn = document.getElementById("scopeAllBtn");

  const addTaskBtn = document.getElementById("addTaskBtn");
  const modal = document.getElementById("taskModal");
  const form = document.getElementById("taskForm");
  const titleInput = document.getElementById("taskTitle");
  const prioritySelect = document.getElementById("taskPriority");
  const dueDateInput = document.getElementById("taskDueDate");
  const statusSelect = document.getElementById("taskStatus");
  const createBtn = document.getElementById("taskCreateBtn");

  const detailTitle = document.getElementById("taskDetailTitle");
  const detailBody = document.getElementById("taskDetailBody");
  const openNotionBtn = document.getElementById("taskDetailOpenNotion");

  let meta = null;
  let allTasks = [];
  let selectedTaskId = null;

  const STORAGE_SCOPE_KEY = "tasks.scope";
  let scope = (localStorage.getItem(STORAGE_SCOPE_KEY) || "mine").toLowerCase() === "all" ? "all" : "mine";

  const norm = (s) => String(s || "").toLowerCase().trim();

  const escapeHTML = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));

  function notionColorVars(notionColor) {
    const key = norm(String(notionColor || "default").replace(/_background$/i, ""));
    const map = {
      default: { bg: "#FFFFFF", fg: "#111827", bd: "#E5E7EB" },
      gray: { bg: "#F3F4F6", fg: "#374151", bd: "#E5E7EB" },
      brown: { bg: "#F3E8E2", fg: "#6B4F3A", bd: "#E7D3C8" },
      orange: { bg: "#FFEDD5", fg: "#9A3412", bd: "#FED7AA" },
      yellow: { bg: "#FEF3C7", fg: "#92400E", bd: "#FDE68A" },
      green: { bg: "#D1FAE5", fg: "#065F46", bd: "#A7F3D0" },
      blue: { bg: "#DBEAFE", fg: "#1D4ED8", bd: "#BFDBFE" },
      purple: { bg: "#EDE9FE", fg: "#6D28D9", bd: "#DDD6FE" },
      pink: { bg: "#FCE7F3", fg: "#BE185D", bd: "#FBCFE8" },
      red: { bg: "#FEE2E2", fg: "#B91C1C", bd: "#FECACA" },
    };
    return map[key] || map.default;
  }

  function fmtDate(d) {
    if (!d) return "";
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return String(d);
    return dt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
  }

  function setScope(next) {
    scope = next === "all" ? "all" : "mine";
    localStorage.setItem(STORAGE_SCOPE_KEY, scope);
    updateScopeUI();
    loadTasks();
  }

  function updateScopeUI() {
    const mineActive = scope !== "all";
    scopeMineBtn?.classList.toggle("btn--active", mineActive);
    scopeAllBtn?.classList.toggle("btn--active", !mineActive);

    // fallback if btn--active isn't defined globally
    if (mineActive) {
      scopeMineBtn?.style && (scopeMineBtn.style.borderColor = "#D97706");
      scopeAllBtn?.style && (scopeAllBtn.style.borderColor = "");
    } else {
      scopeAllBtn?.style && (scopeAllBtn.style.borderColor = "#D97706");
      scopeMineBtn?.style && (scopeMineBtn.style.borderColor = "");
    }
  }

  function showGridLoading(text = "Loading tasks") {
    grid.innerHTML = `
      <div class="modern-loading" role="status" aria-live="polite">
        <div class="modern-loading__spinner" aria-hidden="true"></div>
        <div class="modern-loading__text">
          ${escapeHTML(text)}
          <span class="modern-loading__dots" aria-hidden="true"><span></span><span></span><span></span></span>
        </div>
      </div>
    `;
  }

  function showGridEmpty(msg = "No tasks found") {
    grid.innerHTML = `<div class="empty-state muted" style="padding:14px;">${escapeHTML(msg)}</div>`;
  }

  function openModal() {
    if (!modal) return;
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    document.body.classList.add("co-modal-open");
    setTimeout(() => titleInput?.focus(), 50);
  }

  function closeModal() {
    if (!modal) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    document.body.classList.remove("co-modal-open");
    form?.reset();
  }

  function pillHTML(label, color) {
    if (!label) return "";
    const vars = notionColorVars(color);
    // Keep pill readable regardless of card background
    const style = `border-color:${vars.bd}; color:${vars.fg}; background: rgba(255,255,255,0.65);`;
    return `<span class="task-pill" style="${style}"><span class="dot" aria-hidden="true"></span>${escapeHTML(label)}</span>`;
  }

  function renderTasks() {
    const q = norm(searchInput?.value || "");
    const list = (allTasks || []).filter((t) => {
      if (!q) return true;
      return norm(t.title).includes(q) || norm(t.idText).includes(q);
    });

    if (!list.length) {
      showGridEmpty(q ? "No matching tasks" : "No tasks yet");
      return;
    }

    const frag = document.createDocumentFragment();

    list.forEach((t) => {
      const pri = t.priority || null;
      const priVars = notionColorVars(pri?.color);
      const status = t.status || null;

      const card = document.createElement("article");
      card.className = "task-card" + (t.id === selectedTaskId ? " selected" : "");
      card.style.setProperty("--task-bg", priVars.bg);
      card.style.setProperty("--task-bd", priVars.bd);
      card.style.setProperty("--task-accent", priVars.fg);

      const idText = t.idText || "";
      const due = t.dueDate ? fmtDate(t.dueDate) : "";
      const assignees = Array.isArray(t.assignees) && t.assignees.length ? t.assignees.join(", ") : "";

      card.innerHTML = `
        <div class="task-card__top">
          <div class="task-id">${escapeHTML(idText || "TASK")}</div>
          <div class="task-meta">
            ${status ? pillHTML(status.name, status.color) : ""}
          </div>
        </div>

        <div class="task-title">${escapeHTML(t.title || "Untitled")}</div>

        <div class="task-meta">
          ${pri ? pillHTML(pri.name, pri.color) : ""}
          ${due ? `<span class="task-pill"><i data-feather="calendar" aria-hidden="true"></i>${escapeHTML(due)}</span>` : ""}
          ${assignees ? `<span class="task-pill"><i data-feather="user" aria-hidden="true"></i>${escapeHTML(assignees)}</span>` : ""}
        </div>
      `;

      card.addEventListener("click", () => {
        selectTask(t.id);
      });

      frag.appendChild(card);
    });

    grid.innerHTML = "";
    grid.appendChild(frag);

    // icons inside cards
    if (window.feather) window.feather.replace();
  }

  function renderTaskDetails(task) {
    if (!task) {
      detailTitle.textContent = "Task details";
      openNotionBtn.style.display = "none";
      detailBody.innerHTML = `<p class="muted" style="margin:0;">Select a task from the left to see details.</p>`;
      return;
    }

    detailTitle.textContent = "Task details";
    if (task.url) {
      openNotionBtn.href = task.url;
      openNotionBtn.style.display = "";
    } else {
      openNotionBtn.style.display = "none";
    }

    const pri = task.priority || null;
    const status = task.status || null;
    const due = task.dueDate ? fmtDate(task.dueDate) : "";
    const createdBy = task.createdBy || "";
    const assignees = Array.isArray(task.assignees) && task.assignees.length ? task.assignees.join(", ") : "";
    const completion = typeof task.completion === "number" ? `${Math.round(task.completion)}%` : "";

    const rows = [
      pri ? { k: "Priority", v: pri.name } : null,
      status ? { k: "Status", v: status.name } : null,
      due ? { k: "Delivery Date", v: due } : null,
      completion ? { k: "Completion", v: completion } : null,
      createdBy ? { k: "Created By", v: createdBy } : null,
      assignees ? { k: "Assignees", v: assignees } : null,
      task.idText ? { k: "ID", v: task.idText } : null,
    ].filter(Boolean);

    const todoHTML = (() => {
      const todos = Array.isArray(task.todos) ? task.todos.filter((x) => x && (x.text || x.checked)) : [];
      if (!todos.length) return "";
      const items = todos
        .map((t) => {
          const done = !!t.checked;
          return `
            <div class="todo-item${done ? " done" : ""}">
              <input type="checkbox" ${done ? "checked" : ""} disabled />
              <div class="txt">${escapeHTML(t.text || "")}</div>
            </div>
          `;
        })
        .join("");
      return `
        <div>
          <div style="font-weight:900; margin-bottom:8px;">Checklist</div>
          <div class="todo-list">${items}</div>
        </div>
      `;
    })();

    detailBody.innerHTML = `
      <h3 class="task-detail-title">${escapeHTML(task.title || "Untitled")}</h3>

      <div class="detail-list">
        ${rows
          .map(
            (r) => `
          <div class="detail-row">
            <div class="k">${escapeHTML(r.k)}</div>
            <div class="v">${escapeHTML(r.v)}</div>
          </div>
        `,
          )
          .join("")}
      </div>

      ${todoHTML || ""}
    `;

    if (window.feather) window.feather.replace();
  }

  async function selectTask(id) {
    if (!id) return;
    selectedTaskId = id;

    // highlight in grid without re-fetching list
    renderTasks();

    // details loading
    detailBody.innerHTML = `
      <div class="modern-loading" role="status" aria-live="polite">
        <div class="modern-loading__spinner" aria-hidden="true"></div>
        <div class="modern-loading__text">
          Loading details
          <span class="modern-loading__dots" aria-hidden="true"><span></span><span></span><span></span></span>
        </div>
      </div>
    `;

    try {
      const resp = await fetch(`/api/tasks/${encodeURIComponent(id)}`, { cache: "no-store" });
      if (!resp.ok) throw new Error("Failed to load task details");
      const data = await resp.json();
      renderTaskDetails(data);
    } catch (e) {
      console.error(e);
      renderTaskDetails(null);
      if (window.toast) window.toast.error("Failed to load task details");
    }
  }

  async function loadMeta() {
    try {
      const resp = await fetch("/api/tasks/meta", { cache: "no-store" });
      if (!resp.ok) throw new Error("Failed to load tasks meta");
      meta = await resp.json();

      // Fill priority options
      const pri = Array.isArray(meta?.options?.priority) ? meta.options.priority : [];
      prioritySelect.innerHTML = `<option value="">—</option>` + pri.map((o) => `<option value="${escapeHTML(o.name)}">${escapeHTML(o.name)}</option>`).join("");

      // Fill status options
      const st = Array.isArray(meta?.options?.status) ? meta.options.status : [];
      statusSelect.innerHTML = `<option value="">—</option>` + st.map((o) => `<option value="${escapeHTML(o.name)}">${escapeHTML(o.name)}</option>`).join("");
    } catch (e) {
      console.error(e);
      // Keep basic fallback options
      prioritySelect.innerHTML = `<option value="">—</option><option>High</option><option>Medium</option><option>Low</option>`;
      statusSelect.innerHTML = `<option value="">—</option><option>Not started</option><option>In progress</option><option>Done</option>`;
    }
  }

  async function loadTasks() {
    showGridLoading("Loading tasks");
    renderTaskDetails(null);

    try {
      const resp = await fetch(`/api/tasks?scope=${encodeURIComponent(scope)}`, { cache: "no-store" });
      if (!resp.ok) throw new Error("Failed to load tasks");
      const data = await resp.json();
      allTasks = Array.isArray(data?.tasks) ? data.tasks : [];

      // Auto-select the first task
      if (!selectedTaskId && allTasks.length) selectedTaskId = allTasks[0].id;

      renderTasks();

      // if selected exists, load details
      if (selectedTaskId) selectTask(selectedTaskId);
    } catch (e) {
      console.error(e);
      showGridEmpty("Failed to load tasks");
      if (window.toast) window.toast.error("Failed to load tasks");
    }
  }

  async function createTask(payload) {
    const resp = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data?.error || "Failed to create task");
    return data;
  }

  // Events
  searchInput?.addEventListener("input", () => renderTasks());

  scopeMineBtn?.addEventListener("click", () => setScope("mine"));
  scopeAllBtn?.addEventListener("click", () => setScope("all"));

  addTaskBtn?.addEventListener("click", () => openModal());

  modal?.addEventListener("click", (e) => {
    const t = e.target;
    if (t && t.getAttribute && t.getAttribute("data-close") === "1") {
      closeModal();
    }
  });

  form?.addEventListener("submit", async (e) => {
    e.preventDefault();

    const title = String(titleInput?.value || "").trim();
    const priority = String(prioritySelect?.value || "").trim();
    const dueDate = String(dueDateInput?.value || "").trim();
    const status = String(statusSelect?.value || "").trim();

    if (!title) {
      titleInput?.focus();
      if (window.toast) window.toast.error("Please enter a task title");
      return;
    }

    try {
      createBtn.disabled = true;
      createBtn.style.opacity = "0.7";

      const created = await createTask({ title, priority, dueDate, status });

      closeModal();
      if (window.toast) window.toast.success("Task created");

      // Refresh list and select the created task
      selectedTaskId = created?.id || null;
      await loadTasks();

      if (created?.id) {
        await selectTask(created.id);
      }
    } catch (err) {
      console.error(err);
      if (window.toast) window.toast.error(err?.message || "Failed to create task");
    } finally {
      createBtn.disabled = false;
      createBtn.style.opacity = "";
    }
  });

  // Init
  updateScopeUI();
  loadMeta().finally(() => loadTasks());
});
