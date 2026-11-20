# Configuration, CLI and manual workflow

Implemented contracts for the local planner/candidate/publisher implementation.
See [architecture](../Architecture.md) for all files and interactions,
[status](Status.md) for evidence/blockers and
[delivery plan](../Requirements/Plan.md) for outstanding acceptance.

## Development setup

Use Node.js 24 LTS. Dependencies `semver`, `acorn` and `tar-stream` are pinned; tests use
Node's native runner. Install in a development checkout outside a production
webroot using `npm ci --ignore-scripts --no-audit --no-fund`, then `npm test`.
No Composer dependency, browser or upstream build tool is needed.
The source directory under `vendor/axenox/DependencyUpdater` is not a sandbox;
run downloads and future browser execution in isolated external workspaces.

## Central app list

`Config/apps.json` is the only registration source. It contains `schemaVersion: 1`
and an `apps` array. Every entry requires exactly these fields:

| Field | Meaning |
| --- | --- |
| `id` | Stable app selector, initially `exface.Core` only |
| `repository` | Allowed GitHub owner/repository, currently test fork `sergejriel/Core` |
| `baseBranch` | Allowed branch, currently Core's `1.x-dev` |
| `inventory` | Literal app-relative inventory path, `includes.json` |
| `vendorPath` | Owning vendor/package for license-file paths, currently `exface/core`; independent of GitHub owner/repository |
| `enabled` | Boolean eligibility flag; disabled entries cannot be selected |

Unknown fields, duplicate app/repository identities and unsafe paths fail.
No automatic enrollment, credentials, local installation paths or executable
commands are accepted. `node cli.mjs apps` lists enabled apps; `--app exface.Core`
restricts selection. An empty enabled list performs no target work.

## Optional inventory update definition

The existing inventory array and all unmanaged entries remain unchanged.
Core's `npm-asset/mermaid` entry now has this versioned definition:

```json
{
  "schemaVersion": 1,
  "provider": {
    "type": "npm",
    "package": "mermaid"
  },
  "policy": "same-major",
  "artifacts": {
    "adapter": "npm-dist",
    "evidence": {
      "packages": "Facades/AbstractAjaxFacade/js/mermaid/bundled-packages.json",
      "notices": "Facades/AbstractAjaxFacade/js/mermaid/THIRD_PARTY_LICENSES.txt"
    },
    "files": [
      {
        "source": "dist/mermaid.min.js",
        "target": "Facades/AbstractAjaxFacade/js/mermaid/mermaid.min.js"
      }
    ]
  }
}
```

This is the value of `update`, not the complete inventory entry. The real Core
definition additionally maps the source map, package.json, README and LICENSE.
`source` is relative to the npm package root (excluding the archive's `package/`
prefix); `target` is relative to the app checkout. The adapter identifier is
resolved through the trusted provider/package/adapter registry in `src/recipes.mjs`.
Currently only the Mermaid recipe is executable; its implementation lives in
`Recipes/mermaid/index.mjs`, outside shared orchestration.
Candidate generation requires all five mappings and both evidence outputs.
The map must be adjacent to the runtime, with the runtime path plus `.map`.
Source-map identities and original terms are evidence, not automatic license
approval or installation-wide BOM acceptance.

Core declares the top-level original terms as
`licenses: [{"name":"MIT","file":"exface/core/Facades/AbstractAjaxFacade/js/mermaid/LICENSE.txt"}]`.
It must not point into another app or retain legacy `license_file`.

Only public `npm`, `same-major`, schema version 1 and `npm-dist` are currently
accepted. The inventory name must match `npm-asset/` plus the upstream name.
Installed versions must be canonical stable exact SemVer. Reject unsupported
fields/adapters, duplicate identities/sources, overlapping destinations including
the inventory, globs, devices, traversal and symlink/junction paths.
Do not add shell commands or arbitrary executable adapters.

There is no app-controlled recipe module path or new recipe field. The existing
`npm` + `mermaid` + `npm-dist` combination selects the central registration.
Metadata planning remains package-independent; executing an update for an
unregistered combination fails explicitly before artifact acquisition.

## Run a plan

From the DependencyUpdater development directory:

```powershell
node cli.mjs apps
node cli.mjs plan --app exface.Core --root 'C:\path\to\Core' --package npm-asset/mermaid
```

Omit `--package` to plan all managed entries in that selected app. Planning
requires an explicit enabled app and a local checkout whose root, Git origin
and current branch match its registration. HTTPS and SSH GitHub origins are
accepted. No clone/fetch, checkout, staging, app writes or publication occurs.

The plan reads the working-tree inventory, including deliberate uncommitted
configuration changes. It records Git HEAD and exact inventory/output SHA-256
fingerprints, missing destinations and source URLs; it rechecks the baseline
before returning. This is not authorization for later transfer.

