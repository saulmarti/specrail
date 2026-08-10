# `specrail doctor --fix`

`doctor` diagnoses the local delivery environment. `doctor --fix` produces a repair plan; it does **not** immediately mutate the machine.

```bash
specrail doctor
specrail doctor --fix
```

The plan separates:

- **safe automatic fixes** — local and reversible changes owned by SpecRail, such as restoring the `specrail` launcher, installed SpecRail skills, the compact Codex activation block, native question UI, or repairing repository-local CodeGraph health; a full rebuild is only attempted during this explicit Doctor recovery, never during normal task routing;
- **manual/external fixes** — Node, Git, installing CodeGraph, or host-specific MCP configuration.

After the native user gate approves safe repairs, the agent may execute:

```bash
specrail doctor --fix --apply safe
```

SpecRail never silently installs system packages, rewrites an unknown MCP schema, installs host plugins, or modifies external tooling. `ai-flow` is checked only as an optional compatibility alias; `specrail` is the primary launcher.
