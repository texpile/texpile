// tabular/table environments to PM table nodes: components, spans, rules, placeholder cells
// mutually recursive with the walkers in converter.ts; ESM live bindings make the circular import safe
import type { Node, Macro, Environment } from '@unified-latex/unified-latex-types';
import { printRaw } from '@unified-latex/unified-latex-util-print-raw';
import { getTextContent, getMacroFirstArg } from '../ast-utils';
import {
	buildNode,
	nodeToLatexString,
	createDefaultContext,
	type PmNode,
	type ConversionContext,
	type ConversionOptions
} from '../builders';
import { SCOPED_SWITCHES, FONT_SIZE_SWITCHES } from '../macros';
import { convertNodesToBlocks } from '../converter';
import { convertNodesToInline } from './inlineConvert';
import { macroHasStar } from './macroHandlers';
import { extentOf, nodeExtent, nodeRawSource, nodeRawSpan, rawTextNode, repairExtentTail, startOf } from './origCapture';
import { blockSpanOf, noteBlockSpan, type BlockSpan } from '$lib/editor/visual/sourceSpans';

/** the bytes `nodes` cover, or null when they are not placed in the source */
function spanOfNodes(nodes: Node[]): BlockSpan | null {
	let min = Infinity;
	let max = -Infinity;
	for (const n of nodes) {
		const e = extentOf(n, 0);
		if (Number.isFinite(e.min) && e.min < min) min = e.min;
		if (Number.isFinite(e.max) && e.max > max) max = e.max;
		// an attached argument's closer has no positioned node of its own
		const own = (n as Macro).args?.length ? repairExtentTail(n, nodeExtent(n, 0)) : null;
		if (own && Number.isFinite(own.max) && own.max > max) max = own.max;
	}
	return Number.isFinite(min) && Number.isFinite(max) && min < max ? { srcFrom: min, srcTo: max, size: 1 } : null;
}

/** `nodes` without the blank ones at either edge */
function trimBlank(nodes: Node[]): Node[] {
	let start = 0;
	let end = nodes.length;
	while (start < end && isBlankCellNode(nodes[start])) start++;
	while (end > start && isBlankCellNode(nodes[end - 1])) end--;
	return nodes.slice(start, end);
}

