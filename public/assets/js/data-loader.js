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

  // Fetch JSON from our API
  async function fetchSection(section) {
    try {
      const res = await fetch(`/api/portfolio/${section}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.error(`Error loading ${section}:`, err);
      return null;
    }
  }

  // ──────────────────────────────────────────────
  // 1. PROFILE (Header + About)
  // ──────────────────────────────────────────────
  function renderProfile(data) {
    if (!data) return;

    // Header name
    const headerName = document.getElementById('header-name');
    if (headerName) headerName.textContent = data.name;

    // Header tagline (contains safe HTML markup like <span>)
    const headerTagline = document.getElementById('header-tagline');
    if (headerTagline) headerTagline.innerHTML = data.tagline;

    // About title
    const aboutTitle = document.getElementById('about-title');
    if (aboutTitle) aboutTitle.textContent = data.aboutTitle;

    // About text (contains safe internal HTML with <a> links)
    const aboutText = document.getElementById('about-text');
    if (aboutText) aboutText.innerHTML = data.aboutText;

    // Profile image
    const profileImg = document.getElementById('profile-image');
    if (profileImg) {
      profileImg.src = data.profileImage;
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
        span.innerHTML = detail.value;
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
        const a = document.createElement('a');
        a.href = link.url;
        a.className = link.platform;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        const i = el('i', link.icon);
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
        const a = document.createElement('a');
        a.href = link.url;
        a.className = link.platform;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        const i = el('i', link.icon);
        a.appendChild(i);
        socialEl.appendChild(a);
      });
    }
  }

  // ──────────────────────────────────────────────
  // FETCH ALL DATA & RENDER
  // ──────────────────────────────────────────────
  const [profile, skills, interests, resume, contact] = await Promise.all([
    fetchSection('profile'),
    fetchSection('skills'),
    fetchSection('interests'),
    fetchSection('resume'),
    fetchSection('contact'),
  ]);

  renderProfile(profile);
  renderSkills(skills);
  renderInterests(interests);
  renderResume(resume);
  renderContact(contact);
});
