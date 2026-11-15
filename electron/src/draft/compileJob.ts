// The job every draft engine runs: page-extract and teleport set up, the hooks, the \pdfoutput shim, then the main
// file. One job for every process, so a teleport starts from the same base the full compile recorded against.
import * as path from 'node:path';
import * as fs from 'node:fs';
import { skipDir, TREE_IGNORE_DIRS } from '../fs/walkIgnoreRules';

export const OUT = '_draft';

// \pdfoutput is a pdfTeX primitive luatex lacks; many arXiv preambles set it unguarded
export const PDF_SHIM = `\\ifdefined\\pdfoutput\\else\\newcount\\pdfoutput\\fi`;

/** `out` is the process's own folder under _draft; `wait` holds it at the base for GO or a teleport plan */
export function engineJob(engineDir: string, out: string, mainRel: string, wait: boolean): string {
	const setup =
		`\\directlua{TEXPILE_ENGINE_DIR='${engineDir}'; TEXPILE_DRAFT_OUT='${out}'; TEXPILE_TELE_OUT='${out}/tele'; ` +
		`TEXPILE_TELE_WAIT=${wait}; dofile('${engineDir}/page-extract.lua'); dofile('${engineDir}/teleport/teleport.lua')}`;
	// \the\inputlineno expands before the input, so begindoc names the main file's \begin{document} line
	const hooks =
		`\\AtBeginDocument{\\directlua{texpile_begindoc(\\the\\inputlineno)}\\input{${out}/texpile-hooks.tex}` +
		`\\AddToHook{shipout/before}{\\directlua{page_extract(\\the\\ShipoutBox)}}\\AddToHook{shipout/after}{\\directlua{texpile_tele_shipped()}}` +
		`\\AtEndDocument{\\directlua{page_extract_finish()}}}` +
		`\\AddToHook{begindocument/end}{\\directlua{texpile_tele_begin_end()}}\\AddToHook{enddocument}[texpile]{\\directlua{texpile_tele_bye()}}` +
		`\\AddToHook{enddocument/afterlastpage}{\\directlua{page_extract_last() texpile_tele_end()}}`;
	// an engine's input carries its commands, and \showoutput (or a stray \errorstopmode) would have TeX wait there
	const noPrompts = `\\let\\errorstopmode\\nonstopmode\\let\\scrollmode\\nonstopmode`;
	return `${setup}${hooks}${noPrompts}${PDF_SHIM}\\input{${mainRel}}`;
}

/** read at \begin{document}: each paragraph stamps its first source line onto what it produces */
export function writeHooksFile(outAbs: string): void {
	fs.writeFileSync(
		path.join(outAbs, 'texpile-hooks.tex'),
		'\\AddToHook{para/begin}{\\directlua{texpile_para()}}\n\\AddToHook{para/end}{\\directlua{texpile_para_end()}}\n'
	);
}

// \include{chapters/intro} writes chapters/intro.aux under -output-directory, and TeX stops when that folder is missing
export function mirrorSourceFolders(root: string, outAbs: string): void {
	let left = 500;
	function walk(rel: string, depth: number): void {
		let entries: fs.Dirent[];
		try {
			entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
		} catch {
			return;
		}
		if (rel && entries.some((e) => e.isFile() && e.name.endsWith('.tex'))) fs.mkdirSync(path.join(outAbs, rel), { recursive: true });
		for (const e of entries)
			if (e.isDirectory() && !skipDir(e.name, TREE_IGNORE_DIRS) && depth < 8 && left-- > 0) walk(path.join(rel, e.name), depth + 1);
	}
	walk('', 0);
}
