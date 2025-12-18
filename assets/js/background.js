/* assets/js/background.js */

tsParticles.load("particles-js", {
    fpsLimit: 60,
    particles: {
        number: { value: 60, density: { enable: true, area: 800 } },
        color: { value: "#888888" },
        shape: { type: "circle" },
        opacity: { value: 0.5 },
        size: { value: 4 },
        
        // 1. COLLISION PHYSICS
        collisions: {
            enable: true,
            mode: "bounce" // Particles still bounce off each other
        },
        move: {
            enable: true,
            speed: 1.5,
            direction: "none",
            random: false,
            straight: false,
            
            // 2. WRAP AROUND (The "Asteroids" Effect)
            // "out" makes them reappear on the other side. 
            // "bounce" makes them hit the wall and turn back.
            outModes: { 
                default: "out" 
            },
            attract: { enable: false }
        },
        links: {
            enable: true,
            distance: 150,
            color: "#888888",
            opacity: 0.4,
            width: 1
        }
    },
    interactivity: {
        events: {
            onHover: { enable: true, mode: "repulse" },
            onClick: { enable: true, mode: "push" },
            resize: true
        },
        modes: {
            repulse: { distance: 100, duration: 0.4 }
        }
    },
    detectRetina: true
});
