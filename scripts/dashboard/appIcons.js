const APP_COLORS = {
    dinnerware: {
        base: '#1ABCFE',
        light: '#B7F1FF',
        mid: '#159FD6',
        dark: '#0B6FA2'
    },
    handle: {
        base: '#FF2AD4',
        light: '#FFD1F4',
        mid: '#D70FB4',
        dark: '#A8007F'
    },
    vessel: {
        base: '#A259FF',
        light: '#E6D6FF',
        mid: '#7B3FE4',
        dark: '#5B2FA8'
    },
    'vessel-v2': {
        base: '#00A6A6',
        light: '#C9F7F5',
        mid: '#0E8F91',
        dark: '#06686B'
    },
    'vessel-v3': {
        base: '#009B8A',
        light: '#C4F5EC',
        mid: '#0D847A',
        dark: '#065C54'
    },
    castform: {
        base: '#C45C26',
        light: '#FFE0C2',
        mid: '#A84D1F',
        dark: '#6F2D10'
    }
};

export const APP_ICON_VARIANTS = {
    line: 'line',
    object: 'object',
    signature: 'signature',
    plate: 'plate'
};

const APP_TYPES = new Set(Object.keys(APP_COLORS));

function normalizeAppType(appType) {
    return APP_TYPES.has(appType) ? appType : 'dinnerware';
}

function safeId(value) {
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '');
}

function svg(size, body, extraAttrs = '') {
    return `
        <svg width="${size}" height="${size}" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" ${extraAttrs}>
            ${body}
        </svg>
    `;
}

function gradient(id, stops, attrs = 'x1="8" y1="8" x2="40" y2="40"') {
    return `
        <linearGradient id="${id}" ${attrs} gradientUnits="userSpaceOnUse">
            ${stops.map(stop => `<stop${stop.offset ? ` offset="${stop.offset}"` : ''} stop-color="${stop.color}"${stop.opacity ? ` stop-opacity="${stop.opacity}"` : ''}/>`).join('')}
        </linearGradient>
    `;
}

function lineIcon(appType, size) {
    const color = APP_COLORS[appType].base;
    const common = 'stroke="currentColor" stroke-width="2.35" stroke-linecap="round" stroke-linejoin="round"';
    const soft = 'opacity="0.62"';
    const dot = 'fill="currentColor" stroke="none"';
    const attrs = `class="pc-app-icon pc-app-icon-line" style="color: ${color};"`;

    if (appType === 'handle') {
        return svg(size, `
            <g fill="none" ${common}>
                <path d="M13.5 14.8c0-2.4 2-4.4 4.4-4.4h9.2c2.4 0 4.4 2 4.4 4.4v17.6c0 3.3-2.7 6-6 6h-6c-3.3 0-6-2.7-6-6V14.8z"/>
                <path d="M31.5 18h3.3c4.9 0 8.1 3.2 8.1 8s-3.2 8-8.1 8h-3.3"/>
                <path d="M31.5 22.6h3c2.2 0 3.6 1.4 3.6 3.4s-1.4 3.4-3.6 3.4h-3"/>
                <path d="M17.4 16.5h10.2" ${soft}/>
            </g>
        `, attrs);
    }

    if (appType === 'vessel') {
        return svg(size, `
            <g fill="none" ${common}>
                <path d="M18.6 10.8h10.8"/>
                <path d="M18.6 10.8c0 3.1 2.1 5.2 2.1 8c0 1.6-0.8 3-2.4 4.4c-2.8 2.4-4.3 5.5-4.3 9.6v1.5c0 2.7 2.2 4.9 4.9 4.9h10.2c2.7 0 4.9-2.2 4.9-4.9v-1.5c0-4.1-1.5-7.2-4.3-9.6c-1.6-1.4-2.4-2.8-2.4-4.4c0-2.8 2.1-4.9 2.1-8"/>
                <path d="M18.2 24.7h11.6" ${soft}/>
                <path d="M16.2 32.2h15.6" ${soft}/>
                <path d="M20.7 15.8c2.1 0.9 4.5 0.9 6.6 0" ${soft}/>
            </g>
        `, attrs);
    }

    if (appType === 'vessel-v2' || appType === 'vessel-v3') {
        return svg(size, `
            <g fill="none" ${common}>
                <path d="M10.6 39.5V8.5" stroke-dasharray="3 4" ${soft}/>
                <path d="M10.6 39.5c5.4-1 7.4-4.4 6.2-8.6c-1.3-4.5 2.6-9.7 12-13.5"/>
                <circle cx="10.6" cy="39.5" r="2.2" ${dot}/>
                <circle cx="16.8" cy="30.9" r="2.2" ${dot}/>
                <circle cx="28.8" cy="17.4" r="2.2" ${dot}/>
                <path d="M33.8 7.3l7.4 7.4l-7.6 7.6l-7.4-7.4z"/>
                <path d="M28.9 20.1l-2.7 6l6-2.7"/>
                <path d="M31.2 12.4l7.2 7.2" ${soft}/>
            </g>
        `, attrs);
    }

    if (appType === 'castform') {
        return svg(size, `
            <g fill="none" ${common}>
                <path d="M9.4 17c0-2 1.6-3.6 3.6-3.6h6.3v21.2H13c-2 0-3.6-1.6-3.6-3.6V17z"/>
                <path d="M28.7 13.4H35c2 0 3.6 1.6 3.6 3.6v14c0 2-1.6 3.6-3.6 3.6h-6.3V13.4z"/>
                <path d="M19.3 13.4h9.4"/>
                <path d="M19.3 34.6h9.4"/>
                <ellipse cx="24" cy="38" rx="11.2" ry="4"/>
                <ellipse cx="24" cy="38" rx="6.3" ry="2.1" ${soft}/>
                <circle cx="19.3" cy="22" r="1.7" ${dot}/>
                <circle cx="28.7" cy="22" r="1.7" ${dot}/>
                <circle cx="19.3" cy="29" r="1.7" ${dot}/>
                <circle cx="28.7" cy="29" r="1.7" ${dot}/>
            </g>
        `, attrs);
    }

    return svg(size, `
        <g fill="none" ${common}>
            <path d="M8.6 30.1c0 4.1 6.9 7.4 15.4 7.4s15.4-3.3 15.4-7.4"/>
            <ellipse cx="24" cy="30.1" rx="15.4" ry="6.7"/>
            <ellipse cx="24" cy="30.1" rx="8.2" ry="3.2" ${soft}/>
            <path d="M16.5 16.9c0 3.4 3.4 6.1 7.5 6.1s7.5-2.7 7.5-6.1"/>
            <path d="M16.5 16.9c0-3.1 3.4-5.6 7.5-5.6s7.5 2.5 7.5 5.6"/>
            <path d="M16.5 16.9v4.1c0 3.4 3.4 6.1 7.5 6.1s7.5-2.7 7.5-6.1v-4.1"/>
            <path d="M35.6 22.1h2.5c2.5 0 4.4 1.8 4.4 4s-1.9 4-4.4 4h-2.3" ${soft}/>
        </g>
    `, attrs);
}

