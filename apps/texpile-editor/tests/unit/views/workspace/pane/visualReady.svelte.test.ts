// @vitest-environment jsdom
// Renaming the open file kept its editor and document, and the loading bar, waiting on a build for the new name, stayed up for good.
import { describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { schema } from '../../../../../src/lib/languages/latex/schema/latexPMSchema';
import { visualReady } from '../../../../../src/views/workspace/pane/visualReady.svelte';
import type { Node as PMNode } from 'prosemirror-model';

const docOf = (text: string) => schema.node('doc', null, [schema.node('paragraph', null, [schema.text(text)])]);

function paneWith(path: string, doc: PMNode) {
	const pane = $state({ path, doc, parked: false });
	const editor = $state<{ doc: PMNode | null }>({ doc: null });
	let ready!: ReturnType<typeof visualReady>;
	const stop = $effect.root(() => {
		ready = visualReady(
			() => pane,
			() => editor.doc
		);
	});
	flushSync();
	return { pane, editor, ready, stop };
}

describe('visualReady', () => {
	it('stays ready when the open file is renamed', () => {
		const a = docOf('plain words');
		const { pane, editor, ready, stop } = paneWith('/f/p1.tex', a);
		expect(ready.ready).toBe(false);
		editor.doc = a;
		ready.built('/f/p1.tex');
		pane.path = '/f/p1r.tex';
		flushSync();
		expect(ready.ready).toBe(true);
		stop();
	});

	it('waits for the build of another file', () => {
		const a = docOf('one');
		const { pane, editor, ready, stop } = paneWith('/f/a.tex', a);
		editor.doc = a;
		ready.built('/f/a.tex');
		pane.path = '/f/b.tex';
		pane.doc = docOf('two');
		flushSync();
		expect(ready.ready).toBe(false);
		stop();
	});
});
