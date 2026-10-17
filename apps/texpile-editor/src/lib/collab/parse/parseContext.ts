// what a file parses with besides its text; guests use the host's so both sides agree
import { isEngine, type Engine } from '$lib/workspace/compileCommand';
import { parsePackageFile } from '$lib/languages/latex/knowledge/userFiles';
import type { PackageFile } from '$lib/languages/latex/knowledge/types';

/** engine: the host's compile engine, which decides what its packages load; files: what its TeX reported for packages
 * Texpile ships no file for */
export type SharedParseContext = { macros: string; engine: Engine | null; files: Record<string, PackageFile> };

export function encodeParseContext(context: SharedParseContext): string {
	return JSON.stringify({ macros: context.macros, engine: context.engine, files: context.files });
}

function filesIn(value: unknown): Record<string, PackageFile> {
	const files: Record<string, PackageFile> = {};
	if (!value || typeof value !== 'object') return files;
	for (const [name, file] of Object.entries(value)) {
		const { contents } = parsePackageFile(JSON.stringify(file));
		if (contents) files[name] = contents;
	}
	return files;
}

export function decodeParseContext(raw: unknown): SharedParseContext | null {
	if (typeof raw !== 'string') return null;
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return null;
	}
	const { macros, engine, files } = (value ?? {}) as { macros?: unknown; engine?: unknown; files?: unknown };
	return typeof macros === 'string' ? { macros, engine: isEngine(engine) ? engine : null, files: filesIn(files) } : null;
}
