import { clearDinnerwareDrafts, removeDinnerwareDraft, getDinnerwareDraftProjects } from '../storage/dinnerwareDrafts.js';

/**
 * Project Storage Module
 * Manages saved projects in localStorage with thumbnail support
 * Supports dinnerware, handle, and vessel generator projects
 */

const PROJECTS_STORAGE_KEY = 'playground_ceramics_projects';
const HANDLE_PROJECTS_STORAGE_KEY = 'playground_ceramics_handle_projects';
const VESSEL_PROJECTS_STORAGE_KEY = 'playground_ceramics_vessel_projects';
const VESSEL_V2_PROJECTS_STORAGE_KEY = 'playground_ceramics_vessel_v2_projects';
const VESSEL_V3_PROJECTS_STORAGE_KEY = 'playground_ceramics_vessel_v3_projects';
const CASTFORM_PROJECTS_STORAGE_KEY = 'playground_ceramics_castform_projects';

export function readProjectCollection(key) {
    const raw = localStorage.getItem(key);
    const projects = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(projects)) throw new Error('Saved project collection is unreadable; it has not been replaced.');
    return projects;
}

export function writeProjectCollection(key, projects) {
    try {
        localStorage.setItem(key, JSON.stringify(projects));
    } catch (error) {
        if (error.name !== 'QuotaExceededError') throw error;
        // Never report success unless the retry also persists successfully.
        const smaller = structuredClone(projects);
        compressProjects(smaller);
        localStorage.setItem(key, JSON.stringify(smaller));
    }
}

export function saveAuxiliaryProject(project, appType) {
    const key = appType === 'handle' ? HANDLE_PROJECTS_STORAGE_KEY
        : appType === 'castform' ? CASTFORM_PROJECTS_STORAGE_KEY : null;
    if (!key) throw new Error(`Unsupported project type: ${appType}`);
    const projects = readProjectCollection(key);
    projects.push(project);
    writeProjectCollection(key, projects);
    return project;
}

/**
 * Get all saved projects (dinnerware, handle, and vessel projects)
 * @returns {Array} Array of saved project objects
 */
export function getAllProjects() {
    const dinnerwareProjects = getDinnerwareProjects();
    const handleProjects = getHandleProjects();
    const vesselProjects = getVesselProjects();
    const vesselV2Projects = getVesselV2Projects();
    const vesselV3Projects = getVesselV3Projects();
    const castFormProjects = getCastFormProjects();

    // Combine and sort by last modified date (newest first)
    const allProjects = [...dinnerwareProjects, ...handleProjects, ...vesselProjects, ...vesselV2Projects, ...vesselV3Projects, ...castFormProjects];
    return allProjects.sort((a, b) => 
        new Date(b.lastModified) - new Date(a.lastModified)
    );
}

/**
 * Get dinnerware projects only
 * @returns {Array} Array of dinnerware project objects
 */
export function getDinnerwareProjects() {
    let projects = [];
    try { projects = readProjectCollection(PROJECTS_STORAGE_KEY); }
    catch (error) { console.warn('Failed to load dinnerware projects:', error); }
    const savedIds = new Set(projects.map(project => project.id));
    const drafts = getDinnerwareDraftProjects().filter(project => !savedIds.has(project.id));
    return [...projects, ...drafts].map(project => ({
        ...project, appType: 'dinnerware', projectName: project.projectName || 'Untitled'
    })).sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
}

/**
 * Get handle projects only
 * @returns {Array} Array of handle project objects
 */
export function getHandleProjects() {
    try {
        const data = localStorage.getItem(HANDLE_PROJECTS_STORAGE_KEY);
        if (data) {
            const projects = JSON.parse(data);
            // Normalize handle project structure to match dinnerware format
            return projects.map(p => ({
                id: p.project?.id || p.id,
                projectName: p.project?.name || 'Untitled Handle',
                dateCreated: p.project?.createdAt || p.dateCreated,
                lastModified: p.project?.modifiedAt || p.lastModified,
                thumbnail: p.thumbnail || null,
                appType: 'handle',
                // Store original data for loading
                handleData: p
            })).sort((a, b) => 
                new Date(b.lastModified) - new Date(a.lastModified)
            );
        }
    } catch (e) {
        console.warn('Failed to load handle projects:', e);
    }
    return [];
}

/**
 * Get vessel projects only
 * @returns {Array} Array of vessel project objects
 */
