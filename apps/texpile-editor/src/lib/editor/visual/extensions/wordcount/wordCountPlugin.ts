import { NodeSelection, Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';
import { documentCountStore } from '$lib/stores/countStore.svelte';
import { trailingDebounce } from '$lib/trailingDebounce';
import { countProse } from '$lib/workspace/wordCount/proseWords';

const wordCountKey = new PluginKey('wordCount');

/** latexProse or typstProse; without one, raw blocks are left out and raw inline text counts as written */
export type RawProse = (raw: string) => string;

// never prose: math, code, and a citation, reference or label, whose text is a key
const SKIPPED = new Set(['inline_math', 'block_math', 'code_block', 'citation', 'ref', 'typ_ref', 'label']);
const RAW = new Set(['raw_latex', 'inline_latex']);

function extractText(doc: Node, from: number, to: number, prose?: RawProse): string {
	let text = '';

	doc.nodesBetween(from, to, (node, pos) => {
		if (SKIPPED.has(node.type.name)) return false;
		if (prose && RAW.has(node.type.name)) {
			const start = Math.max(0, from - pos - 1);
			const end = Math.min(node.content.size, to - pos - 1);
			if (start < end) text += ` ${prose(node.textBetween(start, end))} `;
			return false;
		}
		if (!prose && node.type.name === 'raw_latex') return false;
		if (node.type.name === 'hard_break') {
			text += ' ';
			return false;
		}

		if (node.type.name === 'text' && node.text) {
			const start = Math.max(0, from - pos);
			const end = Math.min(node.text.length, to - pos);
			if (start < end) text += node.text.slice(start, end);
		}

		// space between blocks so words don't merge
		if (node.isBlock && text && !text.endsWith(' ')) text += ' ';

		return true;
	});

	return text.trim();
}

function updateSelectionCount(doc: Node, from: number, to: number, prose?: RawProse, node = false): void {
	const counted = from === to ? null : countProse(extractText(doc, from, to, prose));
	// a Typst paper opens on its first block, a set rule, selected whole: "0 of 114 words" for a selection nobody made
	if (!counted || (node && counted.words === 0)) {
		documentCountStore.selectionWords = null;
		documentCountStore.selectionCharacters = null;
		documentCountStore.selectionCharactersWithSpaces = null;
	} else {
		const { words, characters, charactersWithSpaces } = counted;
		documentCountStore.selectionWords = words;
		documentCountStore.selectionCharacters = characters;
		documentCountStore.selectionCharactersWithSpaces = charactersWithSpaces;
	}
}

function updateDocCount(doc: Node): void {
	const { words, characters, charactersWithSpaces } = countProse(extractText(doc, 0, doc.content.size));
	documentCountStore.words = words;
	documentCountStore.characters = characters;
	documentCountStore.charactersWithSpaces = charactersWithSpaces;
}

/** with prose, selections only; the file total comes from source (countOpenFile), since this doc shows a \cref as code.
 *  Only the focused editor counts: a parked one shows another slot's file */
export function createWordCountPlugin(prose?: RawProse) {
	const deferredDocCount = trailingDebounce(300, updateDocCount);
	const deferredSelectionCount = trailingDebounce(150, ({ doc, from, to, node }: { doc: Node; from: number; to: number; node: boolean }) =>
		updateSelectionCount(doc, from, to, prose, node)
	);

	return new Plugin({
		key: wordCountKey,
		view: (view) => {
			let counted: Node | null = null;
			function sync(v: EditorView, before?: EditorState): void {
				if (!v.editable) {
					counted = null;
					return;
				}
				const { doc, selection } = v.state;
				const fresh = counted === null;
				if (!prose && counted !== doc) (fresh ? updateDocCount : deferredDocCount)(doc);
				counted = doc;
				const { from, to } = selection;
				const node = selection instanceof NodeSelection;
				// one debouncer for range counts AND the collapsed clear, so a pending count can never land after a newer clear
				if (fresh) updateSelectionCount(doc, from, to, prose, node);
				else if (!before || before.doc !== doc || !before.selection.eq(selection)) deferredSelectionCount({ doc, from, to, node });
			}
			sync(view);
			return {
				update: sync,
				// a timer outliving this editor would overwrite the NEXT document's counts
				destroy: () => {
					if (!view.editable) return;
					deferredDocCount.cancel();
					deferredSelectionCount.cancel();
				}
			};
		}
	});
}
