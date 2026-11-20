# Development status and retained evidence

Status baseline: 2026-11-20. This document records implementation state and
historical findings, not the desired architecture or an executable CLI contract.

## Documentation map

| Document | Responsibility |
| --- | --- |
| [Architecture](../Architecture.md) | Every maintained file, responsibilities, data flow and trust boundaries |
| [Requirements](../Requirements/Requirements.md) | Scope, binding behavior and acceptance requirements |
| [Approach](../Requirements/Approach.md) | Architecture, boundaries and design decisions |
| [Plan](../Requirements/Plan.md) | Ordered implementation phases, dependencies and completion criteria |
| [Working instructions](Bundled_library_updates.Instructions.md) | Rules for developers and coding assistants |
| [Configuration](Configuration.md) | Implemented app/update contracts, CLI and manual workflow setup/retries |
| [Mermaid findings](Mermaid.md) | First npm workflow and local test-page boundaries |
| [ECharts findings](ECharts.md) | Online-builder selection, observations and constraints |

## Current implementation state

- **2026-11-20 approved original-text revision:** shared collection first reuses
  trustworthy exact recipe-mapped upstream terms, otherwise reads integrity-checked
  exact embedded npm archives only. No recursive dependency traversal, package
  execution, generic license replacement or restored override configuration.
  Original LICENSE/NOTICE/copyright/relevant README bytes (base64), text, paths
  and SHA-256 plus archive URL/integrity/manifest evidence are durable in the
  declared notices/evidence. Known declarations receive package-specific inline
  originals through PackageManager's verified `licenses[].text` contract.
  Unknown registry declarations remain unknown, with original evidence retained.
  Missing originals/declarations, README-only evidence and embedded declaration
  contradictions remain draft-review findings. Network/integrity/identity errors
  fail explicitly. Main validation and previous-original-byte guards are unchanged.
  `original-files-collected` does not mean legal completeness or approval.
- **2026-11-20 validation:** all **66 tests passed**, 0 failed/skipped, in the
  external Node.js 24.21.0 workspace (`npm test`, 82.274 s). The isolated real
  Mermaid 12.2.0 -> 12.3.0 candidate was generated and independently reconstructed:
  **65 exact embedded identities, 81 original files, no missing original files**.
  Each pass verified two main plus 65 embedded archives (134 total archive reads
  across both passes), all from the existing cache, with fresh registry metadata.
  Six declared files change; no live app file or remote state was changed.
  ElkJS's EPL-2.0 -> EPL-2.0 OR GPL-3.0-or-later change remains prominent;
  Khroma 2.1.0 remains undeclared despite its original MIT file; FastDom 1.0.12's
  original README terms produce a README-only review finding.
  Actual current PackageManager (`314a75d`) full JSON serialization retained
  **64 package-specific inline texts**, all exact versions and the one unknown
  declaration; its Markdown exporter was also exercised in isolated destinations.
  This is focused consumer serialization, not a full installation
  `GenerateLicenseBOM`/enrichment acceptance run. The IDE build succeeded with
  limited build diagnostics; Node tests are the authoritative executable gate.
- Mermaid in Core is the first implementation path; ECharts is deferred.
  Other apps remain deferred until the Core workflow is accepted.
- **2026-11-04 recipe separation:** Mermaid-specific filenames, runtime/map
  checks, evidence extraction and installed-copy validation now live in
  `Recipes/mermaid/index.mjs`. `src/recipes.mjs` resolves trusted fixed
  registrations and validates the normalized result contract. Shared candidate
  code has no Mermaid paths, direct recipe import or unconditional JS/map check.
  The existing inventory schema is unchanged; ECharts remains unregistered.
  All ten `src` modules now start with a responsibility/boundary comment.
  Configuration explains previous-release byte equality versus in-run race
  checks, including README/line-ending changes and the generated-build limitation.
- The historical post-refactor external Node.js 24 suite had **58 passing tests**. New
  coverage includes recipe selection, forbidden executable paths, wrong actual
  versions, missing/empty/undeclared outputs, failed/reserved checks, a generated
  non-Mermaid result without a source map, and recipe-local runtime/baseline rules.
  Existing candidate, license-review, race and mocked publication tests still pass.
  The real isolated 12.2.0 -> 12.3.0 candidate was regenerated and independently
  reconstructed through the dispatcher after refactoring: 65 embedded identities,
  six changed files and two main archives per pass, with no dependency archives
  under the now-superseded slim strategy.
  The map hash now lives under `artifactEvidence.sourceMapSha256`; source runtime
  files, the target inventory definition and remote GitHub state remain unchanged.
- Local source now includes the Node.js 24 planner, strict central configuration,
  public npm archive integrity/bounds checks, original Mermaid distribution
  validation, source-map embedded identities, exact embedded original licensing,
  candidate generation/reconstruction and GitHub Git Data API draft publication.
  Exact tooling dependencies are `semver`, `acorn` and `tar-stream`.
- The sole enabled registration targets **`sergejriel/Core`, `1.x-dev`**, with
  owning vendor path `exface/core`. Updater origin is
  `https://github.com/axenox/DependencyUpdater.git`; the local Git branch is `master`.
- Core's adjusted `includes.json` keeps Mermaid **12.2.0** and original runtime
  files. It declares Core's own named MIT license file and two generated evidence
  destinations. The user must upload this inventory to the fork before trial.
