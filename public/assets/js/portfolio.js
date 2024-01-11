document.addEventListener('DOMContentLoaded', function() {
    fetch('/api/portfolio')
        .then(response => response.json())
        .then(data => {
            const portfolioContainer = document.querySelector('.portfolio-container');
            data.forEach(item => {
                const portfolioItem = document.createElement('div');
                portfolioItem.className = 'col-lg-4 col-md-6 portfolio-item filter-app';
                portfolioItem.innerHTML = `
                    <div class="portfolio-wrap">
                        <img src="assets/img/portfolio/${item.image}" class="img-fluid" alt="">
                        <div class="portfolio-info">
                            <h4>${item.title}</h4>
                            <p>${item.category}</p>
                            <div class="portfolio-links">
                                <a href="portfolio-details.html?id=${item.id}" class="portfolio-details-lightbox" title="Portfolio Details"><i class="bx bx-link"></i></a>
                            </div>
                        </div>
                    </div>`;
                portfolioContainer.appendChild(portfolioItem);
            });
        })
        .catch(error => console.error('Error:', error));
});
