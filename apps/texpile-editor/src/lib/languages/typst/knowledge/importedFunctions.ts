// the functions a file's package imports bring into scope that take a body, which Insert offers per package
import { variadicBody } from './callMeaning';
import { packageEntry, type ScopedEntry } from './fileScope';
import { packageSpecOf } from './packageSpec';
import { importsOf, moduleNameOf } from './scan/moduleScope';
import { typstTop } from './scan/syntax';
import type { TypstEntry, TypstPackageFile } from './types';

type PackageReader = (spec: string) => TypstPackageFile | null | undefined;

export type ImportedFunction = { name: string; entry: TypstEntry; shape: 'block' | 'inline' };

export type ImportedPackage = { spec: string; name: string; functions: ImportedFunction[] };

const BODY_NAMES = new Set(['body', 'content']);
const MOST_HOPS = 8;

function shapeOf({ entry, aliased }: ScopedEntry): ImportedFunction['shape'] | null {
	if (entry.kind !== 'function' || entry.hidden) return null;
	const params = entry.params ?? [];
	const single = params.find((p) => p.positional && !p.variadic && (p.content || BODY_NAMES.has(p.name)));
	const body = single ?? variadicBody(entry);
	// a template sets the title block, and a call that needs another argument cannot wrap content alone
	if (!body || params.some((p) => p.part || (p.positional && p.required && p !== body))) return null;
	if (entry.block === true || entry.block === 'content') return 'block';
	// a package that gives every icon a name of its own has thousands of aliases, so only a block one counts
	return entry.block === false && single && !aliased ? 'inline' : null;
}

function exportedNames(spec: string, read: PackageReader, hops = 0): string[] {
	const file = read(spec);
	if (!file || hops > MOST_HOPS) return [];
	const out = new Set(Object.keys(file.names));
	for (const [other, names] of Object.entries(file.reexports ?? {}))
		for (const name of names === '*' ? exportedNames(other, read, hops + 1) : names) out.add(name);
	return [...out];
}

export function importedSpecs(source: string): string[] {
	return [...new Set(importsOf(typstTop(source), source).flatMap((imp) => (packageSpecOf(imp.spec) ? [imp.spec] : [])))];
}

export function importedFunctions(source: string, read: PackageReader): ImportedPackage[] {
	const parts = new Map<string, ImportedPackage>();
	for (const imp of importsOf(typstTop(source), source)) {
		const parsed = imp.spec.startsWith('@') ? packageSpecOf(imp.spec) : null;
		if (!parsed) continue;
		const prefix = imp.items === null || imp.as ? `${imp.as ?? moduleNameOf(imp.spec)}.` : '';
		const bound = Array.isArray(imp.items)
			? imp.items.map((item) => ({ written: item.as, name: item.name }))
			: exportedNames(imp.spec, read).map((name) => ({ written: prefix + name, name }));
		const part = parts.get(imp.spec) ?? { spec: imp.spec, name: parsed.name, functions: [] };
		for (const { written, name } of bound) {
			const found = name.startsWith('_') ? null : packageEntry(imp.spec, name, read);
			const shape = found ? shapeOf(found) : null;
			if (found && shape && !part.functions.some((f) => f.name === written))
				part.functions.push({ name: written, entry: found.entry, shape });
		}
		parts.set(imp.spec, part);
	}
	return [...parts.values()].filter((part) => part.functions.length);
}
