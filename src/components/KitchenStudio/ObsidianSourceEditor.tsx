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

function getPointLineAndCol(container: HTMLElement, node: Node, offset: number): { lineIndex: number; col: number } | null {
  if (!container.contains(node) && node !== container) return null;

  if (node === container) {
    return null;
  }

  let lineNode: Node | null = node;
  while (lineNode && lineNode.parentNode !== container) {
    lineNode = lineNode.parentNode;
  }
  if (!lineNode) return null;

  const lineEl = lineNode as HTMLElement;
  const lineIndex = Array.from(container.children).indexOf(lineEl);
  if (lineIndex === -1) return null;

  const text = lineEl.textContent || '';
  if (!text) return { lineIndex, col: 0 };

  try {
    const preRange = document.createRange();
    preRange.selectNodeContents(lineEl);
    preRange.setEnd(node, offset);
    return { lineIndex, col: preRange.toString().length };
  } catch {
    return null;
  }
}

export interface EditorSelection {
  startLine: number;
  startCol: number;
  endLine: number;
  endCol: number;
  isCollapsed: boolean;
}

export function getEditorSelection(container: HTMLElement): EditorSelection | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);

  const start = getPointLineAndCol(container, range.startContainer, range.startOffset);
  const end = getPointLineAndCol(container, range.endContainer, range.endOffset);

  if (!start && !end) return null;
  if (!start) return { ...end!, startLine: end!.lineIndex, startCol: end!.col, endLine: end!.lineIndex, endCol: end!.col, isCollapsed: true };
  if (!end) return { ...start, startLine: start.lineIndex, startCol: start.col, endLine: start.lineIndex, endCol: start.col, isCollapsed: true };

  const isCollapsed = range.collapsed || (start.lineIndex === end.lineIndex && start.col === end.col);

  return {
    startLine: start.lineIndex,
    startCol: start.col,
    endLine: end.lineIndex,
    endCol: end.col,
    isCollapsed
  };
}

function findNodeAndOffset(lineEl: HTMLElement, col: number): { node: Node; offset: number } {
  const walker = document.createTreeWalker(lineEl, NodeFilter.SHOW_TEXT, null);
  let textNode = walker.nextNode();
  let remaining = col;
  let lastTextNode: Node | null = null;

  while (textNode) {
    lastTextNode = textNode;
    const len = textNode.textContent?.length || 0;
    if (remaining < len) {
      return { node: textNode, offset: remaining };
    }
    remaining -= len;
    textNode = walker.nextNode();
  }

  if (lastTextNode) {
    return { node: lastTextNode, offset: lastTextNode.textContent?.length || 0 };
  }
  return { node: lineEl, offset: 0 };
}

export function setEditorSelection(
  container: HTMLElement,
  startLine: number,
  startCol: number,
  endLine: number = startLine,
  endCol: number = startCol
) {
  const sel = window.getSelection();
  if (!sel) return;

  const lines = container.children;
  if (lines.length === 0) return;

  const clampedStartLine = Math.max(0, Math.min(lines.length - 1, startLine));
  const clampedEndLine = Math.max(0, Math.min(lines.length - 1, endLine));

  const startLineEl = lines[clampedStartLine] as HTMLElement;
  const endLineEl = lines[clampedEndLine] as HTMLElement;
  if (!startLineEl || !endLineEl) return;

  if (document.activeElement !== container) {
    container.focus();
  }

  const startPoint = findNodeAndOffset(startLineEl, startCol);
  const endPoint = (clampedStartLine === clampedEndLine && startCol === endCol)
    ? startPoint
    : findNodeAndOffset(endLineEl, endCol);

  const range = document.createRange();
  range.setStart(startPoint.node, startPoint.offset);
  if (clampedStartLine === clampedEndLine && startCol === endCol) {
    range.collapse(true);
  } else {
    range.setEnd(endPoint.node, endPoint.offset);
  }

  sel.removeAllRanges();
  sel.addRange(range);
}

