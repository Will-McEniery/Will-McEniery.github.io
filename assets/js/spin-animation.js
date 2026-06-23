document.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById('spin-canvas');
    if (!canvas) return; // Exit if canvas isn't on the page

    const slider = document.getElementById('precession-slider');
    const display = document.getElementById('theta-val');

    slider.addEventListener('input', (e) => {
        const theta = e.target.value;
        display.innerText = `${theta}°`;
        // Insert your 3D rotation matrix or rendering logic here
        // e.g., updateSpinAxis(theta);
    });

    // Setup rendering loop (Three.js, vanilla Canvas, etc.)
    function animate() {
        requestAnimationFrame(animate);
        // Draw the precessing spin
    }
    animate();
});
