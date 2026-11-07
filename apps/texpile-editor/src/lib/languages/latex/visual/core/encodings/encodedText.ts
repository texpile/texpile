import type { EncodingTable } from '$lib/languages/latex/knowledge/types';

const BOUNDARY = Symbol('boundary');
const MOST_STEPS = 1000;

type Slot = { slot: number; typed: boolean };
type Item = Slot | string | typeof BOUNDARY;

function ligate(items: Item[], table: EncodingTable): (Slot | string)[] {
	const seq: Item[] = table.boundary === undefined ? [...items] : [...items, BOUNDARY];
	function ruleFor(a: Item, b: Item) {
		const left = typeof a === 'object' ? a.slot : null;
		const right = b === BOUNDARY ? table.boundary : typeof b === 'object' ? b.slot : null;
		return left === null || right === null || right === undefined
			? undefined
			: table.ligatures.find((l) => l.left === left && l.right === right);
	}
	let i = 0;
	for (let steps = 0; i < seq.length - 1 && steps < MOST_STEPS; steps++) {
		const rule = ruleFor(seq[i], seq[i + 1]);
		if (!rule) {
			i++;
			continue;
		}
		const made: Slot = { slot: rule.to, typed: false };
		if (rule.keeps === 'right') seq.splice(i, 1, made);
		else if (rule.keeps === 'left') seq.splice(i + 1, 1, made);
		else seq.splice(i, 2, made);
	}
	return seq.filter((item): item is Slot | string => item !== BOUNDARY);
}

function shownBy(items: (Slot | string)[], table: EncodingTable): string {
	let out = '';
	for (let k = 0; k < items.length; k++) {
		const item = items[k];
		if (typeof item === 'string') {
			out += item;
			continue;
		}
		const mark = table.marks[item.slot];
		const next = items[k + 1];
		// an accent not made a letter of its own by a ligature sits on the letter after it (a breathing on a capital)
		if (mark !== undefined && typeof next === 'object' && table.letters[next.slot] !== undefined && table.marks[next.slot] === undefined) {
			out += (table.letters[next.slot] + mark).normalize('NFC');
			k++;
		} else out += table.letters[item.slot] ?? (item.typed ? String.fromCharCode(item.slot) : (mark ?? ''));
	}
	return out;
}

function wordShown(word: string, table: EncodingTable): string {
	const items: Item[] = [...word].map((char) =>
		char.charCodeAt(0) < 256 && char.length === 1 ? { slot: char.charCodeAt(0), typed: true } : char
	);
	return shownBy(ligate(items, table), table);
}

export function encodedText(text: string, table: EncodingTable): string {
	return text
		.split(/([\s~]+)/)
		.map((piece, i) => (i % 2 ? piece.replace(/~/g, ' ') : wordShown(piece, table)))
		.join('');
}