function objectIcon(appType, size, safe) {
    const color = APP_COLORS[appType];

    if (appType === 'handle') {
        const handle = `mh-handle-${safe}`;
        const pad = `mh-pad-${safe}`;
        return svg(size, `
            <defs>
                ${gradient(handle, [
                    { color: color.light },
                    { offset: '0.45', color: color.base },
                    { offset: '1', color: color.dark }
                ], 'x1="14" y1="10" x2="39" y2="38"')}
                ${gradient(pad, [
                    { color: '#FFFFFF', opacity: '0.55' },
                    { offset: '0.35', color: color.base },
                    { offset: '1', color: color.dark }
                ], 'x1="11" y1="11" x2="24" y2="36"')}
            </defs>
            <ellipse cx="24" cy="40.5" rx="14.5" ry="4" fill="#000" opacity="0.10"/>
            <path d="M18.5 16c15-5.2 24.4 14.9 8.3 20.3" stroke="#5A0A49" stroke-width="12" stroke-linecap="round" opacity="0.22"/>
            <path d="M18.5 15.2c15.4-5.4 25.2 15.2 8 20.9" stroke="url(#${handle})" stroke-width="9" stroke-linecap="round"/>
            <rect x="11.5" y="11.5" width="12" height="11" rx="4" fill="url(#${pad})"/>
            <rect x="11.5" y="25.5" width="12" height="11" rx="4" fill="url(#${pad})"/>
            <path d="M17.2 15c2.9-1.4 5.5-1.5 7.9-0.3" stroke="#FFFFFF" stroke-opacity="0.38" stroke-width="2.5" stroke-linecap="round"/>
        `);
    }

    if (appType === 'vessel') {
        const front = `vs-front-${safe}`;
        const side = `vs-side-${safe}`;
        const lip = `vs-lip-${safe}`;
        return svg(size, `
            <defs>
                ${gradient(front, [
                    { color: color.light },
                    { offset: '1', color: color.base }
                ], 'x1="16" y1="10" x2="34" y2="42"')}
                ${gradient(side, [
                    { color: color.base },
                    { offset: '1', color: color.dark }
                ], 'x1="22" y1="14" x2="40" y2="42"')}
                ${gradient(lip, [
                    { color: '#FFFFFF', opacity: '0.58' },
                    { offset: '1', color: '#FFFFFF', opacity: '0.12' }
                ], 'x1="18" y1="10" x2="30" y2="18"')}
            </defs>
            <ellipse cx="24" cy="40" rx="15" ry="4.2" fill="#000" opacity="0.10"/>
            <path d="M18 11.8c0 3.3 2.6 5.6 2.6 8.2c0 1.5-1 2.6-2.4 3.8c-2.6 2.3-4.2 5.2-4.2 9.3v1.9c0 2.4 1.9 4.3 4.3 4.3h11.4c2.4 0 4.3-1.9 4.3-4.3v-1.9c0-4.1-1.6-7-4.2-9.3c-1.4-1.2-2.4-2.3-2.4-3.8c0-2.6 2.6-4.9 2.6-8.2H18z" fill="url(#${front})"/>
            <path d="M27.8 11.8c0 3.2-2.4 5.3-2.4 8.2c0 1.9 1.3 3.1 2.8 4.4c2.2 1.9 3.4 4.3 3.4 8.7v1.9c0 2.4-1.9 4.3-4.3 4.3h2.4c2.4 0 4.3-1.9 4.3-4.3v-1.9c0-4.1-1.6-7-4.2-9.3c-1.4-1.2-2.4-2.3-2.4-3.8c0-2.6 2.6-4.9 2.6-8.2h-2.1Z" fill="url(#${side})" opacity="0.9"/>
            <path d="M18.6 12.2c0-1.2 1-2.2 2.2-2.2h6.4c1.2 0 2.2 1 2.2 2.2v1.3c0 0.3-0.2 0.5-0.5 0.5h-9.8c-0.3 0-0.5-0.2-0.5-0.5v-1.3z" fill="url(#${lip})"/>
            <path d="M19.6 20.6c1-2.8 3.1-4.5 6.3-4.8" stroke="#FFFFFF" stroke-opacity="0.30" stroke-width="2.8" stroke-linecap="round"/>
        `);
    }

    if (appType === 'vessel-v2' || appType === 'vessel-v3') {
        const front = `v2-front-${safe}`;
        const side = `v2-side-${safe}`;
        const pen = `v2-pen-${safe}`;
        return svg(size, `
            <defs>
                ${gradient(front, [
                    { color: color.light },
                    { offset: '1', color: color.base }
                ], 'x1="14" y1="8" x2="34" y2="42"')}
                ${gradient(side, [
                    { color: color.base },
                    { offset: '1', color: color.dark }
                ], 'x1="23" y1="10" x2="35" y2="40"')}
                ${gradient(pen, [
                    { color: '#FFE7B8' },
                    { offset: '1', color: '#F59E0B' }
                ], 'x1="30" y1="4" x2="43" y2="17"')}
            </defs>
            <ellipse cx="24" cy="41" rx="15" ry="4" fill="#000" opacity="0.10"/>
            <path d="M19 10c0 4 3 6 2 10c-0.8 3.3-5 5.7-5 12v2.5c0 2.5 2 4.5 4.5 4.5h8c2.5 0 4.5-2 4.5-4.5V32c0-6.3-4.2-8.7-5-12c-1-4 2-6 2-10H19z" fill="url(#${front})"/>
            <path d="M27.8 10c0 4-2.9 6-1.9 10c0.8 3.3 5 5.7 5 12v2.5c0 2.5-2 4.5-4.5 4.5h2.1c2.5 0 4.5-2 4.5-4.5V32c0-6.3-4.2-8.7-5-12c-1-4 2-6 2-10h-2.2z" fill="url(#${side})" opacity="0.72"/>
            <path d="M10 39V8" stroke="#FFFFFF" stroke-opacity="0.55" stroke-width="2" stroke-dasharray="3 3"/>
            <path d="M10 39c5-1 7-4 6-8s2-9 10-12" stroke="#FFFFFF" stroke-opacity="0.74" stroke-width="2.5" stroke-linecap="round"/>
            <circle cx="10" cy="39" r="2" fill="#FFFFFF"/>
            <circle cx="16" cy="31" r="2" fill="#FFFFFF"/>
            <circle cx="26" cy="19" r="2" fill="#FFFFFF"/>
            <path d="M34 6l8 8l-8 8l-8-8l8-8z" fill="url(#${pen})"/>
            <path d="M31 17l-4 7l7-4" fill="#6B4A13" opacity="0.75"/>
        `);
    }

    if (appType === 'castform') {
        const outer = `cf-outer-${safe}`;
        const inner = `cf-inner-${safe}`;
        const wall1 = `cf-wall1-${safe}`;
        const wall2 = `cf-wall2-${safe}`;
        return svg(size, `
            <defs>
                ${gradient(outer, [
                    { color: color.light },
                    { offset: '1', color: color.base }
                ], 'x1="8" y1="12" x2="40" y2="40"')}
                ${gradient(inner, [
                    { color: color.base },
                    { offset: '1', color: color.dark }
                ], 'x1="14" y1="16" x2="34" y2="36"')}
                ${gradient(wall1, [
                    { color: '#B8D4B0' },
                    { offset: '1', color: '#7D9B76' }
                ], 'x1="8" y1="20" x2="20" y2="36"')}
                ${gradient(wall2, [
                    { color: '#A8C8D8' },
                    { offset: '1', color: '#6B8BA4' }
                ], 'x1="28" y1="20" x2="40" y2="36"')}
            </defs>
            <ellipse cx="24" cy="42" rx="16" ry="3.5" fill="#000" opacity="0.10"/>
            <ellipse cx="24" cy="38" rx="12" ry="4" fill="url(#${outer})"/>
            <ellipse cx="24" cy="38" rx="8" ry="2.5" fill="url(#${inner})"/>
            <path d="M8 18c0-2 1.5-3.5 3.5-3.5h6c1 0 2 0.8 2 1.8v16c0 1.5-1.2 2.7-2.7 2.7H11c-1.7 0-3-1.3-3-3V18z" fill="url(#${wall1})"/>
            <path d="M28.5 14.5h6c2 0 3.5 1.5 3.5 3.5v14c0 1.7-1.3 3-3 3h-5.8c-1.5 0-2.7-1.2-2.7-2.7v-16c0-1 1-1.8 2-1.8z" fill="url(#${wall2})"/>
            <path d="M17 12h14v2H17z" fill="#9C9588" opacity="0.7"/>
            <line x1="20" y1="14" x2="20" y2="35" stroke="#FFF" stroke-width="1.5" opacity="0.4"/>
            <line x1="28" y1="14" x2="28" y2="35" stroke="#FFF" stroke-width="1.5" opacity="0.4"/>
            <circle cx="20" cy="22" r="2" fill="#D4A84B"/>
            <circle cx="28" cy="22" r="2" fill="#D4A84B"/>
            <circle cx="20" cy="30" r="2" fill="#D4A84B"/>
            <circle cx="28" cy="30" r="2" fill="#D4A84B"/>
        `);
    }

    const plateTop = `dw-top-${safe}`;
    const plateSide = `dw-side-${safe}`;
    const bowlTop = `dw-bowl-top-${safe}`;
    const bowlSide = `dw-bowl-side-${safe}`;
    return svg(size, `
        <defs>
            ${gradient(plateTop, [
                { color: color.light },
                { offset: '1', color: color.base }
            ], 'x1="14" y1="16" x2="36" y2="32"')}
            ${gradient(plateSide, [
                { color: color.mid },
                { offset: '1', color: color.dark }
            ], 'x1="16" y1="24" x2="36" y2="42"')}
            ${gradient(bowlTop, [
                { color: '#D4F8FF' },
                { offset: '1', color: '#64D6FF' }
            ], 'x1="18" y1="12" x2="32" y2="22"')}
            ${gradient(bowlSide, [
                { color: color.base },
                { offset: '1', color: color.dark }
            ], 'x1="18" y1="18" x2="32" y2="30"')}
        </defs>
        <ellipse cx="24" cy="39" rx="16" ry="4.5" fill="#000" opacity="0.10"/>
        <path d="M10 24c0 3.6 6.3 6.5 14 6.5S38 27.6 38 24v8c0 3.6-6.3 6.5-14 6.5S10 35.6 10 32v-8z" fill="url(#${plateSide})"/>
        <ellipse cx="24" cy="24" rx="14" ry="6.5" fill="url(#${plateTop})"/>
        <ellipse cx="24" cy="24" rx="8.5" ry="3.8" fill="#FFFFFF" opacity="0.22"/>
        <path d="M16 15.5c0 2.6 3.6 4.7 8 4.7s8-2.1 8-4.7v4.2c0 2.6-3.6 4.7-8 4.7s-8-2.1-8-4.7v-4.2z" fill="url(#${bowlSide})"/>
        <ellipse cx="24" cy="15.5" rx="8" ry="4.7" fill="url(#${bowlTop})"/>
        <ellipse cx="24" cy="15.6" rx="4.9" ry="2.9" fill="#FFFFFF" opacity="0.28"/>
    `);
}

