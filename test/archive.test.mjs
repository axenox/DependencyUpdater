import test from 'node:test';
import assert from 'node:assert/strict';
import tar from 'tar-stream';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { readArchive, member, download } from '../src/archive.mjs';
import { embeddedPackages, compareEmbedded, originalTerms, packageReader } from '../src/distribution.mjs';
import { dependencyChanges } from '../src/npm.mjs';

/** Create controlled archive bytes without extracting fixture-controlled paths. */
async function archive(aEntries) {
    const oPack = tar.pack();
    const aChunks = [];
    oPack.on('data', oChunk => aChunks.push(oChunk));
    const oDone = new Promise((fnResolve, fnReject) => {
        oPack.on('end', fnResolve);
        oPack.on('error', fnReject);
    });
    for (const oEntry of aEntries) {
        oPack.entry({ name: oEntry.name, type: oEntry.type ?? 'file', linkname: oEntry.linkname }, oEntry.text ?? '');
    }
    oPack.finalize();
    await oDone;
    const oBytes = gzipSync(Buffer.concat(aChunks));
    return { bytes: oBytes, integrity: `sha512-${createHash('sha512').update(oBytes).digest('base64')}` };
}

test('integrity is checked before bounded archive parsing; original bytes remain unchanged', async () => {
    const oArchive = await archive([{ name: 'package/LICENSE', text: 'original terms\n' }]);
    const oFiles = await readArchive(oArchive.bytes, oArchive.integrity);
    assert.equal(member(oFiles, 'LICENSE').toString(), 'original terms\n');
    await assert.rejects(readArchive(oArchive.bytes, 'wrong'), /integrity/);
    assert.throws(() => member(oFiles, 'missing'), /Missing/);
    await assert.rejects(readArchive(oArchive.bytes, oArchive.integrity, { maxExpandedBytes: 10 }), /size limit/);
    await assert.rejects(readArchive(oArchive.bytes, oArchive.integrity, { maxMembers: 0 }), /Unsafe/);
});

test('reject archive traversal, links, duplicate and case-duplicate members', async () => {
    for (const aEntries of [
        [{ name: 'package/../escape' }],
        [{ name: '/absolute' }],
        [{ name: 'package/a\\b' }],
        [{ name: 'package/link', type: 'symlink', linkname: '../../outside' }],
        [{ name: 'package/link', type: 'link', linkname: 'package/file' }],
        [{ name: 'package/A' }, { name: 'package/a' }]
    ]) {
        const oArchive = await archive(aEntries);
        await assert.rejects(readArchive(oArchive.bytes, oArchive.integrity), /Unsafe/);
    }
});

test('public downloads reject other origins, redirects/errors and excess bytes', async () => {
    await assert.rejects(download('https://example.invalid/file'), /Only/);
    await assert.rejects(download('https://user:password@registry.npmjs.org/file'), /Only/);
    await assert.rejects(download('https://registry.npmjs.org/file', {
        fetchImpl: async () => new Response('missing', { status: 404 })
    }), /HTTP 404/);
    await assert.rejects(download('https://registry.npmjs.org/file', {
        maxBytes: 1, fetchImpl: async () => new Response('oversized')
    }), /size limit/);
    assert.equal((await download('https://registry.npmjs.org/file', {
        fetchImpl: async (sUrl, oOptions) => {
            assert.equal(oOptions.redirect, 'error');
            assert.equal(oOptions.credentials, 'omit');
            assert.equal(oOptions.headers, undefined);
            return new Response('original');
        }
    })).toString(), 'original');
});

test('source maps identify scoped, peer-qualified and patched embedded package versions', () => {
    const oMap = {
        version: 3,
        sources: [
            '../../../node_modules/.pnpm/@scope+package@1.2.3_peer@2.0.0/node_modules/@scope/package/a.js',
            '../../../node_modules/.pnpm/plain@2.0.0_patch_hash=abc/node_modules/plain/b.js',
            '../src/mermaid.ts'
        ],
        sourcesContent: ['a', 'b', 'c']
    };
    assert.deepEqual(embeddedPackages(oMap).map(({ name, version }) => ({ name, version })), [
        { name: '@scope/package', version: '1.2.3' }, { name: 'plain', version: '2.0.0' }
    ]);
    assert.throws(() => embeddedPackages({ ...oMap, sourcesContent: [] }), /Incomplete/);
    assert.throws(() => embeddedPackages({
        version: 3, sources: ['../node_modules/unpinned/a.js'], sourcesContent: ['a']
    }), /exact package/);
});

