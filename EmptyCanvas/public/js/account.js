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
    // Password can be text (Notion: Rich text) - we don't display its real value.
    { key: 'password',     label: 'Password',      icon: 'lock',       inputType: 'password', required: true,  placeholder: 'New password', autocomplete: 'new-password' },
  ];

  const PROFILE_PICTURE_META = {
    key: 'profilePicture',
    label: 'Profile picture',
    icon: 'image',
    inputType: 'text',
    required: false,
    isFileUpload: true,
    placeholder: 'Selected image',
  };

  let pendingProfilePicture = null;

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

  function initialsFromName(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'U';
    const first = parts[0]?.[0] || '';
    const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] || '') : '';
    return (String(first) + String(last)).toUpperCase() || 'U';
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
  function profileFieldCard(meta) {
    const isPassword = meta.key === 'password';
    return `
      <section class="profile-field-card" data-field="${escapeHTML(meta.key)}">
        <div class="profile-field-label">${escapeHTML(meta.label)}</div>
        <div class="profile-field-box ${isPassword ? 'profile-field-box--password' : ''}">
          <span class="profile-field-value">${escapeHTML(displayValue(meta.key))}</span>
          <button class="profile-field-edit acc-edit" type="button" aria-label="Edit ${escapeHTML(meta.label)}" title="Edit ${escapeHTML(meta.label)}">
            <i data-feather="edit-2"></i>
          </button>
        </div>
      </section>
    `;
  }

  function profileAvatarSection() {
    const photoUrl = String(state?.photoUrl || '').trim();
    const displayName = String(state?.name || 'User').trim() || 'User';
    const preview = photoUrl
      ? `<img class="profile-avatar-image" src="${escapeHTML(photoUrl)}" width="156" height="156" decoding="async" alt="${escapeHTML(displayName)} profile picture" />`
      : `<span class="profile-avatar-fallback" aria-hidden="true">${escapeHTML(initialsFromName(displayName))}</span>`;

    return `
      <div class="profile-avatar-section" data-field="profilePicture">
        <div class="profile-avatar-shell">
          <button class="profile-avatar-display" type="button" aria-label="Change profile picture" title="Change profile picture">
            ${preview}
          </button>
          <button class="profile-avatar-edit" type="button" aria-label="Edit profile picture" title="Edit profile picture">
            <i data-feather="camera"></i>
          </button>
          <input class="acc-file-input" type="file" accept="image/*" hidden />
        </div>
      </div>
    `;
  }

  function render() {
    container.innerHTML = `
      <div class="account-panel account-panel--profile account-profile-modern">
        ${profileAvatarSection()}
        <div class="profile-fields-list">
          ${FIELD_META.map(profileFieldCard).join('')}
        </div>
      </div>
    `;

    if (window.feather) feather.replace();
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('Failed to read image file.'));
      reader.readAsDataURL(file);
    });
  }

  function validateProfilePictureFile(file, inputEl) {
    const selected = file || null;
    if (!selected) return false;

    const mime = String(selected.type || '').toLowerCase();
    const isImage = mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(String(selected.name || ''));

    if (!isImage) {
      toast('warning', 'Invalid file', 'Only image files are allowed for Profile picture.');
      if (inputEl) inputEl.value = '';
      return false;
    }

    if (selected.size > 10 * 1024 * 1024) {
      toast('warning', 'Image too large', 'Please choose an image up to 10MB.');
      if (inputEl) inputEl.value = '';
      return false;
    }

    return true;
  }

  async function handleProfilePictureUpload(file, inputEl, buttonEl, currentPassword) {
    const selected = file || null;
    if (!selected) return false;

    if (buttonEl) {
      buttonEl.disabled = true;
      buttonEl.classList.add('is-uploading');
      buttonEl.setAttribute('aria-busy', 'true');
      buttonEl.setAttribute('title', 'Uploading...');
    }

    try {
      const dataUrl = await fileToDataUrl(selected);
      const res = await fetch('/api/account/profile-picture', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          filename: selected.name || 'profile-picture.png',
          dataUrl,
          currentPassword: String(currentPassword || '').trim(),
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || `Request failed (${res.status})`);
      }

      state.photoUrl = String(json.photoUrl || '').trim();
      render();
      try { window.dispatchEvent(new Event('user:updated')); } catch {}
      toast('success', 'Saved', 'Profile picture updated successfully.');
      return true;
    } catch (e) {
      toast('error', 'Upload failed', e.message || 'Failed to update profile picture.');
      return false;
    } finally {
      if (inputEl) inputEl.value = '';
      if (buttonEl) {
        buttonEl.disabled = false;
        buttonEl.classList.remove('is-uploading');
        buttonEl.removeAttribute('aria-busy');
        buttonEl.setAttribute('title', 'Edit profile picture');
      }
      pendingProfilePicture = null;
      if (window.feather) feather.replace();
    }
  }

  // ===== Modal (markup lives in account.html) =====
  // We intentionally reuse the same classes/styles as Expenses "Settled my account"
  // so the Account edit window looks identical.

  const modalEl = document.getElementById('accountEditModal');
  const titleEl = document.getElementById('accountEditTitle');
  const valueLabelEl = document.getElementById('accountEditValueLabel');
  const passLabelEl = document.getElementById('accountEditPasswordLabel');

  const valueWrapEl = document.getElementById('accountEditValueWrap');
  const passWrapEl = document.getElementById('accountEditPasswordWrap');
  const valueInput = document.getElementById('accountEditValue');
  const passInput = document.getElementById('accountEditPassword');

  const toggleValueBtn = document.getElementById('toggleAccountEditValue');
  const togglePassBtn = document.getElementById('toggleAccountEditPassword');
  const confirmBtn = document.getElementById('accountEditSubmit');
  const cancelBtn = document.getElementById('accountEditClose');

  const errorEl = document.getElementById('accountEditError');
  const savingOverlayEl = document.getElementById('accountSavingOverlay');

  function setModalError(message) {
    if (!errorEl) return;
    if (!message) {
      errorEl.style.display = 'none';
      errorEl.textContent = '';
      return;
    }
    errorEl.textContent = String(message);
    errorEl.style.display = 'block';
  }

  function showSavingOverlay() {
    if (!savingOverlayEl) return;
    savingOverlayEl.style.display = 'flex';
    savingOverlayEl.setAttribute('aria-hidden', 'false');
    if (window.feather) feather.replace();
  }

  function hideSavingOverlay() {
    if (!savingOverlayEl) return;
    savingOverlayEl.style.display = 'none';
    savingOverlayEl.setAttribute('aria-hidden', 'true');
  }


  let activeField = null;

  function isModalOpen() {
    return !!modalEl && modalEl.style.display === 'flex';
  }

  // ===== Password toggles (same behavior as Login page) =====
  function syncToggleVisual(btn, inputEl) {
    if (!btn || !inputEl) return;
    const isText = String(inputEl.getAttribute('type') || '').toLowerCase() === 'text';
    btn.setAttribute('aria-pressed', String(isText));
    const eye = btn.querySelector('.icon-eye');
    const eyeOff = btn.querySelector('.icon-eye-off');
    if (eye && eyeOff) {
      eye.style.display = isText ? 'none' : '';
      eyeOff.style.display = isText ? '' : 'none';
    }
  }

  function bindToggle(btn) {
    if (!btn) return;
    const targetId = btn.getAttribute('data-target');
    if (!targetId) return;
    const inputEl = document.getElementById(targetId);
    if (!inputEl) return;

    syncToggleVisual(btn, inputEl);

    btn.addEventListener('click', () => {
      const t = String(inputEl.getAttribute('type') || '').toLowerCase();
      const show = t === 'password';
      inputEl.setAttribute('type', show ? 'text' : 'password');
      syncToggleVisual(btn, inputEl);
    });
  }

  // Bind once
  bindToggle(toggleValueBtn);
  bindToggle(togglePassBtn);

  function openModalForField(fieldKey, options = {}) {
    const meta = fieldKey === PROFILE_PICTURE_META.key
      ? PROFILE_PICTURE_META
      : FIELD_META.find((m) => m.key === fieldKey);
    if (!meta || !modalEl) return;

    const isProfilePicture = !!meta.isFileUpload;
    activeField = meta;

    if (titleEl) titleEl.textContent = isProfilePicture ? `Change ${meta.label}` : `Edit ${meta.label}`;
    if (valueLabelEl) valueLabelEl.innerHTML = `<i data-feather="${escapeHTML(meta.icon)}"></i> ${escapeHTML(isProfilePicture ? 'Selected image' : meta.label)}`;
    if (passLabelEl) passLabelEl.innerHTML = `<i data-feather="lock"></i> Current password`;
    if (confirmBtn) confirmBtn.textContent = isProfilePicture ? 'Upload' : 'Submit';

    // Configure input type per field
    if (valueInput) {
      valueInput.removeAttribute('readonly');
      valueInput.type = isProfilePicture ? 'text' : (meta.inputType || 'text');

      if (!isProfilePicture && meta.inputMode) valueInput.setAttribute('inputmode', meta.inputMode);
      else valueInput.removeAttribute('inputmode');

      if (!isProfilePicture && meta.autocomplete) valueInput.setAttribute('autocomplete', meta.autocomplete);
      else valueInput.removeAttribute('autocomplete');

      const placeholder = isProfilePicture
        ? (options.placeholder || meta.placeholder || 'Selected image')
        : (meta.placeholder || '');
      if (placeholder) valueInput.setAttribute('placeholder', placeholder);
      else valueInput.removeAttribute('placeholder');

      if (isProfilePicture) {
        valueInput.value = String(options.fileName || '').trim();
        valueInput.setAttribute('readonly', 'readonly');
      } else {
        // Prefill current value (except password)
        valueInput.value = (fieldKey === 'password')
          ? ''
          : ((state && state[fieldKey] != null) ? String(state[fieldKey]) : '');
      }
    }

    // Ensure the "Current password" input is always hidden by default
    if (passInput) {
      passInput.setAttribute('type', 'password');
      passInput.value = '';
    }

    // Only show toggle for the value input when editing password
    if (valueWrapEl) {
      valueWrapEl.classList.toggle('has-toggle', !isProfilePicture && fieldKey === 'password');
    }

    // Reset toggle icons/state on every open
    if (toggleValueBtn && valueInput) syncToggleVisual(toggleValueBtn, valueInput);
    if (togglePassBtn && passInput) syncToggleVisual(togglePassBtn, passInput);

    setModalError('');

    modalEl.style.display = 'flex';
    modalEl.setAttribute('aria-hidden', 'false');

    // Focus
    setTimeout(() => {
      if (isProfilePicture) {
        passInput?.focus();
        passInput?.select?.();
      } else {
        valueInput?.focus();
        valueInput?.select?.();
      }
    }, 0);

    if (window.feather) feather.replace();
  }

  function closeModal(options = {}) {
    if (!modalEl) return;
    const preservePendingProfilePicture = !!options.preservePendingProfilePicture;
    const closingProfilePicture = !!(activeField && activeField.key === PROFILE_PICTURE_META.key);

    modalEl.style.display = 'none';
    modalEl.setAttribute('aria-hidden', 'true');
    activeField = null;
    // Clear sensitive fields
    if (passInput) {
      passInput.setAttribute('type', 'password');
      passInput.value = '';
    }
    if (valueInput) {
      valueInput.removeAttribute('readonly');
      valueInput.value = '';
      // When closing, always revert the value input back to password if it was shown
      // (will be re-configured correctly on next open anyway)
      if (String(valueInput.getAttribute('type') || '').toLowerCase() === 'text') {
        valueInput.setAttribute('type', 'password');
      }
    }

    if (confirmBtn) confirmBtn.textContent = 'Submit';
    if (valueWrapEl) valueWrapEl.classList.remove('has-toggle');
    if (toggleValueBtn && valueInput) syncToggleVisual(toggleValueBtn, valueInput);
    if (togglePassBtn && passInput) syncToggleVisual(togglePassBtn, passInput);
    setModalError('');

    if (closingProfilePicture && !preservePendingProfilePicture) {
      try { pendingProfilePicture?.inputEl && (pendingProfilePicture.inputEl.value = ''); } catch {}
      pendingProfilePicture = null;
    }
  }

  // Close when clicking on the backdrop (outside the box)
  modalEl?.addEventListener('click', (e) => {
    if (e.target === modalEl) closeModal();
  });

  cancelBtn?.addEventListener('click', closeModal);

  passInput?.addEventListener('input', () => setModalError(''));
  valueInput?.addEventListener('input', () => setModalError(''));

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
    const isProfilePicture = !!meta.isFileUpload;

    const newValRaw = String(valueInput?.value ?? '');
    const newVal = isProfilePicture ? null : normalizeValueForApi(field, newValRaw);

    const currentPassword = String(passInput?.value || '').trim();

    // Reset error message on every submit
    setModalError('');

    if (isProfilePicture && !(pendingProfilePicture && pendingProfilePicture.file)) {
      toast('warning', 'Image required', 'Please choose an image first.');
      closeModal();
      return;
    }

    // Client-side validation
    if (!isProfilePicture && meta.required && (!newVal || String(newVal).trim() === '')) {
      toast('warning', 'Required', `${meta.label} cannot be empty.`);
      return;
    }
    if (!currentPassword) {
      toast('warning', 'Password required', 'Current password is required to save changes.');
      return;
    }

    // Build payload
    const payload = { currentPassword };
    if (!isProfilePicture) payload[field] = newVal;

    // UI lock
    if (confirmBtn) confirmBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;

    try {
      // 1) Verify password first (so if it's correct we can close the modal immediately)
      const vRes = await fetch('/api/account/verify-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ currentPassword }),
      });

      const vJson = await vRes.json().catch(() => ({}));
      if (!vRes.ok) {
        if (vRes.status === 401) {
          // Keep modal open and show inline message
          setModalError('invalid password');
          passInput?.focus?.();
          passInput?.select?.();
          return;
        }
        throw new Error(vJson.error || `Request failed (${vRes.status})`);
      }

      // Password OK → close modal + show saving loader until Notion update completes
      closeModal({ preservePendingProfilePicture: isProfilePicture });
      showSavingOverlay();

      if (isProfilePicture) {
        await handleProfilePictureUpload(
          pendingProfilePicture?.file || null,
          pendingProfilePicture?.inputEl || null,
          pendingProfilePicture?.buttonEl || null,
          currentPassword,
        );
        return;
      }

      // 2) Save changes
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) {
          toast('error', 'Save failed', 'invalid password');
          return;
        }
        throw new Error(json.error || `Request failed (${res.status})`);
      }

      // Update local state
      if (field === 'password') {
        state.passwordSet = true;
      } else {
        state[field] = newVal;
      }

      render();

      // Keep greeting / sidebar profile in sync
      if (field === 'name') {
        try { localStorage.setItem('username', String(newVal || '').trim()); } catch {}
      }
      // Refresh common UI (greeting + sidebar profile + permissions) from the server
      try { window.dispatchEvent(new Event('user:updated')); } catch {}

      toast('success', 'Saved', `${meta.label} updated successfully.`);
    } catch (e) {
      toast('error', 'Save failed', e.message || 'Failed to update account.');
    } finally {
      hideSavingOverlay();
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
        photoUrl: data.photoUrl || '',
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
    const avatarEditBtn = e.target.closest('.profile-avatar-edit, .profile-avatar-display');
    if (avatarEditBtn) {
      const avatarSection = avatarEditBtn.closest('.profile-avatar-section');
      const fileInput = avatarSection?.querySelector('.acc-file-input');
      fileInput?.click?.();
      return;
    }

    const editBtn = e.target.closest('.acc-edit');
    if (!editBtn) return;

    const row = editBtn.closest('.profile-field-card');
    if (!row) return;

    const field = row.dataset.field;
    openModalForField(field);
  });

  container.addEventListener('change', async (e) => {
    const input = e.target.closest('.acc-file-input');
    if (!input) return;
    const file = input.files && input.files[0] ? input.files[0] : null;
    const avatarSection = input.closest('.profile-avatar-section');
    const buttonEl = avatarSection?.querySelector('.profile-avatar-edit') || null;

    if (!validateProfilePictureFile(file, input)) return;

    pendingProfilePicture = { file, inputEl: input, buttonEl };
    openModalForField(PROFILE_PICTURE_META.key, { fileName: file?.name || '' });
  });

  // Init
  await load();
});
