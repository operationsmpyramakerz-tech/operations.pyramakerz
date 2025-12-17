// /public/js/damaged-assets.js
// Damaged Assets — Funds-like form with searchable Products select and working submit

let itemCounter = 0;
let PRODUCT_OPTIONS = []; // [{id, name}]

// ---------------------- Options loader (Notion) ----------------------
async function loadProductOptions() {
  try {
    const r = await fetch('/api/damaged-assets/options', { credentials: 'same-origin' });
    if (!r.ok) throw new Error('Failed to load products');
    const j = await r.json();
    PRODUCT_OPTIONS = Array.isArray(j.options) ? j.options : [];
  } catch (e) {
    console.error('options error:', e);
    PRODUCT_OPTIONS = [];
  }
}

// ---------------------- Basic UI helpers ----------------------
function showToast(message, type = 'info') {
  if (typeof UI !== 'undefined' && UI.toast) UI.toast({ type, message });
  else alert(message);
}

async function handleLogout() {
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    location.href = '/login';
  } catch {
    location.href = '/login';
  }
}

// ---------------------- Feather safe replace (to avoid breaking UI) ----------------------
function safeFeatherReplace() {
  try {
    if (window.feather && typeof feather.replace === 'function') feather.replace();
  } catch (e) {
    console.warn('feather.replace failed:', e);
  }
}

