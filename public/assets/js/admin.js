/**
 * Portfolio Admin Panel — Frontend Logic
 * Handles auth, data loading, form editors, and save operations.
 * All event handling uses addEventListener (no inline handlers) for CSP compliance.
 */

// ──────────────────────────────────────────
// STATE
// ──────────────────────────────────────────
let currentData = {};
let currentSettings = {};
let currentSite = {};
let subscriptionsData = {
  settings: {},
  subscriptions: [],
  reminderHistory: [],
  summary: {},
};
const sortableInstances = [];
const siteSectionOrder = ['about', 'skills', 'interests', 'testimonials', 'resume', 'projects', 'contact'];
let csrfToken = '';
let dataLoaded = false;
let activeSection = 'overview';
let activeSettingsTab = 'site';
const versions = {};
const savedAt = {};
const savedSnapshots = {};
const savedRecords = {};
const pendingSaves = new Set();
const dirtyResources = new Set();
const publicSections = ['profile', 'skills', 'interests', 'resume', 'contact', 'projects'];

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
  const resource = resourceFromUrl(url);
  const opts = { method, headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken }, signal: AbortSignal.timeout(30000) };
  if (method === 'PUT' && versions[resource]) opts.headers['If-Match'] = versions[resource];
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await readResponse(res);
  if (!res.ok) {
    if (res.status === 401 && url !== '/api/admin/login') showLogin();
    throw Object.assign(new Error(data.error || `Request failed (${res.status}).`), { status: res.status, fields: data.fields, code: data.code });
  }
  if (data.csrfToken) csrfToken = data.csrfToken;
  if (resource && res.headers.get('x-data-version')) {
    versions[resource] = res.headers.get('x-data-version');
    savedAt[resource] = res.headers.get('x-saved-at');
  }
  return data;
}

async function readResponse(res) {
  const endpoint = new URL(res.url || location.href).pathname;
  const contentType = res.headers.get('content-type') || 'unknown content type';
  if (!contentType.toLowerCase().includes('application/json')) {
    const hint = res.status === 404
      ? 'Confirm that the latest Node.js backend is deployed and restarted.'
      : 'Check the Node.js application log and hosting proxy.';
    throw Object.assign(new Error(`${endpoint} returned HTTP ${res.status} (${contentType}) instead of JSON. ${hint}`), {
      status: res.status, endpoint, code: 'UNEXPECTED_RESPONSE',
    });
  }
  try {
    return await res.json();
  } catch {
    throw Object.assign(new Error(`${endpoint} returned invalid JSON (HTTP ${res.status}). Check the Node.js application log.`), {
      status: res.status, endpoint, code: 'INVALID_JSON',
    });
  }
}

function resourceFromUrl(url) {
  return url.match(/^\/api\/admin\/(?:portfolio\/)?(profile|skills|interests|resume|contact|projects|settings|site|subscriptions)$/)?.[1];
}

async function uploadImage(file, type) {
  if (!file) throw new Error('Choose an image file first');
  if (!file.type || !file.type.startsWith('image/')) {
    throw new Error('Only image files can be uploaded');
  }
  if (file.size > 8 * 1024 * 1024) throw new Error('Images must be under 8 MB.');

  const res = await fetch(`/api/admin/uploads/${type}`, {
    method: 'POST',
    headers: { 'Content-Type': file.type, 'X-CSRF-Token': csrfToken },
    body: file,
  });
  const data = await readResponse(res);
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data.path;
}

function setImagePreview(previewId, imagePath) {
  const preview = document.getElementById(previewId);
  if (!preview) return;
  if (safeImagePath(imagePath)) {
    preview.src = safeImagePath(imagePath);
    preview.classList.add('visible');
  } else {
    preview.removeAttribute('src');
    preview.classList.remove('visible');
  }
}

// ──────────────────────────────────────────
// AUTH
// ──────────────────────────────────────────
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';
  const button = e.target.querySelector('button[type=submit]');
  button.disabled = true;
  try {
    if (!csrfToken) await apiCall('/api/admin/check', 'GET');
    await apiCall('/api/admin/login', 'POST', {
      username: document.getElementById('login-username').value,
      password: document.getElementById('login-password').value,
    });
    document.getElementById('login-password').value = '';
    await showDashboard();
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  } finally { button.disabled = false; }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  if (anyDirty() && !await confirmAction('Sign out?', 'Unsaved changes will be discarded.', 'Sign out')) return;
  try {
    await apiCall('/api/admin/logout', 'POST');
    [...publicSections, 'site'].forEach(clearStoredDraft);
    dataLoaded = false;
    Object.keys(savedSnapshots).forEach(key => delete savedSnapshots[key]);
    showLogin();
    await apiCall('/api/admin/check', 'GET');
  } catch (error) { showToast(error.message, true); }
});

function showLogin() {
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close());
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
}

async function checkAuth() {
  try {
    const res = await apiCall('/api/admin/check', 'GET');
    if (res.authenticated) await showDashboard();
  } catch (e) { /* not logged in */ }
}

async function showDashboard() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('dashboard').style.display = 'block';
  if (!dataLoaded) await loadAllData();
}

// ──────────────────────────────────────────
// SIDEBAR NAV
// ──────────────────────────────────────────
document.querySelectorAll('.sidebar-nav a').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo(link.dataset.section);
  });
});

// ──────────────────────────────────────────
// EVENT DELEGATION (replaces all inline onclick/oninput)
// ──────────────────────────────────────────
document.addEventListener('click', async (e) => {
  // Remove dynamic item buttons
  const removeBtn = e.target.closest('.remove-btn');
  if (removeBtn) {
    if (!await confirmAction('Remove this entry?', 'The entry will be removed from your draft.', 'Remove')) return;
    removeBtn.closest('.dynamic-item').remove();
    trackChanges();
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
    case 'saveSettings': saveSettings(); break;
    case 'saveSite': saveSite(); break;
    case 'changePassword': changePassword(); break;
    case 'uploadSettingImage': uploadSettingImage(actionBtn); break;
    case 'uploadProjectImage': uploadProjectImage(); break;
    case 'createSubscription': openSubscriptionEditor(-1); break;
    case 'editSubscription': openSubscriptionEditor(parseInt(actionBtn.dataset.index)); break;
    case 'deleteSubscription': deleteSubscription(parseInt(actionBtn.dataset.index)); break;
    case 'saveSubscriptions': saveSubscriptions(); break;
    case 'addSubscriptionReminder': addSubscriptionReminder(); break;
    case 'runSubscriptionCheck': runSubscriptionCheck(); break;
    case 'sendSubscriptionTest': sendSubscriptionTest(); break;
    case 'previewSubscriptionCheck': previewSubscriptionCheck(); break;
  }
  queueMicrotask(() => { enhanceFields(); trackChanges(); });
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
  if (e.target.id === 's-bg-image') {
    setImagePreview('s-bg-preview', e.target.value);
  }
  if (e.target.id === 's-profile-image') {
    setImagePreview('s-profile-preview', e.target.value);
  }
  if (e.target.id === 'pe-image') {
    setImagePreview('pe-image-preview', e.target.value);
  }
  if (e.target.id === 'sub-search' || e.target.id === 'sub-status-filter') {
    renderSubscriptionsList();
  }
});

