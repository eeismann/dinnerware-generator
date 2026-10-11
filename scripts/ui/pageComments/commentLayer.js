/**
 * Page comments — development only. Drop numbered review pins anywhere on a
 * page and write a note on each. Notes are saved to feedback/page-comments.json
 * (through the dev server's /api/page-comments) with what they're attached to
 * (section, element, text), so an agent can read the file and work through
 * them. Press C or use the Comment button to start pinning; Esc stops.
 *
 * Vanilla port of the page-comments skill's React CommentLayer for this
 * multi-page Vite app. Loaded by ./pageComments.js only when import.meta.env.DEV.
 */

const API = '/api/page-comments';
const MEANINGFUL = 'img,canvas,svg,figure,video,button,a,input,select,textarea,h1,h2,h3,h4,p,li,blockquote,dt,dd,span,label';
const ROOT_ATTR = 'data-comment-layer';

/** One key per app page: "/", "/vessel-generator/", "/dashboard.html"... */
function pageKey() {
    return window.location.pathname.replace(/index\.html$/, '') || '/';
}

function theme() {
    const html = document.documentElement;
    if (html.dataset.ui === 'line') return html.dataset.lnTheme === 'negative' ? 'night' : 'day';
    return html.getAttribute('data-mode') === 'light' ? 'day' : 'night';
}

/** A selector that finds the element again: from the nearest ancestor with an id, by tag and position. */
function selectorFor(el) {
    const parts = [];
    let node = el;
    while (node && node !== document.body && node !== document.documentElement) {
        if (node.id) {
            parts.unshift(`#${CSS.escape(node.id)}`);
            break;
        }
        const tag = node.tagName.toLowerCase();
        const parent = node.parentElement;
        const same = parent ? [...parent.children].filter(child => child.tagName === node.tagName) : [];
        parts.unshift(same.length > 1 ? `${tag}:nth-of-type(${same.indexOf(node) + 1})` : tag);
        node = parent;
    }
    return parts.join(' > ');
}

function anchorAt(x, y) {
    const hit = document.elementsFromPoint(x, y).find(element => !element.closest(`[${ROOT_ATTR}]`));
    if (!hit) return null;
    const el = hit.closest(MEANINGFUL) ?? hit;
    const rect = el.getBoundingClientRect();
    const section = el.closest('section[id], section[data-section], [data-section], aside[id], main[id], header, footer');
    const heading = section?.querySelector('h1,h2,h3')?.textContent?.trim();
    const sectionName = section
        ? (section.id || section.dataset.section || section.className.split(' ')[0] || section.tagName.toLowerCase())
        : null;
    const snippet = (el.getAttribute('alt') || el.getAttribute('aria-label') || el.getAttribute('title')
        || el.textContent || el.tagName.toLowerCase()).replace(/\s+/g, ' ').trim().slice(0, 140);
    return {
        selector: selectorFor(el),
        section: sectionName ? `${sectionName}${heading ? ` · ${heading}` : ''}` : null,
        snippet,
        fx: rect.width ? (x - rect.left) / rect.width : 0,
        fy: rect.height ? (y - rect.top) / rect.height : 0
    };
}

/** Where a comment's pin belongs right now, in viewport coordinates. */
function place(comment) {
    try {
        const el = document.querySelector(comment.anchor.selector);
        if (el) {
            const rect = el.getBoundingClientRect();
            if (rect.width || rect.height) {
                return { x: rect.left + comment.anchor.fx * rect.width, y: rect.top + comment.anchor.fy * rect.height };
            }
        }
    } catch { /* fall back to the drop point */ }
    return { x: comment.at.x - window.scrollX, y: comment.at.y - window.scrollY };
}

function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