function extractTableComponents(content: Node[], ctx: ConversionContext) {
	let caption: PmNode | null = null;
	// collect ALL labels: the last stays primary (single-label case unchanged, and reference-
	// manager UI reads `label` as one bare id), earlier ones round-trip via extraLabels.
	// overwriting on each occurrence silently dropped every label but the last.
	const labels: string[] = [];
	const tables: PmNode[] = [];
	const notes: PmNode[] = [];

	// preNodes (setup like \setlength{\tabcolsep}{4pt} that must precede the tabular) round-trip
	// as a raw prefix (preBody); noteNodes (after the tabular) become editable table_notes.
	const preNodes: Node[] = [];
	let noteNodes: Node[] = [];
	let sawTabular = false;
	// the wrapper serializer emits \centering, the caption and the notes size itself; what the
	// source actually had is remembered so it does not gain a \centering, move its caption above
	// the tabular, or swap \footnotesize for \small
	// a \begin{center} wrapper (unwrapped below) is centering too
	let centering = content.some((n) => n.type === 'environment' && (n as Environment).env === 'center' && containsTabular([n]));
	let captionBelow = false;
	let notesSize: string | null = null;

	// see through the wrappers papers put around the tabular - \begin{center} instead of
	// \centering, and {\small ...} groups scoping a size switch (BERT-era arXiv especially).
	// either parked the whole float on the generic-environment path: no caption chrome, no
	// scroll container. nothing is lost unwrapping: the wrapper serializer re-emits \centering,
	// and an unwrapped size switch lands in preBody, where the float's own group bounds it just
	// as the braces did. only wrappers that actually hold the tabular unwrap; a macro ARG holding
	// one (\resizebox{...}{tabular}) is untouched, since containsTabular never enters args.
	for (const node of flattenTabularWrappers(content)) {
		if (node.type === 'macro' && node.content === 'caption') {
			const arg = getMacroFirstArg(node as Macro);
			const captionText = convertNodesToInline(arg, ctx);
			const optArg = (node as Macro).args?.find((a) => a.openMark === '[');
			const built = buildNode(
				'table_caption',
				{ starred: macroHasStar(node as Macro), captionOpt: optArg ? printRaw(optArg.content) : null },
				captionText
			);
			// the caption's bytes are the words inside the braces: \caption{ and } are the float's frame.
			// one below the tabular comes after it in the file but before it in the wrapper, and placing
			// it would leave the tabular unplaced; it rides along in the frame instead
			caption = sawTabular ? built : noteBlockSpan(built, spanOfNodes(arg));
			captionBelow = sawTabular;
		} else if (node.type === 'macro' && node.content === 'label') {
			const text = getTextContent(getMacroFirstArg(node as Macro));
			if (text) labels.push(text);
		} else if (
			node.type === 'environment' &&
			(node.env === 'tabular' || node.env === 'tabular*' || node.env === 'tabularx' || node.env === 'longtable')
		) {
			// tabular* included: createTable already reads its width arg, and leaving it out sent
			// the whole float down the generic path with the caption collapsing to a raw chip
			sawTabular = true;
			const made = createTable(node as Environment);
			if (made.length === 1) noteBlockSpan(made[0], spanOfNodes([node]));
			tables.push(...made);
		} else {
			// whitespace BEFORE the tabular is just separation (preBody re-joins with spaces);
			// whitespace AFTER is preserved (word spacing in notes prose matters).
			if (node.type === 'parbreak' || (node.type === 'whitespace' && !sawTabular)) continue;
			if (node.type === 'macro' && node.content === 'centering') {
				centering = true;
				continue;
			}
			if (node.type === 'macro' && (node.content === 'vspace' || node.content === 'raggedright')) continue;
			// the notes wrapper emits its own \par\smallskip; a skip leading the notes would compound
			if (
				sawTabular &&
				noteNodes.every(isBlankCellNode) &&
				node.type === 'macro' &&
				/^(par|(small|med|big)skip)$/.test(String(node.content))
			)
				continue;
			// the notes serializer emits its own {\<size> ...}, so a size switch in the NOTES
			// position is redundant and compounds each save: strip a bare one, unwrap a group led
			// by one, remembering which size it was. must stay scoped to sawTabular: a switch
			// BEFORE the tabular (\scriptsize to shrink an oversized table) has nothing to do with
			// the notes wrapper and must survive.
			if (sawTabular && node.type === 'macro' && FONT_SIZE_SWITCHES.has((node as Macro).content)) {
				notesSize = (node as Macro).content;
				continue;
			}
			if (sawTabular && node.type === 'group') {
				const gcontent: Node[] = node.content || [];
				const firstMeaningful = gcontent.find((n) => !(n.type === 'whitespace' || n.type === 'parbreak' || n.type === 'comment'));
				if (firstMeaningful && firstMeaningful.type === 'macro' && FONT_SIZE_SWITCHES.has((firstMeaningful as Macro).content)) {
					notesSize = (firstMeaningful as Macro).content;
					noteNodes.push(...gcontent.filter((n) => n !== firstMeaningful));
					continue;
				}
				// a group led by a skip is a spacer, not notes: raw, braces and all (postBody below)
				if (firstMeaningful && firstMeaningful.type === 'macro' && /^[vh]skip$/.test(String((firstMeaningful as Macro).content))) {
					noteNodes.push(node);
					continue;
				}
			}

			(sawTabular ? noteNodes : preNodes).push(node);
		}
	}

	// preBody is plumbing, not prose the user edits: round-trip raw (byte-sliced when possible)
	const preBody = preNodes.length > 0 ? joinRaw(preNodes) : null;

	// trim whitespace-only edges before deciding notes exist, or the near-universal newline
	// between \end{tabular} and \end{table} earns every table a spurious empty {\small } wrapper
	// (visible extra vertical space).
	while (noteNodes.length && noteNodes[0].type === 'whitespace') noteNodes.shift();
	while (noteNodes.length && noteNodes[noteNodes.length - 1].type === 'whitespace') noteNodes.pop();

	// a \vskip/\hskip or scoped switch after the tabular is setup, not prose, but the notes
	// wrapper emits \par\smallskip{\small ...} around whatever lands in noteNodes: extra vertical
	// space for a bare \vskip, and {\small \normalsize} literally re-shrinks the text that
	// command exists to un-shrink. round-trip it raw as postBody instead, scoped to when it
	// STARTS the post-tabular content; real notes after a leading switch keep the \small treatment.
	let postBody: string | null = null;
	const firstNote = noteNodes.find((n) => n.type !== 'whitespace' && n.type !== 'parbreak');
	if (
		leadsWithSkip(firstNote) ||
		(firstNote && noteNodes.every((n) => n.type === 'whitespace' || n.type === 'parbreak' || n.type === 'comment'))
	) {
		postBody = joinRaw(noteNodes);
		noteNodes = [];
	}

	if (noteNodes.length > 0) {
		const convertedNotes = convertNodesToInline(noteNodes, ctx);
		if (convertedNotes.length > 0) {
			// the span covers every node that became content, a comment at either edge included: a
			// block whose leaf runs lie outside it is not believed (see soundLeaves)
			notes.push(noteBlockSpan(buildNode('table_notes', null, convertedNotes), spanOfNodes(noteNodes)));
		}
	}

	const label = labels.length > 0 ? labels[labels.length - 1] : null;
	const extraLabels = labels.length > 1 ? labels.slice(0, -1) : null;

	return { caption, label, extraLabels, tables, notes, preBody, postBody, centering, captionBelow, notesSize };
}