// ──────────────────────────────────────────
// LOAD DATA
// ──────────────────────────────────────────
async function loadAllData() {
  try {
    const sections = ['profile', 'skills', 'interests', 'resume', 'contact', 'projects'];
    const results = await Promise.all([
      ...sections.map(s => apiCall(`/api/admin/portfolio/${s}`, 'GET')),
      apiCall('/api/admin/settings', 'GET'),
      apiCall('/api/admin/site', 'GET'),
      apiCall('/api/admin/subscriptions', 'GET'),
    ]);
    sections.forEach((s, i) => currentData[s] = results[i]);
    currentSettings = results[sections.length];
    currentSite = results[sections.length + 1];
    subscriptionsData = results[sections.length + 2];
    populateProfile(currentData.profile);
    populateSkills(currentData.skills);
    populateInterests(currentData.interests);
    populateResume(currentData.resume);
    populateContact(currentData.contact);
    populateProjects(currentData.projects);
    populateSettings(currentSettings);
    populateSite(currentSite);
    populateSubscriptions(subscriptionsData);
    initSortable();
    dataLoaded = true;
    publicSections.forEach(section => savedRecords[section] = structuredClone(currentData[section]));
    savedRecords.settings = structuredClone(currentSettings);
    savedRecords.site = structuredClone(currentSite);
    savedRecords.subscriptions = structuredClone(subscriptionsData);
    [...publicSections, 'settings', 'site', 'subscriptions'].forEach(section => savedSnapshots[section] = JSON.stringify(collectResource(section)));
    enhanceFields();
    trackChanges();
    await loadOverview().catch(error => showToast(error.message, true));
    navigateTo(location.hash.slice(1) || 'overview', false);
  } catch (err) {
    showErrors(new Error('Error loading data: ' + err.message), 'content');
    const retry = document.createElement('button'); retry.className = 'btn btn-outline-accent mt-2'; retry.textContent = 'Retry loading';
    retry.addEventListener('click', loadAllData); document.getElementById('workspace-errors').appendChild(retry);
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
// SUBSCRIPTIONS
// ──────────────────────────────────────────
function populateSubscriptions(data) {
  subscriptionsData = data || { settings: {}, subscriptions: [], reminderHistory: [], summary: {} };
  const settings = subscriptionsData.settings || {};

  document.getElementById('sub-recipient').value = settings.recipientEmail || '';
  document.getElementById('sub-timezone').value = settings.timezone || 'Africa/Kampala';
  document.getElementById('sub-default-time').value = settings.defaultReminderTime || '09:00';
  document.getElementById('sub-enabled').checked = settings.enabled !== false;
  document.getElementById('sub-digest').checked = settings.digest !== false;

  renderSubscriptionMetrics();
  renderSubscriptionsList();
}

function renderSubscriptionMetrics() {
  const rows = (subscriptionsData.subscriptions || []).map(subscriptionView);
  const summary = { total: rows.length, active: rows.filter(item => item.status === 'active').length,
    due7: rows.filter(item => item.status === 'active' && item.daysLeft >= 0 && item.daysLeft <= 7).length,
    due30: rows.filter(item => item.status === 'active' && item.daysLeft >= 0 && item.daysLeft <= 30).length,
    expired: rows.filter(item => item.computedStatus === 'expired').length };
  document.getElementById('sub-metric-total').textContent = summary.total || 0;
  document.getElementById('sub-metric-active').textContent = summary.active || 0;
  document.getElementById('sub-metric-due7').textContent = summary.due7 || 0;
  document.getElementById('sub-metric-due30').textContent = summary.due30 || 0;
  document.getElementById('sub-metric-expired').textContent = summary.expired || 0;
}

function subscriptionView(item) {
  const date = subscriptionsData.now?.date || new Date().toISOString().slice(0, 10);
  const daysLeft = Math.round((Date.parse(item.renewalDate) - Date.parse(date)) / 86400000);
  const computedStatus = item.status !== 'active' ? item.status : daysLeft < 0 ? 'expired' : daysLeft <= 7 ? 'due-week' : daysLeft <= 30 ? 'due-soon' : 'active';
  return { ...item, daysLeft, computedStatus };
}

function renderSubscriptionsList() {
  const list = document.getElementById('subscriptions-list');
  if (!list) return;
  renderSubscriptionMetrics();
  const search = (document.getElementById('sub-search')?.value || '').toLowerCase().trim();
  const statusFilter = document.getElementById('sub-status-filter')?.value || '';
  const subscriptions = subscriptionsData.subscriptions || [];
  list.innerHTML = '';

  const filtered = subscriptions
    .map((subscription, index) => ({ subscription: subscriptionView(subscription), index }))
    .filter(({ subscription }) => {
      const status = subscription.computedStatus || subscription.status || 'active';
      const statusMatch = !statusFilter || status === statusFilter || subscription.status === statusFilter;
      const text = [
        subscription.name,
        subscription.category,
        subscription.provider,
        subscription.client,
        subscription.accountEmail,
        subscription.renewalDate,
      ].join(' ').toLowerCase();
      return statusMatch && (!search || text.includes(search));
    })
    .sort((a, b) => {
      const da = a.subscription.renewalDate || '9999-99-99';
      const db = b.subscription.renewalDate || '9999-99-99';
      return da.localeCompare(db);
    });

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'setting-row';
    empty.textContent = subscriptions.length ? 'No subscriptions match the current filters.' : 'No subscriptions yet.';
    list.appendChild(empty);
    return;
  }

  filtered.forEach(({ subscription, index }) => {
    const status = subscription.computedStatus || subscription.status || 'active';
    const days = typeof subscription.daysLeft === 'number' ? subscription.daysLeft : '';
    const meta = [
      subscription.provider || 'No provider',
      subscription.category || 'No category',
      subscription.client ? `Client: ${subscription.client}` : '',
      subscription.renewalDate ? `Renews: ${subscription.renewalDate}` : '',
      days !== '' ? `${days} day${days === 1 ? '' : 's'} left` : '',
      subscription.cost ? `${subscription.currency || ''} ${subscription.cost}` : '',
    ].filter(Boolean).join(' | ');
    const div = document.createElement('div');
    div.className = 'subscription-list-item';
    div.innerHTML = `
      <div>
        <div class="subscription-title">${escHtml(subscription.name || 'Untitled subscription')}</div>
        <div class="subscription-meta">${escHtml(meta)}</div>
      </div>
      <span class="subscription-status ${escHtml(status)}">${escHtml(subscriptionStatusLabel(status))}</span>
      <div class="subscription-actions">
        <button class="btn btn-outline-light" data-action="editSubscription" data-index="${index}" title="Edit"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-outline-danger" data-action="deleteSubscription" data-index="${index}" title="Delete"><i class="bi bi-trash"></i></button>
      </div>`;
    list.appendChild(div);
  });
  enhanceFields();
}

function subscriptionStatusLabel(status) {
  const labels = {
    active: 'Active',
    'due-soon': 'Due Soon',
    'due-week': 'Due This Week',
    expired: 'Expired',
    paused: 'Paused',
    cancelled: 'Cancelled',
    archived: 'Archived',
    unknown: 'Unknown',
  };
  return labels[status] || status;
}

function collectSubscriptionsPayload() {
  return {
    settings: {
      enabled: document.getElementById('sub-enabled').checked,
      recipientEmail: document.getElementById('sub-recipient').value,
      timezone: document.getElementById('sub-timezone').value || 'Africa/Kampala',
      defaultReminderTime: document.getElementById('sub-default-time').value || '09:00',
      digest: document.getElementById('sub-digest').checked,
    },
    subscriptions: (subscriptionsData.subscriptions || []).map(stripSubscriptionComputedFields),
  };
}

function stripSubscriptionComputedFields(subscription) {
  const copy = { ...subscription };
  delete copy.daysLeft;
  delete copy.computedStatus;
  return copy;
}

async function saveSubscriptions(showMessage = true) {
  return saveResource('subscriptions', showMessage);
}

function openSubscriptionEditor(index) {
  const isEdit = index >= 0 && index < (subscriptionsData.subscriptions || []).length;
  const d = isEdit ? subscriptionsData.subscriptions[index] : {
    status: 'active',
    billingCycle: 'yearly',
    currency: 'USD',
    reminders: [
      { offsetDays: 60, time: subscriptionsData.settings?.defaultReminderTime || '09:00', enabled: true },
      { offsetDays: 30, time: subscriptionsData.settings?.defaultReminderTime || '09:00', enabled: true },
      { offsetDays: 14, time: subscriptionsData.settings?.defaultReminderTime || '09:00', enabled: true },
      { offsetDays: 7, time: subscriptionsData.settings?.defaultReminderTime || '09:00', enabled: true },
      { offsetDays: 1, time: subscriptionsData.settings?.defaultReminderTime || '09:00', enabled: true },
    ],
  };

  document.getElementById('subscriptionEditorModalLabel').innerHTML = isEdit
    ? '<i class="bi bi-pencil"></i> Edit Subscription'
    : '<i class="bi bi-plus-lg"></i> New Subscription';
  document.getElementById('se-id').value = d.id || '';
  document.getElementById('se-index').value = index;
  document.getElementById('se-name').value = d.name || '';
  document.getElementById('se-category').value = d.category || '';
  document.getElementById('se-provider').value = d.provider || '';
  document.getElementById('se-client').value = d.client || '';
  document.getElementById('se-account-email').value = d.accountEmail || '';
  document.getElementById('se-status').value = d.status || 'active';
  document.getElementById('se-renewal-date').value = d.renewalDate || '';
  document.getElementById('se-billing-cycle').value = d.billingCycle || 'yearly';
  document.getElementById('se-cost').value = d.cost || '';
  document.getElementById('se-currency').value = d.currency || 'USD';
  document.getElementById('se-auto-renew').checked = !!d.autoRenew;
  document.getElementById('se-service-url').value = d.serviceUrl || '';
  document.getElementById('se-renewal-url').value = d.renewalUrl || '';
  document.getElementById('se-notes').value = d.notes || '';

  const reminderList = document.getElementById('se-reminders-list');
  reminderList.innerHTML = '';
  (d.reminders || []).forEach(reminder => addSubscriptionReminder(reminder));
  if (!reminderList.children.length) addSubscriptionReminder();

  const modal = new bootstrap.Modal(document.getElementById('subscriptionEditorModal'));
  rememberModal('subscriptionEditorModal');
  modal.show();
}

function addSubscriptionReminder(reminder) {
  const list = document.getElementById('se-reminders-list');
  if (!list) return;
  const data = reminder || {
    offsetDays: 30,
    time: subscriptionsData.settings?.defaultReminderTime || '09:00',
    enabled: true,
  };
  const div = document.createElement('div');
  div.className = 'dynamic-item reminder-row';
  div.innerHTML = `
    <button class="btn btn-outline-danger remove-btn" type="button"><i class="bi bi-x"></i></button>
    <div class="row g-2 align-items-end">
      <div class="col-md-4">
        <label class="form-label">Days Before Renewal</label>
        <input type="number" min="0" max="3650" class="form-control" data-field="offsetDays" value="${escHtml(String(data.offsetDays ?? 30))}">
      </div>
      <div class="col-md-4">
        <label class="form-label">Reminder Time</label>
        <input type="time" class="form-control" data-field="time" value="${escHtml(data.time || subscriptionsData.settings?.defaultReminderTime || '09:00')}">
      </div>
      <div class="col-md-4">
        <div class="form-check">
          <input class="form-check-input" type="checkbox" data-field="enabled" ${data.enabled !== false ? 'checked' : ''}>
          <label class="form-check-label">Enabled</label>
        </div>
      </div>
    </div>`;
  list.appendChild(div);
}

function collectSubscriptionFromModal() {
  const reminders = Array.from(document.querySelectorAll('#se-reminders-list .reminder-row')).map(row => ({
    offsetDays: parseInt(row.querySelector('[data-field="offsetDays"]').value, 10) || 0,
    time: row.querySelector('[data-field="time"]').value || subscriptionsData.settings?.defaultReminderTime || '09:00',
    enabled: row.querySelector('[data-field="enabled"]').checked,
  }));

  return {
    id: document.getElementById('se-id').value || crypto.randomUUID(),
    name: document.getElementById('se-name').value.trim(),
    category: document.getElementById('se-category').value.trim(),
    provider: document.getElementById('se-provider').value.trim(),
    client: document.getElementById('se-client').value.trim(),
    accountEmail: document.getElementById('se-account-email').value.trim(),
    status: document.getElementById('se-status').value,
    renewalDate: document.getElementById('se-renewal-date').value,
    billingCycle: document.getElementById('se-billing-cycle').value,
    cost: parseFloat(document.getElementById('se-cost').value) || 0,
    currency: document.getElementById('se-currency').value.trim() || 'USD',
    autoRenew: document.getElementById('se-auto-renew').checked,
    serviceUrl: document.getElementById('se-service-url').value.trim(),
    renewalUrl: document.getElementById('se-renewal-url').value.trim(),
    notes: document.getElementById('se-notes').value.trim(),
    reminders,
  };
}

async function saveSubscriptionFromModal() {
  const index = parseInt(document.getElementById('se-index').value, 10);
  const subscription = collectSubscriptionFromModal();
  if (!subscription.name) {
    showToast('Subscription name is required', true);
    return;
  }
  if (!subscription.renewalDate) {
    showToast('Renewal date is required', true);
    return;
  }

  const list = subscriptionsData.subscriptions || [];
  if (index >= 0 && index < list.length) {
    list[index] = { ...stripSubscriptionComputedFields(list[index]), ...subscription };
  } else {
    list.push(subscription);
  }
  subscriptionsData.subscriptions = list;

  document.getElementById('subscriptionEditorModal').dataset.committed = 'true';
  bootstrap.Modal.getInstance(document.getElementById('subscriptionEditorModal')).hide();
  renderSubscriptionsList();
  trackChanges();
  showToast('Subscription added to draft.');
}

async function deleteSubscription(index) {
  const list = subscriptionsData.subscriptions || [];
  if (index < 0 || index >= list.length) return;
  if (!await confirmAction('Delete subscription?', `${list[index].name || 'This subscription'} will be removed when you save changes.`, 'Delete from draft')) return;
  list.splice(index, 1);
  subscriptionsData.subscriptions = list;
  renderSubscriptionsList();
  trackChanges();
}

async function runSubscriptionCheck() {
  try {
    if (isDirty('subscriptions')) return showToast('Save your subscription changes first.', true);
    if (!await confirmAction('Send due reminders?', 'Emails will be sent to your saved reminder recipient.', 'Send reminders')) return;
    const result = await apiCall('/api/admin/subscriptions/reminders/run', 'POST', { dryRun: false });
    const message = result.sent
      ? result.message
      : `${result.message} (${result.count || 0} due)`;
    showToast(message);
    const data = await apiCall('/api/admin/subscriptions', 'GET');
    populateSubscriptions(data);
    savedRecords.subscriptions = structuredClone(data);
    savedSnapshots.subscriptions = JSON.stringify(collectSubscriptionsPayload());
    trackChanges();
    await loadOverview();
  } catch (err) {
    showToast('Reminder check failed: ' + err.message, true);
  }
}

async function sendSubscriptionTest() {
  try {
    const recipientEmail = document.getElementById('sub-recipient').value;
    if (!await confirmAction('Send test email?', `A test reminder will be sent to ${recipientEmail || 'your saved recipient'}.`, 'Send test')) return;
    const result = await apiCall('/api/admin/subscriptions/test-email', 'POST', { recipientEmail });
    showToast(result.message || 'Test reminder email sent.');
  } catch (err) {
    showToast('Test email failed: ' + err.message, true);
  }
}

// ──────────────────────────────────────────
// SETTINGS + PUBLIC SITE CONFIG
// ──────────────────────────────────────────
function populateSettings(settings) {
  const email = settings.email || {};
  const images = settings.images || {};
  const analytics = settings.analytics || {};

  document.getElementById('s-email-host').value = email.host || '';
  document.getElementById('s-email-port').value = email.port || '';
  document.getElementById('s-email-secure').value = String(email.secure !== false);
  document.getElementById('s-email-user').value = email.user || '';
  document.getElementById('s-email-password').value = '';
  document.getElementById('s-email-password-state').textContent = email.passwordSet
    ? 'A password is configured. Leave blank to keep it.'
    : 'No SMTP password is configured.';
  document.getElementById('s-email-from').value = email.from || '';
  document.getElementById('s-email-to').value = email.to || '';

  document.getElementById('s-bg-image').value = images.backgroundImage || '';
  document.getElementById('s-profile-image').value = images.profileImage || '';
  document.getElementById('s-ga-id').value = analytics.googleMeasurementId || '';
  setImagePreview('s-bg-preview', images.backgroundImage || '');
  setImagePreview('s-profile-preview', images.profileImage || '');
}

function collectSettings() {
  return {
    email: {
      host: document.getElementById('s-email-host').value,
      port: document.getElementById('s-email-port').value,
      secure: document.getElementById('s-email-secure').value === 'true',
      user: document.getElementById('s-email-user').value,
      password: document.getElementById('s-email-password').value,
      from: document.getElementById('s-email-from').value,
      to: document.getElementById('s-email-to').value,
    },
    images: {
      backgroundImage: document.getElementById('s-bg-image').value,
      profileImage: document.getElementById('s-profile-image').value,
    },
    analytics: {
      googleMeasurementId: document.getElementById('s-ga-id').value,
    },
  };
}

async function saveSettings() {
  return saveResource('settings');
}

function populateSite(site) {
  currentSite = site || {};
  renderSiteNavigation(currentSite.navigation || []);
  renderSiteSections(currentSite.sections || {});

  const contactBoxes = currentSite.contactBoxes || {};
  const contactForm = currentSite.contactForm || {};
  const projects = currentSite.projects || {};
  const testimonials = currentSite.testimonials || {};

  document.getElementById('site-contact-address-title').value = contactBoxes.addressTitle || '';
  document.getElementById('site-contact-social-title').value = contactBoxes.socialTitle || '';
  document.getElementById('site-contact-email-title').value = contactBoxes.emailTitle || '';
  document.getElementById('site-contact-phone-title').value = contactBoxes.phoneTitle || '';
  document.getElementById('site-form-name').value = contactForm.namePlaceholder || '';
  document.getElementById('site-form-email').value = contactForm.emailPlaceholder || '';
  document.getElementById('site-form-subject').value = contactForm.subjectPlaceholder || '';
  document.getElementById('site-form-message').value = contactForm.messagePlaceholder || '';
  document.getElementById('site-form-submit').value = contactForm.submitLabel || '';
  document.getElementById('site-form-sending').value = contactForm.sendingLabel || '';
  document.getElementById('site-form-loading').value = contactForm.loadingLabel || '';
  document.getElementById('site-form-sent').value = contactForm.sentMessage || '';
  document.getElementById('site-form-success-fallback').value = contactForm.successFallback || '';
  document.getElementById('site-form-error-fallback').value = contactForm.errorFallback || '';
  document.getElementById('site-captcha-title').value = contactForm.captchaTitle || '';
  document.getElementById('site-captcha-intro').value = contactForm.captchaIntro || '';
  document.getElementById('site-captcha-question').value = contactForm.captchaQuestion || '';
  document.getElementById('site-captcha-error').value = contactForm.captchaIncorrectMessage || '';
  document.getElementById('site-captcha-close').value = contactForm.captchaCloseLabel || '';
  document.getElementById('site-captcha-submit').value = contactForm.captchaSubmitLabel || '';

  document.getElementById('site-project-all').value = projects.allFilterLabel || '';
  document.getElementById('site-project-view').value = projects.viewDetailsLabel || '';
  document.getElementById('site-project-tech').value = projects.technologiesTitle || '';
  document.getElementById('site-project-highlights').value = projects.highlightsTitle || '';
  document.getElementById('site-project-live').value = projects.liveDemoLabel || '';
  document.getElementById('site-project-source').value = projects.sourceCodeLabel || '';

  document.getElementById('site-testimonials-source').value = testimonials.sourceUrl || '';
  document.getElementById('site-testimonials-placeholder').value = testimonials.placeholderImage || '';
}

function renderSiteNavigation(navigation) {
  const list = document.getElementById('site-nav-list');
  list.innerHTML = '';
  navigation.forEach(item => {
    const div = document.createElement('div');
    div.className = 'setting-row site-nav-item';
    div.dataset.id = item.id || '';
    div.dataset.href = item.href || '#';
    div.innerHTML = `
      <div class="row g-3 align-items-end">
        <div class="col-md-2">
          <div class="form-check">
            <input class="form-check-input" type="checkbox" data-field="enabled" ${item.enabled !== false ? 'checked' : ''}>
            <label class="form-check-label form-label">Enabled</label>
          </div>
        </div>
        <div class="col-md-4">
          <label class="form-label">Nav Label</label>
          <input type="text" class="form-control" data-field="label" value="${escHtml(item.label || '')}">
        </div>
        <div class="col-md-6">
          <label class="form-label">Target</label>
          <input type="text" class="form-control" value="${escHtml(item.href || '')}" disabled>
        </div>
      </div>`;
    list.appendChild(div);
  });
}

function renderSiteSections(sections) {
  const list = document.getElementById('site-sections-list');
  list.innerHTML = '';
  siteSectionOrder.forEach(key => {
    const section = sections[key] || {};
    const div = document.createElement('div');
    div.className = 'setting-row site-section-item';
    div.dataset.key = key;
    div.innerHTML = `
      <div class="row g-3 align-items-end">
        <div class="col-md-2">
          <div class="form-check">
            <input class="form-check-input" type="checkbox" data-field="enabled" ${section.enabled !== false ? 'checked' : ''}>
            <label class="form-check-label form-label">Enabled</label>
          </div>
        </div>
        <div class="col-md-4">
          <label class="form-label">${escHtml(key)} Title</label>
          <input type="text" class="form-control" data-field="title" value="${escHtml(section.title || '')}">
        </div>
        <div class="col-md-6">
          <label class="form-label">Subtitle</label>
          <input type="text" class="form-control" data-field="subtitle" value="${escHtml(section.subtitle || '')}">
        </div>
      </div>`;
    list.appendChild(div);
  });
}

function collectSite() {
  const navigation = Array.from(document.querySelectorAll('#site-nav-list .site-nav-item')).map(item => ({
    id: item.dataset.id,
    href: item.dataset.href,
    enabled: item.querySelector('[data-field="enabled"]').checked,
    label: item.querySelector('[data-field="label"]').value,
  }));

  const sections = {};
  document.querySelectorAll('#site-sections-list .site-section-item').forEach(item => {
    sections[item.dataset.key] = {
      enabled: item.querySelector('[data-field="enabled"]').checked,
      title: item.querySelector('[data-field="title"]').value,
      subtitle: item.querySelector('[data-field="subtitle"]').value,
    };
  });

  return {
    navigation,
    sections,
    contactBoxes: {
      addressTitle: document.getElementById('site-contact-address-title').value,
      socialTitle: document.getElementById('site-contact-social-title').value,
      emailTitle: document.getElementById('site-contact-email-title').value,
      phoneTitle: document.getElementById('site-contact-phone-title').value,
    },
    contactForm: {
      namePlaceholder: document.getElementById('site-form-name').value,
      emailPlaceholder: document.getElementById('site-form-email').value,
      subjectPlaceholder: document.getElementById('site-form-subject').value,
      messagePlaceholder: document.getElementById('site-form-message').value,
      submitLabel: document.getElementById('site-form-submit').value,
      sendingLabel: document.getElementById('site-form-sending').value,
      loadingLabel: document.getElementById('site-form-loading').value,
      sentMessage: document.getElementById('site-form-sent').value,
      successFallback: document.getElementById('site-form-success-fallback').value,
      errorFallback: document.getElementById('site-form-error-fallback').value,
      captchaTitle: document.getElementById('site-captcha-title').value,
      captchaIntro: document.getElementById('site-captcha-intro').value,
      captchaQuestion: document.getElementById('site-captcha-question').value,
      captchaIncorrectMessage: document.getElementById('site-captcha-error').value,
      captchaCloseLabel: document.getElementById('site-captcha-close').value,
      captchaSubmitLabel: document.getElementById('site-captcha-submit').value,
    },
    projects: {
      allFilterLabel: document.getElementById('site-project-all').value,
      viewDetailsLabel: document.getElementById('site-project-view').value,
      technologiesTitle: document.getElementById('site-project-tech').value,
      highlightsTitle: document.getElementById('site-project-highlights').value,
      liveDemoLabel: document.getElementById('site-project-live').value,
      sourceCodeLabel: document.getElementById('site-project-source').value,
    },
    testimonials: {
      sourceUrl: document.getElementById('site-testimonials-source').value,
      placeholderImage: document.getElementById('site-testimonials-placeholder').value,
    },
  };
}

async function saveSite() {
  return saveResource('site');
}

async function changePassword() {
  const currentPassword = document.getElementById('s-current-password').value;
  const newPassword = document.getElementById('s-new-password').value;
  const confirmPassword = document.getElementById('s-confirm-password').value;

  if (newPassword !== confirmPassword) {
    showToast('New passwords do not match', true);
    return;
  }
  if (newPassword.length < 12) {
    showToast('New password must be at least 12 characters', true);
    return;
  }

  try {
    await apiCall('/api/admin/password', 'POST', { currentPassword, newPassword });
    document.getElementById('s-current-password').value = '';
    document.getElementById('s-new-password').value = '';
    document.getElementById('s-confirm-password').value = '';
    showToast('Password updated successfully!');
  } catch (err) {
    showToast('Error updating password: ' + err.message, true);
  }
}

async function uploadSettingImage(button) {
  const fileInput = document.getElementById(button.dataset.file);
  const targetInput = document.getElementById(button.dataset.target);
  const previewId = button.dataset.preview;
  try {
    const path = await uploadImage(fileInput.files[0], button.dataset.type);
    targetInput.value = path;
    targetInput.dispatchEvent(new Event('input', { bubbles: true }));
    setImagePreview(previewId, path);
    fileInput.value = '';
    showToast('Image uploaded successfully!');
  } catch (err) {
    showToast('Upload error: ' + err.message, true);
  }
}

async function uploadProjectImage() {
  const fileInput = document.getElementById('pe-image-file');
  const targetInput = document.getElementById('pe-image');
  try {
    const path = await uploadImage(fileInput.files[0], 'project');
    targetInput.value = path;
    targetInput.dispatchEvent(new Event('input', { bubbles: true }));
    setImagePreview('pe-image-preview', path);
    fileInput.value = '';
    showToast('Project image uploaded successfully!');
  } catch (err) {
    showToast('Upload error: ' + err.message, true);
  }
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
          <input type="color" class="form-control form-control-color" data-field="color" value="${escHtml(color || '#ffbb2c')}" style="width:50px">
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
  return saveResource(section);
}

// ──────────────────────────────────────────
// HTML ESCAPE
// ──────────────────────────────────────────
function escHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
      ${safeImagePath(p.image) ? `<img class="project-thumb" src="${escHtml(safeImagePath(p.image))}" alt="" loading="lazy">` : '<div class="project-thumb d-flex align-items-center justify-content-center"><i class="bi bi-image"></i></div>'}
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
  filterProjects();
  enhanceFields();
  if (!projectsData.length) list.innerHTML = '<p class="empty-state">No projects yet.</p>';
}

