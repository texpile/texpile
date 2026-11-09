import { describe, expect, it } from 'vitest';
import { keysText, parseKeys } from '$lib/keybindings/keys/keyChord';
import { chordOfEvent } from '$lib/keybindings/keys/keyEvent';
import { electronAccelerator, keysLabel } from '$lib/keybindings/keys/keyLabels';

const press = (key: string, code: string, mods: Partial<Record<'ctrlKey' | 'shiftKey' | 'altKey' | 'metaKey', boolean>> = {}) => ({
	key,
	code,
	ctrlKey: false,
	shiftKey: false,
	altKey: false,
	metaKey: false,
	isComposing: false,
	...mods
});

describe('key notation', () => {
	it('reads mod as Cmd on macOS and Ctrl elsewhere, and writes it back as mod', () => {
		const mac = parseKeys('mod+shift+k', true)!;
		const pc = parseKeys('mod+shift+k', false)!;
		expect(mac[0]).toMatchObject({ meta: true, ctrl: false, shift: true, key: 'k' });
		expect(pc[0]).toMatchObject({ meta: false, ctrl: true, shift: true, key: 'k' });
		expect(keysText(mac, true)).toBe('mod+shift+k');
		expect(keysText(parseKeys('cmd+k', true)!, true)).toBe('mod+k');
		expect(keysText(parseKeys('ctrl+tab', true)!, true)).toBe('ctrl+tab');
		expect(keysText(parseKeys('ctrl+k ctrl+s', false)!, false)).toBe('mod+k mod+s');
	});

	it('rejects what is not a key', () => {
		expect(parseKeys('ctrl+', false)).toBeNull();
		expect(parseKeys('hyper+k', false)).toBeNull();
		expect(parseKeys('ctrl+shift+banana', false)).toBeNull();
		expect(parseKeys('', false)).toBeNull();
	});

	it('labels and accelerators follow the platform', () => {
		expect(keysLabel(parseKeys('mod+alt+shift+enter', true)!, true)).toBe('⌥⇧⌘↩');
		expect(keysLabel(parseKeys('mod+shift+,', false)!, false)).toBe('Ctrl+Shift+,');
		expect(electronAccelerator(parseKeys('mod+alt+enter', true)!, true)).toBe('Alt+Cmd+Return');
		expect(electronAccelerator(parseKeys('mod+k mod+s', true)!, true)).toBeNull();
	});
});

describe('a key press', () => {
	it('reads the character typed, and the key under it where the character names no key', () => {
		expect(chordOfEvent(press('z', 'KeyW', { ctrlKey: true }), false)).toMatchObject({ key: 'z', ctrl: true });
		// AZERTY: the 1 key types & without Shift
		expect(chordOfEvent(press('&', 'Digit1', { ctrlKey: true }), false)?.key).toBe('1');
		expect(chordOfEvent(press('<', 'Comma', { ctrlKey: true, shiftKey: true }), false)?.key).toBe(',');
		expect(chordOfEvent(press('я', 'KeyZ', { ctrlKey: true }), false)?.key).toBe('z');
		// Option+Z types Ω on macOS
		expect(chordOfEvent(press('Ω', 'KeyZ', { altKey: true }), true)).toMatchObject({ key: 'z', alt: true });
		expect(chordOfEvent(press('ArrowUp', 'ArrowUp', { altKey: true }), true)?.key).toBe('up');
	});

	it('reads a + key of its own as the = key, and a shifted punctuation key by its place', () => {
		// German: + sits where US ] is; Ctrl+Shift+, types ; and Ctrl+Shift+0 types =
		expect(chordOfEvent(press('+', 'BracketRight', { ctrlKey: true }), false)).toMatchObject({ key: '=', ctrl: true });
		expect(chordOfEvent(press('+', 'NumpadAdd', { ctrlKey: true }), false)?.key).toBe('=');
		expect(chordOfEvent(press('+', 'NumpadAdd', { ctrlKey: true, shiftKey: true }), false)?.key).toBe('=');
		expect(chordOfEvent(press(';', 'Comma', { ctrlKey: true, shiftKey: true }), false)).toMatchObject({ key: ',', shift: true });
		expect(chordOfEvent(press('=', 'Digit0', { ctrlKey: true, shiftKey: true }), false)?.key).toBe('0');
		// US
		expect(chordOfEvent(press('+', 'Equal', { ctrlKey: true, shiftKey: true }), false)).toMatchObject({ key: '=', shift: true });
		expect(chordOfEvent(press('Z', 'KeyZ', { ctrlKey: true, shiftKey: true }), false)?.key).toBe('z');
		expect(chordOfEvent(press('Tab', 'Tab', { ctrlKey: true, shiftKey: true }), false)?.key).toBe('tab');
		expect(electronAccelerator(parseKeys('mod+=', true)!, true)).toBe('Cmd+Plus');
	});

	it('is no shortcut for a modifier alone, IME composition or AltGr typing', () => {
		expect(chordOfEvent(press('Control', 'ControlLeft', { ctrlKey: true }), false)).toBeNull();
		expect(chordOfEvent({ ...press('a', 'KeyA'), isComposing: true }, false)).toBeNull();
		const altGr = { ...press('@', 'KeyQ', { ctrlKey: true, altKey: true }), getModifierState: (k: string) => k === 'AltGraph' };
		expect(chordOfEvent(altGr, false)).toBeNull();
	});
});
