/**
 * Profile Panel
 * A dimensioned 2D half-section of the selected item with draggable handles
 * that write straight back to the same parameters as the sliders, plus a
 * lineup mode showing every visible item's silhouette on one baseline at
 * true scale (the quickest consistency check across a set).
 */

import { parameterResolver, ITEM_TYPES, ITEM_NAMES, PARAMETER_CONSTRAINTS } from '../state/projectState.js';
import { buildItemCrossSection, calculateGeometryValues } from '../geometry/meshGenerator.js';
import { quantize } from './numericFields.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const MARGIN_PX = 28;

function sectionFor(itemType) {
    const params = parameterResolver.getAllParameters(itemType);
    const geoVals = calculateGeometryValues(params);
    return { params, geoVals, section: buildItemCrossSection(params, geoVals) };
}

function loopPoints(section) {
    return section.chains.flatMap((chain, i) => (i === 0 ? chain.points : chain.points.slice(1)));
}

function pathFor(points, mirror = false) {
    const sign = mirror ? -1 : 1;
    return points.map((p, i) => `${i ? 'L' : 'M'}${(sign * p.x).toFixed(3)} ${(-p.y).toFixed(3)}`).join(' ') + ' Z';
}

const clampTo = (param, value) => {
    const c = PARAMETER_CONSTRAINTS[param];
    return quantize(value, { min: c.min, max: c.max, step: c.step });
};

/**
 * Draggable handles for one item. Each maps a pointer position (mm, y up)
 * to parameter values, using geometry captured when the drag started.
 */
function handlesFor({ params, geoVals, section }) {
    const handles = [];
    const fh = geoVals.footringHeight;
    const wallH = geoVals.h - fh;
    const rb = geoVals.radiusAtWallBottom;
    const wall = section.chains.find(chain => chain.id === 'outer-wall').points;
    const rimOuter = section.rim.outer;

    handles.push({
        id: 'wallAngle', label: 'Wall angle', point: rimOuter,
        edit: (p) => ({ wallAngle: clampTo('wallAngle', Math.atan2(p.x - rb, wallH) * 180 / Math.PI) })
    });

    const start = { x: rb, y: fh };
    const end = { x: geoVals.radius, y: geoVals.h };
    const position = params.wallCurvePosition || 0.5;
    handles.push({
        id: 'wallCurve', label: 'Wall curve', shape: 'diamond',
        point: {
            x: start.x + (end.x - start.x) * position + (params.wallCurveAmount || 0),
            y: start.y + (end.y - start.y) * position
        },
        guide: [start, end],
        edit: (p) => {
            const pos = clampTo('wallCurvePosition', (p.y - start.y) / Math.max(end.y - start.y, 1e-6));
            return {
                wallCurvePosition: pos,
                wallCurveAmount: clampTo('wallCurveAmount', p.x - (start.x + (end.x - start.x) * pos))
            };
        }
    });

    // Thickness handle sits on the inner wall part-way down, clear of the rim
    const inner = section.chains.filter(chain => chain.id.startsWith('inner-')).flatMap(chain => chain.points);
    const thicknessY = fh + geoVals.thickness + (geoVals.h - fh - geoVals.thickness) * 0.6;
    const atY = (points, y) => {
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            if ((y - a.y) * (y - b.y) <= 0 && Math.abs(b.y - a.y) > 1e-9) {
                return a.x + (b.x - a.x) * ((y - a.y) / (b.y - a.y));
            }
        }
        return null;
    };
    const innerX = atY(inner, thicknessY);
    const outerX = atY(wall, thicknessY);
    if (innerX !== null && outerX !== null) {
        const slope = Math.atan2(rimOuter.x - wall[0].x, rimOuter.y - wall[0].y);
        handles.push({
            id: 'wallThickness', label: 'Wall thickness', point: { x: innerX, y: thicknessY },
            lockY: true,
            edit: (p) => ({ wallThickness: clampTo('wallThickness', (outerX - p.x) * Math.cos(slope)) })
        });
    }

    const footTop = geoVals.footringTopRadius;
    handles.push({
        id: 'footringOriginHeight', label: 'Footring height', point: { x: footTop, y: fh },
        edit: (p) => ({ footringOriginHeight: clampTo('footringOriginHeight', p.y) })
    });

    const corner = { x: rb, y: fh };
    const fillet = geoVals.fillet;
    const filletMid = fillet
        ? {
            x: fillet.center.x + Math.cos((-Math.PI / 2 + fillet.endAngle) / 2) * fillet.radius,
            y: fillet.center.y + Math.sin((-Math.PI / 2 + fillet.endAngle) / 2) * fillet.radius
        }
        : corner;
    handles.push({
        id: 'bottomCornerRadius', label: 'Corner radius', point: filletMid, shape: 'square',
        edit: (p) => ({
            bottomCornerRadius: clampTo('bottomCornerRadius', Math.max(0, (corner.x - p.x) + (p.y - corner.y)) / 0.5858)
        })
    });

    if (geoVals.hasFootring && fh > 0) {
        const viewMinX = profileViewMinX(geoVals, section);
        const cavityX = Math.min(Math.max(section.cavityRadius * 0.5, viewMinX + 6), Math.max(section.cavityRadius - 2, 2));
        handles.push({
            id: 'footCavityDepth', label: 'Foot cavity', point: { x: cavityX, y: section.cavityDepth },
            edit: (p) => ({ footCavityDepth: clampTo('footCavityDepth', (p.y / fh) * 100) })
        });
    }

    if (section.inset) {
        const inset = section.inset;
        const midY = (inset.lowerY + inset.upperY) / 2;
        const i = wall.findIndex(q => q.y >= midY);
        const a = wall[Math.max(0, i - 1)];
        const b = wall[Math.max(0, i)];
        const x = a.x + (b.x - a.x) * ((midY - a.y) / Math.max(b.y - a.y, 1e-6));
        handles.push({
            id: 'wallInsetHeight', label: 'Inset height', point: { x, y: midY },
            edit: (p) => ({
                wallInsetHeight: clampTo('wallInsetHeight', ((p.y - inset.wallStartY) / inset.usableHeight) * 100)
            })
        });
    }
    return handles;
}

