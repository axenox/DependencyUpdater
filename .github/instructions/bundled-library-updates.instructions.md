---
description: "Use when working on dependency updates, includes.json contracts, adapters or CI workflows."
name: "Dependency updates"
applyTo: "**"
---

# Dependency updates

Before working on this topic, read the
[architecture and maintained file map](../../Docs/Architecture.md),
[requirements](../../Docs/Requirements/Requirements.md),
[approach](../../Docs/Requirements/Approach.md),
[development plan](../../Docs/Requirements/Plan.md),
[working instructions](../../Docs/Development/Bundled_library_updates.Instructions.md)
and [current status](../../Docs/Development/Status.md).
Read the [implemented configuration](../../Docs/Development/Configuration.md)
and [Mermaid findings](../../Docs/Development/Mermaid.md) for the initial npm path.
For the Apache adapter also read
[ECharts findings](../../Docs/Development/ECharts.md).

Keep these documents as the canonical source of detailed rules. Do not recreate
per-app build/tooling directories or treat the retired Core prototype as an
implemented central updater.
Keep requirements, design, delivery plan and actual implementation status
separate and consistent. Do not mark planned phases complete without their
acceptance evidence.
Keep `Docs/Architecture.md` current when adding, moving or removing files or
changing their responsibilities and interactions.
