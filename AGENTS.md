# Repository Agent Instructions

These instructions govern all coding agents working in this repository.

## Canonical sources

Read these files before changing architecture or runtime behavior:

1. `CORE.md`
2. `ELORA.md`
3. `NEXORA.md`
4. `ROADMAP.md`
5. `docs/STATUS.md`
6. `agent-runtime/docs/core-alpha-implementation-plan.md`

When older documents conflict with these files, the files above control.

## Current objective

The current objective is to complete the CORE Alpha Sovereign Command Loop:

```text
intent → context → authority → execution/delegation → validation → receipt → candidate memory → Elora synthesis
```

Do not add unrelated product scope until the active milestone is accepted.

## Implementation rules

- Keep execution logic in `agent-runtime/`, not the React UI.
- Keep Elora as the single user-facing executive.
- Route technical execution through bounded Nexora work orders when delegation is useful.
- Prefer real, validated execution over plans, previews, review packets, or proposed patches.
- Preserve the configured workspace-root, symlink, path-traversal, secret, and private-data protections.
- Ordinary local reads, writes, commands, tests, builds, validation, internal artifacts, and work orders should not receive redundant approval gates.
- Escalate only genuine authority boundaries: RMT, private-data-sensitive actions, irreversible destruction, external/public commitments, unsupported capability claims, or missing setup.
- Never claim a provider action, command, file change, validation, or receipt occurred when it did not.
- New inferred decisions must be candidate memory until reviewed.
- Do not create another receipt family. Extend or unify the canonical receipt envelope.
- Do not build a second approval system beside the OpenAI Agents SDK interruption/resume flow.
- Avoid hardcoded natural-language proof phrases or one-off demo routes in production orchestration.

## Change discipline

Each pull request should:

- address one bounded milestone or defect;
- identify the governing acceptance condition;
- preserve current working behavior outside its scope;
- include or update deterministic validation;
- run relevant typecheck, test, build, and smoke commands;
- report commands that could not run and why;
- avoid dependency upgrades unless required by the task;
- avoid reintroducing archived `legacy/` code into active runtime paths.

## Required completion report

Every coding task must report:

- summary of the implemented result;
- files changed;
- commands run;
- validation results;
- known limitations or blockers;
- rollback guidance when applicable;
- the next roadmap item unlocked by the change.

## Current exclusions

Do not expand the current Alpha milestone into:

- voice or telephony expansion;
- multiple visible persona chats;
- marketplace or public distribution;
- enterprise tenancy, SSO, RBAC, or administration;
- broad third-party integrations;
- autonomous external sending or publication;
- payment, banking, purchasing, or subscription execution;
- claims of AGI, sentience, or consciousness.
