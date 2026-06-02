import type { AgentChunk } from '../types.js';

/**
 * Visible warning surfaced when a CLI emitted output Veyra could not map to any
 * known event chunk — the signal of an upstream schema change that would
 * otherwise produce a "complete but blank" turn with no error. Worded so the
 * user knows the likely cause and the next step.
 */
export const CLI_DRIFT_WARNING =
  'Veyra could not parse this agent\'s output — its CLI may have updated. '
  + 'Run "Veyra: Copy Diagnostic Report" and check the CLI version.';

/**
 * Tracks, per dispatch, whether a CLI produced non-empty output lines that all
 * failed to map to a recognized chunk. A non-empty line is any stdout line with
 * non-whitespace content; a "recognized chunk" is any chunk the parser yielded
 * (text / tool-call / tool-result / done / error). Drift is reported only on a
 * clean exit (no process error, exit code 0) — a non-zero exit already surfaces
 * its own error, and genuinely empty output is a normal no-op.
 */
export class DriftTracker {
  private nonEmptyLines = 0;
  private recognizedChunks = 0;

  /** Call once per raw stdout line (before parsing). */
  observeLine(line: string): void {
    if (line.trim().length > 0) this.nonEmptyLines += 1;
  }

  /** Call once per chunk the parser yielded. */
  observeChunk(): void {
    this.recognizedChunks += 1;
  }

  /**
   * Returns a drift warning chunk if the dispatch saw non-empty output that
   * parsed to nothing on a clean exit, else null.
   */
  driftChunk(cleanExit: boolean): AgentChunk | null {
    if (cleanExit && this.nonEmptyLines > 0 && this.recognizedChunks === 0) {
      return { type: 'error', message: CLI_DRIFT_WARNING };
    }
    return null;
  }
}
