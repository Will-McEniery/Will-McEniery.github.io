document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById('spin-canvas-container');
    // Safety check: Exit if we aren't on a page with this specific widget or if Three.js failed to load
    if (!container || typeof THREE === 'undefined') return;

    // Clear any leftover canvases if the browser reloaded
    container.innerHTML = '';

    // 1. Scene & Camera Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111); // Sleek dark lab-simulation background

    const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    camera.position.set(3.5, 2.5, 4.5);
    camera.lookAt(0, 0.5, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(renderer.domElement);

    // 2. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(5, 10, 7);
    scene.add(dirLight);

    // 3. Physics Elements
    // Central sphere representing the particle/electron/nucleus
    const sphereGeo = new THREE.SphereGeometry(0.2, 32, 32);
    const sphereMat = new THREE.MeshPhongMaterial({ color: 0x888888, shininess: 80 });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    scene.add(sphere);

    // Magnetic Field B (Y-axis pointing up) -> Blue Arrow
    const bDir = new THREE.Vector3(0, 1, 0);
    const bOrigin = new THREE.Vector3(0, -1.5, 0);
    const bLength = 3.5;
    const bArrow = new THREE.ArrowHelper(bDir, bOrigin, bLength, 0x4488ff, 0.2, 0.15);
    scene.add(bArrow);

    // Spin Vector S -> Red/Orange Arrow
    let thetaDeg = 45;
    let thetaRad = THREE.MathUtils.degToRad(thetaDeg);
    let phiRad = 0;
    const spinLength = 2.0;

    const spinDir = new THREE.Vector3(
        Math.sin(thetaRad) * Math.cos(phiRad),
        Math.cos(thetaRad),
        Math.sin(thetaRad) * Math.sin(phiRad)
    ).normalize();
    
    const spinOrigin = new THREE.Vector3(0, 0, 0);
    const spinArrow = new THREE.ArrowHelper(spinDir, spinOrigin, spinLength, 0xff4422, 0.3, 0.2);
    scene.add(spinArrow);

    // Precession Trajectory Ring (traces the circle path of the arrow tip)
    let ringMesh;
    function updateTrajectoryRing(theta) {
        if (ringMesh) scene.remove(ringMesh);
        const radius = spinLength * Math.sin(theta);
        const height = spinLength * Math.cos(theta);
        
        const ringGeo = new THREE.BufferGeometry();
        const points = [];
        for (let i = 0; i <= 64; i++) {
            const angle = (i / 64) * Math.PI * 2;
            points.push(new THREE.Vector3(radius * Math.cos(angle), height, radius * Math.sin(angle)));
        }
        ringGeo.setFromPoints(points);
        const ringMat = new THREE.LineBasicMaterial({ color: 0x666666, transparent: true, opacity: 0.5 });
        ringMesh = new THREE.Line(ringGeo, ringMat);
        scene.add(ringMesh);
    }
    updateTrajectoryRing(thetaRad);

    // 4. UI Controls (Slider to change precession angle theta)
    const slider = document.getElementById('precession-slider');
    const display = document.getElementById('theta-val');

    if (slider && display) {
        slider.addEventListener('input', (e) => {
            thetaDeg = parseFloat(e.target.value);
            display.innerHTML = `${thetaDeg}&deg;`;
            thetaRad = THREE.MathUtils.degToRad(thetaDeg);
            updateTrajectoryRing(thetaRad); // Redraw the circle trajectory at the new angle
        });
    }

    // 5. Animation Loop
    function animate() {
        requestAnimationFrame(animate);

        // Advance azimuthal angle phi over time to simulate Larmor precession
        phiRad += 0.03; 

        // Calculate new vector direction
        const newDir = new THREE.Vector3(
            Math.sin(thetaRad) * Math.cos(phiRad),
            Math.cos(thetaRad),
            Math.sin(thetaRad) * Math.sin(phiRad)
        ).normalize();

        // Update arrow orientation
        spinArrow.setDirection(newDir);
        spinArrow.setLength(spinLength, 0.3, 0.2);

        renderer.render(scene, camera);
    }
    animate();

    // 6. Handle Window Resizing gracefully
    window.addEventListener('resize', () => {
        if (!container) return;
        camera.aspect = container.clientWidth / container.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(container.clientWidth, container.clientHeight);
    });
});
