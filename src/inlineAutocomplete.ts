import * as path from 'node:path';
import * as vscode from 'vscode';
import type { AgentId } from './types.js';
import type { VeyraDispatchEvent, VeyraSessionService } from './veyraService.js';

export type InlineAutocompleteAgent = Extract<AgentId, 'claude' | 'codex' | 'gemini'>;

export interface InlineAutocompleteOptions {
  enabled: boolean;
  agent: InlineAutocompleteAgent;
  maxContextLines: number;
  maxSuggestionChars: number;
  minPrefixChars: number;
}

export interface InlineAutocompleteRegistration {
  service: VeyraSessionService;
  workspacePath: string;
}

export interface InlineAutocompletePromptContext {
  relativePath: string;
  languageId: string;
  prefix: string;
  suffix: string;
  currentLinePrefix: string;
}

interface VeyraConfiguration {
  get<T>(section: string, defaultValue: T): T;
}

const DEFAULT_OPTIONS: InlineAutocompleteOptions = {
  enabled: false,
  agent: 'codex',
  maxContextLines: 40,
  maxSuggestionChars: 240,
  minPrefixChars: 12,
};

const INLINE_AUTOCOMPLETE_AGENTS = new Set<InlineAutocompleteAgent>(['claude', 'codex', 'gemini']);

export function registerInlineAutocompleteProvider(
  context: Pick<vscode.ExtensionContext, 'subscriptions'>,
  getRegistration: () => InlineAutocompleteRegistration | undefined,
): void {
  context.subscriptions.push(
    vscode.languages.registerInlineCompletionItemProvider(
      { scheme: 'file' },
      new VeyraInlineCompletionProvider(getRegistration),
    ),
  );
}

export function readInlineAutocompleteOptions(
  config: VeyraConfiguration = vscode.workspace.getConfiguration('veyra'),
): InlineAutocompleteOptions {
  const configuredAgent = config.get<string>('inlineAutocomplete.agent', DEFAULT_OPTIONS.agent).trim();
  const agent = INLINE_AUTOCOMPLETE_AGENTS.has(configuredAgent as InlineAutocompleteAgent)
    ? configuredAgent as InlineAutocompleteAgent
    : DEFAULT_OPTIONS.agent;

  return {
    enabled: config.get<boolean>('inlineAutocomplete.enabled', DEFAULT_OPTIONS.enabled),
    agent,
    maxContextLines: clampNumber(
      config.get<number>('inlineAutocomplete.maxContextLines', DEFAULT_OPTIONS.maxContextLines),
      5,
      200,
    ),
    maxSuggestionChars: clampNumber(
      config.get<number>('inlineAutocomplete.maxSuggestionChars', DEFAULT_OPTIONS.maxSuggestionChars),
      20,
      1000,
    ),
    minPrefixChars: clampNumber(
      config.get<number>('inlineAutocomplete.minPrefixChars', DEFAULT_OPTIONS.minPrefixChars),
      0,
      200,
    ),
  };
}

export class VeyraInlineCompletionProvider implements vscode.InlineCompletionItemProvider {
  constructor(
    private readonly getRegistration: () => InlineAutocompleteRegistration | undefined,
    private readonly getOptions: () => InlineAutocompleteOptions = readInlineAutocompleteOptions,
  ) {}

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken,
  ): Promise<vscode.InlineCompletionItem[]> {
    const options = this.getOptions();
    if (!options.enabled) return [];
    if (context.triggerKind !== vscode.InlineCompletionTriggerKind.Invoke) return [];
    if (token.isCancellationRequested) return [];
    if (document.uri.scheme !== 'file') return [];

    const registration = this.getRegistration();
    if (!registration) return [];

    const promptContext = inlineAutocompletePromptContext(document, position, registration.workspacePath, options);
    if (promptContext.currentLinePrefix.trim().length < options.minPrefixChars) return [];

    const text = buildInlineAutocompletePrompt(promptContext, options);
    let rawSuggestion = '';
    await registration.service.dispatch(
      {
        text,
        source: 'inline-autocomplete',
        cwd: registration.workspacePath,
        forcedTarget: options.agent,
        readOnly: true,
      },
      (event) => {
        if (token.isCancellationRequested) return;
        rawSuggestion += inlineAutocompleteEventText(event);
      },
    );

    if (token.isCancellationRequested) return [];
    const suggestion = sanitizeInlineSuggestion(rawSuggestion, options.maxSuggestionChars);
    return suggestion ? [{ insertText: suggestion }] : [];
  }
}

