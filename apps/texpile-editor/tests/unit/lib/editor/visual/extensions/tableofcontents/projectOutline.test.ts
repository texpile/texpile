// The Contents of the whole paper from any file in it: the main file down its \input chain, numbered as one
import { describe, expect, it } from 'vitest';
import {
	guessedLatexMain,
	guessedTypstMain,
	latexProjectOutline,
	typstProjectOutline,
	withVisualHeadings
} from '$lib/editor/visual/extensions/tableofcontents/projectOutline';
import { parseOutlineRaw } from '$lib/editor/visual/extensions/tableofcontents/latexHeadings';

const main = '/w/main.tex';
const mainText = '\\begin{document}\n\\section{Intro}\n\\input{a}\n\\input{b}\n\\section{End}\n\\end{document}\n';
const aText = '\\section{Method}\n\\subsection{Setup}\n';
const bText = '\\section{Results}\n';
const outlines = { [main]: parseOutlineRaw(mainText), '/w/b.tex': parseOutlineRaw(bText) };

describe('project outline', () => {
	it('lists the paper around a fragment, its own entries untagged, the rest with their file', () => {
		const items = latexProjectOutline({ main, open: '/w/a.tex', openSource: aText, root: '/w', outlines })!;
		expect(items.map((i) => `${i.number} ${i.text} ${i.file ?? 'here'}`)).toEqual([
			'1 Intro /w/main.tex',
			'2 Method here',
			'2.1 Setup here',
			'3 Results /w/b.tex',
			'4 End /w/main.tex'
		]);
		// its own entries are positions in its own text, for the editor to jump to
		expect(items[1].pos).toBe(aText.indexOf('\\section{Method}'));
	});

	it('is nothing for a file the paper never reaches', () => {
		expect(latexProjectOutline({ main, open: '/w/notes.tex', openSource: '\\section{Notes}', root: '/w', outlines })).toBeNull();
	});

	it('takes the visual editor positions for the open file, or gives up when they do not line up', () => {
		const items = latexProjectOutline({ main, open: '/w/a.tex', openSource: aText, root: '/w', outlines })!;
		const visual = [
			{ level: 1, text: 'Method', pos: 0 },
			{ level: 2, text: 'Setup', pos: 9 }
		];
		expect(withVisualHeadings(items, visual)?.map((i) => (i.file ? i.text : `${i.text}@${i.pos}`))).toEqual([
			'Intro',
			'Method@0',
			'Setup@9',
			'Results',
			'End'
		]);
		expect(withVisualHeadings(items, visual.slice(0, 1))).toBeNull();
	});

	it('places a Typst file between the headings around its #include', () => {
		const h = (text: string, pos: number) => ({ level: 1, text, pos });
		const outlines = {
			'/w/main.typ': { items: [h('Intro', 0), h('End', 50)], includes: [{ pos: 20, target: 'ch/a.typ' }] },
			'/w/ch/b.typ': { items: [h('Results', 0)], includes: [] }
		};
		const open = { items: [h('Method', 0)], includes: [{ pos: 10, target: 'b.typ' }] };
		const items = typstProjectOutline({ main: '/w/main.typ', open: '/w/ch/a.typ', openOutline: open, outlines })!;
		expect(items.map((i) => `${i.text} ${i.file ?? 'here'}`)).toEqual([
			'Intro /w/main.typ',
			'Method here',
			'Results /w/ch/b.typ',
			'End /w/main.typ'
		]);
		expect(typstProjectOutline({ main: '/w/main.typ', open: '/w/notes.typ', openOutline: open, outlines })).toBeNull();
	});

	// a folder whose main file nobody chose yet still shows the paper around a fragment
	it('guesses the main file from the chains that reach the open one', () => {
		const chapter = '/w/part.tex';
		const withPart = { ...outlines, [chapter]: parseOutlineRaw('\\input{a}\n') };
		expect(guessedLatexMain({ open: '/w/a.tex', openSource: aText, root: '/w', outlines: withPart })).toBe(main);
		expect(guessedLatexMain({ open: '/w/notes.tex', openSource: '\\section{Notes}', root: '/w', outlines: withPart })).toBeNull();
		const typ = { '/w/main.typ': { items: [], includes: [{ pos: 0, target: 'ch.typ' }] }, '/w/ch.typ': { items: [], includes: [] } };
		expect(guessedTypstMain('/w/ch.typ', typ)).toBe('/w/main.typ');
	});
});
