import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fixtures, metadataFixture } from '../test-support/fixtures.mjs';
import { releaseInfo } from '../src/npm.mjs';
import { createCandidate, verifyCandidate } from '../src/candidate.mjs';

/** Tiny original-byte package fixtures exercise the complete candidate boundary offline. */
async function setup(t) {
    const sRoot = await mkdtemp(path.join(os.tmpdir(), 'dependency-candidate-test-'));
    t.after(() => rm(sRoot, { recursive: true, force: true }));
    const fnGit = (...aArgs) => execFileSync('git', ['-C', sRoot, ...aArgs], {
        stdio: 'pipe', windowsHide: true
    });
    fnGit('init', '--initial-branch=1.x-dev');
    fnGit('remote', 'add', 'origin', 'https://github.com/ExFace/Core.git');
    fnGit('-c', 'core.hooksPath=disabled-hooks', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
        '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '--no-verify', '-m', 'Fixture');
    const { registry: oRegistry, entry: oEntry } = fixtures();
    oEntry.licenses = [{ name: 'MIT', file: 'exface/core/assets/LICENSE.txt' }];
    delete oEntry.license;
    oEntry.update.artifacts.files = [
        { source: 'dist/mermaid.min.js', target: 'assets/mermaid.min.js' },
        { source: 'dist/mermaid.min.js.map', target: 'assets/mermaid.min.js.map' },
        { source: 'package.json', target: 'assets/package.json' },
        { source: 'README.md', target: 'assets/README.md' },
        { source: 'LICENSE', target: 'assets/LICENSE.txt' }
    ];
    oEntry.update.artifacts.evidence = { packages: 'assets/bundled-packages.json', notices: 'assets/THIRD_PARTY_LICENSES.txt' };
    const oMetadata = metadataFixture();
    const oEmbeddedMetadata = {
        name: 'example',
        versions: Object.fromEntries(['1.0.0', '1.1.0', '2.0.0'].map(sVersion => [sVersion, {
            name: 'example', version: sVersion, license: sVersion === '2.0.0' ? 'ISC' : 'MIT',
            dist: {
                tarball: `https://registry.npmjs.org/example/-/example-${sVersion}.tgz`,
                integrity: `sha512-${Buffer.alloc(64).toString('base64')}`
            }
        }]))
    };
    const fnReadPackage = async (sName, sVersion) => {
        if (sName !== 'mermaid') {
            const oManifest = { name: sName, version: sVersion, license: oEmbeddedMetadata.versions[sVersion].license };
            return {
                release: releaseInfo(oEmbeddedMetadata, sName, sVersion, { allowMissingLicense: true }),
                manifest: oManifest,
                files: new Map([
                    ['package.json', Buffer.from(JSON.stringify(oManifest))],
                    ['LICENSE', Buffer.from(`original ${sName}@${sVersion} terms\r\n`)],
                    ['NOTICE', Buffer.from(`original ${sName}@${sVersion} attribution`)]
                ])
            };
        }
        const oManifest = { name: sName, version: sVersion, license: 'MIT' };
        return {
            release: releaseInfo(oMetadata, sName, sVersion),
            manifest: oManifest,
            files: new Map([
                ['package.json', Buffer.from(JSON.stringify(oManifest))],
                ['README.md', Buffer.from('original readme')],
                ['LICENSE', Buffer.from('original mermaid license')],
                ['dist/mermaid.min.js', Buffer.from(`globalThis["mermaid"]={version:"${sVersion}"};`)],
                ['dist/mermaid.min.js.map', Buffer.from(JSON.stringify({
                    version: 3, sources: ['../../../node_modules/.pnpm/example@1.0.0/node_modules/example/a.js'],
                    sourcesContent: ['original dependency source']
                }))]
            ])
        };
    };
    await mkdir(path.join(sRoot, 'assets'));
    const oPrevious = await fnReadPackage('mermaid', '12.2.0');
    for (const oFile of oEntry.update.artifacts.files) {
        await writeFile(path.join(sRoot, ...oFile.target.split('/')), oPrevious.files.get(oFile.source));
    }
    await writeFile(path.join(sRoot, 'includes.json'), JSON.stringify([oEntry, { name: 'unrelated', version: '5' }]));
    return {
        root: sRoot, registry: oRegistry, appId: 'exface.Core', packageName: 'npm-asset/mermaid',
        metadataReader: async sName => ({
            metadata: sName === 'mermaid' ? oMetadata : oEmbeddedMetadata,
            url: `https://registry.npmjs.org/${sName}`
        }),
        embeddedMetadata: oEmbeddedMetadata,
        readPackage: fnReadPackage
    };
}

test('candidate retains exact embedded originals in notices, provenance and BOM text without source writes', async t => {
    const oOptions = await setup(t);
    const sBefore = await readFile(path.join(oOptions.root, 'includes.json'), 'utf8');
    const oCandidate = await createCandidate(oOptions);
    assert.equal(oCandidate.kind, 'dependency-candidate');
    assert.equal(oCandidate.checks.powerUiIntegration, 'not-run');
    assert.equal(oCandidate.checks.installationLicenseBom, 'not-run');
    const oInventoryFile = oCandidate.files.find(oFile => oFile.path === 'includes.json');
    const aInventory = JSON.parse(Buffer.from(oInventoryFile.content, 'base64'));
    assert.equal(aInventory[0].version, '12.3.0');
    assert.deepEqual(aInventory[1], { name: 'unrelated', version: '5' });
    assert.equal(aInventory[2].name, 'npm-asset/example');
    assert.equal(aInventory[2].licenses[0].name, 'MIT');
    assert.match(aInventory[2].licenses[0].text, /original example@1.0.0 terms\r\n/);
    assert.doesNotMatch(aInventory[2].licenses[0].text, /original mermaid license/);
    assert.equal(oCandidate.licenseReview.status, 'required');
    assert.equal(oCandidate.checks.embeddedLicenseTexts, 'original-files-collected');
    const oNotices = oCandidate.files.find(oFile => oFile.path === 'assets/THIRD_PARTY_LICENSES.txt');
    assert.match(Buffer.from(oNotices.content, 'base64').toString(), /original mermaid license/);
    assert.match(Buffer.from(oNotices.content, 'base64').toString(), /original example@1.0.0 attribution/);
    const oEvidence = JSON.parse(Buffer.from(oCandidate.files.find(oFile => oFile.path === 'assets/bundled-packages.json').content, 'base64'));
    assert.match(oEvidence.packages[0].termProvenance.tarball, /example-1.0.0.tgz$/);
    assert.equal(Buffer.from(oEvidence.packages[0].terms[0].bytesBase64, 'base64').toString(), 'original example@1.0.0 terms\r\n');
    assert.equal(await readFile(path.join(oOptions.root, 'includes.json'), 'utf8'), sBefore);
    assert.deepEqual(await verifyCandidate(oCandidate, oOptions), oCandidate);
    const oTampered = structuredClone(oCandidate);
    oTampered.files[0].content = Buffer.from('tampered').toString('base64');
    await assert.rejects(verifyCandidate(oTampered, oOptions), /verification failed/);
    const oRedirected = structuredClone(oCandidate);
    oRedirected.plan.target.repository = 'other/repository';
    await assert.rejects(verifyCandidate(oRedirected, oOptions), /verification failed/);
});

test('local modifications, missing licensing evidence and conflicting embedded ownership fail closed', async t => {
    const oOptions = await setup(t);
    await writeFile(path.join(oOptions.root, 'assets', 'mermaid.min.js'), 'local customization');
    await assert.rejects(createCandidate(oOptions), /Locally modified/);
    const oOriginal = await oOptions.readPackage('mermaid', '12.2.0');
    await writeFile(path.join(oOptions.root, 'assets', 'mermaid.min.js'), oOriginal.files.get('dist/mermaid.min.js'));
    await assert.rejects(createCandidate({
        ...oOptions,
        readPackage: async (sName, sVersion) => {
            const oPackage = await oOptions.readPackage(sName, sVersion);
            oPackage.files.delete('LICENSE');
            return oPackage;
        }
    }), /Missing or empty package file: LICENSE/);
    const sFile = path.join(oOptions.root, 'includes.json');
    const aInventory = JSON.parse(await readFile(sFile));
    aInventory.push({ name: 'npm-asset/example', version: '1.0.0', licenses: [{ name: 'MIT' }] });
    await writeFile(sFile, JSON.stringify(aInventory));
    await assert.rejects(createCandidate(oOptions), /conflicts with embedded ownership/);
});

test('coexisting embedded versions compare licenses against their matching identity, not the first package name', async t => {
    const oOptions = await setup(t);
    const fnReadPackage = async (sName, sVersion) => {
        const oPackage = await oOptions.readPackage(sName, sVersion);
        oPackage.files.set('dist/mermaid.min.js.map', Buffer.from(JSON.stringify({
            version: 3,
            sources: ['1.0.0', '2.0.0'].map(sDependencyVersion =>
                `../../../node_modules/.pnpm/example@${sDependencyVersion}/node_modules/example/a.js`),
            sourcesContent: ['original v1', 'original v2']
        })));
        return oPackage;
    };
    const oPrevious = await fnReadPackage('mermaid', '12.2.0');
    await writeFile(path.join(oOptions.root, 'assets', 'mermaid.min.js.map'), oPrevious.files.get('dist/mermaid.min.js.map'));
    const oCandidate = await createCandidate({ ...oOptions, readPackage: fnReadPackage });
    assert.deepEqual(oCandidate.embedded.map(({ version, license }) => ({ version, license })), [
        { version: '1.0.0', license: 'MIT' }, { version: '2.0.0', license: 'ISC' }
    ]);
    assert.deepEqual(oCandidate.licenseReview.changes, []);
});

test('embedded license changes produce explicit review findings without blocking a candidate', async t => {
    const oOptions = await setup(t);
    oOptions.embeddedMetadata.versions['1.1.0'].license = 'ISC';
    const oCandidate = await createCandidate({
        ...oOptions,
        readPackage: async (sName, sVersion) => {
            const oPackage = await oOptions.readPackage(sName, sVersion);
            if (sVersion === '12.3.0') {
                oPackage.files.set('dist/mermaid.min.js.map', Buffer.from(JSON.stringify({
                    version: 3, sources: ['../../../node_modules/.pnpm/example@1.1.0/node_modules/example/a.js'],
                    sourcesContent: ['original dependency v1.1 source']
                })));
            }
            return oPackage;
        }
    });
    assert.deepEqual(oCandidate.licenseReview.changes, [{
        name: 'example', previousVersion: '1.0.0', version: '1.1.0',
        previousLicense: 'MIT', license: 'ISC'
    }]);
});

test('missing embedded declarations are explicit unknowns, not invented licenses or automatic approvals', async t => {
    const oOptions = await setup(t);
    delete oOptions.embeddedMetadata.versions['1.0.0'].license;
    const oCandidate = await createCandidate(oOptions);
    assert.equal(oCandidate.embedded[0].license, null);
    assert.ok(oCandidate.licenseReview.warnings.some(oWarning => oWarning.code === 'missing-license-declaration'));
    const aInventory = JSON.parse(Buffer.from(oCandidate.files.find(oFile => oFile.path === 'includes.json').content, 'base64'));
    assert.deepEqual(aInventory[2].licenses, []);
});

test('main license changes retain new original terms and report the changed declaration for review', async t => {
    const oOptions = await setup(t);
    const oCandidate = await createCandidate({
        ...oOptions,
        metadataReader: async sName => {
            const oResult = structuredClone(await oOptions.metadataReader(sName));
            if (sName === 'mermaid') oResult.metadata.versions['12.3.0'].license = 'ISC';
            return oResult;
        },
        readPackage: async (sName, sVersion) => {
            const oPackage = await oOptions.readPackage(sName, sVersion);
            if (sVersion === '12.3.0') {
                oPackage.manifest.license = 'ISC';
                oPackage.release.license = 'ISC';
                oPackage.files.set('LICENSE', Buffer.from('new original ISC terms'));
            }
            return oPackage;
        }
    });
    const aInventory = JSON.parse(Buffer.from(oCandidate.files.find(oFile => oFile.path === 'includes.json').content, 'base64'));
    assert.equal(aInventory[0].licenses[0].name, 'ISC');
    assert.equal(oCandidate.licenseReview.changes[0].previousLicense, 'MIT');
    assert.equal(oCandidate.licenseReview.changes[0].license, 'ISC');
    assert.match(oCandidate.licenseReview.upstreamTerms[0].text, /new original ISC terms/);
});

test('contradictory installed inventory licenses remain errors rather than review warnings', async t => {
    const oOptions = await setup(t);
    const sFile = path.join(oOptions.root, 'includes.json');
    const aInventory = JSON.parse(await readFile(sFile));
    aInventory[0].licenses[0].name = 'incorrect-license';
    await writeFile(sFile, JSON.stringify(aInventory));
    await assert.rejects(createCandidate(oOptions), /Installed inventory license must match/);
});

test('unmapped aggregate notices are preserved but never assigned generically to embedded packages', async t => {
    const oOptions = await setup(t);
    const oCandidate = await createCandidate({
        ...oOptions,
        readPackage: async (sName, sVersion) => {
            const oPackage = await oOptions.readPackage(sName, sVersion);
            oPackage.files.set('dist/mermaid.min.js.LICENSE.txt', Buffer.from('original upstream third-party attribution'));
            return oPackage;
        }
    });
    assert.ok(oCandidate.licenseReview.upstreamTerms.some(oTerm => oTerm.path === 'dist/mermaid.min.js.LICENSE.txt'));
    const oNotices = oCandidate.files.find(oFile => oFile.path === 'assets/THIRD_PARTY_LICENSES.txt');
    assert.match(Buffer.from(oNotices.content, 'base64').toString(), /original upstream third-party attribution/);
});

test('changed Git HEAD during preparation fails even if the relevant file bytes remain unchanged', async t => {
    const oOptions = await setup(t);
    let bChanged = false;
    await assert.rejects(createCandidate({
        ...oOptions,
        readPackage: async (sName, sVersion) => {
            if (!bChanged) {
                bChanged = true;
                execFileSync('git', ['-C', oOptions.root, '-c', 'core.hooksPath=disabled-hooks',
                    '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
                    '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '--no-verify', '-m', 'Concurrent change'],
                { stdio: 'pipe', windowsHide: true });
            }
            return oOptions.readPackage(sName, sVersion);
        }
    }), /Git baseline changed during preparation/);
});
