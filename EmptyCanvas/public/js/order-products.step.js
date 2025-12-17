// public/js/order-products.step.js
(() => {
  let components = [];
  let isComponentsLoaded = false;
  const toHydrate = []; // { inst, container, defaultId }
  let urlById = new Map(); // id -> URL from Products_Database

  const rowsContainer = document.getElementById('products-container');
  const addBtn = document.getElementById('addProductBtn');
  const nextBtn = document.getElementById('nextReviewBtn');

  async function loadComponents() {
    try {
      const res = await fetch('/api/components');
      if (!res.ok) throw new Error(await res.text());
      const list = await res.json();
      if (!Array.isArray(list)) throw new Error('Bad response format');
      return list;
    } catch (e) {
      console.error('Failed to load components:', e);
      return [];
    }
  }

  function optionsFromComponents() {
    return components.map(c => ({
      value: c.id,
      label: c.name,
      selected: false,
      disabled: false
    }));
  }

  function enhanceWithChoices(select, defaultId = '') {
    const inst = new Choices(select, {
      searchEnabled: true,
      placeholder: true,
      placeholderValue: isComponentsLoaded ? 'Select a product...' : 'Loading products list...',
      itemSelectText: '',
      shouldSort: true,
      allowHTML: false,
      position: 'bottom',
      searchResultLimit: 500,
      fuseOptions: {
        keys: ['label'],
        threshold: 0.3
      }
    });

    const container =
      inst.containerOuter?.element ||
      select.closest('.choices') ||
      select.parentElement.querySelector('.choices');

    if (!isComponentsLoaded) {
      container?.classList.add('is-loading');
      inst.disable(); // until data arrives
      toHydrate.push({ inst, container, defaultId });
    } else {
      inst.clearChoices();
      inst.setChoices(optionsFromComponents(), 'value', 'label', true);
      if (defaultId) inst.setChoiceByValue(String(defaultId));
    }
    return inst;
  }

  function hydratePendingChoices() {
    toHydrate.forEach(({ inst, container, defaultId }) => {
      try {
        inst.enable();
        inst.clearChoices();
        inst.setChoices(optionsFromComponents(), 'value', 'label', true);
        if (defaultId) inst.setChoiceByValue(String(defaultId));
        container?.classList.remove('is-loading');
      } catch (e) {
        console.warn('Hydration failed for a select', e);
      }
    });
    toHydrate.length = 0;
  }

  function updateAllLinks() {
    const rows = [...rowsContainer.querySelectorAll('.product-row')];
    rows.forEach(r => {
      const select = r.querySelector('select.product-select');
      const link = r.querySelector('a.product-url-link');
      if (!select || !link) return;
      const url = urlById.get(String(select.value));
      if (url) {
        link.href = url;
        link.style.display = 'inline-flex';
      } else {
        link.removeAttribute('href');
        link.style.display = 'none';
      }
    });
  }

  function addRow(defaultId = '', defaultQty = 1) {
    const row = document.createElement('div');
    row.className = 'product-row';

    // Product cell
    const productCell = document.createElement('div');
    productCell.className = 'field';
    const select = document.createElement('select');
    select.className = 'product-select';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.disabled = true;
    placeholder.selected = true;
    placeholder.textContent = isComponentsLoaded
      ? 'Select a product...'
      : 'Loading products list...';
    select.appendChild(placeholder);
    productCell.appendChild(select);

    // Quantity cell
    const qtyCell = document.createElement('div');
    qtyCell.className = 'field';
    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.min = '1';
    qtyInput.step = '1';
    qtyInput.value = String(defaultQty || 1);
    qtyInput.className = 'qty-input';
    qtyCell.appendChild(qtyInput);

    // Reason cell
const reasonCell = document.createElement('div');
const reasonInput = document.createElement('input');
reasonInput.type = 'text';
reasonInput.placeholder = 'Reason...';
reasonInput.className = 'reason-input';
reasonCell.appendChild(reasonInput);

    // Actions cell (icon link + remove)
    const actionsCell = document.createElement('div');
    actionsCell.className = 'field actions-cell';

    // --- Link icon (hidden until URL exists) ---
    const linkEl = document.createElement('a');
    linkEl.className = 'product-url-link';
    linkEl.setAttribute('aria-label', 'Open product page');
    linkEl.target = '_blank';
    linkEl.rel = 'noopener';
    linkEl.href = '#';
    linkEl.style.display = 'none'; // will show when URL available
    linkEl.style.marginRight = '8px';
    linkEl.style.textDecoration = 'none';
    linkEl.style.alignItems = 'center';
    linkEl.style.justifyContent = 'center';
    linkEl.style.width = '28px';
    linkEl.style.height = '28px';
    linkEl.style.borderRadius = '6px';
    linkEl.style.color = '#2563eb';

    // Feather icon
    const icon = document.createElement('i');
    icon.setAttribute('data-feather', 'link-2');
    linkEl.appendChild(icon);

    // small hover affordance without extra CSS
    linkEl.addEventListener('mouseenter', () => { linkEl.style.background = '#EFF6FF'; });
    linkEl.addEventListener('mouseleave', () => { linkEl.style.background = 'transparent'; });

    actionsCell.appendChild(linkEl);

    // Remove X red
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'icon-btn icon-btn--danger icon-btn--x';
    removeBtn.title = 'Remove';
    removeBtn.setAttribute('aria-label', 'Remove product');
    removeBtn.innerHTML = '&times;';
    removeBtn.addEventListener('click', () => row.remove());
    actionsCell.appendChild(removeBtn);

    row.appendChild(productCell);
    row.appendChild(qtyCell);
    row.appendChild(reasonCell);
    row.appendChild(actionsCell);
    rowsContainer.appendChild(row);

    // Activate Choices
    enhanceWithChoices(select, defaultId);

    // Render feather icon for the new link
    if (window.feather) feather.replace();

    // Update link on change
    select.addEventListener('change', () => {
      const url = urlById.get(String(select.value));
      if (url) {
        linkEl.href = url;
        linkEl.style.display = 'inline-flex';
      } else {
        linkEl.removeAttribute('href');
        linkEl.style.display = 'none';
      }
    });
  }

  async function saveAndGoNext() {
    const rows = [...rowsContainer.querySelectorAll('.product-row')];
    const payload = [];

    for (const r of rows) {
      const selectEl = r.querySelector('select');
      const id = selectEl?.value;
      const qty = Number(r.querySelector('input[type="number"]')?.value);
      const reason = r.querySelector('.reason-input')?.value.trim() || "";
      if (id && Number.isFinite(qty) && qty > 0) {
        payload.push({ id, quantity: qty, reason });
      }
    }

    if (payload.length === 0) {
      alert('Please choose at least one product and quantity.');
      return;
    }

    const res = await fetch('/api/order-draft/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ products: payload })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(data?.error || 'Failed to save products.');
      return;
    }
    window.location.href = '/orders/new/review';
  }

  async function init() {
    if (!rowsContainer) {
      console.error('Missing #products-container in DOM');
      return;
    }

    // Add button
    if (addBtn && !addBtn.dataset.enhanced) {
      addBtn.dataset.enhanced = '1';
      addBtn.innerHTML = '<i data-feather="plus"></i><span>Add Another Product</span>';
      if (window.feather) feather.replace();
    }

    // 1) Default row
    addRow();

    // 2) Load components and hydrate selects
    components = await loadComponents();
    isComponentsLoaded = true;
    urlById = new Map(components.map(c => [String(c.id), c.url || ""]));
    hydratePendingChoices();
    updateAllLinks();

    // 3) Draft hydration
    try {
      const res = await fetch('/api/order-draft');
      if (res.ok) {
        const draft = await res.json();
        if (Array.isArray(draft.products) && draft.products.length) {
          rowsContainer.innerHTML = '';
          for (const p of draft.products) {
            addRow(String(p.id), Number(p.quantity) || 1);
          }
          updateAllLinks();
        }
      }
    } catch { /* ignore */ }

    addBtn?.addEventListener('click', () => addRow());
    nextBtn?.addEventListener('click', saveAndGoNext);

    if (window.feather) feather.replace();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
