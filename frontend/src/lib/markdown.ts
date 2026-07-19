import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

/**
 * Inline-bullet fix — TypeScript port of the Python `_fix_inline_bullets`.
 *
 * LLMs sometimes emit bullets inline (e.g. "Person must have: * name, * age").
 * The Markdown parser only converts `* ` to <li> when it appears at the start
 * of a line. This helper normalises both colon-prefixed and bullet-led inline
 * lists into proper Markdown list syntax.
 */
const BULLET_RE = /(?:^|(?:,\s*|\s+))\*\s+(?=[^\s*])/g;

export function fixInlineBullets(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const stripped = line.trim();
      if (!stripped) return line;

      const markers = [...stripped.matchAll(BULLET_RE)];
      if (markers.length === 0) return line;

      const firstStart = markers[0].index ?? 0;
      const prefix = stripped.slice(0, firstStart).trim();
      const hasColon = prefix.endsWith(':');
      const startsWithBullet = firstStart === 0;

      if (hasColon || (startsWithBullet && markers.length > 1)) {
        const parts = stripped.split(BULLET_RE);
        const prefixPart = parts[0].trim().replace(/:$/, '').trim();
        const items = parts
          .slice(1)
          .map((p) => p.trim().replace(/[,.]+$/, ''))
          .filter(Boolean);
        const out: string[] = [];
        if (prefixPart) out.push(prefixPart + ':');
        items.forEach((i) => out.push(`* ${i}`));
        return out.join('\n');
      }
      return line;
    })
    .join('\n');
}

/**
 * Convert `<!-- ref: X -->` markers into `<div data-ref="X" class="ref-section">…</div>`
 * wrappers. The marker applies ONLY to the immediately following paragraph
 * (up to the next blank line). Anything after the paragraph break — including
 * user-added free text in the editor — renders unwrapped and therefore is not
 * tagged with a ref.
 *
 * This avoids the trap of "everything after the last marker gets attributed
 * to that ref", which would mean the user's own additions accidentally trigger
 * code highlighting on hover.
 */
const REF_MARKER = /<!--\s*ref:\s*([^>]+?)\s*-->/g;

export function wrapRefSections(markdown: string): string {
  if (!REF_MARKER.test(markdown)) return markdown;
  // Reset lastIndex (test() leaves it at the matched position)
  REF_MARKER.lastIndex = 0;

  const parts = markdown.split(REF_MARKER);
  // parts: [pre, ref1, content1, ref2, content2, ...]
  if (parts.length < 3) return markdown;

  const out: string[] = [];
  if (parts[0].trim()) out.push(parts[0]);

  for (let i = 1; i < parts.length; i += 2) {
    const ref = parts[i].trim().replace(/"/g, '&quot;');
    const content = parts[i + 1] ?? '';

    // The ref applies only to the FIRST paragraph after the marker.
    // Split on the first blank line (one or more newlines surrounded by optional whitespace).
    const blankLineMatch = content.match(/\n[ \t]*\n/);
    let sectionContent: string;
    let trailingContent: string;
    if (blankLineMatch && blankLineMatch.index !== undefined) {
      sectionContent = content.slice(0, blankLineMatch.index).trim();
      trailingContent = content.slice(blankLineMatch.index).trim();
    } else {
      sectionContent = content.trim();
      trailingContent = '';
    }

    if (sectionContent) {
      out.push(
        `\n<div class="ref-section" data-ref="${ref}">\n\n${sectionContent}\n\n</div>\n`,
      );
    }
    if (trailingContent) {
      out.push(`\n${trailingContent}\n`);
    }
  }
  return out.join('\n');
}

export function renderMarkdown(text: string): string {
  if (!text) return '';
  const wrapped = wrapRefSections(text);
  const fixed = fixInlineBullets(wrapped);
  const html = marked.parse(fixed, { async: false }) as string;
  return DOMPurify.sanitize(html, { ADD_ATTR: ['data-ref'] });
}