/**
 * Studio Shell app icons: compact isometric forms using shared tonal tokens.
 * The neutral three-tone treatment keeps the set cohesive while the Vessel V2
 * control points retain the app accent as a functional cue.
 */
function studioObjectIcon(appType, size) {
    const attrs = 'class="pc-app-icon pc-app-icon-object"';

    if (appType === 'handle') {
        return svg(size, `
            <ellipse cx="23" cy="39.5" rx="12.5" ry="2.6" fill="var(--pc-icon-deep)" opacity="0.22"/>
            <path fill-rule="evenodd" clip-rule="evenodd" d="M32 18.5h3a6.4 6.4 0 0 1 0 12.8h-3v-3.8h2.8a2.6 2.6 0 0 0 0-5.2H32z" fill="var(--pc-icon-side)" stroke="var(--pc-icon-seam)" stroke-width="1.6"/>
            <path d="M13 14.5v18.3a9.6 4 0 0 0 19.2 0V14.5z" fill="var(--pc-icon-mid)"/>
            <ellipse cx="22.6" cy="14.5" rx="9.6" ry="4" fill="var(--pc-icon-top)"/>
            <ellipse cx="22.6" cy="14.8" rx="7" ry="2.9" fill="var(--pc-icon-deep)"/>
        `, attrs);
    }

    if (appType === 'vessel') {
        return svg(size, `
            <ellipse cx="24" cy="39.5" rx="10" ry="2.2" fill="var(--pc-icon-deep)" opacity="0.22"/>
            <path d="M18.5 11c0 4-3 6.5-3 11.5c0 7 4 10 4 13.5h9c0-3.5 4-6.5 4-13.5c0-5-3-7.5-3-11.5z" fill="var(--pc-icon-mid)"/>
            <ellipse cx="24" cy="36" rx="4.5" ry="1.6" fill="var(--pc-icon-side)"/>
            <ellipse cx="24" cy="11" rx="5.5" ry="2.3" fill="var(--pc-icon-top)"/>
            <ellipse cx="24" cy="11.2" rx="3.9" ry="1.6" fill="var(--pc-icon-deep)"/>
            <path d="M19.6 16.5c-1.1 2.8-1.4 5.6-0.9 8.5" fill="none" stroke="var(--pc-icon-top)" stroke-width="1.6" stroke-linecap="round" opacity="0.8"/>
        `, attrs);
    }

    if (appType === 'vessel-v2' || appType === 'vessel-v3') {
        return svg(size, `
            <ellipse cx="27" cy="40.5" rx="9" ry="2" fill="var(--pc-icon-deep)" opacity="0.22"/>
            <path d="M23 12c0 3.6-2.7 5.9-2.7 10.4c0 6.3 3.6 9 3.6 12.1h8.2c0-3.1 3.6-5.8 3.6-12.1c0-4.5-2.7-6.8-2.7-10.4z" fill="var(--pc-icon-mid)"/>
            <ellipse cx="27.5" cy="12" rx="5" ry="2.1" fill="var(--pc-icon-top)"/>
            <ellipse cx="27.5" cy="12.2" rx="3.5" ry="1.5" fill="var(--pc-icon-deep)"/>
            <path d="M14.5 10.5c0 4.5-3.4 7-3.4 12c0 6.5 4 9.5 4 13.5" fill="none" stroke="var(--pc-icon-mid)" stroke-width="1.6" stroke-dasharray="3 3" stroke-linecap="round"/>
            <path d="M5.5 20.5l10 5" stroke="var(--app-color)" stroke-width="1.4" stroke-linecap="round"/>
            <rect x="4.2" y="19.2" width="2.6" height="2.6" rx="0.6" fill="var(--app-color)"/>
            <rect x="14.2" y="24.2" width="2.6" height="2.6" rx="0.6" fill="var(--app-color)"/>
            <circle cx="14.5" cy="10.5" r="2.2" fill="var(--app-color)"/>
            <circle cx="11.1" cy="22.5" r="2.2" fill="var(--app-color)"/>
            <circle cx="15.1" cy="36" r="2.2" fill="var(--app-color)"/>
        `, attrs);
    }

    if (appType === 'castform') {
        return svg(size, `
            <polygon points="24,7 40,15 24,23 8,15" fill="var(--pc-icon-top)"/>
            <polygon points="8,15 24,23 24,39 8,31" fill="var(--pc-icon-mid)"/>
            <polygon points="40,15 24,23 24,39 40,31" fill="var(--pc-icon-side)"/>
            <ellipse cx="24" cy="15" rx="6.5" ry="3.2" fill="var(--pc-icon-deep)"/>
            <path d="M24 7v16M24 23v16" stroke="var(--pc-icon-seam)" stroke-width="1.6"/>
            <polygon points="13,36 17,38 13,40 9,38" fill="var(--pc-icon-top)" stroke="var(--pc-icon-seam)" stroke-width="1.2"/>
            <polygon points="9,38 13,40 13,44 9,42" fill="var(--pc-icon-mid)" stroke="var(--pc-icon-seam)" stroke-width="1.2"/>
            <polygon points="17,38 13,40 13,44 17,42" fill="var(--pc-icon-side)" stroke="var(--pc-icon-seam)" stroke-width="1.2"/>
        `, attrs);
    }

    return svg(size, `
        <path d="M9 32.5a15 6 0 0 0 30 0v3.4a15 6 0 0 1-30 0z" fill="var(--pc-icon-side)"/>
        <ellipse cx="24" cy="32.5" rx="15" ry="6" fill="var(--pc-icon-top)"/>
        <ellipse cx="24" cy="33" rx="9.6" ry="3.6" fill="var(--pc-icon-mid)" opacity="0.55"/>
        <path d="M13.5 20.5c0 7 4.1 10.9 10.5 10.9s10.5-3.9 10.5-10.9a10.5 4.4 0 0 1-21 0z" fill="var(--pc-icon-mid)" stroke="var(--pc-icon-seam)" stroke-width="1.6"/>
        <ellipse cx="24" cy="20.5" rx="10.5" ry="4.4" fill="var(--pc-icon-top)" stroke="var(--pc-icon-seam)" stroke-width="1.2"/>
        <ellipse cx="24" cy="20.8" rx="7.6" ry="3" fill="var(--pc-icon-deep)"/>
    `, attrs);
}