const STYLES = `
[${ROOT_ATTR}] { --pc-ink: #141414; --pc-paper: #fbf9f3; --pc-cream: #f2eddf; --pc-pin: #e07a5f;
    color: var(--pc-ink); font: 14px/1.4 -apple-system, BlinkMacSystemFont, 'Inter', sans-serif; }
[${ROOT_ATTR}] * { box-sizing: border-box; }
[${ROOT_ATTR}] .pc-mono { font: 500 10px/1.3 'Geist Mono', 'JetBrains Mono', ui-monospace, monospace;
    text-transform: uppercase; letter-spacing: 0.12em; }
[${ROOT_ATTR}] button { font: inherit; color: inherit; cursor: pointer; }
.pc-catcher { position: fixed; inset: 0; z-index: 2147483000; cursor: crosshair; background: rgba(20,20,20,.03); }
.pc-catcher-hint { position: fixed; left: 50%; top: 72px; transform: translateX(-50%); pointer-events: none;
    padding: 6px 12px; border-radius: 999px; background: var(--pc-ink); color: var(--pc-cream); }
.pc-pin { position: fixed; z-index: 2147483001; display: flex; align-items: center; justify-content: center;
    height: 22px; min-width: 22px; padding: 0 4px; transform: translate(-50%, -50%); border: 1px solid var(--pc-cream);
    border-radius: 999px; background: var(--pc-pin); color: #fff; box-shadow: 0 2px 8px rgba(0,0,0,.25);
    font-size: 9.5px !important; letter-spacing: 0 !important; transition: transform .12s; }
.pc-pin:hover { transform: translate(-50%, -50%) scale(1.1); }
.pc-pin.is-resolved { border-color: rgba(20,20,20,.4); background: var(--pc-cream); color: rgba(20,20,20,.5); }
.pc-pin.is-open { transform: translate(-50%, -50%) scale(1.1); outline: 2px solid var(--pc-ink); }
.pc-pin.is-draft { border-width: 2px; }
.pc-card { position: fixed; z-index: 2147483002; width: 300px; padding: 12px; border: 1px solid rgba(20,20,20,.15);
    border-radius: 6px; background: var(--pc-paper); box-shadow: 0 10px 30px -10px rgba(0,0,0,.35); }
.pc-meta { margin: 0 0 6px; color: rgba(20,20,20,.55); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pc-text { margin: 0; white-space: pre-wrap; font-size: 14px; line-height: 1.35; }
.pc-snippet { margin: 8px 0 0; color: rgba(20,20,20,.45); font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pc-row { display: flex; align-items: center; gap: 8px; margin-top: 12px; }
.pc-chip { padding: 4px 10px; border: 1px solid rgba(20,20,20,.25); border-radius: 999px; background: none; }
.pc-chip:hover { border-color: rgba(20,20,20,.6); }
.pc-quiet { margin-left: auto; padding: 4px; border: 0; background: none; color: rgba(20,20,20,.55); }
.pc-quiet:hover { color: var(--pc-ink); }
.pc-solid { padding: 4px 12px; border: 0; border-radius: 999px; background: var(--pc-ink); color: var(--pc-cream) !important; }
.pc-solid:disabled { opacity: .4; cursor: default; }
.pc-textarea { width: 100%; min-height: 72px; resize: vertical; padding: 8px; border: 1px solid rgba(20,20,20,.2);
    border-radius: 4px; background: #fff; color: var(--pc-ink); font: 14px/1.35 -apple-system, BlinkMacSystemFont, sans-serif; outline: none; }
.pc-textarea:focus { border-color: rgba(20,20,20,.6); }
.pc-hint { margin-left: auto; color: rgba(20,20,20,.4); font-size: 9px !important; }
.pc-list { position: fixed; left: 50%; bottom: 132px; transform: translateX(-50%); z-index: 2147483002; width: 340px;
    max-height: 60vh; overflow-y: auto; padding: 12px; border: 1px solid rgba(20,20,20,.15); border-radius: 6px;
    background: var(--pc-paper); box-shadow: 0 10px 30px -10px rgba(0,0,0,.35); }
.pc-list-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; color: rgba(20,20,20,.55); }
.pc-list-head label { display: flex; align-items: center; gap: 6px; cursor: pointer; }
.pc-list ol { margin: 0; padding: 0; list-style: none; }
.pc-list-item { display: flex; gap: 8px; width: 100%; padding: 6px; border: 0; border-radius: 4px; background: none; text-align: left; }
.pc-list-item:hover { background: rgba(20,20,20,.05); }
.pc-list-num { display: flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; margin-top: 2px;
    border-radius: 999px; background: var(--pc-pin); color: #fff; font-size: 9px !important; letter-spacing: 0 !important; }
.pc-list-num.is-resolved { background: rgba(20,20,20,.1); color: rgba(20,20,20,.5); }
.pc-list-text { font-size: 13px; line-height: 1.35; }
.pc-list-text.is-resolved { color: rgba(20,20,20,.45); text-decoration: line-through; }
.pc-empty { margin: 0; padding: 12px 0; color: rgba(20,20,20,.55); font-size: 13px; }
.pc-pill { position: fixed; left: 50%; bottom: 84px; transform: translateX(-50%); z-index: 2147483002; display: flex;
    align-items: center; gap: 4px; padding: 4px; border: 1px solid rgba(20,20,20,.15); border-radius: 999px;
    background: rgba(251,249,243,.95); box-shadow: 0 6px 18px -8px rgba(0,0,0,.35); backdrop-filter: blur(8px); }
.pc-pill button { display: flex; align-items: center; gap: 6px; height: 32px; min-width: 32px; justify-content: center;
    padding: 0 12px; border: 0; border-radius: 999px; background: none; transition: background-color .12s; }
.pc-pill button:hover { background: rgba(20,20,20,.08); }
.pc-pill button[aria-pressed="true"] { background: var(--pc-ink); color: var(--pc-cream); }
.pc-pill svg { width: 14px; height: 14px; }
`;