function collectProjects() {
  return projectsData;
}

// Persist projects to the server
async function persistProjects() {
  return saveResource('projects');
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
  document.getElementById('pe-image-file').value = '';
  setImagePreview('pe-image-preview', d.image || '');
  document.getElementById('pe-liveUrl').value = d.liveUrl || '';
  document.getElementById('pe-repoUrl').value = d.repoUrl || '';
  document.getElementById('pe-highlights').value = (d.highlights || []).join('\n');
  document.getElementById('pe-client').value = d.client || '';

  const modal = new bootstrap.Modal(document.getElementById('projectEditorModal'));
  rememberModal('projectEditorModal');
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
    image: document.getElementById('pe-image').value.trim(),
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
  document.getElementById('projectEditorModal').dataset.committed = 'true';
  bootstrap.Modal.getInstance(document.getElementById('projectEditorModal')).hide();
  trackChanges();
  showToast('Project added to draft.');
}

async function deleteProject(index) {
  if (index < 0 || index >= projectsData.length) return;
  if (!await confirmAction('Delete project?', `${projectsData[index].title} will be removed when you publish changes.`, 'Delete from draft')) return;
  projectsData.splice(index, 1);
  renderProjectList();
  trackChanges();
}

// Wire up the modal save button
document.getElementById('se-save-btn').addEventListener('click', saveSubscriptionFromModal);
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
        }
        trackChanges();
      },
    });
    sortableInstances.push(instance);
  });
}

