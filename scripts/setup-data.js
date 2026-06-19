const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const ENV_FILE = path.join(ROOT_DIR, '.env');
const FORCE = process.argv.includes('--force');

function randomSecret() {
  return crypto.randomBytes(48).toString('base64url');
}

function writeJsonIfMissing(fileName, data) {
  const filePath = path.join(DATA_DIR, fileName);
  const existed = fs.existsSync(filePath);
  if (existed && !FORCE) {
    return { fileName, action: 'kept' };
  }
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  return { fileName, action: existed ? 'rewrote' : 'created' };
}

function readEnvMap() {
  if (!fs.existsSync(ENV_FILE)) {
    return { lines: [], values: new Map() };
  }
  const lines = fs.readFileSync(ENV_FILE, 'utf8').split(/\r?\n/);
  const values = new Map();
  lines.forEach((line, index) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match) {
      values.set(match[1], { value: match[2], index });
    }
  });
  return { lines, values };
}

function updateOrAppendEnv(lines, values, key, value, replacePlaceholders = false) {
  const existing = values.get(key);
  const placeholder = existing && /^replace_|^your_|^<.*>$/.test(existing.value);
  if (!existing) {
    lines.push(`${key}=${value}`);
    return 'added';
  }
  if (replacePlaceholders && placeholder) {
    lines[existing.index] = `${key}=${value}`;
    return 'updated';
  }
  return 'kept';
}

function getEnvValueFromLines(lines, key) {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = lines[index].match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (match && match[1] === key) {
      return match[2];
    }
  }
  return '';
}

function isPlaceholderValue(value) {
  return !value || /^replace_|^your_|^<.*>$/.test(value);
}

function setupEnv() {
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  const adminHash = adminPassword ? bcrypt.hashSync(adminPassword, 12) : 'replace_with_bcrypt_hash';
  const existed = fs.existsSync(ENV_FILE);
  const env = readEnvMap();
  let lines = env.lines.filter((line, index, arr) => index < arr.length - 1 || line !== '');
  const values = env.values;

  if (!existed) {
    lines = [
      '# Server',
      'PORT=3003',
      'NODE_ENV=development',
      `SESSION_SECRET=${randomSecret()}`,
      '',
      '# Admin Panel',
      'ADMIN_USERNAME=admin',
      `ADMIN_PASSWORD_HASH=${adminHash}`,
      '',
      '# Email / SMTP',
      'EMAIL_USERNAME=you@example.com',
      'EMAIL_PASSWORD=replace_with_email_or_app_password',
      'EMAIL_HOST=derrickml.com',
      'EMAIL_PORT=465',
      'EMAIL_TO=you@example.com',
      '',
      '# Private Cron',
      `CRON_SECRET=${randomSecret()}`,
      '',
    ];
    fs.writeFileSync(ENV_FILE, lines.join('\n'), 'utf8');
    return {
      action: 'created',
      adminHashGenerated: Boolean(adminPassword),
      warnings: adminPassword ? [] : ['ADMIN_PASSWORD was not provided. Replace ADMIN_PASSWORD_HASH before logging in.'],
    };
  }

  const changes = [];
  changes.push(updateOrAppendEnv(lines, values, 'PORT', '3003'));
  changes.push(updateOrAppendEnv(lines, values, 'NODE_ENV', 'development'));
  changes.push(updateOrAppendEnv(lines, values, 'SESSION_SECRET', randomSecret(), true));
  changes.push(updateOrAppendEnv(lines, values, 'ADMIN_USERNAME', 'admin'));
  changes.push(updateOrAppendEnv(lines, values, 'ADMIN_PASSWORD_HASH', adminHash, Boolean(adminPassword)));
  changes.push(updateOrAppendEnv(lines, values, 'EMAIL_USERNAME', 'you@example.com'));
  changes.push(updateOrAppendEnv(lines, values, 'EMAIL_PASSWORD', 'replace_with_email_or_app_password'));
  changes.push(updateOrAppendEnv(lines, values, 'EMAIL_HOST', 'derrickml.com'));
  changes.push(updateOrAppendEnv(lines, values, 'EMAIL_PORT', '465'));
  changes.push(updateOrAppendEnv(lines, values, 'EMAIL_TO', 'you@example.com'));
  changes.push(updateOrAppendEnv(lines, values, 'CRON_SECRET', randomSecret(), true));

  fs.writeFileSync(ENV_FILE, `${lines.join('\n').replace(/\n+$/g, '')}\n`, 'utf8');
  const finalAdminHash = getEnvValueFromLines(lines, 'ADMIN_PASSWORD_HASH');
  const warnings = [];
  if (!adminPassword && isPlaceholderValue(finalAdminHash)) {
    warnings.push('ADMIN_PASSWORD_HASH is missing or a placeholder. Run setup with ADMIN_PASSWORD set.');
  }
  return {
    action: changes.includes('added') || changes.includes('updated') ? 'updated' : 'kept',
    adminHashGenerated: Boolean(adminPassword),
    warnings,
  };
}

