/**
 * Design History
 * Undo/redo over the design-relevant parts of the dinnerware state. Changes
 * are grouped: a step is committed once edits pause, so one slider drag is
 * one undo step.
 */

// Paths that define the design. UI, project metadata and warnings are not
// undoable.
export const DESIGN_KEYS = ['globalParameters', 'itemMultipliers', 'itemOverrides'];
const MAX_STEPS = 100;

function snapshotOf(state) {
    const snapshot = {};
    DESIGN_KEYS.forEach(key => {
        snapshot[key] = JSON.parse(JSON.stringify(state[key] ?? {}));
    });
    return snapshot;
}

function isDesignPath(path) {
    return DESIGN_KEYS.some(key => path === key || path.startsWith(`${key}.`));
}

export class DesignHistory {
    /**
     * @param {import('./projectState.js').StateManager} stateManager
     * @param {Object} [options]
     * @param {number} [options.settleMs] - Idle time that closes a step
     * @param {Function} [options.onApply] - Called after undo/redo restores a snapshot
     * @param {Function} [options.onChange] - Called when undo/redo availability changes
     */
    constructor(stateManager, { settleMs = 400, onApply = () => {}, onChange = () => {} } = {}) {
        this.stateManager = stateManager;
        this.settleMs = settleMs;
        this.onApply = onApply;
        this.onChange = onChange;
        this.undoStack = [];
        this.redoStack = [];
        this.current = snapshotOf(stateManager.state);
        this.timer = null;
        this.applying = false;
        this.held = false;
        this.pendingWhileHeld = false;
        this.unsubscribe = stateManager.subscribeAll((value, oldValue, path) => {
            if (this.applying || path === '*' || !isDesignPath(path)) return;
            this.scheduleCommit();
        });
    }

    scheduleCommit() {
        clearTimeout(this.timer);
        this.timer = null;
        if (this.held) {
            this.pendingWhileHeld = true;
            return;
        }
        this.timer = setTimeout(() => this.commit(), this.settleMs);
    }

    /**
     * Suspend idle commits during a pointer gesture (a slow drag must not be
     * split into several steps); release() resumes them.
     */
    hold() {
        this.held = true;
    }

    release() {
        if (!this.held) return;
        this.held = false;
        if (this.pendingWhileHeld) {
            this.pendingWhileHeld = false;
            this.scheduleCommit();
        }
    }

    /**
     * Close the pending step now (e.g. before undo, or on slider release).
     */
    commit() {
        clearTimeout(this.timer);
        this.timer = null;
        this.pendingWhileHeld = false;
        const next = snapshotOf(this.stateManager.state);
        if (JSON.stringify(next) === JSON.stringify(this.current)) return false;
        this.undoStack.push(this.current);
        if (this.undoStack.length > MAX_STEPS) this.undoStack.shift();
        this.redoStack = [];
        this.current = next;
        this.onChange(this);
        return true;
    }

    /**
     * Forget all steps, e.g. after loading or starting another project.
     */
    reset() {
        clearTimeout(this.timer);
        this.timer = null;
        this.undoStack = [];
        this.redoStack = [];
        this.current = snapshotOf(this.stateManager.state);
        this.onChange(this);
    }

    canUndo() {
        return this.undoStack.length > 0 || this.timer !== null || this.pendingWhileHeld;
    }

    canRedo() {
        return this.redoStack.length > 0;
    }

    undo() {
        this.commit();
        if (!this.undoStack.length) return false;
        this.redoStack.push(this.current);
        this.apply(this.undoStack.pop());
        return true;
    }

    redo() {
        this.commit();
        if (!this.redoStack.length) return false;
        this.undoStack.push(this.current);
        this.apply(this.redoStack.pop());
        return true;
    }

    apply(snapshot) {
        this.applying = true;
        try {
            const updates = {};
            DESIGN_KEYS.forEach(key => {
                updates[key] = JSON.parse(JSON.stringify(snapshot[key]));
            });
            this.stateManager.batchUpdate(updates);
        } finally {
            this.applying = false;
        }
        this.current = snapshot;
        this.onApply(snapshot);
        this.onChange(this);
    }

    dispose() {
        clearTimeout(this.timer);
        this.unsubscribe?.();
    }
}