// Workspace state stays alongside the existing editors and their collectors.
function collectResource(section) {
  const collectors = { profile: collectProfile, skills: collectSkills, interests: collectInterests, resume: collectResume, contact: collectContact, projects: collectProjects, settings: collectSettings, site: collectSite, subscriptions: collectSubscriptionsPayload };
  return collectors[section]?.();
}

function populateResource(section, value) {
  const populators = { profile: populateProfile, skills: populateSkills, interests: populateInterests, resume: populateResume, contact: populateContact, projects: populateProjects, settings: populateSettings, site: populateSite, subscriptions: populateSubscriptions };
  if (publicSections.includes(section)) currentData[section] = value;
  if (section === 'settings') currentSettings = value;
  populators[section]?.(value);
  enhanceFields();
  initSortable();
}

function currentResource() {
  if (activeSection === 'settings') return ['site', 'labels'].includes(activeSettingsTab) ? 'site' : ['media', 'email'].includes(activeSettingsTab) ? 'settings' : null;
  return [...publicSections, 'subscriptions'].includes(activeSection) ? activeSection : null;
}

function isDirty(section) {
  return dataLoaded && savedSnapshots[section] !== undefined && savedSnapshots[section] !== JSON.stringify(collectResource(section));
}

function anyDirty() { return Object.keys(savedSnapshots).some(isDirty); }

