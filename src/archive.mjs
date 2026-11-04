/**
 * Download bounded public npm archives and verify integrity before reading their members.
 * Reject unsafe paths, links, duplicate entries and expansion limits without extracting to disk.
 * Return original bytes only; package scripts and downloaded code are never executed.
 */
import { createHash } from 'node:crypto';
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import tar from 'tar-stream';

/** Download public immutable registry bytes without forwarding credentials or redirects. */
export async function download(sUrl, { fetchImpl = fetch, maxBytes = 96 * 1024 * 1024 } = {}) {
    const oUrl = new URL(sUrl);
    if (oUrl.origin !== 'https://registry.npmjs.org' || oUrl.username || oUrl.password || oUrl.hash || oUrl.search) {
        throw new Error('Only credential-free registry.npmjs.org downloads are allowed.');
    }
    const oResponse = await fetchImpl(sUrl, {
        redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(120000)
    });
    if (!oResponse.ok || !oResponse.body) {
        throw new Error(`npm download failed: HTTP ${oResponse.status} for ${sUrl}`);
    }
    const aChunks = [];
    let iSize = 0;
    for await (const oChunk of oResponse.body) {
        iSize += oChunk.length;
        if (iSize > maxBytes) {
            throw new Error(`npm download exceeds size limit: ${sUrl}`);
        }
        aChunks.push(oChunk);
    }
    return Buffer.concat(aChunks);
}

/** Verify integrity before parsing; never extract archive-controlled paths to disk. */
export async function readArchive(oBytes, sIntegrity, {
    maxExpandedBytes = 256 * 1024 * 1024, maxMembers = 12000
} = {}) {
    const sActual = `sha512-${createHash('sha512').update(oBytes).digest('base64')}`;
    if (sActual !== sIntegrity) {
        throw new Error('Archive SHA-512 integrity mismatch.');
    }
    const oExtract = tar.extract();
    const oGunzip = createGunzip();
    const oFiles = new Map();
    const oNames = new Set();
    let iExpanded = 0;
    let iMembers = 0;
    oGunzip.on('data', oChunk => {
        iExpanded += oChunk.length;
        if (iExpanded > maxExpandedBytes) {
            oGunzip.destroy(new Error('Archive expanded size limit exceeded.'));
        }
    });
    oExtract.on('entry', (oHeader, oStream, fnNext) => {
        oStream.on('error', oError => oExtract.destroy(oError));
        const sName = oHeader.name.replace(/\/$/, '');
        const aParts = sName.split('/');
        if (++iMembers > maxMembers || aParts[0] !== 'package'
            || aParts.some(sPart => !sPart || sPart === '.' || sPart === '..'
                || /[\\:\0-\x1f]/.test(sPart))
            || !['file', 'directory'].includes(oHeader.type)
            || oNames.has(sName.toLowerCase())) {
            oStream.resume();
            oExtract.destroy(new Error(`Unsafe, duplicate or unsupported archive member: ${sName}`));
            return;
        }
        oNames.add(sName.toLowerCase());
        const aChunks = [];
        oStream.on('data', oChunk => aChunks.push(oChunk));
        oStream.on('end', () => {
            if (oHeader.type === 'file') {
                oFiles.set(aParts.slice(1).join('/'), Buffer.concat(aChunks));
            }
            fnNext();
        });
    });
    await pipeline(Readable.from([oBytes]), oGunzip, oExtract);
    return oFiles;
}

/** Fail explicitly on missing/empty original package members. */
export function member(oFiles, sName) {
    const oBytes = oFiles.get(sName);
    if (!oBytes?.length) {
        throw new Error(`Missing or empty package file: ${sName}`);
    }
    return oBytes;
}
