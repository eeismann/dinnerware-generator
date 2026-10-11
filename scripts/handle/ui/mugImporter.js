/**
 * Mug Importer
 * Handles importing mug data from dinnerware generator projects
 */

import { handleStateManager } from '../state/handleState.js';
import { compileVesselContactProfile, getOuterContactRadius } from '../geometry/vesselContactProfile.js';

// Storage key for dinnerware projects
const DINNERWARE_STORAGE_KEY = 'playground_ceramics_projects';

// Storage keys for Vessel Designer V2 / V3 projects (see scripts/dashboard/projectStorage.js)
const VESSEL_V2_STORAGE_KEY = 'playground_ceramics_vessel_v2_projects';
const VESSEL_V3_STORAGE_KEY = 'playground_ceramics_vessel_v3_projects';

/**
 * Get all available dinnerware projects
 * @returns {Array} List of project metadata
 */
export function getDinnerwareProjects() {
    try {
        const stored = localStorage.getItem(DINNERWARE_STORAGE_KEY);
        if (!stored) return [];
        
        const projects = JSON.parse(stored);
        
        // Filter and map to useful metadata
        // Note: dinnerware generator uses 'projectName' not 'name', and 'lastModified' not 'modifiedAt'
        return projects
            .filter(p => p && (p.projectName || p.name))  // Support both property names
            .map(p => ({
                id: p.id,
                name: p.projectName || p.name,  // Use projectName (dinnerware format) or name (fallback)
                modifiedAt: p.lastModified || p.modifiedAt,  // Use lastModified (storage format)
                hasMug: hasMugData(p),
                mugDimensions: extractMugDimensions(p),
            }))
            .filter(p => p.hasMug)
            .sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
    } catch (e) {
        console.error('Error loading dinnerware projects:', e);
        return [];
    }
}

/**
 * Check if a project has mug data
 */
function hasMugData(project) {
    // Check if project has state with global parameters (new format)
    if (project.state && project.state.globalParameters) {
        return true;
    }
    // Check if project has mug-specific parameters or items (legacy format)
    if (project.items && project.items.mug) {
        return true;
    }
    if (project.globalParameters) {
        return true; // All dinnerware projects can provide mug dimensions
    }
    return false;
}

/**
 * Extract mug dimensions from a dinnerware project
 * Uses the actual mug item data from the project state
 */
function extractMugDimensions(project) {
    // Check if project has state data (new format)
    if (project.state) {
        return extractFromState(project.state);
    }
    
    // Legacy format - check for globalParameters
    if (project.globalParameters) {
        return extractFromLegacy(project);
    }
    
    return null;
}

/**
 * Extract mug dimensions from project state (new format)
 */
function extractFromState(state) {
    const globalParams = state.globalParameters || {};
    const baseDimensions = state.baseDimensions || {};
    const itemMultipliers = state.itemMultipliers || {};
    const itemOverrides = state.itemOverrides || {};
    
    // Base mug dimensions
    const mugBase = baseDimensions.mug || { diameter: 90, height: 100 };
    
    // Get multipliers for mug
    const mugMultipliers = itemMultipliers.mug || { width: 100, height: 100 };
    
    // Apply multipliers to get actual dimensions
    const diameter = mugBase.diameter * (mugMultipliers.width / 100);
    const height = mugBase.height * (mugMultipliers.height / 100);
    
    // Get wall parameters (may be overridden for mug)
    const mugOverrides = itemOverrides.mug || {};
    const wallAngle = mugOverrides.wallAngle ?? globalParams.wallAngle ?? 5;
    const wallThickness = mugOverrides.wallThickness ?? globalParams.wallThickness ?? 2.5;
    
    // Calculate top and bottom diameters based on wall angle
    // The "diameter" is typically the top diameter for mugs
    const topDiameter = diameter;
    const angleRad = wallAngle * Math.PI / 180;
    const bottomDiameter = topDiameter - (2 * height * Math.tan(angleRad));
    
    return {
        height: Math.round(height),
        topDiameter: Math.round(topDiameter),
        bottomDiameter: Math.round(Math.max(bottomDiameter, topDiameter * 0.5)), // Min 50% of top
        wallThickness: wallThickness,
        wallAngle: wallAngle,
    };
}

