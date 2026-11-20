# Development plan

Baseline: 2026-11-03. This is the complete delivery plan for the first central
Mermaid update-to-PR workflow using its npm distribution, followed by controlled
rollout and extension. ECharts is deferred, not discarded.
Local code now includes app/update contracts, metadata planning, original npm
distribution/evidence validation, candidate reconstruction, GitHub draft
publication and manual CI wiring. **Implementation is not acceptance:** the real
candidate now succeeds with explicit license-review findings, while BOM,
Linux/manual CI, authenticated PR and developer integration acceptance remain
pending. Wiring for
later phases does not waive earlier prerequisites; check
[development status](../Development/Status.md).
Maintain [Architecture](../Architecture.md) with every maintained file's purpose
and data flow alongside implementation.

Read [Requirements](Requirements.md), [Approach](Approach.md) and the
[working instructions](../Development/Bundled_library_updates.Instructions.md)
before starting a phase. Requirement IDs below refer to Requirements.md.

## Delivery rules

Implement the smallest complete vertical path, not an arbitrary plugin platform.
Keep changes reviewable and run focused tests after each executable change.
Do not change app runtime assets, activate schedules, provision credentials or
publish real PRs as side effects of preparatory/documentation work.

Maintain current phase status and acceptance evidence in Development/Status.md.
Record decisions before relying on them; do not invent schema fields in a
consuming app ahead of their tested consumer. The Core prototype is historical
reference only, not a phase-completion shortcut.

Core is the sole development and initial acceptance app. Keep the implementation
configuration-driven, but do not register or activate other apps until the Core
workflow has completed phase 9. Cross-app trials belong to phase 11.

## Phase 0: establish the development repository

**Prerequisites:** repository owner/location and intended hosting confirmed.
**Covers:** CFG-01, TX-01, QA-02, QA-03.

1. Set up the actual Git repository/remotes under the agreed owner with explicit
   authorization. Preserve the existing documentation and IDE/user files.
2. Use Node.js 24 LTS with its native test runner and pinned SemVer dependency
   for the initial implementation. Confirm Linux CI support as well as local
   Windows support. Add Playwright only for the later ECharts/browser work.
3. Add only the manifest, pinned dependencies/lockfile, ignores and test commands
   needed by the next phases. Do not add a local ECharts bundler or Composer
   runtime integration.
4. Document setup, supported versions and development workspace restrictions.
   Keep generated outputs, credentials and dependency caches out of commits.

**Completion:** a fresh development checkout can install the chosen minimal
toolchain and run its initial test command; no target app or remote PR changed.

## Phase 1: configuration and target contracts

**Prerequisites:** phase 0. **Covers:** CFG-02 through CFG-06, TX-02, TX-03.

1. Specify the versioned optional `includes.json` extension: provider, policy,
   known adapter identifier/options and exact writable metadata/output paths.
   Preserve existing package/license inventory fields.
2. Specify and implement one version-controlled central app-list configuration,
   independent of app-controlled data, with app identity, repository, base branch,
   inventory path and enabled/disabled state. Initially register/enable only Core;
   never store credentials in the list. Validate unique identities/repositories,
   required fields and inventory paths before target access. Automatic processing
   uses only enabled registrations; manual selection may only narrow that set.
   Reject explicitly selected unknown/disabled apps; do not auto-discover targets.
   Define adapter option validation and embedded-package ownership without
   arbitrary script/module execution.
   Keep trusted recipe selection central in `src/recipes.mjs`, with package
   implementations under `Recipes`. Reuse the existing declarative combination;
   no executable recipe paths or general plugin framework.
3. Define candidate/report identities, baseline commit/fingerprints, file hashes,
   validation outcomes and explicit no-op/failure states.
4. Define minimal CLI/API contracts for read-only planning, candidate generation,
   transfer and publication. Keep publication an explicit distinct operation.
5. Implement validation before network or write access, including unsupported
   schema/adapter cases, duplicate/overlapping paths and invalid selections.

**Completion:** offline fixtures cover valid definitions, unmanaged inventory,
unknown versions/adapters, traversal, junction/symlink escapes and overlaps.
App-list fixtures cover Core-only processing, disabled/unknown selections,
duplicate/invalid registrations and an empty enabled set producing no target work.
The implemented read-only subset is documented in Development/Configuration.md
and exercised through Core's Mermaid definition. Candidate/transfer/publication
contracts need their own acceptance before any writes are enabled.

## Phase 2: provider and version-policy planning

**Prerequisites:** phase 1. **Covers:** VER-01 through VER-04, ART-05.

1. Implement bounded public npm metadata access with explicit HTTP, timeout,
   malformed-response and provenance failures, without inherited npm credentials.
2. Implement stable same-major selection independent of npm dist-tags. Include
   major-zero behavior, deprecated candidates, no downgrade and explicit no-op.
