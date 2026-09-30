// Regenerates src/lib/languages/latex/symbols/latexSymbolTable.ts, latexSymbolGroups.ts and the
// picture of every symbol beside them from Detexify (https://github.com/kirel/detexify, MIT, Daniel Kirsch).
//
// The symbols are Detexify's. Its lib/latex/symbols.yaml lists each command with the package and
// font encoding it needs and the modes it works in, under headings taken from the Comprehensive
// LaTeX Symbol List; the heading decides the tab a symbol is browsed under. Detexify also ships each
// symbol as LaTeX drew it, packed into one picture: its stylesheet names every symbol's place in
// that picture by the MD5 of package, encoding and command. Two gaps are filled from Unicode's
// mathematical letters: amsfonts' \mathbb, which Detexify does not list, and the small letters of
// \mathfrak, which it has no picture of. Any other symbol with no picture is left out.
//
// Run it against a checkout of Detexify when it changes; the output is committed.
//
//   node scripts/gen-latex-symbols.mjs path/to/detexify
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as prettier from 'prettier';

const OUT_DIR = path.join(import.meta.dirname, '../src/lib/languages/latex/symbols');

// the Comprehensive LaTeX Symbol List's tables, as Detexify heads them, folded into the picker's tabs
const GROUP_OF_TABLE = {
	letters: [5, 122, 123, 125, 129, 130, 196],
	operators: [40, 41, 43, 52, 53, 58],
	relations: [62, 63, 64, 65, 78, 79, 85, 86, 91],
	arrows: [95, 96, 97, 98, 99, 100, 101],
	delimiters: [138, 141, 144, 150],
	punctuation: [2, 3, 4, 8, 38, 174, 175],
	phonetic: [10],
	other: [184, 185, 191, 197],
	signs: [29, 30, 31, 33, 36, 37, 202, 210, 212, 254, 263]
};
// "Arrows not in latex2e" has no table number
const GROUP_OF_HEADING = { 'Arrows not in latex2e': 'arrows' };
// Detexify's own additions after the dashes of table 3: not commands, and not what they look like
const NOT_COMMANDS = new Set(['\\--', '\\---', '\\----']);

const detexify = process.argv[2];
if (!detexify || !fs.existsSync(path.join(detexify, 'lib/latex/symbols.yaml'))) {
	console.error('usage: node scripts/gen-latex-symbols.mjs path/to/detexify');
	process.exit(1);
}

/** Detexify's own id for a symbol, which its stylesheet names the picture by */
function detexifyId(pkg, fontenc, command) {
	return `${pkg ?? 'latex2e'}-${fontenc ?? 'OT1'}-${command.replaceAll('\\', '_')}`;
}

// Unicode's mathematical letters, for the alphabets Detexify has no picture of: amsfonts'
// \mathbb, which it does not list at all, and the small letters of \mathfrak. A few letters were
// in Unicode before the rest and keep their older places
const ALPHABETS = {
	mathbb: { upper: 0x1d538, lower: null, older: { C: 0x2102, H: 0x210d, N: 0x2115, P: 0x2119, Q: 0x211a, R: 0x211d, Z: 0x2124 } },
	mathfrak: { upper: 0x1d504, lower: 0x1d51e, older: { C: 0x212d, H: 0x210c, I: 0x2111, R: 0x211c, Z: 0x2128 } }
};

/** `\mathbb{R}` -> ℝ, or null for anything but a letter of one of those alphabets */
function unicodeLetter(command) {
	const m = /^\\(mathbb|mathfrak)\{([A-Za-z])\}$/.exec(command);
	const alphabet = m && ALPHABETS[m[1]];
	if (!alphabet) return null;
	const letter = m[2];
	const upper = letter >= 'A' && letter <= 'Z';
	const base = upper ? alphabet.upper : alphabet.lower;
	if (base === null) return null;
	const code = (upper && alphabet.older[letter]) || base + letter.charCodeAt(0) - (upper ? 65 : 97);
	return String.fromCodePoint(code);
}

