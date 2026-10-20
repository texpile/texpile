import { describe, it, expect } from 'vitest';
import { EditorState, Transaction, type TransactionSpec } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import { environmentCompletionSource } from '../../../../../../src/lib/languages/latex/intellisense/completion/environments';

async function completeAt(doc: string, pos = doc.length) {
	const state = EditorState.create({ doc });
	return environmentCompletionSource(new CompletionContext(state, pos, false));
}

describe('environment completion: ForBegin + close-environment', () => {
	it('a fresh \\begin{ builds the whole block on accept', async () => {
		const r = await completeAt('\\begin{ite');
		const itemize = r?.options.find((o) => o.label === 'itemize');
		expect(itemize).toBeTruthy();
		expect(typeof itemize?.apply).toBe('function'); // snippet, not a plain label insert
	});

	it('the name being typed, its brace closed by the editor, is not offered as one of the file', async () => {
		const r = await completeAt('\\begin{frob}', '\\begin{frob'.length);
		expect(r?.options.map((o) => o.label)).not.toContain('frob');
		const used = await completeAt(
			'\\begin{frobnicate}x\\end{frobnicate}\n\\begin{frob}',
			'\\begin{frobnicate}x\\end{frobnicate}\n\\begin{frob'.length
		);
		expect(used?.options.map((o) => o.label)).toContain('frobnicate');
	});

	it('mid-edit (content already follows on the same line) stays a plain name completion', async () => {
		const doc = '\\begin{tabul}{c c}\n\\end{tabular}';
		// cursor right after "tabul", with "}{c c}" already typed on the same line
		const r = await completeAt(doc, '\\begin{tabul'.length);
		const tabular = r?.options.find((o) => o.label === 'tabular');
		expect(tabular).toBeTruthy();
		expect(tabular?.apply).toBeUndefined(); // plain name, not a snippet — would duplicate the block otherwise
	});

	it('offers the matching \\end{...} the instant \\begin{name} is closed by hand', async () => {
		const r = await completeAt('\\begin{itemize}');
		expect(r?.options).toHaveLength(1);
		expect(r?.options[0].label).toBe('\\end{itemize}');
	});

	it('still completes plain names inside \\end{…}', async () => {
		const r = await completeAt('\\end{item');
		expect(r?.options.some((o) => o.label === 'itemize')).toBe(true);
	});

	it("offers the kernel's environments", async () => {
		const r = await completeAt('\\begin{');
		for (const name of ['center', 'quote', 'verbatim', 'flushright', 'titlepage']) {
			expect(
				r?.options.some((o) => o.label === name),
				name
			).toBe(true);
		}
	});

	it('offers what a package defines where the document loads it, and a common package otherwise', async () => {
		const align = async (doc: string) => ((await completeAt(doc))?.options ?? []).find((o) => o.label === 'align*');
		expect((await align('\\usepackage{amsmath}\n\\begin{'))?.detail).toBeUndefined();
		// mathtools loads amsmath
		expect((await align('\\usepackage{mathtools}\n\\begin{'))?.detail).toBeUndefined();
		expect((await align('\\documentclass{article}\n\\begin{'))?.detail).toBe('amsmath');
		expect(await align('\\usepackage{xcolor}\n\\begin{tikzpicture}\n\\end{')).toBeUndefined();
	});

	it('offers the environment an option renames under its new name only', async () => {
		const labels = async (doc: string) => ((await completeAt(doc))?.options ?? []).map((o) => o.label);
		const plain = await labels('\\usepackage{algorithm2e}\n\\begin{');
		expect(plain).toContain('algorithm');
		expect(plain).not.toContain('algorithm2e');
		const renamed = await labels('\\usepackage[algo2e]{algorithm2e}\n\\begin{');
		expect(renamed).toContain('algorithm2e');
		expect(renamed).not.toContain('algorithm');
	});

	it('offers what a package with no commands of its own loads', async () => {
		const landscape = async (doc: string) => ((await completeAt(doc))?.options ?? []).find((o) => o.label === 'landscape');
		expect((await landscape('\\documentclass{article}\n\\begin{'))?.detail).toBeTruthy();
		// pdflscape loads lscape, which defines it
		expect(await landscape('\\usepackage{pdflscape}\n\\begin{')).toBeTruthy();
		expect((await landscape('\\usepackage{pdflscape}\n\\begin{'))?.detail).toBeUndefined();
	});

	it('list envs open with their first \\item in the ForBegin block', async () => {
		const doc = '\\begin{itemize';
		const r = await completeAt(doc);
		const itemize = r!.options.find((o) => o.label === 'itemize')!;
		let state = EditorState.create({ doc });
		const view = {
			get state() {
				return state;
			},
			dispatch(spec: Transaction | TransactionSpec) {
				state = spec instanceof Transaction ? spec.state : state.update(spec).state;
			}
		};
		(itemize.apply as (view: unknown, completion: unknown, from: number, to: number) => void)(view, itemize, r!.from, doc.length);
		// \t in the snippet becomes the state's indent unit on apply
		expect(state.doc.toString()).toMatch(/^\\begin\{itemize\}\n\s+\\item \n\\end\{itemize\}$/);
	});
});
