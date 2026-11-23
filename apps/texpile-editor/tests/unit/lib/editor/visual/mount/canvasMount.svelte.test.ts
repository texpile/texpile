// @vitest-environment jsdom
// A key in the paper recomputed the face settings and fired the faces epoch, so every block whose face read them was
// built and laid out again on each key (batch 1 perf gate, key to frame 29 ms against M2's 17)
import { describe, expect, it } from 'vitest';
import { flushSync } from 'svelte';
import { windowInvalidation, type FaceInputKey } from '../../../../../../src/lib/editor/canvas';
import { canvasMount } from '../../../../../../src/lib/editor/visual/mount/canvasMount.svelte';
import type { EditorView } from 'prosemirror-view';

function mounted() {
	const props = $state({ text: 'a', dir: 'figures' });
	const view = { dom: document.createElement('div'), canvas: { setZoom() {} } } as unknown as EditorView;
	const fired: FaceInputKey[] = [];
	const stopListening = windowInvalidation(window).listen((key) => fired.push(key));
	const stop = $effect.root(() => {
		canvasMount({
			view: () => view,
			path: () => 'main.tex',
			// a read of one spread prop tracks them all
			imageDirectory: () => (props.text, props.dir),
			cropFormat: 'latex',
			isMainFile: () => true
		});
	});
	flushSync();
	return {
		props,
		fired,
		stop() {
			stop();
			stopListening();
		}
	};
}

describe('canvasMount', () => {
	it('fires the faces epoch for a new setting and not for a key', () => {
		const { props, fired, stop } = mounted();
		props.text = 'ab';
		flushSync();
		expect(fired).toEqual([]);
		props.dir = 'images';
		flushSync();
		expect(fired).toEqual([{ kind: 'epoch', name: 'faces' }]);
		stop();
	});
});
