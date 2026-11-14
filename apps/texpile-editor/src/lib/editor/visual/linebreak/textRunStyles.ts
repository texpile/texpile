// how a run of text in the visual editor is drawn, as far as its width goes
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView } from 'prosemirror-view';

export type TextRunStyle = {
	/** every field below in one string, to keep widths under */
	key: string;
	font: string;
	letterSpacing: string;
	wordSpacing: string;
	kerning: CanvasFontKerning;
	caps: CanvasFontVariantCaps;
	stretch: CanvasFontStretch;
	/** the case the text is drawn in, which changes its width */
	transform: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
	/** false when the text alone does not give its width: a case change or a stretch canvas cannot make */
	measurable: boolean;
};

// the computed value is a percentage; canvas takes the keyword
const STRETCHES: Record<string, CanvasFontStretch> = {
	'50%': 'ultra-condensed',
	'62.5%': 'extra-condensed',
	'75%': 'condensed',
	'87.5%': 'semi-condensed',
	'100%': 'normal',
	normal: 'normal',
	'112.5%': 'semi-expanded',
	'125%': 'expanded',
	'150%': 'extra-expanded',
	'200%': 'ultra-expanded'
};
const TRANSFORMS = new Set(['none', 'uppercase', 'lowercase', 'capitalize']);

function styleOfElement(element: Element): TextRunStyle {
	const style = getComputedStyle(element);
	// style.font reads '' here: the editor turns ligatures off, which the shorthand cannot say
	const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
	const letterSpacing = style.letterSpacing === 'normal' ? '0px' : style.letterSpacing;
	const wordSpacing = style.wordSpacing === 'normal' ? '0px' : style.wordSpacing;
	const kerning = style.fontKerning as CanvasFontKerning;
	const caps = style.fontVariantCaps as CanvasFontVariantCaps;
	const stretch = STRETCHES[style.fontStretch] ?? 'normal';
	const transform = (TRANSFORMS.has(style.textTransform) ? style.textTransform : 'none') as TextRunStyle['transform'];
	return {
		key: [font, letterSpacing, wordSpacing, kerning, caps, stretch, transform].join('|'),
		font,
		letterSpacing,
		wordSpacing,
		kerning,
		caps,
		stretch,
		transform,
		measurable: TRANSFORMS.has(style.textTransform) && style.fontStretch in STRETCHES
	};
}

function deepestElementAt(view: EditorView, pos: number): Element | null {
	const at = view.domAtPos(pos, 1);
	let node: Node | null = at.node.nodeType === Node.TEXT_NODE ? at.node : (at.node.childNodes[at.offset] ?? at.node);
	while (node?.firstChild) node = node.firstChild;
	if (!node) return null;
	return node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
}

/** the room the elements around a run take beside it, where one of them begins or ends: inline code's padding */
export type RoomBesideRun = { before: number; after: number };

function sideRoom(style: CSSStyleDeclaration, side: 'Left' | 'Right'): number {
	return (
		(parseFloat(style[`padding${side}`]) || 0) + (parseFloat(style[`margin${side}`]) || 0) + (parseFloat(style[`border${side}Width`]) || 0)
	);
}

function textAt(view: EditorView, pos: number, side: 1 | -1): Node | null {
	const at = view.domAtPos(pos, side);
	let node: Node | null =
		at.node.nodeType === Node.TEXT_NODE ? at.node : (at.node.childNodes[side > 0 ? at.offset : at.offset - 1] ?? null);
	while (node && node.nodeType !== Node.TEXT_NODE) node = side > 0 ? node.firstChild : node.lastChild;
	return node;
}

export type RunStyleReader = {
	/** the style of a run of the document's text */
	ofRun(view: EditorView, block: HTMLElement, run: PMNode, pos: number): TextRunStyle | null;
	/** the room beside the run of `size` characters at `pos`; the breaker's own text widths leave it out */
	roomBeside(view: EditorView, block: HTMLElement, pos: number, size: number): RoomBesideRun;
	/** the style of the text an element draws (a suggestion's struck words) */
	ofElement(element: Element): TextRunStyle;
};

/** reads a style once for each set of marks in a block, and once per element; a block keeps its element across edits */
export function runStyleReader(): RunStyleReader {
	const seen = new WeakMap<HTMLElement, Map<string, TextRunStyle>>();
	const byElement = new WeakMap<Element, TextRunStyle>();
	const rooms = new WeakMap<Element, RoomBesideRun>();
	function roomOf(element: Element): RoomBesideRun {
		let room = rooms.get(element);
		if (!room) {
			const style = getComputedStyle(element);
			rooms.set(element, (room = { before: sideRoom(style, 'Left'), after: sideRoom(style, 'Right') }));
		}
		return room;
	}
	// what the elements between the text and its block add on the side where the text is their first, or last
	function roomOn(text: Node | null, block: HTMLElement, side: 'before' | 'after'): number {
		let room = 0;
		for (let at = text, up = text?.parentElement; at && up && up !== block && block.contains(up); at = up, up = up.parentElement) {
			if ((side === 'before' ? up.firstChild : up.lastChild) !== at) break;
			room += roomOf(up)[side];
		}
		return room;
	}
	return {
		roomBeside(view, block, pos, size) {
			return { before: roomOn(textAt(view, pos, 1), block, 'before'), after: roomOn(textAt(view, pos + size, -1), block, 'after') };
		},
		ofRun(view, block, run, pos) {
			let styles = seen.get(block);
			if (!styles) seen.set(block, (styles = new Map()));
			const marks = run.marks.map((mark) => mark.type.name + JSON.stringify(mark.attrs)).join();
			let style = styles.get(marks);
			if (!style) {
				const element = deepestElementAt(view, pos);
				if (!element || !block.contains(element)) return null;
				styles.set(marks, (style = styleOfElement(element)));
			}
			return style;
		},
		ofElement(element) {
			let style = byElement.get(element);
			if (!style) byElement.set(element, (style = styleOfElement(element)));
			return style;
		}
	};
}