function draftKey(section) { return `portfolio-draft-v1:${section}`; }
function storedDraft(section) { try { return JSON.parse(sessionStorage.getItem(draftKey(section))); } catch { return null; } }
function clearStoredDraft(section) { try { sessionStorage.removeItem(draftKey(section)); } catch { /* Storage can be disabled. */ } }

function trackChanges() {
  if (!dataLoaded) return;
  for (const section of [...publicSections, 'site']) {
    if (isDirty(section)) {
      dirtyResources.add(section);
      try { sessionStorage.setItem(draftKey(section), JSON.stringify({ data: collectResource(section), version: versions[section], at: new Date().toISOString() })); }
      catch { /* In-memory editing still works when browser storage is full. */ }
    } else if (dirtyResources.has(section)) {
      dirtyResources.delete(section); clearStoredDraft(section);
    }
  }
  document.querySelectorAll('.sidebar-nav a').forEach(link => {
    const sections = link.dataset.section === 'settings' ? ['site', 'settings'] : [link.dataset.section];
    link.classList.toggle('has-changes', sections.some(isDirty));
  });
  updateSaveStatus();
}

function updateSaveStatus() {
  const resource = currentResource();
  document.getElementById('workspace-status').hidden = !resource || !dataLoaded;
  document.getElementById('draft-banner').hidden = true;
  if (!resource || !dataLoaded) return;
  const dirty = isDirty(resource);
  const busy = pendingSaves.has(resource);
  const status = document.getElementById('save-status');
  status.classList.toggle('dirty', dirty);
  status.textContent = busy ? 'Saving...' : dirty ? (storedDraft(resource) ? 'Unpublished draft saved in this tab' : 'Unsaved changes') : `Saved ${formatDate(savedAt[resource])}`;
  document.getElementById('save-current').disabled = !dirty || busy;
  document.getElementById('save-current').querySelector('span').textContent = ['settings', 'subscriptions'].includes(resource) ? 'Save changes' : 'Publish changes';
  document.getElementById('discard-changes').disabled = !dirty || busy;
  document.getElementById('reload-section').disabled = busy;
  const draft = storedDraft(resource);
  if (!dirty && draft && JSON.stringify(draft.data) !== savedSnapshots[resource]) {
    document.getElementById('draft-banner').hidden = false;
    document.getElementById('draft-message').textContent = `Draft available from ${formatDate(draft.at)}${draft.version !== versions[resource] ? ' (published content has changed)' : ''}`;
  }
}

async function saveResource(section, showMessage = true) {
  if (!dataLoaded || pendingSaves.has(section)) return false;
  if (!isDirty(section)) return true;
  pendingSaves.add(section);
  const panel = document.getElementById(`panel-${['settings', 'site'].includes(section) ? 'settings' : section}`);
  panel.inert = true;
  panel.setAttribute('aria-busy', 'true');
  clearErrors();
  updateSaveStatus();
  try {
    const url = publicSections.includes(section) ? `/api/admin/portfolio/${section}` : `/api/admin/${section}`;
    const result = await apiCall(url, 'PUT', collectResource(section));
    const saved = result.data || result.settings || result.site;
    savedRecords[section] = structuredClone(saved);
    populateResource(section, saved);
    savedSnapshots[section] = JSON.stringify(collectResource(section));
    clearStoredDraft(section);
    if (showMessage) showToast(['settings', 'subscriptions'].includes(section) ? 'Changes saved.' : 'Changes published.');
    loadOverview().catch(error => showToast(error.message, true));
    return true;
  } catch (error) {
    showErrors(error, section);
    return false;
  } finally {
    panel.inert = false;
    panel.removeAttribute('aria-busy');
    pendingSaves.delete(section);
    trackChanges();
  }
}

function clearErrors() {
  const errors = document.getElementById('workspace-errors');
  errors.hidden = true;
  errors.replaceChildren();
  document.querySelectorAll('[aria-invalid=true]').forEach(input => input.removeAttribute('aria-invalid'));
}

function showErrors(error, section) {
  const container = document.getElementById('workspace-errors');
  container.hidden = false;
  container.textContent = error.message;
  if (error.fields?.length) {
    const list = document.createElement('ul');
    error.fields.slice(0, 20).forEach(field => {
      const item = document.createElement('li');
      item.textContent = `${field.path || section}: ${field.message}`;
      list.appendChild(item);
      const input = findValidationField(section, field.path);
      if (input) input.setAttribute('aria-invalid', 'true');
    });
    container.appendChild(list);
  }
  container.scrollIntoView({ block: 'center' });
}

function findValidationField(section, fieldPath) {
  const ids = {
    profile: { name: 'p-name', fullName: 'p-fullName', tagline: 'p-tagline', aboutTitle: 'p-aboutTitle', aboutText: 'p-aboutText', profileImage: 'p-profileImage', 'meta.title': 'p-metaTitle', 'meta.description': 'p-metaDesc' },
    settings: { 'email.host': 's-email-host', 'email.port': 's-email-port', 'email.user': 's-email-user', 'email.from': 's-email-from', 'email.to': 's-email-to', 'images.backgroundImage': 's-bg-image', 'images.profileImage': 's-profile-image', 'analytics.googleMeasurementId': 's-ga-id' },
    subscriptions: { 'settings.recipientEmail': 'sub-recipient', 'settings.timezone': 'sub-timezone', 'settings.defaultReminderTime': 'sub-default-time' },
  };
  if (ids[section]?.[fieldPath]) return document.getElementById(ids[section][fieldPath]);
  const parts = fieldPath.split('.');
  const arrays = { 'profile.details': 'p-details-list', 'profile.socialLinks': 'p-social-list', 'contact.emails': 'c-emails-list', 'contact.phones': 'c-phones-list', 'contact.socialLinks': 'c-social-list', skills: 'skills-list', interests: 'interests-list' };
  const collection = /^\d+$/.test(parts[0]) ? section : `${section}.${parts.shift()}`;
  const list = document.getElementById(arrays[collection] || (collection.startsWith('resume.') ? `r-${collection.split('.')[1]}-list` : ''));
  const item = list?.children[Number(parts[0])];
  return item?.querySelector(`[data-field="${CSS.escape(parts[1] || '')}"]`);
}

