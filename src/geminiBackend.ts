import * as vscode from 'vscode';

export type GeminiBackend = 'auto' | 'antigravity' | 'gemini';

export function getGeminiBackend(): GeminiBackend {
  try {
    const value = vscode.workspace.getConfiguration('veyra').get<string>('gemini.backend', 'auto');
    return value === 'antigravity' || value === 'gemini' ? value : 'auto';
  } catch {
    return 'auto';
  }
}
