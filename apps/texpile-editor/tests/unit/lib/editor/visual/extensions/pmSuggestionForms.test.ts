// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { EditorState, TextSelection } from 'prosemirror-state';
import type { CanvasView } from '$lib/editor/canvas';
import { buildAnchor } from '$lib/comments/anchor';
import type { SuggestionMark } from '$lib/comments/activeSuggestions.svelte';
import { placePmSuggestions } from '$lib/editor/visual/extensions/pmSuggestionsPlace';
import { pmSuggestions, setPmSuggestions } from '$lib/editor/visual/extensions/pmSuggestions';
import { oldWordsClick } from '$lib/editor/visual/extensions/pmOldWordsCaret';
import { pmSuggestionsKey } from '$lib/editor/visual/extensions/pmSuggestionsState';
import { parseLatexFile, parseLatexRegion } from '$lib/workspace/latexRoundtrip';
import { settleTestView } from '../../canvas/testing/testCanvasView';
import { ADVANCE, createLaidOutTestView, LINE_HEIGHT } from '../../canvas/testing/laidOutTestView';

const SOURCE = 'Refinement is driven by an estimator.\n';
const parsed = parseLatexFile(SOURCE);

function mark(words: string, restore: string): SuggestionMark {
	const at = SOURCE.indexOf(words);
	return { id: 'replace', from: at, to: at + words.length, restore, mine: false, anchor: buildAnchor(SOURCE, at, at + words.length) };
}

async function suggested(): Promise<CanvasView> {
	const state = EditorState.create({ doc: parsed.doc, plugins: [pmSuggestions()] });
	const view = createLaidOutTestView(state, { width: 600 });
	const placed = placePmSuggestions(parsed.doc, [mark('driven', 'led')], {
		text: SOURCE,
		map: parsed.map,
		body: { from: 0, to: SOURCE.length },
		parse: (src) => parseLatexRegion(src)
	});
	setPmSuggestions(view as never, placed.ranges);
	await settleTestView(view);
	return view;
}

/** the x of each point along the first line whose hit is the struck words */
function struckXs(view: CanvasView): { xs: number[]; y: number } {
	const line = view.canvas.geometry.linesOf(0)[0];
	const y = (line.top + line.bottom) / 2;
	const xs: number[] = [];
	for (let x = line.left; x < line.right; x += 2) if (view.canvas.geometry.hit({ x, y })?.target.kind === 'widget') xs.push(x);
	return { xs, y };
}

describe('a suggestion on the canvas', () => {
	it('lays the old words out in the line and leaves them out of the text and the copy', async () => {
		const view = await suggested();
		expect(view.state.doc.textContent).toBe('Refinement is driven by an estimator.');
		const { xs } = struckXs(view);
		// "led" in the 9.6 px mono face, sampled every 2 px
		expect(xs[xs.length - 1] - xs[0]).toBeGreaterThan(3 * ADVANCE - 6);
		expect(xs[xs.length - 1] - xs[0]).toBeLessThan(3 * ADVANCE + 2);
		view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, view.state.doc.child(0).nodeSize - 1)));
		expect(view.serializeForClipboard(view.state.selection.content()).text).toBe('Refinement is driven by an estimator.');
		view.destroy();
	});

	it('puts the caret on the side of the old words a click fell on', async () => {
		const view = await suggested();
		const at = view.state.doc.textContent.indexOf('driven') + 1;
		const { xs, y } = struckXs(view);
		expect(xs.length, 'the old words take room in the line').toBeGreaterThan(5);
		for (const [x, side] of [
			[xs[0] + 1, 'before'],
			[xs[xs.length - 1] - 1, 'after']
		] as const) {
			view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)));
			const client = view.canvas.clientRect({ x, y, width: 0, height: 0 });
			const event = new MouseEvent('mousedown', { clientX: client.left, clientY: client.top });
			expect(oldWordsClick(view as never, at, event)).toBe(true);
			expect(view.state.selection.head).toBe(at);
			expect(pmSuggestionsKey.getState(view.state)?.caret).toEqual({ at, side });
		}
		view.destroy();
	});

	it('stands the items a cut took whole in a block of their own, which takes their room in the column', async () => {
		const source =
			'\\begin{itemize}\n\\item Paragraphs wra\n\\end{itemize}\n\n\\begin{enumerate}\n\\item First, open the folder.\n\\end{enumerate}\n';
		const file = parseLatexFile(source);
		const at = source.indexOf('Paragraphs wra') + 'Paragraphs wra'.length;
		const restore = 'pped by hand.\n\\item Inline math such as words.\n\\item A table, a link and a quotation.';
		const { ranges } = placePmSuggestions(
			file.doc,
			[{ id: 'cut', from: at, to: at, restore, mine: true, anchor: buildAnchor(source, at, at) }],
			{
				text: source,
				map: file.map,
				body: { from: 0, to: source.length },
				parse: (src) => parseLatexRegion(src)
			}
		);
		const view = createLaidOutTestView(EditorState.create({ doc: file.doc, plugins: [pmSuggestions()] }), { width: 600 });
		await settleTestView(view);
		const first = view.state.doc.textBetween(0, view.state.doc.content.size, '\n').indexOf('First');
		let after = -1;
		view.state.doc.descendants((node, pos) => {
			if (after < 0 && node.isText && node.text!.startsWith('First')) after = pos;
		});
		expect(first).toBeGreaterThan(0);
		const before = view.canvas.geometry.caretRect({ pos: after, affinity: 1 })!.y;
		setPmSuggestions(view as never, ranges);
		await settleTestView(view);
		const moved = view.canvas.geometry.caretRect({ pos: after, affinity: 1 })!.y;
		expect(moved - before, 'two items and the struck end of the first').toBeGreaterThanOrEqual(2 * LINE_HEIGHT);
		view.destroy();
	});
});