export function getVesselProjects() {
    try {
        const data = localStorage.getItem(VESSEL_PROJECTS_STORAGE_KEY);
        if (data) {
            const projects = JSON.parse(data);
            // Normalize vessel project structure to match dashboard format
            return projects.map(p => ({
                id: p.id || p.project?.id,
                projectName: p.project?.name || 'Untitled Vessel',
                dateCreated: p.project?.dateCreated || p.dateCreated,
                lastModified: p.project?.lastModified || p.lastModified,
                thumbnail: p.thumbnail || null,
                appType: 'vessel',
                // Store original data for loading
                vesselData: p
            })).sort((a, b) => 
                new Date(b.lastModified) - new Date(a.lastModified)
            );
        }
    } catch (e) {
        console.warn('Failed to load vessel projects:', e);
    }
    return [];
}

/**
 * Get Vessel Designer V2 projects only
 * @returns {Array} Array of vessel v2 project objects
 */
export function getVesselV2Projects() {
    try {
        const data = localStorage.getItem(VESSEL_V2_PROJECTS_STORAGE_KEY);
        if (data) {
            const projects = JSON.parse(data);
            return projects.map(p => ({
                id: p.id || p.project?.id,
                projectName: p.project?.name || 'Untitled Vessel V2',
                dateCreated: p.project?.dateCreated || p.dateCreated,
                lastModified: p.project?.lastModified || p.lastModified,
                thumbnail: p.thumbnail || null,
                appType: 'vessel-v2',
                vesselV2Data: p
            })).sort((a, b) =>
                new Date(b.lastModified) - new Date(a.lastModified)
            );
        }
    } catch (e) {
        console.warn('Failed to load Vessel V2 projects:', e);
    }
    return [];
}

/**
 * Get Vessel Designer V3 projects only
 * @returns {Array} Array of vessel v3 project objects
 */
export function getVesselV3Projects() {
    try {
        const data = localStorage.getItem(VESSEL_V3_PROJECTS_STORAGE_KEY);
        if (data) {
            const projects = JSON.parse(data);
            return projects.map(p => ({
                id: p.id || p.project?.id,
                projectName: p.project?.name || 'Untitled Vessel V3',
                dateCreated: p.project?.dateCreated || p.dateCreated,
                lastModified: p.project?.lastModified || p.lastModified,
                thumbnail: p.thumbnail || null,
                appType: 'vessel-v3',
                vesselV3Data: p
            })).sort((a, b) =>
                new Date(b.lastModified) - new Date(a.lastModified)
            );
        }
    } catch (e) {
        console.warn('Failed to load Vessel V3 projects:', e);
    }
    return [];
}

/**
 * Get cast form projects only
 * @returns {Array} Array of cast form project objects
 */
export function getCastFormProjects() {
    try {
        const data = localStorage.getItem(CASTFORM_PROJECTS_STORAGE_KEY);
        if (data) {
            const projects = JSON.parse(data);
            // Normalize cast form project structure to match dashboard format
            return projects.map(p => ({
                id: p.id || p.project?.id,
                projectName: p.project?.name || 'Untitled Cast Form',
                dateCreated: p.project?.dateCreated || p.dateCreated,
                lastModified: p.project?.lastModified || p.lastModified,
                thumbnail: p.thumbnail || null,
                appType: 'castform',
                // Store original data for loading
                castFormData: p
            })).sort((a, b) => 
                new Date(b.lastModified) - new Date(a.lastModified)
            );
        }
    } catch (e) {
        console.warn('Failed to load cast form projects:', e);
    }
    return [];
}

/**
 * Get a single project by ID (searches dinnerware, handle, vessel, and cast form projects)
 * @param {string} projectId 
 * @returns {Object|null} Project object or null
 */
export function getProject(projectId) {
    // Check dinnerware projects first
    const dinnerwareProjects = getDinnerwareProjects();
    const dinnerwareProject = dinnerwareProjects.find(p => p.id === projectId);
    if (dinnerwareProject) return dinnerwareProject;
    
    // Check handle projects
    const handleProjects = getHandleProjects();
    const handleProject = handleProjects.find(p => p.id === projectId);
    if (handleProject) return handleProject;
    
    // Check vessel projects
    const vesselProjects = getVesselProjects();
    const vesselProject = vesselProjects.find(p => p.id === projectId);
    if (vesselProject) return vesselProject;

    // Check Vessel V2 projects
    const vesselV2Projects = getVesselV2Projects();
    const vesselV2Project = vesselV2Projects.find(p => p.id === projectId);
    if (vesselV2Project) return vesselV2Project;

    // Check Vessel V3 projects
    const vesselV3Projects = getVesselV3Projects();
    const vesselV3Project = vesselV3Projects.find(p => p.id === projectId);
    if (vesselV3Project) return vesselV3Project;

    // Check cast form projects
    const castFormProjects = getCastFormProjects();
    const castFormProject = castFormProjects.find(p => p.id === projectId);
    if (castFormProject) return castFormProject;
    
    return null;
}

