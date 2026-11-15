import { expect, test } from '@playwright/test';
import { Disk } from './driver/disk';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';

const deck = String.raw`\documentclass{beamer}
\begin{document}

\begin{frame}{First Frame}
Some words on the first frame.
\end{frame}

\begin{frame}
\frametitle{Second Frame}
\begin{columns}
\column{0.5\textwidth}
Left column text.
\column{0.5\textwidth}
Right column text.
\end{columns}
\end{frame}

\begin{frame}{Third Frame}
Last words.
\end{frame}

\end{document}
`;

const float = (caption: string, rows: string) =>
	`\\begin{table}[h]\n\\centering\n\\caption{${caption}}\n\\begin{tabular}{|l|l|}\n\\hline\n${rows}\n\\end{tabular}\n\\end{table}\n`;
const floats = `\\documentclass{article}\n\\begin{document}\nBefore.\n\n${float('First', 'alpha & beta \\\\ \\hline\ngamma & delta \\\\ \\hline')}\n${float('Second', 'one & two \\\\ \\hline')}\nAfter.\n\\end{document}\n`;

const refs = `\\documentclass{article}\n\\usepackage{biblatex}\n\\begin{document}\nLast words.\n\n\\printbibliography\n\\end{document}\n`;

const appendix = `\\documentclass{article}\n\\begin{document}\n\\input{one}\n\n\\appendix\n\\input{two}\n\\end{document}\n`;
const wordsAppendix = `\\documentclass{article}\n\\begin{document}\n\\input{one}\n\nSome words\\appendix\n\\input{two}\n\\end{document}\n`;

const texpile = useTexpile({
	files: {
		'deck.tex': deck,
		'floats.tex': floats,
		'refs.tex': refs,
		'appendix.tex': appendix,
		'words-appendix.tex': wordsAppendix
	}
});
const visual = () => new VisualEditor(texpile().page, texpile().root);

/** the selection as `type:parent:text around it` */
async function where(v: VisualEditor): Promise<string> {
	return v.evalView<string>(
		`const s = view.state.selection; const $h = s.$head; return s.constructor.name + ':' + (s.node ? s.node.type.name : $h.parent.type.name) + ':' + $h.parent.textContent.slice(0, 14);`
	);
}

async function caretAtEndOf(v: VisualEditor, text: string): Promise<void> {
	await v.evalView(
		`let at = -1; view.state.doc.descendants((n, p) => { if (at < 0 && n.isText && n.text.includes(arg)) at = p + n.text.indexOf(arg) + arg.length; });
		view.focus(); view.dispatch(view.state.tr.setSelection(view.state.selection.constructor.near(view.state.doc.resolve(at))));`,
		text
	);
}

test('Down and Up in a deck go from one line of text to the next without stopping between frames and columns', async () => {
	const v = visual();
	await v.open('deck.tex');
	await caretAtEndOf(v, 'Some words on the first frame.');
	const down: string[] = [];
	for (let i = 0; i < 4; i++) {
		await v.press('ArrowDown');
		down.push(await where(v));
	}
	expect(down.map((s) => s.split(':')[0])).toEqual(['TextSelection', 'TextSelection', 'TextSelection', 'TextSelection']);
	expect(down.map((s) => s.split(':')[2])).toEqual(['Second Frame', 'Left column te', 'Right column t', 'Third Frame']);
	const up: string[] = [];
	for (let i = 0; i < 4; i++) {
		await v.press('ArrowUp');
		up.push((await where(v)).split(':')[2]);
	}
	expect(up).toEqual(['Right column t', 'Left column te', 'Second Frame', 'Some words on ']);
});

