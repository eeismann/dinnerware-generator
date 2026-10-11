const rawBaseUrl = import.meta.env?.BASE_URL ?? '/';

const normalizedBase = (() => {
    if (rawBaseUrl === './') {
        return './';
    }

    const trimmed = rawBaseUrl.replace(/\/+$/, '');
    return trimmed === '' ? '/' : trimmed;
})();

function joinWithBase(trimmedPath) {
    if (!trimmedPath) {
        return normalizedBase === './' ? './' : normalizedBase;
    }

    if (normalizedBase === './') {
        return `./${trimmedPath}`;
    }

    if (normalizedBase === '/') {
        return `/${trimmedPath}`;
    }

    return `${normalizedBase}/${trimmedPath}`;
}

export function resolveAppUrl(relativePath) {
    const trimmedPath = relativePath.replace(/^\/+/, '');
    return joinWithBase(trimmedPath);
}
