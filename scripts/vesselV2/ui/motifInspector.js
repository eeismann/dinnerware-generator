/**
 * Vessel Designer V2 - Per-Segment Surface Motif Inspector
 *
 * Driven entirely by ui.selectedSegmentId. The motif controls are DialKit
 * dials (scripts/ui/dialkit/vesselV2Dials.js) that write through
 * writeMotif()/applyToAll()/copyToAdjacent() here, onto the segment's owning
 * profile point. The floating card shows the selected segment's live
 * unwrapped preview plus its print-safety warning.
 */

import vesselV2State from '../state/vesselV2State.js';
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
const FLAT_EPS = 1e-6;
const TWO_PI = Math.PI * 2;

/**
 * Wall segments in profile order. Each point owns the segment beneath it;
 * flat runs (the base) carry no motif.
 */
export function getWallSegments(points) {
    const segments = [];
    for (let i = 1; i < points.length; i++) {
        if (Math.abs((points[i].h || 0) - (points[i - 1].h || 0)) < FLAT_EPS) continue;
        segments.push({ id: points[i].id, index: i, number: segments.length + 1, point: points[i], prev: points[i - 1] });
    }
    return segments;
}

export class MotifInspector {
    constructor() {
        this.el = {
            panel: document.getElementById('motifInspector'),
            title: document.getElementById('motifSegTitle'),
            sub: document.getElementById('motifSegSub'),
            close: document.getElementById('motifClose'),
            previewWrap: document.getElementById('motifPreviewWrap'),
            previewName: document.getElementById('motifPreviewName'),
            preview: document.getElementById('motifPreview'),
            warn: document.getElementById('motifWarn'),
            warnText: document.getElementById('motifWarnText')
        };

        if (!this.el.panel) return;

        this.pctx = this.el.preview ? this.el.preview.getContext('2d') : null;
        this.el.close?.addEventListener('click', () => {
            vesselV2State.setState('ui.selectedSegmentId', null, { history: false });
        });
        this.unsubscribe = vesselV2State.subscribe('*', () => this.sync());
        this.sync();
    }

    // ----- selection context -----

    getContext() {
        const state = vesselV2State.getState();
        const ownerId = state.ui.selectedSegmentId;
        if (!ownerId) return null;
        const segment = getWallSegments(state.profile.points).find((entry) => entry.id === ownerId);
        if (!segment) return null;
        return { points: state.profile.points, index: segment.index, point: segment.point, prev: segment.prev, ownerId, number: segment.number };
    }

    /** The selected segment's motif (defaults filled in), or null. */
    getMotif() {
        const ctx = this.getContext();
        return ctx ? { ...getDefaultMotif(), ...(ctx.point.motif || {}) } : null;
    }

    // ----- writing edits (called by the Surface Motif dials) -----

    writeMotif(patch, commit) {
        const ctx = this.getContext();
        if (!ctx) return;
        const points = ctx.points.map((p) => ({
            ...p,
            inHandle: p.inHandle ? { ...p.inHandle } : null,
            outHandle: p.outHandle ? { ...p.outHandle } : null,
            motif: p.motif ? { ...p.motif } : p.motif
        }));
        const target = points[ctx.index];
        target.motif = { ...(target.motif || getDefaultMotif()), ...patch };
        vesselV2State.setProfilePoints(points, { history: commit });
    }

    setMotifOnPoint(points, index, motif) {
        points[index] = {
            ...points[index],
            motif: { ...getDefaultMotif(), ...motif }
        };
    }

    smooth() {
        this.writeMotif({ type: 'none' }, true);
    }

    applyToAll() {
        const ctx = this.getContext();
        if (!ctx) return;
        const motif = ctx.point.motif;
        const points = ctx.points.map((p) => ({ ...p }));
        getWallSegments(points).forEach(({ index }) => this.setMotifOnPoint(points, index, motif));
        vesselV2State.setProfilePoints(points, { history: true });
    }

    copyToAdjacent() {
        const ctx = this.getContext();
        if (!ctx) return;
        const motif = ctx.point.motif;
        const points = ctx.points.map((p) => ({ ...p }));
        [ctx.index - 1, ctx.index + 1].forEach((i) => {
            const cur = points[i];
            const prev = points[i - 1];
            if (!cur || !prev || i <= 0) return;
            if (Math.abs((cur.h || 0) - (prev.h || 0)) < FLAT_EPS) return; // skip flat/base
            this.setMotifOnPoint(points, i, motif);
        });
        vesselV2State.setProfilePoints(points, { history: true });
    }

    // ----- rendering -----

