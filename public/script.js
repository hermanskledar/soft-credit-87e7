// Mobile navigation toggle
document.addEventListener('DOMContentLoaded', function() {
    const navToggle = document.querySelector('.nav-toggle');
    const navMenu = document.querySelector('nav ul');
    
    if (navToggle && navMenu) {
        navToggle.addEventListener('click', function() {
            navMenu.classList.toggle('active');
        });
    }
    
    // Close mobile menu when clicking outside
    document.addEventListener('click', function(event) {
        if (!event.target.closest('nav') && !event.target.closest('.nav-toggle')) {
            if (navMenu && navMenu.classList.contains('active')) {
                navMenu.classList.remove('active');
            }
        }
    });
    
    // Form validation
    const contactForm = document.getElementById('contactForm');
    if (contactForm) {
        contactForm.addEventListener('submit', function(event) {
            let valid = true;
            const name = document.getElementById('name');
            const email = document.getElementById('email');
            const message = document.getElementById('message');
            
            if (!name.value.trim()) {
                valid = false;
                name.classList.add('invalid');
            } else {
                name.classList.remove('invalid');
            }
            
            if (!email.value.trim() || !validateEmail(email.value)) {
                valid = false;
                email.classList.add('invalid');
            } else {
                email.classList.remove('invalid');
            }
            
            if (!message.value.trim()) {
                valid = false;
                message.classList.add('invalid');
            } else {
                message.classList.remove('invalid');
            }
            
            if (!valid) {
                event.preventDefault();
                alert('Please fill out all required fields correctly.');
            }
        });
    }
    
    // Email validation helper
    function validateEmail(email) {
        const re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
        return re.test(String(email).toLowerCase());
    }
});

        document.addEventListener('DOMContentLoaded', function() {
            // Document filtering functionality
            const filterButtons = document.querySelectorAll('.filter-btn');
            const documentCards = document.querySelectorAll('.document-card');
            
            filterButtons.forEach(button => {
                button.addEventListener('click', function() {
                    // Remove active class from all buttons
                    filterButtons.forEach(btn => btn.classList.remove('active'));
                    
                    // Add active class to clicked button
                    this.classList.add('active');
                    
                    const filter = this.getAttribute('data-filter');
                    
                    // Show/hide documents based on filter
                    documentCards.forEach(card => {
                        if (filter === 'all' || card.getAttribute('data-category') === filter) {
                            card.style.display = 'block';
                        } else {
                            card.style.display = 'none';
                        }
                    });
                });
            });
        });


//Mobile slider homepage

document.addEventListener('DOMContentLoaded', function() {
    // Only run on mobile
    if (window.innerWidth < 768) {
        const slider = document.querySelector('.pricing-slider');
        const indicators = document.querySelectorAll('.indicator');
        const boxes = document.querySelectorAll('.pricing-slider .price-box');
        
        // Update indicators based on scroll position
        function updateIndicators() {
            const index = Math.round(slider.scrollLeft / (slider.scrollWidth / boxes.length));
            indicators.forEach((indicator, i) => {
                indicator.classList.toggle('active', i === index);
            });
        }
        
        // Listen for scroll events on the slider
        slider.addEventListener('scroll', updateIndicators);
        
        // Make indicators clickable
        indicators.forEach((indicator, i) => {
            indicator.addEventListener('click', () => {
                const boxWidth = boxes[0].offsetWidth;
                const scrollPosition = i * (boxWidth + 20); // 20px is the gap between cards
                
                slider.scrollTo({
                    left: scrollPosition,
                    behavior: 'smooth'
                });
            });
        });
        
        // Make price boxes clickable to navigate
        boxes.forEach((box) => {
            box.addEventListener('click', (event) => {
                // Only trigger if not clicking a button or link inside
                if (!event.target.closest('a') && !event.target.closest('button')) {
                    // Calculate the left position of the clicked box
                    const boxLeft = box.offsetLeft;
                    const boxWidth = box.offsetWidth;
                    const sliderWidth = slider.offsetWidth;
                    
                    // Center the clicked box in the viewport
                    const centerPosition = boxLeft - (sliderWidth / 2) + (boxWidth / 2);
                    
                    slider.scrollTo({
                        left: centerPosition,
                        behavior: 'smooth'
                    });
                }
            });
        });
        
        // Initialize with first indicator active
        updateIndicators();
    }
});
 
