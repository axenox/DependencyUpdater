# Architecture

This document describes the files and data flow of the current implementation.
Keep it up to date whenever files, responsibilities, contracts or trust boundaries
change. It is not a declaration that all delivery/acceptance phases have passed.
See [Status](Development/Status.md) for evidence and outstanding acceptance,
[Requirements](Requirements/Requirements.md) for binding behavior and
[Configuration](Development/Configuration.md) for operator-facing contracts.

## Responsibilities and current scope

DependencyUpdater is central development/CI tooling, not an ExFace runtime app.
Consuming apps retain their inventory and bundled files; they do not install
copies of the updater. `Config/apps.json` authorizes repositories independently
of each target's declarative `includes.json`.

The current public target is `sergejriel/Core`, branch `1.x-dev`, registered as
`exface.Core`. npm discovery, same-major policy, path validation, candidate
reporting and GitHub publication are shared concerns. A trusted recipe dispatcher
selects bundle-specific logic under `Recipes`; Mermaid is its first executable
registration. The Apache ECharts browser recipe, scheduling, private target
checkout and GitHub App authentication are not implemented.

For **all packages**, structural dependency changes are review information, not
failures by themselves. Generic comparison/reporting lists additions, removals
and version/range changes. License changes, missing embedded originals/declarations
and contradictory embedded registry/manifest declarations are
prominent draft-PR findings, not approval or candidate blockers. Missing main
terms, contradictory main-package evidence, unsafe/unsupported artifacts and
failed checks remain errors.

## End-to-end data flow

```text
workflow_dispatch: app + package
  |
  +-- prepare job: no target-write secret
  |     Config/apps.json -> public target clone -> includes.json
  |       -> validate config and baseline
  |       -> npm metadata + same-major selection
  |       -> trusted recipe -> verified artifacts + installed-copy checks
  |       -> normalized identities/evidence + npm declarations + upstream notices
  |       -> proposed inventory + evidence + changed-file payload
  |       -> candidate.json uploaded as a workflow artifact
  |
  +-- publish job: fork-publishing environment
        fresh public target clone + current trusted updater config
          -> recreate the entire candidate from registry evidence
          -> compare recreated and received candidate
          -> authenticated GitHub API calls
          -> blobs / tree / commit / non-force branch ref
          -> create or update a draft PR
```

`cli.mjs plan` stops after metadata planning. It neither downloads distributions
nor authorizes publication. `pipeline.mjs prepare` writes only to explicitly
supplied fresh disposable directories, not the source app checkout.
`pipeline.mjs verify` reconstructs a candidate without calling the publishing
API. `pipeline.mjs publish` performs that same reconstruction before publishing.
No updater operation deploys assets to a live installation.

## Entry points and repository-level files

| File | Responsibility and behavior |
| --- | --- |
| [`cli.mjs`](../cli.mjs) | Read-only CLI. Parses `apps` and `plan`, loads the central registry relative to its own location, delegates selection/planning and prints JSON. Invalid inputs and runtime failures produce stderr and a nonzero exit status. |
| [`pipeline.mjs`](../pipeline.mjs) | Manual pipeline CLI exposing `prepare`, `verify` and `publish`. Requires an enabled app and explicit package. `cloneTarget` creates a shallow public clone with sanitized Git environment, disabled credential helpers/hooks and no interactive prompts. `loadCandidate` accepts only bounded regular JSON. Every command uses a new workspace; publication never executes target code. |
| [`package.json`](../package.json) | Private ESM Node.js 24 package, CLI convenience scripts and exact runtime-tooling dependencies: `semver` for policy/version comparisons, `tar-stream` for archive reading and `acorn` for parsing JavaScript without executing it. `npm test` targets only `test/*.test.mjs`, never tests inside cloned app repositories. |
| [`package-lock.json`](../package-lock.json) | npm-generated locked transitive dependency graph and integrity information for `npm ci`. Update through npm, not manual dependency copying or lockfile editing. |
| [`.gitignore`](../.gitignore) | Excludes installed dependencies, IDE state, logs and local environment/secret files. |
| [`LICENSE`](../LICENSE) | Repository's own GPL version 3 license text. It is separate from original upstream terms preserved in target-library evidence. |
| [`README.md`](../README.md) | Human entry point: scope, setup, workflow activation and documentation links. |

## Configuration files

| File | Responsibility and behavior |
| --- | --- |
| [`Config/apps.json`](../Config/apps.json) | Sole authorized app registry, schema version 1. Each app declares `id`, GitHub `repository`, `baseBranch`, `inventory`, owning `vendorPath` and `enabled`. `vendorPath` supplies vendor-relative license-file ownership without hardcoding Core in the inventory serializer. Workflow inputs cannot override repository/branch or enroll additional apps. |

