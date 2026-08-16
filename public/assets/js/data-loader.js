/**
 * Portfolio Data Loader
 * Fetches data from JSON API endpoints and dynamically renders all sections.
 * Replaces hardcoded HTML content to make the portfolio fully data-driven.
 */
document.addEventListener('DOMContentLoaded', async function () {

  // Utility: safely create a text node (XSS-safe)
  function txt(str) {
    return document.createTextNode(str || '');
  }

  // Utility: create an element with optional classes and text
  function el(tag, className, textContent) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (textContent) e.textContent = textContent;
    return e;
  }

  function sanitizeUrl(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      if (['http:', 'https:', 'mailto:', 'tel:'].includes(parsed.protocol)) {
        return parsed.href;
      }
    } catch (err) {
      return '';
    }
    return '';
  }

  function sanitizeAssetUrl(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      if (['http:', 'https:'].includes(parsed.protocol)) {
        return parsed.href;
      }
    } catch (err) {
      return '';
    }
    return '';
  }

  function setBackgroundImage(imagePath) {
    const safeUrl = sanitizeAssetUrl(imagePath);
    if (!safeUrl) return;
    document.documentElement.style.setProperty(
      '--site-background-image',
      `url("${safeUrl.replace(/"/g, '%22')}")`,
    );
  }

  function loadAnalytics(measurementId) {
    const id = (measurementId || '').trim();
    if (!id || !/^G-[A-Z0-9-]+$/i.test(id) || document.querySelector(`script[data-ga-id="${id}"]`)) {
      return;
    }

    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', id);

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    script.dataset.gaId = id;
    document.head.appendChild(script);
  }

  function setSectionTitle(containerSelector, config) {
    const container = document.querySelector(containerSelector);
    if (!container || !config) return;
    const title = container.querySelector('.section-title h2');
    const subtitle = container.querySelector('.section-title p');
    if (title) title.textContent = config.title || '';
    if (subtitle) {
      subtitle.textContent = config.subtitle || '';
      subtitle.style.display = config.subtitle ? '' : 'none';
    }
  }

  function toggleElement(selector, enabled) {
    const element = document.querySelector(selector);
    if (element) element.style.display = enabled ? '' : 'none';
  }

  function applyNavigation(site) {
    const sections = site?.sections || {};
    (site?.navigation || []).forEach(item => {
      const link = document.querySelector(`#navbar a[href="${item.href}"]`);
      if (!link) return;
      const targetId = (item.href || '').replace('#', '');
      const targetEnabled = targetId === 'header' || sections[targetId]?.enabled !== false;
      link.textContent = item.label || link.textContent;
      link.closest('li').style.display = item.enabled !== false && targetEnabled ? '' : 'none';
    });
  }

  function applyPublicSite(site) {
    if (!site) return;
    const sections = site.sections || {};
    applyNavigation(site);

    setSectionTitle('#about .about-me', sections.about);
    setSectionTitle('#about .skills', sections.skills);
    setSectionTitle('#about .interests', sections.interests);
    setSectionTitle('#about .testimonials', sections.testimonials);
    setSectionTitle('#resume', sections.resume);
    setSectionTitle('#projects', sections.projects);
    setSectionTitle('#contact', sections.contact);

    toggleElement('#about .about-me', sections.about?.enabled !== false);
    toggleElement('#about .skills', sections.skills?.enabled !== false);
    toggleElement('#about .interests', sections.interests?.enabled !== false);
    toggleElement('#about .testimonials', sections.testimonials?.enabled !== false);
    toggleElement('#resume', sections.resume?.enabled !== false);
    toggleElement('#projects', sections.projects?.enabled !== false);
    toggleElement('#contact', sections.contact?.enabled !== false);

    const contactBoxes = site.contactBoxes || {};
    const contactForm = site.contactForm || {};
    const contactTitleMap = {
      'contact-address-title': contactBoxes.addressTitle,
      'contact-social-title': contactBoxes.socialTitle,
      'contact-email-title': contactBoxes.emailTitle,
      'contact-phone-title': contactBoxes.phoneTitle,
    };
    Object.entries(contactTitleMap).forEach(([id, value]) => {
      const target = document.getElementById(id);
      if (target && value) target.textContent = value;
    });

    const formPlaceholders = {
      name: contactForm.namePlaceholder,
      email: contactForm.emailPlaceholder,
      subject: contactForm.subjectPlaceholder,
      message: contactForm.messagePlaceholder,
    };
    Object.entries(formPlaceholders).forEach(([id, value]) => {
      const input = document.getElementById(id);
      if (!input || !value) return;
      input.placeholder = value;
      const label = document.querySelector(`label[for="${id}"]`);
      if (label) label.textContent = value;
    });

    const submitButton = document.getElementById('submitButton');
    if (submitButton && contactForm.submitLabel) {
      submitButton.textContent = contactForm.submitLabel;
      submitButton.dataset.submitLabel = contactForm.submitLabel;
    }
    if (submitButton && contactForm.sendingLabel) {
      submitButton.dataset.sendingLabel = contactForm.sendingLabel;
    }
    const loading = document.querySelector('#contact-form .loading');
    if (loading && contactForm.loadingLabel) loading.textContent = contactForm.loadingLabel;
    const sent = document.querySelector('#contact-form .sent-message');
    if (sent && contactForm.sentMessage) sent.textContent = contactForm.sentMessage;

    const contactFormEl = document.getElementById('contact-form');
    if (contactFormEl) {
      contactFormEl.dataset.successFallback = contactForm.successFallback || '';
      contactFormEl.dataset.errorFallback = contactForm.errorFallback || '';
    }

    const captchaMap = {
      captchaModalLabel: contactForm.captchaTitle,
      captchaIntro: contactForm.captchaIntro,
      captchaQuestion: contactForm.captchaQuestion,
      captchaClose: contactForm.captchaCloseLabel,
      checkCaptcha: contactForm.captchaSubmitLabel,
    };
    Object.entries(captchaMap).forEach(([id, value]) => {
      const target = document.getElementById(id);
      if (target && value) target.textContent = value;
    });
    const captchaAnswer = document.getElementById('captchaAnswer');
    if (captchaAnswer) {
      captchaAnswer.dataset.incorrectMessage = contactForm.captchaIncorrectMessage || '';
    }
  }

  function setLimitedHtml(target, html) {
    const allowedTags = new Set(['A', 'BR', 'EM', 'SPAN', 'STRONG', 'SUP']);
    const template = document.createElement('template');
    template.innerHTML = html || '';

    function cleanNode(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        return document.createTextNode(node.textContent);
      }

      if (node.nodeType !== Node.ELEMENT_NODE) {
        return document.createTextNode('');
      }

      if (!allowedTags.has(node.tagName)) {
        const fragment = document.createDocumentFragment();
        node.childNodes.forEach(child => fragment.appendChild(cleanNode(child)));
        return fragment;
      }

      const clean = document.createElement(node.tagName.toLowerCase());
      if (node.tagName === 'A') {
        const href = sanitizeUrl(node.getAttribute('href') || '');
        if (href) {
          clean.href = href;
          if (clean.protocol === 'http:' || clean.protocol === 'https:') {
            clean.target = '_blank';
            clean.rel = 'noopener noreferrer';
          }
        }
      }
      node.childNodes.forEach(child => clean.appendChild(cleanNode(child)));
      return clean;
    }

    const fragment = document.createDocumentFragment();
    template.content.childNodes.forEach(child => fragment.appendChild(cleanNode(child)));
    target.replaceChildren(fragment);
  }

  // Fetch JSON from our API
  async function fetchJson(url) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error(`Error loading ${url}:`, err);
      return null;
    }
  }

  async function fetchSection(section) {
    return fetchJson(`/api/portfolio/${section}`);
  }

  // ──────────────────────────────────────────────
  // 1. PROFILE (Header + About)
  // ──────────────────────────────────────────────
  function renderProfile(data, settings) {
    if (!data) return;
    const configuredProfileImage = settings?.images?.profileImage;

    // Header name
    const headerName = document.getElementById('header-name');
    if (headerName) headerName.textContent = data.name;

    // Header tagline (contains safe HTML markup like <span>)
    const headerTagline = document.getElementById('header-tagline');
    if (headerTagline) setLimitedHtml(headerTagline, data.tagline);

    // About title
    const aboutTitle = document.getElementById('about-title');
    if (aboutTitle) aboutTitle.textContent = data.aboutTitle;

    // About text (contains safe internal HTML with <a> links)
    const aboutText = document.getElementById('about-text');
    if (aboutText) setLimitedHtml(aboutText, data.aboutText);

    // Profile image
    const profileImg = document.getElementById('profile-image');
    if (profileImg) {
      profileImg.src = configuredProfileImage || data.profileImage;
      profileImg.alt = data.name;
    }

    // Personal details - left column
    const detailsLeft = document.getElementById('details-left');
    const detailsRight = document.getElementById('details-right');
    if (detailsLeft && detailsRight && data.details) {
      const half = Math.ceil(data.details.length / 2);
      data.details.forEach((detail, i) => {
        const li = document.createElement('li');
        const icon = el('i', 'bi bi-chevron-right');
        const strong = el('strong', null, detail.label + ':');
        const span = document.createElement('span');
        // Details may contain safe HTML (e.g., email links, <sup>)
        setLimitedHtml(span, detail.value);
        li.appendChild(icon);
        li.appendChild(document.createTextNode(' '));
        li.appendChild(strong);
        li.appendChild(document.createTextNode(' '));
        li.appendChild(span);
        (i < half ? detailsLeft : detailsRight).appendChild(li);
      });
    }

    // Header social links
    const headerSocial = document.getElementById('header-social-links');
    if (headerSocial && data.socialLinks) {
      headerSocial.innerHTML = '';
      data.socialLinks.forEach(link => {
        const href = sanitizeUrl(link.url);
        if (!href) return;
        const a = document.createElement('a');
        a.href = href;
        a.className = link.platform;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.setAttribute('aria-label', link.platform || 'Social profile');
        a.title = link.platform || 'Social profile';
        const i = el('i', link.icon);
        i.setAttribute('aria-hidden', 'true');
        a.appendChild(i);
        headerSocial.appendChild(a);
      });
    }

    // Page title & meta
    if (data.meta) {
      if (data.meta.title) document.title = data.meta.title;
      const metaDesc = document.querySelector('meta[name="description"]');
      if (metaDesc && data.meta.description) metaDesc.content = data.meta.description;
      const metaKeys = document.querySelector('meta[name="keywords"]');
      if (metaKeys && data.meta.keywords) metaKeys.content = data.meta.keywords;
    }
  }

  // ──────────────────────────────────────────────
  // 2. SKILLS
  // ──────────────────────────────────────────────
  function renderSkills(data) {
    if (!data || !Array.isArray(data)) return;
    const container = document.getElementById('skills-container');
    if (!container) return;
    container.innerHTML = '';

    const half = Math.ceil(data.length / 2);
    const colLeft = el('div', 'col-lg-6');
    const colRight = el('div', 'col-lg-6');

    data.forEach((skill, i) => {
      const progress = el('div', 'progress');
      const skillSpan = document.createElement('span');
      skillSpan.className = 'skill';
      skillSpan.textContent = skill.name + ' ';
      const valI = el('i', 'val', skill.percentage + '%');
      skillSpan.appendChild(valI);

      const barWrap = el('div', 'progress-bar-wrap');
      const bar = el('div', 'progress-bar');
      bar.setAttribute('role', 'progressbar');
      bar.setAttribute('aria-valuenow', skill.percentage);
      bar.setAttribute('aria-valuemin', '0');
      bar.setAttribute('aria-valuemax', '100');

      barWrap.appendChild(bar);
      progress.appendChild(skillSpan);
      progress.appendChild(barWrap);

      (i < half ? colLeft : colRight).appendChild(progress);
    });

    container.appendChild(colLeft);
    container.appendChild(colRight);

    // Re-trigger Waypoint animation for skills
    setTimeout(() => {
      const bars = container.querySelectorAll('.progress-bar');
      bars.forEach(b => {
        b.style.width = b.getAttribute('aria-valuenow') + '%';
      });
    }, 400);
  }

  // ──────────────────────────────────────────────
  // 3. INTERESTS
  // ──────────────────────────────────────────────
  function renderInterests(data) {
    if (!data || !Array.isArray(data)) return;
    const container = document.getElementById('interests-container');
    if (!container) return;
    container.innerHTML = '';

    data.forEach((interest, i) => {
      const col = document.createElement('div');
      // Responsive classes with margin-top for items after first row
      col.className = 'col-lg-3 col-md-4' + (i >= 1 ? ' mt-4' : '') + (i >= 1 && i < 4 ? ' mt-md-0' : '');
      if (i === 3) col.className = 'col-lg-3 col-md-4 mt-4 mt-lg-0';

      const box = el('div', 'icon-box');
      const icon = el('i', interest.icon);
      icon.style.color = interest.color;
      const h3 = el('h3', null, interest.name);

      box.appendChild(icon);
      box.appendChild(h3);
      col.appendChild(box);
      container.appendChild(col);
    });
  }

  // ──────────────────────────────────────────────
  // 4. RESUME
  // ──────────────────────────────────────────────
  function getResumeOrganization(item) {
    return item.organization || item.institution || '';
  }

  function isCurrentResumeItem(item) {
    return /\bpresent\b/i.test(item.period || '');
  }

  function deriveResumeTags(item) {
    const text = [
      item.title,
      getResumeOrganization(item),
      item.description,
      ...(item.bullets || []),
    ].join(' ').toLowerCase();
    const tagRules = [
      ['Leadership', ['lead', 'principal', 'coordinat', 'mentor', 'team']],
      ['Systems', ['system', 'infrastructure', 'database', 'server']],
      ['Software', ['software', 'application', 'develop', 'api', 'website']],
      ['Data', ['database', 'data', 'analysis', 'statistical']],
      ['Security', ['security', 'integrity', 'backup', 'recovery']],
      ['AI/IoT', ['ai', 'iot', 'remote sensing', 'smart']],
      ['Renewable Energy', ['renewable', 'energy', 'nrep']],
      ['Research', ['research', 'publication', 'workshop']],
    ];
    return tagRules
      .filter(([, keywords]) => keywords.some(keyword => text.includes(keyword)))
      .map(([label]) => label)
      .slice(0, 4);
  }

  function appendResumePill(container, text, className) {
    if (!text) return;
    const pill = el('span', className || 'resume-pill', text);
    container.appendChild(pill);
  }

  function renderResumeCard(item, options) {
    const card = el('article', 'resume-card' + (isCurrentResumeItem(item) ? ' is-current' : ''));
    const header = el('div', 'resume-card-header');
    const titleWrap = el('div', 'resume-card-title-wrap');
    const title = el('h4', null, item.title || 'Untitled');
    titleWrap.appendChild(title);

    const org = getResumeOrganization(item);
    if (org) {
      titleWrap.appendChild(el('p', 'resume-org', org));
    }
    header.appendChild(titleWrap);

    const badges = el('div', 'resume-card-badges');
    if (isCurrentResumeItem(item)) appendResumePill(badges, 'Current', 'resume-pill resume-pill-current');
    appendResumePill(badges, item.period, 'resume-pill');
    header.appendChild(badges);
    card.appendChild(header);

    const tags = deriveResumeTags(item);
    if (tags.length) {
      const tagWrap = el('div', 'resume-tag-list');
      tags.forEach(tag => appendResumePill(tagWrap, tag, 'resume-tag'));
      card.appendChild(tagWrap);
    }

    if (options.hasBullets && item.bullets && item.bullets.length) {
      const list = el('ul', 'resume-bullets');
      const visibleCount = options.compact ? 3 : item.bullets.length;
      item.bullets.forEach((bullet, index) => {
        const li = el('li', null, bullet);
        if (index >= visibleCount) {
          li.hidden = true;
          li.className = 'resume-extra';
        }
        list.appendChild(li);
      });
      card.appendChild(list);

      const hiddenCount = item.bullets.length - visibleCount;
      if (hiddenCount > 0) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'resume-expand';
        button.textContent = `Show ${hiddenCount} more`;
        button.setAttribute('aria-expanded', 'false');
        button.addEventListener('click', () => {
          const expanded = button.getAttribute('aria-expanded') === 'true';
          list.querySelectorAll('.resume-extra').forEach(li => { li.hidden = expanded; });
          button.setAttribute('aria-expanded', String(!expanded));
          button.textContent = expanded ? `Show ${hiddenCount} more` : 'Show less';
        });
        card.appendChild(button);
      }
    } else if (item.description) {
      card.appendChild(el('p', 'resume-description', item.description));
    }

    if (item.publicationUrl) {
      const href = sanitizeUrl(item.publicationUrl);
      if (href) {
        const link = document.createElement('a');
        link.className = 'resume-link';
        link.href = href;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = item.publicationTitle || 'View Publication';
        card.appendChild(link);
      }
    }

    return card;
  }

  function renderResumeOverview(data, tabs) {
    const overview = document.getElementById('resume-overview');
    if (!overview) return;
    overview.innerHTML = '';

    const currentRole = (data.experience || []).find(isCurrentResumeItem) || (data.experience || [])[0];
    const totalExperience = (data.experience || []).length;
    const totalEducation = (data.education || []).length;
    const totalCertifications = (data.certifications || []).length;
    const totalResearch = (data.research || []).length;

    const intro = el('div', 'resume-overview-intro');
    intro.appendChild(el('span', 'resume-kicker', 'Professional profile'));
    intro.appendChild(el('h3', null, data.summary?.name || 'Resume'));
    intro.appendChild(el('p', null, data.summary?.text || ''));

    const metrics = el('div', 'resume-metrics');
    [
      [totalExperience, 'Roles'],
      [totalEducation, 'Degrees'],
      [totalCertifications, 'Certifications'],
      [totalResearch, 'Research'],
    ].forEach(([value, label]) => {
      const metric = el('div', 'resume-metric');
      metric.appendChild(el('strong', null, String(value)));
      metric.appendChild(el('span', null, label));
      metrics.appendChild(metric);
    });
    intro.appendChild(metrics);

    const spotlight = el('aside', 'resume-current');
    spotlight.appendChild(el('span', 'resume-kicker', 'Current focus'));
    if (currentRole) {
      spotlight.appendChild(el('h4', null, currentRole.title || 'Current role'));
      spotlight.appendChild(el('p', null, getResumeOrganization(currentRole)));
      const meta = el('div', 'resume-current-meta');
      appendResumePill(meta, currentRole.period, 'resume-pill resume-pill-current');
      deriveResumeTags(currentRole).slice(0, 3).forEach(tag => appendResumePill(meta, tag, 'resume-tag'));
      spotlight.appendChild(meta);
    }

    const quickNav = el('div', 'resume-quick-nav');
    tabs.forEach(tab => {
      appendResumePill(quickNav, `${tab.items.length} ${tab.shortLabel}`, 'resume-mini-stat');
    });
    spotlight.appendChild(quickNav);

    overview.appendChild(intro);
    overview.appendChild(spotlight);
  }

  function buildResumeTabs(data) {
    const areaItems = data.areasOfInterest?.title || data.areasOfInterest?.description
      ? [{
        title: data.areasOfInterest.title || 'Areas of Interest',
        description: data.areasOfInterest.description || '',
        institution: '',
        period: '',
      }]
      : [];
    return [
      { id: 'experience', label: 'Experience', shortLabel: 'roles', items: data.experience || [], hasBullets: true, compact: true },
      { id: 'education', label: 'Education', shortLabel: 'degrees', items: data.education || [], hasBullets: false, compact: false },
      { id: 'certifications', label: 'Certifications', shortLabel: 'certs', items: data.certifications || [], hasBullets: false, compact: false },
      { id: 'honors', label: 'Honors', shortLabel: 'honors', items: data.honors || [], hasBullets: false, compact: false },
      { id: 'research', label: 'Research', shortLabel: 'items', items: data.research || [], hasBullets: true, compact: true },
      { id: 'interests', label: 'Interests', shortLabel: 'areas', items: areaItems, hasBullets: false, compact: false },
    ].filter(tab => tab.items.length);
  }

  function renderResume(data) {
    if (!data) return;

    const tabsWrap = document.getElementById('resume-tabs');
    const panelsWrap = document.getElementById('resume-panels');
    if (!tabsWrap || !panelsWrap) return;

    const tabs = buildResumeTabs(data);
    tabsWrap.innerHTML = '';
    panelsWrap.innerHTML = '';
    renderResumeOverview(data, tabs);

    tabs.forEach((tab, index) => {
      const isActive = index === 0;
      const tabButton = document.createElement('button');
      tabButton.type = 'button';
      tabButton.className = 'resume-tab' + (isActive ? ' active' : '');
      tabButton.id = `resume-tab-${tab.id}`;
      tabButton.setAttribute('role', 'tab');
      tabButton.setAttribute('aria-selected', String(isActive));
      tabButton.setAttribute('aria-controls', `resume-panel-${tab.id}`);
      tabButton.textContent = tab.label;
      tabsWrap.appendChild(tabButton);

      const panel = el('div', 'resume-panel' + (isActive ? ' active' : ''));
      panel.id = `resume-panel-${tab.id}`;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tabButton.id);
      if (!isActive) panel.hidden = true;

      const panelHeader = el('div', 'resume-panel-header');
      panelHeader.appendChild(el('h3', null, tab.label));
      panelHeader.appendChild(el('span', null, `${tab.items.length} item${tab.items.length === 1 ? '' : 's'}`));
      panel.appendChild(panelHeader);

      const grid = el('div', 'resume-card-grid');
      tab.items.forEach(item => grid.appendChild(renderResumeCard(item, {
        hasBullets: tab.hasBullets,
        compact: tab.compact,
      })));
      panel.appendChild(grid);
      panelsWrap.appendChild(panel);

      tabButton.addEventListener('click', () => {
        tabsWrap.querySelectorAll('.resume-tab').forEach(button => {
          button.classList.remove('active');
          button.setAttribute('aria-selected', 'false');
        });
        panelsWrap.querySelectorAll('.resume-panel').forEach(item => {
          item.classList.remove('active');
          item.hidden = true;
        });
        tabButton.classList.add('active');
        tabButton.setAttribute('aria-selected', 'true');
        panel.classList.add('active');
        panel.hidden = false;
      });
    });
  }

  // ──────────────────────────────────────────────
  // 5. CONTACT
  // ──────────────────────────────────────────────
  function renderContact(data) {
    if (!data) return;

    // Address
    const addressEl = document.getElementById('contact-address');
    if (addressEl) addressEl.textContent = data.address;

    // Emails
    const emailEl = document.getElementById('contact-emails');
    if (emailEl && data.emails) {
      emailEl.innerHTML = '';
      data.emails.forEach((email, i) => {
        if (i > 0) emailEl.appendChild(txt(' | '));
        const a = document.createElement('a');
        a.href = 'mailto:' + email.address;
        a.textContent = email.address;
        emailEl.appendChild(a);
      });
    }

    // Phones
    const phoneEl = document.getElementById('contact-phones');
    if (phoneEl && data.phones) {
      phoneEl.innerHTML = '';
      data.phones.forEach((phone, i) => {
        if (i > 0) phoneEl.appendChild(txt(' | '));
        const a = document.createElement('a');
        a.href = 'tel:' + phone.tel;
        a.textContent = phone.number;
        phoneEl.appendChild(a);
      });
    }

    // Social links in contact section
    const socialEl = document.getElementById('contact-social-links');
    if (socialEl && data.socialLinks) {
      socialEl.innerHTML = '';
      data.socialLinks.forEach(link => {
        const href = sanitizeUrl(link.url);
        if (!href) return;
        const a = document.createElement('a');
        a.href = href;
        a.className = link.platform;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.setAttribute('aria-label', link.platform || 'Social profile');
        a.title = link.platform || 'Social profile';
        const i = el('i', link.icon);
        i.setAttribute('aria-hidden', 'true');
        a.appendChild(i);
        socialEl.appendChild(a);
      });
    }
  }

  // ──────────────────────────────────────────────
  // FETCH ALL DATA & RENDER
  // ──────────────────────────────────────────────
  const [settings, site, profile, skills, interests, resume, contact] = await Promise.all([
    fetchJson('/api/settings/public'),
    fetchJson('/api/site'),
    fetchSection('profile'),
    fetchSection('skills'),
    fetchSection('interests'),
    fetchSection('resume'),
    fetchSection('contact'),
  ]);

  if (settings?.images?.backgroundImage) setBackgroundImage(settings.images.backgroundImage);
  if (settings?.analytics?.googleMeasurementId) loadAnalytics(settings.analytics.googleMeasurementId);
  applyPublicSite(site);
  renderProfile(profile, settings);
  renderSkills(skills);
  renderInterests(interests);
  renderResume(resume);
  renderContact(contact);
});
