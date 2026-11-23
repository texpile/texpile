// Lezer colors of raw and code text (14.2): the island view hands its hole a highlighter, the inline layout asks it for
// the classes over the text, which enter the run style chain innermost with the looks of the highlight style's specs
import type { Language } from '@codemirror/language';
import { TreeFragment, type Tree } from '@lezer/common';
import { highlightStyle } from '$lib/editor/code/highlightStyle';
import { highlightedSpans, type HighlightedSpan } from '$lib/editor/code/highlightSpans';
import { languageLoaded, languageNow, loadLanguage, type CodeLanguageName } from '$lib/editor/code/languageFor';
import { windowInvalidation } from '../document/invalidation';
import type { FaceInputKey } from '../contracts/invalidationTypes';
import type { StyleLook } from '../contracts/styleTypes';
import type { FaceElement } from '../tree/faceElement';

const highlighters = new WeakMap<FaceElement, IslandHighlighter>();
const awaited = new WeakMap<Window, Set<CodeLanguageName>>();

export function grammarKey(name: CodeLanguageName): FaceInputKey {
	return { kind: 'grammar', language: name };
}

type ClassLook = { readonly order: number; readonly look: StyleLook };

let classLooks: Map<string, ClassLook> | null = null;
const tokenLooks = new Map<string, StyleLook>();

/** each spec's generated class and its declarations, in the order the style module writes their rules */
function classLooksOf(): Map<string, ClassLook> {
	if (classLooks) return classLooks;
	classLooks = new Map();
	highlightStyle.specs.forEach(({ tag, ...look }, order) => {
		const name = highlightStyle.style([Array.isArray(tag) ? tag[0] : tag]);
		if (name) classLooks!.set(name, { order, look: look as StyleLook });
	});
	return classLooks;
}

/** a span's highlight classes as one look; the later rule wins where two declare a property */
export function tokenLookOf(classes: string): StyleLook {
	let look = tokenLooks.get(classes);
	if (look) return look;
	const known = classLooksOf();
	const parts = classes
		.split(' ')
		.flatMap((name) => known.get(name) ?? [])
		.sort((a, b) => a.order - b.order);
	look = Object.assign({}, ...parts.map((part) => part.look)) as StyleLook;
	tokenLooks.set(classes, look);
	return look;
}

/** the grammar now; null while it loads, and the window's islands that read it relay when it arrives */
export function islandGrammar(name: CodeLanguageName, win: Window): Language | null {
	const language = languageNow(name);
	if (language || languageLoaded(name)) return language;
	let names = awaited.get(win);
	if (!names) awaited.set(win, (names = new Set()));
	if (names.has(name)) return null;
	names.add(name);
	void loadLanguage(name).then(() => {
		names.delete(name);
		windowInvalidation(win).fire(grammarKey(name));
	});
	return null;
}

export class IslandHighlighter {
	private parsed: { readonly text: string; readonly tree: Tree } | null = null;
	private colored: { readonly text: string; readonly spans: readonly HighlightedSpan[] } | null = null;

	constructor(
		readonly name: CodeLanguageName,
		readonly language: Language | null
	) {}

	/** drawn uncolored until the grammar arrives */
	get pending(): boolean {
		return !this.language && !languageLoaded(this.name);
	}

	spansOf(text: string): readonly HighlightedSpan[] {
		if (!this.language) return [];
		if (this.colored?.text === text) return this.colored.spans;
		const spans = highlightedSpans(this.language, this.treeOf(text), text);
		this.colored = { text, spans };
		return spans;
	}

	/** the last tree reused around the one edited range a keystroke makes */
	private treeOf(text: string): Tree {
		const { parser } = this.language!;
		const last = this.parsed;
		let fragments: readonly TreeFragment[] = [];
		if (last) {
			let start = 0;
			const shortest = Math.min(last.text.length, text.length);
			while (start < shortest && last.text.charCodeAt(start) === text.charCodeAt(start)) start++;
			let end = 0;
			while (end < shortest - start && last.text.charCodeAt(last.text.length - 1 - end) === text.charCodeAt(text.length - 1 - end)) end++;
			const change = { fromA: start, toA: last.text.length - end, fromB: start, toB: text.length - end };
			fragments = TreeFragment.applyChanges(TreeFragment.addTree(last.tree), [change]);
		}
		const tree = parser.parse(text, fragments);
		this.parsed = { text, tree };
		return tree;
	}
}

export function highlightIsland(hole: FaceElement, highlighter: IslandHighlighter): void {
	highlighters.set(hole, highlighter);
}

export function islandHighlighterOf(hole: FaceElement): IslandHighlighter | null {
	return highlighters.get(hole) ?? null;
}
