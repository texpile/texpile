// what a pressed key adds to the keys being recorded: a chord, then the second of a sequence, then a fresh start
import { chordOfEvent } from '$lib/keybindings/keys/keyEvent';
import type { KeySequence } from '$lib/keybindings/keys/keyChord';

const MAX_CHORDS = 2;

export function recordKey(recorded: KeySequence, e: KeyboardEvent, mac: boolean): KeySequence {
	const chord = chordOfEvent(e, mac);
	if (!chord) return recorded;
	return recorded.length >= MAX_CHORDS ? [chord] : [...recorded, chord];
}

/** a plain Enter or Escape is the dialog's own, never a key being recorded */
export function plainKey(e: KeyboardEvent, key: 'Enter' | 'Escape'): boolean {
	return e.key === key && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey;
}
