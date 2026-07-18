import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import { argumentCompletionSource } from '../../../../../../src/lib/editor/extensions/intellisense/completion/arguments';

function completeAt(doc: string, pos = doc.length) {
	const state = EditorState.create({ doc });
	return Promise.resolve(argumentCompletionSource(new CompletionContext(state, pos, false)));
}
const labels = (r: Awaited<ReturnType<typeof completeAt>>) => (r?.options ?? []).map((o) => o.label);

describe('argument key-value completion (vendored package data + kernel rules)', () => {
	it('offers standard class options inside \\documentclass[...]', async () => {
		const r = await completeAt('\\documentclass[10');
		expect(labels(r)).toContain('10pt');
	});

	it('offers class-specific options when LW ships a class file (beamer)', async () => {
		const r = await completeAt('\\documentclass[asp]{beamer}', '\\documentclass[asp'.length);
		expect(labels(r).some((l) => l.startsWith('aspectratio'))).toBe(true);
	});

	it('offers \\includegraphics keys from graphicx data, pre-filtered by the typed substring', async () => {
		const typed = await completeAt('\\includegraphics[wid');
		expect(labels(typed)).toContain('width=');
		expect(labels(typed)).toContain('natwidth='); // substring match, not just prefix
		expect(labels(typed).some((l) => l.startsWith('pagebox'))).toBe(false); // no "wid" in it
		const all = await completeAt('\\includegraphics[');
		expect(labels(all).some((l) => l.startsWith('pagebox'))).toBe(true); // beyond the old hand list
	});

	it('offers \\hypersetup keys from hyperref data', async () => {
		const r = await completeAt('\\hypersetup{colorli');
		expect(labels(r).some((l) => l.startsWith('colorlinks'))).toBe(true);
	});

	it('offers env option keyvals inside \\begin{env}[...]', async () => {
		const r = await completeAt('\\begin{lstlisting}[');
		expect(labels(r).length).toBeGreaterThan(0);
	});

	it('gates \\usepackage[...] options on the package name being on the line', async () => {
		expect(await completeAt('\\usepackage[aut')).toBeNull();
	});

	it('resolves package options once the package name is present later on the line', async () => {
		const r = await completeAt('\\usepackage[auth]{natbib}', '\\usepackage[auth'.length);
		expect(labels(r)).toContain('authoryear');
	});

	it('matches options by substring, not just word start ("a" finds draft/final)', async () => {
		const r = await completeAt('\\usepackage[a]{graphicx}', '\\usepackage[a'.length);
		expect(labels(r)).toContain('draft');
		expect(labels(r)).toContain('final');
		expect(r && 'filter' in r ? r.filter : undefined).toBe(false); // self-filtered, CM must not re-filter
	});

	it('never offers keyvals inside \\href{...} (url slot, not an options slot)', async () => {
		expect(await completeAt('\\href{')).toBeNull();
	});

	it('the trailing [..] after {pkg} is a release date, never the options list', async () => {
		const r = await completeAt('\\usepackage{graphicx}[');
		expect(labels(r)).toEqual(['2024/01/01']);
		const cls = await completeAt('\\documentclass[11pt]{article}[');
		expect(labels(cls)).toEqual(['2024/01/01']);
	});

	it('completes xcolor color names inside \\textcolor{...}', async () => {
		expect(labels(await completeAt('\\textcolor{Mar'))).toContain('Maroon');
	});

	it('completes \\colorbox{...} and \\fcolorbox{...}{...} color slots', async () => {
		expect(labels(await completeAt('\\colorbox{r'))).toContain('red');
		expect(labels(await completeAt('\\fcolorbox{black}{r'))).toContain('red');
	});

	it('completes \\bibliographystyle{...} and \\citestyle{...}', async () => {
		expect(labels(await completeAt('\\bibliographystyle{pla'))).toContain('plain');
		expect(labels(await completeAt('\\citestyle{pla'))).toContain('plain');
	});

	it('keeps the kernel rules the package data lacks (\\pagestyle, \\pagenumbering)', async () => {
		expect(labels(await completeAt('\\pagestyle{'))).toContain('headings');
		expect(labels(await completeAt('\\pagenumbering{'))).toContain('roman');
	});

	it('returns nothing for an unrecognized macro argument', async () => {
		expect(await completeAt('\\foobar{x')).toBeNull();
	});
});
