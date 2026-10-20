// whether the LaTeX kernel defines a command, for code that decides if a package has to be loaded for it
import kernel from '../data/kernel/latex.json';
import type { PackageFile } from '../types';

const NAMES = new Set(((kernel as unknown as PackageFile).macros ?? []).filter((e) => !e.remove).map((e) => e.name));

const HEAD = /^\\([a-zA-Z]+)/;

/** true when the kernel defines the control word `command` starts with: `\mathcal{A}` is `\mathcal`'s */
export function kernelDefines(command: string): boolean {
	const head = HEAD.exec(command)?.[1];
	return head !== undefined && NAMES.has(head);
}
