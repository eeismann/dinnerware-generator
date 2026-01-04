/**
 * Vessel Generator - Parameter Panel
 * Manages UI controls and syncs with state
 */

import vesselState from '../state/vesselState.js';

export class ParameterPanel {
    constructor() {
        this.panel = document.getElementById('parameterPanel');
        this.unsubscribers = [];
        
        this.init();
    }

    init() {
        this.setupSectionToggles();
        this.setupParameterControls();
        this.setupTransitionControls();
        this.setupLockControls();
        this.setupFlatWallControls();
        this.subscribeToState();
    }

    /**
     * Setup section expand/collapse and enable toggles
     */
    setupSectionToggles() {
        // Section expand/collapse
        this.panel.querySelectorAll('.section-header').forEach(header => {
            header.addEventListener('click', (e) => {
                // Don't toggle if clicking on the enable checkbox
                if (e.target.closest('.section-toggle')) return;
                
                const section = header.closest('.panel-section');
                section.classList.toggle('expanded');
            });
        });

        // Section enable/disable toggles
        this.panel.querySelectorAll('.section-toggle input').forEach(toggle => {
            toggle.addEventListener('change', (e) => {
                const sectionName = e.target.dataset.enable;
                vesselState.setState(`sections.${sectionName}.enabled`, e.target.checked);
            });
        });
    }

    /**
     * Setup parameter input controls (ranges and numbers)
     */
    setupParameterControls() {
        this.panel.querySelectorAll('.parameter-row').forEach(row => {
            const paramPath = row.dataset.param;
            if (!paramPath) return;

            const range = row.querySelector('input[type="range"]');
            const number = row.querySelector('input[type="number"]');

            if (range && number) {
                // Sync range to number
                range.addEventListener('input', () => {
                    number.value = range.value;
                    this.updateStateFromParam(paramPath, parseFloat(range.value));
                });

                // Sync number to range
                number.addEventListener('input', () => {
                    const val = parseFloat(number.value);
                    if (!isNaN(val) && val >= parseFloat(range.min) && val <= parseFloat(range.max)) {
                        range.value = val;
                        this.updateStateFromParam(paramPath, val);
                    }
                });

                // Commit on blur
                number.addEventListener('blur', () => {
                    let val = parseFloat(number.value);
                    const min = parseFloat(range.min);
                    const max = parseFloat(range.max);
                    
                    if (isNaN(val)) val = parseFloat(range.value);
                    val = Math.max(min, Math.min(max, val));
                    
                    number.value = val;
                    range.value = val;
                    this.updateStateFromParam(paramPath, val);
                });
            }
        });

        // Select controls
        this.panel.querySelectorAll('select').forEach(select => {
            const row = select.closest('.parameter-row');
            if (!row) return;
            
            const paramPath = row.dataset.param;
            if (!paramPath) return;

            select.addEventListener('change', () => {
                this.updateStateFromParam(paramPath, select.value);
            });
        });
    }

    /**
     * Setup transition sharpness controls
     */
    setupTransitionControls() {
        this.panel.querySelectorAll('.transition-row').forEach(row => {
            const transitionKey = row.dataset.transition;
            if (!transitionKey) return;

            const range = row.querySelector('input[type="range"]');
            const valueSpan = row.querySelector('.transition-value');

            if (range) {
                range.addEventListener('input', () => {
                    if (valueSpan) {
                        valueSpan.textContent = `${range.value}%`;
                    }
                    vesselState.setState(`transitions.${transitionKey}`, parseInt(range.value));
                });
            }
        });
    }

