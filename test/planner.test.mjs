import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { planUpdates } from '../src/planner.mjs';
import { resolveFile } from '../src/paths.mjs';
import { fixtures, metadataFixture } from '../test-support/fixtures.mjs';

/** Isolated Git fixtures never change the real Core checkout or contact a remote. */
async function checkout(t) {
    const root = await mkdtemp(path.join(os.tmpdir(), 'dependency-updater-test-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const git = (...args) => execFileSync('git', ['-c', `core.hooksPath=${path.join(root, 'no-hooks')}`, '-C', root, ...args], {
        encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
    });
    git('init', '--initial-branch=1.x-dev');
    git('remote', 'add', 'origin', 'https://github.com/ExFace/Core.git');
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
        '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '--no-verify', '-m', 'Fixture');
    const { registry, entry } = fixtures();
    const inventory = JSON.stringify([{ name: 'unmanaged' }, entry], null, 2);
    await writeFile(path.join(root, 'includes.json'), inventory);
    await mkdir(path.join(root, 'assets'));
    await writeFile(path.join(root, 'assets', 'mermaid.min.js'), 'fixture-original');
    return { root, git, registry, entry, inventory };
}

/** Deterministic metadata reader has no network access. */
async function metadataReader() {
    return { metadata: metadataFixture(), url: 'https://registry.npmjs.org/mermaid' };
}

test('plan is repeatable and read-only, with explicit unperformed artifact/integration checks', async t => {
    const fixture = await checkout(t);
    const args = { ...fixture, appId: 'exface.Core', metadataReader };
    const plan = await planUpdates(args);
    assert.equal(plan.kind, 'metadata-plan');
    assert.equal(plan.updates[0].candidate.version, '12.3.0');
    assert.equal(plan.updates[0].licenseReviewRequired, false);
    assert.equal(plan.updates[0].checks.embeddedDependencies, 'not-run');
    assert.equal(plan.updates[0].checks.archiveIntegrity, 'not-run');
    assert.equal(plan.updates[0].checks.powerUiIntegration, 'not-run');
    assert.equal(plan.baseline.find(file => file.path === 'assets/LICENSE.txt').exists, false);
    assert.deepEqual(await planUpdates(args), plan);
    assert.equal(await readFile(path.join(fixture.root, 'includes.json'), 'utf8'), fixture.inventory);
    assert.equal(await readFile(path.join(fixture.root, 'assets', 'mermaid.min.js'), 'utf8'), 'fixture-original');
    assert.equal(fixture.git('diff', '--cached', '--name-only').trim(), '');
});

test('no newer version yields a no-op, not an artifact candidate', async t => {
    const fixture = await checkout(t);
    fixture.entry.version = '12.3.0';
    await writeFile(path.join(fixture.root, 'includes.json'), JSON.stringify([fixture.entry]));
    const plan = await planUpdates({ ...fixture, appId: 'exface.Core', metadataReader });
    assert.equal(plan.updates[0].status, 'up-to-date');
    assert.equal(plan.updates[0].candidate, null);
});

test('unknown/disabled apps, incorrect repo/branch and invalid inventory fail before network', async t => {
    const fixture = await checkout(t);
    const reader = async () => { assert.fail('Unexpected network request'); };
    const args = { ...fixture, appId: 'unknown', metadataReader: reader };
    await assert.rejects(planUpdates(args), /Unknown or disabled/);
    fixture.registry.apps[0].enabled = false;
    await assert.rejects(planUpdates({ ...args, appId: 'exface.Core' }), /Unknown or disabled/);
    fixture.registry.apps[0].enabled = true;
    fixture.git('remote', 'set-url', 'origin', 'https://github.com/other/Core.git');
    await assert.rejects(planUpdates({ ...args, appId: 'exface.Core' }), /origin/);
    fixture.git('remote', 'set-url', 'origin', 'git@github.com:ExFace/Core.git');
    fixture.git('checkout', '-b', 'other');
    await assert.rejects(planUpdates({ ...args, appId: 'exface.Core' }), /branch/);
    fixture.git('checkout', '1.x-dev');
    fixture.entry.update.command = 'unsafe';
    await writeFile(path.join(fixture.root, 'includes.json'), JSON.stringify([fixture.entry]));
    await assert.rejects(planUpdates({ ...args, appId: 'exface.Core' }), /Invalid update/);
});

test('changed target files and inventory baselines abort planning', async t => {
    const fixture = await checkout(t);
    for (const file of ['includes.json', path.join('assets', 'mermaid.min.js')]) {
        await writeFile(path.join(fixture.root, 'includes.json'), fixture.inventory);
        await assert.rejects(planUpdates({
            ...fixture,
            appId: 'exface.Core',
            metadataReader: async () => {
                await writeFile(path.join(fixture.root, file), 'concurrent-user-change');
                return metadataReader();
            }
        }), /baseline changed/);
        assert.equal(await readFile(path.join(fixture.root, file), 'utf8'), 'concurrent-user-change');
    }
});

test('changed license/dependency declarations are visible, never auto-approved', async t => {
    const fixture = await checkout(t);
    const plan = await planUpdates({
        ...fixture,
        appId: 'exface.Core',
        metadataReader: async () => {
            const metadata = metadataFixture();
            metadata.versions['12.3.0'].license = 'Apache-2.0';
            metadata.versions['12.3.0'].dependencies.example = '^2.0.0';
            return { metadata, url: 'https://registry.npmjs.org/mermaid' };
        }
    });
    assert.equal(plan.updates[0].licenseReviewRequired, true);
    assert.equal(plan.updates[0].dependencyDeclarationsChanged, true);
});

test('unmanaged entries cause no metadata access; explicit unmanaged selection fails', async t => {
    const fixture = await checkout(t);
    await writeFile(path.join(fixture.root, 'includes.json'), '[{"name":"unmanaged"}]');
    const args = {
        ...fixture,
        appId: 'exface.Core',
        metadataReader: async () => { assert.fail('Unmanaged inventory must not access npm'); }
    };
    assert.deepEqual((await planUpdates(args)).updates, []);
    await assert.rejects(planUpdates({ ...args, packageName: 'unmanaged' }), /no valid update/);
});

test('reject symlink/junction escapes even for missing declared outputs', async t => {
    const fixture = await checkout(t);
    const outside = await mkdtemp(path.join(os.tmpdir(), 'dependency-updater-outside-'));
    t.after(() => rm(outside, { recursive: true, force: true }));
    const link = path.join(fixture.root, 'escape');
    await symlink(outside, link, process.platform === 'win32' ? 'junction' : 'dir');
    await assert.rejects(resolveFile(fixture.root, 'escape/missing.js', true), /unsafe link/);
    await assert.rejects(resolveFile(link, 'missing.js', true), /root must not/);
});