    sync() {
        if (!this.el.panel) return;
        const ctx = this.getContext();

        if (!ctx) {
            this.el.panel.classList.add('hidden');
            return;
        }

        this.el.panel.classList.remove('hidden');
        this.el.title.childNodes[0].nodeValue = `Segment ${ctx.number} `;
        this.el.sub.textContent = `h ${Math.round(ctx.prev.h)}–${Math.round(ctx.point.h)} mm`;

        const motif = ctx.point.motif || getDefaultMotif();
        const label = MOTIF_TYPE_OPTIONS.find((o) => o.value === motif.type);
        this.el.previewName.textContent = label ? label.label : 'Motif';
        this.el.previewWrap.hidden = motif.type === 'none';
        this.updateWarnings(ctx, motif);
        this.drawPreview(motif);
    }

    updateWarnings(ctx, motif) {
        const wall = Math.max(0.5, Number(vesselV2State.getState('global.wallThickness')) || 3);
        let msg = '';

        if (isMotifActive(motif)) {
            if (motif.relief === 'recessed' && wall - motif.depth < 1.2) {
                msg = `Recessed ${motif.depth.toFixed(2)} mm leaves ${(wall - motif.depth).toFixed(1)} mm wall (min 1.2 mm).`;
            } else if (['vertical', 'diagonal', 'crosshatch', 'knurl'].includes(motif.type)) {
                const meanR = Math.max(1, (ctx.point.r + ctx.prev.r) / 2);
                const ridge = (TWO_PI * meanR * (motif.lineWidth / 100)) / motif.count;
                if (ridge < 0.8) {
                    msg = `Ridge width ≈ ${ridge.toFixed(2)} mm — below ~0.8 mm, lines may not print cleanly.`;
                }
            } else if (motif.type === 'horizontal') {
                const ridge = motif.pitch * (motif.lineWidth / 100);
                if (ridge < 0.8) {
                    msg = `Ridge width ≈ ${ridge.toFixed(2)} mm — below ~0.8 mm, lines may not print cleanly.`;
                }
            }
        }

        if (msg) {
            this.el.warnText.textContent = msg;
            this.el.warn.classList.add('show');
        } else {
            this.el.warn.classList.remove('show');
        }
    }

    // ----- live unwrapped preview (same height-field semantics as the engine) -----

    ridgeWave(phase, profile, duty) {
        const f = phase - Math.floor(phase);
        const d = Math.abs(f - 0.5) / (duty / 2);
        if (d >= 1) return 0;
        if (profile === 'v') return 1 - d;
        if (profile === 'square') return Math.min(1, (1 - d) / 0.15);
        return 0.5 * (1 + Math.cos(d * Math.PI));
    }

    amplitude(u, v, motif) {
        const duty = motif.lineWidth / 100;
        const cnt = motif.count;
        const dir = motif.direction === 'left' ? -1 : 1;
        const tan = Math.tan((motif.angle * Math.PI) / 180);
        const diag = (s) => cnt * (u + s * v * tan * 0.6);
        switch (motif.type) {
            case 'vertical': return this.ridgeWave(u * cnt, motif.profile, duty);
            case 'horizontal': return this.ridgeWave(v * (140 / motif.pitch), motif.profile, duty);
            case 'diagonal': return this.ridgeWave(diag(dir), motif.profile, duty);
            case 'crosshatch': return Math.max(this.ridgeWave(diag(1), motif.profile, duty), this.ridgeWave(diag(-1), motif.profile, duty));
            case 'knurl': return Math.min(this.ridgeWave(diag(1), 'v', 1), this.ridgeWave(diag(-1), 'v', 1));
            default: return 0;
        }
    }

    drawPreview(motif) {
        if (!this.pctx) return;
        const c = this.el.preview;
        const W = c.width;
        const H = c.height;
        const img = this.pctx.createImageData(W, H);
        const fam = FAMILY_COLOR[motif.type] || '#8a90a0';
        const rgb = [parseInt(fam.slice(1, 3), 16), parseInt(fam.slice(3, 5), 16), parseInt(fam.slice(5, 7), 16)];
        const sign = motif.relief === 'recessed' ? -1 : 1;
        // Light mode: ridges tint a pale ground instead of glowing on a dark one
        const light = document.documentElement.dataset.mode === 'light';
        const ground = light ? 236 : 26;
        const strength = light ? (sign > 0 ? 0.85 : 0.5) : 0;

        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const a = motif.type === 'none' ? 0 : this.amplitude(x / W, 1 - y / H, motif);
                const lift = sign * a * 100;
                const idx = (y * W + x) * 4;
                for (let c = 0; c < 3; c++) {
                    const value = light
                        ? ground + (rgb[c] - ground) * a * strength
                        : ground + (rgb[c] / 255) * lift + a * rgb[c] * 0.35;
                    img.data[idx + c] = Math.max(0, Math.min(255, value));
                }
                img.data[idx + 3] = 255;
            }
        }
        this.pctx.putImageData(img, 0, 0);
    }

    dispose() {
        this.unsubscribe?.();
    }
}

export default MotifInspector;
