// Deterministic ProseMirror -> Markdown serializer: the latexSerializer's sibling dialect.
// String-returning handlers per node type over the shared Ctx contract; doc assembly (verbatim
// substitution + per-block memo) delegated to blockAssembly. prosemirror-markdown's
// serializer can't drive prosemirror-flat-list (it walks nested list NODES; flat-list is one
// node per item), so list/emphasis logic lives here; escaping follows prosemirror-markdown's
// rules. Convention: every block handler ends with its own separation ('\n\n', lists '\n'
// mid-run), so plain concatenation of parts is a valid document.
import type { Node } from 'prosemirror-model';
import { createBlockAssembly, type DocSerializeResult } from '$lib/serializer/blockAssembly';
import type { ParseOrigins } from '$lib/editor/visual/parseOrigins';
import type { Ctx } from '$lib/serializer/types';
import { escMd } from './inlineSyntax';
import { imageMarkdown, renderInline, mdShadow, isMdHandlerLeaf } from './markdownInline';
import { listFamily, listMarker, sameList } from './listAttrs';

function indentAfterFirstLine(text: string, indent: string): string {
	return text
		.split('\n')
		.map((l, i) => (i === 0 || l === '' ? l : indent + l))
		.join('\n');
}

function nextSibling(ctx: Ctx): Node | null {
	return ctx.parent && ctx.index < ctx.parent.childCount - 1 ? ctx.parent.child(ctx.index + 1) : null;
}

/** children serialized and concatenated (handlers carry their own separators), tail trimmed. */
function renderBlocks(parent: Node, inTableCell = false): string {
	let out = '';
	parent.forEach((child, _offset, i) => {
		out += serializeMdNode(child, { parent, index: i, isLastChild: i === parent.childCount - 1, inTableCell });
	});
	return out.replace(/\n+$/, '');
}

function isEmptyParagraph(node: Node): boolean {
	if (node.type.name !== 'paragraph') return false;
	let empty = true;
	node.forEach((c) => {
		if (c.isText) {
			if (c.marks.some((m) => m.type.name === 'code') ? c.text : c.text?.trim()) empty = false;
		} else if (c.type.name !== 'hard_break') empty = false;
	});
	return empty;
}

function tableRows(node: Node): { header: string[] | null; body: string[][]; cols: number } {
	const rows: { cells: string[]; isHeader: boolean }[] = [];
	node.forEach((row) => {
		if (row.type.name !== 'table_row') return;
		const cells: string[] = [];
		let isHeader = row.childCount > 0;
		row.forEach((cell) => {
			if (cell.type.name !== 'table_header') isHeader = false;
			const parts: string[] = [];
			cell.forEach((p) => parts.push(renderInline(p, { inTableCell: true })));
			cells.push(
				parts
					.map((p) => p.trim())
					.filter(Boolean)
					.join('<br>')
			);
			// a colspan'd cell still occupies its extra columns in the pipe grid
			for (let s = 1; s < Number(cell.attrs.colspan ?? 1); s++) cells.push('');
		});
		rows.push({ cells, isHeader });
	});
	const cols = Math.max(1, ...rows.map((r) => r.cells.length));
	const header = rows.length > 0 && rows[0].isHeader ? rows[0].cells : null;
	const body = (header ? rows.slice(1) : rows).map((r) => r.cells);
	return { header, body, cols };
}

function pipeTable(node: Node): string {
	const { header, body, cols } = tableRows(node);
	function pad(cells: string[]) {
		const c = [...cells];
		while (c.length < cols) c.push('');
		return `| ${c.join(' | ')} |`;
	}
	// alignment survives in colspec (parse-time delimiter row); default plain dashes
	const spec = typeof node.attrs.colspec === 'string' && node.attrs.colspec ? node.attrs.colspec.split('|') : [];
	const delims: string[] = [];
	for (let i = 0; i < cols; i++) delims.push(spec[i] || '---');
	const lines = [pad(header ?? Array(cols).fill('')), `| ${delims.join(' | ')} |`, ...body.map(pad)];
	return lines.join('\n') + '\n\n';
}

const INTERRUPTS = new Set(['list', 'code_block', 'blockquote', 'heading', 'table', 'block_math']);

/** whether `next` may sit right under a paragraph line without becoming part of it */
function canInterrupt(next: Node): boolean {
	if (!INTERRUPTS.has(next.type.name)) return false;
	if (next.type.name !== 'list') return true;
	// an empty item or an ordered list not starting at 1 does not interrupt a paragraph
	return next.textContent.trim() !== '' && (listFamily(next) !== 'ordered' || Number(next.attrs.order ?? 1) === 1);
}

