/**
 * Vessel Designer V3 - State Management
 */

import { deepClone, getDefaultVesselV3State } from './vesselV3Defaults.js';
import { normalizeMotif } from '../../geometry/surfacePatternOptions.js';

class VesselV3StateManager {
    constructor() {
        this.state = getDefaultVesselV3State();
        this.listeners = new Map();
        this.history = [this.createHistorySnapshot()];
        this.historyIndex = 0;
    }

    subscribe(path, callback) {
        if (!this.listeners.has(path)) {
            this.listeners.set(path, new Set());
        }
        this.listeners.get(path).add(callback);
        return () => this.listeners.get(path)?.delete(callback);
    }

    getState(path) {
        if (!path) return this.state;
        return this.getNestedValue(this.state, path);
    }

    setState(path, value, options = {}) {
        const { silent = false, history = true } = options;
        const oldValue = this.getNestedValue(this.state, path);
        if (this.isEqual(oldValue, value)) return;

        this.setNestedValue(this.state, path, value);
        this.markDirtyForPath(path);

        if (history && path.startsWith('profile.')) {
            this.commitHistory();
        }

        if (!silent) {
            this.notify(path);
        }
    }

    setProfilePoints(points, options = {}) {
        this.setState('profile.points', this.normalizePoints(points), options);
    }

    setSpout(patch, options = {}) {
        const current = this.state.spout || {};
        const next = this.normalizeSpout({ ...current, ...patch });
        this.setState('spout', next, options);
    }

    setLid(patch, options = {}) {
        const current = this.state.lid || {};
        const knobPatch = patch.knob
            ? { ...(current.knob || {}), ...patch.knob }
            : current.knob;
        const next = this.normalizeLid({ ...current, ...patch, knob: knobPatch });
        this.setState('lid', next, options);
    }

    commitHistory() {
        const snapshot = this.createHistorySnapshot();
        const current = this.history[this.historyIndex];
        if (this.isEqual(snapshot, current)) return;

        this.history = this.history.slice(0, this.historyIndex + 1);
        this.history.push(snapshot);
        this.historyIndex = this.history.length - 1;
    }

    undo() {
        if (this.historyIndex <= 0) return false;
        this.historyIndex -= 1;
        this.restoreHistorySnapshot(this.history[this.historyIndex]);
        return true;
    }

    redo() {
        if (this.historyIndex >= this.history.length - 1) return false;
        this.historyIndex += 1;
        this.restoreHistorySnapshot(this.history[this.historyIndex]);
        return true;
    }

    reset() {
        this.state = getDefaultVesselV3State();
        this.state.project.dateCreated = new Date().toISOString();
        this.history = [this.createHistorySnapshot()];
        this.historyIndex = 0;
        this.notify('*');
    }

    loadState(data) {
        const defaults = getDefaultVesselV3State();
        this.state = this.mergeDeep(defaults, data || {});
        this.state.profile.mode = this.normalizeProfileMode(this.state.profile.mode);
        this.state.profile.allowFooterOverlap = this.state.profile.allowFooterOverlap === true;
        this.state.profile.points = this.normalizePoints(this.state.profile.points);
        // Backward-compat backfill: older saved projects predate the spout/lid
        // blocks entirely. mergeDeep already carries the defaults forward for
        // missing keys, but we still clamp/validate whatever *is* present so a
        // malformed or partial legacy value can't corrupt state.
        this.state.spout = this.normalizeSpout(this.state.spout);
        this.state.lid = this.normalizeLid(this.state.lid);
        this.state.project.isDirty = false;
        this.history = [this.createHistorySnapshot()];
        this.historyIndex = 0;
        this.notify('*');
    }

    exportState() {
        return {
            version: '2.0',
            appType: 'vessel-v3',
            project: { ...this.state.project },
            global: { ...this.state.global },
            profile: deepClone(this.state.profile),
            spout: deepClone(this.state.spout),
            lid: deepClone(this.state.lid),
            ui: { ...this.state.ui },
            warnings: deepClone(this.state.warnings)
        };
    }

