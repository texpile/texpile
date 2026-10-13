// what a file parses with besides its text; guests use the host's so both sides agree

export type SharedParseContext = { macros: string };

export function encodeParseContext(context: SharedParseContext): string {
	return JSON.stringify({ macros: context.macros });
}

export function decodeParseContext(raw: unknown): SharedParseContext | null {
	if (typeof raw !== 'string') return null;
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return null;
	}
	const { macros } = (value ?? {}) as { macros?: unknown };
	return typeof macros === 'string' ? { macros } : null;
}
