/**
 * Protect app-relative file boundaries and capture exact working-tree fingerprints.
 * Reject traversal, devices, overlapping outputs and symlink/junction escapes.
 * Fingerprints detect changes during a run; they do not prove an existing file is an upstream original.
 */
import { lstat, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

/** Validate a portable, literal app-relative file path, not a pattern. */
export function validatePath(value) {
    if (typeof value !== 'string' || value.length === 0 || value.length > 1024) {
        throw new Error('Expected a nonempty relative file path (maximum 1024 characters).');
    }
    const parts = value.split('/');
    if (parts.some(part => !/^[a-zA-Z0-9_@+.-]+$/.test(part)
        || part === '.' || part === '..' || part.endsWith('.')
        || part.toLowerCase() === '.git'
        || /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(part))) {
        throw new Error(`Unsafe relative path: ${value}`);
    }
    return value;
}

/** Reject case-insensitive duplicate or ancestor/descendant file destinations. */
export function validateOutputs(files) {
    const seen = [];
    for (const file of files) {
        const key = validatePath(file).toLowerCase();
        if (seen.some(other => key === other || key.startsWith(`${other}/`) || other.startsWith(`${key}/`))) {
            throw new Error(`Duplicate or overlapping output: ${file}`);
        }
        seen.push(key);
    }
}

/** Resolve a file without following symlinks/junctions, including its ancestors. */
export async function resolveFile(root, relative, allowMissing = false) {
    validatePath(relative);
    const absoluteRoot = path.resolve(root);
    let ancestor = path.parse(absoluteRoot).root;
    for (const part of absoluteRoot.slice(ancestor.length).split(path.sep).filter(Boolean)) {
        ancestor = path.join(ancestor, part);
        const stat = await lstat(ancestor);
        if (stat.isSymbolicLink() || !stat.isDirectory()) {
            throw new Error(`Checkout root must not traverse a symlink/junction: ${root}`);
        }
    }
    const canonicalRoot = await realpath(absoluteRoot);
    let current = canonicalRoot;
    const parts = relative.split('/');
    for (const [index, part] of parts.entries()) {
        current = path.join(current, part);
        let stat;
        try {
            stat = await lstat(current);
        } catch (error) {
            if (error.code === 'ENOENT' && allowMissing) {
                return path.join(canonicalRoot, ...parts);
            }
            throw error;
        }
        if (stat.isSymbolicLink() || (index < parts.length - 1 ? !stat.isDirectory() : !stat.isFile())) {
            throw new Error(`Not a regular file path or unsafe link: ${relative}`);
        }
    }
    return current;
}

/** Fingerprint exact bytes from a bounded regular file; missing outputs are explicit. */
export async function fingerprint(root, relative, allowMissing = false) {
    const file = await resolveFile(root, relative, allowMissing);
    let bytes;
    try {
        const stat = await lstat(file);
        if (stat.size > 256 * 1024 * 1024) {
            throw new Error(`File exceeds fingerprint limit: ${relative}`);
        }
        bytes = await readFile(file);
    } catch (error) {
        if (error.code === 'ENOENT' && allowMissing) {
            return { path: relative, exists: false };
        }
        throw error;
    }
    return {
        path: relative,
        exists: true,
        size: bytes.length,
        sha256: createHash('sha256').update(bytes).digest('hex')
    };
}

/** Read bounded JSON without executing app-provided code. */
export async function readJson(file) {
    const stat = await lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8 * 1024 * 1024) {
        throw new Error(`Expected a regular JSON file smaller than 8 MiB: ${file}`);
    }
    return JSON.parse(await readFile(file, 'utf8'));
}
