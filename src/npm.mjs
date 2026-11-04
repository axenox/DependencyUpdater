/**
 * Read bounded public npm metadata and select stable releases under the shared version policy.
 * Validate exact release provenance and report declared dependency-range changes.
 * Registry declarations are metadata, not proof of downloaded bytes or embedded runtime versions.
 */
import semver from 'semver';
import { exactVersion, validatePackage } from './config.mjs';

const REGISTRY = 'https://registry.npmjs.org/';

/** Report added, removed and changed dependency declarations for any npm package, without blocking them. */
export function dependencyChanges(oPrevious, oNext) {
    return {
        added: Object.keys(oNext).filter(sName => !Object.hasOwn(oPrevious, sName))
            .sort().map(sName => ({ name: sName, next: oNext[sName] })),
        removed: Object.keys(oPrevious).filter(sName => !Object.hasOwn(oNext, sName))
            .sort().map(sName => ({ name: sName, previous: oPrevious[sName] })),
        changed: Object.keys(oPrevious).filter(sName => Object.hasOwn(oNext, sName) && oPrevious[sName] !== oNext[sName])
            .sort().map(sName => ({ name: sName, previous: oPrevious[sName], next: oNext[sName] }))
    };
}

/** Read only public npm metadata with bounded time/bytes and no credential or redirect forwarding. */
export async function fetchMetadata(packageName, { fetchImpl = fetch, timeoutMs = 30000, maxBytes = 32 * 1024 * 1024 } = {}) {
    validatePackage(packageName);
    const url = `${REGISTRY}${encodeURIComponent(packageName)}`;
    const response = await fetchImpl(url, {
        headers: { Accept: 'application/json' },
        credentials: 'omit',
        redirect: 'error',
        signal: AbortSignal.timeout(timeoutMs)
    });
    if (!response.ok || !response.body) {
        throw new Error(`npm metadata request failed for ${packageName}: HTTP ${response.status}`);
    }
    const chunks = [];
    let size = 0;
    for await (const chunk of response.body) {
        size += chunk.length;
        if (size > maxBytes) {
            throw new Error(`npm metadata exceeds ${maxBytes} bytes: ${packageName}`);
        }
        chunks.push(chunk);
    }
    const metadata = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (metadata.name !== packageName || !metadata.versions
        || typeof metadata.versions !== 'object' || Array.isArray(metadata.versions)) {
        throw new Error(`npm package identity or versions mismatch: ${packageName}`);
    }
    return { metadata, url };
}

/** Choose the highest stable, non-deprecated newer release in the installed major, including zero. */
export function selectVersion(metadata, installed) {
    exactVersion(installed);
    if (semver.prerelease(installed) !== null) {
        throw new Error('Prerelease installed versions are unsupported.');
    }
    const candidates = Object.keys(metadata.versions).filter(version =>
        semver.valid(version) === version
        && semver.prerelease(version) === null
        && semver.major(version) === semver.major(installed)
        && semver.gt(version, installed)
        && !metadata.versions[version]?.deprecated);
    candidates.sort(semver.rcompare);
    return candidates[0] ?? null;
}

/** Validate exact registry identity and SHA-512 provenance, without claiming archive verification. */
export function releaseInfo(metadata, packageName, version, { allowMissingLicense = false } = {}) {
    exactVersion(version);
    const release = metadata.versions[version];
    if (!release || release.name !== packageName || release.version !== version) {
        throw new Error(`npm release identity mismatch: ${packageName}@${version}`);
    }
    const basename = packageName.split('/').at(-1);
    const expectedUrl = `${REGISTRY}${packageName}/-/${basename}-${version}.tgz`;
    if (release.dist?.tarball !== expectedUrl
        || typeof release.dist.integrity !== 'string'
        || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(release.dist.integrity)) {
        throw new Error(`Unsupported tarball origin or SHA-512 integrity: ${packageName}@${version}`);
    }
    if (!(allowMissingLicense && release.license === undefined)
        && (typeof release.license !== 'string' || !release.license.trim())) {
        throw new Error(`Missing npm license declaration: ${packageName}@${version}`);
    }
    const dependencies = release.dependencies ?? {};
    if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)
        || Object.entries(dependencies).some(([name, range]) => {
            validatePackage(name);
            return typeof range !== 'string' || !semver.validRange(range);
        })) {
        throw new Error(`Unsupported runtime dependency declarations: ${packageName}@${version}`);
    }
    return {
        version,
        tarball: release.dist.tarball,
        integrity: release.dist.integrity,
        license: release.license ?? null,
        dependencies
    };
}
