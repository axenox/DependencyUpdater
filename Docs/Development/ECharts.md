# ECharts: Apache online-builder adapter

Research baseline: 2026-11-03. This is a specification and observed evidence,
not an implemented adapter.
For binding requirements and delivery order see the
[requirements](../Requirements/Requirements.md) and [plan](../Requirements/Plan.md).

## Selected modules for Core

| Selection | Builder parameters |
| --- | --- |
| Charts | `bar,line,pie,scatter,heatmap,sunburst,graph,gauge,sankey` |
| Coordinates and components | `gridSimple,polar,singleAxis,title,legendScroll,tooltip,markPoint,markLine,markArea,dataZoom,visualMap` |
| Utilities | `api=true` |
| Compression | Default; omit `source=true` |
| SVG/VML | Not selected |

The complete current selection is:

```text
https://echarts.apache.org/en/builder/echarts.html?charts=bar,line,pie,scatter,heatmap,sunburst,graph,gauge,sankey&components=gridSimple,polar,singleAxis,title,legendScroll,tooltip,markPoint,markLine,markArea,dataZoom,visualMap&api=true
```

Different apps may supply a different selection to the same central adapter.
The website also includes Dataset/Transform and time/log axes as part of its
current build behavior. Do not assume its defaults are immutable.

## Observed behavior

The [builder page](https://echarts.apache.org/en/builder/echarts.html) reads URL
parameters. Its [build script](https://echarts.apache.org/en/builder/build.js)
fetches package manifests/modules, bundles with browser Rollup, compresses with
UglifyJS and saves a Blob using FileSaver. `api=true` selects Utilities; it
does not expose a server-side REST build API.

The complete Core selection above reached `OK` and generated `echarts.min.js`:

- Size: 760,791 bytes.
- SHA-256: `dbfc33b085d73b533de1d3d8c8452f9043e25abeb1d85f45614bae5301141b85`.
- ECharts: 6.1.0; dependency manifests: ZRender 6.1.0 and tslib 2.3.0.

This result was inspected in a browser; it was not applied to Core. The
previously shipped local-build artifact is not silently replaced during this
documentation migration.

The current script fetches modules from the website's `en/js/vendors` paths.
The unversioned ECharts manifest returns 6.1.0, but adding `version=6.1.0`
requests `echarts@6.1.0/package.json`, which returned HTTP 404. The page then
failed while parsing that response as JSON. The current UI does not send a
version parameter. Do not claim exact version selection works solely because
the script recognizes the parameter.

The [online-builder UI](https://echarts.apache.org/en/builder.html) warns that
the generated file is not an official Apache source release or distribution.
Website script/source changes can change output even for identical options.

## Minimal adapter requirements

Use browser automation (for example Playwright) to navigate the real page,
capture the completed download, validate it and copy it under the declared
target filename, for Core `echarts.custom.min.js`. Do not re-bundle or minify it.
No local Rollup, UglifyJS or Terser pipeline or silent fallback is required.

The adapter must enforce timeouts and explicit errors for failed network/build
requests, missing/partial downloads and unsupported selections. Validate actual
ECharts/dependency identities and versions against the freshly allowed candidate
before accepting output. A latest website version outside `same-major`, or
different from the selected exact target, must fail without changing inventory.

Record selection, source/builder provenance, fetched package metadata, actual
versions and output hash. Keep the dependency/license chain intact: ECharts
6.1.0 and ZRender 6.1.0 both pin tslib 2.3.0. Preserve original package license
texts and required notices separately from the downloaded JS. Do not report
Rollup/UglifyJS as embedded runtime dependencies merely because the builder
uses them.

The first implementation needs a clear decision for unavailable exact-version
sources: fail with diagnostics unless the actual website version exactly matches
the permitted target. Do not introduce source redirection or a different build
implementation as an undocumented workaround.

## Future recipe and installed-build protection

Implement package-specific behavior under `Recipes/echarts`, then register it
centrally; no ECharts recipe is executable yet. Shared candidate code accepts
normalized artifacts, identities, terms, evidence and checks without requiring
Mermaid filenames, pnpm paths or a source map.

Mermaid's installed-copy guard cannot be copied unchanged: its current npm files
can be compared byte-for-byte to the previous npm release, but an ECharts custom
build is generated for a particular module selection. Define how to prove which
previous generated artifact is installed and detect pre-existing local changes.
Keep the shared path/fingerprint/Git guards regardless of this proof method.

The current publisher reconstructs the complete candidate. The online builder
does not promise permanent byte-identical rebuilds; its future revalidation
method must therefore be explicitly designed and accepted without weakening
artifact provenance or credential isolation. Do not register a recipe that
silently skips these proofs.