/** a bare \vskip, a scoped switch, or a group led by a skip: setup after the tabular, not notes */
function joinRaw(nodes: Node[]): string | null {
	let out = '';
	for (const n of nodes) {
		const raw = (nodeRawSource(n) ?? printRaw(n)).replace(/\n$/, '');
		if (out) out += /(^|[^\\])(\\\\)*%[^\n]*$/.test(out) ? '\n' : ' ';
		out += raw;
	}
	return out.trim() || null;
}

function leadsWithSkip(n: Node | undefined): boolean {
	if (!n) return false;
	if (n.type === 'macro') {
		const c = (n as Macro).content;
		return c === 'vskip' || c === 'hskip' || SCOPED_SWITCHES.has(c);
	}
	if (n.type === 'group') {
		const first = (n.content ?? []).find((x) => !(x.type === 'whitespace' || x.type === 'parbreak' || x.type === 'comment'));
		return first?.type === 'macro' && /^[vh]skip$/.test(String((first as Macro).content));
	}
	return false;
}

function flattenTabularWrappers(content: Node[]): Node[] {
	const flat: Node[] = [];
	for (const node of content) {
		const unwrap =
			(node.type === 'environment' && (node as Environment).env === 'center' && containsTabular([node])) ||
			(node.type === 'group' && containsTabular(node.content ?? []));
		if (unwrap) flat.push(...flattenTabularWrappers(((node as { content?: Node[] }).content ?? []) as Node[]));
		else flat.push(node);
	}
	return flat;
}

/** Whether a tabular/tabularx/longtable appears anywhere (possibly nested) in these nodes. */
export function containsTabular(nodes: Node[]): boolean {
	for (const n of nodes) {
		if (n.type === 'environment' && (n.env === 'tabular' || n.env === 'tabular*' || n.env === 'tabularx' || n.env === 'longtable'))
			return true;
		if ('content' in n && Array.isArray(n.content) && containsTabular(n.content)) return true;
	}
	return false;
}

