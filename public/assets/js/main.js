/**
* Template Name: Personal
* Updated: Sep 18 2023 with Bootstrap v5.3.2
* Template URL: https://bootstrapmade.com/personal-free-resume-bootstrap-template/
* Author: BootstrapMade.com
* License: https://bootstrapmade.com/license/
*/
(function() {
  "use strict";

  /**
   * Easy selector helper function
   */
  const select = (el, all = false) => {
    el = el.trim()
    if (all) {
      return [...document.querySelectorAll(el)]
    } else {
      try { return document.querySelector(el) } catch { return null }
    }
  }

  /**
   * Easy event listener function
   */
  const on = (type, el, listener, all = false) => {
    let selectEl = select(el, all)

    if (selectEl) {
      if (all) {
        selectEl.forEach(e => e.addEventListener(type, listener))
      } else {
        selectEl.addEventListener(type, listener)
      }
    }
  }

  /**
   * Scrolls to an element with header offset
   */
  const scrollto = (el) => {
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    })
  }

  /**
   * Mobile nav toggle
   */
  const navbarToggle = select('.mobile-nav-toggle');
  const navbar = select('#navbar');
  const setMobileMenu = isOpen => {
    navbar.classList.toggle('navbar-mobile', isOpen);
    navbarToggle.classList.toggle('bi-list', !isOpen);
    navbarToggle.classList.toggle('bi-x', isOpen);
    navbarToggle.setAttribute('aria-expanded', String(isOpen));
    navbarToggle.setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
  };
  on('click', '.mobile-nav-toggle', function() {
    setMobileMenu(!navbar.classList.contains('navbar-mobile'));
  });
  document.addEventListener('keydown', event => {
    if (!navbar.classList.contains('navbar-mobile')) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      setMobileMenu(false);
      navbarToggle.focus();
    } else if (event.key === 'Tab') {
      const targets = [...navbar.querySelectorAll('a[href], button')].filter(item => item.getClientRects().length);
      const index = targets.indexOf(document.activeElement);
      if (event.shiftKey && index <= 0) {
        event.preventDefault();
        targets[targets.length - 1].focus();
      } else if (!event.shiftKey && (index < 0 || index === targets.length - 1)) {
        event.preventDefault();
        targets[0].focus();
      }
    }
  });
  window.matchMedia('(min-width: 992px)').addEventListener('change', event => {
    if (event.matches) setMobileMenu(false);
  });

  /**
   * Scrool with ofset on links with a class name .scrollto
   */
  on('click', '#navbar .nav-link', function(e) {
    let section = select(this.hash)
    if (section) {
      e.preventDefault()

      let navbar = select('#navbar')
      let header = select('#header')
      let sections = select('section', true)
      let navlinks = select('#navbar .nav-link', true)

      navlinks.forEach((item) => {
        item.classList.remove('active')
      })

      this.classList.add('active')
      history.replaceState(null, '', this.hash)
      sections.forEach(item => {
        item.inert = item !== section;
        item.setAttribute('aria-hidden', String(item !== section));
      })

      const wasMobile = navbar.classList.contains('navbar-mobile');
      setMobileMenu(false);

      if (this.hash == '#header') {
        header.classList.remove('header-top')
        sections.forEach((item) => {
          item.classList.remove('section-show')
        })
        if (wasMobile) select('#header-name').focus({ preventScroll: true });
        return;
      }

      header.classList.add('header-top')
      sections.forEach(item => item.classList.toggle('section-show', item === section))

      scrollto(this.hash)
      if (wasMobile || e.detail === 0) {
        const heading = section.querySelector('.section-title h2');
        if (heading) {
          heading.tabIndex = -1;
          const previousFocus = document.activeElement;
          const focusHeading = () => {
            const focusUnchanged = document.activeElement === previousFocus || document.activeElement === document.body;
            if (section.classList.contains('section-show') && !section.inert && focusUnchanged) {
              heading.focus({ preventScroll: true });
            }
          };
          focusHeading();
          // Visibility transitions can prevent focus until the section has appeared.
          if (document.activeElement !== heading) {
            section.addEventListener('transitionend', focusHeading, { once: true });
          }
        }
      }
    }
  }, true)

  /**
   * Activate/show sections on load with hash links
   */
  window.addEventListener('load', () => {
    const validHash = ['#about', '#resume', '#projects', '#contact'].includes(window.location.hash);
    select('section', true).forEach(section => {
      const active = validHash && `#${section.id}` === window.location.hash;
      section.inert = !active;
      section.setAttribute('aria-hidden', String(!active));
    });
    if (validHash) {
      let initial_nav = select(window.location.hash)

      if (initial_nav) {
        let header = select('#header')
        let navlinks = select('#navbar .nav-link', true)

        header.classList.add('header-top')

        navlinks.forEach((item) => {
          if (item.getAttribute('href') == window.location.hash) {
            item.classList.add('active')
          } else {
            item.classList.remove('active')
          }
        })

        initial_nav.classList.add('section-show')

        scrollto(window.location.hash)
      }
    }
  });

  /**
   * Skills animation
   */
  let skilsContent = select('.skills-content');
  if (skilsContent) {
    new Waypoint({
      element: skilsContent,
      offset: '80%',
      handler: function(direction) {
        let progress = select('.progress .progress-bar', true);
        progress.forEach((el) => {
          el.style.width = el.getAttribute('aria-valuenow') + '%'
        });
      }
    })
  }

})()
