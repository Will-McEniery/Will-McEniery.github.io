// Linear surface waves on a periodic sheet, solved spectrally.
//
// Each Fourier mode of the height field h obeys a damped, driven oscillator
//
//     h_tt + gamma(k) h_t + omega(k)^2 h = -p_k(t)
//
// with the deep-water gravity–capillary dispersion relation omega^2 = g k + s k^3. The dispersion is
// what produces a genuine Kelvin wake (the fixed ~19.5 degree "duck on a pond" V) behind a moving
// pressure patch; a plain wave equation would only give Doppler circles or a Mach cone.
//
// A stationary pressure patch settles into h_k = -p_k / omega^2 ~ 1/(g k), i.e. a 1/r well: the
// rubber-sheet "mass in spacetime" picture falls out of the same physics.
//
// The homogeneous part of each mode is advanced exactly (a 2x2 matrix per mode), so the scheme is
// unconditionally stable and frame-rate independent. Forcing is added analytically in k-space
// (a Gaussian's transform is separable), so each frame needs only one inverse FFT for display.

import { RealInverse2D } from './fft.js';

export const DEFAULT_PARAMS = {
    gravity: 18000,   // g, px/s^2: sets wave speeds (phase speed sqrt(g/k))
    tension: 0,       // s, px^3/s^2: capillary term, makes short waves faster
    damping: 0.55,    // 1/s, damping applied to every wavelength
    viscosity: 40,    // px^2/s, extra damping proportional to k^2 (short waves die faster)
    dt: 1 / 60,       // s, fixed physics step
};

export class WaveSim {
    constructor({ nx, ny, cell, ...params }) {
        this.nx = nx;
        this.ny = ny;
        this.cell = cell;
        this.size = nx * ny;
        this.lengthX = nx * cell;
        this.lengthY = ny * cell;

        this.kx = waveNumbers(nx, cell);
        this.ky = waveNumbers(ny, cell);

        this.hRe = new Float64Array(this.size);
        this.hIm = new Float64Array(this.size);
        this.vRe = new Float64Array(this.size);
        this.vIm = new Float64Array(this.size);
        this.m11 = new Float64Array(this.size);
        this.m12 = new Float64Array(this.size);
        this.m21 = new Float64Array(this.size);
        this.m22 = new Float64Array(this.size);
        this.k2 = new Float64Array(this.size);

        this.exRe = new Float64Array(nx);
        this.exIm = new Float64Array(nx);
        this.eyRe = new Float64Array(ny);
        this.eyIm = new Float64Array(ny);

        this.height = new Float32Array(this.size);
        this.inverse = new RealInverse2D(nx, ny);
        this.rmsRate = 0;

        this.setParams(params);
    }

    setParams(params = {}) {
        this.params = { ...DEFAULT_PARAMS, ...this.params, ...params };
        const { gravity, tension, damping, viscosity, dt } = this.params;
        const { nx, ny, kx, ky } = this;
        for (let j = 0; j < ny; j++) {
            for (let i = 0; i < nx; i++) {
                const idx = j * nx + i;
                const k2 = kx[i] * kx[i] + ky[j] * ky[j];
                const k = Math.sqrt(k2);
                const omega2 = gravity * k + tension * k * k2;
                const alpha = 0.5 * (damping + viscosity * k2);
                const decay = Math.exp(-alpha * dt);
                const wd2 = omega2 - alpha * alpha;
                let c;
                let s;
                if (wd2 > 1e-12) {
                    const wd = Math.sqrt(wd2);
                    c = decay * Math.cos(wd * dt);
                    s = (decay * Math.sin(wd * dt)) / wd;
                } else if (wd2 < -1e-12) {
                    const wh = Math.sqrt(-wd2);
                    c = decay * Math.cosh(wh * dt);
                    s = (decay * Math.sinh(wh * dt)) / wh;
                } else {
                    c = decay;
                    s = decay * dt;
                }
                this.k2[idx] = k2;
                this.m11[idx] = c + alpha * s;
                this.m12[idx] = s;
                this.m21[idx] = -omega2 * s;
                this.m22[idx] = c - alpha * s;
            }
        }
    }

    reset() {
        this.hRe.fill(0); this.hIm.fill(0); this.vRe.fill(0); this.vIm.fill(0);
        this.height.fill(0);
        this.rmsRate = 0;
    }