/**
 * Extract mug dimensions from legacy project format
 */
function extractFromLegacy(project) {
    const params = project.globalParameters;
    
    // Base dimensions
    const baseHeight = 100;
    const baseDiameter = 90;
    
    // Apply global scaling if present
    const heightScale = (params.globalHeightScale || 100) / 100;
    const widthScale = (params.globalWidthScale || 100) / 100;
    
    const height = baseHeight * heightScale;
    const topDiameter = baseDiameter * widthScale;
    
    // Calculate bottom diameter from wall angle
    const wallAngle = params.wallAngle || 5;
    const angleRad = wallAngle * Math.PI / 180;
    const bottomDiameter = topDiameter - (2 * height * Math.tan(angleRad));
    
    return {
        height: Math.round(height),
        topDiameter: Math.round(topDiameter),
        bottomDiameter: Math.round(Math.max(bottomDiameter, topDiameter * 0.5)),
        wallThickness: params.wallThickness || 2.5,
        wallAngle: wallAngle,
    };
}

// ---------------------------------------------------------------------------
// Vessel Designer V2 / V3 import
//
// Vessel V2/V3 projects describe an arbitrary revolved profile (a freeform
// point list `{ r, h }`, r = radius, h = height, both mm, measured from the
// vessel base) rather than a fixed two-diameter mug shape. The handle
// attachment geometry (scripts/handle/geometry/handlePathGenerator.js
// `getMugRadiusAtHeight`) already supports an arbitrary `mugData.radiusProfile`
// array (`{ y, radius }`, sampled points) ahead of falling back to
// `topDiameter`/`bottomDiameter` - so importing a vessel just means building a
// `mugData`-shaped object populated with that profile, no geometry changes
// needed.
// ---------------------------------------------------------------------------

/**
 * Read raw vessel project entries from a given storage key.
 * Vessel V2/V3 store an array of project objects shaped like:
 * { id, project: { id, name, lastModified, ... }, global: { wallThickness, ... }, profile: { points: [...] }, ... }
 */
function readVesselProjectsFromStorage(storageKey) {
    try {
        const stored = localStorage.getItem(storageKey);
        if (!stored) return [];

        const projects = JSON.parse(stored);
        if (!Array.isArray(projects)) return [];

        return projects.filter(p => p && Array.isArray(p?.profile?.points) && p.profile.points.length > 0);
    } catch (e) {
        console.error(`Error loading vessel projects from ${storageKey}:`, e);
        return [];
    }
}

/**
 * Extract { radius, wallThickness } from a Vessel V2/V3 project at a given
 * attach height (mm from the vessel base). If attachHeight is omitted,
 * defaults to the profile's vertical midpoint - a sensible band so Vessel
 * imports behave consistently with Dinnerware mug imports in the picker UI
 * (mug imports similarly default to smart mid-height attachment points, see
 * `applySmartDefaults` in handleState.js).
 * @param {Object} project - Vessel V2 or V3 project object (raw storage shape)
 * @param {number} [attachHeight] - mm from vessel base
 * @returns {{ radius: number, wallThickness: number, height: number, bounds: {min:number,max:number} }|null}
 */
export function extractVesselDimensions(project, attachHeight, sourceType = project?.appType || 'vessel-v2') {
    try {
        const { radiusProfile, bounds } = compileVesselContactProfile(project, sourceType);
        const height = Number.isFinite(attachHeight) ? attachHeight : (bounds.min + bounds.max) / 2;
        return {
            radius: getOuterContactRadius(radiusProfile, height),
            wallThickness: Math.max(0.5, Number(project?.global?.wallThickness) || 3),
            height,
            bounds
        };
    } catch {
        return null;
    }
}

function getVesselProjectMeta(project, sourceType) {
    let dimensions = null;
    let incompatibilityReason = null;
    try {
        const { radiusProfile, bounds } = compileVesselContactProfile(project, sourceType);
        const height = (bounds.min + bounds.max) / 2;
        dimensions = { radius: getOuterContactRadius(radiusProfile, height), height, bounds };
    } catch (error) {
        incompatibilityReason = error.message;
    }
    return {
        id: project.id || project.project?.id,
        name: project.project?.name || (sourceType === 'vessel-v3' ? 'Untitled Vessel V3' : 'Untitled Vessel V2'),
        modifiedAt: project.project?.lastModified,
        compatible: dimensions !== null,
        incompatibilityReason,
        dimensions,
        sourceType,
    };
}

