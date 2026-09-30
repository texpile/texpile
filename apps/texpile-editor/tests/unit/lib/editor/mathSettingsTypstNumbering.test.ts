// @vitest-environment jsdom
// the Typst equation settings' Number all equations switch: it writes the document's one numbering rule, not the equation
import { describe, it, expect, afterEach } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import MathSettingsPanel from '$lib/editor/visual/extensions/mathlivebridge/MathSettingsPanel.svelte';
import { typstToProseMirror } from '$lib/languages/typst/visual/convert/converter';
import { serializeToTypst } from '$lib/languages/typst/visual/serialize/serializer';

let mounted: Record<string, unknown> | null = null;
let view: EditorView | null = null;

afterEach(() => {
	if (mounted) unmount(mounted);
	view?.destroy();
	mounted = null;
	view = null;
	document.body.replaceChildren();
});

function openSettings(src: string): HTMLElement {
	const doc = typstToProseMirror(src).doc;
	view = new EditorView(document.body.appendChild(document.createElement('div')), { state: EditorState.create({ doc }) });
	let pos = -1;
	doc.forEach((node, offset) => {
		if (node.type.name === 'block_math') pos = offset;
	});
	const host = document.body.appendChild(document.createElement('div'));
	mounted = mount(MathSettingsPanel, { target: host, props: { node: doc.nodeAt(pos)!, view, getPos: () => pos } });
	flushSync();
	return host;
}

function numberingSwitch(host: HTMLElement): HTMLInputElement {
	return host.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
}

describe('Number all equations', () => {
	it('adds the rule for the whole document', () => {
		const host = openSettings('#set page(paper: "a4")\n\n$ x = 1 $ <eq:one>\n');
		const toggle = numberingSwitch(host);
		expect(toggle.checked).toBe(false);
		expect(host.textContent).toContain('Number all equations');
		toggle.click();
		flushSync();
		expect(serializeToTypst(view!.state.doc)).toBe('#set page(paper: "a4")\n#set math.equation(numbering: "(1)")\n\n$ x = 1 $ <eq:one>');
	});

	it('reads the rule the document has, and takes it out', () => {
		const host = openSettings('#set math.equation(numbering: "1.")\n\n$ x = 1 $\n');
		const toggle = numberingSwitch(host);
		expect(toggle.checked).toBe(true);
		toggle.click();
		flushSync();
		expect(serializeToTypst(view!.state.doc)).toBe('$ x = 1 $');
	});
});
