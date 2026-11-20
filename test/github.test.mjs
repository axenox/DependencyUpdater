import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { checkExisting, githubClient, publishCandidate, pullBody, updateBranch } from '../src/github.mjs';

/** Minimal verified-payload fixture tests publication without accessing GitHub. */
function fixture() {
    const oApp = { id: 'exface.Core', repository: 'sergejriel/Core', baseBranch: '1.x-dev' };
    const oCandidate = {
        kind: 'npm-candidate',
        plan: {
            app: oApp.id, target: { repository: oApp.repository, branch: oApp.baseBranch, commit: 'base-sha' },
            updates: [{
                name: 'npm-asset/mermaid', installed: { version: '12.2.0' },
                dependencyDeclarationChanges: { added: [], removed: [{ name: 'uuid', previous: '^14.0.0' }], changed: [] },
                candidate: { version: '12.3.0', tarball: 'https://registry.npmjs.org/mermaid/-/mermaid-12.3.0.tgz', integrity: 'sha512-fixture' }
            }]
        },
        files: [{ path: 'includes.json', size: 2, sha256: 'hash', content: 'W10=' }],
        embedded: [{ name: 'example', version: '1.2.3', license: 'MIT' }],
        licenseReview: {
            strategy: 'exact-embedded-originals', status: 'required', embeddedLicenseTexts: 'original-files-collected',
            changes: [], warnings: [{ code: 'original-terms-require-review', message: 'Completeness requires manual review.' }],
            upstreamTerms: [{ path: 'LICENSE', sha256: 'original-license-hash', text: 'original upstream license' }]
        },
        dependencyChanges: { added: [], removed: [{ name: 'uuid', version: '14.0.0' }], changed: [] },
        checks: { archiveIntegrity: 'passed', powerUiIntegration: 'not-run', installationLicenseBom: 'not-run' }
    };
    const sBranch = updateBranch(oApp.id, 'npm-asset/mermaid');
    const sBody = pullBody(oCandidate);
    const oPull = {
        number: 42, state: 'open', draft: true, body: sBody, html_url: 'https://github.com/sergejriel/Core/pull/42',
        user: { login: 'operator' }, head: { ref: sBranch, sha: 'head-sha' }
    };
    const oCommit = {
        sha: 'head-sha', committer: { login: 'operator' },
        commit: {
            author: { name: 'github-actions[bot]' },
            message: `Update\n\nDependencyUpdater-Manifest: ${createHash('sha256').update(sBody).digest('hex')}\n\nTrailer`
        }
    };
    return { app: oApp, candidate: oCandidate, pull: oPull, commit: oCommit, branch: sBranch };
}

test('API credentials are scoped to GitHub and HTTP errors never disclose token bodies', async () => {
    assert.throws(() => githubClient(''), /Missing/);
    const fnApi = githubClient('secret-fixture', async (sUrl, oOptions) => {
        assert.ok(sUrl.startsWith('https://api.github.com/'));
        assert.equal(oOptions.headers.Authorization, 'Bearer secret-fixture');
        assert.equal(oOptions.redirect, 'error');
        return new Response('secret-fixture', { status: 403 });
    });
    await assert.rejects(fnApi('GET', '/user'), oError => !oError.message.includes('secret-fixture') && /403/.test(oError.message));
});

test('PR bodies report factual checks, all hashes and generic manual review only', () => {
    const { candidate: oCandidate } = fixture();
    const sBody = pullBody(oCandidate);
    assert.match(sBody, /powerUiIntegration: \*\*not-run\*\*/);
    assert.match(sBody, /installationLicenseBom: \*\*not-run\*\*/);
    assert.match(sBody, /responsible developer determines/);
    assert.match(sBody, /SHA-256 `hash`/);
    assert.match(sBody, /example@1.2.3/);
    assert.match(sBody, /Removed: uuid@14.0.0/);
    assert.match(sBody, /License review required/);
    assert.match(sBody, /original-files-collected/);
    assert.match(sBody, /exact embedded npm archives only/);
    assert.match(sBody, /never the full dependency tree/);
});

