/**
 * Minimal ZIP writer for bundling exported STL files into one download.
 * Deflates with the platform CompressionStream when available, otherwise
 * stores entries uncompressed. No ZIP64: entries and archive stay < 4 GB.
 */

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

export function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    return (crc ^ 0xffffffff) >>> 0;
}

async function compressWith(format, bytes) {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream(format));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function deflateRaw(bytes) {
    if (typeof CompressionStream === 'undefined') return null;
    try {
        return await compressWith('deflate-raw', bytes);
    } catch {
        // Older runtimes only offer zlib framing: strip its 2-byte header
        // and 4-byte Adler-32 trailer to leave the raw deflate stream.
        try {
            const zlib = await compressWith('deflate', bytes);
            return zlib.subarray(2, zlib.length - 4);
        } catch {
            return null;
        }
    }
}

function dosDateTime(date) {
    const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    return { time, day };
}

/**
 * Build a ZIP archive.
 * @param {Array<{name: string, data: Uint8Array|ArrayBuffer}>} files
 * @param {Object} [options]
 * @param {boolean} [options.compress=true]
 * @param {Date} [options.date]
 * @returns {Promise<Uint8Array>}
 */
export async function createZip(files, { compress = true, date = new Date() } = {}) {
    const encoder = new TextEncoder();
    const { time, day } = dosDateTime(date);
    const local = [];
    const central = [];
    let offset = 0;

    for (const file of files) {
        const data = file.data instanceof Uint8Array ? file.data : new Uint8Array(file.data);
        const name = encoder.encode(file.name);
        const crc = crc32(data);
        const deflated = compress ? await deflateRaw(data) : null;
        const useDeflate = deflated !== null && deflated.length < data.length;
        const body = useDeflate ? deflated : data;
        const method = useDeflate ? 8 : 0;

        const header = new DataView(new ArrayBuffer(30));
        header.setUint32(0, 0x04034b50, true);
        header.setUint16(4, 20, true);
        header.setUint16(6, 0x0800, true); // UTF-8 names
        header.setUint16(8, method, true);
        header.setUint16(10, time, true);
        header.setUint16(12, day, true);
        header.setUint32(14, crc, true);
        header.setUint32(18, body.length, true);
        header.setUint32(22, data.length, true);
        header.setUint16(26, name.length, true);
        header.setUint16(28, 0, true);
        local.push(new Uint8Array(header.buffer), name, body);

        const entry = new DataView(new ArrayBuffer(46));
        entry.setUint32(0, 0x02014b50, true);
        entry.setUint16(4, 20, true);
        entry.setUint16(6, 20, true);
        entry.setUint16(8, 0x0800, true);
        entry.setUint16(10, method, true);
        entry.setUint16(12, time, true);
        entry.setUint16(14, day, true);
        entry.setUint32(16, crc, true);
        entry.setUint32(20, body.length, true);
        entry.setUint32(24, data.length, true);
        entry.setUint16(28, name.length, true);
        entry.setUint32(42, offset, true);
        central.push(new Uint8Array(entry.buffer), name);

        offset += 30 + name.length + body.length;
    }

    const centralSize = central.reduce((sum, part) => sum + part.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true);
    end.setUint16(8, files.length, true);
    end.setUint16(10, files.length, true);
    end.setUint32(12, centralSize, true);
    end.setUint32(16, offset, true);

    const parts = [...local, ...central, new Uint8Array(end.buffer)];
    const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let position = 0;
    parts.forEach(part => { out.set(part, position); position += part.length; });
    return out;
}
