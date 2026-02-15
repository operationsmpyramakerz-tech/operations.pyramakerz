// public/js/order-products.step.js
// Create New Order (Products) — Shopping Cart UI
(() => {
  /**
   * Data model in session draft:
   * [{ id: string, quantity: number, reason: string }]
   *
   * NOTE (Feb 2026 update): Reason is now collected once per order (global reason)
   * and applied to all cart items. We still persist it per item because the
   * backend expects a reason on each product entry.
   */

  // ---------------------------- DOM ----------------------------
  const cartItemsEl = document.getElementById('cartItems');
  const updateCartBtn = document.getElementById('updateCartBtn');
  const checkoutBtn = document.getElementById('checkoutBtn');

  // NOTE: requested change: "Discount voucher" is now used as a password field
  // and it must be filled before Checkout.
  const passwordInput = document.getElementById('voucherInput');
  const summarySubTotalEl = document.getElementById('summarySubTotal');
  const summaryTotalEl = document.getElementById('summaryTotal');

  const modalEl = document.getElementById('updateCartModal');
  const modalCloseBtn = document.getElementById('updateCartClose');
  const addToCartBtn = document.getElementById('addToCartBtn');
  const componentSelectEl = document.getElementById('cartComponentSelect');
  const qtyInputEl = document.getElementById('cartQtyInput');

  // Order reason (global for all items)
  const orderReasonModalEl = document.getElementById('orderReasonModal');
  const orderReasonInputEl = document.getElementById('orderReasonInput');
  const orderReasonContinueBtn = document.getElementById('orderReasonContinue');

  const savingOverlayEl = document.getElementById('cartSavingOverlay');
  const savingTextEl = document.getElementById('cartSavingText');

  // When opened from Current Orders -> Edit, we add ?edit=1
  const isEditMode = new URLSearchParams(window.location.search).get('edit') === '1';

  if (!cartItemsEl) {
    console.warn('[order-products] Missing #cartItems — page markup mismatch.');
  }

  // ---------------------------- UI helpers ----------------------------
  function toast(type, title, message) {
    if (window.UI && typeof window.UI.toast === 'function') {
      window.UI.toast({ type, title, message });
      return;
    }
    // Fallback
    alert([title, message].filter(Boolean).join('\n'));
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
      // In case Intl is unavailable
      const fixed = hasDecimals ? n.toFixed(2) : String(Math.round(n));
      return '$' + fixed;
    }
  }

  // ---------------------------- State ----------------------------
  const MIN_QTY = 0.01;

  let components = []; // [{id,name,url,unitPrice,imageUrl}]
  let byId = new Map();
  let cart = []; // draft products

  let globalReason = '';
  let readyToUse = false; // reason entered + components loaded

  // Discounts / delivery fees removed per request

  let choicesInst = null;
  let saveTimer = null;
  let isSavingNow = false;
  let editingId = null; // when modal opened for editing an existing cart item

  // ---------------------------- Data loading ----------------------------
  async function loadComponents() {
    try {
      const res = await fetch('/api/components');
      if (!res.ok) throw new Error(await res.text());
      const list = await res.json();
      components = Array.isArray(list) ? list : [];
      byId = new Map(components.map((c) => [String(c.id), c]));
    } catch (err) {
      console.error('Failed to load components:', err);
      components = [];
      byId = new Map();
      toast('error', 'Error', 'Failed to load components list.');
    }
  }

  async function loadDraft() {
    try {
      const res = await fetch('/api/order-draft');
      if (!res.ok) return;
      const d = await res.json();
      const list = Array.isArray(d.products) ? d.products : [];
      cart = list
        .map((p) => ({
          id: String(p.id || ''),
          quantity: normalizeQty(Number(p.quantity), 1),
          reason: String(p.reason || '').trim(),
        }))
        .filter((p) => p.id);
    } catch {
      // ignore
    }
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
        // Clear draft on server
        await fetch('/api/order-draft', { method: 'DELETE' });
        return true;
      }

      // Ensure reasons exist (server requires it)
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

  function renderCart() {
    if (!cartItemsEl) return;

    cartItemsEl.innerHTML = '';

    if (!Array.isArray(cart) || cart.length === 0) {
      renderEmptyState();
      updateSummary();
      if (window.feather) feather.replace();
      return;
    }

    for (const p of cart) {
      const c = byId.get(String(p.id)) || null;
      const name = c?.name || 'Unknown component';
      const reason = String(p.reason || '').trim();
      const qty = normalizeQty(Number(p.quantity), MIN_QTY);
      const total = itemTotal({ id: p.id, quantity: qty, reason });

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
        // If Notion has an "ID" (unique_id) property, show it inside the icon.
        const disp = String(c?.displayId || '').trim();
        if (disp) {
          thumb.textContent = disp;
          thumb.classList.add('cart-thumb-has-id');
          // A tiny dynamic size tweak so long IDs still fit inside the 58x58 box.
          if (disp.length >= 8) thumb.classList.add('cart-thumb-id-small');
        } else {
          // fallback: first letter
          const letter = (String(name).trim()[0] || '•').toUpperCase();
          thumb.textContent = letter;
        }
      }

      const meta = document.createElement('div');
      meta.className = 'prod-meta';
      meta.innerHTML = `
        <div class="prod-name" title="${escapeHtml(name)}">${escapeHtml(name)}</div>
        <div class="prod-reason" title="${escapeHtml(reason || '-')}">${escapeHtml(reason || '-')}</div>
      `;

      productCell.appendChild(thumb);
      productCell.appendChild(meta);

      // URL cell (button opens component link)
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
      incBtn.addEventListener('click', () => {
        changeQty(p.id, +1);
      });
      decBtn.addEventListener('click', () => {
        changeQty(p.id, -1);
      });
      trashBtn.addEventListener('click', () => {
        removeItem(p.id);
      });

      // Optional: click product area to edit this item in modal
      productCell.style.cursor = 'pointer';
      productCell.addEventListener('click', () => openModalForEdit(p.id));

      row.appendChild(productCell);
      row.appendChild(urlCell);
      row.appendChild(qtyCell);
      row.appendChild(totalCell);
      row.appendChild(actionCell);

      cartItemsEl.appendChild(row);
    }

    updateSummary();
    if (window.feather) feather.replace();
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
    const cleanReason = String(globalReason || '').trim();

    if (!cleanId) {
      toast('error', 'Missing field', 'Please choose a component.');
      return false;
    }
    if (!Number.isFinite(cleanQty) || cleanQty <= 0) {
      toast('error', 'Missing field', 'Please enter a valid quantity.');
      return false;
    }
    if (!cleanReason) {
      toast('error', 'Missing field', 'Please enter a reason.');
      return false;
    }

    const idx = cart.findIndex((p) => String(p.id) === cleanId);
    if (idx >= 0) {
      cart[idx].quantity = cleanQty;
      cart[idx].reason = cleanReason;
    } else {
      cart.push({ id: cleanId, quantity: cleanQty, reason: cleanReason });
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

  function openModalForAdd() {
    editingId = null;
    if (addToCartBtn) addToCartBtn.textContent = 'Add';
    if (!components.length) {
      toast('error', 'No components', 'Components list is empty.');
      return;
    }
    // reset inputs
    if (qtyInputEl) qtyInputEl.value = '1';

    // reset select
    if (choicesInst) {
      choicesInst.removeActiveItems();
    } else if (componentSelectEl) {
      componentSelectEl.value = '';
    }

    setModalOpen(true);
    // Focus select
    window.setTimeout(() => {
      try {
        const focusEl = modalEl.querySelector('.choices__inner') || componentSelectEl;
        focusEl?.focus?.();
      } catch {}
    }, 50);
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

    // set select to item component
    if (choicesInst) {
      try {
        choicesInst.setChoiceByValue(String(item.id));
      } catch {
        // fallback
        componentSelectEl.value = String(item.id);
      }
    } else if (componentSelectEl) {
      componentSelectEl.value = String(item.id);
    }

    setModalOpen(true);
  }

  function closeModal() {
    editingId = null;
    setModalOpen(false);
  }

  function initComponentChoices() {
    if (!componentSelectEl) return;

    // Build options
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

    // Choices
    try {
      if (choicesInst) {
        choicesInst.destroy();
        choicesInst = null;
      }
      choicesInst = new Choices(componentSelectEl, {
        searchEnabled: true,
        placeholder: true,
        placeholderValue: 'Select component...',
        itemSelectText: '',
        shouldSort: true,
        allowHTML: false,
        position: 'bottom',
        searchResultLimit: 500,
      });
    } catch (e) {
      console.warn('Choices init failed:', e);
      choicesInst = null;
    }
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

    // Global reason is required before checkout
    if (!String(globalReason || '').trim()) {
      toast('error', 'Reason required', 'Please enter the order reason first.');
      openOrderReasonModal({ force: true });
      return;
    }

    // Password is required before checkout (requested)
    const password = getPasswordValue();
    if (!password) {
      toast('error', 'Password required', 'Please enter your password before checkout.');
      try { passwordInput?.focus?.(); } catch {}
      return;
    }

    // Apply global reason to all items before submit
    applyGlobalReason();

    // Prevent double submit
    if (checkoutBtn && checkoutBtn.disabled) return;
    if (checkoutBtn) {
      checkoutBtn.disabled = true;
      checkoutBtn.setAttribute('aria-busy', 'true');
    }

    showSaving(isEditMode ? 'Saving changes...' : 'Submitting order...');

    try {
      // Persist draft (optional) so the server session stays in sync
      await persistDraft({ silent: true });

      const res = await fetch('/api/submit-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: cart, password }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        // Make password failures explicit for the user
        if (res.status === 401) {
          toast('error', 'Wrong password', data?.message || 'Invalid password.');
          try {
            passwordInput?.focus?.();
            passwordInput?.select?.();
          } catch {}
          return;
        }
        if (res.status === 400 && String(data?.message || '').toLowerCase().includes('password')) {
          toast('error', 'Password required', data?.message || 'Password is required.');
          try {
            passwordInput?.focus?.();
          } catch {}
          return;
        }
        throw new Error(data?.message || 'Failed to submit order.');
      }

      toast(
        'success',
        isEditMode ? 'Order Updated!' : 'Order Submitted!',
        isEditMode ? 'Your order has been updated successfully.' : 'Your order has been created successfully.',
      );

      // Clear UI immediately
      cart = [];
      if (passwordInput) passwordInput.value = '';
      renderCart();

      // Go back to orders list
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
    updateCartBtn?.addEventListener('click', () => {
      if (!readyToUse) {
        toast('error', 'Not ready', 'Please enter the order reason first.');
        openOrderReasonModal({ force: true });
        return;
      }
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
      const id = componentSelectEl?.value;
      const qty = Number(qtyInputEl?.value);

      // If we opened the modal from an existing item and the user changed
      // the selected component, remove the old item first to avoid duplicates.
      if (editingId && String(editingId) !== String(id)) {
        cart = cart.filter((p) => String(p.id) !== String(editingId));
      }

      const ok = upsertItem({ id, quantity: qty });
      if (!ok) return;

      closeModal();
      renderCart();

      // persist immediately (feels snappier)
      const saved = await persistDraft({ silent: true });
      if (!saved) toast('error', 'Error', 'Failed to save cart.');
    });

    checkoutBtn?.addEventListener('click', checkout);

    // UX: pressing Enter in password field triggers checkout
    passwordInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        checkout();
      }
    });

    // Reason modal
    orderReasonContinueBtn?.addEventListener('click', submitOrderReason);
    orderReasonInputEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        submitOrderReason();
      }
    });
  }

  // ---------------------------- Init ----------------------------
  async function init() {
    bindEvents();

    // Disable interactions until reason is entered + components loaded
    setReady(false);

    // Start loading data in the background while the user types the reason
    const componentsPromise = loadComponents();
    const draftPromise = loadDraft();

    // Keep promises accessible to reason submit handler
    window.__cartLoadPromises = { componentsPromise, draftPromise };

    // =======================
    // Edit mode behavior
    // =======================
    // When editing an existing order we already have the reason on the order items,
    // so we should NOT prompt for it again.
    if (isEditMode) {
      showSaving('Loading order...');

      try {
        // Ensure draft loaded first so we can pull its existing reason
        await draftPromise;
      } catch {}

      // Derive reason from the existing order items (best effort)
      const firstReason = cart.find((p) => String(p.reason || '').trim())?.reason || '';
      globalReason = String(firstReason || '').trim();
      applyGlobalReason();

      // Wait for components DB
      try {
        await componentsPromise;
      } catch {}

      hideSaving();

      if (!String(globalReason || '').trim()) {
        // Fallback: no reason found in draft (legacy/edge case)
        openOrderReasonModal({ force: true });
      }

      if (!Array.isArray(components) || components.length === 0) {
        toast('error', 'Error', 'Failed to load components list. Please reload the page.');
        return;
      }

      initComponentChoices();
      setOrderReasonModalOpen(false);
      setReady(true);

      renderCart();
      await persistDraft({ silent: true });
      return;
    }

    // =======================
    // Normal (new order) behavior
    // =======================
    // Show reason modal immediately
    openOrderReasonModal({ force: true });

    // When draft loads, try to prefill the reason input (best effort)
    draftPromise.then(() => {
      if (!orderReasonInputEl) return;
      const current = String(orderReasonInputEl.value || '').trim();
      if (current) return;
      const first = cart.find((p) => String(p.reason || '').trim());
      if (first) orderReasonInputEl.value = String(first.reason || '').trim();
    });

    // Render early (empty state) so the page doesn't look frozen
    renderCart();
  }

  document.addEventListener('DOMContentLoaded', init);

  // ---------------------------- Reason / gating ----------------------------
  function setReady(isReady) {
    readyToUse = Boolean(isReady);
    try {
      if (updateCartBtn) updateCartBtn.disabled = !readyToUse;
    } catch {}
  }

  function setOrderReasonModalOpen(open) {
    if (!orderReasonModalEl) return;
    orderReasonModalEl.style.display = open ? 'flex' : 'none';
    orderReasonModalEl.setAttribute('aria-hidden', open ? 'false' : 'true');
    document.body.style.overflow = open ? 'hidden' : '';
  }

  function openOrderReasonModal({ force = false } = {}) {
    if (!orderReasonModalEl) return;

    // If we already have a reason and not forced, don't block the user.
    if (!force && String(globalReason || '').trim()) return;

    setOrderReasonModalOpen(true);
    window.setTimeout(() => {
      try {
        orderReasonInputEl?.focus?.();
      } catch {}
    }, 50);
  }

  function applyGlobalReason() {
    const r = String(globalReason || '').trim();
    if (!r) return;
    if (!Array.isArray(cart)) return;
    for (const item of cart) {
      item.reason = r;
    }
  }

  async function submitOrderReason() {
    const reason = String(orderReasonInputEl?.value || '').trim();
    if (!reason) {
      toast('error', 'Missing field', 'Please enter a reason.');
      try { orderReasonInputEl?.focus?.(); } catch {}
      return;
    }

    globalReason = reason;
    applyGlobalReason();

    // Wait for components to finish loading (if still pending)
    const promises = window.__cartLoadPromises || {};
    const componentsPromise = promises.componentsPromise;
    const draftPromise = promises.draftPromise;

    // Ensure draft loaded before we proceed (so cart renders correctly)
    if (draftPromise && typeof draftPromise.then === 'function') {
      try {
        await draftPromise;
      } catch {}
      // If draft loaded after user typed the reason, enforce the global reason.
      applyGlobalReason();
    }

    let componentsLoaded = false;
    if (componentsPromise && typeof componentsPromise.then === 'function') {
      try {
        // If already resolved, this await is instant; otherwise show a loader.
        const showLoader = components.length === 0;
        if (showLoader) showSaving('Loading components...');
        await componentsPromise;
        componentsLoaded = true;
      } catch {
        componentsLoaded = false;
      } finally {
        hideSaving();
      }
    } else {
      // No promise (shouldn't happen) — treat as loaded
      componentsLoaded = true;
    }

    if (!componentsLoaded || !Array.isArray(components) || components.length === 0) {
      toast('error', 'Error', 'Failed to load components list. Please reload the page.');
      return;
    }

    // Initialize choices now that we have components
    initComponentChoices();

    // Close modal and enable interactions
    setOrderReasonModalOpen(false);
    setReady(true);

    // Update UI
    renderCart();
    await persistDraft({ silent: true });
  }

  // ---------------------------- Quantity helpers ----------------------------
  function normalizeQty(n, fallback = NaN) {
    const x = Number(n);
    if (!Number.isFinite(x)) return fallback;
    // Round to 3 decimals to avoid float artifacts like 0.30000000004
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
