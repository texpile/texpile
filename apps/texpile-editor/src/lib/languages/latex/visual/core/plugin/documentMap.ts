// the import and save each name and node type answers to, built once from the document list
import type { Node } from 'prosemirror-model';
import type { TreeImport } from '$lib/languages/latex/parser/tree/importCore/treeImport';
import { latexDocumentPlugins } from '../../latexDocumentPlugins';
import type { LatexCommandImport, LatexDocumentPlugin, LatexEnvironmentImport, LatexMarkSave, LatexNodeSave } from './latexDocumentPlugin';

function mapOf<T>(what: string, entries: (plugin: LatexDocumentPlugin) => Readonly<Record<string, T>> | undefined): Map<string, T> {
	const map = new Map<string, T>();
	for (const plugin of latexDocumentPlugins)
		for (const [name, value] of Object.entries(entries(plugin) ?? {})) {
			if (map.has(name)) throw new Error(`two LaTeX plugins import or save the ${what} ${name}`);
			map.set(name, value);
		}
	return map;
}

export const commandImports: ReadonlyMap<string, LatexCommandImport> = mapOf('command', (p) => p.import?.commands);
export const environmentImports: ReadonlyMap<string, LatexEnvironmentImport> = mapOf('environment', (p) => p.import?.environments);
export const verbatimImports: ReadonlyMap<string, LatexEnvironmentImport> = mapOf(
	'verbatim environment',
	(p) => p.import?.verbatimEnvironments
);
export const nodeSaves: ReadonlyMap<string, LatexNodeSave> = mapOf('node', (p) => p.save?.nodes);
export const markSaves: ReadonlyMap<string, LatexMarkSave> = mapOf('mark', (p) => p.save?.marks);

type Role = 'math' | 'items';

function roleOf(role: Role): LatexEnvironmentImport | undefined {
	const claims = latexDocumentPlugins.flatMap((p) => (p.import?.roles?.[role] ? [p.import.roles[role]] : []));
	if (claims.length > 1) throw new Error(`two LaTeX plugins import the ${role} role`);
	return claims[0];
}

/** what reads an environment the package data gives the role */
export const roleImports: Readonly<Record<Role, LatexEnvironmentImport | undefined>> = { math: roleOf('math'), items: roleOf('items') };

const bodies = latexDocumentPlugins.flatMap((p) => (p.import?.environmentBody ? [p.import.environmentBody] : []));

/** the plugin's reading of an environment's body that the core keeps as an environment */
export function environmentBodyOf(name: string): NonNullable<NonNullable<LatexDocumentPlugin['import']>['environmentBody']> | undefined {
	return bodies.find((body) => body.reads(name));
}

const readers = latexDocumentPlugins.flatMap((p) => (p.import?.reads ? [p.import.reads] : []));

/** a command a plugin reads itself, whose arguments the import needs no signature for */
export function readByPlugin(name: string): boolean {
	return readers.some((reads) => reads(name));
}

const blockers = latexDocumentPlugins.flatMap((p) => (p.import?.blocks ? [p.import.blocks] : []));

/** a command a plugin stands as a block of its own */
export function blockByPlugin(name: string, im: TreeImport): boolean {
	return blockers.some((blocks) => blocks(name, im));
}

const holders = latexDocumentPlugins.flatMap((p) => (p.save?.frameHolds ? [p.save.frameHolds] : []));

/** whether the bytes the parse kept around a node's children still say what it says */
export function frameHolds(node: Node, parsed: Node): boolean {
	return holders.every((holds) => holds(node, parsed));
}

/** the node types that end the paragraph before them */
export const paragraphEnders: ReadonlySet<string> = new Set(latexDocumentPlugins.flatMap((p) => p.save?.endsParagraph ?? []));
