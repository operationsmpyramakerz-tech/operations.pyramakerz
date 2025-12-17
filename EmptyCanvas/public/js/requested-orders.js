// public/js/requested-orders.js
document.addEventListener('DOMContentLoaded', () => {
  const listDiv = document.getElementById('requested-list');
  const searchInput = document.getElementById('requestedSearch');
  // Assign modal
  const assignModal = document.getElementById('assignModal');
  const assignClose = document.getElementById('assignClose');
  const assignCancel = document.getElementById('assignCancel');
  const assignApply = document.getElementById('assignApply');
  const assignSelect = document.getElementById('assignSelect');

  let allItems = [];
  let groups = [];
  let teamMembers = [];
  let choiceInst = null;
  let selectedGroup = null;

  const norm = (s) => String(s || '').toLowerCase().trim();
  const toMinuteKey = (iso) => String(iso || '').slice(0, 16);
  const escapeHTML = (s) => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#39;'}[c]));

  function groupOrders(items) {
    const map = new Map();
    for (const it of items) {
      const key = `${it.reason}|${toMinuteKey(it.createdTime)}`;
      let g = map.get(key);
      if (!g) {
        g = { key, reason: it.reason, createdTime: it.createdTime, createdByName: it.createdByName || '', items: [] };
        map.set(key, g);
      }
      g.items.push(it);
      if (new Date(it.createdTime) > new Date(g.createdTime)) g.createdTime = it.createdTime;
    }
    return Array.from(map.values()).sort((a,b)=> new Date(b.createdTime) - new Date(a.createdTime));
  }

  function namesForItem(it){
    if (Array.isArray(it.assignedToNames)) return it.assignedToNames.filter(Boolean);
    if (it.assignedToName) return [it.assignedToName];
    return [];
  }

  function assignedSummary(g) {
    const names = new Set(g.items.flatMap(x => namesForItem(x)).filter(Boolean));
    if (names.size === 0) return 'Unassigned';
    if (names.size === 1) return `Assigned: ${Array.from(names)[0]}`;
    return 'Assigned: Multiple';
  }

  function render() {
    listDiv.innerHTML = '';
    if (!groups.length) { listDiv.innerHTML = '<p>No requested orders found.</p>'; return; }

    const frag = document.createDocumentFragment();
    groups.forEach(g => {
      const card = document.createElement('div');
      card.className = 'order-card request-card';

      const created = new Date(g.createdTime).toLocaleString('en-US', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
      const itemsCount = g.items.length;
      const summary = assignedSummary(g);

      card.innerHTML = `
        <div class="request-head" style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div class="left">
            <h3 style="margin:0 0 4px 0;">${escapeHTML(g.reason)}</h3>
            <div class="meta" style="display:flex; align-items:center; gap:8px;">
              <span class="badge badge--name" title="Created by">${escapeHTML(g.createdByName || '-')}</span>
              <span class="badge badge--qty" title="Items">${itemsCount} items</span>
              <span class="badge" style="background:#F3F4F6; color:#374151; border-color:#E5E7EB;">${created}</span>
            </div>
          </div>
          <div class="right" style="display:flex; align-items:center; gap:8px;">
            <button class="btn-outline-pill assign-btn" data-key="${g.key}">
              <i data-feather="user-plus"></i><span>${escapeHTML(summary)}</span>
            </button>
          </div>
        </div>
        <div class="request-items" style="margin-top:.75rem; display:grid; gap:8px;">
          ${g.items.map(item => `
            <div class="order-item-card">
              <div class="order-item__left">
                <span class="badge badge--name" title="${escapeHTML(item.productName)}">${escapeHTML(item.productName)}</span>
              </div>
              <div class="order-item__right">
                <span class="badge badge--qty">Qty: ${Number(item.quantity)||0}</span>
                <span class="badge" style="background:#F3F4F6; color:#374151; border-color:#E5E7EB;">${escapeHTML(item.status)}</span>
              </div>
            </div>
          `).join('')}
        </div>
      `;
      frag.appendChild(card);
    });

    listDiv.appendChild(frag);
    if (window.feather) feather.replace();

    listDiv.querySelectorAll('.assign-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        const g = groups.find(x => x.key === key);
        if (!g) return;
        selectedGroup = { key, orderIds: g.items.map(x => x.id), items: g.items };
        openAssignModal(g);
      });
    });
  }

  function filterAndRender() {
    const q = norm(searchInput?.value || '');
    const base = groupOrders(allItems);
    groups = q ? base.filter(g => norm(g.reason).includes(q) || norm(g.createdByName).includes(q)) : base;
    render();
  }

  async function loadTeamMembers() {
    const r = await fetch('/api/team-members', { credentials: 'same-origin', cache: 'no-store' });
    if (!r.ok) throw new Error('Failed to load team members');
    teamMembers = await r.json();
  }

  async function loadRequested() {
    try {
      const r = await fetch('/api/orders/requested', { credentials: 'same-origin', cache: 'no-store' });
      if (r.status === 401) { location.href = '/login'; return; }
      if (!r.ok) throw new Error('Failed to fetch requested orders');
      const data = await r.json();
      allItems = Array.isArray(data) ? data : [];
      groups = groupOrders(allItems);
      render();
    } catch (e) {
      console.error(e);
      listDiv.innerHTML = `<p style="color:#B91C1C;">Error: ${e.message}</p>`;
    }
  }

  function buildSelectOptions(group) {
    // بناخد أعضاء الفريق
    assignSelect.innerHTML = teamMembers.map(m => `<option value="${m.id}">${escapeHTML(m.name)}</option>`).join('');
    // Remove any placeholder option that might appear in the dropdown list
    Array.from(assignSelect.options).forEach(o => {
      if (!o.value || /choose\s*member/i.test(o.textContent || '')) o.remove();
    });

    assignSelect.multiple = true; assignSelect.size = Math.min(6, teamMembers.length || 6);

    // لو كل عناصر الجروب متعيّنة لنفس الشخص، نختاره تلقائيًا
    const names = new Set((group.items || []).map(i => i.assignedToName || '').filter(Boolean));
    if (names.size === 1) {
      const name = Array.from(names)[0];
      const m = teamMembers.find(x => x.name === name);
      if (m) assignSelect.value = m.id;
    }
  }

  function enhanceSelect() {
    try {
      if (choiceInst && typeof choiceInst.destroy === 'function') {
        choiceInst.destroy();
        choiceInst = null;
      }
      if (window.Choices) {
        choiceInst = new Choices(assignSelect, { removeItemButton: true, shouldSort: false, itemSelectText: '', searchEnabled: true, placeholder: false, duplicateItemsAllowed: false });
      }
    } catch {}
  }

  // احصل على القيمة المختارة بطريقة مضمونة (سواء Choices أو select عادي)
  function getSelectedMemberIds() {
    return Array.from(assignSelect?.selectedOptions || []).map(o => o.value).filter(Boolean);
  }

  function getSelectedMemberId() {
    let val = '';
    try {
      if (choiceInst && typeof choiceInst.getValue === 'function') {
        const v = choiceInst.getValue(true); // returns value or array of values
        if (Array.isArray(v)) val = v[0] || '';
        else val = v || '';
      }
    } catch {}
    if (!val) val = assignSelect.value || '';
    return String(val).trim();
  }

  function openAssignModal(group) {
    if (!assignModal) return;
    buildSelectOptions(group);
    enhanceSelect();
    assignModal.style.display = 'flex';
    if (window.feather) feather.replace();
  }
  function closeAssignModal(){ 
    assignModal.style.display = 'none';
    // سيب الاختيار كما هو للمرة الجاية (لو حابب نعمل reset: assignSelect.value = '';)
  }

  async function applyAssign(e) {
    e?.preventDefault?.();
    const memberIds = getSelectedMemberIds();
    if (!selectedGroup || !memberIds.length) {
      alert('Please choose a member.');
      return;
    }
    assignApply.disabled = true; assignApply.textContent = 'Assigning...';
    try {
      const res = await fetch('/api/orders/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ orderIds: selectedGroup.orderIds, memberIds })
      });
      const data = await res.json().catch(()=>({}));
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to assign');

      // Update UI in-memory
      const chosenList = teamMembers.filter(m => memberIds.includes(m.id));
      if (chosenList.length) {
        const names = chosenList.map(m=>m.name);
        const ids = chosenList.map(m=>m.id);
        groups.forEach(g => {
          if (g.key !== selectedGroup.key) return;
          g.items.forEach(it => { it.assignedToIds = ids.slice(); it.assignedToNames = names.slice(); });
        });
      }
      render();
      window.UI?.toast?.({ type:'success', title:'Assigned', message:'Order assigned successfully.' });
      closeAssignModal();
    } catch (e) {
      alert(e.message || 'Failed to assign.');
    } finally {
      assignApply.disabled = false; assignApply.textContent = 'Assign';
    }
  }

  // Events
  assignClose?.addEventListener('click', closeAssignModal);
  assignCancel?.addEventListener('click', (e)=>{ e.preventDefault(); closeAssignModal(); });
  assignModal?.addEventListener('click', (e)=>{ if (e.target === assignModal) closeAssignModal(); });
  assignApply?.addEventListener('click', applyAssign);

  searchInput?.addEventListener('input', filterAndRender);
  searchInput?.addEventListener('keydown', (e)=>{ if (e.key==='Escape'){ searchInput.value=''; filterAndRender(); } });

  // Init
  (async () => {
    try { await loadTeamMembers(); } catch (e) { console.warn(e); }
    await loadRequested();
  })();
});
