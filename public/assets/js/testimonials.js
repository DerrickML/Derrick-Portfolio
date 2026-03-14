document.addEventListener('DOMContentLoaded', function() {
    fetch('/api/testimonials')
      .then(response => response.json())
      .then(data => {
        const testimonialsContainer = document.getElementById('testimonials-container');
  
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
          testimonialItem.appendChild(h3);
          testimonialItem.appendChild(h4);
  
          swiperSlide.appendChild(testimonialItem);
          testimonialsContainer.appendChild(swiperSlide);
        });
  
        // Initialize Swiper
        new Swiper('.testimonials-slider', {
          speed: 600,
          loop: true,
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
  
      })
      .catch(error => {
        console.error('Error fetching testimonials:', error);
      });
  });
  