// Down from the row's first cell went past the gap to the next caption, and Up from the gap stood inside the float above
test('Down from the last row of a table float stops between two floats, where typing starts a paragraph', async () => {
	const v = visual();
	const disk = new Disk(texpile().root);
	await v.open('floats.tex');
	await caretAtEndOf(v, 'gamma');
	await v.press('ArrowDown');
	expect((await where(v)).split(':').slice(0, 2)).toEqual(['GapCursor', 'doc']);
	// the gap cursor draws its own bar, and the browser painted a second caret in its element or the block beside it
	expect(
		await v.evalView<string[]>(
			`const { $head } = view.state.selection;
			const near = [view.dom.querySelector('.ProseMirror-gapcursor'), view.nodeDOM($head.pos - $head.nodeBefore.nodeSize), view.nodeDOM($head.pos)];
			return near.map((el) => getComputedStyle(el).caretColor);`
		)
	).toEqual(Array(3).fill('rgba(0, 0, 0, 0)'));
	await v.press('ArrowUp');
	expect(await where(v)).toBe('TextSelection:paragraph:delta');
	await v.press('ArrowDown');
	await texpile().page.keyboard.type('Between.');
	await disk.expectFile(
		'floats.tex',
		(text) => /\\end\{table\}\s+Between\.\s+\\begin\{table\}/.test(text),
		'the words stand between the floats'
	);
});

// Down put the caret inside the text the References card does not show, so no caret showed anywhere
test('Down onto the bibliography selects the whole card', async () => {
	const v = visual();
	await v.open('refs.tex');
	await caretAtEndOf(v, 'Last words.');
	await v.press('ArrowDown');
	await expect.poll(() => where(v)).toMatch(/^NodeSelection:raw_latex:/);
});

// \appendix is a paragraph holding only its divider: the caret stood at its edge as on an empty line, typing there wrote
// beside \appendix, and no gap showed above or below it
test('a divider alone in its paragraph has a gap above and below, where typing starts a paragraph of its own', async () => {
	const v = visual();
	const disk = new Disk(texpile().root);
	await v.open('appendix.tex');
	await v.evalView(
		`let S = view.state.selection.constructor; while (Object.getPrototypeOf(S).fromJSON) S = Object.getPrototypeOf(S);
		view.focus(); view.dispatch(view.state.tr.setSelection(S.fromJSON(view.state.doc, { type: 'node', anchor: 0 })));`
	);
	const down: string[] = [];
	for (let i = 0; i < 4; i++) {
		await v.press('ArrowDown');
		down.push((await where(v)).split(':').slice(0, 2).join(':'));
	}
	expect(down).toEqual(['GapCursor:doc', 'NodeSelection:inline_latex', 'GapCursor:doc', 'NodeSelection:includedoc']);
	for (let i = 0; i < 3; i++) await v.press('ArrowUp');
	expect((await where(v)).split(':')[0]).toBe('GapCursor');
	await texpile().page.keyboard.type('Words.');
	await disk.expectFile(
		'appendix.tex',
		(text) => /\\input\{one\}\s+Words\.\n\s*\n\\appendix/.test(text),
		'the words stand above \\appendix'
	);
});

// with words before \appendix in its paragraph, Up from the \input under it put the caret after the divider, drawn at its
// end where it read as the divider's own tick
test('Up from below a divider that ends a paragraph of words selects the divider, then goes to the words', async () => {
	const v = visual();
	await v.open('words-appendix.tex');
	await v.evalView(
		`let at = -1; view.state.doc.forEach((n, pos) => { if (n.textContent.startsWith('Some words')) at = pos + n.nodeSize; });
		let S = view.state.selection.constructor; while (Object.getPrototypeOf(S).fromJSON) S = Object.getPrototypeOf(S);
		view.focus(); view.dispatch(view.state.tr.setSelection(S.fromJSON(view.state.doc, { type: 'node', anchor: at })));`
	);
	await v.press('ArrowUp');
	expect((await where(v)).split(':').slice(0, 2).join(':')).toBe('NodeSelection:inline_latex');
	await v.press('ArrowUp');
	expect(await v.evalView<string>('const { $head } = view.state.selection; return $head.nodeBefore?.text ?? "";')).toBe('Some words');
});
