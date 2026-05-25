# Veyra GitHub/CI Workflow Awareness v0.1 Design

## Goal

GitHub/CI Workflow Awareness v0.1 gives users a local-first way to ask Veyra what should happen next around branch state, dirty files, PR readiness, and CI follow-up.

## User Flow

1. The user runs `Veyra: Summarize Git Status`.
2. Veyra runs only read-only local Git commands:
   - `git rev-parse --is-inside-work-tree`
   - `git status --short --branch`
   - `git remote -v`
   - `git log -1 --oneline --decorate`
3. Veyra formats a `[Git workflow context]` block with branch/upstream state, sanitized remotes, dirty-tree summary, changed files, and the latest commit.
4. Veyra sends the block into the docked Veyra view as a read-only `/review` prompt.
5. Agents may suggest GitHub PR and CI follow-up, but must not claim live remote or CI state unless the user provides it.

## Guardrails

- No hidden network automation.
- No automatic pushes, pulls, merges, rebases, resets, cleans, PR creation, or CI commands.
- No GitHub CLI or API calls in this slice.
- Remote URLs are sanitized to remove embedded credentials before they reach Veyra.
- Non-Git workspaces show a friendly message and do not dispatch.

## Testing

- Unit tests cover command collection, read-only command selection, remote credential redaction, dirty-tree summarization, prompt formatting, docked-view routing, and non-Git workspaces.
- Extension and manifest tests cover command registration and command-palette contribution.
- Documentation tests keep the README and smoke checklist aligned with the no-network/no-push guardrails.