export function createTableWrapper(env: Environment, ctx: ConversionContext, options: ConversionOptions): PmNode[] {
	const { caption, label, extraLabels, tables, notes, preBody, postBody, centering, captionBelow, notesSize } = extractTableComponents(
		env.content,
		ctx
	);

	const tableNode = tables[0];
	// the wrapper models exactly one tabular; a float holding several (side by side, or stacked
	// under one caption) keeps them all on the environment path below, where each converts as
	// its own table and the caption stays a chip
	if (!tableNode || tables.length > 1) {
		// no tabular as a DIRECT child. one merely nested (e.g. in \begin{center}) still becomes
		// editable: keep the float as an environment node, the nested tabular converts inside it.
		if (containsTabular(env.content)) {
			const envArgs = (env as Environment).args && (env as Environment).args!.length ? printRaw((env as Environment).args!) : '';
			const inner = convertNodesToBlocks(env.content, options);
			return [buildNode('environment', { name: env.env, args: envArgs }, inner.length > 0 ? inner : [buildNode('paragraph')])];
		}
		// genuinely unmodellable (tabulary, tabu, ...): block-parsing would inject an illegal
		// \par and mangle the column spec, so preserve the whole float verbatim.
		return [buildNode('raw_latex', null, [rawTextNode(nodeRawSpan(env), nodeToLatexString(env))])];
	}

	// the float's own placement specifier ([t], [H], or '' when the source had none), round-
	// tripped verbatim: [H] FORCES placement while [h] is advisory, so silently downgrading one
	// to the other can move the table to a different page.
	const placement = env.args && env.args.length ? printRaw(env.args) : '';

	return [
		buildNode(
			'table_wrapper',
			{
				label: label,
				extraLabels: extraLabels ? extraLabels.join('\n') : null,
				showNotes: notes.length > 0,
				preBody,
				postBody,
				placement,
				centering,
				captionBelow,
				notesSize,
				hasHeaderRow: true, // simplified assumption
				hasHeaderColumn: true,
				// table_wrapper has no verbatim template; \begin{table}/table* is ALWAYS
				// synthesized from this attr, without it a table* loses its two-column span.
				spanning: env.env === 'table*'
			},
			[caption || buildNode('table_caption'), tableNode, ...notes]
		)
	];
}

// sentinels for the editable pieces inside a stored figureTemplate; substituted on save, they
// never reach a compiler and can't collide with real macros.

export const TABLE_RULE_MACROS = new Set([
	'hline',
	'cline',
	'toprule',
	'midrule',
	'bottomrule',
	'cmidrule',
	'hhline',
	'specialrule',
	'addlinespace',
	'morecmidrules'
]);

/**
 * A tabular row break (`\\`). unified-latex gives it a `content` of '\\' OR the whitespace it
 * swallowed ('\n' at end of line, ' ' before `\hline`); matching only '\\' silently merged every
 * row into one. limitation: a `\ ` control space parses to the identical macro, so an in-cell
 * `\ ` is also treated as a row break (rare in tables; accepted).
 */
export function isRowBreak(macro: Macro): boolean {
	const c = (macro as Macro).content;
	return c === '\\' || (typeof c === 'string' && c.length > 0 && /^\s+$/.test(c));
}