- Shared dependency comparison/PR reporting covers additions, removals and changed
  ranges/exact embedded versions for arbitrary package names. Structural changes
  alone do not block. New versions below a package's previous minimum still
  fail; removing a coexisting version alone does not. Missing artifact/version
  evidence and contradictory main-package licensing remain errors. No
  Mermaid-specific removal approval exists.
- Added offline coverage includes unsafe archives/network limits, exact pnpm
  identities, original/README/upstream-sidecar evidence, byte-level reconstruction,
  tampering/local patches, coexisting-version license comparisons, bot author and
  explicit token-account committer, generic PR text, no-write repeats,
  fast-forward publication, draft-to-ready human changes, closed/merged branches,
  races and API failures.
  Mocked publication tests never write to GitHub. All tests are explicitly scoped
  to updater `test/*.test.mjs`, excluding any target checkout's tests.
- The manual-only workflow separates token-free generation from the
  `fork-publishing` environment job. Publication recreates all candidate bytes
  before using `TARGET_REPO_TOKEN`. The initial auth implementation is a scoped
  fine-grained PAT, not a GitHub App. Required reviewers/default-branch environment
  restrictions are recommended.
- **Historical 2026-11-04 slim-strategy evidence (superseded):** all 50 deterministic updater tests passed in the
  external Node.js 24 workspace. This includes notice-sidecar matching without
  treating unrelated filenames containing `legal` as license files, structural
  removal of coexisting versions, main/embedded license-change findings, unknown
  embedded declarations and an assertion forbidding dependency archive reads.
- Historical external-workspace inspection verified Mermaid 12.3.0 and 65 exact embedded
  versions (previously 66). An isolated fork clone with the intended inventory
  overlaid generated the six-file candidate and independently reconstructed it;
  each pass acquired only two main archives (12.2.0/12.3.0).
  ElkJS's `EPL-2.0` to `EPL-2.0 OR GPL-3.0-or-later` change and Khroma's missing
  declaration appear explicitly in the draft text. The actual upstream archive
  supplies only the root LICENSE, not a complete third-party notice collection;
  `embeddedLicenseTexts` was `not-verified`; the revised strategy now collects
  exact-package originals and still requires manual approval.
  See [Mermaid](Mermaid.md) for the exact acceptance boundary.
- No remote workflow dispatch, authenticated PR publication, credential/environment
  provisioning, installation BOM acceptance or updated Core runtime integration
  has taken place. Linux CI and live create/update/no-op acceptance remain pending.
- Phase 0/1/2 contracts and local phase 3 distribution/phase 4 evidence logic exist.
  Candidate/publisher/manual-workflow code for phases 5 through 8 is wired locally
  but **not accepted** while phase 4 attribution/BOM and live CI acceptance remain
  outstanding. Phase 9 rollout is pending. Scheduling, other apps, GitHub App
  authentication and the Apache browser adapter are not implemented.

The former Core-local build/tooling files and their ECharts `update` definition
were removed from the working tree. ECharts still has no replacement executable
 Runtime assets,
license files, package identities and recorded versions were not changed by
that migration. Shared code must not be copied back into each app.

## Retired Core prototype

The previous prototype implemented npm planning, isolated preparation, exact
output checks and explicit application with source fingerprints, backups,
rollback and interruption recovery. Its 26 tooling tests passed. These are
historical findings and useful implementation requirements, not available
commands in DependencyUpdater.

The local ECharts/ZRender 6.1.0 recipe retained tslib 2.3.0, matching both
upstream pins. API/registration checks matched a supplied online build; an
earlier browser comparison covered 12 rendering cases plus zoom/legend.
Seven recipe checks passed against the applied central runtime asset. This
was not full PowerUI integration acceptance or byte equality to the website.
Historical bundles and a separate facade consolidation branch remained outside
that update. Inspect current consuming references before future replacement.

The prototype and original documents were retained outside the webroot in
the migration session archive. They are not a supported implementation or a
DependencyUpdater runtime/build dependency. Current requirements do not call
for porting the old local Rollup/Terser pipeline.

## Historical BOM acceptance

Real PackageManager `GenerateLicenseBOM` exports after the prototype application
contained ECharts 6.1.0 (Apache-2.0), ZRender 6.1.0 (BSD-3-Clause), embedded tslib
2.3.0 (0BSD) and separate Composer tslib 2.8.1. Original license texts matched
the shipped files (11,990 / 1,509 / 655 bytes for the embedded packages).
The isolated JSON/Markdown export had 376 records; the user confirmed both
tslib versions in the UI. Standard installation BOM files were not replaced.

Inspection at PackageManager commit `074a8d0` found version-specific URNs,
legacy license inputs, vendor-relative file enrichment, declaring-app
`bundled_in` ownership and backup `includes.json` discovery. Warnings included
SPDX lookup failures and unrelated missing license declarations/texts.
Automatic file discovery was not version-aware and same-version merging did not
retain every occurrence.

These are historical observations, not the current PackageManager contract.
Core's bundling documentation now describes named `licenses` objects.
Reinspect the installed PackageManager before implementing acceptance or changing
license fields. Do not silently include unrelated PackageManager fixes in the
updater project.

## Updating this document

Update implementation state and the corresponding Plan phase together after
the actual acceptance criteria pass. Record dates and validation scope for
new evidence. Do not convert an old successful prototype check into a claim
that the new central workflow, current app integration or future release passed.