App-side `includes.json` is **not** an updater-owned configuration file.
Its existing array remains a PackageManager inventory; optional `update`
definitions select a public provider, policy, known adapter and explicit paths.
Entries without `update` are not enrolled automatically.

## Source modules

| File | Main functions and interactions |
| --- | --- |
| [`src/paths.mjs`](../src/paths.mjs) | `validatePath` accepts literal portable app-relative paths and rejects traversal, devices, `.git`, patterns and unsafe components. `validateOutputs` rejects duplicate/case-overlapping/ancestor outputs. `resolveFile` checks the root and every existing ancestor without following symlinks/junctions. `fingerprint` records exact SHA-256/size or explicit absence. `readJson` reads bounded regular files without executing them. Used by configuration, planning and candidate orchestration. |
| [`src/config.mjs`](../src/config.mjs) | `fields` enforces exact configuration fields. `validateApps` validates authorization/uniqueness before target access; `selectApps` only narrows enabled registrations. `validatePackage` and `exactVersion` distinguish npm identities from Asset Packagist aliases and exact versions from ranges. `validateInventory` validates managed definitions and all output boundaries while preserving unmanaged entries. |
| [`src/npm.mjs`](../src/npm.mjs) | `fetchMetadata` reads bounded public npm JSON without auth or redirects. `selectVersion` selects the highest newer stable non-deprecated same-major release, including minor updates within major zero. `releaseInfo` validates identity, exact registry tarball URL, SHA-512 declaration, license and dependency ranges; embedded metadata inspection explicitly permits absent license declarations and records null. `dependencyChanges` compares arbitrary dependency declaration maps without a package-specific blocker. |
| [`src/planner.mjs`](../src/planner.mjs) | `checkoutIdentity` binds the root to its registered GitHub origin, branch and HEAD. `planUpdates` validates the inventory before metadata access, fingerprints inventory and all declared output/evidence paths, selects releases and reports declaration changes/license-review flags. It rechecks files and Git identity before returning a `metadata-plan`; artifact/integration checks are explicitly not performed at this stage. |
| [`src/archive.mjs`](../src/archive.mjs) | `download` permits only credential-free public registry URLs and bounds time/compressed bytes. `readArchive` verifies SHA-512 before gzip/tar parsing, bounds expanded bytes/member count, rejects unsafe paths, duplicates and links, and reads original files into memory without disk extraction. `member` requires a nonempty original file. |
| [`src/distribution.mjs`](../src/distribution.mjs) | Package-neutral helpers. `packageReader` caches verified exact archives/metadata separately for strict main and embedded mode. Identity/integrity stay mandatory; only embedded declaration conflicts pass to review. `embeddedPackages` reads exact pnpm source-map identities when recipes opt in. `originalTerms` preserves original license/notice/copyright/sidecar and relevant README text plus base64 bytes and hashes, including optional genuine absence without swallowing errors. It never infers an SPDX license or completeness. `compareEmbedded` reports structural changes and rejects newly introduced versions below a package's previous minimum. `sha256` hashes original bytes. No bundle names, runtime markers or fixed artifact paths belong here. |
| [`src/recipes.mjs`](../src/recipes.mjs) | Static trusted provider/package/adapter registrations and literal lazy imports. `supportsAdapter` supplies configuration's allowed mechanisms; `resolveRecipe` rejects unsupported combinations without importing inventory paths. `validateRecipeResult` requires the actual selected identity/version, all declared nonempty outputs, original license-file destinations, evidence and factual checks. Failed or reserved shared check results are rejected. Adding a package changes registration and its recipe, not candidate orchestration. |
| [`src/licenses.mjs`](../src/licenses.mjs) | Shared exact-embedded-originals strategy. `inspectLicenses` first validates trusted recipe-supplied exact upstream mappings against embedded source paths, original hashes and main archive provenance; otherwise requests only the actual exact embedded archive. Collects original files/provenance, keeps registry/manifest declarations separate, compares old/new declarations and records absent originals/declarations, README-only evidence and contradictions as draft findings. Download/integrity/identity failures propagate. `noticeText` groups originals by exact identity with provenance and warnings; `inventoryLicenses` attaches only that package's originals to supported named inline text fields. Unknowns stay unknown. Never traverses dependencies, substitutes main/generic terms or approves licenses. |
| [`src/candidate.mjs`](../src/candidate.mjs) | `createCandidate` plans fresh, resolves the trusted recipe, validates its normalized old/new results and invokes its installed-copy guard. It knows neither Mermaid filenames nor required runtime/source-map checks. Shared logic handles metadata caching, license review, inventory ownership, declared writes and final file/Git baseline rechecks. Main license destinations and embedded-evidence descriptions come from the recipe; vendor ownership is applied centrally. Only changed declared bytes are serialized. `verifyCandidate` reconstructs the complete candidate and requires deep equality before publication. |
| [`src/github.mjs`](../src/github.mjs) | `updateBranch` derives a stable app/package branch identity. `pullBody` renders generic version/provenance/hash/check/dependency information and the manual-integration notice. `githubClient` sends the target token only to GitHub API requests and does not print response bodies on errors. `checkExisting` binds existing PR ownership, commit authorship and a commit-embedded body hash. `publishCandidate` rechecks the remote base, validates existing history/path scope and creates blobs, a tree, a commit, a non-force ref and a draft PR. The author is `github-actions[bot]`; the explicit committer and PR owner are the authenticated token account. |

