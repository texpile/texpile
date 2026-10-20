// unified-latex's tokenizer memoizes every (rule, offset) it tries until the parse call returns:
// ~1.5 KB live per source byte, 1.9 GB for a 2 MB paper. tokenizing in chunks bounds that by the
// chunk; the later passes run once over the joined token stream.
//
// the tokenizer never looks behind, so a chunk's tokens equal the whole parse's unless a forward
// scan (group, environment, math, verbatim, \verb) ran out of chunk and backtracked, which always
// leaves the opener as a bare token. such an opener only matters if the whole parse would have
// closed it: the first matching closer, at body level, in a later chunk. chunks are tokenized
// at every cut first, then every opener with a closer merges its chunks and the span is
// tokenized again, until nothing spans a cut. an opener with no closer anywhere is bare in the
// whole parse too.
import { parseMinimal } from './pegMinimal';
import { tokenizerNames, type TokenizerNames } from './signatures/tokenizerNames';
import type * as Ast from '@unified-latex/unified-latex-types';

export const CHUNK_BYTES = 32 * 1024;

const DOC_BEGIN = '\\begin{document}';
const DOC_END = '\\end{document}';
const TAIL_PREFIX = DOC_BEGIN + '\n';

type Piece = {
	kind: 'flat' | 'head' | 'tail';
	start: number;
	end: number;
	text: string;
	root: Ast.Root;
};

// raw: the grammar scans for this text character by character, so nothing can hide it
type Opener =
	| { kind: 'group' }
	| { kind: 'env'; name: string; math: boolean }
	| { kind: 'display' }
	| { kind: 'inline' }
	| { kind: 'raw'; needle: string };

export function parseMinimalChunked(source: string, chunkBytes = CHUNK_BYTES, names = tokenizerNames()): Ast.Root {
	const cuts = cutPoints(source, chunkBytes);
	if (cuts.length === 0) return parseMinimal(source, names);
	return parseDocument(source, cuts, names) ?? parseFlat(source, cuts, names);
}

function parseFlat(source: string, cuts: number[], names: TokenizerNames): Ast.Root {
	const bounds = [0, ...cuts, source.length];
	const pieces: Piece[] = [];
	for (let i = 0; i + 1 < bounds.length; i++) pieces.push(flatPiece(source, bounds[i], bounds[i + 1], names));
	if (resolve(source, pieces, names) !== 'ok') return parseMinimal(source, names);
	const content: Ast.Node[] = [];
	for (const piece of pieces) emit(piece.root.content, piece, source, content);
	return root(source, content);
}

// a whole file is one `document` environment, which the tokenizer takes as a single token, so
// nothing inside it would ever cut. the body is chunked like a root instead: the head is parsed
// with a synthetic \end{document} closing it, the tail with a synthetic \begin{document}
// opening it, and the environment node is rebuilt from the pieces. each piece is checked to be
// the shape only that reading gives; any other shape means the file is not one such environment
function parseDocument(source: string, cuts: number[], names: TokenizerNames): Ast.Root | null {
	const open = uncommentedIndexOf(source, DOC_BEGIN);
	if (open < 0) return null;
	// the tail starts at the last cut before the last closer, so whatever trails the
	// environment is tail too
	const bodyCuts = cuts.filter((c) => c > open && c <= source.lastIndexOf(DOC_END));
	if (bodyCuts.length === 0) return null;
	const head = headPiece(source, bodyCuts[0], names);
	if (!head) return null;
	const pieces: Piece[] = [head];
	for (let i = 0; i + 1 < bodyCuts.length; i++) pieces.push(flatPiece(source, bodyCuts[i], bodyCuts[i + 1], names));
	const tail = tailPiece(source, bodyCuts[bodyCuts.length - 1], names);
	if (!tail) return null;
	pieces.push(tail);
	const resolved = resolve(source, pieces, names);
	if (resolved === 'whole') return parseMinimal(source, names);
	if (resolved === 'reject') return null;
	const headEnv = pieces[0].root.content[pieces[0].root.content.length - 1] as Ast.Environment;
	const tailEnv = pieces[pieces.length - 1].root.content[0] as Ast.Environment;
	const body: Ast.Node[] = [];
	const content: Ast.Node[] = [];
	emit(pieces[0].root.content.slice(0, -1), pieces[0], source, content);
	emit(headEnv.content, pieces[0], source, body);
	for (const piece of pieces.slice(1, -1)) emit(piece.root.content, piece, source, body);
	const last = pieces[pieces.length - 1];
	emit(tailEnv.content.slice(1), last, source, body);
	const end = tailEnv.position!.end;
	content.push({
		type: 'environment',
		env: 'document',
		content: body,
		position: {
			source: undefined,
			start: headEnv.position!.start,
			end: { offset: end.offset + offsetShift(last), line: end.line + lineShift(source, last), column: end.column }
		}
	} as Ast.Environment);
	emit(last.root.content.slice(1), last, source, content);
	return root(source, content);
}

