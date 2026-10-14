// Interactive spacetime-mesh background.
//   - The cursor is a mass: it sits in a 1/r well and drags a Kelvin wake behind it as it moves.
//   - Clicking (or tapping) drops a pebble: a short oscillating source that sends out rings.
// Physics lives in sim.js; this file wires it to the page, pointer, theme and animation loop.

import { WaveSim } from './sim.js';
import { SheetCamera } from './camera.js';
import { MeshRenderer } from './render.js';

const DT = 1 / 60;
const MAX_STEPS_PER_FRAME = 4;
const GRAVITY = 18000;          // px/s^2 (see sim.js)
const MASS_SIGMA = 34;          // px, width of the cursor's pressure patch
const MASS_DEPTH = 40;          // px, depth of the well under a resting cursor
const MASS_FOLLOW = 0.03;       // s, how quickly the mass catches up with the pointer
const MASS_FADE = 0.35;         // s, how quickly the mass appears / disappears
const PEBBLE_SIGMA = 16;        // px
const PEBBLE_OMEGA = 30;        // rad/s; deep-water wavelength 2*pi*g/omega^2 ~ 125 px
const PEBBLE_TIME = 1.6;        // s; the source rings down, sending out a train of weakening rings
const PEBBLE_FORCE = 60000;     // px/s^2 peak
const PEBBLE_DECAY = 0.4;       // s, ring-down time of the source
const GRID_SPACING = 30;        // px between drawn grid lines (near the screen centre)
const IDLE_RATE = 0.25;         // px/s RMS change in height; below this nothing visibly moves, so the loop sleeps
const INTERACTIVE = 'a, button, input, select, textarea, label, summary, [role="button"], [contenteditable], .no-ripple';

const canvas = document.getElementById('spacetime');
if (canvas && canvas.getContext && canvas.getContext('2d')) start(canvas);

