import { documentWrapperOf } from '$lib/languages/latex/syntax/documentWrapper';

export function lineStartsOf(lines: string[]): number[] {
	const starts: number[] = [];
	let at = 0;
	for (const line of lines) {
		starts.push(at);
		at += line.length + 1;
	}
	return starts;
}

/** the 1-based line an offset is on */
export function lineNumberAt(src: string, offset: number): number {
	let line = 1;
	for (let at = src.indexOf('\n'); at >= 0 && at < offset; at = src.indexOf('\n', at + 1)) line++;
	return line;
}

export function bodyLineIn(src: string): number {
	const wrapper = documentWrapperOf(src);
	return wrapper ? lineNumberAt(src, wrapper.begin.from) : 0;
}
