// what the host parses a file with besides the file: the signatures it read from its TeX and package
// files, and the functions its snippet files give a look. guests parse with the host's, so both agree
import { FUNCTION_NAME } from '$lib/editor/snippets/file/parseSnippetFile';
import { readCallLook } from '$lib/editor/snippets/file/readCallLook';
import type { CallLook } from '$lib/editor/snippets/file/snippetTypes';
import type { CallDialect } from '$lib/editor/snippets/visual/callWrappers';

export type CallLooks = Record<CallDialect, ReadonlyMap<string, CallLook>>;
export type SharedParseContext = { macros: string; looks: CallLooks };

const DIALECTS: readonly CallDialect[] = ['latex', 'typst'];

export function encodeParseContext(context: SharedParseContext): string {
	return JSON.stringify({ macros: context.macros, looks: Object.fromEntries(DIALECTS.map((d) => [d, [...context.looks[d]]])) });
}

/** null when there is nothing readable */
export function decodeParseContext(raw: unknown): SharedParseContext | null {
	if (typeof raw !== 'string') return null;
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return null;
	}
	const { macros, looks } = (value ?? {}) as { macros?: unknown; looks?: Partial<Record<string, unknown>> };
	if (typeof macros !== 'string' || typeof looks !== 'object' || looks === null) return null;
	const read = {} as Record<CallDialect, Map<string, CallLook>>;
	for (const dialect of DIALECTS) {
		read[dialect] = new Map();
		const entries = looks[dialect];
		if (!Array.isArray(entries)) continue;
		for (const entry of entries) {
			if (!Array.isArray(entry) || typeof entry[0] !== 'string' || !FUNCTION_NAME.test(entry[0])) continue;
			const look = readCallLook(entry[1]);
			if (typeof look !== 'string') read[dialect].set(entry[0], look);
		}
	}
	return { macros, looks: read };
}
