import { expect, test } from '@playwright/test';
import { Disk } from './driver/disk';
import { useTexpile } from './driver/useTexpile';
import { VisualEditor } from './driver/visualEditor';

const doc = (body: string, extra = '') => `\\documentclass{article}\n${extra}\\begin{document}\n\n${body}\n\n\\end{document}\n`;

const TIKZCD = '\\begin{tikzcd} A \\arrow[r] & B \\end{tikzcd}';

const texpile = useTexpile({
	files: {
		'empty.tex': '',
		'empty-type.tex': '',
		'empty-two.tex': '',
		'empty-undo.tex': '',
		'empty-count.tex': '',
		'one-word.tex': doc('Hello'),
		'plain-par.tex': doc('Hello world.'),
		'split.tex': doc('Alpha beta'),
		'escape.tex': doc('Start'),
		'bold-toolbar.tex': doc('Hello world and more'),
		'bold-key.tex': doc('Hello world and more'),
		'italic-key.tex': doc('Hello world and more'),
		'bold-italic.tex': doc('Hello world and more'),
		'bold-typed.tex': doc('Start'),
		'undo-type.tex': doc('Hello'),
		'undo-bold.tex': doc('Hello world'),
		'undo-split.tex': doc('Alpha beta'),
		'undo-multi.tex': doc('Hello'),
		'count-live.tex': doc('Hello'),
		'count-select.tex': doc('Hello brave new world'),
		'count-many.tex': doc('Hello'),
		'count-markup.tex': doc('Plain \\textbf{two words} and $x^2 + y$ \\emph{end}'),
		'count-source.tex': doc('Hello'),
		'crlf.tex': doc('Alpha beta\n\nGamma delta').replace(/\n/g, '\r\n'),
		'unicode.tex': doc('Start'),
		'raw-type.tex': doc(`Intro.\n\n\\[\n${TIKZCD}\n\\]\n\nOutro.`, '\\usepackage{tikz-cd}\n'),
		'sync.tex': doc('Hello'),
		'sync-undo.tex': doc('Hello'),
		'tik.tex': doc(
			`Hello world.\n\n\\[\n${TIKZCD}\n\\]\n\n\\[ x^2 \\]\n\n\\begin{equation}\n${TIKZCD}\n\\end{equation}\n\n\\begin{equation}\ny^2\n\\end{equation}`,
			'\\usepackage{tikz-cd}\n'
		),
		'tik-oneline.tex': doc(`Intro text.\n\n\\[ ${TIKZCD} \\]`, '\\usepackage{tikz-cd}\n'),
		'tik-nopkg.tex': doc(`Intro text.\n\n\\[\n${TIKZCD}\n\\]`),
		'tik-edit.tex': doc(`Intro text.\n\n\\[\n${TIKZCD}\n\\]\n\n\\[ x^2 \\]`, '\\usepackage{tikz-cd}\n')
	}
});

function visual(): VisualEditor {
	const { page, root } = texpile();
	return new VisualEditor(page, root);
}

// the 403s of a missing image can arrive after the test that opened it
let openedMissingImage = false;

// a figure whose image file is missing logs a resource error per render: its own test below holds which one, the rest check everything else
function ignoreMissingImageErrors(): void {
	openedMissingImage = true;
	const rest = texpile()
		.takeErrors()
		.filter((e) => !/status of (403 \(Forbidden\)|404 \(Not Found\))/.test(e));
	expect(rest, 'page or console errors other than the missing image').toEqual([]);
}

test.beforeEach(async () => {
	if (!openedMissingImage) return;
	openedMissingImage = false;
	await texpile().page.waitForTimeout(1500);
	texpile().takeErrors();
});

function disk(): Disk {
	return new Disk(texpile().root);
}

