import { Braces, FileCode2, Pilcrow, ScrollText, Type } from '@lucide/svelte';
import type { Node, Schema } from 'prosemirror-model';
import type { InsertCategory, InsertItem } from '$lib/editor/visual/insert/insertItem';
import { inLyxOrder } from '$lib/editor/visual/insert/insertCategories';
import { setHeadingLevel } from '$lib/editor/visual/helperCommands';
import { chainCommands } from 'prosemirror-commands';
import { liftListItem } from '$lib/editor/visual/insert/liftListItem';
import { onlyInStyleEnvironments, styleEnvironmentOf, unwrapLoneEnvironment } from '$lib/editor/visual/insert/loneEnvironmentTurns';
import { definitionsIn } from '$lib/languages/latex/knowledge/calls/definitions';
import { commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';
import { KERNEL_ID } from '$lib/languages/latex/knowledge/fileIds';
import type { LoadedFile } from '$lib/languages/latex/knowledge/loadedFiles';
import {
	stackedCommands,
	stackedEnvironments,
	type StackedCommand,
	type StackedEnvironment
} from '$lib/languages/latex/knowledge/stackedEntries';
import { codeOnly } from '$lib/languages/latex/texCode';
import { definedHeads } from '$lib/languages/latex/visual/extensions/environment/environmentHeads';
import { m } from '$lib/paraglide/messages';
import { latexPlugins } from '../../latexPlugins';
import { MANDATORY, argumentSlots, hintOf, renameEnvironment, type LatexInsertContext, type LatexInsertOffer } from './latexInsert';
import { environmentImports, verbatimImports } from './documentMap';
import { commandPlugins } from './pluginMap';

export type LatexInsertInput = {
	loaded: LoadedFile[] | null;
	direct: ReadonlySet<string>;
	definitions: string;
};

function contextOf(loaded: LoadedFile[] | null): LatexInsertContext {
	const environments = loaded ? stackedEnvironments(loaded) : new Map<string, StackedEnvironment>();
	const commands = loaded ? stackedCommands(loaded) : new Map();
	const offered = [...environments.values()].filter((e) => e.offered);
	return {
		environment: (name) => (environments.get(name)?.offered ? environments.get(name) : undefined),
		command: (name) => (commands.get(name)?.offered ? commands.get(name) : undefined),
		environments: () => offered,
		hint: hintOf
	};
}

// what the data gives no starting value for: a box register needs a \\newsavebox the editor cannot write, the rest take a plain size
const STARTING_SLOTS: Record<string, string> = { minipage: '{\\linewidth}', picture: '(100,100)' };
const NEEDS_OWN_DECLARATION = new Set(['lrbox']);

function startingArguments(e: StackedEnvironment): string {
	const known = STARTING_SLOTS[e.name.replace(/\*$/, '')];
	if (known) return known;
	return (e.args ?? []).map((a) => (a.placeholder === 'number' && MANDATORY.test(a.kind) ? '{2}' : argumentSlots([a]))).join('');
}

function environmentItem(name: string, args: string, category: InsertCategory, label: string, hint?: string): InsertItem {
	const theorem = category === 'theorems';
	return {
		id: `env:${name}`,
		label,
		icon: theorem ? ScrollText : Braces,
		category,
		hint,
		shape: 'block',
		style: theorem,
		paragraphStyle: theorem,
		select: 'in',
		turnIn: theorem ? renameEnvironment(name, args, true) : undefined,
		make: (s: Schema) => s.nodes.environment.create({ name, args }, s.nodes.paragraph.create()),
		is: (node) => node.type.name === 'environment' && node.attrs.name === name
	};
}

function readsAsTheorem(e: StackedEnvironment): boolean {
	const args = (e.args ?? []).filter((a) => a.kind !== 'd<>');
	return (
		args.length === 1 &&
		args[0].kind === 'o' &&
		!args[0].keys &&
		!args[0].values &&
		!e.body &&
		!e.item &&
		!e.cells &&
		!e.float &&
		!e.numbering &&
		!e.in
	);
}

function categoryOf(e: StackedEnvironment, direct: boolean, switches: (name: string) => boolean): InsertCategory | null {
	if (e.name === 'document' || e.in || e.body || e.item || switches(e.name)) return null;
	if (e.from !== KERNEL_ID && readsAsTheorem(e)) return 'theorems';
	if (!direct) return null;
	return e.float ? 'floats' : 'environments';
}

// amsmath's, written between the rows of an alignment, which the math editor holds; the data does not say so
const BETWEEN_ALIGNMENT_ROWS = new Set(['intertext', 'shortintertext']);

function readsAsTextStyle(c: StackedCommand): boolean {
	const mandatory = (c.args ?? []).filter((a) => MANDATORY.test(a.kind));
	const text = mandatory[0];
	const roles = text ? [text.role ?? []].flat() : [];
	return (
		c.offered &&
		!BETWEEN_ALIGNMENT_ROWS.has(c.name) &&
		/^[a-z]+$/.test(c.name) &&
		mandatory.length === 1 &&
		roles.includes('text') &&
		text.placeholder === 'text' &&
		!text.part &&
		c.in !== 'math' &&
		c.section == null &&
		!c.cite &&
		!c.declares &&
		!c.register &&
		!c.change &&
		c.prints == null
	);
}

function textStyleItem(c: StackedCommand, hint: string | undefined): InsertItem {
	return {
		id: `\\${c.name}`,
		label: c.name,
		icon: Type,
		category: 'textStyles',
		hint,
		shape: 'inline',
		source: (selected) => `\\${c.name}${(c.args ?? []).map((a) => (MANDATORY.test(a.kind) ? `{${selected ?? ''}}` : '')).join('')}`
	};
}

function capitalized(name: string): string {
	return name[0].toUpperCase() + name.slice(1);
}

function coreItems(): InsertItem[] {
	return [
		{
			id: 'standard',
			label: m.insert_style_standard(),
			icon: Pilcrow,
			category: 'mainText',
			shape: 'block',
			style: true,
			select: 'in',
			make: (s) => s.nodes.paragraph.create(),
			turn: chainCommands(liftListItem, setHeadingLevel(0)),
			turnIn: unwrapLoneEnvironment('environment'),
			is: (node) => node.type.name === 'paragraph'
		},
		{
			id: 'rawlatex',
			label: m.blockmenu_raw_latex(),
			icon: FileCode2,
			category: 'common',
			shape: 'block',
			style: false,
			select: 'node',
			make: (s) => s.nodes.raw_latex.createAndFill()
		}
	];
}

function ownAndLoaded(input: LatexInsertInput, ctx: LatexInsertContext, covered: Set<string>): InsertItem[] {
	const code = codeOnly(input.definitions);
	const heads = definedHeads(code);
	const items: InsertItem[] = [];
	for (const def of definitionsIn(code)) {
		if (def.kind !== 'environment' || covered.has(def.name)) continue;
		covered.add(def.name);
		const head = Object.hasOwn(heads, def.name) ? heads[def.name] : null;
		items.push(environmentItem(def.name, argumentSlots(def.args), head ? 'theorems' : 'environments', head?.text ?? def.name));
	}
	if (!input.loaded) return items;
	const commands = stackedCommands(input.loaded);
	function switches(name: string): boolean {
		return (commands.get(name)?.declares ?? commonFacts(name).declares) != null;
	}
	for (const e of ctx.environments()) {
		if (covered.has(e.name) || NEEDS_OWN_DECLARATION.has(e.name)) continue;
		const category = categoryOf(e, input.direct.has(e.from), switches);
		if (!category) continue;
		covered.add(e.name);
		const label = category === 'theorems' ? capitalized(e.name) : e.name;
		items.push(environmentItem(e.name, startingArguments(e), category, label, input.direct.has(e.from) ? ctx.hint(e) : undefined));
	}
	for (const c of stackedCommands(input.loaded).values()) {
		if (covered.has(`\\${c.name}`) || !input.direct.has(c.from) || c.from === KERNEL_ID || !readsAsTextStyle(c)) continue;
		if (commandPlugins(c.name).length) continue;
		items.push(textStyleItem(c, ctx.hint(c)));
	}
	return items;
}

function isDeck(ctx: LatexInsertContext): boolean {
	return ctx.environment('frame')?.args?.[0]?.kind === 'd<>';
}

export function latexInsertItems(input: LatexInsertInput): InsertItem[] {
	const ctx = contextOf(input.loaded);
	const offers: LatexInsertOffer[] = [...coreItems(), ...latexPlugins.flatMap((plugin) => plugin.insert?.(ctx) ?? [])];
	const covered = new Set([...offers.flatMap((offer) => offer.covers ?? []), ...environmentImports.keys(), ...verbatimImports.keys()]);
	const seen = new Set<string>();
	const deck = isDeck(ctx);
	const items = [...offers, ...ownAndLoaded(input, ctx, covered)].flatMap((item): InsertItem[] => {
		if (seen.has(item.id)) return [];
		seen.add(item.id);
		const { covers: _, ...own } = item as LatexInsertOffer;
		return [deck && own.category === 'frontMatter' ? { ...own, category: 'titling' } : own];
	});
	return inLyxOrder(onlyInStyleEnvironments(items, latexStyleEnvironment(items)));
}

const ALIGNMENT_ENVIRONMENTS = ['center', 'flushleft', 'flushright'];

export function latexStyleEnvironment(items: readonly InsertItem[]): (node: Node) => boolean {
	return styleEnvironmentOf(items, 'environment', ALIGNMENT_ENVIRONMENTS);
}
