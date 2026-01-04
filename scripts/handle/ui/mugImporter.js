/**
 * Mug Importer
 * Handles importing mug data from dinnerware generator projects
 */

import { handleStateManager } from '../state/handleState.js';

// Storage key for dinnerware projects
const DINNERWARE_STORAGE_KEY = 'playground_ceramics_projects';

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

/**
 * Show the mug import modal and return the selected mug data
 * @returns {Promise<Object|null>} The selected mug data or null if cancelled
 */
export function showMugImportModal() {
    return new Promise((resolve) => {
        const modal = document.getElementById('mugImportModal');
        const projectList = document.getElementById('mugProjectList');
        const cancelBtn = document.getElementById('btnCancelMugImport');
        const closeBtn = document.getElementById('btnCloseMugImportModal');
        const importFromFileBtn = document.getElementById('btnImportMugFromFile');
        const backdrop = modal.querySelector('.modal-backdrop');
        
        // Populate project list
        const projects = getDinnerwareProjects();
        
        if (projects.length === 0) {
            projectList.innerHTML = `
                <div class="project-list-empty">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="6" y="4" width="10" height="14" rx="2"/>
                        <path d="M16 8h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2"/>
                    </svg>
                    <p>No dinnerware projects with mugs found.<br>Create a project in the Dinnerware Generator first.</p>
                </div>
            `;
        } else {
            projectList.innerHTML = projects.map(project => `
                <div class="project-list-item" data-project-id="${project.id}">
                    <div class="project-list-item-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="6" y="4" width="10" height="14" rx="2"/>
                            <path d="M16 8h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-2"/>
                        </svg>
                    </div>
                    <div class="project-list-item-info">
                        <div class="project-list-item-name">${escapeHtml(project.name)}</div>
                        <div class="project-list-item-meta">
                            ${project.mugDimensions ? 
                                `${project.mugDimensions.height}mm × Ø${project.mugDimensions.topDiameter}mm` : 
                                'Default dimensions'
                            }
                            ${project.modifiedAt ? ` • ${formatDate(project.modifiedAt)}` : ''}
                        </div>
                    </div>
                </div>
            `).join('');
            
            // Add click handlers to project items
            projectList.querySelectorAll('.project-list-item').forEach(item => {
                item.addEventListener('click', () => {
                    const projectId = item.dataset.projectId;
                    const mugData = importMugFromProject(projectId);
                    closeModal();
                    resolve(mugData);
                });
            });
        }
        
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

