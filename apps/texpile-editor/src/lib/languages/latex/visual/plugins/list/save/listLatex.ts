import type { Node } from 'prosemirror-model';
import {
	continuesList,
	guardItemBody,
	isEmptyParagraph,
	itemCommand,
	keyedItemCommand,
	labelKey,
	opensItsSourceList,
	runEnvName,
	runItemCommand,
	runOptionsNode,
	withoutShadow,
	type Ctx,
	type LatexSaveCore
} from '$lib/languages/latex/visual/core/document';

function nextOf(ctx: Ctx): Node | null {
	return ctx.parent && ctx.index < ctx.parent.childCount - 1 ? ctx.parent.child(ctx.index + 1) : null;
}

export function listLatex(node: Node, ctx: Ctx, core: LatexSaveCore): string {
	const kind = String(node.attrs.kind ?? 'bullet');
	const defaultEnv = kind === 'ordered' ? 'enumerate' : 'itemize';
	// a node naming an environment of its own opens a new run, whatever the kinds say
	const envName = runEnvName(node, ctx);
	const env = envName ?? defaultEnv;
	const keyedCommand = runItemCommand(node, ctx);
	const prevSame = !!ctx.parent && continuesList(ctx.parent, ctx.index);
	const nextSame = !!ctx.parent && !!nextOf(ctx) && continuesList(ctx.parent, ctx.index + 1);
	const itemLabel = typeof node.attrs.itemLabel === 'string' ? node.attrs.itemLabel : null;
	let first = 0;
	const labelled = keyedCommand
		? null
		: withoutShadow(() => {
				while (first < node.childCount - 1 && isEmptyParagraph(node.child(first)) && core.itemLabel(node.child(first + 1)) !== null)
					first++;
				return node.childCount > 0 ? core.itemLabel(node.child(first)) : null;
			});
	const sourceHolds = itemLabel != null && labelled != null && labelKey(labelled.latex) === labelKey(itemLabel);
	const said = labelled ? (sourceHolds ? itemLabel : labelled.latex) : itemLabel === '' ? '' : null;
	const label = labelled && said === labelled.latex ? core.children(labelled.bare, false).trim() : said;
	// a `]` in the label would close the bracket early: braces around it keep it inside
	const bracketed = said != null && said.includes(']') && !/^\{[^]*\}$/.test(said) ? `{${label}}` : label;
	const itemCmd = keyedCommand ? keyedItemCommand(keyedCommand, node) : itemCommand(node.attrs.overlay, bracketed);

	const inners: string[] = [];
	node.forEach((item, _offset, i) => {
		const shown = i === first && labelled ? labelled.body : item;
		inners.push(core.node(shown, { parent: node, index: i, isLastChild: i === node.childCount - 1, inTableCell: ctx.inTableCell }));
	});
	const rendered = core.verbatimParts(node, inners, { join: false, keep: (i) => i === first && !!labelled });
	const parts: string[] = [];
	node.forEach((item, _offset, i) => {
		const inner = rendered[i];
		if (i < first) return;
		if (item.type.name === 'list') {
			// only the first of a run of same-kind sub-lists opens \item[], or every save adds an empty item
			const prevChild = i > 0 ? node.child(i - 1) : null;
			const continues = prevChild?.type.name === 'list' && prevChild.attrs.kind === item.attrs.kind;
			const afterBody = !!prevChild && prevChild.type.name !== 'list';
			// the part before already ends its line, so a break of our own would be a blank line between items
			const lineEnded = parts.length === 0 || parts[parts.length - 1].endsWith('\n');
			parts.push(continues ? (lineEnded ? inner : `\n${inner}`) : afterBody ? inner.replace(/^\n/, '') : `\\item[] ${inner}`);
		} else if (i === first) {
			const alone = labelled && !inner.trim() && node.childCount > first + 1 && node.child(first + 1).type.name !== 'list';
			// a comment on the \item's own line would read back as part of it
			const gap = labelled?.glued ? '' : inner.startsWith('%') ? '\n' : ' ';
			parts.push(alone ? `${itemCmd} \\par` : `${itemCmd}${gap}${guardItemBody(inner)}`);
		} else parts.push('\n' + inner); // continuation block within the same item
	});

	let out = '';
	if (!prevSame) {
		const opener = runOptionsNode(node, ctx);
		const own = opensItsSourceList(opener, ctx.parent);
		const envArgs = own && typeof opener.attrs.envArgs === 'string' ? opener.attrs.envArgs : '';
		out += `\n\\begin{${env}}${envArgs}\n`;
		const preBody = own && typeof opener.attrs.preBody === 'string' ? opener.attrs.preBody : '';
		if (preBody) out += preBody + '\n';
	}
	out += parts.join('');
	// an item body already ends its line, so a break of our own would open a blank one above \end
	if (!nextSame) out += `${out.endsWith('\n') ? '' : '\n'}\\end{${env}}\n`;
	return out;
}
