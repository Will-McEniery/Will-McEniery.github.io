function initTypewriter() {
    const typeSpeed = 25;

    document.querySelectorAll('.project-item').forEach(item => {
        const displayArea = item.querySelector('.project-desc');
        const sourceElement = item.querySelector('.hidden-text'); 
        
        if (!displayArea || !sourceElement) return;

        const sourceText = sourceElement.textContent.trim();
        let typeInterval;

        item.addEventListener('mouseenter', () => {
             // mouseenter logic
             clearInterval(typeInterval);
             displayArea.style.opacity = '1';
             displayArea.textContent = ''; 
             let charIndex = 0;
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
             // mouseleave logic
             clearInterval(typeInterval); 
             displayArea.style.opacity = '0';
             setTimeout(() => {
                 if (displayArea.style.opacity === '0') {
                     displayArea.textContent = '';
                 }
            }, 300);
        });
    });
}

// Run immediately when the file loads for the first time
initTypewriter();
