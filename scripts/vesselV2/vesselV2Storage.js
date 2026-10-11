/**
 * Vessel Designer V2 - Project Storage
 */

import vesselV2State from './state/vesselV2State.js';
import {
    getVesselV2ProjectData,
    saveVesselV2Project
} from '../dashboard/projectStorage.js';
import { ProjectFileFormat } from '../storage/fileFormat.js';

export class VesselV2Storage {
    static FILE_EXTENSION = '.vessel-v2.json';
    static FILE_TYPE = 'application/json';
    static AUTOSAVE_KEY = 'vessel_v2_autosave';

    static generateId() {
        return `vessel_v2_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    }

    static saveToProjectStorage(name, thumbnail = null) {
        const projectId = vesselV2State.getState('project.id') || this.generateId();
        const now = new Date().toISOString();

        vesselV2State.setState('project.id', projectId, { silent: true });
        vesselV2State.setState('project.name', name, { silent: true });
        vesselV2State.setState('project.lastModified', now, { silent: true });
        if (!vesselV2State.getState('project.dateCreated')) {
            vesselV2State.setState('project.dateCreated', now, { silent: true });
        }

        const state = vesselV2State.exportState();
        const projectData = {
            id: projectId,
            thumbnail,
            version: state.version,
            appType: 'vessel-v2',
            project: {
                id: projectId,
                name,
                dateCreated: state.project.dateCreated || now,
                lastModified: now,
                isDirty: false
            },
            global: state.global,
            profile: state.profile,
            ui: state.ui,
            warnings: state.warnings
        };

        const saved = saveVesselV2Project(projectData);
        vesselV2State.setState('project.isDirty', false, { silent: true });
        return saved;
    }

    static loadFromProjectStorage(projectId) {
        const projectData = getVesselV2ProjectData(projectId);
        if (!projectData) return false;

        vesselV2State.loadState({
            version: projectData.version || '2.0',
            appType: 'vessel-v2',
            project: {
                id: projectData.id || projectData.project?.id,
                name: projectData.project?.name || 'Untitled Vessel V2',
                dateCreated: projectData.project?.dateCreated,
                lastModified: projectData.project?.lastModified,
                isDirty: false
            },
            global: projectData.global,
            profile: projectData.profile,
            ui: projectData.ui,
            warnings: projectData.warnings
        });

        return true;
    }

    static saveToFile(filename = 'vessel-v2') {
        const state = vesselV2State.exportState();
        state.project.name = filename;
        state.project.lastModified = new Date().toISOString();

        const enhancedData = ProjectFileFormat.serialize({
            id: state.project.id,
            project: state.project,
            state,
            thumbnail: null
        }, 'vessel-v2');

        const blob = new Blob([JSON.stringify(enhancedData, null, 2)], { type: this.FILE_TYPE });
        const generatedFilename = ProjectFileFormat.generateFilename(filename, 'vessel-v2', new Date());
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = generatedFilename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        vesselV2State.setState('project.isDirty', false, { silent: true });
    }

    static async loadFromFile() {
        return new Promise((resolve, reject) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,.vessel-v2.json';

            input.onchange = async (event) => {
                const file = event.target.files[0];
                if (!file) {
                    reject(new Error('No file selected'));
                    return;
                }

                try {
                    const data = JSON.parse(await file.text());
                    const format = ProjectFileFormat.detectFormat(data);
                    let stateData;

                    if (format === 'enhanced') {
                        const deserialized = ProjectFileFormat.deserialize(data);
                        if (deserialized.fileFormat.appType !== 'vessel-v2') {
                            throw new Error('This is not a Vessel V2 project file');
                        }
                        stateData = deserialized.state;
                    } else if (data.appType === 'vessel-v2' || data.profile?.points) {
                        stateData = data;
                    } else {
                        throw new Error('Invalid Vessel V2 file format');
                    }

                    vesselV2State.loadState(stateData);
                    resolve(stateData);
                } catch (error) {
                    reject(error);
                }
            };

            input.click();
        });
    }

    static saveToLocalStorage(key = this.AUTOSAVE_KEY) {
        try {
            const state = vesselV2State.exportState();
            state.project.lastModified = new Date().toISOString();
            localStorage.setItem(key, JSON.stringify(state));
            return true;
        } catch (error) {
            console.error('Failed to save Vessel V2 autosave:', error);
            return false;
        }
    }

    static loadFromLocalStorage(key = this.AUTOSAVE_KEY) {
        try {
            const stored = localStorage.getItem(key);
            if (!stored) return false;
            const data = JSON.parse(stored);
            if (!data.profile?.points) return false;
            vesselV2State.loadState(data);
            return true;
        } catch (error) {
            console.error('Failed to load Vessel V2 autosave:', error);
            return false;
        }
    }

    static hasAutosave(key = this.AUTOSAVE_KEY) {
        try {
            return localStorage.getItem(key) !== null;
        } catch {
            return false;
        }
    }

    static setupAutosave(intervalMs = 30000) {
        return setInterval(() => {
            if (vesselV2State.getState('project.isDirty')) {
                this.saveToLocalStorage();
            }
        }, intervalMs);
    }
}

export default VesselV2Storage;
