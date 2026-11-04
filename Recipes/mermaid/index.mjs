/**
 * Obtain and validate Mermaid's original monolithic npm distribution.
 * Own all Mermaid filenames, runtime markers, pnpm-map requirements and installed-copy rules.
 * Reuse bounded archive access and evidence helpers; never execute downloaded JavaScript.
 */
import { parse } from 'acorn';
import { isDeepStrictEqual } from 'node:util';
import { member } from '../../src/archive.mjs';
import { embeddedPackages, originalTerms, sha256 } from '../../src/distribution.mjs';

/** Read the selected original release and return package-neutral artifacts and evidence. */
export async function prepare(oEntry, sVersion, { readPackage: fnReadPackage }) {
    if (oEntry.update.provider.package !== 'mermaid' || !oEntry.update.artifacts.evidence) {
        throw new Error('Mermaid requires its npm package and explicit evidence outputs.');
    }
    const oPackage = await fnReadPackage('mermaid', sVersion);
    const oFiles = oPackage.files;
    const oJs = member(oFiles, 'dist/mermaid.min.js');
    const sJs = oJs.toString('utf8');
    parse(sJs, { ecmaVersion: 'latest', sourceType: 'script' });
    if (!sJs.includes(`"${sVersion}"`) || !sJs.includes('globalThis["mermaid"]')
        || /\bimport\s*\(/.test(sJs)) {
        throw new Error('Unsupported runtime identity or dynamically loaded asset in Mermaid bundle.');
    }
    const oMapBytes = member(oFiles, 'dist/mermaid.min.js.map');
    const aEmbedded = embeddedPackages(JSON.parse(oMapBytes));
    if (!aEmbedded.length) {
        throw new Error('Mermaid source map contains no embedded-package evidence.');
    }
    const oMapped = new Map(oEntry.update.artifacts.files.map(oFile => [oFile.source, oFile.target]));
    for (const sRequired of ['dist/mermaid.min.js', 'dist/mermaid.min.js.map', 'package.json', 'README.md', 'LICENSE']) {
        if (!oMapped.has(sRequired)) {
            throw new Error(`Required Mermaid mapping is missing: ${sRequired}`);
        }
    }
    if (oMapped.get('dist/mermaid.min.js.map') !== `${oMapped.get('dist/mermaid.min.js')}.map`) {
        throw new Error('Mermaid source-map target must remain adjacent to its runtime file.');
    }
    const aOutputs = oEntry.update.artifacts.files.map(oFile => ({
        path: oFile.target, bytes: member(oFiles, oFile.source)
    }));
    return {
        name: oPackage.manifest.name,
        version: oPackage.manifest.version,
        license: oPackage.release.license,
        licenses: [{ name: oPackage.release.license, file: oMapped.get('LICENSE') }],
        embedded: aEmbedded,
        embeddedDescription: 'exact source-map version',
        terms: originalTerms(oFiles),
        outputs: aOutputs,
        evidence: { sourceMapSha256: sha256(oMapBytes) },
        checks: {
            archiveIntegrity: 'passed',
            packageIdentities: 'passed',
            javascriptSyntax: 'passed',
            sourceMapEmbeddedVersions: 'passed'
        }
    };
}

/**
 * Refuse to overwrite pre-existing patches, even when inventory still names the official version.
 * Compare every installed mapping byte-for-byte with that installed release's verified npm originals.
 */
export async function validateInstalled(oEntry, oPrevious, { vendorPath: sVendorPath, readInstalled: fnReadInstalled }) {
    const aExpectedLicenses = oPrevious.licenses.map(oLicense => ({
        ...oLicense, file: `${sVendorPath}/${oLicense.file}`
    }));
    if (!isDeepStrictEqual(oEntry.licenses?.map(({ name, file }) => ({ name, file })), aExpectedLicenses)
        || oEntry.license_file !== undefined) {
        throw new Error('Installed inventory license must match the original package and its owning-app license file.');
    }
    for (const oOutput of oPrevious.outputs) {
        if (!(await fnReadInstalled(oOutput.path)).equals(oOutput.bytes)) {
            throw new Error(`Locally modified or mismatched upstream file; refusing replacement: ${oOutput.path}`);
        }
    }
}

export default Object.freeze({ prepare, validateInstalled });
