/**
 * Vessel Designer V2 - SVG Profile Editor
 */

import vesselV2State from '../state/vesselV2State.js';
import { sampleVesselV2Profile, validateVesselV2Profile } from '../geometry/profileSampler.js';
import { isMotifActive } from '../../geometry/surfacePatternOptions.js';

const MOTIF_FAMILY_COLOR = {
    vertical: '#5bd6a0',
    horizontal: '#4f8cff',
    diagonal: '#c78bff',
    crosshatch: '#f0a24e',
    knurl: '#ff6b8b'
};
const FLAT_SEGMENT_EPSILON = 1e-6;

const HANDLE_RADIUS = 2.4;
const HANDLE_HIT_RADIUS = 7;
const ANCHOR_RADIUS = 3;
const ANCHOR_HIT_RADIUS = 8;
const DRAG_THRESHOLD = 3;
const INSERT_T_MIN = 0.04;
const INSERT_T_MAX = 0.96;
const SEGMENT_SAMPLE_COUNT = 72;
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 1.25;

function pointDistance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function escapeAttr(value) {
    return String(value).replace(/"/g, '&quot;');
}

function createPointId() {
    return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

function anchorToPoint(anchor) {
    return { r: Number(anchor.r) || 0, h: Number(anchor.h) || 0 };
}

function addHandle(anchor, handle) {
    return {
        r: anchor.r + (handle?.r || 0),
        h: anchor.h + (handle?.h || 0)
    };
}

function cubicAt(t, p0, p1, p2, p3) {
    const mt = 1 - t;
    const mt2 = mt * mt;
    const mt3 = mt2 * mt;
    const t2 = t * t;
    const t3 = t2 * t;

    return {
        r: mt3 * p0.r + 3 * mt2 * t * p1.r + 3 * mt * t2 * p2.r + t3 * p3.r,
        h: mt3 * p0.h + 3 * mt2 * t * p1.h + 3 * mt * t2 * p2.h + t3 * p3.h
    };
}

function lerpPoint(a, b, t) {
    return {
        r: a.r + (b.r - a.r) * t,
        h: a.h + (b.h - a.h) * t
    };
}

function segmentControls(start, end) {
    const p0 = anchorToPoint(start);
    const p3 = anchorToPoint(end);
    const dr = p3.r - p0.r;
    const dh = p3.h - p0.h;

    return {
        p0,
        p1: start.outHandle ? addHandle(p0, start.outHandle) : { r: p0.r + dr / 3, h: p0.h + dh / 3 },
        p2: end.inHandle ? addHandle(p3, end.inHandle) : { r: p0.r + (dr * 2) / 3, h: p0.h + (dh * 2) / 3 },
        p3
    };
}

function splitCubicControls(controls, t) {
    const p01 = lerpPoint(controls.p0, controls.p1, t);
    const p12 = lerpPoint(controls.p1, controls.p2, t);
    const p23 = lerpPoint(controls.p2, controls.p3, t);
    const p012 = lerpPoint(p01, p12, t);
    const p123 = lerpPoint(p12, p23, t);
    const mid = lerpPoint(p012, p123, t);

    return { p01, p012, mid, p123, p23 };
}

function clonePoint(point) {
    return {
        ...point,
        inHandle: point.inHandle ? { ...point.inHandle } : null,
        outHandle: point.outHandle ? { ...point.outHandle } : null,
        cornerRadius: Math.max(0, Number(point.cornerRadius) || 0),
        motif: point.motif ? { ...point.motif } : point.motif
    };
}

export class ProfileEditor {
    constructor(container) {
        this.container = container;
        this.svg = container.querySelector('#profileSvg');
        this.warningList = container.querySelector('#profileWarnings');
        this.zoomDisplay = container.querySelector('#profileZoomValue');
        this.zoomInButton = container.querySelector('#btnProfileZoomIn');
        this.zoomOutButton = container.querySelector('#btnProfileZoomOut');
        this.fitButton = container.querySelector('#btnProfileFit');
        this.panButton = container.querySelector('#btnProfilePan');
        this.pointerState = null;
        this.view = {
            zoom: MIN_ZOOM,
            offsetX: 0,
            offsetY: 0
        };
        this.panMode = false;
        this.spacePanning = false;
        this.unsubscribe = vesselV2State.subscribe('*', () => this.render());
        this.bindEvents();
        this.render();
    }

    bindEvents() {
        this.svg.addEventListener('pointerdown', (event) => this.onPointerDown(event));
        this.svg.addEventListener('pointermove', (event) => this.onPointerMove(event));
        this.svg.addEventListener('pointerup', (event) => this.onPointerUp(event));
        this.svg.addEventListener('pointercancel', (event) => this.onPointerUp(event));
    }

    getBaseSize(bounds = this.getBounds()) {
        return {
            width: bounds.marginLeft + bounds.maxRadius + bounds.marginRight,
            height: bounds.marginTop + bounds.maxHeight + bounds.marginBottom
        };
    }

    clampZoom(zoom) {
        return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(zoom) || MIN_ZOOM));
    }

    clampView(baseSize = this.getBaseSize()) {
        this.view.zoom = this.clampZoom(this.view.zoom);

        const viewWidth = baseSize.width / this.view.zoom;
        const viewHeight = baseSize.height / this.view.zoom;
        const maxOffsetX = Math.max(0, baseSize.width - viewWidth);
        const maxOffsetY = Math.max(0, baseSize.height - viewHeight);

        if (this.view.zoom <= MIN_ZOOM + 1e-6) {
            this.view.offsetX = 0;
            this.view.offsetY = 0;
        } else {
            this.view.offsetX = Math.max(0, Math.min(maxOffsetX, this.view.offsetX));
            this.view.offsetY = Math.max(0, Math.min(maxOffsetY, this.view.offsetY));
        }

        return this.view;
    }

    getViewBox() {
        const baseSize = this.getBaseSize();
        this.clampView(baseSize);

        return {
            x: this.view.offsetX,
            y: this.view.offsetY,
            width: baseSize.width / this.view.zoom,
            height: baseSize.height / this.view.zoom,
            baseWidth: baseSize.width,
            baseHeight: baseSize.height
        };
    }

    getZoomPercent() {
        return Math.round(this.view.zoom * 100);
    }

    getInteractiveScale() {
        this.clampView();
        return 1 / this.view.zoom;
    }

    getSelectedSvgPoint() {
        const selectedId = vesselV2State.getState('ui.selectedPointId');
        if (!selectedId) return null;

        const selected = vesselV2State.getState('profile.points')
            .find((point) => point.id === selectedId);
        return selected ? this.worldToSvg(selected) : null;
    }

    getZoomAnchor(viewBox = this.getViewBox()) {
        return this.getSelectedSvgPoint() || {
            x: viewBox.x + viewBox.width / 2,
            y: viewBox.y + viewBox.height / 2
        };
    }

    zoomBy(factor) {
        const before = this.getViewBox();
        const baseSize = { width: before.baseWidth, height: before.baseHeight };
        const nextZoom = this.clampZoom(this.view.zoom * factor);
        if (Math.abs(nextZoom - this.view.zoom) < 1e-6) {
            this.updateViewControls();
            return;
        }

        const anchor = this.getZoomAnchor(before);
        const relativeX = before.width > 0 ? (anchor.x - before.x) / before.width : 0.5;
        const relativeY = before.height > 0 ? (anchor.y - before.y) / before.height : 0.5;
        const nextWidth = baseSize.width / nextZoom;
        const nextHeight = baseSize.height / nextZoom;

        this.view.zoom = nextZoom;
        this.view.offsetX = anchor.x - nextWidth * relativeX;
        this.view.offsetY = anchor.y - nextHeight * relativeY;
        this.clampView(baseSize);
        this.render();
    }

    zoomIn() {
        this.zoomBy(ZOOM_STEP);
    }

    zoomOut() {
        this.zoomBy(1 / ZOOM_STEP);
    }

    fitView() {
        this.view.zoom = MIN_ZOOM;
        this.view.offsetX = 0;
        this.view.offsetY = 0;
        this.render();
    }

    setPanMode(active) {
        this.panMode = Boolean(active);
        this.updateViewControls();
        this.container.dispatchEvent(new CustomEvent('profile-pan-mode-change', {
            bubbles: true,
            detail: { active: this.panMode }
        }));
    }

    togglePanMode() {
        this.setPanMode(!this.panMode);
        return this.panMode;
    }

    isPanMode() {
        return this.panMode;
    }

    setSpacePanning(active) {
        this.spacePanning = Boolean(active);
        this.updateViewControls();
    }

    isPanGesture() {
        return this.panMode || this.spacePanning;
    }

    updateViewControls() {
        const zoomPercent = this.getZoomPercent();
        if (this.zoomDisplay) this.zoomDisplay.textContent = `${zoomPercent}%`;
        if (this.zoomInButton) this.zoomInButton.disabled = this.view.zoom >= MAX_ZOOM - 1e-6;
        if (this.zoomOutButton) this.zoomOutButton.disabled = this.view.zoom <= MIN_ZOOM + 1e-6;
        if (this.fitButton) this.fitButton.disabled = this.view.zoom <= MIN_ZOOM + 1e-6;
        if (this.panButton) this.panButton.classList.toggle('active', this.panMode);
        this.svg.classList.toggle('pan-mode', this.panMode);
        this.svg.classList.toggle('space-pan-mode', this.spacePanning);
        this.svg.classList.toggle('panning', this.pointerState?.type === 'pan');
    }

    startPan(event) {
        const viewBox = this.getViewBox();
        const rect = this.svg.getBoundingClientRect();
        const scale = Math.min(rect.width / viewBox.width, rect.height / viewBox.height) || 1;

        this.pointerState = {
            type: 'pan',
            startClient: { x: event.clientX, y: event.clientY },
            startView: { offsetX: this.view.offsetX, offsetY: this.view.offsetY },
            startScale: scale,
            moved: false
        };
        this.svg.setPointerCapture(event.pointerId);
        this.updateViewControls();
    }

    updatePan(event) {
        const { startClient, startView, startScale } = this.pointerState;
        const dx = (event.clientX - startClient.x) / startScale;
        const dy = (event.clientY - startClient.y) / startScale;

        this.pointerState.moved = true;
        this.view.offsetX = startView.offsetX - dx;
        this.view.offsetY = startView.offsetY - dy;
        this.clampView();
        this.render();
    }

    getBounds() {
        const state = vesselV2State.getState();
        return {
            maxRadius: state.global.maxRadius,
            maxHeight: state.global.maxHeight,
            marginLeft: 22,
            marginTop: 12,
            marginRight: 28,
            marginBottom: 24
        };
    }

    worldToSvg(point) {
        const bounds = this.getBounds();
        return {
            x: bounds.marginLeft + point.r,
            y: bounds.marginTop + bounds.maxHeight - point.h
        };
    }

    rawSvgToWorld(event) {
        const point = this.svg.createSVGPoint();
        point.x = event.clientX;
        point.y = event.clientY;
        const local = point.matrixTransform(this.svg.getScreenCTM().inverse());
        const bounds = this.getBounds();
        return {
            r: local.x - bounds.marginLeft,
            h: bounds.maxHeight - (local.y - bounds.marginTop)
        };
    }

    svgToWorld(event, options = {}) {
        const world = this.rawSvgToWorld(event);
        if (options.clamp === false) return world;
        if (Number.isInteger(options.pointIndex)) {
            return this.clampWorldPoint(world, options.pointIndex);
        }
        return this.clampWorldPoint(world);
    }

    clampWorldPoint(point, pointIndex = null) {
        const state = vesselV2State.getState();
        const bounds = this.getBounds();
        const points = state.profile.points;
        const allowFooterOverlap = state.profile.allowFooterOverlap === true;

        let minH = 0;
        let maxH = bounds.maxHeight;
        if (pointIndex === 0 && allowFooterOverlap) {
            return this.snapWorldPoint({
                r: 0,
                h: Math.max(0, Math.min(bounds.maxHeight, point.h))
            });
        }

        if (!allowFooterOverlap && Number.isInteger(pointIndex)) {
            if (pointIndex > 0) minH = points[pointIndex - 1].h;
            if (pointIndex < points.length - 1) maxH = points[pointIndex + 1].h;
        } else if (!allowFooterOverlap && points.length > 0) {
            minH = points[points.length - 1].h;
        }

        let r = Math.max(0, Math.min(bounds.maxRadius, point.r));
        let h = Math.max(minH, Math.min(maxH, point.h));

        return this.snapWorldPoint({ r, h }, { minH, maxH, maxRadius: bounds.maxRadius });
    }

    snapWorldPoint(point, limits = {}) {
        const state = vesselV2State.getState();
        const maxRadius = limits.maxRadius ?? this.getBounds().maxRadius;
        const minH = limits.minH ?? 0;
        const maxH = limits.maxH ?? this.getBounds().maxHeight;
        let r = point.r;
        let h = point.h;

        if (state.global.snapEnabled) {
            const snap = state.global.snapSize || 5;
            r = Math.round(r / snap) * snap;
            h = Math.round(h / snap) * snap;
        }

        return {
            r: Math.max(0, Math.min(maxRadius, r)),
            h: Math.max(minH, Math.min(maxH, h))
        };
    }

    clampHandleWorldPoint(point, pointIndex, handleType) {
        const state = vesselV2State.getState();
        const bounds = this.getBounds();
        const points = state.profile.points;
        const anchor = points[pointIndex];
        const allowFooterOverlap = state.profile.allowFooterOverlap === true;
        if (!anchor) return this.clampWorldPoint(point);

        let minH = 0;
        let maxH = bounds.maxHeight;
        if (allowFooterOverlap) {
            minH = 0;
            maxH = bounds.maxHeight;
        } else if (handleType === 'inHandle') {
            minH = points[pointIndex - 1]?.h ?? anchor.h;
            maxH = anchor.h;
        } else if (handleType === 'outHandle') {
            minH = anchor.h;
            maxH = points[pointIndex + 1]?.h ?? bounds.maxHeight;
        }

        let r = Math.max(0, Math.min(bounds.maxRadius, point.r));
        let h = Math.max(minH, Math.min(maxH, point.h));

        return this.snapWorldPoint({ r, h }, { minH, maxH, maxRadius: bounds.maxRadius });
    }

    getPointIndex(id) {
        return vesselV2State.getState('profile.points').findIndex((point) => point.id === id);
    }

    isFlatSegment(prev, current) {
        return !!prev && Math.abs((current.h || 0) - (prev.h || 0)) < FLAT_SEGMENT_EPSILON;
    }

    /**
     * Select the segment ending at points[index] for motif editing. Flat (base)
     * segments carry no motif and are not selectable.
     */
    selectSegmentByIndex(index) {
        const points = vesselV2State.getState('profile.points');
        const current = points[index];
        if (!current) return;
        const prev = points[index - 1];

        if (this.isFlatSegment(prev, current)) {
            vesselV2State.setState('ui.selectedSegmentId', null, { history: false });
            return;
        }

        vesselV2State.setState('ui.selectedPointId', null, { history: false });
        vesselV2State.setState('ui.selectedHandle', null, { history: false });
        vesselV2State.setState('ui.selectedSegmentId', current.id, { history: false });
    }

    updatePoint(pointId, updater, options = {}) {
        const points = vesselV2State.getState('profile.points').map(clonePoint);
        const index = points.findIndex((point) => point.id === pointId);
        if (index < 0) return;
        points[index] = updater(points[index], index, points);
        vesselV2State.setProfilePoints(points, options);
    }

    isBezierMode() {
        return vesselV2State.getState('profile.mode') !== 'straight-rounded';
    }

    closestSegmentT(start, end, target, useHandles = true) {
        const curved = useHandles && Boolean(start.outHandle || end.inHandle);
        const controls = segmentControls(start, end);

        if (!curved) {
            const p0 = controls.p0;
            const p1 = controls.p3;
            const dr = p1.r - p0.r;
            const dh = p1.h - p0.h;
            const lengthSq = dr * dr + dh * dh;
            if (lengthSq <= 1e-6) return 0.5;
            const t = ((target.r - p0.r) * dr + (target.h - p0.h) * dh) / lengthSq;
            return Math.max(INSERT_T_MIN, Math.min(INSERT_T_MAX, t));
        }

        let bestT = 0.5;
        let bestDistance = Infinity;
        for (let i = 0; i <= SEGMENT_SAMPLE_COUNT; i++) {
            const t = i / SEGMENT_SAMPLE_COUNT;
            const point = cubicAt(t, controls.p0, controls.p1, controls.p2, controls.p3);
            const distance = (point.r - target.r) ** 2 + (point.h - target.h) ** 2;
            if (distance < bestDistance) {
                bestDistance = distance;
                bestT = t;
            }
        }

        return Math.max(INSERT_T_MIN, Math.min(INSERT_T_MAX, bestT));
    }

    insertPointOnSegment(segmentIndex, event) {
        const points = vesselV2State.getState('profile.points').map(clonePoint);
        if (segmentIndex <= 0 || segmentIndex >= points.length) return;

        const start = points[segmentIndex - 1];
        const end = points[segmentIndex];
        const target = this.rawSvgToWorld(event);
        const useHandles = this.isBezierMode();
        const t = this.closestSegmentT(start, end, target, useHandles);
        const controls = segmentControls(start, end);
        const curved = useHandles && Boolean(start.outHandle || end.inHandle);
        const split = splitCubicControls(controls, t);
        const exactPoint = curved ? split.mid : lerpPoint(controls.p0, controls.p3, t);
        const insertedPoint = {
            id: createPointId(),
            ...this.clampWorldPoint(exactPoint, segmentIndex),
            inHandle: null,
            outHandle: null,
            kind: curved ? 'smooth' : 'corner',
            cornerRadius: 0
        };

        if (curved) {
            start.outHandle = {
                r: split.p01.r - start.r,
                h: split.p01.h - start.h
            };
            insertedPoint.inHandle = {
                r: split.p012.r - insertedPoint.r,
                h: split.p012.h - insertedPoint.h
            };
            insertedPoint.outHandle = {
                r: split.p123.r - insertedPoint.r,
                h: split.p123.h - insertedPoint.h
            };
            end.inHandle = {
                r: split.p23.r - end.r,
                h: split.p23.h - end.h
            };
        }

        const nextPoints = [
            ...points.slice(0, segmentIndex),
            insertedPoint,
            ...points.slice(segmentIndex)
        ];

        vesselV2State.setProfilePoints(nextPoints);
        vesselV2State.setState('ui.selectedPointId', insertedPoint.id, { history: false });
        vesselV2State.setState('ui.selectedHandle', null, { history: false });
    }

    onPointerDown(event) {
        if (event.button !== 0) return;
        const target = event.target;
        const anchorId = target.dataset.anchorId;
        const handleId = target.dataset.handleId;
        const handleType = target.dataset.handleType;
        const segmentIndex = Number(target.dataset.segmentIndex);
        const tool = vesselV2State.getState('ui.tool');
        const bezierMode = this.isBezierMode();

        if (this.isPanGesture()) {
            event.preventDefault();
            this.startPan(event);
            return;
        }

        if (anchorId) {
            const index = this.getPointIndex(anchorId);
            vesselV2State.setState('ui.selectedPointId', anchorId, { history: false });
            vesselV2State.setState('ui.selectedHandle', null, { history: false });
            vesselV2State.setState('ui.selectedSegmentId', null, { history: false });
            this.pointerState = {
                type: 'anchor',
                pointId: anchorId,
                index,
                startWorld: this.svgToWorld(event, { pointIndex: index }),
                moved: false
            };
            this.svg.setPointerCapture(event.pointerId);
            return;
        }

        if (bezierMode && handleId && handleType) {
            vesselV2State.setState('ui.selectedPointId', handleId, { history: false });
            vesselV2State.setState('ui.selectedHandle', handleType, { history: false });
            this.pointerState = {
                type: 'handle',
                pointId: handleId,
                handleType,
                startWorld: this.rawSvgToWorld(event),
                moved: false
            };
            this.svg.setPointerCapture(event.pointerId);
            return;
        }

        if (Number.isInteger(segmentIndex)) {
            if (tool === 'edit') {
                this.selectSegmentByIndex(segmentIndex);
                return;
            }
            if (tool === 'pen') {
                this.insertPointOnSegment(segmentIndex, event);
                return;
            }
        }

        if (tool !== 'pen') {
            vesselV2State.setState('ui.selectedPointId', null, { history: false });
            vesselV2State.setState('ui.selectedHandle', null, { history: false });
            vesselV2State.setState('ui.selectedSegmentId', null, { history: false });
            return;
        }

        const world = this.rawSvgToWorld(event);
        const points = vesselV2State.getState('profile.points');
        const clamped = this.clampWorldPoint(world);
        const id = createPointId();
        const nextPoints = [
            ...points,
            {
                id,
                r: clamped.r,
                h: clamped.h,
                inHandle: null,
                outHandle: null,
                kind: 'corner',
                cornerRadius: 0
            }
        ];

        vesselV2State.setProfilePoints(nextPoints, { history: false });
        vesselV2State.setState('ui.selectedPointId', id, { history: false });
        vesselV2State.setState('ui.selectedHandle', null, { history: false });
        this.pointerState = {
            type: 'new',
            pointId: id,
            index: nextPoints.length - 1,
            startWorld: clamped,
            startClient: { x: event.clientX, y: event.clientY },
            moved: false
        };
        this.svg.setPointerCapture(event.pointerId);
    }

    onPointerMove(event) {
        if (!this.pointerState) return;

        if (this.pointerState.type === 'pan') {
            this.updatePan(event);
            return;
        }

        const world = this.rawSvgToWorld(event);

        if (this.pointerState.type === 'anchor') {
            const { pointId, index } = this.pointerState;
            if (index === 0 && vesselV2State.getState('profile.allowFooterOverlap') !== true) return;
            this.pointerState.moved = true;
            const clamped = this.clampWorldPoint(world, index);
            this.updatePoint(pointId, (point) => ({ ...point, ...clamped }), { history: false });
            return;
        }

        if (this.pointerState.type === 'handle') {
            if (!this.isBezierMode()) return;
            const { pointId, handleType } = this.pointerState;
            const index = this.getPointIndex(pointId);
            this.pointerState.moved = true;
            this.updatePoint(pointId, (point) => {
                const clamped = this.clampHandleWorldPoint(world, index, handleType);
                const handle = {
                    r: clamped.r - point.r,
                    h: clamped.h - point.h
                };
                return {
                    ...point,
                    kind: 'smooth',
                    [handleType]: handle
                };
            }, { history: false });
            return;
        }

        if (this.pointerState.type === 'new') {
            if (!this.isBezierMode()) return;
            const moved = pointDistance(this.pointerState.startClient, {
                x: event.clientX,
                y: event.clientY
            }) > DRAG_THRESHOLD;

            if (!moved) return;
            this.pointerState.moved = true;
            const { pointId, startWorld } = this.pointerState;

            this.updatePoint(pointId, (point, index) => {
                const inWorld = this.clampHandleWorldPoint({
                    r: startWorld.r - (world.r - startWorld.r),
                    h: startWorld.h - (world.h - startWorld.h)
                }, index, 'inHandle');
                const outWorld = this.clampHandleWorldPoint(world, index, 'outHandle');

                return {
                    ...point,
                    kind: 'smooth',
                    inHandle: { r: inWorld.r - point.r, h: inWorld.h - point.h },
                    outHandle: { r: outWorld.r - point.r, h: outWorld.h - point.h }
                };
            }, { history: false });
        }
    }

    onPointerUp(event) {
        if (!this.pointerState) return;
        const wasPan = this.pointerState.type === 'pan';
        this.pointerState = null;
        if (this.svg.hasPointerCapture(event.pointerId)) {
            this.svg.releasePointerCapture(event.pointerId);
        }
        if (wasPan) {
            this.updateViewControls();
            return;
        }

        vesselV2State.commitHistory();
    }

    deleteSelectedPoint() {
        const selectedId = vesselV2State.getState('ui.selectedPointId');
        if (!selectedId) return;
        const points = vesselV2State.getState('profile.points');
        const selected = points.find((point) => point.id === selectedId);
        if (!selected || selected.locked) return;
        vesselV2State.setProfilePoints(points.filter((point) => point.id !== selectedId));
        vesselV2State.setState('ui.selectedPointId', null, { history: false });
        vesselV2State.setState('ui.selectedHandle', null, { history: false });
    }

    renderGrid() {
        const state = vesselV2State.getState();
        const bounds = this.getBounds();
        const lines = [];
        const maxX = bounds.marginLeft + bounds.maxRadius;
        const maxY = bounds.marginTop + bounds.maxHeight;
        const gridSize = Math.max(1, Math.min(50, Number(state.global.snapSize) || 5));
        const majorEvery = Math.max(1, Math.round(10 / gridSize));

        for (let r = 0; r <= bounds.maxRadius + 1e-6; r += gridSize) {
            const x = bounds.marginLeft + r;
            const major = Math.round(r / gridSize) % majorEvery === 0;
            lines.push(`<line class="profile-grid-line${major ? ' major' : ''}" x1="${x}" y1="${bounds.marginTop}" x2="${x}" y2="${maxY}"></line>`);
        }

        for (let h = 0; h <= bounds.maxHeight + 1e-6; h += gridSize) {
            const y = bounds.marginTop + bounds.maxHeight - h;
            const major = Math.round(h / gridSize) % majorEvery === 0;
            lines.push(`<line class="profile-grid-line${major ? ' major' : ''}" x1="${bounds.marginLeft}" y1="${y}" x2="${maxX}" y2="${y}"></line>`);
        }

        lines.push(`<line class="profile-centerline" x1="${bounds.marginLeft}" y1="${bounds.marginTop}" x2="${bounds.marginLeft}" y2="${maxY}"></line>`);
        lines.push(`<line class="profile-baseline" x1="${bounds.marginLeft}" y1="${maxY}" x2="${maxX}" y2="${maxY}"></line>`);
        return lines.join('');
    }

    renderSegmentHitPaths(points) {
        if (points.length < 2) return '';

        const paths = [];
        const useHandles = this.isBezierMode();
        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1];
            const current = points[i];
            const start = this.worldToSvg(prev);
            const end = this.worldToSvg(current);
            let d = `M ${start.x} ${start.y}`;

            if (useHandles && (prev.outHandle || current.inHandle)) {
                const controls = segmentControls(prev, current);
                const p1 = this.worldToSvg(controls.p1);
                const p2 = this.worldToSvg(controls.p2);
                d += ` C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${end.x} ${end.y}`;
            } else {
                d += ` L ${end.x} ${end.y}`;
            }

            paths.push(`<path class="profile-segment-hit" d="${d}" data-segment-index="${i}"></path>`);
        }

        return paths.join('');
    }

    segmentPathD(prev, current, useHandles) {
        const start = this.worldToSvg(prev);
        const end = this.worldToSvg(current);
        if (useHandles && (prev.outHandle || current.inHandle)) {
            const controls = segmentControls(prev, current);
            const p1 = this.worldToSvg(controls.p1);
            const p2 = this.worldToSvg(controls.p2);
            return `M ${start.x} ${start.y} C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${end.x} ${end.y}`;
        }
        return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
    }

    /**
     * Highlight for the selected segment plus a family-colored badge on every
     * segment that carries an active motif.
     */
    renderSegmentDecor(points, state) {
        if (points.length < 2) return '';
        const useHandles = this.isBezierMode();
        const selectedSegmentId = state.ui.selectedSegmentId;
        const uiScale = this.getInteractiveScale();
        const parts = [];

        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1];
            const current = points[i];
            if (this.isFlatSegment(prev, current)) continue;

            const d = this.segmentPathD(prev, current, useHandles);

            if (current.id === selectedSegmentId) {
                parts.push(`<path class="profile-segment-selected" d="${d}"></path>`);
            }

            if (isMotifActive(current.motif)) {
                const start = this.worldToSvg(prev);
                const end = this.worldToSvg(current);
                const cx = (start.x + end.x) / 2;
                const cy = (start.y + end.y) / 2;
                const color = MOTIF_FAMILY_COLOR[current.motif.type] || '#8a90a0';
                parts.push(`<circle class="profile-motif-badge" cx="${cx}" cy="${cy}" r="${3.4 * uiScale}" fill="${color}" data-segment-index="${i}"></circle>`);
            }
        }

        return parts.join('');
    }

    renderProfilePath(points, state) {
        if (points.length < 2) return '';

        if (state.profile.mode === 'straight-rounded') {
            const { profile } = sampleVesselV2Profile(state, { samplesPerCorner: 18 });
            if (profile.length < 2) return '';
            const d = profile.map((point, index) => {
                const svgPoint = this.worldToSvg(point);
                return `${index === 0 ? 'M' : 'L'} ${svgPoint.x} ${svgPoint.y}`;
            }).join(' ');
            return `<path class="profile-path" d="${d}"></path>`;
        }

        const commands = [];
        const start = this.worldToSvg(points[0]);
        commands.push(`M ${start.x} ${start.y}`);

        for (let i = 1; i < points.length; i++) {
            const prev = points[i - 1];
            const current = points[i];
            const currentSvg = this.worldToSvg(current);

            if (prev.outHandle || current.inHandle) {
                const p1 = this.worldToSvg({
                    r: prev.r + (prev.outHandle?.r || (current.r - prev.r) / 3),
                    h: prev.h + (prev.outHandle?.h || (current.h - prev.h) / 3)
                });
                const p2 = this.worldToSvg({
                    r: current.r + (current.inHandle?.r || (prev.r - current.r) / 3),
                    h: current.h + (current.inHandle?.h || (prev.h - current.h) / 3)
                });
                commands.push(`C ${p1.x} ${p1.y} ${p2.x} ${p2.y} ${currentSvg.x} ${currentSvg.y}`);
            } else {
                commands.push(`L ${currentSvg.x} ${currentSvg.y}`);
            }
        }

        return `<path class="profile-path" d="${commands.join(' ')}"></path>`;
    }

    renderSampledPath(state) {
        if (state.profile.mode === 'straight-rounded') return '';
        const { profile } = sampleVesselV2Profile(state, { samplesPerSegment: 12 });
        if (profile.length < 2) return '';
        const d = profile.map((point, index) => {
            const svgPoint = this.worldToSvg(point);
            return `${index === 0 ? 'M' : 'L'} ${svgPoint.x} ${svgPoint.y}`;
        }).join(' ');
        return `<path class="profile-sampled-path" d="${d}"></path>`;
    }

    renderHandles(points, selectedPointId) {
        if (!this.isBezierMode()) return '';

        const parts = [];
        const uiScale = this.getInteractiveScale();
        points.forEach((point) => {
            if (point.id !== selectedPointId) return;
            const anchor = this.worldToSvg(point);
            ['inHandle', 'outHandle'].forEach((handleType) => {
                const handle = point[handleType];
                if (!handle) return;
                const handlePoint = this.worldToSvg({
                    r: point.r + handle.r,
                    h: point.h + handle.h
                });
                parts.push(`<line class="profile-handle-line" x1="${anchor.x}" y1="${anchor.y}" x2="${handlePoint.x}" y2="${handlePoint.y}"></line>`);
                parts.push(`<circle class="profile-handle-hit" cx="${handlePoint.x}" cy="${handlePoint.y}" r="${HANDLE_HIT_RADIUS * uiScale}" data-handle-id="${escapeAttr(point.id)}" data-handle-type="${handleType}"></circle>`);
                parts.push(`<circle class="profile-handle" cx="${handlePoint.x}" cy="${handlePoint.y}" r="${HANDLE_RADIUS * uiScale}" data-handle-id="${escapeAttr(point.id)}" data-handle-type="${handleType}"></circle>`);
            });
        });
        return parts.join('');
    }

    renderAnchorHitTargets(points) {
        const uiScale = this.getInteractiveScale();
        return points.map((point) => {
            const svgPoint = this.worldToSvg(point);
            return `<circle class="profile-anchor-hit" cx="${svgPoint.x}" cy="${svgPoint.y}" r="${ANCHOR_HIT_RADIUS * uiScale}" data-anchor-id="${escapeAttr(point.id)}"></circle>`;
        }).join('');
    }

    renderAnchors(points, selectedPointId) {
        const uiScale = this.getInteractiveScale();
        return points.map((point) => {
            const svgPoint = this.worldToSvg(point);
            const classes = [
                'profile-anchor',
                point.locked ? 'locked' : '',
                point.id === selectedPointId ? 'selected' : ''
            ].filter(Boolean).join(' ');

            return `<circle class="${classes}" cx="${svgPoint.x}" cy="${svgPoint.y}" r="${ANCHOR_RADIUS * uiScale}" data-anchor-id="${escapeAttr(point.id)}"></circle>`;
        }).join('');
    }

    renderWarnings(state) {
        const validation = validateVesselV2Profile(state);
        const messages = [...validation.errors, ...validation.warnings];
        vesselV2State.setState('warnings', messages, { silent: true, history: false });

        if (!this.warningList) return;
        this.warningList.innerHTML = messages.length
            ? messages.map((message) => `<div class="profile-warning">${message}</div>`).join('')
            : '<div class="profile-warning muted">Profile ready</div>';
    }

    render() {
        const state = vesselV2State.getState();
        const points = state.profile.points;
        const selectedPointId = state.ui.selectedPointId;
        const viewBox = this.getViewBox();

        this.svg.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
        this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        this.svg.innerHTML = [
            this.renderGrid(),
            this.renderSampledPath(state),
            this.renderProfilePath(points, state),
            this.renderSegmentDecor(points, state),
            this.renderSegmentHitPaths(points),
            this.renderHandles(points, selectedPointId),
            this.renderAnchorHitTargets(points),
            this.renderAnchors(points, selectedPointId)
        ].join('');

        this.renderWarnings(state);
        this.updateViewControls();
    }

    dispose() {
        this.unsubscribe?.();
    }
}

export default ProfileEditor;
