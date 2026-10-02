// itemize/enumerate to flat-list nodes, one PM node per item macro
// mutually recursive with the walkers in converter.ts; ESM live bindings make the circular import safe
import type { Node, Macro, Environment } from '@unified-latex/unified-latex-types';
import { printRaw } from '@unified-latex/unified-latex-util-print-raw';
import { buildNode, type PmNode, type ConversionOptions } from '../builders';
import { convertNodesToBlocks } from '../converter';
import { isBlankCellNode } from './tableConvert';
import { capture, envArgsRawSource, startOf } from './origCapture';

export function createList(env: Environment, kind: 'bullet' | 'ordered', options: ConversionOptions): PmNode[] {
	const result: PmNode[] = [];
	let currentItemContent: Node[] = [];
	let foundFirstItem = false;

	// content before the first \item (usually whitespace, sometimes real setup like
	// \setlength\itemsep{0pt}) has nowhere to live in the one-list-node-per-item model; carry it
	// verbatim as the first emitted node's preBody rather than silently dropping it.
	const firstItemIndex = env.content.findIndex((n) => n.type === 'macro' && (n as Macro).content === 'item');
	const preItemContent = firstItemIndex > 0 ? env.content.slice(0, firstItemIndex) : [];
	const preBody = preItemContent.some((n) => !isBlankCellNode(n)) ? printRaw(preItemContent).trim() : null;
	// enumitem options ([resume], [label=(\alph*)], [noitemsep]) ride on the first node too
	const envArgs = env.args && env.args.length ? (envArgsRawSource(env) ?? printRaw(env.args)) : null;
	const envName = env.env === 'description' ? 'description' : null;
	// the raw [label] of the item being built, re-emitted as written (the bold text below is
	// only how the editor shows it)
	let itemLabel: string | null = null;
	function listAttrs(extra: Record<string, unknown> = {}) {
		return {
			kind,
			order: kind === 'ordered' ? 1 : null,
			checked: null,
			collapsed: false,
			preBody: result.length === 0 ? preBody : null,
			envArgs: result.length === 0 ? envArgs : null,
			envName,
			itemLabel,
			...extra
		};
	}

	for (const node of env.content) {
		if (node.type === 'macro' && (node as Macro).content === 'item') {
			if (foundFirstItem && currentItemContent.length > 0) {
				const itemBlocks = createListItem(currentItemContent, options);
				if (itemBlocks.length > 0) {
					result.push(buildNode('list', listAttrs(), itemBlocks));
				}
			}
			currentItemContent = [];
			foundFirstItem = true;
			itemLabel = null;

			const macro = node as Macro;
			if (macro.args && macro.args.length > 0) {
				// description label \item[Term] becomes bold text at the start. the synthetic
				// \textbf's arg must be brace-delimited: getMacroFirstArg only sees {...} args, so
				// reusing \item's optional [..] arg object as-is made the label invisible to
				// textbf's handler and silently dropped it.
				const optionalArg = macro.args.find((arg) => arg.openMark === '[');
				if (optionalArg) itemLabel = printRaw(optionalArg.content);
				if (optionalArg && optionalArg.content.length > 0) {
					// texpileItemLabel marks the run as the label AND bolds it (see macroHandlers):
					// the serializer needs to know which leading text is the label, and a text match
					// could not tell one apart from prose that happens to repeat it
					const syntheticLabel: Macro = {
						type: 'macro',
						content: 'texpileItemLabel',
						args: [{ type: 'argument', content: optionalArg.content, openMark: '{', closeMark: '}' }]
					};
					// the group stands where the label's bytes are, so the item's first block spans them: its
					// leaf runs do, and a block whose runs lie before it is not believed (see soundLeaves)
					const placed = optionalArg.content.filter((n) => n.position);
					const position =
						placed.length > 0 ? { start: placed[0].position!.start, end: placed[placed.length - 1].position!.end } : undefined;
					currentItemContent.push({ type: 'group', content: [syntheticLabel], ...(position ? { position } : {}) });
				}

				// the parser puts the item body in an argument with no delimiters
				for (const arg of macro.args) {
					if (arg.openMark === '' && arg.closeMark === '' && arg.content.length > 0) {
						currentItemContent.push(...(optionalArg ? bodyAfterLabel(optionalArg.content, arg.content) : arg.content));
					}
				}
			}
		} else if (foundFirstItem) {
			currentItemContent.push(node);
		}
	}

	if (foundFirstItem && currentItemContent.length > 0) {
		const itemBlocks = createListItem(currentItemContent, options);
		if (itemBlocks.length > 0) {
			result.push(buildNode('list', listAttrs(), itemBlocks));
		}
	}

	// at least one empty list, for valid structure
	if (result.length === 0) {
		result.push(buildNode('list', listAttrs(), [buildNode('paragraph')]));
	}

	return result;
}

/**
 * The parser puts a whitespace node between an item's `[label]` and its body whether or not the
 * file has any: with none, the body starts right after the bracket and the node goes; with some,
 * the node takes the bytes, so the space the editor shows is the file's and edits to it reach it
 */
function bodyAfterLabel(label: Node[], body: Node[]): Node[] {
	const first = body[0];
	const src = capture.rawSource;
	if (!src || first.type !== 'whitespace' || first.position) return body;
	let labelEnd = -1;
	for (const n of label) {
		const end = (n as { position?: { end?: { offset?: number } } }).position?.end?.offset;
		if (end != null) labelEnd = Math.max(labelEnd, end);
	}
	const close = labelEnd < 0 ? -1 : src.indexOf(']', labelEnd);
	const bodyStart = body
		.slice(1)
		.map(startOf)
		.find((at) => at != null);
	if (close < 0 || bodyStart == null || bodyStart < close + 1) return body;
	const gap = src.slice(close + 1, bodyStart);
	if (gap === '') return body.slice(1);
	if (!/^\s+$/.test(gap)) return body;
	return [
		{ ...first, position: { start: { offset: close + 1, line: 0, column: 0 }, end: { offset: bodyStart, line: 0, column: 0 } } } as Node,
		...body.slice(1)
	];
}

export function createListItem(content: Node[], options: ConversionOptions): PmNode[] {
	const filteredContent = content.filter((n, i, siblings) => {
		if (n.type !== 'whitespace' && n.type !== 'parbreak') return true;
		// keep whitespace only if between meaningful nodes
		const hasBefore = siblings.slice(0, i).some((x) => x.type !== 'whitespace' && x.type !== 'parbreak');
		const hasAfter = siblings.slice(i + 1).some((x) => x.type !== 'whitespace' && x.type !== 'parbreak');
		return hasBefore && hasAfter;
	});

	if (filteredContent.length === 0) {
		return [buildNode('paragraph')];
	}

	const blocks = convertNodesToBlocks(filteredContent, options);
	return blocks.length > 0 ? blocks : [buildNode('paragraph')];
}
