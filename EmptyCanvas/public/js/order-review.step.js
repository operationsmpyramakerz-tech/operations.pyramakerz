document.addEventListener('DOMContentLoaded', async () => {
  // ========= Toast: تصميم احترافي بظل =========
  const toast = ((doc) => {
    const icons = {
      success:
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>',
      error:
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      info:
        '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };

    const ensureStack = () => {
      let stack = doc.getElementById('toast-stack');
      if (!stack) {
        stack = doc.createElement('div');
        stack.id = 'toast-stack';
        stack.className = 'toast-stack';
        doc.body.appendChild(stack);
      }
      return stack;
    };

    return ({ type = 'info', title = '', message = '', duration = 3500 } = {}) => {
      const stack = ensureStack();
      const el = doc.createElement('div');
      el.className = `toast toast--${type}`;
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');

      el.innerHTML = `
        <div class="toast__icon">${icons[type] || icons.info}</div>
        <div class="toast__content">
          <div class="toast__title">${title ? String(title) : ''}</div>
          ${message ? `<div class="toast__msg">${String(message)}</div>` : ''}
        </div>
        <button class="toast__close" aria-label="Close notification">✕</button>
      `;

      const remove = () => {
        if (!el.isConnected) return;
        el.classList.remove('is-in');
        // wait transition then remove
        setTimeout(() => el.remove(), 180);
      };

      el.querySelector('.toast__close').addEventListener('click', remove);

      // Pause auto-hide on hover
      let timer = null;
      const startTimer = () => {
        if (duration > 0) timer = setTimeout(remove, duration);
      };
      const stopTimer = () => { if (timer) { clearTimeout(timer); timer = null; } };
      el.addEventListener('mouseenter', stopTimer);
      el.addEventListener('mouseleave', startTimer);

      stack.appendChild(el);
      // animate in
      requestAnimationFrame(() => el.classList.add('is-in'));
      startTimer();

      return el;
    };
  })(document);
  // ========= نهاية Toast =========

  // عناصر الـ UI
  const reasonEl =
    document.getElementById('summary-reason-value') ||
    document.querySelector('[data-review-reason]');
  const totalEl =
    document.getElementById('summary-total-value') ||
    document.querySelector('[data-review-total-items]');
  const listEl =
    document.getElementById('summary-products-list') ||
    document.querySelector('[data-review-products-list]');
  const submitBtn = document.getElementById('submitOrderBtn');

  // Loading/content containers
  const loadingIndicator = document.getElementById('loading-indicator');
  const orderDetailsContainer = document.getElementById('order-details');

  const showLoading = () => {
    if (loadingIndicator) loadingIndicator.style.display = 'flex';
    if (orderDetailsContainer) orderDetailsContainer.style.display = 'none';
  };
  const showContent = () => {
    if (loadingIndicator) loadingIndicator.style.display = 'none';
    if (orderDetailsContainer) orderDetailsContainer.style.display = 'block';
  };

  const escapeHTML = (s) =>
    String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;'}[c]));

  showLoading();
let draft = {};
  try {
    // تحميل الدِرافْت + قائمة المنتجات
    const [draftRes, compRes] = await Promise.all([
      fetch('/api/order-draft', { credentials: 'same-origin' }),
      fetch('/api/components', { credentials: 'same-origin' })
    ]);

    draft = await draftRes.json().catch(() => ({}));
    const components = await compRes.json().catch(() => []);

  
    if (!Array.isArray(draft.products) || draft.products.length === 0) {
      location.replace('/orders/new/products');
      return;
    }
    if (totalEl) totalEl.textContent = String(draft.products.length);

    const byId = new Map(
      Array.isArray(components) ? components.map(c => [String(c.id), c]) : []
    );

    draft.products.forEach(p => {
  const comp = byId.get(String(p.id));
  const name = comp?.name || 'Unknown product';

  const card = document.createElement('div');
  card.className = 'product-card';

  card.innerHTML = `
    <div class="badge badge--name" title="${name}">${name}</div>
    <div class="badge badge--qty">Qty: ${p.quantity}</div>
    <div class="badge badge--reason">Reason: ${p.reason ? p.reason : '-'}</div>
  `;

  listEl.appendChild(card);
});
    
    showContent();
  } catch (error) {
    console.error('Failed to load order review:', error);
    showContent();
    if (listEl) {
      listEl.innerHTML = `
        <div class="card" style="border:1px solid #FCA5A5; background:#FEE2E2; color:#B91C1C; padding:1rem; border-radius:8px;">
          Error loading order details. Please go back and try again.
        </div>
      `;
    }
    if (submitBtn) submitBtn.parentElement.style.display = 'none';
  }

  // إرسال الطلب — نفس المنطق لكن باستخدام التوست الجديد
  if (submitBtn) {
    submitBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      if (submitBtn.disabled) return;
      const origText = submitBtn.textContent;

      submitBtn.disabled = true;
      submitBtn.textContent = 'Submitting...';
      submitBtn.setAttribute('aria-busy', 'true');

      try {
        const res = await fetch('/api/submit-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ products: draft.products })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) throw new Error(data?.message || 'Failed to submit');

        toast({
          type: 'success',
          title: 'Order Submitted!',
          message: 'Your order has been created successfully.',
          duration: 3500
        });

        setTimeout(() => location.replace('/orders'), 1200);
      } catch (err) {
        toast({
          type: 'error',
          title: 'Submission Failed',
          message: err?.message || 'Something went wrong. Please try again.',
          duration: 5000
        });
        submitBtn.disabled = false;
        submitBtn.textContent = origText;
        submitBtn.removeAttribute('aria-busy');
      }
    });
  }

  if (window.feather) feather.replace();
});
