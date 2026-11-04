# Instructions for dependency updates

Before planning or changing dependency update automation, read these instructions,
the [requirements](../Requirements/Requirements.md), [approach](../Requirements/Approach.md)
and [development plan](../Requirements/Plan.md). The repository-level and
path-specific instructions under `.github` route to these documents.
Check the [current development status](Status.md); for ECharts also read the
[online-builder findings](ECharts.md).
Read [Configuration](Configuration.md) for executable contracts and
[Mermaid findings](Mermaid.md) for the first npm-distribution workflow.
Read and maintain [Architecture](../Architecture.md): document every maintained
file, its behavior and its interactions as development proceeds.

Requirements define what must be achieved, Approach explains the agreed design,
and Plan defines delivery order and acceptance. Keep technical observations and
implementation status in `Docs/Development`. Do not duplicate the full plan in
working instructions or mark a phase complete based on documentation alone.

## Ownership and scope

- Keep discovery, policies, adapters, validation and PR orchestration in
  DependencyUpdater, not duplicated in consuming app repositories.
- Focus development and initial acceptance on Core only. Maintain the authorized
  app list centrally in version control; automatic runs use only enabled entries,
  and manual selection cannot expand that set. Do not discover/enroll apps
  implicitly or add further apps before Core acceptance. Implement the list's
  format and validation together, not as an unconsumed placeholder.
- App repositories own their `includes.json`, runtime assets and original
  licensing/attribution files. Keep the existing inventory array compatible
  with PackageManager; entries without update configuration remain valid.
- Separate provider (available releases), policy (permitted versions) and
  artifacts (how outputs are obtained). Package-specific behavior belongs
  in reusable central `Recipes/<bundle>/index.mjs` implementations, not in
  generic orchestration. Register literal trusted imports in `src/recipes.mjs`;
  do not accept executable paths from inventories. Common helpers stay in `src`.
  Every source module needs a short head comment explaining its responsibility
  and important boundaries.
- App options should select a known adapter and provide declarative parameters
  and explicit output paths. Do not execute arbitrary commands supplied by
  an app's inventory.
- The versioned schema, app list, metadata CLI, candidate reconstruction and manual
  draft-PR publisher are implemented locally; rollout acceptance is pending.
  Do not treat metadata plans as
  approved updates or invent fields unsupported by the consumer. Start with
  Mermaid in Core; keep ECharts as a later adapter. Do not retain references to
  deleted Core recipes or add placeholder build commands.

## Inspect before changing

1. Inspect both worktrees and preserve unrelated or staged user changes.
2. Read the target app inventory, actual runtime files, consuming references
   and any local patches. Inventory alone may not describe historical bundles.
3. Use an explicit policy/target; distinguish tooling changes from version
   migrations. Do not upgrade shipped assets merely while moving documentation.
4. Verify upstream versions, dependency structure and license/notice obligations.
   Never assume unchanged terms or invent package versions.

## Version and artifact rules

The agreed initial policy is stable `same-major`: no prereleases, deprecated
candidates or downgrades. For major zero it permits minor changes within zero.
Embedded dependencies follow verified upstream pins; reject dependency downgrades.
For every library and adapter, report added, removed and changed dependencies in
the PR instead of blocking structural changes by themselves. This is shared
behavior, not a Mermaid-specific exception. Distinguish declared dependency ranges
from exact shipped versions; incomplete artifact/version evidence and failed
checks remain errors. Removing a coexisting version is structural; only newly
introduced versions below that package's previous minimum fail the current
generic embedded downgrade check.
ECharts/ZRender currently
require tslib 2.3.0; do not override it to match a separate Composer installation.

For ECharts, automate the real Apache online builder in a browser and capture
its output. Do not maintain a second local bundler/minifier or silently fall
back to one when the website fails. `api=true` means Utilities, not a REST API.
Check actual downloaded versions against the allowed candidate: unversioned
website sources are not an exact version pin. A successful download with a
wrong/unsupported version is a failure, not a version-only inventory update.

Record source URLs, target commit, selection, loaded package identities and
artifact hashes. A recorded hash is provenance for those bytes, not proof
that upstream code is trustworthy or reproducible forever.

## Execution and application boundaries

- Use fresh development/CI workspaces outside production webroots. This local
  documentation checkout under `vendor` is not a suitable build sandbox.
- Allowlist target repositories/branches separately from app-provided options.
  Bind candidates to an exact checked-out commit and fingerprints; do not
  overwrite changed baselines or silently merge concurrent user edits.
