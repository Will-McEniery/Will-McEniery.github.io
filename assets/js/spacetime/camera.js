// Perspective camera looking down at the sheet (the plane z = 0), the classic tilted
// "rubber sheet" view. Sheet x runs to the right, y away from the viewer, z up.
// The camera height is chosen so one sheet px is one screen px at the centre of the screen.

export class SheetCamera {
    constructor(width, height, { pitch = 1.0, fov = 0.8 } = {}) {
        this.width = width;
        this.height = height;
        this.pitch = pitch;
        this.sinP = Math.sin(pitch);
        this.cosP = Math.cos(pitch);
        this.focal = height / 2 / Math.tan(fov / 2);
        this.cameraZ = this.focal * this.sinP;
    }

    // Screen point -> where its ray hits the flat sheet, or null above the horizon.
    toSheet(sx, sy) {
        const dx = (sx - this.width / 2) / this.focal;
        const dy = -(sy - this.height / 2) / this.focal;
        const dirY = dy * this.sinP + this.cosP;
        const dirZ = dy * this.cosP - this.sinP;
        if (dirZ > -1e-6) return null;
        const t = this.cameraZ / -dirZ;
        return { x: t * dx, y: t * dirY };
    }

    // Bounding box of the sheet region visible on screen (sampled along the screen edges).
    visibleBounds() {
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        const samples = 12;
        for (let s = 0; s <= samples; s++) {
            const f = s / samples;
            for (const [sx, sy] of [[f * this.width, 0], [f * this.width, this.height], [0, f * this.height], [this.width, f * this.height]]) {
                const p = this.toSheet(sx, sy);
                if (!p) continue;
                minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
                minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
            }
        }
        return { minX, maxX, minY, maxY };
    }

    // Project sheet point (x, y, z) to screen; writes into out[o], out[o + 1].
    project(x, y, z, out, o) {
        const pz = z - this.cameraZ;
        const yc = y * this.sinP + pz * this.cosP;
        const zc = y * this.cosP - pz * this.sinP;
        const inv = this.focal / zc;
        out[o] = this.width / 2 + x * inv;
        out[o + 1] = this.height / 2 - yc * inv;
    }
}
