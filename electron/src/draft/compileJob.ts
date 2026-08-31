// The compile's TeX-side instrumentation, in ONE place: the job prefix (page-extract
// setup + hooks + the \pdfoutput shim) and the hooks file it inputs at \begin{document}.
// Shared by the cold pass (draftService) and the warm-compile wrapper (draftWarmCompile)
// so the two can never drift -- a warm pass must be the cold pass with the preamble
// already paid for, nothing else.
import * as path from 'node:path';
import * as fs from 'node:fs';

export const OUT = '_draft';

// \pdfoutput is a pdfTeX primitive luatex lacks; many arXiv preambles set it unguarded
// (\pdfoutput=1) and crash lualatex. Define it as a dummy count if absent so the assignment
// is a harmless no-op. Injected before the preamble runs; a no-op for docs that never touch
// it (only defines what isn't there). Mirror of PDF_SHIM in draftDaemon.
export const PDF_SHIM = `\\ifdefined\\pdfoutput\\else\\newcount\\pdfoutput\\fi`;

/** everything that precedes the document in the job: extractor, hooks, shim */
export function jobPrefix(engineDir: string): string {
	const setup = `\\directlua{TEXPILE_ENGINE_DIR='${engineDir}'; TEXPILE_DRAFT_OUT='${OUT}'; dofile('${engineDir}/page-extract.lua')}`;
	const hooks =
		`\\AtBeginDocument{\\directlua{texpile_begindoc(\\the\\inputlineno)}\\input{${OUT}/texpile-hooks.tex}` +
		`\\AddToHook{shipout/before}{\\directlua{page_extract(\\the\\ShipoutBox)}}\\AtEndDocument{\\directlua{page_extract_finish()}}}`;
	return `${setup}${hooks}${PDF_SHIM}`;
}

/** counter-truth wraps live in a FILE, not the job string: their bodies carry #1/#2,
 *  which \AtBeginDocument would need doubled (hook code is stored in a macro), while a
 *  file input at hook time reads them plainly. \the\inputlineno for begindoc expands
 *  BEFORE the input, so it names the main file's \begin{document} line. */
export function writeHooksFile(outAbs: string): void {
	fs.writeFileSync(
		path.join(outAbs, 'texpile-hooks.tex'),
		'\\let\\TexpileOrigStep\\stepcounter\n' +
			'\\renewcommand\\stepcounter[1]{\\TexpileOrigStep{#1}\\directlua{texpile_counters(\\the\\inputlineno)}}\n' +
			'\\let\\TexpileOrigSetC\\setcounter\n' +
			'\\renewcommand\\setcounter[2]{\\TexpileOrigSetC{#1}{#2}\\directlua{texpile_counters(\\the\\inputlineno)}}\n' +
			// each paragraph stamps its own first source line onto the nodes it produces, and
			// clears it again so material outside a paragraph reads as unknown rather than
			// inheriting the last one. The walker reads it back at shipout.
			'\\AddToHook{para/begin}{\\directlua{texpile_para()}}\n' +
			'\\AddToHook{para/end}{\\directlua{texpile_para_end()}}\n'
	);
}
