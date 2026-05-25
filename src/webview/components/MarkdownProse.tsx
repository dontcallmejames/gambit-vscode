import { h } from 'preact';
import MarkdownIt from 'markdown-it';
import type { ComponentChildren } from 'preact';
import type { FromWebview } from '../../shared/protocol.js';

type MarkdownToken = {
  type: string;
  tag: string;
  attrs: Array<[string, string]> | null;
  nesting: -1 | 0 | 1;
  children: MarkdownToken[] | null;
  content: string;
  info: string;
  hidden: boolean;
};

type RenderFrame = {
  tag: string;
  props: Record<string, unknown>;
  children: ComponentChildren[];
};

const markdown = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
  breaks: false,
});

markdown.disable(['image']);

export function MarkdownProse({
  text,
  send,
}: {
  text: string;
  send?: (message: FromWebview) => void;
}) {
  if (!text) return null;

  try {
    const tokens = markdown.parse(text, {}) as MarkdownToken[];
    return <div class="markdown-prose">{renderTokens(tokens, send)}</div>;
  } catch {
    return <div class="markdown-prose markdown-prose-plain">{text}</div>;
  }
}

function renderTokens(tokens: MarkdownToken[], send?: (message: FromWebview) => void): ComponentChildren[] {
  const root: RenderFrame = { tag: 'fragment', props: {}, children: [] };
  const stack: RenderFrame[] = [root];

  for (const token of tokens) {
    if (token.hidden) continue;

    if (token.type === 'inline') {
      current(stack).children.push(...renderTokens(token.children ?? [], send));
      continue;
    }

    if (token.type === 'text' || token.type === 'html_inline' || token.type === 'html_block') {
      current(stack).children.push(token.content);
      continue;
    }

    if (token.type === 'code_inline') {
      current(stack).children.push(<code>{token.content}</code>);
      continue;
    }

    if (token.type === 'fence' || token.type === 'code_block') {
      const language = safeLanguage(token.info);
      current(stack).children.push(
        <pre>
          <code class={language ? `language-${language}` : undefined}>{token.content}</code>
        </pre>,
      );
      continue;
    }

    if (token.type === 'hardbreak') {
      current(stack).children.push(<br />);
      continue;
    }

    if (token.type === 'softbreak') {
      current(stack).children.push('\n');
      continue;
    }

    if (token.type === 'hr') {
      current(stack).children.push(<hr />);
      continue;
    }

    if (token.nesting === 1) {
      stack.push(frameForToken(token, send));
      continue;
    }

    if (token.nesting === -1) {
      if (stack.length === 1) continue;
      const frame = stack.pop()!;
      current(stack).children.push(h(frame.tag, frame.props, frame.children));
      continue;
    }
  }

  while (stack.length > 1) {
    const frame = stack.pop()!;
    current(stack).children.push(h(frame.tag, frame.props, frame.children));
  }

  return root.children;
}

function frameForToken(token: MarkdownToken, send?: (message: FromWebview) => void): RenderFrame {
  if (token.type === 'link_open') {
    const href = attr(token, 'href') ?? '';
    const link = linkTarget(href);
    if (link.kind === 'external') {
      return {
        tag: 'a',
        props: {
          href,
          class: 'markdown-link',
          title: href,
          onClick: (event: Event) => {
            event.preventDefault();
            send?.({ kind: 'open-external', url: link.url });
          },
        },
        children: [],
      };
    }
    if (link.kind === 'workspace') {
      return {
        tag: 'a',
        props: {
          href: '#',
          class: 'markdown-link markdown-workspace-link',
          title: link.path,
          onClick: (event: Event) => {
            event.preventDefault();
            send?.({ kind: 'open-workspace-file', relativePath: link.path });
          },
        },
        children: [],
      };
    }
    return { tag: 'span', props: { class: 'markdown-link markdown-link-unsafe' }, children: [] };
  }

  if (token.type === 'ordered_list_open') {
    const start = attr(token, 'start');
    return {
      tag: token.tag,
      props: start && /^\d+$/u.test(start) ? { start: Number(start) } : {},
      children: [],
    };
  }

  return {
    tag: allowedTag(token.tag) ? token.tag : 'span',
    props: {},
    children: [],
  };
}

function current(stack: RenderFrame[]): RenderFrame {
  return stack[stack.length - 1];
}

function attr(token: MarkdownToken, name: string): string | null {
  return token.attrs?.find(([key]) => key === name)?.[1] ?? null;
}

function allowedTag(tag: string): boolean {
  return [
    'p',
    'em',
    'strong',
    's',
    'blockquote',
    'ul',
    'ol',
    'li',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
  ].includes(tag);
}

function safeLanguage(info: string): string {
  return info.trim().split(/\s+/u)[0]?.replace(/[^A-Za-z0-9_-]/gu, '') ?? '';
}

function linkTarget(rawHref: string):
  | { kind: 'external'; url: string }
  | { kind: 'workspace'; path: string }
  | { kind: 'unsafe' } {
  const href = rawHref.trim();
  if (/^https?:\/\//iu.test(href)) return { kind: 'external', url: href };
  if (isWorkspaceLink(href)) {
    return { kind: 'workspace', path: href.replace(/^\.\//u, '') };
  }
  return { kind: 'unsafe' };
}

function isWorkspaceLink(href: string): boolean {
  if (!href || href.startsWith('#')) return false;
  if (/^[a-z][a-z0-9+.-]*:/iu.test(href)) return false;
  if (/^[\\/]/u.test(href)) return false;
  if (href.includes('\0') || href.includes('..')) return false;
  return /[\\/]/u.test(href) || /\.[A-Za-z0-9]{1,8}(?:#L\d+)?$/u.test(href);
}
