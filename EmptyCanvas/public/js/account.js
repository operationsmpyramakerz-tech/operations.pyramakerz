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

  // ===== Modal (markup lives in account.html) =====
  // We intentionally reuse the same classes/styles as Expenses "Settled my account"
  // so the Account edit window looks identical.

  const modalEl = document.getElementById('accountEditModal');
  const titleEl = document.getElementById('accountEditTitle');
  const valueLabelEl = document.getElementById('accountEditValueLabel');
  const passLabelEl = document.getElementById('accountEditPasswordLabel');
  const valueInput = document.getElementById('accountEditValue');
  const passInput = document.getElementById('accountEditPassword');
  const confirmBtn = document.getElementById('accountEditSubmit');
  const cancelBtn = document.getElementById('accountEditClose');

  let activeField = null;

  function isModalOpen() {
    return !!modalEl && modalEl.style.display === 'flex';
  }

  function openModalForField(fieldKey) {
    const meta = FIELD_META.find((m) => m.key === fieldKey);
    if (!meta || !modalEl) return;

    activeField = meta;

    if (titleEl) titleEl.textContent = `Edit ${meta.label}`;
    if (valueLabelEl) valueLabelEl.innerHTML = `<i data-feather="${escapeHTML(meta.icon)}"></i> ${escapeHTML(meta.label)}`;
    if (passLabelEl) passLabelEl.innerHTML = `<i data-feather="lock"></i> Current password`;

    // Configure input type per field
    if (valueInput) {
      valueInput.type = meta.inputType || 'text';

      if (meta.inputMode) valueInput.setAttribute('inputmode', meta.inputMode);
      else valueInput.removeAttribute('inputmode');

      if (meta.autocomplete) valueInput.setAttribute('autocomplete', meta.autocomplete);
      else valueInput.removeAttribute('autocomplete');

      if (meta.placeholder) valueInput.setAttribute('placeholder', meta.placeholder);
      else valueInput.removeAttribute('placeholder');

      // Prefill current value (except password)
      valueInput.value = (fieldKey === 'password')
        ? ''
        : ((state && state[fieldKey] != null) ? String(state[fieldKey]) : '');
    }

    if (passInput) passInput.value = '';

    modalEl.style.display = 'flex';
    modalEl.setAttribute('aria-hidden', 'false');

    // Focus
    setTimeout(() => {
      valueInput?.focus();
      valueInput?.select?.();
    }, 0);

    if (window.feather) feather.replace();
  }

  function closeModal() {
    if (!modalEl) return;
    modalEl.style.display = 'none';
    modalEl.setAttribute('aria-hidden', 'true');
    activeField = null;
    // Clear sensitive fields
    if (passInput) passInput.value = '';
  }

  // Close when clicking on the backdrop (outside the box)
  modalEl?.addEventListener('click', (e) => {
    if (e.target === modalEl) closeModal();
  });

  cancelBtn?.addEventListener('click', closeModal);

  confirmBtn?.addEventListener('click', async () => {
    if (!activeField) return;
    await saveActiveField();
  });

  // Enter to confirm, Esc to cancel
  document.addEventListener('keydown', (e) => {
    if (!isModalOpen()) return;
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

  async function saveActiveField() {
    if (!activeField || !modalEl) return;

    const field = activeField.key;
    const meta = activeField;

    const newValRaw = String(valueInput?.value ?? '');
    const newVal = normalizeValueForApi(field, newValRaw);

    const currentPassword = String(passInput?.value || '').trim();

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
    if (confirmBtn) confirmBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;

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
      if (confirmBtn) confirmBtn.disabled = false;
      if (cancelBtn) cancelBtn.disabled = false;
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
