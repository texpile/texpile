import { PieceCursor } from './pieceCursor';
import { childrenIn } from './stretch';
import { mandatoryArgs, type TreeArg, type TreeCall } from './treeArgs';
import { sliceOf, type TreeImport } from '../importCore/treeImport';

export function plainText(im: TreeImport, arg: TreeArg | undefined): string | null {
	if (!arg?.body) return null;
	const cursor = new PieceCursor(im.src, arg.body);
	let out = '';
	for (let p = cursor.next(); p; p = cursor.next()) {
		if (p.kind === 'word') out += sliceOf(im, p);
		else if (p.kind === 'space') out += ' ';
		else if (p.node.name === 'OpenBracket' || p.node.name === 'CloseBracket') out += sliceOf(im, p);
		else return null;
	}
	const text = out.trim();
	return text.length > 0 ? text : null;
}

export function argTextContent(im: TreeImport, arg: TreeArg | undefined): string {
	if (!arg?.body) return '';
	let out = '';
	let at = arg.body.from;
	for (const c of childrenIn(arg.body)) {
		if (c.name !== 'Comment') continue;
		out += im.src.slice(at, c.from);
		at = c.to;
		if (im.src[at] === '\n') at++;
		while (im.src[at] === ' ' || im.src[at] === '\t') at++;
	}
	return (out + im.src.slice(Math.min(at, arg.body.to), arg.body.to)).replace(/\s+/g, ' ');
}

export function firstBraced(call: TreeCall): TreeArg | undefined {
	return mandatoryArgs(call).find((a) => a.body && a.body.to > a.body.from);
}
