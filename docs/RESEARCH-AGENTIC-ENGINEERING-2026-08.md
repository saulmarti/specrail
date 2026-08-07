# Agentic software engineering research — August 2026

## Scope

This review compares Robert C. Martin and Justin Martin's 2026 Agentic Discipline series with current guidance and evidence from OpenAI, Anthropic, DORA/Google, METR, GitHub Spec Kit, and Thoughtworks. The goal is not to copy every pattern, but to identify improvements that can raise AI Flow's delivered quality or reduce total cycle time.

## Executive conclusion

The strongest sources converge on six ideas:

1. Humans should own intent, product judgment, consequential decisions, and final acceptance; agents should execute within explicit evidence and permission boundaries.
2. The specification—not generated code—should be the durable source of truth.
3. Deterministic software should enforce state, tests, architecture rules, evidence, retry limits, and permissions; agents should handle ambiguous reasoning and creation.
4. Long-running work should be incremental, isolated, observable, and recoverable from durable artifacts rather than chat history.
5. Independent evaluation is more trustworthy than self-evaluation, particularly for subjective UI quality.
6. Agent workflows must be evaluated with real tasks and measured outcomes. Perceived speed and benchmark scores are not reliable substitutes for cycle time, rework, stability, and user value.

AI Flow already implements much of this foundation. The next gains are more likely to come from better evaluation and feedback loops than from adding more agents.

## Uncle Bob's latest agent workflow

The February–June 2026 Agentic Discipline series progresses from disciplined testing and refactoring to a six-role Swarm Forge pipeline.

### Higher-level source

Episode 2 argues that generated code is no longer the human-controlled source. A higher-level source document must describe the intended system strongly enough to generate implementations across languages and platforms. AI Flow's approved Markdown specification and approval hash directly support this model.

### Acceptance and UI procedure originate with the Specifier

In Episode 6, the Specifier creates Gherkin acceptance tests and a detailed manual UI-driven QA procedure. QA later automates and executes that original procedure. This prevents QA from quietly redefining success after implementation.

### Layered quality pipeline

The demonstrated pipeline is:

- Specifier: acceptance criteria, Gherkin, and manual UI QA mission.
- Coder: production code, unit tests, and acceptance harness.
- Cleaner: DRY and CRAP quality gates.
- Architect: dependency structure and property-based tests.
- Hardener: language-level and Gherkin-level mutation testing.
- QA: drives the public UI using the original QA mission.

Each role operates in an isolated Git worktree. The value of the pattern is not the number of personas; it is the separation of responsibilities and independent failure detection.

### Implication for AI Flow

Do not add Cleaner, Architect, and Hardener as always-on agents. Preserve the current small role set and invoke these disciplines as modes selected by risk. However, add two missing invariants:

1. The Product Specifier must author an immutable QA mission before approval.
2. High-risk tasks should select property and mutation testing profiles deterministically.

## Findings from other authoritative sources

### OpenAI: build a legible harness, not a bigger prompt

OpenAI's 2026 harness engineering report describes humans as steering while agents execute. Their main bottleneck became human attention, and their response was to make the repository, UI, logs, metrics, and architecture mechanically legible to Codex. They rejected a giant AGENTS.md in favor of a map, targeted documentation, custom linters, structural tests, and recurring cleanup against golden principles.

Relevant consequences for AI Flow:

- Keep global skills short and load specialist knowledge on demand.
- Add project-level golden principles that are enforced mechanically rather than repeated in prompts.
- For operational or performance work, treat logs, traces, and metrics as mandatory evidence, just as frontend work requires screenshots.
- Add recurring, focused entropy cleanup instead of large cleanup projects.

OpenAI's Symphony work further validates tasks as the control plane, isolated workspaces per task, dependency DAGs, and decoupling work from individual chat sessions. AI Flow already follows this architecture through Markdown tasks, leases, dependencies, and worktrees.

### OpenAI: corrections should become evals

The 2026 Tax AI case study describes a three-part improvement loop: expert corrections expose failures, traces make those failures understandable, and reviewed patterns become targeted plus regression evals for Codex. Ambiguous cases return to people rather than being forced through automation.

