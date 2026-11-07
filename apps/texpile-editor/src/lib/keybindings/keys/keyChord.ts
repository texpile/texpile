// keys as keybindings.json writes them: "mod+shift+k", "ctrl+k ctrl+s". mod is Cmd on macOS and Ctrl elsewhere
import { isMac } from '$lib/platform';

export type KeyChord = { ctrl: boolean; shift: boolean; alt: boolean; meta: boolean; key: string };
export type KeySequence = KeyChord[];

const NAMED = new Set([
	'enter',
	'tab',
	'space',
	'backspace',
	'delete',
	'escape',
	'insert',
	'home',
	'end',
	'pageup',
	'pagedown',
	'up',
	'down',
	'left',
	'right'
]);
const PUNCTUATION = new Set([';', '=', ',', '-', '.', '/', '`', '[', '\\', ']', "'"]);

const KEY_ALIASES: Record<string, string> = {
	esc: 'escape',
	return: 'enter',
	del: 'delete',
	ins: 'insert',
	arrowup: 'up',
	arrowdown: 'down',
	arrowleft: 'left',
	arrowright: 'right',
	plus: '=',
	minus: '-',
	backquote: '`',
	comma: ',',
	period: '.',
	slash: '/',
	backslash: '\\',
	semicolon: ';',
	quote: "'",
	bracketleft: '[',
	bracketright: ']',
	equal: '='
};

/** a key name as keybindings.json writes it, or null for one it does not know */
export function keyName(text: string): string | null {
	const lower = text.toLowerCase();
	const name = KEY_ALIASES[lower] ?? lower;
	if (/^[a-z0-9]$/.test(name) || NAMED.has(name) || PUNCTUATION.has(name)) return name;
	return /^f([1-9]|1[0-9]|2[0-4])$/.test(name) ? name : null;
}

function readChord(text: string, mac: boolean): KeyChord | null {
	// a trailing "+" is the plus key itself: "ctrl++"
	const parts = text.endsWith('++') ? [...text.slice(0, -2).split('+'), '='] : text.split('+');
	const chord: KeyChord = { ctrl: false, shift: false, alt: false, meta: false, key: '' };
	for (const [i, raw] of parts.entries()) {
		const part = raw.trim().toLowerCase();
		if (i === parts.length - 1) {
			const name = keyName(part);
			if (!name) return null;
			chord.key = name;
		} else if (part === 'mod') chord[mac ? 'meta' : 'ctrl'] = true;
		else if (part === 'ctrl' || part === 'control') chord.ctrl = true;
		else if (part === 'shift') chord.shift = true;
		else if (part === 'alt' || part === 'option' || part === 'opt') chord.alt = true;
		else if (part === 'cmd' || part === 'command' || part === 'meta' || part === 'win' || part === 'super') chord.meta = true;
		else return null;
	}
	return chord;
}

/** null for text that is not a key: an unknown name, a stray modifier, nothing at all */
export function parseKeys(text: string, mac = isMac): KeySequence | null {
	const chords = text.trim().split(/\s+/).filter(Boolean);
	if (!chords.length) return null;
	const sequence: KeySequence = [];
	for (const chord of chords) {
		const read = readChord(chord, mac);
		if (!read) return null;
		sequence.push(read);
	}
	return sequence;
}

/** the form keybindings.json gets, mod first */
export function chordText(chord: KeyChord, mac = isMac): string {
	const mod = mac ? chord.meta : chord.ctrl;
	const parts = [
		mod && 'mod',
		chord.ctrl && (mac || !mod) && 'ctrl',
		chord.shift && 'shift',
		chord.alt && 'alt',
		chord.meta && !mac && 'meta'
	].filter((p): p is string => !!p);
	return [...parts, chord.key].join('+');
}

export function keysText(sequence: KeySequence, mac = isMac): string {
	return sequence.map((c) => chordText(c, mac)).join(' ');
}

export function sameChord(a: KeyChord, b: KeyChord): boolean {
	return a.key === b.key && a.ctrl === b.ctrl && a.shift === b.shift && a.alt === b.alt && a.meta === b.meta;
}

/** the platform independent text a resolver indexes chords by */
export function chordId(chord: KeyChord): string {
	return `${+chord.ctrl}${+chord.shift}${+chord.alt}${+chord.meta}${chord.key}`;
}
