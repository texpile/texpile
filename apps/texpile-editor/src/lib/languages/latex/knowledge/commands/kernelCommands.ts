// whether the LaTeX kernel defines a command, for code that decides if a package has to be loaded for it
import kernel from '../data/kernel/latex.json';
import type { PackageFile } from '../types';

const ENTRIES = ((kernel as unknown as PackageFile).macros ?? []).filter((e) => !e.remove);
const NAMES = new Set(ENTRIES.map((e) => e.name));
const MATH_ONLY = new Set(ENTRIES.filter((e) => e.in === 'math').map((e) => e.name));

const HEAD = /^\\([a-zA-Z]+)/;

/** true when the kernel defines the control word `command` starts with: `\mathcal{A}` is `\mathcal`'s */
export function kernelDefines(command: string): boolean {
	const head = HEAD.exec(command)?.[1];
	return head !== undefined && NAMES.has(head);
}

/** the kernel defines `name` for math only (\left, \alpha) */
export function kernelMathOnly(name: string): boolean {
	return MATH_ONLY.has(name);
}
