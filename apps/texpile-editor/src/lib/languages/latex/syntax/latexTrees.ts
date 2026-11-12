import { TreeFragment, type Tree } from '@lezer/common';
import type { LRParser } from '@lezer/lr';
import { parser } from './parser';
import { AT_LETTER, openConstructsFor } from './tokens/openConstructs';
import { NO_OWN_SYNTAX, ownSyntaxTokensKey, type OwnSyntax } from './tokens/ownSyntax';
import { structureTokens, structureTokensFor } from './tokens/structureTokens';
import { ownLiteralsIn } from '../userDefinitions';

// a text this long is a file or a reading of one (its code alone, its body): the short ones are captions and
// arguments cut from it, kept apart so that a file's own readings stay
const FILE_CHARS = 4096;
const KEPT_FILES = 12;
// past twelve files the kept ones may hold this many characters: a project of many short files keeps a tree of each
const KEPT_FILE_CHARS = 6_000_000;
// the files a newer text was read on from: the last few stay for an undo
const KEPT_REPLACED = 6;
const KEPT_SHORT = 64;
// a change longer than this is a paste or another file, read whole; one this short is typing
const NEAR_CHARS = 2000;
const TYPED_CHARS = 64;

// by: the parser that read it, null for a tree an editor handed over. plain: the first reading of a text that
// defines literals of its own, which the next first reading goes on from
type Reading = { tree: Tree; by: LRParser | null };
type Kept = Reading & { plain?: Reading };
const files = new Map<string, Kept>();
const short = new Map<string, Kept>();
let fileChars = 0;
// oldest first; a file asked for again is no longer one of them
const replaced = new Set<string>();

function kept(text: string): Kept | undefined {
	return (text.length < FILE_CHARS ? short : files).get(text);
}

function keep(text: string, reading: Kept): Tree {
	if (text.length < FILE_CHARS) {
		short.delete(text);
		short.set(text, reading);
		if (short.size > KEPT_SHORT) short.delete(short.keys().next().value!);
		return reading.tree;
	}
	if (!files.delete(text)) fileChars += text.length;
	files.set(text, reading);
	return reading.tree;
}

function dropFile(text: string): void {
	if (files.delete(text)) fileChars -= text.length;
	replaced.delete(text);
}

function trimFiles(): void {
	while (replaced.size > KEPT_REPLACED) dropFile(replaced.values().next().value!);
	while (files.size > KEPT_FILES && fileChars > KEPT_FILE_CHARS) dropFile((replaced.size ? replaced : files).keys().next().value!);
}

/** `text` as `by` reads it. A file goes on from the tree of the kept file nearest to it, so a typed character rereads
 *  the nodes around it and the rest of the tree is the old one */
function read(by: LRParser, text: string): Tree {
	if (text.length < FILE_CHARS) return by.parse(text);
	let near: { old: string; tree: Tree; from: number; toA: number; toB: number } | null = null;
	// the newest first: the reading of the text one key ago is the nearest there is, and the search ends on it
	for (const [old, reading] of [...files].reverse()) {
		if (near && Math.max(near.toA, near.toB) - near.from <= TYPED_CHARS) break;
		const tree = reading.by === by ? reading.tree : reading.plain?.by === by ? reading.plain.tree : null;
		if (!tree || Math.abs(old.length - text.length) > NEAR_CHARS) continue;
		const most = Math.min(old.length, text.length);
		let from = 0;
		while (from < most && old.charCodeAt(from) === text.charCodeAt(from)) from++;
		let toA = old.length;
		let toB = text.length;
		while (toA > from && toB > from && old.charCodeAt(toA - 1) === text.charCodeAt(toB - 1)) {
			toA--;
			toB--;
		}
		if (!near || Math.max(toA, toB) - from < Math.max(near.toA, near.toB) - near.from) near = { old, tree, from, toA, toB };
	}
	if (!near || Math.max(near.toA, near.toB) - near.from > NEAR_CHARS) return by.parse(text);
	replaced.delete(near.old);
	replaced.add(near.old);
	const change = { fromA: near.from, toA: near.toA, fromB: near.from, toB: near.toB };
	return by.parse(text, TreeFragment.applyChanges(TreeFragment.addTree(near.tree), [change]));
}

// a package or class file read as text says so near its top
const PACKAGE_FILE = /\\(?:ProvidesPackage|ProvidesClass|NeedsTeXFormat)\b/;
let noLiteralsKey: string | null = null;
function noLiterals(): string {
	noLiteralsKey ??= ownSyntaxTokensKey(NO_OWN_SYNTAX);
	return noLiteralsKey;
}

const parsers = new Map<string, LRParser>();

export function latexParserFor(packageFile: boolean, own?: OwnSyntax): LRParser {
	const key = `${packageFile}:${own ? ownSyntaxTokensKey(own) : noLiterals()}`;
	let found = parsers.get(key);
	if (!found) {
		found = parser.configure({
			...(packageFile ? { contextTracker: openConstructsFor(AT_LETTER) } : {}),
			...(own ? { tokenizers: [{ from: structureTokens, to: structureTokensFor(own) }] } : {})
		});
		parsers.set(key, found);
	}
	return found;
}

export function latexTreeAtLetter(text: string): Tree {
	return latexParserFor(true).parse(text);
}

/** the tree of `text`, read with the verbatim environments and commands it defines itself */
export function latexTreeOf(text: string): Tree {
	const found = kept(text);
	if (found) {
		replaced.delete(text);
		return keep(text, found);
	}
	const packageFile = PACKAGE_FILE.test(text.slice(0, 4000));
	const plain = latexParserFor(packageFile);
	const first: Reading = { tree: read(plain, text), by: plain };
	keep(text, first);
	const own: OwnSyntax = { math: NO_OWN_SYNTAX.math, literals: ownLiteralsIn(text) };
	const by = ownSyntaxTokensKey(own) === noLiterals() ? null : latexParserFor(packageFile, own);
	const tree = by ? keep(text, { tree: read(by, text), by, plain: first }) : first.tree;
	trimFiles();
	return tree;
}

/** an editor's finished parse, so readers of the same text skip parsing it again */
export function rememberLatexTree(text: string, tree: Tree): void {
	if (tree.length !== text.length || kept(text)) return;
	keep(text, { tree, by: null });
	trimFiles();
}
