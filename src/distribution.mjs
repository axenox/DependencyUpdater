/**
 * Shared npm-distribution and evidence helpers, independent of any particular bundle.
 * Read verified original packages, preserve supplied terms and compare embedded versions.
 * The pnpm source-map reader is format-specific; recipes opt into it when appropriate.
 */
import semver from 'semver';
import { createHash } from 'node:crypto';
import { download, readArchive, member } from './archive.mjs';
import { fetchMetadata, releaseInfo } from './npm.mjs';
import { validatePackage, exactVersion } from './config.mjs';

/** Hash original bytes, not a minified/rebuilt substitute. */
export function sha256(oBytes) {
    return createHash('sha256').update(oBytes).digest('hex');
}

/** Resolve only source-map package identities that include an exact pnpm version. */
export function embeddedPackages(oMap) {
    if (oMap.version !== 3 || !Array.isArray(oMap.sources)
        || !Array.isArray(oMap.sourcesContent) || oMap.sources.length !== oMap.sourcesContent.length
        || oMap.sourcesContent.some(sContent => typeof sContent !== 'string')) {
        throw new Error('Incomplete source-map identity/content evidence.');
    }
    const oPackages = new Map();
    for (const sSource of oMap.sources) {
        if (typeof sSource !== 'string') {
            throw new Error('Invalid source-map source.');
        }
        if (!sSource.includes('node_modules/')) {
            continue;
        }
        const oMatch = /\/node_modules\/\.pnpm\/((?:@[^/+]+[+])?[^/@]+)@([^/]+)\/node_modules\/((?:@[^/]+\/)?[^/]+)\//.exec(sSource);
        if (!oMatch) {
            throw new Error(`Source-map dependency has no exact package identity: ${sSource}`);
        }
        const sName = oMatch[1].replace('+', '/');
        const sVersion = oMatch[2].split('_')[0];
        validatePackage(sName);
        exactVersion(sVersion);
        if (oMatch[3] !== sName) {
            throw new Error(`Source-map package identity mismatch: ${sSource}`);
        }
        const sKey = `${sName}@${sVersion}`;
        if (!oPackages.has(sKey)) {
            oPackages.set(sKey, { name: sName, version: sVersion, sources: [] });
        }
        oPackages.get(sKey).sources.push(sSource);
    }
    return [...oPackages.values()].sort((oLeft, oRight) =>
        `${oLeft.name}@${oLeft.version}`.localeCompare(`${oRight.name}@${oRight.version}`, 'en'));
}

/** Preserve every license/notice/copyright file published in a package, including nested notices. */
export function originalTerms(oFiles) {
    const aTerms = [...oFiles].filter(([sName]) =>
        /^(?:licen[cs]e(?:s)?|copying|copyright(?:notice)?|notice(?:s)?|(?:third|3rd)[-_]?party[-_]?(?:licen[cs]es?|notices?))(?:[._-].*)?$/i.test(sName.split('/').at(-1))
        || /\.(?:licen[cs]es?|notices?|legal)(?:\.(?:txt|md|text))?$/i.test(sName.split('/').at(-1)));
    if (!aTerms.length) {
        const oReadme = oFiles.get('README.md');
        const sReadme = oReadme?.toString('utf8') ?? '';
        if (/\n#{1,6}\s+Licen[cs]e\s*\r?\n/i.test(sReadme)
            && /Copyright \(c\)/i.test(sReadme)
            && sReadme.includes('Permission is hereby granted, free of charge')
            && /THE SOFTWARE IS PROVIDED ['"]AS IS['"]/.test(sReadme)) {
            aTerms.push(['README.md', oReadme]);
        } else {
            throw new Error('Package has no original license/notice files or complete recognized README license section.');
        }
    }
    if (aTerms.some(([, oBytes]) => !oBytes.length)) {
        throw new Error('Package contains an empty license/notice file.');
    }
    return aTerms.sort(([sLeft], [sRight]) => sLeft.localeCompare(sRight, 'en'))
        .map(([sPath, oBytes]) => ({ path: sPath, sha256: sha256(oBytes), text: oBytes.toString('utf8') }));
}

/** Report structural changes; reject newly introduced versions below a package's previous minimum. */
export function compareEmbedded(aPrevious, aNext) {
    const aOldNames = [...new Set(aPrevious.map(oPackage => oPackage.name))].sort();
    const aNewNames = [...new Set(aNext.map(oPackage => oPackage.name))].sort();
    const aChanged = [];
    for (const sName of aOldNames.filter(sName => aNewNames.includes(sName))) {
        const aOld = aPrevious.filter(oPackage => oPackage.name === sName).map(oPackage => oPackage.version).sort(semver.compare);
        const aNew = aNext.filter(oPackage => oPackage.name === sName).map(oPackage => oPackage.version).sort(semver.compare);
        if (aNew.some(sVersion => !aOld.includes(sVersion) && semver.lt(sVersion, aOld[0]))) {
            throw new Error(`Embedded dependency downgrade: ${sName}`);
        }
        if (JSON.stringify(aOld) !== JSON.stringify(aNew)) {
            aChanged.push({ name: sName, previous: aOld, next: aNew });
        }
    }
    return {
        added: aNext.filter(oPackage => !aOldNames.includes(oPackage.name)).map(({ name, version }) => ({ name, version })),
        removed: aPrevious.filter(oPackage => !aNewNames.includes(oPackage.name)).map(({ name, version }) => ({ name, version })),
        changed: aChanged
    };
}

/** Obtain original registry packages; lifecycle scripts and package code are never executed. */
export function packageReader({ metadataReader = fetchMetadata, downloader = download } = {}) {
    const oCache = new Map();
    const oMetadataCache = new Map();
    return async (sName, sVersion) => {
        const sKey = `${sName}@${sVersion}`;
        if (!oCache.has(sKey)) {
            oCache.set(sKey, (async () => {
                if (!oMetadataCache.has(sName)) {
                    oMetadataCache.set(sName, metadataReader(sName));
                }
                const { metadata: oMetadata } = await oMetadataCache.get(sName);
                const oRelease = releaseInfo(oMetadata, sName, sVersion);
                const oFiles = await readArchive(await downloader(oRelease.tarball), oRelease.integrity);
                const oManifest = JSON.parse(member(oFiles, 'package.json'));
                if (oManifest.name !== sName || oManifest.version !== sVersion || oManifest.license !== oRelease.license) {
                    throw new Error(`Archive manifest differs from registry: ${sKey}`);
                }
                return { release: oRelease, files: oFiles, manifest: oManifest };
            })());
        }
        return oCache.get(sKey);
    };
}