function flatPiece(source: string, start: number, end: number, names: TokenizerNames): Piece {
	const text = source.slice(start, end);
	return { kind: 'flat', start, end, text, root: parseMinimal(text, names) };
}

function headPiece(source: string, end: number, names: TokenizerNames): Piece | null {
	const text = source.slice(0, end) + DOC_END;
	const root = parseMinimal(text, names);
	const env = root.content[root.content.length - 1];
	if (!isDocumentEnv(env) || env.position?.end.offset !== text.length) return null;
	const last = env.content[env.content.length - 1];
	if (!last || last.type !== 'parbreak' || last.position?.end.offset !== end) return null;
	return { kind: 'head', start: 0, end, text, root };
}

function tailPiece(source: string, start: number, names: TokenizerNames): Piece | null {
	const text = TAIL_PREFIX + source.slice(start);
	const root = parseMinimal(text, names);
	const env = root.content[0];
	if (!isDocumentEnv(env)) return null;
	const nl = env.content[0];
	if (!nl || nl.type !== 'whitespace' || nl.position?.start.offset !== DOC_BEGIN.length || nl.position.end.offset !== TAIL_PREFIX.length)
		return null;
	return { kind: 'tail', start, end: source.length, text, root };
}

// merges every piece whose opener a later piece closes. a merged piece that conflicts again at
// least doubles, and on the third time takes the rest of the file: a preamble \def{\begin{split}}
// that the body closes with a literal \end{split} makes the whole parse one environment, and
// the same goes for an unbalanced $, which flips the pairing of every later one. 'whole' says
// the file cannot be chunked at all; 'reject' that a merged head or tail no longer reads as
// the document environment
function resolve(source: string, pieces: Piece[], names: TokenizerNames): 'ok' | 'whole' | 'reject' {
	let i = 0;
	let chain = 0;
	while (i + 1 < pieces.length) {
		const span = firstConflict(source, pieces, i, names);
		if (!span) {
			i++;
			chain = 0;
			continue;
		}
		let to = span.to;
		if (span.from === i && chain >= 3) to = pieces.length - 1;
		else if (span.from === i && chain) {
			const want = pieces[i].start + 2 * (pieces[i].end - pieces[i].start);
			while (to + 1 < pieces.length && pieces[to].end < want) to++;
		}
		if (span.from === 0 && to === pieces.length - 1) return 'whole';
		const merged = mergePieces(source, pieces[span.from], pieces[to], names);
		if (!merged) return 'reject';
		pieces.splice(span.from, to - span.from + 1, merged);
		chain = span.from === i ? chain + 1 : 0;
	}
	return 'ok';
}

function mergePieces(source: string, from: Piece, to: Piece, names: TokenizerNames): Piece | null {
	if (from.kind === 'head') return headPiece(source, to.end, names);
	if (to.kind === 'tail') return tailPiece(source, from.start, names);
	return flatPiece(source, from.start, to.end, names);
}

