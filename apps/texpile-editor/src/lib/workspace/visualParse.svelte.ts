// Off-main-thread parse of the source text into a visual (ProseMirror) document.
//
// The parse runs in a worker with a size-scaled timeout: parse time is roughly linear, so small
// files keep the snappy 3s fallback while a 1MB paper gets long enough to actually finish instead
// of always dropping to source. A sequence number drops superseded results, so a slow parse can
// never overwrite fresher state.
import type { ParsedLatexFile, ParsePhase } from '$lib/workspace/latexRoundtrip';
import { parseLatexFileAsync, PARSE_TIMEOUT } from '$lib/workspace/latexParserClient';
import { mark } from '$lib/debug/startupDoctor';
import { parsedPackages } from '$lib/languages/latex/intellisense/packages/loadedPackages';
import { readSourceTrees } from '$lib/workspace/sourceTrees';
import { packageTableOf, type PackageTable } from '$lib/languages/latex/parser/signatures/packageTable';
import type { Node as PMNode } from 'prosemirror-model';

const MIN_TIMEOUT_MS = 3000;
const MAX_TIMEOUT_MS = 30000;

/** parse time is roughly linear in the text, so the timeout scales with it */
function timeoutFor(text: string): number {
	return Math.min(MAX_TIMEOUT_MS, MIN_TIMEOUT_MS + Math.floor(text.length / 100));
}

async function tableFor(text: string, format: 'tex' | 'md'): Promise<PackageTable | undefined> {
	return format === 'tex' ? packageTableOf(await parsedPackages(text)) : undefined;
}

export type ParseFailure = {
	timeout: boolean;
	message: string;
};

export type ParseOutcome = {
	parsed?: ParsedLatexFile;
	failure?: ParseFailure;
};

export class VisualParser {
	/** which stage the in-flight parse reached, for the visual-mode loading bar; null = idle */
	progress = $state<ParsePhase | null>(null);
	/** text we last successfully parsed; re-parsing identical text would flash a remount */
	lastParsedSource: string | null = null;
	private sequence = 0;

	constructor(private getMacros: () => string) {}

	/** claim the next sequence number; pass it back to `isCurrent` when the parse resolves */
	nextSequence(): number {
		return ++this.sequence;
	}

	isCurrent(seq: number): boolean {
		return seq === this.sequence;
	}

	/** the document `text` parses to, for the save check: the same parse as `parse`, with nothing
	 *  shown while it runs; null when it cannot be parsed now, which leaves the file as serialized */
	async reparse(text: string, format: 'tex' | 'md' | 'typ'): Promise<PMNode | null> {
		try {
			if (format === 'typ') {
				const { parseTypstFile } = await import('$lib/languages/typst/visual/roundtrip');
				return parseTypstFile(text, this.getMacros()).doc;
			}
			const table = await tableFor(text, format);
			return (await parseLatexFileAsync(text, this.getMacros(), timeoutFor(text), undefined, format, table)).doc;
		} catch {
			return null;
		}
	}

	/** The failure is RETURNED rather than handled here: only the caller knows whether its parse is
	 * still the current one, and a superseded parse must not yank the user out of visual mode.
	 * `shown` false: a parked editor's file, whose parse puts up no loading bar. `abandon` settles a parse nobody waits for */
	async parse(text: string, format: 'tex' | 'md' | 'typ' = 'tex', shown = true, abandon?: AbortSignal): Promise<ParseOutcome> {
		mark('parse');
		if (format === 'typ') return this.parseTypst(text, shown);
		try {
			const timeoutMs = timeoutFor(text);
			if (shown) this.progress = 'parsing';
			const progress = shown ? (p: ParsePhase) => (this.progress = p) : undefined;
			const table = await tableFor(text, format);
			const parsed = await parseLatexFileAsync(text, this.getMacros(), timeoutMs, progress, format, table, abandon);
			// the readers of the file's source ask for its trees, which a worker's parse leaves here unread
			if (format === 'tex') await readSourceTrees(text);
			// the editor is built in a task of its own, apart from rebuilding the document the worker sent
			await new Promise((next) => setTimeout(next));
			return { parsed };
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			return { failure: { timeout: msg === PARSE_TIMEOUT, message: msg } };
		} finally {
			if (shown) this.progress = null;
		}
	}

	/** Typst parses on the main thread: its wasm is already loaded here for CodeMirror */
	private async parseTypst(text: string, shown: boolean): Promise<ParseOutcome> {
		try {
			if (shown) this.progress = 'parsing';
			mark('typst-import');
			const { parseTypstFile } = await import('$lib/languages/typst/visual/roundtrip');
			mark('typst-ready');
			return { parsed: parseTypstFile(text, this.getMacros()) };
		} catch (e) {
			return { failure: { timeout: false, message: e instanceof Error ? e.message : String(e) } };
		} finally {
			if (shown) this.progress = null;
		}
	}
}
