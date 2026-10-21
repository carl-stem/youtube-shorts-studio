# CLAUDE.md

## Working rules

- **Delegate substantial work to sub-agents.** Dispatch a sub-agent via the Agent tool for multi-file code changes, feature work, broad research or codebase exploration, debugging, and reviews. Handle small, quick tasks directly: single-file or doc edits, reading a few files, git operations (status, commit, push), and running a single check. When in doubt, delegate.

## Strict Execution Guardrails
- **Grounding over Guessing:** Never guess API endpoints, library functions, or database schemas. If unsure, grep the codebase or ask for clarification before writing code.
- **Minimal Blast Radius:** Modify only what is strictly necessary to solve the issue. Do not reformat unrelated code, introduce new dependencies, or refactor working modules unless explicitly instructed.
- **Preserve Existing Patterns:** Mirror the error-handling patterns, typing style, and directory conventions already present in the repository.

## Testing & Validation Rules
- **Verify Before Finishing:** Never consider a task done until you have executed relevant tests and static checks (`npm test`, `pytest`, `cargo test`, etc.).
- **Fix Failures Silently:** If a test or linter fails after your changes, inspect the failure, fix the root cause, and re-run. Do not ask for user intervention unless blocked by external state or missing credentials.
- **Regression Protection:** When fixing a bug, write a failing unit/integration test demonstrating the bug before implementing the fix.

## Response & Formatting Directives
- **Zero Fluff:** Lead directly with code, command output, or core answers. Omit conversational filler ("Certainly!", "I have updated the code", "Let me know if you need anything else").
- **Targeted Edits:** When writing instructions or diffs, provide minimal, targeted replacements with clear file paths rather than dumping 500-line files.
- **Explain "Why", Not "What":** If commentary is needed, document non-obvious engineering decisions and trade-offs rather than narrating what each line of code does.

## Stack & Dependency Policy
- **No New Dependencies Without Approval:** Solve problems using the standard library or currently installed dependencies. If a new package is mandatory, explain why and request explicit confirmation before adding it.
- **Typing & Strict Mode:** Treat types as documentation. Avoid `any`, unchecked type assertions (`as unknown as T`), or silencing linter rules (`@ts-ignore`, `# noqa`) without an inline explanation of why it is safe.

## Git Workflow
- **Conventional Commits:** Format all commit messages as: `<type>(<scope>): <short imperative summary>`.
  - Types: `feat`, `fix`, `refactor`, `test`, `chore`, `docs`.
  - Keep the subject line under 72 characters and imperative (e.g., `fix(auth): handle expired refresh tokens`).
- **Never Commit Secrets:** Reject any staged files containing `.env`, keys, tokens, or local credentials.
