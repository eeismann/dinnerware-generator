/**
 * Cross-Section Preview
 * Renders a 2D preview of the handle cross-section in a canvas element
 */

import { getCrossSectionPoints } from '../geometry/handleCrossSectionBuilder.js';

// Fallback ink when the page's DialKit tokens are unavailable
const DEFAULT_COLORS = {
    stroke: '#ffffff',
    fill: 'rgba(255, 255, 255, 0.1)',
    grid: 'rgba(255, 255, 255, 0.1)',
    label: 'rgba(255, 255, 255, 0.4)'
};

class CrossSectionPreview {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');

        // Draw in CSS pixels on a device-resolution backing store
        this.width = this.canvas.width;
        this.height = this.canvas.height;
        const ratio = Math.min(window.devicePixelRatio || 1, 3);
        this.canvas.style.width = `${this.width}px`;
        this.canvas.style.height = `${this.height}px`;
        this.canvas.width = Math.round(this.width * ratio);
        this.canvas.height = Math.round(this.height * ratio);
        this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

        // Settings
        this.padding = 15;
        this.colors = { ...DEFAULT_COLORS };

        // Initial draw
        this.clear();
    }

    /**
     * Follow the page theme: ink comes from the DialKit tokens inherited by
     * the canvas (--dk-text-root, --dk-surface-hover, --dk-border,
     * --dk-text-tertiary).
     */
    readColors() {
        const style = getComputedStyle(this.canvas);
        const token = (name, fallback) => style.getPropertyValue(name).trim() || fallback;
        this.colors = {
            stroke: token('--dk-text-root', DEFAULT_COLORS.stroke),
            fill: token('--dk-surface-hover', DEFAULT_COLORS.fill),
            grid: token('--dk-border', DEFAULT_COLORS.grid),
            label: token('--dk-text-tertiary', DEFAULT_COLORS.label)
        };
    }

    clear() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.drawGrid();
    }

    drawGrid() {
        const { width, height } = this;
        const centerX = width / 2;
        const centerY = height / 2;

        this.ctx.strokeStyle = this.colors.grid;
        this.ctx.lineWidth = 1;
        this.ctx.setLineDash([2, 3]);

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
        this.ctx.setLineDash([]);
    }

    /**
     * Render cross-section preview
     * @param {number} crossWidth - Width dimension (displays as Height)
     * @param {number} crossHeight - Height dimension (displays as Width)
     * @param {string} type - 'oval' or 'rectangular'
     * @param {number} cornerRadius - Corner radius for rectangular type
     */
    render(crossWidth, crossHeight, type = 'oval', cornerRadius = 3) {
        // Clear canvas in the current theme's ink
        this.readColors();
        this.clear();

        // Get cross-section points
        const points = getCrossSectionPoints(crossWidth, crossHeight, 32, type, cornerRadius);

        if (points.length === 0) return;

        // Calculate scale to fit in canvas
        const { width, height } = this;
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

        // Trace the outline once; fill then stroke it
        this.ctx.beginPath();
        points.forEach((p, i) => {
            const tp = transform(p);
            if (i === 0) this.ctx.moveTo(tp.x, tp.y);
            else this.ctx.lineTo(tp.x, tp.y);
        });
        this.ctx.closePath();

        this.ctx.fillStyle = this.colors.fill;
        this.ctx.fill();

        this.ctx.strokeStyle = this.colors.stroke;
        this.ctx.lineWidth = 1.5;
        this.ctx.lineJoin = 'round';
        this.ctx.stroke();

        // Draw dimension labels
        this.drawDimensionLabels(crossWidth, crossHeight, centerX, centerY, scale);
    }

    drawDimensionLabels(width, height, centerX, centerY, scale) {
        // After flip: width (crossSectionWidth) is now vertical, height (crossSectionHeight) is horizontal
        const halfWidth = (height * scale) / 2;  // horizontal extent (crossSectionHeight = "Width" label)
        const halfHeight = (width * scale) / 2;  // vertical extent (crossSectionWidth = "Height" label)

        this.ctx.font = '10px "JetBrains Mono", ui-monospace, monospace';
        this.ctx.fillStyle = this.colors.label;
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