/**
 * Get all available Vessel Designer V2 projects, in the same metadata shape
 * as `getDinnerwareProjects()` (id, name, modifiedAt, a compatibility flag,
 * and dimensions).
 * @returns {Array}
 */
export function getVesselV2Projects() {
    return readVesselProjectsFromStorage(VESSEL_V2_STORAGE_KEY)
        .map(p => getVesselProjectMeta(p, 'vessel-v2'))
        .sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
}

/**
 * Get all available Vessel Designer V3 projects. See getVesselV2Projects().
 * @returns {Array}
 */
export function getVesselV3Projects() {
    return readVesselProjectsFromStorage(VESSEL_V3_STORAGE_KEY)
        .map(p => getVesselProjectMeta(p, 'vessel-v3'))
        .sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
}

/**
 * Import handle-attachment data from a Vessel V2 or V3 project, feeding it
 * into the same `handleStateManager.setMugData()` path used by Dinnerware
 * mug imports.
 * @param {'vessel-v2'|'vessel-v3'} sourceType
 * @param {string} projectId
 * @param {number} [attachHeight] - mm from vessel base; defaults to profile midpoint
 * @returns {Object|null} The imported mug-shaped data
 */
export function importVesselFromProject(sourceType, projectId, attachHeight) {
    try {
        const storageKey = sourceType === 'vessel-v3' ? VESSEL_V3_STORAGE_KEY : VESSEL_V2_STORAGE_KEY;
        const stored = localStorage.getItem(storageKey);
        if (!stored) return null;

        const projects = JSON.parse(stored);
        const project = projects.find(p => (p.id || p.project?.id) === projectId);

        if (!project) {
            console.error('Vessel project not found:', projectId);
            return null;
        }

        const { radiusProfile, bounds, policy } = compileVesselContactProfile(project, sourceType);
        const topRadius = getOuterContactRadius(radiusProfile, bounds.max);
        const bottomRadius = getOuterContactRadius(radiusProfile, bounds.min);

        const mugData = {
            loaded: true,
            projectName: project.project?.name || 'Imported Vessel',
            projectId: project.id || project.project?.id,
            sourceType,
            // Heights remain in the source vessel's world coordinates.
            height: bounds.max,
            topDiameter: topRadius * 2,
            bottomDiameter: bottomRadius * 2,
            wallThickness: Math.max(0.5, Number(project?.global?.wallThickness) || 3),
            wallAngle: 0,
            radiusProfile,
            radiusProfilePolicy: policy,
        };

        handleStateManager.setMugData(mugData);
        handleStateManager.setProject({
            linkedMugProjectId: projectId,
        });

        return mugData;
    } catch (e) {
        console.error('Error importing vessel from project:', e);
        return null;
    }
}

/**
 * Import mug data from a dinnerware project
 * @param {string} projectId - The project ID to import from
 * @returns {Object|null} The imported mug data
 */
export function importMugFromProject(projectId) {
    try {
        const stored = localStorage.getItem(DINNERWARE_STORAGE_KEY);
        if (!stored) return null;
        
        const projects = JSON.parse(stored);
        const project = projects.find(p => p.id === projectId);
        
        if (!project) {
            console.error('Project not found:', projectId);
            return null;
        }
        
        const dimensions = extractMugDimensions(project);
        
        if (!dimensions) {
            console.error('Could not extract mug dimensions from project');
            return null;
        }
        
        const mugData = {
            loaded: true,
            projectName: project.name,
            projectId: project.id,
            sourceType: 'dinnerware',
            radiusProfile: null,
            radiusProfilePolicy: null,
            ...dimensions,
        };
        
        // Update state
        handleStateManager.setMugData(mugData);
        handleStateManager.setProject({
            linkedMugProjectId: projectId,
        });
        
        return mugData;
    } catch (e) {
        console.error('Error importing mug from project:', e);
        return null;
    }
}

