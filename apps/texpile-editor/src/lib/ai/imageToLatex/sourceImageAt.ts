// The picture a line of source includes at a column, by the path it is written with
import type { ImageDialect } from './imagePrompt';

const INCLUDES: Record<ImageDialect, RegExp> = {
	latex: /\\includegraphics\*?\s*(?:\[[^\]]*\])?\s*\{([^}]+)\}/g,
	typst: /image\(\s*"((?:[^"\\]|\\.)+)"/g,
	markdown: /!\[[^\]]*\]\(<?([^)\s>]+)>?[^)]*\)/g
};

export function imageSrcAt(line: string, column: number, dialect: ImageDialect): string | null {
	for (const hit of line.matchAll(INCLUDES[dialect])) {
		if (column >= hit.index! && column <= hit.index! + hit[0].length) return hit[1].trim();
	}
	return null;
}

/** the end of the include of `src` nearest `near` */
export function imageIncludeEnd(text: string, src: string, near: number, dialect: ImageDialect): number | null {
	let found: number | null = null;
	for (const hit of text.matchAll(INCLUDES[dialect])) {
		if (hit[1].trim() !== src) continue;
		const end = hit.index! + hit[0].length;
		if (found === null || Math.abs(end - near) < Math.abs(found - near)) found = end;
	}
	return found;
}

export function imageDialectOf(path: string): ImageDialect {
	if (/\.typ$/i.test(path)) return 'typst';
	if (/\.(md|markdown)$/i.test(path)) return 'markdown';
	return 'latex';
}
