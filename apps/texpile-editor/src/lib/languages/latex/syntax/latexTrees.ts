import type { Tree } from '@lezer/common';
import type { LRParser } from '@lezer/lr';
import { parser } from './parser';
import { AT_LETTER, openConstructsFor } from './tokens/openConstructs';
import { NO_OWN_SYNTAX, ownSyntaxTokensKey, type OwnSyntax } from './tokens/ownSyntax';
import { structureTokens, structureTokensFor } from './tokens/structureTokens';
import { ownLiteralsIn } from '../userDefinitions';

const KEPT = 4;
const trees = new Map<string, Tree>();

function keep(text: string, tree: Tree): Tree {
	trees.delete(text);
	trees.set(text, tree);
	if (trees.size > KEPT) trees.delete(trees.keys().next().value!);
	return tree;
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

/** the tree of `text`, read with the verbatim environments and commands it defines itself */
export function latexTreeOf(text: string): Tree {
	const found = trees.get(text);
	if (found) return keep(text, found);
	const packageFile = PACKAGE_FILE.test(text.slice(0, 4000));
	const first = keep(text, latexParserFor(packageFile).parse(text));
	const own: OwnSyntax = { math: NO_OWN_SYNTAX.math, literals: ownLiteralsIn(text) };
	if (ownSyntaxTokensKey(own) === noLiterals()) return first;
	return keep(text, latexParserFor(packageFile, own).parse(text));
}

/** an editor's finished parse, so readers of the same text skip parsing it again */
export function rememberLatexTree(text: string, tree: Tree): void {
	if (tree.length === text.length) keep(text, tree);
}
