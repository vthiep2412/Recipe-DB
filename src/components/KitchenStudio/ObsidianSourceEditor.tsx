import { useEffect, useRef } from 'preact/hooks';
import { escapeHtmlAttr } from '../../utils/html';

export { escapeHtmlAttr };

export interface ObsidianSourceEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

function tokenizeInlineText(parentEl: HTMLElement, text: string) {
  const tokenRegex = /(\[\[[^\n\]]+\]\]|\*\*\*[^\s*](?:[\s\S]*?[^\s*])?\*\*\*|\*\*[^\s*](?:[\s\S]*?[^\s*])?\*\*|\*[^\s*](?:[^*\n]*?[^\s*])?\*|`[^`\n]+`)/g;
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parentEl.appendChild(document.createTextNode(text.slice(lastIdx, match.index)));
    }
    const tokenStr = match[0];
    if (tokenStr.startsWith('[[') && tokenStr.endsWith(']]')) {
      const inner = tokenStr.slice(2, -2);
      const openSpan = document.createElement('span');
      openSpan.className = 'obsidian-syntax-dim';
      openSpan.textContent = '[[';
      parentEl.appendChild(openSpan);

      const linkSpan = document.createElement('span');
      linkSpan.className = 'obsidian-token-wiki-link';
      linkSpan.textContent = inner;
      parentEl.appendChild(linkSpan);

      const closeSpan = document.createElement('span');
      closeSpan.className = 'obsidian-syntax-dim';
      closeSpan.textContent = ']]';
      parentEl.appendChild(closeSpan);
    } else if (tokenStr.startsWith('***') && tokenStr.endsWith('***')) {
      const inner = tokenStr.slice(3, -3);
      const openSpan = document.createElement('span');
      openSpan.className = 'obsidian-syntax-dim';
      openSpan.textContent = '***';
      parentEl.appendChild(openSpan);

      const biSpan = document.createElement('span');
      biSpan.className = 'obsidian-token-bold-italic';
      biSpan.textContent = inner;
      parentEl.appendChild(biSpan);

      const closeSpan = document.createElement('span');
      closeSpan.className = 'obsidian-syntax-dim';
      closeSpan.textContent = '***';
      parentEl.appendChild(closeSpan);
    } else if (tokenStr.startsWith('**') && tokenStr.endsWith('**')) {
      const inner = tokenStr.slice(2, -2);
      const openSpan = document.createElement('span');
      openSpan.className = 'obsidian-syntax-dim';
      openSpan.textContent = '**';
      parentEl.appendChild(openSpan);

      const boldSpan = document.createElement('span');
      boldSpan.className = 'obsidian-token-bold';
      boldSpan.textContent = inner;
      parentEl.appendChild(boldSpan);

      const closeSpan = document.createElement('span');
      closeSpan.className = 'obsidian-syntax-dim';
      closeSpan.textContent = '**';
      parentEl.appendChild(closeSpan);
    } else if (tokenStr.startsWith('*') && tokenStr.endsWith('*')) {
      const inner = tokenStr.slice(1, -1);
      const openSpan = document.createElement('span');
      openSpan.className = 'obsidian-syntax-dim';
      openSpan.textContent = '*';
      parentEl.appendChild(openSpan);

      const italicSpan = document.createElement('span');
      italicSpan.className = 'obsidian-token-italic';
      italicSpan.textContent = inner;
      parentEl.appendChild(italicSpan);

      const closeSpan = document.createElement('span');
      closeSpan.className = 'obsidian-syntax-dim';
      closeSpan.textContent = '*';
      parentEl.appendChild(closeSpan);
    } else if (tokenStr.startsWith('`') && tokenStr.endsWith('`')) {
      const inner = tokenStr.slice(1, -1);
      const openSpan = document.createElement('span');
      openSpan.className = 'obsidian-syntax-dim';
      openSpan.textContent = '`';
      parentEl.appendChild(openSpan);

      const codeSpan = document.createElement('span');
      codeSpan.className = 'obsidian-token-code';
      codeSpan.textContent = inner;
      parentEl.appendChild(codeSpan);

      const closeSpan = document.createElement('span');
      closeSpan.className = 'obsidian-syntax-dim';
      closeSpan.textContent = '`';
      parentEl.appendChild(closeSpan);
    }
    lastIdx = match.index + tokenStr.length;
  }

  if (lastIdx < text.length) {
    parentEl.appendChild(document.createTextNode(text.slice(lastIdx)));
  }
}

