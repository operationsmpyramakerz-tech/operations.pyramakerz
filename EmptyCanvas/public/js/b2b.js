document.addEventListener('DOMContentLoaded', () => {
  const grid = document.getElementById('b2b-schools');
  const searchInput = document.getElementById('b2bSearch');

  let allSchools = [];

  const norm = (value) => String(value || '').toLowerCase().trim();

  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => {
    switch (char) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return char;
    }
  });

  const abbreviation = (value) => {
    const text = String(value || '').trim();
    if (!text) return '';

    const words = text.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return words
        .slice(0, 2)
        .map((word) => Array.from(word)[0] || '')
        .join('')
        .slice(0, 2)
        .toUpperCase();
    }

    const cleaned = text.replace(/[^0-9A-Za-z\u0600-\u06FF]+/g, '');
    const chars = Array.from(cleaned || text).slice(0, 2).join('');
    return chars.toUpperCase();
  };

  const buildCaption = (school) => {
    const governorate = school.governorate?.name || '';
    const program = school.programType || '';
    const educationSystems = Array.isArray(school.educationSystem)
      ? school.educationSystem.filter(Boolean)
      : [];

    const parts = [governorate];
    if (program) {
      parts.push(program);
    } else if (educationSystems.length) {
      parts.push(educationSystems.slice(0, 2).join(' · '));
    }

    return parts.filter(Boolean).join(' • ') || 'Open school folder';
  };

  const buildChips = (school) => {
    const governorate = school.governorate?.name || '';
    const program = school.programType || '';
    const educationSystems = Array.isArray(school.educationSystem)
      ? school.educationSystem.filter(Boolean)
      : [];

    const rawTokens = [governorate, program, ...educationSystems]
      .map(abbreviation)
      .filter(Boolean);

    const uniqueTokens = [...new Set(rawTokens)].slice(0, 3);
    return uniqueTokens.length ? uniqueTokens : ['B2'];
  };

  const render = (rows) => {
    if (!grid) return;
    grid.innerHTML = '';

    if (!Array.isArray(rows) || rows.length === 0) {
      grid.innerHTML = '<div class="empty-block">No schools found.</div>';
      return;
    }

    const fragment = document.createDocumentFragment();

    rows
      .slice()
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
      .forEach((school) => {
        const folder = document.createElement('a');
        const schoolName = school.name || 'Untitled';
        const caption = buildCaption(school);
        const chips = buildChips(school);

        folder.className = 'school-folder';
        folder.href = `/b2b/school/${encodeURIComponent(school.id)}`;
        folder.setAttribute('aria-label', `Open ${schoolName}`);

        folder.innerHTML = `
          <div class="school-folder__figure" aria-hidden="true">
            <span class="school-folder__paper school-folder__paper--left"></span>
            <span class="school-folder__paper school-folder__paper--right"></span>
            <span class="school-folder__back"></span>
            <span class="school-folder__front">
              <span class="school-folder__chips">
                ${chips.map((chip, index) => `<span class="school-folder__chip school-folder__chip--${Math.min(index + 1, 3)}">${escapeHtml(chip)}</span>`).join('')}
              </span>
            </span>
          </div>
          <div class="school-folder__name" title="${escapeHtml(schoolName)}">${escapeHtml(schoolName)}</div>
          <div class="school-folder__caption">${escapeHtml(caption)}</div>
        `;

        fragment.appendChild(folder);
      });

    grid.appendChild(fragment);

    if (window.feather) {
      feather.replace();
    }
  };

  const applyFilter = () => {
    const query = norm(searchInput ? searchInput.value : '');
    if (!query) {
      render(allSchools);
      return;
    }

    const filtered = allSchools.filter((school) => {
      const name = norm(school.name);
      const governorate = norm(school.governorate?.name);
      const educationSystem = norm(Array.isArray(school.educationSystem) ? school.educationSystem.join(' ') : '');
      const program = norm(school.programType);
      return name.includes(query) || governorate.includes(query) || educationSystem.includes(query) || program.includes(query);
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
      const response = await fetch('/api/b2b/schools', { credentials: 'include' });
      if (response.status === 401 || response.redirected) {
        window.location.href = '/login';
        return;
      }

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload.error || 'Failed to load schools');
      }

      const data = await response.json();
      allSchools = Array.isArray(data) ? data : [];
      render(allSchools);
    } catch (error) {
      console.error(error);
      if (grid) {
        grid.innerHTML = `<div class="error-block">Error: ${escapeHtml(error.message)}</div>`;
      }
    }
  };

  fetchSchools();

  if (searchInput) {
    searchInput.addEventListener('input', applyFilter);
    searchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && searchInput.value) {
        searchInput.value = '';
        applyFilter();
      }
    });
  }
});