    normalizePoints(points) {
        const source = Array.isArray(points) && points.length > 0
            ? points
            : getDefaultVesselV3State().profile.points;
        const allowFooterOverlap = this.state.profile?.allowFooterOverlap === true;
        const maxHeight = Math.max(10, Number(this.state?.global?.maxHeight) || 160);

        let lastH = 0;
        const normalizedPoints = source.map((point, index) => {
            const normalized = {
                id: point.id || `p${index}`,
                r: Math.max(0, Number(point.r) || 0),
                h: Math.max(0, Number(point.h) || 0),
                inHandle: this.normalizeHandle(point.inHandle),
                outHandle: this.normalizeHandle(point.outHandle),
                kind: point.kind === 'smooth' ? 'smooth' : 'corner',
                cornerRadius: Math.max(0, Math.min(80, Number(point.cornerRadius) || 0)),
                locked: index === 0 || point.locked === true,
                // Per-segment surface motif: each point owns the segment beneath
                // it. Backfills to smooth for legacy projects. p0 (base center)
                // owns no segment, so it carries no motif.
                motif: index === 0 ? null : normalizeMotif(point.motif)
            };

            if (index === 0) {
                normalized.r = 0;
                normalized.h = allowFooterOverlap
                    ? Math.max(0, Math.min(maxHeight, normalized.h))
                    : 0;
                normalized.inHandle = null;
                normalized.locked = true;
            } else if (!allowFooterOverlap) {
                normalized.h = Math.max(lastH, normalized.h);
            }

            lastH = normalized.h;
            return normalized;
        });

        return normalizedPoints.map((point, index, points) =>
            this.clampHandlesForPoint(point, index, points)
        );
    }

    normalizeHandle(handle) {
        if (!handle || !Number.isFinite(Number(handle.r)) || !Number.isFinite(Number(handle.h))) {
            return null;
        }
        return {
            r: Number(handle.r),
            h: Number(handle.h)
        };
    }

    normalizeProfileMode(mode) {
        return mode === 'straight-rounded' ? 'straight-rounded' : 'bezier';
    }

    clampNumber(value, min, max, fallback) {
        const num = Number(value);
        return Number.isFinite(num) ? Math.max(min, Math.min(max, num)) : fallback;
    }

    normalizeSpout(spout) {
        const defaults = getDefaultVesselV3State().spout;
        const source = spout && typeof spout === 'object' ? spout : {};
        return {
            enabled: source.enabled === true,
            segmentId: typeof source.segmentId === 'string' ? source.segmentId : null,
            angle: this.clampNumber(source.angle, 0, 360, defaults.angle),
            width: this.clampNumber(source.width, 10, 120, defaults.width),
            length: this.clampNumber(source.length, 5, 40, defaults.length),
            drop: this.clampNumber(source.drop, 0, 20, defaults.drop),
            wallThickness: this.clampNumber(source.wallThickness, 1.2, 4, defaults.wallThickness)
        };
    }

    normalizeLid(lid) {
        const defaults = getDefaultVesselV3State().lid;
        const source = lid && typeof lid === 'object' ? lid : {};
        const knobSource = source.knob && typeof source.knob === 'object' ? source.knob : {};
        return {
            enabled: source.enabled === true,
            fit: source.fit === 'overcap' ? 'overcap' : 'inset',
            domeHeight: this.clampNumber(source.domeHeight, 5, 40, defaults.domeHeight),
            wallThickness: this.clampNumber(source.wallThickness, 1.5, 4, defaults.wallThickness),
            clearance: this.clampNumber(source.clearance, 0.1, 1, defaults.clearance),
            knob: {
                style: ['ball', 'loop', 'flat'].includes(knobSource.style) ? knobSource.style : defaults.knob.style,
                height: this.clampNumber(knobSource.height, 4, 24, defaults.knob.height),
                width: this.clampNumber(knobSource.width, 6, 30, defaults.knob.width)
            },
            flangeDepth: this.clampNumber(source.flangeDepth, 2, 20, defaults.flangeDepth)
        };
    }

