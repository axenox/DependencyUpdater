import test from 'node:test';
import assert from 'node:assert/strict';
import tar from 'tar-stream';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { inspectLicenses, inventoryLicenses, noticeText } from '../src/licenses.mjs';
import { originalTerms, packageReader, sha256 } from '../src/distribution.mjs';

/** Independent exact-version fixtures; dependency declarations are deliberately not shipped identities. */
function fixture() {
    const oMetadata = { name: 'embedded', versions: {} };
    for (const sVersion of ['1.0.0', '2.0.0']) {
        oMetadata.versions[sVersion] = {
            name: 'embedded', version: sVersion, license: sVersion === '1.0.0' ? 'MIT' : 'ISC',
            dependencies: { 'not-embedded': '^9.0.0' },
            dist: {
                tarball: `https://registry.npmjs.org/embedded/-/embedded-${sVersion}.tgz`,
                integrity: `sha512-${Buffer.alloc(64).toString('base64')}`
            }
        };
    }
    const aReads = [];
    const fnMetadata = async sName => {
        assert.equal(sName, 'embedded');
        return { metadata: oMetadata, url: 'https://registry.npmjs.org/embedded' };
    };
    const fnRead = async (sName, sVersion, oOptions) => {
        assert.equal(sName, 'embedded');
        assert.deepEqual(oOptions, { embedded: true });
        aReads.push(`${sName}@${sVersion}`);
        const oRelease = oMetadata.versions[sVersion];
        const oManifest = { name: sName, version: sVersion, license: oRelease.license };
        return {
            manifest: oManifest, release: oRelease.dist,
            files: new Map([
                ['package.json', Buffer.from(JSON.stringify(oManifest))],
                ['LICENSE', Buffer.from(`original ${sVersion}\r\nCopyright actual author\n`)],
                ['NOTICE', Buffer.from(`notice ${sVersion}`)],
                ['README.md', Buffer.from('# Package\n\n## License\nAdditional original conditions\n')]
            ])
        };
    };
    const oPrevious = {
        name: 'bundle', version: '1.0.0', license: 'MIT',
        embedded: [{ name: 'embedded', version: '1.0.0', sources: ['exact/embedded@1.0.0/LICENSE'] }]
    };
    const oNext = { ...oPrevious, version: '1.1.0', terms: [] };
    return { metadata: oMetadata, previous: oPrevious, next: oNext, read: fnRead, metadataReader: fnMetadata, reads: aReads };
}

test('only actual exact embedded archives are read, with distinct versions and original bytes/provenance', async () => {
    const f = fixture();
    f.next.embedded = [...f.previous.embedded, { name: 'embedded', version: '2.0.0' }];
    const oResult = await inspectLicenses(f.previous, f.next, f.metadataReader, f.read);
    assert.deepEqual(f.reads, ['embedded@1.0.0', 'embedded@2.0.0']);
    assert.equal(oResult.packages.length, 2);
    for (const p of oResult.packages) {
        assert.equal(p.terms.length, 3, 'README conditions must survive even alongside LICENSE and NOTICE');
        const oLicense = p.terms.find(t => t.path === 'LICENSE');
        const oBytes = Buffer.from(oLicense.bytesBase64, 'base64');
        assert.equal(oBytes.toString(), `original ${p.version}\r\nCopyright actual author\n`);
        assert.equal(oLicense.sha256, sha256(oBytes));
        assert.equal(p.termProvenance.integrity, f.metadata.versions[p.version].dist.integrity);
        assert.equal(p.termProvenance.manifestSha256.length, 64);
        assert.match(inventoryLicenses(p)[0].text, new RegExp(`original ${p.version}`));
    }
    assert.doesNotMatch(noticeText('bundle', '1.1.0', oResult.review, oResult.packages), /not-embedded/);
    assert.equal(oResult.review.status, 'required');
    await assert.rejects(inspectLicenses(f.previous, f.next, f.metadataReader, async (...aArgs) => {
        const p = await f.read(...aArgs);
        p.manifest.version = '9.9.9';
        return p;
    }), /identity\/provenance mismatch/);
});

test('unknown registry declaration retains original terms without inferring the manifest or text license', async () => {
    const f = fixture();
    delete f.metadata.versions['1.0.0'].license;
    const r = await inspectLicenses(f.previous, f.next, f.metadataReader, async (...aArgs) => {
        const p = await f.read(...aArgs);
        p.manifest.license = 'MIT';
        return p;
    });
    assert.equal(r.packages[0].license, null);
    assert.equal(r.packages[0].manifestLicense, 'MIT');
    assert.deepEqual(inventoryLicenses(r.packages[0]), []);
    assert.ok(r.review.warnings.some(w => w.code === 'missing-license-declaration'));
    assert.ok(r.review.warnings.some(w => w.code === 'contradictory-license-declarations'));
    assert.match(noticeText('bundle', '1.1.0', r.review, r.packages), /original 1.0.0/);
});

test('contradictory embedded declarations are explicit review findings, not approval or a lost original', async () => {
    const f = fixture();
    const r = await inspectLicenses(f.previous, f.next, f.metadataReader, async (...aArgs) => {
        const p = await f.read(...aArgs);
        p.manifest.license = 'GPL-3.0-only';
        return p;
    });
    const w = r.review.warnings.find(w => w.code === 'contradictory-license-declarations');
    assert.equal(w.registryLicense, 'MIT');
    assert.equal(w.manifestLicense, 'GPL-3.0-only');
    assert.equal(r.review.status, 'required');
    assert.ok(r.packages[0].terms.length);
});

