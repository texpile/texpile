import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { renameTargetAt } from '$lib/languages/latex/intellisense/rename/renameTarget';
import { documentPackages } from '$lib/languages/latex/intellisense/packages/loadedPackages';

async function targetIn(text: string, marker: string) {
	await documentPackages(text);
	return renameTargetAt(EditorState.create({ doc: text }), text.indexOf(marker) + 1);
}

describe('renameTargetAt', () => {
	it('finds a label, one key of a citation list and a glossary use', async () => {
		const text = '\\usepackage{glossaries}\\label{sec:a} \\citep[p.~3]{lamport,knuth84} \\gls{cpu}';
		expect(await targetIn(text, 'sec:a')).toMatchObject({ kind: 'label', name: 'sec:a' });
		expect(await targetIn(text, 'knuth84')).toMatchObject({ kind: 'cite', name: 'knuth84' });
		expect(await targetIn(text, 'cpu')).toMatchObject({ kind: 'glossary', name: 'cpu' });
	});

	it('finds a key where it is defined, which hover leaves out', async () => {
		const text = '\\usepackage{glossaries}\\bibitem{knuth84} \\newacronym{cpu}{CPU}{unit} \\newglossaryentry{gpu}{name={GPU}}';
		expect(await targetIn(text, 'knuth84')).toMatchObject({ kind: 'cite', name: 'knuth84' });
		expect(await targetIn(text, 'cpu')).toMatchObject({ kind: 'glossary', name: 'cpu' });
		expect(await targetIn(text, 'gpu')).toMatchObject({ kind: 'glossary', name: 'gpu' });
	});

	it('finds nothing on a command name, an argument of another role or \\nocite{*}', async () => {
		const text = '\\usepackage{amsmath} \\section{Intro} \\nocite{*}';
		expect(await targetIn(text, 'section')).toBeNull();
		expect(await targetIn(text, 'Intro')).toBeNull();
		expect(await targetIn(text, '*')).toBeNull();
	});
});
