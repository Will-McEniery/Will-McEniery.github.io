// Radix-2 complex FFT with precomputed twiddles, plus a 2-D inverse transform specialised for
// spectra whose inverse is real (Hermitian-symmetric input), which is what the wave simulation needs.

export class FFT {
    constructor(n) {
        if (!Number.isInteger(n) || n < 2 || (n & (n - 1)) !== 0) {
            throw new RangeError(`FFT size must be a power of two, got ${n}`);
        }
        this.n = n;
        const bits = Math.round(Math.log2(n));
        this.rev = new Uint32Array(n);
        for (let i = 0; i < n; i++) {
            let r = 0;
            for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
            this.rev[i] = r;
        }
        this.cos = new Float64Array(n / 2);
        this.sin = new Float64Array(n / 2);
        for (let i = 0; i < n / 2; i++) {
            const angle = (-2 * Math.PI * i) / n;
            this.cos[i] = Math.cos(angle);
            this.sin[i] = Math.sin(angle);
        }
    }

    // In-place, unnormalised. Forward uses e^{-i...}; inverse uses e^{+i...} (divide by n yourself).
    transform(re, im, inverse = false) {
        const n = this.n;
        const rev = this.rev;
        for (let i = 0; i < n; i++) {
            const j = rev[i];
            if (j > i) {
                let t = re[i]; re[i] = re[j]; re[j] = t;
                t = im[i]; im[i] = im[j]; im[j] = t;
            }
        }
        const sign = inverse ? -1 : 1;
        const cos = this.cos;
        const sin = this.sin;
        for (let size = 2; size <= n; size <<= 1) {
            const half = size >> 1;
            const step = n / size;
            for (let start = 0; start < n; start += size) {
                for (let k = 0, w = 0; k < half; k++, w += step) {
                    const wr = cos[w];
                    const wi = sign * sin[w];
                    const a = start + k;
                    const b = a + half;
                    const tr = re[b] * wr - im[b] * wi;
                    const ti = re[b] * wi + im[b] * wr;
                    re[b] = re[a] - tr;
                    im[b] = im[a] - ti;
                    re[a] += tr;
                    im[a] += ti;
                }
            }
        }
    }
}

// Full 2-D complex transform of row-major (nx wide, ny tall) arrays, in place. Unnormalised.
export function fft2d(re, im, nx, ny, inverse = false, fx = new FFT(nx), fy = new FFT(ny)) {
    for (let j = 0; j < ny; j++) {
        fx.transform(re.subarray(j * nx, (j + 1) * nx), im.subarray(j * nx, (j + 1) * nx), inverse);
    }
    const colRe = new Float64Array(ny);
    const colIm = new Float64Array(ny);
    for (let i = 0; i < nx; i++) {
        for (let j = 0; j < ny; j++) { colRe[j] = re[j * nx + i]; colIm[j] = im[j * nx + i]; }
        fy.transform(colRe, colIm, inverse);
        for (let j = 0; j < ny; j++) { re[j * nx + i] = colRe[j]; im[j * nx + i] = colIm[j]; }
    }
}

// Inverse 2-D transform of a Hermitian spectrum (so the result is real), normalised by 1/(nx*ny).
// Roughly half the work of fft2d: only nx/2+1 column transforms, and rows are inverted two at a time
// by packing row a + i*row b (both real outputs) into one complex transform.
export class RealInverse2D {
    constructor(nx, ny) {
        if (ny % 2 !== 0) throw new RangeError('ny must be even');
        this.nx = nx;
        this.ny = ny;
        this.fx = new FFT(nx);
        this.fy = new FFT(ny);
        this.colRe = new Float64Array(ny);
        this.colIm = new Float64Array(ny);
        this.gRe = new Float64Array(nx * ny);
        this.gIm = new Float64Array(nx * ny);
        this.rowRe = new Float64Array(nx);
        this.rowIm = new Float64Array(nx);
    }

    // specRe/specIm: spectrum, row-major (index = ky*nx + kx). out: Float32Array/Float64Array(nx*ny).
    run(specRe, specIm, out) {
        const { nx, ny, colRe, colIm, gRe, gIm, rowRe, rowIm } = this;
        const halfX = nx >> 1;

        // 1) Inverse along y for kx = 0..nx/2, giving G(kx, y).
        for (let i = 0; i <= halfX; i++) {
            for (let j = 0; j < ny; j++) { colRe[j] = specRe[j * nx + i]; colIm[j] = specIm[j * nx + i]; }
            this.fy.transform(colRe, colIm, true);
            for (let j = 0; j < ny; j++) { gRe[j * nx + i] = colRe[j]; gIm[j * nx + i] = colIm[j]; }
        }
        // 2) Real output => G(-kx, y) = conj(G(kx, y)).
        for (let j = 0; j < ny; j++) {
            const row = j * nx;
            for (let i = halfX + 1; i < nx; i++) {
                gRe[row + i] = gRe[row + nx - i];
                gIm[row + i] = -gIm[row + nx - i];
            }
        }
        // 3) Inverse along x, two rows per transform: z = rowA + i*rowB  ->  Re = a(x), Im = b(x).
        const norm = 1 / (nx * ny);
        for (let j = 0; j < ny; j += 2) {
            const a = j * nx;
            const b = a + nx;
            for (let i = 0; i < nx; i++) {
                rowRe[i] = gRe[a + i] - gIm[b + i];
                rowIm[i] = gIm[a + i] + gRe[b + i];
            }
            this.fx.transform(rowRe, rowIm, true);
            for (let i = 0; i < nx; i++) {
                out[a + i] = rowRe[i] * norm;
                out[b + i] = rowIm[i] * norm;
            }
        }
        return out;
    }
}
