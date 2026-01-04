/**
 * Dimension Overlays
 * Renders dimension labels on the 3D viewport
 */

class DimensionOverlays {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.visible = true;
        this.labels = [];
    }
    
    /**
     * Update dimension labels based on handle parameters
     * @param {Object} params - Handle parameters
     * @param {THREE.Camera} camera - The viewport camera
     * @param {Object} mugData - Mug reference data
     */
    update(params, camera, mugData) {
        // Clear existing labels
        this.clear();
        
        if (!this.visible) return;
        
        const {
            handleProtrusion,
            topAttachmentHeight,
            bottomAttachmentHeight,
        } = params;
        
        // Handle height is derived from attachment points
        const handleHeight = topAttachmentHeight - bottomAttachmentHeight;
        
        const mugRadius = mugData.loaded ? mugData.topDiameter / 2 : 40;
        
        // Calculate 3D positions for key dimensions
        const dimensions = [
            {
                id: 'height',
                label: `${handleHeight}mm`,
                description: 'Height',
                position3D: {
                    x: mugRadius + handleProtrusion + 15,
                    y: (topAttachmentHeight + bottomAttachmentHeight) / 2,
                    z: 0,
                },
                anchor: 'left',
            },
            {
                id: 'protrusion',
                label: `${handleProtrusion}mm`,
                description: 'Protrusion',
                position3D: {
                    x: mugRadius + handleProtrusion / 2,
                    y: bottomAttachmentHeight - 10,
                    z: 0,
                },
                anchor: 'center',
            },
        ];
        
        // Project 3D positions to 2D screen coordinates
        const rect = this.container.getBoundingClientRect();
        
        dimensions.forEach(dim => {
            const screenPos = this.projectToScreen(dim.position3D, camera, rect);
            
            if (screenPos) {
                this.createLabel(dim, screenPos);
            }
        });
    }
    
    /**
     * Project a 3D point to screen coordinates
     */
    projectToScreen(pos3D, camera, containerRect) {
        // Create vector from position
        const vector = new THREE.Vector3(pos3D.x, pos3D.y, pos3D.z);
        
        // Project to normalized device coordinates
        vector.project(camera);
        
        // Check if point is behind camera
        if (vector.z > 1) return null;
        
        // Convert to screen coordinates
        const x = (vector.x * 0.5 + 0.5) * containerRect.width;
        const y = (-vector.y * 0.5 + 0.5) * containerRect.height;
        
        return { x, y };
    }
    
    /**
     * Create a dimension label element
     */
    createLabel(dimension, screenPos) {
        const label = document.createElement('div');
        label.className = `dimension-label ${dimension.id}`;
        label.innerHTML = `${dimension.label}`;
        label.style.left = `${screenPos.x}px`;
        label.style.top = `${screenPos.y}px`;
        
        // Anchor positioning
        switch (dimension.anchor) {
            case 'left':
                label.style.transform = 'translateY(-50%)';
                break;
            case 'right':
                label.style.transform = 'translate(-100%, -50%)';
                break;
            case 'center':
            default:
                label.style.transform = 'translate(-50%, -50%)';
        }
        
        this.container.appendChild(label);
        this.labels.push(label);
    }
    
    /**
     * Clear all labels
     */
    clear() {
        this.labels.forEach(label => {
            if (label.parentNode) {
                label.parentNode.removeChild(label);
            }
        });
        this.labels = [];
    }
    
    /**
     * Set visibility
     */
    setVisible(visible) {
        this.visible = visible;
        if (!visible) {
            this.clear();
        }
    }
}

// Make THREE available globally for projectToScreen
import * as THREE from 'three';

// Export singleton
let overlayInstance = null;

export function initDimensionOverlays(containerId) {
    overlayInstance = new DimensionOverlays(containerId);
    return overlayInstance;
}

export function getDimensionOverlays() {
    return overlayInstance;
}

