// public/js/order-products.step.js
// Create New Order (Products) — Shopping Cart UI
(() => {
  /**
   * Draft model (stored in session on server):
   *   [{ id: string, quantity: number, reason: string, issueDescription?: string }]
   *
   * Feb 2026 update:
   * - Reason is collected ONCE per order (in the Order Summary card)
   * - The backend still expects `reason` on each item, so we copy the global reason
   *   into every cart item before saving/submitting.
   * - Request Maintenance replaces Qty with Issue Description (saved per item).
   */

  // ---------------------------- DOM ----------------------------
  const cartItemsEl = document.getElementById('cartItems');
  const cartHeadEl = document.querySelector('#cartStep .cart-head') || document.querySelector('.cart-head');
  const updateCartBtn = document.getElementById('updateCartBtn');
  const checkoutBtn = document.getElementById('checkoutBtn');

  // Order Type flow (Step 1 -> Step 2)
  const orderTypeStepEl = document.getElementById('orderTypeStep');
  const orderTypeTabsEl = document.getElementById('orderTypeTabs');
  const placeholderStepEl = document.getElementById('orderTypePlaceholderStep');
  const placeholderTitleEl = document.getElementById('orderTypePlaceholderTitle');
  const backToTypesBtn = document.getElementById('orderTypeBackBtn');
  const cartStepEl = document.getElementById('cartStep');
  const cartTypePillEl = document.getElementById('cartTypePill');
  const cartTypeValueEl = document.getElementById('cartTypeValue');
  const cartTypeValueIconEl = document.getElementById('cartTypeValueIcon');
  const cartTypeValueTextEl = document.getElementById('cartTypeValueText');
  const cartBackBtn = document.getElementById('cartBackBtn');

  const pageTitleTextEl = document.getElementById('pageTitleText');
  const pageTitleIconEl = document.getElementById('pageTitleIcon');

  const passwordInput = document.getElementById('voucherInput');
  const reasonInput = document.getElementById('orderReasonSummary');

  const summarySubTotalEl = document.getElementById('summarySubTotal');
  const summaryTotalEl = document.getElementById('summaryTotal');

  const modalEl = document.getElementById('updateCartModal');
  const modalCloseBtn = document.getElementById('updateCartClose');
  const addToCartBtn = document.getElementById('addToCartBtn');
  const componentSelectEl = document.getElementById('cartComponentSelect');
  const qtyInputEl = document.getElementById('cartQtyInput');

  // Request Maintenance: Issue Description field (replaces Qty)
  const issueDescInputEl = document.getElementById('cartIssueDescInput');
  const qtyFieldEl = document.getElementById('cartQtyField');
  const issueFieldEl = document.getElementById('cartIssueDescField');
  const modalGridEl = modalEl?.querySelector?.('.modal-grid') || document.querySelector('#updateCartModal .modal-grid');

  const savingOverlayEl = document.getElementById('cartSavingOverlay');
  const savingTextEl = document.getElementById('cartSavingText');

  // When opened from Current Orders -> Edit, we add ?edit=1
  const isEditMode = new URLSearchParams(window.location.search).get('edit') === '1';

  // ---------------------------- Order Type (tabs) ----------------------------
  const ORDER_TYPE_STORAGE_KEY = 'shopping_cart:last_order_type:v1';
  const ORDER_TYPE_STORAGE_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

  const normKey = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const REQUEST_PRODUCTS_KEY = normKey('Request Products');
  const WITHDRAW_PRODUCTS_KEY = normKey('Withdraw Products');
  const REQUEST_MAINTENANCE_KEY = normKey('Request Maintenance');

  // Notion Products DB tag value to show in Request Maintenance
  const MAINTENANCE_TAG_KEY = normKey('4/ Machines');

  const ORDER_TYPE_META = {
    [REQUEST_PRODUCTS_KEY]: {
      icon: 'shopping-cart',
      description: 'Add new products or supplies and send them as a stock request.',
      headingTitle: 'Shopping Cart',
      headingIcon: 'shopping-cart',
      themeClass: 'theme-request-products',
    },
    [WITHDRAW_PRODUCTS_KEY]: {
      icon: 'log-out',
      description: 'Withdraw available items from stock with a dedicated outgoing flow.',
      headingTitle: 'Withdraw Products',
      headingIcon: 'log-out',
      themeClass: 'theme-withdraw-products',
    },
    [REQUEST_MAINTENANCE_KEY]: {
      icon: 'tool',
      description: 'Report issues for machines and create a maintenance request quickly.',
      headingTitle: 'Request Maintenance',
      headingIcon: 'tool',
      themeClass: 'theme-request-maintenance',
    },
  };

  const ORDER_TYPE_THEME_CLASSES = [
    'theme-request-products',
    'theme-withdraw-products',
    'theme-request-maintenance',
  ];

  let selectedOrderType = '';
  let cartBooted = false;

  function featherIconMarkup(iconName) {
    return `<i data-feather="${String(iconName || 'grid')}"></i>`;
  }

  function getOrderTypeMeta(type = selectedOrderType) {
    const key = normKey(type);
    return ORDER_TYPE_META[key] || {
      icon: 'grid',
      description: 'Open this workflow and continue to the next step.',
      headingTitle: String(type || '').trim() || 'Shopping Cart',
      headingIcon: 'grid',
      themeClass: '',
    };
  }

  function applyThemeClass(el, themeClass) {
    if (!el) return;
    try {
      ORDER_TYPE_THEME_CLASSES.forEach((cls) => el.classList.remove(cls));
      if (themeClass) el.classList.add(themeClass);
    } catch {}
  }

  function updatePageHeading(type = selectedOrderType) {
    const v = String(type || '').trim();
    const meta = getOrderTypeMeta(v);
    const headingTitle = v ? meta.headingTitle : 'Shopping Cart';
    const headingIcon = v ? meta.headingIcon : 'shopping-cart';

    try {
      if (pageTitleTextEl) pageTitleTextEl.textContent = headingTitle;
      else {
        const pageTitleEl = document.querySelector('.page-title');
        if (pageTitleEl) pageTitleEl.textContent = headingTitle;
      }
      if (pageTitleIconEl) {
        pageTitleIconEl.innerHTML = featherIconMarkup(headingIcon);
        applyThemeClass(pageTitleIconEl, v ? meta.themeClass : '');
      }
      if (window.feather) feather.replace();
    } catch {}
  }

  function isWithdrawType(type = selectedOrderType) {
    return normKey(type) === WITHDRAW_PRODUCTS_KEY;
  }

  function isMaintenanceType(type = selectedOrderType) {
    return normKey(type) === REQUEST_MAINTENANCE_KEY;
  }

  function qtySign(type = selectedOrderType) {
    return isWithdrawType(type) ? -1 : 1;
  }

  function applyOrderTypeUi(type = selectedOrderType) {
    const withdraw = isWithdrawType(type);
    const maintenance = isMaintenanceType(type);

    // Maintenance gets a special layout (no URL/Qty/Total/Reason; Qty becomes Issue Description)
    try {
      document.body.classList.toggle('is-maintenance', maintenance);
    } catch {}

    // Update cart header columns
    try {
      if (cartHeadEl) {
        cartHeadEl.innerHTML = maintenance
          ? '<div>Product</div><div>Issue Description</div><div>Action</div>'
          : '<div>Product</div><div>URL</div><div>Quantity</div><div>Total</div><div>Action</div>';
      }
    } catch {}

    // Toggle modal fields
    try {
      if (modalGridEl) modalGridEl.classList.toggle('is-maintenance', maintenance);
      if (qtyFieldEl) qtyFieldEl.style.display = maintenance ? 'none' : '';
      if (issueFieldEl) issueFieldEl.style.display = maintenance ? '' : 'none';
    } catch {}

    // Page title + icon
    try {
      updatePageHeading(type);
      const meta = getOrderTypeMeta(type);
      document.title = maintenance ? meta.headingTitle : (withdraw ? meta.headingTitle : 'Shopping Cart');
    } catch {}

    // Modal title
    try {
      const modalTitle = document.getElementById('updateCartTitle');
      if (modalTitle) modalTitle.textContent = withdraw ? 'Update Withdraw Cart' : 'Update Cart';
    } catch {}

    // Buttons
    if (updateCartBtn) updateCartBtn.textContent = withdraw ? 'Update Withdraw Cart' : 'Update Cart';
    if (checkoutBtn) checkoutBtn.textContent = withdraw ? 'Withdraw Now' : 'Checkout Now';

    // Summary title
    try {
      const summaryTitleEl = document.querySelector('.summary-title');
      if (summaryTitleEl) summaryTitleEl.textContent = withdraw ? 'Withdrawal Summary' : 'Order Summary';
    } catch {}
  }

  function readOrderTypeFromUrl() {
    try {
      return String(new URLSearchParams(window.location.search).get('type') || '').trim();
    } catch {
      return '';
    }
  }

  function storeOrderType(type) {
    try {
      const v = String(type || '').trim();
      if (!v) return;
      const payload = { v, ts: Date.now() };
      sessionStorage.setItem(ORDER_TYPE_STORAGE_KEY, JSON.stringify(payload));
    } catch {}
  }

  function loadStoredOrderType() {
    try {
      const raw = sessionStorage.getItem(ORDER_TYPE_STORAGE_KEY);
      if (!raw) return '';
      const parsed = JSON.parse(raw);
      const v = String(parsed?.v || '').trim();
      const ts = Number(parsed?.ts || 0);
      if (!v || !Number.isFinite(ts)) return '';
      if (Date.now() - ts > ORDER_TYPE_STORAGE_TTL_MS) return '';
      return v;
    } catch {
      return '';
    }
  }

  function clearStoredOrderType() {
    try { sessionStorage.removeItem(ORDER_TYPE_STORAGE_KEY); } catch {}
  }

  function setUrlOrderType(type, { replace = false } = {}) {
    try {
      const u = new URL(window.location.href);
      const v = String(type || '').trim();
      if (v) u.searchParams.set('type', v);
      else u.searchParams.delete('type');
      // Keep other params (like edit=1)
      const next = u.toString();
      // Avoid pushing duplicate entries
      if (next === window.location.href) return;
      const fn = replace ? 'replaceState' : 'pushState';
      history[fn]({}, '', next);
    } catch {}
  }

  function showOnly(step) {
    const show = (el, on) => {
      if (!el) return;
      el.style.display = on ? '' : 'none';
    };
    show(orderTypeStepEl, step === 'types');
    show(placeholderStepEl, step === 'placeholder');
    show(cartStepEl, step === 'cart');
  }

  function renderOrderTypeTabs(options, activeType) {
    if (!orderTypeTabsEl) return;
    const opts = Array.isArray(options) ? options.filter(Boolean) : [];

    // Clear
    orderTypeTabsEl.innerHTML = '';

    if (opts.length === 0) {
      orderTypeTabsEl.innerHTML = `
        <div class="order-type-loading" aria-live="polite">
          <span class="order-type-dot" aria-hidden="true"></span>
          <span>No order types found.</span>
        </div>
      `;
      return;
    }

    for (const name of opts) {
      const btn = document.createElement('button');
      const meta = getOrderTypeMeta(name);
      const isActive = activeType && normKey(activeType) === normKey(name);

      btn.type = 'button';
      btn.className = 'order-type-btn';
      if (meta.themeClass) btn.classList.add(meta.themeClass);
      btn.dataset.type = String(name);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      btn.innerHTML = `
        <span class="order-type-icon" aria-hidden="true">${featherIconMarkup(meta.icon)}</span>
        <span class="order-type-copy">
          <span class="order-type-name">${escapeHtml(name)}</span>
          <span class="order-type-desc">${escapeHtml(meta.description)}</span>
        </span>
        <span class="order-type-arrow" aria-hidden="true">${featherIconMarkup('arrow-right')}</span>
      `;

      if (isActive) btn.classList.add('is-active');
      btn.addEventListener('click', () => {
        chooseOrderType(String(name));
      });
      orderTypeTabsEl.appendChild(btn);
    }

    if (window.feather) feather.replace();
  }

  async function fetchOrderTypes() {
    try {
      const res = await fetch('/api/order-types');
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const opts = Array.isArray(data) ? data : data?.options;
      return Array.isArray(opts) ? opts.map((x) => String(x || '').trim()).filter(Boolean) : [];
    } catch (e) {
      console.warn('Failed to load order types:', e);
      return [];
    }
  }

  function setCartTypePill(type) {
    const v = String(type || '').trim();
    if (!cartTypePillEl || !cartTypeValueEl) return;
    if (!v) {
      cartTypePillEl.style.display = 'none';
      if (cartTypeValueTextEl) cartTypeValueTextEl.textContent = '—';
      else cartTypeValueEl.textContent = '—';
      if (cartTypeValueIconEl) cartTypeValueIconEl.innerHTML = featherIconMarkup('shopping-cart');
      applyThemeClass(cartTypeValueEl, '');
      // Reset UI to default state
      applyOrderTypeUi('');
      if (window.feather) feather.replace();
      return;
    }

    const meta = getOrderTypeMeta(v);
    if (cartTypeValueTextEl) cartTypeValueTextEl.textContent = v;
    else cartTypeValueEl.textContent = v;
    if (cartTypeValueIconEl) cartTypeValueIconEl.innerHTML = featherIconMarkup(meta.icon);
    applyThemeClass(cartTypeValueEl, meta.themeClass || '');
    cartTypePillEl.style.display = 'flex';

    // Apply UI copy for this order type
    applyOrderTypeUi(v);

    // In edit mode, we don't want a back button to the order type step.
    if (cartBackBtn) cartBackBtn.style.display = isEditMode ? 'none' : '';
    if (window.feather) feather.replace();
  }

  async function bootCart() {
    if (cartBooted) return;
    cartBooted = true;

    // Run the existing cart init flow
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initCart, { once: true });
    } else {
      initCart();
    }
  }

  function chooseOrderType(type) {
    const v = String(type || '').trim();
    if (!v) return;

    selectedOrderType = v;
    storeOrderType(v);
    setUrlOrderType(v);

    // Update active state
    try {
      const buttons = orderTypeTabsEl?.querySelectorAll?.('button.order-type-btn') || [];
      buttons.forEach((b) => {
        const active = normKey(b.dataset.type) === normKey(v);
        b.classList.toggle('is-active', active);
        b.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    } catch {}

    // Request Products / Withdraw Products / Request Maintenance -> show the cart UI
    if (
      normKey(v) === REQUEST_PRODUCTS_KEY ||
      normKey(v) === WITHDRAW_PRODUCTS_KEY ||
      normKey(v) === REQUEST_MAINTENANCE_KEY ||
      isEditMode
    ) {
      setCartTypePill(v);
      showOnly('cart');
      bootCart();

      // If the cart is already booted & components are loaded, re-render the dropdown
      // options to match the newly selected order type (e.g. Maintenance filter).
      try {
        if (cartBooted && componentsLoaded) initComponentChoices();
      } catch {}
      return;
    }

    // Other order types will be configured later
    if (placeholderTitleEl) placeholderTitleEl.textContent = v;
    showOnly('placeholder');
  }

  async function initOrderTypeFlow() {
    // Edit mode should open the cart directly (no order type step)
    if (isEditMode) {
      selectedOrderType = readOrderTypeFromUrl() || loadStoredOrderType() || '';
      if (selectedOrderType) setCartTypePill(selectedOrderType);
      else updatePageHeading('');
      showOnly('cart');
      await bootCart();
      return;
    }

    // Normal flow: show tabs first
    showOnly('types');

    // Load options
    const options = await fetchOrderTypes();

    // Fallback if Notion schema is not available yet
    const safeOptions = options.length
      ? options
      : ['Request Products', 'Withdraw Products', 'Request Maintenance'];

    // Determine selected type from URL (highest priority) then storage
    const fromUrl = readOrderTypeFromUrl();
    const fromStorage = loadStoredOrderType();
    const initial = fromUrl || fromStorage || '';

    renderOrderTypeTabs(safeOptions, initial);
    if (!initial) updatePageHeading('');

    // If URL already has a type, open its second page immediately
    if (initial) {
      // Only auto-open if it exists in the options list
      const exists = safeOptions.some((x) => normKey(x) === normKey(initial));
      if (exists) chooseOrderType(initial);
    }

    // Back button (from placeholder)
    const goBackToOrderTypes = () => {
      selectedOrderType = '';
      clearStoredOrderType();

      // Replace the URL instead of pushing a new history entry.
      // This makes the browser Back behave naturally (go to the previous app page).
      setUrlOrderType('', { replace: true });
      setCartTypePill('');
      showOnly('types');
      renderOrderTypeTabs(safeOptions, '');
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch {}
    };

    // Back button (from placeholder)
    backToTypesBtn?.addEventListener('click', goBackToOrderTypes);

    // Back button (from cart)
    cartBackBtn?.addEventListener('click', goBackToOrderTypes);

    // Handle browser back/forward
    window.addEventListener('popstate', () => {
      const t = readOrderTypeFromUrl();
      if (!t) {
        selectedOrderType = '';
        setCartTypePill('');
        showOnly('types');
        renderOrderTypeTabs(safeOptions, '');
        return;
      }
      chooseOrderType(t);
    });
  }

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

  function hasTag(comp, wantTagKey) {
    const tags = Array.isArray(comp?.tags) ? comp.tags : [];
    if (!tags.length) return false;
    const want = String(wantTagKey || '').trim();
    if (!want) return false;
    return tags.some((t) => normKey(t) === want);
  }

  function getComponentsForSelect(type = selectedOrderType) {
    // Request Maintenance should only show products tagged "4/ Machines".
    if (isMaintenanceType(type)) {
      return (Array.isArray(components) ? components : []).filter((c) => hasTag(c, MAINTENANCE_TAG_KEY));
    }
    return Array.isArray(components) ? components : [];
  }

  // NOTE:
  // The cart thumbnail uses a sequential number when there is no image.
  // Requirement: keep it in English digits (1,2,3,...) regardless of locale.

  // ---------------------------- State ----------------------------
  const MIN_QTY = 0.01;

  let components = []; // [{id,name,url,unitPrice,imageUrl,displayId}]
  let byId = new Map();
  let cart = []; // [{id, quantity, reason, issueDescription?}]

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
          issueDescription: String(p.issueDescription || '').trim(),
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
    const needsReason = !isMaintenanceType();
    setReady((needsReason ? hasReason : true) && componentsLoaded);
  }

  function syncReasonFromInput() {
    globalReason = String(reasonInput?.value || '').trim();
    applyGlobalReason();
    updateReady();
  }

  function applyGlobalReason() {
    // Request Maintenance does not use a global reason.
    if (isMaintenanceType()) return;
    const r = String(globalReason || '').trim();
    if (!r) return;
    if (!Array.isArray(cart)) return;
    for (const item of cart) item.reason = r;
  }

  function deriveMaintenanceReason(issueDescription) {
    const s = String(issueDescription || '').trim();
    if (s) return s.slice(0, 80);
    return 'Request Maintenance';
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

      // IMPORTANT:
      // We allow saving a draft cart even if the user hasn't written the order
      // reason yet. Reason will be validated on checkout ("Checkout Now").
      //
      // If a global reason exists, copy it into each item before saving.
      applyGlobalReason();

      const clean = cart
        .map((p) => ({
          id: String(p.id),
          quantity: isMaintenanceType() ? 1 : normalizeQty(Number(p.quantity), 1),
          reason: isMaintenanceType()
            ? deriveMaintenanceReason(p.issueDescription)
            : String(p.reason || '').trim(),
          issueDescription: String(p.issueDescription || '').trim(),
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
    // Request Maintenance does not use pricing totals.
    if (isMaintenanceType()) return 0;
    // Withdraw mode uses negative totals (because Qty is displayed/recorded as negative).
    return unitPriceOf(p.id) * (Number(p.quantity) || 0) * qtySign();
  }

  function updateSummary() {
    const entryCount = Array.isArray(cart) ? cart.length : 0;
    const total = Array.isArray(cart) ? cart.reduce((sum, p) => sum + itemTotal(p), 0) : 0;

    if (summarySubTotalEl) summarySubTotalEl.textContent = String(entryCount);
    if (summaryTotalEl) summaryTotalEl.textContent = formatMoney(total);
  }

  function renderEmptyState() {
    const withdraw = isWithdrawType();
    const btnLabel = withdraw ? 'Update Withdraw Cart' : 'Update Cart';
    cartItemsEl.innerHTML = `
      <div class="cart-empty">
        <strong>${withdraw ? 'Your withdrawal cart is empty' : 'Your cart is empty'}</strong>
        <div>Click <b>${escapeHtml(btnLabel)}</b> to add a component.</div>
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
        // Show sequential number (1,2,3,...) instead of first letter
        thumb.textContent = String(idx + 1);
      }

      const meta = document.createElement('div');
      meta.className = 'prod-meta';
      meta.innerHTML = `
        <div class="prod-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
      `;

      productCell.appendChild(thumb);
      productCell.appendChild(meta);

      // Request Maintenance: show Issue Description instead of URL/Qty/Total
      if (isMaintenanceType()) {
        const issueCell = document.createElement('div');
        issueCell.className = 'issue-cell';
        const issue = String(p.issueDescription || '').trim();
        issueCell.textContent = issue || '—';

        // Action cell
        const actionCell = document.createElement('div');
        const trashBtn = document.createElement('button');
        trashBtn.className = 'trash-btn';
        trashBtn.type = 'button';
        trashBtn.setAttribute('aria-label', 'Remove item');
        trashBtn.innerHTML = '<i data-feather="trash-2"></i>';
        actionCell.appendChild(trashBtn);

        // bind events
        trashBtn.addEventListener('click', () => removeItem(p.id));

        // click product to edit
        productCell.style.cursor = 'pointer';
        productCell.addEventListener('click', () => openModalForEdit(p.id));

        row.appendChild(productCell);
        row.appendChild(issueCell);
        row.appendChild(actionCell);

        cartItemsEl.appendChild(row);
        return;
      }

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
      // Withdraw mode: show the qty as a negative number in the UI
      qtyVal.textContent = isWithdrawType() ? `-${formatQty(qty)}` : formatQty(qty);

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

  function upsertItem({ id, quantity, issueDescription }) {
    const cleanId = String(id || '');
    const maintenance = isMaintenanceType();
    const cleanQty = maintenance ? 1 : normalizeQty(Number(quantity), NaN);
    const issue = String(issueDescription || '').trim();

    const r = maintenance ? deriveMaintenanceReason(issue) : String(globalReason || '').trim();

    if (!cleanId) {
      toast('error', 'Missing field', 'Please choose a component.');
      return false;
    }

    if (!maintenance) {
      if (!Number.isFinite(cleanQty) || cleanQty <= 0) {
        toast('error', 'Missing field', 'Please enter a valid quantity.');
        return false;
      }
    } else {
      if (!issue) {
        toast('error', 'Missing field', 'Please describe the issue.');
        try { issueDescInputEl?.focus?.(); } catch {}
        return false;
      }
    }

    const idx = cart.findIndex((p) => String(p.id) === cleanId);
    if (idx >= 0) {
      cart[idx].quantity = cleanQty;
      // Only overwrite the stored reason if the user already entered one.
      if (r) cart[idx].reason = r;
      if (maintenance) cart[idx].issueDescription = issue;
    } else {
      cart.push({ id: cleanId, quantity: cleanQty, reason: r, issueDescription: maintenance ? issue : '' });
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
      if (issueDescInputEl) issueDescInputEl.disabled = isOn;
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
    if (issueDescInputEl) issueDescInputEl.value = '';

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
    if (issueDescInputEl) issueDescInputEl.value = String(item.issueDescription || '').trim();

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

    const selectComponents = getComponentsForSelect();

    const ph = document.createElement('option');
    ph.value = '';
    ph.disabled = true;
    ph.selected = true;
    ph.textContent = selectComponents.length ? 'Select component...' : 'No components available';
    componentSelectEl.appendChild(ph);

    for (const c of selectComponents) {
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
        // Use a plain × character for maximum reliability on mobile browsers
        btn.innerHTML = '<span aria-hidden="true">×</span>';
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
    const withdraw = isWithdrawType();
    const maintenance = isMaintenanceType();
    if (!Array.isArray(cart) || cart.length === 0) {
      toast(
        'error',
        withdraw ? 'Empty withdrawal' : 'Empty cart',
        withdraw ? 'Please add at least one component to withdraw.' : 'Please add at least one component.',
      );
      return;
    }

    if (!maintenance) {
      syncReasonFromInput();

      if (!String(globalReason || '').trim()) {
        toast('error', 'Reason required', withdraw ? 'Please enter the withdrawal reason.' : 'Please enter the order reason.');
        try { reasonInput?.focus?.(); } catch {}
        return;
      }
    } else {
      // Maintenance requires Issue Description per item
      const missing = cart.find((p) => !String(p.issueDescription || '').trim());
      if (missing) {
        toast('error', 'Issue Description required', 'Please add an Issue Description for every machine in the cart.');
        try { openModalForEdit(missing.id); } catch {}
        return;
      }
    }

    const password = getPasswordValue();
    if (!password) {
      toast(
        'error',
        'Password required',
        withdraw ? 'Please enter your password before confirming the withdrawal.' : 'Please enter your password before checkout.',
      );
      try { passwordInput?.focus?.(); } catch {}
      return;
    }

    applyGlobalReason();

    if (checkoutBtn && checkoutBtn.disabled) return;
    if (checkoutBtn) {
      checkoutBtn.disabled = true;
      checkoutBtn.setAttribute('aria-busy', 'true');
    }

    showSaving(
      isEditMode
        ? 'Saving changes...'
        : withdraw
          ? 'Submitting withdrawal...'
          : 'Submitting order...'
    );

    try {
      await persistDraft({ silent: true });

      const res = await fetch('/api/submit-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: cart, password, orderType: selectedOrderType || null }),
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
        isEditMode
          ? (withdraw ? 'Withdrawal Updated!' : 'Order Updated!')
          : (withdraw ? 'Withdrawal Submitted!' : 'Order Submitted!'),
        isEditMode
          ? (withdraw ? 'Your withdrawal has been updated successfully.' : 'Your order has been updated successfully.')
          : (withdraw ? 'Your withdrawal has been created successfully.' : 'Your order has been created successfully.'),
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
      const maintenance = isMaintenanceType();
      const qty = maintenance ? 1 : Number(qtyInputEl?.value);
      const issueDescription = maintenance
        ? String(issueDescInputEl?.value || '').trim()
        : '';

      // If we opened the modal from an existing item and the user changed the component,
      // remove the old item first to avoid duplicates.
      if (editingId && String(editingId) !== String(id)) {
        cart = cart.filter((p) => String(p.id) !== String(editingId));
      }

      const ok = upsertItem({ id, quantity: qty, issueDescription });
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
  async function initCart() {
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

  // Boot the Order Type flow (it will lazy-start the cart when needed)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initOrderTypeFlow, { once: true });
  } else {
    initOrderTypeFlow();
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