function formatDate(value) {
  if (!value || Number.isNaN(Date.parse(value))) return 'not yet';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function safeImagePath(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value, location.origin);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

function navigateTo(section, focus = true) {
  if (!document.getElementById(`panel-${section}`)) section = 'overview';
  activeSection = section;
  document.querySelectorAll('.sidebar-nav a').forEach(link => {
    const active = link.dataset.section === section;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  document.querySelectorAll('.section-panel').forEach(panel => panel.classList.toggle('active', panel.id === `panel-${section}`));
  document.getElementById('section-title').textContent = { overview: 'Overview', media: 'Media library', recovery: 'Recovery' }[section] || section[0].toUpperCase() + section.slice(1);
  history.replaceState(null, '', `#${section}`);
  setMenu(false);
  if (focus) document.getElementById('section-title').focus({ preventScroll: true });
  clearErrors();
  updateSaveStatus();
  if (section === 'media') loadMedia().catch(error => showToast(error.message, true));
  if (section === 'recovery') loadRecovery().catch(error => showToast(error.message, true));
  if (section === 'overview' && dataLoaded) loadOverview().catch(error => showToast(error.message, true));
}

function setMenu(open) {
  document.getElementById('admin-navigation').classList.toggle('open', open);
  document.getElementById('sidebar-backdrop').classList.toggle('open', open);
  document.getElementById('menu-toggle').setAttribute('aria-expanded', String(open));
  const mobile = matchMedia('(max-width: 767px)').matches;
  document.getElementById('admin-navigation').inert = mobile && !open;
  document.getElementById('admin-navigation').setAttribute('aria-hidden', String(mobile && !open));
  document.querySelector('.main-content').inert = mobile && open;
  if (open) document.querySelector('.sidebar-nav a.active')?.focus();
}

function confirmAction(title, message, label = 'Confirm') {
  const dialog = document.getElementById('confirm-dialog');
  if (dialog.open) return Promise.resolve(false);
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  document.getElementById('confirm-accept').textContent = label;
  dialog.returnValue = 'cancel';
  dialog.showModal();
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'confirm'), { once: true }));
}

function modalValues(modal) {
  return JSON.stringify(Array.from(modal.querySelectorAll('input:not([type=file]), textarea, select')).map(input => input.type === 'checkbox' ? input.checked : input.value));
}

function rememberModal(id) {
  const modal = document.getElementById(id);
  modal.dataset.baseline = modalValues(modal);
  modal.dataset.committed = 'false';
  enhanceFields();
}

function setupTabs(panel, groups, className, onSelect) {
  const nav = document.createElement('div');
  nav.className = className;
  nav.setAttribute('role', 'tablist');
  nav.setAttribute('aria-label', panel.id === 'panel-settings' ? 'Settings categories' : 'Resume categories');
  panel.prepend(nav);
  for (const [key, group] of Object.entries(groups)) {
    const pane = document.createElement('div');
    pane.id = `${panel.id}-${key}`;
    pane.setAttribute('role', 'tabpanel');
    const button = document.createElement('button');
    button.type = 'button'; button.id = `${pane.id}-tab`; button.textContent = group.label;
    button.setAttribute('role', 'tab'); button.setAttribute('aria-controls', pane.id);
    pane.setAttribute('aria-labelledby', button.id);
    group.ids.forEach(id => { const card = document.getElementById(id)?.closest('.editor-card'); if (card) pane.appendChild(card); });
    panel.appendChild(pane); nav.appendChild(button);
    button.addEventListener('click', () => {
      nav.querySelectorAll('button').forEach(tab => {
        const selected = tab === button;
        tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1;
        document.getElementById(tab.getAttribute('aria-controls')).hidden = !selected;
      });
      onSelect?.(key);
    });
  }
  nav.addEventListener('keydown', event => {
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = [...nav.querySelectorAll('button')];
    const index = tabs.indexOf(document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].click(); tabs[next].focus();
  });
  nav.querySelector('button').click();
}

function setupWorkspace() {
  document.querySelectorAll('[data-action="save"], [data-action="saveSettings"], [data-action="saveSite"], [data-action="saveSubscriptions"]').forEach(button => button.classList.add('legacy-save'));
  setupTabs(document.getElementById('panel-settings'), {
    site: { label: 'Site', ids: ['site-nav-list', 'site-sections-list', 'site-testimonials-source'] },
    media: { label: 'Images', ids: ['s-bg-image'] },
    email: { label: 'Email', ids: ['s-email-host'] },
    security: { label: 'Security', ids: ['s-current-password'] },
    labels: { label: 'Public labels', ids: ['site-project-all', 'site-form-name'] },
    automation: { label: 'Automation', ids: [] },
  }, 'settings-tabs', key => { activeSettingsTab = key; updateSaveStatus(); });
  const analytics = document.getElementById('s-ga-id').closest('.mt-3');
  document.getElementById('panel-settings-media').appendChild(analytics);
  document.getElementById('panel-settings-email').insertAdjacentHTML('beforeend', '<button class="btn btn-outline-accent" id="verify-email"><i class="bi bi-plug"></i> Verify saved connection</button><p id="smtp-status" class="muted mt-3"></p>');
  document.getElementById('panel-settings-security').insertAdjacentHTML('beforeend', '<section class="workspace-section"><h2>Security activity</h2><div id="security-activity"></div></section>');
  document.getElementById('panel-settings-automation').innerHTML = '<section class="workspace-section"><h2>Subscription reminders</h2><div id="automation-status"></div><button class="btn btn-outline-accent mt-3" data-navigate="subscriptions"><i class="bi bi-calendar2-check"></i> Manage reminders</button></section>';
  setupTabs(document.getElementById('panel-resume'), {
    summary: { label: 'Summary', ids: ['r-summaryName', 'r-aoiTitle'] }, experience: { label: 'Experience', ids: ['r-experience-list'] },
    education: { label: 'Education', ids: ['r-education-list'] }, certifications: { label: 'Certifications', ids: ['r-certifications-list'] },
    honors: { label: 'Honors', ids: ['r-honors-list'] }, research: { label: 'Research', ids: ['r-research-list'] },
  }, 'resume-editor-tabs');
  const search = document.createElement('input');
  search.type = 'search'; search.id = 'resume-search'; search.className = 'form-control search-control mb-3'; search.placeholder = 'Search resume entries...'; search.setAttribute('aria-label', 'Search resume entries');
  document.querySelector('.resume-editor-tabs').after(search);
  [...publicSections, 'settings', 'site', 'subscriptions'].forEach(section => {
    const option = document.createElement('option'); option.value = section; option.textContent = section[0].toUpperCase() + section.slice(1); document.getElementById('recovery-filter').appendChild(option);
  });
  for (const id of ['projectEditorModal', 'subscriptionEditorModal']) {
    const modal = document.getElementById(id);
    modal.addEventListener('hide.bs.modal', async event => {
      if (modal.dataset.committed === 'true' || modal.dataset.baseline === modalValues(modal)) return;
      event.preventDefault();
      if (await confirmAction('Discard editor changes?', 'These changes have not been applied to your draft.', 'Discard')) {
        modal.dataset.committed = 'true'; bootstrap.Modal.getInstance(modal).hide();
      }
    });
  }
}

function filterProjects() {
  const query = document.getElementById('project-search').value.toLowerCase().trim();
  document.querySelectorAll('#projects-list .project-list-item').forEach(item => {
    const project = projectsData[Number(item.dataset.index)];
    item.hidden = ![project.title, project.description, project.category, ...(project.technologies || [])].join(' ').toLowerCase().includes(query);
  });
  const sortable = sortableInstances.find(instance => instance.el.id === 'projects-list');
  sortable?.option('disabled', !!query);
}

function filterResume() {
  const query = document.getElementById('resume-search').value.toLowerCase().trim();
  document.querySelectorAll('#panel-resume .dynamic-item').forEach(item => {
    item.hidden = ![...item.querySelectorAll('input,textarea')].some(input => input.value.toLowerCase().includes(query));
  });
  sortableInstances.filter(instance => instance.el.closest('#panel-resume')).forEach(instance => instance.option('disabled', !!query));
}

const iconNames = ['person', 'briefcase', 'code-slash', 'laptop', 'globe', 'github', 'linkedin', 'twitter', 'instagram', 'facebook', 'youtube', 'whatsapp', 'envelope', 'telephone', 'camera', 'music-note', 'book', 'palette', 'lightbulb', 'bar-chart', 'heart', 'cup-hot', 'controller', 'cpu', 'database', 'cloud', 'shield-check', 'mortarboard', 'trophy', 'tools', 'bicycle', 'compass', 'broadcast', 'phone', 'terminal', 'rocket-takeoff'];
let iconTarget;
function renderIconOptions() {
  const query = document.getElementById('icon-search').value.toLowerCase();
  const container = document.getElementById('icon-options'); container.replaceChildren();
  iconNames.filter(name => name.includes(query)).forEach(name => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-outline-accent'; button.title = name; button.setAttribute('aria-label', name); button.innerHTML = `<i class="bi bi-${name}" aria-hidden="true"></i>`;
    button.addEventListener('click', () => { iconTarget.value = `bi bi-${name}`; iconTarget.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('icon-dialog').close(); });
    container.appendChild(button);
  });
}

