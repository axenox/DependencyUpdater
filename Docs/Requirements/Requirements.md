# Requirements

Baseline: 2026-11-03. These are the agreed scope and acceptance requirements,
not a description of implemented features. See [Approach](Approach.md),
[Plan](Plan.md) and [development status](../Development/Status.md).

## Purpose and scope

Maintain third-party libraries bundled directly in registered ExFace app
repositories through one central updater. Updates must provide matching assets,
inventory and licensing information in reviewable PRs. Mermaid in Core, obtained
from its published npm distribution without rebuilding, is the first end-to-end
case. ECharts and its browser adapter follow later. Development and initial acceptance focus exclusively on
Core; other apps are tried only after the Core workflow is complete and accepted.
The architecture must accommodate that later reuse and different library-specific
acquisition procedures without implementing or activating additional apps now.

## Centralization and configuration

| ID | Requirement |
| --- | --- |
| CFG-01 | Shared discovery, policies, adapters, validation and publication live only in DependencyUpdater; consuming apps must not need copies of its build/tooling code. |
| CFG-02 | Preserve the existing `includes.json` array and PackageManager inventory compatibility. Entries without optional update definitions remain valid and cause no update requests or writes. |
| CFG-03 | Define a versioned declarative update schema separating provider, policy and artifact adapter/options. Reject unsupported schema versions, unknown executable adapters and invalid definitions explicitly. |
| CFG-04 | App definitions must not supply arbitrary commands, executable module paths, credentials or destination repositories. Register allowed repositories and base branches centrally. |
| CFG-05 | Declare all writable metadata and output files explicitly, with paths relative to the owning app. No globs, directory-wide replacement/deletion or implicit outputs. Multiple apps may configure the same adapter differently. |
| CFG-06 | Maintain one explicit, version-controlled app list in DependencyUpdater as the source of authorized processing targets. Each registration identifies the app, repository, base branch, inventory path and enabled/disabled state; it contains no credentials. Initially register and enable only Core. Scheduled runs process only enabled registrations; manual selections may narrow this set, never expand it. Do not discover or enroll apps implicitly from installed packages, organization repositories or app-supplied data. Reject invalid/duplicate registrations and explicitly selected unknown/disabled targets before target access. |

## Version discovery and policy

| ID | Requirement |
| --- | --- |
| VER-01 | Initially discover exact release metadata through public npm with explicit network failures, bounded responses/timeouts and provenance validation. |
| VER-02 | Initially support stable `same-major`: select the highest newer allowed stable, non-deprecated release in the installed major; never select prereleases or downgrade. For `0.x`, minor changes within major zero are allowed. |
| VER-03 | Verify actual artifact and embedded dependency versions against the selected candidate, not filenames, download success or intended URL alone. Dependency pins must reflect upstream evidence. Reject newly introduced embedded versions below that package's previous minimum; removing a coexisting version is structural, not by itself a downgrade. For every package/adapter, report dependency additions, removals and structural/version changes in the PR without blocking them alone. Keep declared ranges distinct from exact embedded versions. Missing artifact/version evidence and failed configured checks remain errors; license findings follow LIC-01/LIC-02. |
| VER-04 | An up-to-date entry is a no-op without unnecessary artifact writes or PRs. A future rebuild option, if implemented, must be explicit and use the recorded exact version without weakening policy. |

## Artifacts, Mermaid and ECharts

| ID | Requirement |
| --- | --- |
| ART-01 | Keep package-specific acquisition, filenames, runtime checks, dependency-evidence extraction and installed-file proof under central `Recipes/<bundle>`. Select only statically registered trusted provider/package/adapter combinations, never executable inventory paths. Recipes return a shared normalized artifact/identity/license/evidence/check contract; shared orchestration must not assume a particular bundle, source map or runtime format. Reuse common archive/path/policy/reporting helpers. |
| ART-02 | The ECharts adapter uses the real Apache online-builder page in a browser and captures the completed JS output. No own Rollup/UglifyJS/Terser pipeline, re-minification or silent fallback. |
| ART-03 | ECharts module selection is declarative and app-specific. Preserve the existing Core selection documented in `Docs/Development/ECharts.md`; retain required Utilities, renderer and component behavior. |
| ART-04 | Handle page/network/build failures, timeouts, missing/partial downloads, unsupported selections, incorrect versions and unexpected files as explicit failures. Do not create a version-only update on failure. |
| ART-05 | Capture target commit, selected versions, configuration, source URLs, builder provenance, actual loaded package identities, artifact hashes/sizes and validation scope. Do not claim permanent reproducibility or official Apache distribution status. |
| ART-06 | Preserve original required licensing/attribution files and verified package metadata alongside the runtime output. Validate the actual candidate, never a substitute build. |
| ART-07 | Start with Mermaid through the reusable `npm-dist` adapter: verify exact main-package archive integrity before reading mapped original files, without lifecycle scripts, installation or rebuilding. Fail on missing required main-package files, unsafe archives, wrong identity or unsupported assets. Determine embedded identities from actual distribution evidence, not dependency ranges. Reuse supplied terms only with trustworthy exact identity mapping; otherwise read integrity-checked archives of actual embedded packages only. Never traverse the dependency tree or treat file collection as legal completeness. |

## Isolation, transfer and publication