// the pieces to merge for the earliest opener in piece i that a later piece closes, else null
function firstConflict(source: string, pieces: Piece[], i: number, names: TokenizerNames): { from: number; to: number } | null {
	const piece = pieces[i];
	if (piece.kind === 'flat' && !endsWithParbreak(piece)) return { from: i, to: i + 1 };
	if (piece.kind === 'head') {
		// the real environment ends at the first body-level \end{document}: everything from the
		// piece holding it becomes the tail, which puts the closer and the trailer in their places
		const j = documentCloser(pieces);
		if (j >= 0) return { from: j, to: pieces.length - 1 };
	}
	const openers: { at: number; opener: Opener }[] = [];
	collectOpeners(piece.root.content, false, piece.text, openers, names);
	openers.sort((a, b) => a.at - b.at);
	for (const { opener } of openers) {
		const j = findCloser(source, opener, pieces, i);
		if (j >= 0) return { from: i, to: j };
	}
	return null;
}

function documentCloser(pieces: Piece[]): number {
	return pieceWithToken(pieces.slice(0, -1), 0, false, isDocumentMacro('begin'), isDocumentMacro('end'));
}

function isDocumentMacro(name: string): TokenTest {
	return (n, next, text) => n.type === 'macro' && n.content === name && adjacentEnvName(next, n, text) === 'document';
}

function endsWithParbreak(piece: Piece): boolean {
	const last = piece.root.content[piece.root.content.length - 1];
	return !!last && last.type === 'parbreak' && last.position?.end.offset === piece.text.length;
}

function collectOpeners(
	nodes: Ast.Node[],
	math: boolean,
	text: string,
	out: { at: number; opener: Opener }[],
	names: TokenizerNames
): void {
	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		const at = node.position?.start.offset ?? 0;
		switch (node.type) {
			case 'macro': {
				const name = node.content;
				if (name === 'begin') {
					const env = adjacentEnvName(nodes[i + 1], node, text);
					if (env !== null) out.push({ at, opener: envOpener(env, names) });
				} else if (name === '[') out.push({ at, opener: { kind: 'display' } });
				else if (name === '(') out.push({ at, opener: { kind: 'inline' } });
				else if (name === 'lstinline' || name === 'mint' || name === 'mintinline') {
					const needle = listingCloser(name, text, node.position?.end.offset ?? 0);
					if (needle !== null) out.push({ at, opener: { kind: 'raw', needle } });
				} else if (name.startsWith('verb')) {
					// \verb takes the very next character as its delimiter, so \verbatiminput scans
					// for the next "a"; the macro rule then owns the whole name
					const end = node.position?.end.offset ?? 0;
					const needle = name.length > 4 ? name[4] : text[end] === '*' ? text[end + 1] : text[end];
					if (needle !== undefined) out.push({ at, opener: { kind: 'raw', needle } });
				}
				break;
			}
			case 'string':
				if (node.content === '{') out.push({ at, opener: { kind: 'group' } });
				else if (node.content === '$' && !math) out.push({ at, opener: { kind: 'raw', needle: '$' } });
				break;
			case 'group':
			case 'environment':
				// a verbatim group (\lstinline{...}) carries one string node instead of an array
				if (Array.isArray(node.content)) collectOpeners(node.content, false, text, out, names);
				break;
			case 'mathenv':
			case 'inlinemath':
			case 'displaymath':
				collectOpeners(node.content, true, text, out, names);
				break;
		}
	}
}

function envOpener(name: string, names: TokenizerNames): Opener {
	if (names.verbatimEnvs.includes(name) || names.verbatimOptionalArgEnvs.includes(name)) return { kind: 'raw', needle: `\\end{${name}}` };
	return { kind: 'env', name, math: names.mathEnvs.includes(name) };
}

// what would close a \lstinline, \mint or \mintinline that ran out of chunk: after the optional
// [...] (and the language group of the minted pair) comes a {...} scanned to the next brace, or a
// delimiter character scanned to its next occurrence. null when the grammar gives up here too
function listingCloser(name: string, text: string, end: number): string | null {
	let p = end;
	if (text[p] === '[') {
		const close = text.indexOf(']', p);
		if (close < 0) return ']';
		p = close + 1;
	}
	if (name !== 'lstinline') {
		if (text[p] !== '{') return null;
		const close = text.indexOf('}', p);
		if (close < 0) return '}';
		p = close + 1;
	}
	const c = text[p];
	if (c === undefined || c === ' ' || c === '\t' || c === '\n' || c === '\r') return null;
	return c === '{' ? '}' : c;
}

