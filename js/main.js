// js/main.js

// FUTURE USE: want to add a hamburger button for toggling.
document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.querySelector('.navbar-toggle');
    const navLinks = document.querySelector('.navbar-links');

    // Basic toggle functionality:
    toggleBtn.addEventListener('click', () => {
        const expanded = toggleBtn.getAttribute('aria-expanded') === 'true' || false;
        toggleBtn.setAttribute('aria-expanded', !expanded);
        toggleBtn.classList.toggle('active');
        navLinks.classList.toggle('open');
    });
});