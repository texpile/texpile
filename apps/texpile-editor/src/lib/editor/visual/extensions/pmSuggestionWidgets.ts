// the elements a suggestion's old content is drawn with, and the mark a moved break gets
import { DOMSerializer, type Node as PMNode, type Schema } from 'prosemirror-model';
import type { OldRun } from './pmSuggestionsPlace';
import { renderStaticMath } from './mathlivebridge/mathStatic';
import { mathSyntaxOf } from './mathlivebridge/mathFieldFactory';
import { oldContentSerializer } from './oldContentSerializer';
import { tintElement } from '$lib/editor/visual/highlight/paintRange';
import { cachedDrawing, loadSavedDrawing, onDrawingsChange, pictureKey } from '$lib/draw/host/drawingCache';

const SUGGESTION_TINTS = {
	new: ['var(--diff-insert-tint)', 18, 34],
	old: ['var(--diff-delete-tint)', 16, 30],
	partial: ['var(--color-warning-500)', 10, 20]
} as const;

/** a suggestion's colour at two strengths, so a focused one stands out of its neighbours: words put in,
 *  words taken out, and a node only partly changed */
export function suggestionTint(kind: keyof typeof SUGGESTION_TINTS, focused: boolean): string {
	const [color, plain, strong] = SUGGESTION_TINTS[kind];
	return `color-mix(in srgb, ${color} ${focused ? strong : plain}%, transparent)`;
}

let graphemes: Intl.Segmenter | undefined;

function isMath(node: PMNode): boolean {
	return node.type.name === 'inline_math' || node.type.name === 'block_math';
}

function withMarks(schema: Schema, inner: Node, marks: readonly OldRun['marks'][number][]): Node {
	const serializer = oldContentSerializer(schema);
	return marks.reduceRight<Node>((content, mark) => {
		const { dom, contentDOM } = DOMSerializer.renderSpec(document, serializer.marks[mark.type.name](mark, true));
		// dressed like the link mark, without its target: these words are gone from the document
		if (mark.type.name === 'link' && dom instanceof HTMLElement) dom.classList.add('anchor');
		(contentDOM ?? dom).appendChild(content);
		return dom;
	}, inner);
}

// one span a character, named by its offset in the words: the line breaker ends lines inside them by
// marking these (lineBreakPlugin), which no decoration could reach. `start` goes on from the words of
// the same suggestion drawn before these, so the two never share an offset
export function oldWordsElement(schema: Schema, runs: OldRun[], id: string, focused: boolean, start = 0): HTMLElement {
	graphemes ??= new Intl.Segmenter(undefined, { granularity: 'grapheme' });
	const span = document.createElement('span');
	span.className = `pm-suggest-old${focused ? ' pm-suggest-focused' : ''}`;
	tintElement(span, suggestionTint('old', focused));
	span.dataset.comment = id;
	let offset = start;
	for (const run of runs) {
		const characters = document.createDocumentFragment();
		if (run.node) {
			const character = document.createElement('span');
			character.dataset.i = String(offset);
			character.appendChild(oldContentSerializer(schema).serializeNode(run.node));
			characters.appendChild(character);
			offset += run.text.length;
		} else {
			for (const { segment } of graphemes.segment(run.text)) {
				const character = document.createElement('span');
				character.dataset.i = String(offset);
				character.textContent = segment;
				characters.appendChild(character);
				offset += segment.length;
			}
		}
		span.appendChild(withMarks(schema, characters, run.marks));
	}
	return span;
}

const TIKZ_BEGIN = '\\begin{tikzpicture}';
const TIKZ_END = '\\end{tikzpicture}';

// the one picture a block holds, as its card names it: a TikZ environment, alone or in its float, or a CeTZ canvas without its #
function pictureIn(source: string): string | null {
	const text = source.trim().replace(/^#/, '');
	if (/^(cetz\.)?canvas\(/.test(text)) return text;
	const from = text.indexOf(TIKZ_BEGIN);
	const to = text.lastIndexOf(TIKZ_END);
	if (from < 0 || to < from || text.includes(TIKZ_BEGIN, from + 1)) return null;
	return text.slice(from, to + TIKZ_END.length);
}

/** the picture the old node holds, when the node that took its place holds another */
export function replacedPicture(was: PMNode, now: PMNode): string | null {
	const picture = was.isBlock ? pictureIn(was.textContent) : null;
	return picture && picture !== pictureIn(now.textContent) ? picture : null;
}

// the picture as the figure engine drew it, in place of its source once that drawing is kept
function showOldPicture(holder: HTMLElement, picture: string): void {
	const key = pictureKey(picture);
	function draw(): boolean {
		const svg = cachedDrawing(key);
		const drawn = svg && new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
		if (!drawn || drawn.nodeName !== 'svg') return false;
		holder.classList.add('pm-suggest-drawn');
		holder.replaceChildren(document.importNode(drawn, true));
		return true;
	}
	if (draw()) return;
	const stop = onDrawingsChange(() => {
		if (!holder.isConnected || draw()) stop();
	});
	void loadSavedDrawing(key);
}

// the node as it was, beside the one it is now: a formula typeset by the same renderer that draws the
// new one, a picture as it was drawn, anything else as its source, since a node that draws itself has
// no words to strike. One that is all attributes (an include) has no source here, and reads as its schema form
export function oldNodeElement(node: PMNode, id: string, focused: boolean, picture: string | null = null): HTMLElement {
	const block = node.isBlock;
	const holder = document.createElement(block ? 'div' : 'span');
	holder.className = `pm-suggest-old pm-suggest-was${focused ? ' pm-suggest-focused' : ''}`;
	tintElement(holder, suggestionTint('old', focused));
	holder.dataset.comment = id;
	holder.contentEditable = 'false';
	if (isMath(node)) holder.appendChild(renderStaticMath(node.textContent, block, mathSyntaxOf(node)));
	else if (node.content.size === 0) holder.appendChild(oldContentSerializer(node.type.schema).serializeNode(node));
	else {
		const code = document.createElement('code');
		code.textContent = node.textContent;
		holder.appendChild(code);
		if (picture) showOldPicture(holder, picture);
	}
	return holder;
}

// blocks gone from the document whole, so there is nothing left in it to strike. They take a block of
// their own where they were taken from, which is what the diff view does with a removed block
export function goneBlocksElement(schema: Schema, blocks: PMNode[], id: string, focused: boolean): HTMLElement {
	const holder = document.createElement('div');
	holder.className = `pm-suggest-old pm-suggest-gone${focused ? ' pm-suggest-focused' : ''}`;
	tintElement(holder, suggestionTint('old', focused));
	holder.dataset.comment = id;
	holder.contentEditable = 'false';
	const serializer = oldContentSerializer(schema);
	for (const block of blocks) holder.appendChild(serializer.serializeNode(block));
	return holder;
}

/**
 * A bar where the break is, the way a diff marks one. Not a pilcrow or a ↵: those are characters the
 * document does not contain, and a reader has to be told what they mean.
 */
export function breakMark(way: 'added' | 'removed', id: string, focused: boolean): HTMLElement {
	const span = document.createElement('span');
	span.className = `pm-suggest-break pm-suggest-break-${way}${focused ? ' pm-suggest-focused' : ''}`;
	span.dataset.comment = id;
	span.contentEditable = 'false';
	return span;
}

/** the line a removed break ended, still ended until the suggestion is decided, as Docs and Word draw it */
export function lineEnd(id: string): HTMLElement {
	const br = document.createElement('br');
	br.dataset.comment = id;
	br.dataset.lineEnd = '';
	br.contentEditable = 'false';
	return br;
}
