// the elements text would have had in the DOM, for handlers that read event.target on a text hit (3.4)
import type { Mark, Node as PMNode } from 'prosemirror-model';
import type { DecorationAttrs } from 'prosemirror-view';
import type { InlineDecorationView } from '../contracts/decorationTypes';
import type { RunChain, RunChainLevel, StyleLook } from '../contracts/styleTypes';
import { decorationLevel } from '../decorations/decorationRuns';
import { outerLevelsOf, patchAttributes } from './decorationElements';
import { renderFaceSpec } from './faceDocument';
import { FaceElement } from './faceElement';

export type InlineHitRun = {
	/** the element whose hole holds the text */
	readonly textblock: FaceElement;
	/** the text node's marks, in schema order (outermost first, as prosemirror-view nests them) */
	readonly marks: readonly Mark[];
	/** the inline decorations covering the hit, in the order the decoration sets gave them */
	readonly decorations: readonly InlineDecorationView[];
	/** the textblock node and the document position of its content */
	readonly content: PMNode;
	readonly contentStart: number;
	/** the document position of the character under the point */
	readonly at: number;
};

type ChainRange = { readonly from: number; readonly to: number };

const runOfElement = new WeakMap<FaceElement, ChainRange>();
/** decoration looks paint apart from the run styles; the innermost decoration span carries them, for its box edges */
const lookOfElement = new WeakMap<FaceElement, StyleLook>();

/** what each element wrapped in the DOM: a mark the siblings holding it and its outer marks, decorations their piece of the text node */
function extentsOf(run: InlineHitRun): { marks: ChainRange[]; piece: ChainRange } {
	const children: ChainRange[] = [];
	const nodes: PMNode[] = [];
	run.content.forEach((child, offset) => {
		children.push({ from: run.contentStart + offset, to: run.contentStart + offset + child.nodeSize });
		nodes.push(child);
	});
	const index = Math.max(
		0,
		children.findIndex((child) => run.at >= child.from && run.at < child.to)
	);
	const marks = run.marks.map((_, depth) => {
		const outer = run.marks.slice(0, depth + 1);
		function holds(node: PMNode): boolean {
			return outer.every((mark) => mark.isInSet(node.marks));
		}
		let first = index;
		let last = index;
		while (first > 0 && holds(nodes[first - 1])) first--;
		while (last < nodes.length - 1 && holds(nodes[last + 1])) last++;
		return { from: children[first]?.from ?? run.at, to: children[last]?.to ?? run.at };
	});
	const text = children[index] ?? { from: run.at, to: run.at };
	const piece = run.decorations.reduce(
		(range, decoration) => ({ from: Math.max(range.from, decoration.from), to: Math.min(range.to, decoration.to) }),
		text
	);
	return { marks, piece };
}

function attrsOf(decoration: InlineDecorationView): DecorationAttrs {
	const attrs: DecorationAttrs = { ...decoration.attrs };
	if (decoration.classes.length) attrs.class = decoration.classes.join(' ');
	if (decoration.style) attrs.style = decoration.style;
	return attrs;
}

/** the run a chain element stands for, so posAtDOM answers for it */
export function inlineHitRange(el: FaceElement): { from: number; to: number } | null {
	return runOfElement.get(el) ?? null;
}

/** a chain element as a run style chain under its textblock, for the box edges it draws around the text */
export function inlineHitLevels(el: FaceElement): { textblock: FaceElement; chain: RunChain } | null {
	const levels: RunChainLevel[] = [];
	let at: FaceElement | null = el;
	for (; at && runOfElement.has(at); at = at.parentNode instanceof FaceElement ? at.parentNode : null) {
		const attrs: Record<string, string> = {};
		for (const name of at.getAttributeNames()) if (name !== 'class') attrs[name] = at.getAttribute(name) ?? '';
		const look = lookOfElement.get(at);
		levels.unshift({
			tag: at.tagName.toLowerCase(),
			classes: at.className.split(/\s+/).filter(Boolean),
			attrs,
			hovered: false,
			...(look ? { look } : {})
		});
	}
	if (!at || !levels.length) return null;
	return { textblock: at, chain: { key: `hit:${JSON.stringify(levels)}`, levels } };
}

/**
 * marks wrap each other as their toDOM specs say, the decorations' merged attributes wrap the text inside them as
 * computeOuterDeco does; the chain is never inserted in the tree, only parented to it, and never cached
 */
export function inlineHitChain(run: InlineHitRun): FaceElement[] {
	const extents = extentsOf(run);
	const levels: { dom: FaceElement; content: FaceElement; range: ChainRange }[] = [];
	run.marks.forEach((mark, depth) => {
		const toDom = mark.type.spec.toDOM;
		if (!toDom) return;
		const { dom, contentDOM } = renderFaceSpec(toDom(mark, true));
		levels.push({ dom, content: contentDOM ?? dom, range: extents.marks[depth] });
	});
	let innermost: FaceElement | null = null;
	for (const level of outerLevelsOf(run.decorations.map(attrsOf), true).slice(1)) {
		const span = new FaceElement(level.nodeName);
		patchAttributes(span, {}, level);
		levels.push({ dom: span, content: span, range: extents.piece });
		innermost = span;
	}
	const look = innermost && decorationLevel(run.decorations)?.level.look;
	if (innermost && look && Object.keys(look).length) lookOfElement.set(innermost, look);
	let parent = run.textblock;
	for (const { dom, content, range } of levels) {
		if (parent === run.textblock) dom.parentNode = parent;
		else parent.appendChild(dom);
		for (let at: FaceElement | null = content; at; at = at === dom ? null : (at.parentNode as FaceElement)) runOfElement.set(at, range);
		parent = content;
	}
	const chain: FaceElement[] = [];
	for (let at: FaceElement | null = parent; at; at = at.parentNode instanceof FaceElement ? at.parentNode : null) chain.push(at);
	return chain;
}
