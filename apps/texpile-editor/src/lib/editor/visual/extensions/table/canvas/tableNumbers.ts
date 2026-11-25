import type { Node as PMNode } from 'prosemirror-model';
import type { Decoration } from 'prosemirror-view';
import type { CanvasBuildHelpers, EditorLanguage, VisualView } from '$lib/editor/canvas';
import { compiledNumbersOf } from '$lib/editor/visual/extensions/nodeNumbers';
import { m } from '$lib/paraglide/messages';

/** the number a float's decorations hand, by float node: the caption inside it builds after it and reads it */
const handedNumbers = new WeakMap<PMNode, string | null>();

export function noteHandedNumber(float: PMNode, decorations: readonly Decoration[]): string | null {
	const handed = compiledNumbersOf(decorations)?.[0] ?? null;
	handedNumbers.set(float, handed);
	return handed;
}

/** the caption's `Table 1: `; Typst and Markdown count their own until a compile hands a number */
export function captionPrefixOf(view: VisualView, language: EditorLanguage, counters: CanvasBuildHelpers['counters'], pos: number): string {
	const float = view.state.doc.resolve(pos).parent;
	const handed = handedNumbers.get(float) ?? null;
	const number = handed ?? (language === 'latex' ? '' : String(counters.at(pos, 'table')));
	return `${m.tablewrap_table_display({ number }).trim()}: `;
}
