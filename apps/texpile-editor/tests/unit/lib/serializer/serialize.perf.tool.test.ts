// perf harness for the large-document editing hot path (~1MB synthetic paper). prints a timing
// table; the assertions only pin the cache contract (warm/edited serialization must not re-pay
// the whole document), loosely enough to stay green on slow CI.
import { describe, it, expect } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { serializeToLatex } from '../../../../src/lib/serializer/latexSerializer';
import { extractDocRefs } from '../../../../src/lib/latex-parser/labels';
import { parseOutlineRaw } from '../../../../src/lib/editor/extensions/tableofcontents/latexHeadings';

function buildPaper(targetBytes: number): string {
	const chunks: string[] = ['\\documentclass{article}\n\\usepackage{amsmath}\n\\usepackage{graphicx}\n\\begin{document}\n'];
	let size = 0;
	let sec = 0;
	while (size < targetBytes) {
		sec++;
		const block =
			`\\section{Results for configuration ${sec}}\\label{sec:cfg${sec}}\n\n` +
			`As shown in Section~\\ref{sec:cfg${Math.max(1, sec - 1)}}, the observed convergence rate ` +
			`for run ${sec} depends on the damping factor $\\alpha_{${sec}}$ and the residual norm ` +
			`$\\|r_k\\|_2$. We repeat the experiment with varied seeds and report the mean of ` +
			`${sec * 7} trials, which stays within one standard deviation of the baseline.\n\n` +
			`The update rule is\n\\begin{equation}\\label{eq:update${sec}}\nx_{k+1} = x_k - \\alpha_{${sec}} \\nabla f(x_k) + \\beta u_{${sec}}\n\\end{equation}\n\n` +
			`\\begin{itemize}\n\\item Damping set to $${sec}/100$ with warm restarts.\n` +
			`\\item Tolerance fixed at $10^{-6}$ across all ${sec} runs.\n` +
			`\\item Baseline follows the reference implementation.\n\\end{itemize}\n\n` +
			`A final remark on stability: for configuration ${sec} the spectral radius stays below one, ` +
			`so the iteration contracts and the bound of \\autoref{eq:update${sec}} applies verbatim.\n\n`;
		chunks.push(block);
		size += block.length;
	}
	chunks.push('\\end{document}\n');
	return chunks.join('');
}

const ms = (t: number) => `${t.toFixed(1)} ms`;

function time<T>(fn: () => T): { out: T; t: number } {
	const t0 = performance.now();
	const out = fn();
	return { out, t: performance.now() - t0 };
}

describe('1MB document editing hot path', () => {
	it('serialization cache makes keystroke-path re-serialization O(edited block)', () => {
		const source = buildPaper(1_000_000);

		const parse = time(() => parseLatexFile(source));
		const doc = parse.out.doc;

		const cold = time(() => serializeToLatex(doc));
		const warm = time(() => serializeToLatex(doc));

		// simulate one keystroke: insert a character into a text node near the middle
		let editPos = -1;
		doc.descendants((node, pos) => {
			if (editPos === -1 && node.isText && pos > doc.nodeSize / 2) editPos = pos + 1;
			return editPos === -1;
		});
		expect(editPos).toBeGreaterThan(0);
		const state = EditorState.create({ doc });
		const edited = state.apply(state.tr.insertText('x', editPos)).doc;
		const afterEdit = time(() => serializeToLatex(edited));

		const refs = time(() => extractDocRefs(source));
		const outline = time(() => parseOutlineRaw(source));

		console.log(
			[
				`\n--- 1MB paper (${(source.length / 1e6).toFixed(2)} MB, ${doc.childCount} top-level blocks) ---`,
				`parse (worker-side cost)          ${ms(parse.t)}`,
				`serialize cold (first, all blocks) ${ms(cold.t)}`,
				`serialize warm (unchanged doc)     ${ms(warm.t)}`,
				`serialize after 1-char edit        ${ms(afterEdit.t)}  <- per-keystroke cost in visual mode`,
				`extractDocRefs (now in worker)     ${ms(refs.t)}`,
				`parseOutlineRaw (source outline)   ${ms(outline.t)}`,
				'---'
			].join('\n')
		);

		// contract: warm/edited runs reuse cached blocks instead of re-serializing the document
		expect(warm.out).toBe(cold.out);
		expect(afterEdit.out).not.toBe(cold.out);
		expect(warm.t).toBeLessThan(cold.t / 2);
		expect(afterEdit.t).toBeLessThan(cold.t / 2);
		expect(refs.out.labels.length).toBeGreaterThan(0);
		expect(outline.out.length).toBeGreaterThan(0);
	}, 120_000);
});
