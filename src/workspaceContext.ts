import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AttachedFile } from './fileMentions.js';

const execFileAsync = promisify(execFile);

export interface WorkspaceContextOptions {
  maxFiles: number;
  maxSnippetLines: number;
  maxFileBytes: number;
}

export interface WorkspaceInventoryFile {
  path: string;
  size: number;
  language: string;
  metadata: boolean;
}

export interface WorkspaceInventory {
  files: WorkspaceInventoryFile[];
}

export interface WorkspaceContextSelection {
  path: string;
  score: number;
  reasons: string[];
  language: string;
  startLine: number;
  endLine: number;
}

export interface WorkspaceContextQuality {
  method: 'local-lexical';
  inventoryFileCount: number;
  candidateFileCount: number;
  matchedFileCount: number;
  selectedFileCount: number;
  omittedMatchedFileCount: number;
  queryTerms: string[];
  maxFiles: number;
  maxSnippetLines: number;
  maxFileBytes: number;
  embeddingReadiness: 'inactive';
  warnings: string[];
}

export interface WorkspaceContextResult {
  enabled: boolean;
  query: string;
  block: string;
  attached: AttachedFile[];
  selected: WorkspaceContextSelection[];
  diagnostics: string[];
  quality: WorkspaceContextQuality;
}

export interface WorkspaceContextMention {
  enabled: boolean;
  remainingText: string;
}

const DEFAULT_EXCLUDED_DIR_NAMES = new Set([
  '.git',
  'node_modules',
  'dist',
]);

const DEFAULT_EXCLUDED_DIR_PATHS = new Set([
  '.vscode/veyra',
]);

const SECRET_PRONE_FILE_NAMES = new Set([
  '.env',
  '.npmrc',
  '.pypirc',
  '.netrc',
  'id_dsa',
  'id_ecdsa',
  'id_ed25519',
  'id_rsa',
  'secrets.json',
]);

const SECRET_PRONE_EXTENSIONS = new Set([
  '.key',
  '.pem',
  '.p12',
  '.pfx',
]);

const METADATA_FILES = new Set([
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'tsconfig.json',
  'jsconfig.json',
  'vite.config.ts',
  'vitest.config.ts',
  'pyproject.toml',
  'requirements.txt',
  'Cargo.toml',
  'go.mod',
  'README.md',
]);

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'for',
  'from',
  'how',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'should',
  'the',
  'this',
  'to',
  'where',
  'with',
]);

const TEST_QUERY_TERMS = new Set([
  'coverage',
  'regression',
  'spec',
  'specs',
  'test',
  'tests',
  'testing',
]);

