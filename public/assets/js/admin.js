/**
 * Portfolio Admin Panel — Frontend Logic
 * Handles auth, data loading, form editors, and save operations.
 * All event handling uses addEventListener (no inline handlers) for CSP compliance.
 */

// ──────────────────────────────────────────
// STATE
// ──────────────────────────────────────────
let currentData = {};

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
    const sections = ['profile', 'skills', 'interests', 'resume', 'contact'];
    const results = await Promise.all(sections.map(s => apiCall(`/api/portfolio/${s}`, 'GET')));
    sections.forEach((s, i) => currentData[s] = results[i]);
    populateProfile(currentData.profile);
    populateSkills(currentData.skills);
    populateInterests(currentData.interests);
    populateResume(currentData.resume);
    populateContact(currentData.contact);
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
    <button class="btn btn-outline-danger remove-btn"><i class="bi bi-x"></i></button>
    <input type="email" class="form-control" data-field="address" value="${escHtml(address || '')}" placeholder="email@example.com">`;
  list.appendChild(div);
}

function addPhone(number, tel) {
  const list = document.getElementById('c-phones-list');
  const div = document.createElement('div');
  div.className = 'dynamic-item';
  div.innerHTML = `
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
// INIT
// ──────────────────────────────────────────
checkAuth();
