// @vitest-environment jsdom
//
// The rule this guards: clicking past the last letter of a flagged word places the caret and must
// NOT open the suggestion box. The first attempt keyed off event.target, which never fired - that
// click lands outside the flagged span's own box, so the target is the block around it - and the
// bug survived a release. These assertions are the reason to trust the second attempt.
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { EditorState, Plugin } from 'prosemirror-state';
import { EditorView, Decoration, DecorationSet } from 'prosemirror-view';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { proofreadPlugin, spellClickBoundaryPlugin } from '$lib/editor/spellcheck/spellcheckplugin';

// "Hello World" in one paragraph: content starts at 1, so Hello is 1-6, the space 6, World 7-12.
const FLAG_FROM = 7;
const FLAG_TO = 12;

function mountEditor() {
	const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Hello World')])]);
	// stands in for the proofread plugin's own decoration; only the class name matters here
	const flagWorld = new Plugin({
		props: {
			decorations: (state) => DecorationSet.create(state.doc, [Decoration.inline(FLAG_FROM, FLAG_TO, { class: 'proofread-spell' })])
		}
	});
	const place = document.createElement('div');
	document.body.appendChild(place);
	const view = new EditorView(place, { state: EditorState.create({ doc, plugins: [flagWorld] }) });
	return { view, place };
}

const clickAt = (view: EditorView, pos: number, clientX = 0, clientY = 0) =>
	spellClickBoundaryPlugin.props.handleClick!.call(spellClickBoundaryPlugin, view, pos, new MouseEvent('click', { clientX, clientY }));

/** jsdom lays nothing out, so the flagged span is given a box by hand: x 100 to 140, y 10 to 30 */
function layOutFlaggedWord(place: HTMLElement) {
	const span = place.querySelector('.proofread-spell') as HTMLElement;
	const rect = { left: 100, right: 140, top: 10, bottom: 30, width: 40, height: 20, x: 100, y: 10, toJSON: () => ({}) } as DOMRect;
	span.getClientRects = () => [rect] as unknown as DOMRectList;
}

describe('spellClickBoundaryPlugin', () => {
	it('swallows the click at the end of a flagged word, so the caret can go there', () => {
		const { view, place } = mountEditor();
		expect(clickAt(view, FLAG_TO)).toBe(true);
		view.destroy();
		place.remove();
	});

	// the caret resolves after the last letter from anywhere on its right half; the box decides
	it('lets a click on the last letter through, and swallows one past the word', () => {
		const { view, place } = mountEditor();
		layOutFlaggedWord(place);
		expect(clickAt(view, FLAG_TO, 138, 20)).toBe(false); // on the d of World
		expect(clickAt(view, FLAG_TO, 143, 20)).toBe(true); // in the gap after it
		expect(clickAt(view, FLAG_TO, 138, 40)).toBe(true); // the line below, past the word's box
		view.destroy();
		place.remove();
	});

	it('lets a click inside the word through, which is a real request for suggestions', () => {
		const { view, place } = mountEditor();
		expect(clickAt(view, FLAG_FROM + 2)).toBe(false);
		view.destroy();
		place.remove();
	});

	// the leading edge stays clickable, matching how source mode behaves
	it('lets a click at the start of the word through', () => {
		const { view, place } = mountEditor();
		expect(clickAt(view, FLAG_FROM)).toBe(false);
		view.destroy();
		place.remove();
	});

	// returning true here would eat the click for every other handleClick handler in the editor
	it('ignores the end of a word that is not flagged', () => {
		const { view, place } = mountEditor();
		expect(clickAt(view, 6)).toBe(false); // end of "Hello", no decoration
		view.destroy();
		place.remove();
	});

	it('ignores a position with no character behind it', () => {
		const { view, place } = mountEditor();
		expect(clickAt(view, 1)).toBe(false);
		view.destroy();
		place.remove();
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

	it('opens no box for the flagged word the struck words touch, and leaves the click to the caret', () => {
		const doc = schema.node('doc', null, [schema.node('paragraph', null, [schema.text('Hello World')])]);
		const struck = () => Object.assign(document.createElement('span'), { className: 'pm-suggest-old', textContent: 'the ' });
		const oldWords = new Plugin({
			props: { decorations: (state) => DecorationSet.create(state.doc, [Decoration.widget(FLAG_FROM, struck)]) }
		});
		const proofread = proofreadPlugin(() => 'en');
		const place = document.body.appendChild(document.createElement('div'));
		const view = new EditorView(place, { state: EditorState.create({ doc, plugins: [oldWords, proofread] }) });
		const error = { from: 6, to: 11, msg: 'Spelling', shortmsg: 'Spelling', type: 'Spelling', replacements: ['Word'], text: 'World' };
		const flagged = Decoration.inline(FLAG_FROM, FLAG_TO, { class: 'proofread-spelling' }, { errors: [error], keys: ['k'] });
		const lintState = {
			cacheMap: new Map(),
			ignoredErrors: new Map(),
			spellcheckEnabled: true,
			decor: DecorationSet.create(doc, [flagged])
		};
		view.dispatch(view.state.tr.setMeta('updateSpellcheckEnabled', true).setMeta('proofread', lintState));
		const click = new MouseEvent('click');
		Object.defineProperty(click, 'target', { value: place.querySelector('.pm-suggest-old') });
		expect(spellClickBoundaryPlugin.props.handleClick!.call(spellClickBoundaryPlugin, view, FLAG_FROM, click)).toBe(false);
		expect(proofread.props.handleClick!.call(proofread, view, FLAG_FROM, click)).toBe(false);
		expect(document.getElementById('harper-suggestion-container')).toBeNull();
		view.destroy();
		place.remove();
	});
});