export function createTable(env: Environment): PmNode[] {
	// capture the EXACT architecture so the table re-serializes render-identically: env name,
	// column spec, width, and \hline-family rules.
	const mandatory = (env.args ?? []).filter((a) => a.openMark === '{');
	// tabularx/tabulary/tabular* take a leading {width} before the column spec
	const takesWidth = env.env === 'tabularx' || env.env === 'tabulary' || env.env === 'tabular*';
	const tabularxWidth = takesWidth && mandatory.length >= 2 ? printRaw(mandatory[0].content) : null;
	const colspecArg = takesWidth ? mandatory[1] : mandatory[mandatory.length - 1];
	const colspec = colspecArg ? printRaw(colspecArg.content) : null;

	const rows: PmNode[] = [];
	// each row's bytes: from its first cell's to its last cell's, the row break left to the frame
	const rowSpans: (BlockSpan | null)[] = [];
	let currentRowCells: PmNode[] = [];
	let currentCellContent: Node[] = [];
	let pendingRules = ''; // rules seen since the last row, not yet assigned
	let rowTop = ''; // the rules that precede the row currently being built
	let rowStarted = false;

	// A row "starts" at its first meaningful content / `&`; rules before that are its topRules.
	function startRow() {
		if (!rowStarted) {
			rowStarted = true;
			rowTop = pendingRules;
			pendingRules = '';
		}
	}
	function flushRow(cells: PmNode[], rowBreakSuffix = '') {
		rows.push(buildNode('table_row', { topRules: rowTop, rowBreakSuffix }, cells.length > 0 ? cells : [createTableCell([])]));
		const placed = cells.map((c) => blockSpanOf(c)).filter((s): s is BlockSpan => !!s);
		rowSpans.push(
			placed.length > 0 && placed.length === cells.length
				? { srcFrom: Math.min(...placed.map((s) => s.srcFrom)), srcTo: Math.max(...placed.map((s) => s.srcTo)), size: 1 }
				: null
		);
		rowTop = '';
		rowStarted = false;
	}

	for (const node of env.content) {
		if (node.type === 'string' && node.content === '&') {
			startRow();
			currentRowCells.push(createTableCell(currentCellContent, startOf(node)));
			currentCellContent = [];
		} else if (node.type === 'macro' && isRowBreak(node as Macro)) {
			startRow();
			currentRowCells.push(createTableCell(currentCellContent, startOf(node)));
			const args = (node as Macro).args;
			flushRow(currentRowCells, args && args.length ? printRaw(args) : '');
			currentRowCells = [];
			currentCellContent = [];
		} else if (node.type === 'macro' && TABLE_RULE_MACROS.has((node as Macro).content)) {
			pendingRules += printRaw(node);
		} else if (!rowStarted && node.type === 'macro' && ((node as Macro).content === 'rule' || (node as Macro).content === 'hrule')) {
			// a \rule strut before any cell content is row-leading decoration (row-height struts):
			// capture it with topRules or it becomes a horizontal_rule in the first cell and compounds.
			pendingRules += printRaw(node);
		} else {
			const blank =
				node.type === 'whitespace' ||
				node.type === 'parbreak' ||
				node.type === 'comment' ||
				(node.type === 'macro' && (node as Macro).content === 'par');
			if (!blank) startRow();
			currentCellContent.push(node);
		}
	}

	const isOnlyWhitespace = currentCellContent.every(
		(n) =>
			n.type === 'whitespace' ||
			n.type === 'parbreak' ||
			n.type === 'comment' ||
			(n.type === 'macro' && (n as Macro).content === 'par') ||
			(n.type === 'string' && (n.content || '').trim() === '')
	);
	if ((!isOnlyWhitespace || currentRowCells.length > 0) && (currentCellContent.length > 0 || currentRowCells.length > 0)) {
		startRow();
		currentRowCells.push(createTableCell(currentCellContent));
		flushRow(currentRowCells);
	}
	const bottomRules = pendingRules; // rules after the final row

	if (rows.length === 0) {
		rows.push(buildNode('table_row', null, [createTableCell([])]));
	}

	const resolved = resolveSpans(rows);
	if (resolved.length === rows.length) resolved.forEach((row, i) => noteBlockSpan(row, rowSpans[i]));
	return [buildNode('table', { env: env.env, colspec, tabularxWidth, bottomRules }, resolved)];
}

// a node that contributes no cell content (whitespace / comments / empty strings)
export function isBlankCellNode(n: Node): boolean {
	return (
		n.type === 'whitespace' ||
		n.type === 'parbreak' ||
		n.type === 'comment' ||
		(n.type === 'macro' && (n as Macro).content === 'par') ||
		(n.type === 'string' && ((n as { content?: string }).content || '').trim() === '')
	);
}
export function isMacroNamed(n: Node, name: string): boolean {
	return n.type === 'macro' && (n as Macro).content === name;
}

// detect a leading \multicolumn / \multirow (possibly \multicolumn wrapping \multirow, the shape
// the serializer emits for both-ways spans) and pull out the span counts + actual content.
export function unwrapSpans(content: Node[]): { colspan: number; rowspan: number; inner: Node[]; mcAlign: string | null } {
	let colspan = 1;
	let rowspan = 1;
	let inner = content;
	let mcAlign: string | null = null;
	function alignOf(m: Macro): string | null {
		const a = (m.args ?? []).filter((x) => x.openMark === '{')[1];
		return a ? printRaw(a.content) : null;
	}
	function spanOf(m: Macro): number {
		const a = (m.args ?? []).filter((x) => x.openMark === '{')[0];
		const v = a ? parseInt(printRaw(a.content).trim(), 10) : NaN;
		return Number.isFinite(v) && v > 0 ? v : 1;
	}
	function textOf(m: Macro): Node[] {
		const args = (m.args ?? []).filter((x) => x.openMark === '{');
		return args.length >= 3 ? (args[2].content as Node[]) : inner;
	}
	const meaningful = content.filter((n) => !isBlankCellNode(n));
	if (meaningful.length === 1 && isMacroNamed(meaningful[0], 'multicolumn')) {
		const mc = meaningful[0] as Macro;
		colspan = spanOf(mc);
		mcAlign = alignOf(mc);
		inner = textOf(mc);
		const innerMeaningful = inner.filter((n) => !isBlankCellNode(n));
		if (innerMeaningful.length === 1 && isMacroNamed(innerMeaningful[0], 'multirow')) {
			const mr = innerMeaningful[0] as Macro;
			rowspan = spanOf(mr);
			inner = textOf(mr);
		}
	} else if (meaningful.length === 1 && isMacroNamed(meaningful[0], 'multirow')) {
		const mr = meaningful[0] as Macro;
		rowspan = spanOf(mr);
		inner = textOf(mr);
	}
	return { colspan, rowspan, inner, mcAlign };
}

