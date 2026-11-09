import type { KeyChord } from './keyChord';
import { keyName } from './keyChord';

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'OS', 'Hyper', 'Super', 'Fn']);

// a + key of its own (German, Nordic, the numpad) is the = key, as "ctrl++" reads
const DOM_NAMES: Record<string, string> = {
	' ': 'space',
	'+': '=',
	ArrowUp: 'up',
	ArrowDown: 'down',
	ArrowLeft: 'left',
	ArrowRight: 'right'
};

const NUMPAD_KEYS: Record<string, string> = { NumpadAdd: '=', NumpadSubtract: '-' };

/** the US key at a physical position, for a layout whose character names no key (AZERTY digits, Cyrillic, Option on macOS) */
function keyAt(code: string): string | null {
	const at = /^(?:Key([A-Z])|Digit([0-9])|Numpad([0-9]))$/.exec(code);
	if (at) return (at[1] ?? at[2] ?? at[3]).toLowerCase();
	return NUMPAD_KEYS[code] ?? keyName(code);
}

type KeyPress = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey' | 'isComposing'> & {
	getModifierState?: (key: string) => boolean;
};

/** false where the character typed belongs to another key: anything Option types on macOS, a shifted digit or punctuation */
function typedNamesKey(e: KeyPress, mac: boolean): boolean {
	if (mac && e.altKey) return false;
	return !e.shiftKey || [...e.key].length !== 1 || /^\p{L}$/u.test(e.key);
}

/** null for a press that is no shortcut: a modifier alone, IME composition, AltGr typing a character */
export function chordOfEvent(e: KeyPress, mac: boolean): KeyChord | null {
	if (e.isComposing || e.key === 'Process' || MODIFIER_KEYS.has(e.key)) return null;
	if (!mac && e.getModifierState?.('AltGraph') && [...e.key].length === 1) return null;
	const typed = typedNamesKey(e, mac) ? keyName(DOM_NAMES[e.key] ?? e.key) : null;
	const key = typed ?? keyAt(e.code);
	if (!key) return null;
	return { ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey, key };
}
