// the import and save each name, syntax kind and node type answers to, built once from the document list
import type { Node } from 'prosemirror-model';
import { typstDocumentPlugins } from '../../typstDocumentPlugins';
import type { TypstDocumentPlugin, TypstSaveCore } from './typstDocumentPlugin';

type Part<T> = (plugin: TypstDocumentPlugin) => Readonly<Record<string, T>> | undefined;
type Save = NonNullable<TypstDocumentPlugin['save']>;

function mapOf<T>(what: string, entries: Part<T>): Map<string, T> {
	const map = new Map<string, T>();
	for (const plugin of typstDocumentPlugins)
		for (const [name, value] of Object.entries(entries(plugin) ?? {})) {
			if (map.has(name)) throw new Error(`two Typst plugins import or save the ${what} ${name}`);
			map.set(name, value);
		}
	return map;
}

/** a call several plugins read is asked of each in list order: `figure` is an image's, a table's or a figure's by its body */
function listsOf<T>(entries: Part<T>): Map<string, T[]> {
	const map = new Map<string, T[]>();
	for (const plugin of typstDocumentPlugins)
		for (const [name, value] of Object.entries(entries(plugin) ?? {})) (map.get(name) ?? map.set(name, []).get(name)!).push(value);
	return map;
}

function all<T>(part: (plugin: TypstDocumentPlugin) => T | undefined): T[] {
	return typstDocumentPlugins.flatMap((plugin) => {
		const value = part(plugin);
		return value === undefined ? [] : [value];
	});
}

export const blockCalls = listsOf((p) => p.import?.calls?.blocks);
export const inlineCalls = mapOf('call', (p) => p.import?.calls?.inline);
export const elementCalls = mapOf('element', (p) => p.import?.calls?.elements);
export const codeCalls = listsOf((p) => p.import?.calls?.code);
export const markupBlocks = mapOf('markup', (p) => p.import?.markup?.blocks);
export const markupInline = mapOf('inline markup', (p) => p.import?.markup?.inline);
export const markupCode = mapOf('code markup', (p) => p.import?.markup?.code);
export const blockRoles = all((p) => p.import?.roles?.blocks);
export const elementRoles = all((p) => p.import?.roles?.elements);

const chipClaims = all((p) => p.import?.chips);

/** source a plugin draws, which the converter keeps a chip of its own */
export function claimedChip(source: string): boolean {
	return chipClaims.some((claims) => claims(source));
}

export const nodeSaves = mapOf('node', (p) => p.save?.nodes);
export const inlineSaves = mapOf('inline node', (p) => p.save?.inline);
export const markSaves = mapOf('mark', (p) => p.save?.marks);
export const runSaves = mapOf('textblock', (p) => p.save?.runs);
export const textSaves = all((p) => p.save?.text);
export const leafSaves = all((p) => p.save?.leaf);
export const aloneBlocks: ReadonlySet<string> = new Set(all((p) => p.save?.alone).flat());
export const inCallBlocks: ReadonlySet<string> = new Set(all((p) => p.save?.inCall).flat());

function any(part: (save: Save) => ((node: Node) => boolean) | undefined): (node: Node) => boolean {
	const tests = all((p) => (p.save ? part(p.save) : undefined));
	return (node) => tests.some((test) => test(node));
}

export const wholeRun = any((s) => s.wholeRun);
export const blankInline = any((s) => s.blank);
export const stringBody = any((s) => s.stringBody);

const lineBound = all((p) => p.save?.ownLines);

/** a block bound to whole lines */
export function ownLines(node: Node, core: TypstSaveCore): boolean {
	return lineBound.some((bound) => bound(node, core));
}

const tights = all((p) => p.save?.tight);

/** two blocks a single line end joins */
export function tightPair(prev: Node, next: Node, nested: boolean): boolean {
	return tights.some((tight) => tight(prev, next, nested));
}

const holders = all((p) => p.save?.frameHolds);

/** whether the bytes the parse kept around a node's children still say what it says */
export function frameHolds(node: Node, parsed: Node): boolean {
	return holders.every((holds) => holds(node, parsed));
}
