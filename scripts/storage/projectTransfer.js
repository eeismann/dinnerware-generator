import { ProjectFileFormat } from './fileFormat.js';
import {
    saveProject, saveVesselProject, saveVesselV2Project, saveVesselV3Project,
    saveAuxiliaryProject
} from '../dashboard/projectStorage.js';

export function parseProjectFile(content) {
    const data = typeof content === 'string' ? JSON.parse(content) : content;
    const errors = ProjectFileFormat.validate(data);
    if (errors.length) throw new Error(errors.join('; '));
    const enhanced = ProjectFileFormat.detectFormat(data) === 'enhanced'
        ? data : ProjectFileFormat.migrateFromLegacy(data);
    return ProjectFileFormat.deserialize(enhanced);
}

// Imports and copies always get fresh identities. Source objects and saved
// originals stay intact, including their nested project IDs.
export function importProjectData(data) {
    const projectData = parseProjectFile(data);
    const appType = projectData.fileFormat.appType;
    const state = structuredClone(projectData.state);
    const name = projectData.project.name || 'Imported Project';
    const now = new Date().toISOString();
    const thumbnail = projectData.metadata?.thumbnailDataUrl || null;
    if (appType === 'dinnerware') {
        return saveProject({ id: null, projectName: name, thumbnail, state });
    }

    const project = {
        ...state, id: null, appType, thumbnail,
        project: { ...state.project, id: null, name, isDirty: false,
            dateCreated: now, lastModified: now, createdAt: now, modifiedAt: now }
    };
    const saver = { vessel: saveVesselProject, 'vessel-v2': saveVesselV2Project, 'vessel-v3': saveVesselV3Project }[appType];
    if (saver) return saver(project);

    const id = `${appType}_${crypto.randomUUID()}`;
    project.id = id;
    project.project.id = id;
    return saveAuxiliaryProject(project, appType);
}

export function duplicateStoredProject(project) {
    const appType = project.appType;
    const rawKey = { handle: 'handleData', vessel: 'vesselData',
        'vessel-v2': 'vesselV2Data', 'vessel-v3': 'vesselV3Data', castform: 'castFormData',
        stackedmold: 'stackedMoldData' }[appType];
    const state = appType === 'dinnerware' ? project.state : project[rawKey];
    if (!state) throw new Error('The project data is missing; the original has not been changed.');
    return importProjectData(ProjectFileFormat.serialize({
        projectName: `${project.projectName} (Copy)`, state, thumbnail: project.thumbnail
    }, appType));
}
