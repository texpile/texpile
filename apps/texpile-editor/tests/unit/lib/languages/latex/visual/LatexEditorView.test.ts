// @vitest-environment jsdom
// a republished reference list redraws every drawn chip, and that redraw dispatches into the editor: the editor's own
// props changing must not republish it, or the visual editor feeds itself and the window freezes
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import { box } from '$lib/runes/box.svelte';
import { observe } from '$lib/runes/observe.svelte';
import { referenceStore } from '$lib/stores/editorStore';
import type { BiblatexReference } from '$lib/languages/bib/biblatex';
import LatexEditorView from '../../../../../../src/lib/languages/latex/visual/LatexEditorView.svelte';

vi.mock('$lib/languages/mathliveLoad', () => ({ mathliveLoaded: () => null, loadMathlive: () => new Promise(() => {}) }));

let app: Record<string, unknown> | null = null;
afterEach(() => {
	if (app) void unmount(app);
	app = null;
	document.body.innerHTML = '';
});

describe('LatexEditorView', () => {
	it('publishes the reference list once while its other props change', () => {
		const references: BiblatexReference[] = [];
		const ranges = box(0);
		// an editor group's props: a read of one tracks all of them
		const props = {
			get localReferences() {
				void ranges.current;
				return references;
			},
			get commentRanges() {
				void ranges.current;
				return [];
			}
		};
		app = mount(LatexEditorView, { target: document.body, props });
		flushSync();
		let published = 0;
		const stop = observe(
			() => referenceStore.current,
			() => published++
		);
		flushSync();
		const before = published;
		ranges.current = 1;
		flushSync();
		ranges.current = 2;
		flushSync();
		expect(published).toBe(before);
		stop();
	});
});