There are no per-app build scripts, executable inventory plugins, local
Rollup/Terser builds or npm lifecycle execution of downloaded packages.
Each source module starts with a short responsibility/boundary comment.

## Bundle recipes and shared result contract

| File | Responsibility |
| --- | --- |
| [`Recipes/mermaid/index.mjs`](../Recipes/mermaid/index.mjs) | `prepare` reads verified npm originals, checks Mermaid's version/global markers, JS syntax, required members, adjacent map and exact pnpm identities. It optionally supplies `embeddedTerms` only for original terms at exact pnpm source-map paths, with archive URL/integrity and map path/hash. It returns normalized outputs, license destinations, terms, embedded identities, description, evidence and checks. `validateInstalled` checks owning-app licensing and byte equality against the installed release's original mappings. It owns every Mermaid filename and special rule. |

`prepare(entry, version, {readPackage})` returns `name`, `version`, `license`,
`licenses`, `outputs`, `embedded`, `embeddedDescription`, `terms`, `evidence`
and `checks`. License files are output-relative paths; the shared serializer adds
the app's `vendorPath`. `outputs` contains `{path, bytes}` for every declared
artifact. `evidence` is recipe-specific: Mermaid supplies `sourceMapSha256`,
but a generated bundle may provide builder evidence without any source map.
Recipe checks describe performed artifact checks, not shared legal/integration
approval. The dispatcher selects code from its fixed registrations, not from
untrusted inventory module paths. No new inventory field is required.

Optional `embeddedTerms` entries contain exact `name`/`version`, original `terms`
(`path`, `sha256`, `text`, `bytesBase64`) and `provenance`. Currently reusable
source-map originals must match paths in that embedded identity's `sources`;
the collector checks their bytes/hashes and verified main tarball URL/integrity.
Unmapped aggregate/root terms are retained globally, never assigned to every
package. Future special formats require equivalent trustworthy recipe mapping,
not heuristic matching by license name.

