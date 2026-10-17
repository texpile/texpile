import { describe, it, expect } from 'vitest';
import { latexToProseMirror } from '../../../../src/lib/languages/latex/parser/converter';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';
import { parseLatexFile, serializeLatexFile } from '$lib/workspace/latexRoundtrip';

// regression guard: figure*/table* were missing from envHandlers, so a lone \includegraphics
// inside figure* got promoted to a plain image node with no figureTemplate and serialized via
// the synthetic single-figure fallback: wrong (unstarred) environment, illegal nesting inside
// \begin{center} ("Not in outer par mode"), real \caption dropped. byte-level round-trip checks
// can't see this because the verbatim layer masks untouched saves; it only surfaces once
// the block regenerates. corpus repro: 1810.04805/related.tex.
describe('figure* / table* starred float variants', () => {
	const REAL_CAPTION = 'Overall pre-training and fine-tuning procedure.';
	const src = `\\begin{figure*}[t!]
\\begin{center}
\\includegraphics[width=1\\textwidth]{BERT_Overall.pdf}
\\end{center}
\\caption{${REAL_CAPTION}}
\\label{fig:bert_overall}
\\end{figure*}`;

	it('models a lone image inside figure* as an editable image node (not a raw/generic environment)', () => {
		const { doc } = latexToProseMirror(src, {});
		expect(doc.childCount).toBe(1);
		expect(doc.child(0).type.name).toBe('image');
	});

	// byte-identity is a property of the real pipeline (parseLatexFile/serializeLatexFile and its
	// verbatim mechanism), not the raw converter/serializer: figureTemplate re-prints the
	// AST, valid but not byte-exact. that is why this file's bug was invisible to the earlier
	// byte-fidelity corpus sweep, which only exercised the untouched-save path.
	it('round-trips figure* byte-identically on an untouched save (real app pipeline)', () => {
		const file = `\\documentclass{article}\n\\begin{document}\n${src}\n\\end{document}\n`;
		const parsed = parseLatexFile(file);
		expect(serializeLatexFile(parsed, parsed.doc)).toBe(file);
	});

	// latexToProseMirror alone records no parse origins (only parseLatexFile does), so this doc
	// always serializes through the deterministic path, the exact path the pre-fix bug broke on
	// any real edit
	it('serializes a starred, correctly-nested, caption-preserving figure* through the deterministic path', () => {
		const { doc } = latexToProseMirror(src, {});
		const img = doc.child(0);
		// simulate an in-editor caption edit, the shape a real ProseMirror transaction produces
		const edited = img.type.create(img.attrs, img.type.schema.text('New caption text'));
		const out = serializeToLatex(doc.copy(doc.content.replaceChild(0, edited)));

		expect(out).toContain('\\begin{figure*}');
		expect(out).toContain('\\end{figure*}');
		// must not synthesize a nested unstarred float, the invalid-LaTeX regression
		expect(out).not.toMatch(/\\begin\{figure\}(?!\*)/);
		expect(out).toContain('New caption text');
	});

	it('preserves the real caption text through the deterministic path (no content loss)', () => {
		const { doc } = latexToProseMirror(src, {});
		const out = serializeToLatex(doc);
		expect(out).toContain(REAL_CAPTION);
	});

	it('models a lone table inside table* as an editable table_wrapper (not a raw/generic environment)', () => {
		const tableSrc = `\\begin{table*}[t]
\\centering
\\begin{tabular}{ll}
a & b \\\\
\\end{tabular}
\\caption{A wide table.}
\\label{tab:wide}
\\end{table*}`;
		const { doc } = latexToProseMirror(tableSrc, {});
		expect(doc.childCount).toBe(1);
		expect(doc.child(0).type.name).toBe('table_wrapper');
		expect(serializeToLatex(doc)).toContain('\\begin{table*}');
	});

	// same bug class as figure*, for wrapfig's text-wrapping float: a lone \includegraphics
	// inside \begin{wrapfigure} synthesized an illegally-nested \begin{figure}[h] and dropped the
	// caption (corpus repros: 1409.0473, 1606.08415, 1910.01108). wraptable is deliberately not
	// fixed the same way, see the `wrapfigure` envHandlers entry in converter.ts.
	// \caption[short]{long}: the slot mechanism replaces the whole \caption macro, so the
	// optional short caption vanished and the caption package's scanner then dies on the first
	// bracket-less \caption (corpus repro: 2001.08361).
	it('preserves the \\caption[short] optional argument through the deterministic path', () => {
		const capSrc = `\\begin{figure}[t]
\\centering
\\includegraphics[width=\\textwidth]{plot.pdf}
\\caption[Summary of simple power laws.]{Language modeling performance improves smoothly.}
\\label{fig:power}
\\end{figure}`;
		const { doc } = latexToProseMirror(capSrc, {});
		const out = serializeToLatex(doc);
		expect(out).toContain('\\caption[Summary of simple power laws.]{Language modeling performance improves smoothly.}');
	});

	// a longtable with repeating-header markers (\endfirsthead/\endhead/\endfoot) is unmodelable
	// as a grid: markers got garbled into cell text and the colspec leaked into the body (corpus
	// repro: 2203.02155). such longtables demote to a verbatim raw block; marker-less ones stay
	// editable.
	it('preserves a longtable with \\endhead markers verbatim', () => {
		const ltSrc = `\\begin{longtable}{p{.2\\textwidth} p{.8\\textwidth}}
\\toprule
Use Case & Example \\\\
\\midrule
\\endfirsthead
Use Case & Example \\\\
\\midrule
\\endhead
brainstorming & baby names \\\\
\\end{longtable}`;
		const { doc } = latexToProseMirror(ltSrc, {});
		expect(doc.child(0).type.name).toBe('raw_latex');
		const out = serializeToLatex(doc);
		expect(out).toContain('\\begin{longtable}{p{.2\\textwidth} p{.8\\textwidth}}');
		expect(out).toContain('\\endfirsthead');
		expect(out).toContain('\\endhead');
	});

	it('a marker-less longtable still becomes an editable table', () => {
		const ltSrc = `\\begin{longtable}{ll}
a & b \\\\
c & d \\\\
\\end{longtable}`;
		const { doc } = latexToProseMirror(ltSrc, {});
		expect(doc.child(0).type.name).not.toBe('raw_latex');
	});

	it('models a lone image inside wrapfigure as an editable image node with a verbatim template', () => {
		const wrapSrc = `\\begin{wrapfigure}{r}{0.58\\textwidth}
\\centering
\\includegraphics[width=0.55\\textwidth]{nonlinearity-plot}
\\caption{The GELU activation.}
\\label{fig:nonlinearityplot}
\\end{wrapfigure}`;
		const { doc } = latexToProseMirror(wrapSrc, {});
		expect(doc.childCount).toBe(1);
		expect(doc.child(0).type.name).toBe('image');
		const out = serializeToLatex(doc);
		expect(out).toContain('\\begin{wrapfigure}{r}{0.58\\textwidth}');
		expect(out).toContain('\\end{wrapfigure}');
		expect(out).toContain('The GELU activation.');
		// must not synthesize a nested float inside wrapfigure, the invalid-LaTeX regression
		expect(out).not.toMatch(/\\begin\{figure\}/);
	});
});

