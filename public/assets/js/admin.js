/**
 * Portfolio Admin Panel — Frontend Logic
 * Handles auth, data loading, form editors, and save operations.
 * All event handling uses addEventListener (no inline handlers) for CSP compliance.
 */

// ──────────────────────────────────────────
// STATE
// ──────────────────────────────────────────
let currentData = {};
const sortableInstances = [];

// ──────────────────────────────────────────
// UTILITY
// ──────────────────────────────────────────
function showToast(msg, isError) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast-msg' + (isError ? ' error' : '');
  toast.textContent = (isError ? '✗ ' : '✓ ') + msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

async function apiCall(url, method, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ──────────────────────────────────────────
// AUTH
// ──────────────────────────────────────────
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';
  try {
    await apiCall('/api/admin/login', 'POST', {
      username: document.getElementById('login-username').value,
      password: document.getElementById('login-password').value,
    });
    showDashboard();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await apiCall('/api/admin/logout', 'POST');
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
});

async function checkAuth() {
  try {
    const res = await apiCall('/api/admin/check', 'GET');
    if (res.authenticated) showDashboard();
  } catch (e) { /* not logged in */ }
}

async function showDashboard() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  await loadAllData();
}

// ──────────────────────────────────────────
// SIDEBAR NAV
// ──────────────────────────────────────────
document.querySelectorAll('.sidebar-nav a').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    document.querySelectorAll('.sidebar-nav a').forEach(a => a.classList.remove('active'));
    link.classList.add('active');
    const section = link.dataset.section;
    document.getElementById('section-title').textContent =
      section.charAt(0).toUpperCase() + section.slice(1);
    document.querySelectorAll('.section-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('panel-' + section).classList.add('active');
  });
});

// ──────────────────────────────────────────
// EVENT DELEGATION (replaces all inline onclick/oninput)
// ──────────────────────────────────────────
document.addEventListener('click', (e) => {
  // Remove dynamic item buttons
  const removeBtn = e.target.closest('.remove-btn');
  if (removeBtn) {
    removeBtn.closest('.dynamic-item').remove();
    return;
  }

  // data-action buttons
  const actionBtn = e.target.closest('[data-action]');
  if (!actionBtn) return;

  const action = actionBtn.dataset.action;
  switch (action) {
    case 'addDetail': addDetail(); break;
    case 'addSkill': addSkill(); break;
    case 'addInterest': addInterest(); break;
    case 'addEmail': addEmail(); break;
    case 'addPhone': addPhone(); break;
    case 'addResearch': addResearch(); break;
    case 'addSocialLink': addSocialLink(actionBtn.dataset.target); break;
    case 'addResumeEntry': addResumeEntry(actionBtn.dataset.type); break;
    case 'addProject': addProject(); break;
    case 'createProject': openProjectEditor(-1); break;
    case 'editProject': openProjectEditor(parseInt(actionBtn.dataset.index)); break;
    case 'deleteProject': deleteProject(parseInt(actionBtn.dataset.index)); break;
    case 'save': saveSection(actionBtn.dataset.section); break;
  }
});

// Range slider live label updates (replaces oninput)
document.addEventListener('input', (e) => {
  if (e.target.matches('input[type="range"][data-field="percentage"]')) {
    const span = e.target.nextElementSibling;
    if (span) span.textContent = e.target.value + '%';
  }
  // Color text input syncs to color picker
  if (e.target.matches('.color-text-sync')) {
    const colorPicker = e.target.previousElementSibling;
    if (colorPicker) colorPicker.value = e.target.value;
  }
});

// ──────────────────────────────────────────
// LOAD DATA
// ──────────────────────────────────────────
async function loadAllData() {
  try {
    const sections = ['profile', 'skills', 'interests', 'resume', 'contact', 'projects'];
    const results = await Promise.all(sections.map(s => apiCall(`/api/portfolio/${s}`, 'GET')));
    sections.forEach((s, i) => currentData[s] = results[i]);
    populateProfile(currentData.profile);
    populateSkills(currentData.skills);
    populateInterests(currentData.interests);
    populateResume(currentData.resume);
    populateContact(currentData.contact);
    populateProjects(currentData.projects);
    initSortable();
  } catch (err) {
    showToast('Error loading data: ' + err.message, true);
  }
}

