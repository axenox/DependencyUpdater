/**
 * Shared license-review reporting for normalized recipe results and exact npm identities.
 * Preserve supplied upstream terms; flag changed/unknown declarations and unverified coverage.
 * Never fetch dependency archives, replace original attribution or approve legal compatibility.
 */
import semver from 'semver';
import { releaseInfo } from './npm.mjs';

/** Report declarations and upstream notices without downloading dependency archives or approving licenses. */
export async function inspectLicenses(oPrevious, oNext, fnMetadataReader) {
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
        aPackages.push({
            ...oEmbedded, license: oRelease.license, licenseSource: 'npm-registry',
            metadataUrl: sUrl
        });
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
            code: 'embedded-license-coverage-unverified',
            message: 'Original upstream license/notice files are preserved, but completeness for embedded code is not automatically verified. Review before merge.'
        });
    }
    return {
        packages: aPackages,
        review: {
            strategy: 'upstream-notices', status: 'required',
            upstreamTerms: oNext.terms,
            embeddedLicenseTexts: 'not-verified',
            changes: aChanges, warnings: aWarnings
        }
    };
}

/** Preserve supplied upstream terms together; never present metadata-only declarations as original license texts. */
export function noticeText(sName, sVersion, oReview, aPackages) {
    return `UPSTREAM LICENSE/NOTICE EVIDENCE FOR ${sName}@${sVersion}\n\n`
        + 'Manual review required. Embedded license-text completeness has not been automatically verified.\n\n'
        + oReview.upstreamTerms.map(oTerm => `${oTerm.path}\nSHA-256: ${oTerm.sha256}\n\n${oTerm.text}`).join('\n\n')
        + '\n\nEMBEDDED DECLARATIONS FROM NPM METADATA (NOT PACKAGE-SPECIFIC LICENSE TEXTS)\n\n'
        + aPackages.map(oPackage => `${oPackage.name}@${oPackage.version}: ${oPackage.license ?? 'not declared'}`).join('\n')
        + '\n\nREVIEW WARNINGS\n\n'
        + oReview.warnings.map(oWarning =>
            `${oWarning.name ? `${oWarning.name}@${oWarning.version}: ` : ''}${oWarning.message}`).join('\n')
        + '\n';
}