3. Resolve exact runtime dependency metadata through the adapter contract.
   Reject inconsistent version evidence and newly introduced embedded versions
   below their previous package minimum. Removing a coexisting version alone
   is structural. Report added/removed/changed dependencies for every package;
   structure changes alone must not block a PR.
4. Produce a complete read-only plan with versions, sources, license-change
   findings and intended file boundaries; no artifact or app writes.

**Completion:** deterministic fixture tests cover policy boundaries, registry
failures, unmanaged entries, repeated runs and dependency conflicts. One explicit
live metadata check confirms provider behavior without changing a target app.

## Phase 3: npm distribution adapter for Mermaid

**Prerequisites:** phases 1 and 2.
**Covers:** ART-01, ART-04 through ART-07, VER-03, TX-01, TX-06.

1. Inspect [Mermaid findings](../Development/Mermaid.md) and the exact selected
   tarball's distribution layout, support files and embedded attributions.
2. Download only the validated exact npm tarball, with bounded time, archive size
   and expanded contents. Verify registry integrity before reading members.
3. Read mapped files without executing package scripts, installing runtime
   dependencies or extracting arbitrary archive paths into a checkout. Reject
   unsafe links, traversal, duplicates and missing/nonregular members.
4. Verify package.json identity/version and actual runtime output. Check relative
   asset/source-map references; fail if the mapped file set is insufficient.
5. Determine actual embedded identities from distribution evidence, not dependency
   ranges. Stop on unresolved identity/version evidence. License declarations
   are exact-version npm metadata, with unknowns and unverified text coverage
   explicitly reported under phase 4; never claim a complete licensed candidate.
6. Record exact package/source URLs, integrity, filenames and output hashes.
   Preserve original bytes and notices; do not re-bundle or re-minify.
7. Keep Mermaid runtime/mapping/installed-copy rules in its recipe. Return the
   normalized shared result, including recipe-specific evidence/checks, without
   leaking Mermaid filenames or mandatory source maps into orchestration.
   Protect pre-existing patches by comparing all installed mappings against
   the previous release's verified originals; preserve shared race guards too.

**Completion:** offline archive fixtures cover integrity mismatch, malformed or
unsafe archives, wrong versions, missing files, size limits and failures. A live
smoke test obtains the selected Mermaid distribution in an isolated workspace
without changing Core's runtime files. Actual embedded-version/license acceptance
continues in phase 4; download success alone is not a successful candidate.

## Phase 4: licensing and actual-candidate validation

**Prerequisites:** phases 2 and 3.
**Covers:** LIC-01 through LIC-06, ART-04 through ART-06, QA-01.

1. Inspect the installed PackageManager contract and Core bundling requirements
   before selecting the serialized license fields.
2. Verify main-package original terms/metadata and preserve supplied upstream
   license/notice/copyright and relevant README files. Prefer upstream originals
   only with trustworthy exact embedded identity mapping; otherwise obtain
   integrity-checked exact embedded npm archives, never their dependency tree.
   Persist original texts/bytes, paths/hashes and source URL/archive integrity in
   declared evidence/notices. Use supported package-specific inline text fields
   for known declarations; keep unknowns without inventing a declaration.
   Never assign main/generic texts. Distinguish embedded code from browser/tooling.
3. Generate proposed inventory changes for the owning app. Preserve unrelated
   entries and separately installed versions; detect license changes explicitly.
   Changed/missing declarations and coverage gaps become prominent draft-PR
   findings, not blockers or approvals. Embedded registry/manifest contradictions
   also remain explicit findings. Network/integrity/identity errors must propagate,
   not become absence warnings. Contradictory main evidence/missing main terms fail.
4. Validate the exact candidate file set, nonempty expected files, versions,
   hashes, licensing and configured adapter checks. Test the actual downloaded
   bytes, including required loading/API/registration checks where applicable.
5. Define the real installation context for PackageManager BOM acceptance and
   isolated export destinations. Specify whether the first workflow executes
   this automatically or records a separate explicit acceptance result; do not
   pretend a plain Git checkout can generate the full installation BOM.
6. Prove package/version identities, available original-text handling and
   coexistence through real JSON/Markdown exports. Keep metadata-only declarations
   and unverified text coverage explicit. Resolve attribution/legal acceptance
   before merge without unrelated PackageManager repairs.

**Local implementation revised 2026-11-20:** exact-archive fallback, original-byte
provenance, PackageManager inline text serialization and deterministic
reconstruction are implemented. Original files collected is not full legal
completeness. Installation-wide BOM and remote rollout acceptance remain pending.

