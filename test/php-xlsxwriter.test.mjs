import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { adaptSource, lintSource, prepare, validateInstalled } from '../Recipes/php-xlsxwriter/index.mjs';
import { resolveRecipe } from '../src/recipes.mjs';
import { createCandidate, verifyCandidate } from '../src/candidate.mjs';
import { expandMetadata } from '../src/packagist.mjs';
import { fixtures } from '../test-support/fixtures.mjs';
import { documentFixture, entryFixture, readPackage, legacySource } from '../test-support/php-xlsxwriter.mjs';

test('registered recipe preserves Core namespace, column API, legacy widths and PHP compatibility', async () => {
    const entry = entryFixture();
    assert.equal((await resolveRecipe(entry)).prepare, prepare);
    for (const version of ['0.37', '0.39']) {
        const result = await prepare(entry, version, { readPackage });
        const runtime = result.outputs[0].bytes.toString();
        assert.match(runtime, /namespace exface\\Core\\CommonLogic\\Utils;/);
        assert.match(runtime, /writeSheetHeader\(\$sheet_name, array \$header_types, \$options = null, array \$columns = \[\]\)/);
        assert.match(runtime, /new \\ZipArchive/);
        assert.match(runtime, /\\ZipArchive::CREATE/);
        assert.match(runtime, /\$opt\['hidden'\] \?\? false/);
        assert.match(runtime, /\$opt\['collapsed'\] \?\? false/);
        assert.match(runtime, /\$columns\[\$nr\]\['width'\] = \$width/);
        assert.match(runtime, version === '0.37'
            ? /htmlspecialchars\(\$val \?\? ''/ : /htmlspecialchars\(\(string\)\$val/);
        assert.doesNotMatch(runtime, /\$value\{0\}/);
        assert.equal(result.checks.phpSyntax, 'passed');
        assert.deepEqual(result.embedded, []);
        assert.deepEqual(result.outputs[1].bytes, (await readPackage(entry.name, version)).files.get('LICENSE'));
    }
});

test('unreviewed releases, altered upstream sources, invalid PHP and incomplete mappings fail closed', async () => {
    const original = await readPackage('mk-j/php_xlsxwriter', '0.39');
    assert.throws(() => adaptSource(original.files.get('xlsxwriter.class.php'), '0.40'), /Unreviewed/);
    assert.throws(() => adaptSource(Buffer.from('modified'), '0.39'), /Unreviewed/);
    assert.throws(() => lintSource(Buffer.from('<?php syntax error !')), /lint failed/);
    const entry = entryFixture();
    entry.update.artifacts.files.pop();
    await assert.rejects(prepare(entry, '0.39', { readPackage }), /exactly/);
});

test('legacy fingerprint detects additional Core edits; absent first-run license is allowed, mismatched existing terms are not', async () => {
    const entry = entryFixture();
    const previous = await prepare(entry, '0.37', { readPackage });
    const legacy = await legacySource();
    const readInstalled = async file => {
        if (file.endsWith('.php')) return legacy;
        throw Object.assign(new Error('Missing fixture'), { code: 'ENOENT' });
    };
    await validateInstalled(entry, previous, { vendorPath: 'exface/core', readInstalled });
    await assert.rejects(validateInstalled(entry, previous, {
        vendorPath: 'exface/core',
        readInstalled: async () => Buffer.concat([legacy, Buffer.from('\n// additional patch')])
    }), /refusing replacement/);
    await assert.rejects(validateInstalled(entry, previous, {
        vendorPath: 'exface/core',
        readInstalled: async file => file.endsWith('.php') ? legacy : Buffer.from('edited terms')
    }), /refusing replacement/);
    const next = await prepare(entry, '0.39', { readPackage });
    entry.version = '0.39';
    entry.licenses = [{ name: 'MIT', file: 'exface/core/assets/LICENSE.txt' }];
    await validateInstalled(entry, next, {
        vendorPath: 'exface/core', readInstalled: async file => next.outputs.find(output => output.path === file).bytes
    });
});

/** Keep fixture execution separate from acquisition: generation only lints reviewed PHP through stdin. */
test('adapted 0.39 writes hidden/collapsed columns, custom/default widths, legacy widths and null values', async t => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'xlsxwriter-behavior-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const source = (await prepare(entryFixture(), '0.39', { readPackage })).outputs[0].bytes;
    await writeFile(path.join(root, 'writer.php'), source);
    const script = `
require $argv[1];
$writer = new \\exface\\Core\\CommonLogic\\Utils\\XLSXWriter();
$writer->writeSheetHeader('Columns', ['A'=>'string','B'=>'string','C'=>'string'], ['suppress_row'=>true],
    [['width'=>25,'hidden'=>true,'collapsed'=>true],[],['width'=>19]]);
$writer->writeSheetRow('Columns', [null, 'text', '=1+1']);
$writer->writeSheetHeader('Legacy', ['D'=>'string'], ['widths'=>[40]]);
$writer->writeToFile($argv[2]);
$zip = new ZipArchive();
if (!$zip->open($argv[2])) throw new Exception('Missing XLSX archive');
$xml = $zip->getFromName('xl/worksheets/sheet1.xml');
$legacy = $zip->getFromName('xl/worksheets/sheet2.xml');
foreach (['collapsed="true" hidden="true"', 'customWidth="true" width="25"',
    'customWidth="false" width="11.5"', 'customWidth="true" width="19"', '<f>1+1</f>'] as $expected) {
    if (strpos($xml, $expected) === false) throw new Exception('Missing XML: '.$expected);
}
if (strpos($legacy, 'customWidth="true" width="40"') === false) throw new Exception('Legacy widths lost');
if (\\exface\\Core\\CommonLogic\\Utils\\XLSXWriter::xmlspecialchars(null) !== '') throw new Exception('Null escaping changed');
echo 'XLSX behavior verified';
`;
    const result = spawnSync('php', ['-d', 'auto_prepend_file=', '-d', 'auto_append_file=',
        '-d', 'error_reporting=32767', '-r', script, path.join(root, 'writer.php'), path.join(root, 'output.xlsx')], {
        encoding: 'utf8', timeout: 30000, windowsHide: true,
        env: {
            PATH: process.env.PATH,
            ...(process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot, TEMP: os.tmpdir(), TMP: os.tmpdir() } : {})
        }
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(result.stderr, '', result.stderr);
    assert.equal(result.stdout, 'XLSX behavior verified');
});

/** Exercise the real PHP recipe and shared planner/candidate contract without live metadata or writes. */
async function setup(t) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'xlsxwriter-candidate-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const git = (...args) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe', windowsHide: true });
    git('init', '--initial-branch=1.x-dev');
    git('remote', 'add', 'origin', 'https://github.com/ExFace/Core.git');
    git('-c', 'core.hooksPath=disabled-hooks', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
        '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '--no-verify', '-m', 'Fixture');
    const entry = entryFixture();
    await mkdir(path.join(root, 'assets'));
    await writeFile(path.join(root, 'assets', 'XLSXWriter.php'), await legacySource());
    await writeFile(path.join(root, 'includes.json'), JSON.stringify([entry, { name: 'unmanaged', version: '1' }]));
    return {
        root, registry: fixtures().registry, appId: 'exface.Core', packageName: entry.name, readPackage,
        metadataReader: async (name, type) => {
            assert.equal(type, 'packagist');
            return { metadata: expandMetadata(documentFixture(), name), url: `https://repo.packagist.org/p2/${name}.json` };
        }
    };
}

