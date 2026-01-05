/**
 * Playground Ceramics - Dashboard
 * Main dashboard script for project management
 */

import {
    getAllProjects,
    getProject,
    deleteProject,
    clearAllProjects,
    formatDate,
    countVisibleItems
} from './projectStorage.js';
import { init as initTheme } from '../ui/themeManager.js';
import { ProjectFileFormat } from '../storage/fileFormat.js';
import { DragDropHandler } from '../storage/dragDropHandler.js';

// DOM Elements
let elements = {};

// State
let projectToDelete = null;
let searchQuery = '';
let dragDropHandler = null;

/**
 * Initialize the dashboard
 */
function init() {
    cacheElements();
    bindEvents();
    initDragDrop();
    renderProjects();
}

/**
 * Cache DOM elements
 */
function cacheElements() {
    elements = {
        projectsGrid: document.getElementById('projectsGrid'),
        projectCount: document.getElementById('projectCount'),
        emptyState: document.getElementById('emptyState'),
        searchInput: document.getElementById('searchInput'),
        btnNewProject: document.getElementById('btnNewProject'),
        btnEmptyNewProject: document.getElementById('btnEmptyNewProject'),
        btnImportProject: document.getElementById('btnImportProject'),
        btnClearAll: document.getElementById('btnClearAll'),
        deleteModal: document.getElementById('deleteModal'),
        deleteModalText: document.getElementById('deleteModalText'),
        btnCancelDelete: document.getElementById('btnCancelDelete'),
        btnConfirmDelete: document.getElementById('btnConfirmDelete'),
        // App selection modal
        appSelectModal: document.getElementById('appSelectModal'),
        btnCancelAppSelect: document.getElementById('btnCancelAppSelect'),
        appSelectCards: document.querySelectorAll('.app-select-card')
    };
}

/**
 * Bind event listeners
 */
function bindEvents() {
    // New project buttons - show app selection modal
    elements.btnNewProject.addEventListener('click', showAppSelectModal);
    elements.btnEmptyNewProject.addEventListener('click', showAppSelectModal);
    
    // App selection modal
    elements.btnCancelAppSelect.addEventListener('click', closeAppSelectModal);
    elements.appSelectModal.querySelector('.modal-dashboard-backdrop').addEventListener('click', closeAppSelectModal);
    elements.appSelectCards.forEach(card => {
        card.addEventListener('click', () => {
            const app = card.dataset.app;
            closeAppSelectModal();
            if (app === 'dinnerware') {
                createNewDinnerwareProject();
            } else if (app === 'handle') {
                createNewHandleProject();
            } else if (app === 'vessel') {
                createNewVesselProject();
            } else if (app === 'castform') {
                createNewCastFormProject();
            }
        });
    });
    
    // Import project
    elements.btnImportProject.addEventListener('click', importProject);
    
    // Search
    elements.searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value.toLowerCase().trim();
        renderProjects();
    });
    
    // Clear all
    elements.btnClearAll.addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm('Are you sure you want to delete all projects? This cannot be undone.')) {
            clearAllProjects();
            renderProjects();
        }
    });
    
    // Delete modal
    elements.btnCancelDelete.addEventListener('click', closeDeleteModal);
    elements.btnConfirmDelete.addEventListener('click', confirmDelete);
    elements.deleteModal.querySelector('.modal-dashboard-backdrop').addEventListener('click', closeDeleteModal);
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeDeleteModal();
        }
    });
}

/**
 * Initialize drag-and-drop file import
 */
function initDragDrop() {
    dragDropHandler = new DragDropHandler(document.body, handleFilesDropped);
    dragDropHandler.init();
}

/**
 * Handle files dropped on the dashboard
 * @param {File[]} files - Array of dropped files
 */