test.describe('visual and source round trip', () => {
	const files = ['main.tex', 'plain.tex', 'talk.tex', 'chapters/results.tex', 'tik.tex', 'empty.tex'];
	for (const rel of files) {
		test(`${rel} switches Visual, Source, Visual with no errors and no change on disk`, async () => {
			const v = visual();
			const original = disk().readBytes(rel);
			await v.open(rel);
			await v.showSource();
			if (original.length)
				expect(await v.page.locator('.cm-content').first().innerText()).toContain(original.toString('utf8').trim().split('\n')[0]);
			await v.showVisual();
			await v.showSource();
			await v.showVisual();
			await expect(v.editor).toBeVisible();
			await v.page.waitForTimeout(1500);
			expect(disk().readBytes(rel).equals(original), `${rel} changed on disk by switching modes`).toBe(true);
			if (rel === 'chapters/results.tex') ignoreMissingImageErrors();
		});
	}

	test('the source view shows exactly the file after a visual session', async () => {
		const v = visual();
		const original = disk().read('main.tex');
		await v.open('main.tex');
		await v.showSource();
		const text = await v.page.evaluate(async () =>
			(await import(/* @vite-ignore */ '/src/lib/stores/editorStore.ts' as string)).sourceCmView.current!.state.doc.toString()
		);
		expect(text.replace(/\r\n/g, '\n')).toBe(original.replace(/\r\n/g, '\n'));
	});
});

test('a figure whose image file is missing is reported as not found, never as forbidden', async () => {
	const v = visual();
	await v.open('chapters/results.tex');
	openedMissingImage = true;
	await v.page.waitForTimeout(2000);
	const errors = texpile().takeErrors();
	expect(
		errors.filter((e) => /403/.test(e)),
		'a 403 for figures/plot.png, which is not in the folder'
	).toEqual([]);
	expect(
		errors.filter((e) => !/status of 404 \(Not Found\)/.test(e)),
		'errors other than the 404 of the missing image'
	).toEqual([]);
});

test.describe('a save with no edit', () => {
	const cases: [string, string][] = [
		['main.tex', 'Speed is'],
		['plain.tex', 'Text.'],
		['chapters/results.tex', 'Body text.'],
		['tik.tex', 'Hello world.']
	];
	for (const [rel, anchor] of cases) {
		test(`${rel} is byte-identical after a letter typed and deleted`, async () => {
			const v = visual();
			const original = disk().readBytes(rel);
			await v.open(rel);
			await v.caretAtEndOf(anchor);
			await v.type('Q');
			// the first save really happened, so the revert below is a save too
			await disk().expectFile(rel, (t) => t.includes('Q'), `${rel} did not save the typed letter`);
			await v.press('Backspace');
			await expect
				.poll(() => disk().readBytes(rel).equals(original), {
					timeout: 10_000,
					message: `${rel} differs from the original after the revert`
				})
				.toBe(true);
			await v.page.waitForTimeout(1200);
			expect(disk().readBytes(rel).equals(original), `${rel} drifted after the revert`).toBe(true);
			if (rel === 'chapters/results.tex') ignoreMissingImageErrors();
		});
	}
});

test.describe('typing in the visual editor', () => {
	test('a paragraph typed in an empty file reaches the disk', async () => {
		const v = visual();
		await v.open('empty-type.tex');
		await v.editor.click();
		await v.type('Hello brave world');
		const saved = await disk().expectFile('empty-type.tex', (t) => t.includes('Hello brave world'), 'the typed paragraph was not saved');
		expect(saved).toMatch(/^Hello brave world/);
	});

	test('a paragraph typed in an empty file is saved without a trailing \\par', async () => {
		const v = visual();
		await v.open('empty-two.tex');
		await v.editor.click();
		await v.type('Only paragraph');
		const saved = await disk().expectFile('empty-two.tex', (t) => t.includes('Only paragraph'), 'the typed paragraph was not saved');
		expect(saved.trim(), 'the file after one typed paragraph, as in a file with a preamble').toBe('Only paragraph');
	});

	test('Enter then a second paragraph saves a blank line between them', async () => {
		const v = visual();
		await v.open('plain-par.tex');
		await v.caretAtEndOf('Hello world.');
		await v.press('Enter');
		await v.type('Second paragraph here.');
		await disk().expectFile('plain-par.tex', (t) => t === doc('Hello world.\n\nSecond paragraph here.'), 'two paragraphs on disk');
	});

	test('Enter inside a paragraph splits it in two', async () => {
		const v = visual();
		await v.open('split.tex');
		await v.caretAfter('Alpha');
		await v.press('Enter');
		await disk().expectFile(
			'split.tex',
			(t) => /Alpha\s*(\\par)?\s*\n\s*\nbeta|Alpha\n\nbeta/.test(t) || /Alpha\s+\\par\s*\n\s*\n?\s*beta/.test(t),
			'the paragraph split'
		);
		expect(await v.blockTypes()).toEqual(['paragraph', 'paragraph']);
	});

	test('typing inside main.tex changes only that sentence on disk', async () => {
		const v = visual();
		const original = disk().read('main.tex');
		await v.open('main.tex');
		await v.caretAtEndOf('Speed is');
		await v.press('Home');
		for (let i = 0; i < 'Speed is '.length; i++) await v.press('ArrowRight');
		await v.type('very fast and ');
		await disk().expectFile(
			'main.tex',
			(t) => t === original.replace('Speed is ', 'Speed is very fast and '),
			'main.tex after typing in a sentence'
		);
		// put it back
		for (let i = 0; i < 'very fast and '.length; i++) await v.press('Backspace');
		await disk().expectFile('main.tex', (t) => t === original, 'main.tex after deleting what was typed');
	});

	test('special characters typed in visual are escaped in the saved LaTeX', async () => {
		const v = visual();
		await v.open('escape.tex');
		await v.caretAtEndOf('Start');
		await v.type(' 50% R&D costs $5 #1 a_b {c}');
		const saved = await disk().expectFile('escape.tex', (t) => t.includes('R\\&D'), 'the escaped text was not saved');
		expect(saved).toContain('50\\% R\\&D costs \\$5 \\#1 a\\_b \\{c\\}');
	});
});

