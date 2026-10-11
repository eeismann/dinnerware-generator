/**
 * Cast Form Generator - Parameter Panel
 * Handles UI controls and state synchronization
 */

import castFormState from '../state/castFormState.js';
import { calculateCaseBoxMaterialVolume } from '../geometry/caseBoxVolumeCalculator.js';

const volumeFormatter = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1
});

export class ParameterPanel {
    constructor() {
        this.parameterBindings = [];
        this.init();
    }

    init() {
        this.setupCollapsibleSections();
        this.setupInputSourceControls();
        this.setupMoldControls();
        this.setupCaseBoxControls();
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
        this.bindSliderToState('wallCount', 'wallCountValue', 'params.mold.wallCount');
    }

    /**
     * Setup polymer case box controls. These drive both the case box preview
     * and the exported *_Case_Box_*.stl files; changing them never triggers a
     * mold regeneration (castFormMain excludes params.caseBox from the
     * regeneration snapshot).
     */
    setupCaseBoxControls() {
        const live = { debounceMs: 0 };
        this.bindSliderToState('caseBoxGap', 'caseBoxGapValue', 'params.caseBox.gap', live);
        this.bindSliderToState('caseBoxHeadspace', 'caseBoxHeadspaceValue', 'params.caseBox.headspace', live);
        this.bindSliderToState('caseBoxWallThickness', 'caseBoxWallThicknessValue', 'params.caseBox.wallThickness', live);
        this.bindSliderToState('caseBoxFloorThickness', 'caseBoxFloorThicknessValue', 'params.caseBox.floorThickness', live);
        this.bindSliderToState('caseBoxIndentDepth', 'caseBoxIndentDepthValue', 'params.caseBox.indentDepth', live);
        this.bindSliderToState('caseBoxFitClearance', 'caseBoxFitClearanceValue', 'params.caseBox.fitClearance', live);
    }

    /**
     * Bind slider and number input to state path
     * @param {string} sliderId 
     * @param {string} inputId 
     * @param {string} statePath 
     */
    bindSliderToState(sliderId, inputId, statePath, options = {}) {
        const slider = document.getElementById(sliderId);
        const input = document.getElementById(inputId);
        
        if (!slider || !input) return;
        
        // Debounced state update
        let debounceTimer = null;
        const updateState = (value) => {
            clearTimeout(debounceTimer);
            const commit = () => castFormState.setState(statePath, parseFloat(value));
            if (options.debounceMs === 0) {
                commit();
            } else {
                debounceTimer = setTimeout(commit, options.debounceMs ?? 50);
            }
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

        // Recalculate only when a new generated mold replaces the output.
        castFormState.subscribe('output', () => this.updateMaterialVolume());
        castFormState.subscribe('params.caseBox', () => this.updateMaterialVolume());
        this.updateMaterialVolume();
    }

    /**
     * Sync UI controls from state
     */
    syncUIFromState() {
        this.parameterBindings.forEach(({ sliderId, inputId, statePath }) => {
            const value = castFormState.getState(statePath);
            const slider = document.getElementById(sliderId);
            const input = document.getElementById(inputId);
            
            if (slider && value !== undefined) slider.value = value;
            if (input && value !== undefined) input.value = value;
        });
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

    /**
     * Update polymer pour volume from the generated forms and live case-box params.
     */
    updateMaterialVolume() {
        const card = document.getElementById('materialVolumeCard');
        const total = document.getElementById('materialVolumeTotal');
        const empty = document.getElementById('materialVolumeEmpty');
        const breakdown = document.getElementById('materialVolumeBreakdown');
        const rows = document.getElementById('materialVolumeRows');
        if (!card || !total || !empty || !breakdown || !rows) return;

        const output = castFormState.getState('output') || {};
        const walls = (output.wallShells || []).filter(Boolean);
        if (!output.footShell && walls.length === 0) {
            card.classList.add('is-empty');
            total.textContent = '—';
            empty.hidden = false;
            breakdown.hidden = true;
            rows.replaceChildren();
            return;
        }

        const volume = calculateCaseBoxMaterialVolume(
            { foot: output.footShell, walls },
            castFormState.getState('params.caseBox')
        );
        const formatMl = (value) => `${volumeFormatter.format(value)} mL`;
        const rowData = [];
        if (output.footShell) rowData.push(['Foot', volume.footMl]);
        volume.wallPartsMl.forEach((wallVolume, index) => {
            rowData.push([`Wall ${index + 1}`, wallVolume]);
        });

        card.classList.remove('is-empty');
        total.textContent = formatMl(volume.totalMl);
        empty.hidden = true;
        breakdown.hidden = false;
        rows.replaceChildren(...rowData.map(([label, value]) => {
            const row = document.createElement('tr');
            const labelCell = document.createElement('td');
            const valueCell = document.createElement('td');
            labelCell.textContent = label;
            valueCell.textContent = formatMl(value);
            row.append(labelCell, valueCell);
            return row;
        }));
    }
}

export default ParameterPanel;
