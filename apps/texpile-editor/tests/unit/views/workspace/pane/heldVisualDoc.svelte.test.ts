// @vitest-environment jsdom
// Opening a Markdown file from a LaTeX one drew the LaTeX document in the Markdown editor until the new one was parsed.
import { describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { schema } from '../../../../../src/lib/languages/latex/schema/latexPMSchema';
import { heldVisualDoc } from '../../../../../src/views/workspace/pane/heldVisualDoc.svelte';
import type { FileKind } from '../../../../../src/lib/workspace/documentBuffer.svelte';
import type { Node as PMNode } from 'prosemirror-model';

const docOf = (text: string) => schema.node('doc', null, [schema.node('paragraph', null, [schema.text(text)])]);

function paneShowing(path: string, kind: FileKind, doc: PMNode) {
	const pane = $state({
		loadedPath: path as string | null,
		kind,
		visualDoc: doc as PMNode | null,
		docMeta: null,
		texSource: '',
		sourceMap: { leaves: [], blocks: [] },
		pending: true
	});
	let held!: ReturnType<typeof heldVisualDoc>;
	const stop = $effect.root(() => {
		held = heldVisualDoc(() => pane);
	});
	flushSync();
	return { pane, held, stop };
}

describe('the held visual document', () => {
	it('stays up while the next file of its kind is parsed', () => {
		const a = docOf('one');
		const { pane, held, stop } = paneShowing('/f/a.tex', 'tex', a);
		pane.loadedPath = '/f/b.tex';
		pane.visualDoc = null;
		flushSync();
		expect(held.current?.visualDoc).toBe(a);
		expect(held.own).toBe(false);
		stop();
	});

	it('goes while a file of another kind is parsed', () => {
		const { pane, held, stop } = paneShowing('/f/a.tex', 'tex', docOf('one'));
		pane.loadedPath = '/f/b.md';
		pane.kind = 'md';
		pane.visualDoc = null;
		flushSync();
		expect(held.current).toBeNull();
		stop();
	});
});
