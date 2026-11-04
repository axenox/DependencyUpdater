import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fixtures } from '../test-support/fixtures.mjs';
import { supportsAdapter, resolveRecipe, validateRecipeResult } from '../src/recipes.mjs';

/** A generated non-Mermaid bundle needs neither npm filenames nor a source map. */
function resultFixture() {
    const { entry } = fixtures();
    entry.name = 'npm-asset/example';
    entry.update.provider.package = 'example';
    entry.update.artifacts.files = [
        { source: 'generated', target: 'assets/custom.js' },
        { source: 'COPYING', target: 'legal/COPYING.md' }
    ];
    return {
        entry,
        result: {
            name: 'example', version: '1.0.0', license: 'ISC',
            licenses: [{ name: 'ISC', file: 'legal/COPYING.md' }],
            outputs: [
                { path: 'assets/custom.js', bytes: Buffer.from('original generated bundle') },
                { path: 'legal/COPYING.md', bytes: Buffer.from('original terms') }
            ],
            embedded: [], embeddedDescription: 'exact builder-input version',
            terms: [{ path: 'COPYING', text: 'original terms' }],
            evidence: { builder: 'recorded upstream builder' },
            checks: { artifactVersions: 'passed' }
        }
    };
}

test('only registered provider/package/adapter combinations select executable recipes', async () => {
    const { entry } = fixtures();
    assert.equal(supportsAdapter('npm-dist'), true);
    assert.equal(supportsAdapter('../Recipes/mermaid/index.mjs'), false);
    const recipe = await resolveRecipe(entry);
    assert.equal(typeof recipe.prepare, 'function');
    assert.equal(typeof recipe.validateInstalled, 'function');
    for (const change of [
        value => { value.update.provider.package = 'echarts'; },
        value => { value.update.provider.type = 'github'; },
        value => { value.update.artifacts.adapter = '../Recipes/mermaid/index.mjs'; }
    ]) {
        const other = structuredClone(entry);
        change(other);
        await assert.rejects(resolveRecipe(other), /No trusted recipe/);
    }
});

test('shared recipe results accept a generated bundle without Mermaid paths or source-map assumptions', () => {
    const { entry, result } = resultFixture();
    assert.equal(validateRecipeResult(result, entry, '1.0.0'), result);
});

test('recipe results reject wrong actual versions, undeclared/empty outputs and failed or reserved checks', () => {
    for (const change of [
        value => { value.version = '2.0.0'; },
        value => { value.name = 'other'; },
        value => { value.outputs[0].path = 'undeclared.js'; },
        value => { value.outputs[0].bytes = Buffer.alloc(0); },
        value => { value.outputs.pop(); },
        value => { value.outputs.push(value.outputs[0]); },
        value => { value.licenses[0].file = 'undeclared-license.txt'; },
        value => { value.checks.artifactVersions = 'failed'; },
        value => { value.checks.powerUiIntegration = 'passed'; }
    ]) {
        const { entry, result } = resultFixture();
        change(result);
        assert.throws(() => validateRecipeResult(result, entry, '1.0.0'));
    }
});

test('candidate orchestration and distribution helpers contain no Mermaid filenames, markers or recipe calls', async () => {
    for (const file of ['candidate.mjs', 'distribution.mjs']) {
        const source = await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
        assert.doesNotMatch(source, /mermaid|globalThis\[|sourceMapSha256|javascriptSyntax: 'passed'/i);
    }
});
