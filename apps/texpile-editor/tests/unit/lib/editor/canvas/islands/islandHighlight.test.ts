// island highlighting: an edit re-parses from the last tree to the colors a fresh parse gives, a grammar that loads late
// relays the window's islands once, and the runs take the recorded colors from the highlight style's looks
import { readFileSync } from 'node:fs';
import type { Node as PMNode } from 'prosemirror-model';
import { describe, expect, it } from 'vitest';
import { faceElement, type LayoutStyle } from '$lib/editor/canvas';
import { loadLanguage, rawLanguageName } from '$lib/editor/code/languageFor';
import type { HighlightedSpan } from '$lib/editor/code/highlightSpans';
import { latexLanguage } from '$lib/languages/latex/source/latexLanguage';
import { parseMarkdownFile } from '$lib/languages/markdown/visual/roundtrip';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { windowInvalidation } from '$lib/editor/canvas/document/invalidation';
import { IslandHighlighter, islandGrammar, tokenLookOf } from '$lib/editor/canvas/islands/islandHighlight';
import { CanvasStyleResolver } from '$lib/editor/canvas/style/canvasStyles';
import { createStyleBase } from '$lib/editor/canvas/style/base/styleBase';
import { loadRecording, parityDocumentPath, styleDifferences } from '../style/parity/parityRecording';
import { parityTokens } from '../style/parity/parityTokens';

it('colors each edit of a LaTeX island as a fresh parse does', () => {
	const typing = new IslandHighlighter('latex', latexLanguage);
	const edits = ['\\section{A} % x', '\\section{AB} % x', '\\sec{AB} % x', '$x$ \\sec{AB} % x', '$x$ \\sec{AB} %'];
	for (const text of edits) expect(typing.spansOf(text)).toEqual(new IslandHighlighter('latex', latexLanguage).spansOf(text));
});

it('loads the Typst grammar once and relays the islands that drew without it', async () => {
	const win = {} as Window;
	const fired: string[] = [];
	windowInvalidation(win).listen((key) => {
		if (key.kind === 'grammar') fired.push(key.language);
	});
	expect(islandGrammar('typst', win)).toBeNull();
	expect(islandGrammar('typst', win)).toBeNull();
	expect(new IslandHighlighter('typst', null).pending).toBe(true);
	await expect.poll(() => fired, { timeout: 20_000 }).toEqual(['typst']);
	const language = islandGrammar('typst', win)!;
	const spans = new IslandHighlighter('typst', language).spansOf('#let x = 1');
	expect(spans.length).toBeGreaterThan(0);
	expect(new IslandHighlighter('typst', null).pending).toBe(false);
});

const ISLANDS = new Set(['raw_latex', 'inline_latex']);
const TOKEN = /cm-line:(\d+)>span:(\d+)$/;
const COLORED = /^(paint\.color|layout\.font\.(style|weight))\b/;

/** the classes of each line's spans, as CodeMirror splits a span at a line break */
function lineSpans(text: string, spans: readonly HighlightedSpan[]): string[][] {
	let start = 0;
	return text.split('\n').map((line) => {
		const end = start + line.length;
		const classes = spans.filter((span) => span.from < end && span.to > start).map((span) => span.classes);
		start = end + 1;
		return classes;
	});
}

describe.each([
	['parity-md-body', 'main.md', 'parity-md-body__main_md@light.json', parseMarkdownFile],
	['parity-tex-body', 'main.tex', 'parity-tex-body__main_tex@light.json', parseLatexFile]
] as const)('island runs in %s', (folder, file, recordingName, parse) => {
	const path = parityDocumentPath(folder, file);
	it.skipIf(!path)('take the colors the DOM editor’s CodeMirror drew', async () => {
		const { doc } = parse(readFileSync(path!, 'utf8')) as { doc: PMNode };
		const rows = loadRecording(recordingName).rows.filter((row) => ISLANDS.has(row.nodeType) && TOKEN.test(row.path));
		const styles = new CanvasStyleResolver({
			base: createStyleBase({ nodeOf: () => null, doc: () => doc }, () => ({
				language: folder.includes('md') ? 'markdown' : 'latex',
				pageView: false,
				readOnly: false,
				viewportWidth: 1280,
				editorFont: null
			})),
			tokens: parityTokens('light'),
			viewport: () => ({ width: 1280, height: 860 })
		});
		const block = faceElement('div');
		const failures: string[] = [];
		let compared = 0;
		for (const pos of new Set(rows.map((row) => row.pos))) {
			const node = doc.nodeAt(pos)!;
			const name = rawLanguageName(node.attrs.lang, node.textContent);
			const language = await loadLanguage(name);
			const lines = lineSpans(node.textContent, new IslandHighlighter(name, language).spansOf(node.textContent));
			for (const row of rows.filter((r) => r.pos === pos)) {
				const [, line, index] = TOKEN.exec(row.path)!.map(Number);
				const classes = lines[line]?.[index];
				if (classes === undefined) {
					failures.push(`${pos} line ${line} span ${index}: no span`);
					continue;
				}
				const level = { tag: 'span', classes: classes.split(' '), attrs: {}, hovered: false, look: tokenLookOf(classes) };
				const run = styles.runStyle(block, { key: classes, levels: [level] });
				const actual = { layout: { font: run.font } as LayoutStyle, paint: run.paint };
				failures.push(...styleDifferences(row, actual, COLORED).map((difference) => `${pos} ${classes} ${difference}`));
				compared++;
			}
		}
		expect(compared).toBeGreaterThan(10);
		expect(failures).toEqual([]);
	});
});
