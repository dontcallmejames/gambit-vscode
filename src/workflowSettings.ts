import * as vscode from 'vscode';
import type { AgentId } from './types.js';
import {
  normalizeWorkflowTemplate,
  type VeyraWorkflowPromptOptions,
} from './workflowPrompts.js';

export type AgentRoleOverrides = Partial<Record<AgentId, string>>;

export function readWorkflowPromptOptions(): VeyraWorkflowPromptOptions {
  const config = vscode.workspace.getConfiguration('veyra');
  return {
    template: normalizeWorkflowTemplate(config.get<string>('workflow.template', 'none')),
  };
}

export function readAgentRoleOverrides(): AgentRoleOverrides {
  const config = vscode.workspace.getConfiguration('veyra');
  return {
    claude: trimmedOrUndefined(config.get<string>('agentRoles.claude', '')),
    codex: trimmedOrUndefined(config.get<string>('agentRoles.codex', '')),
    gemini: trimmedOrUndefined(config.get<string>('agentRoles.gemini', '')),
  };
}

function trimmedOrUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
