// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { flushSync } from 'svelte';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { schema } from '$lib/languages/latex/schema/latexPMSchema';
import { environmentView } from '$lib/languages/latex/visual/extensions/environment/environmentView.svelte';
import { columnView } from '$lib/languages/latex/visual/plugins/slides/columnView';
import { chipPanel } from '$lib/editor/visual/extensions/drawnChips/chipPanel.svelte';

const n = schema.nodes;
const para = () => n.paragraph.create(null, schema.text('Body.'));

let view: EditorView | null = null;
beforeEach(() => {
	// the panel closes a chip that lies outside its pane, and jsdom lays everything out at zero
	Element.prototype.getBoundingClientRect = () => new DOMRect(10, 10, 40, 20);
	globalThis.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
});
afterEach(() => {
	view?.destroy();
	view = null;
	document.body.innerHTML = '';
});

function open(doc: ReturnType<typeof n.doc.create>) {
	view = new EditorView(document.body.appendChild(document.createElement('div')), {
		state: EditorState.create({ doc }),
		nodeViews: { environment: environmentView, column: columnView }
	});
	flushSync();
	return view;
}

describe('an environment head in the editor', () => {
	const doc = () => n.doc.create(null, [n.environment.create({ name: 'lemma', args: '[Zorn]' }, para())]);

	it('opens as LaTeX in the chip panel and sets the name and arguments once they read as a head', () => {
		const v = open(doc());
		document.querySelector<HTMLButtonElement>('.tex-environment .env-header button')!.click();
		flushSync();
		expect(chipPanel.request!.source).toBe('\\begin{lemma}[Zorn]');
		chipPanel.request!.write('\\begin{claim}[Kuratowski]{x}');
		flushSync();
		expect(v.state.doc.firstChild!.attrs).toMatchObject({ name: 'claim', args: '[Kuratowski]{x}' });
	});

	it('writes nothing while the head is half typed', () => {
		const v = open(doc());
		document.querySelector<HTMLButtonElement>('.tex-environment .env-header button')!.click();
		flushSync();
		chipPanel.request!.write('\\begin{claim}[Kurat');
		chipPanel.request!.write('\\begin{cla');
		flushSync();
		expect(v.state.doc.firstChild!.attrs).toMatchObject({ name: 'lemma', args: '[Zorn]' });
	});
});

describe('a beamer column width in the editor', () => {
	const doc = () => n.doc.create(null, [n.columns.create(null, [n.column.create({ form: 'env', width: '0.5\\textwidth' }, para())])]);

	it('shows as a chip that opens the width as LaTeX and sets it once it reads back', () => {
		const v = open(doc());
		const chip = document.querySelector<HTMLButtonElement>('.beamer-column-chip')!;
		expect(chip.textContent).toBe('0.5\\textwidth');
		expect(document.querySelector('.beamer-column-width input')).toBeNull();
		chip.click();
		flushSync();
		chipPanel.request!.write('0.3\\textwidth');
		chipPanel.request!.write('{0.3');
		flushSync();
		expect(v.state.doc.firstChild!.firstChild!.attrs.width).toBe('0.3\\textwidth');
		expect(chip.textContent).toBe('0.3\\textwidth');
	});
});
