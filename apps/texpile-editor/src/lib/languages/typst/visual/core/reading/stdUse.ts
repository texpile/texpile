// a chip that is one call of Typst's own function, with what the data says of it
import { stdEntry, type TypstEntry } from '../../../knowledge';
import { readTypstCall, withoutTrailingLabel, type TypstCall } from './typstCall';
import { typstScopeOfDrawing } from '../scope/fileScopeNow.svelte';

export type StdUse = { call: TypstCall; entry: TypstEntry; source: string };

export function stdEntryOf(path: string, written: string): TypstEntry | null {
	const scope = typstScopeOfDrawing(written);
	if (!scope) return stdEntry(path);
	const found = scope.lookup(path);
	return found?.origin === 'std' ? found.entry : null;
}

let last: { source: string; scope: unknown; use: StdUse | null } | null = null;

export function readStdUse(source: string): StdUse | null {
	const written = source.trim();
	const scope = typstScopeOfDrawing(written);
	if (last && last.source === written && last.scope === scope) return last.use;
	const call = readTypstCall(withoutTrailingLabel(written));
	const entry = call?.form === 'call' ? stdEntryOf(call.name, written) : null;
	const use = call && entry ? { call, entry, source: written } : null;
	last = { source: written, scope, use };
	return use;
}
