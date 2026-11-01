import type { NewPictureKind } from '$lib/draw/editor/figure/figureLanguage';
import { documentWrapperOf } from '$lib/languages/latex/syntax/documentWrapper';
import { withLibrary, withPackage } from '../options/libraries';
import { listPictures } from '../picture';
import { lineEnd, lineStart } from '../sourceText';

export const NEW_PICTURE = '\\begin{tikzpicture}\n  \\useasboundingbox (0,0) rectangle (15,10);\n\\end{tikzpicture}\n';

export function withPicture(source: string) {
	if (listPictures(source).length) return source;
	const end = source.lastIndexOf('\\end{document}');
	if (end < 0) return `${source}${source && !source.endsWith('\n') ? '\n' : ''}${NEW_PICTURE}`;
	const line = lineStart(source, end);
	const at = source.slice(line, end).trim() ? end : line;
	return `${source.slice(0, at)}${at === line ? '' : '\n'}${NEW_PICTURE}${source.slice(at)}`;
}

// \tikz itself, not \tikzset or \tikzstyle
const TIKZ_COMMAND = /\\tikz(?![a-zA-Z@])/g;

function isCommentedOut(source: string, pos: number) {
	return /(^|[^\\])%/.test(source.slice(lineStart(source, pos), pos));
}

function groupEnd(source: string, from: number, open: string, close: string) {
	let depth = 0;
	for (let i = from; i < source.length; i++) {
		const c = source[i];
		if (c === '\\') i++;
		else if (c === '%') i = lineEnd(source, i);
		else if (c === open) depth++;
		else if (c === close && --depth === 0) return i + 1;
	}
	return -1;
}

function statementEnd(source: string, from: number) {
	for (let i = from; i < source.length; i++) {
		const c = source[i];
		if (c === '\\') i++;
		else if (c === '%') i = lineEnd(source, i);
		else if (c === ';') return i + 1;
		else if (c === '{') {
			const end = groupEnd(source, i, '{', '}');
			if (end < 0) return -1;
			i = end - 1;
		}
	}
	return -1;
}

function skipSpace(source: string, from: number) {
	let i = from;
	while (/\s/.test(source[i] ?? '')) i++;
	return i;
}

function readTikzCommand(source: string, at: number) {
	let i = skipSpace(source, at + '\\tikz'.length);
	let options = '';
	if (source[i] === '[') {
		const end = groupEnd(source, i, '[', ']');
		if (end < 0) return null;
		options = source.slice(i, end);
		i = skipSpace(source, end);
	}
	const braced = source[i] === '{';
	const end = braced ? groupEnd(source, i, '{', '}') : statementEnd(source, i);
	if (end < 0) return null;
	const body = source.slice(braced ? i + 1 : i, braced ? end - 1 : end).trim();
	return { from: at, to: end, picture: `\\begin{tikzpicture}${options}\n  ${body}\n\\end{tikzpicture}` };
}

export function withCommandAsPicture(source: string) {
	if (listPictures(source).length) return source;
	const start = documentWrapperOf(source)?.begin.from ?? 0;
	for (const m of source.slice(start).matchAll(TIKZ_COMMAND)) {
		const at = start + m.index;
		if (isCommentedOut(source, at)) continue;
		const command = readTikzCommand(source, at);
		if (command) return `${source.slice(0, command.from)}${command.picture}${source.slice(command.to)}`;
	}
	return source;
}

export function withNeeds(source: string, kind: Pick<NewPictureKind, 'usepackage' | 'libraries'>) {
	const packaged = kind.usepackage ? withPackage(source, kind.usepackage) : source;
	return kind.libraries.reduce((text, library) => withLibrary(text, library).source, packaged);
}

export function replacePicture(source: string, kind: NewPictureKind, index = 0) {
	const picture = listPictures(source)[index];
	const next = picture
		? `${source.slice(0, picture.from)}${kind.text.trimEnd()}${source.slice(picture.to)}`
		: withPicture(source).replace(NEW_PICTURE, kind.text);
	return withNeeds(next, kind);
}
