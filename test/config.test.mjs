import assert from 'node:assert/strict';
import test from 'node:test';
import { selectApps, validateInventory } from '../src/config.mjs';
import { validatePath } from '../src/paths.mjs';
import { fixtures } from '../test-support/fixtures.mjs';

test('only explicit enabled registrations are eligible, including an empty registry', () => {
    const { registry } = fixtures();
    assert.equal(selectApps(registry)[0].id, 'exface.Core');
    assert.deepEqual(selectApps({ schemaVersion: 1, apps: [] }), []);
    assert.throws(() => selectApps(registry, 'exface.UI5Facade'), /Unknown or disabled/);
    registry.apps[0].enabled = false;
    assert.deepEqual(selectApps(registry), []);
    assert.throws(() => selectApps(registry, 'exface.Core'), /Unknown or disabled/);
});

test('reject duplicate, unsupported, malformed and executable app registrations', () => {
    const mutations = [
        registry => { registry.schemaVersion = 2; },
        registry => { registry.apps.push(structuredClone(registry.apps[0])); },
        registry => { registry.apps[0].repository = 'https://github.com/ExFace/Core'; },
        registry => { registry.apps[0].baseBranch = '--upload-pack=bad'; },
        registry => { registry.apps[0].enabled = 'true'; },
        registry => { registry.apps[0].command = 'arbitrary-code'; },
        registry => { registry.apps[0].inventory = '../includes.json'; }
    ];
    for (const mutate of mutations) {
        const { registry } = fixtures();
        mutate(registry);
        assert.throws(() => selectApps(registry));
    }
});

test('unmanaged inventory stays untouched and valid managed entries are returned', () => {
    const { entry } = fixtures();
    const unmanaged = { name: 'mk-j/php_xlsxwriter', version: '0.37' };
    const inventory = [unmanaged, entry];
    const before = JSON.stringify(inventory);
    assert.deepEqual(validateInventory(inventory, 'includes.json'), [entry]);
    assert.equal(JSON.stringify(inventory), before);
    assert.deepEqual(validateInventory([unmanaged], 'includes.json'), []);
});

test('reject malformed update contracts and mismatched provider identities', () => {
    const mutations = [
        entry => { entry.update.schemaVersion = 2; },
        entry => { entry.update.command = 'run-me'; },
        entry => { entry.update.policy = 'latest'; },
        entry => { entry.update.provider.type = 'github'; },
        entry => { entry.update.provider.package = 'other'; },
        entry => { entry.update.artifacts.adapter = './code.mjs'; },
        entry => { entry.update.artifacts.files = []; },
        entry => { entry.version = '^12.2.0'; },
        entry => { entry.version = '12.2.0-beta.1'; }
    ];
    for (const mutate of mutations) {
        const { entry } = fixtures();
        mutate(entry);
        assert.throws(() => validateInventory([entry], 'includes.json'));
    }
    assert.throws(() => validateInventory({}, 'includes.json'));
    assert.throws(() => validateInventory([null], 'includes.json'));
});

test('reject unsafe portable paths on every platform', () => {
    for (const value of [
        '../escape', '/absolute', 'C:/absolute', 'C:\\absolute', 'a\\b',
        'a//b', './a', 'a/../b', 'a/*.js', 'a/[x].js', 'a?.js',
        'a:stream', 'CON', 'nul.txt', 'COM1.js', 'a/LPT9', '.git/config',
        'a/.GIT/config', 'a.', 'a ', '', '//server/share'
    ]) {
        assert.throws(() => validatePath(value), value);
    }
    assert.equal(validatePath('assets/mermaid.min.js.map'), 'assets/mermaid.min.js.map');
});

test('reject duplicate identities, inventory writes, overlapping paths and duplicate sources', () => {
    const { entry } = fixtures();
    assert.throws(() => validateInventory([entry, structuredClone(entry)], 'includes.json'), /identity/);
    for (const target of ['includes.json', 'ASSETS/MERMAID.MIN.JS', 'assets', 'assets/mermaid.min.js/child']) {
        const other = structuredClone(entry);
        other.update.artifacts.files[1].target = target;
        assert.throws(() => validateInventory([other], 'includes.json'), /output/);
    }
    const duplicate = structuredClone(entry);
    duplicate.update.artifacts.files[1].source = duplicate.update.artifacts.files[0].source;
    assert.throws(() => validateInventory([duplicate], 'includes.json'), /source/);
});
