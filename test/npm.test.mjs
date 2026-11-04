import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchMetadata, releaseInfo, selectVersion } from '../src/npm.mjs';
import { metadataFixture } from '../test-support/fixtures.mjs';

test('stable same-major ignores dist-tags, prereleases, deprecated releases and newer majors', () => {
    const metadata = metadataFixture();
    assert.equal(selectVersion(metadata, '12.2.0'), '12.3.0');
    assert.equal(selectVersion(metadata, '12.3.0'), null);
    assert.equal(selectVersion(metadata, '14.0.0'), null);
    assert.equal(selectVersion(metadata, '0.1.0'), '0.9.0');
    assert.throws(() => selectVersion(metadata, '12'));
    assert.throws(() => selectVersion(metadata, '12.3.0-beta.1'));
});

test('verify release identity, fixed registry tarball and declared SHA-512', () => {
    const metadata = metadataFixture();
    assert.equal(releaseInfo(metadata, 'mermaid', '12.3.0').license, 'MIT');
    for (const mutate of [
        release => { release.name = 'other'; },
        release => { release.version = '12.1.0'; },
        release => { release.dist.tarball = 'https://other.invalid/package.tgz'; },
        release => { release.dist.integrity = 'sha512-not-an-integrity'; },
        release => { release.license = ''; },
        release => { release.dependencies = { example: 'git+https://other.invalid/code' }; }
    ]) {
        const other = structuredClone(metadata);
        mutate(other.versions['12.3.0']);
        assert.throws(() => releaseInfo(other, 'mermaid', '12.3.0'));
    }
});

test('public metadata requests have no auth, no redirects and an explicit timeout', async () => {
    const result = await fetchMetadata('mermaid', {
        fetchImpl: async (url, options) => {
            assert.equal(url, 'https://registry.npmjs.org/mermaid');
            assert.deepEqual(options.headers, { Accept: 'application/json' });
            assert.equal(options.credentials, 'omit');
            assert.equal(options.redirect, 'error');
            assert.ok(options.signal instanceof AbortSignal);
            return Response.json(metadataFixture());
        }
    });
    assert.equal(result.metadata.name, 'mermaid');
});

test('reject HTTP failures, malformed/oversized/wrong-package responses and invalid names', async () => {
    const responses = [
        new Response('missing', { status: 404 }),
        new Response('invalid json'),
        Response.json({ name: 'wrong', versions: {} }),
        Response.json({ name: 'mermaid', versions: [] })
    ];
    for (const response of responses) {
        await assert.rejects(fetchMetadata('mermaid', { fetchImpl: async () => response }));
    }
    await assert.rejects(fetchMetadata('mermaid', {
        maxBytes: 2,
        fetchImpl: async () => Response.json(metadataFixture())
    }), /exceeds/);
    await assert.rejects(fetchMetadata('../invalid'));
});

test('network/timeout failures remain errors rather than no-op plans', async () => {
    await assert.rejects(fetchMetadata('mermaid', {
        fetchImpl: async () => { throw new Error('network failed'); }
    }), /network failed/);
    await assert.rejects(fetchMetadata('mermaid', {
        timeoutMs: 1,
        fetchImpl: async (url, { signal }) => {
            await new Promise(resolve => setTimeout(resolve, 10));
            signal.throwIfAborted();
        }
    }), { name: 'TimeoutError' });
});