**Completion:** fixtures cover missing main terms, mapped upstream evidence reuse,
exact-version fallback, original LICENSE/NOTICE/README bytes/provenance,
coexisting versions, changed/missing/contradictory embedded declarations,
missing originals as review findings, propagated network/integrity errors,
wrong versions, extra/missing outputs and metadata inconsistencies. Real BOM
acceptance evidence exists for the first candidate; standard BOM outputs and
other installed versions remain untouched. Unperformed checks stay `not-run`.

## Phase 5: generic candidate orchestration

**Prerequisites:** phases 1 through 4.
**Covers:** CFG-01, CFG-05, TX-01 through TX-03, TX-06, VER-04, QA-01.

1. Combine validation, fresh planning, the central adapter and licensing into
   one candidate workflow with an explicit target root/commit, never a fixed
   Core-relative root.
2. Create unique workspaces and copy only necessary approved inputs. Keep app
   runtime baselines, tool caches and credentials out of candidate payloads.
3. Emit a versioned candidate/report containing only allowed artifacts/metadata
   plus provenance, baseline and automatic-check scope.
4. Retain actionable failure logs and partial-run status outside app runtime
   paths. Return a no-op without unnecessary downloads where no update is allowed.
5. Use central reusable logic only; no generated per-app Build/Tooling projects.

**Completion:** a local explicitly invoked workflow creates a reviewable Mermaid
candidate while source files remain unchanged. Tests cover no-op/repeat runs,
stale baselines, adapter failure, partial output and absence of inherited secrets.

## Phase 6: controlled transfer into a target branch

**Prerequisites:** phase 5. **Covers:** TX-02 through TX-05, PR-02.

1. Use a fresh disposable target checkout/branch as the default application
   boundary. Verify target identity/base commit and baseline fingerprints again.
2. Revalidate candidate hashes and allowed paths independently of report-supplied
   success flags. Refuse an altered candidate or changed source baseline.
3. Transfer only changed declared metadata and outputs. Preserve unrelated
   inventory and files; do not delete complete directories or rewrite no-op files.
4. Make failure/interruption behavior explicit. Discard failed disposable
   candidates safely; implement backup/rollback/recovery only if supporting
   writes to a persistent local checkout. Do not silently expose such a mode.
5. Generate a scoped diff and recheck all expected post-transfer hashes before
   making the branch eligible for publication.

**Completion:** tests cover tampering, concurrent edits, partial transfer,
missing originals/new files, unrelated-file preservation and repeat application.
No failed transaction can reach publication, and no existing user checkout is
silently modified. Git staging/commits contain only verified allowed changes.

## Phase 7: cross-repository authentication and PR publishing

**Prerequisites:** phase 6 and explicitly authorized GitHub setup.
**Covers:** CFG-04, TX-06, PR-01 through PR-04, LIC-02.

1. Configure explicitly authorized cross-repository authentication. The first
   public fork trial implements a fine-grained PAT scoped only to
   `sergejriel/Core` with Contents write, Pull requests write and Metadata read,
   supplied through the protected `fork-publishing` environment. A narrowly
   scoped GitHub App remains the preferred later implementation; do not claim
   the current `GET /user` client supports App tokens. Review token lifetimes
   and CI-trigger behavior; private target checkout is not yet supported.
2. Keep publication credentials out of the browser/candidate job. In the
   publishing job, verify artifact provenance, target authorization, baseline
   and scoped diff before committing/pushing.
3. Use stable repository/library branch and PR identities. Discover existing
   bot-owned updates, refresh safely and detect human changes rather than
   force-overwriting them. Define behavior for merged/closed PRs explicitly.
4. Avoid duplicate PRs and empty commits on repeated/no-op runs.
5. Generate PR text from recorded facts and actual checks, including old/new
   embedded versions, file/provenance/license changes and the generic manual
   review notice from Requirements. No package-specific manual checklist.
6. Preserve explicit license-review findings in draft PRs and never merge
   automatically. Continue only untouched owned drafts; a ready-for-review PR
   requires human ownership, not silent automatic updates.

**Completion:** mocked API/git tests cover authorization failures, conflicts,
repeat runs, closed/merged PR cases and failed pushes/PR requests. An explicitly
approved disposable test repository demonstrates create/update/no-op behavior.
Tokens do not enter logs, candidate artifacts or commits.

## Phase 8: manually triggered CI workflow

**Prerequisites:** phases 5 through 7. **Covers:** PR-05, TX-01, TX-06, QA-01.

1. Add a manual GitHub Actions entry point restricted to enabled entries in the
   central app list. During Core development/acceptance, Core is the only target;
   workflow inputs must not authorize arbitrary repository/branch overrides.
2. Separate planning/generation from authenticated publication using narrowly
   scoped jobs and pinned reviewed tooling/actions.
3. Add per-target/library concurrency, bounded execution, artifact retention
   and clear success/no-op/license-review/failure summaries.
4. Ensure target failures do not corrupt or publish another target's candidate.
   Do not execute untrusted PR code with write credentials.
