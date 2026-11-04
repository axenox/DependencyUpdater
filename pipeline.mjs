import { parseArgs, isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, lstat } from 'node:fs/promises';
import path from 'node:path';
import { readJson } from './src/paths.mjs';
import { selectApps } from './src/config.mjs';
import { createCandidate, verifyCandidate } from './src/candidate.mjs';
import { githubClient, publishCandidate } from './src/github.mjs';

/** Git cloning never inherits target-write tokens, credential helpers or target hooks. */
export function cloneTarget(oApp, sRoot) {
    const oEnv = {
        PATH: process.env.PATH,
        ...(process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot } : {}),
        GIT_TERMINAL_PROMPT: '0',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null'
    };
    execFileSync('git', [
        '-c', 'credential.helper=', '-c', `core.hooksPath=${path.join(path.dirname(sRoot), 'disabled-hooks')}`,
        'clone', '--depth', '1', '--single-branch', '--branch', oApp.baseBranch,
        '--', `https://github.com/${oApp.repository}.git`, sRoot
    ], { env: oEnv, windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
}

/** Candidate reports are bounded data, never executable code or arbitrary filesystem references. */
async function loadCandidate(sFile) {
    const oStat = await lstat(sFile);
    if (!oStat.isFile() || oStat.isSymbolicLink() || oStat.size > 192 * 1024 * 1024) {
        throw new Error('Candidate must be a regular JSON file smaller than 192 MiB.');
    }
    return JSON.parse(await readFile(sFile, 'utf8'));
}

/** Run manual generation/publication in fresh explicitly supplied disposable directories. */
export async function main(aArguments) {
    const { values: oArgs, positionals: aCommands } = parseArgs({
        args: aArguments,
        options: {
            app: { type: 'string' },
            package: { type: 'string' },
            workspace: { type: 'string' },
            output: { type: 'string' },
            candidate: { type: 'string' }
        },
        allowPositionals: true
    });
    const sCommand = aCommands[0];
    if (aCommands.length !== 1 || !['prepare', 'publish', 'verify'].includes(sCommand)
        || !oArgs.app || !oArgs.package || !oArgs.workspace
        || (sCommand === 'prepare' ? !oArgs.output || oArgs.candidate : !oArgs.candidate || oArgs.output)) {
        throw new Error('Usage: pipeline.mjs prepare --app ID --package NAME --workspace NEW_DIR --output NEW_DIR | verify/publish --app ID --package NAME --workspace NEW_DIR --candidate FILE');
    }
    const oRegistry = await readJson(fileURLToPath(new URL('./Config/apps.json', import.meta.url)));
    const [oApp] = selectApps(oRegistry, oArgs.app);
    const sWorkspace = path.resolve(oArgs.workspace);
    // Non-recursive creation deliberately refuses existing directories and shared checkout reuse.
    await mkdir(sWorkspace);
    const sRoot = path.join(sWorkspace, 'target');
    cloneTarget(oApp, sRoot);
    const oOptions = {
        registry: oRegistry, appId: oArgs.app, root: sRoot, packageName: oArgs.package
    };
    if (sCommand === 'prepare') {
        const oCandidate = await createCandidate(oOptions);
        const sOutput = path.resolve(oArgs.output);
        await mkdir(sOutput);
        await writeFile(path.join(sOutput, 'candidate.json'), `${JSON.stringify(oCandidate)}\n`, { flag: 'wx' });
        return { status: oCandidate.kind, files: oCandidate.files?.map(oFile => oFile.path) ?? [] };
    }
    const oCandidate = await loadCandidate(oArgs.candidate);
    if (oCandidate.plan?.app !== oApp.id || oCandidate.plan?.updates?.[0]?.name !== oArgs.package) {
        throw new Error('Candidate does not match the explicitly requested registered target/package.');
    }
    await verifyCandidate(oCandidate, oOptions);
    if (sCommand === 'verify') {
        return { status: 'verified', kind: oCandidate.kind };
    }
    if (oCandidate.kind === 'no-op') {
        return { status: 'no-op' };
    }
    return publishCandidate(oCandidate, oApp, githubClient(process.env.TARGET_REPO_TOKEN));
}

if (process.argv[1] && isDeepStrictEqual(path.resolve(process.argv[1]), fileURLToPath(import.meta.url))) {
    main(process.argv.slice(2)).then(oResult => {
        process.stdout.write(`${JSON.stringify(oResult, null, 2)}\n`);
    }).catch(oError => {
        process.stderr.write(`DependencyUpdater: ${oError.message}\n`);
        process.exitCode = 1;
    });
}
