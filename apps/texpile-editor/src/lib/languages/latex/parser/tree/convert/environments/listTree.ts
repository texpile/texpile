// itemize, enumerate and description to list nodes, one per item
import { buildNode, createDefaultContext, type PmNode } from '../../../builders';
import { tableEnvFacts } from '../../../signatures/environmentFacts';
import { PieceCursor, type Piece } from '../../walk/pieceCursor';
import { argText, optionalArg } from '../../walk/treeArgs';
import { argumentsText, type TreeEnvironment } from '../../walk/treeEnvironment';
import type { Stretch } from '../../walk/stretch';
import { isBlankStretchOf } from '../tables/tableShapes';
import { rawBlockOf, sliceOf, type TreeImport } from '../treeImport';
import { commandName } from '../treeCalls';
import { inlineOf, readCallAt } from '../inlineTree';
import { blocksOf } from '../blocksTree';

/** the source environment its items came from, which they keep through edits: its kind and text, under the lists around it */
function listKey(im: TreeImport, env: TreeEnvironment, kind: string): string {
	const text = sliceOf(im, env);
	let hash = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
	const own = `${kind}.${(hash >>> 0).toString(36)}`;
	const around = im.lists[im.lists.length - 1];
	return around ? `${around}/${own}` : own;
}

type Item = { label: Stretch | null; labelText: string | null; from: number; body: Stretch };

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
		const call = readCallAt(im, cursor, p);
		const label = optionalArg(call);
		items.push({
			label: label?.body ?? null,
			labelText: label ? argText(im.src, label) : null,
			from: p.from,
			body: { parent: env.body.parent, from: call.to, to: env.body.to }
		});
	}
	return { pre: { ...env.body, to: preTo }, items };
}

function itemBlocks(im: TreeImport, item: Item): PmNode[] {
	if (!item.label || item.label.to <= item.label.from) return blocksOf(im, item.body);
	// the label reads as bold text, and the mark still says which text it is; math has no text to carry it, so wears it
	const nodes = inlineOf(im, item.label, { ...createDefaultContext(), marks: [{ type: 'strong' }, { type: 'item_label' }] }).map((n) =>
		n.type.name === 'inline_math' ? n.mark(n.type.schema.marks.item_label.create().addToSet(n.marks)) : n
	);
	return blocksOf(im, item.body, { nodes, span: item.label });
}

export function listBlocks(im: TreeImport, env: TreeEnvironment, kind: 'bullet' | 'ordered'): PmNode[] {
	const itemCommands = tableEnvFacts(im.readings.table, env.name).item;
	if (!itemCommands) return [rawBlockOf(im, env)];
	const envKey = listKey(im, env, kind);
	im.lists.push(envKey);
	try {
		const { pre, items } = itemsOf(im, env, itemCommands);
		// items made by a command of the document's own (\hustitem calling \item) are no items the editor sees
		if (!items.length && !isBlankStretchOf(im, pre)) return [rawBlockOf(im, env)];
		// setup before the first item (\setlength\itemsep{0pt}) rides on every item, as do the enumitem options
		const preBody = items.length && !isBlankStretchOf(im, pre) ? sliceOf(im, pre).trim() : null;
		const envArgs = env.args.length ? argumentsText(im.src, env) : null;
		function attrs(itemLabel: string | null) {
			return {
				kind,
				order: kind === 'ordered' ? 1 : null,
				checked: null,
				collapsed: false,
				preBody,
				envArgs,
				envName: env.name === 'description' ? 'description' : null,
				envKey,
				itemLabel
			};
		}
		const result = items.map((item) => buildNode('list', attrs(item.labelText), itemBlocks(im, item)));
		return result.length ? result : [buildNode('list', attrs(null), [buildNode('paragraph')])];
	} finally {
		im.lists.pop();
	}
}
