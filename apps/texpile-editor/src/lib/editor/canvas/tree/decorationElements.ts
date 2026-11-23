// node decorations on face elements and the decoration walk of a node's children, as prosemirror-view's viewdesc.ts
import type { Mapping } from 'prosemirror-transform';
import type { Node as PMNode } from 'prosemirror-model';
import { DecorationSet, type Decoration, type DecorationAttrs, type DecorationSource } from 'prosemirror-view';
import type { VisualView } from '../contracts/viewTypes';
import {
	copyDecoration,
	decorationAttrsOf,
	isInlineDecoration,
	isWidget,
	localDecorations,
	sameDecorationSource,
	sameDecorationType,
	widgetSide
} from '../decorations/decorationAttrs';
import { FaceElement } from './faceElement';

/** one wrapping level of outer decoration attributes; level 0 patches the node's own root */
export type OuterLevel = Record<string, string>;

const NO_DECORATIONS: readonly Decoration[] = [];
const NO_LEVELS: readonly OuterLevel[] = [{}];

function byPosition(a: Decoration, b: Decoration): number {
	return a.from - b.from || a.to - b.to;
}

function insertAhead(list: Decoration[], at: number, decoration: Decoration): void {
	let i = at;
	while (i < list.length && byPosition(decoration, list[i]) > 0) i++;
	list.splice(i, 0, decoration);
}

/** splits partly overlapping spans so only fully overlapping ones are left (prosemirror-view's removeOverlap) */
function removeOverlap(spans: readonly Decoration[]): readonly Decoration[] {
	let working = spans as Decoration[];
	for (let i = 0; i < working.length - 1; i++) {
		const span = working[i];
		if (span.from === span.to) continue;
		for (let j = i + 1; j < working.length; j++) {
			const next = working[j];
			if (next.from === span.from) {
				if (next.to !== span.to) {
					if (working === spans) working = spans.slice();
					working[j] = copyDecoration(next, next.from, span.to);
					insertAhead(working, j + 1, copyDecoration(next, span.to, next.to));
				}
				continue;
			}
			if (next.from < span.to) {
				if (working === spans) working = spans.slice();
				working[i] = copyDecoration(span, span.from, next.from);
				insertAhead(working, j, copyDecoration(span, next.from, span.to));
			}
			break;
		}
	}
	return working;
}

/** the decorations of several sources at once; prosemirror-view's DecorationGroup is not exported */
class DecorationSourceGroup implements DecorationSource {
	constructor(readonly members: readonly DecorationSource[]) {}

	map(mapping: Mapping, node: PMNode): DecorationSource {
		return groupDecorationSources(this.members.map((member) => member.map(mapping, node)));
	}

	forChild(offset: number, child: PMNode): DecorationSource {
		if (child.isLeaf) return DecorationSet.empty;
		return groupDecorationSources(this.members.map((member) => member.forChild(offset, child)));
	}

	eq(other: DecorationSource): boolean {
		if (!(other instanceof DecorationSourceGroup) || other.members.length !== this.members.length) return false;
		return this.members.every((member, i) => sameDecorationSource(member, other.members[i]));
	}

	locals(node: PMNode): readonly Decoration[] {
		const found = this.members.flatMap((member) => localDecorations(member, node));
		return found.length ? removeOverlap(found.sort(byPosition)) : NO_DECORATIONS;
	}

	forEachSet(f: (set: DecorationSet) => void): void {
		for (const member of this.members) member.forEachSet(f);
	}
}

export function groupDecorationSources(sources: readonly DecorationSource[]): DecorationSource {
	const members = sources.flatMap((source) =>
		source === DecorationSet.empty ? [] : source instanceof DecorationSourceGroup ? source.members : [source]
	);
	if (!members.length) return DecorationSet.empty;
	return members.length === 1 ? members[0] : new DecorationSourceGroup(members);
}

/** prosemirror-view's viewDecorations: the decorations prop of the view and of every plugin, as one source */
export function viewDecorationSource(view: Pick<VisualView, 'state' | 'someProp'>): DecorationSource {
	const found: DecorationSource[] = [];
	view.someProp('decorations', (f) => {
		const source = f(view.state);
		if (source) found.push(source);
	});
	return groupDecorationSources(found);
}

export function sameOuterDecorations(a: readonly Decoration[], b: readonly Decoration[]): boolean {
	return a.length === b.length && a.every((decoration, i) => sameDecorationType(decoration, b[i]));
}

/** the specs a face may read off its decorations (numbers, footnotes, counted, captionPrefix, diff) */
export function sameDecorationSpecs(a: readonly Decoration[], b: readonly Decoration[]): boolean {
	function specs(list: readonly Decoration[]): object[] {
		return list.map((d) => d.spec as object).filter((spec) => spec && Object.keys(spec).length > 0);
	}
	const left = specs(a);
	const right = specs(b);
	return left.length === right.length && left.every((spec, i) => shallowEqual(spec, right[i]));
}

// a spec's numbers are a new array each time the plugin counts again
function sameSpecValue(a: unknown, b: unknown): boolean {
	return a === b || (Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => item === b[i]));
}

function shallowEqual(a: object, b: object): boolean {
	const left = a as Record<string, unknown>;
	const right = b as Record<string, unknown>;
	return Object.keys(left).length === Object.keys(right).length && Object.keys(left).every((key) => sameSpecValue(left[key], right[key]));
}

/**
 * class concatenates, style joins, other attributes overwrite; a nodeName attribute opens a wrapping level. Level 0 is the
 * node's own root; text has none, so with wrapsText the first attribute opens a span (computeOuterDeco's needsWrap)
 */
