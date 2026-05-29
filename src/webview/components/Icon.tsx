import { h } from 'preact';
import { useEffect, useState } from 'preact/hooks';

interface IconProps {
  /** Codicon name without the `codicon-` prefix, e.g. "chevron-down". */
  name: string;
  /** Unicode/text glyph shown if the codicon font fails to load. */
  fallback: string;
  /** Accessible label. Omit for decorative icons (rendered aria-hidden). */
  label?: string;
}

type LoadableFonts = {
  load?: (font: string) => Promise<ReadonlyArray<unknown>>;
};

/**
 * Renders a VS Code codicon. Renders the codicon span by default so the webfont
 * is actually requested (a font is not downloaded until something uses it), and
 * explicitly triggers the load. Falls back to a short text/unicode glyph only if
 * the font genuinely fails to load (e.g. blocked by CSP or missing), so the icon
 * is never a blank box.
 */
export function Icon({ name, fallback, label }: IconProps) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const fonts = (globalThis as { document?: { fonts?: LoadableFonts } }).document?.fonts;
    if (!fonts || typeof fonts.load !== 'function') {
      setFailed(true);
      return undefined;
    }
    let active = true;
    fonts
      .load('16px codicon')
      .then((faces) => {
        if (active && faces.length === 0) setFailed(true);
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (failed) {
    return label
      ? <span class="icon-fallback" role="img" aria-label={label}>{fallback}</span>
      : <span class="icon-fallback" aria-hidden="true">{fallback}</span>;
  }
  return label
    ? <span class={`codicon codicon-${name}`} role="img" aria-label={label} />
    : <span class={`codicon codicon-${name}`} aria-hidden="true" />;
}