// ──────────────────────────────────────────
// PROFILE
// ──────────────────────────────────────────
function populateProfile(d) {
  document.getElementById('p-name').value = d.name || '';
  document.getElementById('p-fullName').value = d.fullName || '';
  document.getElementById('p-tagline').value = d.tagline || '';
  document.getElementById('p-profileImage').value = d.profileImage || '';
  document.getElementById('p-aboutTitle').value = d.aboutTitle || '';
  document.getElementById('p-aboutText').value = d.aboutText || '';
  document.getElementById('p-metaTitle').value = d.meta?.title || '';
  document.getElementById('p-metaDesc').value = d.meta?.description || '';
  document.getElementById('p-metaKeywords').value = d.meta?.keywords || '';
  const list = document.getElementById('p-details-list');
  list.innerHTML = '';
  (d.details || []).forEach(det => addDetail(det.label, det.value));
  const sList = document.getElementById('p-social-list');
  sList.innerHTML = '';
  (d.socialLinks || []).forEach(sl => addSocialLink('p-social-list', sl.platform, sl.url, sl.icon));
}

function collectProfile() {
  return {
    name: document.getElementById('p-name').value,
    fullName: document.getElementById('p-fullName').value,
    tagline: document.getElementById('p-tagline').value,
    profileImage: document.getElementById('p-profileImage').value,
    aboutTitle: document.getElementById('p-aboutTitle').value,
    aboutText: document.getElementById('p-aboutText').value,
    details: collectDynamicItems('p-details-list', ['label', 'value']),
    socialLinks: collectDynamicItems('p-social-list', ['platform', 'url', 'icon']),
    meta: {
      title: document.getElementById('p-metaTitle').value,
      description: document.getElementById('p-metaDesc').value,
      keywords: document.getElementById('p-metaKeywords').value,
    },
  };
}

// ──────────────────────────────────────────
// SKILLS
// ──────────────────────────────────────────
function populateSkills(data) {
  const list = document.getElementById('skills-list');
  list.innerHTML = '';
  (data || []).forEach(s => addSkill(s.name, s.percentage));
}

function collectSkills() {
  return collectDynamicItems('skills-list', ['name', 'percentage']).map(s => ({
    name: s.name,
    percentage: parseInt(s.percentage, 10) || 0,
  }));
}

// ──────────────────────────────────────────
// INTERESTS
// ──────────────────────────────────────────
function populateInterests(data) {
  const list = document.getElementById('interests-list');
  list.innerHTML = '';
  (data || []).forEach(i => addInterest(i.name, i.icon, i.color));
}

function collectInterests() {
  return collectDynamicItems('interests-list', ['name', 'icon', 'color']);
}

// ──────────────────────────────────────────
// RESUME
// ──────────────────────────────────────────
function populateResume(d) {
  document.getElementById('r-summaryName').value = d.summary?.name || '';
  document.getElementById('r-summaryText').value = d.summary?.text || '';
  document.getElementById('r-aoiTitle').value = d.areasOfInterest?.title || '';
  document.getElementById('r-aoiDesc').value = d.areasOfInterest?.description || '';

  ['experience', 'education', 'certifications', 'honors'].forEach(type => {
    const list = document.getElementById(`r-${type}-list`);
    list.innerHTML = '';
    (d[type] || []).forEach(e => addResumeEntry(type, e));
  });

  const resList = document.getElementById('r-research-list');
  resList.innerHTML = '';
  (d.research || []).forEach(r => addResearch(r));
}

