/**
 * Render factual draft-PR reports and publish already verified candidates through GitHub APIs.
 * Keep credentials confined to GitHub and update only recognized, untouched owned drafts.
 * Never force-push, merge automatically or execute target/package code.
 */
import { createHash } from 'node:crypto';

const sMarker = '<!-- dependencyupdater:v1 -->';

/** Bind a stable branch to one registered app/library without accepting a user-supplied branch. */
export function updateBranch(sApp, sPackage) {
    const sId = createHash('sha256').update(`${sApp}\n${sPackage}`).digest('hex').slice(0, 16);
    return `dependencyupdater/${sId}`;
}

/** Only explicit bot-owned, untouched PRs are eligible for safe no-force continuation. */
export function checkExisting(oPull, oCommit, sActor, sBranch) {
    if (oPull.user?.login !== sActor || oPull.draft !== true || !oPull.body?.startsWith(sMarker)
        || oPull.head?.ref !== sBranch || oPull.head?.sha !== oCommit.sha
        || oCommit.committer?.login !== sActor
        || oCommit.commit?.author?.name !== 'github-actions[bot]'
        || !oCommit.commit.message.includes('\nDependencyUpdater-Manifest: ')) {
        throw new Error('Existing update branch/PR has human or unrecognized changes; refusing to overwrite.');
    }
    const sMatch = /\nDependencyUpdater-Manifest: ([a-f0-9]{64})\n/.exec(oCommit.commit.message)?.[1];
    const sBodyHash = createHash('sha256').update(oPull.body).digest('hex');
    if (sMatch !== sBodyHash) {
        throw new Error('Existing PR body was edited; refusing to overwrite human changes.');
    }
}

/** Generate factual review text without guessing package-specific manual acceptance steps. */
export function pullBody(oCandidate) {
    const oUpdate = oCandidate.plan.updates[0];
    const aLines = [
        sMarker,
        `Update **${oUpdate.name}** from **${oUpdate.installed.version}** to **${oUpdate.candidate.version}**.`,
        '',
        `Base commit: \`${oCandidate.plan.target.commit}\``,
        ...(oUpdate.candidate.source ? [
            `Source: ${oUpdate.candidate.source.url}`,
            `Git commit: \`${oUpdate.candidate.source.reference}\``,
            'Source identity: commit tree and Git blob hashes checked; no registry archive integrity is supplied.'
        ] : [
            `Source: ${oUpdate.candidate.tarball}`,
            `Registry integrity: \`${oUpdate.candidate.integrity}\``
        ]),
        '',
        '### License review required — no automatic approval',
        'Strategy: reuse exactly mapped upstream originals; otherwise verify exact embedded npm archives only, never the full dependency tree.',
        `Embedded license-text coverage: **${oCandidate.licenseReview.embeddedLicenseTexts}**.`,
        ...oCandidate.licenseReview.changes.map(oChange =>
            `- **License changed:** ${oChange.name} (${oChange.previousVersion} → ${oChange.version}): `
            + `\`${oChange.previousLicense ?? 'not declared'}\` → \`${oChange.license ?? 'not declared'}\`.`),
        ...oCandidate.licenseReview.warnings.map(oWarning =>
            `- **Warning:** ${oWarning.name ? `${oWarning.name}@${oWarning.version}: ` : ''}${oWarning.message}`),
        ...oCandidate.licenseReview.upstreamTerms.map(oTerm =>
            `- Original upstream file: \`${oTerm.path}\` (SHA-256 \`${oTerm.sha256}\`).`),
        '',
        '### Upstream dependency declarations (ranges, not shipped exact versions)',
        ...oUpdate.dependencyDeclarationChanges.added.map(oPackage => `- Added: ${oPackage.name}: ${oPackage.next}`),
        ...oUpdate.dependencyDeclarationChanges.removed.map(oPackage => `- Removed: ${oPackage.name}: ${oPackage.previous}`),
        ...oUpdate.dependencyDeclarationChanges.changed.map(oPackage =>
            `- Changed: ${oPackage.name}: ${oPackage.previous} → ${oPackage.next}`),
        '',
        '### Automatic checks',
        ...Object.entries(oCandidate.checks).map(([sName, sResult]) => `- ${sName}: **${sResult}**`),
        '',
        '### Changed files',
        ...oCandidate.files.map(oFile => `- \`${oFile.path}\` (${oFile.size} bytes; SHA-256 \`${oFile.sha256}\`)`),
        '',
        '### Embedded packages',
        ...oCandidate.embedded.map(oPackage => `- ${oPackage.name}@${oPackage.version} — ${oPackage.license ?? 'not declared (manual review)'}`),
        '',
        '### Embedded dependency changes (manual review required)',
        ...oCandidate.dependencyChanges.added.map(oPackage => `- Added: ${oPackage.name}@${oPackage.version}`),
        ...oCandidate.dependencyChanges.removed.map(oPackage => `- Removed: ${oPackage.name}@${oPackage.version}`),
        ...oCandidate.dependencyChanges.changed.map(oPackage =>
            `- Changed: ${oPackage.name}: ${oPackage.previous.join(', ')} → ${oPackage.next.join(', ')}`),
        ...(Object.values(oCandidate.dependencyChanges).every(aChanges => aChanges.length === 0)
            ? ['No embedded package identity/version changes.'] : []),
        '',
        'Supplied upstream license/notice texts and recipe-specific source identities are retained in the evidence files.',
        'Embedded inventory licenses retain npm declarations and package-specific original texts when declared; unknown declarations retain originals in the notices/evidence, not a guessed license.',
        'License approval and full installation BOM acceptance remain the reviewer’s responsibility; this is a draft PR.',
        '',
        'Integration and functionality in PowerUI have not been automatically verified.',
        'The responsible developer determines and performs the required manual checks during review before merge.',
        '',
        'No automatic merge. No package scripts or downloaded runtime code were executed; PHP syntax lint does not execute the source.'
    ];
    return aLines.join('\n');
}

