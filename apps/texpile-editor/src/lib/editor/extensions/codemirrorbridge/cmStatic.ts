// Plain-text stand-ins for the two CodeMirror-backed node views, held until the node nears the
// viewport and a real EditorView takes over.
//
// Unlike the math placeholders these carry no syntax colour, and that is fine: the upgrade is keyed
// on visibility, so a placeholder is only ever on screen for content the reader cannot see. What
// does matter is size. If a placeholder's metrics differ from CodeMirror's, every upgrade nudges
// the scroll position, and a long code block would nudge it a lot.
import { EditorView as CodeMirrorView } from '@codemirror/view';

export const CM_PLACEHOLDER_CLASS = 'cm-static-placeholder';

/** the inline chip's font stack, mirrored from the theme block in inlineLatexView.ts */
const INLINE_FONT = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

let stylesPrimed = false;

/** CodeMirror ships its base theme through a StyleModule that is only injected when the first
 * EditorView is built. Block placeholders borrow CodeMirror's own class names so their metrics match
 * exactly rather than by hand-copied numbers, which needs those styles to already be in the
 * document - so build one throwaway view and drop it. The injected styles outlive it. */
function primeCodeMirrorStyles(): void {
	if (stylesPrimed) return;
	stylesPrimed = true;
	try {
		new CodeMirrorView({ doc: '' }).destroy();
	} catch {
		// no DOM (SSR, some test environments): placeholders still render, just unmeasured
	}
}

function fillLines(content: HTMLElement, text: string): void {
	content.textContent = '';
	// one element per line, the same shape CodeMirror builds, so the line box count matches
	for (const line of text.split('\n')) {
		const el = document.createElement('div');
		el.className = 'cm-line';
		// a blank line still occupies a line box
		el.textContent = line.length ? line : '​';
		content.appendChild(el);
	}
}

/** multi-line stand-in for a code_block, using CodeMirror's own classes for its metrics */
export function renderStaticCodeBlock(text: string): HTMLElement {
	primeCodeMirrorStyles();
	const editor = document.createElement('div');
	editor.className = `${CM_PLACEHOLDER_CLASS} cm-editor`;
	editor.contentEditable = 'false';
	const scroller = document.createElement('div');
	scroller.className = 'cm-scroller';
	const content = document.createElement('div');
	content.className = 'cm-content';
	fillLines(content, text);
	scroller.appendChild(content);
	editor.appendChild(scroller);
	return editor;
}

/** single-line stand-in for an inline_latex chip. The chip's font comes from a view-scoped
 * CodeMirror theme whose generated class name is not reachable from here, so those few properties
 * are set explicitly instead of borrowed. */
export function renderStaticInlineCode(text: string): HTMLElement {
	const el = document.createElement('span');
	el.className = CM_PLACEHOLDER_CLASS;
	el.contentEditable = 'false';
	el.style.fontFamily = INLINE_FONT;
	el.style.lineHeight = 'inherit';
	el.style.display = 'inline-block';
	el.style.whiteSpace = 'pre-wrap'; // the live chip soft-wraps via lineWrapping
	el.style.maxWidth = '100%';
	el.textContent = text;
	return el;
}

/** re-render a placeholder for an edit that lands while it is still offscreen */
export function setStaticCode(el: HTMLElement, text: string): void {
	const content = el.querySelector('.cm-content');
	if (content instanceof HTMLElement) fillLines(content, text);
	else el.textContent = text;
}
