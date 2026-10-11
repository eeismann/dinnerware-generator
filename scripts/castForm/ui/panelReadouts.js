/**
 * Cast Form Generator - Parameter card readouts
 * The non-dial parts of the parameter card: input source status, polymer
 * volume and warnings. Each follows castFormState.
 */

import castFormState from '../state/castFormState.js';
import { calculateCaseBoxMaterialVolume } from '../geometry/caseBoxVolumeCalculator.js';

const volumeFormatter = new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1
});

export function initPanelReadouts() {
    castFormState.subscribe('input', updateInputStatus);
    castFormState.subscribe('warnings', updateWarnings);
    // Recalculate only when a new generated mold replaces the output.
    castFormState.subscribe('output', updateMaterialVolume);
    castFormState.subscribe('params.caseBox', updateMaterialVolume);
    updateInputStatus();
    updateWarnings();
    updateMaterialVolume();
}

/**
 * Source card: file name and size, or the first import error.
 */
function updateInputStatus() {
    const input = castFormState.getState('input');
    const card = document.getElementById('inputStatus');
    const name = card?.querySelector('.dk-source-name');
    const meta = document.getElementById('inputMeta');
    const button = document.getElementById('sourceImportBtn');
    if (!card || !name || !meta) return;

    card.classList.toggle('loaded', Boolean(input.isValid));
    card.classList.toggle('error', !input.isValid && input.validationErrors.length > 0);
    if (input.isValid) {
        const size = input.bounds?.size;
        name.textContent = input.fileName || 'Model loaded';
        meta.textContent = size
            ? `${size.x.toFixed(0)} × ${size.y.toFixed(0)} × ${size.z.toFixed(0)} mm`
            : '';
    } else {
        name.textContent = input.validationErrors.length > 0
            ? input.validationErrors[0]
            : 'No model loaded';
        meta.textContent = 'STL or OBJ vessel';
    }
    name.title = name.textContent;
    if (button) button.textContent = input.isValid ? 'Replace…' : 'Import…';
}

function updateWarnings() {
    const warnings = castFormState.getState('warnings');
    const section = document.getElementById('warningsSection');
    const list = document.getElementById('warningList');
    const count = document.getElementById('warningCount');
    const badge = document.getElementById('warningBadge');
    const badgeCount = document.getElementById('warningBadgeCount');

    if (section) section.hidden = warnings.length === 0;
    badge?.classList.toggle('hidden', warnings.length === 0);
    if (count) count.textContent = warnings.length;
    if (badgeCount) badgeCount.textContent = warnings.length;
    list?.replaceChildren(...warnings.map((warning) => {
        const item = document.createElement('li');
        item.className = `severity-${warning.type || 'warning'}`;
        item.textContent = warning.message || warning;
        return item;
    }));
}

/**
 * Polymer pour volume from the generated forms and live case-box params.
 */
function updateMaterialVolume() {
    const card = document.getElementById('materialVolumeCard');
    const total = document.getElementById('materialVolumeTotal');
    const empty = document.getElementById('materialVolumeEmpty');
    const breakdown = document.getElementById('materialVolumeBreakdown');
    const rows = document.getElementById('materialVolumeRows');
    if (!card || !total || !empty || !breakdown || !rows) return;

    const output = castFormState.getState('output') || {};
    const walls = (output.wallShells || []).filter(Boolean);
    if (!output.footShell && walls.length === 0) {
        card.classList.add('is-empty');
        total.textContent = '—';
        empty.hidden = false;
        breakdown.hidden = true;
        rows.replaceChildren();
        return;
    }

    const volume = calculateCaseBoxMaterialVolume(
        { foot: output.footShell, walls },
        castFormState.getState('params.caseBox')
    );
    const formatMl = (value) => `${volumeFormatter.format(value)} mL`;
    const rowData = [];
    if (output.footShell) rowData.push(['Foot', volume.footMl]);
    volume.wallPartsMl.forEach((wallVolume, index) => {
        rowData.push([`Wall ${index + 1}`, wallVolume]);
    });

    card.classList.remove('is-empty');
    total.textContent = formatMl(volume.totalMl);
    empty.hidden = true;
    breakdown.hidden = false;
    rows.replaceChildren(...rowData.map(([label, value]) => {
        const row = document.createElement('tr');
        const labelCell = document.createElement('td');
        const valueCell = document.createElement('td');
        labelCell.textContent = label;
        valueCell.textContent = formatMl(value);
        row.append(labelCell, valueCell);
        return row;
    }));
}
