/**
 * Cross-Section Preview
 * Renders a 2D preview of the handle cross-section in a canvas element
 */

import { getCrossSectionPoints } from '../geometry/handleCrossSectionBuilder.js';

class CrossSectionPreview {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        
        // Settings
        this.padding = 15;
        this.backgroundColor = '#383838';
        this.strokeColor = '#A259FF';
        this.fillColor = 'rgba(162, 89, 255, 0.2)';
        this.gridColor = '#444444';
        
        // Initial draw
        this.clear();
    }
    
    clear() {
        this.ctx.fillStyle = this.backgroundColor;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawGrid();
    }
    
    drawGrid() {
        const { width, height } = this.canvas;
        const centerX = width / 2;
        const centerY = height / 2;
        
        this.ctx.strokeStyle = this.gridColor;
        this.ctx.lineWidth = 0.5;
        
        // Horizontal center line
        this.ctx.beginPath();
        this.ctx.moveTo(0, centerY);
        this.ctx.lineTo(width, centerY);
        this.ctx.stroke();
        
        // Vertical center line
        this.ctx.beginPath();
        this.ctx.moveTo(centerX, 0);
        this.ctx.lineTo(centerX, height);
        this.ctx.stroke();
    }
    
    /**
     * Render cross-section preview
     * @param {number} crossWidth - Width dimension (displays as Height)
     * @param {number} crossHeight - Height dimension (displays as Width)
     * @param {string} type - 'oval' or 'rectangular'
     * @param {number} cornerRadius - Corner radius for rectangular type
     */
    render(crossWidth, crossHeight, type = 'oval', cornerRadius = 3) {
        // Clear canvas
        this.clear();
        
        // Get cross-section points
        const points = getCrossSectionPoints(crossWidth, crossHeight, 32, type, cornerRadius);
        
        if (points.length === 0) return;
        
        // Calculate scale to fit in canvas
        const { width, height } = this.canvas;
        const availableWidth = width - this.padding * 2;
        const availableHeight = height - this.padding * 2;
        
        // Find bounds
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        
        points.forEach(p => {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
        });
        
        const rangeX = maxX - minX;
        const rangeY = maxY - minY;
        
        // Calculate scale
        const scaleX = availableWidth / rangeX;
        const scaleY = availableHeight / rangeY;
        const scale = Math.min(scaleX, scaleY) * 0.85;
        
        // Center point
        const centerX = width / 2;
        const centerY = height / 2;
        
        // Transform function - swap x and y to flip orientation
        const transform = (p) => ({
            x: centerX + p.y * scale,  // Use Y for horizontal (width)
            y: centerY - p.x * scale,  // Use X for vertical (height)
        });
        
        // Draw fill
        this.ctx.fillStyle = this.fillColor;
        this.ctx.beginPath();
        const firstPoint = transform(points[0]);
        this.ctx.moveTo(firstPoint.x, firstPoint.y);
        
        points.forEach((p, i) => {
            if (i > 0) {
                const tp = transform(p);
                this.ctx.lineTo(tp.x, tp.y);
            }
        });
        
        this.ctx.closePath();
        this.ctx.fill();
        
        // Draw stroke
        this.ctx.strokeStyle = this.strokeColor;
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        this.ctx.moveTo(firstPoint.x, firstPoint.y);
        
        points.forEach((p, i) => {
            if (i > 0) {
                const tp = transform(p);
                this.ctx.lineTo(tp.x, tp.y);
            }
        });
        
        this.ctx.closePath();
        this.ctx.stroke();
        
        // Draw dimension labels
        this.drawDimensionLabels(crossWidth, crossHeight, centerX, centerY, scale);
    }
    
    drawDimensionLabels(width, height, centerX, centerY, scale) {
        // After flip: width (crossSectionWidth) is now vertical, height (crossSectionHeight) is horizontal
        const halfWidth = (height * scale) / 2;  // horizontal extent (crossSectionHeight = "Width" label)
        const halfHeight = (width * scale) / 2;  // vertical extent (crossSectionWidth = "Height" label)
        
        this.ctx.font = '10px JetBrains Mono, monospace';
        this.ctx.fillStyle = '#888888';
        this.ctx.textAlign = 'center';
        
        // Width label (bottom) - shows crossSectionHeight value
        this.ctx.fillText(
            `${height.toFixed(1)}`,
            centerX,
            centerY + halfHeight + 12
        );
        
        // Height label (right) - shows crossSectionWidth value
        this.ctx.save();
        this.ctx.translate(centerX + halfWidth + 10, centerY);
        this.ctx.rotate(-Math.PI / 2);
        this.ctx.fillText(`${width.toFixed(1)}`, 0, 0);
        this.ctx.restore();
    }
    
    setTheme(isDark) {
        if (isDark) {
            this.backgroundColor = '#383838';
            this.gridColor = '#444444';
        } else {
            this.backgroundColor = '#f0f0f0';
            this.gridColor = '#cccccc';
        }
    }
}

// Export singleton
let previewInstance = null;

export function initCrossSectionPreview(canvasId) {
    previewInstance = new CrossSectionPreview(canvasId);
    return previewInstance;
}

export function getCrossSectionPreview() {
    return previewInstance;
}

