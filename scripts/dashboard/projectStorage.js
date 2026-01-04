/**
 * Project Storage Module
 * Manages saved projects in localStorage with thumbnail support
 * Supports dinnerware, handle, and vessel generator projects
 */

const PROJECTS_STORAGE_KEY = 'playground_ceramics_projects';
const HANDLE_PROJECTS_STORAGE_KEY = 'playground_ceramics_handle_projects';
const VESSEL_PROJECTS_STORAGE_KEY = 'playground_ceramics_vessel_projects';
const CASTFORM_PROJECTS_STORAGE_KEY = 'playground_ceramics_castform_projects';

/**
 * Get all saved projects (dinnerware, handle, and vessel projects)
 * @returns {Array} Array of saved project objects
 */
export function getAllProjects() {
    const dinnerwareProjects = getDinnerwareProjects();
    const handleProjects = getHandleProjects();
    const vesselProjects = getVesselProjects();
    const castFormProjects = getCastFormProjects();
    
    // Combine and sort by last modified date (newest first)
    const allProjects = [...dinnerwareProjects, ...handleProjects, ...vesselProjects, ...castFormProjects];
    return allProjects.sort((a, b) => 
        new Date(b.lastModified) - new Date(a.lastModified)
    );
}

/**
 * Get dinnerware projects only
 * @returns {Array} Array of dinnerware project objects
 */
export function getDinnerwareProjects() {
    try {
        const data = localStorage.getItem(PROJECTS_STORAGE_KEY);
        if (data) {
            const projects = JSON.parse(data);
            // Mark as dinnerware type and normalize structure
            return projects.map(p => ({
                ...p,
                appType: 'dinnerware',
                projectName: p.projectName || 'Untitled'
            })).sort((a, b) => 
                new Date(b.lastModified) - new Date(a.lastModified)
            );
        }
    } catch (e) {
        console.warn('Failed to load dinnerware projects:', e);
    }
    return [];
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
    // Only get dinnerware projects - don't mix with handle projects
    let projects = [];
    try {
        const data = localStorage.getItem(PROJECTS_STORAGE_KEY);
        if (data) {
            projects = JSON.parse(data);
        }
    } catch (e) {
        console.warn('Failed to load existing projects:', e);
    }
    
    // Generate ID if new project
    if (!project.id) {
        project.id = generateId();
        project.dateCreated = new Date().toISOString();
    }
    
    project.lastModified = new Date().toISOString();
    
    // Find existing project or add new
    const existingIndex = projects.findIndex(p => p.id === project.id);
    if (existingIndex >= 0) {
        projects[existingIndex] = project;
    } else {
        projects.push(project);
    }
    
    // Save to localStorage (dinnerware projects only)
    try {
        localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
    } catch (e) {
        console.error('Failed to save project:', e);
        // If quota exceeded, try removing old thumbnails
        if (e.name === 'QuotaExceededError') {
            compressProjects(projects);
            localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects));
        }
    }
    
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
        localStorage.removeItem(PROJECTS_STORAGE_KEY);
        localStorage.removeItem(HANDLE_PROJECTS_STORAGE_KEY);
        localStorage.removeItem(VESSEL_PROJECTS_STORAGE_KEY);
        localStorage.removeItem(CASTFORM_PROJECTS_STORAGE_KEY);
        localStorage.removeItem('dinnerware_current_project');
        localStorage.removeItem('vessel_autosave');
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
    let projects = [];
    try {
        const data = localStorage.getItem(VESSEL_PROJECTS_STORAGE_KEY);
        if (data) {
            projects = JSON.parse(data);
        }
    } catch (e) {
        console.warn('Failed to load existing vessel projects:', e);
    }
    
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
    try {
        localStorage.setItem(VESSEL_PROJECTS_STORAGE_KEY, JSON.stringify(projects));
    } catch (e) {
        console.error('Failed to save vessel project:', e);
        // If quota exceeded, try removing thumbnails from older projects
        if (e.name === 'QuotaExceededError') {
            compressProjects(projects);
            localStorage.setItem(VESSEL_PROJECTS_STORAGE_KEY, JSON.stringify(projects));
        }
    }
    
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

// Export storage key for use by vessel module
export { VESSEL_PROJECTS_STORAGE_KEY };

