import type { Node } from 'prosemirror-model';
import { Box, Braces, FileCode2, Highlighter, LayoutTemplate, Pilcrow } from '@lucide/svelte';
import type { BlockInsertItem, InsertCategory, InsertItem } from '$lib/editor/visual/insert/insertItem';
import { chainCommands } from 'prosemirror-commands';
import { setHeadingLevel } from '$lib/editor/visual/helperCommands';
import { liftListItem } from '$lib/editor/visual/insert/liftListItem';
import {
	STD_LIBRARY,
	importedFunctions,
	importedSpecs,
	loadPackage,
	loadedPackage,
	packageSpecOf,
	typstFileScope,
	type ImportedPackage,
	type PackageCacheReader,
	type TypstFileScope
} from '$lib/languages/typst/knowledge';
import { onlyInStyleEnvironments, styleEnvironmentOf } from '$lib/editor/visual/insert/loneEnvironmentTurns';
import { renameEnvironment, unwrapEnvironment } from './typstStyleTurns';
import { m } from '$lib/paraglide/messages';
import { ownFunctions, type OwnFunction } from '../../envNames';
import { typstPlugins } from '../../typstPlugins';

const PART_ORDER: readonly InsertCategory[] = ['common', 'text', 'thisFile', 'package', 'layout'];
const TEXT_ORDER = ['standard', 'heading:1', 'heading:2', 'heading:3', 'heading:4', 'heading:5', 'bullet', 'ordered', 'terms', 'quote'];

function coreItems(): InsertItem[] {
	return [
		{
			id: 'standard',
			label: m.insert_text_paragraph(),
			icon: Pilcrow,
			category: 'text',
			shape: 'block',
			style: true,
			select: 'in',
			make: (s) => s.nodes.paragraph.create(),
			turn: chainCommands(liftListItem, setHeadingLevel(0)),
			turnIn: unwrapEnvironment,
			is: (node) => node.type.name === 'paragraph'
		},
		{
			id: 'rawtypst',
			label: m.blockmenu_raw_typst(),
			icon: FileCode2,
			category: 'common',
			shape: 'block',
			style: false,
			select: 'node',
			make: (s) => s.nodes.raw_latex.createAndFill()
		}
	];
}

type EnvironmentPlace = Pick<BlockInsertItem, 'icon' | 'category' | 'style' | 'paragraphStyle' | 'part' | 'hint'>;

const STARTING_VALUES: Record<string, string> = { alignment: 'center', int: '2', angle: '90deg', scaleamount: '100%' };

function startingArgs(name: string): string | null {
	const param = STD_LIBRARY.names[name]?.params?.find((p) => p.positional && !p.content && p.default === undefined);
	const type = Object.keys(STARTING_VALUES).find((t) => param?.types?.includes(t));
	return type ? STARTING_VALUES[type] : null;
}

function environmentItem(name: string, place: EnvironmentPlace, args: string | null = null): BlockInsertItem {
	return {
		...place,
		id: `env:${name}`,
		label: name,
		shape: 'block',
		select: 'in',
		turnIn: place.style ? renameEnvironment(name) : undefined,
		make: (s) => s.nodes.typ_env.create({ name, args }, s.nodes.paragraph.create()),
		is: (node) => node.type.name === 'typ_env' && node.attrs.name === name
	};
}

function layoutCalls(): string[] {
	return Object.entries(STD_LIBRARY.names).flatMap(([name, entry]) =>
		entry.kind === 'element' &&
		entry.block === true &&
		entry.group === 'layout' &&
		name !== 'page' &&
		entry.params?.some((p) => p.name === 'body' && p.positional && p.content)
			? [name]
			: []
	);
}

function makerHint(maker: string | null, scope: TypstFileScope): string | undefined {
	if (!maker) return undefined;
	const callee = maker.replace(/\.with$/, '');
	const origin = scope.lookup(callee)?.origin;
	const pkg = origin && origin !== 'std' ? packageSpecOf(origin)?.name : null;
	return pkg ? `${callee} - ${pkg}` : callee;
}

const THEOREM_PACKAGES = new Set(['ctheorems', 'great-theorems']);

function makesTheorem(f: OwnFunction, scope: TypstFileScope): boolean {
	const found = f.maker ? scope.lookup(f.maker.replace(/\.with$/, '')) : null;
	const pkg = found?.origin && found.origin !== 'std' ? packageSpecOf(found.origin)?.name : null;
	return !!found?.entry.makes || (!!pkg && THEOREM_PACKAGES.has(pkg));
}

function ownItem(f: OwnFunction, scope: TypstFileScope): InsertItem {
	return environmentItem(f.name, {
		icon: Braces,
		category: 'thisFile',
		style: true,
		paragraphStyle: makesTheorem(f, scope),
		hint: makerHint(f.maker, scope)
	});
}

function packageItems(part: ImportedPackage): InsertItem[] {
	return part.functions.map(({ name, shape }): InsertItem => {
		const place = { category: 'package' as const, part: part.name };
		if (shape === 'block') return environmentItem(name, { ...place, icon: Box, style: true, paragraphStyle: true });
		return {
			...place,
			id: `text:${name}`,
			label: name,
			icon: Highlighter,
			shape: 'inline',
			source: (selected) => `#${name}[${selected ?? ''}]`
		};
	});
}

function inTypstOrder(items: InsertItem[]): InsertItem[] {
	function rank(item: InsertItem): number {
		return PART_ORDER.indexOf(item.category) * 100 + (item.category === 'text' ? TEXT_ORDER.indexOf(item.id) : 0);
	}
	return items
		.map((item, i) => ({ item, i }))
		.sort((a, b) => rank(a.item) - rank(b.item) || a.i - b.i)
		.map(({ item }) => item);
}

export async function typstInsertItems(source: string, cache: PackageCacheReader | null = null): Promise<InsertItem[]> {
	await Promise.all(importedSpecs(source).map((spec) => loadPackage(spec, cache)));
	const scope = typstFileScope(source, loadedPackage);
	const own = await ownFunctions(source);
	const ownNames = new Set(own.map((f) => f.name));
	const items = [
		...coreItems(),
		...typstPlugins.flatMap((plugin) => plugin.insert?.() ?? []),
		...own.map((f) => ownItem(f, scope)),
		...importedFunctions(source, loadedPackage).flatMap(packageItems),
		...layoutCalls()
			.filter((name) => !ownNames.has(name))
			.sort()
			.map((name) => environmentItem(name, { icon: LayoutTemplate, category: 'layout', style: false }, startingArgs(name)))
	];
	const seen = new Set<string>();
	const unique = items.filter((item) => !seen.has(item.id) && !!seen.add(item.id));
	return inTypstOrder(onlyInStyleEnvironments(unique, typstStyleEnvironment(unique)));
}

export function typstStyleEnvironment(items: readonly InsertItem[]): (node: Node) => boolean {
	return styleEnvironmentOf(items, 'typ_env');
}