test('0.37 to 0.39 candidate reconstructs exactly, retains original MIT terms and leaves source files unchanged', async t => {
    const options = await setup(t);
    const before = await readFile(path.join(options.root, 'includes.json'));
    const candidate = await createCandidate(options);
    assert.equal(candidate.kind, 'dependency-candidate');
    assert.equal(candidate.plan.updates[0].candidate.version, '0.39');
    assert.equal(candidate.checks.phpSyntax, 'passed');
    assert.deepEqual(candidate.embedded, []);
    assert.equal(candidate.files.length, 5);
    const inventory = JSON.parse(Buffer.from(candidate.files.find(file => file.path === 'includes.json').content, 'base64'));
    assert.equal(inventory[0].version, '0.39');
    assert.deepEqual(inventory[0].licenses, [{ name: 'MIT', file: 'exface/core/assets/LICENSE.txt' }]);
    assert.equal(Object.hasOwn(inventory[0], 'license_link'), false);
    assert.deepEqual(inventory[1], { name: 'unmanaged', version: '1' });
    assert.deepEqual(await readFile(path.join(options.root, 'includes.json')), before);
    assert.deepEqual(await verifyCandidate(candidate, options), candidate);
    const changed = structuredClone(candidate);
    changed.files[0].content = Buffer.from('modified').toString('base64');
    await assert.rejects(verifyCandidate(changed, options), /verification failed/);
    await writeFile(path.join(options.root, 'assets', 'XLSXWriter.php'), '<?php // unreviewed patch');
    await assert.rejects(createCandidate(options), /refusing replacement/);
});

test('installed 0.39 is a true no-op without downloads or forced downgrades', async t => {
    const options = await setup(t);
    const file = path.join(options.root, 'includes.json');
    const inventory = JSON.parse(await readFile(file));
    inventory[0].version = '0.39';
    await writeFile(file, JSON.stringify(inventory));
    const candidate = await createCandidate({
        ...options, readPackage: () => assert.fail('No artifact acquisition on no-op')
    });
    assert.equal(candidate.kind, 'no-op');
});