    // Apply a Gaussian pressure patch centred at (x, y) (sheet coordinates, px) for a time dt.
    // `amplitude` is the peak downward acceleration (px/s^2); positive pushes the sheet down.
    // shape 'gaussian' is a smooth bump; 'ring' is its Laplacian (a zero-volume "Mexican hat",
    // which launches a cleaner ring train).
    push(x, y, sigma, amplitude, dt, shape = 'gaussian') {
        const { nx, ny, kx, ky, exRe, exIm, eyRe, eyIm } = this;
        const s2 = sigma * sigma;
        // Continuous transform of the Gaussian, expressed in grid (DFT) units
        const scale = (-amplitude * dt * 2 * Math.PI * s2) / (this.cell * this.cell);
        for (let i = 0; i < nx; i++) {
            const g = Math.exp(-0.5 * kx[i] * kx[i] * s2);
            exRe[i] = g * Math.cos(kx[i] * x);
            exIm[i] = -g * Math.sin(kx[i] * x);
        }
        for (let j = 0; j < ny; j++) {
            const g = scale * Math.exp(-0.5 * ky[j] * ky[j] * s2);
            eyRe[j] = g * Math.cos(ky[j] * y);
            eyIm[j] = -g * Math.sin(ky[j] * y);
        }
        // The Nyquist modes have no conjugate partner; leave them alone to keep the field real.
        exRe[nx >> 1] = exIm[nx >> 1] = 0;
        eyRe[ny >> 1] = eyIm[ny >> 1] = 0;

        const { vRe, vIm, k2 } = this;
        const ring = shape === 'ring';
        for (let j = 0; j < ny; j++) {
            const ar = eyRe[j];
            const ai = eyIm[j];
            const row = j * nx;
            for (let i = 0; i < nx; i++) {
                const br = exRe[i];
                const bi = exIm[i];
                let fr = ar * br - ai * bi;
                let fi = ar * bi + ai * br;
                if (ring) {
                    const w = k2[row + i] * s2;
                    fr *= w;
                    fi *= w;
                }
                vRe[row + i] += fr;
                vIm[row + i] += fi;
            }
        }
        // Mean level is fixed (omega = 0 there, so pressure would otherwise drift it forever)
        vRe[0] = vIm[0] = 0;
    }

    step() {
        const { size, hRe, hIm, vRe, vIm, m11, m12, m21, m22 } = this;
        let change = 0;
        for (let idx = 1; idx < size; idx++) {
            const hr = hRe[idx];
            const hi = hIm[idx];
            const vr = vRe[idx];
            const vi = vIm[idx];
            const a = m11[idx];
            const b = m12[idx];
            const c = m21[idx];
            const d = m22[idx];
            const nhr = a * hr + b * vr;
            const nhi = a * hi + b * vi;
            hRe[idx] = nhr;
            hIm[idx] = nhi;
            vRe[idx] = c * hr + d * vr;
            vIm[idx] = c * hi + d * vi;
            change += (nhr - hr) * (nhr - hr) + (nhi - hi) * (nhi - hi);
        }
        hRe[0] = hIm[0] = vRe[0] = vIm[0] = 0;
        // RMS rate of change of the real-space height (Parseval), in px/s. Unlike the velocity
        // state, this goes to zero when a steady pressure (the resting cursor) has settled.
        this.rmsRate = Math.sqrt(change) / size / this.params.dt;
    }

    // Real-space height field into this.height (row-major, nx wide).
    computeHeight() {
        return this.inverse.run(this.hRe, this.hIm, this.height);
    }

    // Bilinear sample of the last computed height field; x, y in sheet px, periodic.
    sample(x, y) {
        const { nx, ny, cell, height } = this;
        const fx = x / cell;
        const fy = y / cell;
        const i0 = Math.floor(fx);
        const j0 = Math.floor(fy);
        const tx = fx - i0;
        const ty = fy - j0;
        const i = ((i0 % nx) + nx) % nx;
        const j = ((j0 % ny) + ny) % ny;
        const i1 = (i + 1) % nx;
        const j1 = (j + 1) % ny;
        const top = height[j * nx + i] * (1 - tx) + height[j * nx + i1] * tx;
        const bottom = height[j1 * nx + i] * (1 - tx) + height[j1 * nx + i1] * tx;
        return top * (1 - ty) + bottom * ty;
    }
}

function waveNumbers(n, cell) {
    const k = new Float64Array(n);
    const unit = (2 * Math.PI) / (n * cell);
    for (let i = 0; i < n; i++) k[i] = (i <= n / 2 ? i : i - n) * unit;
    return k;
}