export function mountCommentLayer() {
    if (document.querySelector(`[${ROOT_ATTR}]`)) return;
    const page = pageKey();
    const state = {
        comments: [],
        placing: false,
        draft: null,
        open: null,
        list: false,
        showResolved: false
    };

    const style = document.createElement('style');
    style.textContent = STYLES;
    document.head.appendChild(style);

    const root = document.createElement('div');
    root.setAttribute(ROOT_ATTR, '');
    document.body.appendChild(root);
    const layers = {};
    ['catcher', 'pins', 'card', 'list', 'pill'].forEach(name => {
        layers[name] = document.createElement('div');
        root.appendChild(layers[name]);
    });

    const numberOf = (id) => state.comments.findIndex(comment => comment.id === id) + 1;
    const visible = () => state.comments.filter(comment => state.showResolved || comment.status === 'open');
    const openCount = () => state.comments.filter(comment => comment.status === 'open').length;
    const cardPosition = (x, y) => ({
        left: Math.min(Math.max(12, x + 18), window.innerWidth - 312),
        top: Math.min(Math.max(12, y - 12), window.innerHeight - 220)
    });

    // --- API
    async function request(method, body, query = '') {
        try {
            const response = await fetch(`${API}${query}`, {
                method,
                headers: body ? { 'content-type': 'application/json' } : undefined,
                body: body ? JSON.stringify(body) : undefined
            });
            // A dev server without the API answers with its HTML fallback
            if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return null;
            return await response.json();
        } catch {
            return null;
        }
    }
    async function saveDraft(text) {
        if (!state.draft || !text.trim()) return;
        const comment = await request('POST', { ...state.draft, text });
        if (comment) state.comments.push(comment);
        state.draft = null;
        renderAll();
    }
    async function update(id, changes) {
        state.comments = state.comments.map(comment => (comment.id === id ? { ...comment, ...changes } : comment));
        renderAll();
        await request('PATCH', { id, ...changes });
    }
    async function remove(id) {
        state.comments = state.comments.filter(comment => comment.id !== id);
        state.open = null;
        renderAll();
        await request('DELETE', null, `?id=${encodeURIComponent(id)}`);
    }

    // --- Rendering. Pins re-render on every tick; the card and list only
    // when state changes, so typing in a draft is never interrupted.
    function renderPins() {
        const pins = visible().map(comment => {
            const { x, y } = place(comment);
            if (y < -40 || y > window.innerHeight + 40) return '';
            const classes = ['pc-pin', 'pc-mono'];
            if (comment.status === 'resolved') classes.push('is-resolved');
            if (state.open === comment.id) classes.push('is-open');
            return `<button type="button" class="${classes.join(' ')}" data-pin="${comment.id}"
                aria-label="Comment ${numberOf(comment.id)}: ${escapeHtml(comment.text)}"
                style="left:${x}px;top:${y}px">${numberOf(comment.id)}</button>`;
        });
        if (state.draft) {
            const { x, y } = place(state.draft);
            pins.push(`<span class="pc-pin is-draft" style="left:${x}px;top:${y}px"></span>`);
        }
        layers.pins.innerHTML = pins.join('');
        // Keep the open card beside its pin as things move
        const card = layers.card.firstElementChild;
        const target = state.draft ?? state.comments.find(comment => comment.id === state.open);
        if (card && target) {
            const { x, y } = place(target);
            const position = cardPosition(x, y);
            card.style.left = `${position.left}px`;
            card.style.top = `${position.top}px`;
        }
    }

    function renderCard() {
        layers.card.innerHTML = '';
        if (state.draft) {
            const draft = state.draft;
            const form = document.createElement('form');
            form.className = 'pc-card';
            form.innerHTML = `
                <p class="pc-meta pc-mono">${escapeHtml(draft.anchor.section ?? 'page')} · “${escapeHtml(draft.anchor.snippet.slice(0, 40))}”</p>
                <textarea class="pc-textarea" rows="3" placeholder="What should change here?"></textarea>
                <div class="pc-row">
                    <button type="submit" class="pc-solid pc-mono" disabled>Save</button>
                    <button type="button" class="pc-quiet pc-mono" data-cancel style="margin-left:0">Cancel</button>
                    <span class="pc-hint pc-mono">⌘↵ to save</span>
                </div>`;
            const textarea = form.querySelector('textarea');
            const submit = form.querySelector('[type="submit"]');
            textarea.addEventListener('input', () => { submit.disabled = !textarea.value.trim(); });
            textarea.addEventListener('keydown', (event) => {
                if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                    event.preventDefault();
                    void saveDraft(textarea.value);
                }
                event.stopPropagation();
            });
            form.addEventListener('submit', (event) => {
                event.preventDefault();
                void saveDraft(textarea.value);
            });
            form.querySelector('[data-cancel]').addEventListener('click', () => {
                state.draft = null;
                renderAll();
            });
            layers.card.appendChild(form);
            requestAnimationFrame(() => textarea.focus());
        } else if (state.open) {
            const comment = state.comments.find(item => item.id === state.open);
            if (!comment) return;
            const card = document.createElement('div');
            card.className = 'pc-card';
            card.innerHTML = `
                <p class="pc-meta pc-mono">#${numberOf(comment.id)} · ${escapeHtml(comment.anchor.section ?? 'page')} · ${comment.status}</p>
                <p class="pc-text">${escapeHtml(comment.text)}</p>
                <p class="pc-snippet" title="${escapeHtml(comment.anchor.snippet)}">On “${escapeHtml(comment.anchor.snippet)}”</p>
                <div class="pc-row">
                    <button type="button" class="pc-chip pc-mono" data-toggle>${comment.status === 'open' ? 'Resolve' : 'Reopen'}</button>
                    <button type="button" class="pc-chip pc-mono" data-delete>Delete</button>
                    <button type="button" class="pc-quiet pc-mono" data-close>Close</button>
                </div>`;
            card.querySelector('[data-toggle]').addEventListener('click', () => {
                void update(comment.id, { status: comment.status === 'open' ? 'resolved' : 'open' });
            });
            card.querySelector('[data-delete]').addEventListener('click', () => void remove(comment.id));
            card.querySelector('[data-close]').addEventListener('click', () => {
                state.open = null;
                renderAll();
            });
            layers.card.appendChild(card);
        }
        renderPins();
    }

    function renderList() {
        layers.list.innerHTML = '';
        if (!state.list) return;
        const list = document.createElement('div');
        list.className = 'pc-list';
        const items = visible();
        list.innerHTML = `
            <div class="pc-list-head pc-mono">
                <span>${openCount()} open on ${escapeHtml(page)}</span>
                <label><input type="checkbox" ${state.showResolved ? 'checked' : ''}> Resolved</label>
            </div>
            ${items.length ? '' : '<p class="pc-empty">No comments yet. Press C and click anywhere on the page.</p>'}
            <ol>${items.map(comment => `
                <li><button type="button" class="pc-list-item" data-item="${comment.id}">
                    <span class="pc-list-num pc-mono ${comment.status === 'resolved' ? 'is-resolved' : ''}">${numberOf(comment.id)}</span>
                    <span class="pc-list-text ${comment.status === 'resolved' ? 'is-resolved' : ''}">${escapeHtml(comment.text)}</span>
                </button></li>`).join('')}</ol>`;
        list.querySelector('input').addEventListener('change', (event) => {
            state.showResolved = event.target.checked;
            renderAll();
        });
        list.querySelectorAll('[data-item]').forEach(button => button.addEventListener('click', () => {
            const comment = state.comments.find(item => item.id === button.dataset.item);
            let el = null;
            try { el = document.querySelector(comment.anchor.selector); } catch { el = null; }
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            else window.scrollTo({ top: comment.at.y - window.innerHeight / 2, behavior: 'smooth' });
            state.open = comment.id;
            state.draft = null;
            renderAll();
        }));
        layers.list.appendChild(list);
    }

    function renderPill() {
        layers.pill.innerHTML = `
            <div class="pc-pill">
                <button type="button" class="pc-mono" data-comment aria-pressed="${state.placing}" title="Add a comment (C)">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1.1-4.6A8 8 0 1 1 21 12Z"/><path d="M12 9v6M9 12h6"/></svg>
                    Comment
                </button>
                <button type="button" class="pc-mono" data-list aria-pressed="${state.list}" title="All comments on this page">${openCount()}</button>
            </div>`;
        layers.pill.querySelector('[data-comment]').addEventListener('click', () => setPlacing(!state.placing));
        layers.pill.querySelector('[data-list]').addEventListener('click', () => {
            state.list = !state.list;
            renderAll();
        });
    }

    function renderCatcher() {
        layers.catcher.innerHTML = '';
        if (!state.placing) return;
        const catcher = document.createElement('div');
        catcher.className = 'pc-catcher';
        catcher.innerHTML = '<p class="pc-catcher-hint pc-mono">Click anything to comment · Esc to stop</p>';
        catcher.addEventListener('click', (event) => {
            const anchor = anchorAt(event.clientX, event.clientY);
            if (!anchor) return;
            state.draft = {
                page,
                anchor,
                at: {
                    x: event.clientX + window.scrollX,
                    y: event.clientY + window.scrollY,
                    viewport: `${window.innerWidth}x${window.innerHeight}`,
                    theme: theme()
                }
            };
            state.placing = false;
            state.open = null;
            renderAll();
        });
        layers.catcher.appendChild(catcher);
    }

    function renderAll() {
        renderCatcher();
        renderCard();
        renderList();
        renderPill();
    }

    function setPlacing(on) {
        state.placing = on;
        renderAll();
    }

    // Pins: open or close their card
    layers.pins.addEventListener('click', (event) => {
        const pin = event.target.closest('[data-pin]');
        if (!pin) return;
        state.open = state.open === pin.dataset.pin ? null : pin.dataset.pin;
        state.draft = null;
        renderAll();
    });

    // Pins follow their elements as the page or any panel scrolls, resizes or reflows
    let frame = 0;
    const bump = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(renderPins);
    };
    window.addEventListener('scroll', bump, { passive: true, capture: true });
    window.addEventListener('resize', bump);
    setInterval(bump, 800);

    window.addEventListener('keydown', (event) => {
        const target = event.target;
        const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
            || target instanceof HTMLSelectElement || target?.isContentEditable;
        if (event.key === 'Escape' && (state.placing || state.draft || state.open)) {
            state.placing = false;
            state.draft = null;
            state.open = null;
            renderAll();
        } else if (!typing && !event.metaKey && !event.ctrlKey && !event.altKey && (event.key === 'c' || event.key === 'C')) {
            setPlacing(!state.placing);
        }
    });

    // Only show the layer when the dev server's comments API is there
    request('GET', null, `?page=${encodeURIComponent(page)}`).then(all => {
        if (!Array.isArray(all)) {
            root.remove();
            style.remove();
            return;
        }
        state.comments = all;
        renderAll();
    });
}
