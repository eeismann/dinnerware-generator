/**
 * DragDropHandler - Manages drag-and-drop file imports for the dashboard
 *
 * Handles:
 * - Visual drop zone overlay
 * - File validation (.json files)
 * - Multi-file drop support
 * - Callback to parent for processing files
 */

export class DragDropHandler {
    /**
     * @param {HTMLElement} containerElement - Element to attach drag-drop listeners
     * @param {Function} onFilesDropped - Callback when files are dropped (receives File[])
     */
    constructor(containerElement, onFilesDropped) {
        this.container = containerElement;
        this.onFilesDropped = onFilesDropped;
        this.dropZone = null;
        this.dragCounter = 0; // Track nested drag enter/leave events
    }

    /**
     * Initialize drag-drop listeners and create drop zone overlay
     */
    init() {
        this.createDropZone();
        this.attachEventListeners();
    }

    /**
     * Create drop zone overlay element
     */
    createDropZone() {
        this.dropZone = document.createElement('div');
        this.dropZone.id = 'dropZone';
        this.dropZone.className = 'drop-zone';
        this.dropZone.style.display = 'none';

        this.dropZone.innerHTML = `
            <div class="drop-zone-content">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="17 8 12 3 7 8"></polyline>
                    <line x1="12" y1="3" x2="12" y2="15"></line>
                </svg>
                <h3>Drop JSON files to import</h3>
                <p>You can drop multiple project files at once</p>
            </div>
        `;

        document.body.appendChild(this.dropZone);
    }

    /**
     * Attach drag-drop event listeners to container
     */
    attachEventListeners() {
        // Prevent default drag behavior on entire page
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            document.body.addEventListener(eventName, this.preventDefaults, false);
        });

        // Handle drag enter (show drop zone)
        this.container.addEventListener('dragenter', this.handleDragEnter.bind(this), false);

        // Handle drag over (keep drop zone visible)
        this.container.addEventListener('dragover', this.handleDragOver.bind(this), false);

        // Handle drag leave (hide drop zone)
        this.container.addEventListener('dragleave', this.handleDragLeave.bind(this), false);

        // Handle drop (process files)
        this.container.addEventListener('drop', this.handleDrop.bind(this), false);
    }

    /**
     * Prevent default browser behavior for drag events
     */
    preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    /**
     * Handle drag enter event
     */
    handleDragEnter(e) {
        this.preventDefaults(e);
        this.dragCounter++;

        // Only show drop zone if dragging files
        if (e.dataTransfer.types && e.dataTransfer.types.includes('Files')) {
            this.showDropZone();
        }
    }

    /**
     * Handle drag over event
     */
    handleDragOver(e) {
        this.preventDefaults(e);
        // Set drop effect
        e.dataTransfer.dropEffect = 'copy';
    }

    /**
     * Handle drag leave event
     */
    handleDragLeave(e) {
        this.preventDefaults(e);
        this.dragCounter--;

        // Hide drop zone when completely leaving container
        if (this.dragCounter === 0) {
            this.hideDropZone();
        }
    }

    /**
     * Handle drop event
     */
    handleDrop(e) {
        this.preventDefaults(e);
        this.dragCounter = 0;
        this.hideDropZone();

        const files = Array.from(e.dataTransfer.files);

        // Filter for JSON files only
        const jsonFiles = this.validateFiles(files);

        if (jsonFiles.length === 0) {
            this.showError('No valid JSON files found. Please drop .json files.');
            return;
        }

        // Call parent callback with valid files
        if (this.onFilesDropped) {
            this.onFilesDropped(jsonFiles);
        }
    }

    /**
     * Validate dropped files (must be .json)
     * @param {File[]} files - Array of dropped files
     * @returns {File[]} Filtered array of valid JSON files
     */
    validateFiles(files) {
        return files.filter(file => {
            const extension = file.name.toLowerCase().split('.').pop();
            return extension === 'json';
        });
    }

    /**
     * Show drop zone overlay
     */
    showDropZone() {
        if (this.dropZone) {
            this.dropZone.style.display = 'flex';
            // Add animation class if needed
            requestAnimationFrame(() => {
                this.dropZone.classList.add('active');
            });
        }
    }

    /**
     * Hide drop zone overlay
     */
    hideDropZone() {
        if (this.dropZone) {
            this.dropZone.classList.remove('active');
            // Delay hiding to allow fade-out animation
            setTimeout(() => {
                this.dropZone.style.display = 'none';
            }, 200);
        }
    }

    /**
     * Show error message
     * @param {string} message - Error message to display
     */
    showError(message) {
        // Simple alert for now - can be replaced with nicer UI
        alert(message);
    }

    /**
     * Clean up and remove event listeners
     */
    destroy() {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            document.body.removeEventListener(eventName, this.preventDefaults, false);
        });

        if (this.dropZone && this.dropZone.parentNode) {
            this.dropZone.parentNode.removeChild(this.dropZone);
        }
    }
}

export default DragDropHandler;
