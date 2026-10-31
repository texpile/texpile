import type { LibraryElement } from '$lib/draw/editor/figure/figureLanguage';
import { appendStatement } from './newStatements';
import { readPicture, type CetzPicture } from './picture';
import { CETZ_IMPORT } from './pictures';
import { pastedLines } from '$lib/draw/editor/figure/pastedLines';

const NAME = /name:\s*"([^"]+)"/g;

function escaped(name: string) {
	return name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** the pasted text with each name the picture already gives renamed, n1, n2 ..., and what it is pointed at by with it */
export function renamePasted(picture: string, pasted: string) {
	const taken = new Set([...picture.matchAll(NAME)].map((m) => m[1]));
	let text = pasted;
	for (const name of new Set([...pasted.matchAll(NAME)].map((m) => m[1]))) {
		if (!taken.has(name)) continue;
		let k = 1;
		while (taken.has(`n${k}`) || text.includes(`"n${k}"`)) k++;
		taken.add(`n${k}`);
		text = text.replace(new RegExp(`"${escaped(name)}(?=[".])`, 'g'), `"n${k}`);
	}
	return text;
}

/** the cetz modules given imported beside `canvas` and `draw` */
export function withCetzModules(source: string, modules: readonly string[]) {
	const line = /^#import\s+"@preview\/cetz:([\d.]+)"\s*:\s*(.+)$/m.exec(source);
	const wanted = modules.filter((l) => !line || !line[2].split(',').some((n) => n.trim() === l));
	if (!/@preview\/cetz:/.test(source)) return `${CETZ_IMPORT}${wanted.map((l) => `, ${l}`).join('')}\n\n${source}`;
	if (wanted.length && line) return source.replace(line[0], `${line[0].trimEnd()}, ${wanted.join(', ')}`);
	return wanted.length ? `#import "@preview/cetz:0.4.2": ${wanted.join(', ')}\n${source}` : source;
}

/** the cetz modules an element needs imported, and any other package it takes */
function withImports(source: string, element: LibraryElement) {
	let text = withCetzModules(source, element.libraries);
	if (element.usepackage && !text.includes(element.usepackage)) {
		const at = /^#import\s+"@preview\/cetz:[^\n]*\n/m.exec(text);
		text = at
			? text.slice(0, at.index + at[0].length) + `${element.usepackage}\n` + text.slice(at.index + at[0].length)
			: `${element.usepackage}\n${text}`;
	}
	return text;
}

/** the canvas with its draw functions imported bare, as pasted text calls them */
function withBareDraw(source: string, picture: CetzPicture) {
	if (!picture.prefix) return source;
	const line = `${picture.prefix === 'cetz.draw.' ? 'import cetz.draw: *' : 'import draw: *'}`;
	const indent = /\n([ \t]*)\S/.exec(source.slice(picture.bodyFrom - 1, picture.endFrom))?.[1] ?? '  ';
	return `${source.slice(0, picture.bodyFrom)}\n${indent}${line}${source.slice(picture.bodyFrom)}`;
}

/** pasted statements last in the picture, named apart from what it holds; a whole canvas pastes its body */
export function appendPasted(source: string, pictureIndex: number, pasted: string) {
	const picture = readPicture(source, pictureIndex);
	if (!picture) return null;
	const body = /canvas\s*\(\s*\{([\s\S]*)\}\s*\)/.exec(pasted)?.[1] ?? pasted;
	const lines = body.split('\n').filter((l) => l.trim() && !/^\s*import\s+(cetz\.)?draw\s*:/.test(l));
	if (!lines.length) return null;
	const text = renamePasted(source.slice(picture.from, picture.to), pastedLines(lines).join('\n'));
	const bare = /^\s*(?:line|rect|circle|content|arc|bezier|group|scope|catmull|hobby|grid)\s*\(/m.test(text);
	const ready = bare ? withBareDraw(source, picture) : source;
	return appendStatement(ready, readPicture(ready, pictureIndex)!, text);
}

/** a library element last in the picture, with the modules and packages it needs */
export function addElement(source: string, pictureIndex: number, element: LibraryElement) {
	const added = appendPasted(source, pictureIndex, element.text);
	if (added === null) return null;
	return withImports(added, element);
}
