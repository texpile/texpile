// where a file's written names are read from: Typst and Markdown from its own folder, LaTeX from the folder TeX runs in
import { searchDirsIn } from '$lib/languages/latex/knowledge/calls/fileCommands';
import { documentWrapperOf } from '$lib/languages/latex/syntax/documentWrapper';
import { codeOnly } from '$lib/languages/latex/texCode';
import { inDir } from './texFileRefs';
import type { RefDialect, RefPlace } from './fileRefs';

function folderOf(rel: string): string {
	return rel.slice(0, Math.max(0, rel.lastIndexOf('/')));
}

function isAbsolute(dir: string): boolean {
	return dir.startsWith('/') || /^[A-Za-z]:/.test(dir);
}

/** `fileRel` and `mainRel` are root-relative; a file with its own \begin{document} is compiled where it sits */
export function refPlaceOf(dialect: RefDialect, fileRel: string, mainRel: string | null, text: string, mainText: string): RefPlace {
	if (dialect !== 'tex') return { folder: folderOf(fileRel), graphicDirs: [] };
	const own = !!documentWrapperOf(text) || mainRel === null;
	const dirs = [...searchDirsIn(codeOnly(text)), ...(own ? [] : searchDirsIn(codeOnly(mainText)))];
	return {
		folder: folderOf(own ? fileRel : mainRel),
		graphicDirs: [...new Set(dirs.filter((d) => !isAbsolute(d)).map((d) => inDir('', d)))]
	};
}
