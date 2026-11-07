import {
	PieceCursor,
	argText,
	argumentsText,
	commandName,
	createDefaultContext,
	mandatoryArgs,
	optionalArg,
	sliceOf,
	tableEnvFacts,
	type PackageTable,
	type Piece,
	type PmNode,
	type Stretch,
	type TreeEnvironment,
	type TreeImport
} from '$lib/languages/latex/visual/core/document';
import { rolesOf } from '$lib/languages/latex/knowledge/calls/commandCalls';

function listKey(im: TreeImport, env: TreeEnvironment, kind: string): string {
	const text = sliceOf(im, env);
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
	const own = `${kind}.${(hash >>> 0).toString(36)}`;
	const around = im.lists[im.lists.length - 1];
	return around ? `${around}/${own}` : own;
}

type Item = {
	command: string;
	label: Stretch | null;
	labelText: string | null;
	key: string | null;
	overlay: string | null;
	from: number;
	body: Stretch;
};

export function readsAsItems(table: PackageTable, itemCommands: string[]): boolean {
	return itemCommands.every((name) => {
		const shape = table.macros[name]?.map((a) => a.kind).join(' ');
		return shape === 'o' || shape === 'o m';
	});
}

const entryCommandsOf = new WeakMap<PackageTable, string[]>();

function entryCommands(table: PackageTable, own: string[]): string[] {
	let shared = entryCommandsOf.get(table);
	if (!shared) {
		const keyed = Object.values(table.bodies).flatMap((facts) => facts.item ?? []);
		shared = [
			...(tableEnvFacts(table, 'list').item ?? []),
			...keyed.filter((name) => table.macros[name]?.some((a) => rolesOf(a).includes('citekey')) && readsAsItems(table, [name]))
		];
		entryCommandsOf.set(table, shared);
	}
	return [...new Set([...own, ...shared])];
}

function itemsOf(im: TreeImport, env: TreeEnvironment, itemCommands: string[]): { pre: Stretch; items: Item[] } {
	const cursor = new PieceCursor(im.src, env.body);
	const items: Item[] = [];
	let preTo = env.body.to;
	function isItem(p: Piece): boolean {
		return p.kind === 'node' && p.node.name === 'ControlWord' && itemCommands.includes(commandName(im, p));
	}
	for (let p = cursor.next(); p; p = cursor.next()) {
		if (!isItem(p)) continue;
		if (!items.length) preTo = p.from;
		else items[items.length - 1].body.to = p.from;
		const call = im.core.readCall(cursor, p);
		const label = optionalArg(call);
		const overlay = call.args.find((a) => a.present && a.kind === 'd<>');
		const key = mandatoryArgs(call)[0];
		items.push({
			command: call.name,
			label: label?.body ?? null,
			labelText: label ? argText(im.src, label) : null,
			key: key ? argText(im.src, key) : null,
			overlay: overlay ? sliceOf(im, overlay) : null,
			from: p.from,
			body: { parent: env.body.parent, from: call.to, to: env.body.to }
		});
	}
	return { pre: { ...env.body, to: preTo }, items };
}

function itemBlocks(im: TreeImport, item: Item): PmNode[] {
	if (item.key !== null || !item.label || item.label.to <= item.label.from) return im.core.blocks(item.body);
	const nodes = im.core
		.inline(item.label, { ...createDefaultContext(), marks: [{ type: 'strong' }, { type: 'item_label' }] })
		.map((n) => (n.type.name === 'inline_math' ? n.mark(n.type.schema.marks.item_label.create().addToSet(n.marks)) : n));
	return im.core.blocks(item.body, { nodes, span: item.label });
}

export function listBlocks(im: TreeImport, env: TreeEnvironment, kind: 'bullet' | 'ordered'): PmNode[] {
	const itemCommands = tableEnvFacts(im.readings.table, env.name).item;
	if (!itemCommands) return [im.core.raw(env)];
	const envKey = listKey(im, env, kind);
	im.lists.push(envKey);
	try {
		const { pre, items } = itemsOf(im, env, entryCommands(im.readings.table, itemCommands));
		// items made by a command of the document's own (\hustitem calling \item) are no items the editor sees
		if (!items.length && !im.core.isBlankStretch(pre)) return [im.core.raw(env)];
		// setup before the first item (\setlength\itemsep{0pt}) rides on every item, as do the enumitem options
		const preBody = items.length && !im.core.isBlankStretch(pre) ? sliceOf(im, pre).trim() : null;
		const envArgs = env.args.length ? argumentsText(im.src, env) : null;
		function attrs(itemLabel: string | null, item?: Item) {
			return {
				kind,
				order: kind === 'ordered' ? 1 : null,
				checked: null,
				collapsed: false,
				preBody,
				envArgs,
				envName: kind === 'bullet' && env.name !== 'itemize' ? env.name : null,
				envKey,
				itemLabel,
				overlay: item?.overlay ?? null,
				itemCmd: item && item.command !== 'item' ? item.command : null,
				itemKey: item?.key ?? null
			};
		}
		const result = items.map((item) => im.core.node('list', attrs(item.labelText, item), itemBlocks(im, item)));
		return result.length ? result : [im.core.node('list', attrs(null), [im.core.node('paragraph')])];
	} finally {
		im.lists.pop();
	}
}
