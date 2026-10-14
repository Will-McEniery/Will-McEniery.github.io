import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FFT, fft2d, RealInverse2D } from '../assets/js/spacetime/fft.js';

function naiveDft(re, im, inverse = false) {
    const n = re.length;
    const outRe = new Float64Array(n);
    const outIm = new Float64Array(n);
    const sign = inverse ? 1 : -1;
    for (let k = 0; k < n; k++) {
        for (let t = 0; t < n; t++) {
            const a = (sign * 2 * Math.PI * k * t) / n;
            outRe[k] += re[t] * Math.cos(a) - im[t] * Math.sin(a);
            outIm[k] += re[t] * Math.sin(a) + im[t] * Math.cos(a);
        }
    }
    return [outRe, outIm];
}

function randomArray(n, seed) {
    const out = new Float64Array(n);
    let s = seed;
    for (let i = 0; i < n; i++) {
        s = (s * 1103515245 + 12345) % 2147483648;
        out[i] = s / 2147483648 - 0.5;
    }
    return out;
}

function maxDiff(a, b) {
    let m = 0;
    for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]));
    return m;
}

test('FFT matches a naive DFT', () => {
    for (const n of [2, 8, 64]) {
        const re = randomArray(n, n);
        const im = randomArray(n, n + 1);
        const [expRe, expIm] = naiveDft(re, im);
        const fft = new FFT(n);
        fft.transform(re, im);
        assert.ok(maxDiff(re, expRe) < 1e-9, `re mismatch n=${n}`);
        assert.ok(maxDiff(im, expIm) < 1e-9, `im mismatch n=${n}`);
    }
});

test('inverse FFT undoes the forward FFT', () => {
    const n = 128;
    const re0 = randomArray(n, 7);
    const im0 = randomArray(n, 8);
    const re = re0.slice();
    const im = im0.slice();
    const fft = new FFT(n);
    fft.transform(re, im);
    fft.transform(re, im, true);
    for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
    assert.ok(maxDiff(re, re0) < 1e-12);
    assert.ok(maxDiff(im, im0) < 1e-12);
});

test('FFT rejects sizes that are not powers of two', () => {
    assert.throws(() => new FFT(12), RangeError);
});

test('RealInverse2D matches the full complex inverse for a real field', () => {
    for (const [nx, ny] of [[16, 8], [32, 32], [8, 64]]) {
        const field = randomArray(nx * ny, nx * 31 + ny);
        const specRe = field.slice();
        const specIm = new Float64Array(nx * ny);
        fft2d(specRe, specIm, nx, ny);

        const out = new Float64Array(nx * ny);
        new RealInverse2D(nx, ny).run(specRe, specIm, out);
        assert.ok(maxDiff(out, field) < 1e-10, `round trip failed for ${nx}x${ny}`);
    }
});
