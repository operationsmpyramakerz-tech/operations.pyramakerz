// public/js/requested-orders.js
// Operations Orders (Schools orders requested) — requested list + tracking modal
document.addEventListener("DOMContentLoaded", () => {
  // ---------- DOM ----------
  const searchInput = document.getElementById("requestedSearch");
  const listDiv = document.getElementById("requested-list");
  const tabsWrap = document.getElementById("reqTabs");
  const pageMode = String(
    document.body?.dataset?.ordersView ||
    (window.location.pathname === "/orders/maintenance-orders" ? "maintenance" : "requested"),
  )
    .trim()
    .toLowerCase();
  const isMaintenancePage = pageMode === "maintenance";

  // Modal
  const orderModal = document.getElementById("reqOrderModal");
  const modalClose = document.getElementById("reqModalClose");
  const modalTitle = document.getElementById("reqModalTitle");
  const modalSub = document.getElementById("reqModalSub");

  // Meta (match Current Orders header)
  const modalReason = document.getElementById("reqModalReason");
  const modalDate = document.getElementById("reqModalDate");
  const modalComponents = document.getElementById("reqModalComponents");
  const modalTotalPrice = document.getElementById("reqModalTotalPrice");
  const modalReasonRow = modalReason?.closest?.(".co-meta-row") || null;
  const modalDateRow = modalDate?.closest?.(".co-meta-row") || null;
  const modalComponentsRow = modalComponents?.closest?.(".co-meta-row") || null;
  const modalTotalPriceRow = modalTotalPrice?.closest?.(".co-meta-row") || null;
  const modalReasonLabel = modalReasonRow?.querySelector?.("span") || null;

  // Extra header rows (shown in "Received" tab)
  const receiptRow = document.getElementById("reqReceiptRow");
  const receivedByRow = document.getElementById("reqReceivedByRow");
  const modalReceiptNumber = document.getElementById("reqModalReceiptNumber");
  const modalOperationsBy = document.getElementById("reqModalOperationsBy");

  const modalItems = document.getElementById("reqModalItems");

  // Actions (Download dropdown)
  const downloadMenuWrap = document.getElementById("reqDownloadMenuWrap");
  const downloadMenuBtn = document.getElementById("reqDownloadMenuBtn");
  const downloadMenuPanel = document.getElementById("reqDownloadMenuPanel");
  const excelBtn = document.getElementById("reqDownloadExcelBtn");
  const pdfBtn = document.getElementById("reqDownloadPdfBtn");

  const shippedBtn =
    document.getElementById("reqReceivedBtn") ||
    document.getElementById("reqMarkShippedBtn");
  const arrivedBtn =
    document.getElementById("reqReceivedShippedBtn") ||
    document.getElementById("reqMarkArrivedBtn");
  const createWithdrawalBtn = document.getElementById("reqCreateWithdrawalBtn");
  const logMaintenanceBtn = document.getElementById("reqLogMaintenanceBtn");
  const maintenancePdfBtn = document.getElementById("reqMaintenancePdfBtn");
  // Tracker steps
  const stepEls = {
    1: document.getElementById("reqStep1"),
    2: document.getElementById("reqStep2"),
    3: document.getElementById("reqStep3"),
    4: document.getElementById("reqStep4"),
    5: document.getElementById("reqStep5"),
  };
  const connEls = {
    1: document.getElementById("reqConn1"),
    2: document.getElementById("reqConn2"),
    3: document.getElementById("reqConn3"),
    4: document.getElementById("reqConn4"),
  };

  // Receipt sub-modal
  const receiptModal = document.getElementById("reqReceiptModal");
  const receiptCloseBtn = document.getElementById("reqReceiptClose");
  const receiptCancelBtn = document.getElementById("reqReceiptCancel");
  const receiptConfirmBtn = document.getElementById("reqReceiptConfirm");
  const receiptInputsWrap = document.getElementById("reqReceiptInputs");
  const addReceiptBtn = document.getElementById("reqAddReceiptBtn");
  const receiptInput = document.getElementById("reqReceiptInput");
  const receiptError = document.getElementById("reqReceiptError");

  // Request technical visit sub-modal
  const techVisitModal = document.getElementById("reqTechVisitModal");
  const techVisitCloseBtn = document.getElementById("reqTechVisitClose");
  const techVisitCancelBtn = document.getElementById("reqTechVisitCancel");
  const techVisitConfirmBtn = document.getElementById("reqTechVisitConfirm");
  const techVisitIssueInput = document.getElementById("reqTechVisitIssueInput");
  const techVisitError = document.getElementById("reqTechVisitError");

  // Log maintenance sub-modal
  const maintenanceLogModal = document.getElementById("reqMaintenanceLogModal");
  const maintenanceLogCloseBtn = document.getElementById("reqMaintenanceLogClose");
  const maintenanceLogCancelBtn = document.getElementById("reqMaintenanceLogCancel");
  const maintenanceLogConfirmBtn = document.getElementById("reqMaintenanceLogConfirm");
  const maintenanceResolutionSelect = document.getElementById("reqMaintenanceResolutionSelect");
  const maintenanceActualIssueInput = document.getElementById("reqMaintenanceActualIssueInput");
  const maintenanceRepairActionInput = document.getElementById("reqMaintenanceRepairActionInput");
  const maintenanceSparePartSelect = document.getElementById("reqMaintenanceSparePartSelect");
  const maintenanceLogError = document.getElementById("reqMaintenanceLogError");

  // Maintenance receipt sub-modal
  const maintenanceReceiptModal = document.getElementById("reqMaintenanceReceiptModal");
  const maintenanceReceiptCloseBtn = document.getElementById("reqMaintenanceReceiptClose");
  const maintenanceReceiptCancelBtn = document.getElementById("reqMaintenanceReceiptCancel");
  const maintenanceReceiptConfirmBtn = document.getElementById("reqMaintenanceReceiptConfirm");
  const maintenanceReceiptTitle = document.getElementById("reqMaintenanceReceiptTitle");
  const maintenanceReceiptSub = document.getElementById("reqMaintenanceReceiptSub");
  const maintenanceReceiptLabel = document.getElementById("reqMaintenanceReceiptLabel");
  const maintenanceReceiptInput = document.getElementById("reqMaintenanceReceiptInput");
  const maintenanceReceiptChooseBtn = document.getElementById("reqMaintenanceReceiptChooseBtn");
  const maintenanceReceiptName = document.getElementById("reqMaintenanceReceiptName");
  const maintenanceReceiptMeta = document.getElementById("reqMaintenanceReceiptMeta");
  const maintenanceReceiptNumbersField = document.getElementById("reqMaintenanceReceiptNumbersField");
  const maintenanceReceiptNumbersWrap = document.getElementById("reqMaintenanceReceiptNumbers");
  const maintenanceReceiptNumberInput = document.getElementById("reqMaintenanceReceiptNumberInput");
  const maintenanceAddReceiptBtn = document.getElementById("reqMaintenanceAddReceiptBtn");
  const maintenanceReceiptError = document.getElementById("reqMaintenanceReceiptError");

  // ---------- Utils ----------
  const norm = (s) => String(s || "").trim().toLowerCase();
  const RECEIPT_INPUT_SELECTOR = ".req-receipt-input";

  function createSubmodalInputRow(input, { removable = false, kind = "receipt" } = {}) {
    const row = document.createElement("div");
    row.className = "co-submodal-input-row";
    row.appendChild(input);

    if (removable) {
      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "co-submodal-input-remove";
      removeBtn.setAttribute("data-remove-input", kind);
      removeBtn.setAttribute("aria-label", "Remove extra store receipt number");
      removeBtn.textContent = "×";
      row.appendChild(removeBtn);
    }

    return row;
  }

  function getReceiptInputs() {
    return Array.from(receiptInputsWrap?.querySelectorAll(RECEIPT_INPUT_SELECTOR) || []).filter(Boolean);
  }

  function syncReceiptInputMeta() {
    getReceiptInputs().forEach((input, idx) => {
      input.id = idx === 0 ? "reqReceiptInput" : `reqReceiptInput${idx + 1}`;
      input.setAttribute(
        "aria-label",
        idx === 0 ? "Store Receipt Number" : `Store Receipt Number ${idx + 1}`,
      );
    });
  }

  function createReceiptInput(value = "") {
    const input = document.createElement("input");
    input.className = "co-submodal-input req-receipt-input";
    input.type = "text";
    input.inputMode = "numeric";
    input.pattern = "[0-9]*";
    input.autocomplete = "off";
    input.placeholder = "e.g. 12345";
    input.value = String(value || "");
    return input;
  }

  function resetReceiptInputs(values = [""]) {
    if (!receiptInputsWrap) return;

    const nextValues = Array.isArray(values) && values.length ? values : [""];
    receiptInputsWrap.innerHTML = "";

    nextValues.forEach((value, idx) => {
      const input = idx === 0 && receiptInput ? receiptInput : createReceiptInput();
      input.value = String(value || "");
      const row = createSubmodalInputRow(input, {
        removable: idx > 0,
        kind: "receipt",
      });
      receiptInputsWrap.appendChild(row);
    });

    syncReceiptInputMeta();
  }

  function addReceiptInput(value = "", { focus = true } = {}) {
    if (!receiptInputsWrap) return null;

    const input = createReceiptInput(value);
    const row = createSubmodalInputRow(input, {
      removable: true,
      kind: "receipt",
    });
    receiptInputsWrap.appendChild(row);
    syncReceiptInputMeta();

    if (focus) {
      window.requestAnimationFrame(() => {
        try {
          input.focus();
          input.select();
        } catch {}
      });
    }

    return input;
  }

  function normalizeReceiptNumbers(receiptNumbers) {
    const source = Array.isArray(receiptNumbers) ? receiptNumbers : [receiptNumbers];
    const seen = new Set();
    const values = [];

    source.forEach((entry) => {
      String(entry ?? "")
        .replace(/\r\n/g, "\n")
        .split(/[\n,]+/)
        .map((x) => x.trim())
        .filter(Boolean)
        .forEach((value) => {
          if (seen.has(value)) return;
          seen.add(value);
          values.push(value);
        });
    });

    return values;
  }

  function collectReceiptNumbers() {
    const values = getReceiptInputs()
      .map((input) => String(input?.value || "").trim())
      .filter(Boolean);

    if (!values.length) {
      return { error: "Store receipt number is required.", values: [] };
    }

    if (values.some((value) => !/^\d+$/.test(value))) {
      return { error: "Please enter valid store receipt numbers.", values: [] };
    }

    return { error: "", values: normalizeReceiptNumbers(values) };
  }

  const DELIVERY_RECEIPT_INPUT_SELECTOR = ".req-delivery-receipt-input";

  function getDeliveryReceiptInputs() {
    if (!maintenanceReceiptNumbersWrap) return [];
    return Array.from(maintenanceReceiptNumbersWrap.querySelectorAll(DELIVERY_RECEIPT_INPUT_SELECTOR));
  }

  function syncDeliveryReceiptInputMeta() {
    getDeliveryReceiptInputs().forEach((input, idx) => {
      input.id = idx === 0 ? "reqMaintenanceReceiptNumberInput" : `reqMaintenanceReceiptNumberInput${idx + 1}`;
      input.setAttribute(
        "aria-label",
        idx === 0 ? "Store Receipt Number" : `Store Receipt Number ${idx + 1}`,
      );
    });
  }

  function createDeliveryReceiptInput(value = "") {
    const input = document.createElement("input");
    input.className = "co-submodal-input req-delivery-receipt-input";
    input.type = "text";
    input.inputMode = "numeric";
    input.pattern = "[0-9]*";
    input.autocomplete = "off";
    input.placeholder = "e.g. 12345";
    input.value = String(value || "");
    return input;
  }

  function resetDeliveryReceiptInputs(values = [""]) {
    if (!maintenanceReceiptNumbersWrap) return;

    const nextValues = Array.isArray(values) && values.length ? values : [""];
    maintenanceReceiptNumbersWrap.innerHTML = "";

    nextValues.forEach((value, idx) => {
      const input = idx === 0 && maintenanceReceiptNumberInput
        ? maintenanceReceiptNumberInput
        : createDeliveryReceiptInput();
      input.value = String(value || "");
      const row = createSubmodalInputRow(input, {
        removable: idx > 0,
        kind: "delivery-receipt",
      });
      maintenanceReceiptNumbersWrap.appendChild(row);
    });

    syncDeliveryReceiptInputMeta();
  }

  function addDeliveryReceiptInput(value = "", { focus = true } = {}) {
    if (!maintenanceReceiptNumbersWrap) return null;

    const input = createDeliveryReceiptInput(value);
    const row = createSubmodalInputRow(input, {
      removable: true,
      kind: "delivery-receipt",
    });
    maintenanceReceiptNumbersWrap.appendChild(row);
    syncDeliveryReceiptInputMeta();

    if (focus) {
      window.requestAnimationFrame(() => {
        try {
          input.focus();
          input.select();
        } catch {}
      });
    }

    return input;
  }

  function collectDeliveryReceiptNumbers() {
    const values = getDeliveryReceiptInputs()
      .map((input) => String(input?.value || "").trim())
      .filter(Boolean);

    if (!values.length) {
      return { error: "Store receipt number is required.", values: [] };
    }

    if (values.some((value) => !/^\d+$/.test(value))) {
      return { error: "Please enter valid store receipt numbers.", values: [] };
    }

    return { error: "", values: normalizeReceiptNumbers(values) };
  }

  function removeExtraReceiptInput(removeBtn, { kind = "receipt" } = {}) {
    const row = removeBtn?.closest?.(".co-submodal-input-row");
    if (!row) return;

    const wrap = kind === "delivery-receipt" ? maintenanceReceiptNumbersWrap : receiptInputsWrap;
    const selector = kind === "delivery-receipt" ? DELIVERY_RECEIPT_INPUT_SELECTOR : RECEIPT_INPUT_SELECTOR;
    const syncMeta = kind === "delivery-receipt" ? syncDeliveryReceiptInputMeta : syncReceiptInputMeta;
    if (!wrap) return;

    const inputRows = Array.from(wrap.querySelectorAll(".co-submodal-input-row"));
    if (inputRows.length <= 1) return;

    const currentIndex = inputRows.indexOf(row);
    row.remove();
    syncMeta();

    window.requestAnimationFrame(() => {
      const nextInputs = Array.from(wrap.querySelectorAll(selector)).filter(Boolean);
      const nextTarget = nextInputs[Math.min(currentIndex, Math.max(nextInputs.length - 1, 0))];
      try {
        nextTarget?.focus();
        nextTarget?.select?.();
      } catch {}
    });
  }

  function setTechVisitError(message) {
    if (!techVisitError) return;
    techVisitError.textContent = String(message || "");
  }

  function isTechVisitOpen() {
    return !!techVisitModal && techVisitModal.classList.contains("is-open");
  }

  function setMaintenanceLogError(message) {
    if (!maintenanceLogError) return;
    maintenanceLogError.textContent = String(message || "");
  }

  function isMaintenanceLogOpen() {
    return !!maintenanceLogModal && maintenanceLogModal.classList.contains("is-open");
  }

  function setMaintenanceReceiptError(message) {
    if (!maintenanceReceiptError) return;
    maintenanceReceiptError.textContent = String(message || "");
  }

  function isMaintenanceReceiptOpen() {
    return !!maintenanceReceiptModal && maintenanceReceiptModal.classList.contains("is-open");
  }

  function getPrimaryMaintenanceItem(group = activeGroup) {
    const items = Array.isArray(group?.items) ? group.items : [];
    return items[0] || null;
  }

  function getCurrentIssueDescription(group = activeGroup) {
    const item = getPrimaryMaintenanceItem(group);
    return String(item?.issueDescription || item?.reason || modalReason?.textContent || "").trim();
  }

  function toStringArray(value, { splitComma = false } = {}) {
    const out = [];
    const seen = new Set();

    const push = (entry) => {
      if (entry === null || entry === undefined) return;
      const raw = String(entry).trim();
      if (!raw) return;
      if (splitComma && raw.includes(",")) {
        raw.split(",").forEach((part) => push(part));
        return;
      }
      if (seen.has(raw)) return;
      seen.add(raw);
      out.push(raw);
    };

    if (Array.isArray(value)) value.forEach((entry) => push(entry));
    else if (value instanceof Set) Array.from(value).forEach((entry) => push(entry));
    else if (value !== undefined) push(value);

    return out;
  }

  function getSelectSelectedValues(selectEl) {
    if (!selectEl) return [];
    if (selectEl.multiple) {
      return Array.from(selectEl.options || [])
        .filter((opt) => opt.selected && String(opt.value || "").trim())
        .map((opt) => String(opt.value || "").trim());
    }
    const value = String(selectEl.value || "").trim();
    return value ? [value] : [];
  }

  function getSelectSelectedLabels(selectEl) {
    if (!selectEl) return [];
    if (selectEl.multiple) {
      return Array.from(selectEl.selectedOptions || [])
        .map((opt) => String(opt.textContent || "").trim())
        .filter(Boolean);
    }

    const option = selectEl.selectedOptions?.[0] || null;
    const label = String(option?.textContent || "").trim();
    return label ? [label] : [];
  }

  function setSelectValues(selectEl, values) {
    if (!selectEl) return;
    const nextValues = new Set(toStringArray(values));
    const options = Array.from(selectEl.options || []);

    if (selectEl.multiple) {
      options.forEach((opt) => {
        opt.selected = nextValues.has(String(opt.value || "").trim());
      });
      selectEl.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }

    const nextValue = toStringArray(values)[0] || "";
    selectEl.value = nextValue;
    selectEl.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function fillSelectOptions(selectEl, options, {
    placeholder = "Select an option",
    allowEmpty = !selectEl?.multiple,
    selectedValue = "",
    selectedValues = null,
  } = {}) {
    if (!selectEl) return;

    const items = Array.isArray(options) ? options : [];
    const isMultiple = !!selectEl.multiple;
    const currentValues = toStringArray(
      isMultiple ? (selectedValues ?? selectedValue) : selectedValue,
      { splitComma: isMultiple },
    );
    const selectedSet = new Set(currentValues);
    const frag = document.createDocumentFragment();
    const optionValues = new Set();

    if (!isMultiple && allowEmpty) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = placeholder;
      frag.appendChild(opt);
      optionValues.add("");
    }

    items.forEach((item) => {
      const value = String(item?.value ?? item?.id ?? item?.name ?? "").trim();
      const label = String(item?.label ?? item?.name ?? value).trim();
      if (!value || !label) return;

      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = label;
      if (selectedSet.has(value)) opt.selected = true;
      frag.appendChild(opt);
      optionValues.add(value);
    });

    currentValues.forEach((value) => {
      if (!value || optionValues.has(value)) return;
      const opt = document.createElement("option");
      opt.value = value;
      opt.textContent = value;
      opt.selected = true;
      frag.appendChild(opt);
      optionValues.add(value);
    });

    selectEl.innerHTML = "";
    selectEl.appendChild(frag);

    if (isMultiple) {
      Array.from(selectEl.options || []).forEach((opt) => {
        opt.selected = selectedSet.has(String(opt.value || "").trim());
      });
    } else {
      selectEl.value = currentValues[0] || "";
    }

    refreshModernSelect(selectEl);
  }

  function humanFileSize(bytes) {
    const size = Number(bytes) || 0;
    if (size <= 0) return "";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error("Failed to read file."));
        reader.readAsDataURL(file);
      } catch (e) {
        reject(e);
      }
    });
  }

  const modernSelectState = new WeakMap();
  let openModernSelect = null;

  function closeModernSelect(selectEl) {
    const state = modernSelectState.get(selectEl);
    if (!state) return;
    state.panel.hidden = true;
    state.panel.style.maxHeight = "";
    if (state.optionsList) state.optionsList.style.maxHeight = "";
    state.wrap.classList.remove("is-open", "is-dropup");
    state.trigger.setAttribute("aria-expanded", "false");
    if (state.searchInput) state.searchInput.value = "";
    applyModernSelectFilter(selectEl);
    if (openModernSelect === selectEl) openModernSelect = null;
  }

  function updateModernSelectPlacement(selectEl) {
    const state = modernSelectState.get(selectEl);
    if (!state || state.panel.hidden) return;

    const triggerRect = state.trigger.getBoundingClientRect();
    const gap = 10;
    const viewportPadding = 16;
    const rawSpaceBelow = window.innerHeight - triggerRect.bottom - viewportPadding - gap;
    const rawSpaceAbove = triggerRect.top - viewportPadding - gap;
    const spaceBelow = Math.max(0, rawSpaceBelow);
    const spaceAbove = Math.max(0, rawSpaceAbove);
    const desiredHeight = Math.min(state.panel.scrollHeight || 0, 360);
    const shouldDropUp = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
    const availableSpace = shouldDropUp ? spaceAbove : spaceBelow;
    const fallbackHeight = Math.min(Math.max(desiredHeight || 0, 220), 360);
    const maxHeight = Math.max(140, Math.min(360, availableSpace || fallbackHeight));
    const searchHeight = state.searchWrap && !state.searchWrap.hidden
      ? Math.max(0, state.searchWrap.offsetHeight)
      : 0;
    const listMaxHeight = Math.max(88, maxHeight - searchHeight - 18);

    state.wrap.classList.toggle("is-dropup", shouldDropUp);
    state.panel.style.maxHeight = `${maxHeight}px`;
    if (state.optionsList) state.optionsList.style.maxHeight = `${listMaxHeight}px`;
  }

  function getModernSelectPlaceholder(selectEl) {
    return (
      String(selectEl?.dataset?.placeholder || "").trim() ||
      String(selectEl?.options?.[0]?.textContent || "Select an option").trim() ||
      "Select an option"
    );
  }

  function getModernSelectTriggerLabel(selectEl, selectedOptions, placeholder) {
    const picked = Array.isArray(selectedOptions) ? selectedOptions : [];
    if (!selectEl?.multiple) return picked[0]?.label || placeholder;
    if (!picked.length) return placeholder;
    if (picked.length === 1) return picked[0].label || placeholder;
    if (picked.length === 2) {
      return `${picked[0].label || placeholder}, ${picked[1].label || placeholder}`;
    }
    return `${picked[0].label || placeholder}, ${picked[1].label || placeholder} +${picked.length - 2}`;
  }

  function applyModernSelectFilter(selectEl) {
    const state = modernSelectState.get(selectEl);
    if (!state) return;

    const query = norm(state.searchInput?.value || "");
    let visibleCount = 0;

    Array.from(state.optionsList?.children || []).forEach((btn) => {
      const label = String(btn.dataset.label || btn.textContent || "").trim();
      const isClear = btn.dataset.clear === "true";
      const visible = !query || (!isClear && norm(label).includes(query)) || (isClear && !query);
      btn.hidden = !visible;
      if (visible) visibleCount += 1;
    });

    if (state.empty) {
      state.empty.classList.toggle("is-visible", visibleCount === 0);
    }

    if (openModernSelect === selectEl) updateModernSelectPlacement(selectEl);
  }

  function refreshModernSelect(selectEl) {
    if (!selectEl) return;
    const state = ensureModernSelect(selectEl);
    if (!state) return;

    const placeholder = getModernSelectPlaceholder(selectEl);
    const isMultiple = !!selectEl.multiple;
    const searchable = String(selectEl.dataset.searchable || "").trim().toLowerCase() === "true";
    const allowClear = isMultiple;

    const options = Array.from(selectEl.options || [])
      .map((opt) => ({
        value: String(opt.value || "").trim(),
        label: String(opt.textContent || "").trim() || placeholder,
        disabled: !!opt.disabled,
        selected: !!opt.selected,
      }))
      .filter((opt) => !(isMultiple && !opt.value));

    const selectedOptions = isMultiple
      ? options.filter((opt) => opt.selected)
      : options.filter((opt) => opt.value === String(selectEl.value || "").trim()).slice(0, 1);

    state.value.textContent = getModernSelectTriggerLabel(selectEl, selectedOptions, placeholder);
    state.trigger.disabled = !!selectEl.disabled;
    state.wrap.classList.toggle("is-disabled", !!selectEl.disabled);
    state.searchWrap.hidden = !searchable;
    if (!searchable && state.searchInput) state.searchInput.value = "";
    if (state.searchInput) {
      state.searchInput.placeholder = String(selectEl.dataset.searchPlaceholder || "Search options").trim() || "Search options";
    }

    state.optionsList.innerHTML = "";

    if (allowClear) {
      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "co-modern-select__option";
      if (!selectedOptions.length) clearBtn.classList.add("is-selected");
      clearBtn.dataset.clear = "true";
      clearBtn.dataset.label = placeholder;
      clearBtn.innerHTML = `
        <span class="co-modern-select__option-label">${escapeHTML(placeholder)}</span>
        <span class="co-modern-select__check" aria-hidden="true"></span>
      `;
      state.optionsList.appendChild(clearBtn);
    }

    options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "co-modern-select__option";
      if (opt.selected) btn.classList.add("is-selected");
      btn.dataset.value = opt.value;
      btn.dataset.label = opt.label;
      btn.disabled = !!opt.disabled;
      btn.innerHTML = `
        <span class="co-modern-select__option-label">${escapeHTML(opt.label || placeholder)}</span>
        <span class="co-modern-select__check" aria-hidden="true"></span>
      `;
      state.optionsList.appendChild(btn);
    });

    applyModernSelectFilter(selectEl);
    if (window.feather) window.feather.replace();
  }

  function ensureModernSelect(selectEl) {
    if (!selectEl) return null;
    if (modernSelectState.has(selectEl)) return modernSelectState.get(selectEl);

    const parent = selectEl.parentNode;
    if (!parent) return null;

    const wrap = document.createElement("div");
    wrap.className = "co-modern-select";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "co-modern-select__trigger";
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    trigger.innerHTML = `
      <span class="co-modern-select__value"></span>
      <span class="co-modern-select__icon" aria-hidden="true"><i data-feather="chevron-down"></i></span>
    `;

    const panel = document.createElement("div");
    panel.className = "co-modern-select__panel";
    panel.hidden = true;
    panel.setAttribute("role", "listbox");

    const searchWrap = document.createElement("div");
    searchWrap.className = "co-modern-select__search-wrap";
    searchWrap.hidden = true;

    const searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.className = "co-modern-select__search";
    searchInput.autocomplete = "off";
    searchInput.spellcheck = false;
    searchWrap.appendChild(searchInput);

    const optionsList = document.createElement("div");
    optionsList.className = "co-modern-select__options";

    const empty = document.createElement("div");
    empty.className = "co-modern-select__empty";
    empty.textContent = "No matching results";

    panel.appendChild(searchWrap);
    panel.appendChild(optionsList);
    panel.appendChild(empty);

    parent.insertBefore(wrap, selectEl);
    wrap.appendChild(selectEl);
    wrap.appendChild(trigger);
    wrap.appendChild(panel);
    selectEl.classList.add("co-submodal-select--native");
    selectEl.setAttribute("tabindex", "-1");

    const state = {
      wrap,
      trigger,
      panel,
      value: trigger.querySelector(".co-modern-select__value"),
      searchWrap,
      searchInput,
      optionsList,
      empty,
    };

    trigger.addEventListener("click", (e) => {
      e.preventDefault();
      if (selectEl.disabled) return;

      const willOpen = panel.hidden;
      if (openModernSelect && openModernSelect !== selectEl) closeModernSelect(openModernSelect);

      panel.hidden = !willOpen;
      wrap.classList.toggle("is-open", willOpen);
      trigger.setAttribute("aria-expanded", willOpen ? "true" : "false");
      openModernSelect = willOpen ? selectEl : null;

      if (willOpen) {
        if (state.searchInput) state.searchInput.value = "";
        applyModernSelectFilter(selectEl);
        window.requestAnimationFrame(() => {
          updateModernSelectPlacement(selectEl);
          try {
            state.optionsList.scrollTop = 0;
          } catch {}
          try {
            if (!state.searchWrap.hidden) state.searchInput.focus();
          } catch {}
        });
      }
    });

    panel.addEventListener("click", (e) => {
      const btn = e.target.closest(".co-modern-select__option");
      if (!btn || btn.disabled) return;

      if (selectEl.multiple) {
        if (btn.dataset.clear === "true") {
          Array.from(selectEl.options || []).forEach((opt) => {
            opt.selected = false;
          });
        } else {
          const nextValue = String(btn.dataset.value || "").trim();
          Array.from(selectEl.options || []).forEach((opt) => {
            if (String(opt.value || "").trim() === nextValue) opt.selected = !opt.selected;
          });
        }
        selectEl.dispatchEvent(new Event("change", { bubbles: true }));
        window.requestAnimationFrame(() => {
          try {
            if (!state.searchWrap.hidden) state.searchInput.focus();
          } catch {}
        });
        return;
      }

      const nextValue = String(btn.dataset.value || "");
      if (String(selectEl.value || "") !== nextValue) {
        selectEl.value = nextValue;
        selectEl.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        refreshModernSelect(selectEl);
      }
      closeModernSelect(selectEl);
      try {
        trigger.focus();
      } catch {}
    });

    searchInput.addEventListener("input", () => applyModernSelectFilter(selectEl));
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeModernSelect(selectEl);
        try {
          trigger.focus();
        } catch {}
      }
    });

    selectEl.addEventListener("change", () => refreshModernSelect(selectEl));

    document.addEventListener("click", (e) => {
      if (!wrap.contains(e.target)) closeModernSelect(selectEl);
    });

    window.addEventListener("resize", () => {
      if (openModernSelect === selectEl) updateModernSelectPlacement(selectEl);
    });

    document.addEventListener(
      "scroll",
      () => {
        if (openModernSelect === selectEl) updateModernSelectPlacement(selectEl);
      },
      true,
    );

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && openModernSelect === selectEl) closeModernSelect(selectEl);
    });

    modernSelectState.set(selectEl, state);
    refreshModernSelect(selectEl);
    return state;
  }

  function setSelectLoading(selectEl, loadingLabel) {
    if (!selectEl) return;
    fillSelectOptions(selectEl, [], {
      placeholder: loadingLabel || selectEl.dataset.placeholder || "Loading...",
      allowEmpty: !selectEl.multiple,
      selectedValues: [],
    });
    selectEl.disabled = true;
    refreshModernSelect(selectEl);
  }

  let maintenanceOptionsCache = null;
  let maintenanceOptionsPromise = null;

  async function loadMaintenanceFormOptions(force = false) {
    if (!force && maintenanceOptionsCache) return maintenanceOptionsCache;
    if (!force && maintenanceOptionsPromise) return maintenanceOptionsPromise;

    maintenanceOptionsPromise = (async () => {
      const res = await fetch("/api/orders/requested/maintenance-form-options", {
        credentials: "same-origin",
        cache: "no-store",
      });

      if (res.status === 401) {
        window.location.href = "/login";
        throw new Error("Unauthorized");
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || "Failed to load maintenance form options.");
      }

      maintenanceOptionsCache = {
        resolutionMethods: Array.isArray(data?.resolutionMethods) ? data.resolutionMethods : [],
        spareParts: Array.isArray(data?.spareParts) ? data.spareParts : [],
      };

      return maintenanceOptionsCache;
    })();

    try {
      return await maintenanceOptionsPromise;
    } finally {
      maintenanceOptionsPromise = null;
    }
  }


  // ---------- Page cache (speed) ----------
  // Cache the requested orders list in sessionStorage to avoid re-fetching / re-rendering
  // on quick navigation. This speeds up Operations Orders noticeably on Vercel cold starts.
  const REQ_CACHE_KEY = "cache:ops:requestedOrders:v3";
  const REQ_CACHE_TTL_MS = 45 * 1000; // 45s (server cache is 60s)

  function readRequestedCache() {
    try {
      const raw = sessionStorage.getItem(REQ_CACHE_KEY);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      if (!obj || !Array.isArray(obj.data)) return null;
      const age = Date.now() - (Number(obj.ts) || 0);
      return { data: obj.data, stale: age > REQ_CACHE_TTL_MS };
    } catch {
      return null;
    }
  }

  function writeRequestedCache(data) {
    try {
      sessionStorage.setItem(REQ_CACHE_KEY, JSON.stringify({ ts: Date.now(), data: data || [] }));
    } catch {}
  }

  function clearRequestedCache() {
    try {
      sessionStorage.removeItem(REQ_CACHE_KEY);
    } catch {}
  }

  const escapeHTML = (str) =>
    String(str || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));

  ensureModernSelect(maintenanceResolutionSelect);
  ensureModernSelect(maintenanceSparePartSelect);

  // Only allow http/https URLs to be opened from the UI
  function safeHttpUrl(url) {
    try {
      const raw = String(url || "").trim();
      if (!raw) return null;
      const u = new URL(raw, window.location.origin);
      if (u.protocol !== "http:" && u.protocol !== "https:") return null;
      return u.toString();
    } catch {
      return null;
    }
  }

  // Map Notion select/status colors to a pill background/foreground close to Notion labels
  function notionColorVars(notionColor) {
    const key = norm(String(notionColor || "default").replace(/_background$/i, ""));
    const map = {
      default: { bg: "#E5E7EB", fg: "#374151", bd: "#D1D5DB" },
      gray: { bg: "#E5E7EB", fg: "#374151", bd: "#D1D5DB" },
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

  function orderTypeMeta(type, notionColor) {
    const key = String(type || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
    if (key === "requestproducts") {
      return { label: "Request Products", icon: "shopping-cart", bg: "#DCFCE7", fg: "#166534", bd: "#86EFAC" };
    }
    if (key === "withdrawproducts") {
      return { label: "Withdraw Products", icon: "log-out", bg: "#FEE2E2", fg: "#B91C1C", bd: "#FECACA" };
    }
    if (key === "requestmaintenance") {
      return { label: "Request Maintenance", icon: "tool", bg: "#FEF3C7", fg: "#92400E", bd: "#FDE68A" };
    }
    const fallback = notionColorVars(notionColor);
    return {
      label: String(type || "").trim() || "Order",
      icon: "package",
      bg: fallback.bg,
      fg: fallback.fg,
      bd: fallback.bd,
    };
  }

  function orderTypeThumbMarkup(type, notionColor) {
    const meta = orderTypeMeta(type, notionColor);
    const style = `--co-thumb-bg:${meta.bg};--co-thumb-fg:${meta.fg};--co-thumb-border:${meta.bd};`;
    return `<div class="co-thumb co-thumb--order-type" style="${style}" title="${escapeHTML(meta.label)}" aria-label="${escapeHTML(meta.label)}"><i data-feather="${meta.icon}"></i></div>`;
  }

  function orderTypeSubtitle(type, notionColor, fallback = '—') {
    const meta = orderTypeMeta(type, notionColor);
    return meta.label && meta.label !== 'Order' ? meta.label : fallback;
  }

  const moneyFmt = (() => {
    try {
      return new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" });
    } catch {
      return null;
    }
  })();

  function fmtMoney(value) {
    const n = Number(value);
    const safe = Number.isFinite(n) ? n : 0;
    if (moneyFmt) return moneyFmt.format(safe);
    return `£${safe.toFixed(2)}`;
  }

  // Quantity helpers
  // - Must support fractions (e.g. 0.5)
  // - Avoid floating point artifacts in UI (e.g. 0.30000000000004)
  const QTY_DECIMALS = 6;
  function roundQty(n, decimals = QTY_DECIMALS) {
    const v = Number(n);
    if (!Number.isFinite(v)) return 0;
    const p = 10 ** decimals;
    return Math.round(v * p) / p;
  }

  function fmtQty(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "0";
    const r = roundQty(n);
    // Keep integers clean
    if (Number.isInteger(r)) return String(r);
    // Show up to QTY_DECIMALS decimals, trimming trailing zeros
    return r
      .toFixed(QTY_DECIMALS)
      .replace(/\.0+$/, "")
      .replace(/(\.[0-9]*?)0+$/, "$1");
  }

  function compareItemsByProductName(a, b) {
    return String(a?.productName || "").localeCompare(String(b?.productName || ""), undefined, {
      sensitivity: "base",
      numeric: true,
    });
  }

  function hasNonZeroQty(value) {
    return Math.abs(roundQty(value)) > 1e-9;
  }

  function clampSignedToBase(base, value) {
    const baseQty = roundQty(base);
    const nextQty = roundQty(value);
    if (!Number.isFinite(baseQty)) return 0;
    if (baseQty >= 0) {
      return Math.min(Math.max(nextQty, 0), baseQty);
    }
    return Math.max(Math.min(nextQty, 0), baseQty);
  }

  function orderTypeKey(type) {
    return String(type || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  }

  function isMaintenanceOrderType(type) {
    return orderTypeKey(type) === "requestmaintenance";
  }

  function isWithdrawalOrderType(type) {
    return orderTypeKey(type) === "withdrawproducts";
  }

  function getDeliveryProofModalConfig(type) {
    const key = orderTypeKey(type);

    if (key === "requestmaintenance") {
      return {
        title: "Upload Signed Maintenance Report",
        sub: "Please upload the maintenance report after it has been signed.",
        fileLabel: "Signed maintenance report images",
        requireReceiptNumbers: false,
      };
    }

    if (key === "withdrawproducts") {
      return {
        title: "Upload Signed Withdrawal Report",
        sub: "Please upload the withdrawal report after the store keeper signs it.",
        fileLabel: "Signed withdrawal report images",
        requireReceiptNumbers: true,
      };
    }

    return {
      title: "Upload Signed Delivery Report",
      sub: "Please upload the delivery report after the receiver signs it.",
      fileLabel: "Signed delivery report images",
      requireReceiptNumbers: false,
    };
  }

  function getDeliveredRepeatActionConfig(group, fallbackItem = null) {
    const typeKey = orderTypeKey(group?.orderType || fallbackItem?.orderType);
    if (typeKey === "requestproducts") {
      return {
        key: "withdrawal",
        label: "Create Withdrawal",
        icon: "repeat",
        endpoint: "/api/orders/requested/create-withdrawal",
        successMessage: "Withdrawal order created in Not Started.",
        errorMessage: "Failed to create withdrawal order.",
      };
    }
    if (typeKey === "withdrawproducts") {
      return {
        key: "delivery",
        label: "Create Delivery",
        icon: "repeat",
        endpoint: "/api/orders/requested/create-delivery",
        successMessage: "Delivery order created in Not Started.",
        errorMessage: "Failed to create delivery order.",
      };
    }
    return null;
  }

  function summarizeMaintenanceReasons(items) {
    const unique = [];
    const seen = new Set();
    for (const it of items || []) {
      const value = String(it?.issueDescription || it?.reason || "").trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      unique.push(value);
    }
    if (!unique.length) return "—";
    if (unique.length === 1) return unique[0];
    return `${unique[0]} +${unique.length - 1}`;
  }

  function toDate(v) {
    if (!v) return null;
    try {
      const d = v instanceof Date ? v : new Date(v);
      return Number.isFinite(d.getTime()) ? d : null;
    } catch {
      return null;
    }
  }

  function fmtDateOnly(dateLike) {
    const d = toDate(dateLike);
    if (!d) return "";
    try {
      return d.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return d.toISOString().slice(0, 10);
    }
  }

  function fmtDateTime(dateLike) {
    const d = toDate(dateLike);
    if (!d) return "";
    try {
      return d.toLocaleString("en-GB", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return d.toISOString();
    }
  }

  function toast(type, title, message) {
    if (window.UI?.toast) {
      window.UI.toast({ type, title, message });
    }
  }

  // ---------- Status / Tabs ----------
  // NOTE: "Delivered" tab maps to Arrived/Delivered/Received.
  const STATUS_FLOW = [
    { key: "placed", label: "Order Placed", sub: "We received your order." },
    { key: "supervision", label: "Under Supervision", sub: "Your order is under supervision." },
    { key: "progress", label: "In progress", sub: "We are preparing your order." },
    { key: "shipped", label: "Shipped", sub: "Your order is on the way." },
    { key: "arrived", label: "Arrived", sub: "Your order has arrived." },
  ];

  function statusToIndex(status) {
    const s = norm(status);
    if (/(arrived|delivered|received)/.test(s)) return 5;
    if (/shipped/.test(s)) return 4;
    if (/(in\s*progress|preparing|processing)/.test(s)) return 3;
    if (/under\s*supervision/.test(s)) return 2;
    return 1;
  }

  function computeStage(items) {
    const list = Array.isArray(items) ? items : [];
    let bestIdx = 1;
    let bestColor = null;

    for (const it of list) {
      const idx = statusToIndex(it.status);
      if (idx > bestIdx) {
        bestIdx = idx;
        bestColor = it.statusColor || null;
      } else if (idx === bestIdx && !bestColor) {
        bestColor = it.statusColor || null;
      }
    }

    const base = STATUS_FLOW[bestIdx - 1] || STATUS_FLOW[0];
    return { ...base, idx: bestIdx, color: bestColor };
  }

  function tabFromStageIdx(idx) {
    if (idx >= 5) return "delivered";
    if (idx >= 4) return "received";
    return "not-started";
  }

  function readTabFromUrl() {
    const url = new URL(window.location.href);
    const tab = norm(url.searchParams.get("tab"));
    const allowed = isMaintenancePage
      ? new Set(["received", "delivered"])
      : new Set(["not-started", "remaining", "received", "delivered"]);
    if (allowed.has(tab)) return tab;
    return isMaintenancePage ? "received" : "not-started";
  }

  // Stage alone is not enough because we split "Shipped" into:
  // - Remaining: shipped but not fully received (remaining qty > 0)
  // - Received: shipped and fully received
  function tabForGroup(g) {
    const idx = g?.stage?.idx || 1;
    if (idx >= 5) return "delivered";
    if (idx >= 4) return g?.hasRemaining ? "remaining" : "received";
    return "not-started";
  }

  function updateTabUI() {
    const url = new URL(window.location.href);
    url.searchParams.set("tab", currentTab);
    window.history.replaceState({}, "", url);

    const tabs = tabsWrap ? Array.from(tabsWrap.querySelectorAll(".tab-portfolio")) : [];
    tabs.forEach((a) => {
      const t = norm(a.getAttribute("data-tab"));
      const active = t === currentTab;
      a.classList.toggle("is-active", active);
      a.setAttribute("aria-selected", active ? "true" : "false");
    });
  }

  function setActiveStep(step) {
    const safe = Math.min(5, Math.max(1, Number(step) || 1));
    for (let i = 1; i <= 5; i++) {
      const el = stepEls[i];
      if (!el) continue;
      el.classList.toggle("is-active", i <= safe);
      el.classList.toggle("is-current", i === safe);
    }
    for (let i = 1; i <= 4; i++) {
      const el = connEls[i];
      if (!el) continue;
      el.classList.toggle("is-active", i < safe);
    }
  }

  // ---------- Grouping ----------
  function computeOrderIdRange(items) {
    const list = (items || [])
      .map((it) => ({
        text: it.orderId || null,
        prefix: it.orderIdPrefix || null,
        number: Number.isFinite(Number(it.orderIdNumber)) ? Number(it.orderIdNumber) : null,
      }))
      .filter((x) => x.text || x.number !== null);

    if (!list.length) return "Order";

    const nums = list.filter((x) => x.number !== null);
    if (nums.length) {
      const prefix = nums[0].prefix || "";
      const samePrefix = nums.every((x) => (x.prefix || "") === prefix);
      const min = Math.min(...nums.map((x) => x.number));
      const max = Math.max(...nums.map((x) => x.number));

      if (min === max) return prefix ? `${prefix}-${min}` : String(min);
      if (samePrefix && prefix) return `${prefix}-${min} : ${prefix}-${max}`;
    }

    const texts = list.map((x) => x.text).filter(Boolean);
    if (!texts.length) return "Order";
    if (texts.length === 1) return texts[0];
    return `${texts[0]} : ${texts[texts.length - 1]}`;
  }

  function operationsSummary(items) {
    const names = new Set(
      (items || [])
        .map((x) => String(x.operationsByName || "").trim())
        .filter(Boolean),
    );
    if (names.size === 0) return "";
    if (names.size === 1) return Array.from(names)[0];
    return "Multiple";
  }

  // Quantity shown to Operations can use the dedicated "Quantity Received by operations" column
  // (if filled). Otherwise we fallback to the base quantity coming from Notion (Quantity Progress / Requested).
  function effectiveQty(it) {
    const rec =
      it &&
      typeof it.quantityReceived === "number" &&
      Number.isFinite(it.quantityReceived)
        ? Number(it.quantityReceived)
        : null;
    const base = Number(it?.quantity) || 0;
    return rec !== null && rec !== undefined ? rec : base;
  }

  // Quantities helpers
  function baseQty(it) {
    const n = Number(it?.quantity);
    return Number.isFinite(n) ? roundQty(n) : 0;
  }

  // Raw received quantity from Notion (independent of current tab).
  function receivedQtyRaw(it) {
    const n = Number(it?.quantityReceived);
    if (!Number.isFinite(n)) return null;
    return roundQty(n);
  }

  // Quantity shown in the UI. In "Not Started" we treat Quantity Progress as the primary value,
  // and we only show a received override if Operations explicitly edited it.
  function receivedQtyDisplay(it) {
    const v = receivedQtyRaw(it);
    if (v === null || v === undefined) return null;
    if (currentTab === "not-started" && !it?.quantityReceivedEdited) return null;
    return v;
  }

  function receivedQtyOrZero(it) {
    const r = receivedQtyRaw(it);
    return r === null || r === undefined ? 0 : r;
  }

  // Remaining quantity. Prefer the dedicated Notion column "Quantity Remaining" if present.
  function remainingQty(it) {
    const stored = Number(it?.quantityRemaining);
    if (Number.isFinite(stored)) return roundQty(stored);
    return roundQty(baseQty(it) - receivedQtyOrZero(it));
  }

  function hasRemainingQty(it) {
    return hasNonZeroQty(remainingQty(it));
  }

  function hasReceivedNumber(it) {
    return receivedQtyRaw(it) !== null && receivedQtyRaw(it) !== undefined;
  }



  function buildGroups(items) {
    const map = new Map();

    // Sort newest first (createdTime)
    const sorted = (Array.isArray(items) ? items.slice() : []).sort((a, b) => {
      const da = toDate(a.createdTime)?.getTime() || 0;
      const db = toDate(b.createdTime)?.getTime() || 0;
      return db - da;
    });

    // Grouping should match Current Orders behavior:
    // group all components that were created at the same time (to the minute),
    // regardless of per-component Reason (reasons can differ per product).
    const pad2 = (n) => String(n).padStart(2, "0");
    const timeKey = (dateLike) => {
      const d = toDate(dateLike);
      if (!d) return "0";
      const yyyy = d.getFullYear();
      const mm = pad2(d.getMonth() + 1);
      const dd = pad2(d.getDate());
      const hh = pad2(d.getHours());
      const mi = pad2(d.getMinutes());
      return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
    };

    for (const it of sorted) {
      const created = toDate(it.createdTime);

      // Prefer grouping by Order - ID (Number). Fallback (legacy rows): created-by + created-time (minute).
      const oid = Number(it.orderIdNumber);
      const gKey = Number.isFinite(oid)
        ? `ord:${oid}`
        : [String(it.createdById || "").trim(), timeKey(created)].join("|");

      if (!map.has(gKey)) {
        map.set(gKey, {
          groupId: gKey,
          orderIdNumber: Number.isFinite(oid) ? oid : null,
          createdById: it.createdById || "",
          createdByName: it.createdByName || "",
          orderType: it.orderType || "",
          orderTypeColor: it.orderTypeColor || null,
          // We keep a group-level summary reason for search only.
          // The modal always shows per-item reasons.
          reason: "",
          latestCreated: created ? created.toISOString() : "",
          items: [],
        });
      }
      const group = map.get(gKey);
      group.items.push(it);
      if (!group.orderType && it.orderType) group.orderType = it.orderType;
      if (!group.orderTypeColor && it.orderTypeColor) group.orderTypeColor = it.orderTypeColor;
    }

    // Same summarization idea as Current Orders (helps search UX)
    const summarizeReasons = (itemsArr) => {
      const counts = new Map();
      for (const it of itemsArr || []) {
        const r = String(it?.reason || "").trim();
        if (!r) continue;
        counts.set(r, (counts.get(r) || 0) + 1);
      }
      const entries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
      const unique = entries.map(([k]) => k);
      if (unique.length === 0) return { title: "", uniqueReasons: [] };
      if (unique.length === 1) return { title: unique[0], uniqueReasons: unique };
      const main = unique[0];
      return { title: `${main} +${unique.length - 1}`, uniqueReasons: unique };
    };

    const groups = Array.from(map.values()).map((g) => {
      const itemsArr = g.items || [];
      // Base totals (same meaning as Current Orders)
      const totalQty = itemsArr.reduce((sum, x) => sum + baseQty(x), 0);
      const estimateTotal = itemsArr.reduce(
        (sum, x) => sum + baseQty(x) * (Number(x.unitPrice) || 0),
        0,
      );

      // Remaining/received breakdown (used by the new "Remaining" tab)
      const receivedTotalQty = itemsArr.reduce((sum, x) => sum + receivedQtyOrZero(x), 0);
      const receivedItemsCount = itemsArr.reduce(
        (sum, x) => sum + (hasReceivedNumber(x) ? 1 : 0),
        0,
      );
      const receivedEstimateTotal = itemsArr.reduce(
        (sum, x) => sum + receivedQtyOrZero(x) * (Number(x.unitPrice) || 0),
        0,
      );
      const remainingTotalQty = itemsArr.reduce((sum, x) => sum + remainingQty(x), 0);
      const remainingItemsCount = itemsArr.reduce((sum, x) => sum + (hasRemainingQty(x) ? 1 : 0), 0);
      const remainingEstimateTotal = itemsArr.reduce(
        (sum, x) => sum + remainingQty(x) * (Number(x.unitPrice) || 0),
        0,
      );
      const hasRemaining = remainingItemsCount > 0;
      const hasReceived = receivedItemsCount > 0;
      const stage = computeStage(itemsArr);
      const rs = summarizeReasons(itemsArr);

      // Receipt number should be identical for all components in the same order.
      // We pick the first non-null value; if multiple different values exist, show "Multiple".
      const receiptVals = (itemsArr || [])
        .map((x) => (x && x.receiptNumber !== null && x.receiptNumber !== undefined ? x.receiptNumber : null))
        .filter((x) => x !== null && x !== undefined);
      let receiptNumber = null;
      if (receiptVals.length) {
        const set = new Set(receiptVals.map((x) => String(x)));
        receiptNumber = set.size === 1 ? receiptVals[0] : "Multiple";
      }

      return {
        ...g,
        reason: rs.title,
        reasons: rs.uniqueReasons,
        orderIds: itemsArr.map((x) => x.id).filter(Boolean),
        itemsCount: itemsArr.length,
        totalQty,
        estimateTotal,
        receivedTotalQty,
        receivedItemsCount,
        receivedEstimateTotal,
        remainingTotalQty,
        remainingItemsCount,
        remainingEstimateTotal,
        hasRemaining,
        hasReceived,
        stage,
        orderIdRange: computeOrderIdRange(itemsArr),
        operationsByName: operationsSummary(itemsArr),
        receiptNumber,
      };
    });

    // Newest group first
    return groups.sort((a, b) => {
      const da = toDate(a.latestCreated)?.getTime() || 0;
      const db = toDate(b.latestCreated)?.getTime() || 0;
      return db - da;
    });
  }

  // ---------- Rendering ----------
  let allItems = [];
  let groups = [];
  let currentTab = "not-started";
  let activeGroup = null;
  let lastFocus = null;

  function groupMatchesQuery(g, q) {
    if (!q) return true;
    const hay = [
      g.reason,
      ...(Array.isArray(g.reasons) ? g.reasons : []),
      g.orderIdRange,
      g.receiptNumber,
      g.createdByName,
      g.operationsByName,
      ...(g.items || []).map((x) => x.productName),
      ...(g.items || []).map((x) => x.reason),
      ...(g.items || []).map((x) => x.issueDescription),
      ...(g.items || []).map((x) => x.actualIssueDescription),
      ...(g.items || []).map((x) => x.repairAction),
      ...(g.items || []).map((x) => x.resolutionMethod),
      ...(g.items || []).map((x) => x.sparePartsReplacedName),
      ...(g.items || []).flatMap((x) => Array.isArray(x?.sparePartsReplacedNames) ? x.sparePartsReplacedNames : []),
    ]
      .filter(Boolean)
      .join(" ");
    return norm(hay).includes(q);
  }

  function getFilteredGroups() {
    const q = norm(searchInput?.value || "");
    return (groups || [])
      .filter((g) => {
        const idx = g?.stage?.idx || 1;
        const first = (g.items || [])[0] || {};
        const isMaintenanceOrder = isMaintenanceOrderType(g.orderType || first.orderType);

        if (isMaintenancePage) {
          if (!isMaintenanceOrder) return false;
          if (currentTab === "received") return idx === 4;
          if (currentTab === "delivered") return idx >= 5;
          return false;
        }
        if (currentTab === "not-started") return idx < 4;
        if (currentTab === "remaining") return !isMaintenanceOrder && idx === 4 && !!g?.hasRemaining;
        if (currentTab === "received") return idx === 4 && (isMaintenanceOrder || !!g?.hasReceived);
        if (currentTab === "delivered") return idx >= 5;
        return false;
      })
      .filter((g) => groupMatchesQuery(g, q));
  }

  function renderCard(g) {
    const first = (g.items || [])[0] || {};
    const title = escapeHTML(g.orderIdRange || g.reason || "Order");
    const sub = escapeHTML(fmtDateOnly(g.latestCreated) || "—");
    const createdBy = escapeHTML(String(g.createdByName || first.createdByName || "").trim() || "—");

    const thumbHTML = orderTypeThumbMarkup(
      g.orderType || first.orderType,
      g.orderTypeColor || first.orderTypeColor,
    );

    const stage = g.stage || computeStage(g.items || []);
    const statusVars = notionColorVars(stage.color);
    const statusStyle = `--tag-bg:${statusVars.bg};--tag-fg:${statusVars.fg};--tag-border:${statusVars.bd};`;

    const receivedBy = String(g.operationsByName || "").trim();
    const receivedLine = receivedBy
      ? `<div class="co-received-by">Received by: ${escapeHTML(receivedBy)}</div>`
      : "";

    // Tab-specific card totals:
    // - Remaining: show only remaining items/cost
    // - Received: show only received items/cost
    const isRemaining = currentTab === "remaining";
    const isReceived = currentTab === "received";
    const displayCount = isRemaining
      ? Number(g.remainingItemsCount) || 0
      : isReceived
        ? Number(g.receivedItemsCount) || 0
        : Number(g.itemsCount) || 0;
    const displayTotal = isRemaining
      ? Number(g.remainingEstimateTotal) || 0
      : isReceived
        ? Number(g.receivedEstimateTotal) || 0
        : Number(g.estimateTotal) || 0;

    const card = document.createElement("article");
    card.className = "co-card";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.dataset.groupId = g.groupId;

    card.innerHTML = `
      <div class="co-top">
        ${thumbHTML}

        <div class="co-main">
          <div class="co-title">${title}</div>
          <div class="co-sub">${sub}</div>
          <div class="co-createdby">${createdBy}</div>
        </div>

        <div class="co-qty">x${Number.isFinite(Number(displayCount)) ? Number(displayCount) : 0}</div>
      </div>

      <div class="co-divider"></div>

      <div class="co-bottom">
        <div class="co-est">
          <div class="co-est-label">Estimate Total</div>
          <div class="co-est-value">${fmtMoney(displayTotal)}</div>
          ${receivedLine}
        </div>

        <div class="co-actions">
          <span class="co-status-btn" style="${statusStyle}">${escapeHTML(stage.label)}</span>
          <span class="co-right-ico" aria-hidden="true"><i data-feather="percent"></i></span>
        </div>
      </div>
    `;

    card.addEventListener("click", () => openOrderModal(g));
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openOrderModal(g);
      }
    });

    return card;
  }

  function render() {
    if (!listDiv) return;

    const filtered = getFilteredGroups();
    listDiv.innerHTML = "";

    if (!filtered.length) {
      listDiv.innerHTML = `<p>No orders found.</p>`;
      if (window.feather) window.feather.replace();
      return;
    }

    const frag = document.createDocumentFragment();
    for (const g of filtered) frag.appendChild(renderCard(g));
    listDiv.appendChild(frag);

    if (window.feather) window.feather.replace();
  }

  // ---------- Modal ----------
  function openOrderModal(g) {
    if (!orderModal) return;
    const wasOpen = orderModal.classList.contains("is-open");
    activeGroup = g;

    // Only capture focus when opening the modal the first time.
    if (!wasOpen) lastFocus = document.activeElement;

    // Reset any open UI inside the modal
    closeDownloadMenu();
    closeReceiptModal({ restoreFocus: false });
    closeTechVisitModal({ restoreFocus: false });
    closeMaintenanceLogModal({ restoreFocus: false });
    closeMaintenanceReceiptModal({ restoreFocus: false });

    const all = (g.items || []).slice().sort(compareItemsByProductName);
    const stage = g.stage || computeStage(all);
    const isMaintenanceOrder = isMaintenanceOrderType(g.orderType || all[0]?.orderType);

    const isRemainingTab = currentTab === "remaining";
    const isReceivedTab = currentTab === "received";

    // Items shown depend on the active tab:
    // - Remaining: show items that still have remaining qty.
    // - Received: show only items that have a value in "Quantity received by operations".
    // - Others: show all items.
    const items = isRemainingTab
      ? all.filter((it) => hasRemainingQty(it) || it.justUpdated)
      : isReceivedTab
        ? (isMaintenanceOrder ? all : all.filter((it) => hasReceivedNumber(it)))
        : all;

    // Header
    if (modalTitle) modalTitle.textContent = stage.label || "—";
    if (modalSub) {
      modalSub.textContent = orderTypeSubtitle(
        g.orderType || all[0]?.orderType,
        g.orderTypeColor || all[0]?.orderTypeColor,
        stage.sub || '—',
      );
    }

    // Tracker
    setActiveStep(stage.idx || 1);

    // Meta (match Current Orders / Orders Review for Maintenance)
    if (modalReasonLabel) modalReasonLabel.textContent = isMaintenanceOrder ? "Issue Description" : "Reason";
    if (modalReason) {
      modalReason.textContent = isMaintenanceOrder
        ? summarizeMaintenanceReasons(items)
        : (String(g.reason || "—").trim() || "—");
    }
    if (modalDate) modalDate.textContent = fmtDateTime(g.latestCreated) || "—";
    if (modalComponentsRow) modalComponentsRow.hidden = !!isMaintenanceOrder;
    if (modalTotalPriceRow) modalTotalPriceRow.hidden = !!isMaintenanceOrder;
    if (modalComponents) {
      const c = isRemainingTab
        ? (Number(g.remainingItemsCount) || items.length)
        : isReceivedTab
          ? (Number(g.receivedItemsCount) || items.length)
          : Number(g.itemsCount) || items.length;
      modalComponents.textContent = String(c);
    }
    if (modalTotalPrice) {
      const t = isRemainingTab
        ? (Number(g.remainingEstimateTotal) || items.reduce((sum, x) => sum + remainingQty(x) * (Number(x.unitPrice) || 0), 0))
        : isReceivedTab
          ? (Number(g.receivedEstimateTotal) || items.reduce((sum, x) => sum + receivedQtyOrZero(x) * (Number(x.unitPrice) || 0), 0))
          : Number(g.estimateTotal) || 0;
      modalTotalPrice.textContent = fmtMoney(t);
    }

    // Extra fields: show for "Received" and later only
    // NOTE: User request: in "Not Started" tab hide Receipt/Received-by even if present.
    const shouldShowExtras = !isMaintenanceOrder && currentTab !== "not-started" && (stage?.idx || 1) >= 4;
    const receiptVal = g && (g.receiptNumber !== null && g.receiptNumber !== undefined) ? g.receiptNumber : null;
    const receivedByVal = String(g.operationsByName || "").trim();

    if (receiptRow) receiptRow.hidden = !shouldShowExtras;
    if (modalReceiptNumber) modalReceiptNumber.textContent = receiptVal !== null ? String(receiptVal) : "—";

    if (receivedByRow) receivedByRow.hidden = !shouldShowExtras;
    if (modalOperationsBy) modalOperationsBy.textContent = receivedByVal || "—";

    // Actions visibility
    // - Not Started: show "Received by operations" only before shipping
    // - Remaining: show it again so operations can add another receipt number
    if (shippedBtn) {
      const showShippedBtn = !isMaintenancePage && (
        isMaintenanceOrder
          ? currentTab === "not-started" && stage.idx < 4
          : ((currentTab === "not-started" && stage.idx < 4) || currentTab === "remaining")
      );
      shippedBtn.style.display = showShippedBtn ? "inline-flex" : "none";
      shippedBtn.dataset.mode = isMaintenanceOrder ? "maintenance" : "requested";
      shippedBtn.innerHTML = isMaintenanceOrder
        ? '<i data-feather="tool"></i> Request Technical Visit'
        : '<i data-feather="truck"></i> Received by operations';
    }
    // "Mark as Delivered" button:
    // Show it in the "Received" tab when the order is in Shipped stage.
    if (arrivedBtn) {
      arrivedBtn.style.display = currentTab === "received" && stage.idx === 4 ? "inline-flex" : "none";
    }
    if (createWithdrawalBtn) {
      const repeatAction = getDeliveredRepeatActionConfig(g, all[0]);
      const canCreateRepeatOrder =
        !isMaintenanceOrder &&
        currentTab === "delivered" &&
        (stage?.idx || 1) >= 5 &&
        !!repeatAction;
      createWithdrawalBtn.style.display = canCreateRepeatOrder ? "inline-flex" : "none";
      if (canCreateRepeatOrder && repeatAction) {
        createWithdrawalBtn.dataset.repeatAction = repeatAction.key;
        createWithdrawalBtn.innerHTML = `<i data-feather="${repeatAction.icon}"></i> ${repeatAction.label}`;
      } else {
        createWithdrawalBtn.dataset.repeatAction = "";
        createWithdrawalBtn.innerHTML = '<i data-feather="repeat"></i> Create Withdrawal';
      }
    }
    if (logMaintenanceBtn) {
      const stageIdx = stage?.idx || 1;
      const canLogMaintenance = isMaintenanceOrder && (
        isMaintenancePage
          ? stageIdx >= 4
          : currentTab === "not-started"
      );
      logMaintenanceBtn.style.display = canLogMaintenance ? "inline-flex" : "none";
    }
    if (maintenancePdfBtn) {
      const canDownloadMaintenancePdf = isMaintenanceOrder && (stage?.idx || 1) >= 4;
      maintenancePdfBtn.style.display = canDownloadMaintenancePdf ? "inline-flex" : "none";
    }

    // Items list
    if (modalItems) {
      modalItems.innerHTML = "";
      const frag = document.createDocumentFragment();

      const canEditQty = !isMaintenanceOrder && (currentTab === "not-started" || currentTab === "remaining");

      if (isRemainingTab && items.length === 0) {
        const empty = document.createElement("div");
        empty.style.padding = "10px";
        empty.textContent = "No remaining components.";
        frag.appendChild(empty);
      }

      if (!isRemainingTab && currentTab === "received" && items.length === 0) {
        const empty = document.createElement("div");
        empty.style.padding = "10px";
        empty.textContent = "No received components yet.";
        frag.appendChild(empty);
      }

      for (const it of items) {
        const product = escapeHTML(it.productName || "Component");
        const qtyBase = baseQty(it);

        // For Not Started, we only display a received override if it was edited.
        const qtyReceivedDisplay = receivedQtyDisplay(it);
        // For Received tab, we always use the raw received value.
        const qtyReceivedRawVal = receivedQtyRaw(it);

        const qtyEffective =
          isReceivedTab
            ? (qtyReceivedRawVal !== null && qtyReceivedRawVal !== undefined ? qtyReceivedRawVal : qtyBase)
            : (qtyReceivedDisplay !== null && qtyReceivedDisplay !== undefined ? qtyReceivedDisplay : qtyBase);
        const unit = Number(it.unitPrice) || 0;
        const qtyRem = remainingQty(it);

        const total = (isRemainingTab ? qtyRem : qtyEffective) * unit;

        const showStrike =
          !isRemainingTab &&
          !isReceivedTab &&
          qtyReceivedDisplay !== null &&
          qtyReceivedDisplay !== undefined &&
          qtyReceivedDisplay !== qtyBase;

        // Check for pending updates in Remaining tab
        const pendingRem = it.pendingRemaining;
        const pendingAdd = it.pendingReceivedAdd;
        const hasPending = pendingRem !== undefined && pendingRem !== null;

        // In Remaining tab, if user edited the value, we show the *new remaining amount* (pendingRem)
        // next to the old remaining amount.
        const showDiffRemaining = hasPending && Number(pendingRem) !== qtyRem;
        const showDiffJustUpdated = !!(it.justUpdated && it.previousRemaining !== undefined);

        const qtyHTML = isRemainingTab
          ? (showDiffRemaining
              ? `<span class="sv-qty-diff"><span class="sv-qty-old">${escapeHTML(fmtQty(qtyRem))}</span><strong class="sv-qty-new" data-role="qty-val">${escapeHTML(fmtQty(pendingRem))}</strong></span>`
              : showDiffJustUpdated
                ? `<span class="sv-qty-diff"><span class="sv-qty-old">${escapeHTML(fmtQty(it.previousRemaining))}</span><strong class="sv-qty-new" data-role="qty-val">${escapeHTML(fmtQty(qtyRem))}</strong></span>`
                : `<strong data-role="qty-val">${escapeHTML(fmtQty(hasPending ? pendingRem : qtyRem))}</strong>`)
          : showStrike
            ? `<span class="sv-qty-diff"><span class="sv-qty-old">${escapeHTML(fmtQty(qtyBase))}</span><strong class="sv-qty-new" data-role="qty-val">${escapeHTML(fmtQty(qtyReceivedDisplay))}</strong></span>`
            : `<strong data-role="qty-val">${escapeHTML(fmtQty(qtyEffective))}</strong>`;

        const href = safeHttpUrl(it.productUrl);
        const linkHTML = !isMaintenanceOrder && href
          ? `<a class="co-item-link" href="${escapeHTML(href)}" target="_blank" rel="noopener" title="Open link">
               <i data-feather="external-link"></i>
             </a>`
          : "";

        const editBtnHTML = canEditQty
          ? `<button class="btn btn-xs ro-edit ro-edit-inline ro-edit-dark" data-id="${escapeHTML(it.id)}" type="button" title="Edit received qty">
               <i data-feather="edit-2"></i> Edit
             </button>`
          : "";

        const itemStatusLabel = String(it.status || stage.label || '—').trim() || '—';
        const itemStatusVars = notionColorVars(it.statusColor || stage.color);
        const itemStatusStyle = `--tag-bg:${itemStatusVars.bg};--tag-fg:${itemStatusVars.fg};--tag-border:${itemStatusVars.bd};`;
        const subLine = isMaintenanceOrder ? '' : `Unit: ${fmtMoney(unit)} · Total: ${fmtMoney(total)}`;
        const rightRowHtml = isMaintenanceOrder
          ? ''
          : `
            <div class="co-item-right-row">
              <div class="co-item-status" style="${itemStatusStyle}">${escapeHTML(itemStatusLabel)}</div>
              ${editBtnHTML}
            </div>
          `;

        const row = document.createElement("div");
        row.className = "co-item";
        row.innerHTML = `
          <div class="co-item-left">
            <div class="co-item-title">
              <div class="co-item-name">${product}</div>
              ${linkHTML}
            </div>
            ${subLine ? `<div class="co-item-sub">${subLine}</div>` : ''}
          </div>
          <div class="co-item-right">
            <div class="co-item-total">${isRemainingTab ? "Qty remaining:" : "Qty:"} ${qtyHTML}</div>
            ${rightRowHtml}
          </div>
        `;
        frag.appendChild(row);
      }

      modalItems.appendChild(frag);
    }

    // Open
    orderModal.classList.add("is-open");
    document.body.classList.add("co-modal-open");
    orderModal.setAttribute("aria-hidden", "false");

    if (window.feather) window.feather.replace();

    // Focus close button for accessibility
    try {
      modalClose?.focus();
    } catch {}
  }

  function closeOrderModal() {
    if (!orderModal) return;

    // Close any open dropdown/sub-modals first
    closeReceiptModal({ restoreFocus: false });
    closeTechVisitModal({ restoreFocus: false });
    closeMaintenanceLogModal({ restoreFocus: false });
    closeMaintenanceReceiptModal({ restoreFocus: false });
    closeDownloadMenu();

    orderModal.classList.remove("is-open");
    document.body.classList.remove("co-modal-open");
    orderModal.setAttribute("aria-hidden", "true");

    if (activeGroup && activeGroup.items) {
      activeGroup.items.forEach((it) => {
        delete it.justUpdated;
        delete it.previousRemaining;
      });
    }

    activeGroup = null;

    try {
      if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
    } catch {}
  }

  // ---------- Download dropdown helpers (single Download button) ----------
  function closeDownloadMenu() {
    if (!downloadMenuPanel) return;
    downloadMenuPanel.hidden = true;
    if (downloadMenuBtn) downloadMenuBtn.setAttribute("aria-expanded", "false");
  }

  function openDownloadMenu() {
    if (!downloadMenuPanel) return;
    downloadMenuPanel.hidden = false;
    if (downloadMenuBtn) downloadMenuBtn.setAttribute("aria-expanded", "true");
    if (window.feather) window.feather.replace();
  }

  function toggleDownloadMenu() {
    if (!downloadMenuPanel) return;
    if (downloadMenuPanel.hidden) openDownloadMenu();
    else closeDownloadMenu();
  }

  // ---------- Receipt sub-modal helpers ----------
  let receiptLastFocus = null;

  function setReceiptError(message) {
    if (!receiptError) return;
    receiptError.textContent = String(message || "");
  }

  function isReceiptOpen() {
    return !!receiptModal && receiptModal.classList.contains("is-open");
  }

  function openReceiptModal() {
    if (!receiptModal || !receiptConfirmBtn || !receiptCancelBtn || (!receiptInputsWrap && !receiptInput)) {
      // Fallback to prompt
      const raw = window.prompt("Enter store receipt number(s), separated by commas:");
      if (raw === null) return;
      const values = normalizeReceiptNumbers(raw);
      if (!values.length || values.some((value) => !/^\d+$/.test(value))) {
        alert("Please enter valid store receipt numbers.");
        return;
      }
      markReceivedByOperations(activeGroup, values);
      return;
    }

    // Reset
    setReceiptError("");
    // Do NOT pre-fill the input. Receipt Number is stored as rich_text and may contain
    // multiple values (one per delivery). We want the user to enter a new number each time.
    resetReceiptInputs([""]);

    receiptConfirmBtn.disabled = false;
    receiptCancelBtn.disabled = false;
    if (receiptCloseBtn) receiptCloseBtn.disabled = false;
    if (addReceiptBtn) addReceiptBtn.disabled = false;

    receiptLastFocus = document.activeElement;
    receiptModal.hidden = false;
    receiptModal.classList.add("is-open");
    receiptModal.setAttribute("aria-hidden", "false");

    if (window.feather) window.feather.replace();

    window.requestAnimationFrame(() => {
      try {
        const firstInput = getReceiptInputs()[0] || receiptInput;
        firstInput?.focus();
        firstInput?.select();
      } catch {}
    });
  }

  function closeReceiptModal({ restoreFocus = true } = {}) {
    if (!receiptModal) return;
    if (!isReceiptOpen() && receiptModal.hidden) return;
    receiptModal.classList.remove("is-open");
    receiptModal.setAttribute("aria-hidden", "true");
    receiptModal.hidden = true;
    setReceiptError("");

    if (restoreFocus) {
      try {
        if (receiptLastFocus && typeof receiptLastFocus.focus === "function") receiptLastFocus.focus();
      } catch {}
    }
    receiptLastFocus = null;
  }

  let techVisitLastFocus = null;

  function openTechVisitModal() {
    if (!techVisitModal || !techVisitIssueInput) return;

    setTechVisitError("");
    techVisitIssueInput.value = getCurrentIssueDescription(activeGroup);

    if (techVisitConfirmBtn) techVisitConfirmBtn.disabled = false;
    if (techVisitCancelBtn) techVisitCancelBtn.disabled = false;
    if (techVisitCloseBtn) techVisitCloseBtn.disabled = false;

    techVisitLastFocus = document.activeElement;
    techVisitModal.hidden = false;
    techVisitModal.classList.add("is-open");
    techVisitModal.setAttribute("aria-hidden", "false");

    if (window.feather) window.feather.replace();

    window.requestAnimationFrame(() => {
      try {
        techVisitIssueInput.focus();
        techVisitIssueInput.select();
      } catch {}
    });
  }

  function closeTechVisitModal({ restoreFocus = true } = {}) {
    if (!techVisitModal) return;
    if (!isTechVisitOpen() && techVisitModal.hidden) return;
    techVisitModal.classList.remove("is-open");
    techVisitModal.setAttribute("aria-hidden", "true");
    techVisitModal.hidden = true;
    setTechVisitError("");

    if (restoreFocus) {
      try {
        if (techVisitLastFocus && typeof techVisitLastFocus.focus === "function") techVisitLastFocus.focus();
      } catch {}
    }
    techVisitLastFocus = null;
  }

  let maintenanceLogLastFocus = null;
  let maintenanceLogLoadToken = 0;

  async function openMaintenanceLogModal() {
    if (
      !maintenanceLogModal ||
      !maintenanceResolutionSelect ||
      !maintenanceActualIssueInput ||
      !maintenanceRepairActionInput ||
      !maintenanceSparePartSelect
    ) {
      return;
    }

    setMaintenanceLogError("");
    const item = getPrimaryMaintenanceItem(activeGroup);
    const currentResolution = String(item?.resolutionMethod || "").trim();
    const currentSparePartIds = toStringArray(
      item?.sparePartsReplacedIds?.length ? item.sparePartsReplacedIds : item?.sparePartsReplacedId,
    );
    const currentSparePartNames = toStringArray(
      item?.sparePartsReplacedNames?.length ? item.sparePartsReplacedNames : item?.sparePartsReplacedName,
      { splitComma: true },
    );
    const loadToken = ++maintenanceLogLoadToken;

    if (maintenanceLogConfirmBtn) maintenanceLogConfirmBtn.disabled = true;
    if (maintenanceLogCancelBtn) maintenanceLogCancelBtn.disabled = false;
    if (maintenanceLogCloseBtn) maintenanceLogCloseBtn.disabled = false;

    maintenanceActualIssueInput.value = String(item?.actualIssueDescription || "");
    maintenanceRepairActionInput.value = String(item?.repairAction || "");

    fillSelectOptions(maintenanceResolutionSelect, [], {
      placeholder: "Loading resolution methods...",
      allowEmpty: true,
      selectedValue: "",
    });
    fillSelectOptions(maintenanceSparePartSelect, [], {
      placeholder: "Loading spare parts...",
      allowEmpty: false,
      selectedValues: [],
    });
    setSelectLoading(maintenanceResolutionSelect, "Loading resolution methods...");
    setSelectLoading(maintenanceSparePartSelect, "Loading spare parts...");

    maintenanceLogLastFocus = document.activeElement;
    maintenanceLogModal.hidden = false;
    maintenanceLogModal.classList.add("is-open");
    maintenanceLogModal.setAttribute("aria-hidden", "false");

    if (window.feather) window.feather.replace();

    window.requestAnimationFrame(() => {
      try {
        maintenanceActualIssueInput.focus();
      } catch {}
    });

    try {
      const options = await loadMaintenanceFormOptions();
      if (loadToken !== maintenanceLogLoadToken || !isMaintenanceLogOpen()) return;

      maintenanceResolutionSelect.disabled = false;
      maintenanceSparePartSelect.disabled = false;

      fillSelectOptions(
        maintenanceResolutionSelect,
        (options?.resolutionMethods || []).map((entry) => ({
          value: entry?.name,
          label: entry?.name,
        })),
        {
          placeholder: "Select resolution method",
          allowEmpty: true,
          selectedValue: currentResolution,
        },
      );

      const sparePartOptions = (options?.spareParts || []).map((entry) => ({
        value: entry?.id,
        label: entry?.name,
      }));

      fillSelectOptions(
        maintenanceSparePartSelect,
        sparePartOptions,
        {
          placeholder: "No spare part selected",
          allowEmpty: false,
          selectedValues: currentSparePartIds,
        },
      );

      if (currentSparePartNames.length && !currentSparePartIds.length) {
        fillSelectOptions(
          maintenanceSparePartSelect,
          [
            ...sparePartOptions,
            ...currentSparePartNames.map((name) => ({ value: name, label: name })),
          ],
          {
            placeholder: "No spare part selected",
            allowEmpty: false,
            selectedValues: currentSparePartNames,
          },
        );
      }

      if (window.feather) window.feather.replace();
      if (maintenanceLogConfirmBtn) maintenanceLogConfirmBtn.disabled = false;
    } catch (e) {
      if (loadToken !== maintenanceLogLoadToken) return;
      console.error(e);
      setMaintenanceLogError(e.message || "Failed to load maintenance form.");
      if (maintenanceLogConfirmBtn) maintenanceLogConfirmBtn.disabled = false;
      if (maintenanceLogCancelBtn) maintenanceLogCancelBtn.disabled = false;
      if (maintenanceLogCloseBtn) maintenanceLogCloseBtn.disabled = false;
      maintenanceResolutionSelect.disabled = false;
      maintenanceSparePartSelect.disabled = false;
      toast("error", "Failed", e.message || "Failed to load maintenance form.");
    }
  }

  function closeMaintenanceLogModal({ restoreFocus = true } = {}) {
    if (!maintenanceLogModal) return;
    if (!isMaintenanceLogOpen() && maintenanceLogModal.hidden) return;
    maintenanceLogModal.classList.remove("is-open");
    maintenanceLogModal.setAttribute("aria-hidden", "true");
    maintenanceLogModal.hidden = true;
    setMaintenanceLogError("");

    if (restoreFocus) {
      try {
        if (maintenanceLogLastFocus && typeof maintenanceLogLastFocus.focus === "function") {
          maintenanceLogLastFocus.focus();
        }
      } catch {}
    }
    maintenanceLogLastFocus = null;
  }

  let maintenanceReceiptLastFocus = null;

  function updateMaintenanceReceiptUI(files = []) {
    const pickedFiles = Array.from(files || []).filter(Boolean);
    if (maintenanceReceiptName) {
      if (!pickedFiles.length) maintenanceReceiptName.textContent = "Choose images";
      else if (pickedFiles.length === 1) maintenanceReceiptName.textContent = pickedFiles[0].name || "1 image selected";
      else maintenanceReceiptName.textContent = `${pickedFiles.length} images selected`;
    }
    if (maintenanceReceiptMeta) {
      if (!pickedFiles.length) {
        maintenanceReceiptMeta.textContent = "PNG, JPG or WEBP";
      } else {
        const totalSize = pickedFiles.reduce((sum, file) => sum + (Number(file?.size) || 0), 0);
        const labels = pickedFiles.slice(0, 2).map((file) => String(file?.name || "").trim()).filter(Boolean);
        const moreLabel = pickedFiles.length > 2 ? `+${pickedFiles.length - 2} more` : "";
        maintenanceReceiptMeta.textContent = [
          labels.join(" • "),
          moreLabel,
          humanFileSize(totalSize),
        ].filter(Boolean).join(" • ");
      }
    }
  }

  function openMaintenanceReceiptModal() {
    if (
      !maintenanceReceiptModal ||
      !maintenanceReceiptInput ||
      !maintenanceReceiptConfirmBtn ||
      !maintenanceReceiptCancelBtn
    ) {
      alert("Receipt upload form is unavailable.");
      return;
    }

    const orderType = activeGroup?.orderType || activeGroup?.items?.[0]?.orderType;
    const modalConfig = getDeliveryProofModalConfig(orderType);
    const needReceiptNumbers = !!modalConfig.requireReceiptNumbers;

    maintenanceReceiptLastFocus = document.activeElement;
    maintenanceReceiptInput.value = "";
    updateMaintenanceReceiptUI([]);
    resetDeliveryReceiptInputs([""]);
    setMaintenanceReceiptError("");

    if (maintenanceReceiptTitle) maintenanceReceiptTitle.textContent = modalConfig.title;
    if (maintenanceReceiptSub) maintenanceReceiptSub.textContent = modalConfig.sub;
    if (maintenanceReceiptLabel) maintenanceReceiptLabel.textContent = modalConfig.fileLabel;
    if (maintenanceReceiptNumbersField) maintenanceReceiptNumbersField.hidden = !needReceiptNumbers;
    if (maintenanceAddReceiptBtn) maintenanceAddReceiptBtn.style.display = needReceiptNumbers ? "inline-flex" : "none";

    maintenanceReceiptConfirmBtn.disabled = false;
    maintenanceReceiptCancelBtn.disabled = false;
    if (maintenanceReceiptCloseBtn) maintenanceReceiptCloseBtn.disabled = false;
    if (maintenanceAddReceiptBtn) maintenanceAddReceiptBtn.disabled = false;

    maintenanceReceiptModal.hidden = false;
    maintenanceReceiptModal.classList.add("is-open");
    maintenanceReceiptModal.setAttribute("aria-hidden", "false");

    if (window.feather) window.feather.replace();

    window.requestAnimationFrame(() => {
      try {
        if (needReceiptNumbers) {
          (getDeliveryReceiptInputs()[0] || maintenanceReceiptNumberInput)?.focus();
        } else {
          maintenanceReceiptChooseBtn?.focus();
        }
      } catch {}
    });
  }

  function closeMaintenanceReceiptModal({ restoreFocus = true } = {}) {
    if (!maintenanceReceiptModal) return;
    if (!isMaintenanceReceiptOpen() && maintenanceReceiptModal.hidden) return;
    maintenanceReceiptModal.classList.remove("is-open");
    maintenanceReceiptModal.setAttribute("aria-hidden", "true");
    maintenanceReceiptModal.hidden = true;
    setMaintenanceReceiptError("");

    if (restoreFocus) {
      try {
        if (maintenanceReceiptLastFocus && typeof maintenanceReceiptLastFocus.focus === "function") {
          maintenanceReceiptLastFocus.focus();
        }
      } catch {}
    }
    maintenanceReceiptLastFocus = null;
  }

  // ---------- Actions ----------
  async function downloadExcel(g) {
  if (!g || !g.orderIds || !g.orderIds.length) return;

  if (excelBtn) {
    excelBtn.disabled = true;
    excelBtn.dataset.prevHtml = excelBtn.innerHTML;
    excelBtn.textContent = "Preparing...";
  }

  try {
    const res = await fetch("/api/orders/requested/export/excel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ orderIds: g.orderIds }),
    });

    if (res.status === 401) {
      window.location.href = "/login";
      return;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to export Excel");
    }

    const blob = await res.blob();

    // Try to extract filename from content-disposition
    const cd = res.headers.get("content-disposition") || "";
    const m = cd.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
    const filename = decodeURIComponent((m && (m[1] || m[2])) || "operations_orders.xlsx");

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    toast("success", "Downloaded", "Excel exported successfully.");
  } catch (e) {
    console.error(e);
    alert(e.message || "Failed to export Excel");
  } finally {
    if (excelBtn) {
      excelBtn.disabled = false;
      const prev = excelBtn.dataset.prevHtml;
      if (prev) excelBtn.innerHTML = prev;
      else excelBtn.textContent = "Download Excel";
    }
  }
}

  async function downloadPdf(g) {
    if (!g || !g.orderIds || !g.orderIds.length) return;

    if (pdfBtn) {
      pdfBtn.disabled = true;
      pdfBtn.dataset.prevHtml = pdfBtn.innerHTML;
      pdfBtn.textContent = "Preparing...";
    }

    try {
      const res = await fetch("/api/orders/requested/export/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        // Pass current tab so the server can adapt the PDF layout
        // (e.g., hide cost columns for Received / Delivered tabs)
        body: JSON.stringify({ orderIds: g.orderIds, tab: currentTab }),
      });

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to export PDF");
      }

      const blob = await res.blob();

      // filename from content-disposition
      const cd = res.headers.get("content-disposition") || "";
      let filename = "order.pdf";
      const m = cd.match(/filename\*=UTF-8''([^;]+)|filename=\"?([^;\"]+)\"?/i);
      if (m) filename = decodeURIComponent(m[1] || m[2] || filename);

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast("success", "Downloaded", "PDF downloaded.");
    } catch (e) {
      console.error(e);
      alert(e.message || "Failed to export PDF");
    } finally {
      if (pdfBtn) {
        pdfBtn.disabled = false;
        const prev = pdfBtn.dataset.prevHtml;
        if (prev) pdfBtn.innerHTML = prev;
        else pdfBtn.textContent = "Download PDF";
      }
    }
  }

  async function downloadMaintenancePdf(g) {
    if (!g || !g.orderIds || !g.orderIds.length || !maintenancePdfBtn) return;

    maintenancePdfBtn.disabled = true;
    maintenancePdfBtn.dataset.prevHtml = maintenancePdfBtn.innerHTML;
    maintenancePdfBtn.textContent = "Preparing...";

    try {
      const res = await fetch("/api/orders/requested/export/maintenance-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ orderIds: g.orderIds }),
      });

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to export maintenance PDF");
      }

      const blob = await res.blob();
      const cd = res.headers.get("content-disposition") || "";
      let filename = "maintenance_receipt.pdf";
      const m = cd.match(/filename\*=UTF-8''([^;]+)|filename="?([^;"]+)"?/i);
      if (m) filename = decodeURIComponent(m[1] || m[2] || filename);

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      toast("success", "Downloaded", "Maintenance PDF downloaded.");
    } catch (e) {
      console.error(e);
      toast("error", "Failed", e.message || "Failed to export maintenance PDF.");
    } finally {
      maintenancePdfBtn.disabled = false;
      const prev = maintenancePdfBtn.dataset.prevHtml;
      if (prev) maintenancePdfBtn.innerHTML = prev;
      else maintenancePdfBtn.innerHTML = '<i data-feather="download"></i> Download';
      if (window.feather) window.feather.replace();
    }
  }