async function handleFilesDropped(files) {
    if (files.length === 0) return;

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (const file of files) {
        try {
            const text = await file.text();
            const data = JSON.parse(text);

            // Detect format (enhanced or legacy)
            const format = ProjectFileFormat.detectFormat(data);

            let projectData;
            if (format === 'enhanced') {
                // New enhanced format
                const deserialized = ProjectFileFormat.deserialize(data);
                projectData = deserialized;
            } else {
                // Legacy format - migrate
                projectData = ProjectFileFormat.migrateFromLegacy(data);
            }

            // Import based on app type
            await importProjectData(projectData);
            successCount++;
        } catch (error) {
            console.error(`Failed to import ${file.name}:`, error);
            errorCount++;
            errors.push(`${file.name}: ${error.message}`);
        }
    }

    // Show results
    if (successCount > 0) {
        renderProjects();
    }

    if (errorCount > 0) {
        alert(`Imported ${successCount} project(s) successfully.\n${errorCount} file(s) failed:\n${errors.join('\n')}`);
    } else {
        alert(`Successfully imported ${successCount} project(s)!`);
    }
}

/**
 * Import project data based on app type
 * @param {Object} projectData - Enhanced format project data
 */
async function importProjectData(projectData) {
    const appType = projectData.fileFormat.appType;
    const { saveProject, saveVesselProject } = await import('./projectStorage.js');

    if (appType === 'dinnerware') {
        // Import dinnerware project
        const project = {
            id: null,
            projectName: projectData.project.name,
            dateCreated: projectData.fileFormat.created,
            lastModified: new Date().toISOString(),
            thumbnail: projectData.metadata.thumbnailDataUrl,
            state: projectData.state
        };
        saveProject(project);
    } else if (appType === 'vessel') {
        // Import vessel project
        const project = {
            id: null,
            thumbnail: projectData.metadata.thumbnailDataUrl,
            ...projectData.state
        };
        saveVesselProject(project);
    } else if (appType === 'handle' || appType === 'castform') {
        // For handle and castform, save directly to their respective storage keys
        const storageKey = appType === 'handle'
            ? 'playground_ceramics_handle_projects'
            : 'playground_ceramics_castform_projects';

        let projects = [];
        try {
            const stored = localStorage.getItem(storageKey);
            if (stored) projects = JSON.parse(stored);
        } catch (e) {
            console.error('Error loading projects:', e);
        }

        const project = {
            ...projectData.state,
            thumbnail: projectData.metadata.thumbnailDataUrl,
            project: {
                ...projectData.project,
                id: `${appType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            }
        };

        projects.push(project);
        localStorage.setItem(storageKey, JSON.stringify(projects));
    }
}

/**
 * Render all projects
 */
function renderProjects() {
    let projects = getAllProjects();
    
    // Apply search filter
    if (searchQuery) {
        projects = projects.filter(p => 
            p.projectName.toLowerCase().includes(searchQuery)
        );
    }
    
    // Update count
    const totalProjects = getAllProjects().length;
    elements.projectCount.textContent = `${totalProjects} project${totalProjects !== 1 ? 's' : ''}`;
    
    // Show empty state or projects
    if (projects.length === 0 && !searchQuery) {
        elements.emptyState.style.display = 'flex';
        elements.projectsGrid.innerHTML = '';
        return;
    }
    
    elements.emptyState.style.display = 'none';
    
    // Render project cards
    elements.projectsGrid.innerHTML = '';
    
    // Add "New Project" card first
    const newProjectCard = createNewProjectCard();
    elements.projectsGrid.appendChild(newProjectCard);
    
    // Add project cards with staggered animation
    projects.forEach((project, index) => {
        const card = createProjectCard(project, index);
        elements.projectsGrid.appendChild(card);
    });
}

/**
 * Create a new project card element
 */
function createNewProjectCard() {
    const card = document.createElement('div');
    card.className = 'project-card new-project';
    card.style.animationDelay = '0s';
    card.innerHTML = `
        <div class="new-project-icon">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
        </div>
        <span class="new-project-text">New Project</span>
    `;
    card.addEventListener('click', createNewProject);
    return card;
}

/**
 * Create a project card element
 */
function createProjectCard(project, index) {
    const card = document.createElement('div');
    card.className = 'project-card';
    card.style.animationDelay = `${(index + 1) * 0.05}s`;
    
    const isHandleProject = project.appType === 'handle';
    const isVesselProject = project.appType === 'vessel';
    const isCastFormProject = project.appType === 'castform';
    const appType = getProjectAppType(project);
    const itemCount = isHandleProject || isVesselProject || isCastFormProject ? 1 : countVisibleItems(project);
    const dateStr = formatDate(project.lastModified);
    const appIconSvg = getAppIconSvg(appType, `proj-${project.id || index}`, 20);
    
    // Create thumbnail or placeholder based on project type
    let previewContent;
    if (project.thumbnail) {
        previewContent = `<img src="${project.thumbnail}" alt="${project.projectName}">`;
    } else if (isVesselProject) {
        // Vessel project placeholder
        previewContent = `
            <div class="card-preview-placeholder vessel-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <ellipse cx="12" cy="5" rx="5" ry="2"/>
                    <path d="M7 5v2c0 1.5 1 3 2 4"/>
                    <path d="M17 5v2c0 1.5-1 3-2 4"/>
                    <path d="M9 11c-2 2-3 5-3 8v1a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-1c0-3-1-6-3-8"/>
                    <path d="M7 14h10"/>
                </svg>
            </div>
        `;
    } else if (isHandleProject) {
        // Handle project placeholder - show handle icon
        previewContent = `
            <div class="card-preview-placeholder handle-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M18 8h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"/>
                    <path d="M18 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2"/>
                </svg>
            </div>
        `;
    } else if (isCastFormProject) {
        // Cast form project placeholder - show mold icon
        previewContent = `
            <div class="card-preview-placeholder castform-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="8" width="7" height="12" rx="1"/>
                    <rect x="14" y="8" width="7" height="12" rx="1"/>
                    <ellipse cx="12" cy="18" rx="6" ry="2"/>
                    <line x1="10" y1="8" x2="10" y2="16" stroke-dasharray="2 2"/>
                    <line x1="14" y1="8" x2="14" y2="16" stroke-dasharray="2 2"/>
                    <circle cx="10" cy="11" r="1" fill="currentColor"/>
                    <circle cx="14" cy="11" r="1" fill="currentColor"/>
                </svg>
            </div>
        `;
    } else {
        // Dinnerware project placeholder
        previewContent = `
            <div class="card-preview-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
                    <ellipse cx="12" cy="14" rx="10" ry="4"/>
                    <ellipse cx="12" cy="14" rx="5" ry="2"/>
                    <path d="M3 14V10c0-4 4-7 9-7s9 3 9 7v4"/>
                </svg>
            </div>
        `;
    }
    
    card.innerHTML = `
        <div class="card-preview">
            ${previewContent}
            <div class="card-actions">
                <button class="card-action-btn" data-action="open" title="Open project">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M5 3l14 9-14 9V3z"/>
                    </svg>
                </button>
                <button class="card-action-btn" data-action="duplicate" title="Duplicate project" ${(isHandleProject || isVesselProject || isCastFormProject) ? 'disabled style="opacity: 0.3; cursor: not-allowed;"' : ''}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2"/>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                </button>
                <button class="card-action-btn danger" data-action="delete" title="Delete project">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        <line x1="10" y1="11" x2="10" y2="17"/>
                        <line x1="14" y1="11" x2="14" y2="17"/>
                    </svg>
                </button>
            </div>
        </div>
        <div class="card-info">
            <div class="card-info-top">
                <div class="card-app">
                    <div class="card-app-icon" aria-hidden="true">
                        ${appIconSvg}
                    </div>
                    <div class="card-app-text">
                        <h3 class="card-title">${escapeHtml(project.projectName)}</h3>
                        <div class="card-date">${dateStr}</div>
                    </div>
                </div>
                <span class="card-items">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                    </svg>
                    ${itemCount}
                </span>
            </div>
        </div>
    `;
    
    // Bind action buttons
    card.querySelectorAll('.card-action-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const action = btn.dataset.action;
            
            switch (action) {
                case 'open':
                    openProject(project.id);
                    break;
                case 'duplicate':
                    // Skip duplicate for handle, vessel, and castform projects (not yet supported)
                    if (project.appType !== 'handle' && project.appType !== 'vessel' && project.appType !== 'castform') {
                        duplicateProject(project);
                    }
                    break;
                case 'delete':
                    showDeleteModal(project);
                    break;
            }
        });
    });
    
    // Click card to open
    card.addEventListener('click', () => openProject(project.id));
    
    return card;
}

/**
 * Normalize project appType for UI.
 */
function getProjectAppType(project) {
    if (project?.appType === 'handle') return 'handle';
    if (project?.appType === 'vessel') return 'vessel';
    if (project?.appType === 'castform') return 'castform';
    return 'dinnerware';
}

/**
 * Small 3D app icons for dashboard thumbnails (unique gradient IDs per instance).
 */
function getAppIconSvg(appType, idSuffix, size = 20) {
    const safe = String(idSuffix).replace(/[^a-zA-Z0-9_-]/g, '');
    
    if (appType === 'handle') {
        const front = `mh-front-${safe}`;
        const side = `mh-side-${safe}`;
        return `
            <svg width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="${front}" x1="16" y1="12" x2="32" y2="38" gradientUnits="userSpaceOnUse">
                        <stop stop-color="#FFD1F4"/>
                        <stop offset="1" stop-color="#FF2AD4"/>
                    </linearGradient>
                    <linearGradient id="${side}" x1="26" y1="18" x2="40" y2="38" gradientUnits="userSpaceOnUse">
                        <stop stop-color="#FF2AD4"/>
                        <stop offset="1" stop-color="#A8007F"/>
                    </linearGradient>
                </defs>
                <path d="M14 14.5c0-2.5 2-4.5 4.5-4.5h10c2.5 0 4.5 2 4.5 4.5V33c0 3.3-2.7 6-6 6H20c-3.3 0-6-2.7-6-6V14.5z" fill="url(#${front})"/>
                <path fill-rule="evenodd" clip-rule="evenodd"
                    d="M34.2 17.2h1.6c5.4 0 9.2 3.6 9.2 8.8v0.8c0 5.2-3.8 8.8-9.2 8.8h-1.6c-2.3 0-4.2-1.9-4.2-4.2V21.4c0-2.3 1.9-4.2 4.2-4.2Zm0.6 4.4h0.9c3.1 0 4.8 2.0 4.8 4.6v0.4c0 2.6-1.7 4.6-4.8 4.6h-0.9c-0.3 0-0.6-0.3-0.6-0.6V22.2c0-0.3 0.3-0.6 0.6-0.6Z"
                    fill="url(#${side})"/>
                <path d="M18.4 18.2c0.8-1.8 2.6-3 4.7-3h2.0" stroke="#FFFFFF" stroke-opacity="0.35" stroke-width="2.6" stroke-linecap="round"/>
            </svg>
        `;
    }
    
    if (appType === 'vessel') {
        const front = `vs-front-${safe}`;
        const side = `vs-side-${safe}`;
        return `
            <svg width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="${front}" x1="16" y1="10" x2="34" y2="42" gradientUnits="userSpaceOnUse">
                        <stop stop-color="#E6D6FF"/>
                        <stop offset="1" stop-color="#A259FF"/>
                    </linearGradient>
                    <linearGradient id="${side}" x1="22" y1="14" x2="40" y2="42" gradientUnits="userSpaceOnUse">
                        <stop stop-color="#A259FF"/>
                        <stop offset="1" stop-color="#5B2FA8"/>
                    </linearGradient>
                </defs>
                <path d="M18 11.8c0 3.3 2.6 5.6 2.6 8.2c0 1.5-1 2.6-2.4 3.8c-2.6 2.3-4.2 5.2-4.2 9.3v1.9c0 2.4 1.9 4.3 4.3 4.3h11.4c2.4 0 4.3-1.9 4.3-4.3v-1.9c0-4.1-1.6-7-4.2-9.3c-1.4-1.2-2.4-2.3-2.4-3.8c0-2.6 2.6-4.9 2.6-8.2H18z" fill="url(#${front})"/>
                <path d="M27.8 11.8c0 3.2-2.4 5.3-2.4 8.2c0 1.9 1.3 3.1 2.8 4.4c2.2 1.9 3.4 4.3 3.4 8.7v1.9c0 2.4-1.9 4.3-4.3 4.3h2.4c2.4 0 4.3-1.9 4.3-4.3v-1.9c0-4.1-1.6-7-4.2-9.3c-1.4-1.2-2.4-2.3-2.4-3.8c0-2.6 2.6-4.9 2.6-8.2h-2.1Z" fill="url(#${side})" opacity="0.9"/>
                <path d="M19.6 20.6c1.0-2.8 3.1-4.5 6.3-4.8" stroke="#FFFFFF" stroke-opacity="0.30" stroke-width="2.8" stroke-linecap="round"/>
            </svg>
        `;
    }
    
    if (appType === 'castform') {
        const outer = `cf-outer-${safe}`;
        const wall1 = `cf-wall1-${safe}`;
        const wall2 = `cf-wall2-${safe}`;
        return `
            <svg width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <defs>
                    <linearGradient id="${outer}" x1="8" y1="12" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                        <stop stop-color="#FFE0C2"/>
                        <stop offset="1" stop-color="#C45C26"/>
                    </linearGradient>
                    <linearGradient id="${wall1}" x1="8" y1="20" x2="20" y2="36" gradientUnits="userSpaceOnUse">
                        <stop stop-color="#B8D4B0"/>
                        <stop offset="1" stop-color="#7D9B76"/>
                    </linearGradient>
                    <linearGradient id="${wall2}" x1="28" y1="20" x2="40" y2="36" gradientUnits="userSpaceOnUse">
                        <stop stop-color="#A8C8D8"/>
                        <stop offset="1" stop-color="#6B8BA4"/>
                    </linearGradient>
                </defs>
                <ellipse cx="24" cy="38" rx="12" ry="4" fill="url(#${outer})"/>
                <path d="M8 18c0-2 1.5-3.5 3.5-3.5h6c1 0 2 .8 2 1.8v16c0 1.5-1.2 2.7-2.7 2.7H11c-1.7 0-3-1.3-3-3V18z" fill="url(#${wall1})"/>
                <path d="M28.5 14.5h6c2 0 3.5 1.5 3.5 3.5v14c0 1.7-1.3 3-3 3h-5.8c-1.5 0-2.7-1.2-2.7-2.7v-16c0-1 1-1.8 2-1.8z" fill="url(#${wall2})"/>
                <circle cx="20" cy="22" r="2" fill="#D4A84B"/>
                <circle cx="28" cy="22" r="2" fill="#D4A84B"/>
            </svg>
        `;
    }
    
    // Dinnerware (default)
    const top = `dw-top-${safe}`;
    const side = `dw-side-${safe}`;
    return `
        <svg width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="${top}" x1="14" y1="16" x2="36" y2="32" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#B7F1FF"/>
                    <stop offset="1" stop-color="#1ABCFE"/>
                </linearGradient>
                <linearGradient id="${side}" x1="16" y1="24" x2="36" y2="42" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#159FD6"/>
                    <stop offset="1" stop-color="#0B6FA2"/>
                </linearGradient>
            </defs>
            <path d="M10 24c0 3.6 6.3 6.5 14 6.5S38 27.6 38 24v8c0 3.6-6.3 6.5-14 6.5S10 35.6 10 32v-8z" fill="url(#${side})"/>
            <ellipse cx="24" cy="24" rx="14" ry="6.5" fill="url(#${top})"/>
            <ellipse cx="24" cy="24" rx="8.5" ry="3.8" fill="#FFFFFF" opacity="0.22"/>
        </svg>
    `;
}

/**
 * Show app selection modal
 */
function showAppSelectModal() {
    elements.appSelectModal.style.display = 'flex';
}

/**
 * Close app selection modal
 */
function closeAppSelectModal() {
    elements.appSelectModal.style.display = 'none';
}

/**
 * Create a new dinnerware project and navigate to generator
 */
function createNewDinnerwareProject() {
    // Clear current project from localStorage
    localStorage.removeItem('dinnerware_current_project');
    localStorage.removeItem('dinnerware_editing_project_id');
    
    // Navigate to dinnerware generator
    window.location.href = '/index.html';
}

/**
 * Create a new handle project and navigate to handle generator
 */
function createNewHandleProject() {
    // Navigate to handle generator
    window.location.href = '/handle-generator/index.html';
}

/**
 * Create a new vessel project and navigate to vessel generator
 */
function createNewVesselProject() {
    // Clear any existing autosave
    localStorage.removeItem('vessel_autosave');
    // Navigate to vessel generator
    window.location.href = '/vessel-generator/index.html';
}

/**
 * Create a new cast form project and navigate to cast form generator
 */
function createNewCastFormProject() {
    // Navigate to cast form generator
    window.location.href = '/cast-form-generator/index.html';
}

/**
 * Legacy function for backwards compatibility
 */
function createNewProject() {
    showAppSelectModal();
}

/**
 * Open an existing project
 */
function openProject(projectId) {
    // Get project data
    const project = getProject(projectId);
    if (!project) {
        alert('Project not found.');
        return;
    }
    
    // Check project type and navigate to appropriate generator
    if (project.appType === 'handle') {
        // Navigate to handle generator with project ID
        window.location.href = `/handle-generator/index.html?project=${projectId}`;
    } else if (project.appType === 'vessel') {
        // Navigate to vessel generator with project ID
        window.location.href = `/vessel-generator/index.html?project=${projectId}`;
    } else if (project.appType === 'castform') {
        // Navigate to cast form generator with project ID
        window.location.href = `/cast-form-generator/index.html?project=${projectId}`;
    } else {
        // Dinnerware project - use existing flow
        localStorage.setItem('dinnerware_editing_project_id', projectId);
        
        if (project.state) {
            const currentData = {
                state: project.state,
                timestamp: new Date().toISOString()
            };
            localStorage.setItem('dinnerware_current_project', JSON.stringify(currentData));
        }
        
        // Navigate to dinnerware generator
        window.location.href = '/index.html';
    }
}

/**
 * Duplicate a project
 */
function duplicateProject(project) {
    const projects = getAllProjects();
    
    // Create copy with new ID and name
    const duplicate = JSON.parse(JSON.stringify(project));
    duplicate.id = null; // Will be assigned new ID
    duplicate.projectName = `${project.projectName} (Copy)`;
    duplicate.dateCreated = new Date().toISOString();
    duplicate.lastModified = new Date().toISOString();
    
    // Save and re-render
    import('./projectStorage.js').then(({ saveProject }) => {
        saveProject(duplicate);
        renderProjects();
    });
}

/**
 * Show delete confirmation modal
 */
function showDeleteModal(project) {
    projectToDelete = project;
    elements.deleteModalText.textContent = 
        `Are you sure you want to delete "${project.projectName}"? This action cannot be undone.`;
    elements.deleteModal.style.display = 'flex';
}

/**
 * Close delete modal
 */
function closeDeleteModal() {
    projectToDelete = null;
    elements.deleteModal.style.display = 'none';
}

/**
 * Confirm and execute delete
 */
function confirmDelete() {
    if (projectToDelete) {
        deleteProject(projectToDelete.id);
        closeDeleteModal();
        renderProjects();
    }
}

/**
 * Import a project from file
 */
function importProject() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    
    input.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            
            // Validate project data
            if (!data.version || !data.projectName) {
                throw new Error('Invalid project file format');
            }
            
            // Import project
            const { saveProject } = await import('./projectStorage.js');
            const project = {
                id: null,
                projectName: data.projectName,
                dateCreated: data.dateCreated || new Date().toISOString(),
                lastModified: new Date().toISOString(),
                thumbnail: null,
                state: {
                    globalParameters: data.globalParameters,
                    itemRatios: data.itemRatios,
                    itemMultipliers: data.itemMultipliers,
                    itemOverrides: data.itemOverrides,
                    saucerSettings: data.saucerSettings,
                    ui: {
                        visibleItems: data.visibleItems || ['plate', 'soup_bowl', 'pasta_bowl', 'mug', 'tumbler', 'saucer', 'serving_bowl'],
                        layoutMode: 'row',
                        crossSectionEnabled: false,
                        expandedPanels: ['global-scaling'],
                        cameraPreset: 'three-quarter'
                    },
                    project: {
                        name: data.projectName,
                        dateCreated: data.dateCreated,
                        lastModified: new Date().toISOString(),
                        isDirty: false
                    }
                }
            };
            
            saveProject(project);
            renderProjects();
            
        } catch (error) {
            alert('Failed to import project: ' + error.message);
        }
    });
    
    input.click();
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        init();
        initTheme();
    });
} else {
    init();
    initTheme();
}