function renderObsidianLine(lineText: string, lineIndex: number): HTMLDivElement {
  const lineDiv = document.createElement('div');
  lineDiv.className = 'obsidian-editor-line';
  lineDiv.dataset.lineIndex = String(lineIndex);

  if (!lineText) {
    lineDiv.classList.add('is-empty');
    lineDiv.appendChild(document.createElement('br'));
    return lineDiv;
  }

  const headingMatch = lineText.match(/^(#{1,6})\s(.*)$/);
  if (headingMatch) {
    const level = headingMatch[1].length;
    lineDiv.classList.add(`is-h${level}`, 'is-heading');

    const hashSpan = document.createElement('span');
    hashSpan.className = 'obsidian-syntax-dim';
    hashSpan.textContent = `${headingMatch[1]} `;
    lineDiv.appendChild(hashSpan);

    const textSpan = document.createElement('span');
    textSpan.className = 'obsidian-heading-text';
    tokenizeInlineText(textSpan, headingMatch[2]);
    lineDiv.appendChild(textSpan);
    return lineDiv;
  }

  if (/^(\s*---|\s*\*\*\*|\s*___)\s*$/.test(lineText)) {
    lineDiv.classList.add('is-hr');
    const hrSpan = document.createElement('span');
    hrSpan.className = 'obsidian-syntax-dim';
    hrSpan.textContent = lineText;
    lineDiv.appendChild(hrSpan);
    return lineDiv;
  }

  const listMatch = lineText.match(/^(\s*[-*+]\s|\s*\d+\.\s)(.*)$/);
  if (listMatch) {
    lineDiv.classList.add('is-list');
    const bulletSpan = document.createElement('span');
    bulletSpan.className = 'obsidian-syntax-dim';
    bulletSpan.textContent = listMatch[1];
    lineDiv.appendChild(bulletSpan);

    tokenizeInlineText(lineDiv, listMatch[2]);
    return lineDiv;
  }

  const quoteMatch = lineText.match(/^(\s*>\s*)(.*)$/);
  if (quoteMatch) {
    lineDiv.classList.add('is-blockquote');
    const quoteSpan = document.createElement('span');
    quoteSpan.className = 'obsidian-syntax-dim';
    quoteSpan.textContent = quoteMatch[1];
    lineDiv.appendChild(quoteSpan);

    tokenizeInlineText(lineDiv, quoteMatch[2]);
    return lineDiv;
  }

  tokenizeInlineText(lineDiv, lineText);
  return lineDiv;
}

function renderObsidianDocument(container: HTMLElement, docText: string) {
  const lines = docText.split('\n');
  container.innerHTML = '';
  for (let i = 0; i < lines.length; i++) {
    const lineEl = renderObsidianLine(lines[i], i);
    container.appendChild(lineEl);
  }
}

function extractTextFromEditor(container: HTMLElement): string {
  const lines: string[] = [];
  for (let i = 0; i < container.childNodes.length; i++) {
    const node = container.childNodes[i];
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      if (el.childNodes.length === 1 && el.childNodes[0].nodeName === 'BR') {
        lines.push('');
      } else {
        lines.push(el.textContent || '');
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent || '';
      if (t) lines.push(t);
    }
  }
  return lines.join('\n');
}

function getCaretLineAndCol(container: HTMLElement): { lineIndex: number; col: number } | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.startContainer)) return null;

  let node: Node | null = range.startContainer;
  while (node && node.parentNode !== container) {
    node = node.parentNode;
  }
  if (!node) return null;

  const lineEl = node as HTMLElement;
  const lineIndex = Array.from(container.children).indexOf(lineEl);
  if (lineIndex === -1) return null;

  const preRange = document.createRange();
  preRange.selectNodeContents(lineEl);
  preRange.setEnd(range.startContainer, range.startOffset);
  const col = preRange.toString().length;

  return { lineIndex, col };
}

function setCaretLineAndCol(container: HTMLElement, lineIndex: number, col: number) {
  const sel = window.getSelection();
  if (!sel) return;

  const lines = container.children;
  if (lines.length === 0) return;

  const clampedLineIdx = Math.max(0, Math.min(lines.length - 1, lineIndex));
  const lineEl = lines[clampedLineIdx] as HTMLElement;
  if (!lineEl) return;

  if (lineEl.classList.contains('is-empty') || lineEl.textContent === '') {
    const range = document.createRange();
    range.selectNodeContents(lineEl);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    return;
  }

  let remaining = col;
  let targetNode: Node = lineEl;
  let targetOffset = 0;
  let found = false;

  const walker = document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT, null);
  let textNode = walker.nextNode();

  while (textNode) {
    const len = textNode.textContent?.length || 0;
    if (remaining <= len) {
      targetNode = textNode;
      targetOffset = remaining;
      found = true;
      break;
    }
    remaining -= len;
    targetNode = textNode;
    targetOffset = len;
    textNode = walker.nextNode();
  }

  const range = document.createRange();
  if (found) {
    range.setStart(targetNode, targetOffset);
    range.collapse(true);
  } else {
    range.selectNodeContents(lineEl);
    range.collapse(false);
  }

  sel.removeAllRanges();
  sel.addRange(range);
}

