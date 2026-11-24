// the canvas's key table and the source editor's CodeMirror keymap bind the same chords for every intent both have (10.3)
import { describe, expect, it } from 'vitest';
import * as commands from '@codemirror/commands';
import { defaultKeymap } from '@codemirror/commands';
import { PLATFORM_KEYS, type KeyChord, type KeyIntent, type Platform } from '$lib/editor/keys/platformKeys';

const PLATFORMS: readonly Platform[] = ['windows', 'linux', 'mac'];

/** the intent each CodeMirror command carries out, in the table's words */
const INTENT_OF_COMMAND: Record<string, string> = {
	cursorCharLeft: 'move character -1',
	cursorCharRight: 'move character 1',
	cursorGroupLeft: 'move word -1',
	cursorGroupRight: 'move word 1',
	cursorLineBoundaryLeft: 'move lineBoundary -1',
	cursorLineBoundaryRight: 'move lineBoundary 1',
	cursorLineBoundaryBackward: 'move lineBoundary -1',
	cursorLineBoundaryForward: 'move lineBoundary 1',
	cursorLineStart: 'move lineBoundary -1',
	cursorLineEnd: 'move lineBoundary 1',
	cursorLineUp: 'move line -1',
	cursorLineDown: 'move line 1',
	cursorDocStart: 'move document -1',
	cursorDocEnd: 'move document 1',
	cursorPageUp: 'move page -1',
	cursorPageDown: 'move page 1',
	deleteCharBackward: 'delete character -1',
	deleteCharForward: 'delete character 1',
	deleteGroupBackward: 'delete word -1',
	deleteGroupForward: 'delete word 1',
	deleteLineBoundaryBackward: 'delete lineBoundary -1',
	deleteLineBoundaryForward: 'delete lineBoundary 1',
	transposeChars: 'transpose',
	splitLine: 'openLine',
	deleteToLineEnd: 'kill'
};

const commandName = new Map<unknown, string>(Object.entries(commands).map(([name, fn]) => [fn, name]));

function intentName(intent: KeyIntent): string | null {
	if (intent.kind === 'move' || intent.kind === 'delete') return `${intent.kind} ${intent.by} ${intent.dir}`;
	return intent.kind === 'transpose' || intent.kind === 'openLine' || intent.kind === 'kill' ? intent.kind : null;
}

/** one spelling for a chord: Ctrl, Alt, Shift, Meta in that order, a letter in lower case, Mod resolved for the platform */
function spell(parts: { key: string; ctrl?: boolean; alt?: boolean; shift?: boolean; meta?: boolean }): string {
	const mods = [parts.ctrl && 'Ctrl', parts.alt && 'Alt', parts.shift && 'Shift', parts.meta && 'Meta'].filter(Boolean);
	return [...mods, parts.key.length === 1 ? parts.key.toLowerCase() : parts.key].join('-');
}

function spellChord(chord: KeyChord, platform: Platform): string {
	const mac = platform === 'mac';
	return spell({
		key: chord.key,
		ctrl: chord.ctrl || (chord.mod && !mac),
		alt: chord.alt,
		shift: chord.shift,
		meta: chord.meta || (chord.mod && mac)
	});
}

function spellCodeMirror(name: string, platform: Platform): string {
	const parts = name.split('-');
	const key = parts.pop()!;
	const mods = new Set(parts);
	const mac = platform === 'mac';
	return spell({
		key,
		ctrl: mods.has('Ctrl') || (mods.has('Mod') && !mac),
		alt: mods.has('Alt'),
		shift: mods.has('Shift'),
		meta: mods.has('Cmd') || mods.has('Meta') || (mods.has('Mod') && mac)
	});
}

function codeMirrorChords(platform: Platform): Map<string, Set<string>> {
	const byIntent = new Map<string, Set<string>>();
	for (const binding of defaultKeymap) {
		const name = INTENT_OF_COMMAND[commandName.get(binding.run) ?? ''];
		const chord = (platform === 'mac' ? binding.mac : platform === 'windows' ? binding.win : binding.linux) ?? binding.key;
		if (!name || !chord) continue;
		(byIntent.get(name) ?? byIntent.set(name, new Set()).get(name)!).add(spellCodeMirror(chord, platform));
	}
	return byIntent;
}

function canvasChords(platform: Platform): Map<string, Set<string>> {
	const byIntent = new Map<string, Set<string>>();
	for (const [chord, intent] of PLATFORM_KEYS[platform]) {
		const name = intentName(intent);
		if (name) (byIntent.get(name) ?? byIntent.set(name, new Set()).get(name)!).add(spellChord(chord, platform));
	}
	return byIntent;
}

/** the chords the source editor binds beyond the canvas's, each with its reason */
const SOURCE_ONLY: Record<Platform, Record<string, readonly string[]>> = {
	windows: {},
	linux: {},
	// the canvas leaves macOS's page, Home and End keys, with or without Cmd, to scroll the pane; CodeMirror's Ctrl-Alt-h is a macOS emacs alias
	mac: {
		'move document -1': ['Meta-Home'],
		'move document 1': ['Meta-End'],
		'move lineBoundary -1': ['Home'],
		'move lineBoundary 1': ['End'],
		'move page -1': ['PageUp', 'Ctrl-ArrowUp'],
		'move page 1': ['PageDown', 'Ctrl-ArrowDown', 'Ctrl-v'],
		'delete word -1': ['Ctrl-Alt-h']
	}
};

/** the chords the canvas binds beyond the source editor's */
const CANVAS_ONLY: Record<Platform, Record<string, readonly string[]>> = {
	windows: {},
	linux: {},
	// CodeMirror leaves macOS's Ctrl-Backspace to the browser, which deletes a character
	mac: { 'delete character -1': ['Ctrl-Backspace'] }
};

describe('the canvas key table and the source editor keymap', () => {
	for (const platform of PLATFORMS) {
		it(`bind the same chords for every intent both have on ${platform}`, () => {
			const canvas = canvasChords(platform);
			const source = codeMirrorChords(platform);
			const shared = [...canvas.keys()].filter((name) => source.has(name));
			expect(shared.length).toBeGreaterThan(10);
			for (const name of shared) {
				const sourceOnly = new Set(SOURCE_ONLY[platform][name] ?? []);
				const canvasOnly = new Set(CANVAS_ONLY[platform][name] ?? []);
				const ours = new Set([...canvas.get(name)!].filter((chord) => !canvasOnly.has(chord)));
				const theirs = new Set([...source.get(name)!].filter((chord) => !sourceOnly.has(chord)));
				expect([...ours].sort(), `${platform}: ${name}`).toEqual([...theirs].sort());
			}
		});
	}

	it('lists no source-only chord the source editor lacks', () => {
		for (const platform of PLATFORMS) {
			const source = codeMirrorChords(platform);
			for (const [name, chords] of Object.entries(SOURCE_ONLY[platform]))
				for (const chord of chords) expect(source.get(name)?.has(chord), `${platform}: ${name} ${chord}`).toBe(true);
		}
	});
});