function signatureIcon(appType, size, safe) {
    const color = APP_COLORS[appType];
    const glow = `sig-glow-${appType}-${safe}`;
    const accent = `sig-accent-${appType}-${safe}`;

    if (appType === 'handle') {
        return svg(size, `
            <defs>
                ${gradient(glow, [
                    { color: color.light },
                    { offset: '0.45', color: color.base },
                    { offset: '1', color: color.dark }
                ], 'x1="9" y1="8" x2="40" y2="40"')}
                ${gradient(accent, [
                    { color: '#FFFFFF', opacity: '0.78' },
                    { offset: '1', color: color.light, opacity: '0.16' }
                ], 'x1="11" y1="13" x2="30" y2="25"')}
            </defs>
            <ellipse cx="24" cy="40" rx="15" ry="4" fill="#000" opacity="0.10"/>
            <path d="M14.5 16.5c10-9.5 25.5-0.5 25.5 10.5c0 10.6-13.2 16.3-22.5 8.6" stroke="url(#${glow})" stroke-width="6" stroke-linecap="round"/>
            <path d="M14.8 16.3c7.6-3.7 14.7-2.7 20.2 3.3" stroke="url(#${accent})" stroke-width="2.2" stroke-linecap="round"/>
            <circle cx="14.5" cy="16.5" r="4.2" fill="${color.base}"/>
            <circle cx="17.5" cy="35.6" r="4.2" fill="${color.dark}"/>
            <path d="M11 12.5h8" stroke="#FFFFFF" stroke-opacity="0.55" stroke-width="2" stroke-linecap="round"/>
            <path d="M14 31.7h8" stroke="#FFFFFF" stroke-opacity="0.45" stroke-width="2" stroke-linecap="round"/>
        `);
    }

    if (appType === 'vessel') {
        return svg(size, `
            <defs>
                ${gradient(glow, [
                    { color: color.light },
                    { offset: '1', color: color.base }
                ], 'x1="12" y1="8" x2="36" y2="42"')}
                ${gradient(accent, [
                    { color: color.dark },
                    { offset: '1', color: color.base }
                ], 'x1="26" y1="16" x2="34" y2="39"')}
            </defs>
            <ellipse cx="24" cy="40" rx="15" ry="4" fill="#000" opacity="0.10"/>
            <path d="M14 10c9 3.1 14.8 9.8 18.5 20.2c-2.5 5.9-6.1 8.8-10.8 8.8H18c-3.2 0-5.2-2.6-4.3-5.7c1.9-6.5 6.5-8.5 5.4-13.9c-0.7-3.7-3.3-6.7-5.1-9.4z" fill="url(#${glow})"/>
            <path d="M27.2 20c2.4 3 4.2 6.4 5.3 10.2c-2.3 5.5-5.5 8.4-9.7 8.8c1.7-4.4 2.7-8.4 3.1-12.2c0.3-2.4 0.7-4.7 1.3-6.8z" fill="url(#${accent})" opacity="0.55"/>
            <path d="M17.8 13.6c4.2 1.3 7.6 4 10.3 8.2" stroke="#FFFFFF" stroke-opacity="0.42" stroke-width="2.3" stroke-linecap="round"/>
            <circle cx="14" cy="10" r="2.4" fill="#FFFFFF" opacity="0.75"/>
        `);
    }

    if (appType === 'vessel-v2' || appType === 'vessel-v3') {
        return svg(size, `
            <defs>
                ${gradient(glow, [
                    { color: color.light },
                    { offset: '0.65', color: color.base },
                    { offset: '1', color: color.dark }
                ], 'x1="9" y1="8" x2="35" y2="42"')}
                ${gradient(accent, [
                    { color: '#FFE7B8' },
                    { offset: '1', color: '#F59E0B' }
                ], 'x1="33" y1="7" x2="43" y2="18"')}
            </defs>
            <ellipse cx="24" cy="40.5" rx="15" ry="3.8" fill="#000" opacity="0.10"/>
            <path d="M11 39V8" stroke="#FFFFFF" stroke-opacity="0.45" stroke-width="1.7" stroke-dasharray="3 3"/>
            <path d="M11 39c5.8-0.9 8.3-4.3 7.2-8.4c-1.4-5.1 3.1-10.4 12.8-13.8" stroke="url(#${glow})" stroke-width="5.5" stroke-linecap="round"/>
            <path d="M18.6 30.5c4.9 0 10.1 2.1 12 5.3c-2 2.5-5 3.9-8.9 3.9h-3.1c-2.8 0-5-2.2-5-5c0-2.1 1.8-3.8 5-4.2z" fill="url(#${glow})" opacity="0.92"/>
            <circle cx="11" cy="39" r="2.2" fill="#FFFFFF"/>
            <circle cx="18" cy="30.5" r="2.2" fill="#FFFFFF"/>
            <circle cx="31" cy="16.8" r="2.2" fill="#FFFFFF"/>
            <path d="M36 7l7 7l-7 7l-7-7l7-7z" fill="url(#${accent})"/>
            <path d="M33.4 17l-3.2 5.5l5.5-3.2" fill="#6B4A13" opacity="0.7"/>
        `);
    }

    if (appType === 'castform') {
        return svg(size, `
            <defs>
                ${gradient(glow, [
                    { color: color.light },
                    { offset: '1', color: color.base }
                ], 'x1="8" y1="10" x2="40" y2="40"')}
                ${gradient(accent, [
                    { color: '#AEC7B0' },
                    { offset: '1', color: '#6E8E78' }
                ], 'x1="9" y1="15" x2="35" y2="35"')}
            </defs>
            <ellipse cx="24" cy="40" rx="16" ry="4" fill="#000" opacity="0.10"/>
            <path d="M10 16l10-5v18l-10 5V16z" fill="url(#${accent})"/>
            <path d="M38 16l-10-5v18l10 5V16z" fill="#9CB9CF"/>
            <path d="M20 11h8v18h-8z" fill="url(#${glow})"/>
            <path d="M12 35l12-6l12 6l-12 5.5L12 35z" fill="url(#${glow})"/>
            <path d="M20 18c1.6-1.2 6.4-1.2 8 0v8c-1.6 1.2-6.4 1.2-8 0v-8z" fill="#2F221C" opacity="0.20"/>
            <circle cx="19.5" cy="21" r="1.8" fill="#FFD166"/>
            <circle cx="28.5" cy="21" r="1.8" fill="#FFD166"/>
            <circle cx="19.5" cy="27" r="1.8" fill="#FFD166"/>
            <circle cx="28.5" cy="27" r="1.8" fill="#FFD166"/>
        `);
    }

    return svg(size, `
        <defs>
            ${gradient(glow, [
                { color: color.light },
                { offset: '1', color: color.base }
            ], 'x1="8" y1="9" x2="38" y2="39"')}
            ${gradient(accent, [
                { color: color.mid },
                { offset: '1', color: color.dark }
            ], 'x1="15" y1="20" x2="36" y2="40"')}
        </defs>
        <ellipse cx="24" cy="39.5" rx="16" ry="4" fill="#000" opacity="0.10"/>
        <path d="M8 27c5.3-5.6 11.7-8.4 19-8.4c5.3 0 9.6 1.4 13 4.2c-3.4 4.7-9.2 7.2-17.2 7.4C16.8 30.4 11.9 29.3 8 27z" fill="url(#${glow})"/>
        <path d="M13 30c2.5 4 6.2 6.1 11 6.1c4.9 0 8.9-2.2 12-6.5c-3.5 1.4-7.9 2.1-13.2 2.1c-3.9 0-7.1-0.6-9.8-1.7z" fill="url(#${accent})"/>
        <circle cx="16" cy="15" r="5.4" fill="url(#${glow})"/>
        <circle cx="35" cy="15" r="4.8" fill="url(#${accent})"/>
        <path d="M16 15c7.1-4.3 13.4-4.3 19 0" stroke="#FFFFFF" stroke-opacity="0.44" stroke-width="2.2" stroke-linecap="round"/>
        <ellipse cx="24" cy="27" rx="8.4" ry="2.5" fill="#FFFFFF" opacity="0.24"/>
    `);
}


