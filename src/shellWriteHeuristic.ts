/**
 * Heuristic detection of a shell command that writes to the filesystem (or
 * otherwise escapes a read-only contract). Used to catch a read-only agent that
 * tries to write via the shell tool — which the per-CLI write-tool stripping and
 * the file-edit detector do not see (shell commands are not tracked as edits).
 *
 * This is intentionally conservative-toward-flagging: a read-only workflow should
 * not be running write shell anyway, so a false positive (cancelling on an
 * ambiguous command) is safer than a missed write. It is a heuristic, not a
 * sandbox — the OS-level CLI sandbox (where available) is the real boundary.
 */

/** Tool names the three agents use for arbitrary shell execution. */
const SHELL_TOOL_NAMES = new Set(['shell', 'bash', 'run_shell_command', 'run_terminal_cmd']);

export function isShellTool(toolName: string): boolean {
  return SHELL_TOOL_NAMES.has(toolName.toLowerCase());
}

/** Commands whose mere presence implies a write/mutation. */
const WRITE_COMMAND_RE =
  /(?:^|[\s;&|(])(?:rm|rmdir|mv|cp|dd|truncate|install|mkdir|touch|chmod|chown|ln|tee|patch|git\s+(?:add|commit|checkout|reset|restore|apply|rm|mv|clean|stash)|npm\s+(?:install|i|ci|publish)|pip\s+install|sed\s+-[a-z]*i|perl\s+-[a-z]*i)\b/iu;

/**
 * Output redirection that creates/overwrites/appends a file. The negative
 * lookbehind avoids `2>&1` (digit before `>`) and `>>`/`<>` artifacts; the
 * lookahead `(?![&=])` avoids `>&` (fd dup) and `>=` (a comparison operator in
 * grep/awk/test expressions), which would otherwise false-flag read-only
 * exploration like `grep '>=' file`.
 */
const REDIRECT_RE = /(?<![0-9<>])>>?(?![&=])|\btee\b/u;

/**
 * Returns true if the shell command appears to write to disk. Catches output
 * redirection (`>`/`>>`), known mutating commands (rm/mv/cp/sed -i/git write
 * subcommands/installers), and `tee`. Read-only commands (cat/grep/ls/find
 * without -delete, git log/status/diff) return false.
 */
export function shellCommandWrites(command: string): boolean {
  if (!command) return false;
  if (REDIRECT_RE.test(command)) return true;
  if (WRITE_COMMAND_RE.test(command)) return true;
  // find ... -delete / -exec is a write vector even though `find` reads.
  if (/\bfind\b/iu.test(command) && /-delete\b|-exec\b|-execdir\b/iu.test(command)) return true;
  return false;
}

/** Pull the command string out of a shell tool-call input, if present. */
export function shellCommandFromInput(input: unknown): string | null {
  if (typeof input !== 'object' || input === null) return null;
  const obj = input as Record<string, unknown>;
  if (typeof obj.command === 'string') return obj.command;
  return null;
}
