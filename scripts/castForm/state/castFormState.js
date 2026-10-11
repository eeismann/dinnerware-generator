/**
 * Cast Form Generator - State Management
 * Reactive state with path-based subscriptions
 */

import * as THREE from 'three';
import { DEFAULT_PARAMS, deepClone } from './castFormDefaults.js';

export class CastFormStateManager {
    constructor() {
        this.state = this.createInitialState();
        this.listeners = new Map();
        this.isProcessing = false;
    }

    createInitialState() {
        return {
            project: {
                id: null,
                name: 'Untitled Cast Form',
                dateCreated: null,
                lastModified: null,
                isDirty: false
            },
            
            input: {
                source: 'platform',        // 'platform' | 'file'
                geometry: null,            // THREE.BufferGeometry
                fileName: '',
                validationSourceUrl: '',
                sourceApp: null,           // 'vessel' | 'dinnerware' | null
                sourceProjectId: null,
                patternMeta: null,         // Surface pattern metadata from source generator (Tier 1)
                isValid: false,
                bounds: null,              // { min, max, size }
                validationErrors: []
            },
            
            params: deepClone(DEFAULT_PARAMS),
            
            computed: {
                moldBounds: null,
                inputHeight: 0,
                inputMaxRadius: 0
            },
            
            output: {
                footShell: null,           // THREE.BufferGeometry
                wallShells: [],
                inputPreview: null,        // Scaled input for preview
                isGenerating: false,
                lastGenerated: null
            },
            
            view: {
                mode: 'exploded',          // 'exploded' | 'assembly' | 'crossSection'
                explosionDistance: 40,     // mm - distance mold pieces pull back from center
                crossSectionAngle: 0,
                showGrid: true,
                showDimensions: true,
                selectedPart: null,        // 'foot' | 'wall1'...'wall4'
                cameraPreset: 'threeQuarter',
                caseBoxPreview: {
                    enabled: false,        // swaps the viewport to the case box scene
                    target: 'wall'         // 'wall' | 'foot'
                }
            },
            
            warnings: [],
            errors: []
        };
    }

    /**
     * Subscribe to state changes
     * @param {string} path - Dot-notation path or '*' for all changes
     * @param {Function} callback - Called with (newValue, path)
     * @returns {Function} Unsubscribe function
     */
    subscribe(path, callback) {
        if (!this.listeners.has(path)) {
            this.listeners.set(path, new Set());
        }
        this.listeners.get(path).add(callback);
        return () => this.listeners.get(path)?.delete(callback);
    }

    /**
     * Get state value by path
     * @param {string} [path] - Dot-notation path, or undefined for full state
     */
    getState(path) {
        if (!path) return this.state;
        return this.getNestedValue(this.state, path);
    }

    /**
     * Set state value by path
     * @param {string} path - Dot-notation path
     * @param {*} value - New value
     * @param {Object} options - { silent: boolean }
     */
    setState(path, value, options = {}) {
        const { silent = false } = options;
        
        const oldValue = this.getNestedValue(this.state, path);
        if (this.isEqual(oldValue, value)) return false;
        
        this.setNestedValue(this.state, path, value);
        
        // Mark dirty for parameter changes
        const changedPaths = [path];
        if (path === 'project.name' || path === 'params' || path.startsWith('params.')
            || path === 'input' || path.startsWith('input.')) {
            this.state.project.isDirty = true;
            this.state.project.lastModified = new Date().toISOString();
            changedPaths.push('project.isDirty', 'project.lastModified');
        }
        
        if (!silent) {
            this.notifyListeners(changedPaths);
        }
        return true;
    }

    /**
     * Batch multiple state updates
     */
    batchUpdate(updates) {
        const changedPaths = [];
        updates.forEach(({ path, value }) => {
            if (this.setState(path, value, { silent: true })) changedPaths.push(path);
        });
        if (changedPaths.length) {
            this.notifyListeners([...changedPaths, 'project.isDirty', 'project.lastModified']);
        }
    }

