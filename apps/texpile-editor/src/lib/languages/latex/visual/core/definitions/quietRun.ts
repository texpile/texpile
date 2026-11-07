// a run of commands that define or set something and print nothing, read from a chip's units: definitions draw as one
// group of rows, settings as lines
import type { SourceUnit } from '$lib/languages/latex/parser/tree/walk/sourceUnits';
import { sourceHint, type ChipFace } from '$lib/editor/visual/extensions/drawnChips/chipFace';
import { ownMacroDefined } from '../own/ownMacroFace.svelte';
import { definesSomething, readDataDefinition, readingOf, type ReadDefinition } from './readDefinition';
import { readSetting, startsSetting, type ReadSetting } from './readSetting';
import { readTexDefinition, startsTexDefinition } from './texDefinitionCall';
import { texDefinitionsFace, type TextDrawer } from './texDefinitionsFace';
import { settingsFace } from '$lib/editor/visual/extensions/drawnChips/settings/settingsFace';
import { internalCodeFace } from './internalCodeFace';

type Statement = { definition: ReadDefinition; setting?: undefined } | { setting: ReadSetting; definition?: undefined };

export type QuietRun = { part: ChipFace; next: number };

/** a chip that starts with `name` may be a definition or a setting */
export function startsQuiet(name: string): boolean {
	return startsTexDefinition(name) || definesSomething(readingOf(name) ?? []) || startsSetting(name);
}

function statementAt(src: string, unit: SourceUnit): Statement | null {
	const call = unit.call;
	// the paper's own meaning wins
	if (!call || ownMacroDefined(call.name)) return null;
	const { from, to } = unit.piece;
	const definition = startsTexDefinition(call.name) ? readTexDefinition(src, from) : readDataDefinition(src, from, call.name, to);
	if (definition) return { definition };
	const setting = readSetting(src, call.name, to);
	return setting && { setting };
}

function endOf(statement: Statement): number {
	return (statement.definition ?? statement.setting).end;
}

/** the first unit past `end`; -1 when one runs across it */
function unitAfter(units: SourceUnit[], from: number, end: number): number {
	let i = from;
	for (; i < units.length && units[i].piece.from < end; i++) if (Math.max(units[i].piece.to, units[i].call?.to ?? 0) > end) return -1;
	return i;
}

/** a space, a blank line, or the empty comment that ends a line without a space */
function isBlank(src: string, unit: SourceUnit): boolean {
	const { piece } = unit;
	if (piece.kind === 'space') return true;
	if (piece.kind !== 'node') return false;
	return piece.node.name === 'ParBreak' || (piece.node.name === 'Comment' && !src.slice(piece.from + 1, piece.to).trim());
}

function isComment(unit: SourceUnit): boolean {
	return unit.piece.kind === 'node' && unit.piece.node.name === 'Comment';
}

function blanksFrom(src: string, units: SourceUnit[], from: number): number {
	let i = from;
	while (i < units.length && isBlank(src, units[i])) i++;
	return i;
}

/** every unit from `from` to `to` is a definition, a setting or a comment */
function readsQuietly(src: string, units: SourceUnit[], from: number, to: number): boolean {
	for (let i = from; i < to;) {
		if (isBlank(src, units[i]) || isComment(units[i])) {
			i++;
			continue;
		}
		const statement = statementAt(src, units[i]);
		const next = statement ? unitAfter(units, i, endOf(statement)) : -1;
		if (next < 0 || next > to) return false;
		i = next;
	}
	return true;
}

/** \makeatletter up to its \makeatother, or the chip's end, when what stands between does not read */
function internalCode(src: string, units: SourceUnit[], i: number): QuietRun | null {
	if (units[i].call?.name !== 'makeatletter') return null;
	const close = units.findIndex((u, k) => k > i && u.call?.name === 'makeatother');
	const to = close < 0 ? units.length : close;
	if (readsQuietly(src, units, i + 1, to)) return null;
	const last = units[(close < 0 ? units.length : close + 1) - 1];
	const from = units[i].piece.from;
	const end = Math.max(last.piece.to, last.call?.to ?? 0);
	const code = src.slice(units[i].piece.to, close < 0 ? end : units[close].piece.from);
	return { part: internalCodeFace(code, src.slice(from, end)), next: close < 0 ? units.length : close + 1 };
}

/** the run starting at unit `i`, and the unit after it; null when `i` starts none */
export function quietRunAt(units: SourceUnit[], i: number, src: string, drawText: TextDrawer): QuietRun | null {
	const folded = internalCode(src, units, i);
	if (folded) return folded;
	const first = statementAt(src, units[i]);
	let next = first ? unitAfter(units, i, endOf(first)) : -1;
	if (!first || next < 0) return null;
	const run = [first];
	for (;;) {
		next = blanksFrom(src, units, next);
		const more = next < units.length ? statementAt(src, units[next]) : null;
		const after = more && !more.definition === !first.definition ? unitAfter(units, next, endOf(more)) : -1;
		if (!more || after < 0) break;
		run.push(more);
		next = after;
	}
	const source = src.slice(units[i].piece.from, endOf(run[run.length - 1]));
	const part = first.definition
		? texDefinitionsFace(
				run.map((s) => s.definition!),
				source,
				drawText
			)
		: settingsFace(
				run.map((s) => s.setting!),
				sourceHint(source)
			);
	return { part, next };
}