    /**
     * Setup lock toggle controls for bidirectional diameter locking between sections
     */
    setupLockControls() {
        // Define the lock relationships: section -> target section it locks to
        // When locked, editing either bottom diameter or target's top diameter updates both
        this.lockRelationships = {
            neck: { targetSection: 'shoulder', targetProp: 'topDiameter' },
            shoulder: { targetSection: 'body', targetProp: 'topDiameter' },
            body: { targetSection: null, targetProp: 'topDiameter' }, // waist or foot depending on enabled
            waist: { targetSection: 'foot', targetProp: 'topDiameter' }
        };

        this.panel.querySelectorAll('.lock-row').forEach(row => {
            const lockPath = row.dataset.lock;
            if (!lockPath) return;

            const checkbox = row.querySelector('input[type="checkbox"]');
            if (!checkbox) return;

            checkbox.addEventListener('change', () => {
                const sectionName = checkbox.dataset.lockSection;
                vesselState.setState(`sections.${sectionName}.bottomDiameterLocked`, checkbox.checked);
                
                // If turning on, sync the diameters immediately (use bottom diameter as the source)
                if (checkbox.checked) {
                    this.syncLockedDiameters(sectionName, 'bottom');
                }
                
                // Update the visual state of the locked rows
                this.updateLockedRowVisuals(sectionName, checkbox.checked);
            });
        });
    }

    /**
     * Sync locked diameters bidirectionally
     * @param {string} sectionName - The section with the lock
     * @param {string} source - Which value changed: 'bottom' or 'top'
     */
    syncLockedDiameters(sectionName, source = 'bottom') {
        const relationship = this.lockRelationships[sectionName];
        if (!relationship) return;

        let targetSection = this.getTargetSectionForLock(sectionName);
        if (!targetSection) return;

        if (source === 'bottom') {
            // Bottom diameter changed, update target's top diameter
            const bottomValue = vesselState.getState(`sections.${sectionName}.bottomDiameter`);
            if (bottomValue !== undefined) {
                vesselState.setState(`sections.${targetSection}.topDiameter`, bottomValue);
            }
        } else {
            // Target's top diameter changed, update bottom diameter
            const topValue = vesselState.getState(`sections.${targetSection}.topDiameter`);
            if (topValue !== undefined) {
                vesselState.setState(`sections.${sectionName}.bottomDiameter`, topValue);
            }
        }
    }

    /**
     * Update the visual state of locked parameter rows
     */
    updateLockedRowVisuals(sectionName, isLocked) {
        const bottomRow = this.panel.querySelector(`[data-param="${sectionName}.bottomDiameter"]`);
        const targetSection = this.getTargetSectionForLock(sectionName);
        const topRow = targetSection ? this.panel.querySelector(`[data-param="${targetSection}.topDiameter"]`) : null;

        // Add/remove linked visual indicator (but don't disable the controls)
        if (bottomRow) {
            bottomRow.classList.toggle('linked', isLocked);
        }
        if (topRow) {
            topRow.classList.toggle('linked', isLocked);
        }
    }

    /**
     * Get the target section for a lock (handles body->waist/foot logic)
     */
    getTargetSectionForLock(sectionName) {
        if (sectionName === 'body') {
            const waistEnabled = vesselState.getState('sections.waist.enabled');
            return waistEnabled ? 'waist' : 'foot';
        }
        return this.lockRelationships[sectionName]?.targetSection;
    }

    /**
     * Get the source section that locks to a given target section
     */
    getSourceSectionForTarget(targetSection) {
        // Find which section locks to this target
        for (const [source, rel] of Object.entries(this.lockRelationships)) {
            if (rel.targetSection === targetSection) {
                return source;
            }
        }
        // Special case: body locks to waist or foot
        if (targetSection === 'waist' || targetSection === 'foot') {
            return 'body';
        }
        return null;
    }

    /**
     * Setup flat wall toggle controls for each section
     */
    setupFlatWallControls() {
        this.panel.querySelectorAll('.flat-wall-row').forEach(row => {
            const sectionName = row.dataset.flatWallSection;
            if (!sectionName) return;

            const checkbox = row.querySelector('input[type="checkbox"]');
            if (!checkbox) return;

            checkbox.addEventListener('change', () => {
                vesselState.setState(`sections.${sectionName}.flatWall`, checkbox.checked);
                this.updateFlatWallDisabledControls(sectionName, checkbox.checked);
            });
        });
    }

