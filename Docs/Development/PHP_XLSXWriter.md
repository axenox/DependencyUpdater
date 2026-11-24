# PHP_XLSXWriter: Core 0.37 to 0.39 trial

The active manual Core trial uses `mk-j/php_xlsxwriter`, not Mermaid.
Core no longer includes Mermaid in its inventory; `Recipes/mermaid/index.mjs`
remains registered for future consumers. ECharts is still deferred.

## Why an original-file replacement is not sufficient

Core's `CommonLogic/Utils/XLSXWriter.php` is a modified copy of upstream 0.37.
It adds the `exface\Core\CommonLogic\Utils` namespace, qualifies `ZipArchive`,
extends `writeSheetHeader()` with a fourth column-options argument and supports
column width, hidden and collapsed settings. `Actions/ExportXLSX.php` uses that
fourth argument for both data and information sheets. Core also replaces an
obsolete string offset and makes XML escaping accept null without a PHP warning.

Upstream 0.39 still has a three-argument header method and no equivalent
column-options API. Replacing the class with unmodified 0.39 would therefore
lose behavior used by Core. The approved strategy explicitly preserves these
adaptations; it is not permission to overwrite arbitrary local modifications.

## Provider, policy and source proof

- Provider: public Packagist, package `mk-j/php_xlsxwriter`.
- Policy: stable `same-major`, including minor updates within major zero.
- Adapter: `php-source`, statically registered to `Recipes/php-xlsxwriter/index.mjs`.

The provider expands Packagist's `composer/2.0` inheritance format, including
`__unset`. Public numeric versions such as `0.37` and `0.39` remain unchanged
in inventory; policy compares them as `0.37.0` and `0.39.0`. Ranges, dev versions,
prereleases, abandoned/deprecated candidates and downgrades are not selected.
The installed 0.39 is a true no-op, not an artificial downgrade/rebuild.

Verified official release references:

| Version | Git commit | Original source SHA-256 |
| --- | --- | --- |
| 0.37 | `c4ba6023fcd49578062e35ed6af3e205dd50a903` | `29bc8ce1a06a0a960a9e96dd636748d119fd6bd6ad547f008ed6995a514e5b07` |
| 0.39 | `67541cff96eab25563aa7fcecba33e03368fa464` | `af50a690d25f45673d6e702714e830efa46ff6ed17543a4621af04f8ed02ce45` |

