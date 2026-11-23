// what Chromium did with an editing key after prosemirror-view declined it, per OS, as data (10.3); shared with the source editor
import { isMac, isWindows } from '$lib/platform';

export type Platform = 'mac' | 'windows' | 'linux';
/** line: Up and Down; lineBoundary: Home and End */
export type Granularity = 'character' | 'word' | 'line' | 'lineBoundary' | 'paragraph' | 'page' | 'document';
export type WordRule = 'previousStart' | 'nextStart' | 'nextEnd';
export type KeyIntent =
	| { kind: 'move'; dir: -1 | 1; by: Granularity; extend: boolean; rule?: WordRule }
	| { kind: 'delete'; dir: -1 | 1; by: Granularity | 'paragraphEnd' }
	| { kind: 'scroll'; to: 'start' | 'end' | 'pageUp' | 'pageDown' }
	| { kind: 'transpose' }
	| { kind: 'kill' }
	| { kind: 'yank' }
	| { kind: 'openLine' }
	| { kind: 'clipboard'; action: 'cut' | 'copy' | 'paste' };
/** mod is Cmd on macOS and Ctrl elsewhere; a modifier left out must be up, except Shift on a move, which extends it */
export type KeyChord = { key: string; mod?: boolean; ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean };
export type PlatformKeyRow = readonly [KeyChord, KeyIntent];

export type PlatformRules = {
	/** Up on the document's first line and Down on its last go to the line's start and end */
	edgeLineGoesToEnd: boolean;
	contextClickSelectsWord: boolean;
	pageKeysMoveCaret: boolean;
	caretBlinkHalfPeriodMs: number;
	wordRightStopsAt: 'nextStart' | 'nextEnd';
	/** a double click takes the spaces after the word too */
	doubleClickTakesTrailingSpace: boolean;
};

function move(by: Granularity, dir: -1 | 1, rule?: WordRule): KeyIntent {
	return rule ? { kind: 'move', dir, by, extend: false, rule } : { kind: 'move', dir, by, extend: false };
}

function remove(by: Granularity | 'paragraphEnd', dir: -1 | 1): KeyIntent {
	return { kind: 'delete', dir, by };
}

/** Windows and Linux differ only in where a word move to the right stops */
function pcRows(wordRight: WordRule): readonly PlatformKeyRow[] {
	return [
		[
			{ key: 'Delete', shift: true },
			{ kind: 'clipboard', action: 'cut' }
		],
		[
			{ key: 'Insert', ctrl: true },
			{ kind: 'clipboard', action: 'copy' }
		],
		[
			{ key: 'Insert', shift: true },
			{ kind: 'clipboard', action: 'paste' }
		],
		[{ key: 'ArrowLeft' }, move('character', -1)],
		[{ key: 'ArrowRight' }, move('character', 1)],
		[{ key: 'ArrowLeft', ctrl: true }, move('word', -1, 'previousStart')],
		[{ key: 'ArrowRight', ctrl: true }, move('word', 1, wordRight)],
		[{ key: 'ArrowUp' }, move('line', -1)],
		[{ key: 'ArrowDown' }, move('line', 1)],
		[{ key: 'Home' }, move('lineBoundary', -1)],
		[{ key: 'End' }, move('lineBoundary', 1)],
		[{ key: 'ArrowUp', ctrl: true }, move('paragraph', -1)],
		[{ key: 'ArrowDown', ctrl: true }, move('paragraph', 1)],
		[{ key: 'PageUp' }, move('page', -1)],
		[{ key: 'PageDown' }, move('page', 1)],
		[{ key: 'Home', ctrl: true }, move('document', -1)],
		[{ key: 'End', ctrl: true }, move('document', 1)],
		[{ key: 'Backspace' }, remove('character', -1)],
		[{ key: 'Delete' }, remove('character', 1)],
		[{ key: 'Backspace', ctrl: true }, remove('word', -1)],
		[{ key: 'Delete', ctrl: true }, remove('word', 1)]
	];
}

