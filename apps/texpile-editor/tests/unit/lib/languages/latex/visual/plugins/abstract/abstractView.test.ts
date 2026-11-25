// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import type { Node as PMNode } from 'prosemirror-model';
import { DecorationSet } from 'prosemirror-view';
import { expect, it } from 'vitest';
import type { VisualView } from '$lib/editor/canvas';
import { CanvasStyleResolver } from '$lib/editor/canvas/style/canvasStyles';
import { createStyleBase } from '$lib/editor/canvas/style/base/styleBase';
import { abstractView } from '$lib/languages/latex/visual/plugins/abstract/abstractView';
import { parseLatexFile } from '$lib/workspace/latexRoundtrip';
import { loadRecording, parityDocumentPath, styleDifferences } from '../../../../../editor/canvas/style/parity/parityRecording';
import { parityTokens } from '../../../../../editor/canvas/style/parity/parityTokens';

// the box and its label: the label's text and the abstract's content are laid out by their own looks
const DRAWN = /^layout\.(display|position|margin|padding|inset|font\.(sizePx|weight)|textAlign)\b/;

const path = parityDocumentPath('parity-tex-theorems', 'main.tex');
it.skipIf(!path)('draws the abstract and its label as the DOM editor did on parity-tex-theorems', () => {
	const { doc } = parseLatexFile(readFileSync(path!, 'utf8')) as { doc: PMNode };
	const recording = loadRecording('parity-tex-theorems__main_tex@light.json');
	const settings = { language: 'latex' as const, pageView: false, readOnly: false, viewportWidth: 1280, editorFont: null };
	const styles = new CanvasStyleResolver({
		base: createStyleBase({ nodeOf: () => null, doc: () => doc }, () => settings),
		tokens: parityTokens('light'),
		viewport: () => ({ width: 1280, height: 860 })
	});
	const rows = recording.rows.filter((row) => row.nodeType === 'abstract' && row.path === '');
	expect(rows.map((row) => row.pseudo).sort()).toEqual(['', 'before']);
	const failures: string[] = [];
	for (const row of rows) {
		const { dom } = abstractView(doc.nodeAt(row.pos)!, {} as VisualView, () => row.pos, [], DecorationSet.empty);
		const part = row.pseudo ? styles.styleOf(dom.generatedBefore!) : styles.styleOf(dom);
		failures.push(...styleDifferences(row, part!, DRAWN).map((difference) => `${row.pseudo || 'abstract'} ${difference}`));
	}
	expect(failures).toEqual([]);
	const { dom } = abstractView(doc.nodeAt(rows[0].pos)!, {} as VisualView, () => rows[0].pos, [], DecorationSet.empty);
	expect(dom.generatedBefore?.textContent).toBe('Abstract');
});