Metadata comes exclusively from public registry.npmjs.org without authentication
or redirect following, with a 30-second timeout and 32 MiB response limit.
Selection uses the highest newer stable non-deprecated release in the installed
major, including minor updates within major zero. Dist-tags do not override it.
No newer allowed version reports `up-to-date` with a null candidate.

The JSON report has `kind: metadata-plan`, schema version 1 and explicit automatic
check outcomes. Tarball URL/SHA-512 and dependency ranges are registry declarations:
the archive, actual runtime version, embedded dependencies, original terms and
PowerUI integration remain `not-run`. Changed license declarations flag manual
review; changed dependency declarations are visible, not automatically approved.
HTTP, malformed response, configuration, target identity and concurrent baseline
errors exit nonzero on stderr, never as success/no-op JSON.

## Candidate pipeline

These commands clone the configured public repository. Every `--workspace`
directory, and `--output` for prepare, must be new; their parent directories must
already exist. They do not reuse a live app checkout.

```powershell
node pipeline.mjs prepare --app exface.Core --package npm-asset/mermaid --workspace 'C:\temp\generation' --output 'C:\temp\candidate'
node pipeline.mjs verify --app exface.Core --package npm-asset/mermaid --workspace 'C:\temp\verification' --candidate 'C:\temp\candidate\candidate.json'
node pipeline.mjs publish --app exface.Core --package npm-asset/mermaid --workspace 'C:\temp\publication' --candidate 'C:\temp\candidate\candidate.json'
```

`prepare` creates `candidate.json` with `kind: npm-candidate`, the plan,
changed-file bytes/hashes/sizes, embedded versions/licenses, dependency changes
and check scope. Up-to-date versions produce `kind: no-op` without downloads.
Only `publish` can write to GitHub, and only through the explicit API token.
Do not invoke it merely to validate source changes.

Both `verify` and `publish` recreate the entire candidate from current trusted
configuration, a fresh baseline and public verified npm evidence. They reject
changed payloads, reports, registry selection or baselines rather than trusting
the artifact's check flags. No package scripts or downloaded JS execute.
Recipe-specific evidence is stored under `artifactEvidence` in the generated
package report; Mermaid's map hash is `artifactEvidence.sourceMapSha256`.
Regenerate previously prepared candidates after changing trusted recipe code or
report structure: independent reconstruction deliberately rejects stale payloads.

### Protecting existing files before an update

For Mermaid, "installed files" means the bundled files already present in the
target app repository. No `npm install` is involved.

Before replacing them, the recipe reads the **previous** version from
`includes.json`, for example 12.2.0. It obtains that version's original npm archive,
checks SHA-512 integrity and registry/manifest agreement, then compares every
configured installed file with the corresponding archive member using
`Buffer.equals()`. This covers JavaScript, map, package.json, README and LICENSE,
not just the version printed inside the JavaScript.

The comparison is byte-for-byte, not a functionality test: a local patch,
modified comment, different line ending or further minification causes an
explicit error. A missing file also fails. The updater does not automatically
discard the change, repair the file, or overwrite it.

For example, someone might patch Mermaid 12.2.0 while leaving the inventory
version unchanged. A version-only check would accept it as 12.2.0 and lose that
patch during replacement. The original-byte comparison instead says: this is
no longer an untouched upstream copy; a deliberate decision is needed first.

Two independent protections are necessary:

| Protection | What it detects |
| --- | --- |
| Recipe's comparison with the previous npm originals | Changes already present **before** the update started, even if committed in Git |
| Shared file fingerprints and Git-commit rechecks | Changes made **during** the run after its baseline was captured |

A matching upstream copy is not proof of safe behavior or legal approval. It
only establishes which original files are being replaced without silently losing
local modifications. New-release artifact checks and manual integration review
are separate.

This exact proof method belongs to the Mermaid recipe, not to all bundles.
An ECharts custom build is generated for a selected module set and cannot simply
be compared with a prebuilt npm file. A future ECharts recipe must implement an
appropriate installed-build proof and publication verification; neither is
implemented by this refactor. The shared path/fingerprint/Git guards remain
mandatory regardless of recipe.

All packages use generic PR reporting of added/removed/changed dependency ranges
and exact embedded identities. Structural changes alone are not blockers.
New embedded versions below that package's previous minimum fail; removing a
coexisting version alone is a structural change, not a downgrade. Modified
installed originals, incomplete artifact evidence, contradictory main-package
licensing and missing required main terms remain explicit errors.

