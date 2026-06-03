/**
 * Bounded accumulator for a child process's stderr. A chatty CLI (progress,
 * telemetry, deprecation banners) can stream a large amount of stderr over a
 * long run; accumulating it unbounded grows memory for the dispatch duration
 * and produces an enormous, unreadable error message if the process then exits
 * non-zero. This keeps only the last `limit` bytes and prefixes a marker when
 * earlier output was dropped.
 */
export class StderrTail {
  private buffer = '';
  private truncated = false;
  private readonly limit: number;

  constructor(limit = 16_384) {
    this.limit = limit;
  }

  append(chunk: string): void {
    this.buffer += chunk;
    if (this.buffer.length > this.limit) {
      this.buffer = this.buffer.slice(this.buffer.length - this.limit);
      this.truncated = true;
    }
  }

  value(): string {
    return this.truncated ? `...(stderr truncated)\n${this.buffer}` : this.buffer;
  }
}
