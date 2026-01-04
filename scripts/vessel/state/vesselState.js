/**
 * Vessel Generator - State Management
 * Reactive state management with subscription support
 */

import { getDefaultState, deepClone } from './vesselDefaults.js';

class VesselStateManager {
    constructor() {
        this.state = getDefaultState();
        this.listeners = new Map();
        this.updateQueue = [];
        this.isProcessing = false;
        this.batchTimeout = null;
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

        return () => {
            const listeners = this.listeners.get(path);
            if (listeners) {
                listeners.delete(callback);
            }
        };
    }

    /**
     * Update state value
     * @param {string} path - Dot-notation path
     * @param {*} value - New value
     * @param {Object} options - { silent: boolean, batch: boolean }
     */
    setState(path, value, options = {}) {
        const { silent = false, batch = false } = options;
        
        this.updateQueue.push({ path, value, silent });
        
        if (!batch && !this.isProcessing) {
            this.processUpdates();
        }
    }

    /**
     * Batch multiple updates
     * @param {Array} updates - Array of { path, value } objects
     */
    batchUpdate(updates) {
        updates.forEach(({ path, value }) => {
            this.setState(path, value, { batch: true });
        });
        this.processUpdates();
    }

    /**
     * Process queued updates
     */
    processUpdates() {
        this.isProcessing = true;
        const notifyPaths = new Set();
        const changedPaths = [];

        while (this.updateQueue.length > 0) {
            const { path, value, silent } = this.updateQueue.shift();
            const oldValue = this.getNestedValue(this.state, path);
            
            // Check if value actually changed
            if (!this.isEqual(oldValue, value)) {
                this.setNestedValue(this.state, path, value);
                changedPaths.push(path);
                
                // Mark as dirty
                if (path !== 'project.isDirty' && path !== 'project.lastModified') {
                    this.state.project.isDirty = true;
                    this.state.project.lastModified = new Date().toISOString();
                }
                
                if (!silent) {
                    notifyPaths.add(path);
                    // Also notify parent paths
                    const parts = path.split('.');
                    while (parts.length > 1) {
                        parts.pop();
                        notifyPaths.add(parts.join('.'));
                    }
                }
            }
        }

        // Notify specific path listeners
        notifyPaths.forEach(path => {
            if (this.listeners.has(path)) {
                const value = this.getNestedValue(this.state, path);
                this.listeners.get(path).forEach(cb => {
                    try {
                        cb(value, path);
                    } catch (e) {
                        console.error('State listener error:', e);
                    }
                });
            }
        });

        // Notify wildcard listeners
        if (changedPaths.length > 0 && this.listeners.has('*')) {
            this.listeners.get('*').forEach(cb => {
                try {
                    cb(this.state, changedPaths);
                } catch (e) {
                    console.error('State wildcard listener error:', e);
                }
            });
        }

        this.isProcessing = false;
    }

    /**
     * Get state value
     * @param {string} [path] - Dot-notation path, or undefined for full state
     * @returns {*} Value at path
     */
    getState(path) {
        if (!path) return this.state;
        return this.getNestedValue(this.state, path);
    }

    /**
     * Reset state to defaults
     */
    reset() {
        this.state = getDefaultState();
        this.state.project.dateCreated = new Date().toISOString();
        this.notifyAll();
    }

    /**
     * Load state from object
     * @param {Object} data - State data to load
     */
    loadState(data) {
        // Merge with defaults to ensure all fields exist
        const defaults = getDefaultState();
        this.state = this.mergeDeep(defaults, data);
        this.state.project.isDirty = false;
        this.notifyAll();
    }

    /**
     * Export state for saving
     * @returns {Object} Serializable state
     */
    exportState() {
        return {
            version: '1.0',
            project: { ...this.state.project },
            global: { ...this.state.global },
            sections: deepClone(this.state.sections),
            transitions: { ...this.state.transitions }
        };
    }

    // Utility methods
    getNestedValue(obj, path) {
        return path.split('.').reduce((acc, part) => {
            if (acc === null || acc === undefined) return undefined;
            // Handle array indices
            const match = part.match(/^(\w+)\[(\d+)\]$/);
            if (match) {
                return acc[match[1]]?.[parseInt(match[2])];
            }
            return acc[part];
        }, obj);
    }

    setNestedValue(obj, path, value) {
        const parts = path.split('.');
        const last = parts.pop();
        
        const target = parts.reduce((acc, part) => {
            // Handle array indices
            const match = part.match(/^(\w+)\[(\d+)\]$/);
            if (match) {
                if (!(match[1] in acc)) acc[match[1]] = [];
                const idx = parseInt(match[2]);
                if (!acc[match[1]][idx]) acc[match[1]][idx] = {};
                return acc[match[1]][idx];
            }
            if (!(part in acc)) acc[part] = {};
            return acc[part];
        }, obj);
        
        // Handle array index in last part
        const match = last.match(/^(\w+)\[(\d+)\]$/);
        if (match) {
            if (!(match[1] in target)) target[match[1]] = [];
            target[match[1]][parseInt(match[2])] = value;
        } else {
            target[last] = value;
        }
    }

    isEqual(a, b) {
        if (a === b) return true;
        if (typeof a !== typeof b) return false;
        if (typeof a !== 'object' || a === null || b === null) return false;
        
        const keysA = Object.keys(a);
        const keysB = Object.keys(b);
        if (keysA.length !== keysB.length) return false;
        
        for (const key of keysA) {
            if (!this.isEqual(a[key], b[key])) return false;
        }
        return true;
    }

    mergeDeep(target, source) {
        const output = { ...target };
        if (this.isObject(target) && this.isObject(source)) {
            Object.keys(source).forEach(key => {
                if (this.isObject(source[key])) {
                    if (!(key in target)) {
                        output[key] = source[key];
                    } else {
                        output[key] = this.mergeDeep(target[key], source[key]);
                    }
                } else {
                    output[key] = source[key];
                }
            });
        }
        return output;
    }

    isObject(item) {
        return item && typeof item === 'object' && !Array.isArray(item);
    }

    notifyAll() {
        if (this.listeners.has('*')) {
            this.listeners.get('*').forEach(cb => {
                try {
                    cb(this.state, ['*']);
                } catch (e) {
                    console.error('State listener error:', e);
                }
            });
        }
    }
}

// Singleton instance
export const vesselState = new VesselStateManager();
export default vesselState;

