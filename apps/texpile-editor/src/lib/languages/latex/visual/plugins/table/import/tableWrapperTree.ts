// a table float to its wrapper: caption, labels, the tabular, the setup before it and the notes after it
import {
	FONT_SIZE_SWITCHES,
	TABLE_ENVS,
	argText,
	argTextContent,
	argumentsText,
	bodyOf,
	endsInComment,
	environmentNameOf,
	hasStar,
	isBlankUnit,
	isSamelineComment,
	isScopedSwitch,
	mandatoryArgs,
	noteBlockSpan,
	optionalArg,
	sliceOf,
	spanOfUnits,
	type ConversionContext,
	type PmNode,
	type TreeEnvironment,
	type TreeImport,
	type Unit
} from '$lib/languages/latex/visual/core/document';
import { tableBlocks } from './tableTree';
import { boxedTabularOf, holdsTabularIn, type BoxedTabular } from './tableBoxes';

function isNodeUnit(u: Unit, name: string): boolean {
	return !u.call && u.piece.kind === 'node' && u.piece.node.name === name;
}

function environmentUnit(im: TreeImport, u: Unit): string | null {
	return isNodeUnit(u, 'Environment') ? environmentNameOf(im, u.piece.node) : null;
}

function throughWrappers(im: TreeImport, units: Unit[], boxes: BoxedTabular[]): Unit[] {
	const out: Unit[] = [];
	for (const u of units) {
		const body = isNodeUnit(u, 'Group') || environmentUnit(im, u) === 'center' ? bodyOf(u.piece.node) : null;
		const boxed = body ? null : boxedTabularOf(im, u);
		if (body && holdsTabularIn(im, body)) out.push(...throughWrappers(im, im.core.unitsIn(body), boxes));
		else if (boxed) {
			boxes.push(boxed);
			out.push(boxed.tabular);
		} else out.push(u);
	}
	return out;
}

/** setup kept as written, a comment's line end kept */
function joinRaw(im: TreeImport, units: Unit[]): string | null {
	let out = '';
	for (const u of units) {
		const raw = u.piece.kind === 'space' ? ' ' : sliceOf(im, u).replace(/\n$/, '');
		const ownLine = isNodeUnit(u, 'Comment') && !isSamelineComment(im.src, u.from);
		if (out) out += endsInComment(out) || ownLine ? '\n' : ' ';
		out += raw;
	}
	return out.trim() || null;
}

function firstMeaningful(units: Unit[]): Unit | undefined {
	return units.find((u) => !(u.piece.kind === 'space' || isNodeUnit(u, 'ParBreak') || isNodeUnit(u, 'Comment')));
}

/** a bare \vskip, a scoped switch, or a group led by a skip: setup after the tabular, not notes */
function leadsWithSkip(im: TreeImport, u: Unit | undefined): boolean {
	if (!u) return false;
	if (u.call) return u.call.name === 'vskip' || u.call.name === 'hskip' || isScopedSwitch(u.call.name);
	if (!isNodeUnit(u, 'Group')) return false;
	return /^[vh]skip$/.test(firstMeaningful(im.core.unitsIn(bodyOf(u.piece.node)))?.call?.name ?? '');
}