function start(canvas) {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const renderer = new MeshRenderer(canvas);
    root.classList.add('has-spacetime');

    let world = null;
    let quality = 0;            // drops if frames are too slow on this device
    const mass = { x: 0, y: 0, tx: 0, ty: 0, strength: 0, target: 0, placed: false };
    const pebbles = [];
    let rafId = 0;
    let pointerAttached = false;
    let lastTime = 0;
    let accumulator = 0;
    const frameCosts = [];
    const stats = { frameCost: 0, frames: 0 };

    readColors();
    build();
    if (!reducedMotion.matches) {
        attachPointer();
        maybeWelcomeRipple();
    }

    // ---------------------------------------------------------------- setup

    function readColors() {
        const style = getComputedStyle(root);
        renderer.setColors({
            grid: style.getPropertyValue('--grid-rgb').trim() || '103, 232, 249',
            alpha: parseFloat(style.getPropertyValue('--grid-alpha')) || 0.4,
            mass: style.getPropertyValue('--mass-rgb').trim() || '251, 191, 36',
        });
    }

    function build() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        renderer.setSize(width, height, dpr);

        const camera = new SheetCamera(width, height, { pitch: 1.0, fov: 0.8 });
        const b = camera.visibleBounds();
        const spanX = (b.maxX - b.minX) * 1.3;
        const spanY = (b.maxY - b.minY) * 1.3;

        // Grid: ny rows, nx a power of two matching the aspect ratio; fewer cells on slow devices.
        const ny = quality > 0 ? 64 : 128;
        const nx = clampPow2((ny * spanX) / spanY, 32, quality > 0 ? 128 : 256);
        const cell = Math.max(spanX / nx, spanY / ny);
        const sim = new WaveSim({
            nx, ny, cell,
            gravity: GRAVITY,
            damping: 0.55,
            viscosity: (4 * cell * cell) / (Math.PI * Math.PI), // Nyquist-scale waves die in ~0.25 s
            dt: DT,
        });

        const originX = (b.minX + b.maxX) / 2 - (nx * cell) / 2;
        const originY = (b.minY + b.maxY) / 2 - (ny * cell) / 2;
        const toIndex = (v, origin, n) => Math.max(0, Math.min(n - 1, Math.floor((v - origin) / cell)));
        world = {
            camera, sim, originX, originY,
            i0: toIndex(b.minX, originX, nx), i1: Math.min(nx - 1, toIndex(b.maxX, originX, nx) + 2),
            j0: Math.max(0, toIndex(b.minY, originY, ny) - 2), j1: Math.min(ny - 1, toIndex(b.maxY, originY, ny) + 2),
            stride: Math.max(1, Math.round(GRID_SPACING / cell)),
            zScale: 1.5,               // exaggerate heights a little; the camera looks steeply down
            activityScale: 10,
        };
        // Line the grid up so a line passes through the screen centre
        world.i0 = Math.max(0, world.i0 - ((world.i0 - Math.round(nx / 2)) % world.stride + world.stride) % world.stride);
        world.j0 = Math.max(0, world.j0 - ((world.j0 - Math.round(ny / 2)) % world.stride + world.stride) % world.stride);

        mass.strength = 0;
        mass.target = 0;
        mass.placed = false;
        pebbles.length = 0;
        sim.computeHeight();
        render();
    }

    function clampPow2(value, min, max) {
        let n = min;
        while (n < max && n * 1.5 < value) n *= 2;
        return n;
    }

    // ---------------------------------------------------------------- input

    function toSheet(clientX, clientY) {
        const p = world.camera.toSheet(clientX, clientY);
        if (!p) return null;
        return { x: p.x - world.originX, y: p.y - world.originY };
    }

    function attachPointer() {
        if (pointerAttached) return;
        pointerAttached = true;
        // Touch: a finger that lands and lifts without moving is a tap (drop a pebble);
        // anything else is a scroll and leaves the sheet alone.
        const taps = new Map();

        window.addEventListener('pointermove', (e) => {
            if (e.pointerType !== 'mouse') {
                const tap = taps.get(e.pointerId);
                if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 10) taps.delete(e.pointerId);
                return;
            }
            const p = toSheet(e.clientX, e.clientY);
            if (!p) return;
            mass.tx = p.x;
            mass.ty = p.y;
            if (!mass.placed) { mass.x = p.x; mass.y = p.y; mass.placed = true; }
            mass.target = 1;
            wake();
        }, { passive: true });

        window.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            if (e.target instanceof Element && e.target.closest(INTERACTIVE)) return;
            if (e.pointerType === 'mouse') {
                const p = toSheet(e.clientX, e.clientY);
                if (p) addPebble(p.x, p.y);
            } else {
                taps.set(e.pointerId, { x: e.clientX, y: e.clientY, time: e.timeStamp });
            }
        }, { passive: true });

        window.addEventListener('pointerup', (e) => {
            const tap = taps.get(e.pointerId);
            taps.delete(e.pointerId);
            if (!tap || e.timeStamp - tap.time > 600) return;
            const p = toSheet(e.clientX, e.clientY);
            if (p) addPebble(p.x, p.y);
        }, { passive: true });
        window.addEventListener('pointercancel', (e) => taps.delete(e.pointerId), { passive: true });

        const release = () => { mass.target = 0; wake(); };
        document.addEventListener('pointerleave', release);
        document.documentElement.addEventListener('mouseleave', release);
        window.addEventListener('blur', release);
    }

    function addPebble(x, y, scale = 1) {
        pebbles.push({ x, y, t: 0, scale });
        wake();
    }

    function maybeWelcomeRipple() {
        if (!document.body.classList.contains('page-home')) return;
        try {
            if (sessionStorage.getItem('spacetime-welcomed')) return;
            sessionStorage.setItem('spacetime-welcomed', '1');
        } catch (e) { /* storage blocked: show it anyway */ }
        setTimeout(() => {
            const p = toSheet(window.innerWidth * 0.1, window.innerHeight * 0.7); // in the margin, beside the card
            if (p) addPebble(p.x, p.y, 0.7);
        }, 500);
    }

    // ---------------------------------------------------------------- loop

    function wake() {
        if (rafId || document.hidden || reducedMotion.matches) return;
        lastTime = performance.now();
        accumulator = DT; // take a step straight away
        rafId = requestAnimationFrame(tick);
    }

    function isActive() {
        return world.sim.rmsRate > IDLE_RATE
            || pebbles.length > 0
            || Math.abs(mass.strength - mass.target) > 0.002
            || (mass.strength > 0.002 && Math.hypot(mass.tx - mass.x, mass.ty - mass.y) > 0.05);
    }

    function advance(dt) {
        const { sim } = world;
        const follow = 1 - Math.exp(-dt / MASS_FOLLOW);
        mass.x += (mass.tx - mass.x) * follow;
        mass.y += (mass.ty - mass.y) * follow;
        mass.strength += (mass.target - mass.strength) * (1 - Math.exp(-dt / MASS_FADE));
        if (mass.placed && mass.strength > 0.002) {
            // Peak pressure that gives a well of depth MASS_DEPTH: depth = p * sigma * sqrt(pi/2) / g
            const pressure = (MASS_DEPTH * GRAVITY) / (MASS_SIGMA * Math.sqrt(Math.PI / 2));
            sim.push(mass.x, mass.y, MASS_SIGMA, pressure * mass.strength, dt);
        }

        for (let n = pebbles.length - 1; n >= 0; n--) {
            const pebble = pebbles[n];
            // Quick attack, exponential ring-down: crests leave with decreasing amplitude,
            // giving the concentric, Bessel-like pattern of a drop on water.
            const envelope = (1 - Math.exp(-pebble.t / 0.05)) * Math.exp(-pebble.t / PEBBLE_DECAY);
            sim.push(pebble.x, pebble.y, PEBBLE_SIGMA, PEBBLE_FORCE * pebble.scale * envelope * Math.sin(PEBBLE_OMEGA * pebble.t), dt);
            pebble.t += dt;
            if (pebble.t >= PEBBLE_TIME) pebbles.splice(n, 1);
        }
        sim.step();
    }

    function tick(now) {
        rafId = 0;
        if (document.hidden) return;
        const started = performance.now();
        accumulator += Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;

        let steps = 0;
        while (accumulator >= DT && steps < MAX_STEPS_PER_FRAME) {
            advance(DT);
            accumulator -= DT;
            steps++;
        }
        if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;
        if (steps > 0) {
            world.sim.computeHeight();
            render();
            watchPerformance(performance.now() - started);
        }
        if (isActive()) rafId = requestAnimationFrame(tick);
    }

    function render() {
        renderer.draw(world, mass.placed ? mass : null);
    }

    // If this device can't keep up, rebuild once at a coarser resolution.
    function watchPerformance(cost) {
        stats.frameCost = cost;
        stats.frames++;
        if (quality > 0) return;
        frameCosts.push(cost);
        if (frameCosts.length < 45) return;
        const average = frameCosts.reduce((a, b) => a + b, 0) / frameCosts.length;
        frameCosts.length = 0;
        if (average > 14) {
            quality = 1;
            build();
        }
    }

    // ---------------------------------------------------------------- page events

    let resizeTimer = 0;
    let lastWidth = window.innerWidth;
    let lastHeight = window.innerHeight;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            // Mobile browsers resize slightly while scrolling (URL bar); ignore small height changes.
            if (window.innerWidth === lastWidth && Math.abs(window.innerHeight - lastHeight) < 120) return;
            lastWidth = window.innerWidth;
            lastHeight = window.innerHeight;
            build();
        }, 150);
    });

    window.addEventListener('themechange', () => {
        readColors();
        render();
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden && isActive()) wake();
    });

    reducedMotion.addEventListener?.('change', () => {
        if (reducedMotion.matches) {
            world.sim.reset();
            pebbles.length = 0;
            mass.strength = mass.target = 0;
            render();
        } else {
            attachPointer();
        }
    });

    // Expose a tiny hook for automated checks (no effect on the page)
    window.__spacetime = {
        get world() { return world; },
        mass,
        stats,
        poke: (clientX, clientY) => { const p = toSheet(clientX, clientY); if (p) addPebble(p.x, p.y); },
    };
}
