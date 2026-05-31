import { h, type ComponentChildren } from 'preact';
import { Icon } from './Icon.js';

interface StatePanelProps {
  /** Optional codicon name shown above the title. */
  icon?: string;
  /** Text fallback for the icon when codicons are unavailable. */
  iconFallback?: string;
  /** Heading line; emphasis comes from weight + color, not size. */
  title: string;
  /** Optional one-line supporting sentence under the title. */
  subtitle?: string;
  /** Optional body content (hints, guidance, action buttons). */
  children?: ComponentChildren;
}

/**
 * Shared "nothing here yet" state container. One structure — optional codicon,
 * a title, an optional subtitle, and body content — on the v0.2 type + space
 * scale, so every empty / no-agents state reads the same across all four
 * themes. Presentational and hook-free (the only hook is inside <Icon>).
 */
export function StatePanel({ icon, iconFallback, title, subtitle, children }: StatePanelProps) {
  return (
    <div class="state-panel">
      {icon && <Icon name={icon} fallback={iconFallback ?? ''} />}
      <p class="state-panel-title">{title}</p>
      {subtitle && <p class="state-panel-subtitle">{subtitle}</p>}
      {children && <div class="state-panel-body">{children}</div>}
    </div>
  );
}