/**
 * Import mug data from a JSON file
 * @param {File} file - The file to import
 * @returns {Promise<Object|null>} The imported mug data
 */
export function importMugFromFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                
                // Validate it's a dinnerware project
                if (!data.globalParameters && !data.mugData) {
                    reject(new Error('Invalid file format - not a dinnerware project'));
                    return;
                }
                
                let mugData;
                
                // Check if it's a handle project with embedded mug data
                if (data.mugData) {
                    mugData = {
                        loaded: true,
                        radiusProfile: null,
                        radiusProfilePolicy: null,
                        ...data.mugData,
                    };
                } else {
                    // Extract from dinnerware project format
                    const dimensions = extractMugDimensions(data);
                    if (!dimensions) {
                        reject(new Error('Could not extract mug dimensions from file'));
                        return;
                    }
                    
                    mugData = {
                        loaded: true,
                        projectName: data.name || 'Imported Project',
                        sourceType: 'dinnerware',
                        radiusProfile: null,
                        radiusProfilePolicy: null,
                        ...dimensions,
                    };
                }
                
                // Update state
                handleStateManager.setMugData(mugData);
                
                resolve(mugData);
            } catch (error) {
                reject(new Error('Failed to parse file: ' + error.message));
            }
        };
        
        reader.onerror = () => {
            reject(new Error('Failed to read file'));
        };
        
        reader.readAsText(file);
    });
}

// Source-type configuration for the import picker. Each source has its own
// project getter, import function, description copy, and empty-state copy.
const IMPORT_SOURCES = {
    dinnerware: {
        description: 'Select a Dinnerware Generator project to import mug dimensions.',
        emptyMessage: 'No dinnerware projects with mugs found.<br>Create a project in the Dinnerware Generator first.',
        getProjects: getDinnerwareProjects,
        import: (project) => importMugFromProject(project.id),
        formatMeta: (project) => project.mugDimensions
            ? `${project.mugDimensions.height}mm × Ø${project.mugDimensions.topDiameter}mm`
            : 'Default dimensions',
        allowFileImport: true,
    },
    'vessel-v2': {
        description: 'Select a smooth vessel. Handles contact the outermost compiled wall; profiles with motifs need a smooth saved copy.',
        emptyMessage: 'No Vessel V2 projects found.<br>Create a project in the Vessel Designer V2 first.',
        getProjects: getVesselV2Projects,
        import: (project) => importVesselFromProject('vessel-v2', project.id),
        formatMeta: (project) => project.dimensions
            ? `${Math.round(project.dimensions.bounds.max - project.dimensions.bounds.min)}mm tall × Ø${Math.round(project.dimensions.radius * 2)}mm mid-wall`
            : 'Default dimensions',
        allowFileImport: false,
    },
    'vessel-v3': {
        description: 'Select a smooth vessel. Handles contact the outermost compiled wall; spouts and motifs need a saved copy with those features disabled.',
        emptyMessage: 'No Vessel V3 projects found.<br>Create a project in the Vessel Designer V3 first.',
        getProjects: getVesselV3Projects,
        import: (project) => importVesselFromProject('vessel-v3', project.id),
        formatMeta: (project) => project.dimensions
            ? `${Math.round(project.dimensions.bounds.max - project.dimensions.bounds.min)}mm tall × Ø${Math.round(project.dimensions.radius * 2)}mm mid-wall`
            : 'Default dimensions',
        allowFileImport: false,
    },
};

/**
 * Show the mug/vessel import modal and return the selected attachment data.
 * Supports three source types (Dinnerware Mug, Vessel V2, Vessel V3) via a
 * source-type selector; switching sources re-renders the same project list
 * UI against the corresponding project set.
 * @returns {Promise<Object|null>} The selected data or null if cancelled
 */
