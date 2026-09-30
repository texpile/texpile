// the .typ file IS the document, same fidelity model as latexRoundtrip and the markdown side.
// Typst has no preamble/frontmatter split: code-mode preludes (#import/#set/#show) are ordinary
// top-level raw blocks, written back as their bytes like every other untouched block. The
// ParsedLatexFile shape is reused wholesale so the buffer/worker/view plumbing needs no parallel
// types: preamble = '', postamble = '', hadDocumentEnv = false.
import { typstToProseMirror } from './convert/converter';
import { serializeToTypstDetailed } from './serialize/serializer';
import { padTables } from '$lib/editor/visual/padTables';
import { collectMap, shiftMap, type RegionParse, type SourceMap } from '$lib/editor/visual/sourceSpans';
import { rememberParseMap, warnMapDefects } from '$lib/editor/visual/parseOrigins';
import type { Node } from 'prosemirror-model';
import type { ParsedLatexFile, ParsePhase } from '$lib/workspace/latexRoundtrip';

export function parseTypstFile(source: string, _projectMacros = '', onPhase?: (phase: ParsePhase) => void): ParsedLatexFile {
	onPhase?.('parsing');
	const { doc: parsedDoc } = typstToProseMirror(source);
	onPhase?.('finalizing');
	const doc = padTables(parsedDoc);

	if (import.meta.env.DEV) {
		try {
			doc.check();
		} catch (e) {
			console.error('[typstRoundtrip] parsed doc violates the schema content model:', e);
		}
	}

	// the parser reads the markup after a byte order mark, so its offsets count from there
	const bom = source.startsWith('\uFEFF') ? 1 : 0;
	const map = collectMap(doc, bom);
	const origins = rememberParseMap(doc, map, { text: source, from: bom, to: source.length });
	warnMapDefects('typstRoundtrip', origins);
	return { preamble: '', postamble: '', doc, hadDocumentEnv: false, warnings: [], map, origins };
}

/** a stretch of the file parsed as the file is, for a comparison; the map's offsets are the stretch's own */
export function parseTypstRegion(source: string): RegionParse {
	const doc = padTables(typstToProseMirror(source).doc);
	return { doc, map: collectMap(doc, 0) };
}

/** Serializes back to .typ (a protected tail reproduces the exact original trailing bytes,
 *  including a missing final newline). A file that opened with a BOM keeps it. */
export function serializeTypstFile(parsed: Pick<ParsedLatexFile, 'preamble' | 'postamble' | 'hadDocumentEnv'>, doc: Node): string {
	return serializeTypstFileDetailed(parsed, doc).text;
}

/** the file text and where every run of `doc` landed in it */
export function serializeTypstFileDetailed(
	parsed: Pick<ParsedLatexFile, 'preamble' | 'postamble' | 'hadDocumentEnv'> & Partial<Pick<ParsedLatexFile, 'origins'>>,
	doc: Node,
	afresh?: ReadonlySet<Node>
): { text: string; map: SourceMap } {
	const { text: body, tailProtected, map } = serializeToTypstDetailed(doc, parsed.origins ?? null, afresh);
	const file = doc.attrs.typFile as { bom?: boolean; eol?: string } | null;
	const eol = file?.eol === '\r\n' ? '\r\n' : '\n';
	const withTail = body + (tailProtected ? '' : eol);
	const bom = file?.bom && !withTail.startsWith('\uFEFF') ? '\uFEFF' : '';
	return { text: bom + withTail, map: shiftMap(map, bom.length, bom.length + body.length) };
}
