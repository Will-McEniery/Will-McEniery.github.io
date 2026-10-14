// Draws the simulated height field as a perspective mesh on a 2-D canvas.
//
// Pass 1 strokes every grid line in a single path with a depth-faded gradient.
// Pass 2 re-strokes only the disturbed segments, bucketed by amplitude, so waves read clearly.
// Pass 3 adds a soft glow where the cursor "mass" sits in its well.

const LEVELS = 4;

export class MeshRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.colors = { grid: '103, 232, 249', alpha: 0.4, mass: '251, 191, 36' };
        this.points = new Float32Array(0);
        this.paths = [];
    }

    setSize(width, height, dpr) {
        this.width = width;
        this.height = height;
        this.dpr = dpr;
        this.canvas.width = Math.round(width * dpr);
        this.canvas.height = Math.round(height * dpr);
        this.gradient = null;
    }

    setColors(colors) {
        this.colors = { ...this.colors, ...colors };
        this.gradient = null;
    }

    lineGradient() {
        if (this.gradient) return this.gradient;
        const { grid, alpha } = this.colors;
        const g = this.ctx.createLinearGradient(0, 0, 0, this.height);
        g.addColorStop(0, `rgba(${grid}, ${alpha * 0.18})`);
        g.addColorStop(0.45, `rgba(${grid}, ${alpha * 0.55})`);
        g.addColorStop(1, `rgba(${grid}, ${alpha})`);
        this.gradient = g;
        return g;
    }

    // world: { camera, sim, originX, originY, i0, i1, j0, j1, stride, zScale, activityScale }
    // mass: { x, y, strength } in sheet coordinates (or null)
    draw(world, mass) {
        const { ctx, dpr } = this;
        const { camera, sim, originX, originY, i0, i1, j0, j1, stride, zScale, activityScale } = world;
        const { nx, cell, height } = sim;

        if (this.points.length < sim.size * 2) this.points = new Float32Array(sim.size * 2);
        const pts = this.points;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, this.width, this.height);

        // Project every vertex we might draw
        for (let j = j0; j <= j1; j++) {
            const y = originY + j * cell;
            const row = j * nx;
            for (let i = i0; i <= i1; i++) {
                const idx = row + i;
                camera.project(originX + i * cell, y, height[idx] * zScale, pts, idx * 2);
            }
        }

        // Pass 1: the whole mesh
        ctx.beginPath();
        for (let j = j0; j <= j1; j += stride) {
            const row = j * nx;
            ctx.moveTo(pts[(row + i0) * 2], pts[(row + i0) * 2 + 1]);
            for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(pts[(row + i) * 2], pts[(row + i) * 2 + 1]);
        }
        for (let i = i0; i <= i1; i += stride) {
            ctx.moveTo(pts[(j0 * nx + i) * 2], pts[(j0 * nx + i) * 2 + 1]);
            for (let j = j0 + 1; j <= j1; j++) ctx.lineTo(pts[(j * nx + i) * 2], pts[(j * nx + i) * 2 + 1]);
        }
        ctx.lineWidth = 1;
        ctx.strokeStyle = this.lineGradient();
        ctx.stroke();

        // Pass 2: highlight disturbed segments
        const paths = [];
        for (let l = 0; l < LEVELS; l++) paths.push(new Path2D());
        const inv = 1 / activityScale;
        const addSegment = (a, b) => {
            const level = Math.min(LEVELS - 1, Math.floor((Math.abs(height[a]) + Math.abs(height[b])) * 0.5 * inv * LEVELS) - 1);
            if (level < 0) return;
            const p = paths[level];
            p.moveTo(pts[a * 2], pts[a * 2 + 1]);
            p.lineTo(pts[b * 2], pts[b * 2 + 1]);
        };
        for (let j = j0; j <= j1; j += stride) {
            const row = j * nx;
            for (let i = i0; i < i1; i++) addSegment(row + i, row + i + 1);
        }
        for (let i = i0; i <= i1; i += stride) {
            for (let j = j0; j < j1; j++) addSegment(j * nx + i, (j + 1) * nx + i);
        }
        const { grid, alpha, mass: massColor } = this.colors;
        for (let l = 0; l < LEVELS; l++) {
            ctx.strokeStyle = `rgba(${grid}, ${Math.min(1, alpha * (1 + (l + 1) * 0.45))})`;
            ctx.lineWidth = 1 + l * 0.25;
            ctx.stroke(paths[l]);
        }

        // Pass 3: the mass sitting in its well
        if (mass && mass.strength > 0.01) {
            const p = [0, 0];
            camera.project(originX + mass.x, originY + mass.y, sim.sample(mass.x, mass.y) * zScale, p, 0);
            const radius = 26;
            const glow = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], radius);
            glow.addColorStop(0, `rgba(${massColor}, ${0.55 * mass.strength})`);
            glow.addColorStop(0.25, `rgba(${massColor}, ${0.22 * mass.strength})`);
            glow.addColorStop(1, `rgba(${massColor}, 0)`);
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(p[0], p[1], radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}
