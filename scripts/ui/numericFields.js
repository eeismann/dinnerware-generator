/**
 * Numeric Field Enhancements
 * - Drag a parameter label left/right to scrub its value (Shift = 10× faster,
 *   Alt = 10× finer). The drag previews interactively; release commits.
 * - Arrow keys in a number box apply immediately (Shift ×10, Alt ×0.1).
 * - Number boxes accept arithmetic such as `2.5+0.3` or `140/2`.
 * - Sliders show their value and unit as a tooltip.
 *
 * Works on the shared `.parameter-row` markup: a range input, a number input
 * inside `.numeric-input` and an optional `.unit`. The rows' own listeners
 * (range `input` = interactive, range/number `change` = commit) do the rest.
 */

const SCRUB_PIXELS_PER_STEP = 4;

/**
 * Evaluate a small arithmetic expression: numbers, + - * /, parentheses and
 * unary minus. Returns NaN for anything else (no eval).
 */
export function evaluateExpression(text) {
    const source = String(text ?? '').replace(/,/g, '.').trim();
    if (!source) return NaN;
    let i = 0;
    const peek = () => source[i];
    const skip = () => { while (source[i] === ' ') i++; };
    const number = () => {
        skip();
        const match = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(source.slice(i));
        if (!match) throw new Error('number expected');
        i += match[0].length;
        return parseFloat(match[0]);
    };
    const factor = () => {
        skip();
        if (peek() === '-') { i++; return -factor(); }
        if (peek() === '+') { i++; return factor(); }
        if (peek() === '(') {
            i++;
            const value = expression();
            skip();
            if (peek() !== ')') throw new Error(') expected');
            i++;
            return value;
        }
        return number();
    };
    const term = () => {
        let value = factor();
        for (;;) {
            skip();
            if (peek() === '*') { i++; value *= factor(); }
            else if (peek() === '/') { i++; value /= factor(); }
            else return value;
        }
    };
    const expression = () => {
        let value = term();
        for (;;) {
            skip();
            if (peek() === '+') { i++; value += term(); }
            else if (peek() === '-') { i++; value -= term(); }
            else return value;
        }
    };
    try {
        const value = expression();
        skip();
        return i === source.length && Number.isFinite(value) ? value : NaN;
    } catch {
        return NaN;
    }
}

function decimalsOf(step) {
    const text = String(step);
    return text.includes('.') ? text.split('.')[1].length : 0;
}

/**
 * Snap to the field's step and clamp to its range.
 */
export function quantize(value, { min = -Infinity, max = Infinity, step = 1, fine = false } = {}) {
    const unit = fine ? step / 10 : step;
    const decimals = decimalsOf(step) + (fine ? 1 : 0);
    const snapped = Math.round(value / unit) * unit;
    return Number(Math.min(max, Math.max(min, snapped)).toFixed(decimals));
}

function fieldLimits(input) {
    return {
        min: input.min === '' ? -Infinity : Number(input.min),
        max: input.max === '' ? Infinity : Number(input.max),
        step: Number(input.step) || 1
    };
}

function setRangeTooltip(row) {
    const range = row.querySelector('input[type="range"]');
    if (!range) return;
    const unit = row.querySelector('.unit')?.textContent ?? '';
    range.title = `${range.value}${unit}`;
}

function enhanceRow(row) {
    if (row.dataset.numericEnhanced) return;
    const range = row.querySelector('input[type="range"]');
    const number = row.querySelector('.numeric-input input');
    const label = row.querySelector('label');
    if (!range || !number) return;
    row.dataset.numericEnhanced = 'true';

    setRangeTooltip(row);
    range.addEventListener('input', () => setRangeTooltip(row));

    // --- Arrow keys and arithmetic in the number box
    number.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            event.preventDefault();
            const limits = fieldLimits(number);
            const current = evaluateExpression(number.value);
            const base = Number.isFinite(current) ? current : Number(range.value);
            const multiplier = event.shiftKey ? 10 : event.altKey ? 0.1 : 1;
            const direction = event.key === 'ArrowUp' ? 1 : -1;
            number.value = quantize(base + direction * limits.step * multiplier, { ...limits, fine: event.altKey });
            number.dispatchEvent(new Event('change', { bubbles: true }));
        } else if (event.key === 'Enter') {
            event.preventDefault();
            number.dispatchEvent(new Event('change', { bubbles: true }));
            number.select?.();
        } else if (event.key === 'Escape') {
            number.value = range.value;
            number.blur();
        }
    });
    // Number inputs reject arithmetic: switch to a text field on the first
    // operator keystroke (the key then lands in the text field)
    number.addEventListener('keydown', (event) => {
        if (number.type !== 'number' || !/^[+*/()]$/.test(event.key)) return;
        const value = number.value;
        number.dataset.numericType = 'number';
        number.type = 'text';
        number.inputMode = 'decimal';
        number.value = value;
        number.setSelectionRange(value.length, value.length);
    });
    number.addEventListener('blur', () => {
        if (number.dataset.numericType === 'number') {
            number.type = 'number';
        }
    });
    // Resolve arithmetic before the row's own change handler reads the value
    // (capture listeners run first at the target)
    number.addEventListener('change', () => {
        const value = evaluateExpression(number.value);
        number.value = Number.isFinite(value) ? String(Number(value.toFixed(6))) : range.value;
    }, true);

    // --- Scrub by dragging the label
    if (label) {
        label.classList.add('scrub-label');
        label.title = label.title || 'Drag to adjust (Shift: faster, Alt: finer)';
        label.addEventListener('pointerdown', (event) => {
            if (event.button !== 0 || range.disabled) return;
            event.preventDefault();
            const limits = fieldLimits(range);
            const startX = event.clientX;
            const startValue = Number(range.value);
            let moved = false;
            label.setPointerCapture?.(event.pointerId);
            document.body.classList.add('is-scrubbing');

            const onMove = (moveEvent) => {
                const dx = moveEvent.clientX - startX;
                if (!moved && Math.abs(dx) < 3) return;
                moved = true;
                const multiplier = moveEvent.shiftKey ? 10 : moveEvent.altKey ? 0.1 : 1;
                const steps = Math.round(dx / SCRUB_PIXELS_PER_STEP) * multiplier;
                const value = quantize(startValue + steps * limits.step, { ...limits, fine: moveEvent.altKey });
                if (String(value) === range.value && String(value) === number.value) return;
                range.value = value;
                number.value = value;
                range.dispatchEvent(new Event('input', { bubbles: true }));
            };
            const onUp = () => {
                label.removeEventListener('pointermove', onMove);
                label.removeEventListener('pointerup', onUp);
                label.removeEventListener('pointercancel', onUp);
                document.body.classList.remove('is-scrubbing');
                if (moved) {
                    range.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                    number.focus();
                    number.select?.();
                }
            };
            label.addEventListener('pointermove', onMove);
            label.addEventListener('pointerup', onUp);
            label.addEventListener('pointercancel', onUp);
        });
    }
}

/**
 * Enhance every parameter row under `root`, now and as rows are added
 * (override rows and pattern rows are rebuilt dynamically).
 */
export function initNumericFields(root = document) {
    const scan = () => root.querySelectorAll('.parameter-row').forEach(enhanceRow);
    scan();
    const observer = new MutationObserver(scan);
    observer.observe(root === document ? document.body : root, { childList: true, subtree: true });
    return () => observer.disconnect();
}
