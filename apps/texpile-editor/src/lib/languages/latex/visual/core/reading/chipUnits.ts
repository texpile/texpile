import { latexTreeAtLetter, latexTreeOf } from '$lib/languages/latex/syntax/latexTrees';
import { commonCommand } from '$lib/languages/latex/knowledge/calls/commandCalls';
import type { Argument } from '$lib/languages/latex/knowledge/types';
import { ACCENT_COMMANDS } from '$lib/languages/latex/knowledge/commands/texCharacters';
import { sourceUnitsIn, type SourceUnit } from '$lib/languages/latex/parser/tree/walk/sourceUnits';
import { bodyOf, type Stretch } from '$lib/languages/latex/parser/tree/walk/stretch';
import { repeatsOf } from '$lib/languages/latex/parser/signatures/packageTable';
import type { TreeArg } from '$lib/languages/latex/parser/tree/walk/treeArgs';
import { templateFeaturesStore } from '$lib/stores/editorStore';
import { projectIntelStore } from '$lib/stores/projectIntel';
import { documentTable } from '../title/documentTable.svelte';
import { ownMacroArguments } from '../own/ownMacroFace.svelte';
import { writtenAtLetter } from './primitiveUnits';
import type { Drawing } from './drawing';

export function signatureOf(name: string) {
	if (ACCENT_COMMANDS.has(name)) return commonCommand(name)?.args;
	return loadedSignatureOf(name) ?? commonCommand(name)?.args;
}

function loadedSignatureOf(name: string) {
	const { macros } = documentTable.current;
	return ownMacroArguments(name) ?? (Object.hasOwn(macros, name) ? macros[name] : undefined);
}

function repeatOf(name: string) {
	return repeatsOf(documentTable.current, name);
}

function titleSignatureOf(name: string) {
	return ACCENT_COMMANDS.has(name) ? commonCommand(name)?.args : loadedSignatureOf(name);
}

export function unitsIn(src: string, s: Stretch, inTitle = false): SourceUnit[] {
	return sourceUnitsIn(src, s, inTitle ? titleSignatureOf : signatureOf, repeatOf);
}
export function argUnits(d: Drawing, arg: TreeArg | undefined): SourceUnit[] {
	return arg?.body ? unitsIn(d.src, arg.body, !!d.title) : [];
}

const parsed = new Map<string, SourceUnit[]>();
const MOST_KEPT = 2000;

function readings(): unknown[] {
	return [documentTable.current, templateFeaturesStore.current.macros, projectIntelStore.current.macros];
}
let parsedWith = readings();

export function unitsOf(source: string): SourceUnit[] {
	const reads = readings();
	if (reads.some((read, i) => read !== parsedWith[i])) {
		parsed.clear();
		parsedWith = reads;
	}
	const atLetter = source.includes('@') && writtenAtLetter(source);
	const key = (atLetter ? '@' : '') + source;
	let units = parsed.get(key);
	if (!units) {
		units = unitsIn(source, bodyOf((atLetter ? latexTreeAtLetter : latexTreeOf)(source).topNode));
		if (parsed.size >= MOST_KEPT) parsed.clear();
		parsed.set(key, units);
	}
	return units;
}

export function textUnitsWith(text: string, signatureOf: (name: string) => readonly Argument[] | undefined): SourceUnit[] {
	return sourceUnitsIn(text, bodyOf(latexTreeOf(text).topNode), signatureOf);
}