Sources: [Packagist metadata](https://repo.packagist.org/p2/mk-j/php_xlsxwriter.json),
[0.37 source](https://github.com/mk-j/PHP_XLSXWriter/blob/c4ba6023fcd49578062e35ed6af3e205dd50a903/xlsxwriter.class.php),
[0.39 source](https://github.com/mk-j/PHP_XLSXWriter/blob/67541cff96eab25563aa7fcecba33e03368fa464/xlsxwriter.class.php).
Both declare MIT, PHP `>=5.2.1` and `ext-zip: *`. These are upstream requirements,
not the minimum for Core's adapted PHP source or the updater's tests.
There are no embedded third-party packages in the reviewed source file.

Packagist supplies Git commits but no usable distribution integrity checksum
for this package. The reader does not invent an npm tarball or registry checksum.
It resolves the exact GitHub commit/tree, rejects truncated/unsafe/link entries,
downloads declared files, supplied original terms and READMEs from commit-bound
raw URLs, and verifies each file's Git blob SHA-1 and size against the tree.
Evidence additionally records URLs, SHA-256, commit and tree identities.
This establishes source identity through official HTTPS metadata, not signatures,
upstream trustworthiness or reproducible archive packaging.

Responses have time/size limits, with no redirects, authentication or Composer
installation. GitHub public API rate-limit/network failures are explicit errors,
not reasons to reuse a moving branch or silently skip checks.

## Reviewed transformations and installed-file protection

`adaptSource()` accepts only the reviewed 0.37 and 0.39 source fingerprints.
Every replacement also requires its exact anchor once. A later release or changed
source fails until its adaptations and regression tests have been reviewed.
This intentionally restricts automatic application more than generic version
discovery; it does not pretend the port is safe for unknown future sources.

The recipe adds the namespace/attribution, qualifies ZIP class references and
ports Core's column-options/legacy-width API. New option handling uses guarded
array access, including scalar legacy widths and omitted hidden/collapsed flags,
so preserving the extension does not introduce PHP 8 warnings.
For 0.37 it retains the string-offset/null-escaping fixes. Upstream 0.39 already
handles these through bracket offsets and a string cast with `ENT_SUBSTITUTE`;
those newer upstream fixes are preserved instead of replaced.

Before the first update, the recipe accepts only the reviewed installed Core
0.37 fingerprint:
`3bda8bceedfa9d8e35340786b0e0c1ae392e0cb613db0d2c9e41798df33da15d`.
Only CRLF-to-LF checkout normalization is permitted. Additional code, comment or
whitespace edits fail, even if committed. This legacy fingerprint is independent
of newly generated output, so the baseline proof does not depend on assuming that
the old Core file was unmodified upstream.

On the initial legacy inventory, a missing new license destination is expected;
an existing but different license file is not overwritten. The MIT declaration
must agree. After updating, the runtime and original license must match the
previous recipe output and the named license must belong to the owning app.
Shared file/Git baseline rechecks independently protect changes during the run.

Generation invokes only `php -n -l` through stdin, with a restricted environment.
It does not execute downloaded PHP. The offline regression suite separately runs
reviewed, version-controlled fixture code to inspect actual XLSX output.
Node.js 24 and PHP 8 with ZIP are needed for that suite; hosted Ubuntu runners
provide PHP and the workflow explicitly checks its availability.

## Core inventory and candidate outputs

The Core entry stays at **0.37** until the reviewed update is applied. Its optional
`update` definition uses:

```json
{
  "schemaVersion": 1,
  "provider": {"type": "packagist", "package": "mk-j/php_xlsxwriter"},
  "policy": "same-major",
  "artifacts": {
    "adapter": "php-source",
    "files": [
      {"source": "xlsxwriter.class.php", "target": "CommonLogic/Utils/XLSXWriter.php"},
      {"source": "LICENSE", "target": "CommonLogic/Utils/XLSXWriter.LICENSE.txt"}
    ],
    "evidence": {
      "packages": "CommonLogic/Utils/XLSXWriter.packages.json",
      "notices": "CommonLogic/Utils/XLSXWriter.NOTICES.txt"
    }
  }
}
```

The candidate changes exactly these four outputs and `includes.json`.
It records 0.39 and a named MIT license pointing at
`exface/core/CommonLogic/Utils/XLSXWriter.LICENSE.txt`, replacing only this
entry's legacy license fields. It preserves original MIT bytes and source
attribution. Source evidence includes the adaptation identifier, original and
adapted hashes. The generated package list is empty because no other packages
are embedded; Composer's PHP/ZIP platform requirements are not invented bundles.
License review remains mandatory; collection is not approval.

## GitHub trial

1. Publish updater changes to `sergejriel/DependencyUpdater` on `master`.
2. Commit/push the adjusted **0.37** inventory on `sergejriel/Core`,
   branch `feature/Devman-3415-dependency-updater`. Do not replace the live writer
   or change the inventory to 0.39 merely to prepare this test.
3. Keep `fork-publishing` restricted to the updater's `master`, with
   `TARGET_REPO_TOKEN` scoped to the Core fork as described in
   [Configuration](Configuration.md#github-setup-and-manual-invocation).
4. Run **Update bundled dependency** from updater `master`, app `exface.Core`,
   package `mk-j/php_xlsxwriter` (the new default).
5. Review the draft against the Core test branch. Candidate generation and the
   independent publisher both verify sources, adaptations and PHP syntax.

The assistant has not pushed, dispatched or created a remote PR. Acceptance
still requires the real workflow, installation BOM and manual PowerUI export
review. See [Status](Status.md) for actual local evidence.

## Offline fixture provenance

`test-support/php-xlsxwriter-0.37.php.txt` and `php-xlsxwriter-0.39.php.txt`
are the immutable upstream originals at the commits/hashes above.
`php-xlsxwriter-core-0.37.php.txt` snapshots the separately reviewed Core
integration at the installed fingerprint. `php-xlsxwriter.LICENSE.txt`
preserves upstream's complete MIT copyright/terms for these snapshots and the
small adaptation fragments. `.gitattributes` disables text conversion for these
fingerprinted fixtures. Tests need no network, Workbench mocks or model database.
