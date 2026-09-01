// Which cross-reference and citation commands the editor models, and what the chips claim the
// page will say. A command is only modelled when its output can actually be computed here;
// anything whose word comes from the preamble stays raw and speaks for itself.
import { describe, it, expect } from 'vitest';
import { latexToProseMirror } from '../../../../src/lib/languages/latex/parser/converter';
import { serializeToLatex } from '$lib/languages/latex/serializer/latexSerializer';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { refText } from '$lib/languages/latex/visual/extensions/ref/refText';
import { citationText } from '$lib/languages/latex/visual/extensions/citation/citationText';

function parse(src: string) {
	return latexToProseMirror(src, {}).doc;
}

function rt(src: string): string {
	return serializeToLatex(parse(src))
		.replace(/\s*\\par\s*$/, '')
		.trim();
}

/** every node type the doc contains, so "did this become a chip or a ref" is answerable */
function types(src: string): string[] {
	return [...JSON.stringify(parse(src)).matchAll(/"type":"([a-z_]+)"/g)].map((m) => m[1] as string);
}

describe('commands the editor models', () => {
	it.each(['\\ref{fig:a}', '\\eqref{eq:a}'])('%s becomes a reference chip', (src) => {
		expect(types(src)).toContain('ref');
		expect(rt(src)).toBe(src);
	});

	it.each(['\\cite{a}', '\\citet{a}', '\\citep{a}', '\\parencite{a}', '\\textcite{a}', '\\autocite{a}'])(
		'%s becomes a citation chip',
		(src) => {
			expect(types(src)).toContain('citation');
			expect(rt(src)).toBe(src);
		}
	);
});

describe('commands whose output only the preamble knows', () => {
	// \autoref and \cref take their word from \figurename or \crefname, \pageref needs a page
	// number that exists only after layout, and \footcite does not appear inline at all
	it.each(['\\autoref{fig:a}', '\\cref{fig:a}', '\\Cref{fig:a}', '\\pageref{fig:a}', '\\footcite{a}'])('%s stays raw', (src) => {
		expect(types(src)).not.toContain('ref');
		expect(types(src)).not.toContain('citation');
		expect(rt(src)).toBe(src);
	});
});

describe('a reference the picker inserts', () => {
	// it creates the node with no command attr, so the schema default is what gets written out.
	// while that default was \autoref - which the parser no longer reads - a ref inserted from the
	// menu came back as a raw chip on the next load.
	it('survives a save and a reload as a reference', () => {
		const node = schema.node('doc', null, [
			schema.node('paragraph', null, [schema.nodes.ref.create({ refType: 'figure' }, schema.text('fig:a'))])
		]);
		const saved = serializeToLatex(node)
			.replace(/\s*\\par\s*$/, '')
			.trim();
		expect(saved).toBe('\\ref{fig:a}');
		expect(types(saved)).toContain('ref');
	});
});

// found in a relativity paper that labels its remarks \label{Remark:$ethf$}. The chip flattened
// the name to Remark:ethf, so saving the file wrote a reference that no longer matched its own
// label - while the \label, which keeps a structured name raw, still had the delimiters.
describe('a label name with structure in it', () => {
	it('stays raw rather than being flattened into a chip', () => {
		expect(types('\\ref{Remark:$ethf$}')).not.toContain('ref');
		expect(rt('\\ref{Remark:$ethf$}')).toBe('\\ref{Remark:$ethf$}');
		expect(rt('\\label{Remark:$ethf$} \\ref{Remark:$ethf$}')).toBe('\\label{Remark:$ethf$} \\ref{Remark:$ethf$}');
	});

	// only the delimiters were the problem: a plain name with punctuation is still a chip
	it('is still a chip when the name is plain', () => {
		expect(types('\\ref{estimate:forchecka^S}')).toContain('ref');
		expect(rt('\\ref{estimate:forchecka^S}')).toBe('\\ref{estimate:forchecka^S}');
	});
});

describe('what a reference chip claims', () => {
	it('gives \\eqref the parentheses amsmath will print', () => {
		expect(refText('eqref', 3)).toBe('(3)');
	});

	// the word in "Table~\ref{tab:x}" is the author's; adding ours on top is what read "Table Table 2"
	it('gives \\ref the bare number it will print, and no word of its own', () => {
		expect(refText('ref', 2)).toBe('2');
		expect(refText('ref', '3.1')).toBe('3.1');
	});
});

describe('what a citation chip claims', () => {
	it('puts the author in the sentence for a textual cite', () => {
		const works = [{ author: 'Devlin et al.', year: '2019' }];
		expect(citationText('citet', works, '', '')).toBe('Devlin et al. (2019)');
		expect(citationText('textcite', works, '', '')).toBe('Devlin et al. (2019)');
	});

	it('brackets the whole thing for a parenthetical one', () => {
		const works = [{ author: 'Devlin et al.', year: '2019' }];
		expect(citationText('citep', works, '', '')).toBe('(Devlin et al. 2019)');
		expect(citationText('cite', works, '', '')).toBe('(Devlin et al. 2019)');
	});

	it('keeps notes with the year in a textual cite, and outside in a parenthetical one', () => {
		const works = [{ author: 'Devlin et al.', year: '2019' }];
		expect(citationText('citet', works, 'see', 'p. 5')).toBe('see Devlin et al. (2019, p. 5)');
		expect(citationText('citep', works, 'see', 'p. 5')).toBe('(see, Devlin et al. 2019, p. 5)');
	});

	it('falls back to the bracketed form when a key is missing, which is the one that can show it', () => {
		expect(citationText('citet', [{ unresolved: 'ghost not found' }], '', '')).toBe('(ghost not found)');
	});
});