// a tabular wrapped in \begin{center} (BERT-era arXiv style, corpus repro: 1810.04805) parked
// the whole float on the generic-environment path: no caption chrome, no scroll container, so a
// wide table crushed its last columns. extractTableComponents now sees through a center that
// holds the tabular; the wrapper serializer re-emits \centering, which is what the environment
// means inside a float.
describe('center-wrapped table floats', () => {
	const bertSrc = `\\begin{table*}[t]
\\small
\\renewcommand{\\arraystretch}{1.2}
\\begin{center}
\\begin{tabular}{l|cccccccc|c}
System & MNLI & QQP & Average \\\\
BERT & 86.7 & 72.1 & 82.1 \\\\
\\end{tabular}
\\end{center}
\\caption{GLUE Test results.}
\\label{tab:glue}
\\end{table*}`;

	it('models the BERT GLUE table as an editable table_wrapper, not a generic environment', () => {
		const { doc } = latexToProseMirror(bertSrc, {});
		expect(doc.childCount).toBe(1);
		const wrapper = doc.child(0);
		expect(wrapper.type.name).toBe('table_wrapper');
		expect(wrapper.attrs.label).toBe('tab:glue');
		expect(wrapper.attrs.spanning).toBe(true);
		// the pre-tabular setup survives as the raw prefix
		expect(String(wrapper.attrs.preBody)).toContain('\\renewcommand{\\arraystretch}{1.2}');
	});

	it('round-trips byte-identically on an untouched save (real app pipeline)', () => {
		const file = `\\documentclass{article}\n\\begin{document}\n${bertSrc}\n\\end{document}\n`;
		const parsed = parseLatexFile(file);
		expect(serializeLatexFile(parsed, parsed.doc)).toBe(file);
	});

	it('regenerates as table* with \\centering, keeping the caption and setup', () => {
		const { doc } = latexToProseMirror(bertSrc, {});
		const out = serializeToLatex(doc);
		expect(out).toContain('\\begin{table*}[t]');
		expect(out).toContain('\\centering');
		expect(out).toContain('GLUE Test results.');
		expect(out).toContain('\\renewcommand{\\arraystretch}{1.2}');
		expect(out).not.toContain('\\begin{center}');
	});

	// the other BERT shape: the tabular inside a {\small ...} group inside center, and the
	// \label embedded in the caption argument
	const maskSrc = `\\begin{table}[ht]
\\begin{center}
{\\small \\begin{tabular}{@{}rrrccc@{}}\\toprule \\multicolumn{3}{c}{Masking Rates} & \\multicolumn{3}{c}{Dev Set Results} \\\\
80\\% & 10\\% & 10\\% & 84.2 & 95.4 & 94.9 \\\\
\\bottomrule\\end{tabular} }
\\end{center}
\\caption{\\label{tab:mask_ablation} Ablation over different masking strategies.}
\\end{table}`;

	it('sees through a {\\small ...} group holding the tabular; the switch survives in preBody', () => {
		const { doc } = latexToProseMirror(maskSrc, {});
		expect(doc.childCount).toBe(1);
		const wrapper = doc.child(0);
		expect(wrapper.type.name).toBe('table_wrapper');
		expect(String(wrapper.attrs.preBody)).toContain('\\small');
	});

	it('the group-wrapped shape round-trips byte-identically on an untouched save', () => {
		const file = `\\documentclass{article}\n\\begin{document}\n${maskSrc}\n\\end{document}\n`;
		const parsed = parseLatexFile(file);
		expect(serializeLatexFile(parsed, parsed.doc)).toBe(file);
	});

	it('regenerates with the caption text, its embedded label, and the size switch', () => {
		const { doc } = latexToProseMirror(maskSrc, {});
		const out = serializeToLatex(doc);
		expect(out).toContain('Ablation over different masking strategies.');
		expect(out).toContain('\\label{tab:mask_ablation}');
		expect(out).toContain('\\small');
		expect(out).toContain('\\multicolumn{3}'); // the span survives; its col spec is style-derived
		expect(out).not.toContain('\\begin{center}');
	});

	// the appendix GLUE shape: a tabular* (with its width argument) inside center. tabular* was
	// missing from the extractor's direct-child list, so the float went generic and the caption
	// collapsed into one giant raw chip.
	const glueSrc = `\\begin{table*}[t]
\\small
\\begin{center}
 \\begin{tabular*}{\\textwidth}{l@{\\extracolsep{\\fill}}cc}
System & MNLI & QQP \\\\
BERT & 86.7 & 72.1 \\\\
   \\end{tabular*}
   \\caption{GLUE Test results, scored by the evaluation server.}
   \\label{tab:glue_official}
\\end{center}
\\end{table*}`;

	it('models a center-wrapped tabular* as a table_wrapper with its caption captured', () => {
		const { doc } = latexToProseMirror(glueSrc, {});
		expect(doc.childCount).toBe(1);
		const wrapper = doc.child(0);
		expect(wrapper.type.name).toBe('table_wrapper');
		expect(wrapper.attrs.label).toBe('tab:glue_official');
		let captionText = '';
		wrapper.forEach((child) => {
			if (child.type.name === 'table_caption') captionText = child.textContent;
		});
		expect(captionText).toContain('GLUE Test results');
	});

	it('the tabular* round-trips byte-identically on an untouched save and keeps its width arg on regeneration', () => {
		const file = `\\documentclass{article}\n\\begin{document}\n${glueSrc}\n\\end{document}\n`;
		const parsed = parseLatexFile(file);
		expect(serializeLatexFile(parsed, parsed.doc)).toBe(file);
		const out = serializeToLatex(latexToProseMirror(glueSrc, {}).doc);
		expect(out).toContain('\\begin{tabular*}{\\textwidth}{l@{\\extracolsep{\\fill}}cc}');
		expect(out).toContain('\\end{tabular*}');
	});

	it('leaves a center env that does not hold the tabular wrapped (setup stays intact)', () => {
		const src = `\\begin{table}[h]
\\begin{center}
Some centered prose.
\\end{center}
\\begin{tabular}{ll}
a & b \\\\
\\end{tabular}
\\caption{T.}
\\end{table}`;
		const { doc } = latexToProseMirror(src, {});
		expect(doc.child(0).type.name).toBe('table_wrapper');
		expect(String(doc.child(0).attrs.preBody)).toContain('\\begin{center}');
	});
});

describe('a float with more than one label', () => {
	it('keeps every label on regeneration', () => {
		const src =
			'\\begin{figure}\n\\includegraphics{img}%\n\\subfloat{\\label{fig:3a}}%\n\\subfloat{\\label{fig:3b}}%\n\\caption{x}\n\\label{fig:3}\n\\end{figure}\n';
		const out = serializeToLatex(latexToProseMirror(src, {}).doc);
		for (const label of ['fig:3a', 'fig:3b', 'fig:3']) expect(out).toContain(`\\label{${label}}`);
	});
});
