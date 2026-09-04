// Off-main-thread parse of the source text into a visual (ProseMirror) document.
//
// The parse runs in a worker with a size-scaled timeout: parse time is roughly linear, so small
// files keep the snappy 3s fallback while a 1MB paper gets long enough to actually finish instead
// of always dropping to source. A sequence number drops superseded results, so a slow parse can
// never overwrite fresher state.
import type { ParsedLatexFile, ParsePhase } from '$lib/workspace/latexRoundtrip';
import { parseLatexFileAsync, PARSE_TIMEOUT, PARSE_TOO_COMPLEX } from '$lib/workspace/latexParserClient';
import { mark } from '$lib/debug/startupDoctor';

// ProseMirror renders the whole doc with no virtualization and builds a node view per
// math/raw/citation node, so past a certain size the mount locks the renderer for minutes and no
// timeout can save it (the parse already succeeded). Empirical: a healthy 245KB paper is ~14k
// nodes, while a 1.9MB paper whose \def-aliased environments defeat the parser reaches 322k
// (104k of them node views) and never finishes mounting.
const MAX_VISUAL_NODES = 100_000;
const MIN_TIMEOUT_MS = 3000;
const MAX_TIMEOUT_MS = 30000;

export type ParseFailure = {
	timeout: boolean;
	message: string;
	/** doc parsed but is too large to render; carries the node count for the message */
	tooComplex?: number;
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

	/** The failure is RETURNED rather than handled here: only the caller knows whether its parse is
	 * still the current one, and a superseded parse must not yank the user out of visual mode. */
	async parse(text: string, format: 'tex' | 'md' | 'typ' = 'tex'): Promise<ParseOutcome> {
		mark('parse');
		if (format === 'typ') return this.parseTypst(text);
		try {
			const timeoutMs = Math.min(MAX_TIMEOUT_MS, MIN_TIMEOUT_MS + Math.floor(text.length / 100));
			this.progress = 'parsing';
			return { parsed: await parseLatexFileAsync(text, this.getMacros(), timeoutMs, (p) => (this.progress = p), MAX_VISUAL_NODES, format) };
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			// TODO: unified-latex's PEG tokenizer throws "RangeError: Invalid array length" on very
			// large inputs (upstream, inside grammars/latex.pegjs peg$parseescape). Structure-
			// dependent rather than a size cutoff: a 1.6MB slice parses, 1.8MB throws, yet a real
			// 1.82MB paper is fine. Reaches the user as that raw string in a toast; give it the same
			// friendly source-mode wording as tooComplex, and recheck when @unified-latex is bumped.
			const timeout = msg === PARSE_TIMEOUT;
			const tooComplex = msg.startsWith(`${PARSE_TOO_COMPLEX}:`) ? Number(msg.slice(PARSE_TOO_COMPLEX.length + 1)) : undefined;
			return { failure: { timeout, tooComplex, message: msg } };
		} finally {
			this.progress = null;
		}
	}

	/** Typst parses ON the main thread: its parser is Typst's own compiled incremental parser
	 * (linear, milliseconds even on MB files) and its wasm is already loaded here for CodeMirror
	 * highlighting. The worker exists to sandbox unified-latex's runaway recursive PEG, which has
	 * no Typst analogue — and a worker build would need its own wasm pipeline for nothing. The
	 * node-count ceiling still applies: it guards the RENDERER, which is dialect-blind. */
	private async parseTypst(text: string): Promise<ParseOutcome> {
		try {
			this.progress = 'parsing';
			mark('typst-import');
			const { parseTypstFile } = await import('$lib/languages/typst/visual/roundtrip');
			mark('typst-ready');
			const parsed = parseTypstFile(text, this.getMacros());
			let nodeCount = 0;
			parsed.doc.descendants(() => {
				nodeCount++;
				return true;
			});
			if (nodeCount > MAX_VISUAL_NODES) {
				return { failure: { timeout: false, tooComplex: nodeCount, message: `${PARSE_TOO_COMPLEX}:${nodeCount}` } };
			}
			return { parsed };
		} catch (e) {
			return { failure: { timeout: false, message: e instanceof Error ? e.message : String(e) } };
		} finally {
			this.progress = null;
		}
	}
}
