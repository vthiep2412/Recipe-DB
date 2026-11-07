import { marked } from 'marked';
import { sanitizeHtml, type SanitizeProfile } from './sanitizer';
import { escapeHtmlAttr } from './html';

export interface RenderMarkdownOptions {
  profile?: SanitizeProfile;
  fallbackText?: string;
  allowImages?: boolean;
  imageTransform?: (url: string) => string;
}

/**
 * Universal Markdown rendering utility.
 * - Supports `<br>`, `<br/>`, `<br />` (case-insensitive) anywhere inline.
 * - Supports backslash `\` as line break ONLY when at the end of a line or on a single line by itself.
 * - Enables GFM and soft breaks (breaks: true).
 * - Transforms Obsidian-style [[wikilinks]].
 * - Defense-in-depth XSS protection using tag escaping + DOMPurify.
 */
export function renderAppMarkdown(
  rawMarkdown?: string | null,
  options: RenderMarkdownOptions = {}
): string {
  const { profile = 'recipe', fallbackText = '', allowImages = false, imageTransform } = options;

  if (!rawMarkdown || !rawMarkdown.trim()) {
    if (!fallbackText) return '';
    rawMarkdown = fallbackText;
  }

  // 1. Protect <br>, <br/>, <br /> (case-insensitive) anywhere inline before escaping other tags
  const BR_TOKEN = '___APP_MD_BR___';
  let text = rawMarkdown.replace(/<br\s*\/?>/gi, BR_TOKEN);

  // 2. Escape any remaining '<' to neutralize arbitrary HTML tags
  text = text.replace(/</g, '&lt;');

  // 3. Restore protected <br /> tags
  text = text.replace(new RegExp(BR_TOKEN, 'g'), '<br />');

  // 3. Handle backslash as line break ONLY:
  //    (a) Single line containing only backslash (with optional surrounding whitespace)
  text = text.replace(/^[ \t]*\\+[ \t]*$/gm, '<br />');

  //    (b) Backslash at the end of a line (preceding newline or string end)
  text = text.replace(/(?<!\\)\\+[ \t]*$/gm, '<br />');

  // 4. Obsidian wiki-links [[Target]]
  text = text.replace(/\[\[(.*?)\]\]/g, (_, linkText) => {
    return `<span class="obsidian-reading-link">${escapeHtmlAttr(linkText)}</span>`;
  });

  // 5. Marked renderer configuration
  const renderer = new marked.Renderer();

  renderer.link = ({ href, title, text: linkText }) => {
    const isSafe = /^https?:\/\/|^mailto:/i.test(href.trim());
    const safeHref = isSafe ? escapeHtmlAttr(href.trim()) : '#';
    const titleAttr = title ? ` title="${escapeHtmlAttr(title)}"` : '';
    return `<a href="${safeHref}"${titleAttr} rel="noopener noreferrer" target="_blank">${escapeHtmlAttr(linkText)}</a>`;
  };

  if (allowImages) {
    renderer.image = ({ href, title, text: altText }) => {
      const isSafe = href && /^https?:\/\//i.test(href.trim());
      if (!isSafe) return '';
      const resolvedSrc = imageTransform ? imageTransform(href.trim()) : href.trim();
      const safeSrc = escapeHtmlAttr(resolvedSrc);
      const titleAttr = title ? ` title="${escapeHtmlAttr(title)}"` : '';
      const altAttr = altText ? ` alt="${escapeHtmlAttr(altText)}"` : '';
      return `<img src="${safeSrc}"${altAttr}${titleAttr} loading="lazy" />`;
    };
  }

  // 6. Parse with marked (breaks: true so standard soft newlines also render as line breaks)
  const parsed = marked.parse(text, {
    renderer,
    breaks: true,
    gfm: true,
    async: false
  }) as string;

  // 7. Defense-in-depth sanitization via DOMPurify
  return sanitizeHtml(parsed, profile);
}
