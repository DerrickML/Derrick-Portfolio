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

async function uploadImage(file, type) {
  if (!file) throw new Error('Choose an image file first');
  if (!file.type || !file.type.startsWith('image/')) {
    throw new Error('Only image files can be uploaded');
  }

  const res = await fetch(`/api/admin/uploads/${type}`, {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Upload failed');
  return data.path;
}

function setImagePreview(previewId, imagePath) {
  const preview = document.getElementById(previewId);
  if (!preview) return;
  if (imagePath) {
    preview.src = imagePath;
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
      ...sections.map(s => apiCall(`/api/portfolio/${s}`, 'GET')),
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
  const summary = subscriptionsData.summary || {};
  document.getElementById('sub-metric-total').textContent = summary.total || 0;
  document.getElementById('sub-metric-active').textContent = summary.active || 0;
  document.getElementById('sub-metric-due7').textContent = summary.due7 || 0;
  document.getElementById('sub-metric-due30').textContent = summary.due30 || 0;
  document.getElementById('sub-metric-expired').textContent = summary.expired || 0;
}

function renderSubscriptionsList() {
  const list = document.getElementById('subscriptions-list');
  if (!list) return;
  const search = (document.getElementById('sub-search')?.value || '').toLowerCase().trim();
  const statusFilter = document.getElementById('sub-status-filter')?.value || '';
  const subscriptions = subscriptionsData.subscriptions || [];
  list.innerHTML = '';

  const filtered = subscriptions
    .map((subscription, index) => ({ subscription, index }))
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
    reminderHistory: subscriptionsData.reminderHistory || [],
  };
}

function stripSubscriptionComputedFields(subscription) {
  const copy = { ...subscription };
  delete copy.daysLeft;
  delete copy.computedStatus;
  return copy;
}

async function saveSubscriptions(showMessage = true) {
  try {
    const result = await apiCall('/api/admin/subscriptions', 'PUT', collectSubscriptionsPayload());
    subscriptionsData = result.data || subscriptionsData;
    populateSubscriptions(subscriptionsData);
    if (showMessage) showToast('Subscriptions saved successfully!');
    return true;
  } catch (err) {
    showToast('Error saving subscriptions: ' + err.message, true);
    return false;
  }
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

  const saved = await saveSubscriptions(false);
  if (saved) {
    bootstrap.Modal.getInstance(document.getElementById('subscriptionEditorModal')).hide();
    showToast('Subscription saved successfully!');
  }
}

async function deleteSubscription(index) {
  const list = subscriptionsData.subscriptions || [];
  if (index < 0 || index >= list.length) return;
  if (!window.confirm(`Delete ${list[index].name || 'this subscription'}?`)) return;
  list.splice(index, 1);
  subscriptionsData.subscriptions = list;
  await saveSubscriptions(false);
  showToast('Subscription deleted.');
}

async function runSubscriptionCheck() {
  try {
    const saved = await saveSubscriptions(false);
    if (!saved) return;
    const result = await apiCall('/api/admin/subscriptions/reminders/run', 'POST', { dryRun: false });
    const message = result.sent
      ? result.message
      : `${result.message} (${result.count || 0} due)`;
    showToast(message);
    await loadAllData();
  } catch (err) {
    showToast('Reminder check failed: ' + err.message, true);
  }
}

async function sendSubscriptionTest() {
  try {
    const recipientEmail = document.getElementById('sub-recipient').value;
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
  try {
    const result = await apiCall('/api/admin/settings', 'PUT', collectSettings());
    currentSettings = result.settings || currentSettings;
    populateSettings(currentSettings);
    showToast('Settings saved successfully!');
  } catch (err) {
    showToast('Error saving settings: ' + err.message, true);
  }
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
  try {
    const result = await apiCall('/api/admin/site', 'PUT', collectSite());
    currentSite = result.site || currentSite;
    populateSite(currentSite);
    showToast('Public site saved successfully!');
  } catch (err) {
    showToast('Error saving public site: ' + err.message, true);
  }
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
  document.getElementById('pe-image-file').value = '';
  setImagePreview('pe-image-preview', d.image || '');
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
