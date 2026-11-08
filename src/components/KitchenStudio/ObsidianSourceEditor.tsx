import { useEffect, useRef } from 'preact/hooks';
import { escapeHtmlAttr } from '../../utils/html';

export { escapeHtmlAttr };

export interface ObsidianSourceEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

interface HistoryItem {
  text: string;
  lineIndex: number;
  col: number;
}

function tokenizeInlineText(parentEl: HTMLElement, text: string) {
  const tokenRegex = /(\[\[[^\n\]]+\]\]|\[[^\n\]]+\]\([^\n\)]+\)|\*\*\*[^\s*](?:[\s\S]*?[^\s*])?\*\*\*|\*\*[^\s*](?:[\s\S]*?[^\s*])?\*\*|\*[^\s*](?:[^*\n]*?[^\s*])?\*|`[^`\n]+`|<br\s*\/?>|\\+$)/gi;
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
    } else if (/^\[([^\n\]]+)\]\(([^\n\)]+)\)$/.test(tokenStr)) {
      const linkMatch = tokenStr.match(/^\[([^\n\]]+)\]\(([^\n\)]+)\)$/);
      if (linkMatch) {
        const linkText = linkMatch[1];
        const linkUrl = linkMatch[2];

        const openBracket = document.createElement('span');
        openBracket.className = 'obsidian-syntax-dim';
        openBracket.textContent = '[';
        parentEl.appendChild(openBracket);

        const linkSpan = document.createElement('span');
        linkSpan.className = 'obsidian-token-link';
        linkSpan.textContent = linkText;
        parentEl.appendChild(linkSpan);

        const midSyntax = document.createElement('span');
        midSyntax.className = 'obsidian-syntax-dim';
        midSyntax.textContent = '](';
        parentEl.appendChild(midSyntax);

        const urlSpan = document.createElement('span');
        urlSpan.className = 'obsidian-token-link-url';
        urlSpan.textContent = linkUrl;
        parentEl.appendChild(urlSpan);

        const closeParen = document.createElement('span');
        closeParen.className = 'obsidian-syntax-dim';
        closeParen.textContent = ')';
        parentEl.appendChild(closeParen);
      }
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
    } else if (/^<br\s*\/?>$/i.test(tokenStr) || /^\\+$/.test(tokenStr)) {
      const breakSpan = document.createElement('span');
      breakSpan.className = 'obsidian-syntax-dim';
      breakSpan.textContent = tokenStr;
      parentEl.appendChild(breakSpan);
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
  lineDiv.dataset.rawText = lineText;

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

function reconcileDocument(container: HTMLElement, docText: string) {
  const lines = docText.split('\n');

  while (container.children.length > lines.length) {
    container.removeChild(container.lastChild!);
  }

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    const existingLine = container.children[i] as HTMLElement | undefined;

    if (!existingLine) {
      const newLine = renderObsidianLine(lineText, i);
      container.appendChild(newLine);
    } else if (existingLine.dataset.rawText !== lineText) {
      const newLine = renderObsidianLine(lineText, i);
      container.replaceChild(newLine, existingLine);
    } else if (existingLine.dataset.lineIndex !== String(i)) {
      existingLine.dataset.lineIndex = String(i);
    }
  }
}

function extractTextFromEditor(container: HTMLElement): string {
  const lines: string[] = [];
  for (let i = 0; i < container.childNodes.length; i++) {
    const node = container.childNodes[i];
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const text = el.textContent || '';
      if (!text && (el.childNodes.length === 0 || (el.childNodes.length === 1 && el.childNodes[0].nodeName === 'BR'))) {
        lines.push('');
      } else {
        lines.push(text);
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

  const text = lineEl.textContent || '';
  if (!text) {
    return { lineIndex, col: 0 };
  }

  const preRange = document.createRange();
  preRange.selectNodeContents(lineEl);
  try {
    preRange.setEnd(range.startContainer, range.startOffset);
    return { lineIndex, col: preRange.toString().length };
  } catch {
    return { lineIndex, col: 0 };
  }
}

function setCaretLineAndCol(container: HTMLElement, lineIndex: number, col: number) {
  const sel = window.getSelection();
  if (!sel) return;

  const lines = container.children;
  if (lines.length === 0) return;

  const clampedLineIdx = Math.max(0, Math.min(lines.length - 1, lineIndex));
  const lineEl = lines[clampedLineIdx] as HTMLElement;
  if (!lineEl) return;

  if (document.activeElement !== container) {
    container.focus();
  }

  const text = lineEl.textContent || '';
  if (!text || lineEl.childNodes.length === 0) {
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
    if (remaining < len) {
      targetNode = textNode;
      targetOffset = remaining;
      found = true;
      break;
    } else if (remaining === len) {
      const next = walker.nextNode();
      if (next) {
        targetNode = next;
        targetOffset = 0;
      } else {
        targetNode = textNode;
        targetOffset = len;
      }
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

  // Undo / Redo history
  const historyRef = useRef<HistoryItem[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const isHistoryNavigatingRef = useRef(false);
  const lastHistoryPushTimeRef = useRef<number>(0);

  const handleUndo = () => {
    if (historyIndexRef.current > 0) {
      isHistoryNavigatingRef.current = true;
      historyIndexRef.current--;
      const target = historyRef.current[historyIndexRef.current];

      lastValueRef.current = target.text;
      onChange(target.text);

      if (editorRef.current) {
        const prevScrollTop = editorRef.current.scrollTop;
        reconcileDocument(editorRef.current, target.text);
        setCaretLineAndCol(editorRef.current, target.lineIndex, target.col);
        editorRef.current.scrollTop = prevScrollTop;
      }

      isHistoryNavigatingRef.current = false;
    }
  };

  const handleRedo = () => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      isHistoryNavigatingRef.current = true;
      historyIndexRef.current++;
      const target = historyRef.current[historyIndexRef.current];

      lastValueRef.current = target.text;
      onChange(target.text);

      if (editorRef.current) {
        const prevScrollTop = editorRef.current.scrollTop;
        reconcileDocument(editorRef.current, target.text);
        setCaretLineAndCol(editorRef.current, target.lineIndex, target.col);
        editorRef.current.scrollTop = prevScrollTop;
      }

      isHistoryNavigatingRef.current = false;
    }
  };

  useEffect(() => {
    if (editorRef.current && value !== lastValueRef.current) {
      lastValueRef.current = value;
      const prevScrollTop = editorRef.current.scrollTop;
      const caret = getCaretLineAndCol(editorRef.current);
      reconcileDocument(editorRef.current, value);
      if (caret) {
        setCaretLineAndCol(editorRef.current, caret.lineIndex, caret.col);
      }
      editorRef.current.scrollTop = prevScrollTop;
    }
  }, [value]);

  useEffect(() => {
    if (editorRef.current) {
      reconcileDocument(editorRef.current, value);
      historyRef.current = [{ text: value, lineIndex: 0, col: 0 }];
      historyIndexRef.current = 0;
    }
  }, []);

  const handleInput = () => {
    if (!editorRef.current || isComposingRef.current || isHistoryNavigatingRef.current) return;
    const caret = getCaretLineAndCol(editorRef.current);
    const newText = extractTextFromEditor(editorRef.current);

    lastValueRef.current = newText;
    onChange(newText);

    const now = Date.now();
    const curCaret = caret || { lineIndex: 0, col: 0 };
    if (now - lastHistoryPushTimeRef.current < 450 && historyIndexRef.current > 0) {
      historyRef.current[historyIndexRef.current] = {
        text: newText,
        lineIndex: curCaret.lineIndex,
        col: curCaret.col,
      };
    } else {
      if (historyIndexRef.current < historyRef.current.length - 1) {
        historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
      }
      historyRef.current.push({
        text: newText,
        lineIndex: curCaret.lineIndex,
        col: curCaret.col,
      });
      if (historyRef.current.length > 150) historyRef.current.shift();
      historyIndexRef.current = historyRef.current.length - 1;
    }
    lastHistoryPushTimeRef.current = now;

    const prevScrollTop = editorRef.current.scrollTop;
    const prevScrollLeft = editorRef.current.scrollLeft;

    reconcileDocument(editorRef.current, newText);
    if (caret) {
      setCaretLineAndCol(editorRef.current, caret.lineIndex, caret.col);
    }

    editorRef.current.scrollTop = prevScrollTop;
    editorRef.current.scrollLeft = prevScrollLeft;
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

    // Track starting cursor position before the very first key typed into document
    if (!isCmdOrCtrl && e.key.length === 1 && historyRef.current.length === 1 && editorRef.current) {
      const caret = getCaretLineAndCol(editorRef.current);
      if (caret && historyRef.current[0]) {
        historyRef.current[0].lineIndex = caret.lineIndex;
        historyRef.current[0].col = caret.col;
      }
    }

    // Undo / Redo
    if (isCmdOrCtrl && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) {
        handleRedo();
      } else {
        handleUndo();
      }
      return;
    }
    if (isCmdOrCtrl && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      handleRedo();
      return;
    }

    // Shift + 8 (*): Wrap selection with asterisks and select the wrapped content
    if (e.key === '*' || (e.shiftKey && (e.key === '8' || e.code === 'Digit8'))) {
      const sel = window.getSelection();
      if (sel && !sel.isCollapsed && sel.rangeCount > 0 && editorRef.current) {
        const range = sel.getRangeAt(0);
        if (editorRef.current.contains(range.commonAncestorContainer)) {
          const selectedText = sel.toString();
          if (selectedText) {
            e.preventDefault();
            const wrapped = `*${selectedText}*`;
            document.execCommand('insertText', false, wrapped);

            // Reselect the newly inserted wrapped text so pressing again wraps it again
            const activeSel = window.getSelection();
            if (activeSel && activeSel.rangeCount > 0) {
              for (let i = 0; i < wrapped.length; i++) {
                activeSel.modify('extend', 'backward', 'character');
              }
            }
            return;
          }
        }
      }
    }

    // Ctrl + Backspace: Word deletion backwards without jumping to head
    if (isCmdOrCtrl && e.key === 'Backspace') {
      e.preventDefault();
      if (!editorRef.current) return;
      const caret = getCaretLineAndCol(editorRef.current);
      if (!caret) return;

      const docText = extractTextFromEditor(editorRef.current);
      const lines = docText.split('\n');
      const line = lines[caret.lineIndex] || '';

      if (caret.col === 0) {
        if (caret.lineIndex > 0) {
          const prevLine = lines[caret.lineIndex - 1] || '';
          const newCol = prevLine.length;
          lines[caret.lineIndex - 1] = prevLine + line;
          lines.splice(caret.lineIndex, 1);

          const nextDoc = lines.join('\n');
          lastValueRef.current = nextDoc;
          onChange(nextDoc);

          const prevScrollTop = editorRef.current.scrollTop;
          reconcileDocument(editorRef.current, nextDoc);
          setCaretLineAndCol(editorRef.current, caret.lineIndex - 1, newCol);
          editorRef.current.scrollTop = prevScrollTop;
        }
        return;
      }

      const beforeCaret = line.slice(0, caret.col);
      const afterCaret = line.slice(caret.col);
      const match = beforeCaret.match(/(\s+|[^\s\w]+|\w+)\s*$/);
      const deleteCount = match ? match[0].length : 1;
      const newBefore = beforeCaret.slice(0, beforeCaret.length - deleteCount);
      const newCol = newBefore.length;
      lines[caret.lineIndex] = newBefore + afterCaret;

      const nextDoc = lines.join('\n');
      lastValueRef.current = nextDoc;
      onChange(nextDoc);

      const prevScrollTop = editorRef.current.scrollTop;
      reconcileDocument(editorRef.current, nextDoc);
      setCaretLineAndCol(editorRef.current, caret.lineIndex, newCol);
      editorRef.current.scrollTop = prevScrollTop;
      return;
    }

    // Ctrl + Delete: Word deletion forwards
    if (isCmdOrCtrl && e.key === 'Delete') {
      e.preventDefault();
      if (!editorRef.current) return;
      const caret = getCaretLineAndCol(editorRef.current);
      if (!caret) return;

      const docText = extractTextFromEditor(editorRef.current);
      const lines = docText.split('\n');
      const line = lines[caret.lineIndex] || '';

      if (caret.col >= line.length) {
        if (caret.lineIndex < lines.length - 1) {
          lines[caret.lineIndex] = line + (lines[caret.lineIndex + 1] || '');
          lines.splice(caret.lineIndex + 1, 1);

          const nextDoc = lines.join('\n');
          lastValueRef.current = nextDoc;
          onChange(nextDoc);

          const prevScrollTop = editorRef.current.scrollTop;
          reconcileDocument(editorRef.current, nextDoc);
          setCaretLineAndCol(editorRef.current, caret.lineIndex, caret.col);
          editorRef.current.scrollTop = prevScrollTop;
        }
        return;
      }

      const beforeCaret = line.slice(0, caret.col);
      const afterCaret = line.slice(caret.col);
      const match = afterCaret.match(/^\s*(\s+|[^\s\w]+|\w+)/);
      const deleteCount = match ? match[0].length : 1;
      const newAfter = afterCaret.slice(deleteCount);
      lines[caret.lineIndex] = beforeCaret + newAfter;

      const nextDoc = lines.join('\n');
      lastValueRef.current = nextDoc;
      onChange(nextDoc);

      const prevScrollTop = editorRef.current.scrollTop;
      reconcileDocument(editorRef.current, nextDoc);
      setCaretLineAndCol(editorRef.current, caret.lineIndex, caret.col);
      editorRef.current.scrollTop = prevScrollTop;
      return;
    }

    // Tab / Shift+Tab indentation
    if (e.key === 'Tab') {
      e.preventDefault();
      if (!editorRef.current) return;
      const caret = getCaretLineAndCol(editorRef.current);
      if (!caret) return;

      const docText = extractTextFromEditor(editorRef.current);
      const lines = docText.split('\n');
      const line = lines[caret.lineIndex] || '';

      if (e.shiftKey) {
        if (line.startsWith('  ')) {
          lines[caret.lineIndex] = line.slice(2);
          const newCol = Math.max(0, caret.col - 2);
          const nextDoc = lines.join('\n');
          lastValueRef.current = nextDoc;
          onChange(nextDoc);

          const prevScrollTop = editorRef.current.scrollTop;
          reconcileDocument(editorRef.current, nextDoc);
          setCaretLineAndCol(editorRef.current, caret.lineIndex, newCol);
          editorRef.current.scrollTop = prevScrollTop;
        }
      } else {
        const beforeCaret = line.slice(0, caret.col);
        const afterCaret = line.slice(caret.col);
        lines[caret.lineIndex] = beforeCaret + '  ' + afterCaret;
        const newCol = caret.col + 2;

        const nextDoc = lines.join('\n');
        lastValueRef.current = nextDoc;
        onChange(nextDoc);

        const prevScrollTop = editorRef.current.scrollTop;
        reconcileDocument(editorRef.current, nextDoc);
        setCaretLineAndCol(editorRef.current, caret.lineIndex, newCol);
        editorRef.current.scrollTop = prevScrollTop;
      }
      return;
    }

    // Backspace at line head (merge with previous line)
    if (e.key === 'Backspace' && !isCmdOrCtrl && !e.altKey) {
      if (!editorRef.current) return;
      const caret = getCaretLineAndCol(editorRef.current);
      if (caret && caret.col === 0 && caret.lineIndex > 0) {
        e.preventDefault();
        const docText = extractTextFromEditor(editorRef.current);
        const lines = docText.split('\n');
        const prevLine = lines[caret.lineIndex - 1] || '';
        const currentLine = lines[caret.lineIndex] || '';
        const targetCol = prevLine.length;

        lines[caret.lineIndex - 1] = prevLine + currentLine;
        lines.splice(caret.lineIndex, 1);

        const nextDoc = lines.join('\n');
        lastValueRef.current = nextDoc;
        onChange(nextDoc);

        const prevScrollTop = editorRef.current.scrollTop;
        reconcileDocument(editorRef.current, nextDoc);
        setCaretLineAndCol(editorRef.current, caret.lineIndex - 1, targetCol);
        editorRef.current.scrollTop = prevScrollTop;
        return;
      }
    }

    // Enter: smart lists & line splitting
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!editorRef.current) return;
      const caret = getCaretLineAndCol(editorRef.current);
      if (!caret) return;

      const docText = extractTextFromEditor(editorRef.current);
      const lines = docText.split('\n');
      const currentLine = lines[caret.lineIndex] || '';

      const emptyBulletMatch = currentLine.match(/^(\s*[-*+]\s*|\s*\d+\.\s*)$/);
      if (emptyBulletMatch) {
        lines[caret.lineIndex] = '';
        const nextDoc = lines.join('\n');
        lastValueRef.current = nextDoc;
        onChange(nextDoc);

        const prevScrollTop = editorRef.current.scrollTop;
        reconcileDocument(editorRef.current, nextDoc);
        setCaretLineAndCol(editorRef.current, caret.lineIndex, 0);
        editorRef.current.scrollTop = prevScrollTop;
        return;
      }

      const bulletMatch = currentLine.match(/^(\s*[-*+]\s+)/);
      const numMatch = currentLine.match(/^(\s*)(\d+)(\.\s+)/);

      let prefix = '';
      if (bulletMatch && caret.col >= bulletMatch[1].length) {
        prefix = bulletMatch[1];
      } else if (numMatch && caret.col >= (numMatch[1].length + numMatch[2].length + numMatch[3].length)) {
        const nextNum = parseInt(numMatch[2], 10) + 1;
        prefix = `${numMatch[1]}${nextNum}${numMatch[3]}`;
      }

      const beforeCaret = currentLine.slice(0, caret.col);
      const afterCaret = currentLine.slice(caret.col);
      lines[caret.lineIndex] = beforeCaret;
      lines.splice(caret.lineIndex + 1, 0, prefix + afterCaret);

      const nextDoc = lines.join('\n');
      const targetLine = caret.lineIndex + 1;
      const targetCol = prefix.length;

      lastValueRef.current = nextDoc;
      onChange(nextDoc);

      const prevScrollTop = editorRef.current.scrollTop;
      reconcileDocument(editorRef.current, nextDoc);
      setCaretLineAndCol(editorRef.current, targetLine, targetCol);
      editorRef.current.scrollTop = prevScrollTop;
      return;
    }
  };

  const handlePaste = (e: ClipboardEvent) => {
    e.preventDefault();
    if (!editorRef.current) return;
    const text = e.clipboardData?.getData('text/plain') || '';
    if (!text) return;

    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const caret = getCaretLineAndCol(editorRef.current) || { lineIndex: 0, col: 0 };
    const docText = extractTextFromEditor(editorRef.current);
    const lines = docText.split('\n');

    while (lines.length <= caret.lineIndex) {
      lines.push('');
    }

    const currentLine = lines[caret.lineIndex] || '';
    const beforeCaret = currentLine.slice(0, caret.col);
    const afterCaret = currentLine.slice(caret.col);

    const pastedLines = normalized.split('\n');
    let targetLineIndex = caret.lineIndex;
    let targetCol = 0;

    if (pastedLines.length === 1) {
      lines[caret.lineIndex] = beforeCaret + pastedLines[0] + afterCaret;
      targetCol = beforeCaret.length + pastedLines[0].length;
    } else {
      lines[caret.lineIndex] = beforeCaret + pastedLines[0];
      for (let i = 1; i < pastedLines.length - 1; i++) {
        lines.splice(caret.lineIndex + i, 0, pastedLines[i]);
      }
      const lastPasted = pastedLines[pastedLines.length - 1];
      lines.splice(caret.lineIndex + pastedLines.length - 1, 0, lastPasted + afterCaret);
      targetLineIndex = caret.lineIndex + pastedLines.length - 1;
      targetCol = lastPasted.length;
    }

    const nextDoc = lines.join('\n');
    lastValueRef.current = nextDoc;
    onChange(nextDoc);

    const prevScrollTop = editorRef.current.scrollTop;
    reconcileDocument(editorRef.current, nextDoc);
    setCaretLineAndCol(editorRef.current, targetLineIndex, targetCol);
    editorRef.current.scrollTop = prevScrollTop;
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