/**
 * "Plate" icons for the Line interface: hairline technical drawings in one
 * ink, with the construction left visible (centre axes, ground lines,
 * parting lines, control points). No fills, no colour.
 */
function plateSvg(size, body, attrs) {
    // Hairlines stay one device pixel wide at any drawn size
    const hairline = body.replace(/<(path|rect|circle|ellipse)\b/g, '<$1 vector-effect="non-scaling-stroke"');
    return svg(size, hairline, attrs);
}

function plateIcon(appType, size) {
    const ink = 'stroke="currentColor" stroke-width="1" stroke-linecap="square" stroke-linejoin="miter" fill="none"';
    const construction = 'stroke="currentColor" stroke-width="0.6" stroke-dasharray="1.5 2" fill="none" opacity="0.7"';
    const fine = 'stroke="currentColor" stroke-width="0.6" fill="none" opacity="0.7"';
    const ground = '<path d="M4 41.5h40"/>';
    const attrs = 'class="pc-app-icon pc-app-icon-plate"';

    if (appType === 'handle') {
        // Mug elevation with its handle loop and the handle's cross-section
        return plateSvg(size, `
            <g ${construction}><path d="M20 6v37"/><path d="M33 26.5h9"/></g>
            <g ${ink}>
                ${ground}
                <path d="M11 14h18l-1.6 27.5H12.6z"/>
                <path d="M28.5 18.5h4.5c3.9 0 6.5 2.7 6.5 6.5s-2.6 6.5-6.5 6.5h-4.9"/>
                <path d="M28.3 22h4.4c2 0 3.3 1.3 3.3 3s-1.3 3-3.3 3h-4.6"/>
            </g>
            <g ${fine}>
                <ellipse cx="40.5" cy="11" rx="3.2" ry="2"/>
                <path d="M38.2 12.6l-3 5.4"/>
            </g>
        `, attrs);
    }

    if (appType === 'vessel') {
        // Vessel silhouette divided into its six anatomical sections
        return plateSvg(size, `
            <g ${construction}><path d="M24 4v39"/></g>
            <g ${ink}>
                ${ground}
                <path d="M19 7h10"/>
                <path d="M19 7c0 3.5 1.2 6 1.2 8.5c0 2-3.6 3.6-6 7.3c-2 3.1-2.5 6.6-2 10.2c0.4 3.2 2.4 6.2 4.4 8.5h14.8c2-2.3 4-5.3 4.4-8.5c0.5-3.6 0-7.1-2-10.2c-2.4-3.7-6-5.3-6-7.3c0-2.5 1.2-5 1.2-8.5"/>
            </g>
            <g ${fine}>
                <path d="M19.4 10.6h9.2"/>
                <path d="M20 15.5h8"/>
                <path d="M13.6 23.5h20.8"/>
                <path d="M12.3 33h23.4"/>
                <path d="M14.6 38.5h18.8"/>
                <path d="M6 10.6h3M6 15.5h3M6 23.5h3M6 33h3M6 38.5h3"/>
            </g>
        `, attrs);
    }

    if (appType === 'vessel-v2' || appType === 'vessel-v3') {
        const v3 = appType === 'vessel-v3';
        // Half profile on its revolve axis, with anchors and Bezier handles;
        // V3 adds a pulled spout and a lid seated over the neck
        return plateSvg(size, `
            <g ${construction}><path d="M12 5v38"/></g>
            <g ${ink}>
                ${ground}
                <path d="M12 41.5h10c6-2.5 10-8 9-15c-0.8-5.5-6-8-6-13"/>
                ${v3 ? '<path d="M25 13.5c2.6-.6 5-1.8 7-3.8"/><path d="M12 10.5h14.5c0-3.2-3-5.5-7-5.5"/><path d="M15.5 5.2v-2"/>' : ''}
                <rect x="20.5" y="40" width="3" height="3"/>
                <rect x="29.5" y="25" width="3" height="3"/>
                <rect x="23.5" y="12" width="3" height="3"/>
            </g>
            <g ${fine}>
                <path d="M31 26.5l3.5-6M31 26.5l-1.8 6"/>
                <circle cx="34.8" cy="20" r="1.2"/>
                <circle cx="29" cy="33" r="1.2"/>
            </g>
        `, attrs);
    }

    if (appType === 'castform') {
        // Mold in section: three parts on parting lines, the vessel cavity,
        // registration keys and the pour opening
        return plateSvg(size, `
            <g ${construction}><path d="M24 3v41"/></g>
            <g ${ink}>
                <path d="M6 9h36v30H6z"/>
                <path d="M17 9v30M31 9v30"/>
                <path d="M6 33h36"/>
                <path d="M20.5 9v4c0 1-1.5 2.5-3 4.5c-1.5 2.2-2 5-1.6 8c0.4 2.6 1.6 5 3 7.5h10.2c1.4-2.5 2.6-4.9 3-7.5c0.4-3-0.1-5.8-1.6-8c-1.5-2-3-3.5-3-4.5V9"/>
            </g>
            <g ${fine}>
                <path d="M15.8 20.5a1.6 1.6 0 0 1 2.4 0M15.8 27a1.6 1.6 0 0 1 2.4 0"/>
                <path d="M29.8 20.5a1.6 1.6 0 0 1 2.4 0M29.8 27a1.6 1.6 0 0 1 2.4 0"/>
                <path d="M3 9h2M3 39h2M43 9h2M43 39h2"/>
            </g>
        `, attrs);
    }

    // Dinnerware: a place setting in elevation (plate, bowl, cup)
    return plateSvg(size, `
        <g ${construction}><path d="M19 12v31M38 20v23"/></g>
        <g ${ink}>
            ${ground}
            <path d="M4 37.5h30l-2.5 3h-25z"/>
            <path d="M9 24.5h20c-0.6 5.5-4 9.5-10 9.5s-9.4-4-10-9.5z"/>
            <path d="M16 34h6"/>
            <path d="M32.5 26h11l-1.2 11.5h-8.6z"/>
            <path d="M43.2 29h1.6c1.6 0 2.4 1 2.4 2.5s-.8 2.5-2.4 2.5h-2"/>
        </g>
    `, attrs);
}

export function getAppIconSvg(appType, idSuffix, size = 48, variant = APP_ICON_VARIANTS.object) {
    const normalizedAppType = normalizeAppType(appType);
    const normalizedVariant = APP_ICON_VARIANTS[variant] || APP_ICON_VARIANTS.object;
    const safe = safeId(`${normalizedVariant}-${normalizedAppType}-${idSuffix || 'icon'}`);

    if (normalizedVariant === APP_ICON_VARIANTS.line) {
        return lineIcon(normalizedAppType, size);
    }

    if (normalizedVariant === APP_ICON_VARIANTS.signature) {
        return signatureIcon(normalizedAppType, size, safe);
    }

    if (normalizedVariant === APP_ICON_VARIANTS.plate) {
        return plateIcon(normalizedAppType, size);
    }

    return studioObjectIcon(normalizedAppType, size);
}