async function postJson(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      throw new Error(data.error || "Request failed");
    }
    return data;
  }

    // ===== Edit quantity (writes to Notion: "Quantity Received by operations") =====
  let popEl = null, popForId = null, popAnchor = null;

  function destroyPopover() {
    if (popEl?.parentNode) popEl.parentNode.removeChild(popEl);
    popEl = null; popForId = null; popAnchor = null;
    document.removeEventListener("pointerdown", onDocPointerDown, true);
    document.removeEventListener("keydown", onPopEsc, true);
  }

  function onDocPointerDown(e) {
    if (!popEl) return;
    if (popEl.contains(e.target)) return;
    if (popAnchor && popAnchor.contains(e.target)) return;
    destroyPopover();
  }

  function onPopEsc(e) {
    if (e.key === "Escape") destroyPopover();
  }

  function placePopoverNear(btn) {
    const r = btn.getBoundingClientRect();
    const x = Math.min(window.innerWidth - 260, Math.max(8, r.right - 220));
    const y = Math.min(window.innerHeight - 140, r.bottom + 8);
    popEl.style.left = `${x + window.scrollX}px`;
    popEl.style.top  = `${y + window.scrollY}px`;
  }

  async function updateReceivedQty(itemId, value) {
    const id = String(itemId || "").trim();
    if (!id) throw new Error("Missing item id.");
    return postJson(`/api/orders/requested/${encodeURIComponent(id)}/received-quantity`, { value });
  }

  async function openQtyPopover(btn, id, mode = "set") {
    if (!btn || !id) return;
    if (popEl && popForId === id) { destroyPopover(); return; }
    destroyPopover();
    popForId = id; popAnchor = btn;

    const isAddMode = String(mode || "set") === "add";

    const it = allItems.find((x) => String(x.id) === String(id));
    const base = baseQty(it);
    const recRaw = receivedQtyDisplay(it);
    const rec = receivedQtyOrZero(it);
    const rem = remainingQty(it);

    const currentVal = isAddMode
      ? rem
      : (recRaw !== null && recRaw !== undefined ? recRaw : base);
    const minVal = isAddMode ? Math.min(rem, 0) : Math.min(base, 0);
    const maxVal = isAddMode ? Math.max(rem, 0) : Math.max(base, 0);

    popEl = document.createElement("div");
    popEl.className = "sv-qty-popover";
    popEl.innerHTML = `
      <div class="sv-qty-popover__arrow"></div>
      <div class="sv-qty-popover__body">
        ${isAddMode ? `<div class="sv-qty-hint">Receive quantity (remaining: ${escapeHTML(fmtQty(rem))})</div>` : ""}
        <div class="sv-qty-row">
          <button class="sv-qty-btn sv-qty-dec" type="button" aria-label="Decrease">−</button>
          <input class="sv-qty-input" type="number" min="${escapeHTML(String(minVal))}" max="${escapeHTML(String(maxVal))}" step="any" value="${escapeHTML(fmtQty(currentVal))}" />
          <button class="sv-qty-btn sv-qty-inc" type="button" aria-label="Increase">+</button>
        </div>
        <div class="sv-qty-actions">
          <button class="btn btn-success btn-xs ro-qty-save">${isAddMode ? "Receive" : "Save"}</button>
          <button class="btn btn-danger btn-xs ro-qty-cancel">Cancel</button>
        </div>
      </div>
    `;
    document.body.appendChild(popEl);
    placePopoverNear(btn);

    const input  = popEl.querySelector(".sv-qty-input");
    const decBtn = popEl.querySelector(".sv-qty-dec");
    const incBtn = popEl.querySelector(".sv-qty-inc");
    const saveBtn= popEl.querySelector(".ro-qty-save");
    const cancel = popEl.querySelector(".ro-qty-cancel");

    input.focus(); input.select();

    const clamp = (n) => {
      const raw = Number(n);
      const v = Number.isFinite(raw) ? roundQty(raw) : 0;
      if (v < minVal) return roundQty(minVal);
      if (v > maxVal) return roundQty(maxVal);
      return v;
    };

    decBtn.addEventListener("click", () => { input.value = fmtQty(clamp((Number(input.value) || 0) - 1)); });
    incBtn.addEventListener("click", () => { input.value = fmtQty(clamp((Number(input.value) || 0) + 1)); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") saveBtn.click(); });

    saveBtn.addEventListener("click", async () => {
      const v = clamp(input.value);
      try {
        const newReceived = isAddMode
          ? clampSignedToBase(base, roundQty(rec + v))
          : clampSignedToBase(base, v);

        // For "Remaining" tab, we delay the API call until "Received by operations" is clicked.
        if (currentTab === "remaining") {
          const idx = allItems.findIndex((x) => String(x.id) === String(id));
          if (idx >= 0) {
            allItems[idx].pendingReceived = newReceived;
            allItems[idx].pendingReceivedAdd = v; // used for display context if needed
            allItems[idx].pendingRemaining = roundQty(base - newReceived);
          }

          // Re-render to show pending state
          groups = buildGroups(allItems);
          const updated = activeGroup ? groups.find((x) => x.groupId === activeGroup.groupId) : null;
          render();
          if (updated && orderModal?.classList.contains("is-open")) {
            openOrderModal(updated);
          }

          toast("success", "Pending", "Update pending confirmation.");
          destroyPopover();
          return;
        }

        await updateReceivedQty(id, newReceived);

        // update in-memory data
        const idx = allItems.findIndex((x) => String(x.id) === String(id));
        if (idx >= 0) {
          allItems[idx].quantityReceived = newReceived;
          // Mark as an explicit ops edit (used to decide strike-through in "Not Started")
          allItems[idx].quantityReceivedEdited = true;
          // best-effort mirror for UI; backend is source of truth
          allItems[idx].quantityRemaining = roundQty(base - newReceived);
        }

        // rebuild + rerender (keep modal open)
        writeRequestedCache(allItems);
        groups = buildGroups(allItems);
        const updated = activeGroup ? groups.find((x) => x.groupId === activeGroup.groupId) : null;

        // If we just completed all remaining items, move the user to the "Received" tab automatically.
        if (currentTab === "remaining" && updated && !updated.hasRemaining) {
          currentTab = "received";
          updateTabUI();
        }

        render();

        if (updated && orderModal?.classList.contains("is-open")) {
          openOrderModal(updated);
        }

        toast("success", "Updated", "Quantity updated.");
        destroyPopover();
      } catch (e) {
        console.error(e);
        toast("error", "Failed", e.message || "Failed to update quantity.");
      }
    });

    cancel.addEventListener("click", destroyPopover);

    setTimeout(() => {
      document.addEventListener("pointerdown", onDocPointerDown, true);
      document.addEventListener("keydown", onPopEsc, true);
    }, 0);
  }

async function markReceivedByOperations(g, receiptNumber, extra = {}) {
    if (!g || !g.orderIds?.length) return;

    const isMaintenanceOrder = isMaintenanceOrderType(g.orderType || g.items?.[0]?.orderType);
    const issueDescriptionText = String(extra?.issueDescription || "").trim();

    // Receipt number can be text now (Notion column is rich_text) so we keep it as string.
    // If missing, we still allow the action.
    const rnList = normalizeReceiptNumbers(receiptNumber);
    const rnText = rnList.join("\n").trim();
    const rnVal = rnText ? rnText : null;

    if (shippedBtn) {
      shippedBtn.disabled = true;
      shippedBtn.dataset.prevHtml = shippedBtn.innerHTML;
      shippedBtn.textContent = isMaintenanceOrder ? "Requesting..." : "Receiving...";
    }

    try {
      // Collect quantity updates for the items in this group.
      //
      // IMPORTANT (Remaining tab behavior):
      // - Default: add the current "Quantity Remaining" to "Quantity Received by operations"
      // - If the user edited the remaining qty (popover), we add the edited value instead.
      //
      // The backend expects *absolute* received totals per item (not the delta),
      // so we send the final received number for each affected item.
      const quantities = {};
      const isRemainingTab = currentTab === "remaining";

      (g.items || []).forEach((it) => {
        const id = String(it?.id || "").trim();
        if (!id) return;

        const base = baseQty(it);
        const clampToBase = (n) => clampSignedToBase(base, n);

        // If the user edited this item in Remaining tab, use the pending absolute received value.
        if (it.pendingReceived !== undefined && it.pendingReceived !== null) {
          const raw = Number(it.pendingReceived);
          const v = Number.isFinite(raw) ? roundQty(raw) : 0;
          quantities[id] = clampToBase(v);
          return;
        }

        // Remaining tab default: receive the full remaining quantity.
        if (isRemainingTab) {
          const recNow = receivedQtyOrZero(it);
          const remNow = remainingQty(it);

          // Only update items that still have remaining qty.
          if (hasRemainingQty(it)) {
            const nextReceived = clampToBase(roundQty(recNow + remNow));
            quantities[id] = nextReceived;
          }
        }
      });

      const data = await postJson("/api/orders/requested/mark-shipped", {
        orderIds: g.orderIds,
        receiptNumber: rnVal,
        quantities,
        issueDescription: issueDescriptionText || null,
      });

      // Update local state (set status = Shipped + operationsByName)
      const username = String(data.operationsByName || localStorage.getItem("username") || "").trim();
      const idSet = new Set(g.orderIds);

      allItems.forEach((it) => {
        if (!idSet.has(it.id)) return;

        // Capture previous state for visual feedback in Remaining tab
        it.previousRemaining = remainingQty(it);
        it.justUpdated = true;

        it.status = "Shipped";
        it.statusColor = data.statusColor || it.statusColor;
        if (username) it.operationsByName = username;
        if (data.receiptNumber !== null && data.receiptNumber !== undefined) {
          it.receiptNumber = data.receiptNumber;
        }
        if (issueDescriptionText) {
          it.issueDescription = data?.issueDescription || issueDescriptionText;
        }

        const base = baseQty(it);

        // Remaining tab: apply the new absolute received totals we just confirmed.
        // This ensures "Quantity Remaining" is subtracted correctly.
        if (currentTab === "remaining") {
          const hasQty = Object.prototype.hasOwnProperty.call(quantities || {}, it.id);
          if (hasQty) {
            const raw = Number(quantities[it.id]);
            const nextReceived = Number.isFinite(raw) ? roundQty(raw) : 0;
            it.quantityReceived = clampSignedToBase(base, nextReceived);
            it.quantityReceivedEdited = true;
            it.quantityRemaining = roundQty(base - it.quantityReceived);

            // Clear any pending UI state for this item
            delete it.pendingReceived;
            delete it.pendingRemaining;
            delete it.pendingReceivedAdd;
          } else {
            // No quantity update for this item; keep values but ensure remaining is consistent.
            const rec = receivedQtyOrZero(it);
            it.quantityRemaining = roundQty(base - rec);
          }
          return;
        }

        // Non-Remaining tabs (existing behavior):
        // - If item was never edited, fill full base qty.
        // - If edited, keep the edited value.
        // - If there was a pending update (rare outside Remaining), apply it.
        if (it.pendingReceived !== undefined && it.pendingReceived !== null) {
          const raw = Number(it.pendingReceived);
          it.quantityReceived = clampSignedToBase(base, Number.isFinite(raw) ? roundQty(raw) : 0);
          it.quantityReceivedEdited = true;
          delete it.pendingReceived;
          delete it.pendingRemaining;
          delete it.pendingReceivedAdd;
        }

        const edited = !!it.quantityReceivedEdited;
        if (!edited) {
          it.quantityReceived = base;
          it.quantityRemaining = 0;
        } else {
          const rec = receivedQtyOrZero(it);
          it.quantityRemaining = roundQty(base - rec);
        }
      });

      writeRequestedCache(allItems);

      groups = buildGroups(allItems);
      if (isMaintenanceOrder && !isMaintenancePage) {
        currentTab = "received";
        updateTabUI();
      }
      render();

      // Keep modal open and refreshed, except maintenance orders that move to Maintenance Orders page.
      const updated = groups.find((x) => x.groupId === g.groupId);
      if (isMaintenanceOrder && !isMaintenancePage) {
        closeOrderModal();
      } else if (updated && orderModal?.classList.contains("is-open")) {
        openOrderModal(updated);
      }

      toast(
        "success",
        isMaintenanceOrder ? "Requested" : "Received",
        isMaintenanceOrder ? "Technical visit requested." : "Marked as received by operations.",
      );

      // Close receipt prompt (if opened)
      closeReceiptModal({ restoreFocus: false });
    } catch (e) {
      console.error(e);
      const message = e.message || (isMaintenanceOrder ? "Failed to request technical visit." : "Failed to mark as received.");
      if (isMaintenanceOrder && isTechVisitOpen()) {
        setTechVisitError(message);
      } else {
        alert(message);
      }
    } finally {
      if (shippedBtn) {
        shippedBtn.disabled = false;
        const prev = shippedBtn.dataset.prevHtml;
        if (prev) shippedBtn.innerHTML = prev;
        else shippedBtn.textContent = isMaintenanceOrder ? "Request Technical Visit" : "Received by operations";
      }
    }
  }

  async function saveMaintenanceLog(g, payload = {}) {
    if (!g || !g.orderIds?.length) return;

    const resolutionMethod = String(payload?.resolutionMethod || "").trim();
    const actualIssueDescription = String(payload?.actualIssueDescription || "").trim();
    const repairAction = String(payload?.repairAction || "").trim();
    const sparePartIds = toStringArray(payload?.sparePartIds ?? payload?.sparePartId);
    const sparePartNames = toStringArray(payload?.sparePartNames, { splitComma: true });

    if (maintenanceLogConfirmBtn) {
      maintenanceLogConfirmBtn.disabled = true;
      maintenanceLogConfirmBtn.dataset.prevHtml = maintenanceLogConfirmBtn.innerHTML;
      maintenanceLogConfirmBtn.textContent = "Saving...";
    }
    if (maintenanceLogCancelBtn) maintenanceLogCancelBtn.disabled = true;
    if (maintenanceLogCloseBtn) maintenanceLogCloseBtn.disabled = true;

    try {
      const data = await postJson("/api/orders/requested/log-maintenance", {
        orderIds: g.orderIds,
        resolutionMethod,
        actualIssueDescription,
        repairAction,
        sparePartIds,
        sparePartNames,
      });

      const selectedSparePartIds = toStringArray(data?.sparePartsReplacedIds ?? sparePartIds);
      const selectedSparePartLabels = toStringArray(
        data?.sparePartsReplacedNames?.length
          ? data.sparePartsReplacedNames
          : getSelectSelectedLabels(maintenanceSparePartSelect),
        { splitComma: true },
      );
      const selectedSparePartLabel = toStringArray(data?.sparePartsReplacedName || selectedSparePartLabels).join(", ");
      const idSet = new Set(g.orderIds);

      allItems.forEach((it) => {
        if (!idSet.has(it.id)) return;
        it.resolutionMethod = data?.resolutionMethod || resolutionMethod || null;
        it.actualIssueDescription = data?.actualIssueDescription || actualIssueDescription || null;
        it.repairAction = data?.repairAction || repairAction || null;
        it.sparePartsReplacedIds = selectedSparePartIds;
        it.sparePartsReplacedId = selectedSparePartIds[0] || null;
        it.sparePartsReplacedNames = selectedSparePartLabels;
        it.sparePartsReplacedName = selectedSparePartLabel || null;
      });

      writeRequestedCache(allItems);
      groups = buildGroups(allItems);
      render();

      const updated = groups.find((x) => x.groupId === g.groupId);
      if (updated && orderModal?.classList.contains("is-open")) {
        openOrderModal(updated);
      }

      closeMaintenanceLogModal({ restoreFocus: false });
      toast("success", "Saved", "Maintenance log saved.");
    } catch (e) {
      console.error(e);
      setMaintenanceLogError(e.message || "Failed to save maintenance log.");
      toast("error", "Failed", e.message || "Failed to save maintenance log.");
    } finally {
      if (maintenanceLogConfirmBtn) {
        maintenanceLogConfirmBtn.disabled = false;
        const prev = maintenanceLogConfirmBtn.dataset.prevHtml;
        if (prev) maintenanceLogConfirmBtn.innerHTML = prev;
        else maintenanceLogConfirmBtn.textContent = "Confirm";
      }
      if (maintenanceLogCancelBtn) maintenanceLogCancelBtn.disabled = false;
      if (maintenanceLogCloseBtn) maintenanceLogCloseBtn.disabled = false;
      if (window.feather) window.feather.replace();
    }
  }

  async function markArrived(g, extra = {}) {
    if (!g || !g.orderIds?.length) return;

    const orderReceiptDataUrls = toStringArray(
      extra?.orderReceiptDataUrls ?? extra?.orderReceiptDataUrl ?? extra?.maintenanceReceiptDataUrls ?? extra?.maintenanceReceiptDataUrl,
    );
    const orderReceiptFilenames = toStringArray(
      extra?.orderReceiptFilenames ?? extra?.orderReceiptFilename ?? extra?.maintenanceReceiptFilenames ?? extra?.maintenanceReceiptFilename,
    );
    const receiptNumbers = normalizeReceiptNumbers(
      extra?.receiptNumbers ?? extra?.receiptNumber,
    );
    const silent = !!extra?.silent;

    if (arrivedBtn) {
      arrivedBtn.disabled = true;
      arrivedBtn.dataset.prevHtml = arrivedBtn.innerHTML;
      arrivedBtn.textContent = "Marking...";
    }

    try {
      const data = await postJson("/api/orders/requested/mark-arrived", {
        orderIds: g.orderIds,
        orderReceiptDataUrls,
        orderReceiptFilenames,
        receiptNumbers,
      });

      const idSet = new Set(g.orderIds);
      const primaryReceiptPageId = String(data?.primaryReceiptPageId || g.orderIds?.[0] || "").trim();
      const nextOrderReceiptUrls = toStringArray(data?.orderReceiptUrls ?? data?.orderReceiptUrl);
      const nextOrderReceiptNames = toStringArray(data?.orderReceiptNames ?? data?.orderReceiptName);
      const nextMaintenanceReceiptUrls = toStringArray(data?.maintenanceReceiptUrls ?? data?.maintenanceReceiptUrl);
      const nextMaintenanceReceiptNames = toStringArray(data?.maintenanceReceiptNames ?? data?.maintenanceReceiptName);

      allItems.forEach((it) => {
        if (!idSet.has(it.id)) return;
        const isReceiptHolder = !!primaryReceiptPageId && String(it.id || "").trim() === primaryReceiptPageId;
        it.status = "Arrived";
        it.statusColor = data.statusColor || it.statusColor;
        it.orderReceiptUrls = isReceiptHolder ? nextOrderReceiptUrls.slice() : [];
        it.orderReceiptNames = isReceiptHolder ? nextOrderReceiptNames.slice() : [];
        it.orderReceiptUrl = it.orderReceiptUrls[0] || null;
        it.orderReceiptName = it.orderReceiptNames[0] || null;
        it.maintenanceReceiptUrls = isReceiptHolder ? nextMaintenanceReceiptUrls.slice() : [];
        it.maintenanceReceiptNames = isReceiptHolder ? nextMaintenanceReceiptNames.slice() : [];
        it.maintenanceReceiptUrl = it.maintenanceReceiptUrls[0] || null;
        it.maintenanceReceiptName = it.maintenanceReceiptNames[0] || null;
        if (data?.receiptNumber !== null && data?.receiptNumber !== undefined) {
          it.receiptNumber = data.receiptNumber;
        }
      });

      writeRequestedCache(allItems);

      groups = buildGroups(allItems);
      render();

      const updated = groups.find((x) => x.groupId === g.groupId);
      if (updated && orderModal?.classList.contains("is-open")) {
        openOrderModal(updated);
      }

      toast("success", "Delivered", "Marked as delivered.");
      return data;
    } catch (e) {
      console.error(e);
      if (!silent) alert(e.message || "Failed to mark as delivered.");
      throw e;
    } finally {
      if (arrivedBtn) {
        arrivedBtn.disabled = false;
        const prev = arrivedBtn.dataset.prevHtml;
        if (prev) arrivedBtn.innerHTML = prev;
        else arrivedBtn.textContent = "Mark as Delivered";
      }
    }
  }

  async function createRepeatOrderFromDelivered(g, config) {
    if (!g || !g.orderIds?.length || !config?.endpoint) return;

    if (createWithdrawalBtn) {
      createWithdrawalBtn.disabled = true;
      createWithdrawalBtn.dataset.prevHtml = createWithdrawalBtn.innerHTML;
      createWithdrawalBtn.textContent = "Creating...";
    }

    try {
      const data = await postJson(config.endpoint, {
        orderIds: g.orderIds,
      });

      clearRequestedCache();
      closeOrderModal();
      currentTab = "not-started";
      updateTabUI();
      await loadRequested();

      toast(
        "success",
        "Created",
        data?.message || config.successMessage || "Order created in Not Started.",
      );
    } catch (e) {
      console.error(e);
      toast("error", "Failed", e.message || config.errorMessage || "Failed to create order.");
    } finally {
      if (createWithdrawalBtn) {
        createWithdrawalBtn.disabled = false;
        const prev = createWithdrawalBtn.dataset.prevHtml;
        if (prev) createWithdrawalBtn.innerHTML = prev;
        else createWithdrawalBtn.innerHTML = `<i data-feather="repeat"></i> ${config?.label || "Create Order"}`;
      }
      if (window.feather) window.feather.replace();
    }
  }

  async function createWithdrawalFromDelivered(g) {
    await createRepeatOrderFromDelivered(g, {
      label: "Create Withdrawal",
      endpoint: "/api/orders/requested/create-withdrawal",
      successMessage: "Withdrawal order created in Not Started.",
      errorMessage: "Failed to create withdrawal order.",
    });
  }

  async function createDeliveryFromDelivered(g) {
    await createRepeatOrderFromDelivered(g, {
      label: "Create Delivery",
      endpoint: "/api/orders/requested/create-delivery",
      successMessage: "Delivery order created in Not Started.",
      errorMessage: "Failed to create delivery order.",
    });
  }


  // ---------- Load data ----------
    async function loadRequested() {
    const cached = readRequestedCache();
    const hasCache = !!(cached && Array.isArray(cached.data));
    const loadingLabel = isMaintenancePage ? "Loading maintenance orders" : "Loading requested orders";

    // Render cached data immediately (if available)
    if (hasCache) {
      allItems = cached.data;
      groups = buildGroups(allItems);
      render();

      // If cache is still fresh, skip the network request.
      if (!cached.stale) return;
    } else if (listDiv) {
      // No cache → show loading state
      listDiv.innerHTML = `
        <div class="modern-loading" role="status" aria-live="polite">
          <div class="modern-loading__spinner" aria-hidden="true"></div>
          <div class="modern-loading__text">
            ${loadingLabel}
            <span class="modern-loading__dots" aria-hidden="true"><span></span><span></span><span></span></span>
          </div>
        </div>
      `;
      if (window.feather) window.feather.replace();
    }

    try {
      const res = await fetch("/api/orders/requested", {
        credentials: "same-origin",
        cache: "no-store",
      });

      if (res.status === 401) {
        window.location.href = "/login";
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to fetch requested orders");
      }

      const data = await res.json().catch(() => []);
      allItems = Array.isArray(data) ? data : [];
      writeRequestedCache(allItems);

      groups = buildGroups(allItems);
      render();
    } catch (e) {
      // If we already rendered cached data, keep it (best-effort)
      if (!hasCache) throw e;
      console.warn("loadRequested() fetch failed; using cached data.", e);
    }
  }

  // ---------- Events ----------
  // Debounced search to avoid re-rendering on every keystroke (helps performance)
  let _reqSearchT = null;
  searchInput?.addEventListener("input", () => {
    clearTimeout(_reqSearchT);
    _reqSearchT = setTimeout(() => render(), 150);
  });
  searchInput?.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      searchInput.value = "";
      render();
    }
  });

  // Tabs: switch in-place (avoid full page reload)
  tabsWrap?.addEventListener("click", (e) => {
    const a = e.target?.closest?.("a.tab-portfolio");
    if (!a) return;

    const t = norm(a.getAttribute("data-tab"));
    if (!t || t === currentTab) return;

    // Tabs are anchors in the HTML; prevent navigation so the page doesn't refresh.
    e.preventDefault();

    currentTab = t;
    updateTabUI();
    render();
  });

  modalClose?.addEventListener("click", closeOrderModal);
  orderModal?.addEventListener("click", (e) => {
    if (e.target === orderModal) closeOrderModal();
  });

  // Download dropdown
  if (downloadMenuBtn && downloadMenuPanel && downloadMenuWrap) {
    downloadMenuBtn.addEventListener("click", (e) => {
      e.preventDefault();
      toggleDownloadMenu();
    });

    // Click outside closes
    document.addEventListener("click", (e) => {
      if (!downloadMenuPanel || downloadMenuPanel.hidden) return;
      if (downloadMenuWrap.contains(e.target)) return;
      closeDownloadMenu();
    });
  }

  // Receipt modal: click outside closes
  receiptModal?.addEventListener("click", (e) => {
    if (e.target === receiptModal) closeReceiptModal();
  });
  techVisitModal?.addEventListener("click", (e) => {
    if (e.target === techVisitModal) closeTechVisitModal();
  });
  maintenanceLogModal?.addEventListener("click", (e) => {
    if (e.target === maintenanceLogModal) closeMaintenanceLogModal();
  });
  maintenanceReceiptModal?.addEventListener("click", (e) => {
    if (e.target === maintenanceReceiptModal) closeMaintenanceReceiptModal();
  });

  // Global Esc handling (close sub-modal -> dropdown -> main modal)
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;

    if (openModernSelect) {
      e.preventDefault();
      closeModernSelect(openModernSelect);
      return;
    }

    if (isMaintenanceLogOpen()) {
      e.preventDefault();
      closeMaintenanceLogModal();
      return;
    }

    if (isMaintenanceReceiptOpen()) {
      e.preventDefault();
      closeMaintenanceReceiptModal();
      return;
    }

    if (isTechVisitOpen()) {
      e.preventDefault();
      closeTechVisitModal();
      return;
    }

    if (isReceiptOpen()) {
      e.preventDefault();
      closeReceiptModal();
      return;
    }

    if (downloadMenuPanel && !downloadMenuPanel.hidden) {
      e.preventDefault();
      closeDownloadMenu();
      return;
    }

    if (orderModal?.classList.contains("is-open")) {
      e.preventDefault();
      closeOrderModal();
    }
  });

  modalItems?.addEventListener("click", (e) => {
    const btn = e.target.closest("button.ro-edit");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    openQtyPopover(btn, btn.dataset.id, currentTab === "remaining" ? "add" : "set");
  });

  excelBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    closeDownloadMenu();
    downloadExcel(activeGroup);
  });
  pdfBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    closeDownloadMenu();
    downloadPdf(activeGroup);
  });
  maintenancePdfBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    closeDownloadMenu();
    downloadMaintenancePdf(activeGroup);
  });

  // Request Products use the receipt modal.
  // Withdraw Products moves the store receipt step to the Delivered modal.
  // Request Maintenance skips the receipt modal and moves directly to Shipped.
  shippedBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    closeDownloadMenu();
    const orderType = activeGroup?.orderType || activeGroup?.items?.[0]?.orderType;
    const isMaintenanceOrder = isMaintenanceOrderType(orderType);
    if (isMaintenanceOrder) {
      openTechVisitModal();
      return;
    }
    if (isWithdrawalOrderType(orderType)) {
      await markReceivedByOperations(activeGroup, null);
      return;
    }
    openReceiptModal();
  });
  arrivedBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    closeDownloadMenu();
    if (maintenanceReceiptModal) {
      openMaintenanceReceiptModal();
      return;
    }
    alert("Receipt upload form is unavailable.");
  });
  logMaintenanceBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    setMaintenanceLogError("");
    await openMaintenanceLogModal();
  });
  createWithdrawalBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    closeDownloadMenu();
    const repeatAction = getDeliveredRepeatActionConfig(activeGroup, activeGroup?.items?.[0]);
    if (!repeatAction) return;
    if (repeatAction.key === "delivery") {
      createDeliveryFromDelivered(activeGroup);
      return;
    }
    createWithdrawalFromDelivered(activeGroup);
  });

  techVisitCloseBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    closeTechVisitModal();
  });
  techVisitCancelBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    closeTechVisitModal();
  });
  techVisitIssueInput?.addEventListener("input", () => {
    if (techVisitError?.textContent) setTechVisitError("");
  });
  techVisitConfirmBtn?.addEventListener("click", async (e) => {
    e.preventDefault();

    const issueDescription = String(techVisitIssueInput?.value || "").trim();
    if (!issueDescription) {
      setTechVisitError("Issue description is required.");
      return;
    }

    setTechVisitError("");

    if (techVisitConfirmBtn) techVisitConfirmBtn.disabled = true;
    if (techVisitCancelBtn) techVisitCancelBtn.disabled = true;
    if (techVisitCloseBtn) techVisitCloseBtn.disabled = true;

    try {
      await markReceivedByOperations(activeGroup, null, { issueDescription });
      closeTechVisitModal({ restoreFocus: false });
    } finally {
      if (techVisitConfirmBtn) techVisitConfirmBtn.disabled = false;
      if (techVisitCancelBtn) techVisitCancelBtn.disabled = false;
      if (techVisitCloseBtn) techVisitCloseBtn.disabled = false;
    }
  });

  maintenanceLogCloseBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    closeMaintenanceLogModal();
  });
  maintenanceLogCancelBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    closeMaintenanceLogModal();
  });
  maintenanceResolutionSelect?.addEventListener("change", () => {
    if (maintenanceLogError?.textContent) setMaintenanceLogError("");
  });
  maintenanceActualIssueInput?.addEventListener("input", () => {
    if (maintenanceLogError?.textContent) setMaintenanceLogError("");
  });
  maintenanceRepairActionInput?.addEventListener("input", () => {
    if (maintenanceLogError?.textContent) setMaintenanceLogError("");
  });
  maintenanceSparePartSelect?.addEventListener("change", () => {
    if (maintenanceLogError?.textContent) setMaintenanceLogError("");
  });
  maintenanceLogConfirmBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    setMaintenanceLogError("");

    await saveMaintenanceLog(activeGroup, {
      resolutionMethod: maintenanceResolutionSelect?.value || "",
      actualIssueDescription: maintenanceActualIssueInput?.value || "",
      repairAction: maintenanceRepairActionInput?.value || "",
      sparePartIds: getSelectSelectedValues(maintenanceSparePartSelect),
      sparePartNames: getSelectSelectedLabels(maintenanceSparePartSelect),
    });
  });

  maintenanceReceiptChooseBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    maintenanceReceiptInput?.click();
  });
  maintenanceReceiptInput?.addEventListener("change", () => {
    updateMaintenanceReceiptUI(Array.from(maintenanceReceiptInput.files || []));
    if (maintenanceReceiptError?.textContent) setMaintenanceReceiptError("");
  });
  maintenanceReceiptNumbersWrap?.addEventListener("keydown", (e) => {
    const target = e.target;
    if (!target || !target.matches(DELIVERY_RECEIPT_INPUT_SELECTOR)) return;
    if (e.key === "Enter") {
      e.preventDefault();
      maintenanceReceiptConfirmBtn?.click();
    }
  });
  maintenanceReceiptNumbersWrap?.addEventListener("input", () => {
    if (maintenanceReceiptError?.textContent) setMaintenanceReceiptError("");
  });
  maintenanceReceiptNumbersWrap?.addEventListener("click", (e) => {
    const removeBtn = e.target?.closest?.('.co-submodal-input-remove[data-remove-input="delivery-receipt"]');
    if (!removeBtn) return;
    e.preventDefault();
    if (maintenanceReceiptError?.textContent) setMaintenanceReceiptError("");
    removeExtraReceiptInput(removeBtn, { kind: "delivery-receipt" });
  });
  maintenanceAddReceiptBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    setMaintenanceReceiptError("");
    addDeliveryReceiptInput("");
  });
  maintenanceReceiptCloseBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    closeMaintenanceReceiptModal();
  });
  maintenanceReceiptCancelBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    closeMaintenanceReceiptModal();
  });
  maintenanceReceiptConfirmBtn?.addEventListener("click", async (e) => {
    e.preventDefault();
    const files = Array.from(maintenanceReceiptInput?.files || []).filter(Boolean);
    const orderType = activeGroup?.orderType || activeGroup?.items?.[0]?.orderType;
    const isWithdrawalOrder = isWithdrawalOrderType(orderType);
    const receiptNumbers = isWithdrawalOrder ? collectDeliveryReceiptNumbers() : { error: "", values: [] };

    if (!files.length) {
      setMaintenanceReceiptError("Please upload at least one signed report image.");
      return;
    }

    if (receiptNumbers.error) {
      setMaintenanceReceiptError(receiptNumbers.error);
      return;
    }

    setMaintenanceReceiptError("");
    maintenanceReceiptConfirmBtn.disabled = true;
    if (maintenanceReceiptCancelBtn) maintenanceReceiptCancelBtn.disabled = true;
    if (maintenanceReceiptCloseBtn) maintenanceReceiptCloseBtn.disabled = true;
    if (maintenanceReceiptChooseBtn) maintenanceReceiptChooseBtn.disabled = true;
    if (maintenanceAddReceiptBtn) maintenanceAddReceiptBtn.disabled = true;

    try {
      const dataUrls = await Promise.all(files.map((file) => fileToDataUrl(file)));
      await markArrived(activeGroup, {
        orderReceiptDataUrls: dataUrls.map((item) => String(item || "")).filter(Boolean),
        orderReceiptFilenames: files.map((file) => file.name || "order-receipt.jpg"),
        receiptNumbers: receiptNumbers.values,
        silent: true,
      });
      closeMaintenanceReceiptModal({ restoreFocus: false });
    } catch (err) {
      setMaintenanceReceiptError(err?.message || "Failed to mark as delivered.");
    } finally {
      maintenanceReceiptConfirmBtn.disabled = false;
      if (maintenanceReceiptCancelBtn) maintenanceReceiptCancelBtn.disabled = false;
      if (maintenanceReceiptCloseBtn) maintenanceReceiptCloseBtn.disabled = false;
      if (maintenanceReceiptChooseBtn) maintenanceReceiptChooseBtn.disabled = false;
      if (maintenanceAddReceiptBtn) maintenanceAddReceiptBtn.disabled = false;
    }
  });

  receiptCloseBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    closeReceiptModal();
  });
  receiptCancelBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    closeReceiptModal();
  });

  receiptInputsWrap?.addEventListener("keydown", (e) => {
    const target = e.target;
    if (!target || !target.matches(RECEIPT_INPUT_SELECTOR)) return;
    if (e.key === "Enter") {
      e.preventDefault();
      receiptConfirmBtn?.click();
    }
  });

  receiptInputsWrap?.addEventListener("input", () => {
    if (receiptError?.textContent) setReceiptError("");
  });
  receiptInputsWrap?.addEventListener("click", (e) => {
    const removeBtn = e.target?.closest?.('.co-submodal-input-remove[data-remove-input="receipt"]');
    if (!removeBtn) return;
    e.preventDefault();
    if (receiptError?.textContent) setReceiptError("");
    removeExtraReceiptInput(removeBtn, { kind: "receipt" });
  });

  addReceiptBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    setReceiptError("");
    addReceiptInput("");
  });

  receiptConfirmBtn?.addEventListener("click", async (e) => {
    e.preventDefault();

    const { error, values } = collectReceiptNumbers();
    if (error) {
      setReceiptError(error);
      return;
    }

    setReceiptError("");

    // Disable sub-modal buttons while saving
    if (receiptConfirmBtn) receiptConfirmBtn.disabled = true;
    if (receiptCancelBtn) receiptCancelBtn.disabled = true;
    if (receiptCloseBtn) receiptCloseBtn.disabled = true;
    if (addReceiptBtn) addReceiptBtn.disabled = true;

    try {
      await markReceivedByOperations(activeGroup, values);
    } finally {
      // Buttons are re-enabled when the modal opens again; keep it simple.
      // (closeReceiptModal is called on success)
      if (receiptConfirmBtn) receiptConfirmBtn.disabled = false;
      if (receiptCancelBtn) receiptCancelBtn.disabled = false;
      if (receiptCloseBtn) receiptCloseBtn.disabled = false;
      if (addReceiptBtn) addReceiptBtn.disabled = false;
    }
  });

  // ---------- Init ----------
  currentTab = readTabFromUrl();
  updateTabUI();

  loadRequested().catch((e) => {
    console.error(e);
    if (listDiv) listDiv.innerHTML = `<p style="color:#B91C1C;">${escapeHTML(e.message || "Failed to load")}</p>`;
  });
});