function deleteSelectionFromDoc(
  docText: string,
  selection: EditorSelection
): { nextDoc: string; targetLine: number; targetCol: number } {
  const lines = docText.split('\n');
  const { startLine, startCol, endLine, endCol } = selection;

  if (startLine === endLine) {
    const line = lines[startLine] || '';
    lines[startLine] = line.slice(0, startCol) + line.slice(endCol);
    return {
      nextDoc: lines.join('\n'),
      targetLine: startLine,
      targetCol: startCol
    };
  }

  const firstLine = lines[startLine] || '';
  const lastLine = lines[endLine] || '';
  lines[startLine] = firstLine.slice(0, startCol) + lastLine.slice(endCol);
  lines.splice(startLine + 1, endLine - startLine);

  return {
    nextDoc: lines.join('\n'),
    targetLine: startLine,
    targetCol: startCol
  };
}

export function setCaretLineAndCol(container: HTMLElement, lineIndex: number, col: number) {
  setEditorSelection(container, lineIndex, col);
}

export function getCaretLineAndCol(container: HTMLElement): { lineIndex: number; col: number } | null {
  const sel = getEditorSelection(container);
  if (!sel) return null;
  return { lineIndex: sel.startLine, col: sel.startCol };
}

export function ObsidianSourceEditor({ value, onChange, placeholder, className }: ObsidianSourceEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const isComposingRef = useRef(false);
  const lastValueRef = useRef(value);
  const pendingEmittedValuesRef = useRef<string[]>([]);
  const lastSelectionRef = useRef<EditorSelection | null>(null);

  const getActiveSelection = (): EditorSelection | null => {
    if (!editorRef.current) return null;
    const current = getEditorSelection(editorRef.current);
    if (current) {
      lastSelectionRef.current = current;
      return current;
    }
    return lastSelectionRef.current;
  };

  // Undo / Redo history
  const historyRef = useRef<HistoryItem[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const isHistoryNavigatingRef = useRef(false);
  const lastHistoryPushTimeRef = useRef<number>(0);

  const applyDocUpdate = (
    nextDoc: string,
    targetLine: number,
    targetCol: number,
    endTargetLine?: number,
    endTargetCol?: number
  ) => {
    if (!editorRef.current) return;
    lastValueRef.current = nextDoc;
    pendingEmittedValuesRef.current.push(nextDoc);
    if (pendingEmittedValuesRef.current.length > 300) {
      pendingEmittedValuesRef.current.shift();
    }
    onChange(nextDoc);

    lastSelectionRef.current = {
      startLine: targetLine,
      startCol: targetCol,
      endLine: endTargetLine ?? targetLine,
      endCol: endTargetCol ?? targetCol,
      isCollapsed: (endTargetLine === undefined || endTargetLine === targetLine) &&
                   (endTargetCol === undefined || endTargetCol === targetCol)
    };

    const now = Date.now();
    if (now - lastHistoryPushTimeRef.current < 450 && historyIndexRef.current > 0) {
      historyRef.current[historyIndexRef.current] = {
        text: nextDoc,
        lineIndex: targetLine,
        col: targetCol
      };
    } else {
      if (historyIndexRef.current < historyRef.current.length - 1) {
        historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
      }
      historyRef.current.push({
        text: nextDoc,
        lineIndex: targetLine,
        col: targetCol
      });
      if (historyRef.current.length > 150) historyRef.current.shift();
      historyIndexRef.current = historyRef.current.length - 1;
    }
    lastHistoryPushTimeRef.current = now;

    const prevScrollTop = editorRef.current.scrollTop;
    const prevScrollLeft = editorRef.current.scrollLeft;

    reconcileDocument(editorRef.current, nextDoc);
    setEditorSelection(
      editorRef.current,
      targetLine,
      targetCol,
      endTargetLine ?? targetLine,
      endTargetCol ?? targetCol
    );

    editorRef.current.scrollTop = prevScrollTop;
    editorRef.current.scrollLeft = prevScrollLeft;
  };

  const handleUndo = () => {
    if (historyIndexRef.current > 0) {
      isHistoryNavigatingRef.current = true;
      historyIndexRef.current--;
      const target = historyRef.current[historyIndexRef.current];

      lastValueRef.current = target.text;
      pendingEmittedValuesRef.current.push(target.text);
      if (pendingEmittedValuesRef.current.length > 300) {
        pendingEmittedValuesRef.current.shift();
      }
      onChange(target.text);

      if (editorRef.current) {
        const prevScrollTop = editorRef.current.scrollTop;
        reconcileDocument(editorRef.current, target.text);
        setEditorSelection(editorRef.current, target.lineIndex, target.col);
        lastSelectionRef.current = {
          startLine: target.lineIndex,
          startCol: target.col,
          endLine: target.lineIndex,
          endCol: target.col,
          isCollapsed: true
        };
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
      pendingEmittedValuesRef.current.push(target.text);
      if (pendingEmittedValuesRef.current.length > 300) {
        pendingEmittedValuesRef.current.shift();
      }
      onChange(target.text);

      if (editorRef.current) {
        const prevScrollTop = editorRef.current.scrollTop;
        reconcileDocument(editorRef.current, target.text);
        setEditorSelection(editorRef.current, target.lineIndex, target.col);
        lastSelectionRef.current = {
          startLine: target.lineIndex,
          startCol: target.col,
          endLine: target.lineIndex,
          endCol: target.col,
          isCollapsed: true
        };
        editorRef.current.scrollTop = prevScrollTop;
      }

      isHistoryNavigatingRef.current = false;
    }
  };

  useEffect(() => {
    if (!editorRef.current) return;

    // Check if this incoming value is an echo of an internal change emitted by this editor
    const echoIdx = pendingEmittedValuesRef.current.indexOf(value);
    if (echoIdx !== -1) {
      pendingEmittedValuesRef.current.splice(0, echoIdx + 1);
      return;
    }

    if (value === lastValueRef.current) return;

    // Truly external change (e.g. recipe switch, discard, external state change)
    lastValueRef.current = value;
    pendingEmittedValuesRef.current = [];
    const prevScrollTop = editorRef.current.scrollTop;
    const selection = getEditorSelection(editorRef.current);
    reconcileDocument(editorRef.current, value);
    if (selection) {
      setEditorSelection(
        editorRef.current,
        selection.startLine,
        selection.startCol,
        selection.endLine,
        selection.endCol
      );
      lastSelectionRef.current = selection;
    }
    editorRef.current.scrollTop = prevScrollTop;
  }, [value]);

  useEffect(() => {
    if (editorRef.current) {
      reconcileDocument(editorRef.current, value);
      historyRef.current = [{ text: value, lineIndex: 0, col: 0 }];
      historyIndexRef.current = 0;
      lastSelectionRef.current = { startLine: 0, startCol: 0, endLine: 0, endCol: 0, isCollapsed: true };
    }
  }, []);

  const handleInput = () => {
    if (!editorRef.current || isComposingRef.current || isHistoryNavigatingRef.current) return;
    const selection = getEditorSelection(editorRef.current);
    const newText = extractTextFromEditor(editorRef.current);

    lastValueRef.current = newText;
    pendingEmittedValuesRef.current.push(newText);
    if (pendingEmittedValuesRef.current.length > 300) {
      pendingEmittedValuesRef.current.shift();
    }
    onChange(newText);

    const now = Date.now();
    const curLine = selection ? selection.startLine : 0;
    const curCol = selection ? selection.startCol : 0;
    if (selection) {
      lastSelectionRef.current = selection;
    }
    if (now - lastHistoryPushTimeRef.current < 450 && historyIndexRef.current > 0) {
      historyRef.current[historyIndexRef.current] = {
        text: newText,
        lineIndex: curLine,
        col: curCol,
      };
    } else {
      if (historyIndexRef.current < historyRef.current.length - 1) {
        historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
      }
      historyRef.current.push({
        text: newText,
        lineIndex: curLine,
        col: curCol,
      });
      if (historyRef.current.length > 150) historyRef.current.shift();
      historyIndexRef.current = historyRef.current.length - 1;
    }
    lastHistoryPushTimeRef.current = now;

    const prevScrollTop = editorRef.current.scrollTop;
    const prevScrollLeft = editorRef.current.scrollLeft;

    reconcileDocument(editorRef.current, newText);
    if (selection) {
      setEditorSelection(
        editorRef.current,
        selection.startLine,
        selection.startCol,
        selection.endLine,
        selection.endCol
      );
    }

    editorRef.current.scrollTop = prevScrollTop;
    editorRef.current.scrollLeft = prevScrollLeft;
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

    // Track starting cursor position before the very first key typed into document
    if (!isCmdOrCtrl && e.key.length === 1 && historyRef.current.length === 1 && editorRef.current) {
      const selection = getEditorSelection(editorRef.current);
      if (selection && historyRef.current[0]) {
        historyRef.current[0].lineIndex = selection.startLine;
        historyRef.current[0].col = selection.startCol;
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

    // Shift + 8 (*): Wrap selection with asterisks
    if (e.key === '*' || (e.shiftKey && (e.key === '8' || e.code === 'Digit8'))) {
      const selection = getActiveSelection();
      if (selection && !selection.isCollapsed && editorRef.current) {
        e.preventDefault();
        const docText = lastValueRef.current;
        const lines = docText.split('\n');
        if (selection.startLine === selection.endLine) {
          const line = lines[selection.startLine] || '';
          const before = line.slice(0, selection.startCol);
          const selText = line.slice(selection.startCol, selection.endCol);
          const after = line.slice(selection.endCol);
          lines[selection.startLine] = `${before}*${selText}*${after}`;
          applyDocUpdate(
            lines.join('\n'),
            selection.startLine,
            selection.startCol + 1,
            selection.endLine,
            selection.endCol + 1
          );
          return;
        }
      }
    }

    // Replace selected text when typing normal printable characters
    if (!isCmdOrCtrl && !e.altKey && e.key.length === 1) {
      const selection = getActiveSelection();
      if (selection && !selection.isCollapsed && editorRef.current) {
        e.preventDefault();
        const docText = lastValueRef.current;
        const res = deleteSelectionFromDoc(docText, selection);
        const lines = res.nextDoc.split('\n');
        const line = lines[res.targetLine] || '';
        lines[res.targetLine] = line.slice(0, res.targetCol) + e.key + line.slice(res.targetCol);
        applyDocUpdate(lines.join('\n'), res.targetLine, res.targetCol + 1);
        return;
      }
    }

    // Ctrl + Backspace: Word deletion backwards
    if (isCmdOrCtrl && e.key === 'Backspace') {
      if (!editorRef.current) return;
      e.preventDefault();
      const selection = getActiveSelection();
      if (!selection) return;

      const docText = lastValueRef.current;
      if (!selection.isCollapsed) {
        const res = deleteSelectionFromDoc(docText, selection);
        applyDocUpdate(res.nextDoc, res.targetLine, res.targetCol);
        return;
      }

      const lines = docText.split('\n');
      const { startLine, startCol } = selection;
      const line = lines[startLine] || '';

      if (startCol === 0) {
        if (startLine > 0) {
          const prevLine = lines[startLine - 1] || '';
          const targetCol = prevLine.length;
          lines[startLine - 1] = prevLine + line;
          lines.splice(startLine, 1);
          applyDocUpdate(lines.join('\n'), startLine - 1, targetCol);
        }
        return;
      }

      const beforeCaret = line.slice(0, startCol);
      const afterCaret = line.slice(startCol);
      const match = beforeCaret.match(/(\s+|[^\s\w]+|\w+)\s*$/);
      const deleteCount = match ? match[0].length : 1;
      const newBefore = beforeCaret.slice(0, beforeCaret.length - deleteCount);
      lines[startLine] = newBefore + afterCaret;
      applyDocUpdate(lines.join('\n'), startLine, newBefore.length);
      return;
    }

    // Ctrl + Delete: Word deletion forwards
    if (isCmdOrCtrl && e.key === 'Delete') {
      if (!editorRef.current) return;
      e.preventDefault();
      const selection = getActiveSelection();
      if (!selection) return;

      const docText = lastValueRef.current;
      if (!selection.isCollapsed) {
        const res = deleteSelectionFromDoc(docText, selection);
        applyDocUpdate(res.nextDoc, res.targetLine, res.targetCol);
        return;
      }

      const lines = docText.split('\n');
      const { startLine, startCol } = selection;
      const line = lines[startLine] || '';

      if (startCol >= line.length) {
        if (startLine < lines.length - 1) {
          lines[startLine] = line + (lines[startLine + 1] || '');
          lines.splice(startLine + 1, 1);
          applyDocUpdate(lines.join('\n'), startLine, startCol);
        }
        return;
      }

      const beforeCaret = line.slice(0, startCol);
      const afterCaret = line.slice(startCol);
      const match = afterCaret.match(/^\s*(\s+|[^\s\w]+|\w+)/);
      const deleteCount = match ? match[0].length : 1;
      lines[startLine] = beforeCaret + afterCaret.slice(deleteCount);
      applyDocUpdate(lines.join('\n'), startLine, startCol);
      return;
    }

    // Backspace: Atomic in-string deletion (eliminates browser span/div destruction)
    if (e.key === 'Backspace' && !isCmdOrCtrl && !e.altKey) {
      if (!editorRef.current) return;
      e.preventDefault();
      const selection = getActiveSelection();
      if (!selection) return;

      const docText = lastValueRef.current;

      if (!selection.isCollapsed) {
        const res = deleteSelectionFromDoc(docText, selection);
        applyDocUpdate(res.nextDoc, res.targetLine, res.targetCol);
        return;
      }

      const lines = docText.split('\n');
      const { startLine, startCol } = selection;

      if (startCol === 0) {
        if (startLine > 0) {
          const prevLine = lines[startLine - 1] || '';
          const currentLine = lines[startLine] || '';
          const targetCol = prevLine.length;
          lines[startLine - 1] = prevLine + currentLine;
          lines.splice(startLine, 1);
          applyDocUpdate(lines.join('\n'), startLine - 1, targetCol);
        }
        return;
      }

      const line = lines[startLine] || '';
      lines[startLine] = line.slice(0, Math.max(0, startCol - 1)) + line.slice(startCol);
      applyDocUpdate(lines.join('\n'), startLine, Math.max(0, startCol - 1));
      return;
    }

    // Forward Delete: Atomic in-string deletion
    if (e.key === 'Delete' && !isCmdOrCtrl && !e.altKey) {
      if (!editorRef.current) return;
      e.preventDefault();
      const selection = getActiveSelection();
      if (!selection) return;

      const docText = lastValueRef.current;

      if (!selection.isCollapsed) {
        const res = deleteSelectionFromDoc(docText, selection);
        applyDocUpdate(res.nextDoc, res.targetLine, res.targetCol);
        return;
      }

      const lines = docText.split('\n');
      const { startLine, startCol } = selection;
      const line = lines[startLine] || '';

      if (startCol < line.length) {
        lines[startLine] = line.slice(0, startCol) + line.slice(startCol + 1);
        applyDocUpdate(lines.join('\n'), startLine, startCol);
        return;
      }

      if (startCol >= line.length && startLine < lines.length - 1) {
        lines[startLine] = line + (lines[startLine + 1] || '');
        lines.splice(startLine + 1, 1);
        applyDocUpdate(lines.join('\n'), startLine, startCol);
        return;
      }
      return;
    }

    // Tab / Shift+Tab indentation (supports single line and multi-line block selections)
    if (e.key === 'Tab') {
      e.preventDefault();
      if (!editorRef.current) return;
      const selection = getActiveSelection();
      if (!selection) return;

      const docText = lastValueRef.current;
      const lines = docText.split('\n');

      if (!selection.isCollapsed && selection.startLine < selection.endLine) {
        let startColAdjust = 0;
        let endColAdjust = 0;

        for (let i = selection.startLine; i <= selection.endLine; i++) {
          const line = lines[i] || '';
          if (e.shiftKey) {
            if (line.startsWith('  ')) {
              lines[i] = line.slice(2);
              if (i === selection.startLine) startColAdjust = -Math.min(2, selection.startCol);
              if (i === selection.endLine) endColAdjust = -Math.min(2, selection.endCol);
            } else if (line.startsWith(' ')) {
              lines[i] = line.slice(1);
              if (i === selection.startLine) startColAdjust = -Math.min(1, selection.startCol);
              if (i === selection.endLine) endColAdjust = -Math.min(1, selection.endCol);
            }
          } else {
            lines[i] = '  ' + line;
            if (i === selection.startLine) startColAdjust = 2;
            if (i === selection.endLine) endColAdjust = 2;
          }
        }

        const nextDoc = lines.join('\n');
        applyDocUpdate(
          nextDoc,
          selection.startLine,
          Math.max(0, selection.startCol + startColAdjust),
          selection.endLine,
          Math.max(0, selection.endCol + endColAdjust)
        );
        return;
      }

      // Single line tab
      const line = lines[selection.startLine] || '';
      if (e.shiftKey) {
        if (line.startsWith('  ')) {
          lines[selection.startLine] = line.slice(2);
          applyDocUpdate(lines.join('\n'), selection.startLine, Math.max(0, selection.startCol - 2));
        } else if (line.startsWith(' ')) {
          lines[selection.startLine] = line.slice(1);
          applyDocUpdate(lines.join('\n'), selection.startLine, Math.max(0, selection.startCol - 1));
        }
      } else {
        if (!selection.isCollapsed) {
          const res = deleteSelectionFromDoc(docText, selection);
          const resLines = res.nextDoc.split('\n');
          const cur = resLines[res.targetLine] || '';
          resLines[res.targetLine] = cur.slice(0, res.targetCol) + '  ' + cur.slice(res.targetCol);
          applyDocUpdate(resLines.join('\n'), res.targetLine, res.targetCol + 2);
        } else {
          const before = line.slice(0, selection.startCol);
          const after = line.slice(selection.startCol);
          lines[selection.startLine] = before + '  ' + after;
          applyDocUpdate(lines.join('\n'), selection.startLine, selection.startCol + 2);
        }
      }
      return;
    }

    // Enter: smart lists & line splitting (replaces selected range if not collapsed)
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!editorRef.current) return;
      const selection = getActiveSelection();
      if (!selection) return;

      let docText = lastValueRef.current;
      let curLine = selection.startLine;
      let curCol = selection.startCol;

      if (!selection.isCollapsed) {
        const res = deleteSelectionFromDoc(docText, selection);
        docText = res.nextDoc;
        curLine = res.targetLine;
        curCol = res.targetCol;
      }

      const lines = docText.split('\n');
      const currentLine = lines[curLine] || '';

      const emptyBulletMatch = currentLine.match(/^(\s*[-*+]\s*|\s*\d+\.\s*)$/);
      if (emptyBulletMatch) {
        lines[curLine] = '';
        applyDocUpdate(lines.join('\n'), curLine, 0);
        return;
      }

      const bulletMatch = currentLine.match(/^(\s*[-*+]\s+)/);
      const numMatch = currentLine.match(/^(\s*)(\d+)(\.\s+)/);

      let prefix = '';
      if (bulletMatch && curCol >= bulletMatch[1].length) {
        prefix = bulletMatch[1];
      } else if (numMatch && curCol >= (numMatch[1].length + numMatch[2].length + numMatch[3].length)) {
        const nextNum = parseInt(numMatch[2], 10) + 1;
        prefix = `${numMatch[1]}${nextNum}${numMatch[3]}`;
      }

      const beforeCaret = currentLine.slice(0, curCol);
      const afterCaret = currentLine.slice(curCol);
      lines[curLine] = beforeCaret;
      lines.splice(curLine + 1, 0, prefix + afterCaret);

      applyDocUpdate(lines.join('\n'), curLine + 1, prefix.length);
      return;
    }
  };

  const handleCut = (e: ClipboardEvent) => {
    if (!editorRef.current) return;
    const selection = getActiveSelection();
    if (!selection || selection.isCollapsed) return;

    e.preventDefault();
    const docText = lastValueRef.current;
    const lines = docText.split('\n');

    let cutText = '';
    if (selection.startLine === selection.endLine) {
      cutText = (lines[selection.startLine] || '').slice(selection.startCol, selection.endCol);
    } else {
      const parts = [
        (lines[selection.startLine] || '').slice(selection.startCol),
        ...lines.slice(selection.startLine + 1, selection.endLine),
        (lines[selection.endLine] || '').slice(0, selection.endCol)
      ];
      cutText = parts.join('\n');
    }

    if (e.clipboardData) {
      e.clipboardData.setData('text/plain', cutText);
    }

    const res = deleteSelectionFromDoc(docText, selection);
    applyDocUpdate(res.nextDoc, res.targetLine, res.targetCol);
  };

  const handlePaste = (e: ClipboardEvent) => {
    e.preventDefault();
    if (!editorRef.current) return;
    const text = e.clipboardData?.getData('text/plain') || '';
    if (!text) return;

    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    let selection = getActiveSelection();
    if (!selection) selection = { startLine: 0, startCol: 0, endLine: 0, endCol: 0, isCollapsed: true };

    let docText = lastValueRef.current;
    let targetLine = selection.startLine;
    let targetCol = selection.startCol;

    if (!selection.isCollapsed) {
      const res = deleteSelectionFromDoc(docText, selection);
      docText = res.nextDoc;
      targetLine = res.targetLine;
      targetCol = res.targetCol;
    }

    const lines = docText.split('\n');
    while (lines.length <= targetLine) {
      lines.push('');
    }

    const currentLine = lines[targetLine] || '';
    const beforeCaret = currentLine.slice(0, targetCol);
    const afterCaret = currentLine.slice(targetCol);

    const pastedLines = normalized.split('\n');
    let finalLine = targetLine;
    let finalCol = 0;

    if (pastedLines.length === 1) {
      lines[targetLine] = beforeCaret + pastedLines[0] + afterCaret;
      finalCol = beforeCaret.length + pastedLines[0].length;
    } else {
      lines[targetLine] = beforeCaret + pastedLines[0];
      for (let i = 1; i < pastedLines.length - 1; i++) {
        lines.splice(targetLine + i, 0, pastedLines[i]);
      }
      const lastPasted = pastedLines[pastedLines.length - 1];
      lines.splice(targetLine + pastedLines.length - 1, 0, lastPasted + afterCaret);
      finalLine = targetLine + pastedLines.length - 1;
      finalCol = lastPasted.length;
    }

    applyDocUpdate(lines.join('\n'), finalLine, finalCol);
  };

  const handleClick = (e: MouseEvent) => {
    if (!editorRef.current) return;

    // 1. Never interfere with an active selection
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) {
      getActiveSelection();
      return;
    }

    // 2. Handle clicks that land directly on the editor container (left/right padding or bottom blank space)
    if (e.target === editorRef.current) {
      const lines = editorRef.current.children;
      if (lines.length === 0) return;

      const lastLine = lines[lines.length - 1] as HTMLElement;
      const lastRect = lastLine.getBoundingClientRect();

      // Click is below all content -> jump to end of last line
      if (e.clientY > lastRect.bottom) {
        setEditorSelection(editorRef.current, lines.length - 1, (lastLine.textContent || '').length);
        getActiveSelection();
        return;
      }

      // Click is horizontally aligned with a line (in left or right padding)
      for (let i = 0; i < lines.length; i++) {
        const lineEl = lines[i] as HTMLElement;
        const rect = lineEl.getBoundingClientRect();
        if (e.clientY >= rect.top && e.clientY <= rect.bottom) {
          if (e.clientX < rect.left) {
            // User clicked in the left padding to focus column 0 of this line
            setEditorSelection(editorRef.current, i, 0);
          } else {
            // User clicked in the right padding to focus end of this line
            setEditorSelection(editorRef.current, i, (lineEl.textContent || '').length);
          }
          getActiveSelection();
          return;
        }
      }
    } else {
      getActiveSelection();
    }
  };

  const syncSelection = () => {
    getActiveSelection();
  };

  return (
    <div
      ref={editorRef}
      className={`obsidian-source-editor ${className || ''}`}
      contentEditable
      spellcheck={false}
      onInput={handleInput}
      onKeyDown={handleKeyDown}
      onKeyUp={syncSelection}
      onMouseUp={syncSelection}
      onCut={handleCut}
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
