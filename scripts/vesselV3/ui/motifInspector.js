/**
 * Vessel Designer V3 - Per-Segment Surface Motif Inspector
 *
 * A contextual panel driven entirely by ui.selectedSegmentId. When a wall
 * segment is selected it exposes the motif type and its variation controls,
 * writes edits back onto that segment's owning profile point, and shows a live
 * unwrapped preview plus per-segment print-safety warnings.
 */

import vesselV3State from '../state/vesselV3State.js';
import {
    MOTIF_TYPE_OPTIONS,
    MOTIF_PROFILE_OPTIONS,
    MOTIF_VISIBLE_SUFFIXES,
    MOTIF_CONSTRAINTS,
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

export class MotifInspector {
    constructor() {
        this.el = {
            panel: document.getElementById('motifInspector'),
            title: document.getElementById('motifSegTitle'),
            sub: document.getElementById('motifSegSub'),
            close: document.getElementById('motifClose'),
            type: document.getElementById('motifType'),
            depth: document.getElementById('motifDepth'),
            depthVal: document.getElementById('motifDepthVal'),
            relief: document.getElementById('motifRelief'),
            count: document.getElementById('motifCount'),
            countVal: document.getElementById('motifCountVal'),
            pitch: document.getElementById('motifPitch'),
            pitchVal: document.getElementById('motifPitchVal'),
            lineWidth: document.getElementById('motifLineWidth'),
            lineWidthVal: document.getElementById('motifLineWidthVal'),
            profile: document.getElementById('motifProfile'),
            angle: document.getElementById('motifAngle'),
            angleVal: document.getElementById('motifAngleVal'),
            direction: document.getElementById('motifDirection'),
            previewName: document.getElementById('motifPreviewName'),
            preview: document.getElementById('motifPreview'),
            warn: document.getElementById('motifWarn'),
            warnText: document.getElementById('motifWarnText'),
            smooth: document.getElementById('motifSmooth'),
            copyAdjacent: document.getElementById('motifCopyAdjacent'),
            applyAll: document.getElementById('motifApplyAll')
        };

        if (!this.el.panel) return;

        this.pctx = this.el.preview ? this.el.preview.getContext('2d') : null;
        this.populateSelects();
        this.bind();
        this.unsubscribe = vesselV3State.subscribe('*', () => this.sync());
        this.sync();
    }

    populateSelects() {
        MOTIF_TYPE_OPTIONS.forEach((o) => this.el.type.add(new Option(o.label, o.value)));
        MOTIF_PROFILE_OPTIONS.forEach((o) => this.el.profile.add(new Option(o.label, o.value)));
    }

    // ----- selection context -----

    getContext() {
        const state = vesselV3State.getState();
        const ownerId = state.ui.selectedSegmentId;
        if (!ownerId) return null;
        const points = state.profile.points;
        const index = points.findIndex((p) => p.id === ownerId);
        if (index <= 0) return null;
        const point = points[index];
        const prev = points[index - 1];
        if (Math.abs((point.h || 0) - (prev.h || 0)) < FLAT_EPS) return null; // flat/base
        return { points, index, point, prev, ownerId };
    }

    segNumber(points, ownerId) {
        let n = 0;
        for (let i = 1; i < points.length; i++) {
            if (Math.abs((points[i].h || 0) - (points[i - 1].h || 0)) < FLAT_EPS) continue;
            n += 1;
            if (points[i].id === ownerId) return n;
        }
        return n;
    }

    // ----- writing edits -----

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
        this.suppressSync = true;
        vesselV3State.setProfilePoints(points, { history: commit });
        this.suppressSync = false;
    }

    setMotifOnPoint(points, index, motif) {
        points[index] = {
            ...points[index],
            motif: { ...getDefaultMotif(), ...motif }
        };
    }

    bind() {
        this.el.close.addEventListener('click', () => {
            vesselV3State.setState('ui.selectedSegmentId', null, { history: false });
        });

        this.el.type.addEventListener('change', () => {
            this.writeMotif({ type: this.el.type.value }, true);
        });
        this.el.profile.addEventListener('change', () => {
            this.writeMotif({ profile: this.el.profile.value }, true);
        });

        this.bindRange('depth', 'depth');
        this.bindRange('count', 'count');
        this.bindRange('pitch', 'pitch');
        this.bindRange('lineWidth', 'lineWidth');
        this.bindRange('angle', 'angle');

        this.bindSeg('relief', 'relief');
        this.bindSeg('direction', 'direction');

        this.el.smooth.addEventListener('click', () => this.writeMotif({ type: 'none' }, true));
        this.el.applyAll.addEventListener('click', () => this.applyToAll());
        this.el.copyAdjacent.addEventListener('click', () => this.copyToAdjacent());
    }

    bindRange(elKey, field) {
        const input = this.el[elKey];
        input.addEventListener('input', () => {
            const value = field === 'count' ? Math.round(Number(input.value)) : Number(input.value);
            this.writeMotif({ [field]: value }, false);
        });
        input.addEventListener('change', () => {
            const value = field === 'count' ? Math.round(Number(input.value)) : Number(input.value);
            this.writeMotif({ [field]: value }, true);
        });
    }

    bindSeg(elKey, field) {
        this.el[elKey].querySelectorAll('button').forEach((btn) => {
            btn.addEventListener('click', () => this.writeMotif({ [field]: btn.dataset.v }, true));
        });
    }

    applyToAll() {
        const ctx = this.getContext();
        if (!ctx) return;
        const motif = ctx.point.motif;
        const points = ctx.points.map((p) => ({ ...p }));
        for (let i = 1; i < points.length; i++) {
            if (Math.abs((points[i].h || 0) - (points[i - 1].h || 0)) < FLAT_EPS) continue;
            this.setMotifOnPoint(points, i, motif);
        }
        vesselV3State.setProfilePoints(points, { history: true });
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
        vesselV3State.setProfilePoints(points, { history: true });
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

        const num = this.segNumber(ctx.points, ctx.ownerId);
        this.el.title.childNodes[0].nodeValue = `Segment ${num} `;
        this.el.sub.textContent = `h ${Math.round(ctx.prev.h)}–${Math.round(ctx.point.h)} mm`;

        const motif = ctx.point.motif || getDefaultMotif();
        this.setValue(this.el.type, motif.type);
        this.setValue(this.el.profile, motif.profile);
        this.setValue(this.el.depth, motif.depth);
        this.setValue(this.el.count, motif.count);
        this.setValue(this.el.pitch, motif.pitch);
        this.setValue(this.el.lineWidth, motif.lineWidth);
        this.setValue(this.el.angle, motif.angle);
        this.setSeg(this.el.relief, motif.relief);
        this.setSeg(this.el.direction, motif.direction);

        this.updateVisibility(motif.type);
        this.updateLabels(motif);
        this.updateWarnings(ctx, motif);
        this.drawPreview(motif);
    }

    setValue(el, value) {
        if (document.activeElement === el) return; // don't fight an active drag/typing
        el.value = value;
    }

    setSeg(group, value) {
        group.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.v === value));
    }

    updateVisibility(type) {
        const visible = MOTIF_VISIBLE_SUFFIXES[type] || [];
        this.el.panel.querySelectorAll('.mi-hideable').forEach((node) => {
            const suffix = node.dataset.suffix;
            node.hidden = suffix === 'preview' ? type === 'none' : !visible.includes(suffix);
        });
    }

    updateLabels(motif) {
        this.el.depthVal.textContent = `${Number(motif.depth).toFixed(2)} mm`;
        this.el.countVal.textContent = String(motif.count);
        this.el.pitchVal.textContent = `${motif.pitch} mm`;
        this.el.lineWidthVal.textContent = `${motif.lineWidth} %`;
        this.el.angleVal.textContent = `${motif.angle}°`;
        const label = MOTIF_TYPE_OPTIONS.find((o) => o.value === motif.type);
        this.el.previewName.textContent = label ? label.label : 'Motif';
    }

    updateWarnings(ctx, motif) {
        const wall = Math.max(0.5, Number(vesselV3State.getState('global.wallThickness')) || 3);
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

        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const a = motif.type === 'none' ? 0 : this.amplitude(x / W, 1 - y / H, motif);
                const base = 26;
                const lift = sign * a * 100;
                const idx = (y * W + x) * 4;
                img.data[idx] = Math.max(0, Math.min(255, base + (rgb[0] / 255) * lift + a * rgb[0] * 0.35));
                img.data[idx + 1] = Math.max(0, Math.min(255, base + (rgb[1] / 255) * lift + a * rgb[1] * 0.35));
                img.data[idx + 2] = Math.max(0, Math.min(255, base + (rgb[2] / 255) * lift + a * rgb[2] * 0.35));
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
