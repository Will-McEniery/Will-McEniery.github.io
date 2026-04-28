// script.js
document.addEventListener('DOMContentLoaded', function() {
    // Dark mode toggle functionality
    const darkModeToggle = document.querySelector('.dark-mode-toggle');
    const body = document.body;
    
    // Check for saved theme preference or respect OS preference
    const savedTheme = localStorage.getItem('theme');
    const prefersDarkScheme = window.matchMedia('(prefers-color-scheme: dark)');
    
    if (savedTheme === 'dark' || (!savedTheme && prefersDarkScheme.matches)) {
        body.setAttribute('data-theme', 'dark');
        darkModeToggle.textContent = '☀️';
    }
    
    darkModeToggle.addEventListener('click', function() {
        if (body.getAttribute('data-theme') === 'dark') {
            body.setAttribute('data-theme', 'light');
            darkModeToggle.textContent = '🌙';
            localStorage.setItem('theme', 'light');
        } else {
            body.setAttribute('data-theme', 'dark');
            darkModeToggle.textContent = '☀️';
            localStorage.setItem('theme', 'dark');
        }
    });
    
    // Page navigation
    const navLinks = document.querySelectorAll('.nav-link');
    
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Remove active class from all links
            navLinks.forEach(l => l.classList.remove('active'));
            
            // Add active class to clicked link
            this.classList.add('active');
            
            // Get target page
            const targetPage = this.getAttribute('href').substring(1);
            
            // Hide all pages
            document.querySelectorAll('.page').forEach(page => {
                page.classList.remove('active');
            });
            
            // Show target page
            document.getElementById(targetPage).classList.add('active');
        });
    });
    
    // CV section toggle functionality
    const cvTitles = document.querySelectorAll('.cv-title');
    
    cvTitles.forEach(title => {
        title.addEventListener('click', function() {
            this.classList.toggle('expanded');
            
            const content = this.nextElementSibling;
            content.classList.toggle('expanded');
        });
    });
    
    // Project item toggle functionality
    const projectItems = document.querySelectorAll('.project-item');
    
    projectItems.forEach(item => {
        const title = item.querySelector('h2');
        const details = item.querySelector('.project-details');
        
        title.addEventListener('click', function() {
            item.classList.toggle('expanded');
            details.classList.toggle('expanded');
        });
    });
    
    // Grid wave effect on mouse move
    const gridBackground = document.querySelector('.grid-background');
    
    document.addEventListener('mousemove', function(e) {
        if (!gridBackground) return;
        
        const x = e.clientX / window.innerWidth;
        const y = e.clientY / window.innerHeight;
        
        gridBackground.style.backgroundPosition = `${x * 100}% ${y * 100}%`;
    });
    
    // Initialize first page as active
    const firstPage = document.querySelector('.page');
    if (firstPage) {
        firstPage.classList.add('active');
    }
    
    // Typing animation for text elements
    const typingElements = document.querySelectorAll('.typing-text');
    
    typingElements.forEach(element => {
        const text = element.textContent;
        element.textContent = '';
        
        let i = 0;
        const typing = () => {
            if (i < text.length) {
                element.textContent += text.charAt(i);
                i++;
                setTimeout(typing, 50);
            }
        };
        
        typing();
    });
});
