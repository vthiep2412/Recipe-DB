import DOMPurify from 'dompurify';

export type SanitizeProfile = 'recipe' | 'admin' | 'strict';

const RECIPE_ALLOWED_TAGS = [
  'a', 'b', 'blockquote', 'br', 'code', 'del', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'i', 'li', 'ol', 'p', 'pre', 'span', 'strong', 'sub', 'sup', 'table', 'tbody',
  'td', 'th', 'thead', 'tr', 'ul'
];

const RECIPE_ALLOWED_ATTR = ['href', 'title', 'target', 'rel', 'class'];

const ADMIN_ALLOWED_TAGS = [
  'a', 'b', 'blockquote', 'br', 'code', 'del', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'hr', 'i', 'li', 'ol', 'p', 'pre', 'span', 'strong', 'ul'
];

const STRICT_ALLOWED_TAGS = ['b', 'code', 'em', 'i', 'span', 'strong'];

function getPurify(): any {
  if (typeof window !== 'undefined') {
    if (typeof (DOMPurify as any).sanitize === 'function') {
      return DOMPurify;
    }
    if (typeof DOMPurify === 'function') {
      return (DOMPurify as any)(window);
    }
  }
  return null;
}

let purifyInstance: any = null;

function ensurePurify(): any {
  if (!purifyInstance) {
    purifyInstance = getPurify();
    if (purifyInstance && typeof purifyInstance.addHook === 'function') {
      purifyInstance.addHook('afterSanitizeAttributes', (node: any) => {
        if (node.tagName === 'A') {
          node.setAttribute('target', '_blank');
          node.setAttribute('rel', 'noopener noreferrer');
        }
      });
    }
  }
  return purifyInstance;
}

/**
 * Universal HTML Sanitizer using DOMPurify
 * Defends against XSS, mXSS, and namespace injection.
 */
export function sanitizeHtml(dirty?: string | null, profile: SanitizeProfile = 'recipe'): string {
  if (!dirty) return '';

  const purify = ensurePurify();
  if (!purify) {
    // Non-browser / SSR environment fallback
    return dirty
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
      .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
      .replace(/<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi, '')
      .replace(/\s*on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/<a\b(?![^>]*\brel=)([^>]*)>/gi, '<a rel="noopener noreferrer" target="_blank"$1>');
  }

  let allowedTags = RECIPE_ALLOWED_TAGS;
  let allowedAttr = RECIPE_ALLOWED_ATTR;

  if (profile === 'admin') {
    allowedTags = ADMIN_ALLOWED_TAGS;
  } else if (profile === 'strict') {
    allowedTags = STRICT_ALLOWED_TAGS;
    allowedAttr = [];
  }

  return purify.sanitize(dirty, {
    ALLOWED_TAGS: allowedTags,
    ALLOWED_ATTR: allowedAttr,
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'style'],
    RETURN_DOM: false,
    RETURN_DOM_FRAGMENT: false
  });
}