| ID | Requirement |
| --- | --- |
| TX-01 | Work in fresh development/CI workspaces outside production webroots. Do not install updater/browser/build tooling as an app runtime dependency. |
| TX-02 | Bind candidates to an exact allowlisted target checkout/commit and relevant source fingerprints. Reject changed baselines rather than overwriting concurrent edits. Separately protect modifications present before the run through the recipe's installed-file proof: Mermaid compares all installed mappings byte-for-byte against the previous release's verified npm originals. A future generated bundle needs its own appropriate proof, not a bypass of shared baseline guards. |
| TX-03 | Reject path traversal, device paths, symlink/junction escapes, duplicate/overlapping outputs and writes outside approved boundaries. |
| TX-04 | Apply only changed declared files with consistent inventory; leave unchanged assets, historical bundles and unrelated user changes untouched. |
| TX-05 | Failed/interrupted transactions must not be published as successful. Use disposable checkouts or tested backup/rollback/recovery; never claim globally atomic multi-file replacement. |
| TX-06 | Browser/artifact execution has no production secrets or target write credentials. Use restricted environments/disposable workers and a separate least-privilege publishing job. |
| PR-01 | Create or update PRs in registered target repositories. Start with one stable branch/PR identity per repository/library; repeated/no-op runs must not create duplicates or empty commits. |
| PR-02 | Do not overwrite human edits in an update branch, force-update unrelated work or silently close/replace human-owned PRs. Conflicts require an explicit diagnostic. |
| PR-03 | Report old/new package versions, embedded dependencies, changed files, provenance, licensing changes and actual automatic check results. Distinguish passed, failed, skipped and not-run checks. |
| PR-04 | Never merge automatically. The reviewer determines manual integration checks; do not infer package-specific manual checklists or require manual-test configuration in the inventory. |
| PR-05 | Support a manually triggered CI path before adding scheduled runs. Isolate failures/concurrency between targets and give each failure an actionable report. |

When PowerUI integration has not been automatically verified, PRs must include:

> Integration and functionality in PowerUI have not been automatically verified.
> The responsible developer determines and performs the required manual checks
> during review before merge.

Partial integration coverage must be described accurately. Missing comprehensive
PowerUI tests do not block PR creation; failed configured checks do block a
successful candidate.

## Licensing and inventory acceptance

| ID | Requirement |
| --- | --- |
| LIC-01 | Validate main-package registry/manifest license agreement and preserve its original terms plus all supplied upstream license/notice files. First reuse originals with trustworthy exact embedded identity mapping, not an unmapped aggregate/main license. Otherwise download integrity-checked exact embedded npm archives, not their dependency tree. Preserve LICENSE/NOTICE/copyright and relevant README terms, original bytes/hashes/paths and archive URL/integrity durably in declared notices/evidence; attach package-specific texts through supported inventory fields. Keep registry declarations, manifest declarations and original text evidence separate. Unknown registry licenses remain unknown: never infer a declaration from text, substitute generic SPDX/MIT terms or assign main terms to embedded code. |
| LIC-02 | Report changed declarations, missing originals/declarations and contradictory embedded registry/manifest declarations prominently in a draft PR; these findings alone do not block candidate creation and never imply approval. No automatic legal-compatibility decision or license selection from alternatives. Network, integrity, unsafe archive and identity failures must fail explicitly, never become missing-evidence warnings. Inconsistent main-package metadata/inventory and missing required original main-package terms remain errors. Original files collected is not legal completeness. |
| LIC-03 | Preserve distinct installed/bundled versions, including tslib 2.3.0 and 2.8.1. Do not override ECharts/ZRender's upstream tslib pins to remove a BOM version difference. |
| LIC-04 | Inspect the current PackageManager license contract before writing fields. Use correct owning-app/vendor-relative license file paths or supported original text sources; do not rely on another installed version's automatic lookup. |
| LIC-05 | Verify real `GenerateLicenseBOM` JSON/Markdown identities, versions and available original texts in an appropriate installation context before rollout acceptance. Metadata-only or unknown embedded licenses must not be presented as complete original-text coverage. Use isolated destinations and do not patch generated inventories manually. |
| LIC-06 | Report generation warnings, unresolved license metadata and backup-manifest discovery. A successful expected-package assertion is not a claim of warning-free installation-wide acceptance. |

## Quality and delivery

| ID | Requirement |
| --- | --- |
| QA-01 | Add deterministic tests for contracts, policies, path/input validation, artifact failures/version mismatches, candidate boundaries, transfer failures and repeatable PR behavior as those features are implemented. Keep live website tests explicit and separate from offline fixtures. |
| QA-02 | Keep Requirements, Approach, Plan and development status consistent. Do not present prototype history, documentation or unperformed checks as implemented/verified central functionality. |
| QA-03 | Preserve unrelated work and keep documentation migrations separate from runtime/library upgrades. Introduce tooling/dependencies only when needed by an implementation phase. |

## Out of scope for the first implementation

- Updating all Composer/npm-managed dependencies as a replacement for their
  package managers.
- Automatic merging, license approval or comprehensive PowerUI UI test creation.
- A generic executable plugin/build-command framework.
- A second local ECharts bundler or undocumented website-source redirection.
- Automatic repair of PackageManager's unrelated inventory/discovery warnings.
- Automatic deployment of generated files to live installations.
- Additional library adapters before the first Mermaid path is validated;
  the ECharts online-builder strategy remains a later increment.

## Decisions that must be resolved during implementation

Implemented app/update/candidate/publication contracts, public-fork PAT setup
and existing-branch behavior are documented in
[Configuration](../Development/Configuration.md) and
[Architecture](../Architecture.md). Remaining decisions/acceptance include the
installation BOM acceptance, manual review of reported license findings, live remote workflow
acceptance, later GitHub App/private checkout support, and browser versions/
website boundaries for the deferred Apache adapter. Intended behavior is not
accepted merely because its implementation or documentation exists.