/** `emptyAt`: where an empty cell's bytes would be, the offset of the `&` or `\\\\` that ends it */
export function createTableCell(content: Node[], emptyAt?: number): PmNode {
	const { colspan, rowspan, inner, mcAlign } = unwrapSpans(content);
	const pieces: Node[][] = [[]];
	for (const n of inner) {
		if (isMacroNamed(n, 'par')) pieces.push([]);
		else pieces[pieces.length - 1].push(n);
	}
	const paragraphs: PmNode[] = [];
	for (const piece of pieces) {
		// trim blank AST nodes BEFORE conversion, not the merged text string after: a macro that
		// produces literal spaces as real content (\quad row-label indents) is indistinguishable from
		// incidental whitespace once flattened, and a string-level trim silently eats it.
		let start = 0;
		let end = piece.length;
		while (start < end && isBlankCellNode(piece[start])) start++;
		while (end > start && isBlankCellNode(piece[end - 1])) end--;
		if (start === end && paragraphs.length > 0) continue;
		const inlineContent = convertNodesToInline(piece.slice(start, end), createDefaultContext());
		if (inlineContent.length === 0 && paragraphs.length > 0) continue;
		paragraphs.push(noteBlockSpan(buildNode('paragraph', null, inlineContent), spanOfNodes(piece.slice(start, end))));
	}
	const kept = paragraphs.length > 1 && paragraphs[0].content.size === 0 ? paragraphs.slice(1) : paragraphs;
	// the cell's bytes: its content, a \multicolumn or \multirow wrapper included; an empty cell
	// stands at the delimiter that ends it, with nothing of its own
	const own = spanOfNodes(trimBlank(content)) ?? (typeof emptyAt === 'number' ? { srcFrom: emptyAt, srcTo: emptyAt, size: 1 } : null);
	return noteBlockSpan(buildNode('table_cell', { colspan, rowspan, colwidth: null, mcAlign }, kept), own);
}

// drop the placeholder cells LaTeX writes UNDER a \multirow so the prosemirror-tables covered-
// cell model matches: a spanning cell appears once in its origin row, covered positions are
// omitted below. no-rowspan tables come back unchanged.
export function resolveSpans(rows: PmNode[]): PmNode[] {
	const covered: boolean[][] = [];
	function mark(r: number, c: number) {
		while (covered.length <= r) covered.push([]);
		covered[r][c] = true;
	}
	return rows.map((row, r) => {
		const kept: PmNode[] = [];
		let col = 0;
		row.forEach((cell) => {
			const cs = Number(cell.attrs.colspan ?? 1);
			const rs = Number(cell.attrs.rowspan ?? 1);
			if (covered[r]?.[col]) {
				col += cs; // a placeholder for a rowspan from above: drop it
				return;
			}
			kept.push(cell);
			if (rs > 1) for (let rr = r + 1; rr < r + rs; rr++) for (let cc = col; cc < col + cs; cc++) mark(rr, cc);
			col += cs;
		});
		return buildNode(
			'table_row',
			{ topRules: row.attrs.topRules ?? '', rowBreakSuffix: row.attrs.rowBreakSuffix ?? '' },
			kept.length ? kept : [createTableCell([])]
		);
	});
}

// LaTeX text ligatures to real typographic glyphs. order matters (longest first). applied only
// to plain prose text nodes; \texttt/code keeps -- and `` literal.
