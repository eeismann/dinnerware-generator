/**
 * Cast Form Generator - Parameter Panel
 * Handles UI controls and state synchronization
 */

import castFormState from '../state/castFormState.js';

export class ParameterPanel {
    constructor() {
        this.parameterBindings = [];
        this.init();
    }

    init() {
        this.setupCollapsibleSections();
        this.setupInputSourceControls();
        this.setupMoldControls();
        this.setupNatchControls();
        this.setupShellControls();
        this.setupStateSubscriptions();
    }

    /**
     * Setup collapsible section headers
     */
    setupCollapsibleSections() {
        document.querySelectorAll('.section-header[data-collapse]').forEach(header => {
            header.addEventListener('click', () => {
                const section = header.closest('.param-section');
                section.classList.toggle('collapsed');
            });
        });
    }

    /**
     * Setup file import button
     */
    setupInputSourceControls() {
        // File import button
        const fileInput = document.getElementById('fileInput');
        const importFileBtn = document.getElementById('importFile');
        
        if (importFileBtn && fileInput) {
            importFileBtn.addEventListener('click', () => fileInput.click());
            
            fileInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (file) {
                    // Dispatch custom event for main to handle
                    window.dispatchEvent(new CustomEvent('importFile', { detail: { file } }));
                }
                fileInput.value = ''; // Reset for re-selection
            });
        }
    }

    /**
     * Setup mold configuration controls
     */
    setupMoldControls() {
        this.bindSliderToState('plasterThickness', 'plasterThicknessValue', 'params.mold.plasterWallThickness');
        this.bindSliderToState('spareHeight', 'spareHeightValue', 'params.mold.spareHeight');
        this.bindSliderToState('cornerCutWidth', 'cornerCutWidthValue', 'params.mold.cornerCutWidth');
    }

    /**
     * Setup registration key (natch) controls
     */
    setupNatchControls() {
        this.bindSliderToState('natchDiameter', 'natchDiameterValue', 'params.natches.diameter');
        this.bindSliderToState('natchDepth', 'natchDepthValue', 'params.natches.depth');
        this.bindSliderToState('natchTolerance', 'natchToleranceValue', 'params.natches.toleranceOffset');
        
        // Natch count dropdown
        const natchCountSelect = document.getElementById('natchCount');
        if (natchCountSelect) {
            natchCountSelect.addEventListener('change', (e) => {
                castFormState.setState('params.natches.countPerSeam', parseInt(e.target.value));
            });
        }
    }

    /**
     * Setup shell property controls
     */
    setupShellControls() {
        this.bindSliderToState('shellThickness', 'shellThicknessValue', 'params.shell.wallThickness');
    }

    /**
     * Bind slider and number input to state path
     * @param {string} sliderId 
     * @param {string} inputId 
     * @param {string} statePath 
     */
    bindSliderToState(sliderId, inputId, statePath) {
        const slider = document.getElementById(sliderId);
        const input = document.getElementById(inputId);
        
        if (!slider || !input) return;
        
        // Debounced state update
        let debounceTimer = null;
        const updateState = (value) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                castFormState.setState(statePath, parseFloat(value));
            }, 50);
        };
        
        // Slider change
        slider.addEventListener('input', (e) => {
            input.value = e.target.value;
            updateState(e.target.value);
        });
        
        // Number input change
        input.addEventListener('input', (e) => {
            const value = parseFloat(e.target.value);
            if (!isNaN(value) && value >= parseFloat(slider.min) && value <= parseFloat(slider.max)) {
                slider.value = value;
                updateState(value);
            }
        });
        
        // Store binding for later sync
        this.parameterBindings.push({ sliderId, inputId, statePath });
    }

    /**
     * Setup state subscriptions to update UI
     */
    setupStateSubscriptions() {
        // Subscribe to all parameter changes to sync UI
        castFormState.subscribe('params', () => this.syncUIFromState());
        
        // Subscribe to input status changes
        castFormState.subscribe('input', () => this.updateInputStatus());
        
        // Subscribe to warning changes
        castFormState.subscribe('warnings', () => this.updateWarnings());
    }

    /**
     * Sync UI controls from state
     */
    syncUIFromState() {
        const params = castFormState.getState('params');
        
        this.parameterBindings.forEach(({ sliderId, inputId, statePath }) => {
            const value = castFormState.getState(statePath);
            const slider = document.getElementById(sliderId);
            const input = document.getElementById(inputId);
            
            if (slider && value !== undefined) slider.value = value;
            if (input && value !== undefined) input.value = value;
        });
        
        // Sync dropdowns
        const natchCountSelect = document.getElementById('natchCount');
        if (natchCountSelect) natchCountSelect.value = params.natches.countPerSeam;
    }

    /**
     * Update input status display
     */
    updateInputStatus() {
        const input = castFormState.getState('input');
        const statusEl = document.getElementById('inputStatus');
        const iconEl = statusEl?.querySelector('.status-icon');
        const textEl = statusEl?.querySelector('.status-text');
        
        if (!statusEl || !iconEl || !textEl) return;
        
        if (input.isValid) {
            statusEl.classList.add('loaded');
            iconEl.textContent = '●';
            
            const bounds = input.bounds;
            if (bounds) {
                textEl.textContent = `${input.fileName || 'Loaded'} (${bounds.size.x.toFixed(0)} × ${bounds.size.y.toFixed(0)} × ${bounds.size.z.toFixed(0)} mm)`;
            } else {
                textEl.textContent = input.fileName || 'Model loaded';
            }
        } else {
            statusEl.classList.remove('loaded');
            iconEl.textContent = '○';
            textEl.textContent = input.validationErrors.length > 0 
                ? input.validationErrors[0] 
                : 'No model loaded';
        }
    }

    /**
     * Update warnings display
     */
    updateWarnings() {
        const warnings = castFormState.getState('warnings');
        const section = document.getElementById('warningsSection');
        const list = document.getElementById('warningList');
        const count = document.getElementById('warningCount');
        const badge = document.getElementById('warningBadge');
        const badgeCount = document.getElementById('warningBadgeCount');
        
        if (warnings.length === 0) {
            section?.style.setProperty('display', 'none');
            badge?.classList.add('hidden');
            return;
        }
        
        section?.style.setProperty('display', 'block');
        badge?.classList.remove('hidden');
        
        if (count) count.textContent = warnings.length;
        if (badgeCount) badgeCount.textContent = warnings.length;
        
        if (list) {
            list.innerHTML = warnings.map(w => `
                <li>
                    <span class="warning-icon">⚠</span>
                    <span>${w.message || w}</span>
                </li>
            `).join('');
        }
    }
}

export default ParameterPanel;

