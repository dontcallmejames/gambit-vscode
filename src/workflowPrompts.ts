export type VeyraWorkflowCommand = 'review' | 'debate' | 'consensus' | 'implement';
export type VeyraWorkflowTemplate =
  | 'none'
  | 'architecture-review'
  | 'security-review'
  | 'test-improvement'
  | 'refactor-plan'
  | 'implementation-with-review';

export interface VeyraWorkflowPromptOptions {
  template?: VeyraWorkflowTemplate | string;
}

export const VEYRA_WORKFLOW_TEMPLATE_IDS: readonly VeyraWorkflowTemplate[] = [
  'none',
  'architecture-review',
  'security-review',
  'test-improvement',
  'refactor-plan',
  'implementation-with-review',
];

type ActiveWorkflowTemplate = Exclude<VeyraWorkflowTemplate, 'none'>;

const WORKFLOW_TEMPLATE_GUIDANCE: Record<ActiveWorkflowTemplate, {
  label: string;
  guidance: readonly string[];
}> = {
  'architecture-review': {
    label: 'architecture review',
    guidance: [
      'Focus on module boundaries, data flow, API contracts, migration risk, and long-term maintainability.',
      'Separate architectural blockers from localized implementation concerns.',
    ],
  },
  'security-review': {
    label: 'security review',
    guidance: [
      'Focus on authentication, authorization, secrets, dependency risk, input validation, and data exposure.',
      'Classify security concerns as Blocking issues or Advisory risks.',
    ],
  },
  'test-improvement': {
    label: 'test improvement',
    guidance: [
      'Focus on missing behavioral coverage, brittle tests, useful fixtures, regression gates, and fast targeted verification.',
      'Prefer tests that prove user-visible behavior over implementation details.',
    ],
  },
  'refactor-plan': {
    label: 'refactor plan',
    guidance: [
      'Focus on the smallest safe sequence, compatibility boundaries, rollback points, and tests before moves.',
      'Avoid broad rewrites unless the current structure blocks the requested change.',
    ],
  },
  'implementation-with-review': {
    label: 'implementation with review',
    guidance: [
      'Make the smallest implementation change, add or update focused tests, then have the final agent review the resulting diff and verification evidence.',
      'Keep review feedback grounded in changed files, failing or passing commands, and remaining risks.',
    ],
  },
};

export function normalizeWorkflowTemplate(value: unknown): VeyraWorkflowTemplate {
  return typeof value === 'string' && VEYRA_WORKFLOW_TEMPLATE_IDS.includes(value as VeyraWorkflowTemplate)
    ? value as VeyraWorkflowTemplate
    : 'none';
}

export function veyraWorkflowPrompt(
  command: VeyraWorkflowCommand,
  prompt: string,
  options: VeyraWorkflowPromptOptions = {},
): string {
  const templateBlock = workflowTemplateBlock(options.template);
  if (command === 'review') {
    return [
      '@all',
      'Workflow: review',
      'Review this request independently, then build on prior agents where useful.',
      'Claude: review architecture, requirements fit, and correctness risks.',
      'Codex: review implementation details, test coverage, and likely regression points.',
      'Gemini: review edge cases, alternate interpretations, and missed invisible-change risks.',
      'Read-only workflow: Do not create, edit, rename, or delete files.',
      'Each agent must use this exact Markdown outline:',
      [
        '### Summary',
        '### Blocking issues',
        '### Advisory risks',
        '### Missing tests',
        '### Follow-up suggestions',
      ].join('\n'),
      'Use "None found" for any empty category. Ground each finding in file paths, lines, commands, or observed behavior when available.',
      'Gemini runs last. After its own review, Gemini must end with this exact Veyra Synthesis outline:',
      [
        '## Veyra Synthesis',
        '### Recommendation',
        '### Blocking issues',
        '### Advisory risks',
        '### Missing tests',
        '### Follow-up suggestions',
        '### Next action',
      ].join('\n'),
      templateBlock,
      prompt,
    ].filter(Boolean).join('\n\n');
  }

  if (command === 'debate') {
    return [
      '@all',
      'Workflow: debate',
      'Debate the best approach before implementation.',
      'Claude: argue from architecture, product intent, and long-term correctness.',
      'Codex: argue from concrete implementation cost, tests, and failure modes.',
      'Gemini: argue from alternatives, edge cases, and adversarial review.',
      'Read-only workflow: Do not create, edit, rename, or delete files.',
      'Each agent should use these headings: Recommendation, Tradeoffs, Concerns with prior replies, Next action.',
      'Gemini runs last. After its own position, Gemini must add a Veyra Synthesis section with Recommended approach, Why, Risks, and Next action.',
      templateBlock,
      prompt,
    ].filter(Boolean).join('\n\n');
  }

  if (command === 'consensus') {
    return [
      '@all',
      'Workflow: consensus',
      'Reach a concrete recommendation before implementation.',
      'Claude: identify architecture, product, and correctness constraints.',
      'Codex: identify implementation cost, tests, migration risk, and operational failure modes.',
      'Gemini: compare prior positions, challenge assumptions, and produce the final recommendation.',
      'Read-only workflow: Do not create, edit, rename, or delete files.',
      'Each agent should use these headings: Position, Evidence, Risks, Next action.',
      'Gemini runs last. After its own position, Gemini must add a Consensus Recommendation section with Decision, Rationale, Tradeoffs, Risks, and Next action.',
      templateBlock,
      prompt,
    ].filter(Boolean).join('\n\n');
  }

  return [
    '@all',
    'Workflow: implement',
    'Work as a serial implementation team with minimal human blocking.',
    'Claude: read-only planning; state the approach, assumptions, and correctness risks.',
    'Codex: implement the smallest safe code change and tests.',
    'Gemini: read-only review of the result for missed cases, edit conflicts, and invisible changes.',
    'Only Codex is write-capable in this workflow.',
    'Claude and Gemini must not create, edit, rename, or delete files.',
    'Each agent must build on prior replies, preserve shared context, and surface file changes clearly.',
    'Gemini runs last and must end with this exact Handoff Summary outline:',
    [
      '## Handoff Summary',
      '### What changed',
      '### Verification status',
      '### Remaining risks',
      '### Follow-up suggestions',
      '### Recommended next action',
    ].join('\n'),
    'Use "Not run" when verification was not executed. Keep recommendations grounded in changed files, command output, and unresolved risks.',
    'After implementation, use [Post-implement verification suggestions] when present to recommend the most relevant verification command.',
    'Do not run verification commands unless the user explicitly approves the exact command.',
    'Do not pause for brainstorming or approval checkpoints unless the next action is unsafe or impossible.',
    templateBlock,
    prompt,
  ].filter(Boolean).join('\n\n');
}

function workflowTemplateBlock(value: unknown): string | null {
  const template = normalizeWorkflowTemplate(value);
  if (template === 'none') return null;
  const entry = WORKFLOW_TEMPLATE_GUIDANCE[template];
  return [
    '[Veyra workflow template]',
    `Workflow template: ${entry.label}`,
    ...entry.guidance,
    '[/Veyra workflow template]',
  ].join('\n');
}
