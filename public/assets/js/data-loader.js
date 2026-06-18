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
  function renderResumeItem(item, hasBullets) {
    const div = el('div', 'resume-item');
    div.appendChild(el('h4', null, item.title));

    if (item.organization || item.institution) {
      const p = document.createElement('p');
      const em = el('em', null, item.organization || item.institution);
      p.appendChild(em);
      div.appendChild(p);
    }

    if (item.period) {
      div.appendChild(el('h5', null, item.period));
    }

    if (hasBullets && item.bullets && item.bullets.length) {
      const ul = document.createElement('ul');
      item.bullets.forEach(b => ul.appendChild(el('li', null, b)));
      div.appendChild(ul);
    } else if (item.description) {
      div.appendChild(el('p', null, item.description));
    }

    if (item.publicationUrl) {
      const p = document.createElement('p');
      const a = document.createElement('a');
      a.href = item.publicationUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = item.publicationTitle || 'View Publication';
      p.appendChild(a);
      div.appendChild(p);
    }

    return div;
  }

  function renderResume(data) {
    if (!data) return;

    const leftCol = document.getElementById('resume-left');
    const rightCol = document.getElementById('resume-right');
    if (!leftCol || !rightCol) return;
    leftCol.innerHTML = '';
    rightCol.innerHTML = '';

    // LEFT COLUMN: Summary + Professional Experience
    if (data.summary) {
      leftCol.appendChild(el('h3', 'resume-title', 'Summary'));
      const summaryDiv = el('div', 'resume-item pb-0');
      summaryDiv.appendChild(el('h4', null, data.summary.name));
      summaryDiv.appendChild(el('p', null, data.summary.text));
      leftCol.appendChild(summaryDiv);
    }

    if (data.experience && data.experience.length) {
      leftCol.appendChild(el('h3', 'resume-title', 'Professional Experience'));
      data.experience.forEach(exp => leftCol.appendChild(renderResumeItem(exp, true)));
    }

    // RIGHT COLUMN: Education, Certifications, Honors, Research, Areas of Interest
    if (data.education && data.education.length) {
      rightCol.appendChild(el('h3', 'resume-title', 'Education'));
      data.education.forEach(edu => rightCol.appendChild(renderResumeItem(edu, false)));
    }

    if (data.certifications && data.certifications.length) {
      rightCol.appendChild(el('h3', 'resume-title', 'Certifications'));
      data.certifications.forEach(cert => rightCol.appendChild(renderResumeItem(cert, false)));
    }

    if (data.honors && data.honors.length) {
      rightCol.appendChild(el('h3', 'resume-title', 'Honors and Awards'));
      data.honors.forEach(honor => rightCol.appendChild(renderResumeItem(honor, false)));
    }

    if (data.research && data.research.length) {
      rightCol.appendChild(el('h3', 'resume-title', 'Research Experience'));
      data.research.forEach(r => rightCol.appendChild(renderResumeItem(r, true)));
    }

    if (data.areasOfInterest) {
      rightCol.appendChild(el('h3', 'resume-title', 'Areas of Interest'));
      const aoiDiv = el('div', 'resume-item pb-0');
      const aoiP1 = document.createElement('p');
      aoiP1.appendChild(el('em', null, data.areasOfInterest.title));
      aoiDiv.appendChild(aoiP1);
      aoiDiv.appendChild(el('p', null, data.areasOfInterest.description));
      rightCol.appendChild(aoiDiv);
    }
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