// the raw text inside the group right after \begin or \end, which is how the grammar names an
// environment; null when no group follows directly
function adjacentEnvName(next: Ast.Node | undefined, macro: Ast.Node, text: string): string | null {
	if (!next || next.type !== 'group' || !Array.isArray(next.content)) return null;
	const p = next.position;
	if (!p || p.start.offset !== macro.position?.end.offset) return null;
	return text.slice(p.start.offset + 1, p.end.offset - 1);
}

function findCloser(source: string, opener: Opener, pieces: Piece[], i: number): number {
	switch (opener.kind) {
		case 'raw':
			return pieceWithText(source, pieces, i, opener.needle);
		case 'group':
			return pieceWithToken(
				pieces,
				i,
				false,
				(n) => n.type === 'string' && n.content === '{',
				(n) => n.type === 'string' && n.content === '}'
			);
		case 'display':
			return pieceWithToken(pieces, i, true, isMacro('['), isMacro(']'));
		case 'inline':
			return pieceWithToken(pieces, i, true, isMacro('('), isMacro(')'));
		case 'env':
			return pieceWithToken(
				pieces,
				i,
				opener.math,
				(n, next, text) => n.type === 'macro' && n.content === 'begin' && adjacentEnvName(next, n, text) === opener.name,
				(n, next, text) => n.type === 'macro' && n.content === 'end' && adjacentEnvName(next, n, text) === opener.name
			);
	}
}

function isMacro(name: string) {
	return (n: Ast.Node) => n.type === 'macro' && n.content === name;
}

// the piece holding the first later occurrence of raw text
function pieceWithText(source: string, pieces: Piece[], i: number, needle: string): number {
	const at = source.indexOf(needle, pieces[i + 1].start);
	if (at < 0) return -1;
	for (let j = i + 1; j < pieces.length; j++) if (at < pieces[j].end) return j;
	return -1;
}

type TokenTest = (node: Ast.Node, next: Ast.Node | undefined, text: string) => boolean;

// the first later piece whose body-level tokens close the opener, counting nested reopenings.
// a math-mode body reads a $ as a character, so for those openers a later chunk's $...$ is
// looked through
function pieceWithToken(pieces: Piece[], i: number, mathBody: boolean, opens: TokenTest, closes: TokenTest): number {
	let depth = 0;
	for (let j = i + 1; j < pieces.length; j++) {
		const piece = pieces[j];
		const tokens = bodyTokens(piece, mathBody);
		for (let k = 0; k < tokens.length; k++) {
			const node = tokens[k];
			if (opens(node, tokens[k + 1], piece.text)) depth++;
			else if (closes(node, tokens[k + 1], piece.text)) {
				if (depth === 0) return j;
				depth--;
			}
		}
	}
	return -1;
}

function bodyTokens(piece: Piece, throughInlineMath: boolean): Ast.Node[] {
	let nodes: Ast.Node[];
	if (piece.kind === 'tail') {
		const env = piece.root.content[0] as Ast.Environment;
		// the real closer sits between the body and the trailer, and a second \begin{document}
		// in the body would be closed by it
		nodes = [...env.content.slice(1), ...syntheticEnd(env, piece.text), ...piece.root.content.slice(1)];
	} else nodes = piece.root.content;
	if (!throughInlineMath) return nodes;
	const out: Ast.Node[] = [];
	for (const node of nodes) {
		if (node.type === 'inlinemath' && piece.text[node.position?.start.offset ?? -1] === '$') out.push(...node.content);
		else out.push(node);
	}
	return out;
}