    /**
     * Set input geometry
     */
    setInputGeometry(geometry, fileName = '', sourceApp = null, sourceProjectId = null, patternMeta = null) {
        const previousGeometry = this.state.input.geometry;
        if (previousGeometry && previousGeometry !== geometry) {
            previousGeometry.dispose();
            if (this.state.output.inputPreview === previousGeometry) {
                this.state.output.inputPreview = null;
            }
        }

        if (geometry) {
            geometry.computeBoundingBox();
            const box = geometry.boundingBox;
            const size = box.max.clone().sub(box.min);
            
            this.state.input = {
                ...this.state.input,
                geometry,
                fileName,
                validationSourceUrl: '',
                sourceApp,
                sourceProjectId,
                patternMeta,
                isValid: true,
                bounds: { min: box.min.clone(), max: box.max.clone(), size },
                validationErrors: []
            };
            
            this.state.computed.inputHeight = size.y;
            this.state.computed.inputMaxRadius = Math.max(
                Math.abs(box.max.x), Math.abs(box.min.x),
                Math.abs(box.max.z), Math.abs(box.min.z)
            );
        } else {
            this.state.input = {
                ...this.state.input,
                geometry: null,
                fileName: '',
                validationSourceUrl: '',
                sourceApp: null,
                sourceProjectId: null,
                patternMeta: null,
                isValid: false,
                bounds: null,
                validationErrors: []
            };
            this.state.computed.inputHeight = 0;
            this.state.computed.inputMaxRadius = 0;
        }
        
        this.disposeOutputGeometries();
        this.state.output.lastGenerated = null;
        this.state.output.isGenerating = false;
        this.state.project.isDirty = true;
        this.state.project.lastModified = new Date().toISOString();
        this.notifyListeners(['input', 'computed', 'output', 'project.isDirty', 'project.lastModified']);
    }

    /**
     * Set output geometry
     */
    setOutputGeometry(foot, walls, inputPreview = null) {
        this.disposeOutputGeometries();
        this.state.output.footShell = foot;
        this.state.output.wallShells = walls;
        this.state.output.inputPreview = inputPreview;
        this.state.output.lastGenerated = new Date().toISOString();
        this.state.output.isGenerating = false;
        this.notifyListeners('output');
    }

    /**
     * Set warnings
     */
    setWarnings(warnings) {
        this.state.warnings = warnings;
        this.notifyListeners('warnings');
    }

    /**
     * Set errors
     */
    setErrors(errors) {
        this.state.errors = errors;
        this.notifyListeners('errors');
    }

    /**
     * Reset to new project
     */
    reset() {
        // Dispose existing geometries
        this.disposeGeometries();
        
        this.state = this.createInitialState();
        this.state.project.dateCreated = new Date().toISOString();
        this.notifyListeners('*');
    }

    /**
     * Export state for saving
     */
    exportState() {
        // Serialize input geometry to JSON if it exists
        let geometryData = null;
        if (this.state.input.geometry) {
            geometryData = this.state.input.geometry.toJSON();
        }

        return {
            version: '1.0',
            appType: 'cast-form-generator',
            project: { ...this.state.project, isDirty: false },
            params: deepClone(this.state.params),
            input: {
                source: this.state.input.source,
                fileName: this.state.input.fileName,
                sourceApp: this.state.input.sourceApp,
                sourceProjectId: this.state.input.sourceProjectId,
                patternMeta: this.state.input.patternMeta || null,
                geometryData: geometryData,  // Serialized geometry
                bounds: this.state.input.bounds,
                isValid: this.state.input.isValid
            },
            view: deepClone(this.state.view)
        };
    }