export function buildInlineAutocompletePrompt(
  context: InlineAutocompletePromptContext,
  options: Pick<InlineAutocompleteOptions, 'maxSuggestionChars'>,
): string {
  const suffix = context.suffix.length > 0 ? context.suffix : '[No suffix context]';
  return [
    '[Inline autocomplete request]',
    'You are Veyra providing a conservative VS Code inline ghost-text suggestion.',
    'Return only the text to insert at <cursor>.',
    'Do not wrap the answer in Markdown, quotes, or commentary.',
    'Do not run commands, edit files, or explain the suggestion.',
    'If the safest completion is unclear, return an empty response.',
    `Maximum suggestion length: ${options.maxSuggestionChars} characters.`,
    `File: ${context.relativePath}`,
    `Language: ${context.languageId || 'plaintext'}`,
    '',
    '[Prefix]',
    `${context.prefix}<cursor>${suffix}`,
    '[/Prefix]',
  ].join('\n');
}

export function sanitizeInlineSuggestion(raw: string, maxChars: number): string {
  let suggestion = raw.replace(/\r\n/g, '\n').trimEnd();
  suggestion = stripMarkdownFence(suggestion);
  suggestion = suggestion.replace(/^\n+/, '').trimEnd();

  if (/^\s*(sure|here(?:'s| is)|the completion|completion:|suggestion:)/i.test(suggestion)) {
    return '';
  }

  return suggestion.slice(0, maxChars).trimEnd();
}

function inlineAutocompletePromptContext(
  document: vscode.TextDocument,
  position: vscode.Position,
  workspacePath: string,
  options: Pick<InlineAutocompleteOptions, 'maxContextLines'>,
): InlineAutocompletePromptContext {
  const currentLine = document.lineAt(position.line).text;
  const currentLinePrefix = currentLine.slice(0, position.character);
  const currentLineSuffix = currentLine.slice(position.character);
  const startLine = Math.max(0, position.line - options.maxContextLines + 1);
  const endLine = Math.min(document.lineCount - 1, position.line + Math.floor(options.maxContextLines / 4));

  const prefixLines: string[] = [];
  for (let line = startLine; line <= position.line; line++) {
    const text = document.lineAt(line).text;
    prefixLines.push(line === position.line ? text.slice(0, position.character) : text);
  }

  const suffixLines: string[] = [currentLineSuffix];
  for (let line = position.line + 1; line <= endLine; line++) {
    suffixLines.push(document.lineAt(line).text);
  }

  return {
    relativePath: relativeDocumentPath(document, workspacePath),
    languageId: document.languageId,
    prefix: prefixLines.join('\n'),
    suffix: suffixLines.join('\n'),
    currentLinePrefix,
  };
}

function inlineAutocompleteEventText(event: VeyraDispatchEvent): string {
  if (event.kind !== 'chunk') return '';
  return event.chunk.type === 'text' ? event.chunk.text : '';
}

function stripMarkdownFence(raw: string): string {
  const match = raw.match(/^\s*```[^\n]*\n([\s\S]*?)\n?```\s*$/);
  return match ? match[1].trimEnd() : raw;
}

function relativeDocumentPath(document: vscode.TextDocument, workspacePath: string): string {
  const relative = path.relative(workspacePath, document.uri.fsPath).replace(/\\/g, '/');
  return relative && !relative.startsWith('..') ? relative : path.basename(document.uri.fsPath || document.fileName);
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
