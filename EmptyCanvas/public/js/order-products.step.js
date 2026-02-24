// public/js/order-products.step.js
// Create New Order (Products) — Shopping Cart UI
(() => {
  /**
   * Draft model (stored in session on server):
   *   [{ id: string, quantity: number, reason: string }]
   *
   * Feb 2026 update:
   * - Reason is collected ONCE per order (in the Order Summary card)
   * - The backend still expects `reason` on each item, so we copy the global reason
   *   into every cart item before saving/submitting.
   */

  // ---------------------------- DOM ----------------------------
  const cartItemsEl = document.getElementById('cartItems');
  const updateCartBtn = document.getElementById('updateCartBtn');
  const checkoutBtn = document.getElementById('checkoutBtn');

  const passwordInput = document.getElementById('voucherInput');
  const reasonInput = document.getElementById('orderReasonSummary');

  const summarySubTotalEl = document.getElementById('summarySubTotal');
  const summaryTotalEl = document.getElementById('summaryTotal');

  const modalEl = document.getElementById('updateCartModal');
  const modalCloseBtn = document.getElementById('updateCartClose');
  const addToCartBtn = document.getElementById('addToCartBtn');
  const componentSelectEl = document.getElementById('cartComponentSelect');
  const qtyInputEl = document.getElementById('cartQtyInput');

  const savingOverlayEl = document.getElementById('cartSavingOverlay');
  const savingTextEl = document.getElementById('cartSavingText');

  // When opened from Current Orders -> Edit, we add ?edit=1
  const isEditMode = new URLSearchParams(window.location.search).get('edit') === '1';

  // ---------------------------- UI helpers ----------------------------
  function toast(type, title, message) {
    if (window.UI && typeof window.UI.toast === 'function') {
      window.UI.toast({ type, title, message });
      return;
    }
    alert([title, message].filter(Boolean).join('\n'));
  }

  // ---------------------------- Autofill guards ----------------------------
  // Mobile Chrome sometimes treats the Reason + Password fields like a login form
  // and auto-fills username/password. We explicitly disable autofill and clear any
  // prefilled values so the user must type them.
  function hardDisableAutofill(el, { clearNow = true } = {}) {
    if (!el) return;

    // Keep readonly until user focuses (prevents many autofill flows)
    try {
      el.setAttribute('readonly', 'readonly');

      // On mobile, focusing a readonly input often prevents the keyboard from
      // opening on the first tap. Remove readonly *before* focus when the user
      // interacts (pointerdown/touch), and keep the focus handler as a fallback.
      const unlock = () => {
        try { el.removeAttribute('readonly'); } catch {}
      };
      el.addEventListener('pointerdown', unlock, { once: true, capture: true });
      el.addEventListener('touchstart', unlock, { once: true, capture: true });
      el.addEventListener('mousedown', unlock, { once: true, capture: true });

      el.addEventListener(
        'focus',
        () => {
          try { el.removeAttribute('readonly'); } catch {}
        },
        { once: true },
      );
    } catch {}

    // Clear any values that were injected by the browser/password manager.
    if (clearNow) {
      try { el.value = ''; } catch {}
    }

    // If the browser tries to autofill later (often without user interaction),
    // clear it unless the user actually interacted with the field.
    let userInteracted = false;
    el.addEventListener('keydown', () => (userInteracted = true));
    el.addEventListener('paste', () => (userInteracted = true));
    el.addEventListener('input', () => {
      if (document.activeElement === el) userInteracted = true;
    });

    const clearIfInjected = () => {
      if (userInteracted) return;
      if (document.activeElement === el) return;
      if (String(el.value || '').trim()) {
        try { el.value = ''; } catch {}
      }
    };

    // Run a few times after paint (Chrome sometimes autofills after load)
    window.setTimeout(clearIfInjected, 0);
    window.setTimeout(clearIfInjected, 200);
    window.setTimeout(clearIfInjected, 800);

    // Also watch for silent autofill triggers
    el.addEventListener('change', clearIfInjected);
  }

  function showSaving(text = 'Saving...') {
    if (!savingOverlayEl) return;
    if (savingTextEl) savingTextEl.textContent = text;
    savingOverlayEl.style.display = 'flex';
    savingOverlayEl.setAttribute('aria-hidden', 'false');
  }

  function hideSaving() {
    if (!savingOverlayEl) return;
    savingOverlayEl.style.display = 'none';
    savingOverlayEl.setAttribute('aria-hidden', 'true');
  }

  function formatMoney(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    const hasDecimals = Math.abs(n - Math.round(n)) > 1e-9;
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: hasDecimals ? 2 : 0,
        maximumFractionDigits: hasDecimals ? 2 : 0,
      }).format(n);
    } catch {
      const fixed = hasDecimals ? n.toFixed(2) : String(Math.round(n));
      return '$' + fixed;
    }
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function safeHttpUrl(maybeUrl) {
    try {
      if (!maybeUrl) return null;
      const u = new URL(String(maybeUrl));
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
      return u.toString();
    } catch {
      return null;
    }
  }

  // Convert 1..N to Arabic-Indic digits: ١٢٣...
  function toArabicIndicDigits(num) {
    const map = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩'];
    return String(num)
      .split('')
      .map((ch) => (ch >= '0' && ch <= '9' ? map[ch.charCodeAt(0) - 48] : ch))
      .join('');
  }

  // ---------------------------- State ----------------------------
  const MIN_QTY = 0.01;

  let components = []; // [{id,name,url,unitPrice,imageUrl,displayId}]
  let byId = new Map();
  let cart = []; // [{id, quantity, reason}]

  let globalReason = '';

  let choicesInst = null;
  let choicesShowHandler = null;
  let choicesHideHandler = null;
  let saveTimer = null;
  let isSavingNow = false;
  let editingId = null; // when modal opened for editing an existing cart item

  let componentsLoaded = false;
  let readyToUse = false; // reason + components loaded

  // Preload promises
  let componentsPromise = null;
  let draftPromise = null;

  // Avoid double init races if the modal is opened while components are loading
  let ensureComponentsPromise = null;

  // ---------------------------- Data loading ----------------------------
  async function loadComponents() {
    try {
      const res = await fetch('/api/components');
      if (!res.ok) throw new Error(await res.text());
      const list = await res.json();
      components = Array.isArray(list) ? list : [];
      byId = new Map(components.map((c) => [String(c.id), c]));
      return true;
    } catch (err) {
      console.error('Failed to load components:', err);
      components = [];
      byId = new Map();
      return false;
    }
  }

  async function loadDraft() {
    try {
      const res = await fetch('/api/order-draft');
      if (!res.ok) return true;
      const d = await res.json();
      const list = Array.isArray(d.products) ? d.products : [];
      cart = list
        .map((p) => ({
          id: String(p.id || ''),
          quantity: normalizeQty(Number(p.quantity), 1),
          reason: String(p.reason || '').trim(),
        }))
        .filter((p) => p.id);
      return true;
    } catch {
      return true; // ignore
    }
  }

  function startPreload() {
    if (!componentsPromise) componentsPromise = loadComponents();
    if (!draftPromise) draftPromise = loadDraft();
    return { componentsPromise, draftPromise };
  }

  async function ensureComponentsReady() {
    if (componentsLoaded) return true;
    if (ensureComponentsPromise) return ensureComponentsPromise;

    ensureComponentsPromise = (async () => {
      // Ensure the fetch has started
      if (!componentsPromise) startPreload();

      try { await componentsPromise; } catch {}

      if (!Array.isArray(components) || components.length === 0) return false;

      initComponentChoices();
      componentsLoaded = true;
      updateReady();
      return true;
    })().finally(() => {
      ensureComponentsPromise = null;
    });

    return ensureComponentsPromise;
  }

  // ---------------------------- Ready gating ----------------------------
  function setReady(isReady) {
    readyToUse = Boolean(isReady);
    // Do NOT disable the "Update Cart" button.
    // We keep validation on "Add/Update" and on checkout.
  }

  function updateReady() {
    const hasReason = Boolean(String(globalReason || '').trim());
    setReady(hasReason && componentsLoaded);
  }

  function syncReasonFromInput() {
    globalReason = String(reasonInput?.value || '').trim();
    applyGlobalReason();
    updateReady();
  }

  function applyGlobalReason() {
    const r = String(globalReason || '').trim();
    if (!r) return;
    if (!Array.isArray(cart)) return;
    for (const item of cart) item.reason = r;
  }

  // ---------------------------- Draft persistence ----------------------------
  function scheduleSaveDraft() {
    if (saveTimer) window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(() => {
      persistDraft({ silent: true });
    }, 500);
  }

  async function persistDraft({ silent = false } = {}) {
    if (isSavingNow) return false;
    isSavingNow = true;

    try {
      if (!Array.isArray(cart) || cart.length === 0) {
        await fetch('/api/order-draft', { method: 'DELETE' });
        return true;
      }

      const r = String(globalReason || '').trim();
      if (!r) {
        if (!silent) toast('error', 'Reason required', 'Please enter a reason first.');
        return false;
      }

      applyGlobalReason();

      const clean = cart
        .map((p) => ({
          id: String(p.id),
          quantity: normalizeQty(Number(p.quantity), 1),
          reason: String(p.reason || '').trim(),
        }))
        .filter((p) => p.id);

      const res = await fetch('/api/order-draft/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: clean }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (!silent) toast('error', 'Error', data?.error || 'Failed to save cart.');
        return false;
      }
      return true;
    } catch (err) {
      console.error('persistDraft error:', err);
      if (!silent) toast('error', 'Error', 'Failed to save cart.');
      return false;
    } finally {
      isSavingNow = false;
    }
  }

  // ---------------------------- Rendering ----------------------------
  function unitPriceOf(id) {
    const c = byId.get(String(id));
    const n = Number(c?.unitPrice);
    return Number.isFinite(n) ? n : 0;
  }

  function itemTotal(p) {
    return unitPriceOf(p.id) * (Number(p.quantity) || 0);
  }

  function updateSummary() {
    const entryCount = Array.isArray(cart) ? cart.length : 0;
    const total = Array.isArray(cart) ? cart.reduce((sum, p) => sum + itemTotal(p), 0) : 0;

    if (summarySubTotalEl) summarySubTotalEl.textContent = String(entryCount);
    if (summaryTotalEl) summaryTotalEl.textContent = formatMoney(total);
  }

  function renderEmptyState() {
    cartItemsEl.innerHTML = `
      <div class="cart-empty">
        <strong>Your cart is empty</strong>
        <div>Click <b>Update Cart</b> to add a component.</div>
      </div>
    `;
  }

  function renderLoadingState(text = 'Loading components...') {
    if (!cartItemsEl) return;
    cartItemsEl.innerHTML = `
      <div class="cart-loading" role="status" aria-live="polite">
        <div class="cart-loading-spinner" aria-hidden="true"></div>
        <div><strong>${escapeHtml(text)}</strong></div>
      </div>
    `;
  }

  function renderCart() {
    if (!cartItemsEl) return;

    cartItemsEl.innerHTML = '';

    if (!Array.isArray(cart) || cart.length === 0) {
      renderEmptyState();
      updateSummary();
      if (window.feather) feather.replace();
      return;
    }

    // Ensure cart items carry the global reason (if any) so server saves always valid
    applyGlobalReason();

    cart.forEach((p, idx) => {
      const c = byId.get(String(p.id)) || null;
      const name = c?.name || 'Unknown component';
      const qty = normalizeQty(Number(p.quantity), MIN_QTY);
      const total = itemTotal({ id: p.id, quantity: qty });

      const row = document.createElement('div');
      row.className = 'cart-row';
      row.dataset.id = String(p.id);

      // Product cell
      const productCell = document.createElement('div');
      productCell.className = 'cart-product';

      const thumb = document.createElement('div');
      thumb.className = 'cart-thumb';

      if (c?.imageUrl) {
        const img = document.createElement('img');
        img.alt = name;
        img.loading = 'lazy';
        img.src = c.imageUrl;
        thumb.appendChild(img);
      } else {
        // Requested: show sequential number (١,٢,٣,...) instead of first letter
        thumb.textContent = toArabicIndicDigits(idx + 1);
      }

      const meta = document.createElement('div');
      meta.className = 'prod-meta';
      meta.innerHTML = `
        <div class="prod-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
      `;

      productCell.appendChild(thumb);
      productCell.appendChild(meta);

      // URL cell
      const urlCell = document.createElement('div');
      const safeUrl = safeHttpUrl(c?.url);
      if (safeUrl) {
        const linkBtn = document.createElement('a');
        linkBtn.className = 'url-btn';
        linkBtn.href = safeUrl;
        linkBtn.target = '_blank';
        linkBtn.rel = 'noopener noreferrer';
        linkBtn.title = safeUrl;
        linkBtn.innerHTML = '<i data-feather="external-link"></i><span>Open</span>';
        urlCell.appendChild(linkBtn);
      } else {
        const empty = document.createElement('span');
        empty.className = 'url-empty';
        empty.textContent = '—';
        urlCell.appendChild(empty);
      }

      // Quantity cell
      const qtyCell = document.createElement('div');
      const qtyCtl = document.createElement('div');
      qtyCtl.className = 'qty-control';

      const decBtn = document.createElement('button');
      decBtn.className = 'qty-btn';
      decBtn.type = 'button';
      decBtn.textContent = '−';
      decBtn.setAttribute('aria-label', 'Decrease quantity');

      const qtyVal = document.createElement('div');
      qtyVal.className = 'qty-value';
      qtyVal.textContent = formatQty(qty);

      const incBtn = document.createElement('button');
      incBtn.className = 'qty-btn';
      incBtn.type = 'button';
      incBtn.textContent = '+';
      incBtn.setAttribute('aria-label', 'Increase quantity');

      qtyCtl.appendChild(decBtn);
      qtyCtl.appendChild(qtyVal);
      qtyCtl.appendChild(incBtn);
      qtyCell.appendChild(qtyCtl);

      // Total cell
      const totalCell = document.createElement('div');
      totalCell.className = 'money';
      totalCell.textContent = formatMoney(total);

      // Action cell
      const actionCell = document.createElement('div');
      const trashBtn = document.createElement('button');
      trashBtn.className = 'trash-btn';
      trashBtn.type = 'button';
      trashBtn.setAttribute('aria-label', 'Remove item');
      trashBtn.innerHTML = '<i data-feather="trash-2"></i>';
      actionCell.appendChild(trashBtn);

      // bind events
      incBtn.addEventListener('click', () => changeQty(p.id, +1));
      decBtn.addEventListener('click', () => changeQty(p.id, -1));
      trashBtn.addEventListener('click', () => removeItem(p.id));

      // click product to edit
      productCell.style.cursor = 'pointer';
      productCell.addEventListener('click', () => openModalForEdit(p.id));

      row.appendChild(productCell);
      row.appendChild(urlCell);
      row.appendChild(qtyCell);
      row.appendChild(totalCell);
      row.appendChild(actionCell);

      cartItemsEl.appendChild(row);
    });

    updateSummary();
    if (window.feather) feather.replace();
  }

  // ---------------------------- Cart mutations ----------------------------
  function changeQty(id, delta) {
    const idx = cart.findIndex((p) => String(p.id) === String(id));
    if (idx === -1) return;

    const cur = normalizeQty(Number(cart[idx].quantity), MIN_QTY);
    const next = normalizeQty(cur + Number(delta || 0), 0);

    if (next <= 0) {
      removeItem(id);
      return;
    }

    cart[idx].quantity = next;
    renderCart();
    scheduleSaveDraft();
  }

  function removeItem(id) {
    cart = cart.filter((p) => String(p.id) !== String(id));
    renderCart();
    scheduleSaveDraft();
  }

  function upsertItem({ id, quantity }) {
    const cleanId = String(id || '');
    const cleanQty = normalizeQty(Number(quantity), NaN);

    const r = String(globalReason || '').trim();

    if (!cleanId) {
      toast('error', 'Missing field', 'Please choose a component.');
      return false;
    }
    if (!Number.isFinite(cleanQty) || cleanQty <= 0) {
      toast('error', 'Missing field', 'Please enter a valid quantity.');
      return false;
    }
    if (!r) {
      toast('error', 'Reason required', 'Please enter the order reason first.');
      try { reasonInput?.focus?.(); } catch {}
      return false;
    }

    const idx = cart.findIndex((p) => String(p.id) === cleanId);
    if (idx >= 0) {
      cart[idx].quantity = cleanQty;
      cart[idx].reason = r;
    } else {
      cart.push({ id: cleanId, quantity: cleanQty, reason: r });
    }
    return true;
  }

  // ---------------------------- Modal ----------------------------
  function setModalOpen(open) {
    if (!modalEl) return;
    modalEl.style.display = open ? 'flex' : 'none';
    modalEl.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.body.style.overflow = open ? 'hidden' : '';
  }

  function closeModal() {
    editingId = null;
    setModalOpen(false);
  }

  function setModalLoading(loading, text = 'Loading components...') {
    const isOn = !!loading;
    try {
      if (qtyInputEl) qtyInputEl.disabled = isOn;
      if (addToCartBtn) addToCartBtn.disabled = isOn;

      if (choicesInst && typeof choicesInst.disable === 'function') {
        if (isOn) choicesInst.disable();
        else choicesInst.enable();
      }

      if (componentSelectEl) {
        componentSelectEl.disabled = isOn;

        // If Choices isn't initialized yet, show a friendly placeholder
        // so the user sees the modal immediately.
        if (isOn && !choicesInst) {
          componentSelectEl.innerHTML = '';
          const opt = document.createElement('option');
          opt.value = '';
          opt.disabled = true;
          opt.selected = true;
          opt.textContent = text;
          componentSelectEl.appendChild(opt);
        }
      }
    } catch {}
  }

  function openModalForAdd() {
    editingId = null;
    if (addToCartBtn) addToCartBtn.textContent = 'Add';

    if (qtyInputEl) qtyInputEl.value = '1';

    // Open the modal immediately so "Update Cart" always shows the small window.
    setModalOpen(true);

    // If components are already ready, just clear the selection and focus.
    if (componentsLoaded && Array.isArray(components) && components.length) {
      setModalLoading(false);

      if (choicesInst) {
        try { choicesInst.removeActiveItems(); } catch {}
      } else if (componentSelectEl) {
        componentSelectEl.value = '';
      }

      window.setTimeout(() => {
        try {
          const focusEl = modalEl?.querySelector?.('.choices__inner') || componentSelectEl;
          focusEl?.focus?.();
        } catch {}
      }, 50);

      return;
    }

    // Otherwise show loading state and initialize once ready.
    setModalLoading(true);

    ensureComponentsReady().then((ok) => {
      if (!ok) {
        toast('error', 'Error', 'Failed to load components list. Please reload the page.');
        closeModal();
        return;
      }

      setModalLoading(false);

      // Clear selection for "Add" mode
      if (choicesInst) {
        try { choicesInst.removeActiveItems(); } catch {}
      } else if (componentSelectEl) {
        componentSelectEl.value = '';
      }

      window.setTimeout(() => {
        try {
          const focusEl = modalEl?.querySelector?.('.choices__inner') || componentSelectEl;
          focusEl?.focus?.();
        } catch {}
      }, 50);
    });
  }

  function openModalForEdit(id) {
    const item = cart.find((p) => String(p.id) === String(id));
    if (!item) {
      openModalForAdd();
      return;
    }

    editingId = String(item.id);
    if (addToCartBtn) addToCartBtn.textContent = 'Update';
    if (qtyInputEl) qtyInputEl.value = String(normalizeQty(Number(item.quantity), 1));

    // Open first, then ensure components list is ready.
    setModalOpen(true);

    const applySelection = () => {
      if (choicesInst) {
        try {
          choicesInst.setChoiceByValue(String(item.id));
        } catch {
          try { componentSelectEl.value = String(item.id); } catch {}
        }
      } else if (componentSelectEl) {
        componentSelectEl.value = String(item.id);
      }
    };

    if (componentsLoaded && Array.isArray(components) && components.length) {
      setModalLoading(false);
      applySelection();
      return;
    }

    setModalLoading(true);
    ensureComponentsReady().then((ok) => {
      if (!ok) {
        toast('error', 'Error', 'Failed to load components list. Please reload the page.');
        closeModal();
        return;
      }
      setModalLoading(false);
      applySelection();
    });
  }

  function initComponentChoices() {
    if (!componentSelectEl) return;

    componentSelectEl.innerHTML = '';

    const ph = document.createElement('option');
    ph.value = '';
    ph.disabled = true;
    ph.selected = true;
    ph.textContent = components.length ? 'Select component...' : 'No components available';
    componentSelectEl.appendChild(ph);

    for (const c of components) {
      const opt = document.createElement('option');
      opt.value = String(c.id);
      opt.textContent = String(c.name || '');
      componentSelectEl.appendChild(opt);
    }

    try {
      if (choicesInst) {
        choicesInst.destroy();
        choicesInst = null;
      }

      choicesInst = new Choices(componentSelectEl, {
        searchEnabled: true,
        searchPlaceholderValue: 'Search...',
        placeholder: true,
        placeholderValue: 'Select component...',
        itemSelectText: '',
        shouldSort: true,
        allowHTML: false,
        position: 'bottom',
        searchResultLimit: 500,
      });

      // Add a clear (x) button inside the dropdown search input
      setupChoicesSearchClearButton();
    } catch (e) {
      console.warn('Choices init failed:', e);
      choicesInst = null;
    }
  }

  function setupChoicesSearchClearButton() {
    if (!componentSelectEl) return;

    // Ensure we (re)inject whenever the dropdown opens
    if (choicesShowHandler) componentSelectEl.removeEventListener('showDropdown', choicesShowHandler);
    if (choicesHideHandler) componentSelectEl.removeEventListener('hideDropdown', choicesHideHandler);

    choicesShowHandler = () => window.setTimeout(ensureChoicesSearchClearButton, 0);
    choicesHideHandler = () => {
      try {
        const root = componentSelectEl.closest('.choices');
        const dropdown = root?.querySelector('.choices__list--dropdown');
        const btn = dropdown?.querySelector('.choices-search-clear');
        if (btn) btn.style.display = 'none';
      } catch {}
    };

    componentSelectEl.addEventListener('showDropdown', choicesShowHandler);
    componentSelectEl.addEventListener('hideDropdown', choicesHideHandler);

    // Try once now as well
    ensureChoicesSearchClearButton();
  }

  function ensureChoicesSearchClearButton() {
    try {
      const root = componentSelectEl.closest('.choices');
      if (!root) return;

      const dropdown = root.querySelector('.choices__list--dropdown');
      if (!dropdown) return;

      const input = dropdown.querySelector('input.choices__input');
      if (!input) return;

      let btn = dropdown.querySelector('.choices-search-clear');
      if (!btn) {
        btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'choices-search-clear';
        btn.setAttribute('aria-label', 'Clear search');
        btn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 6L6 18"></path>
            <path d="M6 6l12 12"></path>
          </svg>
        `;
        dropdown.appendChild(btn);
      }

      const update = () => {
        const has = Boolean(String(input.value || '').trim());
        btn.style.display = has ? 'flex' : 'none';
      };

      if (!btn.dataset.bound) {
        btn.dataset.bound = '1';

        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          input.value = '';
          // Trigger Choices filtering refresh
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('keyup', { bubbles: true }));
          update();
          try { input.focus(); } catch {}
        });

        input.addEventListener('input', update);
        input.addEventListener('keyup', update);
      }

      update();
    } catch {}
  }

  function getPasswordValue() {
    return String(passwordInput?.value || '').trim();
  }

  // ---------------------------- Checkout ----------------------------
  async function checkout() {
    if (!Array.isArray(cart) || cart.length === 0) {
      toast('error', 'Empty cart', 'Please add at least one component.');
      return;
    }

    syncReasonFromInput();

    if (!String(globalReason || '').trim()) {
      toast('error', 'Reason required', 'Please enter the order reason.');
      try { reasonInput?.focus?.(); } catch {}
      return;
    }

    const password = getPasswordValue();
    if (!password) {
      toast('error', 'Password required', 'Please enter your password before checkout.');
      try { passwordInput?.focus?.(); } catch {}
      return;
    }

    applyGlobalReason();

    if (checkoutBtn && checkoutBtn.disabled) return;
    if (checkoutBtn) {
      checkoutBtn.disabled = true;
      checkoutBtn.setAttribute('aria-busy', 'true');
    }

    showSaving(isEditMode ? 'Saving changes...' : 'Submitting order...');

    try {
      await persistDraft({ silent: true });

      const res = await fetch('/api/submit-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: cart, password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        if (res.status === 401) {
          toast('error', 'Wrong password', data?.message || 'Invalid password.');
          try { passwordInput?.focus?.(); passwordInput?.select?.(); } catch {}
          return;
        }
        throw new Error(data?.message || 'Failed to submit order.');
      }

      toast(
        'success',
        isEditMode ? 'Order Updated!' : 'Order Submitted!',
        isEditMode ? 'Your order has been updated successfully.' : 'Your order has been created successfully.',
      );

      cart = [];
      renderCart();
      if (passwordInput) passwordInput.value = '';

      setTimeout(() => {
        window.location.href = '/orders';
      }, 900);
    } catch (err) {
      console.error('checkout submit error:', err);
      toast('error', 'Submission Failed', err?.message || 'Something went wrong. Please try again.');
    } finally {
      hideSaving();
      if (checkoutBtn) {
        checkoutBtn.disabled = false;
        checkoutBtn.removeAttribute('aria-busy');
      }
    }
  }

  // ---------------------------- Bindings ----------------------------
  function bindEvents() {
    // Reason field (per order)
    reasonInput?.addEventListener('input', () => {
      globalReason = String(reasonInput.value || '').trim();
      applyGlobalReason();
      updateReady();
      if (readyToUse && cart.length) scheduleSaveDraft();
    });

    updateCartBtn?.addEventListener('click', () => {
      syncReasonFromInput();
      openModalForAdd();
    });

    modalCloseBtn?.addEventListener('click', closeModal);

    // Close modal when clicking backdrop
    modalEl?.addEventListener('click', (e) => {
      if (e.target === modalEl) closeModal();
    });

    // Esc closes modal
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && modalEl && modalEl.style.display === 'flex') {
        closeModal();
      }
    });

    addToCartBtn?.addEventListener('click', async () => {
      syncReasonFromInput();

      const id = componentSelectEl?.value;
      const qty = Number(qtyInputEl?.value);

      // If we opened the modal from an existing item and the user changed the component,
      // remove the old item first to avoid duplicates.
      if (editingId && String(editingId) !== String(id)) {
        cart = cart.filter((p) => String(p.id) !== String(editingId));
      }

      const ok = upsertItem({ id, quantity: qty });
      if (!ok) return;

      closeModal();
      renderCart();

      const saved = await persistDraft({ silent: true });
      if (!saved) toast('error', 'Error', 'Failed to save cart.');
    });

    checkoutBtn?.addEventListener('click', checkout);

    // Pressing Enter in password triggers checkout
    passwordInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        checkout();
      }
    });
  }

  // ---------------------------- Init ----------------------------
  async function init() {
    // Disable browser autofill on Reason + Password (user should type)
    hardDisableAutofill(reasonInput, { clearNow: true });
    hardDisableAutofill(passwordInput, { clearNow: true });

    bindEvents();

    // disable until reason+components loaded
    setReady(false);

    const { componentsPromise: cp, draftPromise: dp } = startPreload();

    // Show loading state instead of "Your cart is empty" until data is ready
    renderLoadingState();

    if (isEditMode) {
      showSaving('Loading order...');

      try { await dp; } catch {}

      // derive reason from draft
      const firstReason = cart.find((p) => String(p.reason || '').trim())?.reason || '';
      globalReason = String(firstReason || '').trim();
      if (reasonInput && !String(reasonInput.value || '').trim()) reasonInput.value = globalReason;
      applyGlobalReason();

      try { await cp; } catch {}
      hideSaving();

      const ok = await ensureComponentsReady();
      if (!ok) {
        toast('error', 'Error', 'Failed to load components list. Please reload the page.');
        return;
      }

      renderCart();
      await persistDraft({ silent: true });
      return;
    }

    // New order
    // Wait for both draft+components, then init select.
    try { await dp; } catch {}

    // If a draft exists, try to prefill reason
    if (reasonInput && !String(reasonInput.value || '').trim()) {
      const r = cart.find((p) => String(p.reason || '').trim())?.reason || '';
      if (r) reasonInput.value = r;
    }
    syncReasonFromInput();

    try { await cp; } catch {}

    const ok = await ensureComponentsReady();
    if (!ok) {
      toast('error', 'Error', 'Failed to load components list. Please reload the page.');
      return;
    }

    renderCart();

    // If we already have items+reason, keep server draft consistent
    if (readyToUse && cart.length) await persistDraft({ silent: true });
  }

  // Ensure init runs even if this script is loaded after DOMContentLoaded.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ---------------------------- Quantity helpers ----------------------------
  function normalizeQty(n, fallback = NaN) {
    const x = Number(n);
    if (!Number.isFinite(x)) return fallback;
    const rounded = Math.round(x * 1000) / 1000;
    if (rounded <= 0) return 0;
    if (rounded < MIN_QTY) return MIN_QTY;
    return rounded;
  }

  function formatQty(n) {
    const x = normalizeQty(n, MIN_QTY);
    if (Math.abs(x - Math.round(x)) < 1e-9) return String(Math.round(x));
    return x.toFixed(3).replace(/\.0+$/,'').replace(/(\.\d*[1-9])0+$/,'$1');
  }
})();
