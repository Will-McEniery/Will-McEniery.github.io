import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WaveSim } from '../assets/js/spacetime/sim.js';

test('a single mode oscillates at the dispersion-relation frequency and decays at gamma/2', () => {
    const g = 1000;
    const damping = 0.4;
    const dt = 1 / 60;
    const sim = new WaveSim({ nx: 16, ny: 16, cell: 10, gravity: g, damping, viscosity: 0, dt });
    const i = 3; // mode (kx, ky) = (3, 0) and its conjugate (-3, 0)
    const k = (2 * Math.PI * i) / (16 * 10);
    sim.hRe[i] = 1;
    sim.hRe[16 - i] = 1;

    const omega = Math.sqrt(g * k);
    const alpha = damping / 2;
    const wd = Math.sqrt(omega * omega - alpha * alpha);
    const steps = 90;
    for (let n = 0; n < steps; n++) sim.step();
    const t = steps * dt;
    // h(0)=1, h'(0)=0  =>  h(t) = e^{-alpha t} (cos wd t + alpha/wd sin wd t)
    const expected = Math.exp(-alpha * t) * (Math.cos(wd * t) + (alpha / wd) * Math.sin(wd * t));
    assert.ok(Math.abs(sim.hRe[i] - expected) < 1e-9, `${sim.hRe[i]} vs ${expected}`);
});

test('a steady pressure patch settles into a well whose depth matches -p_k / omega^2', () => {
    const params = { nx: 64, ny: 64, cell: 8, gravity: 18000, damping: 3, viscosity: 40, dt: 1 / 60 };
    const sim = new WaveSim(params);
    const sigma = 24;
    const amplitude = 9000;
    const cx = 256;
    const cy = 256;
    for (let n = 0; n < 900; n++) {
        sim.push(cx, cy, sigma, amplitude, params.dt);
        sim.step();
    }
    sim.computeHeight();
    const simulated = sim.sample(cx, cy);

    // Direct steady-state solution in k-space for comparison.
    const ref = new WaveSim(params);
    ref.push(cx, cy, sigma, amplitude, 1);
    for (let idx = 1; idx < ref.size; idx++) {
        const omega2 = params.gravity * Math.sqrt(ref.k2[idx]);
        ref.hRe[idx] = ref.vRe[idx] / omega2;
        ref.hIm[idx] = ref.vIm[idx] / omega2;
    }
    ref.computeHeight();
    const expected = ref.sample(cx, cy);

    assert.ok(simulated < 0, 'pressure should push the sheet down');
    assert.ok(Math.abs(simulated - expected) / Math.abs(expected) < 0.03, `${simulated} vs ${expected}`);
    // Far from the patch the sheet should be much flatter than in the well (1/r profile).
    const far = sim.sample(cx + 200, cy);
    assert.ok(Math.abs(far - sim.sample(cx + 250, cy + 250)) < Math.abs(simulated) * 0.2);
});

test('a moving pressure patch leaves a Kelvin wake: waves trail behind inside a ~19.5 degree wedge', () => {
    // Scaled-down physics (same Froude number regime as the site) so the wake fits a small grid.
    const nx = 256;
    const ny = 256;
    const cell = 2;
    const g = 1000;
    const dt = 1 / 60;
    const sim = new WaveSim({ nx, ny, cell, gravity: g, damping: 0.05, viscosity: 0.02, dt });
    const speed = 40;       // px/s
    const sigma = 4;        // px; Froude number U / sqrt(g sigma) = 0.63
    const amplitude = 600;
    const y0 = (ny * cell) / 2;
    let x = 60;
    const steps = Math.round(9 / dt);
    for (let n = 0; n < steps; n++) {
        const ramp = Math.min(1, (n * dt) / 1.5); // switch on gently to avoid a start-up splash
        sim.push(x, y0, sigma, amplitude * ramp, dt);
        sim.step();
        x += speed * dt;
    }
    sim.computeHeight();

    // Remove the static well (what the patch would do at rest) so only the radiated waves remain.
    const well = new WaveSim({ nx, ny, cell, gravity: g, dt });
    well.push(x - speed * dt, y0, sigma, amplitude, 1);
    for (let idx = 1; idx < well.size; idx++) {
        const omega2 = g * Math.sqrt(well.k2[idx]);
        well.hRe[idx] = well.vRe[idx] / omega2;
        well.hIm[idx] = well.vIm[idx] / omega2;
    }
    well.computeHeight();
    for (let idx = 0; idx < sim.size; idx++) sim.height[idx] -= well.height[idx];
    x -= speed * dt;

    // Compare wave activity behind vs ahead of the source, away from the near field.
    let behind = 0;
    let ahead = 0;
    const bins = new Float64Array(46); // peak |h| per 1-degree bin of angle from the track, 0..45
    for (let j = 0; j < ny; j++) {
        for (let i = 0; i < nx; i++) {
            const dx = i * cell - x;
            const dy = j * cell - y0;
            const r = Math.hypot(dx, dy);
            if (r < 30 || r > 300) continue;
            const h = sim.height[j * nx + i];
            if (dx < 0) behind += h * h; else ahead += h * h;
            if (dx < 0 && r > 60) {
                const angle = Math.round((Math.atan2(Math.abs(dy), -dx) * 180) / Math.PI);
                if (angle <= 45) bins[angle] = Math.max(bins[angle], Math.abs(h));
            }
        }
    }
    if (process.env.DEBUG_WAKE) console.log({ behind, ahead, bins: Array.from(bins, (b) => +b.toFixed(3)) });
    assert.ok(behind > 10 * ahead, `wake should trail the source (behind ${behind}, ahead ${ahead})`);

    // Edge of the wedge: first angle where the wave amplitude falls below half its on-track value.
    const inner = bins.slice(0, 9).reduce((a, b) => a + b, 0) / 9;
    const edge = bins.findIndex((b) => b < 0.5 * inner);
    assert.ok(edge >= 16 && edge <= 23, `wake half-angle ${edge} deg, expected about 19.5 (Kelvin)`);
    const outside = Math.max(...bins.slice(30));
    assert.ok(outside < 0.25 * inner, 'little wave activity outside the Kelvin wedge');
});