AI Flow should record each meaningful user rejection, QA failure, and customer failure as a candidate eval. Repeated failure patterns should become permanent regression scenarios for the relevant skill or workflow rule.

### Anthropic: separate generator and evaluator

Anthropic's March 2026 long-running application harness found that agents tend to praise their own work, especially subjective design. A separate skeptical evaluator substantially improved output. The same research also found that the richer multi-agent harness produced much better output but cost over twenty times as much in one experiment. Anthropic therefore recommends removing components one at a time and retaining only those that measurably improve outcomes.

For AI Flow:

- UI proposals should be evaluated by a separate role or fresh evaluator context, not only by the UX/UI Designer that generated them.
- Use the Technical Reviewer in a visual-evaluator mode rather than introducing another permanent agent.
- Activate independent evaluation for material UI redesigns, not trivial text or asset changes.
- Maintain an ablation/eval suite so scaffolding can be removed when model capabilities improve.

### Anthropic: context is finite and tools are agent interfaces

Anthropic's context engineering and tool-design guidance recommends the smallest high-signal context, just-in-time retrieval, clear non-overlapping tools, pagination/filtering, and testing tools with agents. AI Flow 0.3's progressive budgets are aligned with this. CodeGraph should remain the direct MCP context source rather than being wrapped by custom tools.

### Anthropic and OpenAI: bounded autonomy and human control

Both organizations recommend explicit exit conditions, limits on retries/actions, and human escalation for repeated failures or consequential actions. Anthropic also frames trust across model, harness, tools, and environment; a capable model can still fail under overly permissive tooling or a weak harness.

AI Flow currently blocks consequential product decisions, but should also add:

- deterministic repair-attempt budgets per phase;
- escalation after repeated test, build, visual, or tool failures;
- phase-specific permission profiles, such as read-only refinement and workspace-write implementation;
- explicit protection for secrets, network access, migrations, destructive commands, and external delivery.

### DORA: AI amplifies the delivery system

DORA's 2025 research found AI adoption associated with higher throughput and product performance, but also with lower delivery stability. Its central conclusion is that AI amplifies existing strengths and weaknesses; testing, version control, feedback loops, platforms, and value-stream discipline determine whether speed becomes value or downstream instability.

AI Flow should optimize for accepted, stable delivery rather than raw agent output. Useful measurements include total cycle time, refinement cycles, implementation retries, QA/customer rejections, escaped failures, and time spent by the user reviewing.

### METR: perceived speed can be wrong

METR's early-2025 randomized trial found experienced open-source developers took 19% longer with the tested AI tools despite believing they were faster. A February 2026 update saw weak evidence of later speedups but had major selection and measurement limitations. The durable lesson is not that agents are slow; it is that subjective estimates are unreliable.

AI Flow should measure actual task outcomes locally before deciding that a new agent, gate, or context policy improves speed.

### GitHub Spec Kit: governance should be on demand

Spec Kit separates project governance from ambient agent instructions. Its constitution is loaded at specification, planning, analysis, and implementation gates rather than injected into every request. It also offers clarification, checklist, and cross-artifact consistency gates.

AI Flow can adopt a small, versioned `.ai/project/constitution.md` containing only durable, enforceable principles. Skills remain operating instructions; the constitution is project governance read at defined gates. This avoids duplicating a large AGENTS.md and wasting context.

## Recommended roadmap

### Priority 0 — highest expected return

#### 1. Failure-to-eval loop

On every user refinement, final rejection, QA rejection, or customer rejection, save a structured candidate containing the original request, approved spec, relevant evidence, failure reason, and corrected expectation. Cluster repeated failures and promote them into regression evals.

Expected effect: very high long-term quality, medium long-term speed, low runtime token cost.

#### 2. Immutable QA mission

The Product Specifier writes a task-specific public-interface QA mission before specification approval. QA executes that same version after implementation. A hash links the approved mission to the final report.

Expected effect: high quality and fewer disputes about whether the feature is really complete.

#### 3. Bounded repair loops

Define phase budgets such as two automatic visual regenerations, three test-fix attempts, and one full-index recovery. Exceeding a budget creates a native human escalation with evidence and recommendations.

