import { describe, expect, it, vi } from 'vitest';

const vscodeMocks = vi.hoisted(() => ({
  registerInlineCompletionItemProvider: vi.fn((_selector: unknown, _provider: unknown) => ({ dispose: vi.fn() })),
}));

vi.mock('vscode', () => ({
  InlineCompletionTriggerKind: {
    Automatic: 0,
    Invoke: 1,
  },
  languages: {
    registerInlineCompletionItemProvider: vscodeMocks.registerInlineCompletionItemProvider,
  },
  workspace: {
    getConfiguration: vi.fn(() => ({ get: vi.fn((_key: string, dflt: unknown) => dflt) })),
  },
}));

import {
  VeyraInlineCompletionProvider,
  buildInlineAutocompletePrompt,
  readInlineAutocompleteOptions,
  registerInlineAutocompleteProvider,
  sanitizeInlineSuggestion,
} from '../src/inlineAutocomplete.js';

function configuration(values: Record<string, unknown>) {
  return {
    get: vi.fn(<T>(key: string, dflt: T): T =>
      Object.prototype.hasOwnProperty.call(values, key) ? values[key] as T : dflt
    ),
  };
}

function fakeDocument(lines: string[], languageId = 'typescript') {
  return {
    uri: {
      scheme: 'file',
      fsPath: '/workspace/src/example.ts',
    },
    fileName: '/workspace/src/example.ts',
    languageId,
    lineCount: lines.length,
    lineAt: (line: number) => ({ text: lines[line] }),
  } as never;
}

describe('inline autocomplete', () => {
  it('defaults to disabled manual-only Codex suggestions with tight bounds', () => {
    const options = readInlineAutocompleteOptions(configuration({}));

    expect(options).toMatchObject({
      enabled: false,
      agent: 'codex',
      maxContextLines: 40,
      maxSuggestionChars: 240,
      minPrefixChars: 12,
    });
  });

  it('normalizes configured agent and numeric bounds conservatively', () => {
    const options = readInlineAutocompleteOptions(configuration({
      'inlineAutocomplete.enabled': true,
      'inlineAutocomplete.agent': 'gemini',
      'inlineAutocomplete.maxContextLines': 500,
      'inlineAutocomplete.maxSuggestionChars': 5000,
      'inlineAutocomplete.minPrefixChars': -10,
    }));

    expect(options).toEqual({
      enabled: true,
      agent: 'gemini',
      maxContextLines: 200,
      maxSuggestionChars: 1000,
      minPrefixChars: 0,
    });
  });

  it('builds a constrained prompt for a short insert-only editor suggestion', () => {
    const prompt = buildInlineAutocompletePrompt({
      relativePath: 'src/example.ts',
      languageId: 'typescript',
      prefix: 'export function add(a: number, b: number) {\n  return a',
      suffix: ';\n}\n',
      currentLinePrefix: '  return a',
    }, {
      maxSuggestionChars: 80,
    });

    expect(prompt).toContain('[Inline autocomplete request]');
    expect(prompt).toContain('File: src/example.ts');
    expect(prompt).toContain('Language: typescript');
    expect(prompt).toContain('Return only the text to insert at <cursor>.');
    expect(prompt).toContain('Do not wrap the answer in Markdown');
    expect(prompt).toContain('Do not run commands, edit files, or explain');
    expect(prompt).toContain('Maximum suggestion length: 80 characters.');
    expect(prompt).toContain('return a<cursor>;');
  });

  it('sanitizes provider text down to a short ghost-text suffix', () => {
    expect(sanitizeInlineSuggestion('```ts\n + b;\n```', 20)).toBe(' + b;');
    expect(sanitizeInlineSuggestion('Sure, here is the code:\n + b;', 20)).toBe('');
    expect(sanitizeInlineSuggestion(' + b; // trailing explanation about many things', 8)).toBe(' + b; //');
  });

  it('does not compete with automatic inline suggestions', async () => {
    const service = { dispatch: vi.fn() };
    const provider = new VeyraInlineCompletionProvider(
      () => ({ workspacePath: '/workspace', service } as never),
      () => ({
        enabled: true,
        agent: 'codex',
        maxContextLines: 40,
        maxSuggestionChars: 120,
        minPrefixChars: 0,
      }),
    );

    const result = await provider.provideInlineCompletionItems(
      fakeDocument(['const value = 1']),
      { line: 0, character: 'const value = 1'.length } as never,
      { triggerKind: 0 } as never,
      { isCancellationRequested: false } as never,
    );

    expect(result).toEqual([]);
    expect(service.dispatch).not.toHaveBeenCalled();
  });

  it('dispatches manual suggestions through a read-only direct Veyra agent request', async () => {
    const service = {
      dispatch: vi.fn(async (_request: unknown, emit: (event: unknown) => void) => {
        emit({
          kind: 'chunk',
          agentId: 'codex',
          messageId: 'message-1',
          chunk: { type: 'text', text: ' + 1' },
        });
      }),
    };
    const provider = new VeyraInlineCompletionProvider(
      () => ({ workspacePath: '/workspace', service } as never),
      () => ({
        enabled: true,
        agent: 'codex',
        maxContextLines: 40,
        maxSuggestionChars: 120,
        minPrefixChars: 0,
      }),
    );

    const result = await provider.provideInlineCompletionItems(
      fakeDocument(['const total = count']),
      { line: 0, character: 'const total = count'.length } as never,
      { triggerKind: 1 } as never,
      { isCancellationRequested: false } as never,
    ) as Array<{ insertText: string }>;

    expect(service.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'inline-autocomplete',
        forcedTarget: 'codex',
        readOnly: true,
        cwd: '/workspace',
        text: expect.stringContaining('[Inline autocomplete request]'),
      }),
      expect.any(Function),
    );
    expect(result).toHaveLength(1);
    expect(result[0].insertText).toBe(' + 1');
  });

  it('registers the file-scheme provider with extension subscriptions', () => {
    const context = { subscriptions: [] as Array<{ dispose(): void }> };

    registerInlineAutocompleteProvider(context as never, () => undefined);

    expect(vscodeMocks.registerInlineCompletionItemProvider).toHaveBeenCalledWith(
      { scheme: 'file' },
      expect.any(VeyraInlineCompletionProvider),
    );
    expect(context.subscriptions).toHaveLength(1);
  });
});