export function ObsidianSourceEditor({ value, onChange, placeholder, className }: ObsidianSourceEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);
  const lastValueRef = useRef(value);

  const syncDocument = (text: string) => {
    if (!editorRef.current) return;
    renderObsidianDocument(editorRef.current, text);
  };

  useEffect(() => {
    if (editorRef.current && value !== lastValueRef.current) {
      lastValueRef.current = value;
      syncDocument(value);
    }
  }, [value]);

  useEffect(() => {
    if (editorRef.current) {
      syncDocument(value);
    }
  }, []);

  const handleInput = () => {
    if (!editorRef.current || isComposingRef.current) return;
    const caret = getCaretLineAndCol(editorRef.current);
    const newText = extractTextFromEditor(editorRef.current);
    lastValueRef.current = newText;
    onChange(newText);
    renderObsidianDocument(editorRef.current, newText);
    if (caret) {
      setCaretLineAndCol(editorRef.current, caret.lineIndex, caret.col);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      document.execCommand('insertText', false, '  ');
      return;
    }

    if (e.key === 'Enter') {
      if (!editorRef.current) return;
      const caret = getCaretLineAndCol(editorRef.current);
      if (!caret) return;

      const lines = editorRef.current.children;
      const currentLineEl = lines[caret.lineIndex] as HTMLElement;
      if (!currentLineEl) return;

      const currentText = currentLineEl.textContent || '';
      const emptyBulletMatch = currentText.match(/^(\s*[-*+]\s*)$/);
      if (emptyBulletMatch && caret.col <= currentText.length) {
        e.preventDefault();
        const docText = extractTextFromEditor(editorRef.current);
        const allLines = docText.split('\n');
        allLines[caret.lineIndex] = '';
        const nextDoc = allLines.join('\n');
        lastValueRef.current = nextDoc;
        onChange(nextDoc);
        renderObsidianDocument(editorRef.current, nextDoc);
        setCaretLineAndCol(editorRef.current, caret.lineIndex, 0);
        return;
      }

      const activeBulletMatch = currentText.match(/^(\s*[-*+]\s+)/);
      if (activeBulletMatch && caret.col >= activeBulletMatch[1].length) {
        e.preventDefault();
        const bulletPrefix = activeBulletMatch[1];
        const docText = extractTextFromEditor(editorRef.current);
        const allLines = docText.split('\n');
        const beforeCaret = currentText.slice(0, caret.col);
        const afterCaret = currentText.slice(caret.col);
        allLines[caret.lineIndex] = beforeCaret;
        allLines.splice(caret.lineIndex + 1, 0, bulletPrefix + afterCaret);
        const nextDoc = allLines.join('\n');
        lastValueRef.current = nextDoc;
        onChange(nextDoc);
        renderObsidianDocument(editorRef.current, nextDoc);
        setCaretLineAndCol(editorRef.current, caret.lineIndex + 1, bulletPrefix.length);
        return;
      }
    }
  };

  const handlePaste = (e: ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain') || '';
    if (!text) return;
    document.execCommand('insertText', false, text);
  };

  const handleClick = (e: MouseEvent) => {
    if (e.target === editorRef.current && editorRef.current) {
      const lines = editorRef.current.children;
      if (lines.length > 0) {
        const lastLine = lines[lines.length - 1] as HTMLElement;
        const sel = window.getSelection();
        if (sel) {
          const range = document.createRange();
          range.selectNodeContents(lastLine);
          range.collapse(false);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }
  };

  return (
    <div
      ref={editorRef}
      className={`obsidian-source-editor ${className || ''}`}
      contentEditable
      spellcheck={false}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onClick={handleClick}
      onCompositionStart={() => { isComposingRef.current = true; }}
      onCompositionEnd={() => {
        isComposingRef.current = false;
        handleInput();
      }}
      data-placeholder={placeholder}
    />
  );
}
