// W9's slice (20.2): a raw block drawn with the source editor's Lezer colors in LaTeX, Typst and Markdown, read through
// the probe; typed into, a new line made, the edit undone, one just inserted, and dark mode. Boxes and colors are the DOM
// editor's, measured live on canvas/p0-dom with the same files
import { expect, test } from '@playwright/test';
import { useTexpile } from '../../driver/useTexpile';
import { VisualEditor } from '../../driver/visualEditor';
import { inCanvas, probeErrors, settled } from '../canvasPage';

const PROSE = 'A paragraph before the raw block, with enough words to wrap across the column so the island sits between prose.';
const FILES: Record<string, string> = {
	'slice.tex': [
		'\\documentclass{article}',
		'\\begin{document}',
		PROSE,
		'',
		'\\begin{unknownthing}[opt]{arg}',
		'\\foo{bar} % a comment',
		'$x^2$ and \\textbf{bold}',
		'\\end{unknownthing}',
		'',
		'The last paragraph.',
		'\\end{document}',
		''
	].join('\n'),
	'slice.typ': [PROSE, '', '#diagram(', '  node((0, 0), [A]),', '  edge((0, 0), (1, 0), "->"),', ')', '', 'The last paragraph.', ''].join(
		'\n'
	),
	'slice.md': [PROSE, '', '<div class="note">', '  <b>Raw</b> HTML block', '</div>', '', 'The last paragraph.', ''].join('\n')
};

const COMMAND = 'rgba(5, 80, 174, 1)';
const COMMAND_DARK = 'rgba(121, 192, 255, 1)';
const LITERAL = 'rgba(149, 56, 0, 1)';
const COMMENT = 'rgba(89, 99, 110, 1)';
const STRING = 'rgba(10, 48, 105, 1)';

type RawCase = {
	/** the start of the raw block's text */
	at: string;
	/** the DOM editor's raw block box and its lines */
	height: number;
	lines: number;
	/** words of the block in their syntax colors */
	colors: Record<string, string>;
	/** typed after `after`, and the color the typed word takes */
	typed: { after: string; text: string; word: string; color: string };
};

const CASES: Record<string, RawCase> = {
	'slice.tex': {
		at: '\\foo',
		height: 52,
		lines: 2,
		colors: { '\\foo': COMMAND, '%': COMMENT, comment: COMMENT },
		typed: { after: '\\foo', text: '{} \\bar', word: '\\bar', color: COMMAND }
	},
	'slice.typ': {
		at: '#diagram',
		height: 104,
		lines: 4,
		colors: { '#diagram': COMMAND, node: COMMAND, '"->"': STRING, '1': LITERAL },
		typed: { after: '#diagram(', text: '7, ', word: '7', color: LITERAL }
	},
	'slice.md': {
		at: '<div',
		height: 78,
		lines: 3,
		colors: { div: LITERAL, 'class=': COMMAND, '"note"': STRING, b: LITERAL },
		typed: { after: '<div', text: ' id="x"', word: '"x"', color: STRING }
	}
};

const texpile = useTexpile({ files: FILES });

type RawBlock = { pos: number; top: number; height: number; contentWidth: number; width: number; lines: number; words: [string, string][] };

/** the raw block holding `needle`: its box, its lines and every word it draws with its color */
function rawBlock(visual: VisualEditor, needle: string): Promise<RawBlock> {
	return inCanvas(
		visual.page,
		({ probe, view }, needle) => {
			const pos = view.state.doc.resolve(probe.posOf(needle)).before();
			const wrapper = probe.query('.raw-latex-wrapper').find((each) => each.pos === pos)!;
			const content = probe
				.query('.cm-content')
				.find((each) => each.rect.top >= wrapper.rect.top && each.rect.bottom <= wrapper.rect.bottom)!;
			const top = view.state.doc.resolve(pos).before(1);
			const words = probe
				.drawList(top)
				.filter((op) => op.op === 'fillText' && op.text!.trim() !== '')
				.map((op) => [op.text!, op.color!] as [string, string]);
			return {
				pos,
				top: wrapper.rect.top,
				height: wrapper.rect.height,
				width: wrapper.rect.width,
				contentWidth: content.rect.width,
				lines: probe.lines(pos).length,
				words
			};
		},
		needle
	);
}

function colorOf(block: RawBlock, word: string): string | undefined {
	return block.words.find(([text]) => text === word)?.[1];
}

function setMode(visual: VisualEditor, mode: 'light' | 'dark'): Promise<void> {
	return visual.page.evaluate(async (mode) => {
		const theme = await import(/* @vite-ignore */ '/src/lib/theme.ts' as string);
		theme.setTheme(mode);
	}, mode);
}

