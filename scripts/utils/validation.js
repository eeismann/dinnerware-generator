/**
 * Validation and Warning System
 * Validates parameters and generates warnings for potential issues
 */

import { stateManager, parameterResolver, ITEM_TYPES, ITEM_NAMES } from '../state/projectState.js';

// Warning thresholds
const MIN_WALL_THICKNESS = 1.2;
const MAX_OVERHANG_ANGLE = 45;

/**
 * Warning System Class
 */
export class WarningSystem {
    constructor() {
        this.warnings = [];
        this.listeners = new Set();
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
            
            this.checkWallThickness(itemType, params);
            this.checkOverhangs(itemType, params);
            this.checkFootringGeometry(itemType, params);
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
    
    // Check overhang angles
    checkOverhangs(itemType, params) {
        // Check wall angle
        if (Math.abs(params.wallAngle) > MAX_OVERHANG_ANGLE) {
            this.warnings.push({
                id: `${itemType}_wall_overhang`,
                type: 'overhang',
                severity: 'warning',
                itemType: itemType,
                itemName: ITEM_NAMES[itemType],
                message: `Wall angle (${params.wallAngle}°) creates overhang exceeding 45° - may require supports`,
                parameter: 'wallAngle',
                value: params.wallAngle
            });
        }
        
        // Check outer footring angle
        if (params.footringOriginHeight > 0 && Math.abs(params.outerFootringAngle) > MAX_OVERHANG_ANGLE) {
            this.warnings.push({
                id: `${itemType}_outer_footring_overhang`,
                type: 'overhang',
                severity: 'warning',
                itemType: itemType,
                itemName: ITEM_NAMES[itemType],
                message: `Outer footring angle (${params.outerFootringAngle}°) creates overhang exceeding 45° - may require supports`,
                parameter: 'outerFootringAngle',
                value: params.outerFootringAngle
            });
        }
        
        // Check inner footring angle
        if (params.footringOriginHeight > 0 && Math.abs(params.innerFootringAngle) > MAX_OVERHANG_ANGLE) {
            this.warnings.push({
                id: `${itemType}_inner_footring_overhang`,
                type: 'overhang',
                severity: 'warning',
                itemType: itemType,
                itemName: ITEM_NAMES[itemType],
                message: `Inner footring angle (${params.innerFootringAngle}°) creates overhang exceeding 45° - may require supports`,
                parameter: 'innerFootringAngle',
                value: params.innerFootringAngle
            });
        }
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
                severity: 'warning',
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

// Singleton instance
export const warningSystem = new WarningSystem();

// Initialize validation on state changes
stateManager.subscribe('globalParameters', () => warningSystem.validate());
stateManager.subscribe('itemOverrides', () => warningSystem.validate());





