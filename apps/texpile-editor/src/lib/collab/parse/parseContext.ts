// what a file parses with besides its text; guests use the host's so both sides agree
import { isEngine, type Engine } from '$lib/workspace/compileCommand';

/** engine: the host's compile engine, which decides what its packages load */
export type SharedParseContext = { macros: string; engine: Engine | null };

export function encodeParseContext(context: SharedParseContext): string {
	return JSON.stringify({ macros: context.macros, engine: context.engine });
}

export function decodeParseContext(raw: unknown): SharedParseContext | null {
	if (typeof raw !== 'string') return null;
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return null;
	}
	const { macros, engine } = (value ?? {}) as { macros?: unknown; engine?: unknown };
	return typeof macros === 'string' ? { macros, engine: isEngine(engine) ? engine : null } : null;
}
