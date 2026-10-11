// Playwright helpers for the shared view dock (scripts/ui/dialkit/viewDock.js):
// the lower-left orientation cube and its expandable view controls.

/** Locators and actions for the view dock on `page`. */
export function viewDock(page) {
    const dock = page.locator('.dk-view-dock');
    const panel = dock.locator('.dk-view-panel');
    const row = (label) => panel.locator('.dk-view-row')
        .filter({ has: page.locator('.dk-row-label', { hasText: new RegExp(`^${label}$`) }) });

    async function open() {
        if (await panel.isHidden()) await dock.locator('.dk-view-expand').click();
        await panel.waitFor();
    }

    async function close() {
        if (await panel.isVisible()) await dock.locator('.dk-view-expand').click();
    }

    /** Expand a collapsible group (e.g. Items, Parts) inside the panel. */
    async function openGroup(label) {
        const group = panel.locator('details.dk-view-group').filter({ has: page.locator('summary', { hasText: label }) });
        if (await group.getAttribute('open') === null) await group.locator('summary').click();
        return group;
    }

    async function setToggle(label, on) {
        await row(label).getByRole('button', { name: on ? 'On' : 'Off', exact: true }).click();
    }

    async function toggleState(label) {
        return (await row(label).getByRole('button', { name: 'On', exact: true }).getAttribute('aria-pressed')) === 'true';
    }

    async function choose(label, value) {
        await row(label).locator('select').selectOption(value);
    }

    async function setSlider(label, value) {
        await row(label).locator('input[type="range"]').evaluate((input, next) => {
            input.value = String(next);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }, value);
    }

    /** Click a cube face: Front, Back, Left, Right, Top or Bottom. */
    async function face(name) {
        await dock.locator(`.st-vc-face[data-view="${name}"]`).click();
    }

    return { dock, panel, row, open, close, openGroup, setToggle, toggleState, choose, setSlider, face };
}
