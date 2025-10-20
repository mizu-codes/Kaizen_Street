
    // Mobile Menu Functionality
document.addEventListener('DOMContentLoaded', function() {
    
    // Get elements
    const burgerIcon = document.querySelector('.burger-icon');
    const mobileMenu = document.querySelector('.mobile-header-active');
    const closeButton = document.querySelector('.mobile-menu-close .close-style');
    const body = document.body;
    
    // Create overlay if it doesn't exist
    let overlay = document.querySelector('.body-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'body-overlay';
        body.appendChild(overlay);
    }
    
    // Function to open mobile menu
    function openMobileMenu() {
        if (mobileMenu) {
            mobileMenu.classList.add('sidebar-visible');
            overlay.classList.add('active');
            body.style.overflow = 'hidden';
        }
    }
    
    // Function to close mobile menu
    function closeMobileMenu() {
        if (mobileMenu) {
            mobileMenu.classList.remove('sidebar-visible');
            overlay.classList.remove('active');
            body.style.overflow = '';
        }
    }
    
    // Burger icon click event
    if (burgerIcon) {
        burgerIcon.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            openMobileMenu();
        });
    }
    
    // Close button click event
    if (closeButton) {
        closeButton.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            closeMobileMenu();
        });
    }
    
    // Overlay click event
    if (overlay) {
        overlay.addEventListener('click', function() {
            closeMobileMenu();
        });
    }
    
    // Close menu when clicking on a menu link
    const mobileMenuLinks = document.querySelectorAll('.mobile-menu a');
    mobileMenuLinks.forEach(function(link) {
        link.addEventListener('click', function() {
            // Don't close immediately, let the navigation happen
            setTimeout(closeMobileMenu, 300);
        });
    });
    
    // Close menu on escape key
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && mobileMenu.classList.contains('sidebar-visible')) {
            closeMobileMenu();
        }
    });
    
    // Handle window resize
    let resizeTimer;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() {
            // Close mobile menu if window is resized to desktop
            if (window.innerWidth >= 992 && mobileMenu.classList.contains('sidebar-visible')) {
                closeMobileMenu();
            }
        }, 250);
    });
    
    // Mobile Search Clear Button
    const mobileSearchInput = document.querySelector('.mobile-search input[name="search"]');
    const mobileSearchForm = document.querySelector('.mobile-search form');
    
    if (mobileSearchInput && mobileSearchForm) {
        // Add clear button if needed
        const clearBtn = document.createElement('button');
        clearBtn.type = 'button';
        clearBtn.className = 'mobile-search-clear';
        clearBtn.innerHTML = '&times;';
        clearBtn.style.cssText = 'position: absolute; right: 50px; top: 50%; transform: translateY(-50%); background: none; border: none; font-size: 24px; color: #888; cursor: pointer; padding: 0; width: 30px; height: 30px; display: none;';
        
        mobileSearchForm.style.position = 'relative';
        mobileSearchForm.appendChild(clearBtn);
        
        // Show/hide clear button
        mobileSearchInput.addEventListener('input', function() {
            if (this.value.length > 0) {
                clearBtn.style.display = 'block';
            } else {
                clearBtn.style.display = 'none';
            }
        });
        
        // Clear input when button clicked
        clearBtn.addEventListener('click', function() {
            mobileSearchInput.value = '';
            clearBtn.style.display = 'none';
            mobileSearchInput.focus();
        });
    }
    
    // Sticky header on scroll
    const header = document.querySelector('.header-bottom');
    if (header) {
        let lastScroll = 0;
        
        window.addEventListener('scroll', function() {
            const currentScroll = window.pageYOffset;
            
            if (currentScroll > 100) {
                header.classList.add('stick');
            } else {
                header.classList.remove('stick');
            }
            
            lastScroll = currentScroll;
        });
    }
    
    // Image lazy loading fallback
    if ('loading' in HTMLImageElement.prototype) {
        const images = document.querySelectorAll('img[loading="lazy"]');
        images.forEach(img => {
            img.src = img.dataset.src || img.src;
        });
    } else {
        // Fallback for browsers that don't support lazy loading
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/lazysizes/5.3.2/lazysizes.min.js';
        document.body.appendChild(script);
    }
    
    console.log('Mobile menu functionality initialized');
});

// Export functions if needed
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        openMobileMenu: function() {
            document.querySelector('.mobile-header-active')?.classList.add('sidebar-visible');
        },
        closeMobileMenu: function() {
            document.querySelector('.mobile-header-active')?.classList.remove('sidebar-visible');
        }
    };
}
