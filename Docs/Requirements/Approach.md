# Approach

Agreed direction as of 2026-11-03. See [Requirements](Requirements.md) for binding
behavior, [Plan](Plan.md) for delivery, and [development status](../Development/Status.md)
for what is actually implemented.

## One central updater, declarative consuming apps

DependencyUpdater is a separate development repository for bundled third-party
library updates across Core, UI5Facade and other registered apps. A shared
change must not require copying tooling or build scripts into every app.
It is not a runtime dependency of those apps.

| Central DependencyUpdater | Consuming app repository |
| --- | --- |
| Repository registration, provider readers and version policies | Inventory in the existing `includes.json` array |
| Reusable package-specific artifact adapters | Declarative adapter selection, options and output paths |
| Candidate validation, reports and controlled transfer | Bundled runtime and original licensing/attribution files |
| Scheduling and PR create/update | Developer review and manual integration acceptance |

Keep the provider, policy and artifact responsibilities separate:

- Provider discovers releases and package provenance, initially from public npm.
- Policy selects allowed exact versions, initially stable same-major.
- Adapter obtains the configured artifacts and describes actual embedded
  runtime dependencies; it does not decide which target repository is authorized.

The update definition references a known central adapter and declarative
options, not arbitrary local script paths or commands. The first read-only
schema and CLI are implemented and documented in
[Configuration](../Development/Configuration.md). Candidate generation and
publication are separate local contracts; live acceptance remains pending.
See [Architecture](../Architecture.md) for all maintained files and data flow.
Entries without an update
definition remain valid license inventory and are skipped.

Bundle-specific implementation belongs under the central `Recipes` directory.
`src/recipes.mjs` maps known provider/package/adapter combinations to literal
trusted imports; the existing Mermaid definition needs no new field. Shared
orchestration calls a recipe contract, not package names or runtime filenames.
A recipe obtains and checks its bundle, supplies normalized artifact/version/
license/evidence data and validates existing installed files. Common archive,
path, policy, license-review, inventory and PR mechanisms remain in `src`.
Helpers such as the pnpm source-map reader are reusable by recipes that actually
use that format, not mandatory for all bundles.

Target repository/branch registration belongs to central trusted configuration,
not to app-controlled output or command fields. Maintain one version-controlled
app list in DependencyUpdater, separate from each app's `includes.json`.
The list identifies each app, repository, base branch, inventory path and
enabled/disabled state; credentials remain outside it. Automatic runs process
only enabled registrations. Manual selection can restrict those targets, not
authorize additional ones. Do not scan installed apps or organization repositories
to enroll targets automatically.

During development and initial acceptance, Core is the only registered/enabled
app. Try other apps only after the complete Core workflow has been accepted.
The implemented list is `Config/apps.json`; validation and the read-only CLI
consume it. Enabling an entry makes it eligible for explicit planning, not
automatic publication. Manual draft publication is implemented locally;
no scheduler exists, and remote acceptance remains pending.

Start with one target/library per transaction and stable branch/PR identity per repository and library.
Do not introduce a general plugin framework or arbitrary build engine before
a concrete second adapter requires it.

## Mermaid first: consume the published npm distribution

The first workflow targets Core's `npm-asset/mermaid`; its upstream npm identity
is `mermaid`. The reusable `npm-dist` contract maps exact package-relative source
files to app-relative destinations. Obtain originals from the selected version's
public npm tarball, verify integrity and package identity, and do not install or
execute upstream lifecycle scripts. No own bundler is required.

The metadata planner reports declared dependency ranges, separately from the
distribution validator's exact embedded source-map identities. Candidate logic
preserves original files/terms and reconstructs every proposed byte before GitHub
API publication. All packages report structural changes without blocking them
by themselves. License changes and missing embedded declarations are review
findings in a draft PR, not candidate blockers or automatic approval.
See [Mermaid findings](../Development/Mermaid.md), including the test page's
current use of UI5Facade's separate asset.