test.describe('typing and the file format', () => {
	test('a CRLF file keeps its CRLF line ends after typing in visual', async () => {
		const v = visual();
		await v.open('crlf.tex');
		await v.caretAtEndOf('Alpha');
		await v.type(' X');
		await expect
			.poll(() => disk().readBytes('crlf.tex').toString('latin1'), { timeout: 10_000 })
			.toBe(doc('Alpha beta X\n\nGamma delta').replace(/\n/g, '\r\n'));
	});

	test('accented and CJK letters typed in visual are saved as typed', async () => {
		const v = visual();
		await v.open('unicode.tex');
		await v.caretAtEndOf('Start');
		await v.page.keyboard.insertText(' café naïve 日本語');
		const saved = await disk().expectFile('unicode.tex', (t) => t.includes('café'), 'the accented text was not saved');
		expect(saved).toContain('Start café naïve 日本語');
	});

	test('text typed into a raw LaTeX block lands in the file and the blocks around it stay', async () => {
		const v = visual();
		await v.open('raw-type.tex');
		await v.page.locator('.raw-latex-wrapper .cm-content').first().click();
		await v.press('Control+End');
		await v.type(' % note');
		const saved = await disk().expectFile('raw-type.tex', (t) => t.includes('% note'), 'the raw block edit was not saved');
		expect(saved).toBe(doc(`Intro.\n\n\\[\n${TIKZCD}\n\\] % note\n\nOutro.`, '\\usepackage{tikz-cd}\n'));
		expect(await v.blockTypes()).toEqual(['paragraph', 'raw_latex', 'paragraph']);
	});

	test('text typed in visual shows in the source view and text typed in source shows in visual', async () => {
		const v = visual();
		await v.open('sync.tex');
		await v.caretAtEndOf('Hello');
		await v.type(' there');
		await v.showSource();
		await expect.poll(() => v.page.locator('.cm-content').first().innerText()).toContain('Hello there');
		await v.type('!!');
		await v.showVisual();
		await expect.poll(() => v.text()).toBe('Hello there!!');
		await disk().expectFile('sync.tex', (t) => t.includes('Hello there!!'), 'the typed text on disk');
	});

	test('Ctrl+Z in visual undoes what was typed in the source view', async () => {
		const v = visual();
		await v.open('sync-undo.tex');
		await v.showSource();
		await v.page.locator('.cm-content').first().click();
		await v.press('Control+End');
		await v.press('ArrowUp');
		await v.press('ArrowUp');
		await v.press('End');
		await v.type(' more');
		await v.showVisual();
		await expect.poll(() => v.text()).toBe('Hello more');
		await v.editor.click();
		await v.press('Control+z');
		await expect.poll(() => v.text()).toBe('Hello');
	});
});

