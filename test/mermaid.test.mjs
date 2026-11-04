import test from 'node:test';
import assert from 'node:assert/strict';
import { fixtures } from '../test-support/fixtures.mjs';
import { prepare, validateInstalled } from '../Recipes/mermaid/index.mjs';

/** Original npm-like members keep recipe tests independent of Git, networks and browser execution. */
function fixture() {
    const { entry } = fixtures();
    delete entry.license;
    entry.licenses = [{ name: 'MIT', file: 'exface/core/legal/LICENSE.txt' }];
    entry.update.artifacts.files = [
        { source: 'dist/mermaid.min.js', target: 'assets/bundle.js' },
        { source: 'dist/mermaid.min.js.map', target: 'assets/bundle.js.map' },
        { source: 'package.json', target: 'assets/package.json' },
        { source: 'README.md', target: 'assets/README.md' },
        { source: 'LICENSE', target: 'legal/LICENSE.txt' }
    ];
    entry.update.artifacts.evidence = { packages: 'assets/packages.json', notices: 'legal/notices.txt' };
    const files = new Map([
        ['dist/mermaid.min.js', Buffer.from('globalThis["mermaid"]={version:"12.2.0"};')],
        ['dist/mermaid.min.js.map', Buffer.from(JSON.stringify({
            version: 3, sources: ['/node_modules/.pnpm/example@1.0.0/node_modules/example/a.js'],
            sourcesContent: ['original dependency source']
        }))],
        ['package.json', Buffer.from('{"name":"mermaid","version":"12.2.0","license":"MIT"}')],
        ['README.md', Buffer.from('original readme\n')],
        ['LICENSE', Buffer.from('original main terms\n')]
    ]);
    return {
        entry, files,
        readPackage: async (name, version) => {
            assert.equal(name, 'mermaid');
            assert.equal(version, '12.2.0');
            return { manifest: { name, version }, release: { license: 'MIT' }, files };
        }
    };
}

test('Mermaid recipe returns normalized originals, checks, license destinations and pnpm evidence', async () => {
    const { entry, files, readPackage } = fixture();
    const result = await prepare(entry, '12.2.0', { readPackage });
    assert.equal(result.name, 'mermaid');
    assert.equal(result.version, '12.2.0');
    assert.deepEqual(result.licenses, [{ name: 'MIT', file: 'legal/LICENSE.txt' }]);
    assert.equal(result.checks.javascriptSyntax, 'passed');
    assert.match(result.evidence.sourceMapSha256, /^[a-f0-9]{64}$/);
    for (const [index, mapping] of entry.update.artifacts.files.entries()) {
        assert.ok(result.outputs[index].bytes.equals(files.get(mapping.source)));
    }
});

test('Mermaid recipe owns runtime markers, dynamic assets and complete source-map evidence checks', async () => {
    for (const change of [
        files => files.set('dist/mermaid.min.js', Buffer.from('globalThis["other"]={version:"12.2.0"};')),
        files => files.set('dist/mermaid.min.js', Buffer.from('globalThis["mermaid"]={version:"12.1.0"};')),
        files => files.set('dist/mermaid.min.js', Buffer.from('globalThis["mermaid"]={version:"12.2.0"};import("other.js");')),
        files => files.set('dist/mermaid.min.js', Buffer.from('invalid javascript (')),
        files => files.set('dist/mermaid.min.js.map', Buffer.from('{"version":3,"sources":[],"sourcesContent":[]}'))
    ]) {
        const { entry, files, readPackage } = fixture();
        change(files);
        await assert.rejects(prepare(entry, '12.2.0', { readPackage }));
    }
});

test('Mermaid recipe rejects missing required mappings, nonadjacent maps and absent evidence outputs', async () => {
    for (const change of [
        entry => { entry.update.artifacts.files.pop(); },
        entry => { entry.update.artifacts.files[1].target = 'other/map.json'; },
        entry => { delete entry.update.artifacts.evidence; }
    ]) {
        const { entry, readPackage } = fixture();
        change(entry);
        await assert.rejects(prepare(entry, '12.2.0', { readPackage }));
    }
});

test('installed Mermaid originals are compared byte-for-byte, including README changes and line endings', async () => {
    const { entry, readPackage } = fixture();
    const result = await prepare(entry, '12.2.0', { readPackage });
    const installed = new Map(result.outputs.map(output => [output.path, output.bytes]));
    const options = { vendorPath: 'exface/core', readInstalled: async file => installed.get(file) };
    await validateInstalled(entry, result, options);
    installed.set('assets/README.md', Buffer.from('original readme\r\n'));
    await assert.rejects(validateInstalled(entry, result, options), /Locally modified.*README/);
    installed.set('assets/README.md', result.outputs.find(output => output.path === 'assets/README.md').bytes);
    entry.licenses[0].file = 'other/app/LICENSE.txt';
    await assert.rejects(validateInstalled(entry, result, options), /owning-app license file/);
});