// ---------------------- Success Overlay (center message) ----------------------
function showSuccessOverlay(message = 'The report has been successfully recorded') {
  const old = document.getElementById('reportSuccessOverlay');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.id = 'reportSuccessOverlay';
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    background: 'rgba(17,24,39,.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: '1000',
    padding: '20px'
  });

  const card = document.createElement('div');
  Object.assign(card.style, {
    width: '100%',
    maxWidth: '520px',
    background: '#fff',
    borderRadius: '16px',
    boxShadow: '0 20px 50px rgba(0,0,0,.15)',
    textAlign: 'center',
    padding: '28px 24px',
    direction: 'rtl'
  });

  const iconWrap = document.createElement('div');
  Object.assign(iconWrap.style, {
    width: '64px',
    height: '64px',
    margin: '0 auto 12px',
    background: '#ECFDF5',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  });
  iconWrap.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20 6L9 17l-5-5"></path>
    </svg>
  `;

  const title = document.createElement('h3');
  title.textContent = message;
  Object.assign(title.style, { margin: '6px 0 8px', fontSize: '20px', color: '#111827' });

  const sub = document.createElement('p');
  sub.textContent = 'Thank you';
  Object.assign(sub.style, { margin: '0 0 18px', color: '#6b7280', fontSize: '14px' });

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'حسناً';
  btn.className = 'btn btn-primary';
  Object.assign(btn.style, {
    padding: '10px 16px',
    borderRadius: '10px',
    border: '0',
    cursor: 'pointer'
  });

  btn.addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  const escClose = (ev) => { if (ev.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', escClose); } };
  document.addEventListener('keydown', escClose);

  card.appendChild(iconWrap);
  card.appendChild(title);
  card.appendChild(sub);
  card.appendChild(btn);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  setTimeout(() => { if (document.body.contains(overlay)) overlay.remove(); }, 4000);
}

// ---------------------- Searchable select ----------------------
// يحوّل <select> عادية إلى كومبوبوكس بمحرّك بحث داخلي (من غير ما نحذف الـ<select> الأصلية)
function makeSearchableSelect(selectEl, options) {
  if (!selectEl) return;

  const wrapper = document.createElement('div');
  wrapper.style.position = 'relative';
  wrapper.className = 'searchable-select';
  selectEl.parentNode.insertBefore(wrapper, selectEl);
  wrapper.appendChild(selectEl);

  selectEl.style.position = 'absolute';
  selectEl.style.opacity = '0';
  selectEl.style.pointerEvents = 'none';
  selectEl.style.width = '100%';
  selectEl.style.height = '40px';

  const input = document.createElement('input');
  input.type = 'search';
  input.className = 'form-input';
  input.placeholder = 'Select product...';
  input.autocomplete = 'off';
  input.style.paddingRight = '34px';
  wrapper.insertBefore(input, selectEl);

  const dropdown = document.createElement('div');
  dropdown.className = 'dropdown-panel';
  Object.assign(dropdown.style, {
    position: 'absolute',
    left: '0', right: '0', top: '100%',
    zIndex: '50', maxHeight: '260px', overflow: 'auto',
    background: '#fff', border: '1px solid #e5e7eb',
    borderRadius: '10px', boxShadow: '0 8px 20px rgba(0,0,0,.06)',
    marginTop: '6px', display: 'none'
  });
  wrapper.appendChild(dropdown);

  function render(list, query = '') {
    dropdown.innerHTML = '';
    const q = query.trim().toLowerCase();
    const filtered = !q ? list : list.filter(o => (o.name || '').toLowerCase().includes(q));

    if (!filtered.length) {
      const empty = document.createElement('div');
      empty.style.padding = '10px 12px';
      empty.style.color = '#6b7280';
      empty.textContent = 'No results';
      dropdown.appendChild(empty);
    } else {
      for (const o of filtered) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'dropdown-item';
        Object.assign(row.style, {
          display: 'block', width: '100%', textAlign: 'left',
          padding: '10px 12px', border: '0', background: 'transparent', cursor: 'pointer'
        });
        row.onmouseenter = () => (row.style.background = '#f9fafb');
        row.onmouseleave = () => (row.style.background = 'transparent');
        row.textContent = o.name || o.id;
        row.dataset.value = o.id || o.name || '';
        row.addEventListener('click', () => commit(o));
        dropdown.appendChild(row);
      }
    }
  }

  function commit(opt) {
    const v = String(opt.id || opt.name || '');
    let found = false;
    for (const op of selectEl.options) {
      if (op.value === v) {
        selectEl.value = v;
        found = true;
        break;
      }
    }
    if (!found) {
      const op = document.createElement('option');
      op.value = v;
      op.textContent = opt.name || opt.id || 'Unnamed';
      selectEl.appendChild(op);
      selectEl.value = v;
    }
    input.value = opt.name || opt.id || '';
    dropdown.style.display = 'none';
    input.blur();
  }

  input.addEventListener('focus', () => { render(PRODUCT_OPTIONS); dropdown.style.display = 'block'; });
  input.addEventListener('input', () => render(PRODUCT_OPTIONS, input.value));

  document.addEventListener('click', (e) => {
    if (!wrapper.contains(e.target)) dropdown.style.display = 'none';
  });

  const selected = selectEl.selectedOptions?.[0];
  if (selected) input.value = selected.textContent || '';
}

// ---------------------- Entry builder ----------------------
function buildEntryDom(id) {
  const wrap = document.createElement('div');
  wrap.className = 'expense-entry';
  wrap.dataset.itemId = id;

  wrap.innerHTML = `
    <div class="expense-header">
      <h4><i data-feather="package"></i> Component ${id}</h4>
      <button type="button" class="expense-status remove-expense" title="Delete component" data-item-id="${id}"></button>
    </div>

    <div class="form-row">
      <div class="form-group">
        <label class="form-label" for="product${id}"><i data-feather="box"></i> Products *</label>
        <select id="product${id}" name="items[${id}][productId]" class="form-input" required>
          <option value="">Select product...</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label" for="title${id}"><i data-feather="type"></i> Description of issue (Title) *</label>
        <input id="title${id}" name="items[${id}][title]" class="form-input" type="text" placeholder="Short issue summary..." required/>
      </div>
    </div>

    <div class="form-group">
      <label class="form-label" for="reason${id}"><i data-feather="message-square"></i> Issue Reason</label>
      <textarea id="reason${id}" name="items[${id}][reason]" class="form-input" placeholder="Extra details, when/how it happened, etc."></textarea>
    </div>

    <div class="form-group">
      <label class="form-label" for="files${id}"><i data-feather="image"></i> Files &amp; media</label>
      <input id="files${id}" name="items[${id}][files]" class="form-input" type="file" multiple accept="image/*,.pdf,.heic,.jpg,.jpeg,.png"/>
      <small class="form-help">Upload photos/screenshots (optional)</small>
    </div>
  `;

  return wrap;
}

function populateSelect(selectEl) {
  selectEl.innerHTML = '<option value="">Select product...</option>';
  for (const o of PRODUCT_OPTIONS) {
    const op = document.createElement('option');
    op.value = String(o.id || o.name || '');
    op.textContent = o.name || o.id || 'Unnamed';
    selectEl.appendChild(op);
  }
  makeSearchableSelect(selectEl, PRODUCT_OPTIONS);
}

function addItemEntry() {
  itemCounter++;
  const list = document.getElementById('itemsList');
  const node = buildEntryDom(itemCounter);
  list.appendChild(node);
  safeFeatherReplace(); // بدل feather.replace()

  const sel = document.getElementById(`product${itemCounter}`);
  populateSelect(sel);

  node.querySelector('.remove-expense').addEventListener('click', () => {
    const total = document.querySelectorAll('.expense-entry').length;
    if (total <= 1) return showToast('At least one component is required', 'error');
    node.remove();
  });

  sel.focus();
}

// ---------------------- Helpers: File -> DataURL ----------------------
const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20MB
function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// ---------------------- Validation + Payload ----------------------
function validateForm() {
  const entries = document.querySelectorAll('.expense-entry');
  for (const e of entries) {
    const p = e.querySelector('[name*="[productId]"]');
    const t = e.querySelector('[name*="[title]"]');
    if (p?.value && t?.value?.trim()) return true;
  }
  showToast('Please add at least one complete component', 'error');
  return false;
}

async function collectPayload() {
  const items = [];
  const localUploads = [];
  const entries = document.querySelectorAll('.expense-entry');
  for (const e of entries) {
    const id = e.dataset.itemId;
    const sel = document.getElementById(`product${id}`);
    const title = document.getElementById(`title${id}`);
    const reason = document.getElementById(`reason${id}`);
    const filesEl = document.getElementById(`files${id}`);

    if (!(sel?.value && title?.value?.trim())) continue;

    const productId = sel.value;
    const productName = sel.selectedOptions?.[0]?.text || '';

    const item = {
      product: { id: productId, name: productName },
      title: title.value.trim(),
      reason: (reason?.value || '').trim(),
      files: []
    };

    let localFiles = [];
    if (filesEl?.files?.length) {
      for (const f of filesEl.files) {
        item.files.push({ name: f.name, type: f.type, size: f.size });
        localFiles.push(f);
      }
    }

    items.push(item);
    localUploads.push({ files: localFiles, input: filesEl });
  }
  return { items, localUploads };
}

// ---------------------- Submit ----------------------
async function handleFormSubmit(ev) {
  ev.preventDefault();
  const btn = document.getElementById('submitBtn');

  try {
    if (!validateForm()) return;

    btn.disabled = true;
    btn.innerHTML = '<i data-feather="loader"></i> Submitting...';
    safeFeatherReplace();

    const { items, localUploads } = await collectPayload();
    if (!items.length) {
      showToast('Please add at least one complete component', 'error');
      return;
    }

    const r = await fetch('/api/damaged-assets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ items })
    });

    const ct = r.headers.get('content-type') || '';
    const j = ct.includes('application/json') ? await r.json() : { ok: false, error: 'Non-JSON response' };

    if (!r.ok || !(j?.ok || j?.success)) throw new Error(j?.error || 'Failed to submit');

    const createdIds = j.created || j.ids || [];
    if (Array.isArray(createdIds) && createdIds.length === items.length) {
      let totalToUpload = 0;
      localUploads.forEach(u => { totalToUpload += (u?.files?.length || 0); });

      let done = 0;
      for (let i = 0; i < createdIds.length; i++) {
        const pageId = createdIds[i];
        const u = localUploads[i];
        if (!u || !u.files || !u.files.length) continue;

        for (const f of u.files) {
          if (f.size > MAX_FILE_BYTES) {
            showToast(`${f.name} is larger than 20MB — skipped`, 'warning');
            continue;
          }
          done += 1;
          btn.innerHTML = `<i data-feather="loader"></i> Uploading files… (${done}/${totalToUpload})`;
          safeFeatherReplace();

          const dataUrl = await fileToDataURL(f);
          const up = await fetch('/api/notion/upload-file', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({
              pageId,
              dataUrl,
              filename: f.name,
              propName: 'Files & media'
            })
          });

          const ujCt = up.headers.get('content-type') || '';
          const uj = ujCt.includes('application/json') ? await up.json() : {};
          if (!up.ok || !uj?.ok) {
            console.error('upload-file error:', uj);
            throw new Error(uj?.error || `Failed to upload ${f.name}`);
          }
        }
      }
    } else {
      console.warn('Mismatch between created pages and items; skipping file uploads.');
    }

    showToast('Damage report submitted successfully!', 'success');
    showSuccessOverlay('The report has been successfully recorded');

    document.getElementById('damagedForm').reset();
    document.getElementById('itemsList').innerHTML = '';
    itemCounter = 0;
    addItemEntry();
  } catch (e) {
    console.error(e);
    showToast(e.message || 'Failed to submit', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i data-feather="save"></i> Submit Report';
    safeFeatherReplace();
  }
}

// ---------------------- Init ----------------------
document.addEventListener('DOMContentLoaded', async () => {
  await loadProductOptions();

  const addBtn   = document.getElementById('addItemBtn');
  const form     = document.getElementById('damagedForm');
  const logoutBtn= document.getElementById('logoutBtn');

  if (addBtn) addBtn.addEventListener('click', addItemEntry);
  if (form) form.addEventListener('submit', handleFormSubmit);
  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

  addItemEntry(); // أول عنصر
});