`validateInstalled(entry, previous, {vendorPath, readInstalled})` is mandatory.
Its proof method is recipe-specific; it must not be a silent no-op for a new
bundle. The Mermaid proof is explained step-by-step in
[installed-file protection](Development/Configuration.md#protecting-existing-files-before-an-update).
Shared SHA-256 fingerprints and the Git identity are always rechecked separately.

ECharts will use the actual Apache online builder, not the Mermaid recipe or a
local bundler. This refactor does not claim that a browser build can be compared
to a prebuilt npm file, or that rebuilding it is permanently byte-reproducible.
Its installed-build proof and publication revalidation must be implemented and
accepted before that recipe is registered.

## Reports and generated target files

These are output contracts, not checked-in updater source files.

| Output | Contents and consumer |
| --- | --- |
| `metadata-plan` JSON | Registered target/commit, input/output fingerprints, selected releases, original metadata provenance, declared dependency-range changes and explicit validation scope. Consumed by candidate orchestration and reviewers, not sufficient for publication. |
| `candidate.json` | Versioned `no-op` or `npm-candidate`. Contains plan, changed paths/sizes/SHA-256/base64 bytes, exact embedded identities/npm declarations, structural changes, checks and `licenseReview`. The latter records strategy `exact-embedded-originals`, status `required`, original upstream terms, changed declarations and explicit missing/contradictory evidence warnings. Completely reconstructed by the publisher, including embedded archive evidence. |
| Target's original mapped files | Byte-for-byte selected npm members: current Mermaid JS, map, package.json, README and LICENSE. No re-minification, dependency installation or code execution. |
| Target's configured `bundled-packages.json` | Owner/version, recipe-supplied `artifactEvidence` (Mermaid: `sourceMapSha256`), exact embedded identities/source paths, registry declaration/URL, manifest declaration/check flag, original `terms` with paths/hashes/text/base64 bytes, `termProvenance` with archive URL/integrity and manifest hash/path or exact map evidence, and `licenseReview`. `inventoryEntries` binds precisely which generated entries may be replaced later. |
| Target's configured `THIRD_PARTY_LICENSES.txt` | Original upstream and exact embedded license/notice/copyright/relevant README texts grouped by exact identity, with source provenance, original hashes, declarations and warnings. Its header explicitly states that legal completeness has not been verified. Unknown declarations retain originals here. |
| Target's `includes.json` | Updated main version/license-file declaration and exact embedded entries with npm-declared names plus only their own original texts in supported `licenses[].text`, or an empty list for unknown declarations (their originals remain in notices/evidence). No generic/main/multi-package text is assigned to embedded code. Unrelated entries and separate versions remain; main license-file ownership uses `vendorPath`. |
| Publication result JSON | `created`, `updated`, `unchanged` or `no-op`, with a PR URL where applicable. Errors remain nonzero failures, not success-shaped results. |

`powerUiIntegration` and `installationLicenseBom` are currently `not-run`.
`embeddedLicenseTexts` is `original-files-collected` or `missing-original-files`;
neither claims legal completeness. `licenseApproval` is
`manual-review-required`. `upstreamLicenseFiles: passed` covers only actual
supplied original files, not a proof of complete embedded attribution.
Static JS parsing and source-map/version evidence do not imply browser/API
execution, complete legal approval or a successful installation-wide BOM export.

## GitHub Actions and instructions

| File | Responsibility and behavior |
| --- | --- |
| [`.github/workflows/update-bundled-dependency.yml`](../.github/workflows/update-bundled-dependency.yml) | Manual-only, default-branch workflow with app/package inputs, per-target concurrency and bounded jobs. `prepare` checks out trusted updater code, installs locked tooling with scripts disabled, runs updater tests and uploads a seven-day candidate artifact. `publish` runs on a separate worker, uses the `fork-publishing` environment and `TARGET_REPO_TOKEN`, reconstructs the candidate and publishes only after verification. Actions are pinned by commit. There is no schedule or auto-merge. |
| [`.github/copilot-instructions.md`](../.github/copilot-instructions.md) | Repository-level mandatory context routing and constraints for coding assistants; links architecture, requirements, delivery/status and development instructions. |
| [`.github/instructions/bundled-library-updates.instructions.md`](../.github/instructions/bundled-library-updates.instructions.md) | Path-wide instruction entry point, routing update/config/workflow work to canonical documentation rather than duplicating detailed rules. |

The initial publisher uses a fine-grained PAT restricted to the configured
public fork: Contents write, Pull requests write and Metadata read.
The updater repository's normal `GITHUB_TOKEN` cannot write that other repository.
The environment secret is not provisioned by source code. Required reviewers and
default-branch deployment restrictions should protect `fork-publishing`.
A GitHub App remains a later authentication implementation, not a supported
token mode of the current `GET /user`-based publisher.

## Tests and fixtures

| File | Coverage/responsibility |
| --- | --- |
| [`test-support/fixtures.mjs`](../test-support/fixtures.mjs) | Independent central-registry, app-inventory and npm-metadata fixtures. Dependency ranges intentionally do not claim exact bundled versions. |
| [`test/config.test.mjs`](../test/config.test.mjs) | Authorized/disabled/duplicate app registrations, schema validation, managed/unmanaged inventory, identity checks and unsafe/overlapping paths. |
| [`test/npm.test.mjs`](../test/npm.test.mjs) | Same-major/stable/deprecation/no-op selection, exact registry provenance, bounded unauthenticated fetches and explicit network/metadata failures. |
| [`test/planner.test.mjs`](../test/planner.test.mjs) | Temporary Git checkouts, correct target identity, repeatable read-only plans, no-op/unmanaged behavior, stale baselines, changed declarations and junction/symlink guards. |
| [`test/archive.test.mjs`](../test/archive.test.mjs) | Controlled tar/gzip fixtures, integrity-before-parsing, archive/network bounds, unsafe members, exact source-map identities, structural reporting including removal of coexisting versions, original terms/relevant README handling without declaration inference, optional genuine absence and required main-package metadata agreement. |
| [`test/candidate.test.mjs`](../test/candidate.test.mjs) | Original-byte reconstruction/tampering/baseline/ownership guards, exact embedded originals in notices/evidence/inline text, preserved unmapped upstream sidecars, main and embedded license-change findings, explicit unknown declarations, inconsistent installed-license errors and coexisting-version comparisons. |
| [`test/licenses.test.mjs`](../test/licenses.test.mjs) | Exact embedded archives only (no tree), coexisting versions and byte/provenance retention; reliable upstream reuse versus unmapped/wrong-version evidence; missing/changed/contradictory declarations, absent files and README-only warnings; unknown declaration without inference; network/integrity failures and strict main-versus-embedded archive validation. |
| [`test/recipes.test.mjs`](../test/recipes.test.mjs) | Trusted recipe selection, forbidden executable paths/unknown combinations, selected identities, complete declared outputs, failed/reserved checks and a non-Mermaid result without any source-map assumption. Guards against reintroducing Mermaid constants into shared distribution/candidate modules. |
| [`test/mermaid.test.mjs`](../test/mermaid.test.mjs) | Recipe-local original bytes, exact pnpm upstream-term mapping and archive/map provenance, normalized evidence, runtime/version/global/dynamic-asset checks, required mappings and adjacent map, missing evidence, installed README line-ending changes and owning-app license paths. No Git/network/browser execution. |
| [`test/github.test.mjs`](../test/github.test.mjs) | Mocked API requests only: token/error boundaries, package-agnostic PR reporting, bot author/explicit committer, draft creation, unchanged repeats, fast-forward updates, closed/merged branches, human edits, stale/racing state and API failures. No live PRs are created by these tests. |

Tests create disposable directories and controlled Git fixtures. Live registry
checks are separate development evidence; passing offline fixtures does not prove
Linux CI, remote publication or actual PowerUI compatibility.

## Documentation files

| File | Responsibility |
| --- | --- |
| `Docs/Architecture.md` | This maintained file map, call/data flow, boundaries and current limitations. |
| [`Docs/Requirements/Requirements.md`](Requirements/Requirements.md) | Binding scope, acceptance and requirement IDs. |
| [`Docs/Requirements/Approach.md`](Requirements/Approach.md) | Design decisions and intended central architecture, including deferred ECharts strategy. |
| [`Docs/Requirements/Plan.md`](Requirements/Plan.md) | Complete phased development/rollout plan, prerequisites and acceptance criteria. |
| [`Docs/Development/Status.md`](Development/Status.md) | Actual implementation state, scoped evidence, blockers and historical prototype results. |
| [`Docs/Development/Configuration.md`](Development/Configuration.md) | Current app/update schema, CLI commands and operator workflow/setup/retry behavior. |
| [`Docs/Development/Bundled_library_updates.Instructions.md`](Development/Bundled_library_updates.Instructions.md) | Canonical development rules for central ownership, provenance, isolation, licensing and review. |
| [`Docs/Development/Mermaid.md`](Development/Mermaid.md) | Concrete npm distribution/embedded-license observations and the local test page's acceptance boundary. |
| [`Docs/Development/ECharts.md`](Development/ECharts.md) | Deferred Apache online-builder research, actual selection and observed version-pinning limitations. |

Ignored `.git`, `.idea`, `node_modules`, secret files, caches, downloaded archives
and disposable candidates are not maintained implementation files and do not
belong in this inventory or source commits. Update this document when adding,
moving or removing maintained files.

## Failure handling, retries and remaining acceptance

- Failed integrity, evidence, identity, syntax, path or baseline checks throw
  before branch publication. Structural changes alone do not throw.
- Changed top-level/embedded declarations and absent embedded declarations are
  prominent draft-PR review findings, not blockers. Never infer approval or
  complete coverage. Contradictory main evidence/missing main terms still fail.
  The real Mermaid trial reports ElkJS's `EPL-2.0` to
  `EPL-2.0 OR GPL-3.0-or-later` change and Khroma's absent declaration.
- The publisher continues only untouched draft PRs. A reviewer converting a PR
  to ready-for-review is a human state change and prevents automatic updates.
- GitHub objects may be created before a later ref/PR request fails. Multiple
  HTTP calls are not globally atomic. A failed PR request can leave an orphan
  branch; the next run refuses to overwrite it silently.
- Human-edited, diverged, closed-unmerged or orphan update state requires
  explicit inspection. After a merged PR, remove its old updater branch before
  starting a fresh transaction; the updater does not force-reset it.
- If the base/version/metadata advances between jobs, regenerate rather than
  applying stale candidate bytes. A repeated identical owned open PR is a
  no-write result.
- Real Linux workflow execution, authenticated create/update/no-op publication,
  installation BOM export and responsible-developer integration review remain
  acceptance work. No workflow dispatch, remote PR or license approval is
  implied by local implementation.
