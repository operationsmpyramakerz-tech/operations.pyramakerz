document.addEventListener('DOMContentLoaded', async () => {
  const container = document.getElementById('account-content');

  try {
    const res = await fetch('/api/account', { credentials: 'same-origin' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Request failed (${res.status})`);
    }
    const data = await res.json();

    // Panel + cards
    container.innerHTML = `
      <div class="account-panel">
        <div class="account-grid">
          ${accRow('user', 'Name', data.name || '')}
          ${accRow('briefcase', 'Department', data.department || '')}
          ${accRow('award', 'Position', data.position || '')}
          ${accRow('phone', 'Phone', data.phone || '')}
          ${accRow('mail', 'Email', data.email || '')}
          ${accRow('hash', 'Employee Code', data.employeeCode ?? '')}
          ${accRow('lock', 'Password', mask(data.password))}
        </div>
      </div>
    `;

  } catch (e) {
    container.innerHTML = `
      <div class="card" style="border:1px solid #FCA5A5; background:#FEE2E2; color:#B91C1C; padding:1rem; border-radius:8px;">
        <strong>Error:</strong> ${escapeHTML(e.message)}
      </div>
    `;
  } finally {
    if (window.feather) feather.replace();
  }
});

function accRow(icon, label, value){
  return `
    <div class="acc-row">
      <div class="acc-left">
        <span class="acc-ico"><i data-feather="${icon}"></i></span>
        <span class="acc-label">${escapeHTML(label)}</span>
      </div>
      <div class="acc-value">${escapeHTML(String(value || '—'))}</div>
    </div>
  `;
}
function mask(v){
  if (v === null || v === undefined || String(v).trim() === '') return '—';
  return '••••••••';
}
// Simple HTML escape
function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}