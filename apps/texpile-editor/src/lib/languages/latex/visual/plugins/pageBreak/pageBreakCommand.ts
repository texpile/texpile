// a page break as its one setting, which command it is
import { PAGE_BREAKS as PAGE_BREAK_NAMES } from '$lib/languages/latex/visual/core';
export const PAGE_BREAKS = [...PAGE_BREAK_NAMES];

const PAGE_BREAK = new RegExp(String.raw`^(\s*\\)(${PAGE_BREAKS.join('|')})((?:\{\})?\s*)$`);

export function readPageBreak(source: string): string | null {
	return PAGE_BREAK.exec(source)?.[2] ?? null;
}

export function writePageBreak(source: string, name: string): string {
	return source.replace(PAGE_BREAK, (_, lead: string, _name: string, trail: string) => lead + name + trail);
}
