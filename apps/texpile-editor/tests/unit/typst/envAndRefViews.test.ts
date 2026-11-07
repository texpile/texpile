// @vitest-environment jsdom
// The node views in a real editor view: an environment's header edits its call and nothing else,
// its body stays ProseMirror's; a reference reads as the citation it will print.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { flushSync } from 'svelte';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { parseTypstFile, serializeTypstFile } from '$lib/languages/typst/visual/roundtrip';
import { typstEnvView } from '$lib/languages/typst/visual/extensions/env/typstEnvView.svelte';
import { TypstRefView } from '$lib/languages/typst/visual/plugins/ref/node/typstRefView.svelte';
import { referenceStore } from '$lib/stores/editorStore';
import { chipPanel } from '$lib/editor/visual/extensions/drawnChips/chipPanel.svelte';

const SRC = '#lemma(title: "Zorn")[\n  Every chain has a bound, see @knuth84[p. 7].\n] <lem:zorn>\n\nBy @lem:zorn.\n';

let view: EditorView | null = null;
beforeEach(() => {
	// the panel closes a chip that lies outside its pane, and jsdom lays everything out at zero
	Element.prototype.getBoundingClientRect = () => new DOMRect(10, 10, 40, 20);
	const observer = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
	globalThis.ResizeObserver ??= observer as unknown as typeof ResizeObserver;
	globalThis.IntersectionObserver ??= observer as unknown as typeof IntersectionObserver;
});
afterEach(() => {
	view?.destroy();
	view = null;
	referenceStore.current = null;
	document.body.innerHTML = '';
});

function open(src: string) {
	const parsed = parseTypstFile(src);
	view = new EditorView(document.body.appendChild(document.createElement('div')), {
		state: EditorState.create({ doc: parsed.doc }),
		nodeViews: {
			typ_env: (node, v, getPos) => typstEnvView(node, v, getPos),
			typ_ref: (node, v, getPos) => new TypstRefView(node, v, getPos, (source) => parseTypstFile(source).doc)
		}
	});
	flushSync();
	return { parsed, view };
}

// the call's name opens its head in the chip panel
function openHead() {
	(document.querySelector('.typ-environment .env-label') as HTMLElement).click();
	flushSync();
}

describe('an environment in the editor', () => {
	it('names its call and label above a body ProseMirror edits, and opens the head on its name', () => {
		open(SRC);
		const env = document.querySelector('.typ-environment')!;
		expect(env.getAttribute('data-typ-env')).toBe('lemma');
		expect(env.querySelector('.env-label')!.textContent).toBe('lemma');
		expect(env.querySelector('.typ-env-label')!.textContent).toBe('<lem:zorn>');
		expect(env.querySelector('.typ-environment-body')!.textContent).toContain('Every chain has a bound');
		openHead();
		expect(chipPanel.request!.source).toBe('#lemma(title: "Zorn") <lem:zorn>');
	});

	it('writes a head edit into the call alone, and a label rename into its references', () => {
		const { parsed, view } = open(SRC);
		openHead();
		chipPanel.request!.write('#lemma(title: "Kuratowski") <lem:max>');
		flushSync();
		expect(serializeTypstFile(parsed, view.state.doc)).toBe(
			SRC.replace('"Zorn"', '"Kuratowski"').replace('<lem:zorn>', '<lem:max>').replace('@lem:zorn', '@lem:max')
		);
	});

	it('writes nothing while the head being typed is not a call yet', () => {
		const { parsed, view } = open(SRC);
		openHead();
		chipPanel.request!.write('#lemma(title: "Zor');
		flushSync();
		expect(serializeTypstFile(parsed, view.state.doc)).toBe(SRC);
	});
});

describe('a reference in the editor', () => {
	it('reads as its citation once the bibliography is in, and as written before', () => {
		open(SRC);
		const chips = () => [...document.querySelectorAll('.typ-ref')].map((c) => c.textContent);
		expect(chips()).toEqual(['@knuth84[p. 7]', '@lem:zorn']);
		referenceStore.current = [{ key: 'knuth84', entrytype: 'book', author: 'Knuth, Donald E.', year: '1984' }];
		flushSync();
		expect(chips()).toEqual(['(Knuth 1984, p. 7)', '@lem:zorn']);
		expect(document.querySelector('.typ-ref-known')).not.toBeNull();
	});

	it('opens the citation editor on a click, and writes what it sets', async () => {
		const { parsed, view } = open(SRC);
		(document.querySelector('.typ-ref') as HTMLElement).click();
		flushSync();
		await new Promise((resolve) => setTimeout(resolve, 0));
		flushSync();
		const field = document.querySelector<HTMLInputElement>('.citation-edit-form input[type="text"]')!;
		expect(field.value).toBe('p. 7');
		field.value = 'pp. 7--9';
		field.dispatchEvent(new Event('input', { bubbles: true }));
		flushSync();
		expect(serializeTypstFile(parsed, view.state.doc)).toBe(SRC.replace('@knuth84[p. 7]', '@knuth84[pp. 7--9]'));
	});
});
