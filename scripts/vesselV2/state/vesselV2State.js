/**
 * Vessel Designer V2 - State Management
 */

import { deepClone, getDefaultVesselV2State } from './vesselV2Defaults.js';
import { normalizeMotif } from '../../geometry/surfacePatternOptions.js';

class VesselV2StateManager {
    constructor() {
        this.state = getDefaultVesselV2State();
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
        this.state = getDefaultVesselV2State();
        this.state.project.dateCreated = new Date().toISOString();
        this.history = [this.createHistorySnapshot()];
        this.historyIndex = 0;
        this.notify('*');
    }

    loadState(data) {
        const defaults = getDefaultVesselV2State();
        this.state = this.mergeDeep(defaults, data || {});
        this.state.profile.mode = this.normalizeProfileMode(this.state.profile.mode);
        this.state.profile.allowFooterOverlap = this.state.profile.allowFooterOverlap === true;
        this.state.profile.points = this.normalizePoints(this.state.profile.points);
        this.state.project.isDirty = false;
        this.history = [this.createHistorySnapshot()];
        this.historyIndex = 0;
        this.notify('*');
    }

    exportState() {
        return {
            version: '2.0',
            appType: 'vessel-v2',
            project: { ...this.state.project },
            global: { ...this.state.global },
            profile: deepClone(this.state.profile),
            ui: { ...this.state.ui },
            warnings: deepClone(this.state.warnings)
        };
    }

    normalizePoints(points) {
        const source = Array.isArray(points) && points.length > 0
            ? points
            : getDefaultVesselV2State().profile.points;
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

export const vesselV2State = new VesselV2StateManager();
export default vesselV2State;