test('embedded downgrades fail; additions/removals/changed versions are reported for PR review', () => {
    const aOld = [{ name: 'a', version: '1.0.0' }, { name: 'b', version: '2.0.0' }];
    compareEmbedded(aOld, [{ name: 'a', version: '1.1.0' }, { name: 'b', version: '2.0.0' }]);
    assert.throws(() => compareEmbedded(aOld, [{ name: 'a', version: '0.9.0' }, aOld[1]]), /downgrade/);
    assert.deepEqual(compareEmbedded(aOld, [aOld[0]]).removed, [{ name: 'b', version: '2.0.0' }]);
    assert.deepEqual(compareEmbedded(aOld, [...aOld, { name: 'c', version: '3.0.0' }]).added, [{ name: 'c', version: '3.0.0' }]);
    assert.deepEqual(compareEmbedded(aOld, [{ name: 'a', version: '1.1.0' }, aOld[1]]).changed,
        [{ name: 'a', previous: ['1.0.0'], next: ['1.1.0'] }]);
    assert.deepEqual(compareEmbedded([aOld[0], { name: 'a', version: '2.0.0' }], [aOld[0]]).changed,
        [{ name: 'a', previous: ['1.0.0', '2.0.0'], next: ['1.0.0'] }],
        'Removing a coexisting version is structural, not a downgrade of the retained version.');
});

test('preserve complete published terms and notices, not just SPDX identifiers', () => {
    assert.throws(() => originalTerms(new Map([['README.md', Buffer.from('not terms')]])), /no original/);
    const aTerms = originalTerms(new Map([
        ['LICENSE', Buffer.from('original copyright\noriginal license')],
        ['nested/NOTICE.txt', Buffer.from('original attribution')],
        ['README.md', Buffer.from('readme')]
    ]));
    assert.equal(aTerms.length, 2);
    assert.equal(aTerms[0].text, 'original copyright\noriginal license');
    assert.equal(aTerms[1].text, 'original attribution');
});

test('relevant original README sections are preserved without inferring their declaration or completeness', () => {
    const sReadme = '# Package\n\n## License\n\n(The MIT License)\n'
        + 'Copyright (c) Original author\nPermission is hereby granted, free of charge\n'
        + 'THE SOFTWARE IS PROVIDED "AS IS"\nOriginal warranty and attribution remain here.\n';
    const aTerms = originalTerms(new Map([['README.md', Buffer.from(sReadme)]]));
    assert.equal(aTerms[0].path, 'README.md');
    assert.equal(aTerms[0].text, sReadme);
    assert.equal(originalTerms(new Map([['README.md', Buffer.from('## License\nMIT')]]))[0].text, '## License\nMIT');
    assert.deepEqual(originalTerms(new Map(), { required: false }), []);
    assert.throws(() => originalTerms(new Map([['LICENSE', Buffer.alloc(0)]]), { required: false }), /empty/);
});

test('preserve aggregated upstream licenses and bundler sidecars, not unrelated files containing legal in their name', () => {
    const aTerms = originalTerms(new Map([
        ['LICENSE', Buffer.from('original main terms')],
        ['THIRD_PARTY_LICENSES.txt', Buffer.from('original aggregated attribution')],
        ['dist/bundle.js.LICENSE.txt', Buffer.from('original bundler attribution')],
        ['dist/6-legal-constr-sales.ddlt.spec.d.ts', Buffer.from('unrelated code')]
    ]));
    assert.equal(aTerms.length, 3);
    assert.ok(aTerms.some(oTerm => oTerm.path === 'THIRD_PARTY_LICENSES.txt'));
    assert.ok(aTerms.some(oTerm => oTerm.path === 'dist/bundle.js.LICENSE.txt'));
    assert.ok(aTerms.every(oTerm => !oTerm.path.endsWith('.d.ts')));
});

test('main package license metadata must be present and agree with original package metadata', async () => {
    const sText = 'Original package-specific terms and copyright';
    const oArchive = await archive([
        { name: 'package/package.json', text: JSON.stringify({ name: 'example', version: '1.0.0' }) },
        { name: 'package/LICENSE', text: sText }
    ]);
    const oOptions = {
        metadataReader: async () => ({ metadata: { versions: { '1.0.0': {
            name: 'example', version: '1.0.0',
            dist: { tarball: 'https://registry.npmjs.org/example/-/example-1.0.0.tgz', integrity: oArchive.integrity }
        } } } }),
        downloader: async () => oArchive.bytes
    };
    await assert.rejects(packageReader(oOptions)('example', '1.0.0'), /Missing npm license declaration/);
    await assert.rejects(packageReader({
        ...oOptions, metadataReader: async () => {
            const oResult = await oOptions.metadataReader();
            oResult.metadata.versions['1.0.0'].license = 'MIT';
            return oResult;
        }
    })('example', '1.0.0'), /Archive manifest differs from registry/);
});

test('any npm package can report dependency additions, removals and changed ranges without a structure blocker', () => {
    assert.deepEqual(dependencyChanges(
        { removed: '^1.0.0', changed: '^2.0.0', unchanged: '3.0.0' },
        { added: '^4.0.0', changed: '^2.1.0', unchanged: '3.0.0' }
    ), {
        added: [{ name: 'added', next: '^4.0.0' }],
        removed: [{ name: 'removed', previous: '^1.0.0' }],
        changed: [{ name: 'changed', previous: '^2.0.0', next: '^2.1.0' }]
    });
});