test('changed or missing license declarations are highlighted, never described as approved', () => {
    const { candidate: oCandidate } = fixture();
    oCandidate.licenseReview.changes = [{
        name: 'example', previousVersion: '1.0.0', version: '1.2.3',
        previousLicense: 'EPL-2.0', license: 'EPL-2.0 OR GPL-3.0-or-later'
    }];
    oCandidate.licenseReview.warnings.push({
        name: 'unknown-package', version: '1.0.0', message: 'npm metadata omits the license declaration.'
    });
    oCandidate.embedded.push({ name: 'unknown-package', version: '1.0.0', license: null });
    const sBody = pullBody(oCandidate);
    assert.match(sBody, /License changed.*example/);
    assert.match(sBody, /EPL-2.0 OR GPL-3.0-or-later/);
    assert.match(sBody, /unknown-package@1.0.0: npm metadata omits/);
    assert.match(sBody, /not declared \(manual review\)/);
    assert.match(sBody, /no automatic approval/);
});

test('structural changes are rendered for arbitrary package identities, not special-cased for Mermaid', () => {
    const { candidate: oCandidate } = fixture();
    oCandidate.plan.updates[0].name = 'npm-asset/another-package';
    oCandidate.plan.updates[0].candidate.tarball = 'https://registry.npmjs.org/another-package/-/another-package-12.3.0.tgz';
    oCandidate.plan.updates[0].dependencyDeclarationChanges = {
        added: [{ name: 'new-package', next: '^1.0.0' }],
        removed: [{ name: 'old-package', previous: '^2.0.0' }],
        changed: [{ name: 'changed-package', previous: '^3.0.0', next: '^3.1.0' }]
    };
    oCandidate.dependencyChanges = {
        added: [{ name: 'new-package', version: '1.0.0' }],
        removed: [{ name: 'old-package', version: '2.0.0' }],
        changed: [{ name: 'changed-package', previous: ['3.0.0'], next: ['3.1.0'] }]
    };
    const sBody = pullBody(oCandidate);
    assert.match(sBody, /npm-asset\/another-package/);
    assert.match(sBody, /Added: new-package@1.0.0/);
    assert.match(sBody, /Removed: old-package@2.0.0/);
    assert.match(sBody, /Changed: changed-package: 3.0.0 → 3.1.0/);
    assert.match(sBody, /Changed: changed-package: \^3.0.0 → \^3.1.0/);
    assert.doesNotMatch(sBody, /uuid|mermaid/i);
});

test('human branch commits, edited PR bodies and foreign PR ownership are rejected', () => {
    const { pull: oPull, commit: oCommit, branch: sBranch } = fixture();
    checkExisting(oPull, oCommit, 'operator', sBranch);
    assert.throws(() => checkExisting({ ...oPull, body: `${oPull.body}\nhuman notes` }, oCommit, 'operator', sBranch), /edited/);
    assert.throws(() => checkExisting({ ...oPull, user: { login: 'other' } }, oCommit, 'operator', sBranch), /human/);
    assert.throws(() => checkExisting({ ...oPull, draft: false }, oCommit, 'operator', sBranch), /human/);
    assert.throws(() => checkExisting(oPull, { ...oCommit, commit: { author: { name: 'Human' } } }, 'operator', sBranch), /human/);
});

