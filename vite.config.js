import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { defineConfig } from 'vite';

const DOWNLOADS_ROUTE = '/api/downloads/';
const DOWNLOAD_SIZE_LIMIT_BYTES = 500 * 1024 * 1024;

function sanitizeDownloadFilename(filename) {
    const cleanName = basename(decodeURIComponent(filename || ''))
        .replace(/[\\/:*?"<>|]/g, '_')
        .trim();

    return cleanName || `dinnerware-export-${Date.now()}.stl`;
}

async function getAvailableDownloadPath(directory, filename) {
    const extension = extname(filename);
    const baseName = extension ? filename.slice(0, -extension.length) : filename;

    for (let index = 0; index < 1000; index++) {
        const candidateName = index === 0
            ? filename
            : `${baseName} (${index})${extension}`;
        const candidatePath = join(directory, candidateName);

        try {
            await access(candidatePath);
        } catch {
            return {
                filename: candidateName,
                path: candidatePath
            };
        }
    }

    return {
        filename,
        path: join(directory, filename)
    };
}

function readRequestBody(request) {
    return new Promise((resolveBody, rejectBody) => {
        const chunks = [];
        let totalBytes = 0;

        request.on('data', (chunk) => {
            totalBytes += chunk.length;

            if (totalBytes > DOWNLOAD_SIZE_LIMIT_BYTES) {
                rejectBody(new Error('Download is larger than the 500 MB local save limit.'));
                request.destroy();
                return;
            }

            chunks.push(chunk);
        });

        request.on('end', () => {
            resolveBody(Buffer.concat(chunks));
        });

        request.on('error', rejectBody);
    });
}

async function handleDownloadsRequest(request, response) {
    if (!request.url?.startsWith(DOWNLOADS_ROUTE)) {
        return false;
    }

    if (request.method !== 'POST') {
        response.statusCode = 405;
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ error: 'POST required' }));
        return true;
    }

    try {
        const rawFilename = request.url.slice(DOWNLOADS_ROUTE.length).split('?')[0];
        const filename = sanitizeDownloadFilename(rawFilename);
        const downloadsDirectory = join(homedir(), 'Downloads');
        const body = await readRequestBody(request);
        const target = await getAvailableDownloadPath(downloadsDirectory, filename);

        await mkdir(downloadsDirectory, { recursive: true });
        await writeFile(target.path, body);

        response.statusCode = 200;
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({
            ok: true,
            filename: target.filename,
            path: target.path
        }));
    } catch (error) {
        response.statusCode = 500;
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({
            ok: false,
            error: error.message
        }));
    }

    return true;
}

// Review comments pinned on pages during development. They're kept in
// feedback/page-comments.json so an agent can read them and work through
// them. The route exists only on the dev server (not in builds or preview).
const PAGE_COMMENTS_ROUTE = '/api/page-comments';
// Tests point this at a temporary file so they never touch the real notes
const PAGE_COMMENTS_FILE = process.env.PAGE_COMMENTS_FILE
    || resolve(__dirname, 'feedback', 'page-comments.json');

async function loadPageComments() {
    try {
        return JSON.parse(await readFile(PAGE_COMMENTS_FILE, 'utf8'));
    } catch {
        return [];
    }
}

async function savePageComments(comments) {
    await mkdir(dirname(PAGE_COMMENTS_FILE), { recursive: true });
    // Write then rename, so a reader never sees a half-written file
    const temporary = `${PAGE_COMMENTS_FILE}.${process.pid}.tmp`;
    await writeFile(temporary, `${JSON.stringify(comments, null, 2)}\n`);
    await rename(temporary, PAGE_COMMENTS_FILE);
}

function sendJson(response, status, body) {
    response.statusCode = status;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(body));
}

async function handlePageCommentsRequest(request, response) {
    const url = new URL(request.url || '/', 'http://localhost');
    if (url.pathname !== PAGE_COMMENTS_ROUTE) return false;

    try {
        const all = await loadPageComments();
        if (request.method === 'GET') {
            const page = url.searchParams.get('page');
            sendJson(response, 200, page ? all.filter(comment => comment.page === page) : all);
        } else if (request.method === 'POST') {
            const body = JSON.parse((await readRequestBody(request)).toString('utf8') || '{}');
            if (!body.text?.trim() || !body.page) {
                sendJson(response, 400, { error: 'text and page are required' });
                return true;
            }
            const comment = {
                ...body,
                text: body.text.trim(),
                id: randomUUID().slice(0, 8),
                status: 'open',
                createdAt: new Date().toISOString()
            };
            await savePageComments([...all, comment]);
            sendJson(response, 200, comment);
        } else if (request.method === 'PATCH') {
            const { id, text, status } = JSON.parse((await readRequestBody(request)).toString('utf8') || '{}');
            const next = all.map(comment => (comment.id === id
                ? { ...comment, ...(text != null ? { text } : {}), ...(status ? { status } : {}) }
                : comment));
            await savePageComments(next);
            sendJson(response, 200, next.find(comment => comment.id === id) ?? null);
        } else if (request.method === 'DELETE') {
            const id = url.searchParams.get('id');
            await savePageComments(all.filter(comment => comment.id !== id));
            sendJson(response, 200, { ok: true });
        } else {
            sendJson(response, 405, { error: 'Method not allowed' });
        }
    } catch (error) {
        sendJson(response, 500, { error: error.message });
    }
    return true;
}

function pageCommentsPlugin() {
    return {
        name: 'page-comments',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use(async (request, response, next) => {
                const handled = await handlePageCommentsRequest(request, response);
                if (!handled) next();
            });
        }
    };
}

function downloadsWriterPlugin() {
    return {
        name: 'dinnerware-downloads-writer',
        configureServer(server) {
            server.middlewares.use(async (request, response, next) => {
                const handled = await handleDownloadsRequest(request, response);
                if (!handled) next();
            });
        },
        configurePreviewServer(server) {
            server.middlewares.use(async (request, response, next) => {
                const handled = await handleDownloadsRequest(request, response);
                if (!handled) next();
            });
        }
    };
}

export default defineConfig({
    base: './',
    plugins: [downloadsWriterPlugin(), pageCommentsPlugin()],
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
        sourcemap: true,
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                dashboard: resolve(__dirname, 'dashboard.html'),
                'handle-generator': resolve(__dirname, 'handle-generator/index.html'),
                'vessel-generator': resolve(__dirname, 'vessel-generator/index.html'),
                'vessel-v2-generator': resolve(__dirname, 'vessel-v2-generator/index.html'),
                'vessel-v3-generator': resolve(__dirname, 'vessel-v3-generator/index.html'),
                'cast-form-generator': resolve(__dirname, 'cast-form-generator/index.html')
            }
        }
    },
    server: {
        port: 3000,
        open: '/dashboard.html',
        // Agent worktrees and tool output live inside the repo; watching them
        // floods the dev server with reloads
        watch: {
            ignored: ['**/.claude/**', '**/output/**', '**/.playwright-cli/**']
        }
    }
});
