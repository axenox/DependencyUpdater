/**
 * Build read-only metadata plans for explicitly registered repositories and libraries.
 * Bind version selection to Git identity and inventory/output fingerprints, rechecked before return.
 * Do not download artifacts, invoke recipes, change target files or authorize publication.
 */
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { selectApps, validateInventory } from './config.mjs';
import { fingerprint, readJson, resolveFile } from './paths.mjs';
import { fetchMetadata, releaseInfo, selectVersion, dependencyChanges } from './npm.mjs';

/** Read local Git identity without fetching, checking out, staging or executing target scripts. */
function git(root, ...args) {
    return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true }).trim();
}

/** Require the explicitly registered repository and base branch, not an arbitrary checkout. */
export function checkoutIdentity(root, app) {
    const top = git(root, 'rev-parse', '--show-toplevel');
    const canonicalTop = realpathSync.native(top);
    const canonicalRoot = realpathSync.native(path.resolve(root));
    if (canonicalTop !== canonicalRoot) {
        throw new Error('Target root must be the repository root.');
    }
    const origin = git(root, 'remote', 'get-url', 'origin');
    const match = /^(?:https:\/\/github\.com\/|git@github\.com:)([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+?)(?:\.git)?$/.exec(origin);
    if (!match || match[1].toLowerCase() !== app.repository.toLowerCase()) {
        throw new Error(`Target origin does not match registered repository: ${app.repository}`);
    }
    const branch = git(root, 'symbolic-ref', '--short', 'HEAD');
    if (branch !== app.baseBranch) {
        throw new Error(`Target branch must be ${app.baseBranch}, found ${branch}`);
    }
    return { repository: app.repository, branch, commit: git(root, 'rev-parse', 'HEAD') };
}

/** Produce metadata-only plans, bound to working-tree fingerprints, without target writes. */
export async function planUpdates({ registry, appId, root, packageName, metadataReader = fetchMetadata }) {
    const [app] = selectApps(registry, appId);
    if (!appId || !app) {
        throw new Error('Planning requires an explicit enabled --app.');
    }
    const target = checkoutIdentity(root, app);
    const inventoryFile = await resolveFile(root, app.inventory);
    const before = await fingerprint(root, app.inventory);
    const inventory = await readJson(inventoryFile);
    const managed = validateInventory(inventory, app.inventory);
    const selected = packageName === undefined ? managed : managed.filter(entry => entry.name === packageName);
    if (packageName !== undefined && selected.length === 0) {
        throw new Error(`Package has no valid update definition: ${packageName}`);
    }
    const files = [before];
    for (const entry of managed) {
        for (const file of entry.update.artifacts.files) {
            files.push(await fingerprint(root, file.target, true));
        }
        for (const output of Object.values(entry.update.artifacts.evidence ?? {})) {
            files.push(await fingerprint(root, output, true));
        }
    }
    const updates = [];
    for (const entry of selected) {
        const upstream = entry.update.provider.package;
        const { metadata, url } = await metadataReader(upstream);
        if (metadata.name !== upstream) {
            throw new Error(`npm package identity mismatch: ${upstream}`);
        }
        const current = releaseInfo(metadata, upstream, entry.version);
        const version = selectVersion(metadata, entry.version);
        const next = version === null ? null : releaseInfo(metadata, upstream, version);
        const declarations = entry.licenses?.map(license => license.name) ?? entry.license;
        const licenseReviewRequired = !isDeepStrictEqual(declarations, [current.license])
            || (next !== null && next.license !== current.license);
        updates.push({
            name: entry.name,
            provider: { type: 'npm', package: upstream, metadataUrl: url },
            policy: entry.update.policy,
            status: next === null ? 'up-to-date' : 'update-available',
            installed: current,
            candidate: next,
            licenseReviewRequired,
            dependencyDeclarationsChanged: next !== null
                && !isDeepStrictEqual(current.dependencies, next.dependencies),
            dependencyDeclarationChanges: next === null ? { added: [], removed: [], changed: [] }
                : dependencyChanges(current.dependencies, next.dependencies),
            artifacts: entry.update.artifacts,
            checks: {
                registryMetadata: 'passed',
                archiveIntegrity: 'not-run',
                artifactVersions: 'not-run',
                embeddedDependencies: 'not-run',
                licenseTexts: 'not-run',
                powerUiIntegration: 'not-run'
            }
        });
    }
    for (const file of files) {
        if (!isDeepStrictEqual(file, await fingerprint(root, file.path, !file.exists))) {
            throw new Error(`Target baseline changed during planning: ${file.path}`);
        }
    }
    if (!isDeepStrictEqual(target, checkoutIdentity(root, app))) {
        throw new Error('Git baseline changed during planning.');
    }
    return {
        schemaVersion: 1,
        kind: 'metadata-plan',
        app: app.id,
        target,
        inventorySource: 'working-tree',
        baseline: files,
        updates,
        notice: 'Metadata only: no artifact downloaded, verified, applied or approved for publication.'
    };
}