/**
 * Left edge of the item view: tall items show part of the mirrored half for
 * context; wide, shallow items crop to their outer region so the wall, foot
 * and rim stay large enough to edit.
 */
function profileViewMinX(geoVals, section) {
    const outer = section.rim.outer.x;
    const span = Math.max(geoVals.h * 3, 40);
    return outer > span ? outer - span : -outer * 0.35;
}

export class ProfilePanel {
    /**
     * @param {HTMLElement} container
     * @param {Object} options
     * @param {() => string[]} options.visibleItems
     * @param {(values: Object, options: {interactive: boolean}) => void} options.onEdit
     * @param {(itemType: string) => void} options.onSelect
     */
    constructor(container, { visibleItems, onEdit, onSelect }) {
        this.container = container;
        this.visibleItems = visibleItems;
        this.onEdit = onEdit;
        this.onSelect = onSelect;
        this.itemType = 'plate';
        this.mode = 'item';
        this.drag = null;
        this.build();
    }

    build() {
        this.container.innerHTML = `
            <div class="profile-panel-header">
                <div class="profile-mode" role="group" aria-label="Profile view">
                    <button type="button" class="profile-mode-btn" data-mode="item" aria-pressed="true">Section</button>
                    <button type="button" class="profile-mode-btn" data-mode="lineup" aria-pressed="false">Lineup</button>
                </div>
                <select class="profile-item-select" aria-label="Profiled item">
                    ${ITEM_TYPES.map(item => `<option value="${item}">${ITEM_NAMES[item]}</option>`).join('')}
                </select>
                <button type="button" class="btn-close profile-close" aria-label="Close profile">×</button>
            </div>
            <svg class="profile-svg" role="img" aria-label="Item cross-section"></svg>
            <p class="profile-hint">Drag a handle to edit. Values follow the item's overrides, otherwise the global style.</p>
        `;
        this.svg = this.container.querySelector('.profile-svg');
        this.select = this.container.querySelector('.profile-item-select');
        this.select.addEventListener('change', () => this.onSelect(this.select.value));
        this.container.querySelectorAll('.profile-mode-btn').forEach(button => {
            button.addEventListener('click', () => this.setMode(button.dataset.mode));
        });
        this.container.querySelector('.profile-close').addEventListener('click', () => this.hide());
        this.svg.addEventListener('pointerdown', (event) => this.startDrag(event));
        this.svg.addEventListener('pointermove', (event) => this.moveDrag(event));
        this.svg.addEventListener('pointerup', (event) => this.endDrag(event));
        this.svg.addEventListener('pointercancel', (event) => this.endDrag(event));
        this.svg.addEventListener('click', (event) => {
            const item = event.target.closest?.('[data-item]')?.dataset.item;
            if (item && this.mode === 'lineup') {
                this.onSelect(item);
                this.setMode('item');
            }
        });
        new ResizeObserver(() => this.update()).observe(this.svg);
    }

