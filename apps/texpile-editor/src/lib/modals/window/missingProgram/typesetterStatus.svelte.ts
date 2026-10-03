// What the toolchain probe found, one line per typesetter
import { toolchainProbe } from '../toolchainProbe.svelte';

export type Typesetters = { latex: boolean; typst: boolean };
export type EngineRow = { kind: string; found: boolean; detail: string };

const LATEX_ENGINES = ['latexmk', 'pdflatex', 'lualatex', 'xelatex'];

function latexFound(probes: ToolProbe[], distros: ToolDistro[], program?: string): Omit<EngineRow, 'kind'> {
	// a distribution can be there without the one program a run needed: latexmk is apart from pdflatex in MiKTeX
	const engine = program ? probes.find((p) => p.id === program && p.found) : probes.find((p) => LATEX_ENGINES.includes(p.id) && p.found);
	if (!engine) return { found: false, detail: '' };
	const distro = distros.find((d) => d.family === 'latex' && d.onPath) ?? distros.find((d) => d.family === 'latex');
	return { found: true, detail: distro?.name ?? engine.detail ?? '' };
}

function typstFound(tinymist: TinymistInfo | null | 'unchecked'): Omit<EngineRow, 'kind'> {
	if (!tinymist || tinymist === 'unchecked') return { found: false, detail: '' };
	return { found: true, detail: `tinymist ${tinymist.version}, Typst ${tinymist.typstVersion}` };
}

/** program: a LaTeX program that was missing, which the row is then about, by name */
export function engineRows(want: Typesetters, program?: string): EngineRow[] {
	const latexProgram = program && program !== 'tinymist' ? program : undefined;
	return [
		want.latex ? { kind: latexProgram ?? 'LaTeX', ...latexFound(toolchainProbe.probes, toolchainProbe.distros, latexProgram) } : null,
		want.typst ? { kind: 'Typst', ...typstFound(toolchainProbe.tinymist) } : null
	].filter((e) => e !== null);
}
