import { NodeSelection, Plugin, PluginKey, type EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import type { Node } from 'prosemirror-model';
import { documentCountStore } from '$lib/stores/countStore.svelte';
import { trailingDebounce } from '$lib/trailingDebounce';
import { countProse } from '$lib/workspace/wordCount/proseWords';
import { extractText, extractTextSlices, type RawProse } from './selectionText';

const wordCountKey = new PluginKey('wordCount');

function noCount(): void {}

function publishSelectionCount(text: string | null, node: boolean): void {
	const counted = text === null ? null : countProse(text);
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

// a selection of a whole paper is read in slices of this long, a task each, so the editor keeps answering
const SLICE_MS = 30;

/** counts the selection and returns the way to drop the count; a selection read within one slice lands at once */
function startSelectionCount(doc: Node, from: number, to: number, prose: RawProse | undefined, node: boolean): () => void {
	if (from === to) {
		publishSelectionCount(null, node);
		return noCount;
	}
	const slices = extractTextSlices(doc, from, to, prose);
	let timer: ReturnType<typeof setTimeout> | undefined;
	function run(): void {
		const end = performance.now() + SLICE_MS;
		for (;;) {
			const step = slices.next();
			if (step.done) return publishSelectionCount(step.value, node);
			if (performance.now() >= end) break;
		}
		timer = setTimeout(run);
	}
	run();
	return () => {
		clearTimeout(timer);
		slices.return('');
	};
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
	let stopCount = noCount;
	function countSelection(doc: Node, from: number, to: number, node: boolean): void {
		stopCount();
		stopCount = startSelectionCount(doc, from, to, prose, node);
	}
	const deferredSelectionCount = trailingDebounce(150, ({ doc, from, to, node }: { doc: Node; from: number; to: number; node: boolean }) =>
		countSelection(doc, from, to, node)
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
				if (fresh) countSelection(doc, from, to, node);
				else if (!before || before.doc !== doc || !before.selection.eq(selection)) {
					// a count under way is of a selection that is gone
					stopCount();
					deferredSelectionCount({ doc, from, to, node });
				}
			}
			sync(view);
			return {
				update: sync,
				// a timer outliving this editor would overwrite the NEXT document's counts
				destroy: () => {
					if (!view.editable) return;
					deferredDocCount.cancel();
					deferredSelectionCount.cancel();
					stopCount();
				}
			};
		}
	});
}
