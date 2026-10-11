const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]';

function isEditableTarget(target) {
    return target instanceof Element && Boolean(target.closest(EDITABLE_SELECTOR));
}

function cloneButtons(buttons = {}) {
    return { ...buttons };
}

function defaultMouseButtons(THREE, buttons = {}) {
    return Object.keys(buttons || {}).length ? cloneButtons(buttons) : {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.PAN
    };
}

function defaultTouches(THREE, touches = {}) {
    return Object.keys(touches || {}).length ? cloneButtons(touches) : {
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN
    };
}

export function createOrbitPanMode({
    THREE,
    controls,
    element,
    root = element,
    requestRender = () => {}
}) {
    if (!THREE || !controls || !element) {
        return {
            setPanMode() { return false; },
            togglePanMode() { return false; },
            setSpacePanning() {},
            isPanMode() { return false; },
            onPanModeChange() { return () => {}; },
            dispose() {}
        };
    }

    const normalMouseButtons = defaultMouseButtons(THREE, controls.mouseButtons);
    const normalTouches = defaultTouches(THREE, controls.touches);
    const listeners = new Set();
    let stickyPan = false;
    let spacePan = false;
    let pointerPanning = false;

    function isPanGesture() {
        return stickyPan || spacePan;
    }

    function setCursor() {
        if (pointerPanning) {
            element.style.cursor = 'grabbing';
        } else if (isPanGesture()) {
            element.style.cursor = 'grab';
        } else {
            element.style.cursor = '';
        }
        root?.classList?.toggle('orbit-pan-mode', stickyPan);
        root?.classList?.toggle('orbit-space-pan-mode', spacePan);
        root?.classList?.toggle('orbit-panning', pointerPanning);
    }

    function notify() {
        setCursor();
        const detail = { active: stickyPan, temporary: spacePan };
        listeners.forEach((listener) => listener(detail));
        element.dispatchEvent(new CustomEvent('orbit-pan-mode-change', {
            bubbles: true,
            detail
        }));
    }

    function applyMapping() {
        const active = isPanGesture();
        controls.enablePan = true;
        controls.mouseButtons = active
            ? {
                ...normalMouseButtons,
                LEFT: THREE.MOUSE.PAN,
                MIDDLE: THREE.MOUSE.DOLLY,
                RIGHT: THREE.MOUSE.ROTATE
            }
            : cloneButtons(normalMouseButtons);
        controls.touches = active
            ? {
                ...normalTouches,
                ONE: THREE.TOUCH.PAN,
                TWO: THREE.TOUCH.DOLLY_PAN
            }
            : cloneButtons(normalTouches);
        controls.update?.();
        requestRender({ settle: true });
        notify();
    }

    function setPanMode(active) {
        const next = Boolean(active);
        if (stickyPan === next) {
            notify();
            return stickyPan;
        }
        stickyPan = next;
        applyMapping();
        return stickyPan;
    }

    function setSpacePanning(active) {
        const next = Boolean(active);
        if (spacePan === next) return;
        spacePan = next;
        applyMapping();
    }

    function onKeyDown(event) {
        if (event.code === 'Space' && !event.repeat && !isEditableTarget(event.target)) {
            event.preventDefault();
            setSpacePanning(true);
        } else if (event.key === 'Escape' && stickyPan) {
            setPanMode(false);
        }
    }

    function onKeyUp(event) {
        if (event.code === 'Space') {
            setSpacePanning(false);
        }
    }

    function onBlur() {
        setSpacePanning(false);
        pointerPanning = false;
        setCursor();
    }

    function onPointerDown(event) {
        if (isPanGesture() && event.button === 0) {
            pointerPanning = true;
            setCursor();
        }
    }

    function endPointerPan() {
        if (!pointerPanning) return;
        pointerPanning = false;
        setCursor();
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    element.addEventListener('pointerdown', onPointerDown);
    element.addEventListener('pointerup', endPointerPan);
    element.addEventListener('pointercancel', endPointerPan);
    element.addEventListener('pointerleave', endPointerPan);

    applyMapping();

    return {
        setPanMode,
        togglePanMode() {
            return setPanMode(!stickyPan);
        },
        setSpacePanning,
        isPanMode() {
            return stickyPan;
        },
        onPanModeChange(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        dispose() {
            document.removeEventListener('keydown', onKeyDown);
            document.removeEventListener('keyup', onKeyUp);
            window.removeEventListener('blur', onBlur);
            element.removeEventListener('pointerdown', onPointerDown);
            element.removeEventListener('pointerup', endPointerPan);
            element.removeEventListener('pointercancel', endPointerPan);
            element.removeEventListener('pointerleave', endPointerPan);
            controls.mouseButtons = cloneButtons(normalMouseButtons);
            controls.touches = cloneButtons(normalTouches);
            element.style.cursor = '';
            root?.classList?.remove('orbit-pan-mode', 'orbit-space-pan-mode', 'orbit-panning');
            listeners.clear();
        }
    };
}
