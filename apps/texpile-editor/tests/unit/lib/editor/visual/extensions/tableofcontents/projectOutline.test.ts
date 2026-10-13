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
		expect(items.map((i) => `${i.text} ${i.file ?? 'here'}`)).toEqual([
			'Intro /w/main.tex',
			'Method here',
			'Setup here',
			'Results /w/b.tex',
			'End /w/main.tex'
		]);
		// its own entries are positions in its own text, for the editor to jump to
		expect(items[1].pos).toBe(aText.indexOf('\\section{Method}'));
	});

	it("is found from a guest's relative paths, a fragment in a folder included", () => {
		const guest = {
			'main.tex': parseOutlineRaw(mainText.replace('\\input{b}', '\\input{parts/b}')),
			'parts/b.tex': parseOutlineRaw('\\input{c}\n')
		};
		const paper = { open: 'a.tex', openSource: aText, root: 'session', outlines: { ...guest, 'parts/c.tex': parseOutlineRaw(bText) } };
		expect(guessedLatexMain(paper)).toBe('main.tex');
		expect(latexProjectOutline({ ...paper, main: 'main.tex' })!.map((i) => i.text)).toEqual(['Intro', 'Method', 'Setup', 'Results', 'End']);
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

	it("keeps figures and tables in visual mode, the open file's at the editor's positions", () => {
		const floatText = '\\section{Method}\n\\begin{figure}\\caption{Plot}\\end{figure}\n\\begin{table}\\caption{Data}\\end{table}\n';
		const withB = { ...outlines, '/w/b.tex': parseOutlineRaw('\\section{Results}\n\\begin{figure}\\caption{Other}\\end{figure}\n') };
		const items = latexProjectOutline({ main, open: '/w/a.tex', openSource: floatText, root: '/w', outlines: withB })!;
		const shown = (list: ReturnType<typeof withVisualHeadings>) => list?.map((i) => (i.file ? i.text : `${i.text}@${i.pos}`));
		const floats = [
			{ level: 0, kind: 'figure' as const, text: 'Plot', pos: 12 },
			{ level: 0, kind: 'table' as const, text: 'Data', pos: 30 }
		];
		expect(shown(withVisualHeadings(items, [{ level: 1, text: 'Method', pos: 0 }], floats))).toEqual([
			'Intro',
			'Method@0',
			'Plot@12',
			'Data@30',
			'Results',
			'Other',
			'End'
		]);
		// an editor that kept the figure as raw LaTeX has no place for it, and the rest still lines up
		expect(shown(withVisualHeadings(items, [{ level: 1, text: 'Method', pos: 0 }], floats.slice(1)))).toEqual([
			'Intro',
			'Method@0',
			'Data@30',
			'Results',
			'Other',
			'End'
		]);
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