export function outerLevelsOf(outer: readonly DecorationAttrs[], wrapsText = false): readonly OuterLevel[] {
	if (!outer.length) return NO_LEVELS;
	const levels: OuterLevel[] = [{}];
	let top = levels[0];
	for (const attrs of outer) {
		if (attrs.nodeName) levels.push((top = { nodeName: attrs.nodeName }));
		for (const [name, value] of Object.entries(attrs)) {
			if (value === undefined || value === null || name === 'nodeName') continue;
			if (wrapsText && levels.length === 1) levels.push((top = { nodeName: 'span' }));
			if (name === 'class') top.class = top.class ? `${top.class} ${value}` : value;
			else if (name === 'style') top.style = top.style ? `${top.style};${value}` : value;
			else top[name] = value;
		}
	}
	return levels;
}

const STYLE_PROPERTY = /\s*([\w\-\xa1-\uffff]+)\s*:(?:"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|\(.*?\)|[^;])*/g;

/** a face element, or view.dom for the attributes prop */
export type AttributeTarget = {
	readonly classList: { add(...names: string[]): void; remove(...names: string[]): void };
	readonly className: string;
	readonly style: { removeProperty(name: string): string; cssText: string };
	setAttribute(name: string, value: string): void;
	removeAttribute(name: string): void;
};

export function patchAttributes(el: AttributeTarget, prev: OuterLevel, cur: OuterLevel): void {
	function plain(name: string): boolean {
		return name !== 'class' && name !== 'style' && name !== 'nodeName';
	}
	for (const name of Object.keys(prev)) if (plain(name) && !(name in cur)) el.removeAttribute(name);
	for (const [name, value] of Object.entries(cur)) if (plain(name) && value !== prev[name]) el.setAttribute(name, value);
	if (prev.class !== cur.class) {
		const before = (prev.class ?? '').split(' ').filter(Boolean);
		const after = (cur.class ?? '').split(' ').filter(Boolean);
		el.classList.remove(...before.filter((c) => !after.includes(c)));
		el.classList.add(...after.filter((c) => !before.includes(c)));
		if (!el.className) el.removeAttribute('class');
	}
	if (prev.style !== cur.style) {
		for (const match of (prev.style ?? '').matchAll(STYLE_PROPERTY)) el.style.removeProperty(match[1]);
		// eslint-disable-next-line no-param-reassign -- patching the element's style is what this does
		if (cur.style) el.style.cssText += cur.style;
	}
}

/** patches the node's root and its decoration wrappers from one set of outer decorations to another; returns the outermost */
export function patchOuterDecorations(
	outerEl: FaceElement,
	nodeEl: FaceElement,
	prev: readonly Decoration[],
	cur: readonly Decoration[]
): FaceElement {
	const prevLevels = outerLevelsOf(prev.map(decorationAttrsOf));
	const curLevels = outerLevelsOf(cur.map(decorationAttrsOf));
	if (prevLevels === NO_LEVELS && curLevels === NO_LEVELS) return nodeEl;
	let at = nodeEl;
	for (let i = 0; i < curLevels.length; i++) {
		const level = curLevels[i];
		let before: OuterLevel | undefined = prevLevels[i];
		if (i) {
			const parent = at.parentNode;
			if (
				before &&
				before.nodeName === level.nodeName &&
				at !== outerEl &&
				parent instanceof FaceElement &&
				parent.tagName.toLowerCase() === level.nodeName
			)
				at = parent;
			else {
				const created = new FaceElement(level.nodeName);
				if (parent instanceof FaceElement) parent.replaceChild(created, at);
				created.appendChild(at);
				before = NO_LEVELS[0];
				at = created;
			}
		}
		patchAttributes(at, before ?? NO_LEVELS[0], level);
	}
	return at;
}

export type DecoratedChild = {
	readonly node: PMNode;
	readonly index: number;
	readonly offset: number;
	readonly outer: readonly Decoration[];
	readonly inner: DecorationSource;
};

/**
 * prosemirror-view's iterDeco for what becomes an element: every child but text, with its outer and inner decorations,
 * and the widgets in document and side order between them (text is never split, it has no element)
 */
export function walkDecoratedChildren(
	parent: PMNode,
	source: DecorationSource,
	onWidget: (widget: Decoration) => void,
	onChild: (child: DecoratedChild) => void
): void {
	const locals = localDecorations(source, parent);
	const widgets = locals.filter(isWidget).sort((a, b) => a.from - b.from || widgetSide(a) - widgetSide(b));
	const active: Decoration[] = [];
	let nextWidget = 0;
	let next = 0;
	parent.forEach((node, offset, index) => {
		while (nextWidget < widgets.length && widgets[nextWidget].from <= offset) onWidget(widgets[nextWidget++]);
		if (node.isText) return;
		const end = offset + node.nodeSize;
		for (let i = active.length - 1; i >= 0; i--) if (active[i].to <= offset) active.splice(i, 1);
		for (; next < locals.length && locals[next].from <= offset; next++) if (!isWidget(locals[next])) active.push(locals[next]);
		const covering = active.filter((d) => d.to >= end);
		const outer = node.isInline && !node.isLeaf ? covering.filter((d) => !isInlineDecoration(d)) : covering;
		onChild({ node, index, offset, outer: outer.length ? outer : NO_DECORATIONS, inner: source.forChild(offset, node) });
	});
	while (nextWidget < widgets.length) onWidget(widgets[nextWidget++]);
}
