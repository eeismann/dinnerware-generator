/**
 * Validation and Warning System
 * Validates parameters and generates warnings for potential issues
 */

import { stateManager, parameterResolver, ITEM_TYPES, ITEM_NAMES } from '../state/projectState.js';
import { calculateGeometryValues, buildItemCrossSection } from '../geometry/meshGenerator.js';
import { measureOverhangs } from '../geometry/profileBuilder.js';

// Warning thresholds
const MIN_WALL_THICKNESS = 1.2;
const MAX_OVERHANG_ANGLE = 45;
const MIN_PATTERN_RIDGE_WIDTH = 0.8; // ~2 extrusion widths of a 0.4mm nozzle
const MAX_PATTERN_RIDGE_OVERHANG_DEPTH = 0.8;
const PATTERN_DENSITY_NOTE_COUNT = 120;
// Overhanging bands narrower than this (horizontal run, mm) print without
// supports on FDM: the layers step out less than a few extrusion widths
const MIN_OVERHANG_RUN = 3.0;
// Unsupported ceiling spans beyond this usually sag without supports
const MAX_UNSUPPORTED_BRIDGE = 10;

// Severity: 'error' = the geometry cannot be built as authored,
// 'warning' = likely print failure without changes or supports,
// 'info' = advisory.
export const WARNING_SEVERITIES = ['error', 'warning', 'info'];

// Which control shapes each part of the cross-section
const OVERHANG_SOURCES = {
    'outer-wall': { parameter: 'wallAngle', label: 'Outer wall' },
    'outer-fillet': { parameter: 'bottomCornerRadius', label: 'Bottom corner fillet' },
    'outer-footring': { parameter: 'outerFootringAngle', label: 'Outer footring' },
    'cavity-wall': { parameter: 'innerFootringAngle', label: 'Inner footring' },
    rim: { parameter: 'rimStyle', label: 'Rim' }
};

/**
 * Warning System Class
 */
export class WarningSystem {
    constructor() {
        this.warnings = [];
        this.listeners = new Set();
        // Overhang and bridge ("may require supports") checks are measured
        // but not reported unless switched on; the studio prints with
        // supports as needed and asked not to be alerted about them.
        this.includeSupportWarnings = false;
    }
    
    // Subscribe to warning changes
    subscribe(callback) {
        this.listeners.add(callback);
        return () => this.listeners.delete(callback);
    }
    
    // Notify listeners of warning changes
    notifyListeners() {
        this.listeners.forEach(callback => callback(this.warnings));
    }
    
    // Validate all items and update warnings
    validate() {
        this.warnings = [];
        
        ITEM_TYPES.forEach(itemType => {
            const params = parameterResolver.getAllParameters(itemType);
            let geoVals = null;
            let section = null;
            try {
                geoVals = calculateGeometryValues(params);
                section = buildItemCrossSection(params, geoVals);
            } catch (e) {
                // Leave geometry-derived checks out for unbuildable input
            }

            this.checkWallThickness(itemType, params);
            if (section && this.includeSupportWarnings) {
                this.checkOverhangs(itemType, params, section);
                this.checkFootCavity(itemType, params, section);
            }
            this.checkFootringGeometry(itemType, params);
            this.checkSurfacePatterns(itemType, params);
        });
        
        // Update state
        stateManager.setState('warnings', this.warnings);
        this.notifyListeners();
        
        return this.warnings;
    }
    
    // Check wall thickness
    checkWallThickness(itemType, params) {
        if (params.wallThickness < MIN_WALL_THICKNESS) {
            this.warnings.push({
                id: `${itemType}_wall_thickness`,
                type: 'wall_thickness',
                severity: 'warning',
                itemType: itemType,
                itemName: ITEM_NAMES[itemType],
                message: `Wall thickness (${params.wallThickness}mm) below recommended minimum (${MIN_WALL_THICKNESS}mm) for FDM printing`,
                parameter: 'wallThickness',
                value: params.wallThickness
            });
        }
    }
    
