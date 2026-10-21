/**
 * Stacked Cylinder Mold Generator - state
 *
 * Path-based store (same shape of API as the other generators): project,
 * source (the ware's outer profile + underside at ware size, never a mesh),
 * params (grouped, see stackedMoldDefaults.js) and view. Projects persist as
 * JSON in localStorage under `playground_ceramics_stacked_mold_projects`.
 */

import {
    DEFAULT_PARAMS, DEFAULT_VIEW, STORAGE_KEY, AUTOSAVE_KEY, APP_TYPE,
    deepClone, sanitizeParams
} from './stackedMoldDefaults.js';

// 2: the strap groove became optional (off); v1 projects saved it on by default
// 3: height cuts follow the printer; v1–2 saved the prototype's 90 / 180 mm caps
const FORMAT_VERSION = 3;

function initialState() {
    return {
        project: { id: null, name: 'Untitled Stacked Mold', dateCreated: null, lastModified: null, isDirty: false },
        source: null,
        params: deepClone(DEFAULT_PARAMS),
        view: { ...DEFAULT_VIEW }
    };
}

const getPath = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
function setPath(obj, path, value) {
    const keys = path.split('.');
    let o = obj;
    keys.slice(0, -1).forEach(k => { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
    o[keys[keys.length - 1]] = value;
}

class StackedMoldState {
    constructor() {
        this.state = initialState();
        this.listeners = new Map();
    }

    getState(path) {
        return path ? getPath(this.state, path) : this.state;
    }

    subscribe(path, fn) {
        if (!this.listeners.has(path)) this.listeners.set(path, new Set());
        this.listeners.get(path).add(fn);
        return () => this.listeners.get(path)?.delete(fn);
    }

    notify(paths) {
        const fired = new Set();
        for (const [key, fns] of this.listeners) {
            const hit = key === '*' || paths.some(p => p === key || p.startsWith(key + '.') || key.startsWith(p + '.'));
            if (!hit) continue;
            fns.forEach(fn => {
                if (fired.has(fn)) return;
                fired.add(fn);
                fn(this.getState(key === '*' ? undefined : key), paths);
            });
        }
    }

    setState(path, value, { silent = false } = {}) {
        if (JSON.stringify(getPath(this.state, path)) === JSON.stringify(value)) return false;
        setPath(this.state, path, value);
        const paths = [path];
        if (/^(params|source|project\.name)/.test(path)) {
            this.state.project.isDirty = true;
            this.state.project.lastModified = new Date().toISOString();
            paths.push('project.isDirty');
        }
        if (!silent) this.notify(paths);
        return true;
    }

    reset() {
        const view = this.state.view;
        this.state = initialState();
        this.state.view = { ...view, unit: 'U2' };
        this.notify(['project', 'source', 'params', 'view']);
    }

    /* ---------- serialization ---------- */

    toProjectData() {
        const { project, source, params } = this.state;
        return {
            formatVersion: FORMAT_VERSION,
            appType: APP_TYPE,
            id: project.id,
            project: { ...project, isDirty: undefined },
            source: deepClone(source),
            params: deepClone(params),
            view: { mode: this.state.view.mode, unit: this.state.view.unit, section: this.state.view.section }
        };
    }

    loadProjectData(data) {
        if (!data || (data.appType && data.appType !== APP_TYPE)) {
            throw new Error('That file is not a Stacked Mold project.');
        }
        const next = initialState();
        next.project = {
            ...next.project,
            ...(data.project || {}),
            id: data.id || data.project?.id || null,
            isDirty: false
        };
        next.source = data.source && (data.source.profile?.outer?.length || data.source.profile?.controlPoints?.length)
            ? deepClone(data.source) : null;
        next.params = sanitizeParams(data.params);
        const version = data.formatVersion || 1;
        if (version < 2) next.params.parts.strapGroove = false;
        if (version < 3) {
            if (next.params.slicing.maxRingH === 90) next.params.slicing.maxRingH = DEFAULT_PARAMS.slicing.maxRingH;
            if (next.params.slicing.maxSplitH === 180) next.params.slicing.maxSplitH = DEFAULT_PARAMS.slicing.maxSplitH;
        }
        next.view = { ...this.state.view, ...(data.view || {}) };
        this.state = next;
        this.notify(['project', 'source', 'params', 'view']);
    }

    /* ---------- storage ---------- */

    readProjects() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list : [];
        } catch {
            return [];
        }
    }

    saveProject(name, thumbnail = null) {
        const now = new Date().toISOString();
        const project = this.state.project;
        if (!project.id) {
            project.id = `stackedmold_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
            project.dateCreated = now;
        }
        project.name = name || project.name;
        project.lastModified = now;
        const data = { ...this.toProjectData(), thumbnail };
        const list = this.readProjects().filter(p => (p.id || p.project?.id) !== project.id);
        list.push(data);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
        project.isDirty = false;
        this.notify(['project']);
        return data;
    }

    loadProject(id) {
        const data = this.readProjects().find(p => (p.id || p.project?.id) === id);
        if (!data) throw new Error('Saved project not found.');
        this.loadProjectData(data);
    }

    autosave() {
        try {
            localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ ...this.toProjectData(), isDirty: this.state.project.isDirty }));
        } catch {
            // Storage full or unavailable: autosave is best-effort
        }
    }

    restoreAutosave() {
        try {
            const raw = localStorage.getItem(AUTOSAVE_KEY);
            if (!raw) return false;
            const data = JSON.parse(raw);
            this.loadProjectData(data);
            this.state.project.isDirty = Boolean(data.isDirty);
            this.notify(['project.isDirty']);
            return true;
        } catch {
            return false;
        }
    }
}

export const stackedMoldState = new StackedMoldState();
export default stackedMoldState;