/**
 * Save a dinnerware project (create or update)
 * Note: Handle projects use their own save logic in handleMain.js
 * @param {Object} project Project data including thumbnail
 * @returns {Object} Saved project with ID
 */
export function saveProject(project) {
    project = structuredClone(project);
    // Only get dinnerware projects - don't mix with handle projects
    const projects = readProjectCollection(PROJECTS_STORAGE_KEY);
    
    // Generate ID if new project
    if (!project.id) {
        project.id = generateId();
        project.dateCreated = new Date().toISOString();
    }
    project.dateCreated ||= projects.find(p => p.id === project.id)?.dateCreated || new Date().toISOString();
    
    project.lastModified = new Date().toISOString();
    project.state = { ...project.state, project: {
        ...project.state?.project, id: project.id, name: project.projectName,
        dateCreated: project.dateCreated, lastModified: project.lastModified, isDirty: false
    } };
    
    // Find existing project or add new
    const existingIndex = projects.findIndex(p => p.id === project.id);
    if (existingIndex >= 0) {
        projects[existingIndex] = project;
    } else {
        projects.push(project);
    }
    
    // Save to localStorage (dinnerware projects only)
    writeProjectCollection(PROJECTS_STORAGE_KEY, projects);
    
    return project;
}

/**
 * Delete a project by ID (handles dinnerware, handle, and vessel projects)
 * @param {string} projectId 
 * @returns {boolean} Success status
 */
export function deleteProject(projectId) {
    try {
        // Try to delete from dinnerware projects
        const dinnerwareData = localStorage.getItem(PROJECTS_STORAGE_KEY);
        if (dinnerwareData) {
            const dinnerwareProjects = JSON.parse(dinnerwareData);
            const filteredDinnerware = dinnerwareProjects.filter(p => p.id !== projectId);
            if (filteredDinnerware.length !== dinnerwareProjects.length) {
                localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(filteredDinnerware));
                removeDinnerwareDraft(projectId);
                return true;
            }
        }
        
        // Try to delete from handle projects
        const handleData = localStorage.getItem(HANDLE_PROJECTS_STORAGE_KEY);
        if (handleData) {
            const handleProjects = JSON.parse(handleData);
            const filteredHandle = handleProjects.filter(p => 
                (p.project?.id || p.id) !== projectId
            );
            if (filteredHandle.length !== handleProjects.length) {
                localStorage.setItem(HANDLE_PROJECTS_STORAGE_KEY, JSON.stringify(filteredHandle));
                return true;
            }
        }
        
        // Try to delete from vessel projects
        const vesselData = localStorage.getItem(VESSEL_PROJECTS_STORAGE_KEY);
        if (vesselData) {
            const vesselProjects = JSON.parse(vesselData);
            const filteredVessel = vesselProjects.filter(p => 
                (p.id || p.project?.id) !== projectId
            );
            if (filteredVessel.length !== vesselProjects.length) {
                localStorage.setItem(VESSEL_PROJECTS_STORAGE_KEY, JSON.stringify(filteredVessel));
                return true;
            }
        }

        // Try to delete from Vessel V2 projects
        const vesselV2Data = localStorage.getItem(VESSEL_V2_PROJECTS_STORAGE_KEY);
        if (vesselV2Data) {
            const vesselV2Projects = JSON.parse(vesselV2Data);
            const filteredVesselV2 = vesselV2Projects.filter(p =>
                (p.id || p.project?.id) !== projectId
            );
            if (filteredVesselV2.length !== vesselV2Projects.length) {
                localStorage.setItem(VESSEL_V2_PROJECTS_STORAGE_KEY, JSON.stringify(filteredVesselV2));
                return true;
            }
        }
        
        // Try to delete from Vessel V3 projects
        const vesselV3Data = localStorage.getItem(VESSEL_V3_PROJECTS_STORAGE_KEY);
        if (vesselV3Data) {
            const vesselV3Projects = JSON.parse(vesselV3Data);
            const filteredVesselV3 = vesselV3Projects.filter(p =>
                (p.id || p.project?.id) !== projectId
            );
            if (filteredVesselV3.length !== vesselV3Projects.length) {
                localStorage.setItem(VESSEL_V3_PROJECTS_STORAGE_KEY, JSON.stringify(filteredVesselV3));
                return true;
            }
        }

        // Try to delete from cast form projects
        const castFormData = localStorage.getItem(CASTFORM_PROJECTS_STORAGE_KEY);
        if (castFormData) {
            const castFormProjects = JSON.parse(castFormData);
            const filteredCastForm = castFormProjects.filter(p => 
                (p.id || p.project?.id) !== projectId
            );
            if (filteredCastForm.length !== castFormProjects.length) {
                localStorage.setItem(CASTFORM_PROJECTS_STORAGE_KEY, JSON.stringify(filteredCastForm));
                return true;
            }
        }
        
        if (getDinnerwareDraftProjects().some(project => project.id === projectId)) {
            removeDinnerwareDraft(projectId);
            return true;
        }
        return false;
    } catch (e) {
        console.error('Failed to delete project:', e);
        return false;
    }
}

