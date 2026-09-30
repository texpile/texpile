// What came back from a tinymist export: the files it wrote, or why it wrote nothing, in words.
//
// Its failures arrive as JSON-RPC errors whose message is whatever the Rust side formatted: a Debug
// dump of SourceDiagnostic structs for a standard the document breaks, a quoted diagnostic for a
// document that does not compile, a source location in front of everything else. Shown raw, a
// missing title for PDF/UA reads as a crash.

/** tinymist's OnExportResponse: `{ path }` for one file, `{ items, total_pages }` for paged images */
type ExportResponse = {
	path?: unknown;
	items?: { path?: unknown }[];
};

const DIAGNOSTIC = /message: "((?:[^"\\]|\\.)*)"/;
const QUOTED = /"((?:[^"\\]|\\.)*)"/g;
const NOT_COMPILED = /document is not available for export: "((?:[^"\\]|\\.)*)"/;
// `crates/tinymist/src/task/export.rs:606:17: ExportTask(1): ` and the bare `: ` some errors start with
const LOCATION_PREFIX = /^(?:[\w./\\-]+\.rs:\d+:\d+:\s*)?(?:ExportTask\(\d+\):\s*)?:?\s*/;

/** every file the export wrote, in page order; empty when a page range matched no page */
export function writtenPaths(response: unknown): string[] {
	if (typeof response !== 'object' || response === null) return [];
	const res = response as ExportResponse;
	if (typeof res.path === 'string') return [res.path];
	return (res.items ?? []).map((item) => item.path).filter((p): p is string => typeof p === 'string');
}

/** Rust's Debug escapes: \" \\ \n \t and \u{..} */
function unescapeRust(text: string): string {
	return text.replace(/\\(u\{[0-9a-fA-F]+\}|.)/g, (_all, esc: string) => {
		if (esc.startsWith('u{')) return String.fromCodePoint(parseInt(esc.slice(2, -1), 16));
		return esc === 'n' ? '\n' : esc === 't' ? '\t' : esc;
	});
}

/** each SourceDiagnostic's message, with its hints under it; errors only when there are any */
function diagnosticsText(raw: string): string | null {
	const chunks = raw.split('SourceDiagnostic {').slice(1);
	if (!chunks.length) return null;
	const errors = chunks.filter((c) => c.includes('severity: Error'));
	const lines = (errors.length ? errors : chunks).flatMap((chunk) => {
		const message = DIAGNOSTIC.exec(chunk);
		if (!message) return [];
		const hintsAt = chunk.indexOf('hints: [');
		const hints = hintsAt < 0 ? [] : [...chunk.slice(hintsAt).matchAll(QUOTED)].map((h) => unescapeRust(h[1]));
		return [unescapeRust(message[1]), ...hints.map((h) => `  ${h}`)];
	});
	return lines.length ? lines.join('\n') : null;
}

function rawMessage(err: unknown): string {
	if (err instanceof Error) return err.message;
	if (typeof err === 'object' && err !== null && 'message' in err) return String((err as { message: unknown }).message);
	return String(err);
}

/** a tinymist export failure as something a person can act on */
export function exportErrorText(err: unknown): string {
	const raw = rawMessage(err);
	const diagnostics = diagnosticsText(raw);
	if (diagnostics) return diagnostics;
	const notCompiled = NOT_COMPILED.exec(raw);
	if (notCompiled) return unescapeRust(notCompiled[1]).trim();
	return raw.replace(LOCATION_PREFIX, '').trim() || raw;
}
