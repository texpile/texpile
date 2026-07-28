// the .tex file IS the document: opening splits preamble/body and parses only the body;
// saving regenerates only the body and splices it back under the untouched preamble
import * as LatexParser from '$lib/latex-parser';
import { serializeToLatexDetailed, serializeNode } from '$lib/serializer/latexSerializer';
import { Fragment } from 'prosemirror-model';
import type { Node } from 'prosemirror-model';

// the importer runs in max-fidelity mode: unrecognized constructs are preserved as raw/inline LaTeX

const BEGIN = '\\begin{document}';
const END = '\\end{document}';

/** true if the character at idx is commented out (an unescaped % precedes it on its line). */
function isCommented(text: string, idx: number): boolean {
	for (let i = idx - 1; i >= 0 && text[i] !== '\n'; i--) {
		if (text[i] === '%' && (i === 0 || text[i - 1] !== '\\')) return true;
	}
	return false;
}

/** indexOf, skipping occurrences that sit inside a LaTeX comment. */
function uncommentedIndexOf(text: string, marker: string, last = false): number {
	let found = -1;
	for (let from = text.indexOf(marker); from >= 0; from = text.indexOf(marker, from + 1)) {
		if (isCommented(text, from)) continue;
		if (!last) return from;
		found = from;
	}
	return found;
}

export interface ParsedLatexFile {
	/** Everything up to and including \begin{document} (preserved verbatim on save). */
	preamble: string;
	/** \end{document} and anything after it (preserved verbatim on save). */
	postamble: string;
	/** Editor document (a ProseMirror Node) parsed from the document body. */
	doc: Node;
	/** Whether the source actually had a \begin{document}...\end{document} wrapper. */
	hadDocumentEnv: boolean;
	/** Non-fatal notes (e.g. raw LaTeX that could not be converted). */
	warnings: string[];
}

/**
 * Fills orig.norm on top-level blocks: the block's deterministic serialization at parse time.
 * The serializer re-emits the original orig.latex slice only while the block still serializes
 * to exactly norm, so any edit falls back to regeneration. A block that fails to serialize
 * keeps norm null and always regenerates.
 */
function fillOrigNorms(doc: Node): Node {
	let changed = false;
	const kids: Node[] = [];
	for (let i = 0; i < doc.childCount; i++) {
		const child = doc.child(i);
		const orig = (child.attrs as { orig?: { latex?: unknown; norm?: unknown } | null }).orig;
		if (orig && typeof orig.latex === 'string' && orig.norm == null) {
			try {
				const norm = serializeNode(child, {
					parent: doc,
					index: i,
					isLastChild: i === doc.childCount - 1,
					inTableCell: false
				});
				kids.push(child.type.create({ ...child.attrs, orig: { ...orig, norm } }, child.content, child.marks));
				changed = true;
				continue;
			} catch {
				// leave norm unset, the safe direction: this block always regenerates
			}
		}
		kids.push(child);
	}
	return changed ? doc.copy(Fragment.fromArray(kids)) : doc;
}

/** counts raw_latex / inline_latex nodes (constructs the parser couldn't model). */
function countRaw(doc: Node): number {
	let n = 0;
	doc.descendants((node) => {
		if (node.type.name === 'raw_latex' || node.type.name === 'inline_latex') n++;
		return true;
	});
	return n;
}

/**
 * Parses a .tex file's text into a preserved preamble + an editor document. projectMacros is
 * macro-defining text from the main file's include chain (workspace/project.ts), scanned for
 * \newcommand signatures only, never written back.
 */
export type ParsePhase = 'parsing' | 'building' | 'finalizing';

export function parseLatexFile(latex: string, projectMacros = '', onPhase?: (phase: ParsePhase) => void): ParsedLatexFile {
	onPhase?.('parsing');
	// a \begin{document} that only appears inside a comment must not count as the real
	// wrapper, or the file gets mis-split and corrupted on save
	const bi = uncommentedIndexOf(latex, BEGIN);
	const ei = uncommentedIndexOf(latex, END, true);

	let preamble: string;
	let body: string;
	let postamble: string;
	let hadDocumentEnv: boolean;

	if (bi >= 0 && ei > bi) {
		preamble = latex.slice(0, bi + BEGIN.length);
		body = latex.slice(bi + BEGIN.length, ei);
		postamble = latex.slice(ei);
		hadDocumentEnv = true;
	} else {
		// fragment with no document environment: the whole thing is the body,
		// synthesize a minimal wrapper so it stays a valid standalone file
		preamble = `\\documentclass{article}\n${BEGIN}`;
		body = latex;
		postamble = END;
		hadDocumentEnv = false;
	}

	// the parser only sees the body, so pass the preamble plus any cross-file
	// project macros for \newcommand signature scanning
	const scanPreamble = projectMacros ? `${projectMacros}\n${preamble}` : preamble;
	const { doc: parsedDoc } = LatexParser.latexToProseMirror(body, { preamble: scanPreamble, onPhase });
	onPhase?.('finalizing');
	// complete the verbatim stamps: untouched blocks then round-trip byte-for-byte
	const doc = fillOrigNorms(parsedDoc);

	// dev-only tripwire: a doc that violates the content model renders fine but freezes the editor
	// on the first structural edit (PM throws mid-dispatch). production still opens the file, degraded.
	if (import.meta.env.DEV) {
		try {
			doc.check();
		} catch (e) {
			console.error('[latexRoundtrip] parsed doc violates the schema content model:', e);
		}
	}

	const rawCount = countRaw(doc);
	const warnings: string[] = [];
	if (rawCount > 0) {
		warnings.push(
			`${rawCount} LaTeX construct${rawCount > 1 ? 's' : ''} could not be converted and ${rawCount > 1 ? 'are' : 'is'} preserved as raw LaTeX.`
		);
	}

	return { preamble, postamble, doc, hadDocumentEnv, warnings };
}

/** file offset where the body (what orig.start counts from) begins: after the preamble for a
 *  real document, 0 for a fragment whose "preamble" is synthesized and not in the file. */
export const bodyOffsetOf = (p: Pick<ParsedLatexFile, 'preamble' | 'hadDocumentEnv'>): number => (p.hadDocumentEnv ? p.preamble.length : 0);

/**
 * Serializes back to .tex, preserving the preamble and regenerating only the body.
 * A protected edge (verbatim original gap bytes) already carries the true separator, so no
 * padding is added; an unprotected edge gets the conventional single \n.
 */
export function serializeLatexFile(parsed: Pick<ParsedLatexFile, 'preamble' | 'postamble' | 'hadDocumentEnv'>, doc: Node): string {
	const { text: body, leadProtected, tailProtected } = serializeToLatexDetailed(doc);
	// fragment file: body IS the entire file, no synthesized wrapper written back. a protected
	// tail reproduces the original bytes through EOF, including a missing trailing newline.
	if (parsed.hadDocumentEnv === false) return tailProtected ? body : body + '\n';
	// postamble runs to EOF and usually ends with \n; normalize its trailing newlines
	// to exactly one or the file grows a blank line per save
	const tail = parsed.postamble.replace(/\n+$/, '') + '\n';
	const leadSep = leadProtected ? '' : '\n';
	const tailSep = tailProtected ? '' : '\n';
	return `${parsed.preamble}${leadSep}${body}${tailSep}${tail}`;
}

/** minimal skeleton for a brand-new .tex, no template system. */
export function createStarterLatex(): string {
	return '\\documentclass{article}\n\n\\begin{document}\n\n\\end{document}\n';
}
