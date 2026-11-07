// a raw chip whose source is code without its hash: the argument of a call the editor draws (a figure's body, a cell)
const CODE_START = /^\s*[\p{L}_{(]/u;

export function isCodeChip(source: string): boolean {
	return CODE_START.test(source);
}
