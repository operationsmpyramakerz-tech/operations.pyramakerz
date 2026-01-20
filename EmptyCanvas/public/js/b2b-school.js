document.addEventListener('DOMContentLoaded', () => {
  const schoolNameEl = document.getElementById('schoolName');
  const detailsEl = document.getElementById('schoolDetails');
  const groupsEl = document.getElementById('school-stock-groups');
  const searchInput = document.getElementById('schoolStockSearch');
  const downloadPdfBtn = document.getElementById('downloadPdfBtn');
  const downloadExcelBtn = document.getElementById('downloadExcelBtn');
  const makeInventoryBtn = document.getElementById('makeInventoryBtn');

  let school = null;
  let allStock = [];
  let stockMeta = { donePropName: null, inventoryPropName: null, inventoryDate: null };
  // UI state: show/hide the inventory column (protected by Admin password)
  let inventoryMode = false;

  // Disable export buttons until we know the school
  if (downloadPdfBtn) downloadPdfBtn.disabled = true;
  if (downloadExcelBtn) downloadExcelBtn.disabled = true;
  if (makeInventoryBtn) makeInventoryBtn.disabled = true;

  const norm = (s) => String(s || '').toLowerCase().trim();

  const getSchoolIdFromPath = () => {
    try {
      const parts = window.location.pathname.split('/').filter(Boolean);
      // expected: /b2b/school/:id
      return parts[parts.length - 1] || '';
    } catch {
      return '';
    }
  };

  // Notion select colors mapping
  const colorVars = (color = 'default') => {
    switch (color) {
      case 'gray':   return { bg:'#F3F4F6', text:'#374151', border:'#E5E7EB' };
      case 'brown':  return { bg:'#EFEBE9', text:'#4E342E', border:'#D7CCC8' };
      case 'orange': return { bg:'#FFF7ED', text:'#9A3412', border:'#FED7AA' };
      case 'yellow': return { bg:'#FEFCE8', text:'#854D0E', border:'#FDE68A' };
      case 'green':  return { bg:'#ECFDF5', text:'#065F46', border:'#A7F3D0' };
      case 'blue':   return { bg:'#EFF6FF', text:'#1E40AF', border:'#BFDBFE' };
      case 'purple': return { bg:'#F5F3FF', text:'#5B21B6', border:'#DDD6FE' };
      case 'pink':   return { bg:'#FDF2F8', text:'#9D174D', border:'#FBCFE8' };
      case 'red':    return { bg:'#FEF2F2', text:'#991B1B', border:'#FECACA' };
      default:       return { bg:'#F3F4F6', text:'#111827', border:'#E5E7EB' };
    }
  };

  const makePill = (text, color = 'default') => {
    const span = document.createElement('span');
    span.className = `tag-pill tag--${color}`;
    span.textContent = String(text || '').trim() || '—';
    return span;
  };

  const makeInfoPill = (text, color = 'default') => {
    const span = document.createElement('span');
    span.className = 'pill';
    const cv = colorVars(color);
    span.style.setProperty('--pill-bg', cv.bg);
    span.style.setProperty('--pill-text', cv.text);
    span.style.setProperty('--pill-border', cv.border);
    span.innerHTML = `<span class="dot" aria-hidden="true"></span><span>${String(text || '').trim() || '—'}</span>`;
    return span;
  };


  const groupByTag = (rows) => {
    const map = new Map();
    (rows || []).forEach((item) => {
      const name = item?.tag?.name || 'Untagged';
      const color = item?.tag?.color || 'default';
      const key = `${name.toLowerCase()}|${color}`;
      if (!map.has(key)) map.set(key, { name, color, items: [] });
      map.get(key).items.push(item);
    });

    let arr = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    const untagged = arr.filter((g) => g.name.toLowerCase() === 'untagged' || g.name === '-');
    arr = arr.filter((g) => !(g.name.toLowerCase() === 'untagged' || g.name === '-'));
    return arr.concat(untagged);
  };

  const renderDetails = () => {
    if (!detailsEl) return;
    if (!school) {
      detailsEl.innerHTML = `<div class="error-block">School details not found.</div>`;
      return;
    }

    const gov = school.governorate?.name || '';
    const govColor = school.governorate?.color || 'default';
    const edu = Array.isArray(school.educationSystem) ? school.educationSystem.filter(Boolean) : [];
    const program = school.programType || '';
    const location = school.location || '';

    const locHtml = location
      ? `<a href="${location}" target="_blank" rel="noopener noreferrer">Open location</a>`
      : '—';

    detailsEl.innerHTML = `
      <div class="detail-row">
        <div class="label">Governorate</div>
        <div class="value">${gov ? makeInfoPill(gov, govColor).outerHTML : '—'}</div>
      </div>

      <div class="detail-row">
        <div class="label">Location</div>
        <div class="value">${locHtml}</div>
      </div>

      <div class="detail-row">
        <div class="label">Education System</div>
        <div class="value">${edu.length ? edu.map((x) => makeInfoPill(x, 'gray').outerHTML).join(' ') : '—'}</div>
      </div>

      <div class="detail-row">
        <div class="label">Program type</div>
        <div class="value">${program ? makeInfoPill(program, 'gray').outerHTML : '—'}</div>
      </div>
    `;

    if (window.feather) feather.replace();
  };

  // ---------- Admin password modal (for Inventory actions) ----------
  // Uses Team Members DB (Admin) via: POST /api/b2b/admin/verify
  const AdminAuth = (() => {
    const MODAL_ID = 'adminPasswordModal';

    /** @type {null | {modal:HTMLElement, title:HTMLElement, hint:HTMLElement, input:HTMLInputElement, err:HTMLElement, confirm:HTMLButtonElement, cancel:HTMLButtonElement, close:HTMLButtonElement, backdrop:HTMLElement}} */
    let ui = null;
    let currentResolve = null;
    let currentActionLabel = '';

    const ensure = () => {
      if (ui) return ui;

      const modal = document.createElement('div');
      modal.id = MODAL_ID;
      modal.className = 'modal hidden';
      modal.innerHTML = `
        <div class="modal__backdrop" data-admin-backdrop></div>
        <div class="modal__dialog" role="dialog" aria-modal="true" aria-labelledby="adminPwdTitle">
          <div class="modal__header">
            <div style="font-weight:800;" id="adminPwdTitle" data-admin-title>Admin verification</div>
            <button class="modal__close" type="button" aria-label="Close" data-admin-close>&times;</button>
          </div>
          <div class="modal__body">
            <div class="hint" style="margin-bottom:10px;" data-admin-hint></div>
            <input class="input" type="password" autocomplete="current-password" placeholder="Password" data-admin-input />
            <div class="hint" style="margin-top:10px; color:#DC2626; display:none;" data-admin-err></div>
          </div>
          <div class="modal__footer">
            <button class="btn btn--light" type="button" data-admin-cancel>Cancel</button>
            <button class="btn" type="button" data-admin-confirm>Confirm</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      const title = modal.querySelector('[data-admin-title]');
      const hint = modal.querySelector('[data-admin-hint]');
      const input = modal.querySelector('[data-admin-input]');
      const err = modal.querySelector('[data-admin-err]');
      const confirm = modal.querySelector('[data-admin-confirm]');
      const cancel = modal.querySelector('[data-admin-cancel]');
      const close = modal.querySelector('[data-admin-close]');
      const backdrop = modal.querySelector('[data-admin-backdrop]');

      const closeWith = (result) => {
        try {
          modal.classList.add('hidden');
          err.style.display = 'none';
          err.textContent = '';
          input.value = '';
          if (typeof currentResolve === 'function') {
            const r = currentResolve;
            currentResolve = null;
            r(result);
          }
        } catch {
          // no-op
        }
      };

      backdrop.addEventListener('click', () => closeWith(false));
      close.addEventListener('click', () => closeWith(false));
      cancel.addEventListener('click', () => closeWith(false));

      // Enter submits
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          confirm.click();
        }
        if (e.key === 'Escape') {
          e.preventDefault();
          closeWith(false);
        }
      });

      // Verify on confirm
      confirm.addEventListener('click', async () => {
        const pw = String(input.value || '').trim();
        err.style.display = 'none';
        err.textContent = '';

        if (!pw) {
          err.textContent = 'Please enter the Admin password.';
          err.style.display = 'block';
          input.focus();
          return;
        }

        confirm.disabled = true;
        confirm.classList.add('is-busy');

        try {
          const res = await fetch('/api/b2b/admin/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ password: pw }),
          });

          if (res.status === 401 || res.redirected) {
            // If session expired → server redirects to /login
            if (res.redirected) {
              window.location.href = '/login';
              return;
            }
            const j = await res.json().catch(() => ({}));
            err.textContent = j?.error || 'Invalid password.';
            err.style.display = 'block';
            input.select();
            input.focus();
            return;
          }

          if (!res.ok) {
            const j = await res.json().catch(() => ({}));
            err.textContent = j?.error || 'Failed to verify password.';
            err.style.display = 'block';
            input.select();
            input.focus();
            return;
          }

          // success
          closeWith(true);
          if (window.UI && UI.toast) {
            UI.toast({
              type: 'success',
              title: 'Verified',
              message: currentActionLabel ? `Admin verified (${currentActionLabel}).` : 'Admin verified.',
              duration: 2500,
            });
          }
        } catch (e) {
          err.textContent = e?.message || 'Failed to verify password.';
          err.style.display = 'block';
          input.focus();
        } finally {
          confirm.disabled = false;
          confirm.classList.remove('is-busy');
        }
      });

      ui = { modal, title, hint, input, err, confirm, cancel, close, backdrop };
      return ui;
    };

    const open = ({ actionLabel }) => {
      const x = ensure();
      currentActionLabel = String(actionLabel || '').trim();
      x.title.textContent = 'Admin verification';
      x.hint.textContent = currentActionLabel
        ? `Enter Admin password to ${currentActionLabel}.`
        : 'Enter Admin password.';
      x.err.style.display = 'none';
      x.err.textContent = '';
      x.input.value = '';
      x.modal.classList.remove('hidden');
      setTimeout(() => x.input.focus(), 50);
      return new Promise((resolve) => {
        currentResolve = resolve;
      });
    };

    return {
      verify: async (actionLabel) => {
        const ok = await open({ actionLabel });
        return !!ok;
      },
    };
  })();

  // Inventory save (B2B) — debounce updates per row
  const inventorySaveTimers = new Map();

  const saveInventoryValue = async (schoolId, stockPageId, value) => {
    const res = await fetch(
      `/api/b2b/schools/${encodeURIComponent(schoolId)}/stock/${encodeURIComponent(stockPageId)}/inventory`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          value,
          inventoryPropName: stockMeta?.inventoryPropName || null,
          inventoryDate: stockMeta?.inventoryDate || null,
        }),
      },
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data?.details || data?.error || 'Failed to save inventory.';
      throw new Error(msg);
    }
    // Keep meta in sync (server may create the column on-demand)
    if (data?.inventoryPropName) stockMeta.inventoryPropName = data.inventoryPropName;
    if (data?.inventoryDate) stockMeta.inventoryDate = data.inventoryDate;
    return data;
  };

  const scheduleInventorySave = (schoolId, stockPageId, value) => {
    const key = String(stockPageId || '');
    if (!key) return;
    const prev = inventorySaveTimers.get(key);
    if (prev) clearTimeout(prev);
    const t = setTimeout(async () => {
      try {
        await saveInventoryValue(schoolId, stockPageId, value);
      } catch (e) {
        console.error(e);
        if (window.UI && UI.toast) {
          UI.toast({ type: 'error', title: 'Inventory', message: e.message || 'Failed to save inventory.' });
        }
      }
    }, 550);
    inventorySaveTimers.set(key, t);
  };

  const renderGroups = (rows) => {
    if (!groupsEl) return;
    groupsEl.innerHTML = '';

    if (!Array.isArray(rows) || rows.length === 0) {
      groupsEl.innerHTML = `<div class="empty-block">No stock data found.</div>`;
      return;
    }

    const doneLabel = stockMeta?.donePropName || (school?.name ? `${school.name} Done` : 'Done');
    const hasInventoryProp = !!stockMeta?.inventoryPropName;
    const showInventory = inventoryMode && hasInventoryProp;
    const inventoryLabel = showInventory
      ? (stockMeta?.inventoryDate ? `Inventory (${stockMeta.inventoryDate})` : 'Inventory')
      : null;

    const groups = groupByTag(rows);
    const frag = document.createDocumentFragment();
    // Note: '<School> Done' in Notion is usually a Number/Rollup/Formula (e.g., 2, 8, ...).
    // We display that numeric value directly (item.doneQuantity).

    groups.forEach((group) => {
      const card = document.createElement('section');
      card.className = 'card card--elevated group-card';

      const cv = colorVars(group.color);
      card.style.setProperty('--group-accent-bg', cv.bg);
      card.style.setProperty('--group-accent-text', cv.text);
      card.style.setProperty('--group-accent-border', cv.border);

      const head = document.createElement('div');
      head.className = 'group-card__head';
      head.innerHTML = `
        <div class="group-head-left">
          <span class="group-title">Tag</span>
          <span class="group-tag">${makePill(group.name, group.color).outerHTML}</span>
        </div>
        <div class="group-head-right">
          <span class="group-count">${group.items.length} items</span>
        </div>
      `;

      const tableWrap = document.createElement('div');
      tableWrap.className = 'group-table-wrap';

      const table = document.createElement('table');
      table.className = 'group-table';

      const thead = document.createElement('thead');
      thead.innerHTML = `
        <tr>
          <th>Component</th>
          <th class="col-num col-done">${doneLabel}</th>
          ${showInventory ? `<th class="col-inventory col-inv">${inventoryLabel}</th>` : ''}
        </tr>
      `;

      const tbody = document.createElement('tbody');
      group.items
        .slice()
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .forEach((item) => {
          const tr = document.createElement('tr');

          const tdName = document.createElement('td');
          tdName.textContent = item.name || '-';
          tdName.style.fontWeight = '600';

          const tdDone = document.createElement('td');
          tdDone.className = 'col-num col-done';
          tdDone.textContent = String(item.doneQuantity ?? 0);

          tr.appendChild(tdName);
          tr.appendChild(tdDone);

          if (showInventory) {
            const tdInv = document.createElement('td');
            tdInv.className = 'col-inventory col-inv';

            const invInput = document.createElement('input');
            invInput.type = 'number';
            invInput.min = '0';
            invInput.step = '1';
            invInput.inputMode = 'numeric';
            invInput.className = 'inventory-input';
            invInput.placeholder = '—';
            invInput.value = item.inventory === null || typeof item.inventory === 'undefined' ? '' : String(item.inventory);
            invInput.setAttribute('data-stock-id', item.id || '');

            invInput.addEventListener('input', () => {
              const raw = invInput.value;
              const v = raw === '' ? null : Number(raw);
              // Update local state immediately for filter/re-render
              item.inventory = v;
              const currentSchoolId = school?.id || getSchoolIdFromPath();
              scheduleInventorySave(currentSchoolId, item.id, v);

              // Live mismatch highlight vs Done
              const doneNow = Number(item.doneQuantity ?? 0);
              if (v !== null && typeof v !== 'undefined' && Number(v) !== doneNow) {
                tdInv.style.fontWeight = '800';
                tdInv.style.color = '#B91C1C';
              } else {
                tdInv.style.fontWeight = '';
                tdInv.style.color = '';
              }
            });

            // Small UX: highlight mismatch vs Done
            const doneV = Number(item.doneQuantity ?? 0);
            const invV = item.inventory;
            if (invV !== null && typeof invV !== 'undefined' && Number(invV) !== doneV) {
              tdInv.style.fontWeight = '800';
              tdInv.style.color = '#B91C1C';
            }

            tdInv.appendChild(invInput);
            tr.appendChild(tdInv);
          }
          tbody.appendChild(tr);
        });

      table.appendChild(thead);
      table.appendChild(tbody);
      tableWrap.appendChild(table);

      card.appendChild(head);
      card.appendChild(tableWrap);
      frag.appendChild(card);
    });

    groupsEl.appendChild(frag);
    if (window.feather) feather.replace();
  };

  const setInventoryButtonUI = (isOn) => {
    if (!makeInventoryBtn) return;
    const label = makeInventoryBtn.querySelector('span');
    if (label) label.textContent = isOn ? 'Finish inventory' : 'Make inventory';
    const icon = makeInventoryBtn.querySelector('i[data-feather]');
    if (icon) icon.setAttribute('data-feather', isOn ? 'check-square' : 'plus-square');
    if (window.feather) feather.replace();
  };

  const applyFilter = () => {
    const q = norm(searchInput ? searchInput.value : '');
    if (!q) {
      renderGroups(allStock);
      return;
    }

    const filtered = allStock.filter((x) => {
      const name = norm(x.name);
      const tag = norm(x.tag?.name);
      return name.includes(q) || tag.includes(q);
    });
    renderGroups(filtered);
  };

  const fetchSchool = async (id) => {
    if (!detailsEl) return;
    detailsEl.innerHTML = `
      <div class="modern-loading" role="status" aria-live="polite">
        <div class="modern-loading__spinner" aria-hidden="true"></div>
        <div class="modern-loading__text">
          Loading school details
          <span class="modern-loading__dots" aria-hidden="true"><span></span><span></span><span></span></span>
        </div>
      </div>
    `;

    const res = await fetch(`/api/b2b/schools/${encodeURIComponent(id)}`, { credentials: 'include' });
    if (res.status === 401 || res.redirected) {
      window.location.href = '/login';
      return null;
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to load school');
    }
    return await res.json();
  };

  const fetchStock = async (id) => {
    if (!groupsEl) return { meta: {}, items: [] };
    groupsEl.innerHTML = `
      <div class="modern-loading" role="status" aria-live="polite">
        <div class="modern-loading__spinner" aria-hidden="true"></div>
        <div class="modern-loading__text">
          Loading stocktaking
          <span class="modern-loading__dots" aria-hidden="true"><span></span><span></span><span></span></span>
        </div>
      </div>
    `;

    const res = await fetch(`/api/b2b/schools/${encodeURIComponent(id)}/stock`, { credentials: 'include' });
    if (res.status === 401 || res.redirected) {
      window.location.href = '/login';
      return { meta: {}, items: [] };
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to load stock');
    }
    const data = await res.json();
    if (Array.isArray(data)) return { meta: {}, items: data };
    if (data && typeof data === 'object') {
      return { meta: data.meta || {}, items: Array.isArray(data.items) ? data.items : [] };
    }
    return { meta: {}, items: [] };
  };



  // ---------- Export helpers (PDF / Excel) ----------
  const safeFileName = (s) => {
    const cleaned = String(s || '')
      .replace(/[<>:"/\|?*]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return cleaned || 'School';
  };

  const downloadBlobResponse = async (res, fallbackName) => {
    const blob = await res.blob();
    const cd = res.headers.get('content-disposition') || '';
    const m = cd.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
    const filename = decodeURIComponent((m && (m[1] || m[2])) || fallbackName);

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const exportFile = async (btn, endpoint, fallbackName) => {
    if (!btn) return;
    btn.disabled = true;
    btn.classList.add('is-busy');

    try {
      const res = await fetch(endpoint, { method: 'GET', credentials: 'include' });
      if (res.status === 401 || res.redirected) {
        window.location.href = '/login';
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || 'Export failed');
      }
      await downloadBlobResponse(res, fallbackName);
    } catch (e) {
      console.error(e);
      alert(e.message || 'Export failed');
    } finally {
      btn.disabled = false;
      btn.classList.remove('is-busy');
    }
  };
  const init = async () => {
    const id = getSchoolIdFromPath();
    if (!id) {
      if (detailsEl) detailsEl.innerHTML = `<div class="error-block">Missing school ID.</div>`;
      if (groupsEl) groupsEl.innerHTML = `<div class="error-block">Missing school ID.</div>`;
      return;
    }

    try {
      school = await fetchSchool(id);
      if (!school) return;

      if (schoolNameEl) schoolNameEl.textContent = school.name || 'School';
      document.title = `B2B — ${school.name || 'School'}`;

      // Enable & wire exports
      const safeName = safeFileName(school.name || 'School');
      if (downloadPdfBtn) {
        downloadPdfBtn.disabled = false;
        downloadPdfBtn.onclick = (e) => {
          e.preventDefault();
          exportFile(
            downloadPdfBtn,
            `/api/b2b/schools/${encodeURIComponent(id)}/stock/pdf`,
            `Stocktaking-${safeName}.pdf`,
          );
        };
      }
      if (downloadExcelBtn) {
        downloadExcelBtn.disabled = false;
        downloadExcelBtn.onclick = (e) => {
          e.preventDefault();
          exportFile(
            downloadExcelBtn,
            `/api/b2b/schools/${encodeURIComponent(id)}/stock/excel`,
            `Stocktaking-${safeName}.xlsx`,
          );
        };
      }

      renderDetails();

      const stockRes = await fetchStock(id);
      allStock = stockRes.items;
      stockMeta = { ...stockMeta, ...(stockRes.meta || {}) };
      renderGroups(allStock);

      // Make / Finish inventory (protected by Admin password)
      if (makeInventoryBtn) {
        makeInventoryBtn.disabled = false;
        setInventoryButtonUI(false);

        const startInventory = async () => {
          const ok = await AdminAuth.verify('start inventory');
          if (!ok) return;

          try {
            const r = await fetch(`/api/b2b/schools/${encodeURIComponent(id)}/inventory`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({}),
            });
            const j = await r.json().catch(() => ({}));
            if (r.redirected) {
              window.location.href = '/login';
              return;
            }
            if (!r.ok) throw new Error(j.details || j.error || 'Failed to create inventory column.');

            // Refresh stock data to show the new column + values
            const refreshed = await fetchStock(id);
            allStock = refreshed.items;
            stockMeta = { ...stockMeta, ...(refreshed.meta || {}) };

            inventoryMode = true;
            setInventoryButtonUI(true);
            applyFilter();

            if (window.UI && UI.toast) {
              const label = j?.inventoryPropName || stockMeta?.inventoryPropName || 'Inventory';
              UI.toast({ type: 'success', title: 'Inventory', message: `${label} is ready.` });
            }
          } catch (err) {
            console.error(err);
            if (window.UI && UI.toast) {
              UI.toast({ type: 'error', title: 'Inventory', message: err.message || 'Failed to create inventory column.' });
            }
          }
        };

        const finishInventory = async () => {
          const ok = await AdminAuth.verify('finish inventory');
          if (!ok) return;

          try {
            // Give the debounced saves a moment to flush before hiding the column
            await new Promise((r) => setTimeout(r, 650));
          } catch {}

          inventoryMode = false;
          setInventoryButtonUI(false);
          applyFilter();

          if (window.UI && UI.toast) {
            UI.toast({ type: 'success', title: 'Inventory', message: 'Inventory column is hidden.' });
          }
        };

        makeInventoryBtn.onclick = async (e) => {
          e.preventDefault();
          if (inventoryMode) return finishInventory();
          return startInventory();
        };
      }

      if (searchInput) {
        searchInput.addEventListener('input', applyFilter);
        searchInput.addEventListener('keydown', (e) => {
          if (e.key === 'Escape' && searchInput.value) {
            searchInput.value = '';
            applyFilter();
          }
        });
      }
    } catch (e) {
      console.error(e);
      if (detailsEl) detailsEl.innerHTML = `<div class="error-block">Error: ${e.message}</div>`;
      if (groupsEl) groupsEl.innerHTML = `<div class="error-block">Error: ${e.message}</div>`;
    }
  };

  init();
});
