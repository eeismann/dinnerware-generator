/**
 * Accessibility helpers shared by the Dinnerware Designer panels:
 * - every slider/number/select in a parameter row is named by its label
 * - collapsible section headers behave as buttons (keyboard + aria-expanded)
 * - modals are dialogs with focus trapping, Escape to close and focus restore
 */

let uid = 0;
const nextId = (prefix) => `${prefix}-${++uid}`;

function labelRow(row) {
    const label = row.querySelector(':scope > label, :scope > .parameter-row-header > label');
    if (!label) return;
    if (!label.id) label.id = nextId('param-label');
    const help = row.nextElementSibling?.classList.contains('parameter-help') ? row.nextElementSibling : null;
    if (help && !help.id) help.id = nextId('param-help');
    row.querySelectorAll('input, select').forEach(control => {
        if (control.type === 'checkbox' || control.hasAttribute('aria-label') && !control.dataset.autoLabel) return;
        control.setAttribute('aria-labelledby', label.id);
        if (help && !control.hasAttribute('aria-describedby')) control.setAttribute('aria-describedby', help.id);
        control.dataset.autoLabel = 'true';
    });
    const unit = row.querySelector('.unit')?.textContent;
    const range = row.querySelector('input[type="range"]');
    if (range && unit) range.setAttribute('aria-valuetext', `${range.value}${unit}`);
}

/**
 * Name the controls of every parameter row now and as rows are rebuilt.
 */
export function initControlLabels(root = document.body) {
    const scan = () => root.querySelectorAll('.parameter-row').forEach(labelRow);
    scan();
    root.addEventListener('input', (event) => {
        const range = event.target.closest?.('.parameter-row input[type="range"]');
        const unit = range?.closest('.parameter-row').querySelector('.unit')?.textContent;
        if (range && unit) range.setAttribute('aria-valuetext', `${range.value}${unit}`);
    });
    const observer = new MutationObserver(scan);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
}

/**
 * Make `.section-header` elements keyboard-operable disclosure buttons.
 */
export function initSectionHeaders(root = document) {
    root.querySelectorAll('.panel-section > .section-header').forEach(header => {
        const section = header.parentElement;
        const content = section.querySelector(':scope > .section-content');
        if (content && !content.id) content.id = nextId('section');
        header.setAttribute('role', 'button');
        header.tabIndex = 0;
        if (content) header.setAttribute('aria-controls', content.id);
        const sync = () => header.setAttribute('aria-expanded', String(section.classList.contains('expanded')));
        sync();
        new MutationObserver(sync).observe(section, { attributes: true, attributeFilter: ['class'] });
        header.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                header.click();
            }
        });
    });
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const openDialogs = [];

function focusables(container) {
    return Array.from(container.querySelectorAll(FOCUSABLE))
        .filter(el => el.offsetParent !== null || el === document.activeElement);
}

/**
 * Mark up a `.modal` as a dialog once.
 */
export function prepareDialog(modal) {
    if (modal.dataset.dialogReady) return;
    modal.dataset.dialogReady = 'true';
    const content = modal.querySelector('.modal-content') || modal;
    const title = modal.querySelector('h2, h3');
    if (title && !title.id) title.id = nextId('dialog-title');
    content.setAttribute('role', 'dialog');
    content.setAttribute('aria-modal', 'true');
    if (title) content.setAttribute('aria-labelledby', title.id);
    modal.querySelectorAll('.btn-close').forEach(button => {
        if (!button.hasAttribute('aria-label')) button.setAttribute('aria-label', 'Close');
    });
}

export function isDialogOpen(modal) {
    return !modal.hidden && modal.style.display !== 'none';
}

/**
 * Show a modal, trap focus inside it and remember what to refocus on close.
 */
export function openDialog(modal, { initialFocus } = {}) {
    prepareDialog(modal);
    if (!openDialogs.some(entry => entry.modal === modal)) {
        openDialogs.push({ modal, returnFocus: document.activeElement });
    }
    modal.hidden = false;
    modal.style.display = 'flex';
    const target = (initialFocus && modal.querySelector(initialFocus)) || focusables(modal)[0];
    requestAnimationFrame(() => target?.focus());
}

export function closeDialog(modal) {
    modal.style.display = 'none';
    modal.hidden = true;
    const index = openDialogs.findIndex(entry => entry.modal === modal);
    if (index >= 0) {
        const [{ returnFocus }] = openDialogs.splice(index, 1);
        if (returnFocus?.isConnected) returnFocus.focus();
    }
}

document.addEventListener('keydown', (event) => {
    const top = openDialogs.at(-1);
    if (!top || !isDialogOpen(top.modal)) return;
    if (event.key === 'Escape') {
        event.preventDefault();
        closeDialog(top.modal);
        return;
    }
    if (event.key !== 'Tab') return;
    const items = focusables(top.modal);
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    } else if (!top.modal.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
    }
});