function collectResume() {
  return {
    summary: {
      name: document.getElementById('r-summaryName').value,
      text: document.getElementById('r-summaryText').value,
    },
    experience: collectResumeEntries('experience', true),
    education: collectResumeEntries('education', false),
    certifications: collectResumeEntries('certifications', false),
    honors: collectResumeEntries('honors', false),
    research: collectResearchEntries(),
    areasOfInterest: {
      title: document.getElementById('r-aoiTitle').value,
      description: document.getElementById('r-aoiDesc').value,
    },
  };
}

// ──────────────────────────────────────────
// CONTACT
// ──────────────────────────────────────────
function populateContact(d) {
  document.getElementById('c-address').value = d.address || '';
  const eList = document.getElementById('c-emails-list');
  eList.innerHTML = '';
  (d.emails || []).forEach(e => addEmail(e.address));
  const pList = document.getElementById('c-phones-list');
  pList.innerHTML = '';
  (d.phones || []).forEach(p => addPhone(p.number, p.tel));
  const sList = document.getElementById('c-social-list');
  sList.innerHTML = '';
  (d.socialLinks || []).forEach(sl => addSocialLink('c-social-list', sl.platform, sl.url, sl.icon));
}

function collectContact() {
  return {
    address: document.getElementById('c-address').value,
    emails: collectDynamicItems('c-emails-list', ['address']),
    phones: collectDynamicItems('c-phones-list', ['number', 'tel']),
    socialLinks: collectDynamicItems('c-social-list', ['platform', 'url', 'icon']),
  };
}

// ──────────────────────────────────────────
// DYNAMIC ITEMS — ADD/COLLECT
// ──────────────────────────────────────────
function collectDynamicItems(listId, fields) {
  const items = [];
  document.querySelectorAll(`#${listId} .dynamic-item`).forEach(item => {
    const obj = {};
    fields.forEach(f => {
      const el = item.querySelector(`[data-field="${f}"]`);
      if (el) obj[f] = el.value;
    });
    items.push(obj);
  });
  return items;
}

function addDetail(label, value) {
  const list = document.getElementById('p-details-list');
  const div = document.createElement('div');
  div.className = 'dynamic-item';
  div.innerHTML = `
    <span class="drag-handle"><i class="bi bi-grip-vertical"></i></span>
    <button class="btn btn-outline-danger remove-btn"><i class="bi bi-x"></i></button>
    <div class="row g-2">
      <div class="col-4">
        <label class="form-label">Label</label>
        <input type="text" class="form-control" data-field="label" value="${escHtml(label || '')}">
      </div>
      <div class="col-8">
        <label class="form-label">Value (HTML allowed)</label>
        <input type="text" class="form-control" data-field="value" value="${escHtml(value || '')}">
      </div>
    </div>`;
  list.appendChild(div);
}

function addSocialLink(listId, platform, url, icon) {
  const list = document.getElementById(listId);
  const div = document.createElement('div');
  div.className = 'dynamic-item';
  div.innerHTML = `
    <span class="drag-handle"><i class="bi bi-grip-vertical"></i></span>
    <button class="btn btn-outline-danger remove-btn"><i class="bi bi-x"></i></button>
    <div class="row g-2">
      <div class="col-3">
        <label class="form-label">Platform</label>
        <input type="text" class="form-control" data-field="platform" value="${escHtml(platform || '')}" placeholder="twitter">
      </div>
      <div class="col-5">
        <label class="form-label">URL</label>
        <input type="text" class="form-control" data-field="url" value="${escHtml(url || '')}" placeholder="https://...">
      </div>
      <div class="col-4">
        <label class="form-label">Icon Class</label>
        <input type="text" class="form-control" data-field="icon" value="${escHtml(icon || '')}" placeholder="bi bi-twitter">
      </div>
    </div>`;
  list.appendChild(div);
}

