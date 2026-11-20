/**
 * Shared license-review reporting for normalized recipe results and exact npm identities.
 * Reuse exactly mapped upstream terms or read integrity-checked archives of embedded identities only.
 * Preserve original bytes/provenance, flag gaps and contradictions; never approve legal compatibility.
 */
import semver from 'semver';
import { releaseInfo } from './npm.mjs';
import { originalTerms, sha256 } from './distribution.mjs';

/** Collect originals for actual embedded versions, never their recursive dependency tree. */
export async function inspectLicenses(oPrevious, oNext, fnMetadataReader, fnReadPackage) {
    const aPackages = [];
    const aChanges = [];
    const aWarnings = [];
    if (oPrevious.license !== oNext.license) {
        aChanges.push({
            name: oNext.name,
            previousVersion: oPrevious.version, version: oNext.version,
            previousLicense: oPrevious.license, license: oNext.license
        });
    }
    for (const oEmbedded of oNext.embedded) {
        const { metadata: oMetadata, url: sUrl } = await fnMetadataReader(oEmbedded.name);
        const oRelease = releaseInfo(oMetadata, oEmbedded.name, oEmbedded.version, { allowMissingLicense: true });
        const oSupplied = oNext.embeddedTerms?.find(oTerms =>
            oTerms.name === oEmbedded.name && oTerms.version === oEmbedded.version);
        let aTerms;
        let oProvenance;
        let oManifestLicense = null;
        if (oSupplied) {
            const { metadata: oMainMetadata } = await fnMetadataReader(oNext.name);
            const oMain = releaseInfo(oMainMetadata, oNext.name, oNext.version);
            if (oSupplied.provenance?.tarball !== oMain.tarball
                || oSupplied.provenance?.integrity !== oMain.integrity
                || !oSupplied.terms?.length
                || oSupplied.terms.some(oTerm => !oEmbedded.sources?.includes(oTerm.path)
                    || typeof oTerm.bytesBase64 !== 'string'
                    || !Buffer.from(oTerm.bytesBase64, 'base64').length
                    || sha256(Buffer.from(oTerm.bytesBase64, 'base64')) !== oTerm.sha256
                    || Buffer.from(oTerm.bytesBase64, 'base64').toString('utf8') !== oTerm.text)) {
                throw new Error(`Invalid exact upstream terms mapping: ${oEmbedded.name}@${oEmbedded.version}`);
            }
            aTerms = oSupplied.terms;
            oProvenance = { ...oSupplied.provenance, source: 'upstream-exact-mapping' };
        } else {
            const oOriginal = await fnReadPackage(oEmbedded.name, oEmbedded.version, { embedded: true });
            if (oOriginal.manifest.name !== oEmbedded.name || oOriginal.manifest.version !== oEmbedded.version
                || oOriginal.release.tarball !== oRelease.tarball || oOriginal.release.integrity !== oRelease.integrity) {
                throw new Error(`Embedded original identity/provenance mismatch: ${oEmbedded.name}@${oEmbedded.version}`);
            }
            oManifestLicense = oOriginal.manifest.license ?? null;
            if (oManifestLicense !== oRelease.license) {
                aWarnings.push({
                    code: 'contradictory-license-declarations', name: oEmbedded.name, version: oEmbedded.version,
                    registryLicense: oRelease.license, manifestLicense: oManifestLicense,
                    message: `Registry declaration ${JSON.stringify(oRelease.license)} differs from original manifest declaration ${JSON.stringify(oManifestLicense)}; review both, no declaration inferred from text.`
                });
            }
            aTerms = originalTerms(oOriginal.files, { required: false });
            oProvenance = {
                source: 'exact-npm-archive', tarball: oRelease.tarball, integrity: oRelease.integrity,
                manifestPath: 'package.json', manifestSha256: sha256(oOriginal.files.get('package.json'))
            };
        }
        aPackages.push({
            ...oEmbedded, license: oRelease.license, licenseSource: 'npm-registry',
            metadataUrl: sUrl, manifestLicense: oManifestLicense, manifestLicenseChecked: !oSupplied,
            terms: aTerms, termProvenance: oProvenance
        });
        if (!aTerms.length) {
            aWarnings.push({
                code: 'missing-original-license-text', name: oEmbedded.name, version: oEmbedded.version,
                message: 'Exact original package contains no license/notice/copyright files or relevant README terms; manual investigation required.'
            });
        } else if (aTerms.every(oTerm => /(?:^|\/)readme(?:[._-].*)?$/i.test(oTerm.path))) {
            aWarnings.push({
                code: 'readme-only-original-terms', name: oEmbedded.name, version: oEmbedded.version,
                message: 'Only original README terms were found; review whether they supply the required full terms.'
            });
        }
        if (oRelease.license === null) {
            aWarnings.push({
                code: 'missing-license-declaration', name: oEmbedded.name, version: oEmbedded.version,
                message: 'npm metadata omits the license declaration; manual investigation required.'
            });
        }
        const oOldPackage = oPrevious.embedded
            .filter(oOld => oOld.name === oEmbedded.name && semver.lte(oOld.version, oEmbedded.version))
            .sort((oLeft, oRight) => semver.compare(oLeft.version, oRight.version)).at(-1);
        if (oOldPackage) {
            const oOldRelease = releaseInfo(oMetadata, oOldPackage.name, oOldPackage.version, { allowMissingLicense: true });
            if (oOldRelease.license !== oRelease.license) {
                aChanges.push({
                    name: oEmbedded.name, previousVersion: oOldPackage.version, version: oEmbedded.version,
                    previousLicense: oOldRelease.license, license: oRelease.license
                });
            }
        }
    }
    if (aPackages.length) {
        aWarnings.push({
            code: 'original-terms-require-review',
            message: 'Collecting original files for exact embedded identities is not proof of legal completeness, compatibility or approval. Review before merge.'
        });
    }
    return {
        packages: aPackages,
        review: {
            strategy: 'exact-embedded-originals', status: 'required',
            upstreamTerms: oNext.terms,
            embeddedLicenseTexts: aPackages.every(oPackage => oPackage.terms.length)
                ? 'original-files-collected' : 'missing-original-files',
            changes: aChanges, warnings: aWarnings
        }
    };
}