test('publication creates a scoped draft PR with GitHub bot author and no force writes', async () => {
    const { app: oApp, candidate: oCandidate, branch: sBranch } = fixture();
    const aWrites = [];
    const fnApi = async (sMethod, sRoute, oBody) => {
        if (sMethod !== 'GET') {
            aWrites.push({ method: sMethod, route: sRoute, body: oBody });
            if (sRoute.endsWith('/pulls')) {
                return { html_url: 'created-url' };
            }
            return { sha: 'generated-sha' };
        }
        if (sRoute === '/user') return { id: 123, login: 'operator' };
        if (sRoute.endsWith('/git/ref/heads/1.x-dev')) return { object: { sha: 'base-sha' } };
        if (sRoute.endsWith(`/git/ref/heads/${sBranch}`)) return null;
        if (sRoute.includes('/pulls?')) return [];
        if (sRoute.includes('/git/commits/')) return { tree: { sha: 'base-tree' } };
        assert.fail(`Unexpected API request: ${sRoute}`);
    };
    assert.deepEqual(await publishCandidate(oCandidate, oApp, fnApi), { status: 'created', url: 'created-url' });
    const oCommit = aWrites.find(oWrite => oWrite.route.endsWith('/git/commits')).body;
    assert.equal(oCommit.author.name, 'github-actions[bot]');
    assert.deepEqual(oCommit.committer, { name: 'operator', email: '123+operator@users.noreply.github.com' });
    assert.match(oCommit.message, /Co-authored-by: Copilot/);
    assert.deepEqual(oCommit.parents, ['base-sha']);
    const oPull = aWrites.find(oWrite => oWrite.route.endsWith('/pulls')).body;
    assert.equal(oPull.draft, true);
    assert.equal(oPull.base, '1.x-dev');
    assert.ok(aWrites.every(oWrite => oWrite.body.force === undefined));
});

test('identical owned PR returns unchanged without any API writes', async () => {
    const oFixture = fixture();
    const fnApi = async (sMethod, sRoute) => {
        assert.equal(sMethod, 'GET');
        if (sRoute === '/user') return { id: 123, login: 'operator' };
        if (sRoute.endsWith('/git/ref/heads/1.x-dev')) return { object: { sha: 'base-sha' } };
        if (sRoute.includes('/git/ref/heads/')) return { object: { sha: 'head-sha' } };
        if (sRoute.includes('/pulls?')) return [oFixture.pull];
        if (sRoute.includes('/commits/')) return oFixture.commit;
        if (sRoute.includes('/compare/')) return {
            status: 'ahead', behind_by: 0, total_commits: 1,
            commits: [oFixture.commit], files: [{ filename: 'includes.json' }]
        };
        assert.fail(sRoute);
    };
    assert.equal((await publishCandidate(oFixture.candidate, oFixture.app, fnApi)).status, 'unchanged');
});

test('no-op does not access GitHub; stale baseline never publishes', async () => {
    assert.deepEqual(await publishCandidate({ kind: 'no-op' }, {}, () => assert.fail('API access')), { status: 'no-op' });
    const { candidate: oCandidate, app: oApp } = fixture();
    await assert.rejects(publishCandidate(oCandidate, oApp, async (sMethod, sRoute) => {
        assert.equal(sMethod, 'GET');
        return sRoute === '/user' ? { id: 123, login: 'operator' } : { object: { sha: 'advanced' } };
    }), /advanced/);
});

/** Simulate owned update history, concurrent changes and failed writes without remote side effects. */
function existingApi(oFixture, oOptions = {}) {
    const aWrites = [];
    let iBaseReads = 0;
    let iHeadReads = 0;
    const fnApi = async (sMethod, sRoute, oBody) => {
        if (sMethod !== 'GET') {
            aWrites.push({ method: sMethod, route: sRoute, body: oBody });
            if (oOptions.failRoute && sRoute.endsWith(oOptions.failRoute)) throw new Error('Simulated API failure');
            return sRoute.endsWith('/pulls/42') || sRoute.endsWith('/pulls')
                ? { html_url: 'updated-url' } : { sha: 'new-sha' };
        }
        if (sRoute === '/user') return { id: 123, login: 'operator' };
        if (sRoute.endsWith('/git/ref/heads/1.x-dev')) {
            return { object: { sha: oOptions.baseRace && ++iBaseReads > 1 ? 'advanced' : 'base-sha' } };
        }
        if (sRoute.includes('/git/ref/heads/')) {
            if (oOptions.noRef) return null;
            return { object: { sha: oOptions.headRace && ++iHeadReads > 1 ? 'human-sha' : 'head-sha' } };
        }
        if (sRoute.includes('/pulls?')) {
            return [{ ...oFixture.pull, ...(oOptions.closed ? { state: 'closed', merged_at: oOptions.merged ? 'date' : null } : {}) }];
        }
        if (sRoute.includes('/git/commits/')) return { tree: { sha: 'base-tree' } };
        if (sRoute.includes('/commits/')) return oFixture.commit;
        if (sRoute.includes('/compare/')) return {
            status: 'ahead', behind_by: 0, total_commits: 1,
            commits: oOptions.humanHistory
                ? [{ ...oFixture.commit, committer: { login: 'human' } }] : [oFixture.commit],
            files: [{ filename: oOptions.unexpectedFile ? 'unrelated.txt' : 'includes.json' }]
        };
        if (sRoute.endsWith('/pulls/42')) {
            return oOptions.pullRace ? { ...oFixture.pull, body: 'human edit' } : oFixture.pull;
        }
        assert.fail(`Unexpected API request: ${sRoute}`);
    };
    return { api: fnApi, writes: aWrites };
}

