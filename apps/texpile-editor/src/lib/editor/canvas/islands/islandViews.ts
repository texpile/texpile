// raw_latex, inline_latex and code_block drawn as natively edited source (14.1): contentDOM is the CodeMirror skeleton's text element,
// which the core lays out in the grammar's colors; the code session (W9) owns the caret inside through setSelection
import type { Node as PMNode } from 'prosemirror-model';
import { codeBlockLanguageName, rawLanguageName, type CodeLanguageName } from '$lib/editor/code/languageFor';
import type { CanvasNodeView, CanvasNodeViews } from '../contracts/nodeViewTypes';
import type { StyleLook } from '../contracts/styleTypes';
import type { VisualView } from '../contracts/viewTypes';
import type { FaceElement } from '../tree/faceElement';
import { setLook } from '../tree/faceStyle';
import { grammarKey, highlightIsland, IslandHighlighter, islandGrammar } from './islandHighlight';

// app.css's island rules: every CodeMirror scroller's transparent 3 px end border, the content wrapping
const RAW_BLOCK_LOOK: StyleLook = { margin: 'calc(var(--spacing) * 1) 0px' };
const SCROLLER_LOOK: StyleLook = { borderRight: '3px solid transparent' };
const RAW_CONTENT_LOOK: StyleLook = { whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowWrap: 'anywhere' };
const CHIP_LOOK: StyleLook = { whiteSpace: 'pre-wrap', wordBreak: 'break-word' };
// CodeBlockView's card: a quiet inset with the gear's column kept clear on the right, in CodeMirror's base face
const CODE_CARD_LOOK: StyleLook = {
	position: 'relative',
	margin: 'calc(var(--spacing) * 1)',
	padding: 'calc(var(--spacing) * 2)',
	paddingRight: 'calc(var(--spacing) * 9)',
	border: '1px solid var(--color-surface-300-700)',
	borderRadius: '6px',
	backgroundColor: 'var(--color-surface-50-950)'
};
const CODE_SCROLLER_LOOK: StyleLook = { ...SCROLLER_LOOK, fontFamily: 'monospace', lineHeight: '1.4' };
const CODE_CONTENT_LOOK: StyleLook = { ...RAW_CONTENT_LOOK, padding: '4px 2px' };

/** the grammar is chosen once, from the text the island opens with, as the DOM editor's CodeMirror chose it */
function highlightHole(hole: FaceElement, name: CodeLanguageName, view: VisualView): void {
	const win = view.dom.ownerDocument.defaultView!;
	const grammar = view.canvas.build.read(grammarKey(name), () => islandGrammar(name, win));
	highlightIsland(hole, new IslandHighlighter(name, grammar));
}

function islandView(built: PMNode, dom: FaceElement, content: FaceElement): CanvasNodeView {
	let node = built;
	return {
		dom,
		contentDOM: content,
		update(next) {
			if (!next.sameMarkup(node)) return false;
			node = next;
			return true;
		},
		// the code session starts and moves here (W9)
		setSelection() {},
		stopEvent: () => false,
		nested: null
	};
}

/** the CodeMirror skeleton a raw block's look keys on (the scroller's border, the content's padding) */
function rawBlockView(node: PMNode, view: VisualView): CanvasNodeView {
	const { el } = view.canvas.build;
	const dom = el('div', 'noautofocus raw-latex-wrapper');
	const scroller = dom.appendChild(el('div', 'cm-scroller'));
	const content = scroller.appendChild(el('div', 'cm-content cm-lineWrapping'));
	setLook(dom, RAW_BLOCK_LOOK);
	setLook(scroller, SCROLLER_LOOK);
	setLook(content, RAW_CONTENT_LOOK);
	highlightHole(content, rawLanguageName(node.attrs.lang, node.textContent), view);
	return islandView(node, dom, content);
}

/** a chip's source in the line; the scroller keeps the 3 px border app.css gives every one */
function inlineChipView(node: PMNode, view: VisualView): CanvasNodeView {
	const { el } = view.canvas.build;
	const dom = el('span', 'noautofocus inline-latex-wrapper');
	const scroller = dom.appendChild(el('span', 'cm-scroller'));
	setLook(dom, CHIP_LOOK);
	setLook(scroller, SCROLLER_LOOK);
	highlightHole(scroller, rawLanguageName(node.attrs.lang, node.textContent), view);
	return islandView(node, dom, scroller);
}

function codeBlockView(node: PMNode, view: VisualView): CanvasNodeView {
	const { el } = view.canvas.build;
	const dom = el('div', 'noautofocus cm-wrapper');
	const editor = dom.appendChild(el('div', 'cm-editor'));
	const scroller = editor.appendChild(el('div', 'cm-scroller'));
	const content = scroller.appendChild(el('div', 'cm-content cm-lineWrapping'));
	setLook(dom, CODE_CARD_LOOK);
	setLook(scroller, CODE_SCROLLER_LOOK);
	setLook(content, CODE_CONTENT_LOOK);
	highlightHole(content, codeBlockLanguageName(node.attrs.lang), view);
	return islandView(node, dom, content);
}

export function islandNodeViews(): CanvasNodeViews {
	return { raw_latex: rawBlockView, inline_latex: inlineChipView, code_block: codeBlockView };
}