/** Preserve supplied upstream terms together; never present metadata-only declarations as original license texts. */
export function noticeText(sName, sVersion, oReview, aPackages) {
    return `UPSTREAM LICENSE/NOTICE EVIDENCE FOR ${sName}@${sVersion}\n\n`
        + 'Manual review required. Embedded license-text completeness has not been automatically verified.\n\n'
        + oReview.upstreamTerms.map(oTerm => `${oTerm.path}\nSHA-256: ${oTerm.sha256}\n\n${oTerm.text}`).join('\n\n')
        + '\n\nEXACT EMBEDDED PACKAGE ORIGINAL FILES\n\n'
        + aPackages.map(oPackage =>
            `${oPackage.name}@${oPackage.version}\nRegistry declaration: ${oPackage.license ?? 'not declared'}\n`
            + `Provenance: ${JSON.stringify(oPackage.termProvenance)}\n\n`
            + (oPackage.terms.length ? oPackage.terms.map(oTerm =>
                `${oTerm.path}\nSHA-256: ${oTerm.sha256}\n\n${oTerm.text}`).join('\n\n')
                : 'MISSING ORIGINAL TERMS — manual review required.')).join('\n\n')
        + '\n\nREVIEW WARNINGS\n\n'
        + oReview.warnings.map(oWarning =>
            `${oWarning.name ? `${oWarning.name}@${oWarning.version}: ` : ''}${oWarning.message}`).join('\n')
        + '\n';
}

/** Serialize package-specific originals into the consumer's supported inline text field. */
export function inventoryLicenses(oPackage) {
    if (oPackage.license === null) return [];
    return [{
        name: oPackage.license,
        ...(oPackage.terms.length ? {
            text: oPackage.terms.map(oTerm => `${oTerm.path}\n\n${oTerm.text}`).join('\n\n')
        } : {})
    }];
}