function groupOf(heading) {
	if (GROUP_OF_HEADING[heading]) return GROUP_OF_HEADING[heading];
	const table = Number(/^Table\s*(\d+)/.exec(heading)?.[1]);
	for (const [group, tables] of Object.entries(GROUP_OF_TABLE)) if (tables.includes(table)) return group;
	throw new Error(`no tab for Detexify's heading "${heading}"`);
}

/** a YAML scalar as Detexify writes them: bare, or in single or double quotes, maybe with a # comment after */
function scalar(raw) {
	const s = raw.trim();
	const quoted = /^(['"])(.*)\1(\s+#.*)?$/.exec(s);
	if (quoted) return quoted[1] === "'" ? quoted[2].replace(/''/g, "'") : quoted[2];
	return s.replace(/\s+#.*$/, '').trim();
}

/**
 * true when a table heading is one of `pkg`'s: it names the package, or AMS for amssymb and amsmath.
 * A list that runs on past a heading naming no package has reached one of the kernel's tables
 * (Detexify's "Inequalities" carries on from amssymb's subset relations, `\leq` and all)
 */
function headingNames(heading, pkg) {
	if (!pkg) return true;
	return heading.includes(pkg) || (pkg.startsWith('ams') && /\bAMS\b/.test(heading));
}

/**
 * symbols.yaml is a list whose items are a command, or a map of `package` / `fontenc` and lists
 * under `textmode` / `mathmode` / `bothmodes`. Read by hand for that one shape, with the heading
 * each item sits under; a commented-out block is skipped with its comment marks.
 */
function readSymbolsYaml(text) {
	const items = [];
	let heading = null;
	let item = null;
	let list = null;
	for (const line of text.split('\n')) {
		if (!line.trim()) continue;
		const comment = /^#\s?(.*)$/.exec(line);
		if (comment) {
			const title = comment[1].trim();
			if (/^Table\s*\d+/.test(title) || GROUP_OF_HEADING[title]) heading = title;
			continue;
		}
		if (/^\s+#/.test(line)) continue;
		const top = /^- (.*)$/.exec(line);
		const key = /^(\s*)(\w+):\s*(.*)$/.exec(top ? top[1] : line);
		if (top && !key) {
			items.push({ heading, commands: [scalar(top[1])], mode: 'textmode' });
			item = null;
			continue;
		}
		if (top) {
			item = { heading };
			items.push(item);
		}
		if (key && item) {
			const [, , name, value] = key;
			if (value.trim()) item[name] = scalar(value);
			else list = item[name] = [];
			continue;
		}
		const entry = /^\s+- (.*)$/.exec(line);
		if (entry && list) {
			list.push({ command: scalar(entry[1]), heading });
			continue;
		}
		throw new Error(`cannot read symbols.yaml line: ${line}`);
	}
	const symbols = [];
	for (const it of items) {
		if (it.commands) {
			symbols.push({ command: it.commands[0], mode: 'text', heading: it.heading });
			continue;
		}
		for (const [key, mode] of [
			['textmode', 'text'],
			['mathmode', 'math'],
			['bothmodes', 'both']
		])
			for (const { command, heading } of it[key] ?? []) {
				const own = heading === it.heading || headingNames(heading, it.package);
				// the picture stays under the package Detexify filed it by
				symbols.push({ command, package: own ? it.package : undefined, fontenc: it.fontenc, mode, heading, drawnAs: it.package });
			}
	}
	return symbols;
}

/** each symbol's rectangle in the picture, by its class name: symbol<md5> { width; height; background: url() x y } */
function readSpriteRects(css) {
	const rects = new Map();
	for (const m of css.matchAll(
		/img\.(symbol[0-9a-f]{32})\{width:(\d+)px;height:(\d+)px;background:url\([^)]*\) (-?\d+)(?:px)? (-?\d+)(?:px)?/g
	))
		rects.set(m[1], { w: Number(m[2]), h: Number(m[3]), x: -Number(m[4]), y: -Number(m[5]) });
	return rects;
}

const yaml = fs.readFileSync(path.join(detexify, 'lib/latex/symbols.yaml'), 'utf8');
const cssFile = fs.readdirSync(path.join(detexify, 'public/stylesheets')).find((f) => /^symbols-.*\.css$/.test(f));
const css = fs.readFileSync(path.join(detexify, 'public/stylesheets', cssFile), 'utf8');
const spriteFile = /url\("?\.\.\/images\/([^")]+)"?\)/.exec(css)[1];
const rects = readSpriteRects(css);
const sprite = fs.readFileSync(path.join(detexify, 'public/images', spriteFile));
// a PNG's width and height are the first two numbers of its IHDR chunk
const sheet = {
	width: sprite.readUInt32BE(16),
	height: sprite.readUInt32BE(20),
	boxHeight: Math.max(...[...rects.values()].map((r) => r.h))
};
const commit = execFileSync('git', ['-C', detexify, 'rev-parse', '--short', 'HEAD']).toString().trim();

const rows = [];
const missing = [];
const seen = new Set();
for (const s of readSymbolsYaml(yaml)) {
	if (NOT_COMMANDS.has(s.command)) continue;
	const id = detexifyId(s.drawnAs ?? s.package, s.fontenc, s.command);
	if (seen.has(id)) continue;
	seen.add(id);
	const rect = rects.get('symbol' + createHash('md5').update(id).digest('hex'));
	const picture = rect ? [rect.x, rect.y, rect.w, rect.h] : unicodeLetter(s.command);
	if (!picture) {
		missing.push(id);
		continue;
	}
	rows.push([s.command, s.package ?? '', s.fontenc ?? '', s.mode, groupOf(s.heading), picture]);
}
for (const letter of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ') {
	const command = `\\mathbb{${letter}}`;
	rows.push([command, 'amsfonts', '', 'math', 'letters', unicodeLetter(command)]);
}

const header = `// GENERATED by scripts/gen-latex-symbols.mjs - do not edit by hand.
//
// Source: Detexify ${commit} (https://github.com/kirel/detexify), MIT, see DETEXIFY-LICENSE.txt
// beside this file
`;

// the tabs and the picture's size, apart from the table, so the picker can name its tabs and draw
// its tiles without loading every symbol
const groups = `${header}
export type LatexSymbolGroup = ${Object.keys(GROUP_OF_TABLE)
	.map((g) => `'${g}'`)
	.join(' | ')};

export const LATEX_SYMBOL_GROUPS: readonly LatexSymbolGroup[] = ${JSON.stringify(Object.keys(GROUP_OF_TABLE))};

/** the size of latexSymbols.png, which every row's rectangle is measured in, and the height Detexify fits each drawing to */
export const LATEX_SYMBOL_SHEET = ${JSON.stringify(sheet)};
`;

const table = `${header}//
// Every symbol Detexify knows, with the package and font encoding it needs, the modes it works in,
// the tab it is browsed under, and where LaTeX's own drawing of it sits in latexSymbols.png.

import type { LatexSymbolGroup } from './latexSymbolGroups';

/**
 * command, package ('' for none), font encoding ('' for the default), modes, tab, and where it is in
 * the picture as x, y, width, height, or the Unicode letter it is drawn as where Detexify has no picture
 */
export type LatexSymbolRow = readonly [
	string,
	string,
	string,
	'text' | 'math' | 'both',
	LatexSymbolGroup,
	readonly [number, number, number, number] | string
];

export const LATEX_SYMBOL_ROWS: readonly LatexSymbolRow[] = ${JSON.stringify(rows)};
`;

async function writeFormatted(file, text) {
	const config = await prettier.resolveConfig(file);
	fs.writeFileSync(file, await prettier.format(text, { ...config, filepath: file }));
}

fs.mkdirSync(OUT_DIR, { recursive: true });
await writeFormatted(path.join(OUT_DIR, 'latexSymbolGroups.ts'), groups);
await writeFormatted(path.join(OUT_DIR, 'latexSymbolTable.ts'), table);
fs.writeFileSync(path.join(OUT_DIR, 'latexSymbols.png'), sprite);
fs.copyFileSync(path.join(detexify, 'MIT-LICENSE'), path.join(OUT_DIR, 'DETEXIFY-LICENSE.txt'));
console.log(`${rows.length} symbols; ${missing.length} with no picture left out${missing.length ? `: ${missing.join(', ')}` : ''}`);
