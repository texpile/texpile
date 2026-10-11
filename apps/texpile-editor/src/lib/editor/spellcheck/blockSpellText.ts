// The text spell check reads for one block, one character per document position so a lint maps back by offset.
import type { Mark, Node as PmNode } from 'prosemirror-model';
import { callLookOf, type CallDialect } from '$lib/editor/snippets/visual/callWrappers';
import { readTexCharacter } from '$lib/languages/latex/texCharacters';

/** a position that reads as nothing: the rest of a chip drawn as a letter */
const SKIPPED = '\uE000';
/** a formula, a reference or a chip, which harper reads as a formula and passes over */
const OPAQUE = '\uE001';
const MARKERS = /[\uE000\uE001]/g;

/** the letter a chip draws when it stands for one, so Poincar\'e reads as one word */
export function chipLetters(node: PmNode): string | null {
	if (node.type.name !== 'inline_latex') return null;
	const source = node.textContent;
	const read = source.startsWith('\\') ? readTexCharacter(source, 0) : null;
	if (!read || read.end !== source.length) return null;
	// \"{\i} draws a dotless i under a combining accent, and harper splits a word at a combining mark
	const letters = read.text
		.replace(/ı(?=\p{M})/gu, 'i')
		.replace(/ȷ(?=\p{M})/gu, 'j')
		.normalize('NFC');
	return letters.length <= node.nodeSize ? letters : null;
}

// false for a call whose look says its words are not prose
function callSpellchecked(mark: Mark): boolean {
	return callLookOf(mark.type.spec.dialect as CallDialect, mark.attrs.name as string)?.spellcheck !== false;
}

/** link text is blanked (an address, or a label the link tooltip owns), and so is a source block, drawn or in CodeMirror */
export function blockSpellText(node: PmNode): string {
	if (node.type.spec.code) return ' '.repeat(node.content.size);
	const linkType = node.type.schema.marks.link;
	let text = '';
	node.content.forEach((child) => {
		if (child.isText) {
			const t = child.text ?? '';
			const blank = child.marks.some((mk) => mk.type === linkType || (mk.type.name === 'call' && !callSpellchecked(mk)));
			text += blank ? ' '.repeat(t.length) : t;
		} else if (child.isLeaf) {
			text += child.type.name === 'hard_break' ? '\n' : OPAQUE;
		} else {
			const shown = chipLetters(child) ?? OPAQUE;
			text += shown + SKIPPED.repeat(child.nodeSize - shown.length);
		}
	});
	return text;
}

type HarperReading = { text: string; blockSpan(offset: number, length: number): { offset: number; length: number } };

/** what harper reads for a block's spell text, and the block span a lint on it covers */
export function harperReading(block: string): HarperReading {
	let text = '';
	const origin: number[] = [];
	for (let i = 0; i < block.length; i++) {
		const read = block[i] === SKIPPED ? '' : block[i] === OPAQUE ? '$x$' : block[i];
		text += read;
		for (let k = 0; k < read.length; k++) origin.push(i);
	}
	return {
		text,
		blockSpan(offset, length) {
			const from = offset < origin.length ? origin[offset] : block.length;
			let to = length > 0 ? origin[offset + length - 1] + 1 : from;
			// a lint ending on a chip's letter covers the whole chip
			while (block[to] === SKIPPED) to++;
			return { offset: from, length: to - from };
		}
	};
}

/** a lint's own text with the markers taken out, which is the word the dictionary gets */
export function readableSpellText(text: string): string {
	return text.replace(MARKERS, '');
}