function syntheticEnd(env: Ast.Environment, text: string): Ast.Node[] {
	const end = env.position!.end.offset;
	const at = { offset: end - DOC_END.length, line: 0, column: 0 };
	const macro = { type: 'macro', content: 'end', position: { start: at, end: { offset: at.offset + 4, line: 0, column: 0 } } } as Ast.Macro;
	const group = {
		type: 'group',
		content: [{ type: 'string', content: 'document' } as Ast.String],
		position: { start: { offset: at.offset + 4, line: 0, column: 0 }, end: { offset: end, line: 0, column: 0 } }
	} as Ast.Group;
	return text.endsWith(DOC_END, end) ? [macro, group] : [];
}

function isDocumentEnv(node: Ast.Node | undefined): node is Ast.Environment {
	return !!node && node.type === 'environment' && node.env === 'document';
}

function offsetShift(piece: Piece): number {
	return piece.kind === 'tail' ? piece.start - TAIL_PREFIX.length : piece.start;
}

function lineShift(source: string, piece: Piece): number {
	const before = countNewlines(source, 0, piece.start);
	return piece.kind === 'tail' ? before - 1 : before;
}

function emit(nodes: Ast.Node[], piece: Piece, source: string, into: Ast.Node[]): void {
	const offset = offsetShift(piece);
	const lines = lineShift(source, piece);
	for (const node of nodes) {
		if (offset || lines) shift(node, offset, lines);
		into.push(node);
	}
}

function root(source: string, content: Ast.Node[]): Ast.Root {
	const n = source.length;
	return {
		type: 'root',
		content,
		position: {
			source: undefined,
			start: { offset: 0, line: 1, column: 1 },
			end: { offset: n, line: 1 + countNewlines(source, 0, n), column: n - source.lastIndexOf('\n') }
		}
	} as Ast.Root;
}

function cutPoints(source: string, chunkBytes: number): number[] {
	const cuts: number[] = [];
	let p = nextCut(source, chunkBytes);
	while (p < source.length) {
		cuts.push(p);
		p = nextCut(source, p + chunkBytes);
	}
	return cuts;
}

// the first line start at or past `from` that follows a blank line and opens with a character
// the parbreak rule would not absorb (space, tab, or a comment), else the end of the source
function nextCut(source: string, from: number): number {
	const n = source.length;
	let nl = source.indexOf('\n', Math.max(from, 1) - 1);
	while (nl >= 0) {
		const p = nl + 1;
		if (p >= n) return n;
		if (blankLineEndsAt(source, nl) && opensParagraph(source.charCodeAt(p))) return p;
		nl = source.indexOf('\n', p);
	}
	return n;
}

function blankLineEndsAt(source: string, nl: number): boolean {
	for (let i = nl - 1; i >= 0; i--) {
		const c = source.charCodeAt(i);
		if (c === 10) return true;
		if (c !== 32 && c !== 9 && c !== 13) return false;
	}
	return true;
}

function opensParagraph(c: number): boolean {
	return c !== 32 && c !== 9 && c !== 37 && c !== 10 && c !== 13;
}

function uncommentedIndexOf(source: string, needle: string): number {
	let i = source.indexOf(needle);
	while (i >= 0) {
		let commented = false;
		for (let j = i - 1; j >= 0 && source.charCodeAt(j) !== 10; j--) {
			if (source.charCodeAt(j) === 37 && source.charCodeAt(j - 1) !== 92) commented = true;
		}
		if (!commented) return i;
		i = source.indexOf(needle, i + 1);
	}
	return -1;
}

function shift(node: Ast.Node | Ast.String, offset: number, lines: number): void {
	const p = node.position;
	if (p) {
		p.start.offset += offset;
		p.start.line += lines;
		p.end.offset += offset;
		p.end.line += lines;
	}
	const content = (node as { content?: unknown }).content;
	if (Array.isArray(content)) for (const child of content) shift(child, offset, lines);
	else if (content && typeof content === 'object') shift(content as Ast.String, offset, lines);
	// a math environment's name is a positioned string node at this stage
	const env = (node as { env?: unknown }).env;
	if (env && typeof env === 'object') shift(env as Ast.String, offset, lines);
}

function countNewlines(source: string, from: number, to: number): number {
	let count = 0;
	let i = source.indexOf('\n', from);
	while (i >= 0 && i < to) {
		count++;
		i = source.indexOf('\n', i + 1);
	}
	return count;
}
