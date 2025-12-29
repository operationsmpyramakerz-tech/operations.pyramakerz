// public/js/account.js
document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('account-content');
  if (!container) return;

  // Local state (single source of truth for displayed values)
  let state = null;

  const FIELD_META = [
    { key: 'name',         label: 'Name',          icon: 'user',       type: 'text',    editable: true },
    { key: 'department',   label: 'Department',    icon: 'briefcase',  type: 'text',    editable: true },
    { key: 'position',     label: 'Position',      icon: 'award',      type: 'text',    editable: true },
    { key: 'phone',        label: 'Phone',         icon: 'phone',      type: 'text',    editable: true },
    { key: 'email',        label: 'Email',         icon: 'mail',       type: 'text',    editable: true },
    { key: 'employeeCode', label: 'Employee Code', icon: 'hash',       type: 'number',  editable: true },
    // Password is stored as a Notion Number in this project, but we don't display it.
    { key: 'password',     label: 'Password',      icon: 'lock',       type: 'password', editable: true, placeholder: 'New password' },
  ];

  function toast(type, title, message) {
    if (window.UI && typeof window.UI.toast === 'function') {
      window.UI.toast({ type, title, message });
    } else {
      alert(`${title}\n${message}`);
    }
  }

  function displayValue(key) {
    if (!state) return '—';

    if (key === 'password') {
      return state.passwordSet ? '••••••••' : '—';
    }

    const v = state[key];
    if (v === null || v === undefined) return '—';
    const s = String(v).trim();
    return s ? s : '—';
  }

  function inputAttrs(meta) {
    if (meta.key === 'password') {
      // keep it numeric-friendly, but masked
      return `type="password" inputmode="numeric" autocomplete="new-password" placeholder="${escapeHTML(meta.placeholder || 'New password')}"`;
    }
    if (meta.type === 'number') {
      return 'type="number" inputmode="numeric"';
    }
    return 'type="text"';
  }

  function accRow(meta) {
    return `
      <div class="acc-row" data-field="${escapeHTML(meta.key)}">
        <div class="acc-left">
          <span class="acc-ico"><i data-feather="${escapeHTML(meta.icon)}"></i></span>
          <span class="acc-label">${escapeHTML(meta.label)}</span>
        </div>

        <div class="acc-right">
          <span class="acc-value">${escapeHTML(displayValue(meta.key))}</span>

          <input class="acc-input" ${inputAttrs(meta)} />

          <button class="acc-action acc-edit" type="button" aria-label="Edit ${escapeHTML(meta.label)}" title="Edit">
            <i data-feather="edit-2"></i>
          </button>

          <button class="acc-action acc-save" type="button" aria-label="Save ${escapeHTML(meta.label)}" title="Save">
            <i data-feather="check"></i>
          </button>

          <button class="acc-action acc-cancel" type="button" aria-label="Cancel" title="Cancel">
            <i data-feather="x"></i>
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
        <p class="account-hint">
          <i data-feather="info"></i>
          To save any change, you must enter your current password.
        </p>
      </div>
    `;

    if (window.feather) feather.replace();
  }

  function setRowEditing(row, editing) {
    row.classList.toggle('is-editing', !!editing);

    const field = row.dataset.field;
    const meta = FIELD_META.find(m => m.key === field);
    const input = row.querySelector('.acc-input');

    if (!meta || !input) return;

    if (editing) {
      // Prefill input (except password)
      if (field === 'password') {
        input.value = '';
      } else {
        input.value = (state && state[field] != null) ? String(state[field]) : '';
      }
      input.focus();
      input.select?.();
    } else {
      // Clear password input when leaving edit mode
      if (field === 'password') input.value = '';
    }
  }

  function normalizeValueForApi(field, raw) {
    const v = String(raw ?? '').trim();

    // Name must not be empty if user edits it
    if (field === 'name') return v;

    // Empty => null (clears the field)
    if (v === '') return null;

    // Numeric fields (employeeCode, password)
    if (field === 'employeeCode' || field === 'password') {
      // keep as string; server will validate/convert
      return v;
    }

    return v;
  }

  async function askCurrentPassword() {
    const pw = window.prompt('Enter your current password to confirm saving:');
    if (pw === null) return null; // cancelled
    return String(pw).trim();
  }

  async function saveField(row) {
    const field = row.dataset.field;
    const meta = FIELD_META.find(m => m.key === field);
    if (!meta) return;

    const input = row.querySelector('.acc-input');
    const newValRaw = input ? input.value : '';
    const newVal = normalizeValueForApi(field, newValRaw);

    // Client-side minimal validation
    if (field === 'name' && (!newVal || String(newVal).trim() === '')) {
      toast('warning', 'Name required', 'Name cannot be empty.');
      return;
    }
    if (field === 'password' && (!newVal || String(newVal).trim() === '')) {
      toast('warning', 'Password required', 'Please enter a new password.');
      return;
    }

    const currentPassword = await askCurrentPassword();
    if (currentPassword === null) return; // cancelled
    if (!currentPassword) {
      toast('warning', 'Password required', 'Current password is required to save changes.');
      return;
    }

    const payload = { currentPassword };
    payload[field] = newVal;

    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);

      // Update local state + UI
      if (field === 'password') {
        state.passwordSet = true;
      } else {
        state[field] = newVal;
      }

      // Keep greeting in sync if name changed
      if (field === 'name') {
        try { localStorage.setItem('username', String(newVal).trim()); } catch {}
        try { window.dispatchEvent(new Event('user:updated')); } catch {}
      }

      // Update row display
      row.querySelector('.acc-value').textContent = displayValue(field);
      setRowEditing(row, false);

      toast('success', 'Saved', `${meta.label} updated successfully.`);
    } catch (e) {
      toast('error', 'Save failed', e.message || 'Failed to update account.');
    } finally {
      if (window.feather) feather.replace();
    }
  }

  // Load account data
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

  // Event delegation for edit/save/cancel
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    const row = btn.closest('.acc-row');
    if (!row) return;

    if (btn.classList.contains('acc-edit')) {
      setRowEditing(row, true);
    } else if (btn.classList.contains('acc-cancel')) {
      setRowEditing(row, false);
      // restore display is already correct from state
      row.querySelector('.acc-value').textContent = displayValue(row.dataset.field);
    } else if (btn.classList.contains('acc-save')) {
      saveField(row);
    }
  });

  // Allow Enter to save, Esc to cancel
  container.addEventListener('keydown', (e) => {
    const input = e.target.closest('.acc-input');
    if (!input) return;

    const row = input.closest('.acc-row');
    if (!row) return;

    if (e.key === 'Enter') {
      e.preventDefault();
      saveField(row);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setRowEditing(row, false);
    }
  });

  // Init
  await load();
});

// Simple HTML escape
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
