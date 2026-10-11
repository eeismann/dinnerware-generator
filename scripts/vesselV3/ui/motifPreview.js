/**
 * Vessel Designer V3 - Motif Preview Strip
 *
 * Shows the motif-panel segment's surface motif as a live unwrapped preview
 * under the profile canvas, with that segment's print-safety warning. The
 * motif controls themselves are DialKit dials (scripts/ui/dialkit/vesselV3Dials.js).
 */

import vesselV3State from '../state/vesselV3State.js';
import {
    MOTIF_TYPE_OPTIONS,
    getDefaultMotif,
    isMotifActive
} from '../../geometry/surfacePatternOptions.js';

const FAMILY_COLOR = {
    vertical: '#5bd6a0',
    horizontal: '#4f8cff',
    diagonal: '#c78bff',
    crosshatch: '#f0a24e',
    knurl: '#ff6b8b'
};
const TWO_PI = Math.PI * 2;

/** Print-safety message for one segment's motif, or '' when it looks printable. */
export function motifWarning(point, prev, motif, wallThickness) {
    if (!isMotifActive(motif)) return '';
    const wall = Math.max(0.5, Number(wallThickness) || 3);
    if (motif.relief === 'recessed' && wall - motif.depth < 1.2) {
        return `Recessed ${motif.depth.toFixed(2)} mm leaves ${(wall - motif.depth).toFixed(1)} mm wall (min 1.2 mm).`;
    }
    let ridge = Infinity;
    if (['vertical', 'diagonal', 'crosshatch', 'knurl'].includes(motif.type)) {
        const meanR = Math.max(1, (point.r + prev.r) / 2);
        ridge = (TWO_PI * meanR * (motif.lineWidth / 100)) / motif.count;
    } else if (motif.type === 'horizontal') {
        ridge = motif.pitch * (motif.lineWidth / 100);
    }
    return ridge < 0.8
        ? `Ridge width ≈ ${ridge.toFixed(2)} mm — below ~0.8 mm, lines may not print cleanly.`
        : '';
}

// Same height-field semantics as the engine
function ridgeWave(phase, profile, duty) {
    const f = phase - Math.floor(phase);
    const d = Math.abs(f - 0.5) / (duty / 2);
    if (d >= 1) return 0;
    if (profile === 'v') return 1 - d;
    if (profile === 'square') return Math.min(1, (1 - d) / 0.15);
    return 0.5 * (1 + Math.cos(d * Math.PI));
}

function amplitude(u, v, motif) {
    const duty = motif.lineWidth / 100;
    const cnt = motif.count;
    const dir = motif.direction === 'left' ? -1 : 1;
    const tan = Math.tan((motif.angle * Math.PI) / 180);
    const diag = (s) => cnt * (u + s * v * tan * 0.6);
    switch (motif.type) {
        case 'vertical': return ridgeWave(u * cnt, motif.profile, duty);
        case 'horizontal': return ridgeWave(v * (140 / motif.pitch), motif.profile, duty);
        case 'diagonal': return ridgeWave(diag(dir), motif.profile, duty);
        case 'crosshatch': return Math.max(ridgeWave(diag(1), motif.profile, duty), ridgeWave(diag(-1), motif.profile, duty));
        case 'knurl': return Math.min(ridgeWave(diag(1), 'v', 1), ridgeWave(diag(-1), 'v', 1));
        default: return 0;
    }
}

export class MotifPreview {
    /**
     * @param {HTMLElement} strip - Container holding the caption, canvas and warning
     * @param {Function} getSegmentId - Returns the motif panel's segment id
     */
    constructor(strip, getSegmentId) {
        this.strip = strip;
        this.getSegmentId = getSegmentId;
        this.caption = strip.querySelector('[data-motif-caption]');
        this.canvas = strip.querySelector('canvas');
        this.warning = strip.querySelector('[data-motif-warning]');
        this.ctx = this.canvas.getContext('2d');
        this.lastKey = null;
    }

    update() {
        const state = vesselV3State.getState();
        const points = state.profile.points;
        const index = points.findIndex(point => point.id === this.getSegmentId());
        const point = points[index];
        const motif = index > 0 ? (point.motif || getDefaultMotif()) : null;
        this.strip.hidden = !motif || motif.type === 'none';
        if (this.strip.hidden) return;

        const label = MOTIF_TYPE_OPTIONS.find(option => option.value === motif.type)?.label || 'Motif';
        const number = points.slice(1, index + 1)
            .filter((entry, i) => Math.abs((entry.h || 0) - (points[i].h || 0)) >= 1e-6).length;
        this.caption.textContent = `Segment ${number} · ${label}`;

        const message = motifWarning(point, points[index - 1], motif, state.global.wallThickness);
        this.warning.textContent = message;
        this.warning.hidden = !message;

        const key = JSON.stringify(motif);
        if (key !== this.lastKey) {
            this.lastKey = key;
            this.draw(motif);
        }
    }

    draw(motif) {
        const { width: W, height: H } = this.canvas;
        const img = this.ctx.createImageData(W, H);
        const fam = FAMILY_COLOR[motif.type] || '#8a90a0';
        const rgb = [1, 3, 5].map(offset => parseInt(fam.slice(offset, offset + 2), 16));
        const sign = motif.relief === 'recessed' ? -1 : 1;

        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const a = amplitude(x / W, 1 - y / H, motif);
                const lift = sign * a * 100;
                const idx = (y * W + x) * 4;
                for (let c = 0; c < 3; c++) {
                    img.data[idx + c] = Math.max(0, Math.min(255, 26 + (rgb[c] / 255) * lift + a * rgb[c] * 0.35));
                }
                img.data[idx + 3] = 255;
            }
        }
        this.ctx.putImageData(img, 0, 0);
    }
}

export default MotifPreview;
