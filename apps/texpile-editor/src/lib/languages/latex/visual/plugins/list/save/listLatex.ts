// a run of list nodes back to its environment, each node one \item
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

// prosemirror-flat-list: each `list` node is ONE item; same-kind siblings coalesce.
export function listLatex(node: Node, ctx: Ctx, core: LatexSaveCore): string {
	const kind = String(node.attrs.kind ?? 'bullet');
	const defaultEnv = kind === 'ordered' ? 'enumerate' : 'itemize';
	// a description environment is remembered on the run's first node; the rest inherit it. A
	// node naming an environment of its own opens a new run: a description after an itemize
	// is not its continuation, whatever the kinds say
	const envName = runEnvName(node, ctx);
	const env = envName ?? defaultEnv;
	const keyedCommand = runItemCommand(node, ctx);
	const prevSame = !!ctx.parent && continuesList(ctx.parent, ctx.index);
	const nextSame = !!ctx.parent && !!nextOf(ctx) && continuesList(ctx.parent, ctx.index + 1);
	// \item[label]: the editor shows it as leading bold text, so it is taken back out of the
	// body before the bracket is rewritten. The SOURCE label is preferred while the run still
	// says the same thing, since re-serializing turns a tie into a no-break space and a `--`
	// into a dash; once the run says something else, the user edited the label and that wins
	const itemLabel = typeof node.attrs.itemLabel === 'string' ? node.attrs.itemLabel : null;
	// the block carrying the label: the first, unless a line break at its start left empty
	// paragraphs in front of it, which \item writes as nothing. Read with the shadow off: the label
	// is compared with the source's by its words
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
	// written through the shadow when that writes the same bytes, so a run can tell where the label's words went
	const label = labelled && said === labelled.latex ? core.children(labelled.bare, false).trim() : said;
	// a `]` in the label would close the bracket early: braces around it keep it inside
	const bracketed = said != null && said.includes(']') && !/^\{[^]*\}$/.test(said) ? `{${label}}` : label;
	const itemCmd = keyedCommand ? keyedItemCommand(keyedCommand, node) : itemCommand(node.attrs.overlay, bracketed);

	// an item's untouched blocks are written out as their bytes; the labelled first block is shown
	// without its label, so it is always rendered afresh
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
			// only the FIRST of a run of same-kind sub-lists opens \item[]; the rest coalesce
			// into the same nested env (prevSame means no \begin), and another \item[] would
			// re-parse as an extra empty item and double every save.
			const prevChild = i > 0 ? node.child(i - 1) : null;
			const continues = prevChild?.type.name === 'list' && prevChild.attrs.kind === item.attrs.kind;
			// a sub-list under the item's OWN body needs no \item[]: that item is already open, and
			// the break the nested env opens with would put a blank line between the two
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
		// enumitem-style options the source gave the environment; see createList
		const envArgs = own && typeof opener.attrs.envArgs === 'string' ? opener.attrs.envArgs : '';
		out += `\n\\begin{${env}}${envArgs}\n`;
		// raw setup content that preceded the first \item in the source; see createList
		const preBody = own && typeof opener.attrs.preBody === 'string' ? opener.attrs.preBody : '';
		if (preBody) out += preBody + '\n';
	}
	out += parts.join('');
	// an item body already ends its line, so a break of our own would open a blank one above \end
	if (!nextSame) out += `${out.endsWith('\n') ? '' : '\n'}\\end{${env}}\n`;
	return out;
}
