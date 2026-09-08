// The native macOS menu is built in main from labels the renderer ships across a bridge, and
// nothing on either side of that bridge is typed against the other. Three ways a string ends up
// untranslated, all of them silent, all of them mechanical to catch:
//
//   1. main asks for a label key the renderer never sends       -> falls back to the English default
//   2. an Electron role is used without a label of our own      -> Electron's own hardcoded English
//   3. a key exists in en.json but not in the other locales     -> paraglide falls back to English
//
// The Help menu had (1) and (2) at once: menubar_menu_help was already translated and used by the
// in-app bar, but never crossed the bridge, and role: 'help' carried Electron's label anyway.
//
// Read as text rather than imported: windowChrome.ts is main-process code in another package and
// pulling it into the renderer's test env would drag in electron itself. The regexes only have to
// understand the shape this one file is written in.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = resolve(here, '../../../..'); // apps/texpile-editor
const repo = resolve(pkg, '../..');

const chrome = readFileSync(resolve(repo, 'electron/src/windowChrome.ts'), 'utf8');
const native = readFileSync(resolve(pkg, 'src/lib/workspace/nativeMenu.ts'), 'utf8');

/** the keys main looks up: label(s, 'key', 'English fallback') */
function keysRequested(): string[] {
	return [...chrome.matchAll(/\blabel\(s,\s*'([A-Za-z]+)'/g)].map((m) => m[1]);
}

/** the keys the renderer sends: the `key: m.something()` lines inside labels() */
function keysSupplied(): string[] {
	// 'function labels(' unclosed: it takes the open file's formatter, so the signature has a param
	const body = native.slice(native.indexOf('function labels('), native.indexOf('export function publishMenuState'));
	return [...body.matchAll(/^\t\t([A-Za-z]+):\s*m\./gm)].map((m) => m[1]);
}

function messages(locale: string): Record<string, string> {
	return JSON.parse(readFileSync(resolve(pkg, `messages/${locale}.json`), 'utf8'));
}

describe('native menu labels', () => {
	it('sends every label main asks for', () => {
		// a regex that stopped matching would pass every assertion below on empty sets
		expect(keysRequested().length).toBeGreaterThan(50);
		const supplied = new Set(keysSupplied());
		expect([...new Set(keysRequested())].filter((k) => !supplied.has(k))).toEqual([]);
	});

	it('sends no label main never asks for', () => {
		const requested = new Set(keysRequested());
		expect(keysSupplied().filter((k) => !requested.has(k))).toEqual([]);
	});

	// An Electron role brings a label of its own, hardcoded English inside Electron, and macOS is
	// never consulted - setWindowsMenu / setHelpMenu register a menu, they do not retitle it. So a
	// role that shows a string has to be given one of ours, including the nested roles inside a
	// generated submenu (Minimize, Zoom, Bring All to Front under Window).
	it('gives every role a label of ours', () => {
		// template() only. The fallback bar below it is deliberately stock roles: it is what shows
		// before any renderer has reported in, so there is no locale to render it in yet.
		const at = chrome.indexOf('function template(');
		const body = chrome.slice(at, chrome.indexOf('function rebuild('));
		const offset = chrome.slice(0, at).split('\n').length; // so a failure names the real line
		const lines = body.split('\n').map((l) => (l.trimStart().startsWith('//') ? '' : l));
		const naked = lines
			.map((line, i) => ({ line, i }))
			.filter(({ line }) => /\brole:\s*'/.test(line))
			// prettier keeps the label with its role, on the same line or the one below it
			.filter(({ i }) => !/\blabel:/.test(lines[i] + lines[i + 1]))
			.map(({ line, i }) => `${offset + i}: ${line.trim()}`);
		expect(naked).toEqual([]);
	});
});

describe('locale coverage', () => {
	const en = messages('en');
	const keys = Object.keys(en).filter((k) => !k.startsWith('$'));

	// only the locales kept current in-house; a contributed locale may lag behind en.json and shows
	// English for whatever is missing
	for (const locale of ['zh-Hans', 'zh-Hant', 'de']) {
		it(`${locale} translates every message`, () => {
			const other = messages(locale);
			expect(keys.filter((k) => !other[k])).toEqual([]);
		});
	}
});