    get visible() {
        return !this.container.hidden;
    }

    show() {
        this.container.hidden = false;
        this.update();
    }

    hide() {
        this.container.hidden = true;
        this.container.dispatchEvent(new CustomEvent('profile-hidden', { bubbles: true }));
    }

    setMode(mode) {
        this.mode = mode;
        this.container.querySelectorAll('.profile-mode-btn').forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
        });
        this.select.hidden = mode !== 'item';
        this.update();
    }

    setItem(itemType) {
        if (!itemType || !ITEM_TYPES.includes(itemType)) return;
        this.itemType = itemType;
        this.select.value = itemType;
        this.update();
    }

    /**
     * Pixel size of one millimetre for a viewBox fitted into the panel.
     */
    fit(minX, maxX, minY, maxY) {
        const width = Math.max(this.svg.clientWidth, 100);
        const height = Math.max(this.svg.clientHeight, 100);
        const scale = Math.min(
            (width - MARGIN_PX * 2) / Math.max(maxX - minX, 1),
            (height - MARGIN_PX * 2) / Math.max(maxY - minY, 1)
        );
        const viewWidth = width / scale;
        const viewHeight = height / scale;
        const cx = (minX + maxX) / 2;
        const cy = -(minY + maxY) / 2;
        this.svg.setAttribute('viewBox', `${cx - viewWidth / 2} ${cy - viewHeight / 2} ${viewWidth} ${viewHeight}`);
        return 1 / scale; // mm per pixel
    }

    update() {
        if (!this.visible || this.drag) return;
        if (this.mode === 'lineup') this.renderLineup();
        else this.renderItem();
    }

    renderItem() {
        const data = sectionFor(this.itemType);
        const { geoVals, section } = data;
        const points = loopPoints(section);
        const maxR = Math.max(...points.map(p => p.x));
        const minX = profileViewMinX(geoVals, section);
        const mmPerPx = this.fit(minX, maxR + 12, -10, geoVals.h + 8);
        const font = 11 * mmPerPx;
        const handleR = 6 * mmPerPx;
        this.handles = handlesFor(data);

        const dims = [];
        const dimX = maxR + 6 * mmPerPx * 1.5;
        dims.push(`<line class="dim-line" x1="${dimX}" y1="0" x2="${dimX}" y2="${-geoVals.h}"/>`);
        dims.push(`<text class="dim-text" x="${dimX + 4 * mmPerPx}" y="${-geoVals.h / 2}" font-size="${font}">${geoVals.h.toFixed(1)}</text>`);
        dims.push(`<text class="dim-text" x="${section.rim.outer.x - 4 * mmPerPx}" y="${-geoVals.h - 8 * mmPerPx}" font-size="${font}" text-anchor="end">Ø ${(section.rim.outer.x * 2).toFixed(1)}</text>`);
        dims.push(`<text class="dim-text dim-muted" x="${minX + 4 * mmPerPx}" y="${14 * mmPerPx}" font-size="${font}">wall ${geoVals.thickness.toFixed(1)} · foot ${geoVals.footringHeight.toFixed(1)} mm</text>`);

        const handles = this.handles.map((handle, i) => {
            const { x, y } = handle.point;
            const guide = handle.guide
                ? `<polyline class="handle-guide" points="${handle.guide[0].x},${-handle.guide[0].y} ${x},${-y} ${handle.guide[1].x},${-handle.guide[1].y}"/>`
                : '';
            const shape = handle.shape === 'diamond'
                ? `<rect x="${x - handleR * 0.75}" y="${-y - handleR * 0.75}" width="${handleR * 1.5}" height="${handleR * 1.5}" transform="rotate(45 ${x} ${-y})"/>`
                : handle.shape === 'square'
                    ? `<rect x="${x - handleR * 0.8}" y="${-y - handleR * 0.8}" width="${handleR * 1.6}" height="${handleR * 1.6}"/>`
                    : `<circle cx="${x}" cy="${-y}" r="${handleR}"/>`;
            return `${guide}<g class="profile-handle" data-handle="${i}" tabindex="-1"><title>${handle.label}</title>${shape}</g>`;
        }).join('');

        this.svg.setAttribute('aria-label', `${ITEM_NAMES[this.itemType]} cross-section`);
        this.svg.innerHTML = `
            <line class="profile-axis" x1="0" y1="${4}" x2="0" y2="${-geoVals.h - 4}"/>
            <line class="profile-ground" x1="${minX - 20}" y1="0" x2="${maxR + 10}" y2="0"/>
            <path class="profile-mirror" d="${pathFor(points, true)}"/>
            <path class="profile-solid" d="${pathFor(points)}"/>
            ${dims.join('')}
            ${handles}
        `;
    }

    renderLineup() {
        const items = ITEM_TYPES.filter(item => this.visibleItems().includes(item));
        const shapes = items.map(item => {
            const { geoVals, section } = sectionFor(item);
            const points = loopPoints(section);
            return { item, geoVals, points, maxR: Math.max(...points.map(p => p.x)) };
        });
        const gap = 20;
        let x = 0;
        shapes.forEach(shape => {
            shape.cx = x + shape.maxR;
            x += shape.maxR * 2 + gap;
        });
        const totalWidth = Math.max(x - gap, 1);
        const maxH = Math.max(1, ...shapes.map(shape => shape.geoVals.h));
        const mmPerPx = this.fit(0, totalWidth, -16 * (totalWidth / 300), maxH + 4);
        const font = 10 * mmPerPx;
        this.handles = [];
        this.svg.setAttribute('aria-label', 'Silhouettes of the visible items at true scale');
        this.svg.innerHTML = `
            <line class="profile-ground" x1="${-gap}" y1="0" x2="${totalWidth + gap}" y2="0"/>
            ${shapes.map(shape => `
                <g class="lineup-item${shape.item === this.itemType ? ' is-selected' : ''}" data-item="${shape.item}" transform="translate(${shape.cx} 0)">
                    <title>${ITEM_NAMES[shape.item]}</title>
                    <path class="profile-solid" d="${pathFor(shape.points, true)} ${pathFor(shape.points)}"/>
                    <text class="dim-text" x="0" y="${14 * mmPerPx}" font-size="${font}" text-anchor="middle">${ITEM_NAMES[shape.item]}</text>
                    <text class="dim-text dim-muted" x="0" y="${27 * mmPerPx}" font-size="${font}" text-anchor="middle">Ø${(shape.maxR * 2).toFixed(0)} × ${shape.geoVals.h.toFixed(0)}</text>
                </g>`).join('')}
        `;
    }

    toModel(event) {
        const point = this.svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        const local = point.matrixTransform(this.drag.inverse);
        return { x: local.x, y: -local.y };
    }

    startDrag(event) {
        const target = event.target.closest?.('.profile-handle');
        if (!target || event.button !== 0) return;
        event.preventDefault();
        const handle = this.handles[Number(target.dataset.handle)];
        this.drag = { handle, inverse: this.svg.getScreenCTM().inverse(), element: target, last: null };
        target.classList.add('is-dragging');
        this.svg.setPointerCapture(event.pointerId);
    }

    moveDrag(event) {
        if (!this.drag) return;
        const model = this.toModel(event);
        if (this.drag.handle.lockY) model.y = this.drag.handle.point.y;
        const values = this.drag.handle.edit(model);
        const key = JSON.stringify(values);
        if (key === this.drag.last) return;
        this.drag.last = key;
        this.drag.values = values;
        // Keep the handle under the pointer while the view stays frozen
        const p = model;
        this.drag.element.setAttribute('transform', `translate(${p.x - this.drag.handle.point.x} ${-(p.y - this.drag.handle.point.y)})`);
        this.onEdit(values, { interactive: true });
    }

    endDrag(event) {
        if (!this.drag) return;
        const { values } = this.drag;
        this.svg.releasePointerCapture?.(event.pointerId);
        this.drag = null;
        if (values) this.onEdit(values, { interactive: false });
        this.update();
    }
}
