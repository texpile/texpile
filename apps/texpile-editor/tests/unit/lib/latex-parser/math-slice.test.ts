import { describe, it, expect } from 'vitest';
import { treeToProseMirror } from '$lib/languages/latex/parser/tree/importTree';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';

// math content is sliced from the original source instead of reconstructed with printRaw:
// printRaw re-brackets scripts (cosmetic) but also seals a script macro away from its own
// trailing argument (`y_\history{i}` becomes `y_{\history}{i}`, fatal when \history takes an
// arg). corpus repro: 2005.11401. slicing keeps the math byte-identical to the source.
function rt(src: string, preamble?: string): string {
	const { doc } = treeToProseMirror(src, preamble ? { preamble } : {});
	return serializeToLatex(doc);
}

const PRE = `\\documentclass{article}
\\newcommand{\\history}[1]{{1:#1-1}}
\\begin{document}`;

describe('math content is sliced verbatim from source', () => {
	it('inline math: a subscript macro keeps its trailing argument un-sealed', () => {
		const out = rt(String.raw`The generator $p(y_i \mid x, y_\history{i})$ is seq2seq.`, PRE);
		expect(out).toContain('y_\\history{i}');
		expect(out).not.toContain('_{\\history}');
	});

	it('inline math: scripts are not re-bracketed', () => {
		const out = rt(String.raw`Weights $QW^Q_i$ attend.`);
		expect(out).toContain('$QW^Q_i$');
		expect(out).not.toContain('W^{Q}');
	});

	it('display math (equation*): content is byte-preserved', () => {
		const out = rt(
			`\\begin{equation*}
p(y|x) = \\prod_i^N p(y_i|x, y_\\history{i})
\\end{equation*}`,
			PRE
		);
		expect(out).toContain('y_\\history{i}');
	});

	it('align*: per-row content is byte-preserved', () => {
		const out = rt(
			`\\begin{align*}
a &= y_\\history{i} \\\\
b &= W^Q_i
\\end{align*}`,
			PRE
		);
		expect(out).toContain('y_\\history{i}');
		expect(out).toContain('W^Q_i');
	});

	it('a labelled equation still extracts its label without duplication', () => {
		// a node-extracted label forces the printRaw fallback (a slice would retain the label's
		// source text AND the serializer re-adds it, duplicating). printRaw re-brackets scripts;
		// render-identical, the pre-existing behaviour for labelled math.
		const out = rt(`\\begin{equation}
E = mc^2 \\label{eq:emc}
\\end{equation}`);
		expect(out.match(/\\label\{eq:emc\}/g)?.length).toBe(1);
		expect(out).toMatch(/E = mc\^\{?2\}?/);
	});

	it('reaches a fixed point', () => {
		const src = String.raw`Inline $y_\history{i}$ and $W^Q_i$ math.`;
		const r1 = rt(src, PRE);
		const r2 = rt(r1, PRE);
		expect(r2).toBe(r1);
	});

	// the slice must anchor on the math container's own position, not its content extents:
	// \frac-style attached args can carry no positions, truncating the slice right after the
	// control word (`$p_i = \frac$`, brace-balanced so a balance check alone passed it; this
	// corruption shipped briefly and broke 5 corpus papers with "Missing \endgroup inserted")
	it('\\frac keeps its argument groups (container-position anchoring)', () => {
		const out = rt(String.raw`Temperature: $p_i = \frac{\exp(z_i/T)}{\sum_j \exp(z_j/T)}$ where $T$ controls it.`);
		expect(out).toContain('\\frac{\\exp(z_i/T)}{\\sum_j \\exp(z_j/T)}');
		expect(out).not.toMatch(/\\frac\$/);
	});

	it('a corrupt-position descendant cannot drag the slice back to file start', () => {
		// the other failure direction (a synthesized 0-offset descendant): sliced math must never
		// contain text from outside its delimiters
		const out = rt(`Preamble-ish text that must not leak.

Some prose $a_1 + b^2$ more prose.`);
		const math = out.match(/\$[^$]*\$/)?.[0] ?? '';
		expect(math).not.toContain('leak');
		expect(math).toContain('a_1');
	});
});
