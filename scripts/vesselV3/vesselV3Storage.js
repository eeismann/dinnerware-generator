/**
 * Vessel Designer V3 - Project Storage
 */

import vesselV3State from './state/vesselV3State.js';
import {
    getVesselV3ProjectData,
    saveVesselV3Project
} from '../dashboard/projectStorage.js';
import { ProjectFileFormat } from '../storage/fileFormat.js';

export class VesselV3Storage {
    static FILE_EXTENSION = '.vessel-v3.json';
    static FILE_TYPE = 'application/json';
    static AUTOSAVE_KEY = 'vessel_v3_autosave';

    static generateId() {
        return `vessel_v3_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    }

    static saveToProjectStorage(name, thumbnail = null) {
        const projectId = vesselV3State.getState('project.id') || this.generateId();
        const now = new Date().toISOString();

        vesselV3State.setState('project.id', projectId, { silent: true });
        vesselV3State.setState('project.name', name, { silent: true });
        vesselV3State.setState('project.lastModified', now, { silent: true });
        if (!vesselV3State.getState('project.dateCreated')) {
            vesselV3State.setState('project.dateCreated', now, { silent: true });
        }

        const state = vesselV3State.exportState();
        const projectData = {
            id: projectId,
            thumbnail,
            version: state.version,
            appType: 'vessel-v3',
            project: {
                id: projectId,
                name,
                dateCreated: state.project.dateCreated || now,
                lastModified: now,
                isDirty: false
            },
            global: state.global,
            profile: state.profile,
            spout: state.spout,
            lid: state.lid,
            ui: state.ui,
            warnings: state.warnings
        };

        const saved = saveVesselV3Project(projectData);
        vesselV3State.setState('project.isDirty', false, { silent: true });
        return saved;
    }

    static loadFromProjectStorage(projectId) {
        const projectData = getVesselV3ProjectData(projectId);
        if (!projectData) return false;

        vesselV3State.loadState({
            version: projectData.version || '2.0',
            appType: 'vessel-v3',
            project: {
                id: projectData.id || projectData.project?.id,
                name: projectData.project?.name || 'Untitled Vessel V3',
                dateCreated: projectData.project?.dateCreated,
                lastModified: projectData.project?.lastModified,
                isDirty: false
            },
            global: projectData.global,
            profile: projectData.profile,
            spout: projectData.spout,
            lid: projectData.lid,
            ui: projectData.ui,
            warnings: projectData.warnings
        });

        return true;
    }

    static saveToFile(filename = 'vessel-v3') {
        const state = vesselV3State.exportState();
        state.project.name = filename;
        state.project.lastModified = new Date().toISOString();

        const enhancedData = ProjectFileFormat.serialize({
            id: state.project.id,
            project: state.project,
            state,
            thumbnail: null
        }, 'vessel-v3');

        const blob = new Blob([JSON.stringify(enhancedData, null, 2)], { type: this.FILE_TYPE });
        const generatedFilename = ProjectFileFormat.generateFilename(filename, 'vessel-v3', new Date());
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = generatedFilename;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        vesselV3State.setState('project.isDirty', false, { silent: true });
    }

    static async loadFromFile() {
        return new Promise((resolve, reject) => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json,.vessel-v3.json';

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
                        if (deserialized.fileFormat.appType !== 'vessel-v3') {
                            throw new Error('This is not a Vessel V3 project file');
                        }
                        stateData = deserialized.state;
                    } else if (data.appType === 'vessel-v3' || data.profile?.points) {
                        stateData = data;
                    } else {
                        throw new Error('Invalid Vessel V3 file format');
                    }

                    vesselV3State.loadState(stateData);
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
            const state = vesselV3State.exportState();
            state.project.lastModified = new Date().toISOString();
            localStorage.setItem(key, JSON.stringify(state));
            return true;
        } catch (error) {
            console.error('Failed to save Vessel V3 autosave:', error);
            return false;
        }
    }

    static loadFromLocalStorage(key = this.AUTOSAVE_KEY) {
        try {
            const stored = localStorage.getItem(key);
            if (!stored) return false;
            const data = JSON.parse(stored);
            if (!data.profile?.points) return false;
            vesselV3State.loadState(data);
            return true;
        } catch (error) {
            console.error('Failed to load Vessel V3 autosave:', error);
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
            if (vesselV3State.getState('project.isDirty')) {
                this.saveToLocalStorage();
            }
        }, intervalMs);
    }
}

export default VesselV3Storage;