    /**
     * Load state from saved data
     */
    loadState(data) {
        // Construct the replacement completely before publishing it. Parsing a
        // bad geometry must not discard the project the user already has open.
        const replacement = new CastFormStateManager();
        const next = replacement.state;

        if (data.project) {
            Object.assign(next.project, data.project);
        }
        if (data.params) {
            next.params = {
                ...deepClone(DEFAULT_PARAMS),
                ...deepClone(data.params),
                mold: {
                    ...deepClone(DEFAULT_PARAMS.mold),
                    ...(data.params.mold || {})
                },
                natches: {
                    ...deepClone(DEFAULT_PARAMS.natches),
                    ...(data.params.natches || {})
                },
                shell: {
                    ...deepClone(DEFAULT_PARAMS.shell),
                    ...(data.params.shell || {})
                },
                caseBox: {
                    ...deepClone(DEFAULT_PARAMS.caseBox),
                    ...(data.params.caseBox || {})
                },
                experimental: {
                    ...deepClone(DEFAULT_PARAMS.experimental),
                    ...(data.params.experimental || {})
                }
            };
        }

        // Deserialize and set input geometry properly
        if (data.input && data.input.geometryData) {
            const loader = new THREE.ObjectLoader();
            const geometry = loader.parseGeometries([data.input.geometryData])[data.input.geometryData.uuid];

            // Use setInputGeometry to properly initialize bounds and computed values
            if (!geometry?.getAttribute('position')) throw new Error('Saved input geometry has no positions');
            replacement.setInputGeometry(
                geometry,
                data.input.fileName || '',
                data.input.sourceApp || null,
                data.input.sourceProjectId || null,
                data.input.patternMeta || null
            );

            // Restore the source field
            next.input.source = data.input.source || 'file';
        } else if (data.input) {
            // No geometry data, just set metadata
            Object.assign(next.input, {
                source: data.input.source,
                fileName: data.input.fileName,
                sourceApp: data.input.sourceApp,
                sourceProjectId: data.input.sourceProjectId,
                isValid: false
            });
        }

        if (data.view) {
            Object.assign(next.view, deepClone(data.view));
            next.view.caseBoxPreview = {
                ...replacement.createInitialState().view.caseBoxPreview,
                ...data.view.caseBoxPreview
            };
        }

        next.project.isDirty = false;
        if (data.project?.lastModified) next.project.lastModified = data.project.lastModified;
        this.disposeGeometries();
        this.state = next;
        this.notifyListeners('*');
    }

    /**
     * Mark project as saved
     */
    markSaved(lastModified = new Date().toISOString()) {
        this.state.project.isDirty = false;
        this.state.project.lastModified = lastModified;
        this.notifyListeners('project');
    }

    /**
     * Dispose all geometries to free memory
     */
    disposeGeometries() {
        if (this.state.input.geometry) {
            this.state.input.geometry.dispose();
        }
        this.disposeOutputGeometries();
    }

    disposeOutputGeometries() {
        if (this.state.output.footShell) {
            this.state.output.footShell.dispose();
        }
        this.state.output.wallShells.forEach(wall => {
            if (wall) wall.dispose();
        });
        if (this.state.output.inputPreview && this.state.output.inputPreview !== this.state.input.geometry) {
            this.state.output.inputPreview.dispose();
        }
        this.state.output.footShell = null;
        this.state.output.wallShells = [];
        this.state.output.inputPreview = null;
    }

    // Utility methods
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
        if (a === b) return true;
        if (typeof a !== typeof b) return false;
        if (typeof a !== 'object' || a === null || b === null) return false;
        const keysA = Object.keys(a);
        if (keysA.length !== Object.keys(b).length) return false;
        return keysA.every(key => this.isEqual(a[key], b[key]));
    }

    notifyListeners(changedPath) {
        const changedPaths = [...new Set(Array.isArray(changedPath) ? changedPath : [changedPath])];
        const fullReplacement = changedPaths.includes('*');
        // A replaced parent invalidates its children too. Each named subscription
        // fires once per transaction; '*' always receives (state, changedPaths).
        for (const [path, callbacks] of this.listeners) {
            const affected = path === '*' || fullReplacement || changedPaths.some(changed =>
                path === changed || path.startsWith(`${changed}.`) || changed.startsWith(`${path}.`));
            if (!affected) continue;
            const value = path === '*' ? this.state : this.getNestedValue(this.state, path);
            for (const callback of callbacks) {
                try {
                    callback(value, path === '*' ? changedPaths : path);
                } catch (error) {
                    console.error('State listener error:', error);
                }
            }
        }
    }
}

// Singleton instance
export const castFormState = new CastFormStateManager();
export default castFormState;