const siteDefaults = {
  navigation: [
    { id: 'home', label: 'Home', href: '#header', enabled: true },
    { id: 'about', label: 'About', href: '#about', enabled: true },
    { id: 'resume', label: 'Resume', href: '#resume', enabled: true },
    { id: 'projects', label: 'Projects', href: '#projects', enabled: true },
    { id: 'contact', label: 'Contact', href: '#contact', enabled: true },
  ],
  sections: {
    about: { enabled: true, title: 'About', subtitle: 'Learn more about me' },
    skills: { enabled: true, title: 'Skills', subtitle: '' },
    interests: { enabled: true, title: 'Interests', subtitle: '' },
    testimonials: { enabled: true, title: 'Testimonials', subtitle: '' },
    resume: { enabled: true, title: 'Resume', subtitle: 'Check My Resume' },
    projects: { enabled: true, title: 'Projects', subtitle: 'My Work' },
    contact: { enabled: true, title: 'Contact', subtitle: 'Contact Me' },
  },
  contactBoxes: {
    addressTitle: 'My Address',
    socialTitle: 'Social Profiles',
    emailTitle: 'Email Me',
    phoneTitle: 'Call Me',
  },
  contactForm: {
    namePlaceholder: 'Your Name',
    emailPlaceholder: 'Your Email',
    subjectPlaceholder: 'Subject',
    messagePlaceholder: 'Message',
    submitLabel: 'Send Message',
    sendingLabel: 'Sending...',
    loadingLabel: 'Loading',
    sentMessage: 'Your message has been sent. Thank you!',
    successFallback: 'Message sent successfully!',
    errorFallback: 'Unable to send your message.',
    captchaTitle: 'Security Check',
    captchaIntro: 'Please answer the following question to submit the form:',
    captchaQuestion: 'What is 1 + 1?',
    captchaIncorrectMessage: 'Incorrect answer. Please try again.',
    captchaCloseLabel: 'Close',
    captchaSubmitLabel: 'Submit Answer',
  },
  projects: {
    allFilterLabel: 'All',
    viewDetailsLabel: 'View Details',
    technologiesTitle: 'Technologies',
    highlightsTitle: 'Key Highlights',
    liveDemoLabel: 'Live Demo',
    sourceCodeLabel: 'Source Code',
  },
  testimonials: {
    sourceUrl: '',
    placeholderImage: 'assets/img/testimonials/placeholder.png',
  },
};

const files = {
  'profile.json': {
    name: 'Your Name',
    fullName: 'Your Full Name',
    tagline: 'A short professional tagline with optional <span>highlight</span>.',
    profileImage: 'assets/img/me-0.png',
    aboutTitle: 'Your Role or Specialty',
    aboutText: 'Write your professional summary here.',
    details: [],
    socialLinks: [],
    meta: {
      title: 'Your Name',
      description: 'Personal portfolio website.',
      keywords: 'portfolio, resume, projects',
    },
  },
  'skills.json': [],
  'interests.json': [],
  'resume.json': {
    summary: { name: 'Your Name', text: 'Short resume summary.' },
    experience: [],
    education: [],
    certifications: [],
    honors: [],
    research: [],
    areasOfInterest: { title: '', description: '' },
  },
  'contact.json': {
    address: '',
    emails: [],
    phones: [],
    socialLinks: [],
  },
  'projects.json': [],
  'settings.json': {
    email: {
      host: 'derrickml.com',
      port: 465,
      secure: true,
      user: '',
      from: '',
      to: '',
    },
    images: {
      backgroundImage: 'assets/img/bg.png',
      profileImage: 'assets/img/me-0.png',
    },
    analytics: {
      googleMeasurementId: '',
    },
  },
  'site.json': siteDefaults,
  'subscriptions.json': {
    settings: {
      enabled: true,
      recipientEmail: '',
      timezone: 'Africa/Kampala',
      defaultReminderTime: '09:00',
      digest: true,
    },
    subscriptions: [],
    reminderHistory: [],
  },
  'secrets.json': {
    emailPassword: '',
    adminPasswordHash: '',
    cronSecret: '',
  },
};

function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const envResult = setupEnv();
  const results = Object.entries(files).map(([fileName, data]) => writeJsonIfMissing(fileName, data));

  console.log(`.env: ${envResult.action}`);
  results.forEach(result => console.log(`data/${result.fileName}: ${result.action}`));
  if (envResult.adminHashGenerated) {
    console.log('ADMIN_PASSWORD_HASH generated from ADMIN_PASSWORD.');
  }
  envResult.warnings.forEach(warning => console.warn(`Warning: ${warning}`));
  console.log('Setup complete.');
}

main();
