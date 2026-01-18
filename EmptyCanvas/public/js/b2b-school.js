document.addEventListener('DOMContentLoaded', () => {
  const schoolNameEl = document.getElementById('schoolName');
  const detailsEl = document.getElementById('schoolDetails');
  const groupsEl = document.getElementById('school-stock-groups');
  const searchInput = document.getElementById('schoolStockSearch');

  let school = null;
  let allStock = [];

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

  const renderGroups = (rows) => {
    if (!groupsEl) return;
    groupsEl.innerHTML = '';

    if (!Array.isArray(rows) || rows.length === 0) {
      groupsEl.innerHTML = `<div class="empty-block">No stock data found.</div>`;
      return;
    }

    const doneLabel = school?.name ? `${school.name} Done` : 'Done';

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
          <th class="col-num">In Stock</th>
          <th class="col-num">${doneLabel}</th>
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

          const tdQty = document.createElement('td');
          tdQty.className = 'col-num';
          tdQty.textContent = String(item.quantity ?? 0);

          const tdDone = document.createElement('td');
          tdDone.className = 'col-num';
          tdDone.textContent = String(item.doneQuantity ?? 0);

          tr.appendChild(tdName);
          tr.appendChild(tdQty);
          tr.appendChild(tdDone);
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
    if (!groupsEl) return [];
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
      return [];
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Failed to load stock');
    }
    const data = await res.json();
    return Array.isArray(data) ? data : [];
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

      renderDetails();

      allStock = await fetchStock(id);
      renderGroups(allStock);

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
