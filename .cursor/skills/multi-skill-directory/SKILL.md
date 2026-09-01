---
name: multi-skill-directory
description: Selectively discovers, prioritizes, and chains project Agent Skills under `.cursor/skills/` without loading every SKILL.md. Use when the repository has multiple skills (for example Speckit), when the user mentions the skills folder, workflow stages, or which skill applies next.
disable-model-invocation: true
---

# Multi-skill directory (project)

## Instructions

This project keeps **many** skills under `.cursor/skills/`. Treat that as a **library**, not a single document.

### Discovery

1. When you need to know what exists, list `.cursor/skills/*/SKILL.md` (or read only the paths the user or rules name).
2. Prefer each skill’s YAML `description` and title to decide relevance. Do **not** open every `SKILL.md` unless the user asks for a full audit or inventory.

### Loading

1. Read **one** `SKILL.md` at a time for the **current** step of the workflow.
2. After that step is done, read the **next** skill the workflow calls for. Avoid front-loading skills for later stages.

### Speckit order (this repo)

When work follows Speckit, read and follow skills **in this order** unless the user or `.cursor/rules` say otherwise:

1. `speckit-specify`
2. `speckit-clarify`
3. `speckit-plan`
4. `speckit-tasks`
5. `speckit-analyze`
6. `speckit-checklist`
7. `speckit-implement` (implementation phase)

Other Speckit helpers (git, constitution, tasks-to-issues) apply only when the user or project rules trigger them—read those skills **when that sub-workflow starts**, not by default.

### Conflicts

If two skills disagree, prefer **the skill explicitly named by the user**, then **newer or more specific project rules**, then this file last.

## Examples

**User:** “Run Speckit plan for the auth feature.”

- Read `speckit-plan/SKILL.md` only. Do not read `speckit-tasks` or `speckit-implement` until those stages are requested.

**User:** “What skills do we have?”

- List `.cursor/skills/` directories and summarize from each `SKILL.md` frontmatter (`name`, `description`) without pasting full bodies unless asked.

## Additional resources

- For authoring new skills (structure, frontmatter, anti-patterns), use the user’s **create-skill** skill or Cursor’s create-skill guidance—not this file.