for (const [file, raw] of Object.entries(CASES)) {
	test(`${file}: a raw block is drawn and typed into with Lezer colors`, async () => {
		const visual = new VisualEditor(texpile().page, texpile().root);
		await setMode(visual, 'light');
		await visual.open(file);
		await settled(visual.page);

		const read = await rawBlock(visual, raw.at);
		expect(read.height, "the DOM editor's raw block height").toBeCloseTo(raw.height, 0);
		expect(read.lines).toBe(raw.lines);
		expect(read.contentWidth, "CodeMirror's 3 px scroller border").toBeCloseTo(read.width - 3, 1);
		for (const [word, color] of Object.entries(raw.colors)) expect(colorOf(read, word), word).toBe(color);

		// a click places the caret in the island and typing colors what it types
		const at = await inCanvas(visual.page, ({ probe }, needle) => probe.clientPointOf(probe.posOf(needle)), raw.at);
		await visual.page.mouse.click(at.x + 1, at.y);
		await settled(visual.page);
		expect(await inCanvas(visual.page, ({ view }) => view.state.selection.$head.parent.type.name)).toBe('raw_latex');
		await inCanvas(visual.page, ({ probe }, after) => probe.select(probe.posOf(after) + after.length), raw.typed.after);
		await visual.page.keyboard.type(raw.typed.text);
		await settled(visual.page);
		const typed = await rawBlock(visual, raw.typed.text.trim());
		expect(colorOf(typed, raw.typed.word), `${raw.typed.word} as typed`).toBe(raw.typed.color);

		// Enter at the end of the block puts the caret on a new line of the island, and undo takes the edit away
		const end = await inCanvas(visual.page, ({ view }, pos) => pos + view.state.doc.nodeAt(pos)!.nodeSize - 1, typed.pos);
		await inCanvas(visual.page, ({ probe }, end) => probe.select(end), end);
		const before = await inCanvas(visual.page, ({ probe }, end) => probe.rectOf(end)!.top, end);
		await visual.page.keyboard.press('Enter');
		await settled(visual.page);
		const grown = await rawBlock(visual, raw.typed.text.trim());
		expect(grown.lines, 'Enter adds a line to the island').toBe(typed.lines + 1);
		const caret = await inCanvas(visual.page, ({ probe, view }) => ({
			top: probe.rectOf(view.state.selection.head)!.top,
			in: view.state.selection.$head.parent.type.name
		}));
		expect(caret.in).toBe('raw_latex');
		expect(caret.top, 'the caret sits on the new last line').toBeGreaterThan(before + 10);
		// the file's undo steps follow its writes, which join the typing and the Enter or keep them apart; the Typst and
		// Markdown round trip keeps the line Enter made, as the DOM editor's undo does
		let undone = typed.words;
		for (let step = 0; step < 3 && JSON.stringify(undone) !== JSON.stringify(read.words); step++) {
			await visual.page.keyboard.press('ControlOrMeta+z');
			await settled(visual.page);
			undone = (await rawBlock(visual, raw.at)).words;
		}
		expect(undone).toEqual(read.words);

		// dark mode repaints the syntax colors from the sheets
		const word = Object.entries(raw.colors).find(([, color]) => color === COMMAND)?.[0];
		if (word) {
			await setMode(visual, 'dark');
			await settled(visual.page);
			expect(colorOf(await rawBlock(visual, raw.at), word), `${word} in dark mode`).toBe(COMMAND_DARK);
			await setMode(visual, 'light');
			await settled(visual.page);
		}
		expect(await probeErrors(visual.page)).toEqual([]);
	});
}

test('slice.tex: a raw block just inserted is drawn with colors as one read from the file', async () => {
	const visual = new VisualEditor(texpile().page, texpile().root);
	await setMode(visual, 'light');
	await visual.open('slice.tex');
	await settled(visual.page);
	await inCanvas(visual.page, ({ probe, view }) => {
		const after = view.state.doc.resolve(probe.posOf('The last paragraph')).before();
		const { schema } = view.state;
		view.dispatch(view.state.tr.insert(after, schema.nodes.raw_latex.create(null, schema.text('\\mysetup{x} % inserted'))));
	});
	await settled(visual.page);
	const inserted = await rawBlock(visual, '\\mysetup');
	expect(colorOf(inserted, '\\mysetup')).toBe(COMMAND);
	expect(colorOf(inserted, 'inserted')).toBe(COMMENT);
	expect(await probeErrors(visual.page)).toEqual([]);
});
