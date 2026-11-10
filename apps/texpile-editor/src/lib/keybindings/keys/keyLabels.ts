import { isMac } from '$lib/platform';
import type { KeyChord, KeySequence } from './keyChord';

const MAC_KEYS: Record<string, string> = {
	enter: '↩',
	tab: '⇥',
	space: 'Space',
	backspace: '⌫',
	delete: '⌦',
	escape: '⎋',
	home: '↖',
	end: '↘',
	pageup: '⇞',
	pagedown: '⇟'
};
const PC_KEYS: Record<string, string> = {
	enter: 'Enter',
	tab: 'Tab',
	space: 'Space',
	backspace: 'Backspace',
	delete: 'Delete',
	escape: 'Esc',
	insert: 'Insert',
	home: 'Home',
	end: 'End',
	pageup: 'PageUp',
	pagedown: 'PageDown'
};
const ARROWS: Record<string, string> = { up: '↑', down: '↓', left: '←', right: '→' };

/** the key alone, as a key cap reads */
export function keyCapText(key: string, mac = isMac): string {
	return ARROWS[key] ?? (mac ? MAC_KEYS : PC_KEYS)[key] ?? key.toUpperCase();
}

/** ⌃⌥⇧⌘K on macOS, in the order its menus use; Ctrl+Shift+Alt+K elsewhere */
export function chordParts(chord: KeyChord, mac = isMac): string[] {
	const key = keyCapText(chord.key, mac);
	if (mac) return [chord.ctrl && '⌃', chord.alt && '⌥', chord.shift && '⇧', chord.meta && '⌘', key].filter((p): p is string => !!p);
	return [chord.ctrl && 'Ctrl', chord.shift && 'Shift', chord.alt && 'Alt', chord.meta && 'Win', key].filter((p): p is string => !!p);
}

export function chordLabel(chord: KeyChord, mac = isMac): string {
	return chordParts(chord, mac).join(mac ? '' : '+');
}

export function keysLabel(sequence: KeySequence, mac = isMac): string {
	return sequence.map((c) => chordLabel(c, mac)).join(' ');
}

const ACCELERATOR_KEYS: Record<string, string> = {
	enter: 'Return',
	escape: 'Esc',
	up: 'Up',
	down: 'Down',
	left: 'Left',
	right: 'Right',
	pageup: 'PageUp',
	pagedown: 'PageDown',
	space: 'Space',
	// the menu shows ⌘+, and a layout's own + key matches it
	'=': 'Plus'
};

/** what Electron's native menu takes; null for a chord sequence, which a native menu cannot show */
export function electronAccelerator(sequence: KeySequence, mac = isMac): string | null {
	if (sequence.length !== 1) return null;
	const [chord] = sequence;
	const key =
		ACCELERATOR_KEYS[chord.key] ?? (chord.key.length === 1 ? chord.key.toUpperCase() : chord.key[0].toUpperCase() + chord.key.slice(1));
	const parts = [chord.ctrl && 'Ctrl', chord.alt && 'Alt', chord.shift && 'Shift', chord.meta && (mac ? 'Cmd' : 'Super'), key];
	return parts.filter((p): p is string => !!p).join('+');
}
