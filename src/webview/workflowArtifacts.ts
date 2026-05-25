export type WorkflowArtifactSectionId =
  | 'synthesis'
  | 'recommendation'
  | 'blocking-issues'
  | 'advisory-risks'
  | 'missing-tests'
  | 'follow-up-suggestions'
  | 'next-action'
  | 'handoff-summary';

export type WorkflowArtifactTone = 'neutral' | 'positive' | 'warning' | 'danger' | 'test' | 'action';

export type WorkflowArtifactProseBlock = {
  kind: 'prose';
  text: string;
};

export type WorkflowArtifactSectionBlock = {
  kind: 'section';
  id: WorkflowArtifactSectionId;
  title: string;
  chip: string;
  tone: WorkflowArtifactTone;
  text: string;
};

export type WorkflowArtifactBlock = WorkflowArtifactProseBlock | WorkflowArtifactSectionBlock;

export type WorkflowArtifactParseResult = {
  hasArtifacts: boolean;
  blocks: WorkflowArtifactBlock[];
};

type SectionDefinition = {
  id: WorkflowArtifactSectionId;
  title: string;
  chip: string;
  tone: WorkflowArtifactTone;
  aliases: string[];
};

const SECTION_DEFINITIONS: SectionDefinition[] = [
  {
    id: 'synthesis',
    title: 'Veyra Synthesis',
    chip: 'Synthesis',
    tone: 'positive',
    aliases: ['veyra synthesis', 'synthesis'],
  },
  {
    id: 'recommendation',
    title: 'Recommendation',
    chip: 'Recommendation',
    tone: 'positive',
    aliases: ['recommendation', 'recommended path'],
  },
  {
    id: 'blocking-issues',
    title: 'Blocking issues',
    chip: 'Blocking',
    tone: 'danger',
    aliases: ['blocking issues', 'blockers', 'blocking risks'],
  },
  {
    id: 'advisory-risks',
    title: 'Advisory risks',
    chip: 'Advisory',
    tone: 'warning',
    aliases: ['advisory risks', 'risks', 'non-blocking risks'],
  },
  {
    id: 'missing-tests',
    title: 'Missing tests',
    chip: 'Tests',
    tone: 'test',
    aliases: ['missing tests', 'test gaps', 'testing gaps'],
  },
  {
    id: 'follow-up-suggestions',
    title: 'Follow-up suggestions',
    chip: 'Follow-up',
    tone: 'neutral',
    aliases: ['follow-up suggestions', 'follow up suggestions', 'follow-ups', 'follow ups'],
  },
  {
    id: 'next-action',
    title: 'Next action',
    chip: 'Next',
    tone: 'action',
    aliases: ['next action', 'recommended next action'],
  },
  {
    id: 'handoff-summary',
    title: 'Handoff Summary',
    chip: 'Handoff',
    tone: 'neutral',
    aliases: ['handoff summary', 'handoff'],
  },
];

type ActiveSection = {
  definition: SectionDefinition;
  rawHeading: string;
  lines: string[];
};

const ATX_HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/u;
const BOLD_HEADING_RE = /^\s*\*\*(.+?)\*\*:?\s*$/u;

export function parseWorkflowArtifactBlocks(text: string): WorkflowArtifactParseResult {
  if (!text.trim()) return { hasArtifacts: false, blocks: [] };

  const lines = text.replace(/\r\n/gu, '\n').split('\n');
  const blocks: WorkflowArtifactBlock[] = [];
  let proseLines: string[] = [];
  let active: ActiveSection | null = null;

  const flushProse = () => {
    const prose = trimMarkdownLines(proseLines);
    if (prose) blocks.push({ kind: 'prose', text: prose });
    proseLines = [];
  };

  const flushSection = () => {
    if (!active) return;
    const sectionText = trimMarkdownLines(active.lines);
    if (sectionText) {
      blocks.push({
        kind: 'section',
        id: active.definition.id,
        title: active.definition.title,
        chip: active.definition.chip,
        tone: active.definition.tone,
        text: sectionText,
      });
    } else {
      proseLines.push(active.rawHeading);
    }
    active = null;
  };

  for (const line of lines) {
    const heading = sectionForHeading(line);
    if (heading) {
      flushSection();
      flushProse();
      active = { definition: heading, rawHeading: line, lines: [] };
      continue;
    }

    if (active) active.lines.push(line);
    else proseLines.push(line);
  }

  flushSection();
  flushProse();

  const hasArtifacts = blocks.some((block) => block.kind === 'section');
  return hasArtifacts
    ? { hasArtifacts, blocks }
    : { hasArtifacts: false, blocks: [{ kind: 'prose', text: trimMarkdownLines(lines) || text }] };
}

function sectionForHeading(line: string): SectionDefinition | null {
  const title = atxHeadingTitle(line) ?? boldHeadingTitle(line);
  if (!title) return null;
  const candidates = headingCandidates(title);
  return SECTION_DEFINITIONS.find((definition) =>
    definition.aliases.some((alias) => candidates.includes(alias))
  ) ?? null;
}

function atxHeadingTitle(line: string): string | null {
  return line.match(ATX_HEADING_RE)?.[2] ?? null;
}

function boldHeadingTitle(line: string): string | null {
  return line.match(BOLD_HEADING_RE)?.[1] ?? null;
}

function headingCandidates(raw: string): string[] {
  const cleaned = normalizeHeading(raw);
  const parts = raw
    .split(/\s+(?:[-|]|[–—])\s+/u)
    .map(normalizeHeading)
    .filter(Boolean);
  return Array.from(new Set([cleaned, ...parts]));
}

function normalizeHeading(raw: string): string {
  return raw
    .replace(/[*_`#]/gu, '')
    .replace(/[:.]\s*$/u, '')
    .trim()
    .replace(/\s+/gu, ' ')
    .toLowerCase();
}

function trimMarkdownLines(lines: string[] | string): string {
  const value = Array.isArray(lines) ? [...lines] : lines.replace(/\r\n/gu, '\n').split('\n');
  while (value.length > 0 && value[0].trim() === '') value.shift();
  while (value.length > 0 && value[value.length - 1].trim() === '') value.pop();
  return value.join('\n');
}
