import { Plugin, PluginKey } from 'prosemirror-state';
import type { Node } from 'prosemirror-model';
import { documentCountStore } from '$lib/stores/countStore.svelte';
import { trailingDebounce } from '$lib/trailingDebounce';

const wordCountKey = new PluginKey('wordCount');

// math, code, raw latex and citations are excluded so counts reflect readable prose
function extractTextForCounting(doc: Node): string {
	let text = '';

	doc.descendants((node, _pos, _parent) => {
		if (node.type.name === 'inline_math' || node.type.name === 'block_math') {
			return false;
		}

		if (node.type.name === 'code_block') {
			return false;
		}

		if (node.type.name === 'raw_latex') {
			return false;
		}

		if (node.type.name === 'citation') {
			return false;
		}

		if (node.type.name === 'text') {
			text += node.text || '';
		}

		// space between blocks so words don't merge
		if (node.isBlock && node.type.name !== 'doc' && text && !text.endsWith(' ')) {
			text += ' ';
		}

		return true;
	});

	return text.trim();
}

/** like extractTextForCounting but clipped to a range, for selection counts. */
function extractTextFromRange(doc: Node, from: number, to: number): string {
	let text = '';

	doc.nodesBetween(from, to, (node, pos) => {
		if (node.type.name === 'inline_math' || node.type.name === 'block_math') {
			return false;
		}

		if (node.type.name === 'code_block') {
			return false;
		}

		if (node.type.name === 'raw_latex') {
			return false;
		}

		if (node.type.name === 'citation') {
			return false;
		}

		if (node.type.name === 'text' && node.text) {
			const nodeStart = pos;

			const start = Math.max(0, from - nodeStart);
			const end = Math.min(node.text.length, to - nodeStart);

			if (start < end) {
				text += node.text.slice(start, end);
			}
		}

		// space between blocks so words don't merge
		if (node.isBlock && node.type.name !== 'doc' && text && !text.endsWith(' ')) {
			text += ' ';
		}

		return true;
	});

	return text.trim();
}

function countWords(text: string): number {
	if (!text.trim()) return 0;

	const words = text
		.trim()
		.split(/\s+/)
		.filter((word) => word.length > 0);
	return words.length;
}

function countCharacters(text: string): { withSpaces: number; withoutSpaces: number } {
	const withSpaces = text.length;
	const withoutSpaces = text.replace(/\s/g, '').length;

	return { withSpaces, withoutSpaces };
}

function updateSelectionCount(doc: Node, from: number, to: number): void {
	if (from === to) {
		documentCountStore.selectionWords = null;
		documentCountStore.selectionCharacters = null;
		documentCountStore.selectionCharactersWithSpaces = null;
	} else {
		const selectedText = extractTextFromRange(doc, from, to);
		const words = countWords(selectedText);
		const characters = countCharacters(selectedText);

		documentCountStore.selectionWords = words;
		documentCountStore.selectionCharacters = characters.withoutSpaces;
		documentCountStore.selectionCharactersWithSpaces = characters.withSpaces;
	}
}

function updateDocCount(doc: Node): void {
	const text = extractTextForCounting(doc);
	const characters = countCharacters(text);
	documentCountStore.words = countWords(text);
	documentCountStore.characters = characters.withoutSpaces;
	documentCountStore.charactersWithSpaces = characters.withSpaces;
}

/** tracks document and selection word/character counts into documentCountStore. counts are
 * display-only, so the full-doc/range walks run debounced instead of per transaction. */
export function createWordCountPlugin() {
	const deferredDocCount = trailingDebounce(300, updateDocCount);
	const deferredSelectionCount = trailingDebounce(150, ({ doc, from, to }: { doc: Node; from: number; to: number }) =>
		updateSelectionCount(doc, from, to)
	);

	return new Plugin({
		key: wordCountKey,

		state: {
			init(_config, state) {
				updateDocCount(state.doc);
				const { from, to } = state.selection;
				updateSelectionCount(state.doc, from, to);
				return null;
			},

			apply(tr) {
				if (tr.docChanged) deferredDocCount(tr.doc);
				// selection can change without a doc change; one debouncer for range counts AND the
				// collapsed clear, so a pending count can never land after a newer clear
				const { from, to } = tr.selection;
				deferredSelectionCount({ doc: tr.doc, from, to });
				return null;
			}
		},
		// a timer outliving this editor would overwrite the NEXT document's counts
		view: () => ({
			destroy: () => {
				deferredDocCount.cancel();
				deferredSelectionCount.cancel();
			}
		})
	});
}
