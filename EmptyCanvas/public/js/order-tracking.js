// public/js/order-tracking.js

document.addEventListener('DOMContentLoaded', () => {
  const titleEl = document.getElementById('trackingTitle');
  const subEl = document.getElementById('trackingSubtitle');
  const etaEl = document.getElementById('trackingEta');
  const metaEl = document.getElementById('trackingMeta');
  const fillEl = document.getElementById('trackFill');
  const pillEl = document.getElementById('trackPill');
  const itemsListEl = document.getElementById('trackingItemsList');

  const url = new URL(window.location.href);
  const groupId = url.searchParams.get('groupId');

  const moneyFmt = (() => {
    try {
      return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
    } catch {
      return null;
    }
  })();

  function fmtMoney(v) {
    const n = Number(v);
    const safe = Number.isFinite(n) ? n : 0;
    return moneyFmt ? moneyFmt.format(safe) : `£${safe.toFixed(2)}`;
  }

  function pad2(n) {
    const x = Number(n) || 0;
    return String(x).padStart(2, '0');
  }

  function fmtHHMM(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '-- : --';
    return `${pad2(d.getHours())} : ${pad2(d.getMinutes())}`;
  }

  function setProgress(step) {
    const s = Number(step) || 1;
    const nodes = pillEl ? Array.from(pillEl.querySelectorAll('.track-node')) : [];
    nodes.forEach((node) => {
      const n = Number(node.dataset.step);
      node.classList.remove('is-active', 'is-done');
      if (n < s) node.classList.add('is-done');
      else if (n === s) node.classList.add('is-active');
    });

    // Fill width: 1 => ~33%, 2 => ~66%, 3 => 100%
    if (fillEl) {
      const pct = s <= 1 ? 34 : s === 2 ? 67 : 100;
      fillEl.style.width = `${pct}%`;
    }
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"]/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
    }[c]));
  }

  function renderItems(items) {
    if (!itemsListEl) return;
    itemsListEl.innerHTML = '';

    if (!Array.isArray(items) || items.length === 0) {
      itemsListEl.innerHTML = '<p class="muted">No items found.</p>';
      return;
    }

    const frag = document.createDocumentFragment();
    for (const it of items) {
      const row = document.createElement('div');
      row.className = 'tracking-item';

      const thumb = it.productImage
        ? `<img src="${esc(it.productImage)}" alt="${esc(it.productName || '')}" loading="lazy" />`
        : `<div class="tracking-item__ph">${esc(String(it.productName || '?').trim().slice(0, 2).toUpperCase())}</div>`;

      row.innerHTML = `
        <div class="tracking-item__thumb">${thumb}</div>
        <div class="tracking-item__main">
          <div class="tracking-item__name">${esc(it.productName || 'Unknown Product')}</div>
          <div class="tracking-item__sub">Qty: <strong>${Number(it.quantity) || 0}</strong> • Unit: ${fmtMoney(it.unitPrice)}</div>
        </div>
        <div class="tracking-item__status">
          <span class="pill ${String(it.status || '').toLowerCase() === 'received' ? 'pill--success' : 'pill--danger'}">${esc(it.status || 'Pending')}</span>
        </div>
      `;

      frag.appendChild(row);
    }
    itemsListEl.appendChild(frag);
  }

  async function loadTracking() {
    if (!groupId) {
      titleEl.textContent = 'Missing order';
      subEl.textContent = 'No groupId was provided.';
      setProgress(1);
      return;
    }

    try {
      const res = await fetch(`/api/orders/tracking?groupId=${encodeURIComponent(groupId)}`, {
        credentials: 'include',
        cache: 'no-store',
      });

      if (res.status === 401) {
        window.location.href = '/login';
        return;
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to load tracking');
      }

      const data = await res.json();
      const stage = data.stage || {};

      titleEl.textContent = stage.label || 'On the way';
      subEl.textContent = stage.subtitle || 'Your cargo is on delivery.';
      setProgress(stage.step || 2);

      etaEl.textContent = fmtHHMM(data.eta);

      if (metaEl) {
        const c = data.summary?.itemsCount ?? data.items?.length ?? 0;
        const q = data.summary?.totalQuantity ?? 0;
        const total = data.summary?.estimateTotal ?? 0;
        metaEl.textContent = `${c} item${c === 1 ? '' : 's'} • Total qty: ${q} • Estimate: ${fmtMoney(total)}`;
      }

      renderItems(data.items);

      if (window.feather) window.feather.replace();
    } catch (e) {
      console.error(e);
      titleEl.textContent = 'Error';
      subEl.textContent = e.message || 'Failed to load tracking.';
      setProgress(1);
    }
  }

  loadTracking();
});
