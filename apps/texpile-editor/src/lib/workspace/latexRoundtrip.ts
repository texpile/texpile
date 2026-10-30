// the .tex file IS the document: opening splits preamble/body and parses only the body;
// saving regenerates only the body and splices it back under the untouched preamble
import { treeToProseMirror } from '$lib/languages/latex/parser/tree/importTree';
import { documentWrapperOf } from '$lib/languages/latex/syntax/documentWrapper';
import { serializeToLatexDetailed } from '$lib/languages/latex/serializer/latexSerializer';
import { dropParagraphEnd } from '$lib/languages/latex/serializer/paragraphEnds';
import { padTables } from '$lib/editor/visual/padTables';
import { collectMap, shiftMap, type RegionParse, type SourceMap } from '$lib/editor/visual/sourceSpans';
import { rememberParseMap, warnMapDefects, type ParseBody, type ParseOrigins } from '$lib/editor/visual/parseOrigins';
import type { Node } from 'prosemirror-model';
import type { PackageTable } from '$lib/languages/latex/parser/signatures/packageTable';

// the importer runs in max-fidelity mode: unrecognized constructs are preserved as raw/inline LaTeX

const BEGIN = '\\begin{document}';
const END = '\\end{document}';

/** where the real \begin{document} starts, -1 when there is none */
export function documentStart(text: string): number {
	return documentWrapperOf(text)?.begin.from ?? -1;
}

/** whether the text has a real \begin{document}: not commented out, not quoted */
export function hasDocumentEnv(text: string): boolean {
	return documentWrapperOf(text) !== null;
}

export type ParsedLatexFile = {
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
	/** where each run and block of the document came from in the file */
	map: SourceMap;
	/** the signatures it was parsed with, for a later parse of part of it; the base table when absent */
	table?: PackageTable;
	/** what the parse knew about every top-level block, for writing untouched ones back as they were */
	origins: ParseOrigins;
};

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

export function parseLatexFile(
	latex: string,
	projectMacros = '',
	onPhase?: (phase: ParsePhase) => void,
	table?: PackageTable
): ParsedLatexFile {
	onPhase?.('parsing');
	const wrapper = documentWrapperOf(latex);

	let preamble: string;
	let body: string;
	let postamble: string;
	let hadDocumentEnv: boolean;

	if (wrapper?.end) {
		preamble = latex.slice(0, wrapper.begin.to);
		body = latex.slice(wrapper.begin.to, wrapper.end.from);
		postamble = latex.slice(wrapper.end.from);
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
	const { doc: parsedDoc } = treeToProseMirror(body, { preamble: scanPreamble, onPhase, table });
	onPhase?.('finalizing');
	const doc = padTables(parsedDoc);

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

	const map = collectMap(doc, hadDocumentEnv ? preamble.length : 0);
	const origins = rememberParseMap(doc, map, parseBodyOf({ preamble, postamble, hadDocumentEnv }, latex));
	warnMapDefects('latexRoundtrip', origins);
	return { preamble, postamble, doc, hadDocumentEnv, warnings, map, origins, table };
}

/** a stretch of the body parsed as the file is, for a comparison; the map's offsets are the stretch's own */
export function parseLatexRegion(body: string, scanPreamble = '', table?: PackageTable): RegionParse {
	const doc = padTables(treeToProseMirror(body, { preamble: scanPreamble, table }).doc);
	return { doc, map: collectMap(doc, 0) };
}

/** file offset where the body (what the source map's block offsets count from) begins: after the
 *  preamble for a real document, 0 for a fragment whose "preamble" is synthesized and not in the file. */
export function bodyOffsetOf(p: Pick<ParsedLatexFile, 'preamble' | 'hadDocumentEnv'>): number {
	return p.hadDocumentEnv ? p.preamble.length : 0;
}

/** the stretch of `text` the parsed document stands for: the body between preamble and postamble.
 *  Shared by the three dialects: markdown's preamble is its frontmatter, typst has neither. */
export function parseBodyOf(p: Pick<ParsedLatexFile, 'preamble' | 'postamble' | 'hadDocumentEnv'>, text: string): ParseBody {
	return { text, from: bodyOffsetOf(p), to: text.length - (p.hadDocumentEnv ? p.postamble.length : 0) };
}

/**
 * Serializes back to .tex, preserving the preamble and regenerating only the body.
 * A protected edge (verbatim original gap bytes) already carries the true separator, so no
 * padding is added; an unprotected edge gets the conventional single \n.
 */
export function serializeLatexFile(parsed: Pick<ParsedLatexFile, 'preamble' | 'postamble' | 'hadDocumentEnv'>, doc: Node): string {
	return serializeLatexFileDetailed(parsed, doc).text;
}

/** the file text and where every run of `doc` landed in it */
export function serializeLatexFileDetailed(
	parsed: Pick<ParsedLatexFile, 'preamble' | 'postamble' | 'hadDocumentEnv'> & Partial<Pick<ParsedLatexFile, 'origins'>>,
	doc: Node,
	afresh?: ReadonlySet<Node>
): { text: string; map: SourceMap } {
	// a caller holding the parse hands it on, for a document no block of which the parse knows by node
	const { text, leadProtected, tailProtected, leadGap, tailGap, trailingRegenerated, map } = serializeToLatexDetailed(
		doc,
		parsed.origins ?? null,
		afresh
	);
	// fragment file: body IS the entire file, no synthesized wrapper written back. a protected
	// tail reproduces the original bytes through EOF, including a missing trailing newline.
	const body = dropParagraphEnd(text, trailingRegenerated?.node ?? null, trailingRegenerated?.was ?? null, 'end');
	if (parsed.hadDocumentEnv === false) {
		// the line end before a dropped \par would stand in front of the file's own trailing gap, one more each save
		const end = body === text ? body : body.trimEnd();
		return { text: tailProtected ? end : end + (tailGap ?? '\n'), map: shiftMap(map, 0, end.length) };
	}
	// the gap the file had, not a separator of our own: editing the first or the last block would
	// otherwise swallow the blank line it sat behind, and that shows up as a suggestion covering the
	// whole block rather than the words that changed
	const leadSep = leadProtected ? '' : (leadGap ?? '\n');
	const tailSep = tailProtected ? '' : (tailGap ?? '\n');
	const prefix = parsed.preamble.length + leadSep.length;
	return { text: `${parsed.preamble}${leadSep}${body}${tailSep}${parsed.postamble}`, map: shiftMap(map, prefix, prefix + body.length) };
}

/** minimal skeleton for a brand-new .tex, no template system. */
export function createStarterLatex(): string {
	return '\\documentclass{article}\n\n\\begin{document}\n\n\\end{document}\n';
}
