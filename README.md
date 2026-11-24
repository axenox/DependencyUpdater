# DependencyUpdater

Central automation for updating bundled third-party dependencies across ExFace
apps and creating reviewable pull requests.

## Status

The current local implementation includes npm/Packagist planning, verified original
distribution acquisition, candidate reconstruction and a **manual draft-PR
workflow**. The active trial targets PHP_XLSXWriter 0.37 -> 0.39 in the configured
fork `sergejriel/Core`; Mermaid has been removed from Core's inventory, but its
recipe remains available.
`Config/apps.json` authorizes the target; its `includes.json` supplies declarative
update definitions. This is not a runtime dependency of Core or UI5Facade.

Remote workflow/publication acceptance is pending. The isolated real 12.2.0 to
12.3.0 candidate uses the approved exact-embedded-originals strategy. License
changes, missing embedded declarations and unverified attribution coverage are
prominent draft-PR findings, not automatic approvals. Dependency structure
changes are reported generically, not blocked by themselves.
See [Status](Docs/Development/Status.md) for precise evidence and blockers.
ECharts's Apache browser adapter, scheduling and additional apps remain deferred.

Bundle-specific code lives in `Recipes/mermaid` and `Recipes/php-xlsxwriter`.
The shared `src` modules handle policy, safe I/O, inventory and publication;
`src/recipes.mjs` selects only trusted registered implementations. Existing
inventory definitions need no new executable recipe field. See
[Architecture](Docs/Architecture.md#bundle-recipes-and-shared-result-contract).

Before replacement, the Mermaid recipe compares existing bundled files against
the **previous** release's original npm bytes, so updates cannot silently remove
local patches. Shared fingerprints separately detect changes **during** the run.
Read [why both checks are needed](Docs/Development/Configuration.md#protecting-existing-files-before-an-update).

Use Node.js 24 in a development checkout outside the production webroot:
PHP 8 with ZIP is also needed for PHP syntax checks and the offline XLSX tests.

```powershell
npm ci --ignore-scripts --no-audit --no-fund
npm test
node cli.mjs apps
node cli.mjs plan --app exface.Core --root 'C:\path\to\Core' --package mk-j/php_xlsxwriter
```

Commands print JSON to stdout and errors to stderr with nonzero exit status.
Plans do not change files or install/execute upstream packages.

## Activate the fork trial

1. Publish this updater source/workflow to the default branch of
   your updater fork `sergejriel/DependencyUpdater` (`master`).
   No workflow has been dispatched by the implementation.
2. Upload the adjusted Core `includes.json` to `sergejriel/Core` on
   `feature/Devman-3415-dependency-updater`.
   Keep its actual installed version; do not manufacture a downgrade.
3. Configure the `fork-publishing` GitHub environment in the updater repository,
   preferably with required reviewers and default-branch deployment restrictions.
   Add `TARGET_REPO_TOKEN`: a fine-grained PAT restricted to `sergejriel/Core`,
   with Contents write, Pull requests write and Metadata read.
4. Manually run **Update bundled dependency** on the updater default branch,
   with app `exface.Core` and package `mk-j/php_xlsxwriter`.
5. Review reported license changes, unknown declarations and attribution coverage
   before merge. The workflow reuses reliably mapped upstream originals first,
   otherwise downloads integrity-checked exact embedded npm archives only, not
   the full dependency tree. Original texts/provenance are saved in declared
   notices/evidence and supported package-specific inventory text fields.
   Unknown declarations remain unknown; original files collected is not legal
   completeness or automatic approval.

The PHP recipe transfers the reviewed Core namespace, column-options extension
and PHP compatibility behavior to upstream 0.39. It refuses unknown source
fingerprints or additional installed patches rather than discarding them.
See [PHP_XLSXWriter](Docs/Development/PHP_XLSXWriter.md) for the exact proof,
outputs, version limit and test instructions. This does not update the live
Core runtime; the proposed 0.39 file is created in the candidate/PR only.

The generation job has no target-write token. The separate publisher recreates
the candidate before using GitHub's API. Commit author is `github-actions[bot]`;
the explicit committer and PR creator are the token account. PRs are drafts,
never automatically merged. See [Configuration](Docs/Development/Configuration.md)
for local pipeline commands, failure handling and safe retries.

The former Core-local Rollup/Terser build and updater prototype have been
retired from Core, not copied here as a working central tool. Runtime assets
and license files remain in their owning app. Do not use the former Core CLI
commands or add copies of its build tooling to other apps.

## Documentation

### Requirements and delivery

- [Requirements: scope and acceptance](Docs/Requirements/Requirements.md)
- [Approach: architecture and decisions](Docs/Requirements/Approach.md)
- [Plan: complete development phases](Docs/Requirements/Plan.md)

### Development

- [Architecture: all maintained files and data flow](Docs/Architecture.md)
- [Working instructions](Docs/Development/Bundled_library_updates.Instructions.md)
- [Implementation status and retained evidence](Docs/Development/Status.md)
- [Implemented configuration and CLI](Docs/Development/Configuration.md)
- [Mermaid npm workflow and test-page findings](Docs/Development/Mermaid.md)
- [PHP_XLSXWriter trial and preserved Core adaptations](Docs/Development/PHP_XLSXWriter.md)
- [ECharts online-builder findings and configuration](Docs/Development/ECharts.md)

App repositories retain `includes.json` and their bundled runtime/license files.
The updater owns shared discovery, policy handling, candidate validation and PR
publication; its registered recipes support Mermaid and the reviewed PHP_XLSXWriter sources.
App-specific options remain
declarative, never executable app-provided commands.