/** an item's blocks; in a tight list a sub-list sits right under the item text, since a blank
 *  line there would make the whole list loose */
function renderItemBody(item: Node): string {
	const loose = !!item.attrs.loose;
	let out = '';
	item.forEach((child, _offset, i) => {
		let part = serializeMdNode(child, { parent: item, index: i, isLastChild: i === item.childCount - 1, inTableCell: false });
		const next = i + 1 < item.childCount ? item.child(i + 1) : null;
		if (!loose && next && child.type.name === 'paragraph' && canInterrupt(next)) part = part.replace(/\n+$/, '\n');
		out += part;
	});
	return out.replace(/\n+$/, '');
}

/** the item's number: the run's start plus how many items of the same list precede it */
function itemNumber(node: Node, ctx: Ctx): number {
	let first = node;
	let distance = 0;
	if (ctx.parent) {
		for (let i = ctx.index - 1; i >= 0; i--) {
			const prev = ctx.parent.child(i);
			if (!sameList(prev, first)) break;
			first = prev;
			distance++;
		}
	}
	return Number(first.attrs.order ?? 1) + distance;
}

type NodeHandler = (node: Node, ctx: Ctx) => string;

const NODES: Record<string, NodeHandler> = {
	paragraph(node, ctx) {
		if (isEmptyParagraph(node)) return ''; // blank lines are semantic no-ops, as on the LaTeX side
		return renderInline(node, { startOfLine: true, inTableCell: ctx.inTableCell }) + '\n\n';
	},

	heading(node) {
		if (node.childCount === 0) return '';
		const level = Math.min(6, Math.max(1, Number(node.attrs.level ?? 1)));
		// a trailing `#` run after a space is a closing sequence to the parser
		const text = renderInline(node, { singleLine: true })
			.replace(/\s+$/, '')
			.replace(/(^|\s)(#+)$/, '$1\\$2');
		return `${'#'.repeat(level)} ${text}\n\n`;
	},

	blockquote(node) {
		const inner = renderBlocks(node);
		return (
			inner
				.split('\n')
				.map((l) => (l ? '> ' + l : '>'))
				.join('\n') + '\n\n'
		);
	},

	horizontal_rule: () => '---\n\n',

	code_block(node) {
		const infoString = String(node.attrs.args ?? '')
			.trim()
			.replace(/\n/g, ' ');
		const content = node.textContent;
		// a backtick in the info string is only legal on a tilde fence
		const ch = infoString.includes('`') ? '~' : '`';
		const runs = content.match(ch === '~' ? /~{3,}/g : /`{3,}/g);
		const fence = ch.repeat(runs ? Math.max(3, ...runs.map((r) => r.length)) + 1 : 3);
		return `${fence}${infoString}\n${content}\n${fence}\n\n`;
	},

	// raw source blocks (html in a markdown doc, latex via cross-dialect paste): verbatim
	raw_latex: (node) => (node.textContent ? node.textContent + '\n\n' : ''),

	block_math(node) {
		// display math cannot span a blank line, in TeX or in the block rule
		const tex = node.textContent.trim().replace(/\n{2,}/g, '\n');
		return tex ? `$$\n${tex}\n$$\n\n` : '$$\n$$\n\n';
	},

	image: (node) => imageMarkdown(node) + '\n\n',

	includedoc: (node) => `\\${String(node.attrs.command ?? 'input')}{${String(node.attrs.path ?? '')}}\n\n`,

	abstract: (node) => renderBlocks(node) + '\n\n',
	environment: (node) => renderBlocks(node) + '\n\n',

	list(node, ctx) {
		const marker = listMarker(node);
		const head = listFamily(node) === 'ordered' ? `${itemNumber(node, ctx)}${marker} ` : `${marker} `;
		// a task box is read off the item's first words: one opening with a nested list has none to tick
		const box = node.attrs.kind === 'task' && node.firstChild?.isTextblock ? `[${node.attrs.checked ? 'x' : ' '}] ` : '';
		// continuation lines align under the content, after the marker
		const body = indentAfterFirstLine(renderItemBody(node), ' '.repeat(head.length));
		const next = nextSibling(ctx);
		const sep = next && sameList(node, next) ? (node.attrs.loose ? '\n\n' : '\n') : '\n\n';
		return (head + box + body).replace(/ +$/, '') + sep;
	},

	table: (node) => pipeTable(node),

	table_wrapper(node) {
		let table = '';
		let caption = '';
		let notes = '';
		node.forEach((child) => {
			if (child.type.name === 'table') table = pipeTable(child);
			else if (child.type.name === 'table_caption') caption = renderInline(child, { singleLine: true }).trim();
			else if (child.type.name === 'table_notes') notes = renderInline(child, { singleLine: true }).trim();
		});
		let out = table.replace(/\n+$/, '\n');
		if (caption) out += `\n*${caption}*\n`;
		if (notes && node.attrs.showNotes) out += `\n${notes}\n`;
		return out + '\n';
	}
};

/** Serialize one node to Markdown. Unknown types preserve their content rather than dropping it. */
export function serializeMdNode(node: Node, ctx: Ctx): string {
	const handler = NODES[node.type.name];
	if (handler) {
		const out = handler(node, ctx);
		return isMdHandlerLeaf(node) ? mdShadow.shadowed(node, out) : out;
	}
	if (node.isText) return escMd(node.text ?? '');
	if (node.isInline) {
		// inline strays (should have come through renderInline) degrade to leafText/plain text
		const leafText = node.type.spec.leafText;
		return leafText ? leafText(node) : node.textContent;
	}
	const inner = renderBlocks(node, ctx.inTableCell);
	return inner ? inner + '\n\n' : '';
}

/** the inline children of a paragraph as one run, and how the paragraph writes it */
/** what continues a child's lines inside its container: the prefix the file gave its second line,
 *  else the width of what stood before its first (a marker becomes spaces, a quote's `>` stays) */
function continuation(_parent: Node, text: string, head: string): string {
	const nl = text.indexOf('\n');
	if (nl < 0) return head.replace(/[^>]/g, ' ');
	const prefix = /^[ \t]*(?:>[ \t]*)*/.exec(text.slice(nl + 1))![0];
	// a quote's second line carries the quote's own marker after its container's: the container's
	// part is what continues the quote's lines, the quote writes its own
	return text.startsWith('>') ? prefix.replace(/>[ \t]*$/, '') : prefix;
}

// a character markdown cannot read as part of anything beside it
const PLAIN_SEAM = /^[\p{L}\p{N} .,;?'"]$/u;

// Markdown is kept at block granularity: an untouched block, at the top level or inside a list
// item or a quote, is the file's bytes; a block that changed in anything but plain text is written
// whole. A paragraph written whole respells what the file wrote its own way (a reference link, an
// entity, _emphasis_), so plain text retyped is patched in place, but only between plain
// characters: a seam beside a delimiter, an escape or a line start is where Markdown's loose
// grammar reads two things as one
const assembly = createBlockAssembly((node, ctx) => serializeMdNode(node, ctx), {
	mapLeaves: (node, ctx, text) => mdShadow.mapBlockLeaves(serializeMdNode, node, ctx, text),
	leafBytes: (leaf, parent, atStart, block, ctx) =>
		leaf.marks.length || parent !== block || ctx?.inTableCell || parent.type.spec.code ? null : escMd(leaf.text ?? '', atStart),
	keepApart: (bytes, tail, head) => {
		const word = /\S*$/.exec(head)![0] + bytes + /^\S*/.exec(tail)![0];
		// a line start, where digits can still become a list's number
		if (/(^|\n)[ \t>]*\d*$/.test(head) || /[:/@&<]|www\./i.test(word)) return null;
		const last = (bytes || head).slice(-1);
		const sides = [head.slice(-1), bytes.slice(0, 1), bytes.slice(-1)].filter(Boolean);
		if (!sides.every((c) => PLAIN_SEAM.test(c))) return null;
		// spaces before a line end are a line break
		if (tail.startsWith('\n')) return /\s/.test(last) ? null : bytes;
		return tail === '' || PLAIN_SEAM.test(tail[0]) ? bytes : null;
	},
	// a task item's box is written with its marker, from the item's attrs: the first block of the
	// item cannot be rendered on its own inside the item's frame, whose bytes hold the box
	spliceChild: (parent, index) => !(parent.type.name === 'list' && index === 0 && parent.attrs.kind === 'task'),
	continuation
});

export function serializeToMarkdown(doc: Node): string {
	return assembly.serializeDocChildrenDetailed(doc).text;
}

export function serializeToMarkdownDetailed(doc: Node, parse?: ParseOrigins | null, afresh?: ReadonlySet<Node>): DocSerializeResult {
	return assembly.serializeDocChildrenDetailed(doc, parse, afresh);
}