test.describe('the placeholder', () => {
	test('shows Start writing in an empty file', async () => {
		const v = visual();
		await v.open('empty.tex');
		const placeholder = v.page.locator('.pm-placeholder');
		await expect(placeholder).toHaveCount(1);
		await expect(placeholder).toHaveAttribute('data-placeholder', 'Start writing…');
		const shown = await placeholder.evaluate((el) => getComputedStyle(el, '::before').content);
		expect(shown, 'the placeholder is drawn by CSS from data-placeholder').toContain('Start writing');
	});

	test('goes away after typing and comes back when the text is deleted', async () => {
		const v = visual();
		await v.open('empty-undo.tex');
		await expect(v.page.locator('.pm-placeholder')).toHaveCount(1);
		await v.editor.click();
		await v.type('Hi');
		await expect(v.page.locator('.pm-placeholder')).toHaveCount(0);
		await v.press('Backspace');
		await v.press('Backspace');
		await expect(v.page.locator('.pm-placeholder')).toHaveCount(1);
	});

	test('does not show in a file that has text', async () => {
		const v = visual();
		await v.open('one-word.tex');
		await expect(v.page.locator('.pm-placeholder')).toHaveCount(0);
		await v.open('main.tex');
		await expect(v.page.locator('.pm-placeholder')).toHaveCount(0);
	});
});

test.describe('math and raw LaTeX blocks', () => {
	test('a tikzcd inside \\[ \\] is a raw LaTeX block and \\[ x^2 \\] is math', async () => {
		const v = visual();
		await v.open('tik.tex');
		expect(await v.blockTypes()).toEqual(['paragraph', 'raw_latex', 'block_math', 'raw_latex', 'block_math']);
		const raw = v.page.locator('.raw-latex-wrapper');
		await expect(raw).toHaveCount(2);
		await expect(raw.first()).toContainText('\\begin{tikzcd}');
		await expect(raw.first()).toContainText('\\[');
		await expect(v.page.locator('.block-math-container')).toHaveCount(2);
		// no math field sits inside a raw block: the diagram is not handed to the math editor
		await expect(v.page.locator('.raw-latex-wrapper math-field, .raw-latex-wrapper .block-math-container')).toHaveCount(0);
	});

	test('a \\begin{equation} holding a tikzcd is a raw LaTeX block too', async () => {
		const v = visual();
		await v.open('tik.tex');
		const raw = v.page.locator('.raw-latex-wrapper').nth(1);
		await expect(raw).toContainText('\\begin{equation}');
		await expect(raw).toContainText('\\end{equation}');
		await expect(raw).toContainText('tikzcd');
	});

	test('a one-line \\[ tikzcd \\] is raw LaTeX', async () => {
		const v = visual();
		await v.open('tik-oneline.tex');
		expect(await v.blockTypes()).toEqual(['paragraph', 'raw_latex']);
		await expect(v.page.locator('.block-math-container')).toHaveCount(0);
	});

	test('a tikzcd is raw LaTeX also when the tikz-cd package is not loaded', async () => {
		const v = visual();
		await v.open('tik-nopkg.tex');
		expect(await v.blockTypes()).toEqual(['paragraph', 'raw_latex']);
	});

	test('the math field of \\[ x^2 \\] holds the formula', async () => {
		const v = visual();
		await v.open('tik.tex');
		const value = await v.page
			.locator('.block-math-container math-field')
			.first()
			.evaluate((el) => (el as unknown as { value: string }).value);
		expect(value.replace(/\s/g, '')).toBe('x^2');
	});

	test('editing a paragraph keeps the tikzcd block and the math as written', async () => {
		const v = visual();
		const original = disk().read('tik-edit.tex');
		await v.open('tik-edit.tex');
		await v.caretAtEndOf('Intro text.');
		await v.type(' More.');
		const saved = await disk().expectFile('tik-edit.tex', (t) => t.includes('More.'), 'the edit was not saved');
		expect(saved).toBe(original.replace('Intro text.', 'Intro text. More.'));
	});
});

