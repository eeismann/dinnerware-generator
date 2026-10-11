/**
 * Small on-demand render scheduler for Three.js viewports.
 * It renders one frame when requested, and optionally keeps ticking while
 * OrbitControls damping or camera tweens are settling.
 */
export class RenderScheduler {
    constructor({ controls, render, updateOverlay = null, maxDampingFrames = 45 } = {}) {
        this.controls = controls;
        this.render = render;
        this.updateOverlay = updateOverlay;
        this.maxDampingFrames = maxDampingFrames;
        this.frame = null;
        this.dampingFrames = 0;
        this.disposed = false;
    }

    request({ settle = false } = {}) {
        if (this.disposed) return;
        if (settle) {
            this.dampingFrames = Math.max(this.dampingFrames, this.maxDampingFrames);
        } else if (this.dampingFrames === 0) {
            this.dampingFrames = 1;
        }
        this.schedule();
    }

    schedule() {
        if (this.frame !== null || this.disposed) return;
        this.frame = requestAnimationFrame(() => this.tick());
    }

    tick() {
        this.frame = null;
        if (this.disposed) return;

        if (this.controls) {
            this.controls.update();
        }

        if (this.updateOverlay) {
            this.updateOverlay();
        }

        this.render();

        if (this.dampingFrames > 0) {
            this.dampingFrames -= 1;
            if (this.dampingFrames > 0) {
                this.schedule();
            }
        }
    }

    dispose() {
        this.disposed = true;
        if (this.frame !== null) {
            cancelAnimationFrame(this.frame);
            this.frame = null;
        }
    }
}