5. Document operator invocation, credentials, required approvals, diagnostics,
   failed-run cleanup and safe retries.

**Completion:** authorized manual CI execution exercises the full Mermaid
candidate-to-PR path. Negative runs prove failed checks cannot publish and
unauthorized targets cannot gain access. No schedule is enabled yet.

## Phase 9: first app rollout and acceptance

**Prerequisites:** phases 4 and 8. **Covers:** all first-release requirements.

1. Add the tested declarative update definition to Core without restoring local
   scripts. Confirm actual consuming facade references and historical bundles;
   do not assume every page uses the central file.
2. Run the new workflow against a controlled update/rebuild scenario with explicit
   permission. Do not downgrade production metadata merely to manufacture a test.
3. Inspect the scoped artifact/inventory/license diff and repeat real BOM
   acceptance in the chosen installation context.
4. Have the responsible developer select/perform manual PowerUI integration
   checks before merge. Record what automatic and manual acceptance covered.
   The supplied local test page currently loads UI5Facade's separate bundle;
   verify actual Core asset consumption before using it as Core acceptance.
5. Verify that branch/PR updates, warnings, failures and no-op retries remain
   understandable for the reviewer. Update setup/status documentation.

**Completion:** one real reviewed update PR demonstrates correct artifacts,
inventory, licenses and acceptance evidence. It is not automatically merged.
The local directory's documentation-only state is no longer advertised as
an implemented release; actual implemented capabilities are recorded.

## Phase 10: scheduling and operation

**Prerequisites:** phase 9 and explicit scheduling approval.
**Covers:** PR-01, PR-02, PR-05, TX-06, LIC-06.

1. Enable a suitable schedule with bounded target concurrency only after the
   manual path is accepted. Derive its targets from enabled central app-list
   entries, initially Core only; do not maintain a second target list in CI.
2. Define actionable reporting for repeated website failures, unavailable
   exact-version sources, changed licenses and authentication/permission errors.
3. Document credential rotation, retained-artifact cleanup, retry policy,
   disabling a target/schedule and handling a rejected update. Never roll back
   production installations automatically.
4. Verify repeat scheduling does not create duplicate/empty PRs and one failing
   app/library does not prevent independent targets from reporting results.

**Completion:** scheduled operation is observable, safely repeatable and can
be disabled without app changes. Operators can distinguish no-op, draft review
findings and failures; no credentials or undeclared writes leak across targets.

## Phase 11: reuse and additional libraries

**Prerequisites:** phase 9; scheduling is optional for the next manual target.
**Covers:** CFG-01, CFG-05, CFG-06, ART-01, QA-01.

1. After Core acceptance, explicitly add a second app to the central app list
   for a controlled reuse trial, using the existing adapter. Prove shared code
   needs no per-app copy and does not assume Core's directory layout. Enable
   the app deliberately, not through implicit discovery or new CI target logic.
2. Implement the later ECharts browser adapter from Development/ECharts.md and
   ART-02/ART-03: use the real Apache page, validate actual exact versions and
   downloads, retain Core's selection and add offline failure fixtures plus a
   separate live smoke test. Never add a local bundler/minifier fallback.
   Treat PHP_XLSXWriter separately as integrated PHP with potential local changes,
   not an interchangeable npm bundle.
   Implement and accept the ECharts recipe's installed-build proof and
   publication revalidation before registration; do not assume npm-original byte
   equality or permanent byte reproducibility of the online builder.
3. Add only concrete required adapter capabilities and tests, maintaining the
   provider/policy/artifact separation and schema compatibility.
4. Repeat version, licensing/BOM and PR acceptance for each new adapter.

**Completion:** cross-app reuse is demonstrated. Any new adapter has documented
provenance, failure behavior, licensing and focused tests, without introducing
arbitrary executable app configuration.

## First-release acceptance summary

The first release is ready only when phases 0 through 9 are accepted and the
following evidence exists:

- A fresh checkout can use the documented central toolchain without app-local
  build/tooling copies.
- Contract, policy, adapter, candidate, transfer and PR tests cover both success
  and relevant failure paths.
- A real npm distribution matches the exact allowed Mermaid target, integrity,
  mapped runtime/support files and actual embedded versions without rebuilding.
- Correct package/version identities and available original texts survive real
  BOM export, including coexisting versions and visible warnings. Metadata-only
  declarations and coverage gaps remain explicit; attribution/licensing review
  is completed before merge.
- An authorized target PR is created/updated safely, with unchanged unrelated
  files, accurate checks and developer-owned manual integration review.
- Credentials are isolated, failed candidates cannot publish, no automatic
  merge occurs, and retries/no-ops are safe.

Scheduling and additional adapters are subsequent increments, not reasons to
delay the first complete manually triggered Mermaid workflow.