Mermaid's recipe compares the app's existing files to the **previous** release's
original npm bytes. This detects pre-existing local patches that would otherwise
be overwritten despite an unchanged inventory version. Shared fingerprints and
Git rechecks instead detect changes **during** the run. Neither replaces the
other. See [the full explanation](../Development/Configuration.md#protecting-existing-files-before-an-update),
including why ECharts needs its own installed-build proof.

## ECharts later: delegate the build algorithm to the real website

The later ECharts adapter automates the actual Apache online builder in a browser,
captures its completed download and copies those bytes to the declared filename.
Use browser automation such as Playwright; do not reconstruct Rollup/UglifyJS
behavior locally, re-minify the download or silently fall back to the retired
Core Rollup/Terser build.

The inspected page builds client-side; `api=true` selects Utilities and is not
a server-side REST API. A documented server-side build API was not found.
Use the observations and Core module selection in
[ECharts findings](../Development/ECharts.md), not a claim that the website
provides a stable, versioned build service.

In the 2026-11-03 check, the unversioned page produced ECharts 6.1.0 while
`version=6.1.0` failed with HTTP 404. Treat the policy-selected version as the
required target, then verify actual source/output versions. If only an
unversioned build is available, accept it only when its verified versions match
that target; otherwise fail explicitly. Do not rewrite inventory to whatever
the website happened to provide.

Using the real website avoids a different maintained build algorithm, but
does not promise byte equality across website revisions or historical runs.
Record builder/source provenance, selection, loaded identities and output hash.
The website warns its output is not an official Apache release distribution.

## Candidate generation and publication

1. Select an allowlisted repository/branch and capture its exact checked-out
   commit and relevant file fingerprints.
2. Validate its inventory/update configuration, discover versions and select
   an allowed exact candidate or report a no-op.
3. Generate/download artifacts in a fresh isolated workspace without write
   credentials; resolve actual embedded dependencies and original licenses.
4. Validate the actual output, declared file set, versions, integrity evidence,
   license data and configured automatic checks.
5. Transfer only changed approved files and matching metadata into a dedicated
   target branch after rechecking the baseline.
6. Publish/update a PR with facts, validation scope and the manual-review notice.

Generation and authenticated publication are separate trust boundaries.
Prefer a scoped GitHub App installed only on registered repositories;
`GITHUB_TOKEN` from the central workflow does not grant writes to other repos.
For the first public fork trial, the implemented publisher instead uses a
fine-grained PAT restricted to that fork, stored as environment secret
`TARGET_REPO_TOKEN`. GitHub App authentication is deferred, not implicitly
supported by this user-token client. See Configuration for exact permissions.
The publishing job must revalidate a candidate rather than executing generated
code or trusting artifact-supplied target paths.

Use disposable checkouts as the normal transaction boundary. If a local
application mode is exposed, it needs tested backup/rollback/recovery rather
than a claim of globally atomic multi-file writes. Do not port the old recovery
CLI merely because it existed in the prototype.

## Licensing, acceptance and reviewer responsibility

The slim strategy validates the main package's declaration against its original
archive, preserves supplied upstream license/notice files, and reports exact
embedded identities with npm declarations. It does not download all dependency
archives or traverse the full npm tree. Supplied aggregate notices are preferred;
their completeness is a review responsibility, not inferred from a filename.
If individual embedded terms/declarations are missing, record explicit review
warnings and never substitute the main MIT text or a generic SPDX text.
Changed declarations are highlighted in draft PRs, without deciding legal
compatibility or approving alternatives. Contradictory main-package evidence and
missing required main terms still fail.

Inventory includes only actually embedded code, not browser/build tools. Different versions
remain separate, for example bundled tslib 2.3.0 and Composer tslib 2.8.1.
Do not override upstream pins to simplify the BOM or approve license changes
automatically.

Validate current PackageManager behavior through real JSON/Markdown BOM exports
in a suitable installation context with isolated destinations. A standalone
app checkout does not itself supply that context. The first rollout needs this
acceptance evidence; automated per-run integration must be explicit about its
scope and unavailable checks.

The updater reports performed automatic checks and facts, not an inferred
package-specific manual checklist. Missing comprehensive PowerUI tests do not
block PR creation. The responsible developer determines and performs manual
integration checks before merge; no automatic merging is planned.

## Delivery strategy

Define/test the smallest contract first, prove the npm distribution adapter independently,
then integrate candidate generation and controlled transfer. Add cross-repository
PR publication and a manual CI trigger before scheduling. Migrate Core
only once the new definition is executable and tested. After Core acceptance,
explicitly register a second app to test reuse. Add further libraries
and the Apache browser adapter without duplicating app-local tooling or expanding
scope to unrelated BOM issues.
