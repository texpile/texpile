import { commonRegistry } from './registries';

/** the extensions a compile writes beside the main file: the aux files and the float list files (lof, lot, ..) */
export function sidecarExtensions(): string[] {
	const lists = commonRegistry('floats').flatMap((f) => (f.list ? [f.list] : []));
	return [...new Set([...commonRegistry('auxFiles').map((a) => a.ext), ...lists])];
}

/** the extensions a pass reads back by \jobname: those the engine writes itself (aux, toc, the float lists) and those another program writes (bbl, ind) */
export function readBackExtensions(): { byTex: string[]; byTools: string[] } {
	const read = commonRegistry('auxFiles').filter((a) => a.readBack);
	const lists = commonRegistry('floats').flatMap((f) => (f.list ? [f.list] : []));
	return {
		byTex: [...new Set([...read.filter((a) => a.writtenBy === 'tex').map((a) => a.ext), ...lists])],
		byTools: [...new Set(read.filter((a) => a.writtenBy !== 'tex').map((a) => a.ext))]
	};
}
