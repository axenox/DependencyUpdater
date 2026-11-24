/**
 * Dispatch trusted metadata and original-file readers by provider, never by bundle name.
 * Keep npm archive semantics and Composer/Git source semantics explicit and separate.
 */
import * as npm from './npm.mjs';
import * as packagist from './packagist.mjs';
import { packageReader as npmReader } from './distribution.mjs';

/** Reject unimplemented providers before network or artifact access. */
export function provider(type) {
    if (type === 'npm') return npm;
    if (type === 'packagist') return packagist;
    throw new Error(`Unsupported provider: ${type}`);
}

/** Fetch public release metadata using the selected provider's own identity/version format. */
export function fetchMetadata(name, type = 'npm') {
    return provider(type).fetchMetadata(name);
}

/** Supply a main-package reader without changing embedded npm acquisition behavior. */
export function packageReader(entry, metadataReader) {
    if (entry.update.provider.type === 'npm') return npmReader({ metadataReader });
    return packagist.packageReader({
        metadataReader: name => metadataReader(name, 'packagist'),
        sources: entry.update.artifacts.files.map(file => file.source)
    });
}