export function showMugImportModal() {
    return new Promise((resolve) => {
        const modal = document.getElementById('mugImportModal');
        const projectList = document.getElementById('mugProjectList');
        const descriptionEl = document.getElementById('mugImportDescription');
        const fileImportRow = document.getElementById('mugImportFromFileRow');
        const sourceButtons = Array.from(document.querySelectorAll('#importSourceSelector .import-source-btn'));
        const cancelBtn = document.getElementById('btnCancelMugImport');
        const closeBtn = document.getElementById('btnCloseMugImportModal');
        const importFromFileBtn = document.getElementById('btnImportMugFromFile');
        const backdrop = modal.querySelector('.modal-backdrop');

        let currentSource = 'dinnerware';

        const renderProjectList = (sourceKey) => {
            const source = IMPORT_SOURCES[sourceKey];
            const projects = source.getProjects();

            if (descriptionEl) descriptionEl.textContent = source.description;
            if (fileImportRow) fileImportRow.style.display = source.allowFileImport ? '' : 'none';

            if (projects.length === 0) {
                projectList.innerHTML = `
                    <div class="project-list-empty">
                        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="6" y="4" width="10" height="14" rx="2"/>
                            <path d="M16 8h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2"/>
                        </svg>
                        <p>${source.emptyMessage}</p>
                    </div>
                `;
                return;
            }

            projectList.innerHTML = projects.map(project => `
                <div class="project-list-item" data-project-id="${escapeHtml(String(project.id))}" aria-disabled="${project.compatible === false}">
                    <div class="project-list-item-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="6" y="4" width="10" height="14" rx="2"/>
                            <path d="M16 8h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2"/>
                        </svg>
                    </div>
                    <div class="project-list-item-info">
                        <div class="project-list-item-name">${escapeHtml(project.name)}</div>
                        <div class="project-list-item-meta">
                            ${escapeHtml(project.incompatibilityReason || source.formatMeta(project))}
                            ${project.modifiedAt ? ` • ${formatDate(project.modifiedAt)}` : ''}
                        </div>
                    </div>
                </div>
            `).join('');

            // Add click handlers to project items
            projectList.querySelectorAll('.project-list-item').forEach(item => {
                item.addEventListener('click', () => {
                    const projectId = item.dataset.projectId;
                    const project = projects.find(p => String(p.id) === String(projectId));
                    if (!project) return;
                    if (project.compatible === false) {
                        if (descriptionEl) descriptionEl.textContent = project.incompatibilityReason;
                        return;
                    }
                    const importedData = source.import(project);
                    if (!importedData) {
                        if (descriptionEl) descriptionEl.textContent = 'This project could not be imported. Check its profile and try again.';
                        return;
                    }
                    closeModal();
                    resolve(importedData);
                });
            });
        };

        const handleSourceButtonClick = (btn) => {
            sourceButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentSource = btn.dataset.source;
            renderProjectList(currentSource);
        };

        const sourceButtonHandlers = sourceButtons.map(btn => {
            const handler = () => handleSourceButtonClick(btn);
            btn.addEventListener('click', handler);
            return { btn, handler };
        });

        // Reset to the default source each time the modal is opened
        sourceButtons.forEach(b => b.classList.toggle('active', b.dataset.source === currentSource));
        renderProjectList(currentSource);

        // Close modal handlers
        const closeModal = () => {
            modal.style.display = 'none';
            cleanup();
        };

        const cleanup = () => {
            cancelBtn.removeEventListener('click', handleCancel);
            closeBtn.removeEventListener('click', handleClose);
            backdrop.removeEventListener('click', handleBackdropClick);
            importFromFileBtn.removeEventListener('click', handleImportFromFile);
            sourceButtonHandlers.forEach(({ btn, handler }) => btn.removeEventListener('click', handler));
        };

        const handleCancel = () => {
            closeModal();
            resolve(null);
        };

        const handleClose = () => {
            closeModal();
            resolve(null);
        };

        const handleBackdropClick = () => {
            closeModal();
            resolve(null);
        };

        const handleImportFromFile = () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';

            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (file) {
                    try {
                        const mugData = await importMugFromFile(file);
                        closeModal();
                        resolve(mugData);
                    } catch (error) {
                        alert(error.message);
                    }
                }
            };

            input.click();
        };

        // Attach handlers
        cancelBtn.addEventListener('click', handleCancel);
        closeBtn.addEventListener('click', handleClose);
        backdrop.addEventListener('click', handleBackdropClick);
        importFromFileBtn.addEventListener('click', handleImportFromFile);

        // Show modal
        modal.style.display = 'flex';
    });
}

// Helper functions
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    
    return date.toLocaleDateString();
}