let fieldId = 0;
function enhanceFields() {
  document.querySelectorAll('i').forEach(icon => icon.setAttribute('aria-hidden', 'true'));
  document.querySelectorAll('#dashboard input, #dashboard textarea, #dashboard select').forEach(input => {
    if (!input.id) input.id = `admin-field-${++fieldId}`;
    if (!input.getAttribute('aria-label') && !document.querySelector(`label[for="${CSS.escape(input.id)}"]`)) {
      const label = input.closest('.form-check')?.querySelector('label') || input.closest('[class*="col-"], .mb-3, .setting-row')?.querySelector('label');
      if (label && !label.htmlFor) label.htmlFor = input.id;
      if (!label || label.htmlFor !== input.id) input.setAttribute('aria-label', { 's-bg-file': 'Choose background image', 's-profile-file': 'Choose profile image' }[input.id] || input.dataset.field || input.placeholder || input.id);
    }
    if (input.dataset.field !== 'icon' || input.closest('.icon-input-wrap')) return;
    const wrapper = document.createElement('div'); wrapper.className = 'icon-input-wrap'; input.before(wrapper); wrapper.appendChild(input);
    const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-outline-accent icon-button'; button.title = 'Choose icon'; button.setAttribute('aria-label', 'Choose icon'); button.innerHTML = '<i class="bi bi-grid-3x3-gap"></i>';
    button.addEventListener('click', () => { iconTarget = input; document.getElementById('icon-search').value = ''; renderIconOptions(); document.getElementById('icon-dialog').showModal(); }); wrapper.appendChild(button);
  });
  document.querySelectorAll('.remove-btn').forEach(button => { button.title = 'Remove entry'; button.setAttribute('aria-label', 'Remove entry'); button.type = 'button'; });
  document.querySelectorAll('button[title]:not([aria-label])').forEach(button => button.setAttribute('aria-label', button.title));
  for (const id of ['s-bg-image', 's-profile-image', 'pe-image', 'site-testimonials-placeholder']) {
    const input = document.getElementById(id);
    if (input.dataset.pickerReady) continue;
    input.dataset.pickerReady = 'true';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'btn btn-outline-accent my-2'; button.innerHTML = '<i class="bi bi-images" aria-hidden="true"></i> Browse library';
    input.after(button);
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        await loadMedia(); mediaTarget = input;
        document.getElementById('media-picker-search').value = ''; renderMediaPicker(); document.getElementById('media-picker-dialog').showModal();
      } catch (error) { showToast(error.message, true); } finally { button.disabled = false; }
    });
  }
}

async function loadOverview() {
  const data = await apiCall('/api/admin/dashboard', 'GET');
  document.getElementById('dashboard-name').textContent = currentData.profile?.name || 'Your portfolio';
  document.getElementById('dashboard-avatar').src = safeImagePath(currentSettings.images?.profileImage) || 'assets/img/me-0.png';
  document.getElementById('dashboard-date').textContent = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' }).format(new Date());
  document.getElementById('overview-metrics').innerHTML = [[data.counts.projects || 0, 'Projects'], [data.counts.resume || 0, 'Resume entries'], [data.subscriptions.due30 || 0, 'Renewals in 30 days'], [data.issues.length, 'Needs attention']].map(([value, label]) => `<div class="metric-card"><span class="metric-value">${value}</span><span class="metric-label">${label}</span></div>`).join('');
  document.getElementById('overview-issues').innerHTML = data.issues.length ? data.issues.map(issue => `<div class="issue-row"><i class="bi bi-exclamation-circle"></i><div>${escHtml(issue.message)}</div><button class="btn btn-outline-accent icon-button" data-navigate="${escHtml(issue.section)}" title="Review ${escHtml(issue.section)}" aria-label="Review ${escHtml(issue.section)}"><i class="bi bi-arrow-up-right"></i></button></div>`).join('') : '<p class="empty-state">No content issues found.</p>';
  document.getElementById('overview-renewals').innerHTML = data.upcoming.length ? data.upcoming.map(item => `<div class="status-row"><div>${escHtml(item.name)}<div class="muted">${escHtml(item.provider)}</div></div><span>${escHtml(item.renewalDate)}<br>${item.daysLeft < 0 ? `${Math.abs(item.daysLeft)} days overdue` : `${item.daysLeft} days left`}</span></div>`).join('') : '<p class="empty-state">No active subscriptions.</p>';
  const emailStatus = data.email.verified ? 'Connection verified' : data.email.configured ? 'Configured, not verified' : 'Needs configuration';
  const statusRows = [['Email', emailStatus], ['Reminder scheduler', data.automation.configured ? 'Token configured' : 'Token missing'], ['Last reminder check', data.automation.lastRun ? `${formatDate(data.automation.lastRun)} (${data.automation.status})` : 'Never run'], ['Latest recovery point', data.latestRevision ? formatDate(data.latestRevision.createdAt) : 'No snapshots yet']];
  document.getElementById('overview-health').innerHTML = statusRows.map(([label, value]) => `<div class="status-row"><span>${label}</span><span>${escHtml(value)}</span></div>`).join('');
  const activity = data.activity.map(item => `<div class="activity-row"><div>${escHtml(item.action)}${item.detail ? `<div class="muted">${escHtml(item.detail)}</div>` : ''}</div><time datetime="${escHtml(item.at)}">${formatDate(item.at)}</time></div>`).join('') || '<p class="empty-state">No activity yet.</p>';
  document.getElementById('overview-activity').innerHTML = data.activity.slice(0, 5).map(item => `<div class="activity-row"><div>${escHtml(item.action)}<div class="muted">${escHtml(item.detail)}</div></div><time>${formatDate(item.at)}</time></div>`).join('');
  document.getElementById('security-activity').innerHTML = activity;
  document.getElementById('smtp-status').textContent = emailStatus;
  document.getElementById('automation-status').innerHTML = statusRows.slice(1, 3).map(([label, value]) => `<div class="status-row"><span>${label}</span><span>${escHtml(value)}</span></div>`).join('');
  document.getElementById('link-check-status').textContent = data.links.checkedAt ? `Last checked ${formatDate(data.links.checkedAt)}` : 'Links not checked yet';
}

let mediaItems = [];
let mediaTarget;
function renderMediaPicker() {
  const query = document.getElementById('media-picker-search').value.toLowerCase();
  const container = document.getElementById('media-picker-grid'); container.replaceChildren();
  mediaItems.filter(item => item.path.toLowerCase().includes(query)).forEach(item => {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'media-item btn btn-outline-accent'; button.setAttribute('aria-label', `Select ${item.name}`);
    button.innerHTML = `<img src="/${escHtml(item.path)}" alt="" loading="lazy"><span class="media-name">${escHtml(item.name)}</span>`;
    button.addEventListener('click', () => { mediaTarget.value = item.path; mediaTarget.dispatchEvent(new Event('input', { bubbles: true })); document.getElementById('media-picker-dialog').close(); });
    container.appendChild(button);
  });
  if (!container.children.length) container.innerHTML = '<p class="empty-state">No uploaded images found.</p>';
}
async function loadMedia() { const data = await apiCall('/api/admin/media', 'GET'); mediaItems = data.files; renderMedia(); }
function renderMedia() {
  const query = document.getElementById('media-search').value.toLowerCase();
  const unused = document.getElementById('media-unused').checked;
  const visible = mediaItems.filter(item => item.path.toLowerCase().includes(query) && (!unused || !item.usedBy.length));
  document.getElementById('media-grid').innerHTML = visible.map(item => `<article class="media-item"><img src="/${escHtml(item.path)}" alt="${escHtml(item.group)} image" loading="lazy"><div class="media-item-content"><p class="media-name">${escHtml(item.name)}</p><div class="media-meta">${Math.ceil(item.bytes / 1024)} KB | ${escHtml(item.group)}<br>${item.usedBy.length ? `Used in ${escHtml(item.usedBy.join(', '))}` : 'Unused'}</div><div class="toolbar-actions"><button class="btn btn-outline-accent" data-copy-image="${escHtml(item.path)}"><i class="bi bi-copy"></i> Copy path</button><button class="btn btn-outline-danger icon-button" data-delete-image="${escHtml(item.path)}" ${item.usedBy.length ? 'disabled' : ''} title="Delete unused image" aria-label="Delete unused image"><i class="bi bi-trash"></i></button></div></div></article>`).join('') || '<p class="empty-state">No images match this view.</p>';
}

let revisionItems = [];
let selectedRevision;
async function loadRecovery() { const data = await apiCall('/api/admin/revisions', 'GET'); revisionItems = data.revisions; renderRecovery(); }
function renderRecovery() {
  const filter = document.getElementById('recovery-filter').value;
  document.getElementById('recovery-list').innerHTML = revisionItems.filter(item => !filter || item.section === filter).map(item => `<div class="revision-row"><div><strong>${escHtml(item.section)}</strong><div class="muted">${escHtml(item.reason)} | ${formatDate(item.createdAt)}</div></div><button class="btn btn-outline-accent" data-view-revision="${item.id}"><i class="bi bi-eye"></i> Review</button></div>`).join('') || '<p class="empty-state">No recovery points yet.</p>';
}

async function previewSubscriptionCheck() {
  if (isDirty('subscriptions')) return showToast('Save your subscription changes first.', true);
  try { const data = await apiCall('/api/admin/subscriptions/reminders/run', 'POST', { dryRun: true }); showToast(`${data.count} reminder(s) due. No email sent.`); }
  catch (error) { showToast(error.message, true); }
}