    // Check overhang angles measured on the actual cross-section, so
    // curves, fillets, the inset chamfer and inward walls are all covered
    checkOverhangs(itemType, params, section) {
        const worst = new Map();
        const inset = section.inset;
        const steep = measureOverhangs(section).filter(o => o.angleDeg > MAX_OVERHANG_ANGLE + 0.5);
        // Horizontal run of steep overhang per part of the section
        const runs = new Map();
        steep.forEach(o => runs.set(o.chain, (runs.get(o.chain) ?? 0) + o.run));
        steep.forEach(overhang => {
            if ((runs.get(overhang.chain) ?? 0) < MIN_OVERHANG_RUN) return;
            let source = OVERHANG_SOURCES[overhang.chain]
                ?? { parameter: 'wallAngle', label: 'Inner wall' };
            if (overhang.chain === 'outer-wall' && inset
                && overhang.y >= inset.lowerY - 1e-6 && overhang.y <= inset.upperY + 1e-6) {
                source = { parameter: 'wallInsetDepth', label: 'Wall inset step' };
            } else if ((overhang.chain === 'outer-wall' || overhang.chain.startsWith('inner-'))
                && Math.abs(params.wallCurveAmount || 0) >= 0.1
                && Math.abs(params.wallAngle) <= MAX_OVERHANG_ANGLE) {
                source = { ...source, parameter: 'wallCurveAmount' };
            }
            const current = worst.get(source.parameter);
            if (!current || overhang.angleDeg > current.angleDeg) {
                worst.set(source.parameter, { ...source, angleDeg: overhang.angleDeg });
            }
        });

        worst.forEach(({ parameter, label, angleDeg }) => {
            this.warnings.push({
                id: `${itemType}_${parameter}_overhang`,
                type: 'overhang',
                severity: 'warning',
                itemType: itemType,
                itemName: ITEM_NAMES[itemType],
                message: `${label} overhangs ${Math.round(angleDeg)}° (over ${MAX_OVERHANG_ANGLE}°) - may require supports`,
                parameter,
                value: Math.round(angleDeg)
            });
        });
    }

    // A hollow foot leaves an unsupported ceiling when printed upright
    checkFootCavity(itemType, params, section) {
        if (!(section.cavityDepth > 0)) return;
        const span = section.cavityRadius * 2;
        if (span <= MAX_UNSUPPORTED_BRIDGE) return;
        this.warnings.push({
            id: `${itemType}_foot_cavity_bridge`,
            type: 'bridge',
            severity: 'info',
            itemType,
            itemName: ITEM_NAMES[itemType],
            message: `Foot cavity ceiling spans ${Math.round(span)}mm - print upright with supports, or set Foot Cavity Depth to 0% for a solid base`,
            groupMessage: 'Foot cavity ceilings are unsupported bridges when printed upright - add supports, or set Foot Cavity Depth to 0% for solid bases',
            parameter: 'footCavityDepth',
            value: params.footCavityDepth
        });
    }
    
    // Check footring geometry validity
    checkFootringGeometry(itemType, params) {
        if (params.footringOriginHeight === 0) return;
        
        const h = params.footringOriginHeight;
        const outerAngleRad = (params.outerFootringAngle * Math.PI) / 180;
        const innerAngleRad = (params.innerFootringAngle * Math.PI) / 180;
        
        const outerOffset = h * Math.tan(outerAngleRad);
        const innerOffset = h * Math.tan(innerAngleRad);
        
        // Check if footring geometry creates impossible intersection
        // This happens when outer and inner walls would cross
        const effectiveWidth = params.footringBaseWidth - outerOffset + innerOffset;
        
        if (effectiveWidth < 1) {
            this.warnings.push({
                id: `${itemType}_footring_geometry`,
                type: 'impossible_geometry',
                severity: 'error',
                itemType: itemType,
                itemName: ITEM_NAMES[itemType],
                message: `Footring angles create impossible geometry - adjust inner or outer angle`,
                parameters: ['outerFootringAngle', 'innerFootringAngle']
            });
        }
        
        // Check if footring base width is sufficient
        if (params.footringBaseWidth < 3) {
            this.warnings.push({
                id: `${itemType}_footring_width`,
                type: 'footring_width',
                severity: 'warning',
                itemType: itemType,
                itemName: ITEM_NAMES[itemType],
                message: `Footring base width (${params.footringBaseWidth}mm) may be too narrow for stable support`,
                parameter: 'footringBaseWidth',
                value: params.footringBaseWidth
            });
        }
    }
    
