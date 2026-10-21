import { access, mkdir, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';
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
    plugins: [downloadsWriterPlugin()],
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
                'cast-form-generator': resolve(__dirname, 'cast-form-generator/index.html'),
                'stacked-mold-generator': resolve(__dirname, 'stacked-mold-generator/index.html')
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