test.describe('bold and italic', () => {
	test('the Bold toolbar button wraps the selection in \\textbf and a second click unwraps it', async () => {
		const v = visual();
		await v.open('bold-toolbar.tex');
		await v.select('world');
		await v.toolbarButton('Bold').click();
		await disk().expectFile('bold-toolbar.tex', (t) => t.includes('Hello \\textbf{world} and more'), 'bold from the toolbar');
		await v.select('world');
		await v.toolbarButton('Bold').click();
		await disk().expectFile('bold-toolbar.tex', (t) => t.includes('Hello world and more') && !t.includes('textbf'), 'bold toggled off');
	});

	test('the Italic toolbar button wraps the selection in \\textit', async () => {
		const v = visual();
		await v.open('bold-toolbar.tex');
		await v.select('more');
		await v.toolbarButton('Italic').click();
		await disk().expectFile('bold-toolbar.tex', (t) => t.includes('and \\textit{more}'), 'italic from the toolbar');
	});

	test('Ctrl+B makes the selection bold and Ctrl+B again takes it off', async () => {
		const v = visual();
		await v.open('bold-key.tex');
		await v.select('world');
		await v.press('Control+b');
		await disk().expectFile('bold-key.tex', (t) => t.includes('Hello \\textbf{world} and more'), 'Ctrl+B');
		await v.press('Control+b');
		await disk().expectFile('bold-key.tex', (t) => t.includes('Hello world and more') && !t.includes('textbf'), 'Ctrl+B toggled off');
	});

	test('Ctrl+I makes the selection italic', async () => {
		const v = visual();
		await v.open('italic-key.tex');
		await v.select('Hello');
		await v.press('Control+i');
		await disk().expectFile('italic-key.tex', (t) => t.includes('\\textit{Hello} world'), 'Ctrl+I');
	});

	test('bold and italic together nest both commands around the word', async () => {
		const v = visual();
		await v.open('bold-italic.tex');
		await v.select('world');
		await v.press('Control+b');
		await v.press('Control+i');
		const saved = await disk().expectFile('bold-italic.tex', (t) => t.includes('textit') && t.includes('textbf'), 'bold and italic');
		expect(saved).toMatch(/\\text(bf\{\\textit|it\{\\textbf)\{world\}\}/);
	});

	test('Ctrl+B with no selection bolds what is typed next', async () => {
		const v = visual();
		await v.open('bold-typed.tex');
		await v.caretAtEndOf('Start');
		await v.press('Control+b');
		await v.type(' loud');
		await v.press('Control+b');
		await v.type(' quiet');
		await disk().expectFile(
			'bold-typed.tex',
			(t) => /Start\s*\\textbf\{\s*loud\}\s*quiet|Start\\textbf\{ loud\} quiet/.test(t),
			'typed bold run'
		);
	});
});

test.describe('undo and redo in the visual editor', () => {
	test('Ctrl+Z takes typed text back out and Ctrl+Shift+Z puts it in again', async () => {
		const v = visual();
		await v.open('undo-type.tex');
		await v.caretAtEndOf('Hello');
		await v.type(' there');
		await disk().expectFile('undo-type.tex', (t) => t.includes('Hello there'), 'typed text saved');
		await v.press('Control+z');
		await disk().expectFile('undo-type.tex', (t) => t === doc('Hello'), 'undo reached the disk');
		expect(await v.text()).toBe('Hello');
		await v.press('Control+Shift+KeyZ');
		await disk().expectFile('undo-type.tex', (t) => t.includes('Hello there'), 'redo reached the disk');
		expect(await v.text()).toBe('Hello there');
	});

	test('Ctrl+Z undoes a bold', async () => {
		const v = visual();
		await v.open('undo-bold.tex');
		await v.select('world');
		await v.press('Control+b');
		await disk().expectFile('undo-bold.tex', (t) => t.includes('\\textbf{world}'), 'bold saved');
		await v.press('Control+z');
		await disk().expectFile('undo-bold.tex', (t) => t === doc('Hello world'), 'undo of the bold');
		await v.press('Control+Shift+KeyZ');
		await disk().expectFile('undo-bold.tex', (t) => t.includes('\\textbf{world}'), 'redo of the bold');
	});

	test('Ctrl+Z joins a split paragraph again', async () => {
		const v = visual();
		await v.open('undo-split.tex');
		await v.caretAfter('Alpha');
		await v.press('Enter');
		await expect.poll(() => v.blockTypes()).toEqual(['paragraph', 'paragraph']);
		await v.press('Control+z');
		await expect.poll(() => v.blockTypes()).toEqual(['paragraph']);
		await expect.poll(() => v.text()).toBe('Alpha beta');
		await disk().expectFile('undo-split.tex', (t) => t === doc('Alpha beta'), 'the joined paragraph on disk');
	});

	test('several separate edits undo one at a time, in order', async () => {
		const v = visual();
		await v.open('undo-multi.tex');
		await v.caretAtEndOf('Hello');
		await v.type(' one');
		await v.page.waitForTimeout(700);
		await v.type(' two');
		await v.page.waitForTimeout(700);
		await v.type(' three');
		await expect.poll(() => v.text()).toBe('Hello one two three');
		await v.press('Control+z');
		await expect.poll(() => v.text()).toBe('Hello one two');
		await v.press('Control+z');
		await expect.poll(() => v.text()).toBe('Hello one');
		await v.press('Control+z');
		await expect.poll(() => v.text()).toBe('Hello');
		await v.press('Control+Shift+KeyZ');
		await expect.poll(() => v.text()).toBe('Hello one');
	});

	test('Ctrl+Z in a new empty file brings the placeholder back', async () => {
		const v = visual();
		await v.open('empty-count.tex');
		await v.editor.click();
		await v.type('Draft');
		await expect(v.page.locator('.pm-placeholder')).toHaveCount(0);
		await v.press('Control+z');
		await expect(v.page.locator('.pm-placeholder')).toHaveCount(1);
		await disk().expectFile('empty-count.tex', (t) => !t.includes('Draft'), 'the undone word left the disk');
	});
});

test.describe('word count', () => {
	test('one word reads 1 word', async () => {
		const v = visual();
		await v.open('one-word.tex');
		await expect(v.wordCount()).toHaveText('1 word');
	});

	test('an empty file reads 0 words', async () => {
		const v = visual();
		await v.open('empty.tex');
		await expect(v.wordCount()).toHaveText('0 words');
	});

	test('several words read N words', async () => {
		const v = visual();
		await v.open('count-select.tex');
		await expect(v.wordCount()).toHaveText('4 words');
	});

	test('the count follows typing and deleting', async () => {
		const v = visual();
		await v.open('count-live.tex');
		await expect(v.wordCount()).toHaveText('1 word');
		await v.caretAtEndOf('Hello');
		await v.type(' big');
		await expect(v.wordCount()).toHaveText('2 words');
		await v.type(' wide world');
		await expect(v.wordCount()).toHaveText('4 words');
		for (let i = 0; i < ' wide world'.length; i++) await v.press('Backspace');
		await expect(v.wordCount()).toHaveText('2 words');
		for (let i = 0; i < ' big'.length; i++) await v.press('Backspace');
		await expect(v.wordCount()).toHaveText('1 word');
	});

	test('a selection reads N of M words', async () => {
		const v = visual();
		await v.open('count-select.tex');
		await v.select('Hello brave');
		await expect(v.wordCount()).toHaveText('2 of 4 words');
		await v.select('Hello');
		await expect(v.wordCount()).toHaveText('1 of 4 words');
	});

	test('a thousand words read 1,000 words', async () => {
		const v = visual();
		await v.open('count-many.tex');
		await v.caretAtEndOf('Hello');
		await v.page.keyboard.insertText(' word'.repeat(999));
		await expect(v.wordCount()).toHaveText('1,000 words');
	});

	test('the source view counts the same file the same way', async () => {
		const v = visual();
		await v.open('count-source.tex');
		await expect(v.wordCount()).toHaveText('1 word');
		await v.showSource();
		await expect(v.wordCount()).toHaveText('1 word');
		await v.showVisual();
		await expect(v.wordCount()).toHaveText('1 word');
	});

	test('main.tex counts its prose only, in visual and in source', async () => {
		const v = visual();
		await v.open('main.tex');
		await expect(v.wordCount()).toHaveText('4 words');
		await v.showSource();
		await expect(v.wordCount()).toHaveText('4 words');
		await v.showVisual();
	});

	test('words inside \\textbf and \\emph are counted and math is not', async () => {
		const v = visual();
		await v.open('count-markup.tex');
		await expect(v.wordCount()).toHaveText('5 words');
		await v.showSource();
		await expect(v.wordCount()).toHaveText('5 words');
		await v.showVisual();
	});

	test('hovering the count lists the words of the whole paper file by file', async () => {
		const v = visual();
		await v.open('main.tex');
		await v.wordCount().hover();
		const panel = v.page.locator('[data-scope="popover"][data-part="content"][data-state="open"]');
		await expect(panel).toContainText('chapters/results.tex');
		await expect(panel).toContainText('main.tex');
		await expect(panel).toContainText(/\d+ words/);
		await v.press('Escape');
	});
});
