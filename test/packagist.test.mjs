import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
    validatePackage, comparableVersion, expandMetadata, selectVersion, releaseInfo, fetchMetadata, packageReader
} from '../src/packagist.mjs';
import { validateInventory } from '../src/config.mjs';
import { documentFixture, entryFixture, readPackage, commits } from '../test-support/php-xlsxwriter.mjs';

test('Composer identities and public numeric versions are validated without disguising them as npm', () => {
    assert.equal(validatePackage('mk-j/php_xlsxwriter'), 'mk-j/php_xlsxwriter');
    assert.equal(comparableVersion('0.39'), '0.39.0');
    for (const value of ['^0.39', 'v0.39', '0.39-beta', '0.039', 'dev-master', '0.39.0.0']) {
        assert.throws(() => comparableVersion(value));
    }
    assert.throws(() => validatePackage('mk-j/../escape'));
    const entry = entryFixture();
    assert.deepEqual(validateInventory([entry], 'includes.json'), [entry]);
    entry.name = `npm-asset/${entry.name}`;
    assert.throws(() => validateInventory([entry], 'includes.json'), /identity/);
});

test('Packagist inheritance/removal, zero-major selection, no-op and source provenance are explicit', () => {
    const document = documentFixture();
    document.packages['mk-j/php_xlsxwriter'][0].funding = [];
    document.packages['mk-j/php_xlsxwriter'][1].funding = '__unset';
    const metadata = expandMetadata(document, 'mk-j/php_xlsxwriter');
    assert.equal(Object.hasOwn(metadata.versions['0.37'], 'funding'), false);
    assert.equal(selectVersion(metadata, '0.37'), '0.39');
    assert.equal(selectVersion(metadata, '0.39'), null);
    const info = releaseInfo(metadata, metadata.name, '0.39');
    assert.equal(info.source.reference, commits['0.39']);
    assert.equal(info.license, 'MIT');
    assert.equal(Object.hasOwn(info, 'integrity'), false);
    for (const version of ['0.40-beta', '1.0', '0.38']) {
        metadata.versions[version] = { ...metadata.versions['0.39'], version, abandoned: version === '0.38' };
    }
    assert.equal(selectVersion(metadata, '0.37'), '0.39');
    for (const mutate of [
        value => { value.versions['0.39'].source.reference = 'master'; },
        value => { value.versions['0.39'].source.url = 'https://attacker.invalid/repo.git'; },
        value => { value.versions['0.39'].version_normalized = '0.40.0.0'; },
        value => { value.versions['0.39'].license = []; }
    ]) {
        const other = structuredClone(metadata);
        mutate(other);
        assert.throws(() => releaseInfo(other, metadata.name, '0.39'));
    }
    assert.throws(() => expandMetadata({ packages: {} }, metadata.name), /Unsupported/);
});

test('public metadata fetch rejects HTTP, malformed and oversized responses without forwarding credentials', async () => {
    const fetchImpl = async (url, options) => {
        assert.equal(url, 'https://repo.packagist.org/p2/mk-j/php_xlsxwriter.json');
        assert.equal(options.credentials, 'omit');
        assert.equal(options.redirect, 'error');
        assert.equal(options.headers.Authorization, undefined);
        return new Response(JSON.stringify(documentFixture()));
    };
    assert.equal((await fetchMetadata('mk-j/php_xlsxwriter', { fetchImpl })).metadata.name, 'mk-j/php_xlsxwriter');
    await assert.rejects(fetchMetadata('mk-j/php_xlsxwriter', {
        fetchImpl: async () => new Response('unavailable', { status: 503 })
    }), /HTTP 503/);
    await assert.rejects(fetchMetadata('mk-j/php_xlsxwriter', {
        fetchImpl: async () => new Response('x'.repeat(16 * 1024 * 1024 + 1))
    }), /size limit/);
});

/** Mock GitHub's commit/tree/blob responses while exercising real manifest and identity validation. */
async function sourceFixture(changeFiles = () => {}) {
    const original = await readPackage('mk-j/php_xlsxwriter', '0.39');
    original.files.set('legal/THIRD_PARTY_NOTICES.txt', Buffer.from('original sidecar terms'));
    original.files.set('README.md', Buffer.from('# License\nOriginal README terms'));
    changeFiles(original.files);
    const tree = [...original.files].map(([path, bytes]) => ({
        path, type: 'blob', mode: '100644', size: bytes.length,
        sha: createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
    }));
    const state = { corrupt: false, missing: false, truncated: false, symlink: false, wrongCommit: false };
    const fetchImpl = async (url, options) => {
        assert.equal(options.headers.Authorization, undefined);
        assert.equal(options.credentials, 'omit');
        assert.equal(options.redirect, 'error');
        if (url.includes('/git/commits/')) {
            return Response.json({ sha: state.wrongCommit ? 'c'.repeat(40) : commits['0.39'], tree: { sha: 'b'.repeat(40) } });
        }
        if (url.includes('/git/trees/')) {
            const items = structuredClone(tree);
            if (state.symlink) items[0].mode = '120000';
            return Response.json({ sha: 'b'.repeat(40), truncated: state.truncated, tree: items });
        }
        const file = url.split(`${commits['0.39']}/`)[1];
        if (state.missing) return new Response('missing', { status: 404 });
        return new Response(state.corrupt ? Buffer.from('wrong bytes') : original.files.get(file));
    };
    const options = {
        sources: ['xlsxwriter.class.php', 'LICENSE'], fetchImpl,
        metadataReader: async () => ({
            metadata: expandMetadata(documentFixture(), 'mk-j/php_xlsxwriter'), url: 'https://repo.packagist.org'
        })
    };
    return { state, options };
}

test('commit-bound reader verifies every selected Git blob and discovers supplied original terms', async () => {
    const { options } = await sourceFixture();
    const reader = packageReader(options);
    const original = await reader('mk-j/php_xlsxwriter', '0.39');
    assert.ok(original.files.has('legal/THIRD_PARTY_NOTICES.txt'));
    assert.ok(original.files.has('README.md'));
    assert.equal(original.evidence.commit, commits['0.39']);
    assert.equal(original.evidence.files.length, 5);
    assert.equal(await reader('mk-j/php_xlsxwriter', '0.39'), original);
});

test('incomplete trees, links, wrong commits, missing files and corrupt blob bytes fail explicitly', async () => {
    for (const failure of ['corrupt', 'missing', 'truncated', 'symlink', 'wrongCommit']) {
        const { state, options } = await sourceFixture();
        state[failure] = true;
        await assert.rejects(packageReader(options)('mk-j/php_xlsxwriter', '0.39'));
    }
});

test('commit-verified manifest name, main license and runtime requirements must agree with Packagist', async () => {
    for (const change of [
        value => { value.name = 'other/package'; },
        value => { value.license = 'Apache-2.0'; },
        value => { value.require = {}; }
    ]) {
        const { options } = await sourceFixture(files => {
            const manifest = JSON.parse(files.get('composer.json'));
            change(manifest);
            files.set('composer.json', Buffer.from(JSON.stringify(manifest)));
        });
        await assert.rejects(packageReader(options)('mk-j/php_xlsxwriter', '0.39'), /manifest differs/);
    }
});