/**
 * Clear all projects (dinnerware, handle, and vessel)
 * @returns {boolean} Success status
 */
export function clearAllProjects() {
    try {
        clearDinnerwareDrafts();
        localStorage.removeItem(PROJECTS_STORAGE_KEY);
        localStorage.removeItem(HANDLE_PROJECTS_STORAGE_KEY);
        localStorage.removeItem(VESSEL_PROJECTS_STORAGE_KEY);
        localStorage.removeItem(VESSEL_V2_PROJECTS_STORAGE_KEY);
        localStorage.removeItem(VESSEL_V3_PROJECTS_STORAGE_KEY);
        localStorage.removeItem(CASTFORM_PROJECTS_STORAGE_KEY);
        localStorage.removeItem('dinnerware_current_project');
        localStorage.removeItem('vessel_autosave');
        localStorage.removeItem('vessel_v2_autosave');
        localStorage.removeItem('vessel_v3_autosave');
        return true;
    } catch (e) {
        console.error('Failed to clear projects:', e);
        return false;
    }
}

/**
 * Generate a unique ID
 * @returns {string} Unique identifier
 */
function generateId() {
    return `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Compress projects by reducing thumbnail quality for older projects
 * @param {Array} projects 
 */
function compressProjects(projects) {
    // Sort by date (oldest first)
    projects.sort((a, b) => new Date(a.lastModified) - new Date(b.lastModified));
    
    // Remove thumbnails from oldest half of projects
    const halfLength = Math.floor(projects.length / 2);
    for (let i = 0; i < halfLength; i++) {
        if (projects[i].thumbnail) {
            delete projects[i].thumbnail;
        }
    }
}

/**
 * Format date for display
 * @param {string} isoString ISO date string
 * @returns {string} Formatted date
 */
export function formatDate(isoString) {
    if (!isoString) return 'Unknown';
    
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
        // Today - show time
        return date.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
        });
    } else if (diffDays === 1) {
        return 'Yesterday';
    } else if (diffDays < 7) {
        return `${diffDays} days ago`;
    } else if (diffDays < 30) {
        const weeks = Math.floor(diffDays / 7);
        return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    } else {
        return date.toLocaleDateString('en-US', { 
            month: 'short', 
            day: 'numeric',
            year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });
    }
}

/**
 * Count visible items in a project
 * @param {Object} project 
 * @returns {number} Number of visible items
 */
export function countVisibleItems(project) {
    if (project.state && project.state.ui && project.state.ui.visibleItems) {
        return project.state.ui.visibleItems.length;
    }
    return 7; // Default to all items
}

/**
 * Save a vessel project (create or update)
 * @param {Object} projectData Full vessel project data including state and thumbnail
 * @returns {Object} Saved project with ID
 */
export function saveVesselProject(projectData) {
    const projects = readProjectCollection(VESSEL_PROJECTS_STORAGE_KEY);
    
    // Ensure project has an ID
    const projectId = projectData.id || projectData.project?.id || generateId();
    const now = new Date().toISOString();
    
    // Normalize the project data structure
    const normalizedProject = {
        ...projectData,
        id: projectId,
        project: {
            ...projectData.project,
            id: projectId,
            lastModified: now,
            dateCreated: projectData.project?.dateCreated || now
        }
    };
    
    // Find existing project or add new
    const existingIndex = projects.findIndex(p => 
        (p.id || p.project?.id) === projectId
    );
    
    if (existingIndex >= 0) {
        projects[existingIndex] = normalizedProject;
    } else {
        projects.push(normalizedProject);
    }
    
    // Save to localStorage
    writeProjectCollection(VESSEL_PROJECTS_STORAGE_KEY, projects);
    
    return normalizedProject;
}

/**
 * Get raw vessel project data by ID (for loading into vessel generator)
 * @param {string} projectId 
 * @returns {Object|null} Raw vessel project data
 */
export function getVesselProjectData(projectId) {
    try {
        const data = localStorage.getItem(VESSEL_PROJECTS_STORAGE_KEY);
        if (data) {
            const projects = JSON.parse(data);
            const project = projects.find(p => 
                (p.id || p.project?.id) === projectId
            );
            return project || null;
        }
    } catch (e) {
        console.warn('Failed to get vessel project:', e);
    }
    return null;
}

/**
 * Save a Vessel Designer V2 project (create or update)
 * @param {Object} projectData Full Vessel V2 project data including state and thumbnail
 * @returns {Object} Saved project with ID
 */
export function saveVesselV2Project(projectData) {
    const projects = readProjectCollection(VESSEL_V2_PROJECTS_STORAGE_KEY);

    const projectId = projectData.id || projectData.project?.id || generateId();
    const now = new Date().toISOString();
    const normalizedProject = {
        ...projectData,
        id: projectId,
        appType: 'vessel-v2',
        project: {
            ...projectData.project,
            id: projectId,
            lastModified: now,
            dateCreated: projectData.project?.dateCreated || now
        }
    };

    const existingIndex = projects.findIndex(p =>
        (p.id || p.project?.id) === projectId
    );

    if (existingIndex >= 0) {
        projects[existingIndex] = normalizedProject;
    } else {
        projects.push(normalizedProject);
    }

    writeProjectCollection(VESSEL_V2_PROJECTS_STORAGE_KEY, projects);

    return normalizedProject;
}

/**
 * Get raw Vessel Designer V2 project data by ID.
 * @param {string} projectId
 * @returns {Object|null} Raw Vessel V2 project data
 */
export function getVesselV2ProjectData(projectId) {
    try {
        const data = localStorage.getItem(VESSEL_V2_PROJECTS_STORAGE_KEY);
        if (data) {
            const projects = JSON.parse(data);
            const project = projects.find(p =>
                (p.id || p.project?.id) === projectId
            );
            return project || null;
        }
    } catch (e) {
        console.warn('Failed to get Vessel V2 project:', e);
    }
    return null;
}

/**
 * Save a Vessel Designer V3 project (create or update)
 * @param {Object} projectData Full Vessel V3 project data including state and thumbnail
 * @returns {Object} Saved project with ID
 */
export function saveVesselV3Project(projectData) {
    const projects = readProjectCollection(VESSEL_V3_PROJECTS_STORAGE_KEY);

    const projectId = projectData.id || projectData.project?.id || generateId();
    const now = new Date().toISOString();
    const normalizedProject = {
        ...projectData,
        id: projectId,
        appType: 'vessel-v3',
        project: {
            ...projectData.project,
            id: projectId,
            lastModified: now,
            dateCreated: projectData.project?.dateCreated || now
        }
    };

    const existingIndex = projects.findIndex(p =>
        (p.id || p.project?.id) === projectId
    );

    if (existingIndex >= 0) {
        projects[existingIndex] = normalizedProject;
    } else {
        projects.push(normalizedProject);
    }

    writeProjectCollection(VESSEL_V3_PROJECTS_STORAGE_KEY, projects);

    return normalizedProject;
}

/**
 * Get raw Vessel Designer V3 project data by ID.
 * @param {string} projectId
 * @returns {Object|null} Raw Vessel V3 project data
 */
export function getVesselV3ProjectData(projectId) {
    try {
        const data = localStorage.getItem(VESSEL_V3_PROJECTS_STORAGE_KEY);
        if (data) {
            const projects = JSON.parse(data);
            const project = projects.find(p =>
                (p.id || p.project?.id) === projectId
            );
            return project || null;
        }
    } catch (e) {
        console.warn('Failed to get Vessel V3 project:', e);
    }
    return null;
}

// Export storage keys for use by vessel modules
export { VESSEL_PROJECTS_STORAGE_KEY, VESSEL_V2_PROJECTS_STORAGE_KEY, VESSEL_V3_PROJECTS_STORAGE_KEY };
