/* assets/js/typewriter.js */

const typeSpeed = 25; // Faster typing reduces "waiting" feel

document.querySelectorAll('.project-item').forEach(item => {
    const displayArea = item.querySelector('.project-desc');
    // We use .innerHTML instead of .textContent to preserve spacing if needed
    const sourceElement = item.querySelector('.hidden-text'); 
    
    // Safety check: ensure elements exist before running
    if (!displayArea || !sourceElement) return;

    const sourceText = sourceElement.textContent.trim();
    let typeInterval;

    item.addEventListener('mouseenter', () => {
        // 1. Clear any existing intervals immediately
        clearInterval(typeInterval);
        
        // 2. Reset the display
        displayArea.style.opacity = '1';
        displayArea.textContent = ''; 
        
        let charIndex = 0;

        // 3. Start Typing Loop
        typeInterval = setInterval(() => {
            if (charIndex < sourceText.length) {
                displayArea.textContent += sourceText.charAt(charIndex);
                charIndex++;
            } else {
                clearInterval(typeInterval);
            }
        }, typeSpeed);
    });

    item.addEventListener('mouseleave', () => {
        clearInterval(typeInterval); // Stop typing
        displayArea.style.opacity = '0'; // Fade out
        
        // Clear text after fade completes to prevent layout jumps
        setTimeout(() => {
             // Only clear if the user hasn't hovered back over it
             if (displayArea.style.opacity === '0') {
                 displayArea.textContent = '';
             }
        }, 300);
    });
});
