// a DOM-lite element: faces and toDOM build these with the DOM's member names; layout, paint and hits read them
import type { FaceEventType, FaceHandler, ReplacedContent } from '../contracts/faceTypes';
import type { ElementState, RunChain, StyleLook } from '../contracts/styleTypes';
import type { ViewElementRef } from '../contracts/viewTypes';
import type { NodeViewDesc } from './nodeViewDesc';
import { closestMatching, matchesSelector, selectAll, selectFirst } from './faceQuery';
import { serializeChildren, serializeElement } from './faceMarkup';
import { createDataset, createFaceStyle, FaceClassList, type FaceInlineStyle } from './faceStyle';

export type FaceChild = FaceElement | FaceText;
type FaceInsertable = FaceChild | string;
type FaceRectResolver = (el: FaceElement) => DOMRect | null;

const HTML_NAMESPACE = 'http://www.w3.org/1999/xhtml';
const mutationWatchers = new WeakMap<FaceElement, (el: FaceElement) => void>();
const rectResolvers = new WeakMap<FaceElement, FaceRectResolver>();
let watcherCount = 0;
/** every mutation of every face element in the window */
let mutations = 0;

/** a count that moves with every mutation of a face element: a style checked since it did not move is still current */
export function faceMutationCount(): number {
	return mutations;
}

function emptyRect(): DOMRect {
	const rect = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 };
	return { ...rect, toJSON: () => rect };
}

function rootOf(el: FaceElement): FaceElement {
	let root = el;
	while (root.parentNode instanceof FaceElement) root = root.parentNode;
	return root;
}

function reparent(child: FaceChild, parent: FaceElement | null): void {
	// eslint-disable-next-line no-param-reassign -- inserting a node re-parents it, as the DOM does
	child.parentNode = parent;
}

function siblingOf(node: FaceChild, step: -1 | 1): FaceChild | null {
	const parent = node.parentNode;
	if (!(parent instanceof FaceElement)) return null;
	return parent.childNodes[parent.childNodes.indexOf(node) + step] ?? null;
}

export class FaceText {
	readonly nodeType = 3 as const;
	readonly nodeName = '#text';
	parentNode: FaceElement | null = null;
	private text: string;

	constructor(text: string) {
		this.text = text;
	}

	// eslint-disable-next-line id-denylist -- the DOM's name
	get data(): string {
		return this.text;
	}

	// eslint-disable-next-line id-denylist -- the DOM's name
	set data(text: string) {
		this.text = text;
		this.parentNode?.noteMutation();
	}

	get nodeValue(): string {
		return this.text;
	}

	get textContent(): string {
		return this.text;
	}

	set textContent(text: string) {
		this.text = text;
		this.parentNode?.noteMutation();
	}

	get length(): number {
		return this.text.length;
	}

	get nextSibling(): FaceChild | null {
		return siblingOf(this, 1);
	}

	get previousSibling(): FaceChild | null {
		return siblingOf(this, -1);
	}

	remove(): void {
		this.parentNode?.removeChild(this);
	}

	cloneNode(): FaceText {
		return new FaceText(this.text);
	}
}

