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
import { parseProjectFile, importProjectData, duplicateStoredProject } from '../storage/projectTransfer.js';
import { startDinnerwareProject } from '../storage/dinnerwareDrafts.js';
import { DragDropHandler } from '../storage/dragDropHandler.js';
import { resolveAppUrl } from '../utils/navigation.js';
import { APP_ICON_VARIANTS, getAppIconSvg } from './appIcons.js';

// DOM Elements
let elements = {};

// State
let projectToDelete = null;
let searchQuery = '';
let dragDropHandler = null;
let selectedAppIconVariant = document.documentElement.dataset.ui === 'studio'
    ? APP_ICON_VARIANTS.object
    : APP_ICON_VARIANTS.line;

function buildAppUrl(relativePath, queryParams) {
    const resolved = resolveAppUrl(relativePath);
    if (!queryParams) {
        return resolved;
    }

    const params =
        typeof queryParams === 'string' ? queryParams : queryParams.toString();

    if (!params) {
        return resolved;
    }

    const separator = resolved.includes('?') ? '&' : '?';
    return `${resolved}${separator}${params}`;
}

/**
 * Initialize the dashboard
 */
function init() {
    cacheElements();
    selectAppIconVariant(selectedAppIconVariant);
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
        btnCloseAppSelect: document.getElementById('btnCloseAppSelect'),
        btnCancelAppSelect: document.getElementById('btnCancelAppSelect'),
        appSelectCards: document.querySelectorAll('.app-select-card'),
        appIconStyleOptions: document.querySelectorAll('.app-icon-style-option')
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
    elements.btnCloseAppSelect.addEventListener('click', closeAppSelectModal);
    elements.appSelectModal.querySelector('.modal-dashboard-backdrop').addEventListener('click', closeAppSelectModal);
    elements.appIconStyleOptions.forEach(button => {
        button.addEventListener('click', () => {
            selectAppIconVariant(button.dataset.iconVariant);
        });
    });
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
            } else if (app === 'vessel-v2') {
                createNewVesselV2Project();
            } else if (app === 'vessel-v3') {
                createNewVesselV3Project();
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
    
    // Settings menu: themeManager toggles .open; mirror it for assistive
    // tech and let Escape close it
    const settings = document.getElementById('settingsMenuContainer');
    const settingsButton = document.getElementById('btnSettings');
    if (settings && settingsButton) {
        const syncExpanded = () => settingsButton.setAttribute('aria-expanded', String(settings.classList.contains('open')));
        new MutationObserver(syncExpanded).observe(settings, { attributes: true, attributeFilter: ['class'] });
        syncExpanded();
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && settings.classList.contains('open')) {
                settings.classList.remove('open');
                settingsButton.focus();
            }
        });
    }

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
            closeAppSelectModal();
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
            importProjectData(parseProjectFile(text));
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
    const isVesselV2Project = project.appType === 'vessel-v2';
    const isVesselV3Project = project.appType === 'vessel-v3';
    const isCastFormProject = project.appType === 'castform';
    const appType = getProjectAppType(project);
    const supportsCastFormHandoff = appType === 'dinnerware' || appType === 'vessel';
    const itemCount = isHandleProject || isVesselProject || isVesselV2Project || isVesselV3Project || isCastFormProject ? 1 : countVisibleItems(project);
    const dateStr = formatDate(project.lastModified);
    const appIconSvg = getAppIconSvg(appType, `proj-${project.id || index}`, 20, APP_ICON_VARIANTS.line);
    card.dataset.app = appType;
    card.dataset.items = String(itemCount);
    
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
    } else if (isVesselV2Project || isVesselV3Project) {
        previewContent = `
            <div class="card-preview-placeholder vessel-placeholder">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M5 20V4" stroke-dasharray="3 3"/>
                    <path d="M5 20c5-1 6-4 5-7s2-7 7-9"/>
                    <circle cx="5" cy="20" r="1.5" fill="currentColor"/>
                    <circle cx="10" cy="13" r="1.5" fill="currentColor"/>
                    <circle cx="17" cy="4" r="1.5" fill="currentColor"/>
                    <path d="M13 6l5-5 3 3-5 5"/>
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
                <button class="card-action-btn" data-action="duplicate" title="Duplicate project">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2"/>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                </button>
                <button class="card-action-btn" data-action="castform" title="Open in cast form" ${supportsCastFormHandoff ? '' : 'disabled style="opacity: 0.3; cursor: not-allowed;"'}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M4 7h6v13H4z"/>
                        <path d="M14 7h6v13h-6z"/>
                        <path d="M10 11h4"/>
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
                        <div class="card-date">${project.draftOnly ? 'Unsaved draft · ' : ''}${dateStr}</div>
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
                    duplicateProject(project);
                    break;
                case 'delete':
                    showDeleteModal(project);
                    break;
                case 'castform':
                    if (supportsCastFormHandoff) {
                        openProjectInCastForm(project);
                    }
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
    if (project?.appType === 'vessel-v2') return 'vessel-v2';
    if (project?.appType === 'vessel-v3') return 'vessel-v3';
    if (project?.appType === 'castform') return 'castform';
    return 'dinnerware';
}

/**
 * Render the current icon direction across all app selection cards.
 */
function renderAppSelectIcons() {
    elements.appSelectCards.forEach((card, index) => {
        const icon = card.querySelector('.app-select-icon');
        if (!icon) return;

        icon.innerHTML = getAppIconSvg(
            card.dataset.app,
            `modal-${card.dataset.app}-${selectedAppIconVariant}-${index}`,
            48,
            selectedAppIconVariant
        );
    });
}

function selectAppIconVariant(variant) {
    if (!APP_ICON_VARIANTS[variant]) return;

    selectedAppIconVariant = variant;
    elements.appIconStyleOptions.forEach(button => {
        const isActive = button.dataset.iconVariant === variant;
        button.classList.toggle('active', isActive);
        button.setAttribute('aria-pressed', String(isActive));
    });
    renderAppSelectIcons();
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
    try {
        const projectId = startDinnerwareProject(null);
        window.location.href = buildAppUrl('index.html', new URLSearchParams({ project: projectId }));
    } catch (error) { alert(error.message); }
}

/**
 * Create a new handle project and navigate to handle generator
 */
function createNewHandleProject() {
    // Navigate to handle generator
    window.location.href = resolveAppUrl('handle-generator/index.html');
}

/**
 * Create a new vessel project and navigate to vessel generator
 */
function createNewVesselProject() {
    // Clear any existing autosave
    localStorage.removeItem('vessel_autosave');
    // Navigate to vessel generator
    window.location.href = resolveAppUrl('vessel-generator/index.html');
}

/**
 * Create a new Vessel Designer V2 project and navigate to the pen profile app.
 */
function createNewVesselV2Project() {
    localStorage.removeItem('vessel_v2_autosave');
    window.location.href = resolveAppUrl('vessel-v2-generator/index.html');
}

/**
 * Create a new Vessel Designer V3 project and navigate to the pen profile app.
 */
function createNewVesselV3Project() {
    localStorage.removeItem('vessel_v3_autosave');
    window.location.href = resolveAppUrl('vessel-v3-generator/index.html');
}

/**
 * Create a new cast form project and navigate to cast form generator
 */
function createNewCastFormProject() {
    // Navigate to cast form generator
    window.location.href = resolveAppUrl('cast-form-generator/index.html');
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
        const params = new URLSearchParams({ project: projectId });
        window.location.href = buildAppUrl('handle-generator/index.html', params);
    } else if (project.appType === 'vessel') {
        const params = new URLSearchParams({ project: projectId });
        window.location.href = buildAppUrl('vessel-generator/index.html', params);
    } else if (project.appType === 'vessel-v2') {
        const params = new URLSearchParams({ project: projectId });
        window.location.href = buildAppUrl('vessel-v2-generator/index.html', params);
    } else if (project.appType === 'vessel-v3') {
        const params = new URLSearchParams({ project: projectId });
        window.location.href = buildAppUrl('vessel-v3-generator/index.html', params);
    } else if (project.appType === 'castform') {
        const params = new URLSearchParams({ project: projectId });
        window.location.href = buildAppUrl('cast-form-generator/index.html', params);
    } else {
        try { startDinnerwareProject(projectId); }
        catch (error) { alert(error.message); return; }

        // Navigate to dinnerware generator
        window.location.href = buildAppUrl('index.html', new URLSearchParams({ project: projectId }));
    }
}

/**
 * Open a dinnerware/vessel project directly in Cast Form generator.
 * Passes source app + project identity so cast form can reconstruct geometry in-place.
 */
function openProjectInCastForm(project) {
    const appType = getProjectAppType(project);
    if (appType !== 'dinnerware' && appType !== 'vessel') {
        return;
    }

    const params = new URLSearchParams();
    params.set('sourceApp', appType);
    params.set('sourceProject', project.id);

    if (appType === 'dinnerware') {
        const visibleItems = project.state?.ui?.visibleItems || [];
        const fallbackItem = visibleItems.find(Boolean) || 'mug';
        params.set('sourceItem', fallbackItem);
    }

    window.location.href = buildAppUrl('cast-form-generator/index.html', params);
}

/**
 * Duplicate a project
 */
function duplicateProject(project) {
    try {
        duplicateStoredProject(project);
        renderProjects();
    } catch (error) {
        alert(`Could not duplicate project: ${error.message}`);
    }

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
    
    input.multiple = true;
    input.addEventListener('change', (event) => {
        handleFilesDropped(Array.from(event.target.files));
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
