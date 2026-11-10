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
export const markSaves = mapOf('mark', (p) => p.save?.marks);

const wholeRuns = all((p) => p.save?.wholeRun);
const interrupting = all((p) => p.save?.interrupts);
const splicing = all((p) => p.save?.spliceChild);
const tights = all((p) => p.save?.tight);

export function wholeRun(node: Node): boolean {
	return wholeRuns.some((is) => is(node));
}

export function interrupts(next: Node): boolean {
	return interrupting.some((does) => does(next));
}

export function spliceChild(parent: Node, index: number): boolean {
	return splicing.every((may) => may(parent, index));
}

export function tightPair(prev: Node, next: Node): boolean {
	return tights.some((tight) => tight(prev, next));
}
