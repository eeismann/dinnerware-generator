/**
 * Vessel Generator - Project Storage
 * Save and load vessel projects
 */

import vesselState from './state/vesselState.js';
import { saveVesselProject, getVesselProjectData } from '../dashboard/projectStorage.js';

// Storage key for vessel projects (same as in projectStorage.js)
const VESSEL_PROJECTS_STORAGE_KEY = 'playground_ceramics_vessel_projects';

export class VesselStorage {
    static FILE_EXTENSION = '.vessel.json';
    static FILE_TYPE = 'application/json';

    /**
     * Generate a unique project ID
     * @returns {string}
     */
    static generateId() {
        return 'vessel_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    /**
     * Save project to dashboard storage (localStorage)
     * @param {string} name - Project name
     * @param {string|null} thumbnail - Base64 thumbnail image
     * @returns {Object} Saved project data
     */
    static saveToProjectStorage(name, thumbnail = null) {
        const state = vesselState.exportState();
        const projectId = vesselState.getState('project.id') || this.generateId();
        const now = new Date().toISOString();
        
        // Update state with project info
        vesselState.setState('project.id', projectId, { silent: true });
        vesselState.setState('project.name', name, { silent: true });
        vesselState.setState('project.lastModified', now, { silent: true });
        if (!vesselState.getState('project.dateCreated')) {
            vesselState.setState('project.dateCreated', now, { silent: true });
        }
        
        // Get updated state
        const updatedState = vesselState.exportState();
        
        // Create project data structure
        const projectData = {
            id: projectId,
            thumbnail: thumbnail,
            version: updatedState.version,
            project: {
                id: projectId,
                name: name,
                dateCreated: updatedState.project.dateCreated || now,
                lastModified: now,
                isDirty: false
            },
            global: updatedState.global,
            sections: updatedState.sections,
            transitions: updatedState.transitions
        };
        
        // Save using the project storage module
        const saved = saveVesselProject(projectData);
        
        // Mark as saved
        vesselState.setState('project.isDirty', false, { silent: true });
        
        return saved;
    }

    /**
     * Load project from dashboard storage by ID
     * @param {string} projectId 
     * @returns {boolean} Success
     */
    static loadFromProjectStorage(projectId) {
        const projectData = getVesselProjectData(projectId);
        if (!projectData) {
            console.warn('Project not found:', projectId);
            return false;
        }
        
        try {
            // Load the vessel state from the project data
            const stateData = {
                version: projectData.version || '1.0',
                project: {
                    id: projectData.id || projectData.project?.id,
                    name: projectData.project?.name || 'Untitled',
                    dateCreated: projectData.project?.dateCreated,
                    lastModified: projectData.project?.lastModified,
                    isDirty: false
                },
                global: projectData.global,
                sections: projectData.sections,
                transitions: projectData.transitions
            };
            
            vesselState.loadState(stateData);
            return true;
        } catch (e) {
            console.error('Failed to load project from storage:', e);
            return false;
        }
    }

    /**
     * Save current project to file (for export/backup)
     * @param {string} filename - Filename without extension
     */
    static saveToFile(filename = 'vessel') {
        const state = vesselState.exportState();
        state.project.name = filename;
        state.project.lastModified = new Date().toISOString();
        
        const json = JSON.stringify(state, null, 2);
        const blob = new Blob([json], { type: this.FILE_TYPE });
        
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${filename}${this.FILE_EXTENSION}`;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        
        // Mark as saved
        vesselState.setState('project.isDirty', false, { silent: true });
    }

    /**
     * Load project from file
     * @returns {Promise<Object>} Loaded state
     */
    static async loadFromFile() {
        return new Promise((resolve, reject) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = this.FILE_EXTENSION + ',.json';
            
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (!file) {
                    reject(new Error('No file selected'));
                    return;
                }
                
                try {
                    const text = await file.text();
                    const data = JSON.parse(text);
                    
                    // Validate
                    if (!data.version || !data.global || !data.sections) {
                        throw new Error('Invalid vessel file format');
                    }
                    
                    // Load into state
                    vesselState.loadState(data);
                    resolve(data);
                } catch (err) {
                    reject(err);
                }
            };
            
            input.click();
        });
    }

    /**
     * Save project to localStorage
     * @param {string} key - Storage key
     */
    static saveToLocalStorage(key = 'vessel_autosave') {
        const state = vesselState.exportState();
        state.project.lastModified = new Date().toISOString();
        
        try {
            localStorage.setItem(key, JSON.stringify(state));
            return true;
        } catch (e) {
            console.error('Failed to save to localStorage:', e);
            return false;
        }
    }

    /**
     * Load project from localStorage
     * @param {string} key - Storage key
     * @returns {boolean} Success
     */
    static loadFromLocalStorage(key = 'vessel_autosave') {
        try {
            const stored = localStorage.getItem(key);
            if (!stored) return false;
            
            const data = JSON.parse(stored);
            
            // Validate basic structure
            if (!data.global || !data.sections) {
                console.warn('Invalid stored data structure');
                return false;
            }
            
            vesselState.loadState(data);
            return true;
        } catch (e) {
            console.error('Failed to load from localStorage:', e);
            return false;
        }
    }

    /**
     * Clear localStorage save
     * @param {string} key - Storage key
     */
    static clearLocalStorage(key = 'vessel_autosave') {
        try {
            localStorage.removeItem(key);
        } catch (e) {
            console.error('Failed to clear localStorage:', e);
        }
    }

    /**
     * Check if autosave exists
     * @param {string} key - Storage key
     * @returns {boolean}
     */
    static hasAutosave(key = 'vessel_autosave') {
        try {
            return localStorage.getItem(key) !== null;
        } catch (e) {
            return false;
        }
    }

    /**
     * Get autosave metadata
     * @param {string} key - Storage key
     * @returns {Object|null}
     */
    static getAutosaveInfo(key = 'vessel_autosave') {
        try {
            const stored = localStorage.getItem(key);
            if (!stored) return null;
            
            const data = JSON.parse(stored);
            return {
                name: data.project?.name || 'Untitled',
                lastModified: data.project?.lastModified || null
            };
        } catch (e) {
            return null;
        }
    }

    /**
     * Export state as JSON string
     * @returns {string}
     */
    static exportAsJSON() {
        return JSON.stringify(vesselState.exportState(), null, 2);
    }

    /**
     * Import state from JSON string
     * @param {string} json 
     * @returns {boolean}
     */
    static importFromJSON(json) {
        try {
            const data = JSON.parse(json);
            vesselState.loadState(data);
            return true;
        } catch (e) {
            console.error('Failed to import JSON:', e);
            return false;
        }
    }

    /**
     * Create a thumbnail of the current vessel
     * @param {Function} captureFunc - Function to capture viewport
     * @returns {string|null} Base64 data URL
     */
    static createThumbnail(captureFunc) {
        try {
            return captureFunc();
        } catch (e) {
            console.error('Failed to create thumbnail:', e);
            return null;
        }
    }

    /**
     * Setup autosave interval
     * @param {number} intervalMs - Autosave interval in milliseconds
     * @returns {number} Interval ID
     */
    static setupAutosave(intervalMs = 60000) {
        return setInterval(() => {
            if (vesselState.getState('project.isDirty')) {
                this.saveToLocalStorage();
                console.log('Autosaved');
            }
        }, intervalMs);
    }
}

export default VesselStorage;