function openPreview() {
  if (!dataLoaded) return;
  const hash = { profile: 'header', skills: 'about', interests: 'about', resume: 'resume', projects: 'projects', contact: 'contact' }[activeSection] || 'header';
  document.getElementById('public-preview').src = `/?preview=1#${hash}`;
  const dialog = document.getElementById('preview-dialog');
  if (!dialog.open) dialog.showModal();
}

window.addEventListener('message', event => {
  const iframe = document.getElementById('public-preview');
  if (event.origin !== location.origin || event.source !== iframe.contentWindow || event.data?.type !== 'portfolio-preview-ready') return;
  const payload = Object.fromEntries(publicSections.map(section => [section, collectResource(section)]));
  payload.site = collectSite();
  payload.settings = { images: collectSettings().images, analytics: {} };
  iframe.contentWindow.postMessage({ type: 'portfolio-preview-data', payload }, location.origin);
});

document.addEventListener('input', event => {
  if (event.target.id === 'project-search') return filterProjects();
  if (event.target.id === 'resume-search') return filterResume();
  if (event.target.id === 'media-search') return renderMedia();
  if (event.target.id === 'media-picker-search') return renderMediaPicker();
  if (event.target.id === 'icon-search') return renderIconOptions();
  if (event.target.closest('#dashboard')) trackChanges();
});
document.addEventListener('change', event => {
  if (event.target.id === 'media-unused') return renderMedia();
  if (event.target.id === 'recovery-filter') return renderRecovery();
  if (event.target.id === 'sub-status-filter') renderSubscriptionsList();
  if (event.target.closest('#dashboard')) trackChanges();
});
document.addEventListener('click', async event => {
  const close = event.target.closest('[data-close-dialog]');
  if (close) document.getElementById(close.dataset.closeDialog).close();
  const nav = event.target.closest('[data-navigate]');
  if (nav) {
    navigateTo(nav.dataset.navigate);
    if (nav.dataset.settingsTab) document.getElementById(`panel-settings-${nav.dataset.settingsTab}-tab`)?.click();
  }
  const copy = event.target.closest('[data-copy-image]');
  const remove = event.target.closest('[data-delete-image]');
  const revision = event.target.closest('[data-view-revision]');
  try {
    if (copy) { await navigator.clipboard.writeText(copy.dataset.copyImage); showToast('Image path copied.'); }
    if (remove && await confirmAction('Delete image?', 'This unused upload will be permanently removed.', 'Delete image')) {
      await apiCall(`/api/admin/media/${remove.dataset.deleteImage.slice('assets/uploads/'.length)}`, 'DELETE'); await loadMedia();
    }
    if (revision) {
      selectedRevision = await apiCall(`/api/admin/revisions/${revision.dataset.viewRevision}`, 'GET');
      document.getElementById('revision-title').textContent = `${selectedRevision.section} - ${formatDate(selectedRevision.createdAt)}`;
      document.getElementById('revision-content').textContent = JSON.stringify(selectedRevision.data, null, 2);
      document.getElementById('revision-dialog').showModal();
    }
  } catch (error) { showToast(error.message, true); }
});

document.getElementById('menu-toggle').addEventListener('click', () => setMenu(!document.getElementById('admin-navigation').classList.contains('open')));
document.getElementById('sidebar-backdrop').addEventListener('click', () => { setMenu(false); document.getElementById('menu-toggle').focus(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') setMenu(false); });
document.getElementById('save-current').addEventListener('click', () => saveResource(currentResource()));
document.getElementById('discard-changes').addEventListener('click', async () => {
  const resource = currentResource();
  if (!resource || !await confirmAction('Discard changes?', 'Your draft will be replaced with the saved version.', 'Discard')) return;
  populateResource(resource, structuredClone(savedRecords[resource])); clearStoredDraft(resource); clearErrors(); trackChanges();
});
document.getElementById('reload-section').addEventListener('click', async () => {
  const resource = currentResource();
  if (!resource || (isDirty(resource) && !await confirmAction('Load latest version?', 'Your current draft will be discarded. The latest saved content will be loaded.', 'Reload latest'))) return;
  try {
    const value = await apiCall(publicSections.includes(resource) ? `/api/admin/portfolio/${resource}` : `/api/admin/${resource}`, 'GET');
    savedRecords[resource] = structuredClone(value);
    populateResource(resource, value); savedSnapshots[resource] = JSON.stringify(collectResource(resource)); clearStoredDraft(resource); clearErrors(); trackChanges();
  } catch (error) { showErrors(error, resource); }
});
document.getElementById('resume-draft').addEventListener('click', async () => {
  const resource = currentResource(); const draft = storedDraft(resource); if (!draft) return;
  if (draft.version !== versions[resource] && !await confirmAction('Resume older draft?', 'Published content has changed since this draft was created. Resuming accepts the draft as your new working copy.', 'Resume draft')) return;
  populateResource(resource, draft.data); trackChanges();
});
document.getElementById('delete-draft').addEventListener('click', async () => {
  if (await confirmAction('Discard stored draft?', 'This stored draft will be removed from this tab.', 'Discard draft')) { clearStoredDraft(currentResource()); updateSaveStatus(); }
});
document.getElementById('preview-btn').addEventListener('click', openPreview);
document.getElementById('refresh-preview').addEventListener('click', openPreview);
document.getElementById('preview-mobile').addEventListener('click', () => document.getElementById('public-preview').classList.add('mobile'));
document.getElementById('preview-desktop').addEventListener('click', () => document.getElementById('public-preview').classList.remove('mobile'));
document.getElementById('media-upload-btn').addEventListener('click', () => document.getElementById('media-file').click());
document.getElementById('media-file').addEventListener('change', async event => {
  const button = document.getElementById('media-upload-btn'); button.disabled = true;
  try { await uploadImage(event.target.files[0], 'general'); event.target.value = ''; await loadMedia(); showToast('Image uploaded and optimized.'); }
  catch (error) { showToast(error.message, true); } finally { button.disabled = false; }
});
document.getElementById('create-backup').addEventListener('click', async event => {
  const button = event.currentTarget; button.disabled = true;
  try { await apiCall('/api/admin/backups', 'POST'); await loadRecovery(); showToast('Recovery snapshot created.'); }
  catch (error) { showToast(error.message, true); } finally { button.disabled = false; }
});
document.getElementById('check-links').addEventListener('click', async event => {
  const button = event.currentTarget; button.disabled = true;
  document.getElementById('link-check-status').textContent = 'Checking saved links...';
  try {
    const report = await apiCall('/api/admin/links/check', 'POST');
    await loadOverview();
    const unavailable = report.results.filter(item => item.status === null || item.status >= 400).length;
    document.getElementById('link-check-status').textContent = `${report.results.length} links checked; ${unavailable} unavailable or restricted.`;
  } catch (error) { showToast(error.message, true); document.getElementById('link-check-status').textContent = 'Link check failed.'; } finally { button.disabled = false; }
});
document.getElementById('restore-revision').addEventListener('click', async () => {
  const revision = selectedRevision;
  if (!revision || !await confirmAction('Restore this revision?', `Saved ${revision.section} content and its draft will be replaced. A recovery copy of the current content is created first.`, 'Restore revision')) return;
  const button = document.getElementById('restore-revision'); button.disabled = true;
  try {
    const response = await fetch(`/api/admin/revisions/${revision.id}/restore`, { method: 'POST', headers: { 'X-CSRF-Token': csrfToken, 'If-Match': versions[revision.section] } });
    const data = await readResponse(response); if (!response.ok) throw new Error(data.error);
    const value = await apiCall(publicSections.includes(revision.section) ? `/api/admin/portfolio/${revision.section}` : `/api/admin/${revision.section}`, 'GET');
    savedRecords[revision.section] = structuredClone(value);
    populateResource(revision.section, value); savedSnapshots[revision.section] = JSON.stringify(collectResource(revision.section)); clearStoredDraft(revision.section);
    document.getElementById('revision-dialog').close(); trackChanges(); await loadRecovery(); showToast('Revision restored.');
  } catch (error) { showToast(error.message, true); } finally { button.disabled = false; }
});
window.addEventListener('beforeunload', event => {
  const modalDirty = [...document.querySelectorAll('.modal.show')].some(modal => modal.dataset.baseline !== modalValues(modal));
  if (anyDirty() || modalDirty) { event.preventDefault(); event.returnValue = ''; }
});

setupWorkspace();
enhanceFields();
setMenu(false);
matchMedia('(max-width: 767px)').addEventListener('change', () => setMenu(false));
document.getElementById('verify-email').addEventListener('click', async event => {
  if (isDirty('settings')) return showToast('Save your email settings before verification.', true);
  const button = event.currentTarget; button.disabled = true;
  try { const result = await apiCall('/api/admin/settings/verify-email', 'POST'); showToast(result.message); await loadOverview(); }
  catch (error) { showToast(error.message, true); } finally { button.disabled = false; }
});
checkAuth();
