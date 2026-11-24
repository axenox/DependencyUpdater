/**
 * Orchestrate candidates without knowing bundle filenames or runtime formats.
 * Delegate package preparation and installed-copy validation to trusted recipes.
 * Keep inventory ownership, declared writes, baseline races and independent reconstruction shared.
 */
import { readFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { selectApps, validateInventory } from './config.mjs';
import { fingerprint, readJson, resolveFile } from './paths.mjs';
import { planUpdates, checkoutIdentity } from './planner.mjs';
import { packageReader as npmReader, compareEmbedded, sha256 } from './distribution.mjs';
import { resolveRecipe, validateRecipeResult } from './recipes.mjs';
import { fetchMetadata, packageReader } from './providers.mjs';
import { inspectLicenses, noticeText, inventoryLicenses } from './licenses.mjs';

/** Serialize evidence deterministically; preserve original artifact/license bytes separately. */
function jsonBytes(oValue) {
    return Buffer.from(`${JSON.stringify(oValue, null, 2)}\n`);
}

/** Obtain a ready-to-review candidate without modifying the source checkout. */
export async function createCandidate({
    registry: oRegistry, appId: sAppId, root: sRoot, packageName: sPackageName,
    metadataReader: fnMetadataReader = fetchMetadata, readPackage: fnReadPackage
}) {
    if (!sPackageName) {
        throw new Error('Candidate generation requires one explicit package.');
    }
    const [oApp] = selectApps(oRegistry, sAppId);
    const oMetadataCache = new Map();
    const fnMetadata = (sName, sType = 'npm') => {
        const sKey = `${sType}:${sName}`;
        if (!oMetadataCache.has(sKey)) {
            oMetadataCache.set(sKey, fnMetadataReader(sName, sType));
        }
        return oMetadataCache.get(sKey);
    };
    const oPlan = await planUpdates({
        registry: oRegistry, appId: sAppId, root: sRoot,
        packageName: sPackageName, metadataReader: fnMetadata
    });
    const oUpdate = oPlan.updates[0];
    if (oUpdate.status === 'up-to-date') {
        return { schemaVersion: 1, kind: 'no-op', plan: oPlan };
    }
    const oInventory = await readJson(await resolveFile(sRoot, oApp.inventory));
    validateInventory(oInventory, oApp.inventory);
    const oEntry = oInventory.find(oItem => oItem.name === sPackageName && oItem.update);
    const oRecipe = await resolveRecipe(oEntry);
    const fnReadOriginal = fnReadPackage ?? packageReader(oEntry, fnMetadata);
    const oPrevious = validateRecipeResult(
        await oRecipe.prepare(oEntry, oEntry.version, { readPackage: fnReadOriginal }), oEntry, oEntry.version);
    const oNext = validateRecipeResult(
        await oRecipe.prepare(oEntry, oUpdate.candidate.version, { readPackage: fnReadOriginal }),
        oEntry, oUpdate.candidate.version);
    await oRecipe.validateInstalled(oEntry, oPrevious, {
        vendorPath: oApp.vendorPath,
        readInstalled: async sPath => readFile(await resolveFile(sRoot, sPath))
    });
    const oDependencyChanges = compareEmbedded(oPrevious.embedded, oNext.embedded);
    const { packages: aPackages, review: oLicenseReview } = await inspectLicenses(
        oPrevious, oNext, fnMetadata, fnReadPackage ?? npmReader({ metadataReader: fnMetadata }));
    const aInventoryEntries = aPackages.map(oPackage => ({
        name: `npm-asset/${oPackage.name}`,
        version: oPackage.version,
        description: `Embedded in ${sPackageName}; ${oNext.embeddedDescription}; original terms in ${oEntry.update.artifacts.evidence.notices}; manual license review required`,
        licenses: inventoryLicenses(oPackage)
    }));
    const oEvidence = oEntry.update.artifacts.evidence;
    const oOldEvidenceFingerprint = oPlan.baseline.find(oFile => oFile.path === oEvidence.packages);
    if (oOldEvidenceFingerprint.exists) {
        const oOldEvidence = await readJson(await resolveFile(sRoot, oEvidence.packages));
        if (oOldEvidence.schemaVersion !== 1 || oOldEvidence.owner !== sPackageName
            || !Array.isArray(oOldEvidence.inventoryEntries)) {
            throw new Error('Invalid previous generated inventory ownership evidence.');
        }
        for (const oOldEntry of oOldEvidence.inventoryEntries) {
            const iIndex = oInventory.findIndex(oItem => isDeepStrictEqual(oItem, oOldEntry));
            if (iIndex === -1) {
                throw new Error('Previously generated embedded inventory was modified; manual review required.');
            }
            oInventory.splice(iIndex, 1);
        }
    }
    for (const oNewEntry of aInventoryEntries) {
        if (oInventory.some(oItem => oItem.name === oNewEntry.name && oItem.version === oNewEntry.version)) {
            throw new Error(`Existing inventory identity conflicts with embedded ownership: ${oNewEntry.name}@${oNewEntry.version}`);
        }
        oInventory.push(oNewEntry);
    }
    oEntry.version = oUpdate.candidate.version;
    oEntry.licenses = oNext.licenses.map(oLicense => ({
        ...oLicense, file: `${oApp.vendorPath}/${oLicense.file}`
    }));
    for (const sLegacy of ['license', 'license_file', 'license_link']) delete oEntry[sLegacy];
    const aOutputs = [...oNext.outputs, {
        path: oEvidence.packages,
        bytes: jsonBytes({
            schemaVersion: 1,
            owner: sPackageName,
            version: oEntry.version,
            artifactEvidence: oNext.evidence,
            packages: aPackages,
            licenseReview: oLicenseReview,
            inventoryEntries: aInventoryEntries
        })
    }, {
        path: oEvidence.notices,
        bytes: Buffer.from(noticeText(sPackageName, oEntry.version, oLicenseReview, aPackages))
    }, { path: oApp.inventory, bytes: jsonBytes(oInventory) }];
    const aFiles = [];
    for (const oOutput of aOutputs) {
        const oBaseline = oPlan.baseline.find(oFile => oFile.path === oOutput.path);
        if (!oBaseline) {
            throw new Error(`Undeclared generated output: ${oOutput.path}`);
        }
        const sHash = sha256(oOutput.bytes);
        if (sHash !== oBaseline.sha256) {
            aFiles.push({
                path: oOutput.path, size: oOutput.bytes.length, sha256: sHash,
                content: oOutput.bytes.toString('base64')
            });
        }
    }
    for (const oFile of oPlan.baseline) {
        if (!isDeepStrictEqual(oFile, await fingerprint(sRoot, oFile.path, !oFile.exists))) {
            throw new Error(`Target baseline changed during preparation: ${oFile.path}`);
        }
    }
    if (!isDeepStrictEqual(oPlan.target, checkoutIdentity(sRoot, oApp))) {
        throw new Error('Git baseline changed during preparation.');
    }
    return {
        schemaVersion: 1,
        kind: 'dependency-candidate',
        plan: oPlan,
        files: aFiles,
        embedded: aPackages.map(({ name, version, license, licenseSource, metadataUrl }) => ({
            name, version, license, licenseSource, metadataUrl
        })),
        licenseReview: oLicenseReview,
        dependencyChanges: oDependencyChanges,
        checks: {
            ...oNext.checks,
            upstreamLicenseFiles: 'passed',
            embeddedLicenseTexts: oLicenseReview.embeddedLicenseTexts,
            licenseApproval: 'manual-review-required',
            embeddedDowngrades: 'passed',
            powerUiIntegration: 'not-run',
            installationLicenseBom: 'not-run'
        }
    };
}

/** Reconstruct every candidate byte from current trusted configuration and official registry evidence. */
export async function verifyCandidate(oCandidate, oOptions) {
    const oExpected = await createCandidate(oOptions);
    if (!isDeepStrictEqual(oCandidate, oExpected)) {
        throw new Error('Candidate verification failed: baseline, configuration, metadata or payload was changed.');
    }
    return oExpected;
}
