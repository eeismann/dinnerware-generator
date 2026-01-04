/**
 * Cast Form Generator - State Management
 * Reactive state with path-based subscriptions
 */

import { DEFAULT_PARAMS, deepClone } from './castFormDefaults.js';

class CastFormStateManager {
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
                sourceApp: null,           // 'vessel' | 'dinnerware' | null
                sourceProjectId: null,
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
                wallShells: [null, null, null],
                inputPreview: null,        // Scaled input for preview
                isGenerating: false,
                lastGenerated: null
            },
            
            view: {
                mode: 'exploded',          // 'exploded' | 'assembly' | 'crossSection'
                explosionDistance: 40,     // mm - distance mold pieces pull back from center
                crossSectionAngle: 0,
                showNatches: true,
                showGrid: true,
                showDimensions: true,
                selectedPart: null,        // 'foot' | 'wall1' | 'wall2' | 'wall3'
                cameraPreset: 'threeQuarter'
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
        if (this.isEqual(oldValue, value)) return;
        
        this.setNestedValue(this.state, path, value);
        
        // Mark dirty for parameter changes
        if (!path.startsWith('project.') && !path.startsWith('view.') && !path.startsWith('output.')) {
            this.state.project.isDirty = true;
            this.state.project.lastModified = new Date().toISOString();
        }
        
        if (!silent) {
            this.notifyListeners(path);
        }
    }

    /**
     * Batch multiple state updates
     */
    batchUpdate(updates) {
        updates.forEach(({ path, value }) => {
            this.setState(path, value, { silent: true });
        });
        this.notifyListeners('*');
    }

    /**
     * Set input geometry
     */
    setInputGeometry(geometry, fileName = '', sourceApp = null, sourceProjectId = null) {
        if (geometry) {
            geometry.computeBoundingBox();
            const box = geometry.boundingBox;
            const size = box.max.clone().sub(box.min);
            
            this.state.input = {
                ...this.state.input,
                geometry,
                fileName,
                sourceApp,
                sourceProjectId,
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
                sourceApp: null,
                sourceProjectId: null,
                isValid: false,
                bounds: null,
                validationErrors: []
            };
        }
        
        this.state.project.isDirty = true;
        this.notifyListeners('input');
    }

    /**
     * Set output geometry
     */
    setOutputGeometry(foot, walls, inputPreview = null) {
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
        return {
            version: '1.0',
            appType: 'cast-form-generator',
            project: { ...this.state.project, isDirty: false },
            params: deepClone(this.state.params),
            input: {
                source: this.state.input.source,
                fileName: this.state.input.fileName,
                sourceApp: this.state.input.sourceApp,
                sourceProjectId: this.state.input.sourceProjectId
            },
            view: { ...this.state.view }
        };
    }

    /**
     * Load state from saved data
     */
    loadState(data) {
        this.disposeGeometries();
        this.state = this.createInitialState();
        
        if (data.project) {
            Object.assign(this.state.project, data.project);
        }
        if (data.params) {
            this.state.params = deepClone(data.params);
        }
        if (data.input) {
            Object.assign(this.state.input, {
                source: data.input.source,
                fileName: data.input.fileName,
                sourceApp: data.input.sourceApp,
                sourceProjectId: data.input.sourceProjectId
            });
        }
        if (data.view) {
            Object.assign(this.state.view, data.view);
        }
        
        this.state.project.isDirty = false;
        this.notifyListeners('*');
    }

    /**
     * Mark project as saved
     */
    markSaved() {
        this.state.project.isDirty = false;
        this.state.project.lastModified = new Date().toISOString();
        this.notifyListeners('project');
    }

    /**
     * Dispose all geometries to free memory
     */
    disposeGeometries() {
        if (this.state.input.geometry) {
            this.state.input.geometry.dispose();
        }
        if (this.state.output.footShell) {
            this.state.output.footShell.dispose();
        }
        this.state.output.wallShells.forEach(wall => {
            if (wall) wall.dispose();
        });
        if (this.state.output.inputPreview) {
            this.state.output.inputPreview.dispose();
        }
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
        // Notify specific path listeners
        if (this.listeners.has(changedPath)) {
            const value = this.getNestedValue(this.state, changedPath);
            this.listeners.get(changedPath).forEach(cb => {
                try {
                    cb(value, changedPath);
                } catch (e) {
                    console.error('State listener error:', e);
                }
            });
        }
        
        // Notify parent path listeners
        const parts = changedPath.split('.');
        while (parts.length > 1) {
            parts.pop();
            const parentPath = parts.join('.');
            if (this.listeners.has(parentPath)) {
                const value = this.getNestedValue(this.state, parentPath);
                this.listeners.get(parentPath).forEach(cb => {
                    try {
                        cb(value, parentPath);
                    } catch (e) {
                        console.error('State listener error:', e);
                    }
                });
            }
        }
        
        // Notify wildcard listeners
        if (this.listeners.has('*')) {
            this.listeners.get('*').forEach(cb => {
                try {
                    cb(this.state, [changedPath]);
                } catch (e) {
                    console.error('State wildcard listener error:', e);
                }
            });
        }
    }
}

// Singleton instance
export const castFormState = new CastFormStateManager();
export default castFormState;

