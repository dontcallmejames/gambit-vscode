import { h } from 'preact';
import type { FromWebview } from '../../shared/protocol.js';
import { parseWorkflowArtifactBlocks, type WorkflowArtifactSectionBlock } from '../workflowArtifacts.js';
import { MarkdownProse } from './MarkdownProse.js';

export function WorkflowArtifactCards({
  text,
  send,
}: {
  text: string;
  send?: (message: FromWebview) => void;
}) {
  const parsed = parseWorkflowArtifactBlocks(text);
  if (!parsed.hasArtifacts) return <MarkdownProse text={text} send={send} />;

  return (
    <div class="workflow-artifacts" aria-label="Workflow artifact cards">
      {parsed.blocks.map((block, index) => (
        block.kind === 'section'
          ? <ArtifactCard key={`${block.id}-${index}`} section={block} send={send} />
          : <MarkdownProse key={`prose-${index}`} text={block.text} send={send} />
      ))}
    </div>
  );
}

function ArtifactCard({
  section,
  send,
}: {
  section: WorkflowArtifactSectionBlock;
  send?: (message: FromWebview) => void;
}) {
  return (
    <details
      class={`workflow-artifact-card workflow-artifact-${section.id} workflow-artifact-tone-${section.tone}`}
      open
    >
      <summary class="workflow-artifact-card-head">
        <span class="workflow-artifact-title">{section.title}</span>
        <span class={`workflow-artifact-chip workflow-artifact-chip-${section.tone}`}>{section.chip}</span>
      </summary>
      <div class="workflow-artifact-card-body">
        <MarkdownProse text={section.text} send={send} />
      </div>
    </details>
  );
}
