// @vitest-environment jsdom
//
// The rule this guards: clicking past the last letter of a flagged word places the caret and must
// NOT open the suggestion box. The first attempt keyed off event.target, which never fired - that
// click lands outside the flagged span's own box, so the target is the block around it - and the
// bug survived a release. These assertions are the reason to trust the second attempt.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EditorState, Plugin } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { proofreadPlugin, spellClickBoundaryPlugin } from '$lib/editor/spellcheck/spellcheckplugin';
import { pmSuggestions, setPmSuggestions } from '$lib/editor/visual/extensions/pmSuggestions';
import { createTestCanvasView, settleTestView } from '../canvas/testing/testCanvasView';
import { createLaidOutTestView } from '../canvas/testing/laidOutTestView';

// "Hello World" in one paragraph: content starts at 1, so Hello is 1-6, the space 6, World 7-12.
const FLAG_FROM = 7;
const FLAG_TO = 12;

function mountEditor() {
	const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Hello World')])]);
	// stands in for the proofread plugin's own decoration, which carries its lint's errors
	const flagWorld = new Plugin({
		props: {
			decorations: (state) =>
				DecorationSet.create(state.doc, [Decoration.inline(FLAG_FROM, FLAG_TO, { class: 'proofread-spell' }, { errors: [{}] })])
		}
	});
	const view = createTestCanvasView(EditorState.create({ doc, plugins: [flagWorld] })) as unknown as EditorView;
	return { view };
}

const clickAt = (view: EditorView, pos: number, clientX = 0, clientY = 0) =>
	spellClickBoundaryPlugin.props.handleClick!.call(spellClickBoundaryPlugin, view, pos, new MouseEvent('click', { clientX, clientY }));

/** the test geometry gives text no rects, so the flagged word's last line is given a box by hand: x 100 to 140, y 10 to 30 */
function layOutFlaggedWord(view: EditorView) {
	view.canvas.rangeClientRects = () => [new DOMRect(100, 10, 40, 20)];
}

describe('spellClickBoundaryPlugin', () => {
	it('swallows the click at the end of a flagged word, so the caret can go there', () => {
		const { view } = mountEditor();
		expect(clickAt(view, FLAG_TO)).toBe(true);
		view.destroy();
	});

	// the caret resolves after the last letter from anywhere on its right half; the box decides
	it('lets a click on the last letter through, and swallows one past the word', () => {
		const { view } = mountEditor();
		layOutFlaggedWord(view);
		expect(clickAt(view, FLAG_TO, 138, 20)).toBe(false); // on the d of World
		expect(clickAt(view, FLAG_TO, 143, 20)).toBe(true); // in the gap after it
		expect(clickAt(view, FLAG_TO, 138, 40)).toBe(true); // the line below, past the word's box
		view.destroy();
	});

	it('lets a click inside the word through, which is a real request for suggestions', () => {
		const { view } = mountEditor();
		expect(clickAt(view, FLAG_FROM + 2)).toBe(false);
		view.destroy();
	});

	// the leading edge stays clickable, matching how source mode behaves
	it('lets a click at the start of the word through', () => {
		const { view } = mountEditor();
		expect(clickAt(view, FLAG_FROM)).toBe(false);
		view.destroy();
	});

	// returning true here would eat the click for every other handleClick handler in the editor
	it('ignores the end of a word that is not flagged', () => {
		const { view } = mountEditor();
		expect(clickAt(view, 6)).toBe(false); // end of "Hello", no decoration
		view.destroy();
	});

	it('ignores a position with no character behind it', () => {
		const { view } = mountEditor();
		expect(clickAt(view, 1)).toBe(false);
		view.destroy();
	});
});

describe('a click on struck words', () => {
	// the box animates in; jsdom has no Web Animations
	beforeAll(() => {
		if (!Element.prototype.animate) {
			Element.prototype.animate = (() => ({ cancel() {}, finished: Promise.resolve(), onfinish: null })) as never;
		}
	});
	afterEach(() => document.getElementById('harper-suggestion-container')?.remove());

	it('opens no box for the flagged word the struck words touch, and leaves the click to the caret', async () => {
		const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Hello World')])]);
		const proofread = proofreadPlugin(() => 'en');
		const view = createLaidOutTestView(EditorState.create({ doc, plugins: [pmSuggestions(), proofread] }), { width: 600 });
		const replaced = {
			id: 'r',
			from: FLAG_FROM,
			to: FLAG_TO,
			restore: 'Earth',
			mine: false,
			old: [{ text: 'Earth ', marks: [] }],
			partial: false
		};
		setPmSuggestions(view as never, [replaced]);
		const error = { from: 6, to: 11, msg: 'Spelling', shortmsg: 'Spelling', type: 'Spelling', replacements: ['Word'], text: 'World' };
		const flagged = Decoration.inline(FLAG_FROM, FLAG_TO, { class: 'proofread-spelling' }, { errors: [error], keys: ['k'] });
		const lintState = {
			cacheMap: new Map(),
			ignoredErrors: new Map(),
			spellcheckEnabled: true,
			decor: DecorationSet.create(doc, [flagged])
		};
		view.dispatch(view.state.tr.setMeta('updateSpellcheckEnabled', true).setMeta('proofread', lintState));
		await settleTestView(view);
		const line = view.canvas.geometry.linesOf(0)[0];
		const y = (line.top + line.bottom) / 2;
		let struckX = -1;
		for (let x = line.left; x < line.right && struckX < 0; x += 2)
			if (view.canvas.geometry.hit({ x, y })?.target.kind === 'widget') struckX = x + 1;
		expect(struckX, 'the old words take room in the line').toBeGreaterThan(0);
		const client = view.canvas.clientRect({ x: struckX, y, width: 0, height: 0 });
		const click = new MouseEvent('click', { clientX: client.left, clientY: client.top });
		const target = view as unknown as EditorView;
		expect(spellClickBoundaryPlugin.props.handleClick!.call(spellClickBoundaryPlugin, target, FLAG_FROM, click)).toBe(false);
		expect(proofread.props.handleClick!.call(proofread, target, FLAG_FROM, click)).toBe(false);
		expect(document.getElementById('harper-suggestion-container')).toBeNull();
		view.destroy();
	});
});
