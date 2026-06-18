/**
 * Projects Loader — Fetches projects data and renders cards, filters, and detail modal.
 * Uses Bootstrap modal and DOM manipulation (no innerHTML for user data — XSS-safe).
 */
document.addEventListener('DOMContentLoaded', function () {
  let allProjects = [];
  let siteLabels = {};

  Promise.all([
    fetch('/api/portfolio/projects').then(res => res.json()),
    fetch('/api/site').then(res => res.ok ? res.json() : null).catch(() => null),
  ])
    .then(([projects, site]) => {
      allProjects = Array.isArray(projects) ? projects : [];
      siteLabels = site?.projects || {};
      renderFilters(allProjects);
      renderCards(allProjects);
    })
    .catch(err => console.error('Error loading projects:', err));

  // ─── FILTERS ─────────────────────────────────
  function renderFilters(projects) {
    const container = document.getElementById('projects-filters');
    container.innerHTML = '';

    const allBtn = document.createElement('button');
    allBtn.className = 'filter-btn active';
    allBtn.dataset.filter = '*';
    allBtn.textContent = siteLabels.allFilterLabel || 'All';
    container.appendChild(allBtn);

    // Gather unique categories
    const categories = [...new Set(projects.map(p => p.category).filter(Boolean))];

    categories.forEach(cat => {
      const btn = document.createElement('button');
      btn.className = 'filter-btn';
      btn.dataset.filter = cat;
      btn.textContent = cat;
      container.appendChild(btn);
    });

    // Filter click handlers
    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.filter-btn');
      if (!btn) return;

      container.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const filter = btn.dataset.filter;
      const cards = document.querySelectorAll('#projects-grid .project-card-col');
      cards.forEach(card => {
        if (filter === '*' || card.dataset.category === filter) {
          card.style.display = '';
          // Animate in
          card.style.opacity = '0';
          card.style.transform = 'translateY(20px)';
          requestAnimationFrame(() => {
            card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
          });
        } else {
          card.style.display = 'none';
        }
      });
    });
  }

  // ─── CARDS ─────────────────────────────────
  function renderCards(projects) {
    const grid = document.getElementById('projects-grid');
    grid.innerHTML = '';

    projects.forEach((project, index) => {
      const col = document.createElement('div');
      col.className = 'col-lg-4 col-md-6 project-card-col';
      col.dataset.category = project.category || '';
      // Staggered entrance animation
      col.style.opacity = '0';
      col.style.transform = 'translateY(30px)';

      const card = document.createElement('div');
      card.className = 'project-card';
      card.dataset.index = index;

      // Image area
      const imgWrap = document.createElement('div');
      imgWrap.className = 'card-img-wrap';

      if (project.image) {
        const img = document.createElement('img');
        img.src = project.image;
        img.alt = project.title || 'Project image';
        img.loading = 'lazy';
        // Fallback on error
        img.addEventListener('error', () => {
          img.remove();
          const placeholder = document.createElement('div');
          placeholder.className = 'no-image-placeholder';
          const icon = document.createElement('i');
          icon.className = 'bi bi-kanban';
          placeholder.appendChild(icon);
          imgWrap.appendChild(placeholder);
        });
        imgWrap.appendChild(img);
      } else {
        const placeholder = document.createElement('div');
        placeholder.className = 'no-image-placeholder';
        const icon = document.createElement('i');
        icon.className = 'bi bi-kanban';
        placeholder.appendChild(icon);
        imgWrap.appendChild(placeholder);
      }

      // Hover overlay with "View Details" hint
      const overlay = document.createElement('div');
      overlay.className = 'card-img-overlay';
      const viewHint = document.createElement('span');
      viewHint.className = 'view-hint';
      viewHint.textContent = siteLabels.viewDetailsLabel || 'View Details';
      overlay.appendChild(viewHint);
      imgWrap.appendChild(overlay);
      card.appendChild(imgWrap);

      // Card body
      const body = document.createElement('div');
      body.className = 'card-body';

      // Badges
      const badges = document.createElement('div');
      badges.className = 'card-badges';

      if (project.category) {
        const catBadge = document.createElement('span');
        catBadge.className = 'badge-category';
        catBadge.textContent = project.category;
        badges.appendChild(catBadge);
      }

      if (project.status) {
        const statusBadge = document.createElement('span');
        statusBadge.className = 'badge-status ' + (project.status.toLowerCase() === 'completed' ? 'completed' : 'ongoing');
        statusBadge.textContent = project.status;
        badges.appendChild(statusBadge);
      }
      body.appendChild(badges);

      // Title
      const title = document.createElement('h4');
      title.className = 'card-title';
      title.textContent = project.title || '';
      body.appendChild(title);

      // Description
      const desc = document.createElement('p');
      desc.className = 'card-text';
      desc.textContent = project.description || '';
      body.appendChild(desc);

      // Tech pills (show max 4 on card)
      if (project.technologies && project.technologies.length > 0) {
        const techWrap = document.createElement('div');
        techWrap.className = 'card-tech';
        const maxShow = 4;
        project.technologies.slice(0, maxShow).forEach(t => {
          const pill = document.createElement('span');
          pill.className = 'tech-pill';
          pill.textContent = t;
          techWrap.appendChild(pill);
        });
        if (project.technologies.length > maxShow) {
          const more = document.createElement('span');
          more.className = 'tech-pill';
          more.textContent = '+' + (project.technologies.length - maxShow);
          techWrap.appendChild(more);
        }
        body.appendChild(techWrap);
      }

      card.appendChild(body);
      col.appendChild(card);
      grid.appendChild(col);

      // Staggered entrance animation
      setTimeout(() => {
        col.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
        col.style.opacity = '1';
        col.style.transform = 'translateY(0)';
      }, 100 + index * 100);

      // Click → open modal
      card.addEventListener('click', () => openProjectModal(project));
    });
  }

  // ─── MODAL ─────────────────────────────────
  function openProjectModal(project) {
    document.getElementById('projectModalLabel').textContent = project.title || '';
    document.getElementById('pm-category').textContent = project.category || '';

    // Image
    const imgWrap = document.getElementById('pm-image-wrap');
    const img = document.getElementById('pm-image');
    if (project.image) {
      img.src = project.image;
      img.alt = project.title || '';
      imgWrap.style.display = '';
      img.onerror = () => { imgWrap.style.display = 'none'; };
    } else {
      imgWrap.style.display = 'none';
    }

    // Status badge
    const statusEl = document.getElementById('pm-status');
    statusEl.textContent = project.status || '';
    statusEl.className = 'pm-status-badge ' + (project.status?.toLowerCase() === 'completed' ? 'completed' : 'ongoing');

    // Dates
    const datesEl = document.getElementById('pm-dates');
    if (project.startDate) {
      const startFormatted = formatDate(project.startDate);
      const endFormatted = project.endDate ? formatDate(project.endDate) : 'Present';
      datesEl.innerHTML = '';
      const icon = document.createElement('i');
      icon.className = 'bi bi-calendar3';
      datesEl.appendChild(icon);
      datesEl.appendChild(document.createTextNode(' ' + startFormatted + ' — ' + endFormatted));
      datesEl.style.display = '';
    } else {
      datesEl.style.display = 'none';
    }

    // Client
    const clientEl = document.getElementById('pm-client');
    if (project.client) {
      clientEl.innerHTML = '';
      const icon = document.createElement('i');
      icon.className = 'bi bi-building';
      clientEl.appendChild(icon);
      clientEl.appendChild(document.createTextNode(' ' + project.client));
      clientEl.style.display = '';
    } else {
      clientEl.style.display = 'none';
    }

    // Description
    document.getElementById('pm-description').textContent = project.fullDescription || project.description || '';

    // Technologies
    const techContainer = document.getElementById('pm-technologies');
    const techWrap = document.getElementById('pm-tech-wrap');
    techContainer.innerHTML = '';
    if (project.technologies && project.technologies.length > 0) {
      const techTitle = techWrap.querySelector('h6');
      if (techTitle) {
        techTitle.innerHTML = '';
        const icon = document.createElement('i');
        icon.className = 'bi bi-cpu';
        techTitle.appendChild(icon);
        techTitle.appendChild(document.createTextNode(' ' + (siteLabels.technologiesTitle || 'Technologies')));
      }
      project.technologies.forEach(t => {
        const pill = document.createElement('span');
        pill.className = 'tech-pill';
        pill.textContent = t;
        techContainer.appendChild(pill);
      });
      techWrap.style.display = '';
    } else {
      techWrap.style.display = 'none';
    }

    // Highlights
    const highlightsList = document.getElementById('pm-highlights');
    const highlightsWrap = document.getElementById('pm-highlights-wrap');
    highlightsList.innerHTML = '';
    if (project.highlights && project.highlights.length > 0) {
      const highlightsTitle = highlightsWrap.querySelector('h6');
      if (highlightsTitle) {
        highlightsTitle.innerHTML = '';
        const icon = document.createElement('i');
        icon.className = 'bi bi-star';
        highlightsTitle.appendChild(icon);
        highlightsTitle.appendChild(document.createTextNode(' ' + (siteLabels.highlightsTitle || 'Key Highlights')));
      }
      project.highlights.forEach(h => {
        const li = document.createElement('li');
        li.textContent = h;
        highlightsList.appendChild(li);
      });
      highlightsWrap.style.display = '';
    } else {
      highlightsWrap.style.display = 'none';
    }

    // Links
    const linksContainer = document.getElementById('pm-links');
    linksContainer.innerHTML = '';
    if (project.liveUrl) {
      const a = document.createElement('a');
      a.href = project.liveUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'pm-link-live';
      a.innerHTML = '<i class="bi bi-globe"></i>';
      a.appendChild(document.createTextNode(' ' + (siteLabels.liveDemoLabel || 'Live Demo')));
      linksContainer.appendChild(a);
    }
    if (project.repoUrl) {
      const a = document.createElement('a');
      a.href = project.repoUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'pm-link-repo';
      a.innerHTML = '<i class="bi bi-github"></i>';
      a.appendChild(document.createTextNode(' ' + (siteLabels.sourceCodeLabel || 'Source Code')));
      linksContainer.appendChild(a);
    }

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('projectModal'));
    modal.show();
  }

  function formatDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    if (parts.length >= 2) {
      return months[parseInt(parts[1], 10) - 1] + ' ' + parts[0];
    }
    return dateStr;
  }
});