function addSkill(name, pct) {
  const list = document.getElementById('skills-list');
  const div = document.createElement('div');
  div.className = 'dynamic-item';
  const pctVal = pct !== undefined ? pct : 50;
  div.innerHTML = `
    <span class="drag-handle"><i class="bi bi-grip-vertical"></i></span>
    <button class="btn btn-outline-danger remove-btn"><i class="bi bi-x"></i></button>
    <div class="row g-2 align-items-end">
      <div class="col-6">
        <label class="form-label">Skill Name</label>
        <input type="text" class="form-control" data-field="name" value="${escHtml(name || '')}">
      </div>
      <div class="col-4">
        <label class="form-label">Percentage</label>
        <input type="range" class="form-range" min="0" max="100" data-field="percentage" value="${pctVal}">
        <span style="font-size:.8rem;color:var(--accent)">${pctVal}%</span>
      </div>
    </div>`;
  list.appendChild(div);
}

function addInterest(name, icon, color) {
  const list = document.getElementById('interests-list');
  const div = document.createElement('div');
  div.className = 'dynamic-item';
  div.innerHTML = `
    <span class="drag-handle"><i class="bi bi-grip-vertical"></i></span>
    <button class="btn btn-outline-danger remove-btn"><i class="bi bi-x"></i></button>
    <div class="row g-2">
      <div class="col-4">
        <label class="form-label">Name</label>
        <input type="text" class="form-control" data-field="name" value="${escHtml(name || '')}">
      </div>
      <div class="col-4">
        <label class="form-label">Icon Class</label>
        <input type="text" class="form-control" data-field="icon" value="${escHtml(icon || '')}" placeholder="ri-store-line">
      </div>
      <div class="col-4">
        <label class="form-label">Color</label>
        <div class="d-flex gap-2">
          <input type="color" class="form-control form-control-color" data-field="color" value="${color || '#ffbb2c'}" style="width:50px">
          <input type="text" class="form-control color-text-sync" value="${escHtml(color || '#ffbb2c')}" style="font-size:.8rem">
        </div>
      </div>
    </div>`;
  list.appendChild(div);
}

function addEmail(address) {
  const list = document.getElementById('c-emails-list');
  const div = document.createElement('div');
  div.className = 'dynamic-item';
  div.innerHTML = `
    <span class="drag-handle"><i class="bi bi-grip-vertical"></i></span>
    <button class="btn btn-outline-danger remove-btn"><i class="bi bi-x"></i></button>
    <input type="email" class="form-control" data-field="address" value="${escHtml(address || '')}" placeholder="email@example.com">`;
  list.appendChild(div);
}

function addPhone(number, tel) {
  const list = document.getElementById('c-phones-list');
  const div = document.createElement('div');
  div.className = 'dynamic-item';
  div.innerHTML = `
    <span class="drag-handle"><i class="bi bi-grip-vertical"></i></span>
    <button class="btn btn-outline-danger remove-btn"><i class="bi bi-x"></i></button>
    <div class="row g-2">
      <div class="col-6">
        <label class="form-label">Display Number</label>
        <input type="text" class="form-control" data-field="number" value="${escHtml(number || '')}" placeholder="+256 774 546 556">
      </div>
      <div class="col-6">
        <label class="form-label">Tel Link</label>
        <input type="text" class="form-control" data-field="tel" value="${escHtml(tel || '')}" placeholder="+256774546556">
      </div>
    </div>`;
  list.appendChild(div);
}

