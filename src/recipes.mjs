/**
 * Select trusted bundle recipes and validate their shared result contract.
 * Registrations are maintained here, never loaded from executable inventory paths.
 * Package-specific acquisition, installed-file checks and runtime checks live in Recipes.
 */
import { validateOutputs } from './paths.mjs';

const aRegistrations = [{
    provider: 'npm', package: 'mermaid', adapter: 'npm-dist',
    load: () => import('../Recipes/mermaid/index.mjs')
}];

/** Recognize only artifact mechanisms supplied by a centrally registered recipe. */
export function supportsAdapter(sAdapter) {
    return aRegistrations.some(oRegistration => oRegistration.adapter === sAdapter);
}

/** Resolve a known provider/package/adapter combination without importing app-supplied paths. */
export async function resolveRecipe(oEntry) {
    const oRegistration = aRegistrations.find(oItem =>
        oItem.provider === oEntry.update.provider.type
        && oItem.package === oEntry.update.provider.package
        && oItem.adapter === oEntry.update.artifacts.adapter);
    if (!oRegistration) {
        throw new Error(`No trusted recipe registered for ${oEntry.name} (${oEntry.update.artifacts.adapter}).`);
    }
    return (await oRegistration.load()).default;
}

/** Require actual selected identities, nonempty declared artifacts and factual recipe checks. */
export function validateRecipeResult(oResult, oEntry, sVersion) {
    if (oResult?.name !== oEntry.update.provider.package || oResult.version !== sVersion
        || typeof oResult.license !== 'string' || !oResult.license.trim()
        || !Array.isArray(oResult.outputs) || !oResult.outputs.length
        || oResult.outputs.length !== oEntry.update.artifacts.files.length
        || !Array.isArray(oResult.embedded) || !Array.isArray(oResult.terms) || !oResult.terms.length
        || !Array.isArray(oResult.licenses) || !oResult.licenses.length
        || typeof oResult.embeddedDescription !== 'string' || !oResult.embeddedDescription.trim()
        || !oResult.evidence || typeof oResult.evidence !== 'object' || Array.isArray(oResult.evidence)
        || !oResult.checks || typeof oResult.checks !== 'object' || Array.isArray(oResult.checks)) {
        throw new Error('Invalid recipe result or selected package/version mismatch.');
    }
    validateOutputs(oResult.outputs.map(oOutput => oOutput.path));
    for (const oOutput of oResult.outputs) {
        if (!Buffer.isBuffer(oOutput.bytes) || !oOutput.bytes.length
            || !oEntry.update.artifacts.files.some(oFile => oFile.target === oOutput.path)) {
            throw new Error(`Recipe produced an empty or undeclared artifact: ${oOutput.path}`);
        }
    }
    for (const oLicense of oResult.licenses) {
        if (typeof oLicense.name !== 'string' || !oLicense.name.trim()
            || !oResult.outputs.some(oOutput => oOutput.path === oLicense.file)) {
            throw new Error('Recipe license must name an original declared output file.');
        }
    }
    const aReservedChecks = [
        'upstreamLicenseFiles', 'embeddedLicenseTexts', 'licenseApproval',
        'embeddedDowngrades', 'powerUiIntegration', 'installationLicenseBom'
    ];
    if (Object.entries(oResult.checks).some(([sName, sResult]) =>
        aReservedChecks.includes(sName) || !['passed', 'not-run', 'not-verified'].includes(sResult))) {
        throw new Error('Recipe contains a failed, invalid or reserved check result.');
    }
    return oResult;
}
