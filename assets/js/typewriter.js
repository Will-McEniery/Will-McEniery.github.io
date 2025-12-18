/* assets/js/typewriter.js */

const typeSpeed = 30; // Milliseconds per character (lower = faster)

document.querySelectorAll('.project-item').forEach(item => {
    const title = item.querySelector('h3');
    const displayArea = item.querySelector('.project-desc');
    const sourceText = item.querySelector('.hidden-text').textContent.trim();
    let typeInterval;

    // 1. MOUSE ENTER: Start Typing
    item.addEventListener('mouseenter', () => {
        // Reset state
        displayArea.style.opacity = '1';
        displayArea.textContent = ''; 
        let charIndex = 0;

        // Clear any fading/typing from previous events
        clearInterval(typeInterval);

        // Start the typing loop
        typeInterval = setInterval(() => {
            if (charIndex < sourceText.length) {
                displayArea.textContent += sourceText.charAt(charIndex);
                charIndex++;
            } else {
                clearInterval(typeInterval); // Stop when finished
            }
        }, typeSpeed);
    });

    // 2. MOUSE LEAVE: Fade Out & Reset
    item.addEventListener('mouseleave', () => {
        clearInterval(typeInterval); // Stop typing immediately
        
        // Fade out whatever text was currently visible
        displayArea.style.opacity = '0';
        
        // Wait for fade to finish (0.3s), then clear text
        setTimeout(() => {
            displayArea.textContent = '';
        }, 300);
    });
});