    // Check surface pattern printability
    checkSurfacePatterns(itemType, params) {
        let geoVals = null;
        try {
            geoVals = calculateGeometryValues(params);
        } catch (e) {
            return;
        }

        ['wall', 'footring'].forEach(prefix => {
            const type = params[`${prefix}PatternType`];
            if (!type || type === 'none') return;
            if (prefix === 'footring' && !geoVals.hasFootring) return;

            const depth = params[`${prefix}PatternDepth`] || 0;
            if (depth < 0.05) return;

            const relief = params[`${prefix}PatternRelief`];
            const profile = params[`${prefix}PatternProfile`];
            const count = Math.max(1, Math.round(params[`${prefix}PatternCount`] || 48));
            const pitch = Math.max(0.5, params[`${prefix}PatternPitch`] || 4);
            const duty = Math.min(0.9, Math.max(0.1, (params[`${prefix}PatternLineWidth`] || 50) / 100));
            const surfaceLabel = prefix === 'wall' ? 'wall' : 'footring';
            const isCircumferential = ['vertical', 'diagonal', 'crosshatch', 'knurl'].includes(type);

            // 1. Recessed patterns thin the wall behind them
            if (prefix === 'wall' && relief === 'recessed') {
                const remaining = params.wallThickness - depth;
                if (remaining < MIN_WALL_THICKNESS) {
                    this.warnings.push({
                        id: `${itemType}_${prefix}_pattern_thickness`,
                        type: 'pattern_thickness',
                        severity: 'warning',
                        itemType,
                        itemName: ITEM_NAMES[itemType],
                        message: `Recessed wall pattern leaves ${remaining.toFixed(1)}mm of wall (below ${MIN_WALL_THICKNESS}mm minimum) - depth is clamped during generation`,
                        parameter: `${prefix}PatternDepth`,
                        value: depth
                    });
                }
            }

            // 2. Ridge width below what a 0.4mm nozzle can resolve
            const meanRadius = prefix === 'wall'
                ? (geoVals.radius + geoVals.radiusAtWallBottom) / 2
                : (geoVals.footringOuterRadius + geoVals.radiusAtWallBottom) / 2;
            let ridgeWidth;
            if (type === 'horizontal') {
                ridgeWidth = pitch * duty;
            } else if (type === 'knurl') {
                ridgeWidth = (Math.PI * 2 * meanRadius / count) * 0.5;
            } else {
                ridgeWidth = (Math.PI * 2 * meanRadius / count) * duty;
            }
            if (ridgeWidth < MIN_PATTERN_RIDGE_WIDTH) {
                this.warnings.push({
                    id: `${itemType}_${prefix}_pattern_feature_size`,
                    type: 'pattern_feature_size',
                    severity: 'warning',
                    itemType,
                    itemName: ITEM_NAMES[itemType],
                    message: `${surfaceLabel} pattern lines (~${ridgeWidth.toFixed(2)}mm) may not resolve when printed - reduce ${type === 'horizontal' ? 'line width' : 'line count'} or increase spacing`,
                    parameter: type === 'horizontal' ? `${prefix}PatternPitch` : `${prefix}PatternCount`,
                    value: ridgeWidth
                });
            }

            // 3. Raised horizontal ridges with steep undersides need supports
            if (this.includeSupportWarnings && type === 'horizontal' && relief === 'raised'
                && depth > MAX_PATTERN_RIDGE_OVERHANG_DEPTH && profile !== 'rounded') {
                this.warnings.push({
                    id: `${itemType}_${prefix}_pattern_overhang`,
                    type: 'pattern_overhang',
                    severity: 'warning',
                    itemType,
                    itemName: ITEM_NAMES[itemType],
                    message: `Raised horizontal ridges (${depth}mm, ${profile} profile) create steep undersides - use rounded profile or reduce depth below ${MAX_PATTERN_RIDGE_OVERHANG_DEPTH}mm`,
                    parameter: `${prefix}PatternDepth`,
                    value: depth
                });
            }

            // 4. Very dense patterns slow preview and slicing
            if (isCircumferential && count > PATTERN_DENSITY_NOTE_COUNT) {
                this.warnings.push({
                    id: `${itemType}_${prefix}_pattern_density`,
                    type: 'pattern_density',
                    severity: 'info',
                    itemType,
                    itemName: ITEM_NAMES[itemType],
                    message: `${surfaceLabel} pattern line count (${count}) is very dense - preview and slicing may slow down`,
                    groupMessage: 'Very dense patterns - preview and slicing may slow down',
                    parameter: `${prefix}PatternCount`,
                    value: count
                });
            }
        });
    }

    // Get warnings for a specific item
    getWarningsForItem(itemType) {
        return this.warnings.filter(w => w.itemType === itemType);
    }
    
    // Get warning count
    getWarningCount() {
        return this.warnings.length;
    }
    
    // Check if a parameter has warnings
    hasWarningForParameter(itemType, parameterName) {
        return this.warnings.some(w => 
            w.itemType === itemType && 
            (w.parameter === parameterName || (w.parameters && w.parameters.includes(parameterName)))
        );
    }
}

/**
 * Parameter Validator
 * Validates individual parameter values
 */
export function validateParameterValue(paramName, value, constraints) {
    const errors = [];
    
    if (value < constraints.min) {
        errors.push(`Value must be at least ${constraints.min}${constraints.unit}`);
    }
    
    if (value > constraints.max) {
        errors.push(`Value must be at most ${constraints.max}${constraints.unit}`);
    }
    
    if (isNaN(value)) {
        errors.push('Value must be a number');
    }
    
    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Clamp value to constraints
 */
export function clampValue(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

/**
 * Round value to step
 */
export function roundToStep(value, step) {
    return Math.round(value / step) * step;
}

// Singleton instance. The app validates once per batched mesh update rather
// than on every state change (see refreshWarnings in main.js).
export const warningSystem = new WarningSystem();