export class FaceElement implements ViewElementRef {
	readonly nodeType: 1 | 11;
	/** upper case for HTML, so prosemirror-tables' domInCell (nodeName == "TD") works on a retargeted event */
	readonly tagName: string;
	// eslint-disable-next-line @typescript-eslint/naming-convention -- the DOM's name
	readonly namespaceURI: string | null;
	parentNode: FaceElement | HTMLElement | null = null;
	/** the hover hint tip() attached; shown by HintTooltip after the app's tooltip delay */
	hint: string | null = null;
	/** drawn content CSS does not describe: a bitmap, a formula, an icon, a checkbox */
	replaced: ReplacedContent | null = null;
	/** where the node's children go (a node view's contentDOM) */
	hole = false;
	/** handlers the pointer machine runs before ProseMirror's own handling, innermost first (a node view's stopEvent) */
	on: Partial<Record<FaceEventType, FaceHandler>> = {};
	/** the view this element is the dom of (prosemirror-view's pmViewDesc): events ask its stopEvent */
	viewDesc: NodeViewDesc | null = null;
	/** a name overlays and geometry.partRect anchor to */
	anchor: string | null = null;
	/** an inline node's marks: its element inherits what they set (a color), as the DOM's wrapping spans give it */
	marks: RunChain | null = null;
	/** generated parts the host's view writes (a heading number, a list marker, a caption prefix) */
	generatedBefore: FaceElement | null = null;
	generatedAfter: FaceElement | null = null;
	generatedMarker: FaceElement | null = null;
	/** a generated part: no positions, no caret stops, left out of copy; a hit on it answers its host */
	generated = false;
	/** how far a box that scrolls sideways (layout/scrollBox.ts) is scrolled; set it with noteMutation, which lays it out again */
	scrollLeft = 0;
	/** style deltas while a state is on, in place of :hover, :focus-within and :active rules */
	states: Partial<Record<ElementState, StyleLook>> | null = null;
	/** an ancestor whose states this element's looks follow too, as a group-hover rule shows a part while its card is hovered */
	statesFrom: FaceElement | null = null;
	private readonly childNodeList: FaceChild[] = [];
	private readonly attributes = new Map<string, string>();
	/** the DOM folds attribute names to lower case on HTML elements only: SVG keeps viewBox */
	private readonly foldsAttributeCase: boolean;
	private revision = 0;
	private shape: { revision: number; key: string } | null = null;
	// made on first use: a paper holds tens of thousands of elements, few of which are styled or read by dataset
	private inlineStyle: FaceInlineStyle | null = null;
	private classes: FaceClassList | null = null;
	private dataAttributes: Record<string, string | undefined> | null = null;

	constructor(tag: string, namespace: string | null = null, fragment = false) {
		this.nodeType = fragment ? 11 : 1;
		this.namespaceURI = namespace;
		this.foldsAttributeCase = namespace === null || namespace === HTML_NAMESPACE;
		this.tagName = fragment ? '#document-fragment' : this.foldsAttributeCase ? tag.toUpperCase() : tag;
	}

	get style(): FaceInlineStyle {
		return (this.inlineStyle ??= createFaceStyle(() => {
			if (!this.attributes.has('style')) this.attributes.set('style', '');
			this.noteMutation();
		}));
	}

	get classList(): FaceClassList {
		return (this.classes ??= new FaceClassList(
			() => this.className,
			(value) => (this.className = value)
		));
	}

	get dataset(): Record<string, string | undefined> {
		return (this.dataAttributes ??= createDataset({
			get: (name) => this.getAttribute(name),
			set: (name, value) => this.setAttribute(name, value),
			remove: (name) => this.removeAttribute(name),
			names: () => this.getAttributeNames()
		}));
	}

	/** bumped by every mutation; a mutation after build marks the owning block dirty */
	get version(): number {
		return this.revision;
	}

	/** @internal bumps the version and tells the block's watcher */
	noteMutation(): void {
		this.revision++;
		mutations++;
		if (!watcherCount) return;
		const root = rootOf(this);
		mutationWatchers.get(root)?.(this);
	}

	get nodeName(): string {
		return this.tagName;
	}

	get parentElement(): FaceElement | HTMLElement | null {
		return this.parentNode;
	}

	get childNodes(): readonly FaceChild[] {
		return this.childNodeList;
	}

	get children(): readonly FaceElement[] {
		return this.childNodeList.filter((c): c is FaceElement => c instanceof FaceElement);
	}

	get childElementCount(): number {
		return this.children.length;
	}

	get firstChild(): FaceChild | null {
		return this.childNodes[0] ?? null;
	}

	get lastChild(): FaceChild | null {
		return this.childNodes.at(-1) ?? null;
	}

	get firstElementChild(): FaceElement | null {
		return this.children[0] ?? null;
	}

	get lastElementChild(): FaceElement | null {
		return this.children.at(-1) ?? null;
	}

	get nextSibling(): FaceChild | null {
		return siblingOf(this, 1);
	}

	get previousSibling(): FaceChild | null {
		return siblingOf(this, -1);
	}

	get nextElementSibling(): FaceElement | null {
		let at = this.nextSibling;
		while (at && !(at instanceof FaceElement)) at = at.nextSibling;
		return at;
	}

