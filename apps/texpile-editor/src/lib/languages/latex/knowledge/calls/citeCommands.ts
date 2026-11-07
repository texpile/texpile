import { commonCommand, commandNames, rolesOf } from './commandCalls';
import type { CiteForm } from '../types';

const PRINTED: ReadonlySet<CiteForm> = new Set([
	'plain',
	'paren',
	'paren-bare',
	'text',
	'text-bare',
	'author',
	'year',
	'year-paren',
	'title',
	'auto'
]);

let names: Set<string> | null = null;

export function citeFormOf(command: string): CiteForm | null {
	return commonCommand(command.replace(/\*$/, ''))?.cite ?? null;
}

export function aliasCiteForm(command: string): 'text' | 'paren' | null {
	if (!command.endsWith('alias')) return null;
	const form = citeFormOf(command.slice(0, -'alias'.length));
	return form === 'text' || form === 'paren' ? form : null;
}

export function citationCommands(): ReadonlySet<string> {
	names ??= new Set(
		commandNames(['citekey']).filter((name) => {
			const reading = commonCommand(name);
			const form = reading?.cite;
			if (!reading || !form || !PRINTED.has(form) || reading.repeat?.length) return false;
			const keys = reading.args.filter((a) => a.kind === 'm');
			return keys.length === 1 && rolesOf(keys[0]).includes('citekey') && reading.args.every((a) => /^(?:[so]|m|d<>)$/.test(a.kind));
		})
	);
	return names;
}

const FACE_FORMS: ReadonlySet<CiteForm> = new Set([...PRINTED, 'foot', 'super', 'full']);

let faceNames: Set<string> | null = null;

export function citationFaceCommands(): ReadonlySet<string> {
	faceNames ??= new Set(
		commandNames(['citekey']).filter((name) => {
			const reading = commonCommand(name);
			if (!reading?.cite || !FACE_FORMS.has(reading.cite)) return false;
			const all = [...reading.args, ...(reading.repeat ?? [])];
			const keys = all.filter((a) => a.kind === 'm');
			return (
				keys.length === 1 + (reading.repeat?.length ? 1 : 0) &&
				keys.every((a) => rolesOf(a).includes('citekey')) &&
				all.every((a) => /^(?:[so]|m|d<>|d\(\))$/.test(a.kind))
			);
		})
	);
	return faceNames;
}

const labelCounts = new Map<string, number>();

function referencedLabels(command: string): number {
	let found = labelCounts.get(command);
	if (found === undefined) {
		const args = commonCommand(command.replace(/\*$/, ''))?.args;
		const labels = args?.filter((a) => a.kind === 'm') ?? [];
		const names =
			!!args &&
			labels.length >= 1 &&
			labels.length <= 2 &&
			labels.every((a) => a.defines === undefined && rolesOf(a).includes('label') && (labels.length === 1 || !a.list)) &&
			args.every((a) => /^(?:[so]|m)$/.test(a.kind));
		found = names ? labels.length : 0;
		labelCounts.set(command, found);
	}
	return found;
}

export function referencesLabel(command: string): boolean {
	return referencedLabels(command) > 0;
}

export function referencesRange(command: string): boolean {
	return referencedLabels(command) === 2;
}