function addResumeEntry(type, data) {
  const list = document.getElementById(`r-${type}-list`);
  const div = document.createElement('div');
  div.className = 'dynamic-item';
  const hasBullets = (type === 'experience');
  const orgLabel = (type === 'experience') ? 'Organization' : 'Institution';

  div.innerHTML = `
    <span class="drag-handle"><i class="bi bi-grip-vertical"></i></span>
    <button class="btn btn-outline-danger remove-btn"><i class="bi bi-x"></i></button>
    <div class="row g-2">
      <div class="col-12">
        <label class="form-label">Title</label>
        <input type="text" class="form-control" data-field="title" value="${escHtml(data?.title || '')}">
      </div>
      <div class="col-8">
        <label class="form-label">${orgLabel}</label>
        <input type="text" class="form-control" data-field="org" value="${escHtml(data?.organization || data?.institution || '')}">
      </div>
      <div class="col-4">
        <label class="form-label">Period</label>
        <input type="text" class="form-control" data-field="period" value="${escHtml(data?.period || '')}">
      </div>
      ${hasBullets ? `
      <div class="col-12">
        <label class="form-label">Bullet Points (one per line)</label>
        <textarea class="form-control" data-field="bullets" rows="4">${escHtml((data?.bullets || []).join('\n'))}</textarea>
      </div>` : `
      <div class="col-12">
        <label class="form-label">Description</label>
        <textarea class="form-control" data-field="description" rows="2">${escHtml(data?.description || '')}</textarea>
      </div>`}
    </div>`;
  list.appendChild(div);
}

function collectResumeEntries(type, hasBullets) {
  const items = [];
  document.querySelectorAll(`#r-${type}-list .dynamic-item`).forEach(item => {
    const obj = {
      title: item.querySelector('[data-field="title"]').value,
      period: item.querySelector('[data-field="period"]').value,
    };
    const orgEl = item.querySelector('[data-field="org"]');
    if (type === 'experience') {
      obj.organization = orgEl.value;
    } else {
      obj.institution = orgEl.value;
    }
    if (hasBullets) {
      obj.bullets = item.querySelector('[data-field="bullets"]').value.split('\n').filter(b => b.trim());
    } else {
      const descEl = item.querySelector('[data-field="description"]');
      if (descEl) obj.description = descEl.value;
    }
    items.push(obj);
  });
  return items;
}

function addResearch(data) {
  const list = document.getElementById('r-research-list');
  const div = document.createElement('div');
  div.className = 'dynamic-item';
  div.innerHTML = `
    <span class="drag-handle"><i class="bi bi-grip-vertical"></i></span>
    <button class="btn btn-outline-danger remove-btn"><i class="bi bi-x"></i></button>
    <div class="row g-2">
      <div class="col-12">
        <label class="form-label">Title</label>
        <input type="text" class="form-control" data-field="title" value="${escHtml(data?.title || '')}">
      </div>
      <div class="col-8">
        <label class="form-label">Institution</label>
        <input type="text" class="form-control" data-field="institution" value="${escHtml(data?.institution || '')}">
      </div>
      <div class="col-4">
        <label class="form-label">Period</label>
        <input type="text" class="form-control" data-field="period" value="${escHtml(data?.period || '')}">
      </div>
      <div class="col-12">
        <label class="form-label">Bullet Points (one per line)</label>
        <textarea class="form-control" data-field="bullets" rows="4">${escHtml((data?.bullets || []).join('\n'))}</textarea>
      </div>
      <div class="col-8">
        <label class="form-label">Publication URL</label>
        <input type="text" class="form-control" data-field="publicationUrl" value="${escHtml(data?.publicationUrl || '')}">
      </div>
      <div class="col-4">
        <label class="form-label">Publication Title</label>
        <input type="text" class="form-control" data-field="publicationTitle" value="${escHtml(data?.publicationTitle || '')}">
      </div>
    </div>`;
  list.appendChild(div);
}

function collectResearchEntries() {
  const items = [];
  document.querySelectorAll('#r-research-list .dynamic-item').forEach(item => {
    items.push({
      title: item.querySelector('[data-field="title"]').value,
      institution: item.querySelector('[data-field="institution"]').value,
      period: item.querySelector('[data-field="period"]').value,
      bullets: item.querySelector('[data-field="bullets"]').value.split('\n').filter(b => b.trim()),
      publicationUrl: item.querySelector('[data-field="publicationUrl"]').value,
      publicationTitle: item.querySelector('[data-field="publicationTitle"]').value,
    });
  });
  return items;
}

