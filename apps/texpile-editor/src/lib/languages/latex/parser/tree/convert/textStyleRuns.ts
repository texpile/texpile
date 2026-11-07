// font and size switches read as the style of the prose they cover: {\small ...}, a bare \small to the end of what holds
// it, \textsc{...}; the text stays text and the commands come back as written
import type { SyntaxNode } from '@lezer/common';
import type { ConversionContext, PmMark } from '../../builders';
import { commonFacts } from '../../../knowledge/commands/commandFacts';
import { PieceCursor, type Piece } from '../walk/pieceCursor';
import { bodyOf, type Stretch } from '../walk/stretch';
import { mandatoryArgs } from '../walk/treeArgs';
import { sliceOf, type TreeImport } from '../importCore/treeImport';
import { commandName, type ImportCall } from './treeCalls';
import { readCallAt } from './inlineTree';

/**
 * `group`: {\small ...}, `bare`: \small up to the end of what holds it, `arg`: \textsc{...}. `sep` is what the file
 * put after the command name (`{}`, a space); `lead` the space before it in a group; `skip`: a bare switch the run
 * before already wrote, so this run says nothing
 */
export type TextStyle = { command: string; form: 'group' | 'bare' | 'arg'; sep: string; lead?: string; skip?: boolean };

export function isStyleSwitch(name: string): boolean {
	const declares = commonFacts(name).declares;
	return declares === 'font' || declares === 'size';
}

/** `ctx` with `style` inside the styles it already has */
export function withStyle(ctx: ConversionContext, style: TextStyle): ConversionContext {
	const at = ctx.marks.findIndex((m) => m.type === 'text_style');
	const before = at < 0 ? [] : ((ctx.marks[at].attrs?.styles as TextStyle[]) ?? []);
	const mark: PmMark = { type: 'text_style', attrs: { styles: [...before, style] } };
	return { ...ctx, marks: at < 0 ? [...ctx.marks, mark] : ctx.marks.map((m, i) => (i === at ? mark : m)) };
}

function isCommand(p: Piece | null): p is Piece {
	return !!p && p.kind === 'node' && p.node.name === 'ControlWord';
}

function isEmptyGroup(im: TreeImport, p: Piece | null): p is Piece {
	return !!p && p.kind === 'node' && p.node.name === 'Group' && sliceOf(im, p) === '{}';
}

/** what follows the switch's name and ends it: the spaces TeX skips, then an empty group */
function readSep(im: TreeImport, cursor: PieceCursor, from: number): string {
	if (cursor.peek()?.kind === 'space') cursor.next();
	if (isEmptyGroup(im, cursor.peek())) cursor.next();
	return im.src.slice(from, cursor.pos);
}

/** a paragraph break, a \par or a comment ends what the style can cover as one run of prose */
function breaksProse(im: TreeImport, p: Piece): boolean {
	if (p.kind !== 'node') return false;
	if (p.node.name === 'ParBreak' || p.node.name === 'Comment') return true;
	return p.node.name === 'ControlWord' && commandName(im, p) === 'par';
}

/** where the styled run reaches: `ends` before a break or a piece that does not continue it, `prose` once words come */
type RunScan = { prose: boolean; ends: boolean };

/** words or math before the run ends, in an argument too (\textcolor{blue}{P}) */
function scanRun(im: TreeImport, cursor: PieceCursor, continues: Continues): RunScan {
	const mark = cursor.save();
	let prose = false;
	let ends = false;
	for (let p = cursor.next(); p && !ends; p = cursor.next()) {
		const call = p.kind === 'node' && (p.node.name === 'ControlWord' || p.node.name === 'ControlSymbol') ? readCallAt(im, cursor, p) : null;
		ends = breaksProse(im, p) || !continues(p, call);
		if (!ends && !prose) prose = isProse(im, p) || !!call?.args.some((a) => a.body && proseIn(im, a.body));
	}
	cursor.restore(mark);
	return { prose, ends };
}

function isProse(im: TreeImport, p: Piece): boolean {
	// a tie alone is a space, which the paragraph's edges trim
	if (p.kind === 'word') return /[^~\s]/.test(sliceOf(im, p));
	if (p.kind !== 'node') return false;
	if (p.node.name === 'InlineMath' || p.node.name === 'ParenMath') return true;
	return p.node.name === 'Group' && scanRun(im, new PieceCursor(im.src, bodyOf(p.node)), () => true).prose;
}

/** the whole stretch is one run with prose in it */
function proseIn(im: TreeImport, s: Stretch): boolean {
	const scan = scanRun(im, new PieceCursor(im.src, s), () => true);
	return scan.prose && !scan.ends;
}

function isPlainSwitch(call: ImportCall): boolean {
	return call.raw == null && call.node.name === 'ControlWord' && isStyleSwitch(call.name) && !call.args.some((a) => a.present);
}

/** whether a piece, read as `call` when it is a command, goes on in the same run (a paragraph's next block does not) */
export type Continues = (p: Piece, call: ImportCall | null) => boolean;

/** a bare switch with prose after it: the cursor moves past what ends its name, and the context the rest reads in */
export function bareSwitch(
	im: TreeImport,
	cursor: PieceCursor,
	call: ImportCall,
	ctx: ConversionContext,
	continues: Continues = () => true
): ConversionContext | null {
	if (!isPlainSwitch(call)) return null;
	const start = cursor.save();
	const sep = readSep(im, cursor, call.to);
	if (scanRun(im, cursor, continues).prose) return withStyle(ctx, { command: call.name, form: 'bare', sep });
	cursor.restore(start);
	return null;
}

/** {\small ...}: the stretch after the switch and the context it reads in, or null when the group is no styled prose */
export function switchGroup(im: TreeImport, group: SyntaxNode, ctx: ConversionContext): { rest: Stretch; ctx: ConversionContext } | null {
	const body = bodyOf(group);
	const cursor = new PieceCursor(im.src, body);
	let first = cursor.next();
	const lead = first?.kind === 'space' ? sliceOf(im, first) : '';
	if (lead) first = cursor.next();
	if (!isCommand(first) || !isStyleSwitch(commandName(im, first))) return null;
	const name = commandName(im, first);
	const sep = readSep(im, cursor, first.to);
	const rest: Stretch = { ...body, from: cursor.pos };
	if (!proseIn(im, rest)) return null;
	return { rest, ctx: withStyle(ctx, { command: name, form: 'group', sep, ...(lead ? { lead } : {}) }) };
}

/** \textsc{...}: its argument and the context it reads in */
export function styleArgument(im: TreeImport, call: ImportCall, ctx: ConversionContext): { rest: Stretch; ctx: ConversionContext } | null {
	const args = mandatoryArgs(call);
	const arg = args[0];
	if (args.length !== 1 || call.args.length !== 1 || !arg.braced || !arg.body || !proseIn(im, arg.body)) return null;
	const sep = im.src.slice(call.node.to, arg.from);
	if (sep.trim()) return null;
	return { rest: arg.body, ctx: withStyle(ctx, { command: call.name, form: 'arg', sep }) };
}
