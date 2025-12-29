// public/js/account.js
document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('account-content');
  if (!container) return;

  // Local state (single source of truth for displayed values)
  let state = null;

  const FIELD_META = [
    { key: 'name',         label: 'Name',          icon: 'user',       inputType: 'text',     required: true },
    { key: 'department',   label: 'Department',    icon: 'briefcase',  inputType: 'text',     required: false },
    { key: 'position',     label: 'Position',      icon: 'award',      inputType: 'text',     required: false },
    { key: 'phone',        label: 'Phone',         icon: 'phone',      inputType: 'text',     required: false, placeholder: 'e.g. 0123456789' },
    { key: 'email',        label: 'Email',         icon: 'mail',       inputType: 'email',    required: false, placeholder: 'e.g. name@company.com' },
    { key: 'employeeCode', label: 'Employee Code', icon: 'hash',       inputType: 'number',   required: false },
    // Password is stored as a Notion Number in this project, but we don't display it.
    { key: 'password',     label: 'Password',      icon: 'lock',       inputType: 'password', required: true,  placeholder: 'New password', inputMode: 'numeric', autocomplete: 'new-password' },
  ];

  // ===== Helpers =====
  function toast(type, title, message) {
    if (window.UI && typeof window.UI.toast === 'function') {
      window.UI.toast({ type, title, message });
    } else {
      alert(`${title}\n${message}`);
    }
  }

  function displayValue(key) {
    if (!state) return '—';
    if (key === 'password') return state.passwordSet ? '••••••••' : '—';

    const v = state[key];
    if (v === null || v === undefined) return '—';
    const s = String(v).trim();
    return s ? s : '—';
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function normalizeValueForApi(field, raw) {
    const v = String(raw ?? '').trim();

    // Name must not be empty
    if (field === 'name') return v;

    // Password must not be empty
    if (field === 'password') return v;

    // Empty => null (clears the field)
    if (v === '') return null;

    // Numeric fields - keep as string; server validates/converts
    if (field === 'employeeCode') return v;

    return v;
  }

  // ===== Render =====
  function accRow(meta) {
    return `
      <div class="acc-row" data-field="${escapeHTML(meta.key)}">
        <div class="acc-left">
          <span class="acc-ico"><i data-feather="${escapeHTML(meta.icon)}"></i></span>
          <span class="acc-label">${escapeHTML(meta.label)}</span>
        </div>

        <div class="acc-right">
          <span class="acc-value">${escapeHTML(displayValue(meta.key))}</span>
          <button class="acc-action acc-edit" type="button" aria-label="Edit ${escapeHTML(meta.label)}" title="Edit">
            <i data-feather="edit-2"></i>
          </button>
        </div>
      </div>
    `;
  }

  function render() {
    container.innerHTML = `
      <div class="account-panel">
        <div class="account-grid">
          ${FIELD_META.map(accRow).join('')}
        </div>
      </div>
    `;

    if (window.feather) feather.replace();
  }

  // ===== Modal =====
  let modal = null;
  let activeField = null;

  function ensureModal() {
    if (modal) return modal;

    const backdrop = document.createElement('div');
    backdrop.className = 'acc-edit-backdrop';
    backdrop.id = 'acc-edit-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');

    backdrop.innerHTML = `
      <div class="acc-edit-modal" role="dialog" aria-modal="true" aria-labelledby="acc-edit-title">
        <h3 class="acc-edit-title" id="acc-edit-title">Edit</h3>

        <div class="acc-edit-field">
          <label id="acc-edit-value-label" for="acc-edit-value"><i data-feather="edit-3"></i> Value</label>
          <input id="acc-edit-value" type="text" />
        </div>

        <div class="acc-edit-field">
          <label id="acc-edit-password-label" for="acc-edit-password"><i data-feather="lock"></i> Current password</label>
          <input id="acc-edit-password" type="password" inputmode="numeric" autocomplete="current-password" />
        </div>

        <div class="acc-edit-actions">
          <button class="acc-edit-btn confirm" id="acc-edit-confirm" type="button">Submit</button>
          <button class="acc-edit-btn cancel" id="acc-edit-cancel" type="button">Close</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const titleEl = backdrop.querySelector('#acc-edit-title');
    const valueLabelEl = backdrop.querySelector('#acc-edit-value-label');
    const passLabelEl = backdrop.querySelector('#acc-edit-password-label');
    const valueInput = backdrop.querySelector('#acc-edit-value');
    const passInput = backdrop.querySelector('#acc-edit-password');
    const confirmBtn = backdrop.querySelector('#acc-edit-confirm');
    const cancelBtn = backdrop.querySelector('#acc-edit-cancel');

    // Close when clicking on the backdrop (outside the modal)
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) closeModal();
    });

    cancelBtn.addEventListener('click', closeModal);

    confirmBtn.addEventListener('click', async () => {
      if (!activeField) return;
      await saveActiveField();
    });

    // Enter to confirm, Esc to cancel
    backdrop.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeModal();
        return;
      }
      if (e.key === 'Enter') {
        // Avoid submitting while focused on a button
        if (document.activeElement && document.activeElement.tagName === 'BUTTON') return;
        e.preventDefault();
        saveActiveField();
      }
    });

    modal = { backdrop, titleEl, valueLabelEl, passLabelEl, valueInput, passInput, confirmBtn, cancelBtn };
    return modal;
  }

  function openModalForField(fieldKey) {
    const meta = FIELD_META.find((m) => m.key === fieldKey);
    if (!meta) return;

    const m = ensureModal();
    activeField = meta;

    m.titleEl.textContent = `Edit ${meta.label}`;

    // Make the mini-window match the "Settled my account" style (label + icon)
    if (m.valueLabelEl) {
      m.valueLabelEl.innerHTML = `<i data-feather="${escapeHTML(meta.icon)}"></i> ${escapeHTML(meta.label)}`;
    }
    if (m.passLabelEl) {
      m.passLabelEl.innerHTML = `<i data-feather="lock"></i> Current password`;
    }

    // Configure input types per field
    m.valueInput.type = meta.inputType || 'text';
    if (meta.inputMode) m.valueInput.setAttribute('inputmode', meta.inputMode);
    else m.valueInput.removeAttribute('inputmode');

    // Autocomplete hints (optional)
    if (meta.autocomplete) m.valueInput.setAttribute('autocomplete', meta.autocomplete);
    else m.valueInput.removeAttribute('autocomplete');

    if (meta.placeholder) m.valueInput.setAttribute('placeholder', meta.placeholder);
    else m.valueInput.removeAttribute('placeholder');

    // Prefill current value (except password)
    if (fieldKey === 'password') {
      m.valueInput.value = '';
    } else {
      m.valueInput.value = (state && state[fieldKey] != null) ? String(state[fieldKey]) : '';
    }

    m.passInput.value = '';
    m.backdrop.classList.add('is-open');
    m.backdrop.setAttribute('aria-hidden', 'false');

    // Focus
    setTimeout(() => {
      m.valueInput.focus();
      m.valueInput.select?.();
    }, 0);

    if (window.feather) feather.replace();
  }

  function closeModal() {
    if (!modal) return;
    modal.backdrop.classList.remove('is-open');
    modal.backdrop.setAttribute('aria-hidden', 'true');
    activeField = null;
    // Clear sensitive fields
    modal.passInput.value = '';
  }

  async function saveActiveField() {
    if (!activeField || !modal) return;

    const field = activeField.key;
    const meta = activeField;

    const newValRaw = modal.valueInput.value;
    const newVal = normalizeValueForApi(field, newValRaw);

    const currentPassword = String(modal.passInput.value || '').trim();

    // Client-side validation
    if (meta.required && (!newVal || String(newVal).trim() === '')) {
      toast('warning', 'Required', `${meta.label} cannot be empty.`);
      return;
    }
    if (!currentPassword) {
      toast('warning', 'Password required', 'Current password is required to save changes.');
      return;
    }

    // Build payload
    const payload = { currentPassword };
    payload[field] = newVal;

    // UI lock
    modal.confirmBtn.disabled = true;
    modal.cancelBtn.disabled = true;

    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);

      // Update local state
      if (field === 'password') {
        state.passwordSet = true;
      } else {
        state[field] = newVal;
      }

      // Update UI row
      const row = container.querySelector(`.acc-row[data-field="${field}"]`);
      if (row) {
        const valEl = row.querySelector('.acc-value');
        if (valEl) valEl.textContent = displayValue(field);
      }

      // Keep greeting / sidebar profile in sync
      if (field === 'name') {
        try { localStorage.setItem('username', String(newVal || '').trim()); } catch {}
      }
      // Refresh common UI (greeting + sidebar profile + permissions) from the server
      try { window.dispatchEvent(new Event('user:updated')); } catch {}

      closeModal();
      toast('success', 'Saved', `${meta.label} updated successfully.`);
    } catch (e) {
      toast('error', 'Save failed', e.message || 'Failed to update account.');
    } finally {
      modal.confirmBtn.disabled = false;
      modal.cancelBtn.disabled = false;
      if (window.feather) feather.replace();
    }
  }

  // ===== Load account data =====
  async function load() {
    container.innerHTML = `<p><i class="loading-icon" data-feather="loader"></i> Loading account...</p>`;
    if (window.feather) feather.replace();

    try {
      const res = await fetch('/api/account', { credentials: 'same-origin', cache: 'no-store' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed (${res.status})`);
      }

      const data = await res.json();

      state = {
        name: data.name || '',
        department: data.department || '',
        position: data.position || '',
        phone: data.phone || '',
        email: data.email || '',
        employeeCode: (typeof data.employeeCode === 'number' || typeof data.employeeCode === 'string')
          ? String(data.employeeCode ?? '').trim()
          : '',
        passwordSet: !!data.passwordSet,
      };

      render();
    } catch (e) {
      container.innerHTML = `
        <div class="card" style="border:1px solid #FCA5A5; background:#FEE2E2; color:#B91C1C; padding:1rem; border-radius:8px;">
          <strong>Error:</strong> ${escapeHTML(e.message)}
        </div>
      `;
    } finally {
      if (window.feather) feather.replace();
    }
  }

  // Event delegation for edit button
  container.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.acc-edit');
    if (!editBtn) return;

    const row = editBtn.closest('.acc-row');
    if (!row) return;

    const field = row.dataset.field;
    openModalForField(field);
  });

  // Init
  await load();
});