    clampHandlesForPoint(point, index, points) {
        const maxRadius = Math.max(10, Number(this.state?.global?.maxRadius) || 90);
        const maxHeight = Math.max(10, Number(this.state?.global?.maxHeight) || 160);
        const allowFooterOverlap = this.state.profile?.allowFooterOverlap === true;
        const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
        const clampHandle = (handle, handleType) => {
            if (!handle) return null;
            if (index === 0 && handleType === 'inHandle') return null;

            const absR = point.r + handle.r;
            const absH = point.h + handle.h;
            const minH = allowFooterOverlap
                ? 0
                : handleType === 'inHandle'
                    ? points[index - 1]?.h ?? point.h
                    : point.h;
            const maxH = allowFooterOverlap
                ? maxHeight
                : handleType === 'inHandle'
                    ? point.h
                    : points[index + 1]?.h ?? maxHeight;

            return {
                r: clamp(absR, 0, maxRadius) - point.r,
                h: clamp(absH, minH, maxH) - point.h
            };
        };

        return {
            ...point,
            inHandle: clampHandle(point.inHandle, 'inHandle'),
            outHandle: clampHandle(point.outHandle, 'outHandle')
        };
    }

    createHistorySnapshot() {
        return {
            profile: deepClone(this.state.profile),
            ui: {
                selectedPointId: this.state.ui.selectedPointId,
                selectedHandle: this.state.ui.selectedHandle,
                selectedSegmentId: this.state.ui.selectedSegmentId
            }
        };
    }

    restoreHistorySnapshot(snapshot) {
        this.state.profile = deepClone(snapshot.profile);
        this.state.ui.selectedPointId = snapshot.ui.selectedPointId;
        this.state.ui.selectedHandle = snapshot.ui.selectedHandle;
        this.state.ui.selectedSegmentId = snapshot.ui.selectedSegmentId ?? null;
        this.markDirtyForPath('profile');
        this.notify('*');
    }

    markDirtyForPath(path) {
        if (!path.startsWith('project.') && path !== 'warnings') {
            this.state.project.isDirty = true;
            this.state.project.lastModified = new Date().toISOString();
        }
    }

    notify(path) {
        const paths = new Set([path]);
        const parts = path.split('.');
        while (parts.length > 1) {
            parts.pop();
            paths.add(parts.join('.'));
        }

        paths.forEach((listenerPath) => {
            const listeners = this.listeners.get(listenerPath);
            if (!listeners) return;
            const value = listenerPath === '*' ? this.state : this.getState(listenerPath);
            listeners.forEach((callback) => callback(value, listenerPath));
        });

        const wildcard = this.listeners.get('*');
        if (wildcard && path !== '*') {
            wildcard.forEach((callback) => callback(this.state, [path]));
        }
    }

    getNestedValue(obj, path) {
        return path.split('.').reduce((acc, part) => {
            if (acc === null || acc === undefined) return undefined;
            return acc[part];
        }, obj);
    }

    setNestedValue(obj, path, value) {
        const parts = path.split('.');
        const last = parts.pop();
        const target = parts.reduce((acc, part) => {
            if (!(part in acc)) acc[part] = {};
            return acc[part];
        }, obj);
        target[last] = value;
    }

    isEqual(a, b) {
        return JSON.stringify(a) === JSON.stringify(b);
    }

    mergeDeep(target, source) {
        const output = Array.isArray(target) ? [...target] : { ...target };
        if (!source || typeof source !== 'object') return output;

        Object.entries(source).forEach(([key, value]) => {
            if (
                value &&
                typeof value === 'object' &&
                !Array.isArray(value) &&
                target[key] &&
                typeof target[key] === 'object' &&
                !Array.isArray(target[key])
            ) {
                output[key] = this.mergeDeep(target[key], value);
            } else {
                output[key] = value;
            }
        });

        return output;
    }
}

export const vesselV3State = new VesselV3StateManager();
export default vesselV3State;