test('owned PR updates fast-forward only and retain the bot author with explicit token-account committer', async () => {
    const oFixture = fixture();
    oFixture.candidate.plan.updates[0].candidate.version = '12.3.1';
    const { api: fnApi, writes: aWrites } = existingApi(oFixture);
    assert.equal((await publishCandidate(oFixture.candidate, oFixture.app, fnApi)).status, 'updated');
    assert.deepEqual(aWrites.find(oWrite => oWrite.route.endsWith('/git/commits')).body.parents, ['head-sha']);
    const oRefWrite = aWrites.find(oWrite => oWrite.route.includes('/git/refs/heads/'));
    assert.equal(oRefWrite.body.force, false);
    assert.equal(aWrites.filter(oWrite => oWrite.route.endsWith('/pulls/42')).length, 1);
});

test('human history, undeclared paths and closed/unmerged or orphan branches stop before writes', async () => {
    for (const oOptions of [{ humanHistory: true }, { unexpectedFile: true }, { closed: true }, { closed: true, merged: true }]) {
        const oFixture = fixture();
        const { api: fnApi, writes: aWrites } = existingApi(oFixture, oOptions);
        await assert.rejects(publishCandidate(oFixture.candidate, oFixture.app, fnApi),
            /unrecognized history|undeclared paths|closed without merge|no open owned PR/);
        assert.equal(aWrites.length, 0);
    }
});

test('merged PRs can start a new branch only after the previous branch was explicitly removed', async () => {
    const oFixture = fixture();
    const { api: fnApi } = existingApi(oFixture, { closed: true, merged: true, noRef: true });
    assert.equal((await publishCandidate(oFixture.candidate, oFixture.app, fnApi)).status, 'created');
});

test('concurrent base, head and body edits never update a branch ref or PR', async () => {
    for (const oOptions of [{ baseRace: true }, { headRace: true }, { pullRace: true }]) {
        const oFixture = fixture();
        oFixture.candidate.plan.updates[0].candidate.version = '12.3.1';
        const { api: fnApi, writes: aWrites } = existingApi(oFixture, oOptions);
        await assert.rejects(publishCandidate(oFixture.candidate, oFixture.app, fnApi), /advanced|concurrent edits/);
        assert.ok(aWrites.every(oWrite => !oWrite.route.includes('/git/refs') && !oWrite.route.includes('/pulls')));
    }
});

test('ref and PR API failures propagate explicitly and never report a successful update', async () => {
    for (const sSuffix of ['/pulls/42', `/git/refs/heads/${fixture().branch}`]) {
        const oFixture = fixture();
        oFixture.candidate.plan.updates[0].candidate.version = '12.3.1';
        const { api: fnApi } = existingApi(oFixture, { failRoute: sSuffix });
        await assert.rejects(publishCandidate(oFixture.candidate, oFixture.app, fnApi), /Simulated API failure/);
    }
});
