import type { KeyChord } from './keyChord';
import { keyName } from './keyChord';

const MODIFIER_KEYS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock', 'OS', 'Hyper', 'Super', 'Fn']);

const DOM_NAMES: Record<string, string> = { ' ': 'space', ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

/** the US key at a physical position, for a layout whose character names no key (AZERTY digits, Cyrillic, Option on macOS) */
function keyAt(code: string): string | null {
	const at = /^(?:Key([A-Z])|Digit([0-9])|Numpad([0-9]))$/.exec(code);
	if (at) return (at[1] ?? at[2] ?? at[3]).toLowerCase();
	return keyName(code);
}

type KeyPress = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey' | 'isComposing'> & {
	getModifierState?: (key: string) => boolean;
};

/** null for a press that is no shortcut: a modifier alone, IME composition, AltGr typing a character */
export function chordOfEvent(e: KeyPress, mac: boolean): KeyChord | null {
	if (e.isComposing || e.key === 'Process' || MODIFIER_KEYS.has(e.key)) return null;
	if (!mac && e.getModifierState?.('AltGraph') && [...e.key].length === 1) return null;
	// Option changes what the key types on macOS, so the key's place names it
	const typed = mac && e.altKey ? null : keyName(DOM_NAMES[e.key] ?? e.key);
	const key = typed ?? keyAt(e.code);
	if (!key) return null;
	return { ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey, meta: e.metaKey, key };
}
