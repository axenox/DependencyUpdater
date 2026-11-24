/**
 * Validate trusted app registrations and declarative, untrusted inventory definitions.
 * Enforce explicit identities, versions and nonoverlapping paths before target/network work.
 * Recognize centrally registered artifact mechanisms without executing bundle-specific checks.
 */
import semver from 'semver';
import { validatePath, validateOutputs } from './paths.mjs';
import { supportsAdapter } from './recipes.mjs';
import { provider } from './providers.mjs';

/** Reject unknown fields so misspellings and executable extensions cannot be ignored. */
export function fields(value, expected, label) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
        || Object.keys(value).some(key => !expected.includes(key))
        || expected.some(key => !Object.hasOwn(value, key))) {
        throw new Error(`Invalid ${label}; expected exactly: ${expected.join(', ')}`);
    }
}

/** Validate centrally trusted registrations before selecting or accessing a target. */
export function validateApps(config) {
    fields(config, ['schemaVersion', 'apps'], 'app registry');
    if (config.schemaVersion !== 1 || !Array.isArray(config.apps)) {
        throw new Error('Unsupported app registry schema; expected schemaVersion 1 and apps array.');
    }
    const ids = new Set();
    const repositories = new Set();
    for (const app of config.apps) {
        fields(app, ['id', 'repository', 'baseBranch', 'inventory', 'vendorPath', 'enabled'], 'app registration');
        if (typeof app.id !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_.-]*$/.test(app.id)
            || typeof app.repository !== 'string'
            || !/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(app.repository)
            || typeof app.baseBranch !== 'string'
            || !/^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/.test(app.baseBranch)
            || app.baseBranch.includes('..') || app.baseBranch.includes('//')
            || app.baseBranch.endsWith('/') || app.baseBranch.endsWith('.lock')
            || typeof app.enabled !== 'boolean') {
            throw new Error('Invalid app identity, repository, branch or enabled flag.');
        }
        validatePath(app.inventory);
        validatePath(app.vendorPath);
        if (app.vendorPath.split('/').length !== 2) {
            throw new Error('vendorPath must identify the owning vendor/package.');
        }
        const id = app.id.toLowerCase();
        const repository = app.repository.toLowerCase();
        if (ids.has(id) || repositories.has(repository)) {
            throw new Error(`Duplicate app identity or repository: ${app.id}`);
        }
        ids.add(id);
        repositories.add(repository);
    }
    return config.apps;
}

/** Explicit selections may narrow the enabled app list, never expand it. */
export function selectApps(config, id) {
    const apps = validateApps(config);
    if (id === undefined) {
        return apps.filter(app => app.enabled);
    }
    const app = apps.find(item => item.id === id);
    if (!app || !app.enabled) {
        throw new Error(`Unknown or disabled app: ${id}`);
    }
    return [app];
}

/** Validate npm identity without confusing Asset-Packagist and upstream package names. */
export function validatePackage(value) {
    if (typeof value !== 'string' || value.length > 214
        || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(value)) {
        throw new Error(`Invalid npm package identity: ${value}`);
    }
    return value;
}

/** Require a canonical exact SemVer, not a range, tag or partial version. */
export function exactVersion(value) {
    if (typeof value !== 'string' || semver.valid(value) !== value) {
        throw new Error(`Expected canonical exact version: ${value}`);
    }
    return value;
}

/** Validate all managed entries before network access; retain unmanaged inventory untouched. */
export function validateInventory(inventory, inventoryPath) {
    if (!Array.isArray(inventory)) {
        throw new Error('includes.json must contain an array.');
    }
    const managed = [];
    const names = new Set();
    const outputs = [validatePath(inventoryPath)];
    for (const entry of inventory) {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
            throw new Error('Invalid inventory entry.');
        }
        if (!Object.hasOwn(entry, 'update')) {
            continue;
        }
        const update = entry.update;
        fields(update, ['schemaVersion', 'provider', 'policy', 'artifacts'], 'update definition');
        if (update.schemaVersion !== 1 || update.policy !== 'same-major') {
            throw new Error('Unsupported update schema or policy.');
        }
        fields(update.provider, ['type', 'package'], 'provider');
        const source = provider(update.provider.type);
        const packageName = source.validatePackage(update.provider.package);
        const inventoryName = update.provider.type === 'npm' ? `npm-asset/${packageName}` : packageName;
        if (entry.name !== inventoryName || names.has(entry.name)) {
            throw new Error(`Conflicting managed package identity: ${entry.name}`);
        }
        names.add(entry.name);
        if (update.provider.type === 'npm') exactVersion(entry.version);
        else source.comparableVersion(entry.version);
        if (update.provider.type === 'npm' && semver.prerelease(entry.version) !== null) {
            throw new Error(`Prerelease installed versions are unsupported: ${entry.version}`);
        }
        const artifactFields = ['adapter', 'files'];
        if (Object.hasOwn(update.artifacts ?? {}, 'evidence')) {
            artifactFields.push('evidence');
        }
        fields(update.artifacts, artifactFields, 'artifacts');
        if (!supportsAdapter(update.artifacts.adapter) || !Array.isArray(update.artifacts.files)
            || update.artifacts.files.length === 0) {
            throw new Error('Unsupported artifact definition; expected a registered adapter with explicit files.');
        }
        const sources = new Set();
        for (const file of update.artifacts.files) {
            fields(file, ['source', 'target'], 'artifact file');
            validatePath(file.source);
            validatePath(file.target);
            if (sources.has(file.source.toLowerCase())) {
                throw new Error(`Duplicate package source: ${file.source}`);
            }
            sources.add(file.source.toLowerCase());
            outputs.push(file.target);
        }
        if (update.artifacts.evidence !== undefined) {
            fields(update.artifacts.evidence, ['packages', 'notices'], 'artifact evidence');
            outputs.push(validatePath(update.artifacts.evidence.packages));
            outputs.push(validatePath(update.artifacts.evidence.notices));
        }
        managed.push(entry);
    }
    validateOutputs(outputs);
    return managed;
}
