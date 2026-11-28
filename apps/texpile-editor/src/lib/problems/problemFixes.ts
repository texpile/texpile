// a fix that changes a file's text, as typing would: undoable, saved by autosave, a closed file written
import { changeTextNow } from '$lib/buffers/textNow';
import type { ProblemFix } from './problemTypes';

// how far the words may have moved since the check before the fix gives up
const NEAR = 400;

function placeOf(text: string, at: number, words: string): number | null {
	if (text.startsWith(words, at)) return at;
	let best: number | null = null;
	for (let i = text.indexOf(words, Math.max(0, at - NEAR)); i !== -1 && i <= at + NEAR; i = text.indexOf(words, i + 1)) {
		if (best === null || Math.abs(i - at) < Math.abs(best - at)) best = i;
	}
	return best;
}

/** `words` at `at` in `file` become `insert`; nothing happens when they are gone */
export function replaceFix(file: string, at: number, words: string, insert: string, label: string): ProblemFix {
	return {
		label,
		apply: () =>
			changeTextNow(file, (text) => {
				const place = placeOf(text, at, words);
				return place === null ? text : text.slice(0, place) + insert + text.slice(place + words.length);
			})
	};
}

export type TextChange = { from: number; to?: number; insert?: string };

/** changes worked out from the text as it is when the fix runs */
export function changesFix(file: string, label: string, changesIn: (text: string) => TextChange[] | null): ProblemFix {
	return {
		label,
		apply: () =>
			changeTextNow(file, (text) => {
				const changes = changesIn(text);
				if (!changes) return text;
				let out = text;
				for (const c of [...changes].sort((a, b) => b.from - a.from))
					out = out.slice(0, c.from) + (c.insert ?? '') + out.slice(c.to ?? c.from);
				return out;
			})
	};
}
