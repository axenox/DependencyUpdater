/**
 * Discover stable Packagist releases and read commit-bound public GitHub source files.
 * Verify Git blob identities and manifest declarations without Composer installation or execution.
 * No publishing credentials, arbitrary hosts, package scripts or local Git configuration are used.
 */
import semver from 'semver';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { validatePath } from './paths.mjs';
import { originalTerms, sha256 } from './distribution.mjs';

/** Require a literal Composer vendor/package identity. */
export function validatePackage(value) {
    if (typeof value !== 'string' || !/^[a-z0-9]+(?:[_.-][a-z0-9]+)*\/[a-z0-9]+(?:[_.-][a-z0-9]+)*$/.test(value)) {
        throw new Error(`Invalid Packagist package identity: ${value}`);
    }
    return value;
}

/** Support stable numeric Composer releases, preserving their public spelling in inventories. */
export function comparableVersion(value) {
    if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*))?$/.test(value)) {
        throw new Error(`Unsupported stable Packagist version: ${value}`);
    }
    const version = value.split('.').length === 2 ? `${value}.0` : value;
    if (semver.valid(version) !== version) throw new Error(`Invalid Packagist version: ${value}`);
    return version;
}

/** Bound every public metadata/source response; never follow redirects or forward credentials. */
async function publicBytes(url, fetchImpl, maxBytes) {
    const response = await fetchImpl(url, {
        credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(60000),
        headers: { Accept: 'application/json', 'User-Agent': 'DependencyUpdater' }
    });
    if (!response.ok || !response.body) {
        throw new Error(`Public source request failed: HTTP ${response.status} for ${url}`);
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
        size += chunk.length;
        if (size > maxBytes) throw new Error(`Public source response exceeds size limit: ${url}`);
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

/** Expand Composer's documented top-level inheritance format, including explicit field removals. */
export function expandMetadata(document, name) {
    validatePackage(name);
    if (document.minified !== 'composer/2.0' || !Array.isArray(document.packages?.[name])) {
        throw new Error(`Unsupported Packagist metadata: ${name}`);
    }
    let previous = {};
    const versions = {};
    for (const delta of document.packages[name]) {
        const release = { ...previous, ...delta };
        for (const [key, value] of Object.entries(release)) {
            if (value === '__unset') delete release[key];
        }
        if (release.name !== name || typeof delta.version !== 'string' || Object.hasOwn(versions, delta.version)) {
            throw new Error(`Packagist release identity mismatch: ${name}`);
        }
        versions[delta.version] = release;
        previous = release;
    }
    return { name, versions };
}

/** Read public stable-release metadata; no dev branch metadata or Composer resolver is involved. */
export async function fetchMetadata(name, { fetchImpl = fetch } = {}) {
    validatePackage(name);
    const url = `https://repo.packagist.org/p2/${name}.json`;
    const document = JSON.parse(await publicBytes(url, fetchImpl, 16 * 1024 * 1024));
    return { metadata: expandMetadata(document, name), url };
}

/** Choose the highest stable, non-abandoned newer release in the installed major, including zero. */
export function selectVersion(metadata, installed) {
    const current = comparableVersion(installed);
    const candidates = Object.keys(metadata.versions).filter(version => {
        if (!/^\d+\.\d+(?:\.\d+)?$/.test(version)) return false;
        const normalized = comparableVersion(version);
        const release = metadata.versions[version];
        return semver.major(normalized) === semver.major(current)
            && semver.gt(normalized, current) && !release.abandoned && !release.deprecated;
    });
    candidates.sort((left, right) => semver.rcompare(comparableVersion(left), comparableVersion(right)));
    if (candidates.length > 1
        && comparableVersion(candidates[0]) === comparableVersion(candidates[1])) {
        throw new Error('Ambiguous Packagist release versions.');
    }
    return candidates[0] ?? null;
}

/** Preserve explicit single-license declarations; do not guess how multiple licenses combine. */
export function licenseDeclaration(value) {
    if (Array.isArray(value) && value.length === 1) [value] = value;
    if (typeof value !== 'string' || !value.trim()) throw new Error('Unsupported Composer license declaration.');
    return value;
}

/** Accept only exact GitHub commits with consistent Composer version/license metadata. */
export function releaseInfo(metadata, name, version) {
    const normalized = comparableVersion(version);
    const release = metadata.versions[version];
    if (!release || release.name !== name || release.version !== version
        || release.version_normalized !== `${normalized}.0`
        || release.source?.type !== 'git'
        || !/^https:\/\/github\.com\/[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+\.git$/.test(release.source.url)
        || !/^[a-f0-9]{40}$/.test(release.source.reference)) {
        throw new Error(`Unsupported Packagist release identity/source: ${name}@${version}`);
    }
    const dependencies = release.require ?? {};
    if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)
        || Object.entries(dependencies).some(([key, value]) => !key || typeof value !== 'string' || !value)) {
        throw new Error(`Invalid Composer runtime requirements: ${name}@${version}`);
    }
    return {
        version, source: release.source, license: licenseDeclaration(release.license), dependencies
    };
}

/** Read declared artifacts plus original terms/READMEs, proving each blob against a commit's Git tree. */
export function packageReader({ metadataReader = fetchMetadata, sources, fetchImpl = fetch } = {}) {
    const cache = new Map();
    return async (name, version) => {
        const key = `${name}@${version}`;
        if (!cache.has(key)) cache.set(key, (async () => {
            const { metadata } = await metadataReader(name);
            const release = releaseInfo(metadata, name, version);
            const repository = release.source.url.slice('https://github.com/'.length, -4);
            const commit = release.source.reference;
            const api = `https://api.github.com/repos/${repository}/git`;
            const identity = JSON.parse(await publicBytes(`${api}/commits/${commit}`, fetchImpl, 1024 * 1024));
            if (identity.sha !== commit || !/^[a-f0-9]{40}$/.test(identity.tree?.sha)) {
                throw new Error('GitHub commit identity mismatch.');
            }
            const tree = JSON.parse(await publicBytes(`${api}/trees/${identity.tree.sha}?recursive=1`, fetchImpl, 4 * 1024 * 1024));
            if (tree.sha !== identity.tree.sha || tree.truncated !== false
                || !Array.isArray(tree.tree) || tree.tree.length > 6000) {
                throw new Error('Incomplete GitHub source tree.');
            }
            const blobs = new Map();
            const names = new Set();
            for (const item of tree.tree) {
                validatePath(item.path);
                if (names.has(item.path.toLowerCase())) throw new Error('Duplicate GitHub source path.');
                names.add(item.path.toLowerCase());
                if (item.type === 'tree' && item.mode === '040000') continue;
                if (item.type !== 'blob' || !['100644', '100755'].includes(item.mode)
                    || !/^[a-f0-9]{40}$/.test(item.sha)
                    || !Number.isSafeInteger(item.size) || item.size < 0 || item.size > 4 * 1024 * 1024) {
                    throw new Error(`Unsupported GitHub source member: ${item.path}`);
                }
                blobs.set(item.path, item);
            }
            // Read all potential original terms, not only the license output requested by the app.
            const termPaths = originalTerms(new Map([...blobs.keys()].map(file => [file, Buffer.from('scan')])), { required: false })
                .map(term => term.path);
            const selected = [...new Set(['composer.json', ...sources, ...termPaths,
                ...[...blobs.keys()].filter(file => /^readme(?:[._-].*)?$/i.test(file.split('/').at(-1)))])].sort();
            const files = new Map();
            const evidence = [];
            let total = 0;
            for (const file of selected) {
                const blob = blobs.get(file);
                if (!blob) throw new Error(`Missing GitHub source member: ${file}`);
                const url = `https://raw.githubusercontent.com/${repository}/${commit}/${file.split('/').map(encodeURIComponent).join('/')}`;
                const bytes = await publicBytes(url, fetchImpl, 4 * 1024 * 1024);
                total += bytes.length;
                if (total > 24 * 1024 * 1024) throw new Error('Selected GitHub sources exceed size limit.');
                const gitHash = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
                if (bytes.length !== blob.size || gitHash !== blob.sha) throw new Error(`Git blob identity mismatch: ${file}`);
                files.set(file, bytes);
                evidence.push({ path: file, url, gitBlob: gitHash, sha256: sha256(bytes) });
            }
            const manifest = JSON.parse(files.get('composer.json'));
            if (manifest.name !== name || licenseDeclaration(manifest.license) !== release.license
                || !isDeepStrictEqual(manifest.require ?? {}, release.dependencies)) {
                throw new Error(`Composer manifest differs from Packagist: ${key}`);
            }
            return { release, manifest, files, evidence: { commit, tree: tree.sha, files: evidence } };
        })());
        return cache.get(key);
    };
}
