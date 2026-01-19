document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('b2b-schools');
  const searchInput = document.getElementById('b2bSearch');

  let allSchools = [];

  const norm = (s) => String(s || '').toLowerCase().trim();

  // Notion select colors mapping (same spirit as stocktaking)
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

  const render = (rows) => {
    if (!grid) return;
    grid.innerHTML = '';

    if (!Array.isArray(rows) || rows.length === 0) {
      grid.innerHTML = `<div class="empty-block">No schools found.</div>`;
      return;
    }

    const frag = document.createDocumentFragment();
    rows
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
      .forEach((s) => {
        const a = document.createElement('a');
        a.className = 'school-file';
        a.href = `/b2b/school/${encodeURIComponent(s.id)}`;
        a.setAttribute('aria-label', `Open ${s.name || 'school'}`);

        const govName = s.governorate?.name || '';
        const govColor = s.governorate?.color || 'default';
        const cv = colorVars(govColor);
        a.style.setProperty('--school-accent-bg', cv.bg);
        a.style.setProperty('--school-accent-text', cv.text);
        a.style.setProperty('--school-accent-border', cv.border);

        const edu = Array.isArray(s.educationSystem) ? s.educationSystem.filter(Boolean) : [];
        const program = s.programType || '';

        const line1 = govName || '';
        const line2 = program || (edu.length ? edu.join(' · ') : '');

        a.innerHTML = `
          <div class="school-file__name" title="${String(s.name || '').replace(/"/g, '&quot;')}">${s.name || 'Untitled'}</div>
          <div class="school-file__meta">
            ${line1 ? `<div class="line"><span class="dot" aria-hidden="true"></span><span>${line1}</span></div>` : ''}
            ${line2 ? `<div class="line"><span class="dot" aria-hidden="true"></span><span>${line2}</span></div>` : ''}
          </div>
        `;

        frag.appendChild(a);
      });

    grid.appendChild(frag);
    if (window.feather) feather.replace();
  };

  const applyFilter = () => {
    const q = norm(searchInput ? searchInput.value : '');
    if (!q) return render(allSchools);

    const filtered = allSchools.filter((s) => {
      const name = norm(s.name);
      const gov = norm(s.governorate?.name);
      const edu = norm((Array.isArray(s.educationSystem) ? s.educationSystem.join(' ') : ''));
      const program = norm(s.programType);
      return name.includes(q) || gov.includes(q) || edu.includes(q) || program.includes(q);
    });
    render(filtered);
  };

  const fetchSchools = async () => {
    if (grid) {
      grid.innerHTML = `
        <div class="modern-loading" role="status" aria-live="polite">
          <div class="modern-loading__spinner" aria-hidden="true"></div>
          <div class="modern-loading__text">
            Loading schools
            <span class="modern-loading__dots" aria-hidden="true"><span></span><span></span><span></span></span>
          </div>
        </div>
      `;
    }

    try {
      const res = await fetch('/api/b2b/schools', { credentials: 'include' });
      if (res.status === 401 || res.redirected) {
        window.location.href = '/login';
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to load schools');
      }
      const data = await res.json();
      allSchools = Array.isArray(data) ? data : [];
      render(allSchools);
    } catch (e) {
      console.error(e);
      if (grid) grid.innerHTML = `<div class="error-block">Error: ${e.message}</div>`;
    }
  };

  fetchSchools();

  if (searchInput) {
    searchInput.addEventListener('input', applyFilter);
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && searchInput.value) {
        searchInput.value = '';
        applyFilter();
      }
    });
  }
});
