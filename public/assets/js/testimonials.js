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
  
          testimonialItem.innerHTML = `
            <p>
              <i class="bx bxs-quote-alt-left quote-icon-left"></i>
              ${testimonial.quote}
              <i class="bx bxs-quote-alt-right quote-icon-right"></i>
            </p>
            <!--<img src="${testimonial.image}" class="testimonial-img" alt="${testimonial.name}">-->
            <h3>${testimonial.name}</h3>
            <h4>${testimonial.title}</h4>
          `;
  
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
          slidesPerView: 'auto',
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
              slidesPerView: 3,
              spaceBetween: 20
            }
          }
        });
  
      })
      .catch(error => {
        console.error('Error fetching testimonials:', error);
      });
  });
  