	get previousElementSibling(): FaceElement | null {
		let at = this.previousSibling;
		while (at && !(at instanceof FaceElement)) at = at.previousSibling;
		return at;
	}

	get className(): string {
		return this.attributes.get('class') ?? '';
	}

	set className(value: string) {
		this.setAttribute('class', value);
	}

	get id(): string {
		return this.getAttribute('id') ?? '';
	}

	set id(value: string) {
		this.setAttribute('id', value);
	}

	get title(): string {
		return this.getAttribute('title') ?? '';
	}

	set title(value: string) {
		this.setAttribute('title', value);
	}

	get role(): string | null {
		return this.getAttribute('role');
	}

	set role(value: string | null) {
		if (value === null) this.removeAttribute('role');
		else this.setAttribute('role', value);
	}

	get hidden(): boolean {
		return this.hasAttribute('hidden');
	}

	set hidden(on: boolean) {
		this.toggleAttribute('hidden', on);
	}

	get textContent(): string {
		return this.childNodes.map((c) => c.textContent).join('');
	}

	set textContent(text: string | null) {
		this.replaceChildren(...(text ? [text] : []));
	}

	/** serialized, for tests */
	get innerHTML(): string {
		return serializeChildren(this);
	}

	get outerHTML(): string {
		return serializeElement(this);
	}

	getAttribute(name: string): string | null {
		const key = this.attributeKey(name);
		if (key === 'style') return this.attributes.has('style') ? this.style.cssText : null;
		return this.attributes.get(key) ?? null;
	}

	getAttributeNames(): string[] {
		return [...this.attributes.keys()];
	}

	/** namespace, tag and attributes as one string, kept until the element changes */
	get shapeKey(): string {
		if (this.shape?.revision === this.revision) return this.shape.key;
		let key = this.namespaceURI === null ? this.tagName : `${this.namespaceURI} ${this.tagName}`;
		// forEach: the first screen keys a thousand blocks in cold code, where an entry iterator costs the most
		if (this.attributes.size)
			this.attributes.forEach((value, name) => (key += `\n${name}=${name === 'style' ? this.style.cssText : value}`));
		this.shape = { revision: this.revision, key };
		return key;
	}

	setAttribute(name: string, value: string): void {
		const key = this.attributeKey(name);
		if (key === 'style') {
			this.attributes.set('style', '');
			this.style.cssText = String(value);
			return;
		}
		this.attributes.set(key, String(value));
		this.noteMutation();
	}

	// eslint-disable-next-line @typescript-eslint/naming-convention -- the DOM's name
	setAttributeNS(_namespace: string | null, name: string, value: string): void {
		this.setAttribute(name.slice(name.indexOf(':') + 1), value);
	}

	removeAttribute(name: string): void {
		const key = this.attributeKey(name);
		if (!this.attributes.delete(key)) return;
		if (key === 'style') this.style.cssText = '';
		this.noteMutation();
	}

	hasAttribute(name: string): boolean {
		return this.attributes.has(this.attributeKey(name));
	}

	private attributeKey(name: string): string {
		return this.foldsAttributeCase ? name.toLowerCase() : name;
	}

	toggleAttribute(name: string, on?: boolean): boolean {
		const want = on ?? !this.hasAttribute(name);
		if (want && !this.hasAttribute(name)) this.setAttribute(name, '');
		if (!want) this.removeAttribute(name);
		return want;
	}

	appendChild<T extends FaceChild>(child: T): T {
		return this.insertBefore(child, null);
	}

	insertBefore<T extends FaceChild>(child: T, before: FaceChild | null): T {
		if (child instanceof FaceElement && child.nodeType === 11) {
			for (const inner of [...child.childNodes]) this.insertBefore(inner, before);
			return child;
		}
		if (child instanceof FaceElement && child.contains(this)) throw new Error('a face element cannot hold its own ancestor');
		if (child.parentNode instanceof FaceElement) child.parentNode.removeChild(child);
		const at = before ? this.childNodeList.indexOf(before) : -1;
		this.childNodeList.splice(at < 0 ? this.childNodeList.length : at, 0, child);
		reparent(child, this);
		this.noteMutation();
		return child;
	}