/** Use a narrowly scoped token only for GitHub API calls, never registry requests or subprocesses. */
export function githubClient(sToken, fnFetch = fetch) {
    if (!sToken) {
        throw new Error('Missing TARGET_REPO_TOKEN; configure a token scoped to the registered fork.');
    }
    return async (sMethod, sRoute, oBody, bAllow404 = false) => {
        const oResponse = await fnFetch(`https://api.github.com${sRoute}`, {
            method: sMethod,
            headers: {
                Authorization: `Bearer ${sToken}`, Accept: 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                ...(oBody ? { 'Content-Type': 'application/json' } : {})
            },
            body: oBody ? JSON.stringify(oBody) : undefined,
            redirect: 'error', signal: AbortSignal.timeout(60000)
        });
        if (bAllow404 && oResponse.status === 404) {
            return null;
        }
        if (!oResponse.ok) {
            throw new Error(`GitHub ${sMethod} ${sRoute}: HTTP ${oResponse.status}; check permissions, baseline and branch protection.`);
        }
        return oResponse.json();
    };
}

/** Publish a verified candidate via Git data APIs; never execute target code or force-update refs. */
export async function publishCandidate(oCandidate, oApp, fnApi) {
    if (oCandidate.kind === 'no-op') {
        return { status: 'no-op' };
    }
    if (oCandidate.kind !== 'dependency-candidate' || oCandidate.plan.app !== oApp.id
        || oCandidate.plan.target.repository !== oApp.repository
        || oCandidate.plan.target.branch !== oApp.baseBranch || !oCandidate.files.length) {
        throw new Error('Candidate target/publication contract mismatch.');
    }
    const sRepo = `/repos/${oApp.repository}`;
    const oActor = await fnApi('GET', '/user');
    if (!Number.isSafeInteger(oActor.id) || oActor.id <= 0
        || typeof oActor.login !== 'string' || !/^[a-zA-Z0-9-]+$/.test(oActor.login)) {
        throw new Error('GitHub token did not resolve to a valid publishing user identity.');
    }
    const oBase = await fnApi('GET', `${sRepo}/git/ref/heads/${oApp.baseBranch}`);
    if (oBase.object.sha !== oCandidate.plan.target.commit) {
        throw new Error('Remote base branch advanced; generate a new candidate.');
    }
    const sPackage = oCandidate.plan.updates[0].name;
    const sBranch = updateBranch(oApp.id, sPackage);
    const oRef = await fnApi('GET', `${sRepo}/git/ref/heads/${sBranch}`, undefined, true);
    const aPulls = await fnApi('GET', `${sRepo}/pulls?state=all&head=${oApp.repository.split('/')[0]}:${sBranch}&base=${encodeURIComponent(oApp.baseBranch)}&per_page=100`);
    const aOpen = aPulls.filter(oPull => oPull.state === 'open');
    if (aOpen.length > 1 || (aOpen.length && !oRef)) {
        throw new Error('Conflicting update branch/PR state.');
    }
    if (!aOpen.length && aPulls.some(oPull => !oPull.merged_at)) {
        throw new Error('Update PR was closed without merge; explicit operator review required.');
    }
    const sBody = pullBody(oCandidate);
    let sParent = oBase.object.sha;
    if (oRef) {
        if (!aOpen.length) {
            throw new Error('An existing update branch has no open owned PR; inspect/delete it explicitly before retrying.');
        }
        const oCommit = await fnApi('GET', `${sRepo}/commits/${oRef.object.sha}`);
        checkExisting(aOpen[0], oCommit, oActor.login, sBranch);
        const oCompare = await fnApi('GET', `${sRepo}/compare/${oBase.object.sha}...${oRef.object.sha}`);
        if (oCompare.status !== 'ahead' || oCompare.behind_by !== 0
            || !Array.isArray(oCompare.commits) || oCompare.commits.length !== oCompare.total_commits
            || oCompare.files?.length >= 300
            || oCompare.commits.some(oItem => oItem.committer?.login !== oActor.login
                || oItem.commit?.author?.name !== 'github-actions[bot]'
                || !oItem.commit.message.includes('\nDependencyUpdater-Manifest: '))) {
            throw new Error('Update branch diverged or contains unrecognized history.');
        }
        const oAllowed = new Set(oCandidate.files.map(oFile => oFile.path));
        if (oCompare.files.some(oFile => !oAllowed.has(oFile.filename))) {
            throw new Error('Update branch contains undeclared paths.');
        }
        if (aOpen[0].body === sBody) {
            return { status: 'unchanged', url: aOpen[0].html_url };
        }
        sParent = oRef.object.sha;
    }
    const oBaseCommit = await fnApi('GET', `${sRepo}/git/commits/${oBase.object.sha}`);
    const aTree = [];
    for (const oFile of oCandidate.files) {
        const oBlob = await fnApi('POST', `${sRepo}/git/blobs`, { content: oFile.content, encoding: 'base64' });
        aTree.push({ path: oFile.path, mode: '100644', type: 'blob', sha: oBlob.sha });
    }
    const oTree = await fnApi('POST', `${sRepo}/git/trees`, { base_tree: oBaseCommit.tree.sha, tree: aTree });
    const sBodyHash = createHash('sha256').update(sBody).digest('hex');
    const oCommit = await fnApi('POST', `${sRepo}/git/commits`, {
        message: `Update ${sPackage} to ${oCandidate.plan.updates[0].candidate.version}\n\n`
            + `DependencyUpdater-Manifest: ${sBodyHash}\n\n`
            + 'Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>',
        tree: oTree.sha, parents: [sParent],
        author: { name: 'github-actions[bot]', email: '41898282+github-actions[bot]@users.noreply.github.com' },
        committer: { name: oActor.login, email: `${oActor.id}+${oActor.login}@users.noreply.github.com` }
    });
    const oFreshBase = await fnApi('GET', `${sRepo}/git/ref/heads/${oApp.baseBranch}`);
    if (oFreshBase.object.sha !== oBase.object.sha) {
        throw new Error('Remote base advanced before branch publication; no update branch was written.');
    }
    if (oRef) {
        const oFreshPull = await fnApi('GET', `${sRepo}/pulls/${aOpen[0].number}`);
        const oFreshHead = await fnApi('GET', `${sRepo}/git/ref/heads/${sBranch}`);
        if (oFreshPull.state !== 'open' || oFreshPull.draft !== true
            || oFreshPull.body !== aOpen[0].body || oFreshHead.object.sha !== sParent) {
            throw new Error('Update PR/branch changed during publication; refusing concurrent edits.');
        }
        await fnApi('PATCH', `${sRepo}/git/refs/heads/${sBranch}`, { sha: oCommit.sha, force: false });
        const oPull = await fnApi('PATCH', `${sRepo}/pulls/${aOpen[0].number}`, {
            title: `Update ${sPackage} to ${oCandidate.plan.updates[0].candidate.version}`, body: sBody
        });
        return { status: 'updated', url: oPull.html_url };
    }
    await fnApi('POST', `${sRepo}/git/refs`, { ref: `refs/heads/${sBranch}`, sha: oCommit.sha });
    const oPull = await fnApi('POST', `${sRepo}/pulls`, {
        title: `Update ${sPackage} to ${oCandidate.plan.updates[0].candidate.version}`,
        head: sBranch, base: oApp.baseBranch, body: sBody, draft: true
    });
    return { status: 'created', url: oPull.html_url };
}
