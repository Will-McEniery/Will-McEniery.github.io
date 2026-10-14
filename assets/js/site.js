// Theme toggle and mobile menu. The initial theme is set by _includes/theme-init.html.
(function () {
    const root = document.documentElement;

    const themeButton = document.getElementById('theme-toggle');
    function labelThemeButton() {
        const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        themeButton.setAttribute('aria-label', `Switch to ${next} theme`);
        themeButton.title = `Switch to ${next} theme`;
    }
    if (themeButton) {
        labelThemeButton();
        themeButton.addEventListener('click', () => {
            const next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            root.setAttribute('data-theme', next);
            try { localStorage.setItem('theme', next); } catch (e) { /* storage blocked: theme still applies for this page */ }
            labelThemeButton();
            window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: next } }));
        });
    }

    const menuButton = document.querySelector('.nav-menu-button');
    const nav = document.querySelector('.nav');
    if (menuButton && nav) {
        function setOpen(open) {
            nav.classList.toggle('is-open', open);
            menuButton.setAttribute('aria-expanded', String(open));
            menuButton.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        }
        menuButton.addEventListener('click', () => setOpen(!nav.classList.contains('is-open')));
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && nav.classList.contains('is-open')) {
                setOpen(false);
                menuButton.focus();
            }
        });
        document.addEventListener('click', (e) => {
            if (nav.classList.contains('is-open') && !nav.contains(e.target)) setOpen(false);
        });
    }
})();