	removeChild<T extends FaceChild>(child: T): T {
		const at = this.childNodeList.indexOf(child);
		if (at < 0) throw new Error('not a child of this face element');
		this.childNodeList.splice(at, 1);
		reparent(child, null);
		this.noteMutation();
		return child;
	}

	replaceChild<T extends FaceChild>(child: FaceChild, old: T): T {
		this.insertBefore(child, old);
		return this.removeChild(old);
	}

	append(...children: FaceInsertable[]): void {
		for (const child of children) this.appendChild(typeof child === 'string' ? new FaceText(child) : child);
	}

	prepend(...children: FaceInsertable[]): void {
		const first = this.firstChild;
		for (const child of children) this.insertBefore(typeof child === 'string' ? new FaceText(child) : child, first);
	}

	replaceChildren(...children: FaceInsertable[]): void {
		for (const child of [...this.childNodes]) this.removeChild(child);
		this.append(...children);
	}

	before(...nodes: FaceInsertable[]): void {
		const parent = this.parentNode;
		if (!(parent instanceof FaceElement)) return;
		for (const node of nodes) parent.insertBefore(typeof node === 'string' ? new FaceText(node) : node, this);
	}

	after(...nodes: FaceInsertable[]): void {
		const parent = this.parentNode;
		if (!(parent instanceof FaceElement)) return;
		const next = this.nextSibling;
		for (const node of nodes) parent.insertBefore(typeof node === 'string' ? new FaceText(node) : node, next);
	}

	replaceWith(...nodes: FaceInsertable[]): void {
		const parent = this.parentNode;
		if (!(parent instanceof FaceElement)) return;
		this.before(...nodes);
		parent.removeChild(this);
	}

	remove(): void {
		if (this.parentNode instanceof FaceElement) this.parentNode.removeChild(this);
	}

	contains(other: FaceChild | null): boolean {
		for (
			let at: FaceElement | HTMLElement | FaceChild | null = other;
			at instanceof FaceElement || at instanceof FaceText;
			at = at.parentNode
		)
			if (at === this) return true;
		return false;
	}

	cloneNode(deep = false): FaceElement {
		const copy = new FaceElement(this.tagName, this.namespaceURI, this.nodeType === 11);
		for (const name of this.getAttributeNames()) copy.setAttribute(name, this.getAttribute(name) ?? '');
		Object.assign(copy, { hint: this.hint, replaced: this.replaced, hole: this.hole, on: { ...this.on }, anchor: this.anchor });
		Object.assign(copy, { generated: this.generated, states: this.states });
		if (deep) for (const child of this.childNodes) copy.appendChild(child.cloneNode(true));
		return copy;
	}

	closest(selector: string): FaceElement | null {
		return closestMatching(this, selector) as FaceElement | null;
	}

	querySelector(selector: string): FaceElement | null {
		return selectFirst(this, selector) as FaceElement | null;
	}

	querySelectorAll(selector: string): FaceElement[] {
		return selectAll(this, selector) as FaceElement[];
	}

	matches(selector: string): boolean {
		return matchesSelector(this, selector);
	}

	/** the laid-out border box in client px, or an empty rect when its block is not laid out */
	getBoundingClientRect(): DOMRect {
		return rectResolvers.get(rootOf(this))?.(this) ?? emptyRect();
	}
}

export function faceElement(tag: string, className?: string, text?: string): FaceElement {
	const el = new FaceElement(tag);
	if (className) el.className = className;
	if (text) el.textContent = text;
	return el;
}

export function faceText(text: string): FaceText {
	return new FaceText(text);
}

/** the layout answers getBoundingClientRect for every element under a laid-out block's root */
export function provideFaceRects(root: FaceElement, resolve: FaceRectResolver | null): void {
	if (resolve) rectResolvers.set(root, resolve);
	else rectResolvers.delete(root);
}

/** runs after any mutation under root; returns the way to stop */
export function watchFaceMutations(root: FaceElement, listener: (el: FaceElement) => void): () => void {
	mutationWatchers.set(root, listener);
	watcherCount++;
	return () => {
		if (mutationWatchers.get(root) === listener) mutationWatchers.delete(root);
		watcherCount--;
	};
}
