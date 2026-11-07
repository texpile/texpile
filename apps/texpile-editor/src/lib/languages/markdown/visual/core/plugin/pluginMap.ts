// the import and save each name, syntax kind and node type answers to, built once from the plugin list
import type { Node } from 'prosemirror-model';
import { markdownPlugins } from '../../markdownPlugins';
import type { MarkdownPlugin } from './markdownPlugin';

type Part<T> = (plugin: MarkdownPlugin) => Readonly<Record<string, T>> | undefined;

function mapOf<T>(what: string, entries: Part<T>): Map<string, T> {
	const map = new Map<string, T>();
	for (const plugin of markdownPlugins)
		for (const [name, value] of Object.entries(entries(plugin) ?? {})) {
			if (map.has(name)) throw new Error(`two Markdown plugins import or save the ${what} ${name}`);
			map.set(name, value);
		}
	return map;
}

/** a name several plugins read is asked of each in list order */
function listsOf<T>(entries: Part<T>): Map<string, T[]> {
	const map = new Map<string, T[]>();
	for (const plugin of markdownPlugins)
		for (const [name, value] of Object.entries(entries(plugin) ?? {})) (map.get(name) ?? map.set(name, []).get(name)!).push(value);
	return map;
}

function all<T>(part: (plugin: MarkdownPlugin) => T | undefined): T[] {
	return markdownPlugins.flatMap((plugin) => {
		const value = part(plugin);
		return value === undefined ? [] : [value];
	});
}

export const blockImports = mapOf('block', (p) => p.import?.blocks);
export const inlineImports = listsOf((p) => p.import?.inline);
export const paragraphImports = all((p) => p.import?.paragraph);

export const nodeSaves = mapOf('node', (p) => p.save?.nodes);
export const inlineSaves = mapOf('inline node', (p) => p.save?.inline);
export const textSaves = all((p) => p.save?.text);
/** in nesting order */
export const markSaves = mapOf('mark', (p) => p.save?.marks);

const wholeRuns = all((p) => p.save?.wholeRun);
const interrupting = all((p) => p.save?.interrupts);
const splicing = all((p) => p.save?.spliceChild);

/** a node written as one run, its bytes from its attrs */
export function wholeRun(node: Node): boolean {
	return wholeRuns.some((is) => is(node));
}

/** whether `next` may sit right under a paragraph line without joining it */
export function interrupts(next: Node): boolean {
	return interrupting.some((does) => does(next));
}

/** whether a changed child may be written on its own inside its container's frame */
export function spliceChild(parent: Node, index: number): boolean {
	return splicing.every((may) => may(parent, index));
}