function componentsOf(im: TreeImport, env: TreeEnvironment, ctx: ConversionContext) {
	const units = im.core.unitsIn(env.body);
	let caption: PmNode | null = null;
	const labels: string[] = [];
	const tables: PmNode[] = [];
	const pre: Unit[] = [];
	let notes: Unit[] = [];
	let sawTabular = false;
	let centering = units.some((u) => environmentUnit(im, u) === 'center' && holdsTabularIn(im, bodyOf(u.piece.node)));
	let captionBelow = false;
	let notesSize: string | null = null;
	let captionGap = '';
	let afterCaption = false;
	const boxes: BoxedTabular[] = [];
	for (const u of throughWrappers(im, units, boxes)) {
		const name = u.call?.name;
		if (name === 'caption') {
			const arg = mandatoryArgs(u.call!).find((a) => a.body);
			const opt = optionalArg(u.call!);
			const built = im.core.node(
				'table_caption',
				{ starred: hasStar(u.call!), captionOpt: opt ? argText(im.src, opt) : null },
				arg?.body ? im.core.inline(arg.body, ctx) : []
			);
			// the caption's bytes are the words in its braces; one below the tabular rides along in the frame
			caption = sawTabular || !arg?.body ? built : noteBlockSpan(built, { srcFrom: arg.body.from, srcTo: arg.body.to, size: 1 });
			captionBelow = sawTabular;
			afterCaption = true;
		} else if (name === 'label') {
			const text = argTextContent(im, mandatoryArgs(u.call!)[0]);
			if (text) labels.push(text);
		} else if (TABLE_ENVS.includes(environmentUnit(im, u) ?? '')) {
			sawTabular = true;
			const made = tableBlocks(im, im.core.environment(u.piece.node));
			if (made.length === 1) noteBlockSpan(made[0], { srcFrom: u.from, srcTo: u.to, size: 1 });
			tables.push(...made);
		} else {
			// whitespace before the tabular only separates; after it, it is word spacing in the notes
			if (isNodeUnit(u, 'ParBreak') || (u.piece.kind === 'space' && !sawTabular)) continue;
			if (name === 'centering') {
				centering = true;
				continue;
			}
			if (afterCaption && (captionBelow || !sawTabular) && name === 'vspace') captionGap += sliceOf(im, u);
			if (name === 'vspace' || name === 'raggedright') continue;
			// the notes wrapper writes its own \par\smallskip
			if (sawTabular && notes.every(isBlankUnit) && /^(par|(small|med|big)skip)$/.test(name ?? '')) continue;
			// the notes serializer writes its own {\<size> ...}: one in the notes place is remembered and taken out
			if (sawTabular && name && FONT_SIZE_SWITCHES.has(name)) {
				notesSize = name;
				continue;
			}
			if (sawTabular && isNodeUnit(u, 'Group')) {
				const inner = im.core.unitsIn(bodyOf(u.piece.node));
				const lead = firstMeaningful(inner);
				if (lead?.call && FONT_SIZE_SWITCHES.has(lead.call.name)) {
					notesSize = lead.call.name;
					notes.push(...inner.filter((x) => x !== lead));
					continue;
				}
				if (lead?.call && /^[vh]skip$/.test(lead.call.name)) {
					notes.push(u);
					continue;
				}
			}
			if (u.piece.kind !== 'space' && !isNodeUnit(u, 'Comment')) afterCaption = false;
			(sawTabular ? notes : pre).push(u);
		}
	}
	const preBody = pre.length > 0 ? joinRaw(im, pre) : null;
	while (notes.length && notes[0].piece.kind === 'space') notes.shift();
	while (notes.length && notes[notes.length - 1].piece.kind === 'space') notes.pop();
	let postBody: string | null = null;
	const first = notes.find((n) => n.piece.kind !== 'space' && !isNodeUnit(n, 'ParBreak'));
	if (
		leadsWithSkip(im, first) ||
		(first && notes.every((n) => n.piece.kind === 'space' || isNodeUnit(n, 'ParBreak') || isNodeUnit(n, 'Comment')))
	) {
		postBody = joinRaw(im, notes);
		notes = [];
	}
	const noteNodes: PmNode[] = [];
	if (notes.length > 0) {
		const converted = im.core.unitsInline(notes, ctx);
		if (converted.length > 0) noteNodes.push(noteBlockSpan(im.core.node('table_notes', null, converted), spanOfUnits(notes)));
	}
	const box = boxes.length === 1 ? boxes[0] : null;
	return {
		caption,
		labels,
		tables,
		notes: noteNodes,
		preBody,
		postBody,
		centering,
		captionBelow,
		captionGap,
		notesSize,
		box,
		boxes: boxes.length
	};
}

export function tableWrapperBlocks(im: TreeImport, env: TreeEnvironment, ctx: ConversionContext): PmNode[] {
	const { caption, labels, tables, notes, preBody, postBody, centering, captionBelow, captionGap, notesSize, box, boxes } = componentsOf(
		im,
		env,
		ctx
	);
	const table = tables[0];
	// the wrapper models one tabular; a float holding several, one nested deeper, or one kept as written stays an environment
	if (!table || tables.length > 1 || boxes > 1 || table.type.name !== 'table') {
		if (im.core.containsTabular(env.body)) {
			const inner = im.core.blocks(env.body);
			return [
				im.core.node(
					'environment',
					{ name: env.name, args: argumentsText(im.src, env) },
					inner.length > 0 ? inner : [im.core.node('paragraph')]
				)
			];
		}
		return [im.core.raw(env)];
	}
	return [
		im.core.node(
			'table_wrapper',
			{
				label: labels.length ? labels[labels.length - 1] : null,
				extraLabels: labels.length > 1 ? labels.slice(0, -1).join('\n') : null,
				showNotes: notes.length > 0,
				preBody,
				postBody,
				// [H] forces placement while [h] only asks, so it round-trips as written
				placement: argumentsText(im.src, env),
				centering,
				captionBelow,
				captionGap: caption ? captionGap : null,
				notesSize,
				tabularBefore: box?.before ?? null,
				tabularAfter: box?.after ?? null,
				hasHeaderRow: true,
				hasHeaderColumn: true,
				// the wrapper writes \begin{table} itself, so table* needs saying
				spanning: env.name === 'table*'
			},
			[caption || im.core.node('table_caption'), table, ...notes]
		)
	];
}