- Resolve app paths relative to that app's root. Bound all writes to declared
  metadata and outputs; reject traversal, devices, symlinks/junctions, overlaps
  and implicit directory-wide replacement/deletion.
- Use portable paths in JSON and native filesystem operations in code.
  On Windows use backslashes in terminal filesystem paths.
- Generate candidates separately from application/publication. Validate the
  actual downloaded output, not an independently rebuilt substitute.
- Recipes return the shared normalized identity/output/license/evidence/check
  contract and implement installed-file validation. Do not hardcode filenames,
  source-map hashes or unconditional package-specific checks in candidate logic.
  Preserve Mermaid's previous-release original-byte check: it prevents loss of
  patches already present before the run, including committed patches. Shared
  fingerprints/Git rechecks protect against changes during the run, not those
  earlier patches. See Configuration's installed-file protection explanation.
  A future generated-bundle recipe needs an appropriate explicit proof, not a
  silent no-op or a comparison with an unrelated prebuilt npm file.
- Failed downloads, partial outputs, unexpected files, invalid metadata,
  timeouts and failed configured checks must stop the update explicitly.
  Retain failure reports/logs; never emit success-shaped results.
- Transfer only changed declared files with matching metadata. Use a disposable
  branch/checkout or tested backup/recovery behavior. Do not call multi-file
  replacement globally atomic, and never overwrite unrelated user changes.
- Keep browser/build execution separate from credentials used to push branches
  and create PRs. Use an allowlisted environment and disposable CI workers,
  without production secrets. Directory separation is not an OS sandbox.
- Prefer a narrowly scoped GitHub App for cross-repository writes. The workflow
  repository's normal `GITHUB_TOKEN` does not grant writes to other repositories.
  Validate the token/CI-trigger strategy against current GitHub documentation.

## Licensing and PackageManager acceptance

Use the shared slim strategy in `src/licenses.mjs`: validate main-package
registry/manifest/license consistency and preserve supplied original upstream
LICENSE/NOTICE/copyright files, including bundler sidecars. Prefer provided
upstream attribution over downloading every dependency archive. Record exact
embedded identities and npm declarations without recursively scanning dependencies.
Never assign the main license or generic texts to embedded packages, or infer
completeness from a notice filename. Missing embedded declarations/text coverage
and changed licenses are prominent draft-PR findings, not approvals or candidate
blockers. Contradictory main evidence and missing main terms remain errors.
Do not report browser/build-tool dependencies as shipped runtime code.

The final inventory consumer is PackageManager's `GenerateLicenseBOM`, not just
`includes.json`. Verify its real exported JSON/Markdown identities, versions and
available original license texts after relevant changes, preferably with isolated output
paths. Do not repair generated inventories by hand.

Different installed versions must coexist; embedded tslib 2.3.0 must not replace
Composer tslib 2.8.1. Compare exact version-specific identities, not name alone.
Use real shipped license files with vendor-relative paths. Do not rely on
automatic package-directory lookup to find a different embedded version.

PackageManager's license contract has evolved since the Core prototype. Inspect
the current implementation and consuming app's bundling documentation before
editing license fields. Current Core documentation recommends `licenses` objects
with named `file`, `text` or supported raw `link` values; legacy fields may still
be readable. A GitHub `blob` page is not a raw license-text source. Do not change
unrelated existing declarations during this migration.

Report remote lookup warnings, missing declarations/texts and backup-directory
discovery even if expected-package assertions pass. Full installation BOM
generation may require a separate installation context; do not claim a generic
standalone checkout automatically supplies that context.

## Validation and PR review

Add focused tests for changed executable behavior. Cover policy edges, no-ops,
unmanaged entries, path escapes, download/validation failures, version mismatches,
partial writes/recovery and repeatable PR updates when implementing those features.
Use existing tools; do not install a toolchain for documentation-only changes.

Future PRs report old/new versions including embedded dependencies, changed
files, provenance, license changes and the actual automatic checks/results.
Distinguish failed, skipped and not-run checks. Failed configured checks block
a successful candidate; missing comprehensive PowerUI tests do not block
PR creation. When integration was not automatically verified, include:

> Integration and functionality in PowerUI have not been automatically verified.
> The responsible developer determines and performs the required manual checks
> during review before merge.

Describe partial coverage accurately. Do not infer package-specific manual
checklists or require manual-test configuration in `includes.json`. The
responsible developer selects relevant consuming pages/workflows before merge.
Never merge automatically or treat successful artifact checks as compatibility,
license-change or security approval.

Update documentation/status with implementation changes. Keep history separate
from current behavior; do not advertise retired prototype commands as available.
