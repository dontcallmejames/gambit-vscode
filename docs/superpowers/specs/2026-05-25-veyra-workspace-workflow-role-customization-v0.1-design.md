# Veyra Workspace Workflow Role Customization v0.1 Design

## Goal

Veyra should let a workspace tune recurring workflow guidance without source edits or long repeated prompts. The first useful slice uses existing VS Code settings:

- `veyra.workflow.template`
- `veyra.agentRoles.claude`
- `veyra.agentRoles.codex`
- `veyra.agentRoles.gemini`

## Scope

The v0.1 surface is settings-driven. There is no new in-panel editor, wizard, or config file format.

`veyra.workflow.template` selects one prompt lens for `/review`, `/debate`, `/consensus`, `/implement`, and the matching Language Model workflow entries. Supported values are:

- `none`
- `architecture-review`
- `security-review`
- `test-improvement`
- `refactor-plan`
- `implementation-with-review`

Each non-empty `veyra.agentRoles.*` setting is trimmed and appended only to that agent's Veyra role preamble. Claude, Codex, and Gemini keep their default model-strength guidance; workspace role text narrows or emphasizes it.

## Data Flow

Panel, native chat, and Language Model workflow entry points call `veyraWorkflowPrompt(...)` with `readWorkflowPromptOptions()`. That keeps workflow templates consistent across `/review`, `/debate`, `/consensus`, and `/implement`.

Runtime session creation and configuration refresh call `readAgentRoleOverrides()`. `VeyraSessionService` injects the matching override into the composed prompt for each targeted agent immediately before dispatch. This makes the role guidance visible to actual agent prompts while avoiding duplicate text in the user-facing workflow wrapper.

## Guardrails

Read-only workflows stay read-only. Workspace role text does not override `readOnly` dispatch flags, read-only prompt policy, pending-change review, or checkpoint behavior.

Unknown workflow template values normalize to `none`. Empty or whitespace-only agent role settings are ignored.

## Verification

Focused tests should cover:

- settings parsing and normalization
- panel workflow template routing
- native chat workflow template routing
- Language Model workflow template routing
- runtime reading of agent role settings
- actual composed agent prompts containing the workflow marker, template block, and matching workspace role customization for all four workflow commands

Full verification remains `npm run verify`.
