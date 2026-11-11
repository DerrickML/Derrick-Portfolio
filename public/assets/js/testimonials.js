document.addEventListener('DOMContentLoaded', function() {
    const testimonialsContainer = document.getElementById('testimonials-container');
    const section = testimonialsContainer.closest('.testimonials');
    section.hidden = true;
    window.PortfolioData.fetchJson('/api/testimonials')
      .then(data => {
        if (!Array.isArray(data) || !data.length) {
          section.hidden = true;
          return;
        }
  
        data.forEach(testimonial => {
          const swiperSlide = document.createElement('div');
          swiperSlide.classList.add('swiper-slide');
  
          const testimonialItem = document.createElement('div');
          testimonialItem.classList.add('testimonial-item');
  
          // Build DOM safely to prevent XSS from external data
          const p = document.createElement('p');
          const quoteLeft = document.createElement('i');
          quoteLeft.className = 'bx bxs-quote-alt-left quote-icon-left';
          const quoteRight = document.createElement('i');
          quoteRight.className = 'bx bxs-quote-alt-right quote-icon-right';
          const quoteText = document.createTextNode(testimonial.quote || '');
          p.appendChild(quoteLeft);
          p.appendChild(quoteText);
          p.appendChild(quoteRight);

          const h3 = document.createElement('h3');
          h3.textContent = testimonial.name || '';
          const h4 = document.createElement('h4');
          h4.textContent = testimonial.title || '';

          testimonialItem.appendChild(p);
          const imageUrl = window.PortfolioData.safeUrl(testimonial.image);
          if (imageUrl) {
            const portrait = document.createElement('img'); portrait.src = imageUrl; portrait.alt = ''; portrait.className = 'testimonial-img'; portrait.loading = 'lazy';
            portrait.addEventListener('error', () => portrait.remove()); testimonialItem.appendChild(portrait);
          }
          testimonialItem.appendChild(h3);
          testimonialItem.appendChild(h4);
  
          swiperSlide.appendChild(testimonialItem);
          testimonialsContainer.appendChild(swiperSlide);
        });
  
        // Keep content availability independent of the configured section visibility.
        section.hidden = false;

        // Initialize Swiper
        const slider = new Swiper('.testimonials-slider', {
          speed: 600,
          loop: data.length > 1,
          autoplay: {
            delay: 5000,
            disableOnInteraction: false,
          },
          // slidesPerView: 'auto',
          slidesPerView: 1,
          pagination: {
            el: '.swiper-pagination',
            type: 'bullets',
            clickable: true,
          },
          breakpoints: {
            320: {
              slidesPerView: 1,
              spaceBetween: 20
            },
            1200: {
              slidesPerView: 1,
              spaceBetween: 20
            }
          }
        });
        const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        if (reducedMotion) {
          const updateMotion = () => {
            slider.params.speed = reducedMotion.matches ? 0 : 600;
            if (reducedMotion.matches) slider.autoplay.stop();
            else slider.autoplay.start();
          };
          reducedMotion.addEventListener('change', updateMotion);
          updateMotion();
        }
  
      })
      .catch(error => {
        section.hidden = true;
        console.error('Error fetching testimonials:', error);
      });
  });
