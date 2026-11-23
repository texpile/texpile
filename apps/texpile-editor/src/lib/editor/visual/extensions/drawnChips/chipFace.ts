// what a raw chip looks like in the page: a drawing of what its source prints
import type { Decoration } from 'prosemirror-view';
import { FaceElement, faceElement as canvasElement, formulaSourceOf, type BlockAction, type FaceInputKey } from '$lib/editor/canvas';
import { renderStaticMath } from '$lib/editor/visual/extensions/mathlivebridge/mathStatic';

export type ChipFace = {
	dom: FaceElement;
	/** drawn on a line of its own (a comment, a vertical space, a page break) */
	line?: boolean;
	/** partly on lines of their own, partly in the text: the chip stays source */
	mixed?: boolean;
	/** stands in the text as one character (a space, an accented letter): the caret steps over it, Backspace deletes it */
	character?: boolean;
	/** the decorations ProseMirror hands the chip; a footnote's number rides on one */
	decorate?(decorations: readonly Decoration[]): void;
	/** what the face holds open, such as a listener */
	destroy?(): void;
	/** the inputs the face was drawn from: a change builds the chip again */
	reads?: readonly FaceInputKey[];
	/** the chip's own actions in the bar over it while it is selected */
	actions?(): readonly BlockAction[];
};

const HINT_LINES = 12;

export function sourceHint(source: string): string {
	const lines = source.trim().split('\n');
	return lines.slice(0, HINT_LINES).join('\n') + (lines.length > HINT_LINES ? '\n…' : '');
}

/** a drawing for this source, or null when the chip stays source */
export type ChipFaceMaker = (source: string) => ChipFace | null;

const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';

/** a canvas part copied into the DOM; replaced content (an arrow, a formula) stays empty there */
function domCopy(el: FaceElement): Element {
	const formula = formulaSourceOf(el);
	if (formula) return renderStaticMath(formula.source, formula.display, formula.syntax);
	const namespace = el.namespaceURI ?? HTML_NAMESPACE;
	const copy =
		namespace === HTML_NAMESPACE ? document.createElement(el.tagName.toLowerCase()) : document.createElementNS(namespace, el.tagName);
	for (const name of el.getAttributeNames()) copy.setAttribute(name, el.getAttribute(name) ?? '');
	if (el.hint) copy.setAttribute('data-tip', el.hint);
	for (const child of el.childNodes)
		copy.appendChild(child instanceof FaceElement ? domCopy(child) : document.createTextNode(child.textContent));
	return copy;
}

/** a face copied into the DOM, for the HTML beside the canvas (the preamble's title fields, a heading's label) */
export function domOf(part: ChipFace): HTMLElement {
	return domCopy(part.dom) as HTMLElement;
}

/** several faces drawn one after another, as the commands stand in one chip */
export function faceOfParts(parts: ChipFace[], block: boolean): ChipFace {
	if (parts.length === 1) return parts[0];
	const line = parts.every((part) => part.line);
	function decorate(decorations: readonly Decoration[]): void {
		parts.forEach((part) => part.decorate?.(decorations));
	}
	const drawn = canvasElement(block ? 'div' : 'span', 'drawn-parts');
	for (const part of parts) drawn.appendChild(part.dom);
	return {
		dom: drawn,
		line,
		mixed: parts.some((part) => part.line || part.mixed) && !line,
		decorate,
		destroy: () => parts.forEach((part) => part.destroy?.()),
		actions: () => parts.flatMap((part) => part.actions?.() ?? [])
	};
}

export function tippedFace(dom: FaceElement, hint: string, look: Pick<ChipFace, 'line' | 'character'> = {}): ChipFace {
	return { dom: Object.assign(dom, { hint }), ...look };
}