const CONTENT_READ_CONCURRENCY = 16;
const GIT_COMMAND_MAX_BUFFER_BYTES = 50 * 1024 * 1024;
const WORKSPACE_CONTEXT_MENTION_PATTERN = /(^|[\s([{<`])@codebase(?=$|[^\w./-])([,:;]?)/gi;

export function parseWorkspaceContextMention(input: string): WorkspaceContextMention {
  let enabled = false;
  const remainingText = input
    .replace(WORKSPACE_CONTEXT_MENTION_PATTERN, (_match, prefix: string) => {
      enabled = true;
      return prefix;
    })
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\r?\n/g, '\n')
    .trim();
  return { enabled, remainingText };
}

export class WorkspaceContextProvider {
  private inventory: WorkspaceInventory | null = null;
  private workspaceRealPath: string | null = null;
  private readonly options: WorkspaceContextOptions;

  constructor(
    private readonly workspacePath: string,
    options: WorkspaceContextOptions,
  ) {
    this.options = normalizeOptions(options);
  }

  invalidate(): void {
    this.inventory = null;
  }

  async retrieve(query: string): Promise<WorkspaceContextResult> {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      return emptyWorkspaceContextResult(true, normalizedQuery, ['No query text remained after @codebase.']);
    }

    const inventory = await this.getInventory();
    const terms = tokenize(normalizedQuery);
    if (terms.length === 0) {
      return emptyWorkspaceContextResult(true, normalizedQuery, ['No searchable query terms found.']);
    }

    const workspaceRealPath = await this.getWorkspaceRealPath();
    const candidateFiles = await candidateFilesForTerms(inventory.files, this.workspacePath, terms);
    const candidates = await mapWithConcurrency(candidateFiles, CONTENT_READ_CONCURRENCY, async (file) => {
      const content = await readTextFile(
        path.join(this.workspacePath, file.path),
        this.options.maxFileBytes,
        workspaceRealPath,
      );
      if (content === null) return null;
      const scored = scoreFile(file, content, terms);
      if (scored.score <= 0) return null;
      const snippet = extractSnippet(content, terms, this.options.maxSnippetLines);
      return {
        file,
        score: scored.score,
        reasons: scored.reasons,
        snippet,
      };
    });

    const matched = candidates
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)
      .sort((a, b) => b.score - a.score || a.file.path.localeCompare(b.file.path));
    const selected = matched
      .slice(0, this.options.maxFiles);
    const quality = createWorkspaceContextQuality({
      inventoryFileCount: inventory.files.length,
      candidateFileCount: candidateFiles.length,
      matchedFileCount: matched.length,
      selectedFileCount: selected.length,
      queryTerms: terms,
      options: this.options,
    });

    if (selected.length === 0) {
      return emptyWorkspaceContextResult(true, normalizedQuery, [
        'No workspace files matched @codebase query.',
        'Lexical retrieval may miss files that use different names for the same concept; attach known files with @file or refine @codebase query terms.',
      ], quality);
    }

    const selections = selected.map((entry): WorkspaceContextSelection => ({
      path: entry.file.path,
      score: entry.score,
      reasons: entry.reasons,
      language: entry.file.language,
      startLine: entry.snippet.startLine,
      endLine: entry.snippet.endLine,
    }));
    const attached = selections.map((selection): AttachedFile => ({
      path: selection.path,
      lines: selection.endLine - selection.startLine + 1,
      truncated: selected.find((entry) => entry.file.path === selection.path)?.snippet.truncated ?? false,
    }));

    return {
      enabled: true,
      query: normalizedQuery,
      block: formatWorkspaceContextBlock(normalizedQuery, selected, quality),
      attached,
      selected: selections,
      diagnostics: [],
      quality,
    };
  }

  private async getInventory(): Promise<WorkspaceInventory> {
    this.inventory ??= await buildWorkspaceInventory(this.workspacePath);
    return this.inventory;
  }

  private async getWorkspaceRealPath(): Promise<string> {
    this.workspaceRealPath ??= await fs.realpath(this.workspacePath);
    return this.workspaceRealPath;
  }
}

async function candidateFilesForTerms(
  files: WorkspaceInventoryFile[],
  workspacePath: string,
  terms: string[],
): Promise<WorkspaceInventoryFile[]> {
  const contentMatchedPaths = await listContentMatchedFiles(workspacePath, terms);
  if (contentMatchedPaths === null) return files;

  return files.filter((file) =>
    scoreFilePath(file, terms) > 0 || contentMatchedPaths.has(file.path)
  );
}

export async function buildWorkspaceInventory(workspacePath: string): Promise<WorkspaceInventory> {
  const filePaths = await listWorkspaceFiles(workspacePath);
  const workspaceRealPath = await fs.realpath(workspacePath);
  const files: WorkspaceInventoryFile[] = [];
  for (const filePath of filePaths) {
    try {
      const absolutePath = path.join(workspacePath, filePath);
      const stat = await safeWorkspaceFileStat(absolutePath, workspaceRealPath);
      if (stat === null) continue;
      files.push({
        path: normalizePath(filePath),
        size: stat.size,
        language: inferLanguage(filePath),
        metadata: METADATA_FILES.has(path.basename(filePath)) || METADATA_FILES.has(normalizePath(filePath)),
      });
    } catch {
      // File disappeared while inventory was being built.
    }
  }
  return { files: files.sort((a, b) => a.path.localeCompare(b.path)) };
}

async function listWorkspaceFiles(workspacePath: string): Promise<string[]> {
  const gitFiles = await listGitFiles(workspacePath);
  if (gitFiles !== null) {
    return gitFiles.filter((file) => !isExcludedPath(file)).sort((a, b) => a.localeCompare(b));
  }

  const files = new Set<string>();
  for (const file of await listFilesRecursively(workspacePath, workspacePath)) {
    files.add(file);
  }
  return [...files].filter((file) => !isExcludedPath(file)).sort((a, b) => a.localeCompare(b));
}

async function listContentMatchedFiles(workspacePath: string, terms: string[]): Promise<Set<string> | null> {
  if (terms.length === 0) return new Set();
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['grep', '--untracked', '-z', '-l', '-I', '-i', '-F', ...terms.flatMap((term) => ['-e', term]), '--', '.'],
      { cwd: workspacePath, windowsHide: true, timeout: 10_000, maxBuffer: GIT_COMMAND_MAX_BUFFER_BYTES },
    );
    return new Set(parseNulSeparatedPaths(String(stdout)).filter((file) => !isExcludedPath(file)));
  } catch (err) {
    if (commandExitCode(err) === 1) return new Set();
    return null;
  }
}

async function listGitFiles(workspacePath: string): Promise<string[] | null> {
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      { cwd: workspacePath, windowsHide: true, timeout: 10_000, maxBuffer: GIT_COMMAND_MAX_BUFFER_BYTES },
    );
    return String(stdout)
      .split('\0')
      .map((file) => normalizePath(file.trim()))
      .filter((file) => file.length > 0 && !isExcludedPath(file));
  } catch {
    return null;
  }
}

async function listFilesRecursively(root: string, current: string): Promise<string[]> {
  let entries: Array<import('node:fs').Dirent>;
  try {
    entries = await fs.readdir(current, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(current, entry.name);
    const relative = normalizePath(path.relative(root, absolute));
    if (entry.isDirectory()) {
      if (isExcludedPath(relative)) continue;
      files.push(...await listFilesRecursively(root, absolute));
    } else if (entry.isFile()) {
      files.push(relative);
    }
  }
  return files;
}

async function readTextFile(
  filePath: string,
  maxFileBytes: number,
  workspaceRealPath: string,
): Promise<string | null> {
  const stat = await safeWorkspaceFileStat(filePath, workspaceRealPath);
  if (stat === null || stat.size > maxFileBytes) return null;

  let buffer: Buffer;
  try {
    buffer = await fs.readFile(filePath);
  } catch {
    return null;
  }
  if (buffer.subarray(0, 8192).includes(0)) return null;
  return buffer.toString('utf8');
}

function scoreFile(
  file: WorkspaceInventoryFile,
  content: string,
  terms: string[],
): { score: number; reasons: string[] } {
  const { score: pathScore, reasons } = scoreFilePathWithReasons(file, terms);
  let score = pathScore;
  const reasonSet = new Set(reasons);
  const contentLower = content.toLowerCase();

  for (const term of terms) {
    const contentHits = countOccurrences(contentLower, term);
    if (contentHits > 0) {
      score += Math.min(contentHits, 5);
      reasonSet.add(`content:${term}`);
    }
  }
  for (const term of symbolTerms(content)) {
    if (terms.includes(term)) {
      score += 10;
      reasonSet.add(`symbol:${term}`);
    }
  }
  for (const term of importTerms(content)) {
    if (terms.includes(term)) {
      score += 8;
      reasonSet.add(`import:${term}`);
    }
  }
  if (terms.some((term) => TEST_QUERY_TERMS.has(term)) && isTestPath(file.path)) {
    score += 12;
    reasonSet.add('test-path');
  }
  if (file.metadata && score > 0) {
    score += 1;
    reasonSet.add('metadata');
  }

  return { score, reasons: [...reasonSet] };
}

function scoreFilePath(file: WorkspaceInventoryFile, terms: string[]): number {
  return scoreFilePathWithReasons(file, terms).score;
}

function scoreFilePathWithReasons(
  file: WorkspaceInventoryFile,
  terms: string[],
): { score: number; reasons: string[] } {
  const pathLower = file.path.toLowerCase();
  const baseLower = path.basename(file.path).toLowerCase();
  const stemLower = path.basename(file.path, path.extname(file.path)).toLowerCase();
  const stemNormalized = normalizeIdentifier(stemLower);
  const pathSegmentTerms = new Set(pathLower.split('/').flatMap((segment) => identifierTerms(segment)));
  const basenameTerms = new Set(identifierTerms(stemLower));
  let score = 0;
  const reasons = new Set<string>();

  for (const term of terms) {
    if (pathLower.includes(term)) {
      score += 8;
      reasons.add(`path:${term}`);
    }
    if (baseLower.includes(term)) {
      score += 4;
      reasons.add(`name:${term}`);
    }
    if (stemNormalized === term) {
      score += 14;
      reasons.add(`name-stem:${term}`);
    }
    if (pathSegmentTerms.has(term)) {
      score += 6;
      reasons.add(`path-segment:${term}`);
    }
    if (basenameTerms.has(term)) {
      score += 7;
      reasons.add(`name-token:${term}`);
    }
  }

  return { score, reasons: [...reasons] };
}

function symbolTerms(content: string): Set<string> {
  const terms = new Set<string>();
  const declarationPattern = /\b(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:class|function|interface|type|enum|const|let|var)\s+([A-Za-z_$][\w$]*)/g;
  for (const match of content.matchAll(declarationPattern)) {
    for (const term of identifierTerms(match[1] ?? '')) terms.add(term);
  }
  return terms;
}

function importTerms(content: string): Set<string> {
  const terms = new Set<string>();
  for (const line of content.split(/\r?\n/)) {
    if (!/^\s*import\b/.test(line)) continue;
    for (const term of identifierTerms(line)) terms.add(term);
  }
  return terms;
}

function identifierTerms(value: string): string[] {
  const normalizedFull = normalizeIdentifier(value);
  const parts = value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9_]+/g)
    .map((part) => part.trim())
    .filter((part) => part.length >= 2 && !STOP_WORDS.has(part));
  return [...new Set([
    ...(normalizedFull.length >= 2 && !STOP_WORDS.has(normalizedFull) ? [normalizedFull] : []),
    ...parts,
  ])];
}

function normalizeIdentifier(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_]+/g, '');
}

function isTestPath(filePath: string): boolean {
  const normalized = normalizePath(filePath).toLowerCase();
  const base = path.basename(normalized);
  return (
    normalized.split('/').some((part) => part === 'tests' || part === '__tests__') ||
    base.includes('.test.') ||
    base.includes('.spec.') ||
    base.endsWith('.test.ts') ||
    base.endsWith('.test.tsx') ||
    base.endsWith('.test.js') ||
    base.endsWith('.test.jsx') ||
    base.endsWith('.spec.ts') ||
    base.endsWith('.spec.tsx') ||
    base.endsWith('.spec.js') ||
    base.endsWith('.spec.jsx')
  );
}

function extractSnippet(
  content: string,
  terms: string[],
  maxSnippetLines: number,
): { text: string; startLine: number; endLine: number; truncated: boolean } {
  const rawLines = content.split(/\r?\n/);
  const lines = rawLines.length > 0 && rawLines[rawLines.length - 1] === ''
    ? rawLines.slice(0, -1)
    : rawLines;
  const matchIndex = lines.findIndex((line) => {
    const lower = line.toLowerCase();
    return terms.some((term) => lower.includes(term));
  });
  const start = Math.max(matchIndex >= 0 ? matchIndex - 3 : 0, 0);
  const end = Math.min(start + Math.max(maxSnippetLines, 1), lines.length);
  return {
    text: lines.slice(start, end).join('\n'),
    startLine: start + 1,
    endLine: end,
    truncated: start > 0 || end < lines.length,
  };
}

function formatWorkspaceContextBlock(
  query: string,
  selected: Array<{
    file: WorkspaceInventoryFile;
    score: number;
    reasons: string[];
    snippet: { text: string; startLine: number; endLine: number; truncated: boolean };
  }>,
  quality: WorkspaceContextQuality,
): string {
  const lines: string[] = [
    '[Workspace context from @codebase]',
    `Query: ${query}`,
    'Retrieval quality:',
    '- Method: local lexical search over workspace file names and file text.',
    `- Evidence: Selected ${quality.selectedFileCount} of ${quality.matchedFileCount} lexical matches from ${quality.inventoryFileCount} indexed workspace files.`,
    `- Query terms: ${quality.queryTerms.join(', ') || 'none'}.`,
    `- Prompt budget: max files ${quality.maxFiles}, max snippet lines ${quality.maxSnippetLines}, max file bytes ${quality.maxFileBytes}.`,
    '- Embedding readiness: inactive; no cloud index, embedding upload, or background embedding job ran.',
    '- Possible misses: lexical retrieval can miss renamed concepts or files that do not contain the query terms; attach known files with @file.',
    ...quality.warnings.map((warning) => `- ${warning}`),
    '',
    'Selected files:',
    ...selected.map((entry) =>
      `- ${entry.file.path} (score ${entry.score}; ${entry.reasons.join(', ') || 'metadata'})`
    ),
    '',
  ];

  for (const entry of selected) {
    lines.push(
      `[Context file: ${entry.file.path} lines ${entry.snippet.startLine}-${entry.snippet.endLine}]`,
      `\`\`\`${entry.file.language}`,
      entry.snippet.text,
      '```',
      '[/Context file]',
      '',
    );
  }

  lines.push('[/Workspace context]');
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

function emptyWorkspaceContextResult(
  enabled: boolean,
  query: string,
  diagnostics: string[],
  quality?: WorkspaceContextQuality,
): WorkspaceContextResult {
  return {
    enabled,
    query,
    block: '',
    attached: [],
    selected: [],
    diagnostics,
    quality: quality ?? createWorkspaceContextQuality({
      inventoryFileCount: 0,
      candidateFileCount: 0,
      matchedFileCount: 0,
      selectedFileCount: 0,
      queryTerms: [],
      options: { maxFiles: 0, maxSnippetLines: 1, maxFileBytes: 0 },
    }),
  };
}

function createWorkspaceContextQuality(input: {
  inventoryFileCount: number;
  candidateFileCount: number;
  matchedFileCount: number;
  selectedFileCount: number;
  queryTerms: string[];
  options: WorkspaceContextOptions;
}): WorkspaceContextQuality {
  const omittedMatchedFileCount = Math.max(input.matchedFileCount - input.selectedFileCount, 0);
  const warnings = omittedMatchedFileCount > 0
    ? [
        `${omittedMatchedFileCount} matching files were omitted by veyra.workspaceContext.maxFiles (${input.options.maxFiles}). Refine @codebase query or attach known files with @file.`,
      ]
    : [];
  return {
    method: 'local-lexical',
    inventoryFileCount: input.inventoryFileCount,
    candidateFileCount: input.candidateFileCount,
    matchedFileCount: input.matchedFileCount,
    selectedFileCount: input.selectedFileCount,
    omittedMatchedFileCount,
    queryTerms: input.queryTerms,
    maxFiles: input.options.maxFiles,
    maxSnippetLines: input.options.maxSnippetLines,
    maxFileBytes: input.options.maxFileBytes,
    embeddingReadiness: 'inactive',
    warnings,
  };
}

function normalizeOptions(options: WorkspaceContextOptions): WorkspaceContextOptions {
  return {
    maxFiles: Math.max(0, Math.floor(options.maxFiles)),
    maxSnippetLines: Math.max(1, Math.floor(options.maxSnippetLines)),
    maxFileBytes: Math.max(0, Math.floor(options.maxFileBytes)),
  };
}

async function safeWorkspaceFileStat(
  filePath: string,
  workspaceRealPath: string,
): Promise<import('node:fs').Stats | null> {
  let stat: import('node:fs').Stats;
  try {
    stat = await fs.lstat(filePath);
  } catch {
    return null;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) return null;

  let realPath: string;
  try {
    realPath = await fs.realpath(filePath);
  } catch {
    return null;
  }
  if (!isInsideOrEqual(workspaceRealPath, realPath)) return null;
  return stat;
}

function isInsideOrEqual(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;
  const workerCount = Math.min(Math.max(1, concurrency), values.length);

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex++;
      results[currentIndex] = await mapper(values[currentIndex]);
    }
  }));

  return results;
}

