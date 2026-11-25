// inline decorations as one run chain level, and which of them lay out differently from plain text (9.3, 9.5)
import type { InlineDecorationView } from '../contracts/decorationTypes';
import type { CanvasStyles, RunChain, RunChainLevel, RunStyle, StyleLook } from '../contracts/styleTypes';
import { faceElement, type FaceElement } from '../tree/faceElement';
import { decorationLookOf } from './decorationLooks';

export type DecorationChainLevel = { readonly key: string; readonly level: RunChainLevel };

type LayoutLooks = { readonly plain: RunStyle; readonly looks: Map<string, boolean> };

const NO_LEVELS: RunChain = { key: '', levels: [] };
/** a plain paragraph: every decoration is measured against the same text */
const bases = new WeakMap<object, FaceElement>();
const known = new WeakMap<object, LayoutLooks>();

/** merged into one span as prosemirror-view nests them: classes accumulate, a later style declaration wins */
export function decorationLevel(decorations: readonly InlineDecorationView[]): DecorationChainLevel | null {
	if (!decorations.length) return null;
	const classes: string[] = [];
	const styles: string[] = [];
	const attrs: Record<string, string> = {};
	let look: StyleLook = {};
	let hoverLook: StyleLook | undefined;
	for (const decoration of decorations) {
		classes.push(...decoration.classes);
		if (decoration.style) styles.push(decoration.style);
		Object.assign(attrs, decoration.attrs);
		const own = decorationLookOf(decoration);
		if (!own) continue;
		look = { ...look, ...own.look };
		if (own.hover) hoverLook = { ...hoverLook, ...own.hover };
	}
	if (styles.length) attrs.style = styles.join(';');
	const level: RunChainLevel = { tag: 'span', classes, attrs, hovered: false, look, hoverLook };
	return { key: `deco:${JSON.stringify(level)}`, level };
}

export function decorationChain(decorations: readonly InlineDecorationView[]): RunChain {
	const level = decorationLevel(decorations);
	return level ? { key: level.key, levels: [level.level] } : NO_LEVELS;
}

function sameLayout(a: RunStyle, b: RunStyle): boolean {
	return (
		a.fontString === b.fontString &&
		a.letterSpacing === b.letterSpacing &&
		a.wordSpacing === b.wordSpacing &&
		a.textTransform === b.textTransform &&
		a.verticalAlign === b.verticalAlign &&
		a.edges.start === b.edges.start &&
		a.edges.end === b.edges.end &&
		(a.shift ?? 0) === (b.shift ?? 0) &&
		a.lineHeight === b.lineHeight
	);
}

/** padding, a font or spacing: the layout takes it and its key holds it; every other decoration is paint only */
export function changesLayout(styles: Pick<CanvasStyles, 'runStyle'>, decoration: InlineDecorationView): boolean {
	let base = bases.get(styles);
	if (!base) bases.set(styles, (base = faceElement('p')));
	const plain = styles.runStyle(base, NO_LEVELS);
	let memo = known.get(styles);
	// the plain run is cached per style epoch: a new one means the sheets moved
	if (memo?.plain !== plain) known.set(styles, (memo = { plain, looks: new Map() }));
	const chain = decorationChain([decoration]);
	let changes = memo.looks.get(chain.key);
	if (changes === undefined) memo.looks.set(chain.key, (changes = !sameLayout(styles.runStyle(base, chain), plain)));
	return changes;
}