Expected effect: high speed by preventing endless loops; high predictability.

#### 4. Local delivery metrics

Record timestamps and counts, not model reasoning: phase duration, agent/tool attempts, context expansions, user review time, rejections, retries, and final delivery outcome. Keep data in `.ai/runtime/metrics` and provide per-task summaries.

Expected effect: essential for deciding whether later workflow changes improve speed or merely feel faster.

#### 5. Independent evaluator mode

For medium/large UI work, use a fresh Technical Reviewer context in `visual-evaluator` mode after Image Gen and before user review. For trivial UI changes, retain the cheaper current path.

Expected effect: high visual quality; moderate latency/token cost only where justified.

### Priority 1 — strong engineering reinforcement

#### 6. Versioned project constitution and structural checks

Add durable principles such as dependency direction, test policy, security boundaries, design-system invariants, and maximum file/module complexity. Read them on demand and enforce the mechanical subset with tests or linters.

#### 7. Risk-based property and mutation testing

Select hardening from task risk and affected domain. Do not run mutation testing for a copy change; require it for critical business rules, parsers, authorization, financial calculations, and complex state transitions.

#### 8. Operational evidence profiles

For performance, reliability, and asynchronous jobs, capture real logs, traces, metrics, latency thresholds, and failure behavior from the task worktree environment.

#### 9. Incremental vertical slices

For large work, require approved independently verifiable slices. Each session leaves a clean checkpoint, concise handoff, and passing baseline before another slice begins.

### Priority 2 — maintenance of the harness itself

#### 10. Recurring entropy control

Run focused checks for violations of golden principles and create small cleanup tasks. Avoid a permanent Cleaner agent and avoid broad autonomous refactors.

#### 11. Harness evals and ablation

Maintain representative tasks for natural activation, refinement, UI design, backend behavior, architecture, blocked execution, cross-chat continuation, and final delivery. On model or skill upgrades, test whether each role/gate remains load-bearing; remove scaffolding that no longer improves results.

#### 12. Phase permission profiles

Map each phase to the minimum required permissions. Product/refinement and most reviewers are read-only. Builder gets workspace write. Destructive migrations, network publication, secrets, and delivery require explicit approval.

## What not to add

- Do not add more permanent agents solely to mirror every Swarm Forge role.
- Do not run mutation or property tests for every task.
- Do not insert the entire project constitution or knowledge base into every prompt.
- Do not wrap CodeGraph, browser, Image Gen, or native Codex tools without a measured failure that requires it.
- Do not optimize for number of commits, lines, tool calls, or agent runtime without stability and user-value measures.

## Suggested next release

A focused AI Flow 0.4 should implement:

1. failure-to-eval capture;
2. immutable QA mission;
3. bounded repair/escalation budgets;
4. local task metrics;
5. independent visual evaluator mode for material UI work;
6. a minimal versioned project constitution with mechanical checks.

Property/mutation profiles and observability evidence can follow once the core feedback loop is measured on real tasks.

## Primary sources reviewed

- Robert C. Martin and Justin Martin, Clean AI: Agentic Discipline Episodes 1–6, February–June 2026.
- OpenAI, Harness engineering: leveraging Codex in an agent-first world, February 2026.
- OpenAI, An open-source spec for Codex orchestration: Symphony, April 2026.
- OpenAI and Thrive Holdings, Building self-improving tax agents with Codex, May 2026.
- OpenAI, A practical guide to building agents.
- Anthropic, Harness design for long-running application development, March 2026.
- Anthropic, Demystifying evals for AI agents, January 2026.
- Anthropic, Effective context engineering for AI agents, September 2025.
- Anthropic, Writing effective tools for agents, September 2025.
- Anthropic, Trustworthy agents in practice, April 2026.
- Google DORA, State of AI-assisted Software Development 2025 and follow-up guidance.
- METR, developer productivity studies, July 2025 and February 2026 update.
- GitHub Spec Kit documentation and Agentic SDD reference, 2026.
- Thoughtworks, Looking Glass 2026 and AI-native engineering guidance.