    /**
     * Update the disabled state of curve-related controls when flatWall changes
     */
    updateFlatWallDisabledControls(sectionName, isFlatWall) {
        // Controls to disable when flatWall is enabled
        const controlsToDisable = [
            `${sectionName}.midDiameter`,
            `${sectionName}.curvature`
        ];

        controlsToDisable.forEach(paramPath => {
            const row = this.panel.querySelector(`[data-param="${paramPath}"]`);
            if (row) {
                row.classList.toggle('disabled', isFlatWall);
                const inputs = row.querySelectorAll('input');
                inputs.forEach(input => {
                    input.disabled = isFlatWall;
                });
            }
        });
    }

    /**
     * Convert param path to state path
     */
    updateStateFromParam(paramPath, value) {
        // Handle global params
        if (paramPath.startsWith('global.') || !paramPath.includes('.')) {
            const key = paramPath.replace('global.', '');
            vesselState.setState(`global.${key}`, value);
            return;
        }

        // Handle section params (e.g., "lip.height")
        const [section, prop] = paramPath.split('.');
        if (section && prop) {
            vesselState.setState(`sections.${section}.${prop}`, value);
        }
    }

    /**
     * Subscribe to state changes to update UI
     */
    subscribeToState() {
        const unsubscribe = vesselState.subscribe('*', (state, changedPaths) => {
            this.updateUIFromState(state);
            
            // Check if any changes affect locked diameters
            this.handleLockedDiameterChanges(state, changedPaths);
        });
        this.unsubscribers.push(unsubscribe);
    }