// ──────────────────────────────────────────
// SAVE
// ──────────────────────────────────────────
async function saveSection(section) {
  let data;
  switch (section) {
    case 'profile': data = collectProfile(); break;
    case 'skills': data = collectSkills(); break;
    case 'interests': data = collectInterests(); break;
    case 'resume': data = collectResume(); break;
    case 'contact': data = collectContact(); break;
    case 'projects': data = collectProjects(); break;
    default: return showToast('Unknown section', true);
  }
  try {
    await apiCall(`/api/admin/portfolio/${section}`, 'PUT', data);
    showToast(`${section.charAt(0).toUpperCase() + section.slice(1)} saved successfully!`);
  } catch (err) {
    showToast('Error: ' + err.message, true);
  }
}

// ──────────────────────────────────────────
// HTML ESCAPE
// ──────────────────────────────────────────
function escHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// ──────────────────────────────────────────
// PROJECTS (modal-based create/edit)
// ──────────────────────────────────────────
let projectsData = [];

function populateProjects(data) {
  projectsData = data || [];
  renderProjectList();
}

function renderProjectList() {
  const list = document.getElementById('projects-list');
  list.innerHTML = '';
  projectsData.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'project-list-item';
    div.dataset.index = i;
    const statusClass = (p.status || '').toLowerCase() === 'completed' ? 'completed' : 'ongoing';
    div.innerHTML = `
      <span class="drag-handle"><i class="bi bi-grip-vertical"></i></span>
      <div class="proj-info">
        <div class="proj-title">${escHtml(p.title || 'Untitled')}</div>
        <div class="proj-desc">${escHtml(p.description || '')}</div>
      </div>
      <span class="proj-status ${statusClass}">${escHtml(p.status || 'Ongoing')}</span>
      <div class="proj-actions">
        <button class="btn btn-outline-light" data-action="editProject" data-index="${i}" title="Edit"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-outline-danger" data-action="deleteProject" data-index="${i}" title="Delete"><i class="bi bi-trash"></i></button>
      </div>`;
    list.appendChild(div);
  });
  // Re-init sortable for the new items
  initSortable();
}

function collectProjects() {
  return projectsData;
}

// Persist projects to the server
async function persistProjects() {
  try {
    await apiCall('/api/admin/portfolio/projects', 'PUT', projectsData);
    showToast('Projects saved successfully!');
  } catch (err) {
    showToast('Error saving projects: ' + err.message, true);
  }
}

function openProjectEditor(index) {
  const isEdit = index >= 0 && index < projectsData.length;
  const d = isEdit ? projectsData[index] : {};

  document.getElementById('projectEditorModalLabel').innerHTML = isEdit
    ? '<i class="bi bi-pencil"></i> Edit Project'
    : '<i class="bi bi-plus-lg"></i> New Project';
  document.getElementById('pe-id').value = d.id || '';
  document.getElementById('pe-index').value = index;
  document.getElementById('pe-title').value = d.title || '';
  document.getElementById('pe-category').value = d.category || '';
  document.getElementById('pe-status').value = d.status || 'Completed';
  document.getElementById('pe-startDate').value = d.startDate || '';
  document.getElementById('pe-endDate').value = d.endDate || '';
  document.getElementById('pe-description').value = d.description || '';
  document.getElementById('pe-fullDescription').value = d.fullDescription || '';
  document.getElementById('pe-technologies').value = (d.technologies || []).join(', ');
  document.getElementById('pe-image').value = d.image || '';
  document.getElementById('pe-liveUrl').value = d.liveUrl || '';
  document.getElementById('pe-repoUrl').value = d.repoUrl || '';
  document.getElementById('pe-highlights').value = (d.highlights || []).join('\n');
  document.getElementById('pe-client').value = d.client || '';

  const modal = new bootstrap.Modal(document.getElementById('projectEditorModal'));
  modal.show();
}