The approved `exact-embedded-originals` strategy preserves main terms and supplied
notices, including sidecars. It first reuses original terms reliably mapped by the
trusted recipe to exact embedded identities. Mermaid maps only exact pnpm
source-map paths; an arbitrary aggregate notice/root MIT file is not a mapping.
For other identities shared code obtains only that exact embedded npm archive,
verifies SHA-512 and manifest identity, and collects original license/notice/
copyright plus relevant README files. It never follows their dependency trees,
executes scripts/JS, substitutes generic texts or infers declarations from terms.
HTTP/timeout/integrity/archive/identity errors stop; actual absence of original
terms or declarations and embedded registry/manifest contradictions are explicit
draft-review findings. Main validation and installed-original-byte guards stay strict.

`bundled-packages.json` retains each package's `terms` (original path, SHA-256,
UTF-8 display text and recoverable original `bytesBase64`), `termProvenance`
(archive URL, SHA-512 integrity and manifest hash/path, or exact upstream map
evidence), registry declaration/URL, original manifest declaration and whether
that manifest was checked. `THIRD_PARTY_LICENSES.txt` contains the package-specific
original texts with identities/provenance/hashes and warnings, not just SPDX names.

Current PackageManager at `314a75d` was inspected: `BOMPackageLicense` imports
`text`, preserves it through `toBOM()`, and full `JsonBOM` exports license objects
with their text (`minimal` intentionally omits it). Therefore known embedded
declarations use `licenses: [{"name":"<registry declaration>","text":"<only this
exact package's original files>"}]`. No aggregate notice file is assigned as
every package's license. Unknown declarations keep `licenses: []` and their
originals in the declared notices/evidence; without a real declared name the
current consumer cannot expose those as a named license. This is visible review
work, not a reason to invent one. Expressions/alternatives are not selected.
The isolated real-candidate serialization check retained 64 named package texts,
65 exact package identities and Khroma's unknown declaration in full JSON;
Markdown export also ran. This does not claim installation-wide enrichment or
complete legal attribution acceptance.

`licenseReview.status: required` and `licenseApproval: manual-review-required`
always remain. `embeddedLicenseTexts` is `original-files-collected` or
`missing-original-files`, describing collection, **not legal completeness**.
Review the original files and README-only warnings before merge. A filename,
successful archive check or original-file count never means legal approval.

## GitHub setup and manual invocation

Repository: `axenox/dependencyupdater`; workflow:
`.github/workflows/update-bundled-dependency.yml`, **Update bundled dependency**.
Publish the updater on its default branch and the adjusted target inventory on
the configured `1.x-dev` before invocation. No workflow dispatch, PR, secret or
environment has been provisioned by this local implementation.

Create environment `fork-publishing` in the updater repository, with secret
`TARGET_REPO_TOKEN`. The current publisher expects a fine-grained personal access
token identifying a user via `GET /user`, scoped only to `sergejriel/Core` with
Contents write, Pull requests write and Metadata read. A normal workflow
`GITHUB_TOKEN` cannot write this other repo. GitHub App authentication is not yet
implemented. Prefer required reviewers and a default-branch environment restriction.

The workflow is manual-only and rejects non-default-branch execution. Select
app `exface.Core` and package `npm-asset/mermaid`; inputs cannot override the
repository or branch. Per-app/package concurrency prevents overlapping runs.
Generation and publication use different workers; the first has no target-write
secret. The publisher reconstructs the candidate before API writes. Candidate
artifacts are retained seven days; the successful publication result is added to
the workflow summary.

Commits use author `github-actions[bot]` and explicit committer identity from the
authenticated token account; PRs belong to that account, not an impersonated bot.
The Copilot coauthor trailer is retained. No force pushes, automatic merges or
automatic license approval are performed.

## Existing branches, failures and retries

The branch identity is a stable hash of app/package, not an app-supplied path.
An identical owned PR is unchanged with no write. A subsequent owned update can
fast-forward only when history/paths are recognized and base/head/body are stable.
Manual PR-body edits, human/unrecognized commits, divergent history, unexpected
paths and closed-unmerged PRs stop with explicit errors.
Converting a draft to ready-for-review is also a human state change; the updater
does not silently add new unreviewed content to that PR.

After a merged PR, explicitly remove the old updater branch before starting a new
transaction. Existing branches without open owned PRs are not silently reset.
API calls are not globally atomic: failed ref/PR calls can leave unreachable
objects or an orphan branch, or an updated branch with its old PR body.
Inspect such state before cleanup/retry; no success is reported on failure.
When the base or selected version advances between jobs, regenerate a candidate.

The isolated real Mermaid candidate now succeeds and reports ElkJS's changed
license declaration plus Khroma's missing declaration. Original-text collection
is separate from legal review. No remote workflow was dispatched. See [Mermaid findings](Mermaid.md).
