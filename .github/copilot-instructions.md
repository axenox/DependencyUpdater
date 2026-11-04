# DependencyUpdater instructions

Before analyzing or changing updater logic, app update configuration, adapters
or workflows, read:

- [Architecture: files, responsibilities and data flow](../Docs/Architecture.md)
- [Requirements: scope and acceptance](../Docs/Requirements/Requirements.md)
- [Approach: architecture and boundaries](../Docs/Requirements/Approach.md)
- [Plan: complete development phases and acceptance](../Docs/Requirements/Plan.md)
- [Canonical working instructions](../Docs/Development/Bundled_library_updates.Instructions.md)
- [Current implementation status and historical evidence](../Docs/Development/Status.md)
- [Implemented configuration, CLI and manual workflow](../Docs/Development/Configuration.md)
- [Mermaid findings](../Docs/Development/Mermaid.md) for the first npm workflow.
- [ECharts findings](../Docs/Development/ECharts.md) when working on ECharts.

These are mandatory task context, including for planning. Keep detailed rules
in those documents rather than duplicating them here.
Requirements, Approach and Plan are mandatory before implementation or changing
the project direction, not optional background links. Follow phase prerequisites
and update Status only after actual acceptance; this documentation does not
authorize publishing PRs, provisioning credentials or enabling schedules.

Keep the implementation central and configuration-driven. Do not copy tooling
into Core/UI5Facade or introduce local Rollup/Uglify/Terser builds as a fallback
for the Apache browser adapter. Do not describe planned behavior as implemented.
Preserve unrelated changes; make only the requested migration or implementation.
Every executable-code change needs relevant regression coverage. No automatic
merge, license-change approval, commit or PR publication without explicit scope.
Maintain `Docs/Architecture.md` alongside development: document every maintained
file and update its responsibilities/data flow when files or behavior change.
Keep bundle-specific implementations in central `Recipes`, selected through the
trusted registry; source-module head comments explain the shared boundaries.
