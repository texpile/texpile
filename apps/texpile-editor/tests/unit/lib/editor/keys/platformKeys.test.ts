import { describe, expect, it } from 'vitest';
import {
	PLATFORM_KEYS,
	PLATFORM_RULES,
	intentFor,
	intentForInputType,
	type KeyChord,
	type KeyIntent,
	type Platform
} from '$lib/editor/keys/platformKeys';

type Pressed = { key: string; ctrlKey?: boolean; altKey?: boolean; shiftKey?: boolean; metaKey?: boolean };
const press = (key: string, mods: Omit<Pressed, 'key'> = {}) => ({
	key,
	ctrlKey: false,
	altKey: false,
	shiftKey: false,
	metaKey: false,
	...mods
});

function moveOf(platform: Platform, event: ReturnType<typeof press>) {
	const intent = intentFor(event, platform);
	return intent?.kind === 'move'
		? `${intent.by} ${intent.dir}${intent.extend ? ' extend' : ''}${intent.rule ? ` ${intent.rule}` : ''}`
		: (intent?.kind ?? null);
}

describe('the platform key table', () => {
	it('moves by character, word, line and paragraph on Windows and Linux with Ctrl', () => {
		for (const platform of ['windows', 'linux'] as const) {
			expect(moveOf(platform, press('ArrowLeft'))).toBe('character -1');
			expect(moveOf(platform, press('ArrowLeft', { ctrlKey: true }))).toBe('word -1 previousStart');
			expect(moveOf(platform, press('Home'))).toBe('lineBoundary -1');
			expect(moveOf(platform, press('End', { ctrlKey: true }))).toBe('document 1');
			expect(moveOf(platform, press('ArrowDown', { ctrlKey: true }))).toBe('paragraph 1');
			expect(moveOf(platform, press('PageDown'))).toBe('page 1');
			expect(moveOf(platform, press('ArrowUp', { altKey: true }))).toBeNull();
		}
	});

	it('stops a word move to the right at the next start on Windows and at the word end on Linux and macOS', () => {
		expect(moveOf('windows', press('ArrowRight', { ctrlKey: true }))).toBe('word 1 nextStart');
		expect(moveOf('linux', press('ArrowRight', { ctrlKey: true }))).toBe('word 1 nextEnd');
		expect(moveOf('mac', press('ArrowRight', { altKey: true }))).toBe('word 1 nextEnd');
		for (const platform of ['windows', 'linux', 'mac'] as const) {
			const right = PLATFORM_KEYS[platform].find(([, intent]) => intent.kind === 'move' && intent.by === 'word' && intent.dir === 1)![1];
			expect(right.kind === 'move' && right.rule).toBe(PLATFORM_RULES[platform].wordRightStopsAt);
		}
	});

	it('moves by Alt and Cmd on macOS, with the emacs aliases, and leaves Ctrl+Arrow to the system', () => {
		expect(moveOf('mac', press('ArrowLeft', { altKey: true }))).toBe('word -1 previousStart');
		expect(moveOf('mac', press('ArrowLeft', { metaKey: true }))).toBe('lineBoundary -1');
		expect(moveOf('mac', press('ArrowUp', { metaKey: true }))).toBe('document -1');
		expect(moveOf('mac', press('ArrowUp', { altKey: true }))).toBe('paragraph -1');
		expect(moveOf('mac', press('b', { ctrlKey: true }))).toBe('character -1');
		expect(moveOf('mac', press('a', { ctrlKey: true }))).toBe('lineBoundary -1');
		expect(moveOf('mac', press('n', { ctrlKey: true }))).toBe('line 1');
		expect(moveOf('mac', press('ArrowLeft', { ctrlKey: true }))).toBeNull();
	});

	it('scrolls on macOS where Windows and Linux move the caret for the page keys, Home and End', () => {
		for (const key of ['PageUp', 'PageDown', 'Home', 'End']) {
			expect(PLATFORM_RULES.mac.pageKeysMoveCaret).toBe(false);
			expect(intentFor(press(key), 'mac')?.kind, key).toBe('scroll');
		}
		expect(PLATFORM_RULES.linux.pageKeysMoveCaret).toBe(true);
		expect(intentFor(press('PageUp'), 'linux')?.kind).toBe('move');
	});

	it('makes every move a range with Shift, and a delete only with its own chord', () => {
		expect(moveOf('linux', press('ArrowRight', { ctrlKey: true, shiftKey: true }))).toBe('word 1 extend nextEnd');
		expect(moveOf('mac', press('ArrowLeft', { metaKey: true, shiftKey: true }))).toBe('lineBoundary -1 extend');
		expect(intentFor(press('Backspace', { ctrlKey: true }), 'linux')).toEqual({ kind: 'delete', dir: -1, by: 'word' });
		expect(intentFor(press('Backspace', { altKey: true }), 'mac')).toEqual({ kind: 'delete', dir: -1, by: 'word' });
		expect(intentFor(press('Backspace', { metaKey: true }), 'mac')).toEqual({ kind: 'delete', dir: -1, by: 'lineBoundary' });
		expect(intentFor(press('Backspace', { shiftKey: true }), 'linux')).toEqual({ kind: 'delete', dir: -1, by: 'character' });
	});

	it('binds the emacs edits on macOS alone and the clipboard keys on Windows and Linux alone', () => {
		expect(intentFor(press('k', { ctrlKey: true }), 'mac')).toEqual({ kind: 'kill' });
		expect(intentFor(press('y', { ctrlKey: true }), 'mac')).toEqual({ kind: 'yank' });
		expect(intentFor(press('t', { ctrlKey: true }), 'mac')).toEqual({ kind: 'transpose' });
		expect(intentFor(press('o', { ctrlKey: true }), 'mac')).toEqual({ kind: 'openLine' });
		expect(intentFor(press('k', { ctrlKey: true }), 'linux')).toBeNull();
		expect(intentFor(press('Insert', { shiftKey: true }), 'windows')).toEqual({ kind: 'clipboard', action: 'paste' });
		expect(intentFor(press('Insert', { shiftKey: true }), 'mac')).toBeNull();
	});

	it('names the edits the system makes without a key', () => {
		expect(intentForInputType('deleteWordBackward')).toEqual({ kind: 'delete', dir: -1, by: 'word' });
		expect(intentForInputType('deleteSoftLineForward')).toEqual({ kind: 'delete', dir: 1, by: 'lineBoundary' });
		expect(intentForInputType('insertTranspose')).toEqual({ kind: 'transpose' });
		expect(intentForInputType('insertText')).toBeNull();
	});

	it('has no chord twice in a platform', () => {
		for (const platform of ['windows', 'linux', 'mac'] as const) {
			const names = PLATFORM_KEYS[platform].map(([chord]: readonly [KeyChord, KeyIntent]) =>
				[chord.key, chord.ctrl, chord.alt, chord.shift, chord.meta, chord.mod].join('|')
			);
			expect(new Set(names).size, platform).toBe(names.length);
		}
	});
});