async function saveProjectFromModal() {
  const index = parseInt(document.getElementById('pe-index').value);
  const project = {
    id: document.getElementById('pe-id').value || crypto.randomUUID(),
    title: document.getElementById('pe-title').value,
    category: document.getElementById('pe-category').value,
    status: document.getElementById('pe-status').value,
    startDate: document.getElementById('pe-startDate').value,
    endDate: document.getElementById('pe-endDate').value,
    description: document.getElementById('pe-description').value,
    fullDescription: document.getElementById('pe-fullDescription').value,
    technologies: document.getElementById('pe-technologies').value.split(',').map(t => t.trim()).filter(Boolean),
    image: document.getElementById('pe-image').value,
    liveUrl: document.getElementById('pe-liveUrl').value,
    repoUrl: document.getElementById('pe-repoUrl').value,
    highlights: document.getElementById('pe-highlights').value.split('\n').filter(b => b.trim()),
    client: document.getElementById('pe-client').value,
  };

  if (!project.title) {
    showToast('Project title is required', true);
    return;
  }

  if (index >= 0 && index < projectsData.length) {
    projectsData[index] = project; // update
  } else {
    projectsData.push(project); // create new
  }

  renderProjectList();
  bootstrap.Modal.getInstance(document.getElementById('projectEditorModal')).hide();
  await persistProjects();
}

async function deleteProject(index) {
  if (index < 0 || index >= projectsData.length) return;
  projectsData.splice(index, 1);
  renderProjectList();
  await persistProjects();
}

// Confirm-delete: first click → show confirm, second click → delete
document.addEventListener('click', (e) => {
  const delBtn = e.target.closest('[data-action="deleteProject"]');
  if (!delBtn) return;
  e.stopPropagation();

  if (delBtn.dataset.confirm === 'true') {
    // Second click: actually delete
    deleteProject(parseInt(delBtn.dataset.index));
  } else {
    // First click: show confirmation
    delBtn.dataset.confirm = 'true';
    delBtn.innerHTML = '<i class="bi bi-check-lg"></i> Sure?';
    delBtn.classList.add('btn-danger');
    delBtn.classList.remove('btn-outline-danger');
    // Reset after 3 seconds if not clicked
    setTimeout(() => {
      if (delBtn.isConnected) {
        delBtn.dataset.confirm = 'false';
        delBtn.innerHTML = '<i class="bi bi-trash"></i>';
        delBtn.classList.remove('btn-danger');
        delBtn.classList.add('btn-outline-danger');
      }
    }, 3000);
  }
}, true); // capture phase to intercept before other handlers

// Wire up the modal save button
document.getElementById('pe-save-btn').addEventListener('click', saveProjectFromModal);

// ──────────────────────────────────────────
// SORTABLE (drag & drop reordering)
// ──────────────────────────────────────────
function initSortable() {
  // Destroy any existing instances
  sortableInstances.forEach(s => s.destroy());
  sortableInstances.length = 0;

  document.querySelectorAll('.sortable-list').forEach(list => {
    const instance = new Sortable(list, {
      handle: '.drag-handle',
      animation: 200,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',
      onEnd: function (evt) {
        // If this is the projects list, sync the projectsData array
        if (list.id === 'projects-list') {
          const items = list.querySelectorAll('.project-list-item');
          const reordered = [];
          items.forEach(item => {
            const idx = parseInt(item.dataset.index);
            if (projectsData[idx]) reordered.push(projectsData[idx]);
          });
          projectsData = reordered;
          // Update data-index attributes to match new order
          items.forEach((item, i) => { item.dataset.index = i; });
          // Update edit/delete button indices
          items.forEach((item, i) => {
            item.querySelectorAll('[data-index]').forEach(btn => { btn.dataset.index = i; });
          });
          persistProjects();
        }
      },
    });
    sortableInstances.push(instance);
  });
}

// ──────────────────────────────────────────
// INIT
// ──────────────────────────────────────────
checkAuth();