test('genuinely absent terms and README-only evidence stay visible; no generic terms are synthesized', async () => {
    for (const bReadme of [false, true]) {
        const f = fixture();
        const r = await inspectLicenses(f.previous, f.next, f.metadataReader, async (...aArgs) => {
            const p = await f.read(...aArgs);
            p.files.delete('LICENSE');
            p.files.delete('NOTICE');
            if (!bReadme) p.files.delete('README.md');
            return p;
        });
        assert.ok(r.review.warnings.some(w => w.code === (bReadme ? 'readme-only-original-terms' : 'missing-original-license-text')));
        assert.equal(r.review.embeddedLicenseTexts, bReadme ? 'original-files-collected' : 'missing-original-files');
        if (!bReadme) assert.deepEqual(inventoryLicenses(r.packages[0]), [{ name: 'MIT' }]);
    }
});

test('exact recipe-mapped upstream originals are reused, but unrelated aggregate/main terms never stand in', async () => {
    const f = fixture();
    const sPath = f.next.embedded[0].sources[0];
    const aTerms = originalTerms(new Map([[sPath, Buffer.from('original mapped terms\r\n')]]));
    const oDist = {
        tarball: 'https://registry.npmjs.org/bundle/-/bundle-1.1.0.tgz',
        integrity: `sha512-${Buffer.alloc(64).toString('base64')}`
    };
    f.next.embeddedTerms = [{
        name: 'embedded', version: '1.0.0', terms: aTerms, provenance: oDist
    }];
    f.next.terms = [{ path: 'LICENSE', text: 'main MIT only' }];
    const fnMetadata = async sName => sName === 'bundle' ? {
        metadata: { versions: { '1.1.0': { name: 'bundle', version: '1.1.0', license: 'MIT', dist: oDist } } }
    } : f.metadataReader(sName);
    const r = await inspectLicenses(f.previous, f.next, fnMetadata, () => assert.fail('Do not redownload mapped terms'));
    assert.equal(r.packages[0].termProvenance.source, 'upstream-exact-mapping');
    assert.match(inventoryLicenses(r.packages[0])[0].text, /original mapped terms\r\n/);
    assert.doesNotMatch(inventoryLicenses(r.packages[0])[0].text, /main MIT/);
    const oWrongOrigin = structuredClone(f.next);
    oWrongOrigin.embeddedTerms[0].provenance.tarball = 'https://registry.npmjs.org/other/-/other-1.1.0.tgz';
    await assert.rejects(inspectLicenses(f.previous, oWrongOrigin, fnMetadata, f.read), /Invalid exact upstream terms mapping/);
    f.next.embeddedTerms[0].terms[0].sha256 = 'tampered';
    await assert.rejects(inspectLicenses(f.previous, f.next, fnMetadata, f.read), /Invalid exact upstream terms mapping/);
    f.next.embeddedTerms[0].version = '2.0.0';
    await inspectLicenses(f.previous, f.next, fnMetadata, f.read);
    assert.deepEqual(f.reads, ['embedded@1.0.0'], 'Wrong-version upstream evidence cannot suppress exact archive fallback');
});

test('embedded network failures propagate instead of becoming missing-original warnings', async () => {
    const f = fixture();
    await assert.rejects(inspectLicenses(f.previous, f.next, f.metadataReader, async () => {
        throw new Error('HTTP 503 exact embedded archive');
    }), /HTTP 503/);
    await assert.rejects(inspectLicenses(f.previous, f.next, async () => {
        throw new Error('metadata timeout');
    }, f.read), /metadata timeout/);
});

test('embedded archive mode checks integrity/identity, tolerates declaration differences and never weakens main validation', async () => {
    const f = fixture();
    const p = await f.read('embedded', '1.0.0', { embedded: true });
    const oPack = tar.pack();
    const aChunks = [];
    const oDone = new Promise((resolve, reject) => {
        oPack.on('data', b => aChunks.push(b));
        oPack.on('end', resolve);
        oPack.on('error', reject);
    });
    p.manifest.license = 'ISC';
    p.files.set('package.json', Buffer.from(JSON.stringify(p.manifest)));
    for (const [sPath, oBytes] of p.files) oPack.entry({ name: `package/${sPath}` }, oBytes);
    oPack.finalize();
    await oDone;
    const oArchive = gzipSync(Buffer.concat(aChunks));
    const sIntegrity = `sha512-${createHash('sha512').update(oArchive).digest('base64')}`;
    f.metadata.versions['1.0.0'].dist.integrity = sIntegrity;
    const fnRead = packageReader({ metadataReader: f.metadataReader, downloader: async () => oArchive });
    assert.equal((await fnRead('embedded', '1.0.0', { embedded: true })).manifest.license, 'ISC');
    await assert.rejects(fnRead('embedded', '1.0.0'), /manifest differs/);
    delete f.metadata.versions['1.0.0'].license;
    const fnUnknown = packageReader({ metadataReader: f.metadataReader, downloader: async () => oArchive });
    const oUnknown = await inspectLicenses(f.previous, f.next, f.metadataReader, fnUnknown);
    assert.equal(oUnknown.packages[0].license, null);
    assert.ok(oUnknown.packages[0].terms.length);
    await assert.rejects(fnUnknown('embedded', '1.0.0'), /Missing npm license declaration/);
    f.metadata.versions['1.0.0'].dist.integrity = `sha512-${Buffer.alloc(64).toString('base64')}`;
    const fnBadIntegrity = packageReader({ metadataReader: f.metadataReader, downloader: async () => oArchive });
    await assert.rejects(inspectLicenses(f.previous, f.next, f.metadataReader, fnBadIntegrity), /integrity/);
});
