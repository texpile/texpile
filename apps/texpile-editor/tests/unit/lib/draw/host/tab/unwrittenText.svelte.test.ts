// @vitest-environment jsdom
// A canvas drag wrote its text only on release, so live mode showed none of its steps.
import { expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { followUnwritten, onUnwrittenText } from '../../../../../../src/lib/draw/host/tab/unwrittenText.svelte';
import type { FigureEditorState } from '../../../../../../src/lib/draw/editor';

function follow() {
	const ed = $state({
		preview: null as string | null,
		moved: null as string | null,
		text: 'old',
		get unwritten() {
			return this.preview ?? this.moved;
		}
	});
	const sent: string[] = [];
	const off = onUnwrittenText((path, text) => sent.push(`${path}: ${text}`));
	const stop = $effect.root(() =>
		followUnwritten(
			() => '/f/main.tex',
			() => ed as unknown as FigureEditorState
		)
	);
	flushSync();
	return { ed, sent, done: () => (off(), stop()) };
}

it('sends each step of a drag, then the text as written once it ends', () => {
	const { ed, sent, done } = follow();
	ed.preview = 'step 1';
	flushSync();
	ed.preview = 'step 2';
	flushSync();
	ed.preview = null;
	ed.text = 'step 2';
	flushSync();
	expect(sent).toEqual(['/f/main.tex: step 1', '/f/main.tex: step 2', '/f/main.tex: step 2']);
	done();
});

it('sends the old text back when a selection drag is cancelled', () => {
	const { ed, sent, done } = follow();
	ed.moved = 'moved';
	flushSync();
	ed.moved = null;
	flushSync();
	expect(sent).toEqual(['/f/main.tex: moved', '/f/main.tex: old']);
	done();
});
