import type { SourceUnit } from '$lib/languages/latex/parser/tree/walk/sourceUnits';
import { commonFacts } from '$lib/languages/latex/knowledge/commands/commandFacts';
import { ownMacroDefinition } from '../own/ownMacroFace.svelte';

function readsNumber(name: string): boolean {
	return commonFacts(name).reads === 'number';
}

export function startsPrimitive(name: string): boolean {
	return name === 'csname' || readsNumber(name);
}

function csnameAt(units: SourceUnit[], i: number, src: string): { name: string; next: number } | null {
	if (units[i].call?.name !== 'csname') return null;
	let name = '';
	for (let j = i + 1; j < units.length; j++) {
		const { piece, call } = units[j];
		if (call?.name === 'endcsname') return /^[a-zA-Z@]+$/.test(name) ? { name, next: j + 1 } : null;
		if (piece.kind === 'space' && !name) continue;
		if (piece.kind !== 'word') return null;
		name += src.slice(piece.from, piece.to);
	}
	return null;
}

function numberSettingEnd(units: SourceUnit[], i: number, src: string): number | null {
	const call = units[i].call;
	if (!call || !readsNumber(call.name) || call.args.some((a) => a.present)) return null;
	let j = i + 1;
	while (units[j]?.piece.kind === 'space') j++;
	const next = units[j];
	if (next?.call && !next.call.args.some((a) => a.present)) return j + 1;
	if (next?.piece.kind === 'word' && /^=?\s*[+-]?\d+\s*$/.test(src.slice(next.piece.from, next.piece.to))) return j + 1;
	return i + 1;
}

export function primitiveAt(units: SourceUnit[], i: number, src: string): { name: string | null; next: number } | null {
	const setting = numberSettingEnd(units, i, src);
	return setting === null ? csnameAt(units, i, src) : { name: null, next: setting };
}

export function writtenAtLetter(source: string): boolean {
	for (const m of source.matchAll(/\\([a-zA-Z]*@[a-zA-Z@]*)/g)) if (m[1] !== '@' && ownMacroDefinition(m[1])) return true;
	return false;
}
