# Mermaid: first npm distribution workflow

Baseline: 2026-11-03. The first implementation targets `npm-asset/mermaid` in
Core, upstream npm package `mermaid`. ECharts follows later.
See [configuration](Configuration.md), [requirements](../Requirements/Requirements.md)
and [plan](../Requirements/Plan.md).

## Inventory and acquisition

Core records 12.2.0 and ships `mermaid.min.js`, its source map, package.json,
README.md and LICENSE.txt under `Facades/AbstractAjaxFacade/js/mermaid`.
The observed npm metadata exposes 12.3.0 as a newer stable same-major candidate.
The read-only planner returns 12.2.0 -> 12.3.0, unchanged top-level MIT declaration
and changed dependency ranges, including elkjs and dompurify.

The central registry selects `Recipes/mermaid/index.mjs` for npm package `mermaid`
with adapter `npm-dist`. Its `prepare` obtains original files from the exact selected
public npm tarball. No npm installation, lifecycle scripts or local bundler.
Before acquisition is complete, verify the archive's integrity, mapped sources,
runtime/relative assets and actual embedded attributions; top-level dependency
ranges do not reveal exact versions inside the published JS bundle.

The adjusted Core inventory replaces the legacy UI5Facade `license_file` with a
named MIT license pointing at Core's own original LICENSE.txt. Its runtime and
recorded 12.2.0 version remain unchanged until a real update is reviewed.
The update definition additionally declares generated package evidence/notices.
An unchanged top-level SPDX label does not prove complete licensing acceptance.

## Why existing files are checked against the previous originals

The recipe obtains the **currently recorded** release, for example 12.2.0, as
well as the proposed new release. `validateInstalled` compares every existing
mapped file to the verified **12.2.0 originals**, byte-for-byte, before permitting
replacement. It does not compare the installed 12.2.0 file to the new 12.3.0 file.

This prevents an update from silently deleting a local patch while inventory
still says 12.2.0. README edits and changed line endings also fail explicitly.
This is different from the shared fingerprints/Git checks, which detect edits
made after the run's baseline was captured. A previously committed patch can pass
those race checks but must still be caught by the recipe's original-byte guard.
See [the step-by-step explanation](Configuration.md#protecting-existing-files-before-an-update).

Shared candidate code receives normalized outputs, license destinations, exact
embedded identities, `evidence` and actual checks. It no longer imports Mermaid
logic or reads fixed runtime/map paths. Mermaid's `sourceMapSha256` is stored in
`bundled-packages.json` under `artifactEvidence`; other recipes need not use maps.

## Original distribution and embedded evidence

The real 12.3.0 map contains 1,255 sources and matching `sourcesContent`, with
65 exact embedded package versions versus 66 in 12.2.0. Multiple versions of
d3-array, d3-path, d3-shape, layout-base and cose-base must remain distinct.
The original pnpm paths retain upstream FastDom/RoughJS patch evidence.
No rebuilding or execution of downloaded JavaScript is used.

Observed changes include removal of `uuid@14.0.0`, DOMPurify 3.4.12 to 3.4.17,
ElkJS 0.9.3 to 0.12.0 and js-yaml 4.3.0 to 4.3.2. These are concrete examples of
the shared structural-change reporting used for **any** package, not Mermaid
special cases or structural-change blockers.

## Slim licensing strategy and current live trial

The strategy preserves main-package terms and supplied upstream notice files,
without acquiring individual dependency archives. Inspection of the actual
12.3.0 archive found only the root `LICENSE` among license/notice files, not a
complete standalone third-party notice collection. JS/map attribution comments
remain intact in the original runtime/support files. Do not imply that the root
MIT text covers all embedded code.

The real candidate records 65 exact embedded identities with npm declarations.
ElkJS's `EPL-2.0` to `EPL-2.0 OR GPL-3.0-or-later` change is a prominent review
finding, not a blocker. Khroma 2.1.0's missing npm declaration remains explicitly
unknown and generates a warning, not a guessed MIT declaration. The former
per-package reviewed-file override was removed along with dependency-archive
acquisition. Prior FastDom/Khroma archive investigations are historical evidence,
not part of the current validation algorithm or completeness claim.

The isolated fork trial overlays the intended Core inventory on a disposable
public fork clone, without changing the real app. Candidate generation and
independent reconstruction succeed. Each pass reads just two main-package
archives (12.2.0/12.3.0), never embedded-package archives. Six files change:
runtime, map, package.json, generated package evidence, generated upstream
notice/declaration summary and inventory; unchanged README/LICENSE are omitted.
The draft PR body includes the license findings, missing-declaration warning,
unverified text coverage, removed uuid and three embedded version changes.

This is not license approval, installation BOM acceptance, a remote PR or
updated Core runtime integration. Those acceptance steps remain pending.

## Local test page and acceptance boundary

The user supplied `http://localhost/exface/exface/mymermaidtest.html`.
It requires authentication; after login, browser inspection found four rendered
static diagrams: flowchart, sequence, state and pie.

The observed runtime request was
`vendor/exface/ui5facade/Facades/js/mermaid/mermaid.iife.min.js`,
not Core's `Facades/AbstractAjaxFacade/js/mermaid/mermaid.min.js`.
Therefore this page is not yet acceptance evidence for updating Core's file.
Do not silently edit UI5Facade, register it as a second target or claim that a
Core update has been tested through its unrelated bundle.

The same initial inspection also recorded an `Unexpected token ','` preload
error and a rejected promise during editor `refreshMermaid`. These occurred
before any library replacement; the four static renderings are not a claim that
the editor or page is error-free. They were not repaired as updater work.

Keep this concrete development fixture separate from the generic PR notice.
The updater must not infer package-specific manual checklists from it.
