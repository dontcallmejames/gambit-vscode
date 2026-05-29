import { h } from 'preact';
import type { ComponentChildren } from 'preact';

export type PanelSectionState = 'default' | 'active' | 'empty' | 'warning';

interface PanelSectionProps {
  /** Panel identity, used for the panel-section-<kind> class hook. */
  kind: string;
  /** Uppercase-styled prefix, e.g. "Trust Center". */
  kicker: string;
  /** Primary heading text/content. */
  label: ComponentChildren;
  /** Accessible name for the section landmark. */
  ariaLabel: string;
  /** Right-aligned summary chips/text. */
  summary?: ComponentChildren;
  /** Semantic chrome state (controls the left accent stripe / border). */
  state?: PanelSectionState;
  /**
   * Collapsed state. Omit entirely for an always-visible panel (no toggle),
   * e.g. Mission Control.
   */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  /** Noun used to build the toggle label: "Collapse/Open <toggleNoun>". */
  toggleNoun?: string;
  /** id shared by the toggle's aria-controls and the body wrapper. */
  bodyId?: string;
  /** Panel-specific body layout class (the panel owns its body details). */
  bodyClass?: string;
  children?: ComponentChildren;
}

export function PanelSection({
  kind,
  kicker,
  label,
  ariaLabel,
  summary,
  state = 'default',
  collapsed,
  onToggleCollapse,
  toggleNoun,
  bodyId,
  bodyClass,
  children,
}: PanelSectionProps) {
  const collapsible = collapsed !== undefined;
  const showBody = !collapsible || !collapsed;
  const expanded = !collapsed;
  const noun = toggleNoun ?? kicker;

  const sectionClasses = [
    'panel-section',
    `panel-section-${kind}`,
    `panel-section-${state}`,
    collapsible ? (expanded ? 'panel-section-open' : 'panel-section-closed') : 'panel-section-static',
  ].join(' ');

  return (
    <section class={sectionClasses} aria-label={ariaLabel}>
      <div class="panel-section-head">
        <div class="panel-section-heading">
          <span class="panel-section-kicker">{kicker}</span>
          <span class="panel-section-label">{label}</span>
        </div>
        {(summary != null || collapsible) && (
          <div class="panel-section-aside">
            {summary != null && <div class="panel-section-summary">{summary}</div>}
            {collapsible && (
              <button
                type="button"
                class="panel-section-toggle"
                aria-expanded={expanded}
                aria-controls={bodyId}
                onClick={() => onToggleCollapse?.()}
              >
                {expanded ? `Collapse ${noun}` : `Open ${noun}`}
              </button>
            )}
          </div>
        )}
      </div>
      {showBody && (
        <div id={bodyId} class={bodyClass ? `panel-section-body ${bodyClass}` : 'panel-section-body'}>
          {children}
        </div>
      )}
    </section>
  );
}