    /**
     * Handle state changes that affect locked diameters (bidirectional sync)
     */
    handleLockedDiameterChanges(state, changedPaths) {
        if (!Array.isArray(changedPaths)) return;

        // Prevent recursive syncing
        if (this.isSyncing) return;
        this.isSyncing = true;

        try {
            // Check if waist enabled state changed - need to re-sync body if locked
            if (changedPaths.some(p => p.includes('waist.enabled'))) {
                if (state.sections.body.bottomDiameterLocked) {
                    this.syncLockedDiameters('body', 'bottom');
                }
                // Update visual state for body's lock
                this.updateLockedRowVisuals('body', state.sections.body.bottomDiameterLocked);
            }

            // Check for bottom diameter changes and sync to top diameter
            const bottomDiameterSections = ['neck', 'shoulder', 'body', 'waist'];
            for (const sectionName of bottomDiameterSections) {
                if (changedPaths.some(p => p.includes(`${sectionName}.bottomDiameter`))) {
                    if (state.sections[sectionName]?.bottomDiameterLocked) {
                        this.syncLockedDiameters(sectionName, 'bottom');
                    }
                }
            }

            // Check for top diameter changes and sync to bottom diameter of section above
            const topDiameterMappings = {
                'shoulder': 'neck',      // shoulder.topDiameter -> neck.bottomDiameter
                'body': 'shoulder',      // body.topDiameter -> shoulder.bottomDiameter
                'waist': 'body',         // waist.topDiameter -> body.bottomDiameter (if waist enabled)
                'foot': ['body', 'waist'] // foot.topDiameter -> body or waist bottomDiameter
            };

            for (const [targetSection, sourceSections] of Object.entries(topDiameterMappings)) {
                if (changedPaths.some(p => p.includes(`${targetSection}.topDiameter`))) {
                    const sources = Array.isArray(sourceSections) ? sourceSections : [sourceSections];
                    for (const sourceSection of sources) {
                        // Check if this source section is locked to this target
                        if (state.sections[sourceSection]?.bottomDiameterLocked) {
                            const actualTarget = this.getTargetSectionForLock(sourceSection);
                            if (actualTarget === targetSection) {
                                this.syncLockedDiameters(sourceSection, 'top');
                            }
                        }
                    }
                }
            }
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Update UI controls from state
     */
    updateUIFromState(state) {
        // Update global parameters
        this.updateParamRow('wallThickness', state.global.wallThickness);

        // Update section enables
        Object.entries(state.sections).forEach(([sectionName, section]) => {
            if (typeof section.enabled === 'boolean') {
                const toggle = this.panel.querySelector(`[data-enable="${sectionName}"]`);
                if (toggle) toggle.checked = section.enabled;
            }
        });

        // Update section parameters
        this.updateSectionParams('lip', state.sections.lip);
        this.updateSectionParams('neck', state.sections.neck);
        this.updateSectionParams('shoulder', state.sections.shoulder);
        this.updateSectionParams('waist', state.sections.waist);
        this.updateSectionParams('foot', state.sections.foot);
        this.updateSectionParams('body', state.sections.body);

        // Update transitions
        Object.entries(state.transitions).forEach(([key, value]) => {
            const row = this.panel.querySelector(`[data-transition="${key}"]`);
            if (row) {
                const range = row.querySelector('input[type="range"]');
                const valueSpan = row.querySelector('.transition-value');
                if (range) range.value = value;
                if (valueSpan) valueSpan.textContent = `${value}%`;
            }
        });

        // Update lock toggles and locked row states
        this.updateLockStates(state);
        
        // Sync locked diameters
        this.syncAllLockedDiameters(state);
        
        // Update flat wall toggles and disabled states
        this.updateFlatWallStates(state);
    }

    /**
     * Update lock toggle UI states
     */
    updateLockStates(state) {
        const lockableSections = ['neck', 'shoulder', 'body', 'waist'];
        
        lockableSections.forEach(sectionName => {
            const section = state.sections[sectionName];
            if (!section) return;

            // Update the lock toggle checkbox
            const lockRow = this.panel.querySelector(`[data-lock="${sectionName}.bottomDiameterLocked"]`);
            if (lockRow) {
                const checkbox = lockRow.querySelector('input[type="checkbox"]');
                if (checkbox) {
                    checkbox.checked = section.bottomDiameterLocked ?? false;
                }
            }

            // Update the visual linked state of the rows (not disabled, just visually linked)
            this.updateLockedRowVisuals(sectionName, section.bottomDiameterLocked ?? false);
        });
    }

    /**
     * Sync all locked diameters based on current state (initial sync)
     */
    syncAllLockedDiameters(state) {
        // Only sync on initial load if needed - don't continuously sync
        // The bidirectional sync happens through handleLockedDiameterChanges
    }

    /**
     * Update flat wall toggle UI states
     */
    updateFlatWallStates(state) {
        const flatWallSections = ['neck', 'shoulder', 'body', 'waist', 'foot'];
        
        flatWallSections.forEach(sectionName => {
            const section = state.sections[sectionName];
            if (!section) return;

            // Update the flat wall toggle checkbox
            const flatWallRow = this.panel.querySelector(`[data-flat-wall-section="${sectionName}"]`);
            if (flatWallRow) {
                const checkbox = flatWallRow.querySelector('input[type="checkbox"]');
                if (checkbox) {
                    checkbox.checked = section.flatWall ?? false;
                }
            }

            // Update disabled state of curve-related controls
            this.updateFlatWallDisabledControls(sectionName, section.flatWall ?? false);
        });
    }

    /**
     * Update section parameter controls
     */
    updateSectionParams(sectionName, sectionData) {
        if (!sectionData) return;

        Object.entries(sectionData).forEach(([prop, value]) => {
            if (typeof value === 'number') {
                this.updateParamRow(`${sectionName}.${prop}`, value);
            } else if (typeof value === 'string') {
                const select = this.panel.querySelector(`#${sectionName}${prop.charAt(0).toUpperCase() + prop.slice(1)}`);
                if (select) select.value = value;
            }
        });
    }

    /**
     * Update a parameter row's inputs
     */
    updateParamRow(paramPath, value) {
        const row = this.panel.querySelector(`[data-param="${paramPath}"]`);
        if (!row) return;

        const range = row.querySelector('input[type="range"]');
        const number = row.querySelector('input[type="number"]');

        if (range) range.value = value;
        if (number) number.value = value;
    }

    /**
     * Get current panel values as object
     */
    getValues() {
        return vesselState.getState();
    }

    /**
     * Clean up
     */
    dispose() {
        this.unsubscribers.forEach(unsub => unsub());
    }
}

export default ParameterPanel;

