// what a raw chip looks like in the page: a drawing of what its source prints
import type { Decoration } from 'prosemirror-view';
import { tip } from '$lib/components/tooltip.svelte';

export type ChipFace = {
	dom: HTMLElement;
	/** drawn on a line of its own (a comment, a vertical space, a page break) */
	line?: boolean;
	/** partly on lines of its own and partly in the text, which the line breaker cannot model */
	mixed?: boolean;
	/** stands in the text as one character (a space, an accented letter): the caret steps over it, Backspace deletes it */
	character?: boolean;
	/** the decorations ProseMirror hands the chip; a footnote's number rides on one */
	decorate?(decorations: readonly Decoration[]): void;
	destroy?(): void;
};

const HINT_LINES = 12;

export function sourceHint(source: string): string {
	const lines = source.trim().split('\n');
	return lines.slice(0, HINT_LINES).join('\n') + (lines.length > HINT_LINES ? '\n…' : '');
}

/** a drawing for this source, or null when the chip stays source */
export type ChipFaceMaker = (source: string) => ChipFace | null;

/** several faces drawn one after another, as the commands stand in one chip */
export function faceOfParts(parts: ChipFace[], block: boolean): ChipFace {
	if (parts.length === 1) return parts[0];
	const dom = document.createElement(block ? 'div' : 'span');
	dom.className = 'drawn-parts';
	for (const part of parts) dom.appendChild(part.dom);
	return {
		dom,
		line: parts.every((part) => part.line),
		mixed: parts.some((part) => part.line || part.mixed) && !parts.every((part) => part.line),
		decorate: (decorations) => parts.forEach((part) => part.decorate?.(decorations)),
		destroy: () => parts.forEach((part) => part.destroy?.())
	};
}

export function faceElement<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
	const el = document.createElement(tag);
	if (className) el.className = className;
	if (text !== undefined) el.textContent = text;
	return el;
}

export function tippedFace(dom: HTMLElement, hint: string, look: Pick<ChipFace, 'line' | 'character'> = {}): ChipFace {
	const tipped = tip(dom, hint);
	return { dom, ...look, destroy: () => tipped.destroy() };
}