const MAC_ROWS: readonly PlatformKeyRow[] = [
	[{ key: 'ArrowLeft' }, move('character', -1)],
	[{ key: 'ArrowRight' }, move('character', 1)],
	[{ key: 'b', ctrl: true }, move('character', -1)],
	[{ key: 'f', ctrl: true }, move('character', 1)],
	[{ key: 'ArrowLeft', alt: true }, move('word', -1, 'previousStart')],
	[{ key: 'ArrowRight', alt: true }, move('word', 1, 'nextEnd')],
	[{ key: 'ArrowLeft', meta: true }, move('lineBoundary', -1)],
	[{ key: 'ArrowRight', meta: true }, move('lineBoundary', 1)],
	[{ key: 'a', ctrl: true }, move('lineBoundary', -1)],
	[{ key: 'e', ctrl: true }, move('lineBoundary', 1)],
	[{ key: 'ArrowUp' }, move('line', -1)],
	[{ key: 'ArrowDown' }, move('line', 1)],
	[{ key: 'p', ctrl: true }, move('line', -1)],
	[{ key: 'n', ctrl: true }, move('line', 1)],
	[{ key: 'ArrowUp', alt: true }, move('paragraph', -1)],
	[{ key: 'ArrowDown', alt: true }, move('paragraph', 1)],
	[{ key: 'PageUp' }, { kind: 'scroll', to: 'pageUp' }],
	[{ key: 'PageDown' }, { kind: 'scroll', to: 'pageDown' }],
	[{ key: 'ArrowUp', meta: true }, move('document', -1)],
	[{ key: 'ArrowDown', meta: true }, move('document', 1)],
	[{ key: 'Home' }, { kind: 'scroll', to: 'start' }],
	[{ key: 'End' }, { kind: 'scroll', to: 'end' }],
	[{ key: 'Backspace' }, remove('character', -1)],
	[{ key: 'h', ctrl: true }, remove('character', -1)],
	[{ key: 'Delete' }, remove('character', 1)],
	[{ key: 'd', ctrl: true }, remove('character', 1)],
	[{ key: 'Backspace', alt: true }, remove('word', -1)],
	[{ key: 'Delete', alt: true }, remove('word', 1)],
	[{ key: 'Backspace', meta: true }, remove('lineBoundary', -1)],
	[{ key: 'Delete', meta: true }, remove('lineBoundary', 1)],
	[{ key: 'k', ctrl: true }, { kind: 'kill' }],
	[{ key: 'y', ctrl: true }, { kind: 'yank' }],
	[{ key: 't', ctrl: true }, { kind: 'transpose' }],
	[{ key: 'o', ctrl: true }, { kind: 'openLine' }]
];

export const PLATFORM_KEYS: Readonly<Record<Platform, readonly PlatformKeyRow[]>> = {
	linux: pcRows('nextEnd'),
	windows: pcRows('nextStart'),
	mac: MAC_ROWS
};

// linux as P0 recorded it (tests/fixtures/parity/keys/platforms.json); windows edge lines, word right and double click
// read off a contenteditable on Windows 11; the rest and mac are Chromium's defaults until recorded
export const PLATFORM_RULES: Readonly<Record<Platform, PlatformRules>> = {
	linux: {
		edgeLineGoesToEnd: true,
		contextClickSelectsWord: false,
		pageKeysMoveCaret: true,
		caretBlinkHalfPeriodMs: 500,
		wordRightStopsAt: 'nextEnd',
		doubleClickTakesTrailingSpace: false
	},
	windows: {
		edgeLineGoesToEnd: true,
		contextClickSelectsWord: false,
		pageKeysMoveCaret: true,
		caretBlinkHalfPeriodMs: 530,
		wordRightStopsAt: 'nextStart',
		doubleClickTakesTrailingSpace: true
	},
	mac: {
		edgeLineGoesToEnd: true,
		contextClickSelectsWord: true,
		pageKeysMoveCaret: false,
		caretBlinkHalfPeriodMs: 500,
		wordRightStopsAt: 'nextEnd',
		doubleClickTakesTrailingSpace: false
	}
};

export const currentPlatform: Platform = isMac ? 'mac' : isWindows ? 'windows' : 'linux';

type ModifierState = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>;

function chordMatches(chord: KeyChord, event: ModifierState, platform: Platform, isMove: boolean): boolean {
	const key = chord.key.length === 1 ? event.key.toLowerCase() === chord.key : event.key === chord.key;
	if (!key) return false;
	const ctrl = !!chord.ctrl || (!!chord.mod && platform !== 'mac');
	const meta = !!chord.meta || (!!chord.mod && platform === 'mac');
	if (event.ctrlKey !== ctrl || event.metaKey !== meta || event.altKey !== !!chord.alt) return false;
	return chord.shift === undefined ? isMove || !event.shiftKey || chord.key === 'Backspace' : event.shiftKey === chord.shift;
}

export function intentFor(event: ModifierState, platform: Platform = currentPlatform): KeyIntent | null {
	for (const [chord, intent] of PLATFORM_KEYS[platform]) {
		if (!chordMatches(chord, event, platform, intent.kind === 'move')) continue;
		return intent.kind === 'move' ? { ...intent, extend: event.shiftKey } : intent;
	}
	return null;
}

const INPUT_TYPES: Readonly<Record<string, KeyIntent>> = {
	deleteContentBackward: remove('character', -1),
	deleteContentForward: remove('character', 1),
	deleteWordBackward: remove('word', -1),
	deleteWordForward: remove('word', 1),
	deleteSoftLineBackward: remove('lineBoundary', -1),
	deleteSoftLineForward: remove('lineBoundary', 1),
	deleteHardLineBackward: remove('paragraph', -1),
	deleteHardLineForward: remove('paragraphEnd', 1),
	insertTranspose: { kind: 'transpose' }
};

/** OS edits without a key: deleteWordBackward, deleteSoftLineBackward, insertTranspose, ... */
export function intentForInputType(inputType: string): KeyIntent | null {
	return INPUT_TYPES[inputType] ?? null;
}