function tokenize(query: string): string[] {
  const terms = query
    .toLowerCase()
    .replace(/@[a-z0-9_.\/-]+/g, ' ')
    .split(/[^a-z0-9_/-]+/g)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2 && !STOP_WORDS.has(term));
  return [...new Set(terms)];
}

function countOccurrences(value: string, term: string): number {
  let count = 0;
  let index = value.indexOf(term);
  while (index >= 0) {
    count++;
    index = value.indexOf(term, index + term.length);
  }
  return count;
}

function inferLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.ts':
    case '.tsx':
      return 'ts';
    case '.js':
    case '.jsx':
      return 'js';
    case '.json':
      return 'json';
    case '.md':
      return 'md';
    case '.py':
      return 'python';
    case '.sh':
      return 'sh';
    case '.html':
      return 'html';
    case '.css':
      return 'css';
    case '.yml':
    case '.yaml':
      return 'yaml';
    default:
      return '';
  }
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function parseNulSeparatedPaths(value: string): string[] {
  return value
    .split('\0')
    .map((file) => normalizePath(file.trim()))
    .filter((file) => file.length > 0);
}

function commandExitCode(err: unknown): number | null {
  return typeof err === 'object' && err !== null && 'code' in err && typeof err.code === 'number'
    ? err.code
    : null;
}

function isExcludedPath(relativePath: string): boolean {
  const normalized = normalizePath(relativePath);
  const basenameLower = path.basename(normalized).toLowerCase();
  if (
    SECRET_PRONE_FILE_NAMES.has(basenameLower) ||
    basenameLower.startsWith('.env.') ||
    basenameLower.endsWith('.env') ||
    SECRET_PRONE_EXTENSIONS.has(path.extname(basenameLower))
  ) {
    return true;
  }
  for (const excludedPath of DEFAULT_EXCLUDED_DIR_PATHS) {
    if (normalized === excludedPath || normalized.startsWith(`${excludedPath}/`)) {
      return true;
    }
  }
  return normalized
    .split('/')
    .some((part) => DEFAULT_EXCLUDED_DIR_NAMES.has(part));
}
