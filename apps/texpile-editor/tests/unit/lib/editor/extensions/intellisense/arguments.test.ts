import { describe, it, expect } from 'vitest';
import { EditorState } from '@codemirror/state';
import { CompletionContext } from '@codemirror/autocomplete';
import { argumentCompletionSource } from '../../../../../../src/lib/languages/latex/intellisense/completion/arguments';

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

	it('offers the options of a KOMA-Script class with the values its keys take (scrartcl)', async () => {
		const r = await completeAt('\\documentclass[pars]{scrartcl}', '\\documentclass[pars'.length);
		expect(labels(r)).toContain('parskip');
		expect(labels(r)).toContain('parskip=half');
		const paper = await completeAt('\\documentclass[paper]{scrartcl}', '\\documentclass[paper'.length);
		expect(labels(paper)).toContain('paper=landscape');
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

	it('offers keys LaTeX Workshop gave that the scan confirmed (\\fxsetup)', async () => {
		expect(labels(await completeAt('\\fxsetup{inl'))).toContain('inline');
	});

	it('offers env option keyvals inside \\begin{env}[...]', async () => {
		const r = await completeAt('\\begin{lstlisting}[');
		expect(labels(r).length).toBeGreaterThan(0);
	});

	it('skips the optional groups the writer left out', async () => {
		expect(labels(await completeAt('\\newtcolorbox{mybox}[1]{col'))).toContain('colback=');
		expect(labels(await completeAt('\\babelfont{rm}[Sca'))).toContain('Scale=');
	});

	it('counts an overlay group the writer left out (beamer)', async () => {
		expect(labels(await completeAt('\\begin{column}['))).toContain('T');
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
		expect(labels(r)).toEqual(['YYYY/MM/DD']);
		const cls = await completeAt('\\documentclass[11pt]{article}[');
		expect(labels(cls)).toEqual(['YYYY/MM/DD']);
	});

	it('offers options only in the bracket the data gives the command', async () => {
		expect(labels(await completeAt('\\LoadClass[10'))).toContain('10pt');
		expect(labels(await completeAt('\\LoadClass{article}['))).not.toContain('YYYY/MM/DD');
		expect(await completeAt('\\RequirePackageWithOptions[aut')).toBeNull();
	});

	it('offers the values the data gives \\pagenumbering and the encodings of fontenc', async () => {
		expect(labels(await completeAt('\\pagenumbering{'))).toContain('roman');
		const fontenc = await completeAt('\\usepackage[T]{fontenc}', '\\usepackage[T'.length);
		expect(labels(fontenc)).toEqual(expect.arrayContaining(['T1', 'T2A']));
	});

	it('returns nothing for an unrecognized macro argument', async () => {
		expect(await completeAt('\\foobar{x')).toBeNull();
	});
});
